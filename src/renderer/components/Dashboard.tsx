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
  saveSetting: (key: keyof SettingsData, value: string) => Promise<void>;
}

export default function Dashboard({
  reports,
  repos,
  settings,
  generateForDate,
  retryPending,
  saveSetting,
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

  const [workNotes, setWorkNotes] = useState(settings.todayWorkNotes || '');
  const [saveStatus, setSaveStatus] = useState('');

  // Sync state when settings.todayWorkNotes changes
  useEffect(() => {
    setWorkNotes(settings.todayWorkNotes || '');
  }, [settings.todayWorkNotes]);

  const handleSaveNotes = async () => {
    try {
      await saveSetting('todayWorkNotes', workNotes);
      setSaveStatus("Saved for today's report.");
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (err: any) {
      setSaveStatus('Failed to save note.');
    }
  };

  // Preview / approval states
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editedReport, setEditedReport] = useState('');
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');

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

  // Sync preview modal content when pipeline becomes paused
  useEffect(() => {
    if (pipelineStatus?.overall === 'paused') {
      const currentReport = reports.find(r => r.report_date === selectedDate);
      if (currentReport) {
        setEditedReport(currentReport.report_content);
        try {
          const parsed = JSON.parse(currentReport.email_content);
          setEditedSubject(parsed.subject || '');
          setEditedBody(parsed.body || '');
        } catch (e) {
          setEditedSubject(`Daily Development Report - ${selectedDate}`);
          setEditedBody(currentReport.email_content || '');
        }
        setPreviewOpen(true);
      }
    } else {
      setPreviewOpen(false);
    }
  }, [pipelineStatus, reports, selectedDate]);

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
    if (hr < 12) return 'Good morning';
    if (hr < 18) return 'Good afternoon';
    return 'Good evening';
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
    stage: { status: string; message?: string; timestamp?: string } | undefined
  ) => {
    const status = stage?.status || 'idle';
    const message = stage?.message;
    const timestamp = stage?.timestamp;

    let iconColor = '#D4D4D4';
    let iconContent = (
      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#D4D4D4' }} />
    );

    if (status === 'success') {
      iconColor = 'var(--success-text)';
      iconContent = (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    } else if (status === 'failed') {
      iconColor = 'var(--danger-text)';
      iconContent = (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
    } else if (status === 'running') {
      iconColor = 'var(--running-text)';
      iconContent = (
        <div className="pulse-dot" style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: 'var(--running-text)',
          animation: 'pulse 1.2s infinite'
        }} />
      );
    }

    return (
      <div style={{ display: 'flex', gap: '14px', position: 'relative' }}>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes pulse {
            0% { transform: scale(0.9); opacity: 0.6; }
            50% { transform: scale(1.3); opacity: 1; }
            100% { transform: scale(0.9); opacity: 0.6; }
          }
        `}} />
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            border: '1.5px solid',
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
            width: '1px',
            flexGrow: 1,
            background: 'var(--border-light)',
            margin: '4px 0',
            minHeight: '20px',
            zIndex: 1
          }} />
        </div>

        <div style={{ paddingBottom: '16px', flexGrow: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-main)' }}>{title}</span>
            {timestamp && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{timestamp}</span>}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{desc}</div>
          {message && (
            <div style={{ 
              fontSize: '11px', 
              color: status === 'failed' ? 'var(--danger-text)' : 'var(--text-muted)', 
              background: 'var(--accent-light)',
              padding: '4px 8px',
              borderRadius: '4px',
              marginTop: '4px',
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
        <p className="page-subtitle" style={{ margin: 0 }}>
          {allReady ? 'Everything is configured and operational.' : 'Configure the setup wizard in settings to complete operational checklist.'}
        </p>
      </div>

      {/* Today's Status grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        
        {/* Connection Status Card */}
        <div className="card">
          <span className="card__title">Today's Status</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Git Repositories</span>
              <span className={`status-pill ${gitReady ? 'status-pill--success' : 'status-pill--failed'}`}>
                {gitReady ? 'Active' : 'Missing'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Gemini API</span>
              <span className={`status-pill ${geminiConnected ? 'status-pill--success' : 'status-pill--failed'}`}>
                {geminiConnected ? 'Connected' : 'Not Set'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Gmail Service</span>
              <span className={`status-pill ${gmailConnected ? 'status-pill--success' : 'status-pill--failed'}`}>
                {gmailConnected ? 'Authorized' : 'Not Set'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Google Sheets</span>
              <span className={`status-pill ${excelReady ? 'status-pill--success' : 'status-pill--failed'}`}>
                {excelReady ? 'Connected' : 'Not Set'}
              </span>
            </div>
          </div>
        </div>

        {/* Next Scheduled Run Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <span className="card__title">Next Scheduled Run</span>
            <strong className="card__value" style={{ display: 'block', marginTop: '12px', fontSize: '20px', fontWeight: '700' }}>
              {settings.reportTime || '17:30'}
            </strong>
          </div>
          <span className="card__caption" style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '12px', display: 'block' }}>
            {getNextScheduledLabel()}
          </span>
        </div>

        {/* Last Run Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <span className="card__title">Last Execution</span>
            <strong className="card__value" style={{ display: 'block', marginTop: '12px', fontSize: '20px', fontWeight: '700' }}>
              {reports[0]?.report_date || 'None'}
            </strong>
          </div>
          <span className="card__caption" style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '12px', display: 'block' }}>
            {getLastReportLabel()}
          </span>
        </div>
      </div>

      {/* Main sections grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Side: Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Run Now Card */}
          <div className="card">
            <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '4px' }}>Run Now</h3>
            <p className="description" style={{ marginBottom: '16px' }}>Select a report date to run the pipeline manually.</p>
            
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
              {triggerLoading || (pipelineStatus?.overall === 'running') ? 'Running pipeline...' : 'Execute Pipeline'}
            </button>

            {triggerError && <p className="error-text" style={{ marginTop: '12px' }}>{triggerError}</p>}
            {triggerSuccess && <p className="success-text" style={{ marginTop: '12px' }}>Pipeline execution finished successfully.</p>}
            
            {pendingDeliveries > 0 && (
              <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-light)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{pendingDeliveries} failed runs pending retry</span>
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

          {/* Today's Work Note Card */}
          <div className="card">
            <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '4px' }}>Today's Work Note</h3>
            <p className="description" style={{ marginBottom: '12px' }}>
              Add manual notes for activities like meetings, testing, code reviews, or planning.
            </p>
            
            <div className="form-field" style={{ marginBottom: '12px' }}>
              <textarea 
                value={workNotes}
                onChange={(e) => setWorkNotes(e.target.value)}
                placeholder="• Tested latest backend changes&#10;• Reviewed PR&#10;• Discussed implementation strategy&#10;• Validated deployment"
                rows={4}
                style={{ 
                  width: '100%', 
                  fontFamily: 'inherit', 
                  fontSize: '13px', 
                  padding: '10px', 
                  borderRadius: '6px', 
                  border: '1px solid var(--border-light)', 
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button 
                className="btn btn--secondary" 
                onClick={handleSaveNotes}
                style={{ minWidth: '100px' }}
              >
                Save Note
              </button>
              {saveStatus && (
                <span style={{ fontSize: '12px', color: saveStatus.includes('Failed') ? 'var(--danger-text)' : 'var(--success-text)', fontWeight: '500' }}>
                  {saveStatus}
                </span>
              )}
            </div>
          </div>

          {/* Configuration Summary Card */}
          <div className="card">
            <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px' }}>Current Configuration</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Current AI Model</span>
                <span style={{ fontWeight: '600', color: 'var(--text-main)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {settings.llmModel || 'Auto-discovered'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Connected Gmail</span>
                <span style={{ fontWeight: '600', color: 'var(--text-main)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {settings.gmailUserEmail || 'Not configured'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Connected Google Sheet</span>
                {settings.excelPath ? (
                  <span 
                    style={{ fontWeight: '600', color: 'var(--running-text)', cursor: 'pointer', textDecoration: 'underline', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} 
                    onClick={() => window.thalavedana.openExternal(settings.excelPath!)}
                  >
                    Open Sheet
                  </span>
                ) : (
                  <span style={{ fontWeight: '600', color: 'var(--danger-text)' }}>Not set</span>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Monitored Repositories</span>
                <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                  {totalRepos} folders
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Scheduler Time</span>
                <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                  {settings.reportTime || '17:30'} ({settings.workStartTime || '10:00 AM'} - {settings.workEndTime || '05:30 PM'})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Activity & Shortcuts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Recent Activity Pipeline status visualizer */}
          {pipelineStatus && pipelineStatus.overall !== 'idle' ? (
            <div className="card" style={{ background: '#FFFFFF' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '700', margin: 0 }}>Recent Activity</h3>
                <span className={`status-pill ${
                  pipelineStatus.overall === 'success' ? 'status-pill--success' :
                  pipelineStatus.overall === 'failed' ? 'status-pill--failed' : 
                  pipelineStatus.overall === 'paused' ? 'status-pill--pending' : 'status-pill--pending'
                }`} style={{ fontSize: '10px' }}>
                  {pipelineStatus.overall}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {renderTimelineItem('Repository Scan', 'Scans configured Git repositories for commits.', pipelineStatus.git)}
                {renderTimelineItem('AI Report Generation', 'Generates the report body and email contents.', pipelineStatus.ai)}
                {renderTimelineItem('Spreadsheet Update', 'Appends the report row to Google Sheets.', pipelineStatus.excel)}
                {renderTimelineItem('Email Delivery', 'Delivers the work report email via Gmail API.', pipelineStatus.gmail)}
              </div>

              {pipelineStatus.overall === 'paused' && (
                <button 
                  className="btn btn--primary btn--sm" 
                  style={{ width: '100%', marginTop: '12px' }}
                  onClick={() => setPreviewOpen(true)}
                >
                  Open Review Dialog
                </button>
              )}

              {pipelineStatus.errorMessage && (
                <div className="error-banner" style={{ marginTop: '12px', fontSize: '12px' }}>
                  <strong>Error:</strong> {pipelineStatus.errorMessage}
                </div>
              )}
            </div>
          ) : (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '32px 16px', textAlign: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)' }}>No Active Runs</span>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>Select a date to trigger a manual report run.</p>
            </div>
          )}

          {/* Quick Shortcuts Card */}
          <div className="card">
            <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px' }}>Quick Actions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button 
                className="btn btn--secondary btn--sm" 
                onClick={() => settings.excelPath && window.thalavedana.openExternal(settings.excelPath)}
                disabled={!settings.excelPath}
                style={{ width: '100%' }}
              >
                Open Google Sheet
              </button>
              <button 
                className="btn btn--secondary btn--sm" 
                onClick={() => window.thalavedana.openExternal('https://mail.google.com/mail/u/0/#sent')}
                style={{ width: '100%' }}
              >
                Open Sent Emails
              </button>
              <button 
                className="btn btn--secondary btn--sm" 
                onClick={async () => {
                  if (repos.length > 0 && repos[0]) {
                    await window.thalavedana.openPath(repos[0].path);
                  }
                }}
                disabled={repos.length === 0}
                style={{ width: '100%' }}
              >
                Open Repository Folder
              </button>
              <button 
                className="btn btn--secondary btn--sm" 
                onClick={async () => {
                  await window.thalavedana.openPath('logs');
                }}
                style={{ width: '100%' }}
              >
                Open Application Logs
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Report Preview Modal Overlay */}
      {previewOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '24px'
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: '680px',
            maxHeight: '90vh',
            overflowY: 'auto',
            background: '#FFFFFF',
            borderRadius: '6px',
            border: '1px solid var(--border-light)',
            boxShadow: 'var(--shadow-md)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '700', margin: 0 }}>Report Review & Dispatch</h3>
                <p className="description" style={{ margin: '4px 0 0 0' }}>Review and edit the draft report summary and email contents prior to final dispatch.</p>
              </div>
              <button 
                className="btn btn--secondary btn--sm" 
                onClick={() => setPreviewOpen(false)}
                style={{ minWidth: 'auto', padding: '4px 8px' }}
              >
                Close
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flexGrow: 1, overflowY: 'auto', paddingRight: '4px' }}>
              {/* Report Summary Editor */}
              <div className="form-field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12px', fontWeight: '600', marginBottom: '6px', display: 'block' }}>Daily Development Report Summary (Markdown)</label>
                <textarea 
                  value={editedReport}
                  onChange={(e) => setEditedReport(e.target.value)}
                  style={{ width: '100%', minHeight: '140px', fontFamily: 'inherit', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '13px', lineHeight: '1.5', resize: 'vertical' }}
                />
              </div>

              {/* Email Subject Editor */}
              <div className="form-field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12px', fontWeight: '600', marginBottom: '6px', display: 'block' }}>Email Subject Line</label>
                <input 
                  type="text" 
                  value={editedSubject}
                  onChange={(e) => setEditedSubject(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '13px' }}
                />
              </div>

              {/* Email Body Editor */}
              <div className="form-field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12px', fontWeight: '600', marginBottom: '6px', display: 'block' }}>Email Body (HTML Preview / Code)</label>
                <textarea 
                  value={editedBody}
                  onChange={(e) => setEditedBody(e.target.value)}
                  style={{ width: '100%', minHeight: '140px', fontFamily: 'monospace', fontSize: '12px', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-light)', resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
              <button 
                className="btn btn--danger btn--sm" 
                onClick={async () => {
                  if (confirm('Discard this report generation run?')) {
                    await window.thalavedana.cancelReport(selectedDate);
                    setPreviewOpen(false);
                  }
                }}
              >
                Discard Run
              </button>
              <button 
                className="btn btn--primary btn--sm" 
                onClick={async () => {
                  await window.thalavedana.approveReport(selectedDate, editedReport, editedSubject, editedBody);
                  setPreviewOpen(false);
                }}
              >
                Approve & Deliver
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
