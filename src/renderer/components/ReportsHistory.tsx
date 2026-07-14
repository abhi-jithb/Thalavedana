import { useState } from 'react';
import type { ReportData } from '../../shared/api';

interface ReportsHistoryProps {
  reports: ReportData[];
  generateForDate: (dateStr: string) => Promise<{ ok: boolean; error?: string }>;
}

export default function ReportsHistory({ reports, generateForDate }: ReportsHistoryProps) {
  const [expandedReportId, setExpandedReportId] = useState<number | null>(null);
  const [stageLoading, setStageLoading] = useState<string | null>(null);

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
      return { subject: parsed.subject || '', body: parsed.body || '' };
    } catch (e) {
      return { subject: 'Daily Work Report', body: content || '' };
    }
  };

  const handleExportMarkdown = async (dateStr: string, content: string) => {
    try {
      const res = await window.thalavedana.exportReportMarkdown(dateStr, content);
      if (res.ok && res.filePath) {
        alert(`Successfully exported report to:\n${res.filePath}`);
      }
    } catch (e: any) {
      alert(`Export failed: ${e.message}`);
    }
  };

  const handleRetryStage = async (dateStr: string, stage: 'ai' | 'excel' | 'gmail') => {
    const key = `${dateStr}-${stage}`;
    setStageLoading(key);
    try {
      const res = await window.thalavedana.retryReportStage(dateStr, stage);
      if (res && !res.ok) {
        alert(`Retry failed: ${res.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      alert(`Retry failed: ${e.message}`);
    } finally {
      setStageLoading(null);
    }
  };

  if (reports.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#D4D4D4', marginBottom: '16px' }}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px' }}>No reports logged yet</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', maxWidth: '320px', margin: '0 auto' }}>
          Your reports will automatically appear here once the scheduler runs or you trigger a manual report.
        </p>
      </div>
    );
  }

  return (
    <div className="report-history">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 className="page-title">Report History</h2>
          <p className="page-subtitle">Browse and inspect previous daily updates, emails, and git logs.</p>
        </div>
        <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', background: 'var(--accent-light)', padding: '6px 12px', borderRadius: '20px' }}>
          {reports.length} {reports.length === 1 ? 'Report' : 'Reports'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {reports.map((report) => {
          const isExpanded = expandedReportId === report.id;
          const emailData = parseEmailContent(report.email_content);

          return (
            <div key={report.id} className="report-card">
              <div 
                className="report-card__header" 
                onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
              >
                <div>
                  <span className="report-card__date">{report.report_date}</span>
                  <span className="report-card__sub">
                    Generated: {new Date(report.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="report-card__status-box" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span className={`status-pill ${getStatusPillClass(report.excel_status)}`}>
                    Sheets: {report.excel_status}
                  </span>
                  <span className={`status-pill ${getStatusPillClass(report.email_status)}`}>
                    Gmail: {report.email_status === 'sent' ? 'Sent' : report.email_status}
                  </span>
                </div>
              </div>

              {isExpanded && (
                <div className="report-card__body">
                  {report.error_message && (
                    <div className="error-banner" style={{ marginBottom: '20px' }}>
                      <strong>Last Error:</strong> {report.error_message}
                    </div>
                  )}

                  {/* Actions Header bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>Pipeline Recovery Controls:</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        className="btn btn--secondary btn--sm" 
                        onClick={() => handleExportMarkdown(report.report_date, report.report_content)}
                        disabled={!report.report_content}
                      >
                        Export Markdown
                      </button>
                      <button 
                        className="btn btn--secondary btn--sm" 
                        onClick={() => handleRetryStage(report.report_date, 'ai')}
                        disabled={stageLoading === `${report.report_date}-ai`}
                      >
                        {stageLoading === `${report.report_date}-ai` ? 'Generating...' : 'Retry AI Generation'}
                      </button>
                      <button 
                        className="btn btn--secondary btn--sm" 
                        onClick={() => handleRetryStage(report.report_date, 'excel')}
                        disabled={stageLoading === `${report.report_date}-excel` || report.excel_status === 'updated'}
                      >
                        {stageLoading === `${report.report_date}-excel` ? 'Syncing...' : 'Retry Sheets'}
                      </button>
                      <button 
                        className="btn btn--secondary btn--sm" 
                        onClick={() => handleRetryStage(report.report_date, 'gmail')}
                        disabled={stageLoading === `${report.report_date}-gmail` || report.email_status === 'sent'}
                      >
                        {stageLoading === `${report.report_date}-gmail` ? 'Delivering...' : 'Retry Gmail'}
                      </button>
                    </div>
                  </div>

                  <div className="report-sections">
                    <div className="report-section">
                      <h4>Work Summary Draft</h4>
                      <div className="markdown-body" style={{ background: '#FFFFFF', border: '1px solid var(--border-light)', padding: '16px', borderRadius: '8px' }}>
                        {report.report_content ? (
                          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, fontSize: '13px', lineHeight: '1.5' }}>{report.report_content}</pre>
                        ) : (
                          <p className="dimmed">No summary generated.</p>
                        )}
                      </div>
                    </div>

                    <div className="report-section">
                      <h4>Email Preview</h4>
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
                      <h4>Commit Metadata</h4>
                      <div className="commits-preview-box" style={{ background: 'var(--bg-app)', border: '1px solid var(--border-light)', padding: '12px', borderRadius: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                        <pre style={{ fontSize: '11px', margin: 0 }}>{JSON.stringify(JSON.parse(report.commit_data), null, 2)}</pre>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
