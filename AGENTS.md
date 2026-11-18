# AGENTS.md — Bouwnummer 55 3D House Visualiser (`home-3d`)

This file is the canonical context & operating manual for AI agents working in `/Users/jortdejong/GitHub/home-3d/`. Read this file first in any new chat session.

---

## 1. Project Overview & Build Target
- **Subject**: Interactive, dimensionally accurate 3D architectural diorama visualiser for **Bouwnummer 55** (*Wonen aan de Hulk, Scharwoude* — two-under-one-roof house with attached *Berging* and `2.40 m` rear extension `B11a`).
- **Attached Context**: Right-hand neighbour **Bouwnummer 56** (`2.20 m` cutaway section in neutral greyscale) and a `~1.85 m` surrounding ground margin with a soft radial GLSL fade.
- **Standalone Build Output**: Compiles via Vite + `vite-plugin-singlefile` into a self-contained, offline-ready HTML file at `/Users/jortdejong/GitHub/home-3d/house-visualiser.html` (and `dist/index.html`).
- **Always Verify & Build + Commit Checkpoints**:
  After any code change, always run:
  ```bash
  npm run verify && npm run build
  ```
  and commit a clean Git checkpoint (`git add -A && git commit -m "..."`) when a task is completed.

---

## 2. Canonical 3D Coordinate System (`1.0 = 1.00 metre`)
All internal geometry uses **metres** (`1.0 = 1.00 m`). Helper functions `m(...)` and `cm(...)` in `src/model/units.ts` attach provenance metadata (`verified_drawing` | `user_supplied` | `calculated` | `assumed`).

- **`X` axis (Left → Right, West → East)**:
  - `X = -5.00 m` (front-left plot corner) to `X = -4.28 m` (rear-left plot corner): Slanted left plot boundary (`10.87 m` front plot width, `10.15 m` rear plot width).
  - `X = -3.27 m` to `X = 0.00 m`: Attached *Berging* (`8 cm` left wall at `X = -3.27..-3.19 m`, `3.19 m` interior at `X = -3.19..0.00 m`).
  - `X = 0.00 m`: Outer face of main house left brick wall (`40 cm` thick).
  - `X = 0.40 m`: Inner face of main house left wall.
  - `X = 0.40 m` to `X = 5.57 m`: Main house interior width (**`5.17 m` / `517 cm`** across all floors).
  - `X = 5.57 m` to `X = 5.87 m`: Shared neighbour wall (*woningscheidende wand*, **`30 cm` thick**, centerline `X = 5.72 m`).
  - `X = 5.87 m`: Straight right plot boundary (`25.63 m` total length) and start of neighbour `bnr. 56` cutaway (`X = 5.87..8.05 m`).
- **`Z` axis (Rear → Front)**:
  - `Z = +5.00 m`: Front plot boundary (`5.00 m` front garden depth in front of `Z = 0.00 m`).
  - `Z = 0.00 m`: Outer face of main house front façade (`Voorgevel`).
  - `Z = -0.40 m`: Inner face of `40 cm` front exterior wall.
  - `Z = -10.06 m`: Inner face of `40 cm` upper-floor rear exterior wall (`9.66 m` base interior depth).
  - `Z = -10.46 m`: Outer face of upper-floor rear exterior wall (`10.46 m` base exterior depth).
  - `Z = -12.46 m`: Inner face of `40 cm` extended ground-floor rear wall (`9.66 m + 2.40 m B11a extension = 12.06 m` interior depth).
  - `Z = -12.86 m`: Outer face of extended ground-floor rear wall (`12.86 m` exterior depth).
  - `Z = -13.72 m`: Outer face of *Berging* rear wall (`0.86 m` protrusion behind extended house; *Berging* spans `Z = -7.73..-13.72 m`, total length `5.99 m`).
  - `Z = -20.63 m`: Rear plot boundary (`7.77 m` back garden depth behind `Z = -12.86 m`).
- **`Y` axis (Vertical Elevation)**:
  - `Y = 0.00 m`: Ground floor finished floor level (*Peil*), `2.60 m` ceiling height.
  - `Y = +2.85 m`: 1st floor finished floor level (`2.60 m` ceiling + `0.25 m` slab), `2.60 m` ceiling height, and flat roof elevation of the *Berging* & `2.40 m` rear extension.
  - `Y = +5.70 m`: 2nd floor (*Zolder*) finished floor level (`2.85 m + 2.60 m + 0.25 m`).
  - `Y = +6.13 m`: Eaves gutter height (*goothoogte*, `+0.43 m` above Zolder floor).
  - `Y = +10.90 m`: Roof ridge height (*nokhoogte*, `+5.20 m` above Zolder floor; underside of roof slab at `+10.62 m` / `+4.92 m` above Zolder floor).

