# Joemel BAC Bid Basis Checker

A browser-only GitHub Pages tool that classifies BAC abstract-of-bids Excel workbooks as:

- Line Bid
- Lot Bid
- Grouped/Section Bid
- Needs Review

The analyzer reads the workbook locally in the visitor's browser. It does not upload workbook data to a server.

## How the classification works

- **Line Bid:** ranking colors occur on individual item rows.
- **Lot Bid:** ranking colors occur only on the final aggregate bidder totals.
- **Grouped/Section Bid:** ranking colors occur on intermediate subtotal rows.
- **Needs Review:** evidence is absent, conflicting, or does not match the supported BAC workbook structure.

Each result includes the exact ranked cells, formula, supplier name, and cached calculated value.

## Local verification

```bash
npm install
npm run verify
```

The regression tests use the BAC workbooks in `/Users/crimary/Documents/BAC/October 8, 2026 Abstract of Bids PB 02-2027_edited` and expect:

- PR 1: Grouped/Section Bid
- PR 2–8: Line Bid
- PR 9: Lot Bid

## GitHub Pages

The generated site is stored in `docs/`.

1. Push this repository to GitHub as `crmry/joemel`.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Select the `main` branch and `/docs` folder, then save.

The project URL will be `https://crmry.github.io/joemel/`.

## Scope

The tool is a workbook-evidence checker. It does not replace approved bidding documents, BAC resolutions, or applicable procurement rules.
