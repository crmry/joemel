// Lightweight file checks run before the workbook is passed to the formatter.
// Validate the Excel ZIP's contents separately in engine.js.
export const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024;

export function uploadIssue(file) {
  if (!file || typeof file.name !== 'string') return 'No file was provided.';
  if (file.name.startsWith('~$')) return 'Temporary Excel lock files are not supported. Select the original workbook.';
  if (!/\.xlsx$/i.test(file.name)) return 'Unsupported file type. Select an Excel workbook (.xlsx).';
  if (!Number.isFinite(file.size) || file.size <= 0) return 'This file is empty or unreadable.';
  if (file.size > MAX_WORKBOOK_BYTES) return 'This workbook is larger than 25 MB and cannot be processed safely in the browser.';
  return null;
}

export function archiveIssue(buffer) {
  const bytes = new Uint8Array(buffer);
  // Standard XLSX files are ZIP containers beginning with a local file header.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b ||
      bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    return 'This is not a valid .xlsx Excel file. Open it in Excel and save as Excel Workbook (.xlsx).';
  }
  return null;
}
