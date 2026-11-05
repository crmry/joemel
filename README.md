# BAC Color & Page Setup Fixer

A single, browser-based Excel formatter for BAC abstract-of-bids purchase requisitions. The separate Bid Basis Checker page has been retired because Line Bid / Lot Bid recognition is already part of the formatter.

**Website:** https://crmry.github.io/joemel/

The homepage opens the formatter directly at https://crmry.github.io/joemel/formatter/.

## How it works

1. Drop one or more BAC abstract-of-bids `.xlsx` workbooks into the page.
2. Keep **Auto detect** to infer Line vs Lot Bid from workbook evidence, or explicitly select Line Bid or Lot Bid when the bidding documents require it.
3. **Folio** is the default paper size. You can change it to Keep original, Legal, A4, or Letter.
4. Choose **Page Setup** options: **Fit to 1 page wide** (default) or **Adjust to a percentage** (enter 70 to match the original PR template), portrait/landscape, and Header/Footer selections (**Keep original**, **None**, or centered **Page X of Y** footer). The original 25 PR templates contain legacy printer settings; the formatter unlinks those cached settings so Excel for Mac will read your newly chosen settings.
5. Choose a color mode:
   - **Live colors:** uses Excel conditional formatting so colors update when bid amounts change. Some Excel for Mac installations may display conditional fills incorrectly.
   - **Mac compatibility (static colors):** writes visible Excel fill colors directly, avoiding conditional-fill rendering issues. Re-run conversion after changes to amounts because colors will not update automatically.
6. Files are **formatted automatically upon upload**. Downloads use the **original uploaded `.xlsx` filenames** (no added `_formatted` suffix); duplicate filenames receive a number to avoid conflicts. Each successful result has a **Preview** action and its own **Download** button. Review its rendered worksheet before saving it.
7. Click **Download All (.zip)** to save all successfully formatted workbooks plus the processing report. **Reprocess selected workbooks** can be used after changing settings.

The preview is a read-only worksheet representation showing cell values, merged cells and standard fill colors. It is **not a print-accurate representation of Excel**, and is limited to the first 65 rows and 32 columns. Users should confirm final pagination in Excel's Page Layout before printing.

The formatter preserves worksheet values, formulas, merged cells and existing layout; configures the print area and chosen scaling (Fit to Width or Adjust to %); and applies the legend: **1st (green), 2nd (yellow), 3rd (orange), Above ABC (pink)**. Line Bids rank by item, while Lot Bids rank on lot totals. Equal amounts share the same rank.

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
