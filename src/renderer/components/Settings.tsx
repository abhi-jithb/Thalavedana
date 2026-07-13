import React, { useState } from 'react';
import type { SettingsData } from '../../shared/api';

interface SettingsProps {
  settings: SettingsData;
  saveSetting: (key: keyof SettingsData, value: string) => Promise<void>;
  connectGmail: () => Promise<{ email: string }>;
  refreshAll: () => Promise<void>;
}

export default function Settings({
  settings,
  saveSetting,
  connectGmail,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'llm' | 'gmail' | 'excel' | 'scheduler'>('llm');

  // LLM local state
  const [llmProvider, setLlmProvider] = useState(settings.llmProvider || 'gemini');
  const [geminiApiKey, setGeminiApiKey] = useState(settings.geminiApiKey || '');
  const [llmModel, setLlmModel] = useState(settings.llmModel || '');
  const [llmEndpoint, setLlmEndpoint] = useState(settings.llmEndpoint || '');

  // Gmail local state
  const [gmailClientId, setGmailClientId] = useState(settings.gmailClientId || '');
  const [gmailClientSecret, setGmailClientSecret] = useState(settings.gmailClientSecret || '');
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailError, setGmailError] = useState('');

  // Recipients
  const [emailTo, setEmailTo] = useState(settings.emailTo || '');
  const [emailCc, setEmailCc] = useState(settings.emailCc || '');
  const [emailBcc, setEmailBcc] = useState(settings.emailBcc || '');

  // Google Sheet state
  const [excelPath, setExcelPath] = useState(settings.excelPath || ''); // Google Sheet URL
  const [excelSheetName, setExcelSheetName] = useState(settings.excelSheetName || '');
  const [sheetsList, setSheetsList] = useState<string[]>([]);
  const [columnsPreview, setColumnsPreview] = useState<string[]>([]);
  const [spreadsheetTitle, setSpreadsheetTitle] = useState('');
  const [excelError, setExcelError] = useState('');
  const [excelInspecting, setExcelInspecting] = useState(false);
  const [mappings, setMappings] = useState<Array<{ col: string; type: string; fixedValue: string }>>(() => {
    if (settings.excelColumnMapping) {
      try {
        return JSON.parse(settings.excelColumnMapping);
      } catch (e) {}
    }
    return [
      { col: 'A', type: 'date', fixedValue: '' },
      { col: 'B', type: 'report', fixedValue: '' },
      { col: 'C', type: 'repositories', fixedValue: '' },
    ];
  });

  // Schedule Time
  const [reportTime, setReportTime] = useState(settings.reportTime || '17:30');

  // Success notifications
  const [saveSuccess, setSaveSuccess] = useState('');

  const showSuccessMessage = (msg: string) => {
    setSaveSuccess(msg);
    setTimeout(() => setSaveSuccess(''), 3000);
  };

  // Save LLM configuration
  const handleSaveLLM = async () => {
    await saveSetting('llmProvider', llmProvider);
    await saveSetting('geminiApiKey', geminiApiKey);
    await saveSetting('llmModel', llmModel);
    await saveSetting('llmEndpoint', llmEndpoint);
    showSuccessMessage('LLM settings saved.');
  };

  // Save Gmail and connect
  const handleConnectGmail = async () => {
    setGmailError('');
    if (!gmailClientId.trim() || !gmailClientSecret.trim()) {
      setGmailError('OAuth Client ID and Secret are required.');
      return;
    }

    setGmailLoading(true);
    try {
      await saveSetting('gmailClientId', gmailClientId.trim());
      await saveSetting('gmailClientSecret', gmailClientSecret.trim());
      await connectGmail();
      showSuccessMessage('Gmail authenticated successfully.');
    } catch (err: any) {
      setGmailError(err.message || 'OAuth authentication failed.');
    } finally {
      setGmailLoading(false);
    }
  };

  const handleSaveRecipients = async () => {
    await saveSetting('emailTo', emailTo);
    await saveSetting('emailCc', emailCc);
    await saveSetting('emailBcc', emailBcc);
    showSuccessMessage('Recipients settings updated.');
  };

  // Google Sheets detection
  const detectColumnMappings = (columns: string[]) => {
    const result: Array<{ col: string; type: string; fixedValue: string }> = [];
    columns.forEach(colStr => {
      const parts = colStr.split(': ');
      const colLetter = parts[0]?.trim();
      const colHeader = parts.slice(1).join(': ').trim().toLowerCase();
      
      if (!colLetter) return;

      if (['date', 'datum', 'day'].some(k => colHeader.includes(k))) {
        result.push({ col: colLetter, type: 'date', fixedValue: '' });
      } else if (['report', 'summary', 'work', 'daily report', 'work report', 'details', 'tasks', 'description', 'activity'].some(k => colHeader.includes(k))) {
        result.push({ col: colLetter, type: 'report', fixedValue: '' });
      } else if (['repositories', 'repo', 'project', 'location', 'git'].some(k => colHeader.includes(k))) {
        result.push({ col: colLetter, type: 'repositories', fixedValue: '' });
      } else {
        result.push({ col: colLetter, type: 'empty', fixedValue: '' });
      }
    });

    return result.length > 0 ? result : [
      { col: 'A', type: 'date', fixedValue: '' },
      { col: 'B', type: 'report', fixedValue: '' },
      { col: 'C', type: 'repositories', fixedValue: '' }
    ];
  };

  // Google Sheets inspection
  const handleInspectExcel = async () => {
    setExcelError('');
    setSpreadsheetTitle('');
    setSheetsList([]);
    setColumnsPreview([]);
    if (!excelPath.trim()) {
      setExcelError('Google Spreadsheet URL or ID is required.');
      return;
    }

    setExcelInspecting(true);
    try {
      const meta = await window.thalavedana.inspectExcel(excelPath.trim());
      setSpreadsheetTitle(meta.title || 'Google Sheet');
      setSheetsList(meta.sheets);
      setColumnsPreview(meta.columnsPreview);
      if (meta.sheets.length > 0 && !excelSheetName) {
        setExcelSheetName(meta.sheets[0] || '');
      }

      // Auto map
      const autoMappings = detectColumnMappings(meta.columnsPreview);
      setMappings(autoMappings);
    } catch (err: any) {
      setExcelError(err.message || 'Failed to inspect Google Sheet. Verify URL and make sure Gmail/OAuth is fully authenticated.');
    } finally {
      setExcelInspecting(false);
    }
  };

  // Save Excel configuration
  const handleSaveExcel = async () => {
    if (!excelPath.trim()) {
      setExcelError('Spreadsheet URL is required.');
      return;
    }
    await saveSetting('excelPath', excelPath.trim());
    await saveSetting('excelSheetName', excelSheetName);
    await saveSetting('excelColumnMapping', JSON.stringify(mappings));
    showSuccessMessage('Google Sheet settings saved.');
  };

  const handleUpdateMapping = (index: number, key: string, value: string) => {
    const updated = [...mappings];
    const item = updated[index];
    if (item) {
      updated[index] = { ...item, [key]: value } as any;
      setMappings(updated);
    }
  };

  const handleAddMappingRow = () => {
    const lastCol = mappings[mappings.length - 1]?.col || '@';
    const nextCol = String.fromCharCode(lastCol.charCodeAt(0) + 1);
    setMappings([...mappings, { col: nextCol, type: 'empty', fixedValue: '' }]);
  };

  const handleRemoveMappingRow = (index: number) => {
    setMappings(mappings.filter((_, i) => i !== index));
  };

  // Save scheduler settings
  const handleSaveScheduler = async () => {
    await saveSetting('reportTime', reportTime);
    showSuccessMessage('Scheduler settings updated.');
  };

  const hasDateMapping = mappings.some(m => m.type === 'date');
  const hasReportMapping = mappings.some(m => m.type === 'report');
  const mappingValidationError = !hasDateMapping || !hasReportMapping
    ? 'Please map at least one column to "Report Date" and one to "Work Report Summary".'
    : '';

  return (
    <div className="settings-page" style={{ maxWidth: '680px' }}>
      <div className="settings-page__header">
        <div>
          <h2 className="page-title">Settings</h2>
          <p className="page-subtitle">Configure credentials, spreadsheet maps, schedules, and targets.</p>
        </div>
        {saveSuccess && <span className="save-toast">{saveSuccess}</span>}
      </div>

      <nav className="settings-nav">
        <button className={`settings-nav__btn ${activeTab === 'llm' ? 'settings-nav__btn--active' : ''}`} onClick={() => setActiveTab('llm')}>LLM Provider</button>
        <button className={`settings-nav__btn ${activeTab === 'gmail' ? 'settings-nav__btn--active' : ''}`} onClick={() => setActiveTab('gmail')}>Gmail (OAuth)</button>
        <button className={`settings-nav__btn ${activeTab === 'excel' ? 'settings-nav__btn--active' : ''}`} onClick={() => setActiveTab('excel')}>Google Sheet</button>
        <button className={`settings-nav__btn ${activeTab === 'scheduler' ? 'settings-nav__btn--active' : ''}`} onClick={() => setActiveTab('scheduler')}>Scheduler</button>
      </nav>

      <div className="settings-content">
        {activeTab === 'llm' && (
          <div className="card">
            <h3>LLM Generation Engine</h3>
            <p className="description">Choose between Google Gemini or OpenAI compatible providers.</p>

            <div className="form-field">
              <label>LLM Provider</label>
              <select value={llmProvider} onChange={(e) => setLlmProvider(e.target.value)}>
                <option value="gemini">Google Gemini (Native API)</option>
                <option value="openai-compatible">OpenAI-Compatible (e.g. Groq, local models)</option>
              </select>
            </div>

            <div className="form-field">
              <label>API Key</label>
              <input 
                type="password" 
                placeholder="Paste API key here..."
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Model Name</label>
              <input 
                type="text" 
                placeholder={llmProvider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini'}
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
              />
            </div>

            {llmProvider === 'openai-compatible' && (
              <div className="form-field">
                <label>Endpoint URL</label>
                <input 
                  type="text" 
                  placeholder="https://api.openai.com/v1/chat/completions"
                  value={llmEndpoint}
                  onChange={(e) => setLlmEndpoint(e.target.value)}
                />
              </div>
            )}

            <button className="btn btn--primary" style={{ marginTop: '8px' }} onClick={handleSaveLLM}>Save LLM Settings</button>
          </div>
        )}

        {activeTab === 'gmail' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="card">
              <h3>Gmail OAuth Credentials</h3>
              <p className="description">Review details for Google OAuth listener loopback.</p>

              <div className="form-field">
                <label>OAuth Client ID</label>
                <input 
                  type="text" 
                  placeholder="Paste Google Client ID..."
                  value={gmailClientId}
                  onChange={(e) => setGmailClientId(e.target.value)}
                />
              </div>
              
              <div className="form-field">
                <label>OAuth Client Secret</label>
                <input 
                  type="password" 
                  placeholder="Paste Client Secret..."
                  value={gmailClientSecret}
                  onChange={(e) => setGmailClientSecret(e.target.value)}
                />
              </div>

              {gmailError && <p className="error-text" style={{ marginBottom: '12px' }}>{gmailError}</p>}

              <div className="auth-connection-status">
                {settings.gmailUserEmail ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="success-banner" style={{ flexGrow: 1 }}>
                      Connected account: <strong>{settings.gmailUserEmail}</strong>
                    </div>
                    <button className="btn btn--secondary" onClick={handleConnectGmail}>Re-connect</button>
                  </div>
                ) : (
                  <button className="btn btn--primary" onClick={handleConnectGmail} disabled={gmailLoading}>
                    {gmailLoading ? 'Awaiting authorization...' : 'Authorize Gmail Account'}
                  </button>
                )}
              </div>
            </div>

            <div className="card">
              <h3>Email Delivery Targets</h3>
              <p className="description">Edit default recipient and copy addresses.</p>

              <div className="form-field">
                <label>To (Recipients, comma-separated)</label>
                <input 
                  type="text" 
                  placeholder="manager@org.com, supervisor@org.com"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label>Cc (Carbon Copy)</label>
                <input 
                  type="text" 
                  placeholder="internship@org.com"
                  value={emailCc}
                  onChange={(e) => setEmailCc(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label>Bcc (Blind Carbon Copy)</label>
                <input 
                  type="text" 
                  placeholder="backup@gmail.com"
                  value={emailBcc}
                  onChange={(e) => setEmailBcc(e.target.value)}
                />
              </div>

              <button className="btn btn--primary" onClick={handleSaveRecipients}>Save Email Targets</button>
            </div>
          </div>
        )}

        {activeTab === 'excel' && (
          <div className="card">
            <h3>Google Spreadsheet Reporting</h3>
            <p className="description">Ensure the workbook matches your daily tracking layout.</p>

            <form onSubmit={(e) => { e.preventDefault(); handleInspectExcel(); }} className="form-group row" style={{ marginBottom: '16px' }}>
              <input 
                type="text" 
                placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                value={excelPath}
                onChange={(e) => setExcelPath(e.target.value)}
              />
              <button type="submit" className="btn btn--secondary" disabled={excelInspecting}>
                {excelInspecting ? 'Verifying...' : 'Verify Spreadsheet'}
              </button>
            </form>
            {excelError && <p className="error-text" style={{ marginBottom: '16px' }}>{excelError}</p>}

            {sheetsList.length > 0 && (
              <div className="excel-setup-box" style={{ marginTop: '16px', padding: 0, border: 'none' }}>
                <div style={{ marginBottom: '16px', background: 'var(--success-bg)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--success-border)', color: 'var(--success-text)', fontSize: '13px' }}>
                  Spreadsheet Title: <strong>{spreadsheetTitle}</strong>
                </div>

                <div className="form-field">
                  <label>Worksheet Name</label>
                  <select value={excelSheetName} onChange={(e) => setExcelSheetName(e.target.value)}>
                    {sheetsList.map(s => <option key={s} value={s}>{s}</option>)}
                    {!sheetsList.includes(excelSheetName) && excelSheetName && <option value={excelSheetName}>{excelSheetName}</option>}
                  </select>
                </div>

                {columnsPreview.length > 0 && (
                  <div className="excel-columns-preview">
                    <strong>Header Rows Preview:</strong>
                    <div className="preview-tags">
                      {columnsPreview.map((c, i) => (
                        <span key={i} className="preview-tag">{c}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mapping-table" style={{ marginTop: '24px' }}>
                  <h4>Column Configuration Mapping</h4>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Col</th>
                        <th>Source Field</th>
                        <th>Fixed Value</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappings.map((m, i) => (
                        <tr key={i}>
                          <td>
                            <input 
                              type="text" 
                              value={m.col} 
                              onChange={(e) => handleUpdateMapping(i, 'col', e.target.value.toUpperCase())}
                              style={{ width: '50px', padding: '6px', textAlign: 'center' }}
                            />
                          </td>
                          <td>
                            <select 
                              value={m.type} 
                              onChange={(e) => handleUpdateMapping(i, 'type', e.target.value)}
                            >
                              <option value="date">Report Date (YYYY-MM-DD)</option>
                              <option value="report">LLM Work Report Summary</option>
                              <option value="repositories">Configured Repositories</option>
                              <option value="fixed">Fixed Static String</option>
                              <option value="empty">Leave Cell Blank</option>
                            </select>
                          </td>
                          <td>
                            {m.type === 'fixed' ? (
                              <input 
                                type="text" 
                                placeholder="Fixed string..."
                                value={m.fixedValue}
                                onChange={(e) => handleUpdateMapping(i, 'fixedValue', e.target.value)}
                                style={{ width: '120px', padding: '6px' }}
                              />
                            ) : (
                              <span className="dimmed">Not applicable</span>
                            )}
                          </td>
                          <td>
                            <button className="btn btn--danger btn--sm" onClick={() => setMappings(mappings.filter((_, idx) => idx !== i))}>Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {mappingValidationError && (
                    <div className="error-banner" style={{ marginTop: '16px', marginBottom: '16px' }}>
                      {mappingValidationError}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                    <button className="btn btn--secondary btn--sm" onClick={() => setMappings([...mappings, { col: '', type: 'empty', fixedValue: '' }])}>+ Add Column</button>
                    <button 
                      className="btn btn--primary btn--sm" 
                      onClick={handleSaveExcel}
                      disabled={!!mappingValidationError}
                    >
                      Save Mapping & URL
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'scheduler' && (
          <div className="card">
            <h3>Scheduler Configurations</h3>
            <p className="description">Execution settings for automatic generation.</p>

            <div className="form-field" style={{ maxWidth: '200px' }}>
              <label>Daily Scheduled Report Time</label>
              <input 
                type="time" 
                value={reportTime} 
                onChange={(e) => setReportTime(e.target.value)}
              />
            </div>

            <button className="btn btn--primary" onClick={handleSaveScheduler}>Save Scheduler Settings</button>
          </div>
        )}
      </div>
    </div>
  );
}
