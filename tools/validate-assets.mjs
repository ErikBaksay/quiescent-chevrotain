import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const assetsRoot = path.resolve(projectRoot, 'public/assets');
const catalogPath = path.join(assetsRoot, 'catalog.json');
const terrainRoot = path.join(assetsRoot, 'textures', 'terrain');
const validCategories = new Set([
  'civic',
  'residential',
  'commercial',
  'nature',
  'street-furniture',
]);
const requiredStringFields = ['id', 'name', 'category', 'model', 'thumbnail'];

const errors = [];

function report(scope, message) {
  errors.push(`${scope}: ${message}`);
}

async function readJson(filePath, scope) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    report(scope, error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\')) {
    return false;
  }

  const normalized = path.posix.normalize(value);
  return (
    normalized === value &&
    !path.posix.isAbsolute(value) &&
    normalized !== '..' &&
    !normalized.startsWith('../') &&
    !/^[a-z][a-z\d+.-]*:/i.test(value)
  );
}

function resolveContained(baseDirectory, relativePath) {
  const resolved = path.resolve(baseDirectory, relativePath);
  const relative = path.relative(assetsRoot, resolved);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? resolved
    : undefined;
}

async function requireFile(filePath, scope) {
  try {
    const result = await stat(filePath);
    if (!result.isFile()) {
      report(scope, 'must resolve to a file');
      return false;
    }
    return true;
  } catch {
    report(scope, `missing file ${path.relative(projectRoot, filePath)}`);
    return false;
  }
}

async function validateGlb(filePath, scope) {
  if (!(await requireFile(filePath, scope))) {
    return;
  }

  const header = await readFile(filePath).then((buffer) => buffer.subarray(0, 12));
  if (header.length < 12 || header.toString('ascii', 0, 4) !== 'glTF') {
    report(scope, 'is not a binary glTF file');
  } else if (header.readUInt32LE(4) !== 2) {
    report(scope, 'must use glTF version 2');
  }
}

