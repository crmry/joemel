import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = name => readFileSync(new URL('../src/formatter/' + name, import.meta.url), 'utf8');
const html = source('index.html');
const app = source('app.js');
const css = source('styles.css');
const engine = source('engine.js');

test('Page Setup controls are absent from the formatter UI', () => {
  assert.doesNotMatch(html, /<fieldset\b[^>]*class="page-settings"/);
  for (const id of ['scaling', 'scale-percent', 'orientation', 'header', 'footer']) {
    assert.doesNotMatch(html, new RegExp('id="' + id + '"'));
  }
  assert.doesNotMatch(app, /ui\.(scaling|scalePercent|scalePercentWrap|orientation|header|footer)\b/);
});

test('Print defaults are locked to 70% landscape with original headers and footers', () => {
  assert.match(engine, /const FIXED_PAGE_SETUP=Object\.freeze\(\{[\s\S]*?scaling:'adjust',[\s\S]*?scalePercent:70,[\s\S]*?orientation:'landscape',[\s\S]*?header:'original',[\s\S]*?footer:'original'/);
  assert.match(engine, /configurePrint\(sheet,wb,sheetname,lastCol,lastRow,paper,FIXED_PAGE_SETUP\)/);
  assert.match(engine, /setupProp\.setAttribute\('fitToPage',scaling==='fit'\?'1':'0'\)/);
  assert.match(engine, /page\.setAttribute\('scale',String\(percent\)\)/);
  assert.match(app, /70% scaling/);
});

test('Standard Excel colors are fixed and the ranking legend replaces the selector', () => {
  assert.doesNotMatch(html, /id="color-mode"|Color update mode|Automatic legend/);
  assert.match(html, /class="option-legend"[\s\S]*?<strong>Legend<\/strong>/);
  assert.equal((html.match(/class="legend"/g) || []).length, 1);
  for (const label of ['1st', '2nd', '3rd', 'Above ABC']) {
    assert.ok(html.includes('>' + label + '</button>'), 'Missing ' + label);
  }
  assert.doesNotMatch(app, /ui\.colorMode/);
  assert.match(app, /transformWorkbook\(file.name, await file.arrayBuffer\(\), ui.mode.value, ui.paper.value, 'static'\)/);
  assert.match(app, /const color = 'Standard Excel colors'/);
  assert.match(html, /value="folio" selected/);
  assert.match(html, /id="preview-dialog"/);
  assert.match(html, /id="download-all"/);
});

test('Legend tooltips remain focusable and explain all ranks', () => {
  assert.equal((html.match(/class="legend-chip"/g) || []).length, 4);
  assert.equal((html.match(/data-tooltip="/g) || []).length, 4);
  for (const phrase of ['Lowest bid within the ABC', 'Second-lowest bid within the ABC', 'Third-lowest bid within the ABC', 'Bid exceeds the Approved Budget for the Contract']) assert.ok(html.includes(phrase));
  assert.match(css, /\.legend-chip:hover:after/);
  assert.match(css, /\.legend-chip:focus:after/);
});

test('How it works shows three concise steps', () => {
  assert.equal((html.match(/class="step-number"/g) || []).length, 3);
  for (const heading of ['Upload', 'Review', 'Download']) assert.ok(html.includes('<strong>' + heading + '</strong>'));
  assert.match(html, /Line Bid compares items; Lot Bid compares total amounts/);
  assert.match(html, /Files stay on your device/);
});

test('Product page starts with one title and no unnecessary top bar', () => {
  assert.equal((html.match(/<h1>Purchase Request (PR) Formatting Tool<\/h1>/g) || []).length, 1);
  assert.doesNotMatch(html, /class="topbar"|class="brand"|class="brand-mark"|Bids and Awards Committee/);
  assert.doesNotMatch(css, /\.topbar\{|\.brand\{|\.brand-mark\{/);
  assert.match(html, /Format abstract-of-bids Excel workbooks/);
  assert.match(html, /class="legend-chip"/);
  assert.match(html, /class="workflow-steps"/);
});

test('Product identity consistently uses Purchase Request (PR) Formatting Tool', () => {
  const label = 'Purchase Request (PR) Formatting Tool';
  assert.match(html, /<h1>Purchase Request \(PR\) Formatting Tool<\/h1>/);
  assert.ok(html.includes('<title>BAC | ' + label + '</title>'));
  assert.ok(html.includes('BAC · ' + label));
  assert.doesNotMatch(html, /PR Auto-Formatter/);
});
