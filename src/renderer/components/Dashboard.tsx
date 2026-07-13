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

  const [expandedReportId, setExpandedReportId] = useState<number | null>(null);
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

  // Stats calculations
  const totalRepos = repos.length;
  const lastReportDate = reports[0]?.report_date || 'Never';
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

  const getOverallColor = (status: string) => {
    if (status === 'success') return '#40c057';
    if (status === 'failed') return '#fa5252';
    if (status === 'running') return '#228be6';
    return '#868e96';
  };

  const renderStage = (title: string, stage: { status: string; message?: string }) => {
    const getStageColor = (s: string) => {
      if (s === 'success') return '#40c057';
      if (s === 'failed') return '#fa5252';
      if (s === 'running') return '#228be6';
      return 'rgba(255, 255, 255, 0.15)';
    };

    const getStageStatusLabel = (s: string) => {
      if (s === 'success') return '✓ Success';
      if (s === 'failed') return '✗ Failed';
      if (s === 'running') return '⚡ Running';
      return '○ Pending';
    };

    return (
      <div className="stage-card" style={{
        padding: '12px',
        borderRadius: '6px',
        border: '1px solid',
        borderColor: getStageColor(stage.status),
        background: 'rgba(0, 0, 0, 0.2)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#9fb1ce', marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: getStageColor(stage.status) }}>
          {getStageStatusLabel(stage.status)}
        </div>
        {stage.message && (
          <div 
            style={{ 
              fontSize: '11px', 
              color: '#9fb1ce', 
              marginTop: '4px',
              overflow: 'hidden', 
              textOverflow: 'ellipsis', 
              whiteSpace: 'nowrap' 
            }} 
            title={stage.message}
          >
            {stage.message}
          </div>
        )}
      </div>
    );
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

  const getStatusPillClass = (status: string) => {
    switch (status) {
      case 'updated':
      case 'sent':
        return 'status-pill--success';
      case 'failed':
        return 'status-pill--failed';
      default:
        return 'status-pill--pending';
    }
  };

  const parseEmailContent = (content: string) => {
    try {
      const parsed = JSON.parse(content);
      return { subject: parsed.subject, body: parsed.body };
    } catch (e) {
      return { subject: 'Daily Work Report', body: content };
    }
  };

  return (
    <div className="dashboard">
      {/* Stats row */}
      <div className="grid">
        <section className="card">
          <p className="card__title">Git Repositories</p>
          <strong className="card__value">{totalRepos}</strong>
          <p className="card__caption">Scoped locations</p>
        </section>

        <section className="card">
          <p className="card__title">Scheduled time</p>
          <strong className="card__value">{settings.reportTime || '17:30'}</strong>
          <p className="card__caption">Daily automated run</p>
        </section>

        <section className="card">
          <p className="card__title">Pending Deliveries</p>
          <strong className="card__value" style={{ color: pendingDeliveries > 0 ? '#ffd43b' : 'inherit' }}>
            {pendingDeliveries}
          </strong>
          <p className="card__caption">
            {pendingDeliveries > 0 ? (
              <button 
                className="btn btn--link btn--sm" 
                style={{ padding: 0, textDecoration: 'underline' }} 
                onClick={handleRetryQueue}
                disabled={retryLoading}
              >
                {retryLoading ? 'Retrying...' : 'Retry Queue Now'}
              </button>
            ) : (
              'All tasks synced'
            )}
          </p>
        </section>
      </div>

      {/* Manual Trigger Panel */}
      <div className="card manual-trigger-box" style={{ marginTop: '20px' }}>
        <h3>Manual Report Execution</h3>
        <p className="description">Run the Git-scraper and report delivery pipeline immediately for any calendar date.</p>
        
        <div className="form-group row" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)}
            disabled={triggerLoading || (pipelineStatus?.overall === 'running')}
            style={{ width: '220px' }}
          />
          <button 
            className="btn btn--primary" 
            onClick={handleManualTrigger}
            disabled={triggerLoading || totalRepos === 0 || (pipelineStatus?.overall === 'running')}
          >
            {triggerLoading || (pipelineStatus?.overall === 'running') ? 'Processing Automation...' : 'Trigger Report'}
          </button>
        </div>

        {triggerError && <p className="error-text" style={{ marginTop: '10px' }}>{triggerError}</p>}
        {triggerSuccess && <p className="success-text" style={{ marginTop: '10px' }}>✓ Automation run completed successfully!</p>}

        {/* Live Pipeline Flow Panel */}
        {pipelineStatus && pipelineStatus.overall !== 'idle' && (
          <div className="pipeline-flow" style={{ 
            marginTop: '20px', 
            padding: '16px', 
            background: 'rgba(255, 255, 255, 0.02)', 
            borderRadius: '8px', 
            border: '1px solid var(--border)' 
          }}>
            <h4 style={{ margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Live Status Flow</span>
              <span style={{ 
                fontSize: '12px', 
                textTransform: 'uppercase', 
                padding: '2px 8px', 
                borderRadius: '4px',
                background: 'rgba(255, 255, 255, 0.05)',
                color: getOverallColor(pipelineStatus.overall) 
              }}>{pipelineStatus.overall}</span>
            </h4>
            
            <div className="stages-grid" style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(4, 1fr)', 
              gap: '12px', 
              marginTop: '14px' 
            }}>
              {renderStage('Git Scrape', pipelineStatus.git)}
              {renderStage('AI Summary', pipelineStatus.ai)}
              {renderStage('Excel Log', pipelineStatus.excel)}
              {renderStage('Gmail Sent', pipelineStatus.gmail)}
            </div>

            {pipelineStatus.errorMessage && (
              <div className="error-text" style={{ 
                marginTop: '12px', 
                padding: '8px', 
                background: 'rgba(250, 82, 82, 0.1)', 
                borderRadius: '4px', 
                fontSize: '12px',
                border: '1px solid rgba(250, 82, 82, 0.2)'
              }}>
                <strong>Failed stages error message:</strong> {pipelineStatus.errorMessage}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Report History */}
      <div className="report-history" style={{ marginTop: '28px' }}>
        <h3>Report History ({reports.length})</h3>
        
        {reports.length === 0 ? (
          <p className="dimmed">No work reports logged yet. Automated schedules will list here.</p>
        ) : (
          reports.map((report) => {
            const isExpanded = expandedReportId === report.id;
            const emailData = parseEmailContent(report.email_content);

            return (
              <div 
                key={report.id} 
                className={`report-card ${isExpanded ? 'report-card--expanded' : ''}`}
              >
                <div 
                  className="report-card__header" 
                  onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                >
                  <div className="report-card__title-box">
                    <span className="report-card__date">{report.report_date}</span>
                    <span className="report-card__sub">Generated: {new Date(report.created_at).toLocaleTimeString()}</span>
                  </div>

                  <div className="report-card__status-box">
                    <span className={`status-pill ${getStatusPillClass(report.excel_status)}`}>
                      Excel: {report.excel_status}
                    </span>
                    <span className={`status-pill ${getStatusPillClass(report.email_status)}`}>
                      Gmail: {report.email_status === 'sent' ? 'Sent' : report.email_status}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="report-card__body">
                    {report.error_message && (
                      <div className="error-banner" style={{ marginBottom: '16px' }}>
                        <strong>Error details:</strong> {report.error_message}
                        <button 
                          className="btn btn--secondary btn--sm" 
                          style={{ marginLeft: '16px', float: 'right' }} 
                          onClick={async () => {
                            setTriggerLoading(true);
                            await generateForDate(report.report_date);
                            setTriggerLoading(false);
                          }}
                        >
                          Retry Re-run
                        </button>
                        <div style={{ clear: 'both' }}></div>
                      </div>
                    )}

                    <div className="report-sections">
                      <div className="report-section">
                        <h4>Work Report Draft (Markdown)</h4>
                        <div className="markdown-body">
                          {report.report_content ? (
                            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{report.report_content}</pre>
                          ) : (
                            <p className="dimmed">No content generated. Check errors.</p>
                          )}
                        </div>
                      </div>

                      <div className="report-section">
                        <h4>Gmail Draft HTML Preview</h4>
                        <div className="email-preview-box">
                          <div className="email-preview-subject">
                            <strong>Subject:</strong> {emailData.subject}
                          </div>
                          <div 
                            className="email-preview-html"
                            dangerouslySetInnerHTML={{ __html: emailData.body }}
                          />
                        </div>
                      </div>

                      <div className="report-section">
                        <h4>Commit Metadata Parsed</h4>
                        <div className="commits-preview-box">
                          <pre>{JSON.stringify(JSON.parse(report.commit_data), null, 2)}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
