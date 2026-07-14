export interface PingResponse {
  ok: boolean;
  timestamp: string;
}

export interface SettingsData {
  geminiApiKey?: string;
  geminiApiKey1?: string;
  geminiApiKey2?: string;
  geminiApiKey3?: string;
  groqApiKey?: string;
  geminiEnabled?: string; // 'true' | 'false'
  groqEnabled?: string; // 'true' | 'false'
  geminiModel?: string;
  groqModel?: string;
  llmProvider?: string; // 'gemini' | 'groq' | 'openai-compatible'
  llmModel?: string;
  llmEndpoint?: string;
  emailTo?: string;
  emailCc?: string;
  emailBcc?: string;
  excelPath?: string;
  excelSheetName?: string;
  excelColumnMapping?: string; // JSON string of ColumnMapping[]
  reportTime?: string; // HH:MM format
  gmailClientId?: string;
  gmailClientSecret?: string;
  gmailUserEmail?: string;
  setupCompleted?: string; // 'true' | 'false'
  workStartTime?: string; // e.g. '10:00 AM'
  workEndTime?: string; // e.g. '05:30 PM'
  lunchBreakMinutes?: string; // e.g. '30'
  workingDays?: string; // e.g. '1,2,3,4,5'
  timezone?: string; // e.g. 'Asia/Kolkata'
  launchOnStartup?: string; // 'true' | 'false'
  minimizeToTray?: string; // 'true' | 'false'
  autoSendWithoutPreview?: string; // 'true' | 'false'
  emailSignature?: string;
  developerName?: string;
  developerEmail?: string;
  todayWorkNotes?: string;
}

export interface RepositoryData {
  id: number;
  path: string;
  name: string;
  created_at: string;
  activeBranch?: string;
  lastCommitTime?: string;
  status?: 'active' | 'missing' | 'error';
  lastScanTime?: string;
  error?: string;
}

export interface ReportData {
  id: number;
  report_date: string;
  commit_data: string; // JSON string
  report_content: string;
  email_content: string; // JSON string {subject, body} or plain text
  excel_status: string; // 'pending' | 'updated' | 'failed'
  email_status: string; // 'pending' | 'sent' | 'failed'
  error_message: string | null;
  created_at: string;
}

export interface LogData {
  id: number;
  timestamp: string;
  level: string;
  category: string;
  message: string;
}

export interface ExcelMetaResult {
  title?: string;
  sheets: string[];
  columnsPreview: string[];
}

export interface StageStatus {
  status: 'idle' | 'running' | 'success' | 'failed';
  message?: string;
  timestamp?: string;
}

export interface PipelineStatus {
  date: string;
  overall: 'idle' | 'running' | 'success' | 'failed' | 'paused';
  git: StageStatus;
  ai: StageStatus;
  excel: StageStatus;
  gmail: StageStatus;
  errorMessage?: string;
}

export interface ThalavedanaApi {
  ping: () => Promise<PingResponse>;
  
  // Settings
  getSettings: () => Promise<SettingsData>;
  saveSetting: (key: keyof SettingsData, value: string) => Promise<void>;
  onSettingsChange?: (callback: (settings: SettingsData) => void) => () => void;
  
  // Repositories
  getRepositories: () => Promise<RepositoryData[]>;
  addRepository: (repoPath: string) => Promise<{ ok: boolean; name?: string; error?: string }>;
  removeRepository: (id: number) => Promise<void>;
  
  // Reports
  getReports: (limit?: number) => Promise<ReportData[]>;
  generateReportForDate: (dateStr: string) => Promise<{ ok: boolean; error?: string }>;
  retryPendingReports: () => Promise<void>;
  retryReportStage: (dateStr: string, stage: 'ai' | 'excel' | 'gmail') => Promise<{ ok: boolean; error?: string }>;
  approveReport: (dateStr: string, reportContent: string, emailSubject: string, emailBody: string) => Promise<boolean>;
  cancelReport: (dateStr: string) => Promise<void>;
  exportReportMarkdown: (dateStr: string, content: string) => Promise<{ ok: boolean; filePath?: string }>;
  
  // Logs
  getLogs: (limit?: number) => Promise<LogData[]>;
  clearLogs: () => Promise<void>;
  
  // Gmail Auth
  startGmailAuth: () => Promise<{ email: string }>;
  
  // Excel Meta
  inspectExcel: (filePath: string) => Promise<ExcelMetaResult>;

  // Orchestrator progress monitoring
  getPipelineStatus: (dateStr: string) => Promise<PipelineStatus>;
  onStatusChange: (callback: (status: PipelineStatus) => void) => () => void;

  // Shell actions
  openExternal: (url: string) => Promise<void>;
  openPath: (pathStr: string) => Promise<{ ok: boolean; error?: string }>;
}
