'use strict';

// Formatted files remain in browser memory until replaced or the tab closes.
const ui = {
  input: document.getElementById('files'),
  drop: document.getElementById('drop'),
  button: document.getElementById('process'),
  names: document.getElementById('names'),
  status: document.getElementById('status'),
  progress: document.getElementById('meter'),
  results: document.getElementById('results'),
  mode: document.getElementById('mode'),
  paper: document.getElementById('paper'),
  colorMode: document.getElementById('color-mode'),
  scaling: document.getElementById('scaling'),
  scalePercent: document.getElementById('scale-percent'),
  scalePercentWrap: document.getElementById('scale-percent-wrap'),
  orientation: document.getElementById('orientation'),
  header: document.getElementById('header'),
  footer: document.getElementById('footer'),
  downloads: document.getElementById('downloads-toolbar'),
  downloadCount: document.getElementById('download-count'),
  downloadAll: document.getElementById('download-all'),
  preview: document.getElementById('preview-dialog'),
  previewTitle: document.getElementById('preview-title'),
  previewMeta: document.getElementById('preview-meta'),
  previewSheet: document.getElementById('preview-sheet'),
  previewDownload: document.getElementById('preview-download'),
  previewClose: document.getElementById('preview-close')
};
let selected = [], entries = [], processing = false, libPromise = null, activePreview = -1;

function sequence(name) {
  const match = /^\s*(\d+)\s*\)/.exec(name);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}
function safeFileName(name) {
  return String(name || 'workbook.xlsx').replace(/[\\/:\u0000-\u001f]/g, '_');
}
function formatNames(files) {
  // Keep each actual PR filename. Add a short counter only for duplicate names
  // so multiple copies never overwrite one another in Download All.
  const used = new Set();
  return files.map(file => {
    const base = safeFileName(file.name).replace(/\.xlsx$/i, '');
    let candidate = base + '.xlsx';
    let count = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = base + ' (' + count++ + ').xlsx';
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}
function choose(files) {
  if (processing) return;
  selected = [...files].filter(f => /\.xlsx$/i.test(f.name) && !f.name.startsWith('~$'))
    .sort((a, b) => sequence(a.name) - sequence(b.name) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  entries = [];
  ui.names.textContent = selected.length
    ? `${selected.length} workbook(s) selected — ${selected.map(f => f.name).join(', ')}`
    : 'No Excel files selected';
  ui.status.textContent = selected.length ? 'Preparing workbooks in your browser…' : 'Choose one or more Excel files.';
  ui.results.replaceChildren();
  ui.downloads.hidden = true;
  ui.progress.hidden = true;
  ui.button.disabled = !selected.length;
  if (selected.length) void processFiles();
}
ui.input.addEventListener('change', () => { choose(ui.input.files); ui.input.value = ''; });
ui.drop.addEventListener('click', e => { if (e.target !== ui.input && !processing) ui.input.click(); });
ui.drop.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && !processing) { e.preventDefault(); ui.input.click(); }
});
for (const type of ['dragenter', 'dragover']) ui.drop.addEventListener(type, e => {
  e.preventDefault();
  if (!processing) ui.drop.classList.add('drag');
});
for (const type of ['dragleave', 'drop']) ui.drop.addEventListener(type, e => {
  e.preventDefault();
  ui.drop.classList.remove('drag');
});
ui.drop.addEventListener('drop', e => { if (!processing) choose(e.dataTransfer.files); });

