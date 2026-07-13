import React, { useState } from 'react';
import type { SettingsData, RepositoryData } from '../../shared/api';

interface SetupWizardProps {
  settings: SettingsData;
  repos: RepositoryData[];
  saveSetting: (key: keyof SettingsData, value: string) => Promise<void>;
  addRepo: (path: string) => Promise<{ ok: boolean; name?: string; error?: string }>;
  removeRepo: (id: number) => Promise<void>;
  connectGmail: () => Promise<{ email: string }>;
  refreshAll: () => Promise<void>;
}

export default function SetupWizard({
  settings,
  repos,
  saveSetting,
  addRepo,
  removeRepo,
  connectGmail,
  refreshAll,
}: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [repoPathInput, setRepoPathInput] = useState('');
  const [repoError, setRepoError] = useState('');
  const [repoLoading, setRepoLoading] = useState(false);

  // LLM State
  const [llmProvider, setLlmProvider] = useState(settings.llmProvider || 'gemini');
  const [geminiApiKey, setGeminiApiKey] = useState(settings.geminiApiKey || '');
  const [llmModel, setLlmModel] = useState(settings.llmModel || '');
  const [llmEndpoint, setLlmEndpoint] = useState(settings.llmEndpoint || '');

  // Gmail OAuth State
  const [gmailClientId, setGmailClientId] = useState(settings.gmailClientId || '');
  const [gmailClientSecret, setGmailClientSecret] = useState(settings.gmailClientSecret || '');
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailError, setGmailError] = useState('');

  // Recipients
  const [emailTo, setEmailTo] = useState(settings.emailTo || '');
  const [emailCc, setEmailCc] = useState(settings.emailCc || '');
  const [emailBcc, setEmailBcc] = useState(settings.emailBcc || '');

  // Google Sheet State
  const [excelPath, setExcelPath] = useState(settings.excelPath || ''); // We store Google Sheet URL in excelPath
  const [excelSheetName, setExcelSheetName] = useState(settings.excelSheetName || '');
  const [sheetsList, setSheetsList] = useState<string[]>([]);
  const [columnsPreview, setColumnsPreview] = useState<string[]>([]);
  const [spreadsheetTitle, setSpreadsheetTitle] = useState('');
  const [excelError, setExcelError] = useState('');
  const [excelInspecting, setExcelInspecting] = useState(false);
  
  // Custom column mapping states
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

  // Time
  const [reportTime, setReportTime] = useState(settings.reportTime || '17:30');

  // Step 1: Add Git Repository
  const handleAddRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    setRepoError('');
    if (!repoPathInput.trim()) return;

    setRepoLoading(true);
    try {
      const res = await addRepo(repoPathInput.trim());
      if (res.ok) {
        setRepoPathInput('');
      } else {
        setRepoError(res.error || 'Failed to add repository.');
      }
    } catch (err: any) {
      setRepoError(err.message || 'An error occurred.');
    } finally {
      setRepoLoading(false);
    }
  };

  // Step 2: Save LLM settings
  const handleSaveLLM = async () => {
    await saveSetting('llmProvider', llmProvider);
    await saveSetting('geminiApiKey', geminiApiKey);
    await saveSetting('llmModel', llmModel);
    await saveSetting('llmEndpoint', llmEndpoint);
    setCurrentStep(3);
  };

  // Step 3: Gmail Connect
  const handleConnectGmail = async () => {
    setGmailError('');
    if (!gmailClientId.trim() || !gmailClientSecret.trim()) {
      setGmailError('OAuth Client ID and Client Secret are required.');
      return;
    }

    setGmailLoading(true);
    try {
      await saveSetting('gmailClientId', gmailClientId.trim());
      await saveSetting('gmailClientSecret', gmailClientSecret.trim());
      await connectGmail();
    } catch (err: any) {
      setGmailError(err.message || 'OAuth authentication failed.');
    } finally {
      setGmailLoading(false);
    }
  };

  // Step 4: Save Recipients
  const handleSaveRecipients = async () => {
    await saveSetting('emailTo', emailTo);
    await saveSetting('emailCc', emailCc);
    await saveSetting('emailBcc', emailBcc);
    setCurrentStep(5);
  };

  // Step 5: Google Sheets auto mapping detection
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

  // Step 5: Google Sheet verification
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

      // Automatically map columns
      const autoMappings = detectColumnMappings(meta.columnsPreview);
      setMappings(autoMappings);
    } catch (err: any) {
      setExcelError(err.message || 'Failed to inspect Google Sheet. Verify URL and make sure your Google account is fully authorized.');
    } finally {
      setExcelInspecting(false);
    }
  };

  // Save Google Sheet Column Mapping
  const handleSaveExcel = async () => {
    if (!excelPath.trim()) {
      setExcelError('Google Sheet URL or ID is required.');
      return;
    }
    await saveSetting('excelPath', excelPath.trim());
    await saveSetting('excelSheetName', excelSheetName);
    await saveSetting('excelColumnMapping', JSON.stringify(mappings));
    setCurrentStep(6);
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

  // Step 6: Complete Wizard
  const handleCompleteSetup = async () => {
    await saveSetting('reportTime', reportTime);
    await saveSetting('setupCompleted', 'true');
    await refreshAll();
  };

  // Verification helper for column mappings
  const hasDateMapping = mappings.some(m => m.type === 'date');
  const hasReportMapping = mappings.some(m => m.type === 'report');
  const mappingValidationError = !hasDateMapping || !hasReportMapping
    ? 'Please map at least one column to "Report Date" and one to "Work Report Summary".'
    : '';

  return (
    <div className="wizard">
      <div className="wizard__progress">
        {[1, 2, 3, 4, 5, 6].map((step) => (
          <div 
            key={step} 
            className={`wizard__dot ${step === currentStep ? 'wizard__dot--active' : ''} ${step < currentStep ? 'wizard__dot--complete' : ''}`}
            onClick={() => step < currentStep && setCurrentStep(step)}
          >
            {step}
          </div>
        ))}
      </div>

      <div className="wizard__content card">
        {currentStep === 1 && (
          <div>
            <h2>Select Git Repositories</h2>
            <p className="wizard__tip">
              Add the absolute paths to the local Git repositories you wish to scan.
            </p>

            <form onSubmit={handleAddRepo} className="form-group row">
              <input 
                type="text" 
                placeholder="e.g. /home/username/Projects/my-app"
                value={repoPathInput}
                onChange={(e) => setRepoPathInput(e.target.value)}
                disabled={repoLoading}
              />
              <button type="submit" className="btn btn--primary" disabled={repoLoading}>
                {repoLoading ? 'Verifying...' : 'Add'}
              </button>
            </form>
            {repoError && <p className="error-text">{repoError}</p>}

            <div className="repo-list">
              <h4>Configured Repositories ({repos.length})</h4>
              {repos.length === 0 ? (
                <p className="repo-list__empty">No repositories added yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {repos.map((repo) => (
                    <div key={repo.id} className="repo-item" style={{ margin: 0 }}>
                      <div>
                        <strong>{repo.name}</strong>
                        <span className="repo-item__path">{repo.path}</span>
                      </div>
                      <button className="btn btn--danger btn--sm" onClick={() => removeRepo(repo.id)}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="wizard__actions">
              <div />
              <button 
                className="btn btn--primary" 
                onClick={() => setCurrentStep(2)}
                disabled={repos.length === 0}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div>
            <h2>Configure Gemini API Key</h2>
            <p className="wizard__tip">
              Provide credentials for generating summaries. Secrets are stored locally using hardware encryption.
            </p>

            <div className="form-field">
              <label>LLM Provider</label>
              <select value={llmProvider} onChange={(e) => setLlmProvider(e.target.value)}>
                <option value="gemini">Google Gemini (Native API)</option>
                <option value="openai-compatible">OpenAI-Compatible (Groq, local LLMs)</option>
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
              <label>Model (Optional)</label>
              <input 
                type="text" 
                placeholder={llmProvider === 'gemini' ? 'Auto-detected' : 'gpt-4o-mini'}
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

            <div className="wizard__actions">
              <button className="btn btn--secondary" onClick={() => setCurrentStep(1)}>Back</button>
              <button 
                className="btn btn--primary" 
                onClick={handleSaveLLM}
                disabled={!geminiApiKey}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div>
            <h2>Connect Gmail Account</h2>
            <p className="wizard__tip">
              Add Google OAuth credentials to dispatch reports. Make sure your redirect URI is set to <code>http://localhost:5999/oauth2callback</code>.
            </p>

            <div className="form-field">
              <label>Google OAuth Client ID</label>
              <input 
                type="text" 
                placeholder="Paste Client ID..."
                value={gmailClientId}
                onChange={(e) => setGmailClientId(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Google OAuth Client Secret</label>
              <input 
                type="password" 
                placeholder="Paste Client Secret..."
                value={gmailClientSecret}
                onChange={(e) => setGmailClientSecret(e.target.value)}
              />
            </div>

            {gmailError && <p className="error-text">{gmailError}</p>}

            <div className="auth-connection-status" style={{ margin: '16px 0' }}>
              {settings.gmailUserEmail ? (
                <div className="success-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '10px' }}>
                  <span>Connected Gmail: <strong>{settings.gmailUserEmail}</strong></span>
                  <button className="btn btn--secondary btn--sm" onClick={handleConnectGmail} disabled={gmailLoading}>
                    {gmailLoading ? 'Re-connecting...' : 'Re-connect'}
                  </button>
                </div>
              ) : (
                <button 
                  className="btn btn--secondary" 
                  onClick={handleConnectGmail} 
                  disabled={gmailLoading}
                >
                  {gmailLoading ? 'Waiting for redirection...' : 'Authenticate Google Account'}
                </button>
              )}
            </div>

            <div className="wizard__actions">
              <button className="btn btn--secondary" onClick={() => setCurrentStep(2)}>Back</button>
              <button 
                className="btn btn--primary" 
                onClick={() => setCurrentStep(4)}
                disabled={!settings.gmailUserEmail}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div>
            <h2>Configure Email Recipients</h2>
            <p className="wizard__tip">
              Specify where reports are delivered. Comma-separate multiple targets.
            </p>

            <div className="form-field">
              <label>To (Recipients)</label>
              <input 
                type="text" 
                placeholder="manager@company.com, supervisor@company.com"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Cc (Carbon Copy)</label>
              <input 
                type="text" 
                placeholder="cc@company.com"
                value={emailCc}
                onChange={(e) => setEmailCc(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Bcc (Blind Carbon Copy)</label>
              <input 
                type="text" 
                placeholder="backup@company.com"
                value={emailBcc}
                onChange={(e) => setEmailBcc(e.target.value)}
              />
            </div>

            <div className="wizard__actions">
              <button className="btn btn--secondary" onClick={() => setCurrentStep(3)}>Back</button>
              <button 
                className="btn btn--primary" 
                onClick={handleSaveRecipients}
                disabled={!emailTo}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div>
            <h2>Connect Google Sheet</h2>
            <p className="wizard__tip">
              Paste the URL of your Google Sheets document. Make sure your authenticated account has permissions to edit it.
            </p>

            <form onSubmit={(e) => { e.preventDefault(); handleInspectExcel(); }} className="form-group row" style={{ marginBottom: '16px' }}>
              <input 
                type="text" 
                placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                value={excelPath}
                onChange={(e) => setExcelPath(e.target.value)}
                disabled={excelInspecting}
              />
              <button type="submit" className="btn btn--secondary" disabled={excelInspecting}>
                {excelInspecting ? 'Connecting...' : 'Verify Spreadsheet'}
              </button>
            </form>
            
            {excelError && (
              <div style={{ marginBottom: '16px' }}>
                <p className="error-text" style={{ marginBottom: '8px' }}>{excelError}</p>
                {excelError.includes('Access denied') && (
                  <button 
                    type="button" 
                    className="btn btn--primary btn--sm" 
                    onClick={async () => {
                      setExcelError('');
                      setExcelInspecting(true);
                      try {
                        await connectGmail();
                        setTimeout(() => handleInspectExcel(), 2000);
                      } catch (err: any) {
                        setExcelError(`Authorization failed: ${err.message}`);
                      } finally {
                        setExcelInspecting(false);
                      }
                    }}
                  >
                    Authorize Google Sheets Access
                  </button>
                )}
              </div>
            )}

            {sheetsList.length > 0 && (
              <div className="excel-setup-box" style={{ padding: 0, border: 'none' }}>
                <div style={{ marginBottom: '16px', background: 'var(--success-bg)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--success-border)', color: 'var(--success-text)' }}>
                  Spreadsheet Title: <strong>{spreadsheetTitle}</strong>
                </div>

                <div className="form-field">
                  <label>Select Worksheet</label>
                  <select value={excelSheetName} onChange={(e) => setExcelSheetName(e.target.value)}>
                    {sheetsList.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="excel-columns-preview">
                  <strong>Detected Columns preview:</strong>
                  <div className="preview-tags">
                    {columnsPreview.map((c, i) => (
                      <span key={i} className="preview-tag">{c}</span>
                    ))}
                  </div>
                </div>

                <div className="mapping-table" style={{ marginTop: '20px' }}>
                  <h4>Column Configuration Mapping</h4>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Excel Col</th>
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
                              style={{ width: '50px', textAlign: 'center', padding: '6px' }}
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
                                placeholder="Fixed text..."
                                value={m.fixedValue}
                                onChange={(e) => handleUpdateMapping(i, 'fixedValue', e.target.value)}
                                style={{ width: '100px', padding: '6px' }}
                              />
                            ) : (
                              <span className="dimmed">Not applicable</span>
                            )}
                          </td>
                          <td>
                            <button className="btn btn--danger btn--sm" onClick={() => handleRemoveMappingRow(i)}>Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button className="btn btn--secondary btn--sm" style={{ marginTop: '12px' }} onClick={handleAddMappingRow}>+ Add Column</button>
                </div>
              </div>
            )}

            {mappingValidationError && sheetsList.length > 0 && (
              <div className="error-banner" style={{ marginTop: '16px' }}>
                {mappingValidationError}
              </div>
            )}

            <div className="wizard__actions">
              <button className="btn btn--secondary" onClick={() => setCurrentStep(4)}>Back</button>
              <button 
                className="btn btn--primary" 
                onClick={handleSaveExcel}
                disabled={sheetsList.length === 0 || !!mappingValidationError}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {currentStep === 6 && (
          <div>
            <h2>Report Generation Time</h2>
            <p className="wizard__tip">
              Choose the scheduled local time for automated executions daily.
            </p>

            <div className="form-field" style={{ maxWidth: '200px' }}>
              <label>Execution Time</label>
              <input 
                type="time" 
                value={reportTime} 
                onChange={(e) => setReportTime(e.target.value)}
              />
            </div>

            <div className="wizard__actions">
              <button className="btn btn--secondary" onClick={() => setCurrentStep(5)}>Back</button>
              <button 
                className="btn btn--primary" 
                onClick={handleCompleteSetup}
              >
                Finish Setup
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
