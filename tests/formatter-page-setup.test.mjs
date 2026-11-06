import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = name => readFileSync(new URL('../src/formatter/' + name, import.meta.url), 'utf8');
const html = source('index.html');
const app = source('app.js');
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
    assert.ok(html.includes('>' + label + '</span>'), 'Missing ' + label);
  }
  assert.doesNotMatch(app, /ui\.colorMode/);
  assert.match(app, /transformWorkbook\(file.name, await file.arrayBuffer\(\), ui.mode.value, ui.paper.value, 'static'\)/);
  assert.match(app, /const color = 'Standard Excel colors'/);
  assert.match(html, /value="folio" selected/);
  assert.match(html, /id="preview-dialog"/);
  assert.match(html, /id="download-all"/);
});