---

## 3. Verified Dimensional Chains (`0.0 mm` Discrepancy)
All chains are automatically asserted by `npm run verify` (`src/scripts/verifyDimensions.ts`):

- **Wall Thicknesses**:
  - Main house outer walls (front, left, rear): **`40 cm` (`0.40 m`)**
  - Shared neighbour wall (*woningscheidende wand*): **`30 cm` (`0.30 m`)**
  - Load-bearing wall in front of stairs (Ground & 1st floor): **`12 cm` (`0.12 m`)**
  - Standard inner walls (Ground & 1st floor): **`7 cm` (`0.07 m`)**
  - Attic (*Zolder*) stair-hall (*Overloop*) inner walls: **`12.5 cm` (`0.125 m`)**
  - *Berging* front wall (with garage door): **`20 cm` (`0.20 m`)**; other *Berging* walls: **`8 cm` (`0.08 m`)**
- **Total Building Width (`914 cm`)**:
  `8 cm` (Berging left wall) + `319 cm` (Berging) + `40 cm` (Left outer wall) + `517 cm` (Main interior) + `30 cm` (Shared wall) = **`914 cm` (`9.14 m`)**.
- **Ground Floor Chains**:
  - Depth: `344 cm` (Woonkamer voor) + `12 cm` (Trapwand) + `242 cm` (Hal) + `7 cm` + `92 cm` (Toilet) + `7 cm` + `262 cm` (Keuken basis) = **`966 cm`** (`+ 240 cm` B11a extension = **`1206 cm`** interior / **`1286 cm`** exterior).
  - Width: `254 cm` (Hal) + `7 cm` (Wand) + `256 cm` (Woonkamer passage) = **`517 cm`**.
  - Hal/Toilet Width: `97 cm` (Niche) + `7 cm` (Wand) + `150 cm` (Toilet) = **`254 cm`**.
- **1st Floor Chains**:
  - Depth: `344 cm` (Slaapkamer 2) + `12 cm` (Trapwand) + `227 cm` (Overloop/Kast) + `7 cm` + `376 cm` (Badkamer/Kantoor) = **`966 cm`**.
  - Middle Width: `360 cm` (Overloop) + `7 cm` (Wand) + `150 cm` (Inloopkast) = **`517 cm`**.
  - Rear Width: `201 cm` (Badkamer) + `7 cm` (Wand) + `309 cm` (Kantoor) = **`517 cm`**.
- **2nd Floor (*Zolder*) Chains**:
  - Depth: `346 cm` (Zolder voor) + `12.5 cm` (Wand) + `225 cm` (Overloop) + `12.5 cm` (Wand) + `370 cm` (Zolder achter) = **`966 cm`**.
  - Right-side Party Wall & Corner *Knieschotten* Depth: `157.5 cm` (Front corner knieschot) + `651 cm` (Middle party wall span) + `157.5 cm` (Rear corner knieschot) = **`966 cm`**.
  - Width at `H = 1.50 m`: `74 cm` (Left eaves storage) + `178 cm` (Overloop) + `12.5 cm` (Wand) + `252.5 cm` (Zolder rechts) = **`517 cm`** (`443 cm` from left knieschot to shared wall; `364 cm` between left and right corner knieschotten).
  - Overloop Door (`sf_door_overloop_to_zolder`): Positioned at `offsetAlongWall: 1.714 m` on `sf_int_overloop_right` so its rear/top edge is **`19.6 cm`** from the inner rear wall (`32.1 cm` from outer corner), clear of the stairs.

---

## 4. Key Architectural & Visual Rules
1. **Exterior Wall Orientation & Trim**:
   - All owned exterior walls (`isExterior: true, !isNeighbour`) are oriented counter-clockwise in `(X, Z)` so their local `+Z` normal points **outward**.
   - Decorative red-brown brick frames (`hasTerracottaSurround`) and the front door arch (`hasArchTrim`) in `src/geometry/componentCatalog.ts` are mounted strictly on the exterior face (`+wallThickness / 2`), leaving interior walls clean white plaster.
2. **Floor Slabs Inside Outer Walls**:
   - Structural floor slabs (`buildStructuralSlabCollars` in `src/geometry/houseBuilder.ts`) span strictly between the inner faces of the exterior walls (`X: 0.40..5.57 m`), while exterior & shared party walls extend `25 cm` downward (`bottomY = -0.25 m`) so no white slab stripe or stairwell gap is ever visible on the yellow brick exterior.
