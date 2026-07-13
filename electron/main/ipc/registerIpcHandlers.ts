import { ipcMain } from 'electron';
import { 
  getSettings, 
  saveSetting, 
  getRepositories, 
  addRepository, 
  removeRepository, 
  getReports, 
  getLogs, 
  clearLogs, 
  logToDb
} from '../database';
import { verifyGitRepo } from '../services/gitService';
import { runReportForDate, retryPendingReports } from '../services/schedulerService';
import { startGmailAuthFlow } from '../services/gmailService';
import { getExcelMeta } from '../services/excelService';
import { DailyReportOrchestrator } from '../services/orchestrator';

export function registerIpcHandlers() {
  // Ping for connection verification
  ipcMain.handle('app:ping', () => ({
    ok: true,
    timestamp: new Date().toISOString(),
  }));

  // Settings handlers
  ipcMain.handle('settings:get', () => {
    return getSettings();
  });

  ipcMain.handle('settings:save', (_, key, value) => {
    saveSetting(key, value);
    logToDb('INFO', 'SYSTEM', `Setting changed: ${key}`);
  });

  // Repositories handlers
  ipcMain.handle('repositories:list', () => {
    return getRepositories();
  });

  ipcMain.handle('repositories:add', async (_, repoPath) => {
    const check = await verifyGitRepo(repoPath);
    if (check.ok) {
      try {
        addRepository(repoPath, check.name);
        return { ok: true, name: check.name };
      } catch (err: any) {
        return { ok: false, error: err.message || 'Repository is already added' };
      }
    } else {
      return { ok: false, error: check.error || 'Not a valid Git repository' };
    }
  });

  ipcMain.handle('repositories:remove', (_, id) => {
    removeRepository(id);
  });

  // Reports handlers
  ipcMain.handle('reports:list', (_, limit) => {
    return getReports(limit);
  });

  ipcMain.handle('reports:generate-for-date', async (_, dateStr) => {
    try {
      const ok = await runReportForDate(dateStr);
      if (ok) {
        return { ok: true };
      } else {
        return { ok: false, error: 'No commits found or generation failed' };
      }
    } catch (err: any) {
      return { ok: false, error: err.message || 'Error occurred during report generation' };
    }
  });

  ipcMain.handle('reports:retry', async () => {
    await retryPendingReports();
  });

  ipcMain.handle('orchestrator:get-status', (_, dateStr) => {
    return DailyReportOrchestrator.getStatus(dateStr);
  });

  // Logs handlers
  ipcMain.handle('logs:get', (_, limit) => {
    return getLogs(limit);
  });

  ipcMain.handle('logs:clear', () => {
    clearLogs();
  });

  // Gmail authorization
  ipcMain.handle('gmail:start-auth', async () => {
    try {
      const result = await startGmailAuthFlow();
      return { email: result.email };
    } catch (err: any) {
      logToDb('ERROR', 'GMAIL', `OAuth process failed: ${err.message}`);
      throw err;
    }
  });

  // Excel file verification and mapping meta
  ipcMain.handle('excel:inspect', async (_, filePath) => {
    try {
      return await getExcelMeta(filePath);
    } catch (err: any) {
      logToDb('ERROR', 'EXCEL', `Excel inspection failed: ${err.message}`);
      throw err;
    }
  });
}