async function library() {
  if (window.JSZip) return window.JSZip;
  if (!libPromise) libPromise = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = '../vendor/jszip.min.js';
    tag.onload = () => window.JSZip ? resolve(window.JSZip) : reject(new Error('Could not initialize the local Excel library'));
    tag.onerror = () => reject(new Error('Could not load the local Excel library'));
    document.head.append(tag);
  }).catch(error => { libPromise = null; throw error; });
  return libPromise;
}
function reportDetail(r) {
  if (r.mode === 'ERROR') return r.basis || 'Could not process this workbook';
  const className = r.mode === 'line' ? 'Line Bid' : r.mode === 'lot' ? 'Lot Bid' : 'Needs classification review';
  const color = r.colorMode === 'static' ? 'Mac-compatible colors' : 'Live Excel colors';
  return `${className} · ${color} · ${r.items ?? 0} items · ${r.basis || ''}`;
}
function addResult(entry, index) {
  const item = document.createElement('div');
  item.className = 'report-entry' + (entry.error || entry.report.mode === 'REVIEW REQUIRED' ? ' needs-review' : '');
  const description = document.createElement('div');
  description.className = 'result-description';
  const title = document.createElement('strong');
  title.textContent = entry.report.file;
  const detail = document.createElement('span');
  detail.textContent = reportDetail(entry.report);
  description.append(title, detail);
  item.append(description);
  if (entry.data) {
    const actions = document.createElement('div');
    actions.className = 'result-actions';
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'result-preview';
    preview.textContent = 'Preview';
    preview.dataset.index = String(index);
    preview.dataset.action = 'preview';
    const downloadButton = document.createElement('button');
    downloadButton.type = 'button';
    downloadButton.className = 'result-download';
    downloadButton.textContent = 'Download .xlsx';
    downloadButton.dataset.index = String(index);
    downloadButton.dataset.action = 'download';
    downloadButton.setAttribute('aria-label', 'Download ' + entry.outputName);
    actions.append(preview, downloadButton);
    item.append(actions);
  } else {
    const warning = document.createElement('span');
    warning.className = 'result-error';
    warning.textContent = 'Not converted';
    item.append(warning);
  }
  ui.results.append(item);
}
function refreshDownloadToolbar() {
  const ready = entries.filter(entry => entry.data).length;
  ui.downloads.hidden = ready === 0;
  ui.downloadCount.textContent = `${ready} workbook${ready === 1 ? '' : 's'} ready to preview or download`;
  ui.downloadAll.disabled = processing || ready === 0;
}
function download(bytes, filename, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
const excelMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
function downloadOne(index) {
  const entry = entries[index];
  if (entry?.data) download(entry.data, entry.outputName, excelMime);
}
function csv(rows) {
  const headers = ['file', 'mode', 'basis', 'colorMode', 'items', 'suppliers', 'rules', 'staticColors', 'cleared', 'printArea'];
  return '\ufeff' + [headers.join(','), ...rows.map(row =>
    headers.map(key => '"' + String(row[key] ?? '').replaceAll('"', '""') + '"').join(',')
  )].join('\r\n');
}
async function downloadAll() {
  if (processing) return;
  const ready = entries.filter(entry => entry.data);
  if (!ready.length) return;
  ui.downloadAll.disabled = true;
  ui.status.textContent = 'Preparing ZIP of formatted workbooks…';
  try {
    const JSZip = await library();
    const zip = new JSZip();
    ready.forEach(entry => zip.file(entry.outputName, entry.data));
    zip.file('Processing_Report.csv', csv(entries.map(entry => entry.report)));
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 2 } });
    download(bytes, 'BAC_PR_AutoFormatted.zip', 'application/zip');
    ui.status.textContent = `Download All started — ${ready.length} formatted workbooks.`;
  } catch (error) {
    ui.status.textContent = 'Could not prepare Download All: ' + (error.message || String(error));
  } finally {
    ui.downloadAll.disabled = false;
  }
}
ui.downloadAll.addEventListener('click', () => { void downloadAll(); });

