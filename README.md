# BAC PR Auto-Formatter

A single, browser-based Excel formatter for BAC abstract-of-bids purchase requisitions. The separate Bid Basis Checker page has been retired because Line Bid / Lot Bid recognition is already part of the formatter.

**Website:** https://crmry.github.io/joemel/

The homepage opens the formatter directly at https://crmry.github.io/joemel/formatter/.

## How it works

1. Drop one or more BAC abstract-of-bids `.xlsx` workbooks into the page.
2. Keep **Auto detect** to infer Line vs Lot Bid from workbook evidence, or explicitly select Line Bid or Lot Bid when the bidding documents require it.
3. **Folio** is the default paper size. You can change it to Keep original, Legal, A4, or Letter.
4. **Standard colors (Windows & Mac)** are automatically used for every workbook. The former Color Update Mode control has been replaced by the **Legend** (green 1st, yellow 2nd, orange 3rd, pink Above ABC) alongside the visible formatting options. Reprocess workbooks if bid prices change, because the colors remain fixed.
5. **Page Setup is hidden and automatic**: all workbooks use **Adjust to 70%**, **Landscape**, and **Keep original** for headers and footers. Paper size still defaults to Folio, and obsolete cached printer settings are unlinked.
6. Files are **formatted automatically upon upload**. Downloads use the **original uploaded `.xlsx` filenames** (no added `_formatted` suffix); duplicate filenames receive a number to avoid conflicts. Each successful result has a **Preview** action and its own **Download** button. Review its rendered worksheet before saving it.
7. Click **Download All (.zip)** to save all successfully formatted workbooks plus the processing report. **Reprocess selected workbooks** can be used after changing settings.

The four legend badges now have brief tooltips on hover, focus, or tap. The **How it works** area gives a concise Upload → Review → Download workflow.

The preview is a read-only worksheet representation showing cell values, merged cells and standard fill colors. It is **not a print-accurate representation of Excel**, and is limited to the first 65 rows and 32 columns. Users should confirm final pagination in Excel's Page Layout before printing.

The formatter preserves worksheet values, formulas, merged cells and existing layout; configures the print area, 70% scaling, and landscape orientation; and applies the legend: **1st (green), 2nd (yellow), 3rd (orange), Above ABC (pink)**. Line Bids rank by item, while Lot Bids rank on lot totals. Equal amounts share the same rank.

All workbook data stays on the visitor's device and is processed in browser memory. No backend upload, database, or persistent file storage is used. Excel processing code loads only when formatting is requested.

## Deployment

GitHub Pages publishes the `main` branch's `/docs` directory. The source application lives in `src/formatter/`, and the publishable copy lives in `docs/formatter/`. The root page `src/index.html` redirects to the formatter.

To rebuild with Node.js:

```bash
npm install
npm run build
```

The build copies only the formatter and bundled JSZip dependency into `docs/`, excluding the retired Bid Basis Checker application.

The legacy `src/classifier-core.js` is retained only for the existing regression tests; it is not shipped to GitHub Pages or used by the formatter. Those tests depend on local sample workbooks and may require the original test fixtures to be available.

## Caution

Automatic bid classification for unfamiliar PR templates may be uncertain. Confirm Line/Lot classification against the official procurement documents and review the output before using it in BAC proceedings.

## Repair previously formatted workbooks

Existing files with names ending in `_formatted.xlsx` can be re-uploaded. The formatter removes that suffix from the download filename, recovers Line/Lot Bid classification from embedded metadata or old ranking rules, and can fall back to the verified reference PR numbers from this 25-workbook BAC batch.

**PR 15 (2026-08-1509)** is a **Line Bid**, with `I14` (444,931.20) ranked first (green) and `G14` (447,300.00) ranked second (yellow). Both are within the ₱450,000 ABC. The formatter now validates that eligible cells have their expected ordinary Excel fill colors and that the written worksheet XML contains those styles. If classification or color verification fails, it reports an error instead of offering a misleading "formatted" download.
