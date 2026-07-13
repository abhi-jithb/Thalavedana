export interface PingResponse {
  ok: boolean;
  timestamp: string;
}

export interface SettingsData {
  geminiApiKey?: string;
  llmProvider?: string; // 'gemini' | 'openai-compatible'
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
}

export interface RepositoryData {
  id: number;
  path: string;
  name: string;
  created_at: string;
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
}

export interface PipelineStatus {
  date: string;
  overall: 'idle' | 'running' | 'success' | 'failed';
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
  
  // Repositories
  getRepositories: () => Promise<RepositoryData[]>;
  addRepository: (repoPath: string) => Promise<{ ok: boolean; name?: string; error?: string }>;
  removeRepository: (id: number) => Promise<void>;
  
  // Reports
  getReports: (limit?: number) => Promise<ReportData[]>;
  generateReportForDate: (dateStr: string) => Promise<{ ok: boolean; error?: string }>;
  retryPendingReports: () => Promise<void>;
  
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
}
