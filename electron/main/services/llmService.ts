import { getSettings, saveSetting, logToDb } from '../database';
import type { RepoScrapeResult } from './gitService';

export interface GeneratedReportResult {
  report: string;
  emailSubject: string;
  emailBody: string;
  remarks: string;
  meetingDetails: string;
  providerUsed?: string;
  recoveryActions?: string[];
  warnings?: string[];
}

// Clean response JSON helper in case the LLM wraps it in markdown code blocks
function cleanJsonResponse(rawText: string): any {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return JSON.parse(cleaned.trim());
}

// Extracts the major/minor numerical version from the model name (e.g. gemini-2.5-flash -> 2.5)
function extractGeminiVersion(name: string): number {
  const match = name.match(/gemini-(\d+(\.\d+)?)/i);
  if (match && match[1]) {
    return parseFloat(match[1]);
  }
  return 0;
}

// Identifies if a model is a stable Flash model
const isStableFlash = (name: string): boolean => {
  const lower = name.toLowerCase();
  return lower.includes('flash') && 
         !lower.includes('preview') && 
         !lower.includes('exp') && 
         !lower.includes('tuned') && 
         !lower.includes('lite') && 
         !lower.includes('00'); // Exclude specific build versions
};

// Identifies if a model is a stable Pro model
const isStablePro = (name: string): boolean => {
  const lower = name.toLowerCase();
  return lower.includes('pro') && 
         !lower.includes('preview') && 
         !lower.includes('exp') && 
         !lower.includes('tuned') && 
         !lower.includes('lite') && 
         !lower.includes('ultra') &&
         !lower.includes('00');
};

