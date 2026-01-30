const express = require('express')
const cors = require('cors')
const multer = require('multer')
const axios = require('axios')
const FormData = require('form-data')
const dotenv = require('dotenv')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { ethers } = require('ethers')
const jwt = require('jsonwebtoken')

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
})

const {
  PINATA_API_KEY,
  PINATA_SECRET_API_KEY,
  PUBLIC_RPC_URL,
  PUBLIC_CHAIN_ID,
  PUBLIC_ANCHOR_PRIVATE_KEY,
  PUBLIC_ANCHOR_ADDRESS,
  PORT,
  ADMIN_WALLET_ADDRESS,
  AUTH_JWT_SECRET,
  AUTH_TOKEN_TTL,
  AUTH_NONCE_TTL_MS,
} = process.env

const REQUIRED_ENV = [
  'PINATA_API_KEY',
  'PINATA_SECRET_API_KEY',
  'PUBLIC_RPC_URL',
  'PUBLIC_ANCHOR_PRIVATE_KEY',
  'PUBLIC_ANCHOR_ADDRESS',
  'ADMIN_WALLET_ADDRESS',
  'AUTH_JWT_SECRET',
]

const STUDENT_RECORDS_ABI = [
  'function anchorRecord(string cid) returns (uint256)',
  'event RecordAnchored(uint256 indexed recordId, address indexed sender, string cid, uint256 timestamp)',
]

const CHAIN_QUERY_ABI = [
  'function recordCount() view returns (uint256)',
  'function records(uint256) view returns (string cid,uint256 timestamp,address sender)',
]

const DEFAULT_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://ipfs.io/ipfs/',
]
const IPFS_GATEWAYS = (process.env.IPFS_GATEWAYS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
const VERIFY_SCAN_LIMIT = Number(process.env.VERIFY_SCAN_LIMIT || 25)
const NONCE_TTL_MS = Number(AUTH_NONCE_TTL_MS || 5 * 60 * 1000)
const TOKEN_TTL = AUTH_TOKEN_TTL || '2h'

const authNonces = new Map()

function buildGatewayUrl(gateway, cid) {
  const base = gateway.endsWith('/') ? gateway : `${gateway}/`
  return `${base}${cid}`
}

async function fetchMetadataFromGateways(cid) {
  const gateways = IPFS_GATEWAYS.length ? IPFS_GATEWAYS : DEFAULT_GATEWAYS
  for (const gateway of gateways) {
    try {
      const response = await axios.get(buildGatewayUrl(gateway, cid), {
        timeout: 15000,
        validateStatus: (status) => status >= 200 && status < 300,
      })
      return response.data
    } catch (error) {
      // try next gateway
    }
  }

  throw new Error('Unable to fetch metadata from IPFS gateways.')
}

function getMissingEnv() {
  return REQUIRED_ENV.filter((key) => !process.env[key])
}

const DATA_DIR = path.resolve(__dirname, 'data')
const DATA_FILE = path.join(DATA_DIR, 'records.json')

function ensureDataStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ records: [] }, null, 2))
  }
}

function readRecords() {
  ensureDataStore()
  const raw = fs.readFileSync(DATA_FILE, 'utf8')
  try {
    const data = JSON.parse(raw)
    return Array.isArray(data.records) ? data.records : []
  } catch (error) {
    return []
  }
}

