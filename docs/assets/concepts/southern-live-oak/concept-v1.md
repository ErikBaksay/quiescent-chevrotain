# Southern Live Oak — Concept V1

## Intent

The first vegetation asset is a mature Southern live oak (`Quercus virginiana`) supplied as three production silhouettes:

1. **Courtyard** — balanced, tall, and broadly spreading.
2. **Windswept** — strongly asymmetric with visible twisting structure.
3. **Low spreading** — a lower crown with long, powerful lateral limbs.

All three variants target approximately 14–18 m in height and 20–28 m in crown width. They deliberately omit Spanish moss so the first asset remains broadly usable and the foliage-card silhouette stays readable.

## Approval image

`concept-v1.png` is a shape and realism reference. It is not a runtime texture and its neutral studio illumination must not be baked into the production materials.

The concept was generated with the built-in image-generation tool using the following production brief:

```text
Use case: photorealistic-natural
Asset type: production concept sheet for a realistic 3D world-building game tree
Primary request: three distinct mature Southern live oak production silhouettes
Variants: balanced broad courtyard oak; asymmetric windswept oak; lower and wider oak with powerful lateral limbs
Dimensions: approximately 14–18 m tall and 20–28 m across
Lighting: soft diffuse neutral studio illumination with no dramatic directional sunlight
Materials: deeply furrowed gray-brown bark and restrained evergreen foliage
Constraints: complete uncropped trees, realistic branch taper, porous crowns, no Spanish moss, text, props, or fantasy forms
```

## Source material

- `source/foliage-chroma-v1.png` is the generated flat-magenta foliage source.
- `source/foliage-alpha-v1.png` is the locally extracted RGBA version intended for atlas preparation.
- `source/bark-source-v1.png` is the generated flat-lit bark source intended for later de-lighting, repeat cleanup, and PBR-map authoring.

The foliage sheet was generated as twelve isolated elements: four leaves, four twig tips, and four larger branchlet clusters. The key-removal helper sampled `#fa03f9`; 1,250,856 of 1,572,864 pixels became fully transparent and 21,668 retained partial edge alpha.

Neither source image is runtime-ready. Modeling must not begin until the silhouette concept is approved. After approval, the foliage source will be tightened into an atlas, the bark source will be made repeat-safe and de-lit, and all normal/roughness data will be authored or baked rather than inferred from the concept lighting.

## Approval criteria

- The three forms are distinct enough to disguise repetition at large counts.
- Each silhouette reads as a mature Southern live oak rather than a generic round deciduous tree.
- The balance of visible branching and foliage density matches the intended realistic game style.
- The low-spreading variant is desirable despite requiring more placement clearance than the other forms.
- Excluding Spanish moss is acceptable for the first production version.
