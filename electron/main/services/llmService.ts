import { getSettings, saveSetting, logToDb } from '../database';
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

export async function generateReportFromLLM(
  dateStr: string,
  scrapeResults: RepoScrapeResult[]
): Promise<GeneratedReportResult> {
  const settings = getSettings();
  const provider = settings.llmProvider || 'gemini';
  const apiKey = settings.geminiApiKey || '';
  const modelConfig = settings.llmModel || '';
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

  if (provider === 'gemini') {
    // 1. Discover available models dynamically
    let availableModels = await discoverGeminiModels(apiKey);
    
    // 2. Select initial model
    let initialModel = modelConfig.startsWith('models/') ? modelConfig.substring(7) : modelConfig;
    
    if (!initialModel || !availableModels.includes(initialModel)) {
      if (availableModels.length > 0) {
        const oldModel = initialModel || 'none';
        const fallback = availableModels[0] || '';
        
        console.log("Configured model:", oldModel);
        console.log("Selected fallback:", fallback);
        console.log("Old model:", oldModel);
        console.log("New model:", fallback);
        console.log("Reason: Configured model not found in available models list.");
        
        logToDb('WARN', 'LLM', `Configured model "${oldModel}" is invalid. Selected fallback: ${fallback}. Reason: Not found in available models.`);
        
        initialModel = fallback;
        saveSetting('llmModel', fallback);
      } else {
        throw new Error('No compatible Google Gemini models discovered. Please check your API key and network connection.');
      }
    }

    let activeModel = initialModel;
    console.log("Configured model:", modelConfig || 'none');
    console.log("Resolved model:", initialModel);
    console.log("Actual model sent:", activeModel);
    console.log("Available models:", availableModels.join(', '));

    const makeRequest = async (targetModel: string) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
      return await fetch(url, {
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
    };

    let response = await makeRequest(activeModel);
    let isErrorResponse = false;
    let errorText = '';

    if (!response.ok) {
      isErrorResponse = true;
      errorText = await response.text();
    }

    // 3. Self-healing / Retry if model not found or deprecated
    const shouldRetry = isErrorResponse && (
      response.status === 404 ||
      errorText.includes('NOT_FOUND') ||
      errorText.includes('Model not found') ||
      errorText.toLowerCase().includes('deprecated') ||
      errorText.toLowerCase().includes('not supported')
    );

    if (shouldRetry) {
      console.warn(`Gemini API call failed with model "${activeModel}". Status: ${response.status}. Initiating self-healing...`);
      logToDb('WARN', 'LLM', `Gemini request failed for model: ${activeModel}. Error: ${errorText}. Self-healing triggered.`);

      // Refresh list of models
      availableModels = await discoverGeminiModels(apiKey);
      
      // Filter out the failed model
      const remainingModels = availableModels.filter(m => m !== activeModel);
      
      if (remainingModels.length > 0) {
        const replacement = remainingModels[0] || '';
        
        console.log("Old model:", activeModel);
        console.log("New model:", replacement);
        console.log("Reason:", `API returned error status ${response.status} (${errorText})`);
        console.log("Selected fallback:", replacement);
        
        logToDb('INFO', 'LLM', `Self-healed. Old model: ${activeModel}, New model: ${replacement}. Reason: API error.`);
        
        activeModel = replacement;
        saveSetting('llmModel', replacement);
        
        // Retry the request once
        console.log("Actual model sent (retry):", activeModel);
        response = await makeRequest(activeModel);
        
        if (!response.ok) {
          errorText = await response.text();
          logToDb('ERROR', 'LLM', `Retry also failed. Gemini API error: ${errorText}`);
          throw new Error(`Gemini API returned error code ${response.status}: ${errorText}`);
        }
      } else {
        throw new Error(`Gemini API call failed with ${response.status}: ${errorText}. No alternative fallback models available.`);
      }
    } else if (isErrorResponse) {
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
        model: modelConfig || 'gpt-4o-mini',
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
