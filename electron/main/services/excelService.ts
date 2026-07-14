import { google } from 'googleapis';
import { getSettings, logToDb } from '../database';
import { getAuthenticatedClient } from './gmailService';

export interface ColumnMapping {
  col: string; // "A", "B", "C", etc.
  type: 'date' | 'report' | 'repositories' | 'fixed' | 'empty' | 'work_start' | 'work_end';
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

function parseTime(timeStr: string): Date {
  const cleanTime = timeStr.trim();
  const ampmMatch = cleanTime.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  const d = new Date();
  
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1]!, 10);
    const minutes = parseInt(ampmMatch[2]!, 10);
    const ampm = ampmMatch[3]!.toUpperCase();

    if (ampm === 'PM' && hours < 12) {
      hours += 12;
    } else if (ampm === 'AM' && hours === 12) {
      hours = 0;
    }
    d.setHours(hours, minutes, 0, 0);
    return d;
  }
  
  const twentyFourMatch = cleanTime.match(/^(\d+):(\d+)$/);
  if (twentyFourMatch) {
    const hours = parseInt(twentyFourMatch[1]!, 10);
    const minutes = parseInt(twentyFourMatch[2]!, 10);
    d.setHours(hours, minutes, 0, 0);
    return d;
  }

  throw new Error(`Invalid time format: ${timeStr}`);
}

function formatTimeNicely(timeStr: string): string {
  try {
    const d = parseTime(timeStr);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return timeStr;
  }
}

function calculateTimeInvolved(startStr: string, endStr: string, settings: any): string {
  try {
    const start = parseTime(startStr);
    const end = parseTime(endStr);

    let diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) {
      diffMs += 24 * 60 * 60 * 1000;
    }

    let diffHours = diffMs / (1000 * 60 * 60);

    if (settings.lunchBreakMinutes) {
      const numberMatch = String(settings.lunchBreakMinutes).match(/\d+/);
      const lunchMin = numberMatch ? parseFloat(numberMatch[0]!) : 0;
      if (!isNaN(lunchMin)) {
        diffHours -= lunchMin / 60;
      }
    } else if (settings.subtractLunchBreak === 'true') {
      diffHours -= 1.0;
    }

    const hours = Math.floor(diffHours);
    return `${hours}hr`;
  } catch (err) {
    return '';
  }
}

// Helper to parse sheets-specific errors for helpful UI messages
function parseSheetsError(err: any, sheetName?: string): string {
  console.error("RAW GOOGLE SHEETS ERROR:", err);
  
  const status = err.status || err.code || 'unknown';
  const responseData = err.response?.data ? JSON.stringify(err.response.data) : 'none';
  const rawMsg = err.message || String(err);
  const errMsgDetailed = `Google Sheets API Error Details - Status: ${status}, Message: ${rawMsg}, Data: ${responseData}`;
  
  console.log(errMsgDetailed);
  logToDb('ERROR', 'EXCEL', errMsgDetailed);

  if (rawMsg.includes('Unable to parse range') || rawMsg.toLowerCase().includes('range')) {
    return `Worksheet "${sheetName || ''}" not found in the spreadsheet.`;
  }
  if (rawMsg.includes('Insufficient Permission') || rawMsg.toLowerCase().includes('insufficient permission') || rawMsg.toLowerCase().includes('scope')) {
    const settings = getSettings();
    const email = settings.gmailUserEmail || 'your logged-in account';
    return `Access denied. The Google account (${email}) does not have Google Sheets permissions. Please click "Authorize Google Sheets Access" to re-authenticate and make sure you check the Google Sheets permissions checkbox on the consent screen. [Details: status ${status}, data: ${responseData}]`;
  }
  if (rawMsg.includes('caller does not have permission') || rawMsg.toLowerCase().includes('permission') || status === 403) {
    const settings = getSettings();
    const email = settings.gmailUserEmail || 'your logged-in account';
    return `Access denied. The authenticated Google account (${email}) does not have permission to view or edit this spreadsheet. Please make sure the spreadsheet is shared with ${email} (with Editor/Writer access) or use a different spreadsheet. [Details: status ${status}, data: ${responseData}]`;
  }
  if (status === 404 || rawMsg.includes('not found') || rawMsg.includes('Requested entity was not found')) {
    return `Spreadsheet not found. Please verify the URL or Spreadsheet ID. [Details: status ${status}, data: ${responseData}]`;
  }
  if (rawMsg.includes('token expired') || rawMsg.includes('invalid_grant')) {
    return 'Google login session expired. Please re-authenticate your Google account.';
  }
  if (rawMsg.includes('ENOTFOUND') || rawMsg.includes('fetch') || rawMsg.includes('network')) {
    return 'Network unavailable. Please check your internet connection.';
  }
  if (status === 429 || rawMsg.includes('quota')) {
    return 'Google Sheets API rate limit exceeded. Please try again in a few minutes.';
  }
  return `${rawMsg} [Details: status ${status}, data: ${responseData}]`;
}

