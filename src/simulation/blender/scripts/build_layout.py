"""Rebuild the lab-bench prop layout in Blender.

Idempotent: re-running deletes and recreates the waste bucket, then snaps
every prop to the coordinates in layouts.py. Nothing else in the scene is
touched.

    blender lab_bench.blend --background --python blender/scripts/build_layout.py
    SIMENV_VARIANT=3zone blender lab_bench.blend --background \
        --python blender/scripts/build_layout.py

or, with the scene open, from the Scripting workspace:

    exec(open(r"<repo>/blender/scripts/build_layout.py").read())

Props a variant does not use are hidden rather than deleted, so switching
back and forth costs nothing.

Bench surface is Z = 0; the display floor spans X -700..700 and
Y -194.6..405.4 mm. See layouts.py for the coordinates and docs/layout.md
for the dimension tables.
"""

import bpy
import os
import importlib.util
from mathutils import Vector

REPO = os.environ.get("SIMENV_REPO", r"C:\Users\Gamzadole\SimulationEnv")
VARIANT = os.environ.get("SIMENV_VARIANT", "")

PROP_COLLECTION = "lab_scene"
BUCKET_PARTS = ("Waste_Bucket", "Waste_Bucket_Body",
                "Waste_Bucket_Opening", "Waste_Bucket_Rim")


def load_layouts():
    """Import layouts.py by path — Blender runs scripts outside a package."""
    here = (os.path.dirname(os.path.abspath(__file__))
            if "__file__" in globals()
            else os.path.join(REPO, "blender", "scripts"))
    spec = importlib.util.spec_from_file_location(
        "simenv_layouts", os.path.join(here, "layouts.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


L = load_layouts()


def build_waste_bucket():
    """Tapered bucket, ⌀130 (bottom) -> ⌀150 (top), H200, red rim."""
    coll = bpy.data.collections[PROP_COLLECTION]
    for n in BUCKET_PARTS:
        o = bpy.data.objects.get(n)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)

    def relink(o):
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)

    root = bpy.data.objects.new("Waste_Bucket", None)
    root.empty_display_size = 0.05
    coll.objects.link(root)

    bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=0.065, radius2=0.075,
                                    depth=0.20, location=(0, 0, 0.10))
    body = bpy.context.active_object
    body.name = "Waste_Bucket_Body"
    relink(body)

    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.068, depth=0.004,
                                        location=(0, 0, 0.199))
    opening = bpy.context.active_object
    opening.name = "Waste_Bucket_Opening"
    relink(opening)

    bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=10,
                                     major_radius=0.0745, minor_radius=0.004,
                                     location=(0, 0, 0.200))
    rim = bpy.context.active_object
    rim.name = "Waste_Bucket_Rim"
    relink(rim)

    for ob, mat in ((body, "Mat_Lab_White_Plastic"),
                    (opening, "Mat_Lab_Dark_Plastic"),
                    (rim, "Mat_Lab_Label_Red")):
        ob.data.materials.clear()
        ob.data.materials.append(bpy.data.materials[mat])
        ob.parent = root
        ob.matrix_parent_inverse.identity()
    return root


def apply_layout(variant=None):
    """Place every prop this variant uses; hide the ones it does not."""
    variant = variant or VARIANT or L.DEFAULT_VARIANT
    layout = L.LAYOUTS[variant]

    for name, loc in layout.items():
        o = bpy.data.objects[name]
        o.location = loc
        for ob in [o] + list(o.children_recursive):
            ob.hide_viewport = False
            ob.hide_render = False

    for name in L.hidden_in(variant):
        o = bpy.data.objects.get(name)
        if not o:
            continue
        for ob in [o] + list(o.children_recursive):
            ob.hide_viewport = True
            ob.hide_render = True

    bpy.context.view_layer.update()
    return variant


def report(variant):
    def span(names):
        pts = []
        for n in names:
            o = bpy.data.objects[n]
            obs = [o] + list(o.children_recursive) if o.type == "EMPTY" else [o]
            pts += [ob.matrix_world @ Vector(c)
                    for ob in obs if ob.type == "MESH" for c in ob.bound_box]
        return min(p.x for p in pts) * 1000, max(p.x for p in pts) * 1000

    layout = L.LAYOUTS[variant]
    zones = [("폐기통",       ["Waste_Bucket"]),
             ("비커 x2",      ["beaker_01", "beaker_02"]),
             ("실린더 홀더 x2", ["rack_01", "rack_02"]),
             ("시약 x5",      [n for n in layout if n.startswith("Chemical")])]
    zones = [(lab, ns) for lab, ns in zones if all(n in layout for n in ns)]

    print("variant:", variant)
    prev = -700.0
    for i, (label, names) in enumerate(zones, 1):
        lo, hi = span(names)
        print("  %d %-14s X %8.1f ~ %8.1f   span %6.1f   gap %6.1f"
              % (i, label, lo, hi, hi - lo, lo - prev))
        prev = hi
    print("    %-14s %35s gap %6.1f" % ("right edge", "", 700.0 - prev))


build_waste_bucket()
report(apply_layout())
