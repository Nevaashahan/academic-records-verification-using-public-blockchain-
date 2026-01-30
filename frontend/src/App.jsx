import { useMemo, useState } from 'react'
import './App.css'

function App() {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5175'
  const [form, setForm] = useState({
    registrationNumber: '',
    nicNumber: '',
    country: '',
  })
  const [transcriptFile, setTranscriptFile] = useState(null)
  const [resultsFile, setResultsFile] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [response, setResponse] = useState(null)

  const gatewayUrl = useMemo(() => {
    const base = import.meta.env.VITE_IPFS_GATEWAY || 'https://ipfs.io/ipfs/'
    const normalized = base.endsWith('/') ? base : `${base}/`
    return (cid) => `${normalized}${cid}`
  }, [])

  const handleInputChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setResponse(null)

    if (!transcriptFile || !resultsFile) {
      setError('Please attach both the transcript and results sheet.')
      return
    }

    try {
      setStatus('uploading')
      const payload = new FormData()
      payload.append('registrationNumber', form.registrationNumber)
      payload.append('nicNumber', form.nicNumber)
      payload.append('country', form.country)
      payload.append('transcript', transcriptFile)
      payload.append('results', resultsFile)

      const res = await fetch(`${apiUrl}/api/upload`, {
        method: 'POST',
        body: payload,
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Upload failed.')
      }

      setResponse(data)
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setError(err.message || 'Upload failed. Please try again.')
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Student Records to IPFS + Blockchain</p>
          <h1>Register student documents with immutable proof.</h1>
          <p className="lead">
            Upload transcripts and results sheets to IPFS, then anchor the CID on
            Sepolia for a public audit trail.
          </p>
        </div>
        <div className="hero-card">
          <h2>Quick checklist</h2>
          <ul>
            <li>Enter student registration + NIC numbers</li>
            <li>Attach transcript and results sheet PDFs</li>
            <li>Submit to IPFS and anchor CID on-chain</li>
          </ul>
        </div>
      </header>

      <main className="content">
        <section className="form-card">
          <h2>Student submission</h2>
          <p>All data is stored on IPFS. A CID is written to the blockchain.</p>

          <form onSubmit={handleSubmit}>
            <div className="grid">
              <label>
                Registration Number
                <input
                  type="text"
                  name="registrationNumber"
                  placeholder="e.g. UOR-BC-2026-001"
                  value={form.registrationNumber}
                  onChange={handleInputChange}
                  required
                />
              </label>

              <label>
                NIC Number
                <input
                  type="text"
                  name="nicNumber"
                  placeholder="e.g. 200012345678"
                  value={form.nicNumber}
                  onChange={handleInputChange}
                  required
                />
              </label>
            </div>

            <label>
              Country
              <input
                type="text"
                name="country"
                placeholder="e.g. Sri Lanka"
                value={form.country}
                onChange={handleInputChange}
                required
              />
            </label>

            <div className="grid">
              <label className="file-input">
                Transcript (PDF)
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(event) => setTranscriptFile(event.target.files?.[0] || null)}
                />
                <span>{transcriptFile ? transcriptFile.name : 'Choose file'}</span>
              </label>

              <label className="file-input">
                Results Sheet (PDF)
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(event) => setResultsFile(event.target.files?.[0] || null)}
                />
                <span>{resultsFile ? resultsFile.name : 'Choose file'}</span>
              </label>
            </div>

            <button type="submit" disabled={status === 'uploading'}>
              {status === 'uploading' ? 'Uploading...' : 'Upload & Anchor'}
            </button>

            {error && <p className="error">{error}</p>}
            {status === 'success' && (
              <p className="success">Upload complete. CID anchored on-chain.</p>
            )}
          </form>
        </section>

        <aside className="result-card">
          <div className="result-header">
            <h2>Anchoring output</h2>
            <span className={`status ${status}`}>{status}</span>
          </div>

          {!response && (
            <p className="muted">
              Submit a student record to see IPFS CIDs and blockchain proof here.
            </p>
          )}

          {response && (
            <div className="result-grid">
              <div>
                <h3>IPFS</h3>
                <div className="result-item">
                  <span>Transcript CID</span>
                  <a href={gatewayUrl(response.ipfs.transcript.cid)} target="_blank" rel="noreferrer">
                    {response.ipfs.transcript.cid}
                  </a>
                </div>
                <div className="result-item">
                  <span>Results CID</span>
                  <a href={gatewayUrl(response.ipfs.results.cid)} target="_blank" rel="noreferrer">
                    {response.ipfs.results.cid}
                  </a>
                </div>
                <div className="result-item">
                  <span>Metadata CID</span>
                  <a href={gatewayUrl(response.ipfs.metadata.cid)} target="_blank" rel="noreferrer">
                    {response.ipfs.metadata.cid}
                  </a>
                </div>
              </div>

              <div>
                <h3>Blockchain</h3>
                <div className="result-item">
                  <span>Transaction Hash</span>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${response.chain.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {response.chain.txHash}
                  </a>
                </div>
                <div className="result-item">
                  <span>Chain ID</span>
                  <strong>{response.chain.chainId}</strong>
                </div>
                <div className="result-item">
                  <span>Block Number</span>
                  <strong>{response.chain.blockNumber}</strong>
                </div>
                {response.chain.recordId !== null && (
                  <div className="result-item">
                    <span>Record ID</span>
                    <strong>{response.chain.recordId}</strong>
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}

export default App
