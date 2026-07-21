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
import { verifyGitRepo, getRepoStatusDetail } from '../services/gitService';
import { runReportForDate, retryPendingReports } from '../services/schedulerService';
import { startGmailAuthFlow, cancelGmailAuthFlow } from '../services/gmailService';
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
  ipcMain.handle('repositories:list', async () => {
    const repos = getRepositories();
    const settings = getSettings();
    const enriched = [];
    for (const repo of repos) {
      const detail = await getRepoStatusDetail(repo.path);
      const lastScan = settings[`lastScanTime_${repo.id}`] || 'Never';
      enriched.push({
        ...repo,
        activeBranch: detail.activeBranch,
        lastCommitTime: detail.lastCommitTime,
        status: detail.status,
        lastScanTime: lastScan !== 'Never' ? new Date(lastScan).toLocaleString() : 'Never',
        error: detail.error
      });
    }
    return enriched;
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

  ipcMain.handle('reports:retry-stage', async (_, dateStr, stage) => {
    try {
      return await DailyReportOrchestrator.retryStage(dateStr, stage);
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('reports:approve', async (_, dateStr, editedReport, editedEmailSubject, editedEmailBody) => {
    try {
      return await DailyReportOrchestrator.approveAndSend(dateStr, editedReport, editedEmailSubject, editedEmailBody);
    } catch (err: any) {
      return false;
    }
  });

  ipcMain.handle('reports:cancel', async (_, dateStr) => {
    try {
      await DailyReportOrchestrator.cancelReport(dateStr);
    } catch (err: any) {
      // ignore
    }
  });

  ipcMain.handle('reports:export-markdown', async (_, dateStr, content) => {
    try {
      const { dialog } = require('electron');
      const fs = require('fs');
      const result = await dialog.showSaveDialog({
        title: 'Export Report',
        defaultPath: `Daily_Development_Report_${dateStr}.md`,
        filters: [{ name: 'Markdown Files', extensions: ['md'] }, { name: 'Text Files', extensions: ['txt'] }]
      });

      if (!result.canceled && result.filePath) {
        fs.writeFileSync(result.filePath, content, 'utf8');
        return { ok: true, filePath: result.filePath };
      }
      return { ok: false };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
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

  ipcMain.handle('gmail:stop-auth', async () => {
    cancelGmailAuthFlow();
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

  // Shell handlers
  ipcMain.handle('shell:open-external', async (_, url) => {
    const { shell } = require('electron');
    await shell.openExternal(url);
  });

  ipcMain.handle('shell:open-path', async (_, filePath) => {
    const { shell, app } = require('electron');
    let targetPath = filePath;
    if (filePath === 'logs') {
      targetPath = app.getPath('userData');
    }
    const err = await shell.openPath(targetPath);
    if (err) {
      return { ok: false, error: err };
    }
    return { ok: true };
  });
}