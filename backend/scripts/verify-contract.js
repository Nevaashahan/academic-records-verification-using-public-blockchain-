const dotenv = require('dotenv')
const { ethers } = require('ethers')

dotenv.config()

const REQUIRED_ENV = ['PUBLIC_RPC_URL', 'PUBLIC_ANCHOR_ADDRESS']

function requireEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key])
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(', ')}`)
  }
}

async function main() {
  requireEnv()
  const provider = new ethers.JsonRpcProvider(process.env.PUBLIC_RPC_URL)
  const code = await provider.getCode(process.env.PUBLIC_ANCHOR_ADDRESS)
  const isContract = code && code !== '0x'
  if (!isContract) {
    throw new Error('No contract code at PUBLIC_ANCHOR_ADDRESS.')
  }

  const abi = [
    'function recordCount() view returns (uint256)',
    'function records(uint256) view returns (string cid,uint256 timestamp,address sender)',
  ]
  const contract = new ethers.Contract(
    process.env.PUBLIC_ANCHOR_ADDRESS,
    abi,
    provider
  )
  const count = await contract.recordCount()
  console.log('recordCount', count.toString())
  if (count > 0n) {
    const record = await contract.records(count)
    console.log('latestRecord', record)
  }
  console.log('isContract', isContract)
}

main().catch((error) => {
  console.error('Verification failed:', error.message)
  process.exit(1)
})
