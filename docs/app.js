import { classifyWorkbook } from "./classifier-core.js?v=1.0.2";

const state = {
  results: [],
  filter: "All",
};

const elements = {
  dropZone: document.querySelector("#drop-zone"),
  fileInput: document.querySelector("#file-input"),
  browseButton: document.querySelector("#browse-button"),
  status: document.querySelector("#status"),
  resultsSection: document.querySelector("#results-section"),
  resultsBody: document.querySelector("#results-body"),
  summary: document.querySelector("#summary"),
  filters: document.querySelector("#filters"),
  exportButton: document.querySelector("#export-button"),
  clearButton: document.querySelector("#clear-button"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function classificationClass(classification) {
  return classification.toLowerCase().replace(/[^a-z]+/g, "-").replace(/(^-|-$)/g, "");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(value);
}

function renderSummary() {
  const classifications = ["Line Bid", "Lot Bid", "Needs Review"];
  elements.summary.innerHTML = [
    { label: "Workbooks", value: state.results.length, className: "total" },
    ...classifications.map((classification) => ({
      label: classification,
      value: state.results.filter((result) => result.classification === classification).length,
      className: classificationClass(classification),
    })),
  ].map((item) => `
    <div class="summary-card ${item.className}">
      <span>${escapeHtml(item.label)}</span>
      <strong>${item.value}</strong>
    </div>
  `).join("");
}

function renderEvidence(result) {
  if (result.error) return `<p class="error-detail">${escapeHtml(result.error)}</p>`;
  const rows = result.rankedCells.map((cell) => `
    <tr>
      <td><code>${escapeHtml(cell.reference)}</code></td>
      <td>${escapeHtml(cell.rank)}</td>
      <td>${escapeHtml(cell.supplier)}</td>
      <td>${cell.value === null ? "—" : escapeHtml(formatCurrency(cell.value))}</td>
      <td><code>${escapeHtml(cell.formula || "Cached value")}</code></td>
    </tr>
  `).join("");
  return `
    <div class="evidence-panel">
      <div class="evidence-meta">
        <span>Sheet: <strong>${escapeHtml(result.sheetName)}</strong></span>
        <span>Items: <strong>${result.itemCount}</strong></span>
        <span>Bidders: <strong>${result.bidderCount}</strong></span>
        <span>Legend entries: <strong>${result.legendEntriesFound}/4</strong></span>
      </div>
      <p class="participation-note">${escapeHtml(result.participationNote)}</p>
      <div class="table-scroll evidence-scroll">
        <table class="evidence-table">
          <thead><tr><th>Cell</th><th>Rank</th><th>Bidder</th><th>Calculated value</th><th>Formula</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5">No ranked cells detected.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderResults() {
  const visible = state.filter === "All"
    ? state.results
    : state.results.filter((result) => result.classification === state.filter);

  renderSummary();
  elements.resultsSection.hidden = state.results.length === 0;
  elements.exportButton.disabled = state.results.length === 0;
  elements.clearButton.disabled = state.results.length === 0;

  elements.resultsBody.innerHTML = visible.map((result) => {
    const classification = result.error ? "Needs Review" : result.classification;
    return `
      <tr class="result-row">
        <td>
          <div class="file-name">${escapeHtml(result.fileName)}</div>
          <div class="muted">${escapeHtml(result.prNumber || "Not detected")}</div>
        </td>
        <td><span class="badge ${classificationClass(classification)}">${escapeHtml(classification)}</span></td>
        <td>${escapeHtml(result.confidence || "Low")}</td>
        <td>${escapeHtml(result.reason || result.error)}</td>
        <td><button class="details-button" type="button" aria-expanded="false">View evidence</button></td>
      </tr>
      <tr class="details-row" hidden><td colspan="5">${renderEvidence(result)}</td></tr>
    `;
  }).join("") || '<tr><td colspan="5" class="empty-filter">No results match this filter.</td></tr>';

  document.querySelectorAll(".details-button").forEach((button) => {
    button.addEventListener("click", () => {
      const detailsRow = button.closest("tr").nextElementSibling;
      const willOpen = detailsRow.hidden;
      detailsRow.hidden = !willOpen;
      button.setAttribute("aria-expanded", String(willOpen));
      button.textContent = willOpen ? "Hide evidence" : "View evidence";
    });
  });
}

async function analyzeFiles(fileList) {
  const files = [...fileList].filter((file) => /\.xlsx$/i.test(file.name));
  if (files.length === 0) {
    elements.status.textContent = "Choose one or more .xlsx workbooks.";
    elements.status.className = "status error";
    return;
  }

  elements.status.className = "status working";
  state.results = [];
  renderResults();

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    elements.status.textContent = `Analyzing ${index + 1} of ${files.length}: ${file.name}`;
    try {
      const buffer = await file.arrayBuffer();
      state.results.push(await classifyWorkbook(buffer, file.name));
    } catch (error) {
      state.results.push({
        fileName: file.name,
        prNumber: "Not detected",
        classification: "Needs Review",
        confidence: "Low",
        reason: error.message,
        error: error.message,
      });
    }
    renderResults();
  }

  const successful = state.results.filter((result) => !result.error).length;
  elements.status.textContent = `Finished: ${successful} of ${files.length} workbook(s) classified.`;
  elements.status.className = successful === files.length ? "status success" : "status warning";
}

function csvValue(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCsv() {
  const header = ["File", "PR number", "Classification", "Confidence", "Items", "Bidders", "Evidence cells", "Reason", "Participation note"];
  const rows = state.results.map((result) => [
    result.fileName,
    result.prNumber,
    result.classification,
    result.confidence,
    result.itemCount ?? "",
    result.bidderCount ?? "",
    result.evidenceCells?.join(" ") || "",
    result.reason,
    result.participationNote || "",
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvValue).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "bac-bid-basis-results.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

elements.browseButton.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", (event) => analyzeFiles(event.target.files));
elements.exportButton.addEventListener("click", exportCsv);
elements.clearButton.addEventListener("click", () => {
  state.results = [];
  elements.fileInput.value = "";
  elements.status.textContent = "No workbook selected.";
  elements.status.className = "status";
  renderResults();
});

for (const eventName of ["dragenter", "dragover"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("drag-active");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("drag-active");
  });
}
elements.dropZone.addEventListener("drop", (event) => analyzeFiles(event.dataTransfer.files));

elements.filters.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter;
  elements.filters.querySelectorAll("button").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  renderResults();
});

renderResults();
