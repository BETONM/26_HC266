"""Export the Blender lab-bench scene to Gazebo (SDF) models.

Run from Blender:

    blender "화학 실험.blend" --background --python blender/scripts/export_gazebo.py

or, with the scene already open, from the Scripting workspace:

    exec(open(r"<repo>/blender/scripts/export_gazebo.py").read())

Produces, under <repo>/gazebo/:
    models/<name>/model.config
    models/<name>/model.sdf
    models/<name>/meshes/<name>.obj  (+ .mtl)
    worlds/lab_bench.world           4-zone layout
    worlds/lab_bench_3zone.world     3-zone layout

Meshes are exported once, with each model's origin on its own base, so the
same models serve every layout variant in layouts.py — only the world files
differ. The Blender scene's current variant does not matter here.

Visuals come from the exported meshes; collisions are primitives (box /
cylinder) taken from the measured bounding boxes, because mesh collisions
are slow and unstable for small props.

Blender world axes are already Gazebo's: +X right, +Y back, +Z up, metres.
Bench surface is Z = 0.
"""

import bpy
import os
import importlib.util
from mathutils import Vector

# --------------------------------------------------------------------------
# repo layout
# --------------------------------------------------------------------------
REPO = os.environ.get("SIMENV_REPO", r"C:\Users\Gamzadole\SimulationEnv")
GZ = os.path.join(REPO, "gazebo")
MODELS_DIR = os.path.join(GZ, "models")
WORLDS_DIR = os.path.join(GZ, "worlds")


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

# Blender object -> Gazebo model. Meshes are exported with their origin on
# the object's own base, so one model serves every layout variant.
OBJECT_TO_MODEL = {
    "Waste_Bucket":            "waste_bucket",
    "beaker_01":               "beaker",
    "beaker_02":               "beaker",
    "rack_01":                 "cylinder_holder",
    "rack_02":                 "cylinder_holder",
    "Chemical_Bottle_H2O2":    "reagent_bottle_h2o2",
    "Chemical_Bottle_ETHANOL": "reagent_bottle_ethanol",
    "Chemical_Bottle_SOLVENT": "reagent_bottle_solvent",
    "Chemical_Bottle_ACID":    "reagent_bottle_acid",
    "Chemical_Bottle_NAOH":    "reagent_bottle_naoh",
}

# instance name in the world, per Blender object
OBJECT_TO_INSTANCE = {
    "Waste_Bucket": "waste_bucket",
    "beaker_01": "beaker_01",
    "beaker_02": "beaker_02",
    "rack_01": "cylinder_holder_01",
    "rack_02": "cylinder_holder_02",
}

# fixed hardware, identical in every variant
FIXED_POSES = [
    ("rail_axis",          "rail_axis",           0.0,       0.0,      0.0),
    ("omx_mounting_plate", "omx_mounting_plate",  0.0,       0.0,      0.0),
    ("omx_module",         "omx_module_left",    -0.116527,  0.074456, 0.0),
    ("omx_module",         "omx_module_right",    0.108469,  0.075270, 0.0),
]

# variant -> output world file
WORLD_FILES = {
    "4zone": "lab_bench.world",
    "3zone": "lab_bench_3zone.world",
}


def world_poses(variant):
    """(model, instance, x, y, z) for every model placed in this variant."""
    poses = []
    for obj, (x, y, z) in L.LAYOUTS[variant].items():
        poses.append((OBJECT_TO_MODEL[obj],
                      OBJECT_TO_INSTANCE.get(obj, OBJECT_TO_MODEL[obj]),
                      x, y, z))
    return poses + FIXED_POSES