function writeRecords(records) {
  ensureDataStore()
  fs.writeFileSync(DATA_FILE, JSON.stringify({ records }, null, 2))
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeAddress(value) {
  return String(value || '').trim().toLowerCase()
}

function issueToken(address) {
  return jwt.sign({ address }, AUTH_JWT_SECRET, { expiresIn: TOKEN_TTL })
}

function verifyToken(token) {
  return jwt.verify(token, AUTH_JWT_SECRET)
}

function buildLoginMessage(nonce) {
  return `Login to Student Records\n\nNonce: ${nonce}`
}

async function findRecordOnChain(regKey, nicKey) {
  const provider = new ethers.JsonRpcProvider(PUBLIC_RPC_URL)
  const code = await provider.getCode(PUBLIC_ANCHOR_ADDRESS)
  if (!code || code === '0x') {
    return null
  }

  const contract = new ethers.Contract(
    PUBLIC_ANCHOR_ADDRESS,
    CHAIN_QUERY_ABI,
    provider
  )
  const total = Number(await contract.recordCount())
  if (!total) {
    return null
  }

  const network = await provider.getNetwork()
  const start = Math.max(1, total - VERIFY_SCAN_LIMIT + 1)

  for (let id = total; id >= start; id -= 1) {
    const record = await contract.records(id)
    const metadataCid = record[0]
    try {
      const metadata = await fetchMetadataFromGateways(metadataCid)
      if (
        normalizeKey(metadata?.registrationNumber) === regKey &&
        normalizeKey(metadata?.nicNumber) === nicKey
      ) {
        return {
          registrationNumber: metadata.registrationNumber,
          nicNumber: metadata.nicNumber,
          country: metadata.country,
          registrationKey: regKey,
          nicKey,
          ipfs: {
            transcriptCid: metadata?.documents?.transcript?.cid || null,
            resultsCid: metadata?.documents?.results?.cid || null,
            metadataCid,
          },
          chain: {
            recordId: id,
            chainId: Number(network.chainId),
          },
          createdAt: new Date(Number(record[1]) * 1000).toISOString(),
        }
      }
    } catch (error) {
      // Skip missing or invalid metadata entries
    }
  }

  return null
}

async function pinFileToIPFS(file, name) {
  const formData = new FormData()
  formData.append('file', file.buffer, {
    filename: name,
    contentType: file.mimetype,
  })
  formData.append('pinataMetadata', JSON.stringify({ name }))

  const response = await axios.post(
    'https://api.pinata.cloud/pinning/pinFileToIPFS',
    formData,
    {
      maxBodyLength: Infinity,
      headers: {
        ...formData.getHeaders(),
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_API_KEY,
      },
    }
  )

  return response.data
}

async function pinJSONToIPFS(content, name) {
  const response = await axios.post(
    'https://api.pinata.cloud/pinning/pinJSONToIPFS',
    {
      pinataMetadata: { name },
      pinataContent: content,
    },
    {
      headers: {
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_API_KEY,
      },
    }
  )

  return response.data
}

async function writeCidToChain(cid) {
  const provider = new ethers.JsonRpcProvider(PUBLIC_RPC_URL)
  const wallet = new ethers.Wallet(PUBLIC_ANCHOR_PRIVATE_KEY, provider)

  const network = await provider.getNetwork()
  const chainId = Number(network.chainId)

  if (PUBLIC_CHAIN_ID && Number(PUBLIC_CHAIN_ID) !== chainId) {
    throw new Error(
      `RPC chain mismatch. Expected ${PUBLIC_CHAIN_ID}, got ${chainId}.`
    )
  }

  const code = await provider.getCode(PUBLIC_ANCHOR_ADDRESS)
  if (!code || code === '0x') {
    throw new Error(
      'No contract deployed at PUBLIC_ANCHOR_ADDRESS. Deploy StudentRecords and update backend/.env.'
    )
  }

  const contract = new ethers.Contract(
    PUBLIC_ANCHOR_ADDRESS,
    STUDENT_RECORDS_ABI,
    wallet
  )

  const tx = await contract.anchorRecord(cid)
  const receipt = await tx.wait()
  if (receipt.status !== 1) {
    throw new Error('Transaction reverted while anchoring CID.')
  }

  let recordId = null
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log)
      if (parsed?.name === 'RecordAnchored') {
        recordId = Number(parsed.args.recordId)
        break
      }
    } catch (error) {
      // Skip non-matching logs
    }
  }

  if (recordId === null) {
    throw new Error(
      'RecordAnchored event not found. Check contract address and ABI.'
    )
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    chainId,
    recordId,
  }
}

app.get('/api/health', (req, res) => {
  const missingEnv = getMissingEnv()
  const payload = {
    status: missingEnv.length ? 'missing_env' : 'ok',
    missingEnv,
    anchorAddress: PUBLIC_ANCHOR_ADDRESS || null,
    rpcUrl: PUBLIC_RPC_URL ? 'configured' : null,
    adminWallet: ADMIN_WALLET_ADDRESS || null,
  }

  if (!missingEnv.length) {
    const provider = new ethers.JsonRpcProvider(PUBLIC_RPC_URL)
    provider
      .getNetwork()
      .then(async (network) => {
        const code = await provider.getCode(PUBLIC_ANCHOR_ADDRESS)
        res.json({
          ...payload,
          chainId: Number(network.chainId),
          isContract: !!code && code !== '0x',
        })
      })
      .catch(() => res.json(payload))
    return
  }

  res.json(payload)
})

app.get('/api/auth/nonce', (req, res) => {
  const address = String(req.query.address || '').trim()
  if (!address) {
    return res.status(400).json({ error: 'Wallet address is required.' })
  }

  const nonce = crypto.randomBytes(16).toString('hex')
  authNonces.set(normalizeAddress(address), {
    nonce,
    expiresAt: Date.now() + NONCE_TTL_MS,
  })

  res.json({
    nonce,
    message: buildLoginMessage(nonce),
  })
})

app.post('/api/auth/verify', async (req, res) => {
  const { address, signature } = req.body || {}
  if (!address || !signature) {
    return res.status(400).json({ error: 'Address and signature are required.' })
  }

  const normalized = normalizeAddress(address)
  const entry = authNonces.get(normalized)
  if (!entry) {
    return res.status(400).json({ error: 'Nonce not found. Request a new one.' })
  }

  if (Date.now() > entry.expiresAt) {
    authNonces.delete(normalized)
    return res.status(400).json({ error: 'Nonce expired. Request a new one.' })
  }

  try {
    const message = buildLoginMessage(entry.nonce)
    const recovered = ethers.verifyMessage(message, signature)
    if (normalizeAddress(recovered) !== normalized) {
      return res.status(401).json({ error: 'Signature verification failed.' })
    }

    if (
      ADMIN_WALLET_ADDRESS &&
      normalizeAddress(ADMIN_WALLET_ADDRESS) !== normalized
    ) {
      return res.status(403).json({ error: 'Wallet not authorized.' })
    }

    authNonces.delete(normalized)
    const token = issueToken(normalized)
    res.json({ token, address: normalized })
  } catch (error) {
    res.status(401).json({ error: 'Signature verification failed.' })
  }
})

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized.' })
  }
  const token = authHeader.slice(7)
  try {
    const payload = verifyToken(token)
    req.user = payload
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token.' })
  }
}

