import { google } from 'googleapis';
import { getSettings, logToDb } from '../database';
import { getOAuth2Client } from './gmailService';

export interface ColumnMapping {
  col: string; // "A", "B", "C", etc.
  type: 'date' | 'report' | 'repositories' | 'fixed' | 'empty';
  fixedValue?: string;
}

// Helper to extract Spreadsheet ID from URL or return it directly
function extractSpreadsheetId(urlOrId: string): string {
  if (!urlOrId) return '';
  const match = urlOrId.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return urlOrId.trim();
}

// Convert 0-based index to column letter (A, B, C...)
function indexToColLetter(index: number): string {
  let temp = index;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

// Convert column letter (A, B, C...) to 0-based index
function colLetterToIndex(letter: string): number {
  let column = 0;
  const cleanLetter = letter.toUpperCase().replace(/[^A-Z]/g, '');
  const length = cleanLetter.length;
  for (let i = 0; i < length; i++) {
    column += (cleanLetter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1);
  }
  return column - 1;
}

export async function appendReportToExcel({
  dateStr,
  reportContent,
  repoNames,
}: {
  dateStr: string;
  reportContent: string;
  repoNames: string[];
}): Promise<void> {
  const settings = getSettings();
  const spreadsheetUrlOrId = settings.excelPath; // We reuse excelPath to hold Spreadsheet URL/ID
  const sheetName = settings.excelSheetName || '';
  const mappingRaw = settings.excelColumnMapping;

  if (!spreadsheetUrlOrId) {
    throw new Error('Google Spreadsheet URL or ID is not configured');
  }

  const spreadsheetId = extractSpreadsheetId(spreadsheetUrlOrId);
  if (!spreadsheetId) {
    throw new Error('Invalid Google Spreadsheet URL or ID');
  }

  let mappings: ColumnMapping[] = [];
  if (mappingRaw) {
    try {
      mappings = JSON.parse(mappingRaw);
    } catch (err) {
      logToDb('ERROR', 'EXCEL', 'Failed to parse Google Sheets column mappings, using defaults');
    }
  }

  // Default mappings if none are defined
  if (mappings.length === 0) {
    mappings = [
      { col: 'A', type: 'date' },
      { col: 'B', type: 'report' },
      { col: 'C', type: 'repositories' },
    ];
  }

  logToDb('INFO', 'EXCEL', `Connecting to Google Sheets: ${spreadsheetId}`);

  try {
    const oauth2Client = getOAuth2Client();
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    // 1. Get sheet values to find the next empty row
    const readResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
    });

    const rows = readResponse.data.values || [];
    const nextRowNumber = rows.length + 1;

    // 2. Build row data array
    const rowData: any[] = [];
    for (const map of mappings) {
      const idx = colLetterToIndex(map.col);
      if (idx < 0) continue;

      let val = '';
      switch (map.type) {
        case 'date':
          val = dateStr;
          break;
        case 'report':
          // Strip markdown characters
          val = reportContent.replace(/[\#\*\_`]/g, '').trim();
          break;
        case 'repositories':
          val = repoNames.join(', ');
          break;
        case 'fixed':
          val = map.fixedValue || '';
          break;
        case 'empty':
        default:
          val = '';
          break;
      }
      rowData[idx] = val;
    }

    // Fill gaps
    for (let i = 0; i < rowData.length; i++) {
      if (rowData[i] === undefined) {
        rowData[i] = '';
      }
    }

    // 3. Write row data to target row number
    const writeRange = `${sheetName}!A${nextRowNumber}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: writeRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowData],
      },
    });

    logToDb('INFO', 'EXCEL', `Google Sheet updated successfully at row ${nextRowNumber}`);
  } catch (err: any) {
    let msg = err.message || String(err);
    if (err.status === 403 || msg.includes('Permission') || msg.includes('scope')) {
      msg = 'Access denied. Please re-authenticate your Google account to grant Google Sheets permissions.';
    } else if (err.status === 404 || msg.includes('not found') || msg.includes('Requested entity was not found')) {
      msg = 'Spreadsheet not found. Please verify the URL or Spreadsheet ID.';
    } else if (msg.includes('token expired') || msg.includes('invalid_grant')) {
      msg = 'Google login session expired. Please re-authenticate your Google account.';
    } else if (msg.includes('ENOTFOUND') || msg.includes('fetch') || msg.includes('network')) {
      msg = 'Network unavailable. Please check your internet connection.';
    } else if (err.status === 429 || msg.includes('quota')) {
      msg = 'Google Sheets API rate limit exceeded. Please try again in a few minutes.';
    }
    logToDb('ERROR', 'EXCEL', `Google Sheets error: ${msg}`);
    throw new Error(msg);
  }
}

// Utility to inspect Google Sheets worksheets list + column headers
export async function getExcelMeta(spreadsheetUrlOrId: string): Promise<{ sheets: string[]; columnsPreview: string[] }> {
  if (!spreadsheetUrlOrId) {
    throw new Error('Google Spreadsheet URL or ID is not configured');
  }

  const spreadsheetId = extractSpreadsheetId(spreadsheetUrlOrId);
  if (!spreadsheetId) {
    throw new Error('Invalid Google Spreadsheet URL or ID');
  }

  try {
    const oauth2Client = getOAuth2Client();
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    // Fetch spreadsheet structure
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheetsList = response.data.sheets?.map(s => s.properties?.title || '').filter(Boolean) || [];
    if (sheetsList.length === 0) {
      throw new Error('No worksheets found in this spreadsheet.');
    }

    // Fetch column headers of the first sheet
    const targetSheet = sheetsList[0];
    const valuesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${targetSheet}!1:1`,
    });

    const firstRow = valuesResponse.data.values?.[0] || [];
    const columnsPreview: string[] = [];
    
    // If first row is empty, provide placeholder columns
    if (firstRow.length === 0) {
      columnsPreview.push('A: Date');
      columnsPreview.push('B: Report');
      columnsPreview.push('C: Repositories');
    } else {
      firstRow.forEach((val, idx) => {
        const colLetter = indexToColLetter(idx);
        columnsPreview.push(`${colLetter}: ${val}`);
      });
    }

    return { sheets: sheetsList, columnsPreview };
  } catch (err: any) {
    let msg = err.message || String(err);
    if (err.status === 403 || msg.includes('Permission') || msg.includes('scope')) {
      msg = 'Access denied. Please re-authenticate your Google account to grant Google Sheets permissions.';
    } else if (err.status === 404 || msg.includes('not found') || msg.includes('Requested entity was not found')) {
      msg = 'Spreadsheet not found. Please verify the URL or Spreadsheet ID.';
    } else if (msg.includes('token expired') || msg.includes('invalid_grant')) {
      msg = 'Google login session expired. Please re-authenticate your Google account.';
    } else if (msg.includes('ENOTFOUND') || msg.includes('fetch') || msg.includes('network')) {
      msg = 'Network unavailable. Please check your internet connection.';
    } else if (err.status === 429 || msg.includes('quota')) {
      msg = 'Google Sheets API rate limit exceeded. Please try again in a few minutes.';
    }
    logToDb('ERROR', 'EXCEL', `Google Sheets error: ${msg}`);
    throw new Error(msg);
  }
}