# --------------------------------------------------------------------------
# model table
#   objects : Blender objects (EMPTY parents pull in their children)
#   origin  : world point that becomes the model origin
#   shape   : ("box", sx, sy, sz) or ("cylinder", radius, length)
#   centre  : collision centre, relative to the model origin
# --------------------------------------------------------------------------
MODELS = [
    dict(name="waste_bucket", objects=["Waste_Bucket"],
         origin="object", mass=0.45,
         shape=("cylinder", 0.0785, 0.2038), centre=(0, 0, 0.1019),
         desc="Waste bucket, tapered body with red rim"),

    dict(name="beaker", objects=["beaker_01"],
         origin="object", mass=0.15, static=True,
         shape=("cylinder", 0.035, 0.095), centre=(0, 0, 0.0475),
         desc="Glass beaker 70 x 95 mm"),

    dict(name="cylinder_holder", objects=["rack_01"],
         origin="object", mass=0.25, static=True,
         shape=("box", 0.165, 0.050, 0.080), centre=(0, 0, 0.040),
         desc="Acrylic cylinder / test-tube holder, 6 slots"),

    dict(name="reagent_bottle_h2o2", objects=["Chemical_Bottle_H2O2"],
         origin="object", mass=0.55,
         shape=("box", 0.075, 0.058, 0.172), centre=(0, 0, 0.086),
         desc="Reagent bottle - hydrogen peroxide (amber)"),

    dict(name="reagent_bottle_ethanol", objects=["Chemical_Bottle_ETHANOL"],
         origin="object", mass=0.55,
         shape=("box", 0.075, 0.058, 0.172), centre=(0, 0, 0.086),
         desc="Reagent bottle - ethanol (amber)"),

    dict(name="reagent_bottle_solvent", objects=["Chemical_Bottle_SOLVENT"],
         origin="object", mass=0.52,
         shape=("box", 0.070, 0.054, 0.179), centre=(0, 0, 0.0895),
         desc="Reagent bottle - lab solvent (dark)"),

    dict(name="reagent_bottle_acid", objects=["Chemical_Bottle_ACID"],
         origin="object", mass=0.60,
         shape=("box", 0.073, 0.056, 0.187), centre=(0, 0, 0.0935),
         desc="Reagent bottle - acid (white)"),

    dict(name="reagent_bottle_naoh", objects=["Chemical_Bottle_NAOH"],
         origin="object", mass=0.60,
         shape=("box", 0.073, 0.056, 0.187), centre=(0, 0, 0.0935),
         desc="Reagent bottle - sodium hydroxide (white)"),

    # ---- fixed infrastructure, meshes baked at world origin ---------------
    dict(name="linear_rail", objects=[
            "Rail_Base", "End_Plate_Left", "End_Plate_Right",
            "Guide_Rail_Left", "Guide_Rail_Right", "Lead_Screw",
            "Drive_Motor", "Motor_Coupler"],
         origin=(0.0, 0.0, 0.0), mass=6.0, static=True,
         shape=("box", 1.000, 0.056, 0.073), centre=(0, -0.063, 0.0365),
         desc="1 m lead-screw linear rail, fixed frame"),

    dict(name="rail_carriage", objects=[
            "Carriage_Base", "Carriage_Top_Plate", "Payload_Placeholder"],
         origin=(0.0, -0.063, 0.0), mass=0.8,
         shape=("box", 0.080, 0.060, 0.062), centre=(0, 0, 0.041),
         desc="Rail carriage + payload plate (prismatic along X)"),

    dict(name="omx_mounting_plate", objects=["OMX_Mounting_Plate"],
         origin=(0.0, 0.0, 0.0), mass=1.2, static=True,
         shape=("box", 0.395, 0.140, 0.006), centre=(-0.004, -0.053, 0.0705),
         desc="OpenMANIPULATOR-X mounting plate, 395 x 140 x 6"),

    dict(name="omx_module", objects=["OMX_Module_Left"],
         origin="object", mass=1.5, static=True,
         decimate=0.016,
         shape=("box", 0.150, 0.375, 0.277), centre=(0, 0.075, 0.214),
         desc="OpenMANIPULATOR-X visual placeholder (decimated, non-articulated)"),
]



# --------------------------------------------------------------------------
# inertia
# --------------------------------------------------------------------------
def inertia(shape, mass):
    kind = shape[0]
    if kind == "box":
        _, sx, sy, sz = shape
        return (mass * (sy * sy + sz * sz) / 12.0,
                mass * (sx * sx + sz * sz) / 12.0,
                mass * (sx * sx + sy * sy) / 12.0)
    _, r, l = shape
    return (mass * (3 * r * r + l * l) / 12.0,
            mass * (3 * r * r + l * l) / 12.0,
            mass * r * r / 2.0)


