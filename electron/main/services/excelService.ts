import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { getSettings, logToDb } from '../database';

export interface ColumnMapping {
  col: string; // "A", "B", "C", etc.
  type: 'date' | 'report' | 'repositories' | 'fixed' | 'empty';
  fixedValue?: string;
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
  const filePath = settings.excelPath;
  const sheetName = settings.excelSheetName || '';
  const mappingRaw = settings.excelColumnMapping;

  if (!filePath) {
    throw new Error('Excel file path is not configured');
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Excel file does not exist at: ${resolvedPath}`);
  }

  let mappings: ColumnMapping[] = [];
  if (mappingRaw) {
    try {
      mappings = JSON.parse(mappingRaw);
    } catch (err) {
      logToDb('ERROR', 'EXCEL', 'Failed to parse excel column mappings, using defaults');
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

  logToDb('INFO', 'EXCEL', `Opening Excel sheet: ${resolvedPath}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolvedPath);

  // Get worksheet: either by name or the first one
  let worksheet = workbook.worksheets[0];
  if (sheetName) {
    const found = workbook.getWorksheet(sheetName);
    if (found) {
      worksheet = found;
    } else {
      logToDb('WARN', 'EXCEL', `Sheet "${sheetName}" not found, using first sheet`);
    }
  }

  if (!worksheet) {
    throw new Error('No worksheets found in the Excel file');
  }

  const lastRow = worksheet.lastRow;
  const nextRowNumber = lastRow ? lastRow.number + 1 : 1;
  const newRow = worksheet.getRow(nextRowNumber);

  // Copy formatting cell by cell from the previous row if it exists
  if (lastRow) {
    lastRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const newCell = newRow.getCell(colNumber);
      // Deep-ish copy of style object to preserve fonts, fills, borders, alignments, and number formats
      newCell.style = JSON.parse(JSON.stringify(cell.style || {}));
    });
  }

  // Calculate cell values based on mappings
  for (const map of mappings) {
    const cell = newRow.getCell(map.col);
    switch (map.type) {
      case 'date':
        cell.value = dateStr;
        break;
      case 'report':
        // Strip markdown bold/list formatting for Excel compatibility
        const plainSummary = reportContent
          .replace(/[\#\*\_`]/g, '') // remove markdown characters
          .trim();
        cell.value = plainSummary;
        break;
      case 'repositories':
        cell.value = repoNames.join(', ');
        break;
      case 'fixed':
        cell.value = map.fixedValue || '';
        break;
      case 'empty':
      default:
        cell.value = '';
        break;
    }
  }

  newRow.commit();
  await workbook.xlsx.writeFile(resolvedPath);
  logToDb('INFO', 'EXCEL', `Excel file updated successfully at row ${nextRowNumber}`);
}

// Utility to inspect Excel sheets and return sheets list + preview of first few columns
export async function getExcelMeta(filePath: string): Promise<{ sheets: string[]; columnsPreview: string[] }> {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error('File does not exist');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolvedPath);

  const sheets = workbook.worksheets.map(w => w.name);
  const firstSheet = workbook.worksheets[0];

  const columnsPreview: string[] = [];
  if (firstSheet) {
    // Read the first row (often headers)
    const firstRow = firstSheet.getRow(1);
    firstRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const colLetter = firstSheet.getColumn(colNumber).letter;
      const cellValue = cell.value ? String(cell.value) : `Column ${colLetter}`;
      columnsPreview.push(`${colLetter}: ${cellValue}`);
    });
  }

  return { sheets, columnsPreview };
}
