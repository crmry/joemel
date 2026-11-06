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
