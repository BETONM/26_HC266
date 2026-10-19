# Bench layout

All coordinates are millimetres in the Blender/Gazebo world frame:
**+X right, +Y back, +Z up**, and **Z = 0 is the bench surface**.
The display floor spans X −700 … +700 and Y −194.6 … +405.4 (1400 × 600).

Two arrangements are kept, and both are simulated. Coordinates live in
[`blender/scripts/layouts.py`](../blender/scripts/layouts.py) — change them
there and every drawing and world file follows.

---

## 4-zone (default)

`gazebo/worlds/lab_bench.world` · `ros2 launch … layout:=4zone`

![4 zone](../drawings/bench_topview_4zone.png)

| # | Zone | X span | Width | Gap before |
|---|------|--------|-------|------------|
| ① | 폐기통 Waste bucket | −652.0 … −495.0 | 157.0 | 48.0 (left edge) |
| ② | 비커 Beaker ×2 | −399.0 … −239.0 | 160.0 | 96.0 |
| ③ | 실린더 홀더 Cylinder holder ×2 | −143.0 … 202.0 | 345.0 | 96.0 |
| ④ | 시약 Reagent ×5 | 298.0 … 652.0 | 354.0 | 96.0 |
|   | right edge | | | 48.0 |

| Object | X | Y |
|---|---:|---:|
| `Waste_Bucket` | −573.5 | 320 |
| `beaker_01` / `beaker_02` | −364.0 / −274.0 | 330 |
| `rack_01` / `rack_02` | −60.5 / 119.5 | 330 |
| `Chemical_Bottle_H2O2` | 335.5 | 295 |
| `Chemical_Bottle_ETHANOL` | 405.5 | 365 |
| `Chemical_Bottle_SOLVENT` | 475.5 | 295 |
| `Chemical_Bottle_ACID` | 545.5 | 365 |
| `Chemical_Bottle_NAOH` | 615.5 | 295 |

---

## 3-zone

`gazebo/worlds/lab_bench_3zone.world` · `ros2 launch … layout:=3zone`

No waste bucket, and the cylinder holders are centred on X = 0.

![3 zone](../drawings/bench_topview_3zone.png)

| # | Zone | X span | Width | Gap before |
|---|------|--------|-------|------------|
| ① | 비커 Beaker ×2 | −512.5 … −352.5 | 160.0 | 187.5 (left edge) |
| ② | 실린더 홀더 Cylinder holder ×2 | −172.5 … 172.5 | 345.0 | 180.0 |
| ③ | 시약 Reagent ×5 | 292.5 … 646.5 | 354.0 | 120.0 |
|   | right edge | | | 53.5 |

| Object | X | Y |
|---|---:|---:|
| `beaker_01` / `beaker_02` | −477.5 / −387.5 | 330 |
| `rack_01` / `rack_02` | −90.0 / 90.0 | 330 |
| `Chemical_Bottle_H2O2` | 330.0 | 295 |
| `Chemical_Bottle_ETHANOL` | 400.0 | 365 |
| `Chemical_Bottle_SOLVENT` | 470.0 | 295 |
| `Chemical_Bottle_ACID` | 540.0 | 365 |
| `Chemical_Bottle_NAOH` | 610.0 | 295 |

Both chains total exactly 1400 mm.

---

## Prop sizes (identical in both variants)

| Object | Footprint | Height |
|---|---|---:|
| Waste bucket | ⌀157 (opening ⌀136) | 203.8 |
| Beaker | ⌀70 | 95 |
| Cylinder holder | 165 × 50, 6 slots | 80 |
| Reagent H2O2 / ETHANOL | 75 × 58 | 172 |
| Reagent SOLVENT | 70 × 54 | 179 |
| Reagent ACID / NaOH | 73 × 56 | 187 |

Pitches: beakers 90, holders 180 (15 gap), reagent columns 70.
Reagents are staggered — 3 in the front row (Y = 295), 2 in the rear row
(Y = 365), 70 apart.

## Fixed hardware (identical in both variants)

| Part | Extent |
|---|---|
| Linear rail base | X −500 … 500, Y −84.5 … −41.5, Z 0 … 4 |
| Guide rails | X ±491, Y −51/−79, Z 4 … 10 |
| Lead screw | X ±425, ⌀8 at Z 20 … 28 |
| Drive motor | X −491 … −443, 48 × 40 × 40 |
| Carriage | 75 × 43 × 8 base, top plate 60 × 40 × 14, payload 80 × 60 × 40 |
| OMX mounting plate | 395 × 140 × 6, Z 67.5 … 73.5 |
| OMX modules ×2 | centres X −116.5 / 108.5, Y 74.5, Z 75.5 … 352.4 |

Carriage travel used in the SDF is ±420 mm, inside the ±453.5 mm the end
plates allow and comfortably inside the ±425 mm lead screw.

## Known gaps

- `OMX_Module_Left` / `OMX_Module_Right` still carry an unapplied object
  scale of 2.5 in the .blend. The exporter bakes it, so Gazebo is correct,
  but applying it in Blender would be tidier.
- The OMX arm is exported as a single decimated visual mesh. It does not
  articulate — see the README for wiring in the real
  `open_manipulator` description.
- `Beaker_Label_500mL` is an orphan text object left over from a deleted
  beaker; it sits outside the bench at Y ≈ 494 and is not exported.
