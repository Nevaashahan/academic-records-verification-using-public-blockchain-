import { createContext, useContext, useMemo, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('authToken') || '')
  const [address, setAddress] = useState(
    () => localStorage.getItem('authAddress') || ''
  )

  const login = (nextToken, nextAddress) => {
    setToken(nextToken)
    setAddress(nextAddress)
    localStorage.setItem('authToken', nextToken)
    localStorage.setItem('authAddress', nextAddress)
  }

  const logout = () => {
    setToken('')
    setAddress('')
    localStorage.removeItem('authToken')
    localStorage.removeItem('authAddress')
  }

  const value = useMemo(
    () => ({
      token,
      address,
      login,
      logout,
    }),
    [token, address]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
