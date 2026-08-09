import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ARTIFACT_ROOT = path.join(PROJECT_ROOT, '.artifacts/blender/mature-broadleaf-tree');
const SOURCE_GLB = path.join(PROJECT_ROOT, 'public/assets/models/mature-broadleaf-tree/model.glb');
const FOLIAGE_ATLAS = path.join(
  PROJECT_ROOT,
  'docs/assets/concepts/mature-broadleaf-tree/source/foliage-atlas-v2.png',
);
const BARK_ATLAS = path.join(
  PROJECT_ROOT,
  'docs/assets/concepts/mature-broadleaf-tree/source/bark-warm-v2.png',
);
const IMPOSTOR_ATLAS = path.join(
  PROJECT_ROOT,
  'docs/assets/concepts/mature-broadleaf-tree/source/broadleaf-impostor-atlas-v2.png',
);
const IMPOSTOR_NORMAL_ATLAS = path.join(
  PROJECT_ROOT,
  'docs/assets/concepts/mature-broadleaf-tree/source/broadleaf-impostor-normal-v2.png',
);

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const COMPONENT_BYTES = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };

function align4(value) {
  return (value + 3) & ~3;
}

function readGlb(data) {
  if (data.toString('ascii', 0, 4) !== 'glTF') throw new Error('Source is not a GLB.');
  const jsonLength = data.readUInt32LE(12);
  const json = JSON.parse(data.toString('utf8', 20, 20 + jsonLength));
  const binHeader = 20 + jsonLength;
  const binLength = data.readUInt32LE(binHeader);
  return { json, bin: data.subarray(binHeader + 8, binHeader + 8 + binLength) };
}

