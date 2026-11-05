import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import JSZip from "jszip";
import { classifyWorkbook, internals } from "../src/classifier-core.js";

const workbookDirectory = "/Users/crimary/Documents/BAC/October 8, 2026 Abstract of Bids PB 02-2027_edited";

test("cell-column helpers support single and multi-letter references", () => {
  assert.equal(internals.columnNumber("A1"), 1);
  assert.equal(internals.columnNumber("AC16"), 29);
  assert.equal(internals.columnLetters(1), "A");
  assert.equal(internals.columnLetters(29), "AC");
});

test("the first nine BAC workbooks match the evidence-based classifications", async () => {
  const expected = new Map([
    [1, "Grouped/Section Bid"],
    [2, "Line Bid"],
    [3, "Line Bid"],
    [4, "Line Bid"],
    [5, "Line Bid"],
    [6, "Line Bid"],
    [7, "Line Bid"],
    [8, "Line Bid"],
    [9, "Lot Bid"],
  ]);
  const files = (await readdir(workbookDirectory)).filter((name) => /^\d+\).*\.xlsx$/i.test(name));

  for (const [number, classification] of expected) {
    const fileName = files.find((name) => name.startsWith(`${number})`));
    assert.ok(fileName, `Missing workbook ${number}`);
    const input = await readFile(resolve(workbookDirectory, fileName));
    const result = await classifyWorkbook(input, fileName, JSZip);
    assert.equal(result.classification, classification, fileName);
    assert.equal(result.confidence, "High", fileName);
    assert.ok(result.evidenceCells.length > 0, fileName);
  }
});

test("PR 9 exposes aggregate ranking evidence in row 24", async () => {
  const fileName = (await readdir(workbookDirectory)).find((name) => name.startsWith("9)"));
  const input = await readFile(resolve(workbookDirectory, fileName));
  const result = await classifyWorkbook(input, fileName, JSZip);
  assert.deepEqual(result.evidenceCells.sort(), ["G24", "K24", "O24"]);
  assert.equal(result.itemCount, 7);
  assert.equal(result.bidderCount, 5);
});

test("invalid input returns an actionable workbook error", async () => {
  await assert.rejects(
    () => classifyWorkbook(new TextEncoder().encode("not an xlsx"), "invalid.xlsx", JSZip),
    /not a readable \.xlsx workbook/i,
  );
});
