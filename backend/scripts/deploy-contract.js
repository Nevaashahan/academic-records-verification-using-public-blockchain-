const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const solc = require('solc')
const { ethers } = require('ethers')

dotenv.config()

const REQUIRED_ENV = ['PUBLIC_RPC_URL', 'PUBLIC_ANCHOR_PRIVATE_KEY']

function requireEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key])
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(', ')}`)
  }
}

function compileContract() {
  const contractPath = path.resolve(
    __dirname,
    '..',
    '..',
    'contracts',
    'StudentRecords.sol'
  )
  const source = fs.readFileSync(contractPath, 'utf8')

  const input = {
    language: 'Solidity',
    sources: {
      'StudentRecords.sol': { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object'],
        },
      },
    },
  }

  const output = JSON.parse(solc.compile(JSON.stringify(input)))
  const errors = output.errors || []
  const fatal = errors.filter((err) => err.severity === 'error')

  if (fatal.length) {
    const message = fatal.map((err) => err.formattedMessage).join('\n')
    throw new Error(message)
  }

  const contract = output.contracts['StudentRecords.sol'].StudentRecords
  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object,
  }
}

async function main() {
  requireEnv()
  const { abi, bytecode } = compileContract()

  const provider = new ethers.JsonRpcProvider(process.env.PUBLIC_RPC_URL)
  const wallet = new ethers.Wallet(process.env.PUBLIC_ANCHOR_PRIVATE_KEY, provider)

  const balance = await provider.getBalance(wallet.address)
  if (balance === 0n) {
    throw new Error(
      `Deploying wallet has 0 ETH. Fund ${wallet.address} on Sepolia.`
    )
  }

  const factory = new ethers.ContractFactory(abi, bytecode, wallet)
  const contract = await factory.deploy()
  console.log('Deploy tx:', contract.deploymentTransaction().hash)
  await contract.waitForDeployment()

  const address = await contract.getAddress()
  console.log('Deployed StudentRecords to:', address)
}

main().catch((error) => {
  console.error('Deployment failed:', error.message)
  process.exit(1)
})
