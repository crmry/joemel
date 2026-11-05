const DEFAULT_RANK_COLORS = new Map([
  ["FF00B050", "1st"],
  ["FFFFFF00", "2nd"],
  ["FFFF6600", "3rd"],
  ["FFFF66FF", "Above ABC"],
]);

function decodeXml(value = "") {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseAttributes(source = "") {
  const attributes = {};
  const attributePattern = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = attributePattern.exec(source)) !== null) {
    attributes[match[1]] = decodeXml(match[2]);
  }
  return attributes;
}

function extractTextNodes(source = "") {
  const parts = [];
  const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let match;
  while ((match = textPattern.exec(source)) !== null) {
    parts.push(decodeXml(match[1]));
  }
  return parts.join("");
}

function extractTagText(source, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`);
  const match = pattern.exec(source || "");
  return match ? decodeXml(match[1]) : "";
}

function normalizeZipPath(basePath, targetPath) {
  if (targetPath.startsWith("/")) return targetPath.slice(1);
  const baseParts = basePath.split("/");
  baseParts.pop();
  for (const part of targetPath.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") baseParts.pop();
    else baseParts.push(part);
  }
  return baseParts.join("/");
}

function normalizeColor(rgb) {
  if (!rgb) return null;
  const clean = rgb.replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{6}$/.test(clean)) return `FF${clean}`;
  return /^[0-9A-F]{8}$/.test(clean) ? clean : null;
}

function columnNumber(cellReference) {
  const letters = String(cellReference).match(/^[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) return 0;
  return [...letters].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0);
}

function columnLetters(column) {
  let current = column;
  let output = "";
  while (current > 0) {
    current -= 1;
    output = String.fromCharCode(65 + (current % 26)) + output;
    current = Math.floor(current / 26);
  }
  return output;
}

function cellRow(cellReference) {
  return Number.parseInt(String(cellReference).match(/\d+$/)?.[0] || "0", 10);
}

function parseSharedStrings(xml = "") {
  const strings = [];
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = itemPattern.exec(xml)) !== null) {
    strings.push(extractTextNodes(match[1]));
  }
  return strings;
}

function parseStyles(xml = "") {
  const fillsSection = /<fills\b[^>]*>([\s\S]*?)<\/fills>/.exec(xml)?.[1] || "";
  const fills = [];
  const fillPattern = /<fill\b[^>]*>([\s\S]*?)<\/fill>/g;
  let fillMatch;
  while ((fillMatch = fillPattern.exec(fillsSection)) !== null) {
    const patternTag = /<patternFill\b([^>]*)>/.exec(fillMatch[1]) || /<patternFill\b([^>]*)\/>/.exec(fillMatch[1]);
    const foregroundTag = /<fgColor\b([^>]*)\/>/.exec(fillMatch[1]);
    const patternAttributes = parseAttributes(patternTag?.[1]);
    const foregroundAttributes = parseAttributes(foregroundTag?.[1]);
    fills.push({
      patternType: patternAttributes.patternType || null,
      rgb: normalizeColor(foregroundAttributes.rgb),
    });
  }

  const xfsSection = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] || "";
  const styleFills = [];
  const xfPattern = /<xf\b([^>]*?)(?:\/>|>)/g;
  let xfMatch;
  while ((xfMatch = xfPattern.exec(xfsSection)) !== null) {
    const attributes = parseAttributes(xfMatch[1]);
    styleFills.push(fills[Number.parseInt(attributes.fillId || "0", 10)] || { patternType: null, rgb: null });
  }
  return styleFills;
}

function parseWorksheet(xml, sharedStrings, styleFills) {
  const cells = new Map();
  const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let match;
  while ((match = cellPattern.exec(xml)) !== null) {
    const attributes = parseAttributes(match[1]);
    const reference = attributes.r;
    if (!reference) continue;

    const body = match[2] || "";
    const rawValue = extractTagText(body, "v");
    const formula = extractTagText(body, "f");
    const type = attributes.t || "n";
    let value = rawValue;
    if (type === "s") value = sharedStrings[Number.parseInt(rawValue || "-1", 10)] ?? "";
    else if (type === "inlineStr") value = extractTextNodes(body);
    else if (type === "b") value = rawValue === "1";
    else if (rawValue !== "" && Number.isFinite(Number(rawValue))) value = Number(rawValue);

    const styleId = Number.parseInt(attributes.s || "0", 10);
    cells.set(reference, {
      reference,
      row: cellRow(reference),
      column: columnNumber(reference),
      value,
      formula,
      fill: styleFills[styleId]?.patternType === "solid" ? styleFills[styleId].rgb : null,
      styleId,
    });
  }
  return cells;
}

function cellsInRow(cells, row) {
  return [...cells.values()].filter((cell) => cell.row === row).sort((a, b) => a.column - b.column);
}

function cellAt(cells, row, column) {
  return cells.get(`${columnLetters(column)}${row}`);
}

function normalizedText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function extractPrNumber(cells, fileName) {
  const content = [...cells.values()].map((cell) => normalizedText(cell.value)).join(" ");
  const pattern = /P\.?\s*R\.?\s*(?:NO\.?)?\s*[:.)-]?\s*(\d{4}-\d{2}-\d{4})/i;
  return pattern.exec(content)?.[1] || pattern.exec(fileName)?.[1] || "Not detected";
}

function findHeaderRow(cells) {
  const candidates = [...cells.values()].filter((cell) => normalizedText(cell.value).toLowerCase() === "item");
  for (const candidate of candidates) {
    const rowText = cellsInRow(cells, candidate.row).map((cell) => normalizedText(cell.value).toUpperCase());
    if (rowText.some((text) => text.includes("AGENCY/ABC")) && rowText.some((text) => text.includes("TOTAL COST"))) {
      return candidate.row;
    }
  }
  return null;
}

function findLegend(cells) {
  const labels = new Map([
    ["1ST", "1st"],
    ["2ND", "2nd"],
    ["3RD", "3rd"],
    ["ABOVE ABC", "Above ABC"],
  ]);
  const colors = new Map(DEFAULT_RANK_COLORS);
  let found = 0;
  for (const cell of cells.values()) {
    const label = labels.get(normalizedText(cell.value).toUpperCase());
    if (!label) continue;
    const swatch = cellAt(cells, cell.row, cell.column - 1);
    if (swatch?.fill) {
      colors.set(swatch.fill, label);
      found += 1;
    }
  }
  return { colors, found };
}

function formulaLabel(formula) {
  if (!formula) return "calculated value";
  if (/SUM\s*\(/i.test(formula)) return "SUM subtotal";
  return "calculated total";
}

function rankOrder(rank) {
  return { "1st": 1, "2nd": 2, "3rd": 3, "Above ABC": 4 }[rank] || 99;
}

const PARTICIPATION_NOTE = "Blank or uncolored bidder cells are neutral. They may indicate that no offer was submitted for that item and do not determine the bid basis.";

function formulaCoversItemRange(formula, column, minItemRow, maxItemRow) {
  if (!formula) return false;
  const columnName = columnLetters(column);
  const escapedColumn = columnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rangePattern = new RegExp(`\\$?${escapedColumn}\\$?(\\d+)\\s*:\\s*\\$?${escapedColumn}\\$?(\\d+)`, "gi");
  let match;
  while ((match = rangePattern.exec(formula)) !== null) {
    const startRow = Number.parseInt(match[1], 10);
    const endRow = Number.parseInt(match[2], 10);
    if (startRow <= minItemRow && endRow >= maxItemRow) return true;
  }
  return false;
}

function analyzeSheet({ cells, sheetName, fileName }) {
  const headerRow = findHeaderRow(cells);
  if (!headerRow) throw new Error("Could not locate the Item / Agency-ABC / Total Cost header structure.");

  const headerCells = cellsInRow(cells, headerRow);
  const itemHeader = headerCells.find((cell) => normalizedText(cell.value).toLowerCase() === "item");
  const descriptionHeader = headerCells.find((cell) => normalizedText(cell.value).toUpperCase().includes("NAME OF ARTICLES"));
  const totalColumns = headerCells
    .filter((cell) => normalizedText(cell.value).toUpperCase().includes("TOTAL COST"))
    .map((cell) => cell.column);

  if (!itemHeader || !descriptionHeader || totalColumns.length === 0) {
    throw new Error("The bid table is missing required item, description, or bidder-total columns.");
  }

  const itemRows = [...new Set([...cells.values()]
    .filter((cell) => cell.column === itemHeader.column && Number.isInteger(Number(cell.value)) && Number(cell.value) > 0)
    .filter((cell) => normalizedText(cellAt(cells, cell.row, descriptionHeader.column)?.value) !== "")
    .map((cell) => cell.row))].sort((a, b) => a - b);

  if (itemRows.length === 0) throw new Error("No numbered item rows were found below the bid-table header.");

  const minItemRow = itemRows[0];
  const maxItemRow = itemRows[itemRows.length - 1];
  const itemRowSet = new Set(itemRows);
  const legend = findLegend(cells);
  const scanEndRow = maxItemRow + 30;
  const rankCells = [];

  for (const column of totalColumns) {
    for (let row = minItemRow; row <= scanEndRow; row += 1) {
      const cell = cellAt(cells, row, column);
      const rank = cell?.fill ? legend.colors.get(cell.fill) : null;
      if (!cell || !rank || (!cell.formula && cell.value === "")) continue;
      rankCells.push({
        reference: cell.reference,
        row,
        column,
        rank,
        formula: cell.formula,
        value: typeof cell.value === "number" ? cell.value : null,
        supplier: normalizedText(cellAt(cells, headerRow - 1, column - 1)?.value) || `Bidder column ${columnLetters(column)}`,
      });
    }
  }

  const itemRanks = rankCells.filter((cell) => itemRowSet.has(cell.row));
  const subtotalRanks = rankCells.filter((cell) => !itemRowSet.has(cell.row));
  const subtotalRows = [...new Set(subtotalRanks.map((cell) => cell.row))].sort((a, b) => a - b);
  let classification = "Needs Review";
  let reason = "No ranking-color evidence was found in the bidder total columns.";
  let confidence = "Low";

  const oneFinalAggregateRow = itemRanks.length === 0
    && subtotalRows.length === 1
    && subtotalRows[0] > maxItemRow
    && subtotalRanks.every((cell) => formulaCoversItemRange(cell.formula, cell.column, minItemRow, maxItemRow));

  if (oneFinalAggregateRow) {
    classification = "Lot Bid";
    reason = `Ranking colors appear only on the final aggregate bidder totals in row ${subtotalRows[0]}, covering the complete item schedule. Missing item-level colors do not change the lot-bid basis.`;
    confidence = legend.found >= 3 ? "High" : "Medium";
  } else if (rankCells.length > 0) {
    classification = "Line Bid";
    if (itemRanks.length > 0 && subtotalRanks.length === 0) {
      reason = `Ranking colors are applied to calculated bidder totals on ${new Set(itemRanks.map((cell) => cell.row)).size} individual item row(s). Uncolored bidder cells do not change the line-bid basis.`;
    } else if (itemRanks.length === 0 && subtotalRows.length > 0) {
      reason = `Ranking colors appear on supporting section subtotal rows ${subtotalRows.join(", ")} within the numbered line-item schedule; there is no single ranked total for the whole PR. Uncolored bidder cells do not change the line-bid basis.`;
    } else {
      reason = "Ranking evidence appears on line items and supporting subtotals rather than only on one final aggregate total. Uncolored bidder cells do not change the line-bid basis.";
    }
    confidence = legend.found >= 3 ? "High" : "Medium";
  }

  const rankedCells = rankCells
    .sort((a, b) => a.row - b.row || rankOrder(a.rank) - rankOrder(b.rank))
    .map((cell) => ({ ...cell, formulaType: formulaLabel(cell.formula) }));

  return {
    fileName,
    prNumber: extractPrNumber(cells, fileName),
    sheetName,
    classification,
    confidence,
    reason,
    itemCount: itemRows.length,
    bidderCount: totalColumns.length,
    participationNote: PARTICIPATION_NOTE,
    itemRows,
    rankedCells,
    evidenceCells: rankedCells.map((cell) => cell.reference),
    legendEntriesFound: legend.found,
  };
}

async function loadText(zip, path, required = true) {
  const entry = zip.file(path);
  if (!entry) {
    if (!required) return "";
    throw new Error(`Workbook component is missing: ${path}`);
  }
  return entry.async("text");
}

async function getSheets(zip) {
  const workbookPath = "xl/workbook.xml";
  const workbookXml = await loadText(zip, workbookPath);
  const relationshipsXml = await loadText(zip, "xl/_rels/workbook.xml.rels");
  const relationships = new Map();
  const relationshipPattern = /<Relationship\b([^>]*?)(?:\/>|>)/g;
  let relationshipMatch;
  while ((relationshipMatch = relationshipPattern.exec(relationshipsXml)) !== null) {
    const attributes = parseAttributes(relationshipMatch[1]);
    if (attributes.Id && attributes.Target) {
      relationships.set(attributes.Id, normalizeZipPath(workbookPath, attributes.Target));
    }
  }

  const sheets = [];
  const sheetPattern = /<sheet\b([^>]*?)(?:\/>|>)/g;
  let sheetMatch;
  while ((sheetMatch = sheetPattern.exec(workbookXml)) !== null) {
    const attributes = parseAttributes(sheetMatch[1]);
    const relationshipId = attributes["r:id"];
    const path = relationships.get(relationshipId);
    if (path) sheets.push({ name: attributes.name || "Worksheet", path });
  }
  if (sheets.length === 0) throw new Error("The workbook contains no readable worksheets.");
  return sheets;
}

export async function classifyWorkbook(input, fileName = "workbook.xlsx", JSZipLibrary = globalThis.JSZip) {
  if (!JSZipLibrary) throw new Error("The Excel reader library did not load. Refresh the page and try again.");
  let zip;
  try {
    zip = await JSZipLibrary.loadAsync(input);
  } catch (error) {
    throw new Error(`The file is not a readable .xlsx workbook: ${error.message}`);
  }

  const [sharedStringsXml, stylesXml, sheets] = await Promise.all([
    loadText(zip, "xl/sharedStrings.xml", false),
    loadText(zip, "xl/styles.xml"),
    getSheets(zip),
  ]);
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const styleFills = parseStyles(stylesXml);
  const errors = [];

  for (const sheet of sheets) {
    try {
      const worksheetXml = await loadText(zip, sheet.path);
      const cells = parseWorksheet(worksheetXml, sharedStrings, styleFills);
      return analyzeSheet({ cells, sheetName: sheet.name, fileName });
    } catch (error) {
      errors.push(`${sheet.name}: ${error.message}`);
    }
  }

  throw new Error(`No worksheet matched the supported BAC abstract format. ${errors.join(" ")}`);
}

export const internals = {
  columnLetters,
  columnNumber,
  decodeXml,
  normalizeColor,
};
