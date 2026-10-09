#!/usr/bin/env python3
"""
Blender 5.0 Procedural & Sculpted 3D Asset Generator for Genesis Bastion (Phase 10).

Generates and exports 14 subdivided, beveled, smooth-shaded PBR `.glb` 3D models
into `public/assets/models/`, plus a high-resolution studio showcase render/viewport
capture (`public/assets/models/blender_showcase.png`).

Models generated:
  1. `hero_guardian.glb`    - Gardien du Bastion (obsidian/gold plate armor, cyan visor, cape, shield, runic greatsword `Weapon`)
  2. `npc_survivor.glb`     - Survivant / Éclaireur allié (forest tunic, ranger hood, bow/quiver, glowing golden lantern)
  3. `goblin.glb`           - Gobelin Éclaireur (wiry olive greenskin, long pointed ears, crest, yellow eyes, serrated dagger)
  4. `orc.glb`              - Orc Maraudeur (muscular dark green torso, prognathous jaw & ivory tusks, spiked pauldrons, war axe)
  5. `troll.glb`            - Troll des Cavernes / Feu (hunched rocky colossus, glowing magma veins & crystals, twisted horns, club)
  6. `wolf.glb`             - Loup Sauvage (silver-grey quadruped, fanged snout, sculpted shoulder fur, upright ears, bushy tail)
  7. `lion.glb`             - Lion des Hautes-Terres (golden tawny feline, voluminous royal crown mane, fangs, tufted tail)
  8. `vulture.glb`          - Vautour Charognard (flying raptor, hooked beak, neck ruff, feathered `LeftWing` / `RightWing`)
  9. `dragon.glb`           - Dragon Souverain de la Caldeira (crimson/gold drake, glowing magma chest, 4 royal horns, ribbed wings, spiked tail)
 10. `shark.glb`            - Requin Marcheur des Abysses (abyssal blue torpedo body, serrated teeth, dorsal fin, caudal tail, 4 clawed amphibious legs)
 11. `giant_mole.glb`       - Taupe Géante Fouisseuse (armored brown mole, 10-tentacle pink star-nose, amber back crystals, steel digging claws)
 12. `deer.glb`             - Biche / Cerf Sylvestre (graceful spotted fawn coat, branching antlers with emerald bioluminescent buds)
 13. `rabbit.glb`           - Lapin des Plaines (plump cream meadow bunny, long pink-lined upright ears, cotton-ball tail)
 14. `bastion_monolith.glb` - Monolithe de Relique d'Éden (twisted obsidian & gold runic arch, levitating cyan/gold octahedral crystal core)

Orientation & Coordinate Convention (`export_yup=True`):
  - The helper `pt(x, y_up, z_fwd)` maps Three.js coordinates (`+Y` up, `+Z` forward, `+X` right)
    into Blender coordinates `(x, -z_fwd, y_up)` (`+Z` up, `-Y` forward, `+X` right).
  - When exported with `bpy.ops.export_scene.gltf(..., export_yup=True, export_lights=False)`,
    every model stands with its feet at `Y = 0` and faces `+Z` in Three.js, with zero rest rotation
    on articulated child nodes (`Body`, `Head`, `LeftArm`, `RightArm`, `LeftLeg`, `RightLeg`,
    `LeftWing`, `RightWing`, `Tail`, `Weapon`).

Usage:
  /google/bin/releases/gemini-agents-blender/blender_cli exec -f scripts/generate-blender-models.py
"""

import math
import os
import sys
import traceback

import bmesh
import bpy
import mathutils


OUTPUT_DIR = os.path.abspath(
    os.path.join(
        os.path.dirname(os.path.abspath(__file__))
        if "__file__" in globals()
        else "/usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion/scripts",
        "..",
        "public",
        "assets",
        "models",
    )
)


def hex_to_rgb(hex_val):
    """Converts a 24-bit integer hex color (e.g. 0x243447) into linear (r, g, b) floats."""
    if isinstance(hex_val, str):
        hex_val = int(hex_val.lstrip("#"), 16)
    r = ((hex_val >> 16) & 0xFF) / 255.0
    g = ((hex_val >> 8) & 0xFF) / 255.0
    b = (hex_val & 0xFF) / 255.0
    # sRGB to linear approximation for accurate Blender Principled BSDF Base Color
    return (pow(r, 2.2), pow(g, 2.2), pow(b, 2.2))


def create_pbr_material(
    name,
    color_hex,
    roughness=0.5,
    metallic=0.0,
    emission_hex=None,
    emission_strength=0.0,
    transmission=0.0,
):
    """Creates or updates a Blender 5.0 Principled BSDF material."""
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        rgb = hex_to_rgb(color_hex)
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = float(roughness)
        bsdf.inputs["Metallic"].default_value = float(metallic)
        if "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = float(transmission)
        if emission_hex is not None and emission_strength > 0.0:
            er, eg, eb = hex_to_rgb(emission_hex)
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (er, eg, eb, 1.0)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = float(emission_strength)
        else:
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = 0.0
    return mat


def clear_scene():
    """Removes all objects and orphan meshes from the current Blender scene safely."""
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def pt(x, y_up, z_fwd):
    """
    Maps intuitive Three.js coordinates (x_right, y_up, z_forward)
    to Blender coordinates (x_right, -z_forward, y_up).
    """
    return mathutils.Vector((float(x), -float(z_fwd), float(y_up)))


class PartBuilder:
    """
    Accumulates multi-material, smooth-shaded, beveled/subdivided bmesh geometry
    for a single named articulated limb (`Body`, `Head`, `LeftArm`, etc.) around
    an explicit Three.js joint pivot `(px, py_up, pz_fwd)`.
    """

    def __init__(self, name, pivot_three=(0.0, 0.0, 0.0), parent_part=None, subsurf_levels=0):
        self.name = name
        self.pivot_three = tuple(float(v) for v in pivot_three)
        self.pivot_blender = pt(*self.pivot_three)
        self.parent_part = parent_part
        # Force 0 subdivision surface levels for 60 FPS WebGL performance (~450-1,200 verts/model)
        self.subsurf_levels = 0
        self.bm = bmesh.new()
        self.materials = []
        self.mat_index_map = {}
        self.obj = None

    def _get_mat_idx(self, mat):
        if mat.name not in self.mat_index_map:
            self.mat_index_map[mat.name] = len(self.materials)
            self.materials.append(mat)
        return self.mat_index_map[mat.name]

    def _merge_sub_bmesh(self, sub_bm, mat, center_three=(0, 0, 0), rot_three=(0, 0, 0)):
        """Transforms `sub_bm` from local coordinates to limb-pivot-relative Blender coordinates and merges it."""
        mat_idx = self._get_mat_idx(mat)
        rx, ry, rz = rot_three
        # In Three.js: rx = pitch, ry = yaw (around Y_up = Z_blender), rz = roll (around Z_fwd = -Y_blender)
        euler_blender = mathutils.Euler((float(rx), -float(rz), float(ry)), "XYZ")
        rot_mat = euler_blender.to_matrix().to_4x4()
        world_pos = pt(*center_three)
        rel_pos = world_pos - self.pivot_blender
        xform = mathutils.Matrix.Translation(rel_pos) @ rot_mat

        bmesh.ops.transform(sub_bm, matrix=xform, verts=sub_bm.verts)
        bmesh.ops.recalc_face_normals(sub_bm, faces=sub_bm.faces)
        for f in sub_bm.faces:
            f.material_index = mat_idx
            f.smooth = True

        tmp_mesh = bpy.data.meshes.new(f"_tmp_{self.name}")
        sub_bm.to_mesh(tmp_mesh)
        sub_bm.free()
        self.bm.from_mesh(tmp_mesh)
        bpy.data.meshes.remove(tmp_mesh)

    def add_box(
        self,
        mat,
        center=(0, 0, 0),
        size=(0.5, 0.5, 0.5),
        rot=(0, 0, 0),
        bevel=0.03,
        bevel_segs=1,
        taper_top=1.0,
        taper_bottom=1.0,
        taper_front=1.0,
    ):
        """Adds a beveled, optionally tapered 3D box at Three.js world coordinates `center`."""
        sub = bmesh.new()
        bmesh.ops.create_cube(sub, size=1.0)
        sx, sy_up, sz_fwd = size
        # In local Blender coords: X = sx, Y = sz_fwd, Z = sy_up
        for v in sub.verts:
            vx = v.co.x * sx
            vy = v.co.y * sz_fwd
            vz = v.co.z * sy_up
            if v.co.z > 0 and taper_top != 1.0:
                vx *= taper_top
                vy *= taper_top
            if v.co.z < 0 and taper_bottom != 1.0:
                vx *= taper_bottom
                vy *= taper_bottom
            if v.co.y < 0 and taper_front != 1.0:
                vx *= taper_front
                vz *= taper_front
            v.co = mathutils.Vector((vx, vy, vz))

        if bevel > 0.0:
            bmesh.ops.bevel(
                sub,
                geom=list(sub.verts) + list(sub.edges),
                offset=min(bevel, min(sx, sy_up, sz_fwd) * 0.32),
                segments=1,
                profile=0.5,
                affect="EDGES",
            )
        self._merge_sub_bmesh(sub, mat, center, rot)

    def add_ellipsoid(
        self,
        mat,
        center=(0, 0, 0),
        radii=(0.3, 0.3, 0.3),
        rot=(0, 0, 0),
        u_seg=8,
        v_seg=6,
    ):
        """Adds a smooth ellipsoid at Three.js world coordinates `center` with `(rx, ry_up, rz_fwd)`."""
        sub = bmesh.new()
        bmesh.ops.create_uvsphere(sub, u_segments=u_seg, v_segments=v_seg, radius=1.0)
        rx, ry_up, rz_fwd = radii
        for v in sub.verts:
            v.co.x *= rx
            v.co.y *= rz_fwd
            v.co.z *= ry_up
        self._merge_sub_bmesh(sub, mat, center, rot)

    def add_cone(
        self,
        mat,
        center=(0, 0, 0),
        r_bottom=0.2,
        r_top=0.02,
        height=0.5,
        rot=(0, 0, 0),
        segs=8,
        scale_xz=(1.0, 1.0),
    ):
        """Adds a smooth cone/frustum aligned along Three.js Y-up before `rot`."""
        sub = bmesh.new()
        bmesh.ops.create_cone(
            sub,
            cap_ends=True,
            cap_tris=False,
            segments=segs,
            radius1=r_bottom,
            radius2=r_top,
            depth=height,
        )
        sx, sz = scale_xz
        for v in sub.verts:
            v.co.x *= sx
            v.co.y *= sz
        self._merge_sub_bmesh(sub, mat, center, rot)

    def add_crystal(
        self,
        mat,
        center=(0, 0, 0),
        radii=(0.18, 0.32, 0.18),
        rot=(0, 0, 0),
        bevel=0.0,
    ):
        """Adds an octahedral crystal at Three.js world coordinates `center`."""
        sub = bmesh.new()
        bmesh.ops.create_uvsphere(sub, u_segments=6, v_segments=2, radius=1.0)
        rx, ry_up, rz_fwd = radii
        for v in sub.verts:
            v.co.x *= rx
            v.co.y *= rz_fwd
            v.co.z *= ry_up
        self._merge_sub_bmesh(sub, mat, center, rot)

    def add_torus(
        self,
        mat,
        center=(0, 0, 0),
        major_r=0.35,
        minor_r=0.05,
        rot=(0, 0, 0),
        major_seg=12,
        minor_seg=6,
    ):
        """Adds a smooth torus lying in the horizontal XZ plane (before `rot`)."""
        sub = bmesh.new()
        rings = []
        for i in range(major_seg):
            theta = (i / major_seg) * math.tau
            cos_t = math.cos(theta)
            sin_t = math.sin(theta)
            ring = []
            for j in range(minor_seg):
                phi = (j / minor_seg) * math.tau
                r = major_r + minor_r * math.cos(phi)
                x = r * cos_t
                y = r * sin_t
                z = minor_r * math.sin(phi)
                ring.append(sub.verts.new((x, y, z)))
            rings.append(ring)
        for i in range(major_seg):
            i_next = (i + 1) % major_seg
            for j in range(minor_seg):
                j_next = (j + 1) % minor_seg
                sub.faces.new(
                    (
                        rings[i][j],
                        rings[i_next][j],
                        rings[i_next][j_next],
                        rings[i][j_next],
                    )
                )
        self._merge_sub_bmesh(sub, mat, center, rot)

    def add_curved_tube(
        self,
        mat,
        p0_three,
        p1_three,
        p2_three,
        r0=0.1,
        r1=0.015,
        rings=6,
        segs=6,
    ):
        """
        Sweeps a tapered circular tube along a quadratic Bezier curve from `p0_three`
        through control point `p1_three` to `p2_three` (all in Three.js world coordinates).
        Ideal for curved horns, tusks, tails, arches, claws, and antlers.
        """
        mat_idx = self._get_mat_idx(mat)
        p0 = pt(*p0_three) - self.pivot_blender
        p1 = pt(*p1_three) - self.pivot_blender
        p2 = pt(*p2_three) - self.pivot_blender

        sub = bmesh.new()
        ring_verts = []
        for i in range(rings + 1):
            t = i / rings
            omt = 1.0 - t
            pos = (omt * omt) * p0 + (2.0 * omt * t) * p1 + (t * t) * p2
            tangent = 2.0 * omt * (p1 - p0) + 2.0 * t * (p2 - p1)
            if tangent.length < 1e-6:
                tangent = mathutils.Vector((0.0, 0.0, 1.0))
            tangent.normalize()
            up_ref = (
                mathutils.Vector((0.0, 0.0, 1.0))
                if abs(tangent.z) < 0.92
                else mathutils.Vector((1.0, 0.0, 0.0))
            )
            side = tangent.cross(up_ref).normalized()
            up_ortho = side.cross(tangent).normalized()
            r = max(0.004, r0 * (1.0 - t) + r1 * t)
            v_ring = []
            for s in range(segs):
                ang = (s / segs) * math.tau
                v_pos = pos + side * (math.cos(ang) * r) + up_ortho * (math.sin(ang) * r)
                v_ring.append(sub.verts.new(v_pos))
            ring_verts.append(v_ring)

        for i in range(rings):
            for s in range(segs):
                s_next = (s + 1) % segs
                sub.faces.new(
                    (
                        ring_verts[i][s],
                        ring_verts[i][s_next],
                        ring_verts[i + 1][s_next],
                        ring_verts[i + 1][s],
                    )
                )
        sub.faces.new(reversed(ring_verts[0]))
        sub.faces.new(ring_verts[-1])

        bmesh.ops.recalc_face_normals(sub, faces=sub.faces)
        for f in sub.faces:
            f.material_index = mat_idx
            f.smooth = True

        tmp_mesh = bpy.data.meshes.new(f"_tmp_curve_{self.name}")
        sub.to_mesh(tmp_mesh)
        sub.free()
        self.bm.from_mesh(tmp_mesh)
        bpy.data.meshes.remove(tmp_mesh)

    def build_object(self, collection=None):
        """Finalizes the Blender Mesh object, links materials, and parents it."""
        if collection is None:
            collection = bpy.context.scene.collection

        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()

        for poly in mesh.polygons:
            poly.use_smooth = True

        for mat in self.materials:
            mesh.materials.append(mat)

        obj = bpy.data.objects.new(self.name, mesh)
        collection.objects.link(obj)

        if self.parent_part and self.parent_part.obj:
            obj.parent = self.parent_part.obj
            obj.location = self.pivot_blender - self.parent_part.pivot_blender
        else:
            obj.location = self.pivot_blender

        self.obj = obj
        return obj