async function showPreview(index) {
  const entry = entries[index];
  if (!entry?.data) return;
  activePreview = index;
  ui.previewTitle.textContent = entry.outputName;
  ui.previewMeta.textContent = 'Preparing a read-only worksheet preview…';
  ui.previewSheet.replaceChildren();
  ui.previewDownload.disabled = false;
  if (!ui.preview.open) ui.preview.showModal();
  try {
    const [JSZip, { renderWorkbookPreview }] = await Promise.all([
      library(), import('./preview.js?v=1.1.0')
    ]);
    const info = await renderWorkbookPreview(entry.data, ui.previewSheet, JSZip);
    if (activePreview !== index || !ui.preview.open) return;
    const paper = ui.paper.selectedOptions[0]?.textContent || 'Original';
    const scaling = ui.scaling.value === 'adjust' ? ui.scalePercent.value + '% scaling' : 'fit 1 page wide';
    ui.previewMeta.textContent = `${paper} paper · ${scaling} · ${reportDetail(entry.report)} · Preview: ${info.rows} rows × ${info.cols} columns${info.truncated ? ' (limited view)' : ''}`;
  } catch (error) {
    ui.previewMeta.textContent = 'Preview unavailable: ' + (error.message || String(error));
  }
}
ui.results.addEventListener('click', e => {
  const button = e.target.closest('button[data-action]');
  if (!button) return;
  const index = Number(button.dataset.index);
  if (button.dataset.action === 'download') downloadOne(index);
  if (button.dataset.action === 'preview') void showPreview(index);
});
ui.previewClose.addEventListener('click', () => ui.preview.close());
ui.preview.addEventListener('click', e => { if (e.target === ui.preview) ui.preview.close(); });
ui.preview.addEventListener('close', () => { activePreview = -1; });
ui.previewDownload.addEventListener('click', () => downloadOne(activePreview));

const yieldUi = () => new Promise(resolve => setTimeout(resolve, 0));
async function processFiles() {
  if (!selected.length || processing) return;
  processing = true;
  const files = selected.slice(), outputNames = formatNames(files);
  entries = [];
  ui.results.replaceChildren();
  ui.downloads.hidden = true;
  ui.input.disabled = true;
  ui.button.disabled = true;
  [ui.mode, ui.paper, ui.colorMode, ui.scaling, ui.scalePercent, ui.orientation, ui.header, ui.footer].forEach(control => { control.disabled = true; });
  ui.drop.setAttribute('aria-busy', 'true');
  ui.progress.hidden = false;
  ui.progress.value = 0;
  try {
    ui.status.textContent = 'Loading Excel formatter…';
    const [, { transformWorkbook }] = await Promise.all([
      library(), import('./engine.js?v=1.2.0')
    ]);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      ui.status.textContent = `Formatting ${i + 1} of ${files.length}: ${file.name}`;
      await yieldUi();
      let entry;
      try {
        const pageOptions = {
          scaling: ui.scaling.value,
          scalePercent: ui.scalePercent.value,
          orientation: ui.orientation.value,
          header: ui.header.value,
          footer: ui.footer.value
        };
        const result = await transformWorkbook(file.name, await file.arrayBuffer(), ui.mode.value, ui.paper.value, ui.colorMode.value, pageOptions);
        entry = { report: result.report, data: result.data, outputName: outputNames[i] };
      } catch (error) {
        entry = {
          report: { file: file.name, mode: 'ERROR', basis: error.message || String(error) },
          error: true, data: null
        };
      }
      entries.push(entry);
      addResult(entry, i);
      ui.progress.value = (i + 1) / files.length * 100;
      refreshDownloadToolbar();
    }
    const converted = entries.filter(entry => entry.data).length;
    const review = entries.filter(entry => entry.report.mode === 'REVIEW REQUIRED').length;
    ui.status.textContent = `${converted} of ${files.length} workbooks ready. Preview or download individually, or choose Download All.${review ? ' ' + review + ' require classification review.' : ''}`;
  } catch (error) {
    ui.status.textContent = 'Could not process files: ' + (error.message || String(error));
  } finally {
    processing = false;
    ui.input.disabled = false;
    ui.button.disabled = !selected.length;
    [ui.mode, ui.paper, ui.colorMode, ui.scaling, ui.scalePercent, ui.orientation, ui.header, ui.footer].forEach(control => { control.disabled = false; });
    ui.drop.removeAttribute('aria-busy');
    refreshDownloadToolbar();
  }
}
ui.button.addEventListener('click', () => { void processFiles(); });
function updateScalingControl() {
  ui.scalePercentWrap.hidden = ui.scaling.value !== 'adjust';
}
ui.scaling.addEventListener('change', updateScalingControl);
updateScalingControl();
for (const control of [ui.mode, ui.paper, ui.colorMode, ui.scaling, ui.scalePercent, ui.orientation, ui.header, ui.footer]) {
  control.addEventListener('change', () => { if (selected.length && !processing) void processFiles(); });
}