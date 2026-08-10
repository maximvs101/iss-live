# The 3D model

The model on display is NASA's **(D) IGOAL** model (`github.com/nasa/NASA-3D-Resources`, free of
copyright), and it is current: deployed IROSA arrays, Bishop airlock, Bartolomeo platform,
Canadarm2.

It is not usable as published — 91.4 MB — but for an unexpected reason: **63.8 MB of duplicated
textures**, every image stored both as WebP and as a PNG fallback. `npm run build:model` removes
them (4 MB remain), caps texture resolution, welds and simplifies the geometry, then recompresses
with Draco: **14.9 MB**, without losing a single one of the 580 named nodes.

That structure is what makes the model valuable. Its joints carry mission control designations and
map one-to-one onto the subscribed symbols:

| Model node | Symbol | Joint |
|---|---|---|
| `PORT_ALPHA_ROT` / `STBD_ALPHA_ROT` | `S0000004` / `S0000003` | alpha joints (SARJ) |
| `PORT_BETA_ROT_2A`…`_4B` | `P4000007`, `P4000008`, `P6000008`, `P6000007` | 4 port BGAs |
| `STBD_BETA_ROT_1A`…`_3B` | `S4000007`, `S4000008`, `S6000008`, `S6000007` | 4 starboard BGAs |
| `PORT_TRRJ_GAMMA_ROT` / `STBD_TRRJ_GAMMA_ROT` | `S0000002` / `S0000001` | gamma joints (radiators) |

### Parts follow NASA's assembly list

The breakdown matches NASA's own assembly-element nomenclature and the 2023 blowout diagram: the
model's 41 top-level elements are claimed **by exact node name**, one per element. Every truss
segment (S0 through S6, P1 through P6, Z1), every stowage platform (ESP-1/2/3, ELC-1/2/3/4), every
mating adapter (PMA-1/2/3) and every robotic element (Canadarm2, Dextre, Mobile Transporter) is its
own part — 62 in total, against 36 before.

That exactness matters. Matching name *prefixes* instead, as an earlier version did, lets one
element absorb its neighbours: a module's handrails and antennas would attach to whichever ancestor
happened to match first. `npm run verify:model` now checks four failure modes — a joint whose node
is missing, a top-level element the mapping never claims, a geometry node no rule reaches, and a
material shared between unrelated parts.

### Kibo could be seen through, and the model said so

The source file marks **19 of its 49 materials `alphaMode: BLEND` with a base colour alpha of
exactly 1** — the signature of a Blender export left on its default blend mode. three.js honours
that by setting `transparent: true`, which pulls those meshes out of ordinary depth sorting into
the transparent pass, where they are ordered by object centre. Nested geometry then draws in the
wrong order and the module appears see-through. This comes from NASA's file, not from the
reduction pipeline: the source declares it too.

It cannot be corrected blindly, because some of those textures do use their alpha channel.
`npm run fix:alpha` decodes each base colour texture and decides — but *counting* graded pixels
turns out to be the wrong test, and it took three attempts to find the right one:

1. **Share of graded pixels.** Fails: WebP's lossy encoding scatters values like 253 across flat
   opaque areas, so every texture looks slightly translucent.
2. **Position** — is a graded pixel adjacent to a fully transparent one? Better: that separates
   antialiasing along an atlas island from an interior region. Still fails, because the same
   compression noise sits in interiors too, and this criterion *regressed* four materials from
   MASK back to BLEND.
3. **Position, depth and clustering.** A pixel counts as deliberately translucent only if it
   touches no transparent neighbour, sits below alpha 200, and belongs to a connected run of at
   least 100 such pixels. Noise is scattered; a surface meant to be seen through is contiguous.

That last test separates cases a histogram cannot:

| Material | deep pixels | largest run | Verdict |
|---|---|---|---|
| Node.Cupola | 54,971 | **9,705** | BLEND — those are its windows |
| Truss | 1,413 | **394** | BLEND — genuinely translucent regions |
| IROSA | 3,221 | **16** | MASK — scattered singletons, pure noise |
| JEM_PM | 0 | 0 | OPAQUE — nothing transparent at all |

Kibo was the clearest case and the reported one: `JEM_PM` has **no transparent pixel whatsoever**,
99.7 % of it fully opaque, the rest compression artefacts. The truss and IROSA look alike in a
histogram — a few thousand graded pixels each — and are opposite in nature.

Final state: **29 opaque, 7 masked, 6 blended**. The script is idempotent, runs at the end of
`build:model`, and `verify:model` fails if a rebuild drops the correction.

### The highlight bled across the whole station, and the mapping was innocent

Hovering Zvezda lit up most of the ISS, which looks exactly like the prefix bug above. It was not.
The file carries **42 materials for 506 meshes**, and `MLI.Generic` alone is used by **47 of the
62 parts**. Highlighting works by tinting a material, and `Object3D.clone()` shares materials
rather than copying them — so tinting one module tinted every module drawn with the same material.

The first three checks all passed at 100 % throughout, because nothing was wrong with the mapping.
`IssGltf` now gives each mesh its own material copy (textures stay shared, so this costs 506 small
objects and no image memory, and the draw-call count is unchanged since the meshes were already
separate), and the fourth check fails the build if that clone is ever removed.

It also caught a mislabelling worth knowing about: `Payload_CMG1` and `Payload_CMG2` are *spare*
control moment gyroscopes stowed on the ELC platforms, not the four operational ones — those sit
inside the Z1 truss and are not modelled separately.

The NASA model is the only model. An earlier version kept a schematic station built in code as a
stand-in during loading, but a placeholder is hard to tell from the real thing at a glance, and it
was a second copy of the joint and selection logic to keep in step — the two had already drifted
apart once. The view now reports the load honestly, with progress and a distinct message for the
decoding phase the loader cannot measure, and says so plainly if the file fails.

The Draco decoder is served by the application (`public/draco/`) rather than by a CDN, so the
station stays displayable without depending on a third party.
