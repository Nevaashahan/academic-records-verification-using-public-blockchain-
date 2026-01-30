import { useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import './App.css'

function App() {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5175'
  const baseUrl = import.meta.env.VITE_VERIFY_BASE_URL || window.location.origin
  const [form, setForm] = useState({ registrationNumber: '', nicNumber: '' })
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [record, setRecord] = useState(null)
  const [viewer, setViewer] = useState({
    cid: null,
    status: 'idle',
    error: '',
    data: null,
  })
  const [copyStatus, setCopyStatus] = useState('idle')

  const gatewayUrl = useMemo(() => {
    const base = import.meta.env.VITE_IPFS_GATEWAY || 'https://ipfs.io/ipfs/'
    const normalized = base.endsWith('/') ? base : `${base}/`
    return (cid) => `${normalized}${cid}`
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const cid = params.get('cid')
    if (!cid) {
      return
    }

    let isMounted = true
    setViewer({ cid, status: 'loading', error: '', data: null })

    fetch(gatewayUrl(cid))
      .then((res) => {
        if (!res.ok) {
          throw new Error('Unable to fetch metadata from IPFS.')
        }
        return res.json()
      })
      .then((data) => {
        if (!isMounted) return
        setViewer({ cid, status: 'success', error: '', data })
      })
      .catch((err) => {
        if (!isMounted) return
        setViewer({
          cid,
          status: 'error',
          error: err.message || 'Unable to load metadata.',
          data: null,
        })
      })

    return () => {
      isMounted = false
    }
  }, [gatewayUrl])

  const handleInputChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleVerify = async (event) => {
    event.preventDefault()
    setError('')
    setRecord(null)

    try {
      setStatus('loading')
      const params = new URLSearchParams({
        registrationNumber: form.registrationNumber,
        nicNumber: form.nicNumber,
      })
      const res = await fetch(`${apiUrl}/api/verify?${params.toString()}`)
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        await res.text()
        throw new Error(
          `Verification API returned an unexpected response. Check that the backend is running and VITE_API_URL points to the backend (${apiUrl}).`
        )
      }

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Verification failed.')
      }
      setRecord(data)
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setError(err.message || 'Verification failed. Please try again.')
    }
  }

  const qrValue = record?.ipfs?.metadataCid
    ? `${baseUrl}/?cid=${record.ipfs.metadataCid}`
    : ''

  const handleCopy = async () => {
    if (!qrValue) return
    try {
      setCopyStatus('copying')
      await navigator.clipboard.writeText(qrValue)
      setCopyStatus('success')
      setTimeout(() => setCopyStatus('idle'), 2000)
    } catch (err) {
      setCopyStatus('error')
      setTimeout(() => setCopyStatus('idle'), 2000)
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">QR Verification</p>
          <h1>Verify student documents instantly.</h1>
          <p className="lead">
            Enter the student registration and NIC number to retrieve the
            on-chain record, then generate a QR code for quick access to all
            IPFS documents.
          </p>
        </div>
        <div className="hero-card">
          <h2>How it works</h2>
          <ul>
            <li>Search by registration + NIC number</li>
            <li>Get the latest anchored metadata CID</li>
            <li>Generate a QR for the document bundle</li>
          </ul>
        </div>
      </header>

      <main className="content">
        <section className="form-card">
          <h2>Verify a student record</h2>
          <p>Only verified records anchored on-chain will appear.</p>

          <form onSubmit={handleVerify}>
            <div className="grid">
              <label>
                Registration Number
                <input
                  type="text"
                  name="registrationNumber"
                  placeholder="e.g. EG/2021/8888"
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
                  placeholder="e.g. 200019403636"
                  value={form.nicNumber}
                  onChange={handleInputChange}
                  required
                />
              </label>
            </div>

            <button type="submit" disabled={status === 'loading'}>
              {status === 'loading' ? 'Searching...' : 'Verify & Generate QR'}
            </button>

            {error && <p className="error">{error}</p>}
            {status === 'success' && record && (
              <p className="success">Record found. QR code generated.</p>
            )}
          </form>
        </section>

        <aside className="result-card">
          <div className="result-header">
            <h2>Verification output</h2>
            <span className={`status ${status}`}>{status}</span>
          </div>

          {!record && !viewer.cid && (
            <p className="muted">
              Enter student details to generate the QR bundle for documents.
            </p>
          )}

          {record && (
            <div className="result-grid">
              <div>
                <h3>IPFS</h3>
                <div className="result-item">
                  <span>Transcript CID</span>
                  <a href={gatewayUrl(record.ipfs.transcriptCid)} target="_blank" rel="noreferrer">
                    {record.ipfs.transcriptCid}
                  </a>
                </div>
                <div className="result-item">
                  <span>Results CID</span>
                  <a href={gatewayUrl(record.ipfs.resultsCid)} target="_blank" rel="noreferrer">
                    {record.ipfs.resultsCid}
                  </a>
                </div>
                <div className="result-item">
                  <span>Metadata CID</span>
                  <a href={gatewayUrl(record.ipfs.metadataCid)} target="_blank" rel="noreferrer">
                    {record.ipfs.metadataCid}
                  </a>
                </div>
              </div>

              <div>
                <h3>QR Code</h3>
                {qrValue && (
                  <div className="qr-wrap">
                    <QRCodeCanvas value={qrValue} size={180} includeMargin />
                    <p className="qr-caption">
                      Scan to open the document bundle page.
                    </p>
                    <a className="qr-link" href={qrValue} target="_blank" rel="noreferrer">
                      {qrValue}
                    </a>
                    <button
                      type="button"
                      className="copy-button"
                      onClick={handleCopy}
                    >
                      {copyStatus === 'success'
                        ? 'Copied!'
                        : copyStatus === 'error'
                          ? 'Copy failed'
                          : 'Copy QR Link'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {viewer.cid && (
            <div className="viewer-card">
              <h3>Document bundle</h3>
              {viewer.status === 'loading' && (
                <p className="muted">Loading metadata from IPFS...</p>
              )}
              {viewer.error && <p className="error">{viewer.error}</p>}
              {viewer.data && (
                <div className="result-grid">
                  <div className="result-item">
                    <span>Transcript</span>
                    <a
                      href={gatewayUrl(viewer.data?.documents?.transcript?.cid)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {viewer.data?.documents?.transcript?.cid}
                    </a>
                  </div>
                  <div className="result-item">
                    <span>Results</span>
                    <a
                      href={gatewayUrl(viewer.data?.documents?.results?.cid)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {viewer.data?.documents?.results?.cid}
                    </a>
                  </div>
                  <div className="result-item">
                    <span>Metadata</span>
                    <a href={gatewayUrl(viewer.cid)} target="_blank" rel="noreferrer">
                      {viewer.cid}
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}

export default App
