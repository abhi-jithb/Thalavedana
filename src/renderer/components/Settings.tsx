import React, { useState } from 'react';
import type { SettingsData, RepositoryData } from '../../shared/api';

interface SettingsProps {
  settings: SettingsData;
  saveSetting: (key: keyof SettingsData, value: string) => Promise<void>;
  connectGmail: () => Promise<{ email: string }>;
  cancelGmailAuth: () => Promise<void>;
  refreshAll: () => Promise<void>;
  repos: RepositoryData[];
  addRepo: (path: string) => Promise<{ ok: boolean; name?: string; error?: string }>;
  removeRepo: (id: number) => Promise<void>;
}

export default function Settings({
  settings,
  saveSetting,
  connectGmail,
  cancelGmailAuth,
  repos,
  addRepo,
  removeRepo,
}: SettingsProps) {
  // Tabs configuration
  const [activeTab, setActiveTab] = useState<'general' | 'repositories' | 'ai' | 'google' | 'scheduler' | 'advanced'>('general');

  // General local state
  const [launchOnStartup, setLaunchOnStartup] = useState(settings.launchOnStartup === 'true');
  const [minimizeToTray, setMinimizeToTray] = useState(settings.minimizeToTray === 'true');
  const [autoSendWithoutPreview, setAutoSendWithoutPreview] = useState(settings.autoSendWithoutPreview !== 'false');
  const [emailSignature, setEmailSignature] = useState(
    settings.emailSignature || 
    `Regards,\n\nAbhijith B\nDeveloper Intern\nKerala Development and Innovation Strategic Council (KDISC)`
  );
  const [developerName, setDeveloperName] = useState(settings.developerName || '');
  const [developerEmail, setDeveloperEmail] = useState(settings.developerEmail || '');

  // Repositories local state
  const [repoPathInput, setRepoPathInput] = useState('');
  const [repoError, setRepoError] = useState('');
  const [repoLoading, setRepoLoading] = useState(false);

  // AI local state
  const [llmProvider, setLlmProvider] = useState(settings.llmProvider || 'gemini');
  const [geminiApiKey, setGeminiApiKey] = useState(settings.geminiApiKey || '');
  const [llmModel, setLlmModel] = useState(settings.llmModel || '');
  const [llmEndpoint, setLlmEndpoint] = useState(settings.llmEndpoint || '');
  
  // Multiple providers and backup keys states
  const [geminiApiKey1, setGeminiApiKey1] = useState(settings.geminiApiKey1 || '');
  const [geminiApiKey2, setGeminiApiKey2] = useState(settings.geminiApiKey2 || '');
  const [geminiApiKey3, setGeminiApiKey3] = useState(settings.geminiApiKey3 || '');
  const [groqApiKey, setGroqApiKey] = useState(settings.groqApiKey || '');
  const [groqModel, setGroqModel] = useState(settings.groqModel || 'llama-3.3-70b-versatile');
  const [geminiEnabled, setGeminiEnabled] = useState(settings.geminiEnabled !== 'false');
  const [groqEnabled, setGroqEnabled] = useState(settings.groqEnabled !== 'false');

  // Gmail local state
  const [gmailClientId, setGmailClientId] = useState(settings.gmailClientId || '');
  const [gmailClientSecret, setGmailClientSecret] = useState(settings.gmailClientSecret || '');
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailError, setGmailError] = useState('');

  // Recipients local state
  const [emailTo, setEmailTo] = useState(settings.emailTo || '');
  const [emailCc, setEmailCc] = useState(settings.emailCc || '');
  const [emailBcc, setEmailBcc] = useState(settings.emailBcc || '');

  // Google Sheet local state
  const [excelPath, setExcelPath] = useState(settings.excelPath || '');
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

  // Scheduler local state
  const [reportTime, setReportTime] = useState(settings.reportTime || '17:30');
  const [workStartTime, setWorkStartTime] = useState(settings.workStartTime || '10:00 AM');
  const [workEndTime, setWorkEndTime] = useState(settings.workEndTime || '05:30 PM');

  // Success state
  const [saveSuccess, setSaveSuccess] = useState('');

  const showSuccessMessage = (msg: string) => {
    setSaveSuccess(msg);
    setTimeout(() => setSaveSuccess(''), 3000);
  };

  // --- Actions ---

  const handleSaveGeneral = async () => {
    await saveSetting('launchOnStartup', launchOnStartup ? 'true' : 'false');
    await saveSetting('minimizeToTray', minimizeToTray ? 'true' : 'false');
    await saveSetting('autoSendWithoutPreview', autoSendWithoutPreview ? 'true' : 'false');
    await saveSetting('emailSignature', emailSignature);
    await saveSetting('developerName', developerName);
    await saveSetting('developerEmail', developerEmail);
    showSuccessMessage('General settings saved.');
  };

  const handleAddRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    setRepoError('');
    if (!repoPathInput.trim()) return;

    setRepoLoading(true);
    try {
      const res = await addRepo(repoPathInput.trim());
      if (res.ok) {
        setRepoPathInput('');
        showSuccessMessage('Repository folder added.');
      } else {
        setRepoError(res.error || 'Failed to add repository.');
      }
    } catch (err: any) {
      setRepoError(err.message || 'An error occurred.');
    } finally {
      setRepoLoading(false);
    }
  };

  const handleSaveLLM = async () => {
    await saveSetting('llmProvider', llmProvider);
    await saveSetting('geminiApiKey', geminiApiKey);
    await saveSetting('llmModel', llmModel);
    await saveSetting('llmEndpoint', llmEndpoint);
    
    // Save new backup keys and provider toggles
    await saveSetting('geminiApiKey1', geminiApiKey1);
    await saveSetting('geminiApiKey2', geminiApiKey2);
    await saveSetting('geminiApiKey3', geminiApiKey3);
    await saveSetting('groqApiKey', groqApiKey);
    await saveSetting('groqModel', groqModel);
    await saveSetting('geminiEnabled', geminiEnabled ? 'true' : 'false');
    await saveSetting('groqEnabled', groqEnabled ? 'true' : 'false');
    
    showSuccessMessage('LLM settings saved.');
  };

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

  const handleCancelGmailAuth = async () => {
    try {
      await cancelGmailAuth();
    } catch (err: any) {
      // ignore
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
      const autoMappings = detectColumnMappings(meta.columnsPreview);
      setMappings(autoMappings);
    } catch (err: any) {
      setExcelError(err.message || 'Failed to inspect Google Sheet. Verify credentials.');
    } finally {
      setExcelInspecting(false);
    }
  };

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

  const handleSaveScheduler = async () => {
    await saveSetting('reportTime', reportTime);
    await saveSetting('workStartTime', workStartTime);
    await saveSetting('workEndTime', workEndTime);
    showSuccessMessage('Scheduler and work hours updated.');
  };

  const handleResetWizard = async () => {
    if (confirm('Are you sure you want to reset setup? You will be guided through the Setup Onboarding Wizard again.')) {
      await saveSetting('setupCompleted', 'false');
      window.location.reload();
    }
  };

  // Mappings Validation
  const hasDateMapping = mappings.some(m => m.type === 'date');
  const hasReportMapping = mappings.some(m => m.type === 'report');
  const mappingValidationError = !hasDateMapping || !hasReportMapping
    ? 'Please map at least one column to "Report Date" and one to "Work Report Summary".'
    : '';

  return (
    <div className="settings-page" style={{ maxWidth: '780px' }}>
      <div className="settings-page__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 className="page-title">Settings</h2>
          <p className="page-subtitle">Configure application, credentials, schedulers, and pipeline paths.</p>
        </div>
        {saveSuccess && <span className="save-toast" style={{ background: 'var(--success-bg)', color: 'var(--success-text)', border: '1px solid var(--success-border)', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>{saveSuccess}</span>}
      </div>

      {/* Tabs navigation */}
      <nav className="settings-nav" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', marginBottom: '24px', overflowX: 'auto' }}>
        <button className={`settings-nav__btn ${activeTab === 'general' ? 'settings-nav__btn--active' : ''}`} onClick={() => setActiveTab('general')}>General</button>
        <button className={`settings-nav__btn ${activeTab === 'repositories' ? 'settings-nav__btn--active' : ''}`} onClick={() => setActiveTab('repositories')}>Repositories</button>
        <button className={`settings-nav__btn ${activeTab === 'ai' ? 'settings-nav__btn--active' : ''}`} onClick={() => setActiveTab('ai')}>AI (Gemini)</button>
        <button className={`settings-nav__btn ${activeTab === 'google' ? 'settings-nav__btn--active' : ''}`} onClick={() => setActiveTab('google')}>Google API</button>
        <button className={`settings-nav__btn ${activeTab === 'scheduler' ? 'settings-nav__btn--active' : ''}`} onClick={() => setActiveTab('scheduler')}>Scheduler</button>
        <button className={`settings-nav__btn ${activeTab === 'advanced' ? 'settings-nav__btn--active' : ''}`} onClick={() => setActiveTab('advanced')}>Advanced</button>
      </nav>

      {/* Tabs content */}
      <div className="settings-content">
        
        {/* TAB 1: General */}
        {activeTab === 'general' && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h3>General Configurations</h3>
              <p className="description">Manage background running options and visual defaults.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={launchOnStartup} 
                  onChange={(e) => setLaunchOnStartup(e.target.checked)} 
                  style={{ width: '16px', height: '16px' }}
                />
                Launch Thalavedana automatically on system startup
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={minimizeToTray} 
                  onChange={(e) => setMinimizeToTray(e.target.checked)} 
                  style={{ width: '16px', height: '16px' }}
                />
                Minimize application to system tray instead of quitting on window close
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={autoSendWithoutPreview} 
                  onChange={(e) => setAutoSendWithoutPreview(e.target.checked)} 
                  style={{ width: '16px', height: '16px' }}
                />
                Auto-send daily updates without presenting preview dialog (Hands-off mode)
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-field">
                <label>Developer Name (for Git attribution)</label>
                <input 
                  type="text" 
                  value={developerName} 
                  onChange={(e) => setDeveloperName(e.target.value)}
                  placeholder="e.g. Abhijith B"
                />
              </div>
              <div className="form-field">
                <label>Developer Email (for Git attribution)</label>
                <input 
                  type="email" 
                  value={developerEmail} 
                  onChange={(e) => setDeveloperEmail(e.target.value)}
                  placeholder="e.g. abhijithb200cr@gmail.com"
                />
              </div>
            </div>

            <div className="form-field">
              <label>Default Email Signature</label>
              <textarea 
                value={emailSignature}
                onChange={(e) => setEmailSignature(e.target.value)}
                placeholder="Regards, Your Name..."
                style={{ width: '100%', minHeight: '100px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '13px', fontFamily: 'inherit' }}
              />
            </div>

            <button className="btn btn--primary" style={{ alignSelf: 'flex-start' }} onClick={handleSaveGeneral}>Save General Settings</button>
          </div>
        )}

        {/* TAB 2: Repositories */}
        {activeTab === 'repositories' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="card">
              <h3>Add Repository Folder</h3>
              <p className="description">Select a new folder to monitor for daily Git commits.</p>
              
              <form onSubmit={handleAddRepo} className="form-group row" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <input 
                  type="text" 
                  placeholder="/home/username/Projects/my-project"
                  value={repoPathInput}
                  onChange={(e) => setRepoPathInput(e.target.value)}
                  disabled={repoLoading}
                  style={{ flexGrow: 1 }}
                />
                <button type="submit" className="btn btn--primary" disabled={repoLoading}>
                  {repoLoading ? 'Verifying...' : 'Add Repo'}
                </button>
              </form>
              {repoError && <p className="error-text" style={{ marginTop: '10px' }}>{repoError}</p>}
            </div>

            <div className="card">
              <h3>Monitored Folders</h3>
              {repos.length === 0 ? (
                <p className="dimmed" style={{ padding: '24px 0', textAlign: 'center' }}>No repository folders configured yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                  {repos.map((repo) => (
                    <div key={repo.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--accent-light)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '13px' }}>
                          {repo.name}
                          {repo.activeBranch && <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-app)', padding: '2px 6px', borderRadius: '10px', marginLeft: '8px', fontWeight: '500' }}>Branch: {repo.activeBranch}</span>}
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', wordBreak: 'break-all', marginTop: '2px' }}>{repo.path}</span>
                        {repo.lastCommitTime && (
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Last Commit: {repo.lastCommitTime} • Last Scan: {repo.lastScanTime || 'Never'}
                          </div>
                        )}
                        {repo.error && <p className="error-text" style={{ fontSize: '10px', marginTop: '4px' }}>Error: {repo.error}</p>}
                      </div>
                      <button className="btn btn--danger btn--sm" onClick={() => removeRepo(repo.id)}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: AI (Providers & Fallbacks) */}
        {activeTab === 'ai' && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <h3>AI Summary Engine & Fallback Chain</h3>
              <p className="description">
                Configure your LLM providers. Thalavedana will execute fallbacks in order to ensure the reliability of daily report generation.
              </p>
            </div>

            {/* General Mode selection */}
            <div className="form-field">
              <label>Default LLM Provider Selection</label>
              <select value={llmProvider} onChange={(e) => setLlmProvider(e.target.value)}>
                <option value="gemini">Google Gemini (Native API)</option>
                <option value="openai-compatible">OpenAI-Compatible (e.g. Local Models)</option>
              </select>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: 0 }} />

            {/* Gemini Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontWeight: '700', fontSize: '14px', color: 'var(--text-main)' }}>Google Gemini Settings</h4>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                  <input 
                    type="checkbox" 
                    checked={geminiEnabled} 
                    onChange={(e) => setGeminiEnabled(e.target.checked)} 
                    style={{ width: '14px', height: '14px' }}
                  />
                  Enable Gemini
                </label>
              </div>

              {geminiEnabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '8px', borderLeft: '2px solid var(--accent)' }}>
                  <div className="form-field">
                    <label>Gemini API Key #1 (Primary)</label>
                    <input 
                      type="password" 
                      placeholder="Paste primary Gemini API key..."
                      value={geminiApiKey1}
                      onChange={(e) => {
                        setGeminiApiKey1(e.target.value);
                        setGeminiApiKey(e.target.value); // keep legacy key in sync
                      }}
                    />
                  </div>

                  <div className="form-field">
                    <label>Gemini API Key #2 (Backup)</label>
                    <input 
                      type="password" 
                      placeholder="Paste backup Gemini API key..."
                      value={geminiApiKey2}
                      onChange={(e) => setGeminiApiKey2(e.target.value)}
                    />
                  </div>

                  <div className="form-field">
                    <label>Gemini API Key #3 (Fallback)</label>
                    <input 
                      type="password" 
                      placeholder="Paste tertiary Gemini API key..."
                      value={geminiApiKey3}
                      onChange={(e) => setGeminiApiKey3(e.target.value)}
                    />
                  </div>

                  <div className="form-field">
                    <label>Preferred Gemini Model</label>
                    <input 
                      type="text" 
                      placeholder="e.g. gemini-1.5-flash or gemini-2.5-flash"
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                    />
                    <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                      If not specified, Thalavedana will auto-discover the best active Gemini model.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: 0 }} />

            {/* Groq / Backup Provider Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontWeight: '700', fontSize: '14px', color: 'var(--text-main)' }}>Groq API Fallback</h4>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                  <input 
                    type="checkbox" 
                    checked={groqEnabled} 
                    onChange={(e) => setGroqEnabled(e.target.checked)} 
                    style={{ width: '14px', height: '14px' }}
                  />
                  Enable Groq Fallback
                </label>
              </div>

              {groqEnabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '8px', borderLeft: '2px solid var(--warning)' }}>
                  <div className="form-field">
                    <label>Groq API Key</label>
                    <input 
                      type="password" 
                      placeholder="gsk_..."
                      value={groqApiKey}
                      onChange={(e) => setGroqApiKey(e.target.value)}
                    />
                  </div>

                  <div className="form-field">
                    <label>Groq Model Identifier</label>
                    <input 
                      type="text" 
                      placeholder="e.g. llama-3.3-70b-versatile"
                      value={groqModel}
                      onChange={(e) => setGroqModel(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {llmProvider === 'openai-compatible' && (
              <>
                <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: 0 }} />
                <div className="form-field">
                  <label>Custom OpenAI Endpoint URL</label>
                  <input 
                    type="text" 
                    placeholder="https://api.openai.com/v1/chat/completions"
                    value={llmEndpoint}
                    onChange={(e) => setLlmEndpoint(e.target.value)}
                  />
                </div>
              </>
            )}

            <button className="btn btn--primary" style={{ alignSelf: 'flex-start' }} onClick={handleSaveLLM}>
              Save AI Settings & Fallbacks
            </button>
          </div>
        )}

        {/* TAB 4: Google API (Gmail, Sheets) */}
        {activeTab === 'google' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Google OAuth & Gmail section */}
            <div className="card">
              <h3>Google Accounts & Gmail Authentication</h3>
              <p className="description">Configure Gmail and Sheets Google integration.</p>

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

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                {settings.gmailUserEmail ? (
                  <div className="success-banner" style={{ flexGrow: 1 }}>
                    Linked account: <strong>{settings.gmailUserEmail}</strong>
                  </div>
                ) : (
                  <div className="error-banner" style={{ flexGrow: 1 }}>
                    No Google account is currently authenticated.
                  </div>
                )}
                <button className="btn btn--secondary" onClick={handleConnectGmail} disabled={gmailLoading}>
                  {gmailLoading ? 'Authorizing...' : settings.gmailUserEmail ? 'Re-authorize' : 'Authorize Account'}
                </button>
                {gmailLoading && (
                  <button className="btn btn--danger" onClick={handleCancelGmailAuth}>
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Email dispatch recipients */}
            <div className="card">
              <h3>Gmail Targets</h3>
              <p className="description">Set standard report recipients.</p>

              <div className="form-field">
                <label>To (Recipients, comma separated)</label>
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
                  placeholder="team@org.com"
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

              <button className="btn btn--primary" onClick={handleSaveRecipients}>Save Targets</button>
            </div>

            {/* Google Sheets Workbook Section */}
            <div className="card">
              <h3>Google Sheets Target</h3>
              <p className="description">Specify Google Sheets target settings and verify structure.</p>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input 
                  type="text" 
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  value={excelPath}
                  onChange={(e) => setExcelPath(e.target.value)}
                  style={{ flexGrow: 1 }}
                />
                <button className="btn btn--secondary" onClick={handleInspectExcel} disabled={excelInspecting}>
                  {excelInspecting ? 'Verifying...' : 'Verify Sheet'}
                </button>
              </div>

              {excelError && (
                <div style={{ marginBottom: '16px' }}>
                  <p className="error-text">{excelError}</p>
                </div>
              )}

              {spreadsheetTitle && (
                <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--success-text)', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                  Target spreadsheet loaded: <strong>{spreadsheetTitle}</strong>
                </div>
              )}

              {sheetsList.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="form-field">
                    <label>Worksheet Tab Name</label>
                    <select value={excelSheetName} onChange={(e) => setExcelSheetName(e.target.value)}>
                      {sheetsList.map(tabName => <option key={tabName} value={tabName}>{tabName}</option>)}
                    </select>
                  </div>

                  {columnsPreview.length > 0 && (
                    <div style={{ background: 'var(--accent-light)', border: '1px solid var(--border-light)', padding: '12px', borderRadius: '8px' }}>
                      <strong style={{ fontSize: '12px', color: 'var(--text-main)', display: 'block', marginBottom: '6px' }}>Header Row Columns Found:</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {columnsPreview.map((colStr, idx) => <span key={idx} style={{ background: '#FFFFFF', border: '1px solid var(--border-light)', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', color: 'var(--text-muted)' }}>{colStr}</span>)}
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 style={{ fontSize: '12px', fontWeight: '700', marginBottom: '8px' }}>Column Mapping Table</h4>
                    <table className="table" style={{ width: '100%', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th>Col</th>
                          <th>Field Mapping</th>
                          <th>Static String</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {mappings.map((m, idx) => (
                          <tr key={idx}>
                            <td>
                              <input 
                                type="text" 
                                value={m.col} 
                                onChange={(e) => handleUpdateMapping(idx, 'col', e.target.value.toUpperCase())}
                                style={{ width: '48px', padding: '6px', textAlign: 'center' }}
                              />
                            </td>
                            <td>
                              <select value={m.type} onChange={(e) => handleUpdateMapping(idx, 'type', e.target.value)}>
                                <option value="date">Report Date (YYYY-MM-DD)</option>
                                <option value="report">LLM Work Summary</option>
                                <option value="repositories">Monitored Repositories</option>
                                <option value="work_start">Work Start Time</option>
                                <option value="work_end">Work End Time</option>
                                <option value="fixed">Static Fixed Text</option>
                                <option value="empty">Leave Empty</option>
                              </select>
                            </td>
                            <td>
                              {m.type === 'fixed' ? (
                                <input 
                                  type="text" 
                                  value={m.fixedValue}
                                  onChange={(e) => handleUpdateMapping(idx, 'fixedValue', e.target.value)}
                                  placeholder="Fixed value..."
                                  style={{ width: '100%', padding: '6px' }}
                                />
                              ) : <span className="dimmed">N/A</span>}
                            </td>
                            <td>
                              <button className="btn btn--danger btn--sm" onClick={() => setMappings(mappings.filter((_, i) => i !== idx))}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {mappingValidationError && <p className="error-text" style={{ marginTop: '8px' }}>{mappingValidationError}</p>}

                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <button className="btn btn--secondary btn--sm" onClick={() => setMappings([...mappings, { col: '', type: 'empty', fixedValue: '' }])}>+ Add Col</button>
                      <button className="btn btn--primary btn--sm" onClick={handleSaveExcel} disabled={!!mappingValidationError}>Save Sheets Settings</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 5: Scheduler */}
        {activeTab === 'scheduler' && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h3>Automation Scheduler</h3>
              <p className="description">Schedule automated daily checks and runs.</p>
            </div>

            <div className="form-field" style={{ maxWidth: '240px' }}>
              <label>Daily Execution Time (24h)</label>
              <input 
                type="time" 
                value={reportTime} 
                onChange={(e) => setReportTime(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '360px' }}>
              <div className="form-field">
                <label>Work Start Time</label>
                <input 
                  type="text" 
                  value={workStartTime} 
                  onChange={(e) => setWorkStartTime(e.target.value)}
                  placeholder="e.g. 10:00 AM"
                />
              </div>
              <div className="form-field">
                <label>Work End Time</label>
                <input 
                  type="text" 
                  value={workEndTime} 
                  onChange={(e) => setWorkEndTime(e.target.value)}
                  placeholder="e.g. 05:30 PM"
                />
              </div>
            </div>

            <button className="btn btn--primary" style={{ alignSelf: 'flex-start' }} onClick={handleSaveScheduler}>Save Scheduler Settings</button>
          </div>
        )}

        {/* TAB 6: Advanced */}
        {activeTab === 'advanced' && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h3>Advanced & Diagnostics</h3>
              <p className="description">Reset user settings, wipe files, or debug backend details.</p>
            </div>

            <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '16px', borderRadius: '8px' }}>
              <h4 style={{ fontWeight: '700', fontSize: '14px', marginBottom: '6px' }}>Danger Zone</h4>
              <p style={{ fontSize: '12px', color: 'var(--danger-text)', opacity: 0.85, marginBottom: '12px' }}>Resetting setup will delete all stored session details and restart setup wizard.</p>
              <button className="btn btn--danger" onClick={handleResetWizard}>Reset Onboarding Wizard</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
