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
    cancelGmailAuth,
    refreshAll,
  } = useThalavedana();

  const [activePage, setActivePage] = useState<'dashboard' | 'reports' | 'repositories' | 'logs' | 'settings'>('dashboard');
  const [isCollapsed, setIsCollapsed] = useState(false);

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
        <div style={{ fontSize: '16px', fontWeight: '600', letterSpacing: '-0.02em' }}>Thalavedana</div>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '6px' }}>Loading configuration...</p>
      </div>
    );
  }

  const hasConfig = settings.geminiApiKey || settings.geminiApiKey1 || settings.excelPath || settings.emailTo;

  if (!hasConfig && activePage !== 'settings') {
    return (
      <main className="shell">
        <aside className="hero" style={{ padding: '24px 16px', background: 'var(--bg-sidebar)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ fontSize: '15px', fontWeight: '700', letterSpacing: '-0.02em', paddingLeft: '12px', color: 'var(--text-main)' }}>
            Thalavedana
          </div>
        </aside>
        <div style={{ flex: 1, padding: '40px', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ maxWidth: '600px', width: '100%' }}>
            <SetupWizard
              settings={settings}
              repos={repos}
              saveSetting={saveSetting}
              addRepo={addRepo}
              removeRepo={removeRepo}
              connectGmail={connectGmail}
              cancelGmailAuth={cancelGmailAuth}
              refreshAll={refreshAll}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="shell" style={{ 
      display: 'grid',
      gridTemplateColumns: isCollapsed ? '72px 1fr' : '240px 1fr', 
      height: '100vh',
      transition: 'grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1)' 
    }}>
      {/* Sidebar navigation */}
      <aside className="hero" style={{ 
        padding: isCollapsed ? '24px 8px' : '24px 16px', 
        background: 'var(--bg-sidebar)', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '20px',
        overflow: 'hidden',
        borderRight: '1px solid var(--border-light)',
        height: '100%',
        transition: 'padding 0.3s ease'
      }}>
        {/* Brand logo & title row */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: isCollapsed ? 'center' : 'space-between',
          padding: '0 8px',
          height: '32px'
        }}>
          {!isCollapsed && (
            <div style={{ 
              fontSize: '15px', 
              fontWeight: '700', 
              letterSpacing: '-0.02em', 
              color: 'var(--text-main)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              {/* Minimal geometric logo */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="20" height="20" rx="6" fill="var(--accent)" />
                <path d="M7 8H17M7 12H14M7 16H11" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              Thalavedana
            </div>
          )}

          {isCollapsed && (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="20" height="20" rx="6" fill="var(--accent)" />
              <path d="M7 8H17M7 12H14M7 16H11" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          )}

          {!isCollapsed && (
            <button 
              onClick={() => setIsCollapsed(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s'
              }}
              title="Collapse sidebar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
            </button>
          )}
        </div>

        {isCollapsed && (
          <button 
            onClick={() => setIsCollapsed(false)}
            style={{
              background: 'none',
              border: '1px solid var(--border-light)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto',
              backgroundColor: '#FFFFFF',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}
            title="Expand sidebar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </button>
        )}

        <div className="sidebar-nav" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
          <button 
            className={`nav-item ${activePage === 'dashboard' ? 'nav-item--active' : ''}`} 
            onClick={() => setActivePage('dashboard')}
            title={isCollapsed ? "Dashboard" : undefined}
            style={{ justifyContent: isCollapsed ? 'center' : 'flex-start', padding: isCollapsed ? '10px 0' : '10px 16px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="9" />
              <rect x="14" y="3" width="7" height="5" />
              <rect x="14" y="12" width="7" height="9" />
              <rect x="3" y="16" width="7" height="5" />
            </svg>
            {!isCollapsed && <span>Dashboard</span>}
          </button>

          <button 
            className={`nav-item ${activePage === 'reports' ? 'nav-item--active' : ''}`} 
            onClick={() => setActivePage('reports')}
            title={isCollapsed ? "Reports" : undefined}
            style={{ justifyContent: isCollapsed ? 'center' : 'flex-start', padding: isCollapsed ? '10px 0' : '10px 16px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            {!isCollapsed && <span>Reports</span>}
          </button>

          <button 
            className={`nav-item ${activePage === 'repositories' ? 'nav-item--active' : ''}`} 
            onClick={() => setActivePage('repositories')}
            title={isCollapsed ? "Repositories" : undefined}
            style={{ justifyContent: isCollapsed ? 'center' : 'flex-start', padding: isCollapsed ? '10px 0' : '10px 16px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            {!isCollapsed && <span>Repositories</span>}
          </button>

          <button 
            className={`nav-item ${activePage === 'logs' ? 'nav-item--active' : ''}`} 
            onClick={() => setActivePage('logs')}
            title={isCollapsed ? "Activity Logs" : undefined}
            style={{ justifyContent: isCollapsed ? 'center' : 'flex-start', padding: isCollapsed ? '10px 0' : '10px 16px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {!isCollapsed && <span>Activity Logs</span>}
          </button>

          <button 
            className={`nav-item ${activePage === 'settings' ? 'nav-item--active' : ''}`} 
            onClick={() => setActivePage('settings')}
            title={isCollapsed ? "Settings" : undefined}
            style={{ justifyContent: isCollapsed ? 'center' : 'flex-start', padding: isCollapsed ? '10px 0' : '10px 16px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {!isCollapsed && <span>Settings</span>}
          </button>
        </div>
      </aside>

      {/* Right panel: Dynamic content */}
      <section className="panel" style={{ background: '#FFFFFF', padding: '40px', overflowY: 'auto' }}>
        {activePage === 'dashboard' && (
          <Dashboard
            reports={reports}
            repos={repos}
            settings={settings}
            generateForDate={generateForDate}
            retryPending={retryPending}
            saveSetting={saveSetting}
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
        {activePage === 'logs' && (
          <LogsViewer
            logs={logs}
            reports={reports}
            onClear={clearLogs}
          />
        )}
        {activePage === 'settings' && (
          <Settings
            settings={settings}
            saveSetting={saveSetting}
            connectGmail={connectGmail}
            cancelGmailAuth={cancelGmailAuth}
            refreshAll={refreshAll}
            repos={repos}
            addRepo={addRepo}
            removeRepo={removeRepo}
          />
        )}
      </section>
    </main>
  );
}