app.get('/api/verify', async (req, res) => {
  const registrationNumber = String(req.query.registrationNumber || '').trim()
  const nicNumber = String(req.query.nicNumber || '').trim()

  if (!registrationNumber || !nicNumber) {
    return res.status(400).json({
      error: 'Registration number and NIC number are required.',
    })
  }

  const records = readRecords()
  const regKey = normalizeKey(registrationNumber)
  const nicKey = normalizeKey(nicNumber)
  const matches = records.filter(
    (record) =>
      normalizeKey(record.registrationKey || record.registrationNumber) ===
        regKey &&
      normalizeKey(record.nicKey || record.nicNumber) === nicKey
  )

  if (!matches.length) {
    try {
      const fallback = await findRecordOnChain(regKey, nicKey)
      if (!fallback) {
        return res.status(404).json({
          error: 'No record found for the provided details.',
        })
      }

      records.push(fallback)
      writeRecords(records)

      return res.json({
        registrationNumber: fallback.registrationNumber,
        nicNumber: fallback.nicNumber,
        country: fallback.country,
        ipfs: fallback.ipfs,
        chain: fallback.chain,
        createdAt: fallback.createdAt,
      })
    } catch (error) {
      return res.status(500).json({
        error: 'Unable to verify record at this time.',
      })
    }
  }

  const latest = matches.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  )[0]

  res.json({
    registrationNumber: latest.registrationNumber,
    nicNumber: latest.nicNumber,
    country: latest.country,
    ipfs: {
      transcriptCid: latest.ipfs.transcriptCid,
      resultsCid: latest.ipfs.resultsCid,
      metadataCid: latest.ipfs.metadataCid,
    },
    chain: latest.chain,
    createdAt: latest.createdAt,
  })
})

app.post(
  '/api/upload',
  requireAuth,
  upload.fields([
    { name: 'transcript', maxCount: 1 },
    { name: 'results', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const missingEnv = getMissingEnv()
      if (missingEnv.length) {
        return res.status(500).json({
          error: 'Missing required environment variables.',
          missingEnv,
        })
      }

      const { registrationNumber, nicNumber, country } = req.body
      if (!registrationNumber || !nicNumber || !country) {
        return res.status(400).json({
          error: 'Registration number, NIC number, and country are required.',
        })
      }

      const transcriptFile = req.files?.transcript?.[0]
      const resultsFile = req.files?.results?.[0]

      if (!transcriptFile || !resultsFile) {
        return res.status(400).json({
          error: 'Transcript and results sheet files are required.',
        })
      }

      const transcriptPin = await pinFileToIPFS(
        transcriptFile,
        `transcript-${registrationNumber}-${Date.now()}`
      )
      const resultsPin = await pinFileToIPFS(
        resultsFile,
        `results-${registrationNumber}-${Date.now()}`
      )

      const metadata = {
        registrationNumber,
        nicNumber,
        country,
        documents: {
          transcript: {
            cid: transcriptPin.IpfsHash,
            filename: transcriptFile.originalname,
            mimetype: transcriptFile.mimetype,
          },
          results: {
            cid: resultsPin.IpfsHash,
            filename: resultsFile.originalname,
            mimetype: resultsFile.mimetype,
          },
        },
        createdAt: new Date().toISOString(),
      }

      const metadataPin = await pinJSONToIPFS(
        metadata,
        `student-${registrationNumber}-${Date.now()}`
      )

      const chainResult = await writeCidToChain(metadataPin.IpfsHash)

      const records = readRecords()
      const createdAt = new Date().toISOString()
      const record = {
        registrationNumber,
        nicNumber,
        country,
        registrationKey: normalizeKey(registrationNumber),
        nicKey: normalizeKey(nicNumber),
        ipfs: {
          transcriptCid: transcriptPin.IpfsHash,
          resultsCid: resultsPin.IpfsHash,
          metadataCid: metadataPin.IpfsHash,
        },
        chain: chainResult,
        createdAt,
      }
      records.push(record)
      writeRecords(records)

      res.json({
        ipfs: {
          transcript: {
            cid: transcriptPin.IpfsHash,
            size: transcriptPin.PinSize,
          },
          results: {
            cid: resultsPin.IpfsHash,
            size: resultsPin.PinSize,
          },
          metadata: {
            cid: metadataPin.IpfsHash,
            size: metadataPin.PinSize,
          },
        },
        chain: chainResult,
      })
    } catch (error) {
      console.error('Upload failed:', error?.response?.data || error.message)
      res.status(500).json({
        error: 'Upload failed. Check server logs for details.',
      })
    }
  }
)

const port = Number(PORT) || 5175
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`)
})
