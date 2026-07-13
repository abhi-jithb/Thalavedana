import { useState, useEffect } from 'react';
import type { 
  ReportData, 
  RepositoryData,
  SettingsData,
  PipelineStatus
} from '../../shared/api';

interface DashboardProps {
  reports: ReportData[];
  repos: RepositoryData[];
  settings: SettingsData;
  generateForDate: (dateStr: string) => Promise<{ ok: boolean; error?: string }>;
  retryPending: () => Promise<void>;
}

export default function Dashboard({
  reports,
  repos,
  settings,
  generateForDate,
  retryPending,
}: DashboardProps) {
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localDate = new Date(today.getTime() - offset * 60 * 1000);
    return localDate.toISOString().split('T')[0] || '';
  });

  const [triggerLoading, setTriggerLoading] = useState(false);
  const [triggerError, setTriggerError] = useState('');
  const [triggerSuccess, setTriggerSuccess] = useState(false);
  const [retryLoading, setRetryLoading] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);

  useEffect(() => {
    let active = true;
    const fetchStatus = async () => {
      try {
        const status = await window.thalavedana.getPipelineStatus(selectedDate);
        if (active) {
          setPipelineStatus(status);
        }
      } catch (err) {
        console.error('Failed to get pipeline status:', err);
      }
    };
    fetchStatus();

    const unsubscribe = window.thalavedana.onStatusChange((status) => {
      if (active && status.date === selectedDate) {
        setPipelineStatus(status);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [selectedDate]);

  const totalRepos = repos.length;
  const pendingDeliveries = reports.filter(
    r => r.excel_status !== 'updated' || r.email_status !== 'sent'
  ).length;

  const handleManualTrigger = async () => {
    setTriggerError('');
    setTriggerSuccess(false);
    setTriggerLoading(true);

    try {
      const res = await generateForDate(selectedDate);
      if (res.ok) {
        setTriggerSuccess(true);
      } else {
        setTriggerError(res.error || 'Failed to generate report. Make sure you have commits on this date.');
      }
    } catch (err: any) {
      setTriggerError(err.message || 'An error occurred during generation.');
    } finally {
      setTriggerLoading(false);
    }
  };

  const handleRetryQueue = async () => {
    setRetryLoading(true);
    try {
      await retryPending();
    } catch (e) {
      console.error(e);
    } finally {
      setRetryLoading(false);
    }
  };

  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return '👋 Good Morning';
    if (hr < 18) return '👋 Good Afternoon';
    return '👋 Good Evening';
  };

  const gitReady = totalRepos > 0;
  const geminiConnected = !!settings.geminiApiKey;
  const gmailConnected = !!settings.gmailUserEmail;
  const excelReady = !!settings.excelPath;
  const allReady = gitReady && geminiConnected && gmailConnected && excelReady;

  const getLastReportLabel = () => {
    if (reports.length === 0) return 'Never';
    const last = reports[0];
    if (!last) return 'Never';
    const date = new Date(last.created_at);
    return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const getNextScheduledLabel = () => {
    if (!settings.reportTime) return 'Not scheduled';
    const [hrs, mins] = settings.reportTime.split(':').map(Number);
    if (hrs === undefined || mins === undefined) return 'Not scheduled';
    
    const now = new Date();
    const scheduled = new Date();
    scheduled.setHours(hrs, mins, 0, 0);
    
    if (now.getTime() > scheduled.getTime()) {
      scheduled.setDate(scheduled.getDate() + 1);
      return `Tomorrow at ${scheduled.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return `Today at ${scheduled.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  };

  const renderTimelineItem = (
    title: string,
    desc: string,
    stage: { status: string; message?: string } | undefined
  ) => {
    const status = stage?.status || 'idle';
    const message = stage?.message;

    let iconColor = '#D4D4D4';
    let iconContent = (
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#D4D4D4' }} />
    );

    if (status === 'success') {
      iconColor = 'var(--success-text)';
      iconContent = (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    } else if (status === 'failed') {
      iconColor = 'var(--danger-text)';
      iconContent = (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
    } else if (status === 'running') {
      iconColor = 'var(--running-text)';
      iconContent = (
        <div className="pulse-dot" style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: 'var(--running-text)',
          animation: 'pulse 1.2s infinite'
        }} />
      );
    }

    return (
      <div style={{ display: 'flex', gap: '16px', position: 'relative' }}>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes pulse {
            0% { transform: scale(0.9); opacity: 0.6; }
            50% { transform: scale(1.3); opacity: 1; }
            100% { transform: scale(0.9); opacity: 0.6; }
          }
        `}} />
        
        {/* Left vertical bullet column */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            border: '2px solid',
            borderColor: iconColor,
            background: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
            color: iconColor
          }}>
            {iconContent}
          </div>
          <div style={{
            width: '2px',
            flexGrow: 1,
            background: 'var(--border-light)',
            margin: '4px 0',
            minHeight: '24px',
            zIndex: 1
          }} />
        </div>

        {/* Right text content */}
        <div style={{ paddingBottom: '20px', flexGrow: 1 }}>
          <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-main)' }}>{title}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{desc}</div>
          {message && (
            <div style={{ 
              fontSize: '11px', 
              color: status === 'failed' ? 'var(--danger-text)' : 'var(--text-muted)', 
              background: 'var(--accent-light)',
              padding: '6px 10px',
              borderRadius: '6px',
              marginTop: '6px',
              display: 'inline-block'
            }}>
              {message}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard">
      <div style={{ marginBottom: '32px' }}>
        <h2 className="page-title">{getGreeting()}</h2>
        <p className="page-subtitle">
          {allReady ? 'Everything is configured and operational.' : 'Configure the wizard in system settings to complete setup.'}
        </p>
      </div>

      {/* Grid: Indicators & Schedules */}
      <div className="grid">
        {/* Indicators Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span className="card__title">Connection Status</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Git Repos</span>
              <span className={`status-pill ${gitReady ? 'status-pill--success' : 'status-pill--failed'}`} style={{ padding: '2px 8px', fontSize: '10px' }}>
                {gitReady ? '✓ Scoped' : '× Missing'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Gemini</span>
              <span className={`status-pill ${geminiConnected ? 'status-pill--success' : 'status-pill--failed'}`} style={{ padding: '2px 8px', fontSize: '10px' }}>
                {geminiConnected ? '✓ Connected' : '× Config'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Gmail Auth</span>
              <span className={`status-pill ${gmailConnected ? 'status-pill--success' : 'status-pill--failed'}`} style={{ padding: '2px 8px', fontSize: '10px' }}>
                {gmailConnected ? '✓ Secure' : '× Authorize'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Excel Map</span>
              <span className={`status-pill ${excelReady ? 'status-pill--success' : 'status-pill--failed'}`} style={{ padding: '2px 8px', fontSize: '10px' }}>
                {excelReady ? '✓ Ready' : '× Select'}
              </span>
            </div>
          </div>
        </div>

        {/* Last execution information */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <span className="card__title">Last Report Logged</span>
            <strong className="card__value" style={{ display: 'block', marginTop: '8px', fontSize: '20px' }}>
              {reports[0]?.report_date || 'Never'}
            </strong>
          </div>
          <span className="card__caption" style={{ color: 'var(--text-muted)' }}>
            {getLastReportLabel()}
          </span>
        </div>

        {/* Schedule settings */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <span className="card__title">Next Scheduled Run</span>
            <strong className="card__value" style={{ display: 'block', marginTop: '8px', fontSize: '20px' }}>
              {settings.reportTime || '17:30'}
            </strong>
          </div>
          <span className="card__caption" style={{ color: 'var(--text-muted)' }}>
            {getNextScheduledLabel()}
          </span>
        </div>
      </div>

      {/* Main Action area: Run now & Pipeline progress */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', alignItems: 'start' }}>
        
        {/* Manual launch card */}
        <div className="card">
          <h3>Manual Execution</h3>
          <p className="description">Select a date to trigger report scraping, AI summaries, journal logs, and email dispatches immediately.</p>
          
          <div className="form-field" style={{ marginBottom: '16px' }}>
            <label>Report Date</label>
            <input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
              disabled={triggerLoading || (pipelineStatus?.overall === 'running')}
            />
          </div>

          <button 
            className="btn btn--primary btn--lg" 
            style={{ width: '100%' }}
            onClick={handleManualTrigger}
            disabled={triggerLoading || totalRepos === 0 || (pipelineStatus?.overall === 'running')}
          >
            {triggerLoading || (pipelineStatus?.overall === 'running') ? 'Running pipeline...' : 'Run Now'}
          </button>

          {triggerError && <p className="error-text" style={{ marginTop: '12px' }}>{triggerError}</p>}
          {triggerSuccess && <p className="success-text" style={{ marginTop: '12px' }}>✓ Automation run completed successfully!</p>}
          
          {pendingDeliveries > 0 && (
            <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-light)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{pendingDeliveries} pending deliveries in queue</span>
              <button 
                className="btn btn--secondary btn--sm" 
                onClick={handleRetryQueue}
                disabled={retryLoading}
              >
                {retryLoading ? 'Retrying...' : 'Retry Pending'}
              </button>
            </div>
          )}
        </div>

        {/* Pipeline status visualizer */}
        {pipelineStatus && pipelineStatus.overall !== 'idle' && (
          <div className="card" style={{ background: '#FFFFFF' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>Pipeline Activity</h3>
              <span className={`status-pill ${
                pipelineStatus.overall === 'success' ? 'status-pill--success' :
                pipelineStatus.overall === 'failed' ? 'status-pill--failed' : 'status-pill--pending'
              }`} style={{ fontSize: '10px' }}>
                {pipelineStatus.overall}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {renderTimelineItem('Git Scrape', 'Monitored repository scanning', pipelineStatus.git)}
              {renderTimelineItem('AI Summary', 'Formulating work summary via Gemini', pipelineStatus.ai)}
              {renderTimelineItem('Excel Log', 'Adding entries to spreadsheet', pipelineStatus.excel)}
              {renderTimelineItem('Gmail Sent', 'Delivering email updates via Gmail', pipelineStatus.gmail)}
            </div>

            {pipelineStatus.errorMessage && (
              <div className="error-banner" style={{ marginTop: '12px', fontSize: '12px' }}>
                <strong>Error:</strong> {pipelineStatus.errorMessage}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
