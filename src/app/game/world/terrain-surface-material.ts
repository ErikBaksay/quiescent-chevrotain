import {
  Color,
  DataArrayTexture,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  NearestFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  UnsignedByteType,
  Vector2,
} from 'three';
import {
  TERRAIN_SURFACE_ATLAS_COLUMNS,
  TERRAIN_SURFACE_ATLAS_ROWS,
  TERRAIN_SURFACES,
} from './terrain-surface.types';

const TERRAIN_SURFACE_ATLAS_TILE_SIZE = 256;

/**
 * Each source atlas is unpacked into one WebGL2 texture array. Keeping one
 * material per surface layer gives every surface its own mip chain and avoids
 * the cross-material bleed that a mipmapped atlas would introduce.
 */
export interface TerrainSurfaceTextureSet {
  readonly albedo: DataArrayTexture;
  readonly normal: DataArrayTexture;
  readonly roughness: DataArrayTexture;
  readonly ao: DataArrayTexture;
  readonly parameters: DataTexture;
}

export interface TerrainSurfaceMaterialOptions {
  readonly textures: TerrainSurfaceTextureSet;
  readonly layerIds: DataTexture;
  readonly layerWeights: DataTexture;
  readonly tileWorldSize: Vector2;
}

// These textures only enable Three.js' standard UV varyings and shader paths.
// The actual terrain samples come from the texture arrays below.
const TERRAIN_COORDINATE_TEXTURE = placeholderTexture([255, 255, 255, 255]);
const TERRAIN_NORMAL_PLACEHOLDER = placeholderTexture([128, 128, 255, 255]);
const TERRAIN_ROUGHNESS_PLACEHOLDER = placeholderTexture([255, 255, 255, 255]);