// Dynamic discovery of Google Gemini models from Google API
async function discoverGeminiModels(apiKey: string): Promise<string[]> {
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listRes = await fetch(listUrl);
    if (!listRes.ok) {
      console.error(`Failed to list Gemini models. Status: ${listRes.status}`);
      return [];
    }
    const listData = await listRes.json();
    const rawModels: any[] = listData.models || [];
    
    // Filter only models that support generateContent
    const filtered = rawModels.filter(m => 
      m.supportedGenerationMethods?.includes('generateContent') ||
      m.supportedGenerationMethods?.includes('generateMessage')
    );

    // Group and sort descending by version number
    const stableFlash = filtered.filter(m => isStableFlash(m.name))
      .sort((a, b) => extractGeminiVersion(b.name) - extractGeminiVersion(a.name));

    const stablePro = filtered.filter(m => isStablePro(m.name))
      .sort((a, b) => extractGeminiVersion(b.name) - extractGeminiVersion(a.name));

    const anyGemini = filtered.filter(m => m.name.toLowerCase().includes('gemini'))
      .sort((a, b) => extractGeminiVersion(b.name) - extractGeminiVersion(a.name));

    const anyText = filtered;

    const orderedModels: any[] = [
      ...stableFlash,
      ...stablePro,
      ...anyGemini,
      ...anyText
    ];

    // Strip 'models/' prefix and filter unique values
    const names = orderedModels.map(m => {
      const name = m.name || '';
      return name.startsWith('models/') ? name.substring(7) : name;
    }).filter(Boolean);

    return Array.from(new Set(names));
  } catch (err: any) {
    console.error("Error discovering Gemini models:", err.message);
    return [];
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function getGeminiErrorDetails(status: number, errorText: string): { action: 'retry' | 'switch_key' | 'self_heal'; message: string } {
  const lower = errorText.toLowerCase();
  if (status === 404 || 
      lower.includes('not_found') || 
      lower.includes('model not found') || 
      lower.includes('deprecated') || 
      lower.includes('not supported') || 
      lower.includes('removed') || 
      lower.includes('not available')) {
    return { action: 'self_heal', message: 'Model unavailable or deprecated' };
  }
  if (status === 400 || status === 403 ||
      lower.includes('api_key_invalid') ||
      lower.includes('permission_denied') ||
      lower.includes('key revoked') ||
      lower.includes('quota') ||
      lower.includes('limit exceeded') ||
      lower.includes('authentication') ||
      lower.includes('invalid_grant')) {
    return { action: 'switch_key', message: 'API key authorization or quota failure' };
  }
  if (status === 429 || status === 500 || status === 502 || status === 503) {
    return { action: 'retry', message: `Server error status ${status}` };
  }
  return { action: 'switch_key', message: `Unhandled API response ${status}: ${errorText}` };
}

export async function generateReportFromLLM(
  dateStr: string,
  scrapeResults: RepoScrapeResult[]
): Promise<GeneratedReportResult> {
  const settings = getSettings();
  const providerConfig = settings.llmProvider || 'gemini';
  
  // Format scraped commits into text
  let gitHistoryText = '';
  for (const repo of scrapeResults) {
    if (repo.commits.length === 0) continue;
    gitHistoryText += `Repository: ${repo.repoName} (Branch: ${repo.branchName})\n`;
    for (const commit of repo.commits) {
      gitHistoryText += `  - Commit: ${commit.hash} by ${commit.author} on ${commit.date}\n`;
      gitHistoryText += `    Message: ${commit.message}\n`;
      gitHistoryText += `    Changed Files:\n`;
      for (const file of commit.changedFiles) {
        gitHistoryText += `      [${file.status}] ${file.file}\n`;
      }
      gitHistoryText += `    Diff Summary: ${commit.diffSummary}\n`;
      if (commit.patch) {
        gitHistoryText += `    Diff Patch:\n${commit.patch}\n`;
      }
      gitHistoryText += `\n`;
    }
  }

  const manualNotes = settings.todayWorkNotes || '';
  if (!gitHistoryText && !manualNotes.trim()) {
    throw new Error('No commit history data or manual work notes to send to LLM');
  }

  const dateObj = new Date(dateStr + 'T00:00:00');
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const signature = settings.emailSignature || `Regards,\n\nAbhijith B\nDeveloper Intern\nKerala Development and Innovation Strategic Council (KDISC)`;
  const signatureHtml = signature.replace(/\n/g, '<br>');

  const workStart = settings.workStartTime || '10:00 AM';
  const workEnd = settings.workEndTime || '05:30 PM';

  const systemInstructions = `You are a professional internship work reporting assistant. 
Your task is to summarize the provided daily work data (Git commits and/or manual notes) into a professional daily work report, a professional email, a concise one-line remark, and meeting details.

You are generating a personal daily work report.
There are TWO possible data sources provided in the user prompt:
- Source 1: Verified Git commits.
- Source 2: Manual work notes entered by the user.

Strict Rules:
1. Describe ONLY work completed by the developer whose commits or manual notes are provided.
2. Never fabricate work or invent accomplishments.
3. Never claim teammate commits or pulled changes as user implementation.
4. If the user mentions pulling teammate changes or code (e.g. "pulled latest dashboard"), summarize it only as testing, review, or validation work locally—NEVER as personal implementation.
5. If the manual notes contain words like "Tested", "Validated", "Verified", "Reviewed", "Debugged", "Investigated", "Researched", "Refactored", "Optimized", generate professional descriptions of those testing/review activities (e.g., "Validated the newly integrated district-wise WhatsApp functionality in the local development environment and confirmed expected behavior").
6. If the manual notes mention meetings (e.g., "Discussed deployment strategy with mentor", "Requirement clarification meeting"), summarize them professionally inside the "meetingDetails" field. If no meetings are mentioned in either source, set "meetingDetails" to an empty string. Do NOT invent meetings.
7. If the provided data only contains synchronization or merge activity and no manual notes, state that no personal development work was detected.
8. Be professional, concise, and factual.
9. The email MUST be a professional, neat HTML format, suitable to send to supervisors/managers.
10. The emailSubject MUST be exactly "Daily Development Report - ${formattedDate}".
11. The emailBody HTML MUST conclude with this exact signature:
<p>${signatureHtml}</p>
12. The report MUST be a clear, professional Markdown format. The report title/header MUST be "Daily Development Report".
13. Do NOT estimate, mention, or use Git commit timestamps to state working hours. The official work hours for this report are ${workStart} to ${workEnd}.
14. Generate a concise one-line remark based on the day's work.

You MUST respond ONLY with a raw JSON object containing these keys:
{
  "report": "Markdown string of the daily report",
  "emailSubject": "String for email subject line",
  "emailBody": "HTML formatted email body string",
  "remarks": "String for a concise one-line remark based on the day's work",
  "meetingDetails": "String for summary of meetings or discussions, or empty string"
}`;

  let prompt = `Date: ${dateStr}\nOfficial Work Hours: ${workStart} - ${workEnd}\n\n`;
  if (gitHistoryText) {
    prompt += `Source 1: Verified Git commits:\n${gitHistoryText}\n\n`;
  } else {
    prompt += `Source 1: Verified Git commits:\nNo Git commits detected for today.\n\n`;
  }
  if (manualNotes.trim()) {
    prompt += `Source 2: Manual work notes entered by the user:\n${manualNotes.trim()}\n\n`;
  } else {
    prompt += `Source 2: Manual work notes entered by the user:\nNo manual notes entered.\n\n`;
  }

  const recoveryActions: string[] = [];
  const warnings: string[] = [];
  let retriesCount = 0;

  // Gather Gemini keys
  const geminiKeys: string[] = [];
  if (settings.geminiApiKey1) geminiKeys.push(settings.geminiApiKey1);
  else if (settings.geminiApiKey) geminiKeys.push(settings.geminiApiKey); // legacy key fallback
  if (settings.geminiApiKey2) geminiKeys.push(settings.geminiApiKey2);
  if (settings.geminiApiKey3) geminiKeys.push(settings.geminiApiKey3);

  const geminiEnabled = settings.geminiEnabled !== 'false';
  const groqEnabled = settings.groqEnabled !== 'false';
  const groqApiKey = settings.groqApiKey || '';
  const groqModel = settings.groqModel || 'llama-3.3-70b-versatile';

  // 1. Try Gemini Provider if enabled and keys exist
  if (geminiEnabled && geminiKeys.length > 0) {
    for (let keyIdx = 0; keyIdx < geminiKeys.length; keyIdx++) {
      const currentKey = geminiKeys[keyIdx]!;
      const keyLabel = `Gemini (Key ${keyIdx + 1})`;
      logToDb('INFO', 'LLM', `Trying Gemini API key ${keyIdx + 1} of ${geminiKeys.length}`);

      let modelConfig = settings.llmModel || 'gemini-2.5-flash';
      let activeModel = modelConfig.startsWith('models/') ? modelConfig.substring(7) : modelConfig;

      // Ensure model exists
      let availableModels = await discoverGeminiModels(currentKey);
      if (availableModels.length > 0 && !availableModels.includes(activeModel)) {
        const replacement = availableModels[0]!;
        warnings.push(`Model ${activeModel} not found for key ${keyIdx + 1}. Auto-selected compatible model ${replacement}`);
        activeModel = replacement;
        saveSetting('llmModel', replacement);
      }

      let attempt = 0;
      let keyFailed = false;

      while (attempt <= 2 && !keyFailed) {
        if (attempt > 0) {
          const waitMs = attempt === 1 ? 2000 : 5000;
          retriesCount++;
          recoveryActions.push(`${keyLabel} retry ${attempt} (waiting ${waitMs / 1000}s)`);
          logToDb('WARN', 'LLM', `Retrying ${keyLabel} in ${waitMs / 1000}s due to temporary network/rate-limit error...`);
          await sleep(waitMs);
        }

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${currentKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ parts: [{ text: `${systemInstructions}\n\n${prompt}` }] }],
              generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: 'OBJECT',
                  properties: {
                    report: { type: 'STRING' },
                    emailSubject: { type: 'STRING' },
                    emailBody: { type: 'STRING' },
                    remarks: { type: 'STRING' },
                    meetingDetails: { type: 'STRING' },
                  },
                  required: ['report', 'emailSubject', 'emailBody', 'remarks', 'meetingDetails'],
                },
              },
            }),
          });
          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
              throw new Error('Empty response from Gemini');
            }
            const parsed = cleanJsonResponse(text);
            logToDb('INFO', 'LLM', `Successfully generated report using ${keyLabel}`);
            
            return {
              ...parsed,
              providerUsed: keyLabel,
              recoveryActions,
              warnings
            };
          }

          // Error status returned
          const status = response.status;
          const errorText = await response.text();
          const classification = getGeminiErrorDetails(status, errorText);

          if (classification.action === 'self_heal') {
            recoveryActions.push(`${keyLabel} self-healed: ${activeModel} -> ${classification.message}`);
            logToDb('WARN', 'LLM', `Model error detected for ${activeModel}. Triggering self-healing...`);
            
            availableModels = await discoverGeminiModels(currentKey);
            const remaining = availableModels.filter(m => m !== activeModel);
            if (remaining.length > 0) {
              activeModel = remaining[0]!;
              saveSetting('llmModel', activeModel);
              attempt = 0; // restart attempts with new model
              continue;
            } else {
              keyFailed = true;
              recoveryActions.push(`${keyLabel} switch key: No fallback model discovered`);
              logToDb('ERROR', 'LLM', `Self-heal failed: No compatible alternative model for ${keyLabel}`);
            }
          } else if (classification.action === 'switch_key') {
            keyFailed = true;
            recoveryActions.push(`${keyLabel} switch key: ${classification.message} (Status ${status})`);
            logToDb('ERROR', 'LLM', `${keyLabel} failed permanently: ${classification.message}. Switching to next key...`);
          } else {
            // retryable
            attempt++;
          }

        } catch (fetchErr: any) {
          logToDb('WARN', 'LLM', `${keyLabel} fetch error: ${fetchErr.message || fetchErr}`);
          // Timeout / network error is retryable
          attempt++;
        }
      }
    }
  }

  // 2. Try Groq Provider if enabled/fallback is needed and Groq API key is present
  if (groqEnabled && groqApiKey) {
    const keyLabel = 'Groq';
    logToDb('INFO', 'LLM', `Falling back to Groq provider using model ${groqModel}`);
    recoveryActions.push('Fell back to Groq');

    let attempt = 0;
    while (attempt <= 2) {
      if (attempt > 0) {
        const waitMs = attempt === 1 ? 2000 : 5000;
        retriesCount++;
        recoveryActions.push(`Groq retry ${attempt} (waiting ${waitMs / 1000}s)`);
        logToDb('WARN', 'LLM', `Retrying Groq in ${waitMs / 1000}s...`);
        await sleep(waitMs);
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqApiKey}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: groqModel,
            messages: [
              { role: 'system', content: systemInstructions },
              { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
          }),
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const text = data.choices?.[0]?.message?.content;
          if (!text) {
            throw new Error('Empty response from Groq');
          }
          const parsed = cleanJsonResponse(text);
          logToDb('INFO', 'LLM', 'Successfully generated report using Groq');
          return {
            ...parsed,
            providerUsed: keyLabel,
            recoveryActions,
            warnings
          };
        }

        const status = response.status;
        const errorText = await response.text();
        logToDb('ERROR', 'LLM', `Groq API error status ${status}: ${errorText}`);

        // Only retry on 429, 500, 502, 503
        if (status === 429 || status === 500 || status === 502 || status === 503) {
          attempt++;
        } else {
          throw new Error(`Groq returned permanent error status ${status}`);
        }

      } catch (err: any) {
        logToDb('WARN', 'LLM', `Groq exception: ${err.message || err}`);
        attempt++;
      }
    }
  }

  // 3. Complete failure
  throw new Error('All configured LLM providers and fallbacks failed to generate the report.');
}
