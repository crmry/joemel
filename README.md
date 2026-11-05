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
