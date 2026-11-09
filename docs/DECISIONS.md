# Architectural Decision Records (ADR)

## ADR-001: Modularize Frontend Using Native ES Modules

- **Status:** Accepted & Implemented
- **Date:** 2026-11-09
- **Context:**
  The frontend Single Page Application (SPA) was previously authored in a single monolithic file `web/static/js/app.js` spanning 1,233 lines alongside a global `window.API` object in `web/static/js/api.js`. This mixed application state, DOM utilities, third-party AniList GraphQL queries, view rendering, toast notifications, SSE stream lifecycle, and modal import form logic in one closure, increasing regression risk when adding new features.
- **Decision:**
  Decompose frontend logic into self-contained Native ECMAScript Modules (ESM) (`services/`, `components/`, `utils.js`, `state.js`, `api.js`) served directly to modern browsers using `<script type="module" src="/static/js/app.js"></script>`.
- **Consequences:**
  - **Positive:**
    - Clean separation of concerns with isolated component scopes.
    - Reduced `app.js` footprint to ~150 lines as a pure orchestrator.
    - Preserved zero-dependency build architecture (*no node_modules, no bundlers*) adhering to project guidelines.
    - Enables per-module HTTP browser caching.
  - **Negative / Trade-off:**
    - Requires a modern browser supporting Native ES Modules (supported by >99% of global browsers since 2018).