def geometry_xml(shape, indent):
    pad = " " * indent
    if shape[0] == "box":
        _, sx, sy, sz = shape
        return (f"{pad}<geometry>\n"
                f"{pad}  <box><size>{sx:.6f} {sy:.6f} {sz:.6f}</size></box>\n"
                f"{pad}</geometry>")
    _, r, l = shape
    return (f"{pad}<geometry>\n"
            f"{pad}  <cylinder><radius>{r:.6f}</radius><length>{l:.6f}</length></cylinder>\n"
            f"{pad}</geometry>")


# --------------------------------------------------------------------------
# mesh export
# --------------------------------------------------------------------------
TMP_COLLECTION = "__gz_export_tmp"


def tmp_collection():
    """Scratch collection for export duplicates.

    Duplicates go here rather than straight into the scene, and are cleaned
    up by scanning the collection instead of by holding references —
    bpy.ops.object.convert can replace an object, which would leave a stale
    reference behind and leak the duplicate into later renders.
    """
    c = bpy.data.collections.get(TMP_COLLECTION)
    if c is None:
        c = bpy.data.collections.new(TMP_COLLECTION)
        bpy.context.scene.collection.children.link(c)
    return c


def purge_tmp(drop_collection=False):
    c = bpy.data.collections.get(TMP_COLLECTION)
    if c is None:
        return
    for o in list(c.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    if drop_collection:
        bpy.data.collections.remove(c)


def resolve_origin(origin, objnames):
    """`"object"` means the first object's own base: its world X/Y at Z = 0."""
    if origin != "object":
        return origin
    t = bpy.data.objects[objnames[0]].matrix_world.translation
    return (t.x, t.y, 0.0)


def export_mesh(objnames, origin, out_path, decimate=None):
    """Bake the named objects (and their children) into one OBJ at `origin`.

    OBJ (+MTL) is used rather than Collada because it loads in both Gazebo
    Classic and Gazebo Sim, and Blender 5.x ships no Collada exporter.
    """
    purge_tmp()
    scratch = tmp_collection()
    bpy.ops.object.select_all(action="DESELECT")

    temps = []
    for n in objnames:
        src = bpy.data.objects[n]
        members = [src] + list(src.children_recursive)
        for o in members:
            if o.type not in {"MESH", "FONT", "CURVE", "SURFACE"}:
                continue
            dup = o.copy()
            dup.data = o.data.copy()
            dup.animation_data_clear()
            dup.hide_viewport = False
            dup.hide_render = False
            scratch.objects.link(dup)
            dup.parent = None
            dup.matrix_world = o.matrix_world.copy()
            temps.append(dup)

    if not temps:
        raise RuntimeError("nothing to export for %s" % objnames)

    off = Vector(resolve_origin(origin, objnames))
    for d in temps:
        d.matrix_world.translation -= off
        d.select_set(True)
    bpy.context.view_layer.objects.active = temps[0]

    bpy.ops.object.convert(target="MESH")            # FONT/CURVE -> MESH
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    if decimate:
        for d in temps:
            if len(d.data.polygons) < 2000:
                continue
            m = d.modifiers.new("gz_decimate", "DECIMATE")
            m.ratio = decimate
        bpy.ops.object.convert(target="MESH")

    tris = sum(len(d.data.loop_triangles) if d.data.loop_triangles else
               len(d.data.polygons) for d in temps)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bpy.ops.wm.obj_export(filepath=out_path, check_existing=False,
                          forward_axis="Y", up_axis="Z", global_scale=1.0,
                          apply_modifiers=True, export_selected_objects=True,
                          export_materials=True, export_triangulated_mesh=True,
                          export_uv=True, export_normals=True,
                          export_object_groups=False,
                          export_material_groups=False, path_mode="COPY")

    purge_tmp()
    return tris


# --------------------------------------------------------------------------
# SDF writers
# --------------------------------------------------------------------------
MODEL_CONFIG = """<?xml version="1.0"?>
<model>
  <name>{name}</name>
  <version>1.0</version>
  <sdf version="1.10">model.sdf</sdf>
  <author>
    <name>armchemist</name>
  </author>
  <description>{desc}</description>
</model>
"""


def write_model(m):
    name = m["name"]
    d = os.path.join(MODELS_DIR, name)
    tris = export_mesh(m["objects"], m["origin"],
                       os.path.join(d, "meshes", name + ".obj"),
                       m.get("decimate"))

    ixx, iyy, izz = inertia(m["shape"], m["mass"])
    cx, cy, cz = m["centre"]
    static = "true" if m.get("static") else "false"

    sdf = f"""<?xml version="1.0"?>
<sdf version="1.10">
  <model name="{name}">
    <static>{static}</static>
    <link name="base_link">
      <inertial>
        <pose>{cx:.6f} {cy:.6f} {cz:.6f} 0 0 0</pose>
        <mass>{m['mass']:.4f}</mass>
        <inertia>
          <ixx>{ixx:.8f}</ixx><ixy>0</ixy><ixz>0</ixz>
          <iyy>{iyy:.8f}</iyy><iyz>0</iyz>
          <izz>{izz:.8f}</izz>
        </inertia>
      </inertial>
      <collision name="collision">
        <pose>{cx:.6f} {cy:.6f} {cz:.6f} 0 0 0</pose>
{geometry_xml(m['shape'], 8)}
        <surface>
          <friction><ode><mu>0.9</mu><mu2>0.9</mu2></ode></friction>
        </surface>
      </collision>
      <visual name="visual">
        <geometry>
          <mesh><uri>model://{name}/meshes/{name}.obj</uri></mesh>
        </geometry>
      </visual>
    </link>
  </model>
</sdf>
"""
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "model.sdf"), "w", encoding="utf-8") as f:
        f.write(sdf)
    with open(os.path.join(d, "model.config"), "w", encoding="utf-8") as f:
        f.write(MODEL_CONFIG.format(name=name, desc=m["desc"]))
    print("  %-24s %7d tris" % (name, tris))
    return tris