export async function appendReportToExcel({
  dateStr,
  reportContent,
  repoNames,
  remarks,
  meetingDetails,
}: {
  dateStr: string;
  reportContent: string;
  repoNames: string[];
  remarks?: string;
  meetingDetails?: string;
}): Promise<void> {
  const settings = getSettings();
  const spreadsheetUrlOrId = settings.excelPath; // We reuse excelPath to hold Spreadsheet URL/ID
  const sheetName = settings.excelSheetName || '';

  if (!spreadsheetUrlOrId) {
    throw new Error('Google Spreadsheet URL or ID is not configured');
  }

  const spreadsheetId = extractSpreadsheetId(spreadsheetUrlOrId);
  console.log("SHEETS API (append): Extracted Spreadsheet ID:", spreadsheetId);
  if (!spreadsheetId) {
    throw new Error('Invalid Google Spreadsheet URL or ID');
  }

  logToDb('INFO', 'EXCEL', `Connecting to Google Sheets: ${spreadsheetId}`);

  try {
    const oauth2Client = await getAuthenticatedClient();
    const email = settings.gmailUserEmail || 'unknown';
    console.log("SHEETS API (append): Executing spreadsheets.values.get under authenticated account email:", email);
    logToDb('INFO', 'EXCEL', `Executing spreadsheets.values.get under email: ${email}`);

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    // 1. Get sheet values to find the next empty row
    const readResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
    });

    const rows = readResponse.data.values || [];
    
    // Check if headers exist
    if (rows.length === 0 || !rows[0]) {
      throw new Error(`Worksheet "${sheetName}" is empty or has no header row.`);
    }

    const normalizedHeaders = rows[0].map((h: any) => String(h).trim().toLowerCase());
    const columnIndexMap: Record<string, number> = {};
    const missingHeaders: string[] = [];

    const headerDefinitions = [
      { 
        key: 'sl_no', 
        label: 'Sl No', 
        match: (h: string) => {
          const s = h.toLowerCase().trim();
          return s.includes('sl') || s.includes('serial') || s.includes('no') || s.includes('number');
        } 
      },
      { 
        key: 'date', 
        label: 'Date', 
        match: (h: string) => h.toLowerCase().trim().includes('date') 
      },
      { 
        key: 'report', 
        label: 'Report', 
        match: (h: string) => {
          const s = h.toLowerCase().trim();
          return s.includes('report') || s.includes('summary') || s.includes('work') || s.includes('activity');
        } 
      },
      { 
        key: 'login_time', 
        label: 'Login Time', 
        match: (h: string) => {
          const s = h.toLowerCase().trim();
          return s.includes('login') || s.includes('in time') || s.includes('start');
        } 
      },
      { 
        key: 'logoff_time', 
        label: 'Logoff Time', 
        match: (h: string) => {
          const s = h.toLowerCase().trim();
          return s.includes('logoff') || s.includes('logout') || s.includes('out time') || s.includes('end');
        } 
      },
      { 
        key: 'time_involved', 
        label: 'Time Involved (Hours)', 
        match: (h: string) => {
          const s = h.toLowerCase().trim();
          return s.includes('time involved') || s.includes('hours') || s.includes('hr') || s.includes('duration') || s === 'time';
        } 
      },
      { 
        key: 'remarks', 
        label: 'Remarks', 
        match: (h: string) => {
          const s = h.toLowerCase().trim();
          return s.includes('remark') || s.includes('note');
        } 
      },
      { 
        key: 'meeting_details', 
        label: 'Meeting Details', 
        match: (h: string) => {
          const s = h.toLowerCase().trim();
          return s.includes('meeting') || s.includes('discussion') || s.includes('call');
        } 
      }
    ];

    for (const def of headerDefinitions) {
      const idx = normalizedHeaders.findIndex(h => def.match(h));
      if (idx === -1) {
        missingHeaders.push(def.label);
      } else {
        columnIndexMap[def.key] = idx;
      }
    }

    if (missingHeaders.length > 0) {
      throw new Error(`Required columns missing from Google Sheet: ${missingHeaders.join(', ')}`);
    }

    const nextRowNumber = rows.length + 1;

    const slNoIdx = columnIndexMap['sl_no'] as number;
    const dateIdx = columnIndexMap['date'] as number;
    const reportIdx = columnIndexMap['report'] as number;
    const loginIdx = columnIndexMap['login_time'] as number;
    const logoffIdx = columnIndexMap['logoff_time'] as number;
    const timeIdx = columnIndexMap['time_involved'] as number;
    const remarksIdx = columnIndexMap['remarks'] as number;
    const meetingIdx = columnIndexMap['meeting_details'] as number;

    // Calculate Sl No
    let nextSlNo = 1;
    if (rows.length > 1) {
      for (let i = rows.length - 1; i >= 1; i--) {
        const row = rows[i];
        if (row) {
          const val = row[slNoIdx];
          if (val !== undefined && val !== null && val !== '') {
            const parsed = parseInt(String(val).trim(), 10);
            if (!isNaN(parsed)) {
              nextSlNo = parsed + 1;
              break;
            }
          }
        }
      }
    }

    // Format Date to DD-MM-YYYY
    let formattedDate = dateStr;
    const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateMatch) {
      formattedDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    }

    // Format Report cell (strip markdown/header)
    let reportCell = reportContent;
    reportCell = reportCell.replace(/^#*\s*Daily\s+Development\s+Report\s*/i, '');
    reportCell = reportCell.replace(/[\#\*\_`]/g, '').trim();
    reportCell = reportCell.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

    // 2. Build row data array
    const rowData: any[] = [];
    rowData[slNoIdx] = nextSlNo;
    rowData[dateIdx] = formattedDate;
    rowData[reportIdx] = reportCell;
    rowData[loginIdx] = formatTimeNicely(settings.workStartTime || '10:00 AM');
    rowData[logoffIdx] = formatTimeNicely(settings.workEndTime || '05:30 PM');
    rowData[timeIdx] = calculateTimeInvolved(
      settings.workStartTime || '10:00 AM',
      settings.workEndTime || '05:30 PM',
      settings
    );
    rowData[remarksIdx] = remarks || '';
    rowData[meetingIdx] = meetingDetails || '';

    // Fill gaps
    const maxIdx = Math.max(...Object.values(columnIndexMap));
    for (let i = 0; i <= maxIdx; i++) {
      if (rowData[i] === undefined) {
        rowData[i] = '';
      }
    }

    // 3. Write row data to target row number
    const writeRange = `${sheetName}!A${nextRowNumber}`;
    console.log("SHEETS API (append): Executing spreadsheets.values.update under authenticated account email:", email);
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
    const msg = parseSheetsError(err, sheetName);
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
  console.log("SHEETS API (inspect): Extracted Spreadsheet ID:", spreadsheetId);
  if (!spreadsheetId) {
    throw new Error('Invalid Google Spreadsheet URL or ID');
  }

  try {
    const oauth2Client = await getAuthenticatedClient();
    const settings = getSettings();
    const email = settings.gmailUserEmail || 'unknown';
    console.log("SHEETS API (inspect): Executing spreadsheets.get under authenticated account email:", email);
    logToDb('INFO', 'EXCEL', `Executing spreadsheets.get under email: ${email}`);

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
    console.log("SHEETS API (inspect): Executing spreadsheets.values.get range: 1:1 under authenticated account email:", email);
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
    const msg = parseSheetsError(err);
    logToDb('ERROR', 'EXCEL', `Google Sheets error: ${msg}`);
    throw new Error(msg);
  }
}
