import {
  DataArrayTexture,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  ShaderLib,
  Texture,
  UnsignedByteType,
  Vector2,
} from 'three';
import { describe, expect, it } from 'vitest';
import {
  configureTerrainAtlasTexture,
  configureTerrainSurfaceLayerTexture,
  createFallbackTerrainSurfaceTextures,
  createTerrainSurfaceMaterial,
  unpackTerrainAtlasPixels,
} from './terrain-surface-material';

describe('terrain surface material', () => {
  it('keeps generated atlas rows aligned with surface indices', () => {
    const texture = new Texture();
    texture.flipY = true;

    configureTerrainAtlasTexture(texture);

    expect(texture.flipY).toBe(false);
    texture.dispose();
  });

  it('unpacks atlas cells into surface layers without changing row order', () => {
    const pixels = new Uint8Array(6 * 4 * 4);
    for (let index = 0; index < 24; index += 1) {
      pixels.set([index, index + 1, index + 2, 255], index * 4);
    }

    const layers = unpackTerrainAtlasPixels(pixels, 6, 4, 1);

    expect([...layers.slice(0, 4)]).toEqual([0, 1, 2, 255]);
    expect([...layers.slice(7 * 4, 8 * 4)]).toEqual([7, 8, 9, 255]);
    expect([...layers.slice(23 * 4, 24 * 4)]).toEqual([23, 24, 25, 255]);
  });

  it('configures surface layers for trilinear minification and anisotropy', () => {
    const texture = new DataArrayTexture(new Uint8Array(24 * 4), 1, 1, 24);

    configureTerrainSurfaceLayerTexture(texture, 8, SRGBColorSpace);

    expect(texture.flipY).toBe(false);
    expect(texture.wrapS).toBe(RepeatWrapping);
    expect(texture.wrapT).toBe(RepeatWrapping);
    expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
    expect(texture.magFilter).toBe(LinearFilter);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.anisotropy).toBe(8);
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    texture.dispose();
  });

  it('injects the current Three.js tangent-frame normal path', () => {
    const layerIds = new DataTexture(
      new Uint8Array([0, 0, 0, 255]),
      1,
      1,
      RGBAFormat,
      UnsignedByteType,
    );
    const layerWeights = new DataTexture(
      new Uint8Array([255, 0, 0, 0]),
      1,
      1,
      RGBAFormat,
      UnsignedByteType,
    );
    layerIds.minFilter = NearestFilter;
    layerIds.magFilter = NearestFilter;
    layerWeights.minFilter = NearestFilter;
    layerWeights.magFilter = NearestFilter;
    const textures = createFallbackTerrainSurfaceTextures();
    const material = createTerrainSurfaceMaterial({
      textures,
      layerIds,
      layerWeights,
      tileWorldSize: new Vector2(8, 8),
    });
    const shader = {
      uniforms: {},
      fragmentShader: ShaderLib.standard.fragmentShader,
    };

    material.onBeforeCompile?.(shader as never, {} as never);

    expect(shader.fragmentShader).toContain('normal = normalize(tbn * terrainMapNormal)');
    expect(shader.fragmentShader).not.toContain('perturbNormal2Arb');
    expect(shader.fragmentShader).toContain('sampler2DArray surfaceAlbedoLayers');
    expect(shader.fragmentShader).toContain('texture(surfaceAlbedoLayers');
    expect(shader.fragmentShader).not.toContain('textureGrad(surfaceAlbedoLayers');
    expect(shader.fragmentShader).not.toContain('surfaceAlbedoAtlas');
    expect(shader.fragmentShader).toContain('surfaceLayerWeights');
    expect(shader.fragmentShader).toContain('float roughnessFactor = terrainRoughness;');

    material.dispose();
    layerIds.dispose();
    layerWeights.dispose();
    for (const texture of Object.values(textures)) texture.dispose();
  });

  it('uses isolated array layers for fallback materials', () => {
    const textures = createFallbackTerrainSurfaceTextures();

    expect(textures.albedo).toBeInstanceOf(DataArrayTexture);
    expect(textures.albedo.image.width).toBe(1);
    expect(textures.albedo.image.height).toBe(1);
    expect(textures.albedo.image.depth).toBe(24);
    expect(textures.parameters.minFilter).toBe(NearestFilter);
    expect(textures.albedo.colorSpace).toBe(NoColorSpace);

    for (const texture of Object.values(textures)) texture.dispose();
  });
});
