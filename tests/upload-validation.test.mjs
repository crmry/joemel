import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadIssue, archiveIssue, MAX_WORKBOOK_BYTES } from '../src/formatter/upload-validation.js';

test('Accepts ordinary XLSX files without requiring a particular filename',()=>{
  assert.equal(uploadIssue({name:'My new PR.xlsx',size:42000}),null);
  assert.equal(uploadIssue({name:'BID SHEET.XLSX',size:4000}),null);
});

test('Rejects unsupported, locked, empty and oversized files',()=>{
  assert.match(uploadIssue({name:'report.xls',size:120}),/Unsupported/);
  assert.match(uploadIssue({name:'report.csv',size:120}),/Unsupported/);
  assert.match(uploadIssue({name:'~$report.xlsx',size:120}),/Temporary/);
  assert.match(uploadIssue({name:'empty.xlsx',size:0}),/empty/);
  assert.match(uploadIssue({name:'large.xlsx',size:MAX_WORKBOOK_BYTES+1}),/25 MB/);
});

test('Rejects renamed non-XLSX content but permits ZIP-based XLSX headers',()=>{
  assert.equal(archiveIssue(Uint8Array.from([0x50,0x4b,0x03,0x04,0,0]).buffer),null);
  assert.match(archiveIssue(Uint8Array.from([0x25,0x50,0x44,0x46]).buffer),/not a valid/);
  assert.match(archiveIssue(new Uint8Array(0).buffer),/not a valid/);
});
