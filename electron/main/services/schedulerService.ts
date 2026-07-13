import { 
  getSettings, 
  saveSetting, 
  logToDb, 
  getRepositories, 
  saveReport, 
  getReportByDate, 
  updateReportStatus,
  getReports,
  pruneLogs
} from '../database';
import { scrapeRepoForDate, RepoScrapeResult } from './gitService';
import { generateReportFromLLM } from './llmService';
import { sendEmail } from './gmailService';
import { appendReportToExcel } from './excelService';
import { DailyReportOrchestrator } from './orchestrator';

let schedulerInterval: NodeJS.Timeout | null = null;
let retryInterval: NodeJS.Timeout | null = null;
let isRunning = false;

// Get local date string in YYYY-MM-DD format
export function getLocalDateString(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().split('T')[0] || '';
}

// Check if current time is past the scheduled time (HH:MM format)
function isTimePast(scheduledTime: string, now = new Date()): boolean {
  const parts = scheduledTime.split(':');
  const schedHour = Number(parts[0] || 0);
  const schedMin = Number(parts[1] || 0);
  const nowHour = now.getHours();
  const nowMin = now.getMinutes();

  if (nowHour > schedHour) return true;
  if (nowHour === schedHour && nowMin >= schedMin) return true;
  return false;
}

// Orchestrator: Run report for a specific date
export async function runReportForDate(dateStr: string): Promise<boolean> {
  return DailyReportOrchestrator.run(dateStr);
}

// Retry failed/pending items
export async function retryPendingReports(): Promise<void> {
  const reports = getReports(100);
  const pendingReports = reports.filter(r => r.excel_status !== 'updated' || r.email_status !== 'sent');
  
  if (pendingReports.length === 0) return;

  logToDb('INFO', 'SCHEDULER', `Found ${pendingReports.length} pending/failed reports. Retrying...`);
  
  for (const r of pendingReports) {
    try {
      let emailSubject = '';
      let emailBody = '';
      if (r.email_content) {
        try {
          const emailData = JSON.parse(r.email_content);
          emailSubject = emailData.subject;
          emailBody = emailData.body;
        } catch (e) {
          // Fallback if not JSON
          emailSubject = `Daily Work Report - ${r.report_date}`;
          emailBody = r.email_content;
        }
      }

      const scrapeResults: RepoScrapeResult[] = JSON.parse(r.commit_data);
      const repoNames = scrapeResults.map(res => res.repoName);

      // Retry Google Sheets if failed/pending
      if (r.excel_status !== 'updated') {
        const settings = getSettings();
        if (settings.excelPath) {
          try {
            await appendReportToExcel({
              dateStr: r.report_date,
              reportContent: r.report_content || 'Manual re-run',
              repoNames
            });
            updateReportStatus(r.report_date, { excel_status: 'updated' });
          } catch (err: any) {
            updateReportStatus(r.report_date, { error_message: `Google Sheets retry error: ${err.message}` });
          }
        }
      }

      // Retry Email if failed/pending
      if (r.email_status !== 'sent' && emailSubject && emailBody) {
        const settings = getSettings();
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
              subject: emailSubject,
              htmlBody: emailBody
            });
            updateReportStatus(r.report_date, { email_status: 'sent' });
          } catch (err: any) {
            updateReportStatus(r.report_date, { error_message: `Gmail retry error: ${err.message}` });
          }
        }
      }
    } catch (err: any) {
      logToDb('ERROR', 'SCHEDULER', `Failed during retry for report ${r.report_date}: ${err.message}`);
    }
  }
}

// Startup Recovery logic
export async function startupRecovery(): Promise<void> {
  logToDb('INFO', 'SCHEDULER', 'Running startup recovery checks for missed reports...');
  
  // Prune old logs to keep database size healthy
  pruneLogs();
  
  const settings = getSettings();
  const scheduledTime = settings.reportTime || '17:30';
  const lastProcessed = settings.lastProcessedScheduledDate || '';

  // Get current date details
  const todayStr = getLocalDateString();
  
  // Compute lookback window dynamically based on last processed date
  let scanLimit = 7;
  if (lastProcessed) {
    try {
      const lastDate = new Date(lastProcessed);
      const todayDate = new Date();
      const diffTime = Math.abs(todayDate.getTime() - lastDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      // Cap scanning at a reasonable 30 days to avoid performance issues if system was off for months
      scanLimit = Math.min(diffDays, 30);
    } catch (e) {
      scanLimit = 7;
    }
  }

  const checkDates: string[] = [];
  for (let i = scanLimit; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    checkDates.push(getLocalDateString(d));
  }

  for (const dateStr of checkDates) {
    // If it's today, we only run recovery if we are past the scheduled time
    if (dateStr === todayStr && !isTimePast(scheduledTime)) {
      continue;
    }

    // Skip if we've recorded that we already processed this date
    if (lastProcessed && lastProcessed >= dateStr) {
      continue;
    }

    // Double check if a report actually exists in the database
    const existingReport = getReportByDate(dateStr);
    if (existingReport) {
      continue;
    }

    // Date has commits? Let's check
    const repos = getRepositories();
    let hasCommits = false;
    for (const r of repos) {
      try {
        const scrape = await scrapeRepoForDate(r.path, dateStr);
        if (scrape.commits.length > 0) {
          hasCommits = true;
          break;
        }
      } catch (err) {
        // ignore scrape errors in recovery check
      }
    }

    if (hasCommits) {
      logToDb('INFO', 'SCHEDULER', `Recovery: Found missed commits on ${dateStr}. Running report automation.`);
      try {
        await runReportForDate(dateStr);
      } catch (err: any) {
        logToDb('ERROR', 'SCHEDULER', `Recovery report failed for ${dateStr}: ${err.message}`);
      }
    } else {
      logToDb('INFO', 'SCHEDULER', `Recovery: Checked ${dateStr}, no commits found.`);
    }

    // Mark this date as processed so we don't scan it again
    saveSetting('lastProcessedScheduledDate', dateStr);
  }

  // Also trigger any pending deliveries on startup
  await retryPendingReports();
}

// Start scheduling timers
export function startScheduler() {
  if (isRunning) return;
  isRunning = true;

  logToDb('INFO', 'SCHEDULER', 'Report automation scheduler active');

  // Minute-by-minute check
  schedulerInterval = setInterval(async () => {
    try {
      const settings = getSettings();
      const scheduledTime = settings.reportTime || '17:30';
      const lastProcessed = settings.lastProcessedScheduledDate || '';
      
      const todayStr = getLocalDateString();

      // Check if we need to run today
      if (lastProcessed !== todayStr && isTimePast(scheduledTime)) {
        logToDb('INFO', 'SCHEDULER', `Scheduled time reached (${scheduledTime}). Initiating run.`);
        // Mark today as processed immediately to prevent concurrent triggers
        saveSetting('lastProcessedScheduledDate', todayStr);
        
        await runReportForDate(todayStr);
      }
    } catch (err: any) {
      logToDb('ERROR', 'SCHEDULER', `Scheduler tick error: ${err.message}`);
    }
  }, 60000); // every minute

  // Retry interval every 15 minutes
  retryInterval = setInterval(async () => {
    try {
      await retryPendingReports();
    } catch (err: any) {
      logToDb('ERROR', 'SCHEDULER', `Scheduler retry tick error: ${err.message}`);
    }
  }, 15 * 60 * 1000); // 15 mins
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
  }
  isRunning = false;
  logToDb('INFO', 'SCHEDULER', 'Report automation scheduler stopped');
}
