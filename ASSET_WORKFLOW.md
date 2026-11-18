# 3D Asset Generation & Placement Guide (`home-3d`)

This document contains everything a new AI chat session needs to create, verify, and place a dimensionally accurate 3D object (furniture, kitchen cabinetry, sanitary ware, lighting, or garden element) into the **Bouwnummer 55** 3D house visualiser without reading the entire codebase or PDF drawings.

---

## 1. Quick Start for the AI Agent

When the user asks you to create and place a 3D object (e.g., a couch, kitchen island, dining table, bed):

1. **Read only these 3 files**:
   - [src/assets/assetTypes.ts](file:///Users/jortdejong/GitHub/home-3d/src/assets/assetTypes.ts) — Type definitions for `AssetPrefabDefinition` and `PlacedAssetSpec`.
   - [src/assets/assetRegistry.ts](file:///Users/jortdejong/GitHub/home-3d/src/assets/assetRegistry.ts) — Central registry where prefabs and room placements live.
   - [src/model/materials.ts](file:///Users/jortdejong/GitHub/home-3d/src/model/materials.ts) — Semantic material palette (`MATERIAL_PALETTE`).
2. **Create a new procedural 3D asset module** in `src/assets/items/<asset-name>.ts`.
3. **Register the prefab and its placement(s)** in [src/assets/assetRegistry.ts](file:///Users/jortdejong/GitHub/home-3d/src/assets/assetRegistry.ts).
4. **Verify & Rebuild** by running:
   ```bash
   npm run verify && npm run build
   ```
   This checks all dimensional invariants and bundles the updated standalone offline file at [house-visualiser.html](file:///Users/jortdejong/GitHub/home-3d/house-visualiser.html) (and `dist/index.html`).

---

## 2. World Coordinate System & Room Map (Canonical Metres)

**Internal unit is ALWAYS metres (`1.0 = 1.00 m`, `0.85 = 85 cm`).**
Use `m(value, provenance, source)` or `cm(value, provenance, source)` from [src/model/units.ts](file:///Users/jortdejong/GitHub/home-3d/src/model/units.ts) when declaring dimensions.

### World Axes
- **$X$-axis (Left $\to$ Right when viewed from the street):**
  - `-X` = Left side (towards *Berging* / side garden path)
  - `+X` = Right side (towards the `30 cm` shared party wall with neighbour *bnr. 56*)
  - Main house interior spans **`X = +0.40 m` to `X = +5.57 m`** (exact interior width = **`5.17 m`**).
- **$Y$-axis (Vertical height):**
  - `floor: 'plot'` $\to$ `Y = 0.00 m` (stationary garden & driveway)
  - `floor: 'ground'` $\to$ `Y = 0.00 m` (*Begane Grond*, ceiling at `+2.60 m`)
  - `floor: 'first'` $\to$ `Y = +2.85 m` (*1e Verdieping*, ceiling at `+5.45 m`)
  - `floor: 'second'` $\to$ `Y = +5.70 m` (*2e Verdieping / Zolder*, ridge at `+10.90 m`)
  - *(Note: `buildPlacedAssets` automatically adds the floor's base `Y` elevation and attaches the object to that floor's animated group!)*
- **$Z$-axis (Rear/Garden $\to$ Front/Street):**
  - `+Z` = Front street side (*Voorgevel* outer face is at `Z = 0.00 m`, inner face at `Z = -0.40 m`)
  - `-Z` = Rear garden side (*Achtergevel* inner face on extended ground floor is at `Z = -12.46 m`, on 1st/2nd floor at `Z = -10.06 m`)

### Exact Room Interior Bounding Boxes (`[minX, minZ, maxX, maxZ]`)

| Floor (`FloorLayerId`) | Room Name | `minX` → `maxX` (Width) | `minZ` → `maxZ` (Depth) | Clear Size (`W × D`) | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`ground`** | **Woonkamer (Voorzijde)** | `0.40` → `5.57 m` | `-3.84` → `-0.40 m` | `5.17 × 3.44 m` | Front window on `Z = -0.40`, side window on `X = 0.40`, stair wall at `Z = -3.84` (`X: 0.40..3.01`) |
| **`ground`** | **Woonkamer (Doorkijk)** | `3.01` → `5.57 m` | `-7.44` → `-3.84 m` | `2.56 × 3.60 m` | Glass door from Hal on `X = 3.01` (around `Z = -5.82`) |
| **`ground`** | **Woonkeuken & Eetkamer** | `0.40` → `5.57 m` | `-12.46` → `-7.44 m` | `5.17 × 5.02 m` | Tall cabinet niche against `Z = -7.44` (`X: 0.40..3.01`); double garden doors `B13` centered on rear wall `Z = -12.46` (`X: 1.65..4.23`) |
| **`ground`** | **Entree / Hal** | `0.40` → `2.94 m` | `-6.38` → `-3.96 m` | `2.54 × 2.42 m` | Front entrance door on `X = 0.40` (`Z = -5.50`); stairs at `Z: -4.91..-3.96` |
| **`ground`** | **Garderobe / Meterkast Nis** | `0.40` → `1.37 m` | `-7.37` → `-6.38 m` | `0.97 × 0.99 m` | Left of toilet |
| **`ground`** | **Toiletruimte** | `1.44` → `2.94 m` | `-7.37` → `-6.45 m` | `1.50 × 0.92 m` | Door on front wall `Z = -6.45` |
| **`ground`** | **Berging (Garage)** | `-3.19` → `0.00 m` | `-13.64` → `-7.93 m` | `3.19 × 5.71 m` | Double garage doors on `Z = -7.93`, garden door on `Z = -13.64` |
| **`first`** | **Slaapkamer 2 (Voorzijde)** | `0.40` → `5.57 m` | `-3.84` → `-0.40 m` | `5.17 × 3.44 m` | French balcony on `Z = -0.40`, side window on `X = 0.40` |
| **`first`** | **Overloop (1e Verd.)** | `0.40` → `4.00 m` | `-6.23` → `-3.96 m` | `3.60 × 2.27 m` | Stairs at `X: 0.40..2.94, Z: -4.91..-3.96` |
| **`first`** | **Inloopkast / Kast** | `4.07` → `5.57 m` | `-6.23` → `-3.96 m` | `1.50 × 2.27 m` | Door from Overloop on `X = 4.07` |
| **`first`** | **Badkamer** | `0.40` → `2.41 m` | `-10.06` → `-6.30 m` | `2.01 × 3.76 m` | Pipe shaft (`0.34 × 0.92 m`) in front-left corner (`X: 0.40..0.74, Z: -7.22..-6.30`) |
| **`first`** | **Kantoor / Slaapkamer 1** | `2.48` → `5.57 m` | `-10.06` → `-6.30 m` | `3.09 × 3.76 m` | French balcony on rear wall `Z = -10.06` |
| **`second`** | **Zolder (Voorzijde)** | `1.15` → `5.57 m` | `-3.86` → `-0.40 m` | `3.64 × 3.46 m` | `X = 1.15` is the `1.50 m` knee-wall (*knieschot*) |
| **`second`** | **Zolder (Rechts)** | `3.01` → `5.57 m` | `-6.36` → `-3.86 m` | `2.56 × 2.50 m` | Alongside Zolder Overloop |
| **`second`** | **Zolder (Achterzijde)** | `1.15` → `5.57 m` | `-10.06` → `-6.36 m` | `3.64 × 3.70 m` | WP/WTW units in rear-left corner (`X: 1.50..2.30, Z: -9.80..-6.60`) |
| **`plot`** | **Achtertuin** | `-4.28` → `5.87 m` | `-20.63` → `-12.86 m` | `10.15 × 7.77 m` | Stone patio `Z: -14.40..-12.86`; slanted left boundary `-4.28 m` (rear) to `-5.00 m` (front) |
| **`plot`** | **Voortuin & Oprit** | `-5.00` → `5.87 m` | `-7.73` → `+5.00 m` | `10.87 × 5.00 m` | `500 cm` front garden depth in front of `Z = 0.00 m`; `1087 cm` width at `Z = +5.00 m` |

---

## 3. Asset Authoring Rules & Style Guidelines

1. **Local Origin & Orientation Convention:**
   - Inside `build3D({ width, depth, height, getMat })`, construct the `THREE.Group` so that:
     - **X** spans **`[-width / 2, +width / 2]`**
     - **Y** spans **`[0, height]`** (`Y = 0` sits directly on the floor!)
     - **Z** spans **`[-depth / 2, +depth / 2]`**, where **`+Z` is the front face** of the object when `rotationDeg = 0`.
   - **Rotation (`rotationDeg`):**
     - `0°`: Front of object faces `+Z` (towards the front street wall).
     - `90°`: Front of object faces `+X` (towards the right party wall).
     - `180°`: Front of object faces `-Z` (towards the rear garden wall).
     - `270°` (or `-90°`): Front of object faces `-X` (towards the left wall).

2. **Visual Style (Soft Architectural Diorama):**
   - Match the soft, warm, matte aesthetic of the house:
     - Use high roughness (`0.82–0.94`) and near-zero metalness (`0.0–0.1`) so objects look like soft architectural clay/felt/wood rather than shiny plastic.
     - Break objects into clean sub-parts (e.g., for a couch: timber/matte-black legs, base frame, individual seat cushions, back cushions, armrests; for a kitchen island: recessed plinth toe-kick, cabinet carcass, rounded side panels, stone countertop, sink/cooktop).
     - You can use existing semantic materials via `getMat('floor_living_oak')` or create custom `new THREE.MeshStandardMaterial({ color: '...', roughness: 0.9, metalness: 0.0 })` for specific fabric/surface colours.

3. **Template for `src/assets/items/<asset-id>.ts`:**
   ```ts
   import * as THREE from 'three';
   import { AssetPrefabDefinition } from '../assetTypes';
   import { cm } from '../../model/units';

   export const exampleCouchPrefab: AssetPrefabDefinition = {
     prefabId: 'couch_example',
     defaultLabel: 'Bankstel Woonkamer',
     defaultDimensions: {
       width: cm(240, 'user_supplied', 'User supplied couch width 240 cm'),
       depth: cm(95, 'user_supplied', 'User supplied couch depth 95 cm'),
       height: cm(82, 'user_supplied', 'User supplied couch height 82 cm'),
     },
     build3D: ({ width, depth, height }) => {
       const group = new THREE.Group();
       const fabricMat = new THREE.MeshStandardMaterial({
         color: '#e6dfd5',
         roughness: 0.92,
         metalness: 0.0,
       });
       // Build sub-meshes within X: [-width/2, +width/2], Y: [0, height], Z: [-depth/2, +depth/2]
       const baseH = height * 0.45;
       const base = new THREE.Mesh(new THREE.BoxGeometry(width, baseH, depth), fabricMat);
       base.position.set(0, baseH / 2, 0);
       group.add(base);
       return group;
     },
   };
   ```

4. **Optional Interactive Doors / Hinged Parts (`registerInteractiveDoor`):**
   If your asset has hinged doors (e.g. a wardrobe, kitchen cabinet, or refrigerator) that should open on hover and toggle-pin on click:
   - Mount the door mesh inside a `THREE.Group` pivot positioned at the hinge edge.
   - Create an invisible stationary trigger mesh covering the door opening with `mesh.userData.isInteractiveTrigger = true` and `new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })` so it is excluded from shadow/inspector registration.
   - Call `registerInteractiveDoor?.({ subId: 'door', pivots: [{ group: pivot, openAngle: -Math.PI * 0.45, closedAngle: 0, currentAngle: 0 }], triggerMeshes: [trigger, doorMesh] })`.

---

## 4. Copy-Paste Prompt Template for a New Chat

Whenever you want to add a new object in a fresh chat to save tokens, paste this prompt:

> Read `/Users/jortdejong/GitHub/home-3d/ASSET_WORKFLOW.md` and add the following 3D asset to the house:
> - **Object:** [e.g. Corner couch / Kitchen island / Dining table]
> - **Dimensions:** [e.g. 260 cm wide × 98 cm deep × 80 cm high]
> - **Location & Orientation:** [e.g. Ground floor Woonkamer (Voorzijde), centered against the front window facing into the room]
> - **Style / Photo Reference:** [Attach photo or describe colours/materials]
> Follow the workflow in `ASSET_WORKFLOW.md`, register the asset in `src/assets/assetRegistry.ts`, and run `npm run verify && npm run build`.

---

## 5. Inspecting a Single Asset in Isolation (dev only)

After creating and registering a prefab, inspect it alone (orbit/zoom, wireframe, front/back/side/top views, 10 cm grid, 1.75 m human scale reference, target-vs-actual bounding box check in cm, base-at-Y=0 and XZ-centred checks, front-arrow `+Z`, mesh/tri/material counts):

```bash
npm run asset:dev                          # live dev server at /asset-viewer.html (?asset=<prefabId>, dropdown lists all prefabs)
ASSET=<prefabId> npm run asset:build       # standalone offline file: asset-viewer-standalone.html
```

The viewer reads `ASSET_PREFABS` (and the matching `PLACED_ASSETS` `dimensionsOverride` if placed). Red numbers in the table mean the built geometry deviates >5 mm from the target dimensions. It is separate from the house build (`npm run build`) and not part of `house-visualiser.html`. Agents: use this to validate an asset before/after placing it.
