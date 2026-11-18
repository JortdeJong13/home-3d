# Bouwnummer 55 — 3D Architectural House Visualiser (`home-3d`)

Interactive, dimensionally accurate 3D architectural diorama visualiser for **Bouwnummer 55** (*Wonen aan de Hulk, Scharwoude*), built with TypeScript, Three.js, and Vite, compiling into a single standalone HTML file (`house-visualiser.html`).

---

## Quick Start

```bash
# 1. Run the automated dimensional & 3D scene-graph audit
npm run verify

# 2. Build the standalone single-file HTML visualiser (outputs ./house-visualiser.html)
npm run build

# 3. Start local Vite development server
npm run dev
```

You can also open [house-visualiser.html](file:///Users/jortdejong/GitHub/home-3d/house-visualiser.html) directly in any browser without a server.

---

## Documentation for New Chats & Agents

- **[AGENTS.md](./AGENTS.md)** — Complete architectural specification, coordinate system (`1.0 = 1.00 m`), verified dimensional chains across all floors, roof/attic geometry rules, and git checkpoint workflow.
- **[ASSET_WORKFLOW.md](./ASSET_WORKFLOW.md)** — Self-contained guide and room coordinate map for generating and placing new 3D furniture or interior/exterior assets in separate chat sessions.

---

## Features

- **1:1 Metric Accuracy (`1.0 = 1.00 m`)**: Verified against official builder drawings (`Verkooptekening VK-06`, `Tekening woonwensen 55.1–55.3`, `Technische omschrijving.pdf`) and HomeByMe floor plans with `0.0 mm` chain discrepancy.
- **Scroll-Driven Floor Assembly + Staggered Asset Cascade**:
  - `0 · Kavel & Tuin` (`10.15 m` rear width, `10.87 m` front width, `25.63 m` right boundary)
  - `1 · Begane Grond` (`12.06 m` extended interior depth, `5.17 m` width, attached *Berging*, plus staggered *Oprit* pavers & *Tuinpoort*)
  - `2 · 1e Verdieping` (`9.66 m × 5.17 m` interior + flat roofs of the `2.40 m` extension & *Berging*)
  - `3 · 2e Verdieping (Zolder)` (`9.66 m` interior length, `12.5 cm` *Overloop* walls, side & corner *knieschotten*, WP/WTW units)
  - `4 · Kap & Volledige Woning` (Intersecting *Dwarskap* + *Langskap* roof with diagonal *kielkeper* valleys and neutral greyscale neighbour `bnr. 56` cutaway)
- **Day / Night Mode**: Smooth celestial transition with a 180° rotating sun/moon backdrop wheel, arcing directional shadows, and warm interior lighting.
- **Interactive Element Inspector**: Click any 3D wall, floor, window, door, stair, roof slope, or furniture item to inspect its exact dimensions and source provenance in the bottom-right card.
