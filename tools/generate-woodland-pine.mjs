import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const PROJECT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ARTIFACT_ROOT = path.join(PROJECT_ROOT, '.artifacts/blender/woodland-pine');
const NEEDLE_ATLAS = path.join(
  PROJECT_ROOT,
  'docs/assets/concepts/woodland-pine/source/needle-atlas-v2.png',
);
const IMPOSTOR_ATLAS = path.join(
  PROJECT_ROOT,
  'docs/assets/concepts/woodland-pine/source/pine-impostor-atlas-v2.png',
);
const IMPOSTOR_NORMAL_ATLAS = path.join(
  PROJECT_ROOT,
  'docs/assets/concepts/woodland-pine/source/pine-impostor-normal-v2.png',
);

const VARIANTS = [
  {
    id: 'upright',
    name: 'Upright',
    height: 22,
    radius: 7.2,
    lean: 0,
    openness: 0.82,
  },
  {
    id: 'open-crown',
    name: 'OpenCrown',
    height: 19.5,
    radius: 8.8,
    lean: 0.16,
    openness: 1.12,
  },
  {
    id: 'asymmetric',
    name: 'Asymmetric',
    height: 21,
    radius: 8.4,
    lean: -0.12,
    openness: 0.98,
  },
];

const TREE_MESHES = [];
const images = [];
const GENERATED_ATLASES = [];

function addImage(name, bytes, width, height) {
  const imageIndex = images.length;
  images.push({ name, bytes, width, height });
  return imageIndex;
}

function addMesh(name, geometry, material) {
  TREE_MESHES.push({ name, geometry, material });
}

