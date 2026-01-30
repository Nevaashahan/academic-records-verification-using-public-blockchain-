import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5175'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, token, address, logout } = useAuth()
  const [walletAddress, setWalletAddress] = useState(address || '')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  const connectWallet = async () => {
    setError('')
    if (!window.ethereum) {
      setError('MetaMask is required to connect.')
      return
    }
    try {
      setStatus('connecting')
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      })
      setWalletAddress(accounts?.[0] || '')
      setStatus('idle')
    } catch (err) {
      setStatus('error')
      setError('Wallet connection was rejected.')
    }
  }

  const signIn = async () => {
    setError('')
    if (!walletAddress) {
      setError('Connect your wallet first.')
      return
    }
    try {
      setStatus('signing')
      const nonceRes = await fetch(
        `${API_URL}/api/auth/nonce?address=${walletAddress}`
      )
      const nonceData = await nonceRes.json()
      if (!nonceRes.ok) {
        throw new Error(nonceData?.error || 'Failed to request nonce.')
      }

      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [nonceData.message, walletAddress],
      })

      const verifyRes = await fetch(`${API_URL}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress, signature }),
      })
      const verifyData = await verifyRes.json()
      if (!verifyRes.ok) {
        throw new Error(verifyData?.error || 'Login failed.')
      }

      login(verifyData.token, walletAddress)
      setStatus('success')
      const target = location.state?.from?.pathname || '/'
      navigate(target, { replace: true })
    } catch (err) {
      setStatus('error')
      setError(err.message || 'Login failed.')
    }
  }

  return (
    <div className="page login-page">
      <header className="hero">
        <div>
          <p className="eyebrow">Admin Access</p>
          <h1>Secure university uploads.</h1>
          <p className="lead">
            Connect your approved wallet and sign a message to access the upload
            console. No passwords, no shared credentials.
          </p>
        </div>
        <div className="hero-card">
          <h2>Security first</h2>
          <ul>
            <li>Wallet signature proves identity</li>
            <li>Only the admin address is allowed</li>
            <li>No gas fees for login</li>
          </ul>
        </div>
      </header>

      <main className="content login-content">
        <section className="login-card">
          <h2>Admin login</h2>
          <p>Use MetaMask to connect and sign in.</p>

          <div className="login-actions">
            {token ? (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => navigate('/')}
                >
                  Go to Upload
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    logout()
                    setWalletAddress('')
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={connectWallet}
                >
                  {walletAddress ? 'Wallet Connected' : 'Connect Wallet'}
                </button>
                <button
                  type="button"
                  onClick={signIn}
                  disabled={!walletAddress || status === 'signing'}
                >
                  {status === 'signing' ? 'Signing...' : 'Sign In'}
                </button>
              </>
            )}
          </div>

          {walletAddress && (
            <p className="wallet">Connected: {walletAddress}</p>
          )}
          {error && <p className="error">{error}</p>}

          <div className="login-note">
            <h3>Need access?</h3>
            <p className="muted">
              Ask the system administrator to add your wallet address.
            </p>
          </div>
        </section>

        <aside className="login-card">
          <h2>What happens next</h2>
          <div className="login-steps">
            <div>
              <span>1</span>
              <div>
                <h3>Sign in</h3>
                <p>MetaMask signs a one-time message.</p>
              </div>
            </div>
            <div>
              <span>2</span>
              <div>
                <h3>Upload</h3>
                <p>Submit transcript + results sheets.</p>
              </div>
            </div>
            <div>
              <span>3</span>
              <div>
                <h3>Anchor</h3>
                <p>We store the CID on Sepolia.</p>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}
