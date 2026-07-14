import { BrowserWindow, Notification } from 'electron';
import { 
  getSettings, 
  saveSetting, 
  logToDb, 
  getRepositories, 
  saveReport, 
  getReportByDate,
  updateReportStatus
} from '../database';
import { scrapeRepoForDate, RepoScrapeResult, getGitGlobalConfig, filterCommitsForUser } from './gitService';
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

function triggerNotification(success: boolean, details?: string) {
  try {
    if (Notification.isSupported()) {
      const title = success ? 'Daily Report Success' : 'Daily Report Failed';
      const body = success 
        ? 'Daily report generated successfully.\n✓ Google Sheets updated\n✓ Gmail sent' 
        : `Daily report automation failed.\n${details || ''}`;
      
      new Notification({
        title,
        body,
      }).show();
    }
  } catch (err: any) {
    console.error('Notification error:', err.message);
  }
}

function isHtml(text: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(text);
}

function inlineMarkdownToHtml(text: string): string {
  let html = text;
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function convertMarkdownToHtml(md: string): string {
  const blocks = md.split(/\n\s*\n/);
  const processedBlocks = blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';

    if (trimmed.startsWith('#')) {
      const match = trimmed.match(/^(#{1,6})\s+(.*)$/s);
      if (match) {
        const level = match[1]!.length;
        const content = inlineMarkdownToHtml(match[2]!);
        return `<h${level}>${content}</h${level}>`;
      }
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const items = trimmed.split(/\n[\-\*]\s+/);
      const listItems = items.map((item, idx) => {
        let cleanItem = item;
        if (idx === 0) {
          cleanItem = item.replace(/^[\-\*]\s+/, '');
        }
        return `<li>${inlineMarkdownToHtml(cleanItem)}</li>`;
      }).join('');
      return `<ul>${listItems}</ul>`;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = trimmed.split(/\n\d+\.\s+/);
      const listItems = items.map((item, idx) => {
        let cleanItem = item;
        if (idx === 0) {
          cleanItem = item.replace(/^\d+\.\s+/, '');
        }
        return `<li>${inlineMarkdownToHtml(cleanItem)}</li>`;
      }).join('');
      return `<ol>${listItems}</ol>`;
    }

    return `<p>${inlineMarkdownToHtml(trimmed)}</p>`;
  });

  return processedBlocks.filter(Boolean).join('\n');
}

function ensureHtml(body: string): string {
  if (!body) return '';
  if (!isHtml(body)) {
    console.log("MIME Body is Markdown. Converting to HTML.");
    return convertMarkdownToHtml(body);
  }
  return body;
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
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const updatedStage = { status, message, timestamp: timeStr };
    const updated = {
      ...current,
      [stage]: updatedStage
    };
    this.activeRuns.set(dateStr, updated);
    sendToRenderer('orchestrator:status-change', updated);
  }

  public static async run(dateStr: string, forceAutoSend = false): Promise<boolean> {
    const current = this.getStatus(dateStr);
    if (current.overall === 'running') {
      logToDb('WARN', 'SCHEDULER', `Report orchestration already running for date: ${dateStr}. Skipping run.`);
      return false;
    }

    logToDb('INFO', 'SYSTEM', `DailyReportOrchestrator: Starting automation flow for date: ${dateStr}`);
    
    // Initialize Status
    const startTime = Date.now();
    this.updateStatus(dateStr, {
      overall: 'running',
      git: { status: 'running', message: 'Running...' },
      ai: { status: 'idle' },
      excel: { status: 'idle' },
      gmail: { status: 'idle' },
      errorMessage: undefined
    });

    const repos = getRepositories();
    if (repos.length === 0) {
      const msg = 'No repositories are configured.';
      logToDb('WARN', 'SCHEDULER', msg);
      this.updateStage(dateStr, 'git', 'failed', 'Failed');
      this.updateStatus(dateStr, { overall: 'failed', errorMessage: msg });
      triggerNotification(false, 'No repositories are configured.');
      return false;
    }

    // --- STAGE 1: Git Commit Scraper ---
    logToDb('INFO', 'SYSTEM', 'Scanning repositories...');
    const rawScrapeResults: RepoScrapeResult[] = [];
    for (const repo of repos) {
      try {
        const result = await scrapeRepoForDate(repo.path, dateStr);
        rawScrapeResults.push(result);
        saveSetting(`lastScanTime_${repo.id}`, new Date().toISOString());
      } catch (err: any) {
        logToDb('ERROR', 'GIT', `Failed to scrape repo ${repo.name}: ${err.message}`);
      }
    }

    const settings = getSettings();
    let devName = settings.developerName || '';
    let devEmail = settings.developerEmail || '';

    if (!devName || !devEmail) {
      if (repos.length > 0 && repos[0]?.path) {
        try {
          const fallbackConfig = await getGitGlobalConfig(repos[0].path);
          if (!devName) devName = fallbackConfig.name;
          if (!devEmail) devEmail = fallbackConfig.email;
          logToDb('INFO', 'GIT', `Using Git system config fallback for author matching: Name="${devName}", Email="${devEmail}"`);
        } catch (e) {}
      }
    }

    const scrapeResults: RepoScrapeResult[] = [];
    let totalCommits = 0;

    for (const result of rawScrapeResults) {
      const { filtered, stats } = filterCommitsForUser(result.commits, devName, devEmail);

      // Log statistics exactly as required
      logToDb('INFO', 'GIT', `Repository: ${result.repoName}`);
      logToDb('INFO', 'GIT', `Total commits scanned: ${stats.totalScanned}`);
      logToDb('INFO', 'GIT', `Commits by current user: ${stats.byCurrentUser}`);
      logToDb('INFO', 'GIT', `Merge commits ignored: ${stats.mergeCommitsIgnored}`);
      logToDb('INFO', 'GIT', `Remote commits ignored: ${stats.remoteCommitsIgnored}`);
      logToDb('INFO', 'GIT', `Synchronization commits ignored: ${stats.syncCommitsIgnored}`);
      logToDb('INFO', 'GIT', `Final commits sent to LLM: ${stats.finalSent}`);

      totalCommits += stats.finalSent;
      scrapeResults.push({
        ...result,
        commits: filtered
      });
    }

    const manualNotes = settings.todayWorkNotes || '';

    logToDb('INFO', 'SYSTEM', totalCommits === 0 
      ? (manualNotes.trim() ? 'No commits found. Proceeding with manual work notes.' : 'No commits or manual notes found. Using default fallback report.') 
      : 'Git Scraping Completed');
    this.updateStage(dateStr, 'git', 'success', 'Completed');
    this.updateStage(dateStr, 'ai', 'running', 'Running...');

    // --- STAGE 2: LLM Report Generation / Fallback ---
    let llmResult;
    try {
      if (totalCommits === 0 && !manualNotes.trim()) {
        logToDb('INFO', 'SYSTEM', 'Generating default report for site testing and feature discussion.');
        
        const dateObj = new Date(dateStr + 'T00:00:00');
        const formattedDate = dateObj.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        });
        const signature = settings.emailSignature || `Regards,\n\nAbhijith B\nDeveloper Intern\nKerala Development and Innovation Strategic Council (KDISC)`;
        const signatureHtml = signature.replace(/\n/g, '<br>');

        llmResult = {
          report: `Daily Development Report

- Performed site testing and local verification of the build.
- Participated in discussions regarding upcoming feature implementation strategies.
- Worked on local testing and code sanity checks.`,
          emailSubject: `Daily Development Report - ${formattedDate}`,
          emailBody: `<p>Hi Team,</p>
<p>Please find my daily report for today:</p>
<ul>
  <li>Performed site testing and local verification of the build.</li>
  <li>Participated in discussions regarding upcoming feature implementation strategies.</li>
  <li>Worked on local testing and code sanity checks.</li>
</ul>
<p><strong>Remarks:</strong> Site testing and feature discussion</p>
<p><strong>Meeting Details:</strong> Discussed feature implementation strategy.</p>
<br>
<p>${signatureHtml}</p>`,
          remarks: "Site testing and feature discussion",
          meetingDetails: "Discussed feature implementation strategy.",
          providerUsed: "Default Fallback",
          recoveryActions: ["Bypassed LLM due to no git or manual entry"],
          warnings: ["Generated default report due to lack of commits and manual notes."]
        };
      } else {
        logToDb('INFO', 'SYSTEM', 'Generating AI report...');
        llmResult = await generateReportFromLLM(dateStr, scrapeResults);

        if (!llmResult.report) {
          const errMsg = 'report is empty. Stopping report pipeline.';
          logToDb('ERROR', 'SYSTEM', errMsg);
          throw new Error(errMsg);
        }
        if (!llmResult.emailSubject) {
          const errMsg = 'emailSubject is empty. Stopping report pipeline.';
          logToDb('ERROR', 'SYSTEM', errMsg);
          throw new Error(errMsg);
        }
        if (!llmResult.emailBody) {
          const errMsg = 'emailBody is empty. Stopping Gmail delivery.';
          logToDb('ERROR', 'SYSTEM', errMsg);
          throw new Error(errMsg);
        }

        // Ensure valid HTML body
        llmResult.emailBody = ensureHtml(llmResult.emailBody);
      }

      logToDb('INFO', 'SYSTEM', 'LLM Report Generated');
      logToDb('INFO', 'SYSTEM', 'Email Subject Generated');
      logToDb('INFO', 'SYSTEM', 'Email HTML Generated');

      const recoveryMsg = (llmResult.recoveryActions && llmResult.recoveryActions.length > 0) ? 'Recovered' : 'Completed';
      this.updateStage(dateStr, 'ai', 'success', recoveryMsg);
    } catch (err: any) {
      const errMsg = err.message.includes('Stopping') ? err.message : `LLM Generation failed: ${err.message}`;
      logToDb('ERROR', 'LLM', errMsg);
      
      saveReport({
        report_date: dateStr,
        commit_data: JSON.stringify(scrapeResults),
        report_content: '',
        email_content: JSON.stringify({
          subject: '',
          body: '',
          remarks: '',
          meetingDetails: '',
          providerUsed: 'Failed',
          recoveryActions: ['AI generation failed'],
          warnings: [errMsg],
          durationMs: Date.now() - startTime,
          reposScanned: repos.map(r => r.name),
          commitsProcessed: totalCommits,
          timestamp: new Date().toISOString()
        }),
        excel_status: 'failed',
        email_status: 'failed',
        error_message: errMsg
      });

      this.updateStage(dateStr, 'ai', 'failed', 'Failed');
      this.updateStatus(dateStr, { overall: 'failed', errorMessage: errMsg });
      triggerNotification(false, `Gemini generation failed.\nGoogle Sheets skipped\nEmail skipped`);
      return false;
    }

    const autoSend = forceAutoSend || settings.autoSendWithoutPreview !== 'false';

    if (!autoSend) {
      // Pause pipeline and wait for user approval
      this.updateStage(dateStr, 'excel', 'idle', 'Running...');
      this.updateStage(dateStr, 'gmail', 'idle', 'Running...');
      this.updateStatus(dateStr, { overall: 'paused', errorMessage: 'Report ready for preview.' });

      const emailContentObj = {
        subject: llmResult.emailSubject,
        body: llmResult.emailBody,
        remarks: llmResult.remarks,
        meetingDetails: llmResult.meetingDetails,
        providerUsed: llmResult.providerUsed,
        recoveryActions: llmResult.recoveryActions || [],
        warnings: llmResult.warnings || [],
        durationMs: Date.now() - startTime,
        reposScanned: repos.map(r => r.name),
        commitsProcessed: totalCommits,
        timestamp: new Date().toISOString()
      };

      saveReport({
        report_date: dateStr,
        commit_data: JSON.stringify(scrapeResults),
        report_content: llmResult.report,
        email_content: JSON.stringify(emailContentObj),
        excel_status: 'pending',
        email_status: 'pending'
      });

      return true;
    }

    let excelFailed = false;
    let emailFailed = false;
    let combinedError = '';

    // --- STAGE 3: Google Sheets Row Appender ---
    logToDb('INFO', 'SYSTEM', 'Appending Google Sheet Row');
    this.updateStage(dateStr, 'excel', 'running', 'Running...');
    if (settings.excelPath) {
      try {
        await appendReportToExcel({
          dateStr,
          reportContent: llmResult.report,
          repoNames: scrapeResults.map(r => r.repoName),
          remarks: llmResult.remarks,
          meetingDetails: llmResult.meetingDetails
        });
        logToDb('INFO', 'SYSTEM', 'Google Sheet Updated Successfully');
        this.updateStage(dateStr, 'excel', 'success', 'Completed');
      } catch (err: any) {
        excelFailed = true;
        combinedError += `Google Sheets: ${err.message}. `;
        logToDb('ERROR', 'EXCEL', `Google Sheets append failed: ${err.message}`);
        this.updateStage(dateStr, 'excel', 'failed', 'Failed');
      }
    } else {
      logToDb('WARN', 'EXCEL', 'Google Sheets URL is not configured. Skipping.');
      this.updateStage(dateStr, 'excel', 'success', 'Completed');
    }

    // --- STAGE 4: Gmail oauth sender ---
    logToDb('INFO', 'SYSTEM', 'Sending Gmail');
    this.updateStage(dateStr, 'gmail', 'running', 'Running...');
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
        logToDb('INFO', 'SYSTEM', 'Email Sent Successfully');
        this.updateStage(dateStr, 'gmail', 'success', 'Completed');
      } catch (err: any) {
        emailFailed = true;
        combinedError += `Gmail: ${err.message}. `;
        logToDb('ERROR', 'GMAIL', `Email send failed: ${err.message}`);
        this.updateStage(dateStr, 'gmail', 'failed', 'Failed');
      }
    } else {
      logToDb('WARN', 'GMAIL', 'Gmail recipients not set. Skipping.');
      this.updateStage(dateStr, 'gmail', 'success', 'Completed');
    }

    // Wrap-up status
    const durationMs = Date.now() - startTime;
    const finalEmailContentObj = {
      subject: llmResult.emailSubject,
      body: llmResult.emailBody,
      remarks: llmResult.remarks,
      meetingDetails: llmResult.meetingDetails,
      providerUsed: llmResult.providerUsed,
      recoveryActions: llmResult.recoveryActions || [],
      warnings: llmResult.warnings || [],
      durationMs,
      reposScanned: repos.map(r => r.name),
      commitsProcessed: totalCommits,
      timestamp: new Date().toISOString()
    };

    saveReport({
      report_date: dateStr,
      commit_data: JSON.stringify(scrapeResults),
      report_content: llmResult.report,
      email_content: JSON.stringify(finalEmailContentObj),
      excel_status: excelFailed ? 'failed' : (settings.excelPath ? 'updated' : 'sent'), // backward compatibility value
      email_status: emailFailed ? 'failed' : (toRaw ? 'sent' : 'sent'),
      error_message: combinedError.trim() || undefined
    });

    if (excelFailed || emailFailed) {
      logToDb('ERROR', 'SYSTEM', `Automation pipeline failed: ${combinedError.trim()}`);
      this.updateStatus(dateStr, { overall: 'failed', errorMessage: combinedError.trim() });
      triggerNotification(false, combinedError.trim());
      return false;
    } else {
      logToDb('INFO', 'SYSTEM', 'Automation completed successfully.');
      this.updateStatus(dateStr, { overall: 'success' });
      saveSetting('todayWorkNotes', ''); // Clear manual work notes
      triggerNotification(true);
      return true;
    }
  }

  public static async approveAndSend(
    dateStr: string,
    editedReport: string,
    editedEmailSubject: string,
    editedEmailBody: string
  ): Promise<boolean> {
    const current = this.getStatus(dateStr);
    if (current.overall !== 'paused') {
      throw new Error('Pipeline is not in a paused state.');
    }

    logToDb('INFO', 'SYSTEM', `Resuming report orchestration for date: ${dateStr} after approval.`);

    this.updateStatus(dateStr, {
      overall: 'running',
      errorMessage: undefined
    });
    this.updateStage(dateStr, 'excel', 'running', 'Running...');
    this.updateStage(dateStr, 'gmail', 'running', 'Running...');

    // Save approved report to DB
    const reportData = getReportByDate(dateStr);
    if (!reportData) {
      throw new Error(`Report not found for date ${dateStr}`);
    }

    if (!editedReport) {
      const errMsg = 'report is empty. Stopping report pipeline.';
      logToDb('ERROR', 'SYSTEM', errMsg);
      throw new Error(errMsg);
    }
    if (!editedEmailSubject) {
      const errMsg = 'emailSubject is empty. Stopping report pipeline.';
      logToDb('ERROR', 'SYSTEM', errMsg);
      throw new Error(errMsg);
    }
    if (!editedEmailBody) {
      const errMsg = 'emailBody is empty. Stopping Gmail delivery.';
      logToDb('ERROR', 'SYSTEM', errMsg);
      throw new Error(errMsg);
    }

    const finalEmailBody = ensureHtml(editedEmailBody);

    let remarks = '';
    let meetingDetails = '';
    let providerUsed = 'None';
    let recoveryActions: string[] = [];
    let warnings: string[] = [];
    let durationMs = 0;
    let reposScanned: string[] = [];
    let commitsProcessed = 0;
    try {
      const parsed = JSON.parse(reportData.email_content);
      remarks = parsed.remarks || '';
      meetingDetails = parsed.meetingDetails || '';
      providerUsed = parsed.providerUsed || 'None';
      recoveryActions = parsed.recoveryActions || [];
      warnings = parsed.warnings || [];
      durationMs = parsed.durationMs || 0;
      reposScanned = parsed.reposScanned || [];
      commitsProcessed = parsed.commitsProcessed || 0;
    } catch (e) {
      // fallback
    }

    // Save a placeholder to update DB text
    saveReport({
      report_date: dateStr,
      commit_data: reportData.commit_data,
      report_content: editedReport,
      email_content: JSON.stringify({
        subject: editedEmailSubject,
        body: finalEmailBody,
        remarks,
        meetingDetails,
        providerUsed,
        recoveryActions,
        warnings,
        durationMs,
        reposScanned,
        commitsProcessed,
        timestamp: new Date().toISOString()
      }),
      excel_status: 'pending',
      email_status: 'pending'
    });

    const scrapeResults = JSON.parse(reportData.commit_data);
    const settings = getSettings();
    let excelFailed = false;
    let emailFailed = false;
    let combinedError = '';

    // --- STAGE 3: Google Sheets Row Appender ---
    logToDb('INFO', 'SYSTEM', 'Appending Google Sheet Row');
    if (settings.excelPath) {
      try {
        await appendReportToExcel({
          dateStr,
          reportContent: editedReport,
          repoNames: scrapeResults.map((r: any) => r.repoName),
          remarks,
          meetingDetails
        });
        logToDb('INFO', 'SYSTEM', 'Google Sheet Updated Successfully');
        this.updateStage(dateStr, 'excel', 'success', 'Completed');
      } catch (err: any) {
        excelFailed = true;
        combinedError += `Google Sheets: ${err.message}. `;
        logToDb('ERROR', 'EXCEL', `Google Sheets append failed: ${err.message}`);
        this.updateStage(dateStr, 'excel', 'failed', 'Failed');
      }
    } else {
      this.updateStage(dateStr, 'excel', 'success', 'Completed');
    }

    // --- STAGE 4: Gmail oauth sender ---
    logToDb('INFO', 'SYSTEM', 'Sending Gmail');
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
          subject: editedEmailSubject,
          htmlBody: finalEmailBody
        });
        logToDb('INFO', 'SYSTEM', 'Email Sent Successfully');
        this.updateStage(dateStr, 'gmail', 'success', 'Completed');
      } catch (err: any) {
        emailFailed = true;
        combinedError += `Gmail: ${err.message}. `;
        logToDb('ERROR', 'GMAIL', `Email send failed: ${err.message}`);
        this.updateStage(dateStr, 'gmail', 'failed', 'Failed');
      }
    } else {
      this.updateStage(dateStr, 'gmail', 'success', 'Completed');
    }

    // Save final report data with updated statuses
    saveReport({
      report_date: dateStr,
      commit_data: reportData.commit_data,
      report_content: editedReport,
      email_content: JSON.stringify({
        subject: editedEmailSubject,
        body: finalEmailBody,
        remarks,
        meetingDetails,
        providerUsed,
        recoveryActions,
        warnings,
        durationMs,
        reposScanned,
        commitsProcessed,
        timestamp: new Date().toISOString()
      }),
      excel_status: excelFailed ? 'failed' : (settings.excelPath ? 'updated' : 'sent'),
      email_status: emailFailed ? 'failed' : (toRaw ? 'sent' : 'sent'),
      error_message: combinedError.trim() || undefined
    });

    if (excelFailed || emailFailed) {
      logToDb('ERROR', 'SYSTEM', `Automation pipeline failed after approval: ${combinedError.trim()}`);
      this.updateStatus(dateStr, { overall: 'failed', errorMessage: combinedError.trim() });
      triggerNotification(false, combinedError.trim());
      return false;
    } else {
      logToDb('INFO', 'SYSTEM', 'Automation completed successfully after approval.');
      this.updateStatus(dateStr, { overall: 'success' });
      saveSetting('todayWorkNotes', ''); // Clear manual work notes
      triggerNotification(true);
      return true;
    }
  }

  public static async cancelReport(dateStr: string) {
    this.updateStatus(dateStr, {
      overall: 'failed',
      errorMessage: 'Report generation cancelled by user.',
      excel: { status: 'failed', message: 'Cancelled' },
      gmail: { status: 'failed', message: 'Cancelled' }
    });
    logToDb('INFO', 'SYSTEM', `Report generation for date ${dateStr} was cancelled.`);
  }

  public static async retryStage(dateStr: string, stage: 'ai' | 'excel' | 'gmail'): Promise<{ ok: boolean; error?: string }> {
    logToDb('INFO', 'SYSTEM', `Retrying stage ${stage} for date: ${dateStr}`);
    
    // Load existing report
    const report = getReportByDate(dateStr);
    if (!report) {
      return { ok: false, error: 'Report not found' };
    }

    const scrapeResults = JSON.parse(report.commit_data);
    const settings = getSettings();

    this.updateStatus(dateStr, {
      overall: 'running',
      errorMessage: undefined
    });

    if (stage === 'ai') {
      try {
        this.updateStage(dateStr, 'ai', 'running', 'Retrying summary generation...');
        const llmResult = await generateReportFromLLM(dateStr, scrapeResults);
        
        if (!llmResult.report) {
          const errMsg = 'report is empty. Stopping report pipeline.';
          logToDb('ERROR', 'SYSTEM', errMsg);
          throw new Error(errMsg);
        }
        if (!llmResult.emailSubject) {
          const errMsg = 'emailSubject is empty. Stopping report pipeline.';
          logToDb('ERROR', 'SYSTEM', errMsg);
          throw new Error(errMsg);
        }
        if (!llmResult.emailBody) {
          const errMsg = 'emailBody is empty. Stopping Gmail delivery.';
          logToDb('ERROR', 'SYSTEM', errMsg);
          throw new Error(errMsg);
        }

        llmResult.emailBody = ensureHtml(llmResult.emailBody);

        logToDb('INFO', 'SYSTEM', 'LLM Report Generated');
        logToDb('INFO', 'SYSTEM', 'Email Subject Generated');
        logToDb('INFO', 'SYSTEM', 'Email HTML Generated');

        // Save
        saveReport({
          report_date: dateStr,
          commit_data: report.commit_data,
          report_content: llmResult.report,
          email_content: JSON.stringify({
            subject: llmResult.emailSubject,
            body: llmResult.emailBody,
            remarks: llmResult.remarks,
            meetingDetails: llmResult.meetingDetails
          }),
          excel_status: 'pending',
          email_status: 'pending'
        });

        this.updateStage(dateStr, 'ai', 'success', 'Summary generated successfully.');
        
        // Auto continue to next stages
        const autoSend = settings.autoSendWithoutPreview !== 'false';
        if (autoSend) {
          const ok = await this.approveAndSend(dateStr, llmResult.report, llmResult.emailSubject, llmResult.emailBody);
          return { ok };
        } else {
          this.updateStatus(dateStr, { overall: 'paused', errorMessage: 'Report ready for preview.' });
          return { ok: true };
        }
      } catch (err: any) {
        logToDb('ERROR', 'LLM', `Retry LLM failed: ${err.message}`);
        this.updateStage(dateStr, 'ai', 'failed', err.message);
        this.updateStatus(dateStr, { overall: 'failed', errorMessage: err.message });
        return { ok: false, error: err.message };
      }
    }

    if (stage === 'excel') {
      try {
        this.updateStage(dateStr, 'excel', 'running', 'Retrying Google Sheets update...');
        if (!settings.excelPath) {
          throw new Error('Google Sheets URL is not configured.');
        }

        let remarks = '';
        let meetingDetails = '';
        try {
          const parsed = JSON.parse(report.email_content);
          remarks = parsed.remarks || '';
          meetingDetails = parsed.meetingDetails || '';
        } catch (e) {}

        logToDb('INFO', 'SYSTEM', 'Appending Google Sheet Row');
        await appendReportToExcel({
          dateStr,
          reportContent: report.report_content,
          repoNames: scrapeResults.map((r: any) => r.repoName),
          remarks,
          meetingDetails
        });
        updateReportStatus(dateStr, { excel_status: 'updated' });
        logToDb('INFO', 'SYSTEM', 'Google Sheet Updated Successfully');
        this.updateStage(dateStr, 'excel', 'success', 'Google Sheet updated successfully.');
        
        // Check if overall can be marked as success
        const updatedReport = getReportByDate(dateStr);
        if (updatedReport && updatedReport.email_status === 'sent') {
          this.updateStatus(dateStr, { overall: 'success' });
        } else {
          this.updateStatus(dateStr, { overall: 'failed', errorMessage: 'Email delivery still pending.' });
        }
        return { ok: true };
      } catch (err: any) {
        logToDb('ERROR', 'EXCEL', `Retry Google Sheets failed: ${err.message}`);
        this.updateStage(dateStr, 'excel', 'failed', err.message);
        this.updateStatus(dateStr, { overall: 'failed', errorMessage: err.message });
        return { ok: false, error: err.message };
      }
    }

    if (stage === 'gmail') {
      try {
        this.updateStage(dateStr, 'gmail', 'running', 'Retrying email delivery...');
        const toRaw = settings.emailTo;
        if (!toRaw) {
          throw new Error('Gmail recipients not set.');
        }
        let emailSubject = '';
        let emailBody = '';
        try {
          const parsed = JSON.parse(report.email_content);
          emailSubject = parsed.subject;
          emailBody = parsed.body;
        } catch (e) {
          emailSubject = `Daily Work Report - ${dateStr}`;
          emailBody = report.email_content;
        }

        if (!emailSubject) {
          const errMsg = 'emailSubject is empty. Stopping Gmail delivery.';
          logToDb('ERROR', 'GMAIL', errMsg);
          throw new Error(errMsg);
        }
        if (!emailBody) {
          const errMsg = 'emailBody is empty. Stopping Gmail delivery.';
          logToDb('ERROR', 'GMAIL', errMsg);
          throw new Error(errMsg);
        }

        const finalEmailBody = ensureHtml(emailBody);

        logToDb('INFO', 'SYSTEM', 'Sending Gmail');
        const to = toRaw.split(',').map((s: string) => s.trim()).filter(Boolean);
        const cc = settings.emailCc ? settings.emailCc.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
        const bcc = settings.emailBcc ? settings.emailBcc.split(',').map((s: string) => s.trim()).filter(Boolean) : [];

        await sendEmail({
          to,
          cc,
          bcc,
          subject: emailSubject,
          htmlBody: finalEmailBody
        });
        updateReportStatus(dateStr, { email_status: 'sent' });
        logToDb('INFO', 'SYSTEM', 'Email Sent Successfully');
        this.updateStage(dateStr, 'gmail', 'success', 'Email sent successfully.');

        // Check if overall can be marked as success
        const updatedReport = getReportByDate(dateStr);
        if (updatedReport && updatedReport.excel_status === 'updated') {
          this.updateStatus(dateStr, { overall: 'success' });
        } else {
          this.updateStatus(dateStr, { overall: 'failed', errorMessage: 'Google Sheets update still pending.' });
        }
        return { ok: true };
      } catch (err: any) {
        logToDb('ERROR', 'GMAIL', `Retry email failed: ${err.message}`);
        this.updateStage(dateStr, 'gmail', 'failed', err.message);
        this.updateStatus(dateStr, { overall: 'failed', errorMessage: err.message });
        return { ok: false, error: err.message };
      }
    }

    return { ok: false, error: 'Invalid stage' };
  }
}