function createGeometry() {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function addVertex(geometry, position, normal, uv = [0, 0]) {
  const index = geometry.positions.length / 3;
  geometry.positions.push(...position);
  geometry.normals.push(...normal);
  geometry.uvs.push(...uv);
  return index;
}

function addQuad(geometry, a, b, c, d) {
  geometry.indices.push(a, b, d, b, c, d);
}

function addFrustum(geometry, start, end, radiusStart, radiusEnd, sides) {
  const direction = normalize(subtract(end, start));
  let basis = cross(direction, [0, 1, 0]);
  if (length(basis) < 0.01) basis = cross(direction, [1, 0, 0]);
  basis = normalize(basis);
  const other = normalize(cross(direction, basis));
  const ringStart = [];
  const ringEnd = [];
  for (let side = 0; side < sides; side += 1) {
    const angle = (side / sides) * Math.PI * 2;
    const radial = add(scale(basis, Math.cos(angle)), scale(other, Math.sin(angle)));
    const normal = normalize(radial);
    ringStart.push(addVertex(geometry, add(start, scale(radial, radiusStart)), normal));
    ringEnd.push(addVertex(geometry, add(end, scale(radial, radiusEnd)), normal));
  }
  for (let side = 0; side < sides; side += 1) {
    const next = (side + 1) % sides;
    addQuad(geometry, ringStart[side], ringStart[next], ringEnd[next], ringEnd[side]);
  }
}

function branchPaths(variant) {
  const lean = variant.lean;
  const asymmetry = variant.id === 'asymmetric' ? 1 : 0;
  const height = variant.height;
  const branch = (y, length, angle, droop = 0) => {
    const start = [lean * y * 0.13, y, 0];
    const direction = [Math.sin(angle), droop, Math.cos(angle)];
    return [
      start,
      add(start, scale(direction, length * 0.38)),
      add(start, scale(direction, length * 0.76)),
      add(start, scale(direction, length)),
    ];
  };
  const levels = [0.2, 0.31, 0.42, 0.53, 0.64, 0.75, 0.85];
  return levels.flatMap((fraction, index) => {
    const y = height * fraction;
    const baseRadius = variant.radius * Math.pow(1 - fraction, 0.62) * variant.openness;
    const count = index < 2 ? 5 : 6;
    const paths = [];
    for (let branchIndex = 0; branchIndex < count; branchIndex += 1) {
      const angle = (branchIndex / count) * Math.PI * 2 + index * 0.37;
      const localLength = baseRadius * (0.86 + hash(index * 31 + branchIndex) * 0.26);
      const directionBias = asymmetry * Math.sin(angle) * 0.16;
      paths.push(branch(y, localLength, angle + directionBias, -0.08 - fraction * 0.14));
    }
    return paths;
  });
}

function createTrunk(variant, lod) {
  const geometry = createGeometry();
  const paths = branchPaths(variant);
  const sides = lod === 0 ? 10 : 6;
  const trunkTop = [variant.lean * 2.8, variant.height, 0];
  addFrustum(geometry, [0, 0, 0], trunkTop, 0.72, 0.08, sides);
  const selectedPaths = lod === 0 ? paths : paths.filter((_, index) => index % 2 === 0);
  for (const [index, path] of selectedPaths.entries()) {
    const branchStart = path[0];
    const branchEnd = path[path.length - 1];
    const baseRadius = 0.18 * (1 - (index / selectedPaths.length) * 0.48);
    for (let segment = 0; segment < path.length - 1; segment += 1) {
      const progress = segment / (path.length - 1);
      addFrustum(
        geometry,
        path[segment],
        path[segment + 1],
        baseRadius * (1 - progress * 0.8),
        baseRadius * (1 - (progress + 1 / (path.length - 1)) * 0.8),
        sides,
      );
    }
    if (lod === 0 && index % 2 === 0) {
      const twigDirection = normalize(subtract(branchEnd, branchStart));
      const sideDirection = normalize(cross(twigDirection, [0, 1, 0]));
      const twigStart = add(branchEnd, scale(twigDirection, -0.28));
      addFrustum(
        geometry,
        twigStart,
        add(add(twigStart, scale(twigDirection, 1.35)), scale(sideDirection, (index % 3) - 1)),
        0.035,
        0.008,
        5,
      );
    }
  }
  addMesh(`${variant.name}_LOD${lod}_Trunk`, geometry, 'Bark');
}

function createFoliage(variant, lod) {
  const geometry = createGeometry();
  const paths = branchPaths(variant);
  const random = mulberry32(lod * 1000 + VARIANTS.indexOf(variant) * 71 + 9);
  const clusterCount = lod === 0 ? 1400 : 700;
  const cardsPerCluster = lod === 0 ? 3 : 2;
  for (let cluster = 0; cluster < clusterCount; cluster += 1) {
    const path = paths[cluster % paths.length];
    const segment = (cluster * 3 + Math.floor(random() * 5)) % (path.length - 1);
    const along = 0.12 + random() * 0.88;
    const center = lerp(path[segment], path[segment + 1], along);
    const lowerCrown = Math.max(0, 1 - center[1] / variant.height);
    const clusterScale = (0.78 + lowerCrown * 1.42) * (lod === 0 ? 1 : 0.94);
    center[1] += (random() - 0.45) * clusterScale * 0.32;
    const width = (1.1 + random() * 1.0) * clusterScale;
    const height = (0.48 + random() * 0.42) * clusterScale;
    for (let plane = 0; plane < cardsPerCluster; plane += 1) {
      const yaw = random() * Math.PI * 2 + plane * (Math.PI / 3);
      const right = [Math.cos(yaw) * width * 0.5, 0, Math.sin(yaw) * width * 0.5];
      const up = [-Math.sin(yaw) * 0.12, height, Math.cos(yaw) * 0.12];
      const frame = (cluster * cardsPerCluster + plane + VARIANTS.indexOf(variant)) % 12;
      const column = frame % 4;
      const row = Math.floor(frame / 4);
      const u0 = column / 4;
      const u1 = (column + 1) / 4;
      const v0 = row / 3;
      const v1 = (row + 1) / 3;
      const normal = [0, 1, 0];
      const base = addVertex(geometry, subtract(subtract(center, right), scale(up, 0.5)), normal, [
        u0,
        v0,
      ]);
      const second = addVertex(geometry, add(subtract(center, scale(up, 0.5)), right), normal, [
        u1,
        v0,
      ]);
      const third = addVertex(geometry, add(add(center, right), scale(up, 0.5)), normal, [u1, v1]);
      const fourth = addVertex(geometry, subtract(add(center, scale(up, 0.5)), right), normal, [
        u0,
        v1,
      ]);
      addQuad(geometry, base, second, third, fourth);
    }
  }
  addMesh(`${variant.name}_LOD${lod}_Foliage`, geometry, 'Foliage');
}

function createShadowProxy(variant) {
  const geometry = createGeometry();
  const rings = 4;
  const segments = 8;
  for (let ring = 0; ring <= rings; ring += 1) {
    const phi = (ring / rings) * Math.PI;
    const y = Math.cos(phi) * variant.height * 0.45 + variant.height * 0.55;
    const radius = Math.sin(phi) * variant.radius * 0.82;
    for (let segment = 0; segment < segments; segment += 1) {
      const theta = (segment / segments) * Math.PI * 2;
      const normal = normalize([Math.cos(theta), Math.cos(phi), Math.sin(theta)]);
      addVertex(geometry, [Math.cos(theta) * radius, y, Math.sin(theta) * radius], normal);
    }
  }
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const a = ring * segments + segment;
      const b = ring * segments + next;
      const c = (ring + 1) * segments + next;
      const d = (ring + 1) * segments + segment;
      addQuad(geometry, a, b, c, d);
    }
  }
  addMesh(`${variant.name}_ShadowProxy`, geometry, 'ShadowProxy');
}