async function readGlbJson(filePath, scope) {
  try {
    const data = await readFile(filePath);
    if (data.length < 20 || data.toString('ascii', 0, 4) !== 'glTF') return undefined;
    const jsonLength = data.readUInt32LE(12);
    if (data.toString('ascii', 16, 20) !== 'JSON' || 20 + jsonLength > data.length) {
      report(scope, 'has an invalid JSON chunk');
      return undefined;
    }
    return JSON.parse(data.toString('utf8', 20, 20 + jsonLength));
  } catch (error) {
    report(scope, error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

async function validateVegetationGlb(filePath, definition, scope) {
  const document = await readGlbJson(filePath, scope);
  if (!document) return;
  const nodeNames = new Set((document.nodes ?? []).map((node) => node?.name));
  const meshByName = new Map(
    (document.meshes ?? []).filter((mesh) => mesh?.name).map((mesh) => [mesh.name, mesh]),
  );
  const nodeByName = new Map(
    (document.nodes ?? []).filter((node) => node?.name).map((node) => [node.name, node]),
  );
  const materialByIndex = document.materials ?? [];
  const accessorByIndex = document.accessors ?? [];
  const meshForName = (name) => {
    const mesh = meshByName.get(name);
    if (mesh) return mesh;
    const node = nodeByName.get(name);
    return Number.isInteger(node?.mesh) ? document.meshes[node.mesh] : undefined;
  };
  const declaredNames = (variant) => {
    if (!variant || typeof variant !== 'object') return [];
    return [...(variant.lod0 ?? []), ...(variant.lod1 ?? []), variant.impostor, variant.shadow];
  };
  for (const variant of definition.vegetation?.variants ?? []) {
    for (const name of declaredNames(variant)) {
      if (!nodeNames.has(name) && !meshByName.has(name)) {
        report(scope, `is missing vegetation mesh ${name}`);
      }
    }
    for (const level of ['lod0', 'lod1']) {
      const triangles = (variant?.[level] ?? [])
        .filter((name) => typeof name === 'string' && name.includes('Foliage'))
        .reduce((total, name) => {
          const mesh = meshForName(name);
          return (
            total +
            (mesh?.primitives ?? []).reduce((meshTotal, primitive) => {
              const accessor = accessorByIndex[primitive.indices];
              return meshTotal + (accessor?.count ?? 0) / 3;
            }, 0)
          );
        }, 0);
      const minimum = level === 'lod0' ? 7000 : 2500;
      if (definition.renderMode === 'vegetation' && triangles < minimum) {
        report(
          scope,
          `${level} foliage is too sparse (${triangles} triangles; expected at least ${minimum})`,
        );
      }
    }
  }
  const expectedImageCount = definition.id === 'mature-broadleaf-tree' ? 8 : 7;
  if (!Array.isArray(document.images) || document.images.length < expectedImageCount) {
    report(scope, 'must embed foliage and impostor images');
  }
  const alphaMaterials = materialByIndex.filter(
    (material) => material?.name === 'Foliage' || material?.name?.includes('ImpostorMaterial'),
  );
  for (const material of alphaMaterials) {
    if (
      !material?.pbrMetallicRoughness?.baseColorTexture ||
      material.alphaMode !== 'MASK' ||
      material.doubleSided !== true ||
      !(material.alphaCutoff <= 0.25)
    ) {
      report(scope, `${material?.name ?? 'Foliage'} must be double-sided alpha-masked foliage`);
    }
    if (material?.name?.includes('ImpostorMaterial') && !material.normalTexture) {
      report(scope, `${material.name} must include a normal texture`);
    }
  }
  if (!materialByIndex.some((material) => material?.name === 'Foliage')) {
    report(scope, 'must include a Foliage material');
  }
}

async function validateWebp(filePath, scope) {
  if (!(await requireFile(filePath, scope))) {
    return;
  }

  const header = await readFile(filePath).then((buffer) => buffer.subarray(0, 12));
  if (
    header.length < 12 ||
    header.toString('ascii', 0, 4) !== 'RIFF' ||
    header.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    report(scope, 'is not a WebP image');
  }
}

async function validateManifest(manifestPath, ids) {
  const scope = path.relative(projectRoot, manifestPath);
  const definition = await readJson(manifestPath, scope);
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    report(scope, 'must contain one asset definition object');
    return;
  }

  for (const field of requiredStringFields) {
    if (typeof definition[field] !== 'string' || definition[field].trim().length === 0) {
      report(scope, `${field} must be a non-empty string`);
    }
  }

  if (typeof definition.id === 'string') {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id)) {
      report(scope, 'id must use lowercase kebab case');
    } else if (ids.has(definition.id)) {
      report(scope, `duplicate asset id ${definition.id}`);
    } else {
      ids.add(definition.id);
    }
  }

  if (typeof definition.category === 'string' && !validCategories.has(definition.category)) {
    report(scope, `category must be one of ${[...validCategories].join(', ')}`);
  }

  if (typeof definition.defaultScale !== 'number' || !(definition.defaultScale > 0)) {
    report(scope, 'defaultScale must be a positive number');
  }

  if (
    definition.renderMode !== undefined &&
    !['object', 'vegetation'].includes(definition.renderMode)
  ) {
    report(scope, 'renderMode must be object or vegetation');
  }

  if (definition.renderMode === 'vegetation') {
    const vegetation = definition.vegetation;
    if (definition.category !== 'nature') {
      report(scope, 'vegetation assets must use the nature category');
    }
    if (
      !vegetation ||
      typeof vegetation !== 'object' ||
      !(vegetation.bounds?.radius > 0) ||
      !(vegetation.bounds?.height > 0) ||
      !Array.isArray(vegetation.variants) ||
      vegetation.variants.length === 0
    ) {
      report(scope, 'vegetation must define positive bounds and at least one variant');
    } else {
      const variantIds = new Set();
      for (const variant of vegetation.variants) {
        if (
          !variant ||
          typeof variant.id !== 'string' ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(variant.id)
        ) {
          report(scope, 'vegetation variant ids must use lowercase kebab case');
          continue;
        }
        if (variantIds.has(variant.id)) report(scope, `duplicate vegetation variant ${variant.id}`);
        variantIds.add(variant.id);
        for (const level of ['lod0', 'lod1']) {
          if (
            !Array.isArray(variant[level]) ||
            variant[level].length === 0 ||
            variant[level].some((name) => typeof name !== 'string' || name.length === 0)
          ) {
            report(scope, `vegetation variant ${variant.id} ${level} must contain mesh names`);
          }
        }
        for (const field of ['impostor', 'shadow']) {
          if (typeof variant[field] !== 'string' || variant[field].length === 0) {
            report(scope, `vegetation variant ${variant.id} ${field} must be a mesh name`);
          }
        }
      }
    }
  } else if (definition.appearance !== undefined) {
    const appearance = definition.appearance;
    if (
      !appearance ||
      typeof appearance !== 'object' ||
      !Array.isArray(appearance.shapes) ||
      appearance.shapes.length === 0 ||
      !Array.isArray(appearance.palettes) ||
      appearance.palettes.length === 0 ||
      typeof appearance.defaultShapeId !== 'string' ||
      typeof appearance.defaultPaletteId !== 'string'
    ) {
      report(scope, 'appearance must define defaults, shapes, and palettes');
    } else {
      const shapeIds = new Set();
      for (const shape of appearance.shapes) {
        if (
          !shape ||
          typeof shape.id !== 'string' ||
          typeof shape.name !== 'string' ||
          typeof shape.root !== 'string' ||
          shapeIds.has(shape.id)
        ) {
          report(scope, 'appearance contains a malformed or duplicate shape');
        } else {
          shapeIds.add(shape.id);
        }
      }
      const paletteIds = new Set();
      for (const palette of appearance.palettes) {
        if (
          !palette ||
          typeof palette.id !== 'string' ||
          typeof palette.name !== 'string' ||
          !palette.colors ||
          typeof palette.colors !== 'object' ||
          Array.isArray(palette.colors) ||
          paletteIds.has(palette.id) ||
          Object.values(palette.colors).some(
            (color) => typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color),
          )
        ) {
          report(scope, 'appearance contains a malformed or duplicate palette');
          continue;
        }
        if (
          palette.materialVariants !== undefined &&
          (!palette.materialVariants ||
            typeof palette.materialVariants !== 'object' ||
            Array.isArray(palette.materialVariants) ||
            Object.values(palette.materialVariants).some(
              (material) => typeof material !== 'string' || material.trim().length === 0,
            ))
        ) {
          report(scope, 'appearance contains malformed material variants');
        }
        paletteIds.add(palette.id);
      }
      if (
        !shapeIds.has(appearance.defaultShapeId) ||
        !paletteIds.has(appearance.defaultPaletteId)
      ) {
        report(scope, 'appearance defaults must reference declared variants');
      }
    }
  }

  const manifestDirectory = path.dirname(manifestPath);
  for (const [field, extension, validator] of [
    ['model', '.glb', validateGlb],
    ['thumbnail', '.webp', validateWebp],
  ]) {
    const value = definition[field];
    if (typeof value !== 'string') {
      continue;
    }
    if (!isSafeRelativePath(value) || path.posix.extname(value).toLowerCase() !== extension) {
      report(scope, `${field} must be a safe relative ${extension} path`);
      continue;
    }
    const resolved = resolveContained(manifestDirectory, value);
    if (!resolved) {
      report(scope, `${field} must remain inside public/assets`);
      continue;
    }
    await validator(resolved, `${scope} ${field}`);
    if (field === 'model' && definition.renderMode === 'vegetation') {
      await validateVegetationGlb(resolved, definition, `${scope} ${field}`);
    }
  }
}

