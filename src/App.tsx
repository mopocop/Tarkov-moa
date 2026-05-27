import { useState, useEffect, useCallback } from 'react';
import './App.css';
import { TokenManager } from './services/tokenManager';
import { TarkovTrackerClient, UnauthorizedError } from './api/tarkovtracker';
import { TarkovDevClient } from './api/tarkov-dev';
import { deriveQuestState, type DerivedQuestState } from './quests/derive';

function App() {
  const [token, setToken] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questState, setQuestState] = useState<DerivedQuestState | null>(null);
  const [playerLevel, setPlayerLevel] = useState<number | null>(null);
  const [lastSynced, setLastSynced] = useState<number | null>(null);

  const loadQuestState = useCallback(async (activeToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const trackerClient = new TarkovTrackerClient(activeToken);
      const devClient = new TarkovDevClient();
      const [progress, tasks] = await Promise.all([
        trackerClient.getProgress(),
        devClient.getTasks(),
      ]);
      setPlayerLevel(progress.playerLevel);
      setQuestState(deriveQuestState(progress, tasks));
      setLastSynced(trackerClient.getLastSynced());
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        TokenManager.clearToken();
        setIsAuthenticated(false);
        setToken('');
        setError('Token rejected. Please paste it again.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load quest state');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = TokenManager.getToken();
    if (saved) {
      setToken(saved);
      setIsAuthenticated(true);
      loadQuestState(saved);
    }
  }, [loadQuestState]);

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (!TokenManager.validateToken(token)) throw new Error('Invalid token format');
      const ok = await TokenManager.verifyToken(token);
      if (!ok) throw new Error('Token rejected by TarkovTracker');
      TokenManager.saveToken(token);
      setIsAuthenticated(true);
      await loadQuestState(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    TokenManager.clearToken();
    setToken('');
    setIsAuthenticated(false);
    setQuestState(null);
    setPlayerLevel(null);
    setLastSynced(null);
  };

  const handleRefresh = () => {
    if (token) loadQuestState(token);
  };

  return (
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
              {loading ? 'Validating…' : 'Validate Token'}
            </button>
          </form>
          {error && <div className="error">{error}</div>}
        </div>
      ) : (
        <div className="main-section">
          <div className="header">
            <h2>Player level: {playerLevel ?? '—'}</h2>
            <div>
              <button onClick={handleRefresh} disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
              <button onClick={handleLogout} className="logout-btn">
                Logout
              </button>
            </div>
          </div>
          {lastSynced && (
            <p className="synced">
              Synced {new Date(lastSynced).toLocaleTimeString()}
            </p>
          )}

          {questState && (
            <>
              <h3>Available ({questState.available.length})</h3>
              <ul>
                {questState.available.slice(0, 50).map((t) => (
                  <li key={t.id}>
                    <strong>{t.name}</strong>
                    {t.map && <span className="map"> — {t.map.name}</span>}
                    {t.trader && <span className="trader"> ({t.trader.name})</span>}
                  </li>
                ))}
              </ul>
              <h3>Locked ({questState.locked.length})</h3>
              <ul className="locked">
                {questState.locked.slice(0, 20).map((t) => (
                  <li key={t.id}>{t.name}</li>
                ))}
              </ul>
            </>
          )}

          {error && <div className="error">{error}</div>}
        </div>
      )}
    </div>
  );
}

export default App;