export function createTerrainSurfaceMaterial(
  options: TerrainSurfaceMaterialOptions,
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    map: TERRAIN_COORDINATE_TEXTURE,
    metalness: 0,
    normalMap: TERRAIN_NORMAL_PLACEHOLDER,
    roughnessMap: TERRAIN_ROUGHNESS_PLACEHOLDER,
    roughness: 1,
    vertexColors: false,
  });
  material.name = 'Terrain surface material';
  material.userData['terrainSurface'] = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms['surfaceAlbedoLayers'] = { value: options.textures.albedo };
    shader.uniforms['surfaceNormalLayers'] = { value: options.textures.normal };
    shader.uniforms['surfaceRoughnessLayers'] = { value: options.textures.roughness };
    shader.uniforms['surfaceAoLayers'] = { value: options.textures.ao };
    shader.uniforms['surfaceParameters'] = { value: options.textures.parameters };
    shader.uniforms['surfaceLayerIds'] = { value: options.layerIds };
    shader.uniforms['surfaceLayerWeights'] = { value: options.layerWeights };
    shader.uniforms['surfaceTileWorldSize'] = { value: options.tileWorldSize };

    const helpers = `
      uniform sampler2DArray surfaceAlbedoLayers;
      uniform sampler2DArray surfaceNormalLayers;
      uniform sampler2DArray surfaceRoughnessLayers;
      uniform sampler2DArray surfaceAoLayers;
      uniform sampler2D surfaceParameters;
      uniform sampler2D surfaceLayerIds;
      uniform sampler2D surfaceLayerWeights;
      uniform vec2 surfaceTileWorldSize;

      float terrainSurfaceIdAt(vec4 ids, int layer) {
        if (layer == 0) return floor(ids.r * 255.0 + 0.5);
        if (layer == 1) return floor(ids.g * 255.0 + 0.5);
        if (layer == 2) return floor(ids.b * 255.0 + 0.5);
        return floor(ids.a * 255.0 + 0.5);
      }

      float terrainSurfaceWeightAt(vec4 weights, int layer) {
        if (layer == 0) return weights.r;
        if (layer == 1) return weights.g;
        if (layer == 2) return weights.b;
        return weights.a;
      }

      void terrainSurfaceSamples(
        out vec3 albedo,
        out vec3 tangentNormal,
        out float roughness,
        out float ambientOcclusion
      ) {
        vec4 ids = texture2D(surfaceLayerIds, vMapUv);
        vec4 weights = texture2D(surfaceLayerWeights, vMapUv);
        float totalWeight = max(0.001, weights.r + weights.g + weights.b + weights.a);
        albedo = vec3(0.0);
        tangentNormal = vec3(0.0, 0.0, 1.0);
        roughness = 0.0;
        ambientOcclusion = 0.0;

        for (int layer = 0; layer < 4; layer++) {
          float surfaceId = terrainSurfaceIdAt(ids, layer);
          float weight = terrainSurfaceWeightAt(weights, layer) / totalWeight;
          vec4 parameters = texture2D(
            surfaceParameters,
            vec2((surfaceId + 0.5) / ${TERRAIN_SURFACES.length.toFixed(1)}, 0.5)
          );
          float repeat = max(0.25, parameters.r * 8.0);
          vec2 unwrappedMaterialUv = vMapUv * surfaceTileWorldSize / repeat;
          vec2 materialUv = fract(unwrappedMaterialUv);
          vec3 layerUv = vec3(materialUv, surfaceId);
          // Use implicit derivatives here. Some WebGL2 drivers do not expose
          // the textureGrad overload for sampler2DArray in Three's generated
          // MeshStandardMaterial shader, while texture() still selects the
          // correct mip level from the isolated surface layer.
          vec3 layerAlbedo = texture(surfaceAlbedoLayers, layerUv).rgb;
          vec3 layerNormal = texture(surfaceNormalLayers, layerUv).xyz * 2.0 - 1.0;
          float layerRoughness = texture(surfaceRoughnessLayers, layerUv).r;
          float layerAo = texture(surfaceAoLayers, layerUv).r;
          layerNormal.xy *= max(0.1, parameters.b * 2.0);
          if (parameters.a > 0.5) {
            layerAlbedo = mix(layerAlbedo, vec3(0.08, 0.34, 0.32), 0.18);
            layerNormal.xy *= 0.35;
            layerRoughness *= 0.55;
          }
          albedo += layerAlbedo * weight;
          tangentNormal += (layerNormal - vec3(0.0, 0.0, 1.0)) * weight;
          roughness += layerRoughness * parameters.g * weight;
          ambientOcclusion += layerAo * weight;
        }
        albedo = max(vec3(0.02), albedo);
        tangentNormal = normalize(tangentNormal);
        roughness = clamp(roughness, 0.04, 1.0);
        ambientOcclusion = clamp(ambientOcclusion, 0.25, 1.0);
      }
    `;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <uv_pars_fragment>',
      `#include <uv_pars_fragment>
       ${helpers}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `vec3 terrainAlbedo;
       vec3 terrainTangentNormal;
       float terrainRoughness;
       float terrainAmbientOcclusion;
       terrainSurfaceSamples(
         terrainAlbedo,
         terrainTangentNormal,
         terrainRoughness,
         terrainAmbientOcclusion
       );
       diffuseColor.rgb *= terrainAlbedo * terrainAmbientOcclusion;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      'float roughnessFactor = terrainRoughness;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `vec3 terrainMapNormal = terrainTangentNormal;
       terrainMapNormal.xy *= normalScale;
       normal = normalize(tbn * terrainMapNormal);`,
    );
  };
  material.customProgramCacheKey = () => 'terrain-surface-material-v3';
  return material;
}

export function createFallbackTerrainSurfaceTextures(): TerrainSurfaceTextureSet {
  const colors = new Uint8Array(TERRAIN_SURFACES.length * 4);
  const normals = new Uint8Array(TERRAIN_SURFACES.length * 4);
  const roughness = new Uint8Array(TERRAIN_SURFACES.length * 4);
  const ao = new Uint8Array(TERRAIN_SURFACES.length * 4);
  for (let index = 0; index < TERRAIN_SURFACES.length; index += 1) {
    const definition = TERRAIN_SURFACES[index];
    const color = new Color(definition.tint);
    colors.set(
      [Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255), 255],
      index * 4,
    );
    normals.set([128, 128, 255, 255], index * 4);
    roughness.set([Math.round(definition.roughness * 255), 0, 0, 255], index * 4);
    ao.set([255, 0, 0, 255], index * 4);
  }
  return {
    albedo: createSurfaceLayerTexture(colors, 1, 1, 1, NoColorSpace),
    normal: createSurfaceLayerTexture(normals, 1, 1, 1, NoColorSpace),
    roughness: createSurfaceLayerTexture(roughness, 1, 1, 1, NoColorSpace),
    ao: createSurfaceLayerTexture(ao, 1, 1, 1, NoColorSpace),
    parameters: createSurfaceParameterTexture(),
  };
}

export async function loadTerrainSurfaceTextures(
  maxAnisotropy = 1,
): Promise<TerrainSurfaceTextureSet> {
  const basePath = (path: string): string =>
    typeof document === 'undefined'
      ? `assets/textures/terrain/${path}`
      : new URL(`assets/textures/terrain/${path}`, document.baseURI).href;
  const loader = new TextureLoader();
  const [albedoAtlas, normalAtlas, roughnessAtlas, aoAtlas] = await Promise.all([
    loader.loadAsync(basePath('terrain-albedo-atlas.webp')),
    loader.loadAsync(basePath('terrain-normal-atlas.webp')),
    loader.loadAsync(basePath('terrain-roughness-atlas.webp')),
    loader.loadAsync(basePath('terrain-ao-atlas.webp')),
  ]);
  const sourceAtlases = [albedoAtlas, normalAtlas, roughnessAtlas, aoAtlas];
  try {
    for (const texture of sourceAtlases) configureTerrainAtlasTexture(texture);
    return {
      albedo: createSurfaceLayerTextureFromAtlas(albedoAtlas, maxAnisotropy, SRGBColorSpace),
      normal: createSurfaceLayerTextureFromAtlas(normalAtlas, maxAnisotropy, NoColorSpace),
      roughness: createSurfaceLayerTextureFromAtlas(roughnessAtlas, maxAnisotropy, NoColorSpace),
      ao: createSurfaceLayerTextureFromAtlas(aoAtlas, maxAnisotropy, NoColorSpace),
      parameters: createSurfaceParameterTexture(),
    };
  } finally {
    for (const texture of sourceAtlases) texture.dispose();
  }
}

/** Configures a source atlas before it is copied into isolated surface layers. */
export function configureTerrainAtlasTexture(texture: Texture): Texture {
  texture.flipY = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Configures an isolated surface layer with stable minification filtering. */
export function configureTerrainSurfaceLayerTexture(
  texture: DataArrayTexture,
  maxAnisotropy = 1,
  colorSpace: typeof NoColorSpace | typeof SRGBColorSpace = NoColorSpace,
): DataArrayTexture {
  texture.flipY = false;
  // Surface UVs are explicitly repeated in the shader. Repeat wrapping lets
  // the mip filter cross a repeat seam without producing a one-texel line.
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.max(1, maxAnisotropy);
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Extracts the atlas cells in their authored top-to-bottom row order. */
export function unpackTerrainAtlasPixels(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  tileSize = TERRAIN_SURFACE_ATLAS_TILE_SIZE,
): Uint8Array {
  const expectedWidth = TERRAIN_SURFACE_ATLAS_COLUMNS * tileSize;
  const expectedHeight = TERRAIN_SURFACE_ATLAS_ROWS * tileSize;
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(
      `Expected a ${expectedWidth}x${expectedHeight} terrain atlas, received ${width}x${height}.`,
    );
  }

  const pixelsPerLayer = tileSize * tileSize * 4;
  const layers = new Uint8Array(TERRAIN_SURFACES.length * pixelsPerLayer);
  for (let surfaceIndex = 0; surfaceIndex < TERRAIN_SURFACES.length; surfaceIndex += 1) {
    const column = surfaceIndex % TERRAIN_SURFACE_ATLAS_COLUMNS;
    const row = Math.floor(surfaceIndex / TERRAIN_SURFACE_ATLAS_COLUMNS);
    const sourceX = column * tileSize;
    const sourceY = row * tileSize;
    const destinationBase = surfaceIndex * pixelsPerLayer;
    for (let y = 0; y < tileSize; y += 1) {
      const sourceBase = ((sourceY + y) * width + sourceX) * 4;
      const destinationBaseForRow = destinationBase + y * tileSize * 4;
      for (let x = 0; x < tileSize * 4; x += 1) {
        layers[destinationBaseForRow + x] = pixels[sourceBase + x];
      }
    }
  }
  return layers;
}

function createSurfaceLayerTextureFromAtlas(
  atlas: Texture,
  maxAnisotropy: number,
  colorSpace: typeof NoColorSpace | typeof SRGBColorSpace,
): DataArrayTexture {
  if (typeof document === 'undefined') {
    throw new Error('Terrain surface atlas unpacking requires a browser document.');
  }
  const image = atlas.image as CanvasImageSource & {
    readonly width: number;
    readonly height: number;
  };
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Unable to create a 2D context for terrain atlas unpacking.');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const data = unpackTerrainAtlasPixels(pixels, image.width, image.height);
  return createSurfaceLayerTexture(
    data,
    TERRAIN_SURFACE_ATLAS_TILE_SIZE,
    TERRAIN_SURFACE_ATLAS_TILE_SIZE,
    maxAnisotropy,
    colorSpace,
  );
}

function createSurfaceLayerTexture(
  data: Uint8Array,
  width: number,
  height: number,
  maxAnisotropy: number,
  colorSpace: typeof NoColorSpace | typeof SRGBColorSpace,
): DataArrayTexture {
  const texture = new DataArrayTexture(data, width, height, TERRAIN_SURFACES.length);
  return configureTerrainSurfaceLayerTexture(texture, maxAnisotropy, colorSpace);
}

function createSurfaceParameterTexture(): DataTexture {
  const data = new Uint8Array(TERRAIN_SURFACES.length * 4);
  for (const definition of TERRAIN_SURFACES) {
    const offset = definition.atlasIndex * 4;
    data[offset] = Math.round((definition.tiling / 8) * 255);
    data[offset + 1] = Math.round(definition.roughness * 255);
    data[offset + 2] = Math.round(definition.normalStrength * 255);
    data[offset + 3] = definition.water ? 255 : 0;
  }
  const texture = new DataTexture(data, TERRAIN_SURFACES.length, 1, RGBAFormat, UnsignedByteType);
  texture.flipY = false;
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function placeholderTexture(data: readonly [number, number, number, number]): DataTexture {
  const texture = new DataTexture(new Uint8Array(data), 1, 1, RGBAFormat, UnsignedByteType);
  texture.flipY = false;
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
