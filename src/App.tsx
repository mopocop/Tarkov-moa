import { useState, useEffect } from 'react'
import './App.css'
import { TokenManager } from './services/tokenManager'
import { TarkovTrackerClient } from './api/tarkovtracker'
import { TarkovDevClient } from './api/tarkov-dev'
import { ActiveTasksService } from './services/activeTasks'
import type { ActiveTask } from './api/types'

function App() {
  const [token, setToken] = useState<string>('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([])
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    const savedToken = TokenManager.getToken()
    if (savedToken) {
      setToken(savedToken)
      setIsAuthenticated(true)
      loadActiveTasks(savedToken)
    }
  }, [])

  const loadActiveTasks = async (token: string) => {
    setLoading(true)
    setError(null)
    try {
      const trackerClient = new TarkovTrackerClient(token)
      const devClient = new TarkovDevClient()
      const service = new ActiveTasksService(trackerClient, devClient)

      await service.initialize()
      const tasks = await service.deriveActiveTasks()
      setActiveTasks(tasks)

      const user = await trackerClient.getUser()
      setUsername(user.username)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (!TokenManager.validateToken(token)) {
        throw new Error('Invalid token format')
      }

      const isValid = await TokenManager.verifyToken(token)
      if (!isValid) {
        throw new Error('Token verification failed')
      }

      TokenManager.saveToken(token)
      setIsAuthenticated(true)
      await loadActiveTasks(token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    TokenManager.clearToken()
    setToken('')
    setIsAuthenticated(false)
    setActiveTasks([])
    setUsername(null)
  }

  return (
    <>
      <div className="app-container">
        <h1>Tarkov Companion</h1>

        {!isAuthenticated ? (
          <div className="auth-section">
            <h2>Enter TarkovTracker Token</h2>
            <form onSubmit={handleTokenSubmit}>
              <input
                type="password"
                placeholder="Paste your TarkovTracker API token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={loading}
              />
              <button type="submit" disabled={loading}>
                {loading ? 'Validating...' : 'Validate Token'}
              </button>
            </form>
            {error && <div className="error">{error}</div>}
          </div>
        ) : (
          <div className="main-section">
            <div className="header">
              <h2>Welcome, {username || 'User'}</h2>
              <button onClick={handleLogout} className="logout-btn">
                Logout
              </button>
            </div>

            {loading && <p className="loading">Loading active tasks...</p>}

            {activeTasks.length > 0 ? (
              <div className="tasks-list">
                <h3>Active Tasks ({activeTasks.length})</h3>
                <ul>
                  {activeTasks.map((task) => (
                    <li key={task.id}>
                      <strong>{task.name}</strong>
                      {task.map && <span className="map"> - {task.map}</span>}
                      <span className="source"> ({task.source})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              !loading && <p className="no-tasks">No active tasks found</p>
            )}

            {error && <div className="error">{error}</div>}
          </div>
        )}
      </div>
    </>
  )
}

export default App