const catalog = await readJson(catalogPath, 'public/assets/catalog.json');

if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
  report('public/assets/catalog.json', 'must contain a catalogue object');
} else {
  if (catalog.version !== 1) {
    report('public/assets/catalog.json', 'version must be 1');
  }
  if (!Array.isArray(catalog.manifests)) {
    report('public/assets/catalog.json', 'manifests must be an array');
  } else {
    const paths = new Set();
    const ids = new Set();
    for (const manifest of catalog.manifests) {
      if (!isSafeRelativePath(manifest) || !manifest.endsWith('/asset.json')) {
        report(
          'public/assets/catalog.json',
          `${JSON.stringify(manifest)} is not a safe asset manifest path`,
        );
        continue;
      }
      if (paths.has(manifest)) {
        report('public/assets/catalog.json', `duplicate manifest ${manifest}`);
        continue;
      }
      paths.add(manifest);
      const manifestPath = resolveContained(assetsRoot, manifest);
      if (!manifestPath || !(await requireFile(manifestPath, 'public/assets/catalog.json'))) {
        continue;
      }
      await validateManifest(manifestPath, ids);
    }
  }
}

const terrainAtlasPath = path.join(terrainRoot, 'terrain-atlas.json');
const terrainAtlas = await readJson(
  terrainAtlasPath,
  'public/assets/textures/terrain/terrain-atlas.json',
);
if (
  !terrainAtlas ||
  terrainAtlas.tileSize !== 256 ||
  terrainAtlas.columns !== 6 ||
  terrainAtlas.rows !== 4
) {
  report(
    'public/assets/textures/terrain/terrain-atlas.json',
    'must describe a 256px six-by-four atlas',
  );
} else if (
  !Array.isArray(terrainAtlas.surfaces) ||
  terrainAtlas.surfaces.length !== 24 ||
  terrainAtlas.surfaces.some((surface, index) => surface?.index !== index)
) {
  report(
    'public/assets/textures/terrain/terrain-atlas.json',
    'must contain 24 consecutive surface indices',
  );
}

for (const file of [
  'terrain-albedo-atlas.webp',
  'terrain-normal-atlas.webp',
  'terrain-roughness-atlas.webp',
  'terrain-ao-atlas.webp',
  'terrain-swatches.webp',
]) {
  await validateWebp(path.join(terrainRoot, file), `public/assets/textures/terrain/${file}`);
}

if (errors.length > 0) {
  console.error(`Asset validation failed with ${errors.length} error(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log('Asset catalogue validation passed.');
}
