import { useState } from 'react';
import type { LogData } from '../../shared/api';

interface LogsViewerProps {
  logs: LogData[];
  onClear: () => Promise<void>;
}

export default function LogsViewer({ logs, onClear }: LogsViewerProps) {
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterLevel, setFilterLevel] = useState<string>('ALL');

  const categories = ['ALL', 'SYSTEM', 'GIT', 'LLM', 'GMAIL', 'EXCEL', 'SCHEDULER'];
  const levels = ['ALL', 'INFO', 'WARN', 'ERROR'];

  const filteredLogs = logs.filter((log) => {
    const categoryMatch = filterCategory === 'ALL' || log.category === filterCategory;
    const levelMatch = filterLevel === 'ALL' || log.level === filterLevel;
    return categoryMatch && levelMatch;
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

  return (
    <div className="logs-container">
      <div className="logs-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 className="page-title">Activity Logs</h2>
          <p className="page-subtitle">Inspect background scheduler executions and engine messages.</p>
        </div>
        <button className="btn btn--danger btn--sm" onClick={onClear}>Clear Logs</button>
      </div>

      <div className="logs-filters" style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
        <div>
          <label style={{ marginRight: '8px', fontSize: '12px', fontWeight: '600' }}>Category</label>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={{ marginRight: '8px', fontSize: '12px', fontWeight: '600' }}>Severity</label>
          <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}>
            {levels.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="logs-console" style={{ height: 'calc(100vh - 220px)', minHeight: '380px' }}>
        {filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            {/* Cute log prompt doodle */}
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#D4D4D4', marginBottom: '12px' }}>
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <p className="dimmed">No logs logged matching current filters.</p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="log-line">
              <span className="log-line__time">
                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span 
                className="status-pill" 
                style={{ 
                  backgroundColor: getLevelBg(log.level), 
                  color: getLevelColor(log.level),
                  padding: '1px 6px',
                  fontSize: '9px',
                  marginRight: '8px',
                  border: 'none',
                  verticalAlign: 'middle'
                }}
              >
                {log.level}
              </span>
              <span className="log-line__cat" style={{ color: 'var(--text-muted)' }}>[{log.category}]</span>
              <span className="log-line__msg">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
