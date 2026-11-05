/* Read-only, in-browser preview of the newly formatted workbook.
   This is a worksheet preview, not a print/PDF rendering engine. */
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const MAX_ROWS = 65;
const MAX_COLS = 32;

function parseXml(xml, label) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Could not preview " + label);
  return doc;
}
function descendants(element, name) {
  return element ? Array.from(element.getElementsByTagNameNS(NS, name)) : [];
}
function direct(element, name) {
  return element ? Array.from(element.children).find(el => el.localName === name) || null : null;
}
function numberFromColumn(letters) {
  return [...letters].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0);
}
function columnFromNumber(number) {
  let result = "";
  while (number > 0) { number--; result = String.fromCharCode(65 + number % 26) + result; number = Math.floor(number / 26); }
  return result;
}
function address(ref) {
  const match = /^([A-Z]+)([1-9]\d*)$/.exec(ref || "");
  return match ? { col: numberFromColumn(match[1]), row: Number(match[2]) } : null;
}
function cellText(cell, strings, formats) {
  if (!cell) return "";
  const valueNode = direct(cell, "v");
  const inlineNode = direct(cell, "is");
  const value = valueNode?.textContent ?? inlineNode?.textContent ?? "";
  let text = cell.getAttribute("t") === "s" ? (strings[Number(value)] ?? value) : value;
  if (!text && direct(cell, "f")) return "ƒ";
  const style = formats[Number(cell.getAttribute("s") || 0)];
  const number = Number(text);
  if (text !== "" && Number.isFinite(number) && style?.formatNumeric && !["s", "str", "inlineStr", "e"].includes(cell.getAttribute("t"))) {
    text = new Intl.NumberFormat("en-PH", { minimumFractionDigits: style.decimals, maximumFractionDigits: style.decimals }).format(number);
  }
  return text;
}
function loadFormatting(styles) {
  const customFormats = new Map(descendants(styles, "numFmt").map(el => [Number(el.getAttribute("numFmtId")), el.getAttribute("formatCode") || ""]));
  const fills = descendants(styles, "fills")[0];
  const fillColors = fills ? Array.from(fills.children).map(fill => {
    const pattern = direct(fill, "patternFill");
    const rgb = direct(pattern, "fgColor")?.getAttribute("rgb") || "";
    const cleaned = rgb.replace(/^#/, "").toUpperCase();
    if (/^[0-9A-F]{8}$/.test(cleaned) && cleaned.startsWith("FF")) return "#" + cleaned.slice(2);
    if (/^[0-9A-F]{6}$/.test(cleaned)) return "#" + cleaned;
    return "";
  }) : [];
  const xfs = descendants(styles, "cellXfs")[0];
  return xfs ? Array.from(xfs.children).map(xf => {
    const id = Number(xf.getAttribute("numFmtId") || 0);
    const pattern = customFormats.get(id) || "";
    const numeric = [3, 4, 37, 38, 39, 40, 43, 44].includes(id) || /#,##0/.test(pattern);
    const decimals = [4, 38, 40, 44].includes(id) || /0\.00/.test(pattern) ? 2 : 0;
    return { color: fillColors[Number(xf.getAttribute("fillId") || 0)] || "", formatNumeric: numeric, decimals };
  }) : [];
}
function mergedRanges(sheet) {
  const starts = new Map();
  const covered = new Set();
  for (const item of descendants(sheet, "mergeCell")) {
    const match = /^([A-Z]+[1-9]\d*):([A-Z]+[1-9]\d*)$/.exec(item.getAttribute("ref") || "");
    if (!match) continue;
    const a = address(match[1]), b = address(match[2]);
    if (!a || !b || a.row > MAX_ROWS || a.col > MAX_COLS || b.row < a.row || b.col < a.col) continue;
    const rowEnd = Math.min(b.row, MAX_ROWS), colEnd = Math.min(b.col, MAX_COLS);
    starts.set(a.row + ":" + a.col, { rows: rowEnd - a.row + 1, cols: colEnd - a.col + 1 });
    for (let r = a.row; r <= rowEnd; r++) for (let c = a.col; c <= colEnd; c++) {
      if (r !== a.row || c !== a.col) covered.add(r + ":" + c);
    }
  }
  return { starts, covered };
}
export async function renderWorkbookPreview(data, target, JSZip) {
  const zip = await JSZip.loadAsync(data);
  const paths = ["xl/worksheets/sheet1.xml", "xl/styles.xml"];
  if (paths.some(path => !zip.file(path))) throw new Error("This workbook's worksheet or styles are missing");
  const [sheetXml, stylesXml, stringsXml] = await Promise.all([
    zip.file(paths[0]).async("string"),
    zip.file(paths[1]).async("string"),
    zip.file("xl/sharedStrings.xml")?.async("string") ?? Promise.resolve(null)
  ]);
  const sheet = parseXml(sheetXml, "worksheet"), styles = parseXml(stylesXml, "styles");
  const strings = stringsXml ? descendants(parseXml(stringsXml, "shared strings"), "si").map(si => si.textContent || "") : [];
  const formats = loadFormatting(styles);
  const cells = new Map();
  let lastRow = 0, lastCol = 0;
  for (const cell of descendants(sheet, "sheetData").flatMap(row => descendants(row, "c"))) {
    const ref = cell.getAttribute("r") || "";
    const pos = address(ref);
    if (!pos || pos.col > MAX_COLS || pos.row > MAX_ROWS) continue;
    cells.set(ref, cell);
    if (cellText(cell, strings, formats).trim() || direct(cell, "f")) {
      lastRow = Math.max(lastRow, pos.row);
      lastCol = Math.max(lastCol, pos.col);
    }
  }
  const merges = mergedRanges(sheet);
  for (const key of merges.starts.keys()) {
    const [row, col] = key.split(":").map(Number);
    lastRow = Math.max(lastRow, row);
    lastCol = Math.max(lastCol, col + merges.starts.get(key).cols - 1);
  }
  const displayRows = Math.min(MAX_ROWS, Math.max(25, lastRow));
  const displayCols = Math.min(MAX_COLS, Math.max(8, lastCol));
  const table = document.createElement("table");
  table.className = "excel-preview-table";
  table.setAttribute("aria-label", "Read-only Excel worksheet preview");
  const thead = document.createElement("thead");
  const heading = document.createElement("tr");
  const corner = document.createElement("th");
  corner.textContent = "#";
  heading.append(corner);
  for (let col = 1; col <= displayCols; col++) {
    const th = document.createElement("th");
    th.textContent = columnFromNumber(col);
    th.scope = "col";
    heading.append(th);
  }
  thead.append(heading);
  table.append(thead);
  const tbody = document.createElement("tbody");
  for (let row = 1; row <= displayRows; row++) {
    const tr = document.createElement("tr");
    const rowHeading = document.createElement("th");
    rowHeading.textContent = String(row);
    rowHeading.scope = "row";
    tr.append(rowHeading);
    for (let col = 1; col <= displayCols; col++) {
      const key = row + ":" + col;
      if (merges.covered.has(key)) continue;
      const cell = cells.get(columnFromNumber(col) + row);
      const td = document.createElement("td");
      if (col === 2) td.classList.add("preview-wide-cell");
      const span = merges.starts.get(key);
      if (span) { td.colSpan = span.cols; td.rowSpan = span.rows; }
      td.textContent = cellText(cell, strings, formats);
      if (cell) {
        const fill = formats[Number(cell.getAttribute("s") || 0)]?.color;
        if (fill) td.style.backgroundColor = fill;
        const formula = direct(cell, "f")?.textContent;
        if (formula) td.title = "Formula: " + formula;
      }
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  target.replaceChildren(table);
  return { rows: displayRows, cols: displayCols, truncated: lastRow >= MAX_ROWS || lastCol >= MAX_COLS };
}