function createImpostor(variant, imageIndex, normalImageIndex) {
  const geometry = createGeometry();
  const width = variant.radius * 2.35;
  const base = addVertex(geometry, [-width / 2, 0, 0], [0, 0, 1], [0, 0]);
  const second = addVertex(geometry, [width / 2, 0, 0], [0, 0, 1], [1, 0]);
  const third = addVertex(geometry, [width / 2, variant.height, 0], [0, 0, 1], [1, 1]);
  const fourth = addVertex(geometry, [-width / 2, variant.height, 0], [0, 0, 1], [0, 1]);
  addQuad(geometry, base, second, third, fourth);
  addMesh(`${variant.name}_Impostor`, geometry, `Impostor:${imageIndex}:${normalImageIndex}`);
}

function makePng(width, height, pixel) {
  const raw = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const value = pixel(index % width, Math.floor(index / width), width, height);
    raw[index * 4] = value[0];
    raw[index * 4 + 1] = value[1];
    raw[index * 4 + 2] = value[2];
    raw[index * 4 + 3] = value[3];
  }
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let row = 0; row < height; row += 1) {
    scanlines[row * (width * 4 + 1)] = 0;
    raw.copy(scanlines, row * (width * 4 + 1) + 1, row * width * 4, (row + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from('\x89PNG\r\n\x1a\n', 'binary'),
    pngChunk('IHDR', pngHeader(width, height)),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createFlatNormalAtlas(width, height) {
  return makePng(width, height, () => [128, 164, 255, 255]);
}

async function buildScene() {
  const needleBytes = await readFile(NEEDLE_ATLAS);
  const impostorBytes = await readFile(IMPOSTOR_ATLAS);
  const impostorNormalBytes = await readFile(IMPOSTOR_NORMAL_ATLAS);
  const impostorWidth = impostorBytes.readUInt32BE(16);
  const impostorHeight = impostorBytes.readUInt32BE(20);
  const needleWidth = needleBytes.readUInt32BE(16);
  const needleHeight = needleBytes.readUInt32BE(20);
  const needleImage = addImage('PineNeedleAtlas', needleBytes, needleWidth, needleHeight);
  for (const variant of VARIANTS) {
    createTrunk(variant, 0);
    createFoliage(variant, 0);
    createTrunk(variant, 1);
    createFoliage(variant, 1);
    createShadowProxy(variant);
    const atlases = {
      color: impostorBytes,
      normal: impostorNormalBytes,
      width: impostorWidth,
      height: impostorHeight,
    };
    GENERATED_ATLASES.push({ variant: variant.id, ...atlases });
    const colorImage = addImage(
      `${variant.name}Impostor`,
      atlases.color,
      atlases.width,
      atlases.height,
    );
    const normalImage = addImage(
      `${variant.name}ImpostorNormal`,
      atlases.normal,
      atlases.width,
      atlases.height,
    );
    createImpostor(variant, colorImage, normalImage);
  }
  return needleImage;
}

function writeU32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

function pngHeader(width, height) {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt32BE(width, 0);
  buffer.writeUInt32BE(height, 4);
  buffer[8] = 8;
  buffer[9] = 6;
  return buffer;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  return Buffer.concat([
    writeU32(data.length).reverse(),
    typeBuffer,
    data,
    writeU32(crc).reverse(),
  ]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function align4(value) {
  return (value + 3) & ~3;
}

function packBuffer(chunks) {
  const binary = [];
  let offset = 0;
  for (const chunk of chunks) {
    const aligned = align4(offset);
    if (aligned > offset) binary.push(Buffer.alloc(aligned - offset));
    chunk.offset = aligned;
    binary.push(chunk.bytes);
    offset = aligned + chunk.bytes.length;
  }
  const length = align4(offset);
  if (length > offset) binary.push(Buffer.alloc(length - offset));
  return { bytes: Buffer.concat(binary), chunks };
}

function addBinaryChunk(chunks, bytes) {
  const chunk = { bytes: Buffer.from(bytes), offset: 0 };
  chunks.push(chunk);
  return chunk;
}

function encodeGlb(needleImageIndex) {
  const json = {
    asset: { version: '2.0', generator: 'Quiescent Chevrotain Woodland Pine generator' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'WoodlandPine', children: [] }],
    meshes: [],
    materials: [
      {
        name: 'Bark',
        pbrMetallicRoughness: {
          baseColorFactor: [0.17, 0.075, 0.03, 1],
          roughnessFactor: 0.9,
          metallicFactor: 0,
        },
      },
      {
        name: 'Foliage',
        alphaMode: 'MASK',
        alphaCutoff: 0.2,
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          roughnessFactor: 0.88,
          metallicFactor: 0,
        },
      },
      {
        name: 'ShadowProxy',
        pbrMetallicRoughness: {
          baseColorFactor: [0.12, 0.18, 0.08, 1],
          roughnessFactor: 1,
          metallicFactor: 0,
        },
      },
    ],
    textures: [{ sampler: 0, source: needleImageIndex }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    images: [],
    buffers: [{ byteLength: 0 }],
    bufferViews: [],
    accessors: [],
  };
  const chunks = [];
  const addBufferView = (bytes, target) => {
    const chunk = addBinaryChunk(chunks, bytes);
    const view = { buffer: 0, byteOffset: 0, byteLength: bytes.length };
    if (target) view.target = target;
    json.bufferViews.push(view);
    view._chunk = chunk;
    return json.bufferViews.length - 1;
  };
  const addAccessor = (viewIndex, componentType, count, type, min, max) => {
    const accessor = { bufferView: viewIndex, componentType, count, type };
    if (min) accessor.min = min;
    if (max) accessor.max = max;
    json.accessors.push(accessor);
    return json.accessors.length - 1;
  };
  const materialFor = (mesh) => {
    if (mesh.material === 'Bark') return 0;
    if (mesh.material === 'Foliage') return 1;
    if (mesh.material === 'ShadowProxy') return 2;
    const [, colorImageIndex, normalImageIndex] = mesh.material.split(':').map(Number);
    const colorTexture = json.textures.length;
    json.textures.push({ sampler: 0, source: colorImageIndex });
    const normalTexture = json.textures.length;
    json.textures.push({ sampler: 0, source: normalImageIndex });
    const materialIndex = json.materials.length;
    json.materials.push({
      name: `${mesh.name}Material`,
      alphaMode: 'MASK',
      alphaCutoff: 0.2,
      doubleSided: true,
      pbrMetallicRoughness: {
        baseColorTexture: { index: colorTexture },
        roughnessFactor: 0.92,
        metallicFactor: 0,
      },
      normalTexture: { index: normalTexture, scale: 0.35 },
    });
    return materialIndex;
  };
  for (const image of images) {
    const viewIndex = addBufferView(image.bytes);
    json.images.push({ name: image.name, mimeType: 'image/png', bufferView: viewIndex });
  }
  for (const mesh of TREE_MESHES) {
    const { geometry } = mesh;
    const positions = new Float32Array(geometry.positions);
    const normals = new Float32Array(geometry.normals);
    const uvs = new Float32Array(geometry.uvs);
    const indices = new Uint16Array(geometry.indices);
    const positionView = addBufferView(Buffer.from(positions.buffer), 34962);
    const normalView = addBufferView(Buffer.from(normals.buffer), 34962);
    const uvView = addBufferView(Buffer.from(uvs.buffer), 34962);
    const indexView = addBufferView(Buffer.from(indices.buffer), 34963);
    const positionTriples = [];
    for (let index = 0; index < positions.length; index += 3) {
      positionTriples.push([positions[index], positions[index + 1], positions[index + 2]]);
    }
    const min = [0, 1, 2].map((axis) => Math.min(...positionTriples.map((value) => value[axis])));
    const max = [0, 1, 2].map((axis) => Math.max(...positionTriples.map((value) => value[axis])));
    const primitive = {
      attributes: {
        POSITION: addAccessor(positionView, 5126, positions.length / 3, 'VEC3', min, max),
        NORMAL: addAccessor(normalView, 5126, normals.length / 3, 'VEC3'),
        TEXCOORD_0: addAccessor(uvView, 5126, uvs.length / 2, 'VEC2'),
      },
      indices: addAccessor(indexView, 5123, indices.length, 'SCALAR'),
      material: materialFor(mesh),
      mode: 4,
    };
    const meshIndex = json.meshes.push({ name: mesh.name, primitives: [primitive] }) - 1;
    const nodeIndex = json.nodes.push({ name: mesh.name, mesh: meshIndex }) - 1;
    json.nodes[0].children.push(nodeIndex);
  }
  const packed = packBuffer(chunks);
  for (const view of json.bufferViews) {
    view.byteOffset = view._chunk.offset;
    delete view._chunk;
  }
  json.buffers[0].byteLength = packed.bytes.length;
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const jsonPadded = Buffer.concat([
    jsonBytes,
    Buffer.alloc(align4(jsonBytes.length) - jsonBytes.length, 0x20),
  ]);
  const binaryPadded = Buffer.concat([
    packed.bytes,
    Buffer.alloc(align4(packed.bytes.length) - packed.bytes.length),
  ]);
  const totalLength = 12 + 8 + jsonPadded.length + 8 + binaryPadded.length;
  return Buffer.concat([
    Buffer.from('glTF'),
    writeU32(2),
    writeU32(totalLength),
    writeU32(jsonPadded.length),
    Buffer.from('JSON'),
    jsonPadded,
    writeU32(binaryPadded.length),
    Buffer.from('BIN\0'),
    binaryPadded,
  ]);
}

function hash(value) {
  const x = Math.sin(value * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(vector, amount) {
  return [vector[0] * amount, vector[1] * amount, vector[2] * amount];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function length(vector) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize(vector) {
  const magnitude = length(vector) || 1;
  return scale(vector, 1 / magnitude);
}

function lerp(a, b, amount) {
  return add(a, scale(subtract(b, a), amount));
}

function fitHorizontalBounds() {
  for (const variant of VARIANTS) {
    const meshes = TREE_MESHES.filter((mesh) => mesh.name.startsWith(`${variant.name}_`));
    const maximumRadius = Math.max(
      ...meshes.flatMap((mesh) =>
        mesh.geometry.positions.reduce((radii, _, index) => {
          if (index % 3 !== 0) return radii;
          return Math.max(
            radii,
            Math.hypot(mesh.geometry.positions[index], mesh.geometry.positions[index + 2]),
          );
        }, 0),
      ),
    );
    const scaleFactor = maximumRadius > variant.radius ? variant.radius / maximumRadius : 1;
    if (scaleFactor === 1) continue;
    for (const mesh of meshes) {
      for (let index = 0; index < mesh.geometry.positions.length; index += 3) {
        mesh.geometry.positions[index] *= scaleFactor;
        mesh.geometry.positions[index + 2] *= scaleFactor;
      }
    }
  }
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
  await mkdir(outputRoot, { recursive: true });
  if (runtimeRoot) await mkdir(runtimeRoot, { recursive: true });
  TREE_MESHES.length = 0;
  images.length = 0;
  GENERATED_ATLASES.length = 0;
  const needleImage = await buildScene();
  fitHorizontalBounds();
  const glb = encodeGlb(needleImage);
  await writeFile(path.join(outputRoot, 'model.glb'), glb);
  if (runtimeRoot) await writeFile(path.join(runtimeRoot, 'model.glb'), glb);
  await Promise.all(
    GENERATED_ATLASES.flatMap((atlas) => [
      writeFile(path.join(outputRoot, `impostor-${atlas.variant}.png`), atlas.color),
      writeFile(path.join(outputRoot, `impostor-${atlas.variant}-normal.png`), atlas.normal),
    ]),
  );
  await writeFile(
    path.join(ARTIFACT_ROOT, 'audit.json'),
    JSON.stringify(
      {
        asset: 'Woodland Pine',
        generator: 'tools/generate-woodland-pine.mjs',
        sourceOfTruth: 'tools/blender/woodland_pine.py',
        variants: VARIANTS.map((variant) => ({
          id: variant.id,
          height: variant.height,
          radius: variant.radius,
          meshes: TREE_MESHES.filter((mesh) => mesh.name.startsWith(variant.name)).map(
            (mesh) => mesh.name,
          ),
        })),
        meshObjects: TREE_MESHES.length,
        triangles: TREE_MESHES.reduce((total, mesh) => total + mesh.geometry.indices.length / 3, 0),
        groundAligned: true,
        camerasExported: 0,
        lightsExported: 0,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Wrote ${path.relative(PROJECT_ROOT, path.join(outputRoot, 'model.glb'))}`);
  if (runtimeRoot) {
    console.log(`Wrote ${path.relative(PROJECT_ROOT, path.join(runtimeRoot, 'model.glb'))}`);
  }
}

await main();
