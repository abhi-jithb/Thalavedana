import { useState } from 'react';
import { useThalavedana } from './hooks/useThalavedana';
import SetupWizard from './components/SetupWizard';
import Dashboard from './components/Dashboard';
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

  const [activePage, setActivePage] = useState<'dashboard' | 'settings' | 'logs'>('dashboard');

  if (isLoading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#06101d',
        color: '#eef4ff',
        fontFamily: 'sans-serif'
      }}>
        <h2 style={{ letterSpacing: '-0.03em' }}>Thalavedana</h2>
        <p style={{ color: '#9fb1ce' }}>Loading database configuration...</p>
      </div>
    );
  }

  const setupCompleted = settings.setupCompleted === 'true';

  return (
    <main className="shell">
      {/* Left panel: Info or Navigation */}
      <aside className="hero">
        <p className="eyebrow">Local-first internship reporting</p>
        <h1>Thalavedana</h1>
        <p className="hero__copy">
          {setupCompleted 
            ? 'Fully automated, privacy-first internship report and email generator. Rest easy.' 
            : 'Build daily work reports from selected repositories, generate professional email drafts, and keep the entire workflow on your machine.'}
        </p>

        {setupCompleted ? (
          <div className="sidebar-nav" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
            <button 
              className={`btn ${activePage === 'dashboard' ? 'btn--accent' : 'btn--secondary'}`} 
              onClick={() => setActivePage('dashboard')}
            >
              Dashboard View
            </button>
            <button 
              className={`btn ${activePage === 'settings' ? 'btn--accent' : 'btn--secondary'}`} 
              onClick={() => setActivePage('settings')}
            >
              System Settings
            </button>
            <button 
              className={`btn ${activePage === 'logs' ? 'btn--accent' : 'btn--secondary'}`} 
              onClick={() => setActivePage('logs')}
            >
              Activity Logs
            </button>
            <button 
              className="btn btn--link btn--sm" 
              style={{ marginTop: '20px', color: 'var(--muted)' }} 
              onClick={refreshAll}
            >
              Refresh Dashboard Data
            </button>
          </div>
        ) : (
          <div className="hero__meta" style={{ marginTop: '20px' }}>
            <span>Privacy Scoped</span>
            <span>Local Database</span>
            <span>Gmail Secure OAuth</span>
            <span>exceljs Appender</span>
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
            {activePage === 'settings' && (
              <Settings
                settings={settings}
                repos={repos}
                saveSetting={saveSetting}
                addRepo={addRepo}
                removeRepo={removeRepo}
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