RAIL_TRAVEL = 0.42          # carriage travel, +/- metres from rail centre


def write_rail_axis():
    """Composite model: fixed rail frame + carriage on a prismatic joint.

    Reuses the meshes already exported for `linear_rail` and `rail_carriage`,
    so those two model directories must stay on the resource path.
    """
    name = "rail_axis"
    d = os.path.join(MODELS_DIR, name)
    os.makedirs(d, exist_ok=True)

    rail = next(m for m in MODELS if m["name"] == "linear_rail")
    car = next(m for m in MODELS if m["name"] == "rail_carriage")
    r_ixx, r_iyy, r_izz = inertia(rail["shape"], rail["mass"])
    c_ixx, c_iyy, c_izz = inertia(car["shape"], car["mass"])
    rcx, rcy, rcz = rail["centre"]
    ccx, ccy, ccz = car["centre"]

    sdf = f"""<?xml version="1.0"?>
<!-- generated by blender/scripts/export_gazebo.py -->
<sdf version="1.10">
  <model name="{name}">
    <static>false</static>

    <link name="rail_base">
      <inertial>
        <pose>{rcx:.6f} {rcy:.6f} {rcz:.6f} 0 0 0</pose>
        <mass>{rail['mass']:.4f}</mass>
        <inertia>
          <ixx>{r_ixx:.8f}</ixx><ixy>0</ixy><ixz>0</ixz>
          <iyy>{r_iyy:.8f}</iyy><iyz>0</iyz>
          <izz>{r_izz:.8f}</izz>
        </inertia>
      </inertial>
      <collision name="collision">
        <pose>{rcx:.6f} {rcy:.6f} {rcz:.6f} 0 0 0</pose>
{geometry_xml(rail['shape'], 8)}
      </collision>
      <visual name="visual">
        <geometry>
          <mesh><uri>model://linear_rail/meshes/linear_rail.obj</uri></mesh>
        </geometry>
      </visual>
    </link>

    <link name="carriage">
      <pose>0 -0.063 0 0 0 0</pose>
      <inertial>
        <pose>{ccx:.6f} {ccy:.6f} {ccz:.6f} 0 0 0</pose>
        <mass>{car['mass']:.4f}</mass>
        <inertia>
          <ixx>{c_ixx:.8f}</ixx><ixy>0</ixy><ixz>0</ixz>
          <iyy>{c_iyy:.8f}</iyy><iyz>0</iyz>
          <izz>{c_izz:.8f}</izz>
        </inertia>
      </inertial>
      <collision name="collision">
        <pose>{ccx:.6f} {ccy:.6f} {ccz:.6f} 0 0 0</pose>
{geometry_xml(car['shape'], 8)}
      </collision>
      <visual name="visual">
        <geometry>
          <mesh><uri>model://rail_carriage/meshes/rail_carriage.obj</uri></mesh>
        </geometry>
      </visual>
    </link>

    <joint name="world_fixed" type="fixed">
      <parent>world</parent>
      <child>rail_base</child>
    </joint>

    <joint name="carriage_slide" type="prismatic">
      <parent>rail_base</parent>
      <child>carriage</child>
      <axis>
        <xyz>1 0 0</xyz>
        <limit>
          <lower>{-RAIL_TRAVEL:.4f}</lower>
          <upper>{RAIL_TRAVEL:.4f}</upper>
          <effort>60</effort>
          <velocity>0.25</velocity>
        </limit>
        <dynamics><damping>4.0</damping><friction>1.0</friction></dynamics>
      </axis>
    </joint>

    <plugin filename="gz-sim-joint-position-controller-system"
            name="gz::sim::systems::JointPositionController">
      <joint_name>carriage_slide</joint_name>
      <topic>/rail_axis/carriage_slide/cmd_pos</topic>
      <p_gain>800</p_gain>
      <i_gain>10</i_gain>
      <d_gain>60</d_gain>
      <cmd_max>60</cmd_max>
      <cmd_min>-60</cmd_min>
    </plugin>

    <!-- explicit topic so it does not carry the world name, and one
         ros_gz_bridge config serves every layout variant -->
    <plugin filename="gz-sim-joint-state-publisher-system"
            name="gz::sim::systems::JointStatePublisher">
      <joint_name>carriage_slide</joint_name>
      <topic>/rail_axis/joint_state</topic>
    </plugin>
  </model>
</sdf>
"""
    with open(os.path.join(d, "model.sdf"), "w", encoding="utf-8") as f:
        f.write(sdf)
    with open(os.path.join(d, "model.config"), "w", encoding="utf-8") as f:
        f.write(MODEL_CONFIG.format(
            name=name,
            desc="1 m linear rail with a carriage on a prismatic joint "
                 "(+/- %.0f mm travel)" % (RAIL_TRAVEL * 1000)))
    print("  %-24s composite (rail_base + carriage, prismatic X)" % name)