3. **White Double-90°-Turn Staircases**:
   - Both the Ground→1st and 1st→2nd floor stairs use the centralized `instantiateWhiteDoubleTurnStaircase3D` prefab in `src/geometry/componentCatalog.ts` (two `90°` winder turns with 3 kites each, central straight treads, newel posts, and spindled balustrades, all finished in white).
4. **Intersecting Roof System (*Dwarskap* + *Langskap*) & Zolder *Knieschotten***:
   - Built via `buildVerticalExtrudedRoofPolygon` in `src/geometry/houseBuilder.ts` so the main front-to-back *dwarskap* (`ridgeX = 2.985 m`) and perpendicular *langskap* (`nbRidgeZ = -5.23 m`) share exact 3D vertices along the diagonal valley lines (*kielkepers*) with zero gap.
   - The perpendicular *langskap* wing above Bouwnummer 55's Zolder (`X: 2.985..5.87 m`) is colored in `roof_tile_anthracite`; only the neighbour section (`X: 5.87..8.05 m`) is `neighbour_roof_grey`.
   - The front-right and rear-right corner *knieschotten* are flat-topped (not slanted) knee walls with a uniform height of `1.50 m` (`150 cm`), positioned at `X = 4.78 m` (spanning `79 cm` from the shared party wall) and `Z = -1.975 m` (front) / `Z = -8.485 m` (rear, `157.5 cm` corner depth), matching Verkooptekening VK-06.
5. **Scroll-Driven Assembly & Staggered Secondary/Furniture Drop**:
   - Scroll steps (`src/viewer/scrollTimeline.ts`): `0 · Kavel` → `1 · Begane Grond` → `2 · 1e Verdieping` → `3 · 2e Verdieping` → `4 · Kap`.
   - Secondary/furniture assets (`staggeredAssets`: the 14 *Oprit* pavers, *Tuinpoort*, Zolder WP warmtepomp unit, and any furniture in `PLACED_ASSETS`) drop right behind their floor (`8%–26%` start offset, `6.5 m` relative drop height) in a pseudo-random staggered cascade.
6. **Removed UI Toggles**:
   - Do **not** re-add the `Optie B33: Inloopkast Open` toggle (the 1st-floor walk-in closet is permanently enclosed) or the `Maatvoering & Bronnen` toggle (dimensions and provenance are inspected directly via the bottom-right selection card).

---

## 5. Adding 3D Furniture & Assets in New Chats (Model & Token Efficiency)
- See **[ASSET_WORKFLOW.md](file:///Users/jortdejong/GitHub/home-3d/ASSET_WORKFLOW.md)** for the step-by-step workflow to create and place 3D furniture/assets (`src/assets/items/<assetId>.ts` → register in `src/assets/assetRegistry.ts`).
- Every asset placed in `PLACED_ASSETS` automatically receives `category: 'furniture'` metadata and participates in the staggered drop animation on its floor.
- **Using Different Models Across Chats**:
  - You can start a new chat on any lighter/faster model for general placement, layout adjustments, or code edits, and either switch models in the chat selector when generating complex 3D asset geometry or ask the agent to delegate the 3D asset generation to a subagent/worker (`invoke_subagent` with `Model: "pro"` or `swarm` `add` with a specific model).

---

## 6. Repository Map
- `src/model/units.ts` — `m()`, `cm()`, provenance types and formatting.
- `src/model/materials.ts` — Semantic `MaterialId` palette for Day and Night modes.
- `src/model/houseData.ts` — Canonical dimensions (`HOUSE_DIMENSIONS`), walls (`getHouseWalls()`), and room floor slabs (`getRoomFloors()`).
- `src/geometry/componentCatalog.ts` — Reusable 3D architectural prefabs (`OPENING_PREFABS`, `instantiateOpeningPrefab3D`, `instantiateWhiteDoubleTurnStaircase3D`).
- `src/geometry/houseBuilder.ts` — Procedural 3D scene builder (`buildHouseScene`, `getZolderRoofUndersideY`, `buildPitchedRoofSystem`).
- `src/assets/assetTypes.ts` & `src/assets/assetRegistry.ts` — Modular 3D furniture/asset registry (`ASSET_PREFABS`, `PLACED_ASSETS`).
- `src/viewer/scrollTimeline.ts` — Scroll-driven floor & staggered furniture drop animation.
- `src/viewer/dayNightController.ts` — Day/Night lighting transition and 180° rotating celestial backdrop wheel.
- `src/viewer/cameraController.ts` — Orthographic isometric diorama camera controller.
- `src/scripts/verifyDimensions.ts` — Automated dimensional chain, wall orientation, roof intersection, and 3D scene verification suite.
