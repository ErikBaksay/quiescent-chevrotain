import {
  DirectionalLight,
  FogExp2,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { calculateSolarState, EnvironmentSystem } from './environment-system';

describe('solar lighting', () => {
  it('keeps the existing sunny composition near 10:30', () => {
    const solar = calculateSolarState(630);

    expect(solar.sunDirection.x).toBeCloseTo(0.52, 1);
    expect(solar.sunDirection.y).toBeCloseTo(0.78, 1);
    expect(solar.sunDirection.z).toBeCloseTo(0.3, 1);
    expect(solar.sunVisibility).toBeGreaterThan(0.99);
    expect(solar.daylight).toBeGreaterThan(0.99);
  });

  it('smoothly transitions through sunrise and sunset', () => {
    const beforeSunrise = calculateSolarState(5 * 60 + 59);
    const sunrise = calculateSolarState(6 * 60);
    const afterSunrise = calculateSolarState(6 * 60 + 1);
    const sunset = calculateSolarState(18 * 60);

    expect(beforeSunrise.sunElevation).toBeLessThan(0);
    expect(sunrise.sunElevation).toBeCloseTo(0, 6);
    expect(afterSunrise.sunElevation).toBeGreaterThan(0);
    expect(sunset.sunElevation).toBeCloseTo(0, 6);
    expect(sunrise.sunLightFactor).toBeLessThan(0.05);
    expect(afterSunrise.sunVisibility).toBeGreaterThan(beforeSunrise.sunVisibility);
  });

  it('keeps nighttime visible through moonlight and bounded values', () => {
    const midnight = calculateSolarState(0);

    expect(midnight.moonVisibility).toBeGreaterThan(0.99);
    expect(midnight.sunVisibility).toBeLessThan(0.01);
    expect(midnight.sunDirection.length()).toBeCloseTo(1, 6);
    expect(midnight.moonDirection.length()).toBeCloseTo(1, 6);
  });

  it('provides distinct blue-hour, sunrise, golden-hour, and sunset weights', () => {
    const blueHour = calculateSolarState(5 * 60 + 30);
    const sunrise = calculateSolarState(6 * 60 + 15);
    const goldenHour = calculateSolarState(17 * 60);
    const sunset = calculateSolarState(18 * 60 + 30);
    const midnight = calculateSolarState(23 * 60);

    expect(blueHour.blueHour).toBeGreaterThan(0.9);
    expect(sunrise.dawn).toBeGreaterThan(0.9);
    expect(goldenHour.goldenHour).toBeGreaterThan(0.9);
    expect(sunset.dusk).toBeGreaterThan(0.9);
    expect(sunrise.horizonGlow).toBeGreaterThan(midnight.horizonGlow);
    expect(sunset.horizonGlow).toBeGreaterThan(midnight.horizonGlow);
    expect(midnight.horizonGlow).toBeLessThan(0.1);
  });

  it('keeps atmospheric weights bounded and solar directions normalized', () => {
    for (let minutes = 0; minutes < 1_440; minutes += 30) {
      const solar = calculateSolarState(minutes);

      expect(solar.sunDirection.length()).toBeCloseTo(1, 6);
      expect(solar.moonDirection.length()).toBeCloseTo(1, 6);
      for (const weight of [
        solar.sunVisibility,
        solar.sunLightFactor,
        solar.daylight,
        solar.blueHour,
        solar.dawn,
        solar.dusk,
        solar.goldenHour,
        solar.horizonGlow,
        solar.atmosphereHaze,
        solar.moonVisibility,
      ]) {
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('EnvironmentSystem', () => {
  it('updates lights, fog, and sky uniforms from time', () => {
    const scene = new Scene();
    const environment = new EnvironmentSystem(scene);
    const camera = new PerspectiveCamera(45, 1, 0.1, 1_000);

    environment.update(camera, 0);
    const sun = scene.getObjectByName('Sun') as DirectionalLight;
    const moon = scene.getObjectByName('Moonlight') as DirectionalLight;
    const sky = scene.getObjectByName('Sky');
    const fog = scene.fog as FogExp2;
    const skyMaterial = (sky as unknown as { material: ShaderMaterial }).material;
    const halo = scene.getObjectByName('Sun halo') as Mesh;
    const haloMaterial = halo.material as ShaderMaterial;

    expect(sun.intensity).toBeGreaterThan(moon.intensity);
    expect(sun.castShadow).toBe(true);
    expect(fog.density).toBeGreaterThan(0);
    expect(skyMaterial.uniforms['sunVisibility'].value).toBeGreaterThan(0.99);
    expect(skyMaterial.uniforms['upperSkyColor']).toBeDefined();
    expect(skyMaterial.uniforms['lowerHorizonColor']).toBeDefined();
    expect(skyMaterial.uniforms['horizonGlowStrength'].value).toBe(0);
    expect(halo.visible).toBe(false);

    environment.setTimeOfDay(0);
    environment.update(camera, 0);

    expect(moon.intensity).toBeGreaterThan(sun.intensity);
    expect(sun.castShadow).toBe(false);
    expect(skyMaterial.uniforms['starsIntensity'].value).toBeGreaterThan(0.8);
    expect(skyMaterial.uniforms['horizonGlowStrength'].value).toBe(0);

    environment.setTimeOfDay(18 * 60 + 10);
    camera.lookAt(new Vector3(-857, -40, 498));
    camera.updateMatrixWorld(true);
    environment.update(camera, 0);

    expect(skyMaterial.uniforms['horizonGlowStrength'].value).toBeGreaterThan(0.9);
    expect(halo.visible).toBe(true);
    expect(haloMaterial.uniforms['intensity'].value).toBeGreaterThan(0.9);

    environment.dispose();
  });

  it('supports paused and accelerated playback using clamped frame deltas', () => {
    const environment = new EnvironmentSystem(new Scene());
    const camera = new PerspectiveCamera(45, 1, 0.1, 1_000);
    const initial = environment.getState().timeOfDayMinutes;

    environment.setPaused(true);
    environment.update(camera, 1);
    expect(environment.getState().timeOfDayMinutes).toBe(initial);

    environment.setPaused(false);
    environment.setTimeScale(4);
    environment.update(camera, 0.1);
    expect(environment.getState().timeOfDayMinutes).toBeCloseTo(initial + 0.8, 5);

    environment.dispose();
  });
});
