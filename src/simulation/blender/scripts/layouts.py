"""Bench layout variants — the single place where prop coordinates live.

Imported by build_layout.py, render_topview.py and export_gazebo.py, so a
coordinate only ever has to be changed here. Blender loads these scripts by
path rather than as a package, so the importers use load_layouts() below.

Units are metres in the world frame: +X right, +Y back, +Z up, and Z = 0 is
the bench surface. The display floor spans X -700..700, Y -194.6..405.4 mm.

Two variants are kept, and both are simulated:

    4zone  ① 폐기통  ② 비커 x2  ③ 실린더 홀더 x2  ④ 시약 x5
           gaps 48 | 96 | 96 | 96 | 48

    3zone  ① 비커 x2  ② 실린더 홀더 x2  ③ 시약 x5
           gaps 187.5 | 180 | 120 | 53.5, holders centred on X = 0
"""

DEFAULT_VARIANT = "4zone"

LAYOUTS = {
    # ------------------------------------------------------------------
    "4zone": {
        "Waste_Bucket":            (-0.5735, 0.320, 0.0),
        "beaker_01":               (-0.3640, 0.330, 0.0),
        "beaker_02":               (-0.2740, 0.330, 0.0),
        "rack_01":                 (-0.0605, 0.330, 0.0),
        "rack_02":                 ( 0.1195, 0.330, 0.0),
        "Chemical_Bottle_H2O2":    ( 0.3355, 0.295, 0.0),
        "Chemical_Bottle_ETHANOL": ( 0.4055, 0.365, 0.0),
        "Chemical_Bottle_SOLVENT": ( 0.4755, 0.295, 0.0),
        "Chemical_Bottle_ACID":    ( 0.5455, 0.365, 0.0),
        "Chemical_Bottle_NAOH":    ( 0.6155, 0.295, 0.0),
    },
    # ------------------------------------------------------------------
    "3zone": {
        "beaker_01":               (-0.4775, 0.330, 0.0),
        "beaker_02":               (-0.3875, 0.330, 0.0),
        "rack_01":                 (-0.0900, 0.330, 0.0),
        "rack_02":                 ( 0.0900, 0.330, 0.0),
        "Chemical_Bottle_H2O2":    ( 0.3300, 0.295, 0.0),
        "Chemical_Bottle_ETHANOL": ( 0.4000, 0.365, 0.0),
        "Chemical_Bottle_SOLVENT": ( 0.4700, 0.295, 0.0),
        "Chemical_Bottle_ACID":    ( 0.5400, 0.365, 0.0),
        "Chemical_Bottle_NAOH":    ( 0.6100, 0.295, 0.0),
    },
}

# every prop the scene knows about; anything a variant omits gets hidden
ALL_PROPS = sorted(set().union(*(set(v) for v in LAYOUTS.values())))


def hidden_in(variant):
    """Props this variant does not use, and so must be hidden."""
    return [n for n in ALL_PROPS if n not in LAYOUTS[variant]]