def export_current_model_glb(filename):
    """Exports the current scene to `public/assets/models/<filename>` with `export_lights=False`."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    filepath = os.path.join(OUTPUT_DIR, filename)

    mesh_objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    total_verts = sum(len(o.data.vertices) for o in mesh_objs if o.data)
    if mesh_objs:
        bpy.context.view_layer.objects.active = mesh_objs[0]

    export_kwargs = dict(
        filepath=filepath,
        export_format="GLB",
        use_selection=False,
        export_cameras=False,
        export_lights=False,
        export_apply=True,
        export_yup=True,
    )

    if bpy.app.background or not bpy.context.window_manager.windows:
        bpy.ops.export_scene.gltf(**export_kwargs)
    else:
        win = bpy.context.window_manager.windows[0]
        area = next((a for a in win.screen.areas if a.type == "VIEW_3D"), win.screen.areas[0])
        with bpy.context.temp_override(
            window=win,
            screen=win.screen,
            area=area,
            view_layer=bpy.context.view_layer,
            active_object=bpy.context.view_layer.objects.active,
        ):
            bpy.ops.export_scene.gltf(**export_kwargs)

    size_kb = os.path.getsize(filepath) / 1024.0
    print(f"[BlenderGen] Exported {filename} ({total_verts} verts, {size_kb:.1f} KB)")
    return filepath


# ==============================================================================
# 1. HERO GUARDIAN (`hero_guardian.glb`)
# ==============================================================================
def build_hero_guardian():
    clear_scene()
    mat_armor = create_pbr_material("Mat_Armor", 0x1E2D3D, roughness=0.28, metallic=0.82)
    mat_gold = create_pbr_material("Mat_GoldTrim", 0xEEAC3E, roughness=0.22, metallic=0.90)
    mat_cape = create_pbr_material("Mat_Cape", 0xB81D24, roughness=0.68, metallic=0.08)
    mat_skin = create_pbr_material("Mat_Skin", 0xD9A982, roughness=0.55, metallic=0.05)
    mat_visor = create_pbr_material(
        "Mat_HeroVisor", 0x66F0FF, roughness=0.15, metallic=0.5, emission_hex=0x00D8FF, emission_strength=3.5
    )
    mat_blade = create_pbr_material(
        "Mat_HeroBlade", 0x88EEFF, roughness=0.15, metallic=0.88, emission_hex=0x1E90FF, emission_strength=3.0
    )

    body = PartBuilder("Body", (0, 1.05, 0), subsurf_levels=1)
    # Sculpted V-tapered obsidian cuirass + abdominal plates + belt
    body.add_box(mat_armor, (0, 1.24, 0), (0.78, 0.58, 0.46), bevel=0.05, taper_bottom=0.82)
    body.add_box(mat_armor, (0, 0.90, 0), (0.64, 0.34, 0.40), bevel=0.04, taper_top=0.92)
    body.add_box(mat_gold, (0, 0.78, 0), (0.68, 0.11, 0.44), bevel=0.02)
    body.add_box(mat_gold, (0, 0.78, 0.23), (0.18, 0.15, 0.06), bevel=0.015)
    # Chest Bastion Core Emblem (gold frame + glowing cyan crystal)
    body.add_crystal(mat_gold, (0, 1.28, 0.23), (0.17, 0.22, 0.08))
    body.add_crystal(mat_visor, (0, 1.28, 0.26), (0.11, 0.15, 0.06))
    # Layered shoulder pauldrons with gold rims & cyan shoulder gems
    for side in (-1, 1):
        body.add_ellipsoid(mat_armor, (side * 0.50, 1.50, 0), (0.26, 0.20, 0.26))
        body.add_box(
            mat_gold,
            (side * 0.52, 1.46, 0),
            (0.30, 0.09, 0.30),
            rot=(0, 0, -side * 0.25),
            bevel=0.02,
        )
        body.add_crystal(mat_visor, (side * 0.58, 1.54, 0.08), (0.06, 0.08, 0.06))
        # Hip tassets
        body.add_box(
            mat_armor,
            (side * 0.28, 0.66, 0.04),
            (0.20, 0.24, 0.32),
            rot=(0, 0, -side * 0.12),
            bevel=0.02,
        )
    body.build_object()

    # Flowing Crimson Cape (Tail)
    tail = PartBuilder("Tail", (0, 1.52, -0.22), parent_part=body, subsurf_levels=1)
    tail.add_box(mat_gold, (-0.28, 1.52, -0.20), (0.12, 0.08, 0.10), bevel=0.015)
    tail.add_box(mat_gold, (0.28, 1.52, -0.20), (0.12, 0.08, 0.10), bevel=0.015)
    tail.add_box(
        mat_cape,
        (0, 0.96, -0.32),
        (0.76, 1.18, 0.07),
        rot=(0.16, 0, 0),
        bevel=0.02,
        taper_top=0.82,
    )
    tail.add_box(
        mat_gold,
        (0, 0.40, -0.41),
        (0.78, 0.07, 0.08),
        rot=(0.16, 0, 0),
        bevel=0.01,
    )
    tail.build_object()

    # Crowned Knight Helmet & Head
    head = PartBuilder("Head", (0, 1.72, 0), parent_part=body, subsurf_levels=1)
    head.add_ellipsoid(mat_armor, (0, 1.88, 0), (0.25, 0.27, 0.26))
    head.add_box(mat_armor, (0, 1.80, 0.08), (0.42, 0.26, 0.36), bevel=0.04, taper_front=0.82)
    # Royal golden crown crest & plume ridge
    head.add_torus(mat_gold, (0, 2.02, 0), major_r=0.22, minor_r=0.035, rot=(0.08, 0, 0))
    for ang_deg in (-55, -25, 0, 25, 55):
        rad = math.radians(ang_deg)
        head.add_cone(
            mat_gold,
            (math.sin(rad) * 0.21, 2.11, math.cos(rad) * 0.21),
            r_bottom=0.04,
            r_top=0.008,
            height=0.14,
        )
    head.add_box(mat_cape, (0, 2.16, -0.06), (0.09, 0.20, 0.38), rot=(-0.15, 0, 0), bevel=0.02)
    head.build_object()

    # Child Visor mesh for dynamic weapon element tinting
    visor = PartBuilder("HeroVisor", (0, 1.86, 0.22), parent_part=head, subsurf_levels=0)
    visor.add_box(mat_visor, (0, 1.86, 0.24), (0.34, 0.075, 0.06), bevel=0.012, taper_front=0.9)
    visor.add_box(mat_visor, (0, 1.79, 0.25), (0.055, 0.14, 0.05), bevel=0.008)
    visor.build_object()

    # Left Arm + Octagonal Bastion Runic Shield
    left_arm = PartBuilder("LeftArm", (-0.52, 1.46, 0), parent_part=body, subsurf_levels=1)
    left_arm.add_box(mat_armor, (-0.54, 1.18, 0), (0.24, 0.58, 0.24), bevel=0.035, taper_bottom=0.85)
    left_arm.add_box(mat_gold, (-0.54, 1.00, 0.02), (0.26, 0.12, 0.26), bevel=0.02)
    # Octagonal Shield attached to forearm
    left_arm.add_cone(
        mat_gold,
        (-0.70, 1.12, 0.14),
        r_bottom=0.44,
        r_top=0.44,
        height=0.08,
        rot=(0, 0, math.pi * 0.5),
        segs=8,
        scale_xz=(1.22, 0.92),
    )
    left_arm.add_cone(
        mat_armor,
        (-0.72, 1.12, 0.14),
        r_bottom=0.38,
        r_top=0.38,
        height=0.09,
        rot=(0, 0, math.pi * 0.5),
        segs=8,
        scale_xz=(1.22, 0.92),
    )
    left_arm.add_crystal(mat_visor, (-0.77, 1.12, 0.14), (0.06, 0.16, 0.12))
    left_arm.build_object()

    # Right Arm + Runic Greatsword (`Weapon` -> `HeroBlade`)
    right_arm = PartBuilder("RightArm", (0.52, 1.46, 0), parent_part=body, subsurf_levels=1)
    right_arm.add_box(mat_armor, (0.54, 1.18, 0), (0.24, 0.58, 0.24), bevel=0.035, taper_bottom=0.85)
    right_arm.add_box(mat_gold, (0.54, 1.00, 0.02), (0.26, 0.12, 0.26), bevel=0.02)
    right_arm.build_object()

    weapon = PartBuilder("Weapon", (0.56, 0.92, 0.20), parent_part=right_arm, subsurf_levels=0)
    # Greatsword angled forward (+Z in Three.js) and slightly up
    weapon.add_cone(
        mat_gold,
        (0.56, 0.88, 0.08),
        r_bottom=0.045,
        r_top=0.038,
        height=0.36,
        rot=(math.pi * 0.36, 0, 0),
        segs=8,
    )
    weapon.add_ellipsoid(mat_gold, (0.56, 0.80, -0.08), (0.065, 0.065, 0.065))
    weapon.add_box(
        mat_gold,
        (0.56, 0.96, 0.24),
        (0.44, 0.09, 0.12),
        rot=(math.pi * 0.36, 0, 0),
        bevel=0.018,
    )
    weapon.add_crystal(mat_visor, (0.56, 0.96, 0.25), (0.07, 0.07, 0.07))
    weapon.build_object()

    hero_blade = PartBuilder("HeroBlade", (0.56, 0.96, 0.24), parent_part=weapon, subsurf_levels=0)
    hero_blade.add_box(
        mat_blade,
        (0.56, 1.28, 0.92),
        (0.13, 1.42, 0.048),
        rot=(math.pi * 0.36, 0, 0),
        bevel=0.012,
        taper_top=0.18,
    )
    hero_blade.build_object()

    # Articulated Armored Legs touching y = 0
    for name, side in (("LeftLeg", -1), ("RightLeg", 1)):
        leg = PartBuilder(name, (side * 0.21, 0.68, 0), subsurf_levels=1)
        leg.add_box(mat_armor, (side * 0.21, 0.42, 0), (0.25, 0.52, 0.26), bevel=0.035, taper_bottom=0.84)
        leg.add_box(mat_gold, (side * 0.21, 0.38, 0.13), (0.18, 0.14, 0.08), bevel=0.02)
        leg.add_box(mat_armor, (side * 0.21, 0.10, 0.05), (0.24, 0.20, 0.34), bevel=0.03, taper_front=0.85)
        leg.build_object()

    return export_current_model_glb("hero_guardian.glb")


# ==============================================================================
# 2. NPC SURVIVOR / SCOUT (`npc_survivor.glb`)
# ==============================================================================
def build_npc_survivor():
    clear_scene()
    mat_tunic = create_pbr_material("Mat_Tunic", 0x16697A, roughness=0.52, metallic=0.22)
    mat_cloak = create_pbr_material("Mat_Cloak", 0x2ED573, roughness=0.60, metallic=0.08)
    mat_leather = create_pbr_material("Mat_Leather", 0x5C3D28, roughness=0.65, metallic=0.12)
    mat_skin = create_pbr_material("Mat_Skin", 0xDEB896, roughness=0.55, metallic=0.05)
    mat_accent = create_pbr_material(
        "Mat_Accent", 0xFFD166, roughness=0.22, metallic=0.5, emission_hex=0x48DBFB, emission_strength=2.6
    )

    body = PartBuilder("Body", (0, 0.95, 0), subsurf_levels=1)
    body.add_box(mat_tunic, (0, 1.08, 0), (0.56, 0.72, 0.36), bevel=0.04, taper_bottom=0.88)
    body.add_box(mat_leather, (0, 0.82, 0), (0.58, 0.10, 0.38), bevel=0.02)
    body.add_box(mat_cloak, (0, 1.34, 0), (0.64, 0.18, 0.42), bevel=0.03)
    body.build_object()

    head = PartBuilder("Head", (0, 1.56, 0), parent_part=body, subsurf_levels=1)
    head.add_ellipsoid(mat_skin, (0, 1.72, 0.02), (0.20, 0.21, 0.20))
    # Ranger peaked hood/cowl + glowing scout lens
    head.add_cone(
        mat_cloak,
        (0, 1.84, -0.02),
        r_bottom=0.28,
        r_top=0.03,
        height=0.38,
        rot=(-0.18, 0, 0),
        segs=10,
    )
    head.add_box(mat_accent, (0, 1.74, 0.21), (0.30, 0.07, 0.06), bevel=0.012)
    head.build_object()

    # Cloak + Quiver & Bow on back
    tail = PartBuilder("Tail", (0, 1.34, -0.18), parent_part=body, subsurf_levels=1)
    tail.add_box(mat_cloak, (0, 0.92, -0.24), (0.54, 0.86, 0.06), rot=(0.15, 0, 0), bevel=0.02)
    tail.add_cone(
        mat_leather,
        (-0.14, 1.12, -0.28),
        r_bottom=0.07,
        r_top=0.09,
        height=0.48,
        rot=(0.15, 0, -0.35),
        segs=8,
    )
    tail.add_curved_tube(
        mat_leather,
        (-0.26, 0.82, -0.26),
        (0.05, 1.14, -0.34),
        (0.28, 1.46, -0.26),
        r0=0.028,
        r1=0.022,
    )
    tail.build_object()

    left_arm = PartBuilder("LeftArm", (-0.38, 1.32, 0), parent_part=body, subsurf_levels=1)
    left_arm.add_box(mat_tunic, (-0.38, 1.08, 0), (0.18, 0.52, 0.18), bevel=0.03, taper_bottom=0.85)
    left_arm.build_object()

    right_arm = PartBuilder("RightArm", (0.38, 1.32, 0), parent_part=body, subsurf_levels=1)
    right_arm.add_box(mat_tunic, (0.38, 1.08, 0), (0.18, 0.52, 0.18), bevel=0.03, taper_bottom=0.85)
    right_arm.build_object()

    # Scout Staff with glowing Beacon Lantern
    weapon = PartBuilder("Weapon", (0.38, 0.86, 0.14), parent_part=right_arm, subsurf_levels=0)
    weapon.add_cone(mat_leather, (0.38, 1.06, 0.18), r_bottom=0.03, r_top=0.03, height=1.25, segs=8)
    weapon.add_crystal(mat_accent, (0.38, 1.72, 0.18), (0.14, 0.20, 0.14))
    weapon.add_torus(mat_leather, (0.38, 1.72, 0.18), major_r=0.16, minor_r=0.02, rot=(math.pi * 0.5, 0, 0))
    weapon.build_object()

    for name, side in (("LeftLeg", -1), ("RightLeg", 1)):
        leg = PartBuilder(name, (side * 0.15, 0.56, 0), subsurf_levels=1)
        leg.add_box(mat_leather, (side * 0.15, 0.28, 0), (0.19, 0.56, 0.21), bevel=0.03, taper_bottom=0.85)
        leg.build_object()

    return export_current_model_glb("npc_survivor.glb")


# ==============================================================================
# 3. GOBLIN SCOUT (`goblin.glb`)
# ==============================================================================
def build_goblin():
    clear_scene()
    mat_skin = create_pbr_material("Mat_Skin", 0x5C8A3C, roughness=0.58, metallic=0.08)
    mat_accent = create_pbr_material("Mat_Accent", 0x9AB858, roughness=0.52, metallic=0.12)
    mat_leather = create_pbr_material("Mat_Leather", 0x4A321F, roughness=0.70, metallic=0.10)
    mat_dark = create_pbr_material("Mat_Dark", 0x262B30, roughness=0.35, metallic=0.75)
    mat_eye = create_pbr_material(
        "Mat_Eye", 0xFFDD00, roughness=0.15, metallic=0.2, emission_hex=0xFFCC00, emission_strength=3.0
    )

    body = PartBuilder("Body", (0, 0.72, 0), subsurf_levels=1)
    body.add_box(
        mat_skin, (0, 0.76, 0.02), (0.48, 0.54, 0.34), rot=(0.24, 0, 0), bevel=0.04, taper_bottom=0.82
    )
    body.add_box(mat_leather, (0, 0.50, 0), (0.50, 0.22, 0.36), bevel=0.03)
    body.add_box(mat_accent, (0, 0.44, 0.16), (0.24, 0.28, 0.06), bevel=0.015, taper_bottom=0.5)
    body.build_object()

    head = PartBuilder("Head", (0, 1.12, 0.12), parent_part=body, subsurf_levels=1)
    head.add_ellipsoid(mat_skin, (0, 1.24, 0.14), (0.24, 0.22, 0.24))
    # Hooked goblin nose & grin
    head.add_curved_tube(
        mat_skin, (0, 1.24, 0.32), (0, 1.22, 0.48), (0, 1.15, 0.52), r0=0.07, r1=0.015
    )
    # Long swept-out pointed goblin ears
    for side in (-1, 1):
        head.add_curved_tube(
            mat_skin,
            (side * 0.20, 1.25, 0.12),
            (side * 0.44, 1.32, 0.06),
            (side * 0.62, 1.40, -0.04),
            r0=0.075,
            r1=0.012,
        )
        head.add_ellipsoid(mat_eye, (side * 0.11, 1.27, 0.34), (0.048, 0.042, 0.04))
    # Spiky crest
    for i in range(3):
        head.add_cone(
            mat_accent,
            (0, 1.46 - i * 0.05, 0.12 - i * 0.09),
            r_bottom=0.04,
            r_top=0.008,
            height=0.14,
            rot=(-0.4, 0, 0),
        )
    head.build_object()

    left_arm = PartBuilder("LeftArm", (-0.32, 0.92, 0.06), parent_part=body, subsurf_levels=1)
    left_arm.add_box(mat_skin, (-0.34, 0.70, 0.08), (0.14, 0.46, 0.14), bevel=0.025)
    left_arm.build_object()

    right_arm = PartBuilder("RightArm", (0.32, 0.92, 0.06), parent_part=body, subsurf_levels=1)
    right_arm.add_box(mat_skin, (0.34, 0.70, 0.08), (0.14, 0.46, 0.14), bevel=0.025)
    right_arm.build_object()

    weapon = PartBuilder("Weapon", (0.34, 0.50, 0.16), parent_part=right_arm, subsurf_levels=0)
    weapon.add_box(mat_leather, (0.34, 0.50, 0.16), (0.05, 0.05, 0.18), bevel=0.01)
    weapon.add_cone(
        mat_dark,
        (0.34, 0.50, 0.42),
        r_bottom=0.065,
        r_top=0.008,
        height=0.44,
        rot=(math.pi * 0.5, 0, 0),
        segs=6,
        scale_xz=(0.45, 1.0),
    )
    weapon.build_object()

    tail = PartBuilder("Tail", (0, 0.56, -0.18), parent_part=body, subsurf_levels=1)
    tail.add_box(mat_leather, (0, 0.52, -0.22), (0.20, 0.18, 0.10), bevel=0.02)
    tail.build_object()

    for name, side in (("LeftLeg", -1), ("RightLeg", 1)):
        leg = PartBuilder(name, (side * 0.15, 0.45, 0), subsurf_levels=1)
        leg.add_box(mat_skin, (side * 0.15, 0.22, 0), (0.15, 0.45, 0.17), bevel=0.025, taper_bottom=0.8)
        leg.build_object()

    return export_current_model_glb("goblin.glb")


# ==============================================================================
# 4. ORC MARAUDER (`orc.glb`)
# ==============================================================================
def build_orc():
    clear_scene()
    mat_skin = create_pbr_material("Mat_Skin", 0x3F6A34, roughness=0.55, metallic=0.10)
    mat_accent = create_pbr_material("Mat_Accent", 0x8F4426, roughness=0.60, metallic=0.18)
    mat_dark = create_pbr_material("Mat_Dark", 0x252930, roughness=0.35, metallic=0.78)
    mat_bone = create_pbr_material("Mat_Bone", 0xEAE4D7, roughness=0.35, metallic=0.10)
    mat_eye = create_pbr_material(
        "Mat_Eye", 0xFF4411, roughness=0.15, metallic=0.2, emission_hex=0xFF3300, emission_strength=3.0
    )

    body = PartBuilder("Body", (0, 1.05, 0), subsurf_levels=1)
    # Broad muscular V-torso + iron war belt + spiked iron pauldrons
    body.add_box(mat_skin, (0, 1.28, 0), (0.88, 0.64, 0.52), bevel=0.06, taper_bottom=0.78)
    body.add_box(mat_accent, (0, 0.86, 0), (0.68, 0.36, 0.44), bevel=0.04)
    body.add_box(mat_dark, (0, 0.94, 0.23), (0.24, 0.18, 0.08), bevel=0.02)
    for side in (-1, 1):
        body.add_ellipsoid(mat_dark, (side * 0.56, 1.50, 0), (0.26, 0.20, 0.26))
        for sp in (-0.08, 0.08):
            body.add_cone(
                mat_bone,
                (side * 0.66, 1.66, sp),
                r_bottom=0.05,
                r_top=0.008,
                height=0.22,
                rot=(0, 0, -side * 0.45),
            )
    body.build_object()

    head = PartBuilder("Head", (0, 1.68, 0.08), parent_part=body, subsurf_levels=1)
    head.add_box(mat_skin, (0, 1.84, 0.08), (0.48, 0.44, 0.48), bevel=0.05)
    # Prognathous lower jaw + twin curved ivory tusks
    head.add_box(mat_skin, (0, 1.68, 0.20), (0.52, 0.20, 0.36), bevel=0.035)
    for side in (-1, 1):
        head.add_curved_tube(
            mat_bone,
            (side * 0.17, 1.68, 0.32),
            (side * 0.19, 1.78, 0.44),
            (side * 0.15, 1.92, 0.40),
            r0=0.05,
            r1=0.01,
        )
        head.add_ellipsoid(mat_eye, (side * 0.13, 1.88, 0.31), (0.048, 0.038, 0.04))
    head.build_object()

    left_arm = PartBuilder("LeftArm", (-0.56, 1.42, 0), parent_part=body, subsurf_levels=1)
    left_arm.add_box(mat_skin, (-0.58, 1.12, 0), (0.26, 0.64, 0.26), bevel=0.04)
    left_arm.add_box(mat_dark, (-0.58, 0.94, 0.02), (0.28, 0.22, 0.28), bevel=0.025)
    left_arm.build_object()

    right_arm = PartBuilder("RightArm", (0.56, 1.42, 0), parent_part=body, subsurf_levels=1)
    right_arm.add_box(mat_skin, (0.58, 1.12, 0), (0.26, 0.64, 0.26), bevel=0.04)
    right_arm.add_box(mat_dark, (0.58, 0.94, 0.02), (0.28, 0.22, 0.28), bevel=0.025)
    right_arm.build_object()

    weapon = PartBuilder("Weapon", (0.58, 0.84, 0.18), parent_part=right_arm, subsurf_levels=0)
    weapon.add_cone(
        mat_accent,
        (0.58, 0.84, 0.38),
        r_bottom=0.04,
        r_top=0.04,
        height=0.72,
        rot=(math.pi * 0.5, 0, 0),
        segs=8,
    )
    weapon.add_box(
        mat_dark,
        (0.58, 0.88, 0.62),
        (0.07, 0.48, 0.38),
        bevel=0.015,
        taper_front=1.25,
    )
    weapon.build_object()

    tail = PartBuilder("Tail", (0, 0.82, -0.22), parent_part=body, subsurf_levels=1)
    tail.add_box(mat_accent, (0, 0.62, -0.24), (0.44, 0.38, 0.07), bevel=0.02)
    tail.build_object()

    for name, side in (("LeftLeg", -1), ("RightLeg", 1)):
        leg = PartBuilder(name, (side * 0.22, 0.64, 0), subsurf_levels=1)
        leg.add_box(mat_dark, (side * 0.22, 0.32, 0), (0.26, 0.64, 0.28), bevel=0.035)
        leg.build_object()

    return export_current_model_glb("orc.glb")


# ==============================================================================
# 5. CAVE / FIRE TROLL (`troll.glb`)
# ==============================================================================
def build_troll():
    clear_scene()
    mat_skin = create_pbr_material("Mat_Skin", 0x3B5249, roughness=0.68, metallic=0.12)
    mat_accent = create_pbr_material("Mat_Accent", 0x6C7A72, roughness=0.72, metallic=0.18)
    mat_magma = create_pbr_material(
        "Mat_Magma", 0xFF5500, roughness=0.20, metallic=0.35, emission_hex=0xFF3300, emission_strength=2.8
    )
    mat_dark = create_pbr_material("Mat_Dark", 0x22252A, roughness=0.45, metallic=0.65)
    mat_bone = create_pbr_material("Mat_Bone", 0xDCD6C8, roughness=0.40, metallic=0.10)
    mat_eye = create_pbr_material(
        "Mat_Eye", 0xFFCC00, roughness=0.15, metallic=0.2, emission_hex=0xFF8800, emission_strength=3.2
    )

    body = PartBuilder("Body", (0, 1.38, 0), subsurf_levels=1)
    # Towering hunchbacked colossus torso + rocky dorsal boulders + magma crystals
    body.add_ellipsoid(mat_skin, (0, 1.68, -0.04), (0.76, 0.66, 0.62))
    body.add_ellipsoid(mat_accent, (0, 1.24, 0.08), (0.58, 0.50, 0.52))
    for bx, by, bz, r in (
        (0, 2.18, -0.26, 0.26),
        (-0.36, 1.98, -0.32, 0.22),
        (0.36, 1.98, -0.32, 0.22),
        (0, 1.72, -0.46, 0.24),
    ):
        body.add_ellipsoid(mat_accent, (bx, by, bz), (r, r * 0.85, r))
    # Magma crystal shards & glowing veins
    for cx, cy, cz, rz in (
        (-0.26, 2.24, -0.18, 0.35),
        (0.26, 2.24, -0.18, -0.35),
        (0, 2.34, -0.12, 0.0),
    ):
        body.add_crystal(mat_magma, (cx, cy, cz), (0.10, 0.28, 0.10), rot=(-0.3, 0, rz))
    body.build_object()

    head = PartBuilder("Head", (0, 1.96, 0.44), parent_part=body, subsurf_levels=1)
    head.add_box(mat_skin, (0, 2.04, 0.52), (0.56, 0.52, 0.56), bevel=0.06)
    head.add_box(mat_accent, (0, 2.22, 0.72), (0.62, 0.16, 0.26), bevel=0.03)
    # Twisted Troll horns
    for side in (-1, 1):
        head.add_curved_tube(
            mat_bone,
            (side * 0.24, 2.20, 0.52),
            (side * 0.52, 2.38, 0.42),
            (side * 0.38, 2.64, 0.66),
            r0=0.09,
            r1=0.018,
        )
        head.add_ellipsoid(mat_eye, (side * 0.16, 2.08, 0.78), (0.06, 0.05, 0.05))
    head.build_object()

    left_arm = PartBuilder("LeftArm", (-0.78, 1.80, 0.10), parent_part=body, subsurf_levels=1)
    left_arm.add_box(mat_skin, (-0.82, 1.32, 0.12), (0.34, 0.96, 0.34), bevel=0.05)
    left_arm.build_object()

    right_arm = PartBuilder("RightArm", (0.78, 1.80, 0.10), parent_part=body, subsurf_levels=1)
    right_arm.add_box(mat_skin, (0.82, 1.32, 0.12), (0.34, 0.96, 0.34), bevel=0.05)
    right_arm.build_object()

    weapon = PartBuilder("Weapon", (0.82, 0.92, 0.26), parent_part=right_arm, subsurf_levels=1)
    weapon.add_cone(
        mat_accent,
        (0.82, 0.96, 0.72),
        r_bottom=0.18,
        r_top=0.10,
        height=1.22,
        rot=(-math.pi * 0.45, 0, 0),
        segs=8,
    )
    weapon.add_ellipsoid(mat_dark, (0.82, 1.02, 1.18), (0.34, 0.32, 0.36))
    weapon.add_crystal(mat_magma, (0.82, 1.24, 1.22), (0.10, 0.22, 0.10))
    weapon.build_object()

    tail = PartBuilder("Tail", (0, 1.12, -0.42), parent_part=body, subsurf_levels=1)
    tail.add_ellipsoid(mat_accent, (0, 1.12, -0.48), (0.22, 0.18, 0.22))
    tail.build_object()

    for name, side in (("LeftLeg", -1), ("RightLeg", 1)):
        leg = PartBuilder(name, (side * 0.32, 0.82, 0), subsurf_levels=1)
        leg.add_box(mat_skin, (side * 0.32, 0.41, 0), (0.36, 0.82, 0.38), bevel=0.05)
        leg.build_object()

    return export_current_model_glb("troll.glb")


# ==============================================================================
# 6. WILD WOLF (`wolf.glb`)
# ==============================================================================
def build_wolf():
    clear_scene()
    mat_skin = create_pbr_material("Mat_Skin", 0x626A73, roughness=0.58, metallic=0.08)
    mat_accent = create_pbr_material("Mat_Accent", 0x9AA4B0, roughness=0.52, metallic=0.08)
    mat_bone = create_pbr_material("Mat_Bone", 0xF0ECE1, roughness=0.35, metallic=0.10)
    mat_eye = create_pbr_material(
        "Mat_Eye", 0xFFCC00, roughness=0.15, metallic=0.2, emission_hex=0xFFAA00, emission_strength=2.8
    )

    body = PartBuilder("Body", (0, 0.74, 0), subsurf_levels=1)
    body.add_box(mat_skin, (0, 0.76, 0), (0.52, 0.46, 1.12), bevel=0.06, taper_front=1.08)
    # Sculpted shoulder fur ruff
    body.add_ellipsoid(mat_accent, (0, 0.84, 0.36), (0.32, 0.28, 0.30))
    body.build_object()

    head = PartBuilder("Head", (0, 1.02, 0.58), parent_part=body, subsurf_levels=1)
    head.add_box(mat_skin, (0, 1.08, 0.64), (0.42, 0.38, 0.42), bevel=0.05)
    head.add_box(mat_accent, (0, 1.00, 0.94), (0.24, 0.20, 0.36), bevel=0.03, taper_front=0.72)
    for side in (-1, 1):
        head.add_cone(
            mat_skin, (side * 0.15, 1.34, 0.58), r_bottom=0.08, r_top=0.01, height=0.24, segs=6
        )
        head.add_cone(
            mat_bone,
            (side * 0.08, 0.90, 1.02),
            r_bottom=0.025,
            r_top=0.005,
            height=0.09,
            rot=(math.pi, 0, 0),
        )
        head.add_ellipsoid(mat_eye, (side * 0.13, 1.12, 0.84), (0.04, 0.035, 0.04))
    head.build_object()

    tail = PartBuilder("Tail", (0, 0.90, -0.56), parent_part=body, subsurf_levels=1)
    tail.add_curved_tube(
        mat_accent, (0, 0.90, -0.56), (0, 0.78, -0.92), (0, 0.58, -1.18), r0=0.10, r1=0.04
    )
    tail.build_object()

    for name, side in (("LeftArm", -1), ("RightArm", 1)):
        fl = PartBuilder(name, (side * 0.21, 0.64, 0.42), parent_part=body, subsurf_levels=1)
        fl.add_box(mat_skin, (side * 0.21, 0.32, 0.42), (0.16, 0.64, 0.16), bevel=0.025, taper_bottom=0.78)
        fl.build_object()

    for name, side in (("LeftLeg", -1), ("RightLeg", 1)):
        bl = PartBuilder(name, (side * 0.21, 0.64, -0.42), subsurf_levels=1)
        bl.add_box(mat_skin, (side * 0.21, 0.32, -0.42), (0.18, 0.64, 0.18), bevel=0.025, taper_bottom=0.78)
        bl.build_object()

    return export_current_model_glb("wolf.glb")


# ==============================================================================
# 7. HIGHLAND LION (`lion.glb`)
# ==============================================================================
def build_lion():
    clear_scene()
    mat_skin = create_pbr_material("Mat_Skin", 0xC9933B, roughness=0.55, metallic=0.08)
    mat_accent = create_pbr_material("Mat_Accent", 0x5C3112, roughness=0.68, metallic=0.06)
    mat_bone = create_pbr_material("Mat_Bone", 0xF5F0E6, roughness=0.35, metallic=0.10)
    mat_eye = create_pbr_material(
        "Mat_Eye", 0xFFAA00, roughness=0.15, metallic=0.2, emission_hex=0xFF8800, emission_strength=2.8
    )

    body = PartBuilder("Body", (0, 0.88, 0), subsurf_levels=1)
    body.add_box(mat_skin, (0, 0.90, 0), (0.66, 0.56, 1.28), bevel=0.07, taper_front=1.12)
    body.build_object()

    head = PartBuilder("Head", (0, 1.18, 0.68), parent_part=body, subsurf_levels=1)
    # Voluminous royal lion mane in crown around head
    head.add_ellipsoid(mat_accent, (0, 1.22, 0.56), (0.46, 0.48, 0.36))
    for i in range(10):
        ang = (i / 10.0) * math.tau
        head.add_cone(
            mat_accent,
            (math.cos(ang) * 0.38, 1.22 + math.sin(ang) * 0.38, 0.56),
            r_bottom=0.14,
            r_top=0.03,
            height=0.26,
            rot=(-0.3, 0, -ang + math.pi * 0.5),
        )
    head.add_box(mat_skin, (0, 1.22, 0.74), (0.44, 0.40, 0.40), bevel=0.05)
    head.add_box(mat_skin, (0, 1.14, 1.00), (0.30, 0.22, 0.30), bevel=0.035)
    for side in (-1, 1):
        head.add_ellipsoid(mat_eye, (side * 0.14, 1.26, 0.94), (0.045, 0.04, 0.04))
    head.build_object()

    tail = PartBuilder("Tail", (0, 1.06, -0.64), parent_part=body, subsurf_levels=1)
    tail.add_curved_tube(
        mat_skin, (0, 1.06, -0.64), (0, 0.88, -1.04), (0, 1.12, -1.32), r0=0.055, r1=0.035
    )
    tail.add_ellipsoid(mat_accent, (0, 1.14, -1.34), (0.11, 0.11, 0.14))
    tail.build_object()

    for name, side in (("LeftArm", -1), ("RightArm", 1)):
        fl = PartBuilder(name, (side * 0.24, 0.76, 0.44), parent_part=body, subsurf_levels=1)
        fl.add_box(mat_skin, (side * 0.24, 0.38, 0.44), (0.20, 0.76, 0.20), bevel=0.03, taper_bottom=0.82)
        fl.build_object()

    for name, side in (("LeftLeg", -1), ("RightLeg", 1)):
        bl = PartBuilder(name, (side * 0.24, 0.76, -0.44), subsurf_levels=1)
        bl.add_box(mat_skin, (side * 0.24, 0.38, -0.44), (0.22, 0.76, 0.22), bevel=0.03, taper_bottom=0.82)
        bl.build_object()

    return export_current_model_glb("lion.glb")


# ==============================================================================
# 8. CARRION VULTURE (`vulture.glb`)
# ==============================================================================
def build_vulture():
    clear_scene()
    mat_skin = create_pbr_material("Mat_Skin", 0x4A3B39, roughness=0.62, metallic=0.06)
    mat_accent = create_pbr_material("Mat_Accent", 0xB86F52, roughness=0.58, metallic=0.06)
    mat_bone = create_pbr_material("Mat_Bone", 0xE8E0CF, roughness=0.35, metallic=0.10)
    mat_eye = create_pbr_material(
        "Mat_Eye", 0xFF5522, roughness=0.15, metallic=0.2, emission_hex=0xFF4400, emission_strength=2.8
    )

    body = PartBuilder("Body", (0, 1.65, 0), subsurf_levels=1)
    body.add_ellipsoid(mat_skin, (0, 1.65, 0), (0.40, 0.36, 0.58))
    body.add_torus(mat_accent, (0, 1.82, 0.42), major_r=0.25, minor_r=0.09, rot=(math.pi * 0.38, 0, 0))
    body.build_object()

    head = PartBuilder("Head", (0, 1.98, 0.56), parent_part=body, subsurf_levels=1)
    head.add_ellipsoid(mat_accent, (0, 2.02, 0.60), (0.19, 0.19, 0.22))
    head.add_curved_tube(
        mat_bone, (0, 2.00, 0.76), (0, 1.98, 0.98), (0, 1.84, 1.06), r0=0.09, r1=0.012
    )
    for side in (-1, 1):
        head.add_ellipsoid(mat_eye, (side * 0.11, 2.06, 0.72), (0.04, 0.04, 0.04))
    head.build_object()

    # Feathered LeftWing & RightWing
    for name, side in (("LeftWing", -1), ("RightWing", 1)):
        wing = PartBuilder(name, (side * 0.25, 1.90, -0.08), parent_part=body, subsurf_levels=1)
        wing.add_box(
            mat_accent,
            (side * 0.88, 1.92, 0.12),
            (1.28, 0.08, 0.14),
             bevel=0.02,
        )
        wing.add_box(
            mat_skin,
            (side * 0.86, 1.90, -0.10),
            (1.24, 0.05, 0.56),
            bevel=0.015,
        )
        for f_idx in range(5):
            fx = side * (0.45 + f_idx * 0.22)
            wing.add_box(
                mat_skin,
                (fx, 1.89, -0.44),
                (0.16, 0.035, 0.38),
                rot=(0, side * 0.18, 0),
                bevel=0.01,
            )
        wing.build_object()

    tail = PartBuilder("Tail", (0, 1.65, -0.52), parent_part=body, subsurf_levels=1)
    tail.add_box(mat_skin, (0, 1.64, -0.74), (0.50, 0.06, 0.46), bevel=0.015, taper_front=0.65)
    tail.build_object()

    for name, side in (("LeftLeg", -1), ("RightLeg", 1)):
        leg = PartBuilder(name, (side * 0.16, 1.35, 0.05), subsurf_levels=1)
        leg.add_cone(mat_bone, (side * 0.16, 1.18, 0.05), r_bottom=0.04, r_top=0.07, height=0.34, segs=6)
        leg.build_object()

    return export_current_model_glb("vulture.glb")


# ==============================================================================
# 9. SOVEREIGN CALDERA DRAGON (`dragon.glb`)
# ==============================================================================
def build_dragon():
    clear_scene()
    mat_skin = create_pbr_material("Mat_Skin", 0x8F2424, roughness=0.45, metallic=0.22)
    mat_accent = create_pbr_material("Mat_Accent", 0xFF6B1A, roughness=0.35, metallic=0.45)
    mat_magma = create_pbr_material(
        "Mat_Magma", 0xFF4500, roughness=0.18, metallic=0.35, emission_hex=0xFF3300, emission_strength=3.0
    )
    mat_bone = create_pbr_material("Mat_Bone", 0xEFE9D8, roughness=0.32, metallic=0.12)
    mat_eye = create_pbr_material(
        "Mat_Eye", 0xFFEE00, roughness=0.12, metallic=0.2, emission_hex=0xFFCC00, emission_strength=3.5
    )

    body = PartBuilder("Body", (0, 1.95, 0), subsurf_levels=1)
    body.add_box(mat_skin, (0, 1.98, 0), (0.94, 0.78, 1.56), bevel=0.08, taper_front=1.08)
    body.add_box(mat_accent, (0, 1.62, 0.04), (0.74, 0.22, 1.42), bevel=0.04)
    body.add_crystal(mat_magma, (0, 1.78, 0.78), (0.22, 0.26, 0.12))
    # Dorsal ridge spines
    for i in range(5):
        body.add_cone(
            mat_bone,
            (0, 2.48, 0.55 - i * 0.30),
            r_bottom=0.07,
            r_top=0.01,
            height=0.28,
            rot=(-0.35, 0, 0),
        )
    body.build_object()

    head = PartBuilder("Head", (0, 2.48, 0.88), parent_part=body, subsurf_levels=1)
    head.add_curved_tube(
        mat_skin, (0, 2.18, 0.66), (0, 2.42, 0.86), (0, 2.62, 1.04), r0=0.30, r1=0.22
    )
    head.add_box(mat_skin, (0, 2.62, 1.24), (0.50, 0.38, 0.68), bevel=0.05, taper_front=0.72)
    # 4 Royal Swept Dragon Horns
    for side in (-1, 1):
        head.add_curved_tube(
            mat_bone,
            (side * 0.18, 2.78, 1.04),
            (side * 0.32, 3.02, 0.76),
            (side * 0.42, 3.26, 0.44),
            r0=0.075,
            r1=0.012,
        )
        head.add_curved_tube(
            mat_bone,
            (side * 0.22, 2.66, 1.00),
            (side * 0.42, 2.76, 0.78),
            (side * 0.54, 2.88, 0.54),
            r0=0.055,
            r1=0.010,
        )
        head.add_ellipsoid(mat_eye, (side * 0.18, 2.68, 1.38), (0.06, 0.05, 0.06))
    head.build_object()

    # Massive Ribbed Membrane Dragon Wings (`LeftWing` / `RightWing`)
    for name, side in (("LeftWing", -1), ("RightWing", 1)):
        wing = PartBuilder(name, (side * 0.28, 2.24, -0.06), parent_part=body, subsurf_levels=1)
        wing.add_box(mat_bone, (side * 1.18, 2.28, 0.18), (1.92, 0.10, 0.12), bevel=0.02)
        wing.add_box(mat_skin, (side * 1.15, 2.24, -0.14), (1.86, 0.055, 0.68), bevel=0.015)
        for rib in range(3):
            rx = side * (0.65 + rib * 0.52)
            wing.add_box(
                mat_accent,
                (rx, 2.25, -0.14),
                (0.06, 0.08, 0.66),
                rot=(0, side * 0.15, 0),
                bevel=0.01,
            )
        wing.build_object()

    tail = PartBuilder("Tail", (0, 1.98, -0.78), parent_part=body, subsurf_levels=1)
    tail.add_curved_tube(
        mat_skin, (0, 1.98, -0.78), (0, 1.72, -1.48), (0, 1.88, -2.18), r0=0.26, r1=0.04
    )
    tail.add_crystal(mat_bone, (0, 1.88, -2.24), (0.16, 0.08, 0.24))
    tail.build_object()

    for name, side in (("LeftArm", -1), ("RightArm", 1)):
        arm = PartBuilder(name, (side * 0.48, 1.72, 0.45), parent_part=body, subsurf_levels=1)
        arm.add_box(mat_skin, (side * 0.48, 1.46, 0.48), (0.22, 0.50, 0.22), bevel=0.03)
        arm.build_object()

    for name, side in (("LeftLeg", -1), ("RightLeg", 1)):
        leg = PartBuilder(name, (side * 0.36, 1.60, -0.35), subsurf_levels=1)
        leg.add_box(mat_skin, (side * 0.36, 1.26, -0.35), (0.28, 0.66, 0.28), bevel=0.04)
        leg.build_object()

    return export_current_model_glb("dragon.glb")


# ==============================================================================
# 10. ABYSSAL WALKING SHARK (`shark.glb`)
# ==============================================================================
def build_shark():
    clear_scene()
    mat_skin = create_pbr_material("Mat_Skin", 0x2C5282, roughness=0.32, metallic=0.18)
    mat_accent = create_pbr_material("Mat_Accent", 0x90CDF4, roughness=0.40, metallic=0.12)
    mat_biolume = create_pbr_material(
        "Mat_Biolume", 0x00E5FF, roughness=0.15, metallic=0.35, emission_hex=0x00B4D8, emission_strength=2.8
    )
    mat_bone = create_pbr_material("Mat_Bone", 0xF4F1EA, roughness=0.30, metallic=0.10)
    mat_eye = create_pbr_material(
        "Mat_Eye", 0x00FFFF, roughness=0.12, metallic=0.2, emission_hex=0x00E5FF, emission_strength=3.2
    )

    body = PartBuilder("Body", (0, 0.86, 0), subsurf_levels=1)
    # Hydrodynamic torpedo shark fuselage + countershaded pale belly + tall dorsal fin
    body.add_ellipsoid(mat_skin, (0, 0.88, 0), (0.42, 0.34, 0.88))
    body.add_ellipsoid(mat_accent, (0, 0.70, 0.04), (0.36, 0.16, 0.78))
    body.add_cone(
        mat_skin,
        (0, 1.44, -0.06),
        r_bottom=0.26,
        r_top=0.02,
        height=0.72,
        rot=(-0.28, 0, 0),
        scale_xz=(0.32, 1.35),
    )
    body.add_box(mat_biolume, (0, 1.42, -0.24), (0.04, 0.56, 0.06), rot=(-0.28, 0, 0), bevel=0.01)
    body.build_object()

    head = PartBuilder("Head", (0, 0.92, 0.78), parent_part=body, subsurf_levels=1)
    head.add_cone(
        mat_skin,
        (0, 0.98, 1.12),
        r_bottom=0.36,
        r_top=0.04,
        height=0.72,
        rot=(math.pi * 0.5, 0, 0),
        segs=8,
        scale_xz=(1.05, 0.78),
    )
    head.add_box(mat_accent, (0, 0.76, 1.02), (0.40, 0.14, 0.48), rot=(0.24, 0, 0), bevel=0.025)
    for t in range(-2, 3):
        head.add_cone(
            mat_bone,
            (t * 0.075, 0.88, 1.18),
            r_bottom=0.032,
            r_top=0.004,
            height=0.11,
            rot=(math.pi, 0, 0),
        )
    for side in (-1, 1):
        head.add_ellipsoid(mat_eye, (side * 0.20, 1.02, 0.96), (0.05, 0.045, 0.05))
    head.build_object()

    tail = PartBuilder("Tail", (0, 0.90, -0.78), parent_part=body, subsurf_levels=1)
    tail.add_cone(
        mat_skin,
        (0, 0.90, -1.08),
        r_bottom=0.25,
        r_top=0.08,
        height=0.66,
        rot=(-math.pi * 0.5, 0, 0),
    )
    tail.add_box(mat_skin, (0, 0.98, -1.44), (0.08, 0.82, 0.36), rot=(0.26, 0, 0), bevel=0.02)
    tail.add_box(mat_biolume, (0, 0.98, -1.58), (0.04, 0.76, 0.08), rot=(0.26, 0, 0), bevel=0.01)
    tail.build_object()

    # Pectoral fins + Muscular Clawed Amphibious Forelegs
    for name, leg_child_name, side in (
        ("LeftArm", "AmphibiousLeg_FL", -1),
        ("RightArm", "AmphibiousLeg_FR", 1),
    ):
        arm = PartBuilder(name, (side * 0.38, 0.78, 0.32), parent_part=body, subsurf_levels=1)
        arm.add_box(
            mat_skin,
            (side * 0.64, 0.74, 0.32),
            (0.54, 0.08, 0.34),
            rot=(0, 0, -side * 0.25),
            bevel=0.015,
        )
        arm.build_object()

        fleg = PartBuilder(leg_child_name, (side * 0.44, 0.72, 0.32), parent_part=arm, subsurf_levels=1)
        fleg.add_box(mat_skin, (side * 0.44, 0.38, 0.32), (0.22, 0.64, 0.24), bevel=0.03)
        fleg.add_box(mat_accent, (side * 0.44, 0.06, 0.40), (0.26, 0.12, 0.34), bevel=0.02)
        fleg.add_box(mat_biolume, (side * 0.56, 0.38, 0.22), (0.05, 0.38, 0.14), bevel=0.01)
        fleg.build_object()

    # Muscular Clawed Amphibious Hind Legs
    for name, side in (("LeftLeg", -1), ("RightLeg", 1)):
        leg = PartBuilder(name, (side * 0.32, 0.72, -0.36), subsurf_levels=1)
        leg.add_box(mat_skin, (side * 0.32, 0.38, -0.36), (0.26, 0.70, 0.28), bevel=0.035)
        leg.add_box(mat_accent, (side * 0.32, 0.06, -0.28), (0.26, 0.12, 0.34), bevel=0.02)
        leg.add_box(mat_biolume, (side * 0.46, 0.38, -0.44), (0.05, 0.42, 0.14), bevel=0.01)
        leg.build_object()

    return export_current_model_glb("shark.glb")


# ==============================================================================
# 11. GIANT BURROWING MOLE (`giant_mole.glb`)
# ==============================================================================
def build_giant_mole():
    clear_scene()
    mat_skin = create_pbr_material("Mat_Skin", 0x5D4037, roughness=0.65, metallic=0.14)
    mat_accent = create_pbr_material("Mat_Accent", 0xF48FB1, roughness=0.48, metallic=0.05)
    mat_dark = create_pbr_material("Mat_Dark", 0x332621, roughness=0.58, metallic=0.28)
    mat_amber = create_pbr_material(
        "Mat_Amber", 0xFFAE00, roughness=0.18, metallic=0.35, emission_hex=0xFF8800, emission_strength=2.6
    )
    mat_bone = create_pbr_material("Mat_Bone", 0xD8DEE9, roughness=0.28, metallic=0.68)
    mat_eye = create_pbr_material(
        "Mat_Eye", 0xFFCC44, roughness=0.15, metallic=0.2, emission_hex=0xFFAA00, emission_strength=2.4
    )

    body = PartBuilder("Body", (0, 0.82, 0), subsurf_levels=1)
    body.add_ellipsoid(mat_skin, (0, 0.84, 0), (0.62, 0.52, 0.78))
    # Armored back plates + glowing amber back crystals
    for i in range(3):
        body.add_box(mat_dark, (0, 1.28 - i * 0.05, 0.15 - i * 0.28), (0.72, 0.14, 0.26), bevel=0.03)
        body.add_crystal(
            mat_amber,
            ((i - 1) * 0.22, 1.42, 0.10 - i * 0.24),
            (0.09, 0.22, 0.09),
            rot=(-0.25, 0, (i - 1) * 0.25),
        )
    body.build_object()

    head = PartBuilder("Head", (0, 0.94, 0.66), parent_part=body, subsurf_levels=1)
    head.add_box(mat_skin, (0, 0.94, 0.74), (0.48, 0.42, 0.48), bevel=0.05)
    head.add_cone(
        mat_accent,
        (0, 0.90, 1.06),
        r_bottom=0.22,
        r_top=0.12,
        height=0.38,
        rot=(math.pi * 0.5, 0, 0),
        segs=10,
    )
    # 10 Star-Nose pink sensory tentacles
    for s in range(10):
        ang = (s / 10.0) * math.tau
        cx = math.cos(ang) * 0.14
        cy = 0.90 + math.sin(ang) * 0.14
        head.add_curved_tube(
            mat_accent,
            (cx * 0.7, cy, 1.20),
            (cx * 1.25, cy + math.sin(ang) * 0.06, 1.30),
            (cx * 1.55, cy + math.sin(ang) * 0.10, 1.24),
            r0=0.032,
            r1=0.010,
        )
    for side in (-1, 1):
        head.add_ellipsoid(mat_eye, (side * 0.16, 1.04, 0.92), (0.038, 0.035, 0.038))
    head.build_object()

    # Huge Front Excavator Claws (`LeftArm` / `RightArm`)
    for name, side in (("LeftArm", -1), ("RightArm", 1)):
        arm = PartBuilder(name, (side * 0.56, 0.86, 0.28), parent_part=body, subsurf_levels=1)
        arm.add_box(mat_skin, (side * 0.62, 0.68, 0.36), (0.28, 0.44, 0.32), bevel=0.04)
        for c in range(-1, 2):
            arm.add_curved_tube(
                mat_bone,
                (side * 0.62 + c * 0.08, 0.52, 0.46),
                (side * 0.62 + c * 0.09, 0.44, 0.72),
                (side * 0.62 + c * 0.09, 0.28, 0.88),
                r0=0.055,
                r1=0.012,
            )
        arm.build_object()

    tail = PartBuilder("Tail", (0, 0.76, -0.72), parent_part=body, subsurf_levels=1)
    tail.add_cone(
        mat_accent,
        (0, 0.72, -0.88),
        r_bottom=0.09,
        r_top=0.04,
        height=0.34,
        rot=(-math.pi * 0.42, 0, 0),
    )
    tail.build_object()

    for name, side in (("LeftLeg", -1), ("RightLeg", 1)):
        leg = PartBuilder(name, (side * 0.28, 0.52, -0.32), subsurf_levels=1)
        leg.add_box(mat_skin, (side * 0.28, 0.26, -0.32), (0.24, 0.52, 0.26), bevel=0.03)
        leg.build_object()

    return export_current_model_glb("giant_mole.glb")


# ==============================================================================
# 12. SYLVAN DEER / STAG (`deer.glb`)
# ==============================================================================
def build_deer():
    clear_scene()
    mat_skin = create_pbr_material("Mat_Skin", 0xB87333, roughness=0.52, metallic=0.06)
    mat_accent = create_pbr_material("Mat_Accent", 0xF5E6D3, roughness=0.50, metallic=0.05)
    mat_bone = create_pbr_material("Mat_Bone", 0xE8E2D2, roughness=0.35, metallic=0.10)
    mat_biolume = create_pbr_material(
        "Mat_Biolume", 0x2EC4B6, roughness=0.18, metallic=0.3, emission_hex=0x10B981, emission_strength=3.0
    )
    mat_eye = create_pbr_material(
        "Mat_Eye", 0x1B263B, roughness=0.15, metallic=0.2, emission_hex=0x2EC4B6, emission_strength=1.2
    )

    body = PartBuilder("Body", (0, 0.92, 0), subsurf_levels=1)
    body.add_box(mat_skin, (0, 0.94, 0), (0.46, 0.46, 1.12), bevel=0.06, taper_front=0.92)
    body.add_box(mat_accent, (0, 0.72, 0), (0.40, 0.10, 1.04), bevel=0.02)
    for sx, sy, sz in (
        (-0.22, 1.06, -0.14),
        (0.22, 1.06, -0.14),
        (-0.21, 1.02, -0.38),
        (0.21, 1.02, -0.38),
    ):
        body.add_ellipsoid(mat_accent, (sx, sy, sz), (0.045, 0.055, 0.065))
    body.build_object()

    head = PartBuilder("Head", (0, 1.38, 0.54), parent_part=body, subsurf_levels=1)
    head.add_curved_tube(
        mat_skin, (0, 1.12, 0.42), (0, 1.32, 0.50), (0, 1.52, 0.56), r0=0.16, r1=0.12
    )
    head.add_box(mat_skin, (0, 1.54, 0.62), (0.28, 0.26, 0.36), bevel=0.04)
    head.add_box(mat_accent, (0, 1.48, 0.86), (0.18, 0.16, 0.26), bevel=0.025, taper_front=0.72)
    # Branching Antlers + Bioluminescent Emerald Buds
    for side in (-1, 1):
        head.add_curved_tube(
            mat_bone,
            (side * 0.10, 1.66, 0.56),
            (side * 0.28, 1.92, 0.48),
            (side * 0.36, 2.22, 0.58),
            r0=0.036,
            r1=0.012,
        )
        head.add_curved_tube(
            mat_bone,
            (side * 0.22, 1.88, 0.52),
            (side * 0.38, 2.02, 0.68),
            (side * 0.44, 2.16, 0.78),
            r0=0.026,
            r1=0.010,
        )
        head.add_crystal(mat_biolume, (side * 0.36, 2.24, 0.58), (0.045, 0.07, 0.045))
        head.add_crystal(mat_biolume, (side * 0.44, 2.18, 0.78), (0.04, 0.06, 0.04))
        head.add_ellipsoid(mat_eye, (side * 0.13, 1.56, 0.72), (0.038, 0.038, 0.038))
    head.build_object()

    tail = PartBuilder("Tail", (0, 1.08, -0.56), parent_part=body, subsurf_levels=1)
    tail.add_cone(
        mat_accent,
        (0, 1.12, -0.66),
        r_bottom=0.09,
        r_top=0.02,
        height=0.26,
        rot=(-math.pi * 0.28, 0, 0),
    )
    tail.build_object()

    for name, side in (("LeftArm", -1), ("RightArm", 1)):
        fl = PartBuilder(name, (side * 0.18, 0.84, 0.40), parent_part=body, subsurf_levels=1)
        fl.add_box(mat_skin, (side * 0.18, 0.42, 0.40), (0.12, 0.84, 0.12), bevel=0.02, taper_bottom=0.72)
        fl.build_object()

    for name, side in (("LeftLeg", -1), ("RightLeg", 1)):
        bl = PartBuilder(name, (side * 0.18, 0.84, -0.40), subsurf_levels=1)
        bl.add_box(mat_skin, (side * 0.18, 0.42, -0.40), (0.13, 0.84, 0.13), bevel=0.02, taper_bottom=0.72)
        bl.build_object()

    return export_current_model_glb("deer.glb")


# ==============================================================================
# 13. MEADOW RABBIT (`rabbit.glb`)
# ==============================================================================
def build_rabbit():
    clear_scene()
    mat_skin = create_pbr_material("Mat_Skin", 0xE8E4D9, roughness=0.55, metallic=0.04)
    mat_accent = create_pbr_material("Mat_Accent", 0xFFB6C1, roughness=0.45, metallic=0.05)
    mat_bone = create_pbr_material("Mat_Bone", 0xFFFFFF, roughness=0.60, metallic=0.02)
    mat_eye = create_pbr_material(
        "Mat_Eye", 0x22252A, roughness=0.12, metallic=0.2, emission_hex=0xFFB6C1, emission_strength=0.4
    )

    body = PartBuilder("Body", (0, 0.46, 0), subsurf_levels=1)
    body.add_ellipsoid(mat_skin, (0, 0.46, 0), (0.30, 0.28, 0.40))
    body.add_ellipsoid(mat_bone, (0, 0.44, 0.28), (0.22, 0.20, 0.18))
    body.build_object()

    head = PartBuilder("Head", (0, 0.68, 0.34), parent_part=body, subsurf_levels=1)
    head.add_ellipsoid(mat_skin, (0, 0.72, 0.38), (0.22, 0.20, 0.22))
    head.add_ellipsoid(mat_accent, (0, 0.72, 0.59), (0.05, 0.045, 0.05))
    # Very long upright rabbit ears with pink inner channels
    for side in (-1, 1):
        head.add_box(
            mat_skin,
            (side * 0.09, 1.10, 0.34),
            (0.085, 0.50, 0.05),
            rot=(-0.08, 0, -side * 0.14),
            bevel=0.02,
            taper_top=0.55,
        )
        head.add_box(
            mat_accent,
            (side * 0.09, 1.09, 0.365),
            (0.048, 0.40, 0.03),
            rot=(-0.08, 0, -side * 0.14),
            bevel=0.01,
            taper_top=0.55,
        )
        head.add_ellipsoid(mat_eye, (side * 0.12, 0.76, 0.52), (0.038, 0.038, 0.038))
    head.build_object()

    tail = PartBuilder("Tail", (0, 0.52, -0.38), parent_part=body, subsurf_levels=1)
    tail.add_ellipsoid(mat_bone, (0, 0.52, -0.44), (0.14, 0.14, 0.14))
    tail.build_object()

    for name, side in (("LeftArm", -1), ("RightArm", 1)):
        fl = PartBuilder(name, (side * 0.14, 0.34, 0.22), parent_part=body, subsurf_levels=1)
        fl.add_box(mat_skin, (side * 0.14, 0.17, 0.22), (0.10, 0.34, 0.10), bevel=0.02)
        fl.build_object()

    for name, side in (("LeftLeg", -1), ("RightLeg", 1)):
        bl = PartBuilder(name, (side * 0.18, 0.38, -0.20), subsurf_levels=1)
        bl.add_box(mat_skin, (side * 0.18, 0.18, -0.16), (0.13, 0.36, 0.24), bevel=0.025)
        bl.build_object()

    return export_current_model_glb("rabbit.glb")


# ==============================================================================
# 14. BASTION EDEN RELIC MONOLITH (`bastion_monolith.glb`)
# ==============================================================================
def build_bastion_monolith():
    clear_scene()
    mat_obsidian = create_pbr_material("Mat_Obsidian", 0x1A222D, roughness=0.32, metallic=0.60)
    mat_gold = create_pbr_material(
        "Mat_Gold", 0xFFD166, roughness=0.22, metallic=0.90, emission_hex=0xB37700, emission_strength=0.65
    )
    mat_crystal = create_pbr_material(
        "Mat_Crystal", 0x00E5FF, roughness=0.10, metallic=0.85, emission_hex=0x00D8FF, emission_strength=3.5
    )

    body = PartBuilder("Body", (0, 0, 0), subsurf_levels=1)
    # Stepped hexagonal obsidian plinth + golden rune trim
    body.add_cone(mat_obsidian, (0, 0.35, 0), r_bottom=2.15, r_top=1.75, height=0.70, segs=8)
    body.add_cone(mat_gold, (0, 0.76, 0), r_bottom=1.78, r_top=1.62, height=0.14, segs=8)
    body.add_cone(mat_obsidian, (0, 1.00, 0), r_bottom=1.55, r_top=1.35, height=0.36, segs=8)
    # Twin Twisted Runic Arch Pillars curving over the central Relic Crystal
    for side in (-1, 1):
        body.add_curved_tube(
            mat_obsidian,
            (side * 1.45, 0.85, 0),
            (side * 1.85, 2.65, side * 0.35),
            (side * 0.35, 4.35, 0),
            r0=0.28,
            r1=0.14,
            rings=14,
            segs=8,
        )
        body.add_torus(
            mat_gold,
            (side * 1.55, 1.95, side * 0.16),
            major_r=0.28,
            minor_r=0.04,
            rot=(0, 0, side * 0.25),
        )
        body.add_torus(
            mat_gold,
            (side * 1.35, 3.15, side * 0.22),
            major_r=0.24,
            minor_r=0.035,
            rot=(0, 0, -side * 0.35),
        )
    body.build_object()

    # Central Levitating Octahedral Relic Core Crystal (`Head`)
    head = PartBuilder("Head", (0, 2.85, 0), parent_part=body, subsurf_levels=0)
    head.add_crystal(mat_crystal, (0, 2.85, 0), (0.72, 1.15, 0.72), bevel=0.025)
    for i in range(4):
        ang = (i / 4.0) * math.tau
        head.add_crystal(
            mat_gold,
            (math.cos(ang) * 0.95, 2.85, math.sin(ang) * 0.95),
            (0.12, 0.24, 0.12),
        )
    head.build_object()

    # Orbiting Golden Celestial Astrolabe Rings (`Tail`)
    tail = PartBuilder("Tail", (0, 2.85, 0), parent_part=body, subsurf_levels=0)
    tail.add_torus(mat_gold, (0, 2.85, 0), major_r=1.42, minor_r=0.055, rot=(math.pi / 3.0, 0, 0))
    tail.add_torus(mat_gold, (0, 2.85, 0), major_r=1.24, minor_r=0.042, rot=(-math.pi / 3.0, 0, 0.45))
    tail.build_object()

    return export_current_model_glb("bastion_monolith.glb")


# ==============================================================================
# 15. STUDIO SHOWCASE SCENE ASSEMBLY FOR SCREENSHOT (`blender_showcase.png`)
# ==============================================================================
def build_showcase_gallery_scene(exported_paths):
    """Imports all 14 exported `.glb` models into a two-row gallery with camera & lighting for viewport capture."""
    clear_scene()

    # Gallery floor plinth + raised back-row gallery tier
    mat_floor = create_pbr_material("ShowcaseFloor", 0x141B24, roughness=0.35, metallic=0.45)
    floor_builder = PartBuilder("ShowcasePlinth", (0, -0.1, 0), subsurf_levels=0)
    floor_builder.add_box(mat_floor, (0, -0.15, -2.5), (24.0, 0.3, 14.0), bevel=0.05)
    floor_builder.add_box(mat_floor, (0, 0.55, -5.0), (22.0, 1.4, 4.5), bevel=0.05)
    floor_builder.build_object()

    # Import all 14 GLBs and arrange them in 2 crescent rows facing camera (-Y in Blender)
    positions = [
        # Front row (7 hero/creatures)
        (-7.2, 1.8, 0.0),
        (-4.8, 1.4, 0.0),
        (-2.4, 1.1, 0.0),
        (0.0, 0.8, 0.0),   # Hero Guardian center front
        (2.4, 1.1, 0.0),
        (4.8, 1.4, 0.0),
        (7.2, 1.8, 0.0),
        # Back row on raised tier (7 large/apex creatures & monolith)
        (-8.2, 4.8, 1.25),
        (-5.5, 4.6, 1.25),
        (-2.8, 4.4, 1.25),
        (0.0, 5.2, 1.25),   # Bastion Monolith center back
        (2.8, 4.4, 1.25),
        (5.5, 4.6, 1.25),
        (8.2, 4.8, 1.25),
    ]
    # Reorder so Hero Guardian is at index 3 (center front) and Bastion Monolith is at index 10 (center back)
    ordered = [
        "npc_survivor.glb",
        "goblin.glb",
        "orc.glb",
        "hero_guardian.glb",
        "wolf.glb",
        "lion.glb",
        "shark.glb",
        "rabbit.glb",
        "deer.glb",
        "giant_mole.glb",
        "bastion_monolith.glb",
        "troll.glb",
        "vulture.glb",
        "dragon.glb",
    ]

    if bpy.app.background or not bpy.context.window_manager.windows:
        return

    win = bpy.context.window_manager.windows[0]
    area = next((a for a in win.screen.areas if a.type == "VIEW_3D"), win.screen.areas[0])

    for idx, fname in enumerate(ordered):
        fpath = os.path.join(OUTPUT_DIR, fname)
        if not os.path.exists(fpath):
            continue
        before = set(bpy.data.objects)
        with bpy.context.temp_override(window=win, screen=win.screen, area=area, view_layer=bpy.context.view_layer):
            bpy.ops.import_scene.gltf(filepath=fpath)
        added = [o for o in bpy.data.objects if o not in before]
        roots = [o for o in added if o.parent is None]
        gx, gy, gz = positions[idx]
        for r in roots:
            r.location.x += gx
            r.location.y += gy
            r.location.z += gz

    # Add Sun & Area lights for showcase preview
    light_data = bpy.data.lights.new(name="ShowcaseKeyLight", type="SUN")
    light_data.energy = 3.5
    light_obj = bpy.data.objects.new(name="ShowcaseKeyLight", object_data=light_data)
    light_obj.location = (6.0, -8.0, 10.0)
    light_obj.rotation_euler = (math.radians(48), math.radians(15), math.radians(25))
    bpy.context.scene.collection.objects.link(light_obj)

    # Position Camera and align 3D viewport to camera in MATERIAL preview
    cam_data = bpy.data.cameras.new(name="ShowcaseCamera")
    cam_data.lens = 36.0
    cam_obj = bpy.data.objects.new(name="ShowcaseCamera", object_data=cam_data)
    cam_obj.location = (0.0, -13.5, 6.2)
    direction = mathutils.Vector((0.0, 2.2, 1.6)) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    for window in bpy.context.window_manager.windows:
        for a in window.screen.areas:
            if a.type == "VIEW_3D":
                for space in a.spaces:
                    if space.type == "VIEW_3D":
                        space.region_3d.view_perspective = "CAMERA"
                        space.shading.type = "MATERIAL"


def main():
    builders = [
        build_hero_guardian,
        build_npc_survivor,
        build_goblin,
        build_orc,
        build_troll,
        build_wolf,
        build_lion,
        build_vulture,
        build_dragon,
        build_shark,
        build_giant_mole,
        build_deer,
        build_rabbit,
        build_bastion_monolith,
    ]
    exported = []
    for fn in builders:
        exported.append(fn())

    build_showcase_gallery_scene(exported)
    print(f"[BlenderGen] SUCCESS: Generated all {len(exported)} GLB models in {OUTPUT_DIR}")


try:
    main()
except Exception:
    traceback.print_exc(file=sys.stderr)
    raise

