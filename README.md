# Joemel BAC Bid Basis Checker

A browser-only GitHub Pages tool that classifies BAC abstract-of-bids Excel workbooks as:

- Line Bid
- Lot Bid
- Needs Review

The analyzer reads the workbook locally in the visitor's browser. It does not upload workbook data to a server.

## How the classification works

- **Line Bid:** ranking evidence occurs on numbered item lines or supporting section subtotals, without one ranked total for the complete PR.
- **Lot Bid:** ranking colors occur only on one final aggregate bidder-total row covering the complete item schedule.
- **Needs Review:** evidence is absent, conflicting, or does not match the supported BAC workbook structure.

Blank or uncolored bidder cells are neutral. They may mean that a supplier did not submit an offer for that item. The classifier determines the bid basis from where the available rankings are applied, not from whether every bidder or item has a color.

Each result includes the exact ranked cells, formula, supplier name, and cached calculated value.

## Local verification

```bash
npm install
npm run verify
```

The regression tests use the BAC workbooks in `/Users/crimary/Documents/BAC/October 8, 2026 Abstract of Bids PB 02-2027_edited` and expect:

- PR 1–8: Line Bid
- PR 9: Lot Bid

## GitHub Pages

The generated site is stored in `docs/`.

The build embeds the stylesheet in `docs/index.html` to avoid a separate render-blocking request on slower GitHub Pages connections.

1. Push this repository to GitHub as `crmry/joemel`.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Select the `main` branch and `/docs` folder, then save.

The project URL will be `https://crmry.github.io/joemel/`.

## Scope

The tool is a workbook-evidence checker. It does not replace approved bidding documents, BAC resolutions, or applicable procurement rules.

## Color & Page Setup Fixer

The same GitHub Pages website also provides the [BAC Color & Page Setup Fixer](https://crmry.github.io/joemel/formatter/).

- Drop one or more BAC abstract-of-bids `.xlsx` workbooks.
- Select **Auto detect**, or override the bidding classification as **Line Bid** or **Lot Bid** when documentary evidence requires it.
- Choose **Keep original** paper size (recommended) or a specific paper size.
- Click **Format & Download**. One file downloads as a formatted workbook; multiple files download as a ZIP with a processing report.
- The formatter preserves cell values and formulas, sets print area and landscape one-page-wide scaling, and writes live legend-based conditional formatting (1st, 2nd, 3rd, Above ABC).

All processing happens in the browser. Excel files are never sent to GitHub Pages or stored on a server. The Excel ZIP library and editing engine load only when conversion is requested.

The browser formatter is maintained in `src/formatter/`, with the corresponding deployable copy in `docs/formatter/`. The existing build script copies `src` to `docs`. The engine is designed for these BAC comparison templates, not arbitrary spreadsheet layouts. Automatic classification of PR 10 and above is inferred from workbook evidence and should be checked against official bid documents.
