import { useState } from 'react';
import { useThalavedana } from './hooks/useThalavedana';
import SetupWizard from './components/SetupWizard';
import Dashboard from './components/Dashboard';
import ReportsHistory from './components/ReportsHistory';
import RepositoriesManager from './components/RepositoriesManager';
import Settings from './components/Settings';
import LogsViewer from './components/LogsViewer';

export default function App() {
  const {
    settings,
    repos,
    reports,
    logs,
    isLoading,
    saveSetting,
    addRepo,
    removeRepo,
    clearLogs,
    generateForDate,
    retryPending,
    connectGmail,
    refreshAll,
  } = useThalavedana();

  const [activePage, setActivePage] = useState<'dashboard' | 'reports' | 'repositories' | 'settings' | 'logs'>('dashboard');

  if (isLoading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-app)',
        color: 'var(--text-main)',
        fontFamily: 'inherit'
      }}>
        <h2 style={{ letterSpacing: '-0.02em', fontSize: '20px', fontWeight: '800' }}>🧠 Thalavedana</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>Loading configurations...</p>
      </div>
    );
  }

  const setupCompleted = settings.setupCompleted === 'true';

  return (
    <main className="shell">
      {/* Left sidebar: Logo, Description & Navigation */}
      <aside className="hero">
        <h1>🧠 Thalavedana</h1>
        <p className="hero__copy">
          {setupCompleted 
            ? 'Fully automated, privacy-first internship report and email generator. Rest easy.' 
            : 'Build daily work reports from selected repositories, generate professional email drafts, and keep the entire workflow on your machine.'}
        </p>

        {setupCompleted ? (
          <div className="sidebar-nav">
            <button 
              className={`nav-item ${activePage === 'dashboard' ? 'nav-item--active' : ''}`} 
              onClick={() => setActivePage('dashboard')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Dashboard
            </button>

            <button 
              className={`nav-item ${activePage === 'reports' ? 'nav-item--active' : ''}`} 
              onClick={() => setActivePage('reports')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              Reports
            </button>

            <button 
              className={`nav-item ${activePage === 'repositories' ? 'nav-item--active' : ''}`} 
              onClick={() => setActivePage('repositories')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              Repositories
            </button>

            <button 
              className={`nav-item ${activePage === 'settings' ? 'nav-item--active' : ''}`} 
              onClick={() => setActivePage('settings')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </button>

            <button 
              className={`nav-item ${activePage === 'logs' ? 'nav-item--active' : ''}`} 
              onClick={() => setActivePage('logs')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
              Logs
            </button>

            <button 
              className="btn btn--link btn--sm" 
              style={{ marginTop: '28px', marginLeft: '12px' }} 
              onClick={refreshAll}
            >
              Refresh Dashboard
            </button>
          </div>
        ) : (
          <div className="hero__meta">
            <span>🔒 Privacy Scoped</span>
            <span>💾 Local Database</span>
            <span>🔑 safeStorage Encrypted</span>
            <span>📊 exceljs Appender</span>
          </div>
        )}
      </aside>

      {/* Right panel: Dynamic content */}
      <section className="panel">
        {!setupCompleted ? (
          <SetupWizard
            settings={settings}
            repos={repos}
            saveSetting={saveSetting}
            addRepo={addRepo}
            removeRepo={removeRepo}
            connectGmail={connectGmail}
            refreshAll={refreshAll}
          />
        ) : (
          <>
            {activePage === 'dashboard' && (
              <Dashboard
                reports={reports}
                repos={repos}
                settings={settings}
                generateForDate={generateForDate}
                retryPending={retryPending}
              />
            )}
            {activePage === 'reports' && (
              <ReportsHistory
                reports={reports}
                generateForDate={generateForDate}
              />
            )}
            {activePage === 'repositories' && (
              <RepositoriesManager
                repos={repos}
                addRepo={addRepo}
                removeRepo={removeRepo}
              />
            )}
            {activePage === 'settings' && (
              <Settings
                settings={settings}
                saveSetting={saveSetting}
                connectGmail={connectGmail}
                refreshAll={refreshAll}
              />
            )}
            {activePage === 'logs' && (
              <LogsViewer
                logs={logs}
                onClear={clearLogs}
              />
            )}
          </>
        )}
      </section>
    </main>
  );
}