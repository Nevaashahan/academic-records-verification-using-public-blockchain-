# Student Records IPFS + Blockchain

This project uploads student transcript and results documents to IPFS (via Pinata) and anchors the resulting metadata CID on the Sepolia Ethereum testnet.

## Structure
- `backend/` Express API for IPFS uploads + blockchain anchoring
- `frontend/` React UI for student document submission
- `QR verify/` React UI for verification + QR code generation

## Quick start
1. Install dependencies
   - `npm install` in `backend/`
   - `npm install` in `frontend/`
2. Start the backend
   - `npm run dev` in `backend/`
3. Start the frontend
   - `npm run dev` in `frontend/`
4. Start the QR verification frontend
   - `npm run dev` in `QR verify/` (runs on `http://localhost:5174`)

The frontend is configured to call `http://localhost:5175` by default.

## Environment variables
Only the needed values from the provided `.env` are used. They are stored in `backend/.env` (do not expose these in the client).

## Smart contract
The Solidity contract lives at `contracts/StudentRecords.sol`. Deploy it to Sepolia, then set `PUBLIC_ANCHOR_ADDRESS` to the deployed contract address. The backend calls `anchorRecord(cid)` to store the CID and emit an event.

### Deploy contract (recommended)
From `backend/`:
- `npm run deploy` (prints deployed address)
- Update `PUBLIC_ANCHOR_ADDRESS` in `backend/.env`
- Restart backend

### Verify contract
From `backend/`:
- `npm run verify-contract`

### Health check
Open `http://localhost:5175/api/health` to confirm the backend sees the deployed contract and chain id.

### Verify endpoint
`GET /api/verify?registrationNumber=...&nicNumber=...` returns the latest matching record with IPFS CIDs and chain details.

### IPFS gateway
`backend/.env` supports `IPFS_GATEWAYS` (comma-separated) and `VERIFY_SCAN_LIMIT` to tune chain verification and IPFS reads.
The frontends can override the gateway via `VITE_IPFS_GATEWAY`.