def write_world(variant):
    includes = []
    for model, inst, x, y, z in world_poses(variant):
        includes.append(
            "    <include>\n"
            f"      <uri>model://{model}</uri>\n"
            f"      <name>{inst}</name>\n"
            f"      <pose>{x:.6f} {y:.6f} {z:.6f} 0 0 0</pose>\n"
            "    </include>")

    world = """<?xml version="1.0"?>
<!-- Lab bench world (__VARIANT__ layout).
     Generated by blender/scripts/export_gazebo.py - do not edit by hand. -->
<sdf version="1.10">
  <world name="__WORLD_NAME__">

    <physics name="1ms" type="ignored">
      <max_step_size>0.001</max_step_size>
      <real_time_factor>1.0</real_time_factor>
    </physics>

    <plugin filename="gz-sim-physics-system"
            name="gz::sim::systems::Physics"/>
    <plugin filename="gz-sim-user-commands-system"
            name="gz::sim::systems::UserCommands"/>
    <plugin filename="gz-sim-scene-broadcaster-system"
            name="gz::sim::systems::SceneBroadcaster"/>
    <plugin filename="gz-sim-contact-system"
            name="gz::sim::systems::Contact"/>
    <plugin filename="gz-sim-sensors-system"
            name="gz::sim::systems::Sensors">
      <render_engine>ogre2</render_engine>
    </plugin>

    <gravity>0 0 -9.81</gravity>

    <scene>
      <!-- same white as bench_walls, so any sliver above the wall top does
           not read as "outside" to a camera -->
      <background>0.97 0.97 0.97 1</background>
      <ambient>0.55 0.55 0.55 1</ambient>
      <grid>false</grid>
      <shadows>true</shadows>
    </scene>

    <light type="directional" name="sun">
      <cast_shadows>true</cast_shadows>
      <pose>0 0 6 0 0 0</pose>
      <diffuse>0.9 0.9 0.9 1</diffuse>
      <specular>0.25 0.25 0.25 1</specular>
      <direction>-0.4 0.2 -0.9</direction>
    </light>

    <!-- bench surface: world Z = 0 -->
    <model name="bench_surface">
      <static>true</static>
      <link name="link">
        <collision name="collision">
          <pose>0 0.1054 -0.01 0 0 0</pose>
          <geometry><box><size>1.4 0.6 0.02</size></box></geometry>
          <surface>
            <friction><ode><mu>1.0</mu><mu2>1.0</mu2></ode></friction>
          </surface>
        </collision>
        <visual name="visual">
          <pose>0 0.1054 -0.01 0 0 0</pose>
          <geometry><box><size>1.4 0.6 0.02</size></box></geometry>
          <material>
            <ambient>0.72 0.74 0.76 1</ambient>
            <diffuse>0.78 0.80 0.82 1</diffuse>
            <specular>0.15 0.15 0.15 1</specular>
          </material>
        </visual>
      </link>
    </model>

    <!-- white boundary walls: tall enough that a camera on the bench
         frames wall, not the world outside -->
    <model name="bench_walls">
      <static>true</static>
      <link name="link">
        <collision name="left_collision">
          <pose>-0.71 0.1054 0.6 0 0 0</pose>
          <geometry><box><size>0.02 0.64 1.2</size></box></geometry>
        </collision>
        <visual name="left_visual">
          <pose>-0.71 0.1054 0.6 0 0 0</pose>
          <geometry><box><size>0.02 0.64 1.2</size></box></geometry>
          <material>
            <ambient>0.90 0.90 0.90 1</ambient>
            <diffuse>0.97 0.97 0.97 1</diffuse>
            <specular>0.10 0.10 0.10 1</specular>
          </material>
        </visual>
        <collision name="right_collision">
          <pose>0.71 0.1054 0.6 0 0 0</pose>
          <geometry><box><size>0.02 0.64 1.2</size></box></geometry>
        </collision>
        <visual name="right_visual">
          <pose>0.71 0.1054 0.6 0 0 0</pose>
          <geometry><box><size>0.02 0.64 1.2</size></box></geometry>
          <material>
            <ambient>0.90 0.90 0.90 1</ambient>
            <diffuse>0.97 0.97 0.97 1</diffuse>
            <specular>0.10 0.10 0.10 1</specular>
          </material>
        </visual>
        <collision name="front_collision">
          <pose>0.0 -0.2046 0.6 0 0 0</pose>
          <geometry><box><size>1.44 0.02 1.2</size></box></geometry>
        </collision>
        <visual name="front_visual">
          <pose>0.0 -0.2046 0.6 0 0 0</pose>
          <geometry><box><size>1.44 0.02 1.2</size></box></geometry>
          <material>
            <ambient>0.90 0.90 0.90 1</ambient>
            <diffuse>0.97 0.97 0.97 1</diffuse>
            <specular>0.10 0.10 0.10 1</specular>
          </material>
        </visual>
        <collision name="back_collision">
          <pose>0.0 0.4154 0.6 0 0 0</pose>
          <geometry><box><size>1.44 0.02 1.2</size></box></geometry>
        </collision>
        <visual name="back_visual">
          <pose>0.0 0.4154 0.6 0 0 0</pose>
          <geometry><box><size>1.44 0.02 1.2</size></box></geometry>
          <material>
            <ambient>0.90 0.90 0.90 1</ambient>
            <diffuse>0.97 0.97 0.97 1</diffuse>
            <specular>0.10 0.10 0.10 1</specular>
          </material>
        </visual>
      </link>
    </model>

__INCLUDES__

  </world>
</sdf>
"""
    fname = WORLD_FILES[variant]
    world = (world.replace("__INCLUDES__", "\n".join(includes))
                  .replace("__VARIANT__", variant)
                  .replace("__WORLD_NAME__", os.path.splitext(fname)[0]))
    os.makedirs(WORLDS_DIR, exist_ok=True)
    with open(os.path.join(WORLDS_DIR, fname), "w", encoding="utf-8") as f:
        f.write(world)
    print("  %-24s %2d models -> worlds/%s" % (variant, len(includes), fname))


def main():
    print("exporting to", GZ)
    purge_tmp()
    total = 0
    for m in MODELS:
        total += write_model(m)
    write_rail_axis()
    for variant in WORLD_FILES:
        write_world(variant)
    purge_tmp(drop_collection=True)
    print("done - %d models, %d triangles, %d worlds"
          % (len(MODELS), total, len(WORLD_FILES)))


main()
