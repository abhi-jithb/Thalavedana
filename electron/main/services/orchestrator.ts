import { BrowserWindow } from 'electron';
import { 
  getSettings, 
  logToDb, 
  getRepositories, 
  saveReport, 
  updateReportStatus
} from '../database';
import { scrapeRepoForDate, RepoScrapeResult } from './gitService';
import { generateReportFromLLM } from './llmService';
import { sendEmail } from './gmailService';
import { appendReportToExcel } from './excelService';
import type { PipelineStatus } from '../../../src/shared/api';

function sendToRenderer(channel: string, data: any) {
  try {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    }
  } catch (err: any) {
    console.error('Failed to send status update to renderer:', err.message);
  }
}

export class DailyReportOrchestrator {
  private static activeRuns = new Map<string, PipelineStatus>();

  public static getStatus(dateStr: string): PipelineStatus {
    return this.activeRuns.get(dateStr) || {
      date: dateStr,
      overall: 'idle',
      git: { status: 'idle' },
      ai: { status: 'idle' },
      excel: { status: 'idle' },
      gmail: { status: 'idle' }
    };
  }

  private static updateStatus(dateStr: string, update: Partial<PipelineStatus>) {
    const current = this.getStatus(dateStr);
    const updated = { ...current, ...update };
    this.activeRuns.set(dateStr, updated);
    sendToRenderer('orchestrator:status-change', updated);
  }

  private static updateStage(
    dateStr: string, 
    stage: 'git' | 'ai' | 'excel' | 'gmail', 
    status: 'idle' | 'running' | 'success' | 'failed', 
    message?: string
  ) {
    const current = this.getStatus(dateStr);
    const updatedStage = { status, message };
    const updated = {
      ...current,
      [stage]: updatedStage
    };
    this.activeRuns.set(dateStr, updated);
    sendToRenderer('orchestrator:status-change', updated);
  }