function accessorValues(document, bin, accessorIndex) {
  const accessor = document.accessors[accessorIndex];
  const view = document.bufferViews[accessor.bufferView];
  const components = COMPONENTS[accessor.type];
  const bytes = COMPONENT_BYTES[accessor.componentType];
  const stride = view.byteStride ?? components * bytes;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = [];
  for (let index = 0; index < accessor.count; index += 1) {
    const row = [];
    const offset = start + index * stride;
    for (let component = 0; component < components; component += 1) {
      const at = offset + component * bytes;
      row.push(
        accessor.componentType === 5126
          ? bin.readFloatLE(at)
          : accessor.componentType === 5125
            ? bin.readUInt32LE(at)
            : accessor.componentType === 5123
              ? bin.readUInt16LE(at)
              : bin[at],
      );
    }
    values.push(row);
  }
  return values;
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function rotateAroundY(position, center, angle, scale, offset) {
  const local = sub(position, center);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return add(
    [
      (local[0] * cosine - local[2] * sine) * scale,
      local[1] * scale,
      (local[0] * sine + local[2] * cosine) * scale,
    ],
    add(center, offset),
  );
}

function transformDirection(direction, angle) {
  return [
    direction[0] * Math.cos(angle) - direction[1] * Math.sin(angle),
    direction[0] * Math.sin(angle) + direction[1] * Math.cos(angle),
    direction[2],
    ...(direction.length > 3 ? [direction[3]] : []),
  ];
}

function hash(value) {
  const x = Math.sin(value * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function expandGeometry(document, bin, mesh, primitive, copies) {
  const attributes = {};
  for (const [name, accessorIndex] of Object.entries(primitive.attributes)) {
    attributes[name] = accessorValues(document, bin, accessorIndex);
  }
  const indices = accessorValues(document, bin, primitive.indices).flat();
  const output = {};
  for (const name of Object.keys(attributes)) output[name] = [];
  const outputIndices = [];
  const vertexCount = attributes.POSITION.length;
  const canopyCenter = [0, 8.5, 0];

  for (let copy = 0; copy < copies; copy += 1) {
    const outputOffset = output.POSITION.length;
    const angle = copy === 0 ? 0 : (copy / copies) * Math.PI + (hash(copy) - 0.5) * 0.28;
    const scale = copy === 0 ? 1 : 0.94 + hash(copy * 7) * 0.1;
    const offset =
      copy === 0 ? [0, 0, 0] : [(hash(copy * 3) - 0.5) * 0.24, (hash(copy * 5) - 0.5) * 0.24, 0];
    for (let originalIndex = 0; originalIndex < vertexCount; originalIndex += 1) {
      for (const [name, values] of Object.entries(attributes)) {
        if (name === 'POSITION') {
          output[name].push(
            rotateAroundY(values[originalIndex], canopyCenter, angle, scale, offset),
          );
        } else if (name === 'NORMAL' || name === 'TANGENT') {
          output[name].push(transformDirection(values[originalIndex], angle));
        } else {
          output[name].push(values[originalIndex]);
        }
      }
    }
    for (const index of indices) outputIndices.push(index + outputOffset);
  }
  return { attributes: output, indices: outputIndices };
}

function copyGeometry(document, bin, primitive) {
  const attributes = {};
  for (const [name, accessorIndex] of Object.entries(primitive.attributes)) {
    attributes[name] = accessorValues(document, bin, accessorIndex);
  }
  return {
    attributes,
    indices: accessorValues(document, bin, primitive.indices).flat(),
  };
}

function fitHorizontalBounds(meshes) {
  for (const variant of ['Courtyard', 'Windswept', 'LowSpreading']) {
    const members = meshes.filter((mesh) => mesh.name.startsWith(`${variant}_`));
    const maximumRadius = Math.max(
      ...members.flatMap((mesh) =>
        mesh.attributes.POSITION.reduce(
          (radius, position) => Math.max(radius, Math.hypot(position[0], position[2])),
          0,
        ),
      ),
    );
    const scaleFactor = maximumRadius > 14 ? 14 / maximumRadius : 1;
    if (scaleFactor === 1) continue;
    for (const mesh of members) {
      for (const position of mesh.attributes.POSITION) {
        position[0] *= scaleFactor;
        position[2] *= scaleFactor;
      }
    }
  }
}

function encode(document, geometries, images) {
  const json = {
    ...document,
    buffers: [{ byteLength: 0 }],
    bufferViews: [],
    accessors: [],
    images: [],
  };
  const chunks = [];
  const addView = (bytes, target) => {
    const chunk = { bytes: Buffer.from(bytes), offset: 0 };
    chunks.push(chunk);
    const view = { buffer: 0, byteOffset: 0, byteLength: chunk.bytes.length };
    if (target) view.target = target;
    json.bufferViews.push(view);
    return { view, chunk };
  };
  const addAccessor = (viewIndex, componentType, count, type, min, max) => {
    const accessor = { bufferView: viewIndex, componentType, count, type };
    if (min) accessor.min = min;
    if (max) accessor.max = max;
    json.accessors.push(accessor);
    return json.accessors.length - 1;
  };
  const addFloatAttribute = (values, type) => {
    const flat = values.flat();
    const bytes = Buffer.from(new Float32Array(flat).buffer);
    const { view } = addView(bytes, 34962);
    const componentCount = COMPONENTS[type];
    const min =
      type === 'VEC3'
        ? [0, 1, 2].map((axis) => Math.min(...values.map((v) => v[axis])))
        : undefined;
    const max =
      type === 'VEC3'
        ? [0, 1, 2].map((axis) => Math.max(...values.map((v) => v[axis])))
        : undefined;
    return addAccessor(
      json.bufferViews.indexOf(view),
      5126,
      flat.length / componentCount,
      type,
      min,
      max,
    );
  };

  for (const image of images) {
    const { view } = addView(image.bytes);
    json.images.push({
      name: image.name,
      mimeType: 'image/png',
      bufferView: json.bufferViews.indexOf(view),
    });
  }

  for (const [meshIndex, mesh] of document.meshes.entries()) {
    const primitive = mesh.primitives[0];
    const geometry = geometries[meshIndex];
    const nextPrimitive = {
      attributes: {},
      indices: undefined,
      material: primitive.material,
      mode: primitive.mode ?? 4,
    };
    for (const [name, values] of Object.entries(geometry.attributes)) {
      const type = name === 'TEXCOORD_0' ? 'VEC2' : name === 'TANGENT' ? 'VEC4' : 'VEC3';
      nextPrimitive.attributes[name] = addFloatAttribute(values, type);
    }
    const maxIndex = Math.max(...geometry.indices);
    const IndexArray = maxIndex > 65535 ? Uint32Array : Uint16Array;
    const { view } = addView(Buffer.from(new IndexArray(geometry.indices).buffer), 34963);
    nextPrimitive.indices = addAccessor(
      json.bufferViews.indexOf(view),
      maxIndex > 65535 ? 5125 : 5123,
      geometry.indices.length,
      'SCALAR',
    );
    json.meshes[meshIndex] = { ...mesh, primitives: [nextPrimitive] };
  }

  let offset = 0;
  const binaryParts = [];
  for (const [index, chunk] of chunks.entries()) {
    const aligned = align4(offset);
    if (aligned > offset) binaryParts.push(Buffer.alloc(aligned - offset));
    chunk.offset = aligned;
    binaryParts.push(chunk.bytes);
    json.bufferViews[index].byteOffset = aligned;
    offset = aligned + chunk.bytes.length;
  }
  const binary = Buffer.concat([...binaryParts, Buffer.alloc(align4(offset) - offset)]);
  json.buffers[0].byteLength = binary.length;
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const paddedJson = Buffer.concat([
    jsonBytes,
    Buffer.alloc(align4(jsonBytes.length) - jsonBytes.length, 0x20),
  ]);
  const totalLength = 12 + 8 + paddedJson.length + 8 + binary.length;
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 4, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(paddedJson.length, 0);
  jsonHeader.write('JSON', 4, 4, 'ascii');
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binary.length, 0);
  binHeader.write('BIN\0', 4, 4, 'ascii');
  return Buffer.concat([header, jsonHeader, paddedJson, binHeader, binary]);
}

async function main() {
  const args = process.argv.slice(2);
  const argument = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const outputRoot = path.resolve(argument('--output-root') ?? ARTIFACT_ROOT);
  const runtimeRootValue = argument('--runtime-root');
  const runtimeRoot = runtimeRootValue ? path.resolve(runtimeRootValue) : undefined;
  const sourceGlb = path.resolve(argument('--source-glb') ?? SOURCE_GLB);
  await mkdir(outputRoot, { recursive: true });
  if (runtimeRoot) await mkdir(runtimeRoot, { recursive: true });

  const source = readGlb(await readFile(sourceGlb));
  const foliageBytes = await readFile(FOLIAGE_ATLAS);
  const barkBytes = await readFile(BARK_ATLAS);
  const impostorBytes = await readFile(IMPOSTOR_ATLAS);
  const impostorNormalBytes = await readFile(IMPOSTOR_NORMAL_ATLAS);
  const images = [];
  for (const image of source.json.images ?? []) {
    let bytes = source.bin.subarray(
      source.json.bufferViews[image.bufferView].byteOffset ?? 0,
      (source.json.bufferViews[image.bufferView].byteOffset ?? 0) +
        source.json.bufferViews[image.bufferView].byteLength,
    );
    if (image.name === 'foliage-alpha-v1') bytes = foliageBytes;
    if (image.name === 'bark-source-v1') bytes = barkBytes;
    if (image.name?.startsWith('impostor-') && !image.name.includes('normal'))
      bytes = impostorBytes;
    if (image.name?.startsWith('impostor-') && image.name.includes('normal'))
      bytes = impostorNormalBytes;
    images.push({ name: image.name, bytes });
  }
  for (const material of source.json.materials ?? []) {
    if (material.name === 'Foliage' || material.name?.includes('ImpostorMaterial')) {
      material.alphaMode = 'MASK';
      material.alphaCutoff = 0.2;
      material.doubleSided = true;
    }
  }
  const alreadyDense = source.json.meshes.some((mesh) => {
    if (!mesh.name.includes('LOD0_Foliage')) return false;
    return source.json.accessors[mesh.primitives[0].indices].count >= 20_000;
  });
  const geometries = source.json.meshes.map((mesh) => {
    const primitive = mesh.primitives[0];
    const copies = alreadyDense
      ? 1
      : mesh.name.includes('Foliage')
        ? mesh.name.includes('LOD0')
          ? 4
          : 6
        : 1;
    return copies === 1
      ? copyGeometry(source.json, source.bin, primitive)
      : expandGeometry(source.json, source.bin, mesh, primitive, copies);
  });
  fitHorizontalBounds(
    geometries.map((geometry, index) => ({
      ...geometry,
      name: source.json.meshes[index].name,
    })),
  );
  const output = encode(source.json, geometries, images);
  await writeFile(path.join(outputRoot, 'model.glb'), output);
  if (runtimeRoot) await writeFile(path.join(runtimeRoot, 'model.glb'), output);
  await writeFile(
    path.join(ARTIFACT_ROOT, 'audit.json'),
    JSON.stringify(
      {
        asset: 'Mature Broadleaf Tree',
        generator: 'tools/generate-mature-broadleaf-fallback.mjs',
        sourceOfTruth: 'tools/blender/mature_broadleaf_tree.py',
        sourceGlb: path.relative(PROJECT_ROOT, sourceGlb),
        foliageCopies: { lod0: 4, lod1: 6 },
        glbBytes: output.length,
        fallback: true,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Wrote ${path.relative(PROJECT_ROOT, path.join(outputRoot, 'model.glb'))}`);
  if (runtimeRoot)
    console.log(`Wrote ${path.relative(PROJECT_ROOT, path.join(runtimeRoot, 'model.glb'))}`);
}

await main();
