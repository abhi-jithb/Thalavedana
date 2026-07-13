import { getSettings, logToDb } from '../database';
import type { RepoScrapeResult } from './gitService';

export interface GeneratedReportResult {
  report: string;
  emailSubject: string;
  emailBody: string;
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

export async function generateReportFromLLM(
  dateStr: string,
  scrapeResults: RepoScrapeResult[]
): Promise<GeneratedReportResult> {
  const settings = getSettings();
  const provider = settings.llmProvider || 'gemini';
  const apiKey = settings.geminiApiKey || '';
  const model = settings.llmModel || (provider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini');
  const endpoint = settings.llmEndpoint || '';

  if (!apiKey && provider === 'gemini') {
    throw new Error('Gemini API key is not configured');
  } else if (!apiKey && provider === 'openai-compatible') {
    throw new Error('API key is not configured for OpenAI-compatible provider');
  }

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

  if (!gitHistoryText) {
    throw new Error('No commit history data to send to LLM');
  }

  const systemInstructions = `You are a professional internship work reporting assistant. 
Your task is to summarize the provided Git commit logs and diff patches into a professional daily work report and a professional email.

Strict Rules:
1. Be professional, concise, and factual.
2. NO exaggeration and NO invented work. Do not assume or add details that are not present in the git commit messages or diffs.
3. Only summarize the supplied git information.
4. If there is insufficient information, clearly indicate uncertainty rather than inventing details.
5. The email should be a professional, neat HTML format, suitable to send to supervisors/managers.
6. The report should be a clear, professional Markdown format.

You MUST respond ONLY with a raw JSON object containing these keys:
{
  "report": "Markdown string of the daily report",
  "emailSubject": "String for email subject line",
  "emailBody": "HTML formatted email body string"
}`;

  const prompt = `Date: ${dateStr}\n\nHere is the Git commit history and diffs for today:\n\n${gitHistoryText}`;

  logToDb('INFO', 'LLM', `Sending query to LLM provider: ${provider} (Model: ${model})`);

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${systemInstructions}\n\n${prompt}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              report: { type: 'STRING' },
              emailSubject: { type: 'STRING' },
              emailBody: { type: 'STRING' },
            },
            required: ['report', 'emailSubject', 'emailBody'],
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logToDb('ERROR', 'LLM', `Gemini API error: ${errorText}`);
      throw new Error(`Gemini API returned error code ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    try {
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Empty response from Gemini');
      }
      const parsed = cleanJsonResponse(text);
      logToDb('INFO', 'LLM', 'Successfully generated report and email using Gemini');
      return parsed;
    } catch (err: any) {
      logToDb('ERROR', 'LLM', `Failed to parse Gemini output: ${err.message}`);
      throw new Error(`Failed to parse LLM output: ${err.message}. Raw output: ${JSON.stringify(data)}`);
    }
  } else {
    // OpenAI-compatible provider
    const targetUrl = endpoint || 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemInstructions },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logToDb('ERROR', 'LLM', `${provider} API error: ${errorText}`);
      throw new Error(`${provider} API returned error code ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    try {
      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error(`Empty response from ${provider}`);
      }
      const parsed = cleanJsonResponse(text);
      logToDb('INFO', 'LLM', `Successfully generated report using ${provider}`);
      return parsed;
    } catch (err: any) {
      logToDb('ERROR', 'LLM', `Failed to parse ${provider} output: ${err.message}`);
      throw new Error(`Failed to parse LLM output: ${err.message}`);
    }
  }
}
