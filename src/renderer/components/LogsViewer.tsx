import { useState } from 'react';
import type { LogData, ReportData } from '../../shared/api';

interface LogsViewerProps {
  logs: LogData[];
  reports: ReportData[];
  onClear: () => Promise<void>;
}

export default function LogsViewer({ logs, reports, onClear }: LogsViewerProps) {
  const [activeTab, setActiveTab] = useState<'executions' | 'technical'>('executions');
  
  // Technical logs filters
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Expanded executions state
  const [expandedExecutions, setExpandedExecutions] = useState<Record<number, boolean>>({});

  const categories = ['ALL', 'SYSTEM', 'GIT', 'LLM', 'GMAIL', 'EXCEL', 'SCHEDULER'];
  const levels = ['ALL', 'INFO', 'WARN', 'ERROR'];

  // Filter technical logs
  const filteredLogs = logs.filter((log) => {
    const categoryMatch = filterCategory === 'ALL' || log.category === filterCategory;
    const levelMatch = filterLevel === 'ALL' || log.level === filterLevel;
    const searchMatch = searchQuery.trim() === '' || 
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.category.toLowerCase().includes(searchQuery.toLowerCase());
    return categoryMatch && levelMatch && searchMatch;
  });

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return 'var(--danger-text)';
      case 'WARN': return 'var(--warning-text)';
      default: return 'var(--text-muted)';
    }
  };

  const getLevelBg = (level: string) => {
    switch (level) {
      case 'ERROR': return 'var(--danger-bg)';
      case 'WARN': return 'var(--warning-bg)';
      default: return 'var(--accent-light)';
    }
  };

  const toggleExecution = (id: number) => {
    setExpandedExecutions(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Parse email_content JSON for execution metrics
  const parseExecutionMetadata = (report: ReportData) => {
    try {
      const parsed = JSON.parse(report.email_content);
      return {
        subject: parsed.subject || '',
        body: parsed.body || '',
        remarks: parsed.remarks || '',
        meetingDetails: parsed.meetingDetails || '',
        providerUsed: parsed.providerUsed || 'Gemini',
        recoveryActions: parsed.recoveryActions || [],
        warnings: parsed.warnings || [],
        durationMs: parsed.durationMs || 0,
        reposScanned: parsed.reposScanned || [],
        commitsProcessed: parsed.commitsProcessed !== undefined ? parsed.commitsProcessed : 0,
        timestamp: parsed.timestamp || report.created_at
      };
    } catch (e) {
      // Fallback values if JSON parsing fails or legacy report
      return {
        subject: '',
        body: '',
        remarks: '',
        meetingDetails: '',
        providerUsed: 'Gemini',
        recoveryActions: [],
        warnings: report.error_message ? [report.error_message] : [],
        durationMs: 0,
        reposScanned: [],
        commitsProcessed: 0,
        timestamp: report.created_at
      };
    }
  };

  const formatDuration = (ms: number) => {
    if (!ms) return 'N/A';
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="logs-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="logs-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 className="page-title" style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>Activity Logs</h2>
          <p className="page-subtitle" style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            Monitor and review pipeline execution diagnostics.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className="btn btn--secondary btn--sm" 
            style={{ 
              backgroundColor: activeTab === 'executions' ? 'var(--accent-light)' : 'transparent',
              color: activeTab === 'executions' ? 'var(--accent)' : 'var(--text-muted)',
              border: '1px solid var(--border-light)',
              fontWeight: 600
            }}
            onClick={() => setActiveTab('executions')}
          >
            Executions
          </button>
          <button 
            className="btn btn--secondary btn--sm" 
            style={{ 
              backgroundColor: activeTab === 'technical' ? 'var(--accent-light)' : 'transparent',
              color: activeTab === 'technical' ? 'var(--accent)' : 'var(--text-muted)',
              border: '1px solid var(--border-light)',
              fontWeight: 600
            }}
            onClick={() => setActiveTab('technical')}
          >
            Technical Logs
          </button>
          <button className="btn btn--danger btn--sm" onClick={onClear}>Clear System Logs</button>
        </div>
      </div>

      {activeTab === 'executions' ? (
        // Execution Logs View
        <div className="executions-view" style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
          {reports.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', border: '1px dashed var(--border-light)', borderRadius: '12px' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ marginBottom: '12px', opacity: 0.6 }}>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>No executions have run yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {reports.map((report) => {
                const meta = parseExecutionMetadata(report);
                const isExpanded = !!expandedExecutions[report.id];
                const hasRecoveries = meta.recoveryActions.length > 0;
                const hasErrors = report.excel_status === 'failed' || report.email_status === 'failed' || report.error_message;

                // Determine Status Badge
                let statusLabel = 'Success';
                let statusColor = 'var(--success-text)';
                let statusBg = 'var(--success-bg)';
                
                if (hasErrors) {
                  statusLabel = 'Critical';
                  statusColor = 'var(--danger-text)';
                  statusBg = 'var(--danger-bg)';
                } else if (hasRecoveries) {
                  statusLabel = 'Recovered';
                  statusColor = 'var(--warning-text)';
                  statusBg = 'var(--warning-bg)';
                }

                return (
                  <div 
                    key={report.id} 
                    style={{
                      border: '1px solid var(--border-light)',
                      borderRadius: '10px',
                      background: '#FFFFFF',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Collapsed Header Bar */}
                    <div 
                      onClick={() => toggleExecution(report.id)}
                      style={{
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                      className="execution-header-row"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {/* Status Dot */}
                        <div style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: statusLabel === 'Critical' ? 'var(--danger)' : statusLabel === 'Recovered' ? 'var(--warning)' : 'var(--success)'
                        }} />
                        
                        <div>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)' }}>
                            {new Date(meta.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(meta.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <div style={{ display: 'flex', gap: '8px', marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                            <span>Duration: {formatDuration(meta.durationMs)}</span>
                            <span>•</span>
                            <span>{meta.commitsProcessed} Commits Scanned</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span 
                          style={{
                            padding: '4px 10px',
                            borderRadius: '20px',
                            fontSize: '11px',
                            fontWeight: '600',
                            color: statusColor,
                            backgroundColor: statusBg
                          }}
                        >
                          {statusLabel}
                        </span>
                        
                        {/* Caret icon */}
                        <svg 
                          width="16" 
                          height="16" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="var(--text-muted)" 
                          strokeWidth="2.5" 
                          style={{ 
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s ease'
                          }}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded Detail Panel */}
                    {isExpanded && (
                      <div style={{ padding: '0 20px 20px 20px', borderTop: '1px solid var(--border-light)', backgroundColor: '#FAFAFA' }}>
                        
                        {/* Summary Grid */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                          gap: '16px',
                          padding: '16px 0',
                          borderBottom: '1px solid var(--border-light)'
                        }}>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Provider Used</span>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', marginTop: '4px' }}>
                              {meta.providerUsed}
                            </div>
                          </div>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Spreadsheet Sync</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                              <span style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: report.excel_status === 'updated' ? 'var(--success)' : report.excel_status === 'failed' ? 'var(--danger)' : 'var(--text-muted)'
                              }} />
                              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                                {report.excel_status === 'updated' ? 'Updated' : report.excel_status === 'failed' ? 'Failed' : 'Skipped'}
                              </span>
                            </div>
                          </div>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Email Delivery</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                              <span style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: report.email_status === 'sent' ? 'var(--success)' : report.email_status === 'failed' ? 'var(--danger)' : 'var(--text-muted)'
                              }} />
                              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                                {report.email_status === 'sent' ? 'Delivered' : report.email_status === 'failed' ? 'Failed' : 'Skipped'}
                              </span>
                            </div>
                          </div>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Repos Scanned</span>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {meta.reposScanned.length > 0 ? meta.reposScanned.join(', ') : 'None'}
                            </div>
                          </div>
                        </div>

                        {/* Diagnostics & Logs Detail */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                          
                          {/* Recovery Actions Timeline */}
                          <div>
                            <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)' }}>Recovery Actions & Healing Timeline</span>
                            <div style={{ 
                              marginTop: '8px', 
                              backgroundColor: '#FFFFFF', 
                              border: '1px solid var(--border-light)', 
                              borderRadius: '8px', 
                              padding: '12px 16px' 
                            }}>
                              {meta.recoveryActions.length === 0 ? (
                                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                                  ✓ Execution ran perfectly. No recovery actions or fallbacks were needed.
                                </p>
                              ) : (
                                <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {meta.recoveryActions.map((action: string, idx: number) => (
                                    <li key={idx} style={{ fontSize: '12px', color: 'var(--text-main)', lineHeight: '1.4' }}>
                                      {action}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>

                          {/* Warnings & Non-blocking diagnostics */}
                          {meta.warnings.length > 0 && (
                            <div>
                              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--warning-text)' }}>Warnings</span>
                              <div style={{ 
                                marginTop: '8px', 
                                backgroundColor: 'var(--warning-bg)', 
                                border: '1px solid var(--warning-text)', 
                                borderRadius: '8px', 
                                padding: '12px 16px' 
                              }}>
                                <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {meta.warnings.map((warn: string, idx: number) => (
                                    <li key={idx} style={{ fontSize: '12px', color: 'var(--warning-text)', lineHeight: '1.4' }}>
                                      {warn}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}

                          {/* Error block if failed */}
                          {report.error_message && (
                            <div>
                              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--danger-text)' }}>Pipeline Error Response</span>
                              <div style={{ 
                                marginTop: '8px', 
                                backgroundColor: 'var(--danger-bg)', 
                                border: '1px solid var(--danger)', 
                                borderRadius: '8px', 
                                padding: '12px 16px',
                                fontFamily: 'monospace',
                                fontSize: '11px',
                                color: 'var(--danger-text)',
                                whiteSpace: 'pre-wrap'
                              }}>
                                {report.error_message}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        // Technical Log Console
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {/* Filters Bar */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginBottom: '16px',
            backgroundColor: '#FFFFFF',
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid var(--border-light)',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <label style={{ marginRight: '6px', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Category</label>
                <select 
                  value={filterCategory} 
                  onChange={(e) => setFilterCategory(e.target.value)}
                  style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ marginRight: '6px', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Severity</label>
                <select 
                  value={filterLevel} 
                  onChange={(e) => setFilterLevel(e.target.value)}
                  style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                >
                  {levels.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: '200px' }}>
              <input
                type="text"
                placeholder="Search engine messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '6px 12px', 
                  fontSize: '12px', 
                  borderRadius: '6px', 
                  border: '1px solid var(--border-light)' 
                }}
              />
            </div>
          </div>

          {/* Console Output */}
          <div className="logs-console" style={{ flex: 1, minHeight: '380px' }}>
            {filteredLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: '#D4D4D4', marginBottom: '12px' }}>
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No logs match the current filters.</p>
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className="log-line" style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid #F0F0F0', fontFamily: 'monospace', fontSize: '12px' }}>
                  <span className="log-line__time" style={{ color: 'var(--text-muted)', marginRight: '12px', whiteSpace: 'nowrap' }}>
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span 
                    className="status-pill" 
                    style={{ 
                      backgroundColor: getLevelBg(log.level), 
                      color: getLevelColor(log.level),
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '9px',
                      fontWeight: 'bold',
                      marginRight: '12px',
                      minWidth: '55px',
                      textAlign: 'center'
                    }}
                  >
                    {log.level}
                  </span>
                  <span className="log-line__cat" style={{ color: 'var(--accent)', fontWeight: 600, marginRight: '8px', minWidth: '80px' }}>
                    [{log.category}]
                  </span>
                  <span className="log-line__msg" style={{ color: 'var(--text-main)', wordBreak: 'break-all' }}>{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
