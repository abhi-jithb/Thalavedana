import React, { useState } from 'react';
import type { 
  SettingsData, 
  RepositoryData 
} from '../../shared/api';

interface SettingsProps {
  settings: SettingsData;
  repos: RepositoryData[];
  saveSetting: (key: keyof SettingsData, value: string) => Promise<void>;
  addRepo: (path: string) => Promise<{ ok: boolean; name?: string; error?: string }>;
  removeRepo: (id: number) => Promise<void>;
  connectGmail: () => Promise<{ email: string }>;
  refreshAll: () => Promise<void>;
}

export default function Settings({
  settings,
  repos,
  saveSetting,
  addRepo,
  removeRepo,
  connectGmail,
  refreshAll,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'repos' | 'llm' | 'gmail' | 'excel' | 'scheduler'>('repos');

  // Repos local state
  const [repoPathInput, setRepoPathInput] = useState('');
  const [repoError, setRepoError] = useState('');
  const [repoLoading, setRepoLoading] = useState(false);

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

  // Excel local state
  const [excelPath, setExcelPath] = useState(settings.excelPath || '');
  const [excelSheetName, setExcelSheetName] = useState(settings.excelSheetName || '');
  const [sheetsList, setSheetsList] = useState<string[]>([]);
  const [columnsPreview, setColumnsPreview] = useState<string[]>([]);
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

  // Add Repository
  const handleAddRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    setRepoError('');
    if (!repoPathInput.trim()) return;

    setRepoLoading(true);
    try {
      const res = await addRepo(repoPathInput.trim());
      if (res.ok) {
        setRepoPathInput('');
        showSuccessMessage('Repository added successfully.');
      } else {
        setRepoError(res.error || 'Failed to add repository.');
      }
    } catch (err: any) {
      setRepoError(err.message || 'An error occurred.');
    } finally {
      setRepoLoading(false);
    }
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

  // Excel inspection
  const handleInspectExcel = async () => {
    setExcelError('');
    if (!excelPath.trim()) {
      setExcelError('Excel file path is required.');
      return;
    }

    setExcelInspecting(true);
    try {
      const meta = await window.thalavedana.inspectExcel(excelPath.trim());
      setSheetsList(meta.sheets);
      setColumnsPreview(meta.columnsPreview);
      if (meta.sheets.length > 0 && !excelSheetName) {
        setExcelSheetName(meta.sheets[0] || '');
      }
    } catch (err: any) {
      setExcelError(err.message || 'Failed to inspect Excel. Check path.');
    } finally {
      setExcelInspecting(false);
    }
  };

  // Save Excel configuration
  const handleSaveExcel = async () => {
    if (!excelPath.trim()) {
      setExcelError('Excel path is required.');
      return;
    }
    await saveSetting('excelPath', excelPath.trim());
    await saveSetting('excelSheetName', excelSheetName);
    await saveSetting('excelColumnMapping', JSON.stringify(mappings));
    showSuccessMessage('Excel settings saved.');
  };

  const handleUpdateMapping = (index: number, key: string, value: string) => {
    const updated = [...mappings];
    const item = updated[index];
    if (item) {
      updated[index] = { ...item, [key]: value } as any;
      setMappings(updated);
    }
  };

  // Save scheduler settings
  const handleSaveScheduler = async () => {
    await saveSetting('reportTime', reportTime);
    showSuccessMessage('Scheduler settings updated.');
  };

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <h2>Configuration Settings</h2>
        {saveSuccess && <span className="save-toast">{saveSuccess}</span>}
      </div>

      <nav className="settings-nav">
        <button className={`settings-nav__btn ${activeTab === 'repos' ? 'settings-nav__btn--active' : ''}`} onClick={() => setActiveTab('repos')}>Git Repos</button>
        <button className={`settings-nav__btn ${activeTab === 'llm' ? 'settings-nav__btn--active' : ''}`} onClick={() => setActiveTab('llm')}>LLM Provider</button>
        <button className={`settings-nav__btn ${activeTab === 'gmail' ? 'settings-nav__btn--active' : ''}`} onClick={() => setActiveTab('gmail')}>Gmail (OAuth)</button>
        <button className={`settings-nav__btn ${activeTab === 'excel' ? 'settings-nav__btn--active' : ''}`} onClick={() => setActiveTab('excel')}>Excel Sheet</button>
        <button className={`settings-nav__btn ${activeTab === 'scheduler' ? 'settings-nav__btn--active' : ''}`} onClick={() => setActiveTab('scheduler')}>Scheduler</button>
      </nav>

      <div className="settings-content">
        {activeTab === 'repos' && (
          <div>
            <h3>Git Repositories Scraped</h3>
            <p className="description">Manage the folders whose git commits are analyzed daily.</p>

            <form onSubmit={handleAddRepo} className="form-group row">
              <input 
                type="text" 
                placeholder="/home/user/Projects/web_client"
                value={repoPathInput}
                onChange={(e) => setRepoPathInput(e.target.value)}
                disabled={repoLoading}
              />
              <button type="submit" className="btn btn--primary" disabled={repoLoading}>
                {repoLoading ? 'Verifying...' : 'Add Repo'}
              </button>
            </form>
            {repoError && <p className="error-text">{repoError}</p>}

            <div className="repo-list" style={{ marginTop: '20px' }}>
              {repos.map((repo) => (
                <div key={repo.id} className="repo-item">
                  <div>
                    <strong>{repo.name}</strong>
                    <span className="repo-item__path">{repo.path}</span>
                  </div>
                  <button className="btn btn--danger btn--sm" onClick={() => removeRepo(repo.id)}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'llm' && (
          <div>
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

            <button className="btn btn--primary btn--lg" onClick={handleSaveLLM}>Save LLM Settings</button>
          </div>
        )}

        {activeTab === 'gmail' && (
          <div>
            <h3>Gmail OAuth Credentials & Recipients</h3>
            <p className="description">Review the OAuth tokens and edit the recipient list.</p>

            <div className="form-group row-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
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
            </div>

            {gmailError && <p className="error-text">{gmailError}</p>}

            <div className="auth-connection-status" style={{ marginBottom: '30px' }}>
              {settings.gmailUserEmail ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div className="success-banner" style={{ flexGrow: 1 }}>
                    Connected account: <strong>{settings.gmailUserEmail}</strong>
                  </div>
                  <button className="btn btn--secondary" onClick={handleConnectGmail}>Re-connect</button>
                </div>
              ) : (
                <button className="btn btn--accent btn--lg" onClick={handleConnectGmail} disabled={gmailLoading}>
                  {gmailLoading ? 'Awaiting authorization...' : 'Authorize Gmail Account'}
                </button>
              )}
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

            <h3>Email Delivery Targets</h3>
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

            <button className="btn btn--primary btn--lg" onClick={handleSaveRecipients}>Save Email Targets</button>
          </div>
        )}

        {activeTab === 'excel' && (
          <div>
            <h3>Excel Spreadsheet Reporting</h3>
            <p className="description">Ensure the workbook matches your daily tracking layout.</p>

            <form onSubmit={(e) => { e.preventDefault(); handleInspectExcel(); }} className="form-group row">
              <input 
                type="text" 
                placeholder="/home/user/Internship/tracker.xlsx"
                value={excelPath}
                onChange={(e) => setExcelPath(e.target.value)}
              />
              <button type="submit" className="btn btn--secondary" disabled={excelInspecting}>
                {excelInspecting ? 'Inspecting...' : 'Inspect Excel'}
              </button>
            </form>
            {excelError && <p className="error-text">{excelError}</p>}

            {(sheetsList.length > 0 || excelSheetName) && (
              <div className="excel-setup-box" style={{ marginTop: '20px' }}>
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

                <div className="mapping-table">
                  <h4>Column Configuration Mapping</h4>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Excel Col</th>
                        <th>Source Field</th>
                        <th>Fixed Text Value</th>
                        <th>Actions</th>
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
                              style={{ width: '60px', textAlign: 'center' }}
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
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button className="btn btn--secondary btn--sm" onClick={() => setMappings([...mappings, { col: '', type: 'empty', fixedValue: '' }])}>+ Add Column</button>
                    <button className="btn btn--primary btn--sm" onClick={handleSaveExcel}>Save Mapping & Path</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'scheduler' && (
          <div>
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

            <button className="btn btn--primary btn--lg" onClick={handleSaveScheduler}>Save Scheduler Settings</button>
          </div>
        )}
      </div>
    </div>
  );
}
