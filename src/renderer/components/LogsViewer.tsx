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
      case 'ERROR': return '#ff6b6b';
      case 'WARN': return '#ffd43b';
      default: return '#57d2c9';
    }
  };

  return (
    <div className="logs-container">
      <div className="logs-header">
        <h3>System Activity Logs</h3>
        <button className="btn btn--danger btn--sm" onClick={onClear}>Clear Logs</button>
      </div>

      <div className="logs-filters">
        <div>
          <label>Category:</label>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label>Level:</label>
          <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}>
            {levels.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="logs-console">
        {filteredLogs.length === 0 ? (
          <p className="logs-console__empty">No logs matching filters.</p>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="log-line">
              <span className="log-line__time">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
              <span className="log-line__level" style={{ color: getLevelColor(log.level) }}>
                {log.level}
              </span>
              <span className="log-line__cat">[{log.category}]</span>
              <span className="log-line__msg">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
