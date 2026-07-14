import { app, safeStorage, BrowserWindow } from 'electron';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

let db: DatabaseSync | null = null;

const SENSITIVE_KEYS = [
  'geminiApiKey',
  'geminiApiKey1',
  'geminiApiKey2',
  'geminiApiKey3',
  'groqApiKey',
  'gmailClientSecret',
  'gmailRefreshToken',
  'gmailAccessToken',
  'gmailUserEmail'
];

function shouldEncrypt(key: string): boolean {
  return SENSITIVE_KEYS.includes(key);
}

function encryptVal(key: string, plainText: string): { value: string; isEncrypted: number } {
  if (shouldEncrypt(key) && safeStorage.isEncryptionAvailable()) {
    try {
      const encrypted = safeStorage.encryptString(plainText);
      return { value: encrypted.toString('base64'), isEncrypted: 1 };
    } catch (err: any) {
      console.warn(`Encryption failed for key ${key}, saving plain.`, err.message);
    }
  }
  return { value: plainText, isEncrypted: 0 };
}

function decryptVal(key: string, value: string, isEncrypted: number): string {
  if (isEncrypted === 1 && safeStorage.isEncryptionAvailable()) {
    try {
      const buffer = Buffer.from(value, 'base64');
      return safeStorage.decryptString(buffer);
    } catch (err: any) {
      console.error(`Decryption failed for key ${key}. Keyring may have changed.`, err.message);
    }
  }
  return value;
}

export function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  return path.join(userDataPath, 'thalavedana.db');
}