  public static async run(dateStr: string): Promise<boolean> {
    const current = this.getStatus(dateStr);
    if (current.overall === 'running') {
      logToDb('WARN', 'SCHEDULER', `Report orchestration already running for date: ${dateStr}. Skipping run.`);
      return false;
    }

    logToDb('INFO', 'SCHEDULER', `DailyReportOrchestrator: Starting automation flow for date: ${dateStr}`);
    
    // Initialize Status
    this.updateStatus(dateStr, {
      overall: 'running',
      git: { status: 'running', message: 'Scanning Git repositories...' },
      ai: { status: 'idle' },
      excel: { status: 'idle' },
      gmail: { status: 'idle' },
      errorMessage: undefined
    });

    const repos = getRepositories();
    if (repos.length === 0) {
      const msg = 'No repositories are configured.';
      logToDb('WARN', 'SCHEDULER', msg);
      this.updateStage(dateStr, 'git', 'failed', msg);
      this.updateStatus(dateStr, { overall: 'failed', errorMessage: msg });
      return false;
    }

    // --- STAGE 1: Git Commit Scraper ---
    const scrapeResults: RepoScrapeResult[] = [];
    let totalCommits = 0;

    for (const repo of repos) {
      try {
        const result = await scrapeRepoForDate(repo.path, dateStr);
        scrapeResults.push(result);
        totalCommits += result.commits.length;
      } catch (err: any) {
        logToDb('ERROR', 'GIT', `Failed to scrape repo ${repo.name}: ${err.message}`);
      }
    }

    if (totalCommits === 0) {
      const msg = `No commits found across repositories for ${dateStr}.`;
      logToDb('INFO', 'SCHEDULER', `${msg} Skipping report pipeline.`);
      this.updateStage(dateStr, 'git', 'success', 'Completed (0 commits found).');
      this.updateStage(dateStr, 'ai', 'success', 'Skipped.');
      this.updateStage(dateStr, 'excel', 'success', 'Skipped.');
      this.updateStage(dateStr, 'gmail', 'success', 'Skipped.');
      this.updateStatus(dateStr, { overall: 'success' });
      return false;
    }

    this.updateStage(dateStr, 'git', 'success', `Found ${totalCommits} commits.`);
    this.updateStage(dateStr, 'ai', 'running', 'Generating summary report using LLM...');

    // --- STAGE 2: LLM Report Generation ---
    let llmResult;
    try {
      llmResult = await generateReportFromLLM(dateStr, scrapeResults);
      this.updateStage(dateStr, 'ai', 'success', 'Work report generated successfully.');
    } catch (err: any) {
      const errMsg = `LLM Generation failed: ${err.message}`;
      logToDb('ERROR', 'LLM', errMsg);
      
      saveReport({
        report_date: dateStr,
        commit_data: JSON.stringify(scrapeResults),
        report_content: '',
        email_content: '',
        excel_status: 'failed',
        email_status: 'failed',
        error_message: errMsg
      });

      this.updateStage(dateStr, 'ai', 'failed', err.message);
      this.updateStatus(dateStr, { overall: 'failed', errorMessage: errMsg });
      return false;
    }

    // Save report placeholder to SQLite database
    saveReport({
      report_date: dateStr,
      commit_data: JSON.stringify(scrapeResults),
      report_content: llmResult.report,
      email_content: JSON.stringify({
        subject: llmResult.emailSubject,
        body: llmResult.emailBody
      }),
      excel_status: 'pending',
      email_status: 'pending'
    });

    const settings = getSettings();
    let excelFailed = false;
    let emailFailed = false;
    let combinedError = '';

    // --- STAGE 3: Google Sheets Row Appender ---
    this.updateStage(dateStr, 'excel', 'running', 'Appending summary row to Google Sheets...');
    if (settings.excelPath) {
      try {
        await appendReportToExcel({
          dateStr,
          reportContent: llmResult.report,
          repoNames: scrapeResults.map(r => r.repoName)
        });
        updateReportStatus(dateStr, { excel_status: 'updated' });
        this.updateStage(dateStr, 'excel', 'success', 'Google Sheet updated successfully.');
      } catch (err: any) {
        excelFailed = true;
        combinedError += `Google Sheets: ${err.message}. `;
        logToDb('ERROR', 'EXCEL', `Google Sheets append failed: ${err.message}`);
        updateReportStatus(dateStr, { excel_status: 'failed', error_message: `Google Sheets error: ${err.message}` });
        this.updateStage(dateStr, 'excel', 'failed', err.message);
      }
    } else {
      logToDb('WARN', 'EXCEL', 'Google Sheets URL is not configured. Skipping.');
      updateReportStatus(dateStr, { excel_status: 'updated' });
      this.updateStage(dateStr, 'excel', 'success', 'Skipped (Not configured).');
    }

    // --- STAGE 4: Gmail oauth sender ---
    this.updateStage(dateStr, 'gmail', 'running', 'Delivering update via Gmail...');
    const toRaw = settings.emailTo;
    if (toRaw) {
      try {
        const to = toRaw.split(',').map(s => s.trim()).filter(Boolean);
        const cc = settings.emailCc ? settings.emailCc.split(',').map(s => s.trim()).filter(Boolean) : [];
        const bcc = settings.emailBcc ? settings.emailBcc.split(',').map(s => s.trim()).filter(Boolean) : [];
        
        await sendEmail({
          to,
          cc,
          bcc,
          subject: llmResult.emailSubject,
          htmlBody: llmResult.emailBody
        });
        updateReportStatus(dateStr, { email_status: 'sent' });
        this.updateStage(dateStr, 'gmail', 'success', 'Email sent successfully.');
      } catch (err: any) {
        emailFailed = true;
        combinedError += `Gmail: ${err.message}. `;
        logToDb('ERROR', 'GMAIL', `Email send failed: ${err.message}`);
        updateReportStatus(dateStr, { email_status: 'failed', error_message: `Gmail error: ${err.message}` });
        this.updateStage(dateStr, 'gmail', 'failed', err.message);
      }
    } else {
      logToDb('WARN', 'GMAIL', 'Gmail recipients not set. Skipping.');
      updateReportStatus(dateStr, { email_status: 'sent' });
      this.updateStage(dateStr, 'gmail', 'success', 'Skipped (Not configured).');
    }

    // Wrap-up status
    if (excelFailed || emailFailed) {
      this.updateStatus(dateStr, { overall: 'failed', errorMessage: combinedError.trim() });
      return false;
    } else {
      this.updateStatus(dateStr, { overall: 'success' });
      return true;
    }
  }
}
