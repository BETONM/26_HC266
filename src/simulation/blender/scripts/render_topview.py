"""Render an orthographic top view of the bench, on a transparent background.

The output is the underlay for drawings/draw_topview.py. The camera covers
exactly the display floor: X -700..700, Y -194.6..405.4 mm, rendered at
2800 x 1200 px, i.e. 2 px/mm — so image pixels map to millimetres exactly.

Run build_layout.py first: this script renders the scene as it stands and
only uses the variant to name the output file.

    blender lab_bench.blend --background \
        --python blender/scripts/build_layout.py \
        --python blender/scripts/render_topview.py

    SIMENV_VARIANT=3zone blender lab_bench.blend --background \
        --python blender/scripts/build_layout.py \
        --python blender/scripts/render_topview.py

Writes drawings/topview_<variant>.png. Scene settings (camera, engine,
resolution, hidden objects) are restored afterwards, so this is safe to run
against a scene you are working in.
"""

import bpy
import os
import importlib.util

REPO = os.environ.get("SIMENV_REPO", r"C:\Users\Gamzadole\SimulationEnv")

# display floor extents, metres
X0, X1 = -0.700, 0.700
Y0, Y1 = -0.1946, 0.4054
PX_PER_M = 2000.0                       # 2 px per mm

HIDE = ["Rail_Display_Floor", "wall_front", "wall_right", "wall_right.001"]
HIDE_COLLECTION = "Top_View_Blueprint"


def load_layouts():
    here = (os.path.dirname(os.path.abspath(__file__))
            if "__file__" in globals()
            else os.path.join(REPO, "blender", "scripts"))
    spec = importlib.util.spec_from_file_location(
        "simenv_layouts", os.path.join(here, "layouts.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    L = load_layouts()
    variant = os.environ.get("SIMENV_VARIANT") or L.DEFAULT_VARIANT
    out = os.path.join(REPO, "drawings", "topview_%s.png" % variant)

    sc = bpy.context.scene
    saved = dict(cam=sc.camera, engine=sc.render.engine, fp=sc.render.filepath,
                 rx=sc.render.resolution_x, ry=sc.render.resolution_y,
                 pct=sc.render.resolution_percentage,
                 ff=sc.render.image_settings.file_format,
                 cm=sc.render.image_settings.color_mode,
                 film=sc.render.film_transparent)

    cam_data = bpy.data.cameras.new("TMP_TopOrtho")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = X1 - X0
    cam = bpy.data.objects.new("TMP_TopOrtho", cam_data)
    sc.collection.objects.link(cam)
    cam.location = ((X0 + X1) / 2, (Y0 + Y1) / 2, 3.0)
    cam.rotation_euler = (0.0, 0.0, 0.0)
    sc.camera = cam

    hidden = []
    for n in HIDE + L.hidden_in(variant):
        o = bpy.data.objects.get(n)
        if not o:
            continue
        for ob in [o] + list(o.children_recursive):
            hidden.append((ob, ob.hide_render))
            ob.hide_render = True
    lc = bpy.context.view_layer.layer_collection.children.get(HIDE_COLLECTION)
    lc_saved = lc.exclude if lc else None
    if lc:
        lc.exclude = True

    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh_saved = (sh.light, sh.color_type, sh.show_cavity, sh.show_object_outline)
    sh.light = "STUDIO"
    sh.color_type = "MATERIAL"
    sh.show_cavity = True
    sh.show_object_outline = True
    sc.display.render_aa = "32"
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    res_x = int(round((X1 - X0) * PX_PER_M))
    res_y = int(round((Y1 - Y0) * PX_PER_M))
    sc.render.resolution_x = res_x
    sc.render.resolution_y = res_y
    sc.render.resolution_percentage = 100
    sc.render.filepath = os.path.abspath(out)
    bpy.ops.render.render(write_still=True)

    sh.light, sh.color_type, sh.show_cavity, sh.show_object_outline = sh_saved
    for o, v in hidden:
        o.hide_render = v
    if lc:
        lc.exclude = lc_saved
    sc.camera = saved["cam"]
    sc.render.engine = saved["engine"]
    sc.render.filepath = saved["fp"]
    sc.render.resolution_x, sc.render.resolution_y = saved["rx"], saved["ry"]
    sc.render.resolution_percentage = saved["pct"]
    sc.render.image_settings.file_format = saved["ff"]
    sc.render.image_settings.color_mode = saved["cm"]
    sc.render.film_transparent = saved["film"]
    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.cameras.remove(cam_data)

    print("rendered %s  %d x %d px (2 px/mm) -> %s"
          % (variant, res_x, res_y, os.path.abspath(out)))


main()