export function initDatabase() {
  if (db) return db;

  const dbPath = getDbPath();
  db = new DatabaseSync(dbPath);

  // Run migrations to create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      is_encrypted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS repositories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_date TEXT NOT NULL UNIQUE,
      commit_data TEXT NOT NULL,
      report_content TEXT NOT NULL,
      email_content TEXT NOT NULL,
      excel_status TEXT NOT NULL,
      email_status TEXT NOT NULL,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL
    );
  `);

  // Migrate older settings table if is_encrypted doesn't exist
  try {
    const pragma = db.prepare("PRAGMA table_info(settings)").all() as any[];
    const hasEncryptedCol = pragma.some(col => col.name === 'is_encrypted');
    if (!hasEncryptedCol) {
      db.exec("ALTER TABLE settings ADD COLUMN is_encrypted INTEGER DEFAULT 0");
    }
  } catch (e: any) {
    console.error("Migration error checking table columns:", e.message);
  }

  logToDb('INFO', 'SYSTEM', 'Database initialized successfully at: ' + dbPath);
  return db;
}

export function getDb(): DatabaseSync {
  if (!db) {
    return initDatabase();
  }
  return db;
}

// Database helper functions
export function logToDb(level: 'INFO' | 'WARN' | 'ERROR', category: string, message: string) {
  try {
    const database = db || new DatabaseSync(getDbPath());
    const stmt = database.prepare('INSERT INTO logs (level, category, message) VALUES (?, ?, ?)');
    stmt.run(level, category, message);
  } catch (err) {
    console.error('Failed to log to database:', err);
  }
}

export function getLogs(limit = 100): Array<{ id: number; timestamp: string; level: string; category: string; message: string }> {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?');
  return stmt.all(limit) as any[];
}

export function clearLogs() {
  const database = getDb();
  database.exec('DELETE FROM logs');
  logToDb('INFO', 'SYSTEM', 'Logs cleared');
}

export function pruneLogs() {
  try {
    const database = getDb();
    const stmt = database.prepare("DELETE FROM logs WHERE timestamp < datetime('now', '-30 days')");
    stmt.run();
    logToDb('INFO', 'SYSTEM', 'Cleaned up system logs older than 30 days.');
  } catch (err: any) {
    console.error('Failed to prune database logs:', err.message);
  }
}

export function getSettings(): Record<string, string> {
  const database = getDb();
  const stmt = database.prepare('SELECT key, value, is_encrypted FROM settings');
  const rows = stmt.all() as Array<{ key: string; value: string; is_encrypted?: number }>;
  const settingsObj: Record<string, string> = {};
  for (const row of rows) {
    const isEnc = row.is_encrypted || 0;
    settingsObj[row.key] = decryptVal(row.key, row.value, isEnc);
  }
  // Default values
  settingsObj.workStartTime = settingsObj.workStartTime || '10:00 AM';
  settingsObj.workEndTime = settingsObj.workEndTime || '05:30 PM';
  return settingsObj;
}

export function saveSetting(key: string, value: string) {
  const database = getDb();
  const { value: finalVal, isEncrypted } = encryptVal(key, value);
  const stmt = database.prepare('INSERT OR REPLACE INTO settings (key, value, is_encrypted) VALUES (?, ?, ?)');
  stmt.run(key, finalVal, isEncrypted);

  if (key === 'launchOnStartup') {
    try {
      const enabled = value === 'true';
      app.setLoginItemSettings({
        openAtLogin: enabled,
        path: app.getPath('exe')
      });
      logToDb('INFO', 'SYSTEM', `Set launch on startup: ${enabled}`);
    } catch (e: any) {
      logToDb('ERROR', 'SYSTEM', `Failed to set launch on startup: ${e.message}`);
    }
  }

  // Notify renderer windows
  try {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('settings:updated', getSettings());
      }
    }
  } catch (err: any) {
    // Ignore if windows aren't ready
  }
}

export function deleteSetting(key: string) {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM settings WHERE key = ?');
  stmt.run(key);
}

export function getRepositories(): Array<{ id: number; path: string; name: string; created_at: string }> {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM repositories ORDER BY created_at ASC');
  return stmt.all() as any[];
}

export function addRepository(repoPath: string, name: string) {
  const database = getDb();
  const stmt = database.prepare('INSERT INTO repositories (path, name) VALUES (?, ?)');
  stmt.run(repoPath, name);
  logToDb('INFO', 'GIT', `Added repository: ${name} (${repoPath})`);
}

export function removeRepository(id: number) {
  const database = getDb();
  const getStmt = database.prepare('SELECT name FROM repositories WHERE id = ?');
  const repo = getStmt.get(id) as { name: string } | undefined;
  
  if (repo) {
    const deleteStmt = database.prepare('DELETE FROM repositories WHERE id = ?');
    deleteStmt.run(id);
    logToDb('INFO', 'GIT', `Removed repository: ${repo.name}`);
  }
}

export function getReports(limit = 30): Array<{
  id: number;
  report_date: string;
  commit_data: string;
  report_content: string;
  email_content: string;
  excel_status: string;
  email_status: string;
  error_message: string | null;
  created_at: string;
}> {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM reports ORDER BY report_date DESC LIMIT ?');
  return stmt.all(limit) as any[];
}

export function getReportByDate(date: string): any | undefined {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM reports WHERE report_date = ?');
  return stmt.get(date);
}

export function saveReport(report: {
  report_date: string;
  commit_data: string;
  report_content: string;
  email_content: string;
  excel_status: string;
  email_status: string;
  error_message?: string;
}) {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO reports 
    (report_date, commit_data, report_content, email_content, excel_status, email_status, error_message) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    report.report_date,
    report.commit_data,
    report.report_content,
    report.email_content,
    report.excel_status,
    report.email_status,
    report.error_message || null
  );
  logToDb('INFO', 'SYSTEM', `Saved report for date: ${report.report_date}`);
}

export function updateReportStatus(date: string, status: { excel_status?: string; email_status?: string; error_message?: string | null }) {
  const database = getDb();
  const fields: string[] = [];
  const params: any[] = [];

  if (status.excel_status !== undefined) {
    fields.push('excel_status = ?');
    params.push(status.excel_status);
  }
  if (status.email_status !== undefined) {
    fields.push('email_status = ?');
    params.push(status.email_status);
  }
  if (status.error_message !== undefined) {
    fields.push('error_message = ?');
    params.push(status.error_message);
  }

  if (fields.length === 0) return;

  params.push(date);
  const sql = `UPDATE reports SET ${fields.join(', ')} WHERE report_date = ?`;
  const stmt = database.prepare(sql);
  stmt.run(...params);
  logToDb('INFO', 'SYSTEM', `Updated report status for ${date}: ${JSON.stringify(status)}`);
}
