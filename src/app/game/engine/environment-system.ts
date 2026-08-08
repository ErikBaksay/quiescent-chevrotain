import {
  AdditiveBlending,
  BackSide,
  Color,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import {
  DEFAULT_TIME_OF_DAY_MINUTES,
  DEFAULT_TIME_SCALE,
  EnvironmentState,
  GAME_MINUTES_PER_REAL_SECOND,
  getEnvironmentPhase,
  normalizeTimeOfDay,
  TIME_SCALES,
} from './environment.types';

const SUNRISE_MINUTES = 6 * 60;
const SUNSET_MINUTES = 18 * 60;
const MAX_SUN_ELEVATION = MathUtils.degToRad(55);
const SUN_DISTANCE = 500;
const SUN_HALO_DISTANCE = 460;
const REFERENCE_SUN_AZIMUTH = Math.atan2(160, 280);
const REFERENCE_TIME_PROGRESS = (10.5 - 6) / 12;

export interface SolarState {
  readonly sunDirection: Vector3;
  readonly moonDirection: Vector3;
  readonly sunElevation: number;
  readonly sunVisibility: number;
  readonly sunLightFactor: number;
  readonly daylight: number;
  readonly blueHour: number;
  readonly dawn: number;
  readonly dusk: number;
  readonly goldenHour: number;
  readonly horizonGlow: number;
  readonly atmosphereHaze: number;
  readonly moonVisibility: number;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function bellWeight(
  value: number,
  start: number,
  peakStart: number,
  peakEnd: number,
  end: number,
): number {
  return smoothstep(start, peakStart, value) * (1 - smoothstep(peakEnd, end, value));
}

/** Returns a stable, art-directed equinox-like solar path for the fixed world. */
export function calculateSolarState(
  minutes: number,
  sunDirection = new Vector3(),
  moonDirection = new Vector3(),
): SolarState {
  const time = normalizeTimeOfDay(minutes);
  const dayProgress = (time - SUNRISE_MINUTES) / (SUNSET_MINUTES - SUNRISE_MINUTES);
  const sunElevation = Math.sin(dayProgress * Math.PI) * MAX_SUN_ELEVATION;
  const sunAzimuth = REFERENCE_SUN_AZIMUTH + (dayProgress - REFERENCE_TIME_PROGRESS) * Math.PI;
  const horizontalLength = Math.cos(sunElevation);

  sunDirection.set(
    Math.cos(sunAzimuth) * horizontalLength,
    Math.sin(sunElevation),
    Math.sin(sunAzimuth) * horizontalLength,
  );
  moonDirection.copy(sunDirection).negate();

  const sunVisibility = smoothstep(-0.12, 0.08, sunElevation);
  const sunLightFactor = smoothstep(-0.02, 0.16, sunElevation);
  const daylight = smoothstep(0.04, 0.22, sunElevation);
  const morningBlueHour = bellWeight(time, 4 * 60 + 20, 5 * 60, 5 * 60 + 45, 6 * 60 + 25);
  const eveningBlueHour = bellWeight(time, 19 * 60 + 10, 19 * 60 + 50, 20 * 60 + 20, 21 * 60);
  const dawn = bellWeight(time, 5 * 60 + 20, 5 * 60 + 55, 6 * 60 + 35, 7 * 60 + 45);
  const dusk = bellWeight(time, 17 * 60 + 10, 17 * 60 + 55, 18 * 60 + 40, 20 * 60);
  const morningGoldenHour = bellWeight(time, 5 * 60 + 45, 6 * 60 + 15, 7 * 60 + 10, 8 * 60 + 20);
  const eveningGoldenHour = bellWeight(time, 15 * 60 + 20, 16 * 60, 17 * 60 + 55, 18 * 60 + 50);
  const blueHour = Math.max(morningBlueHour, eveningBlueHour);
  const goldenHour = Math.max(morningGoldenHour, eveningGoldenHour);
  const horizonGlow = MathUtils.clamp(
    Math.max(dawn, dusk) * 1.1 + goldenHour * 0.55 + blueHour * 0.22,
    0,
    1,
  );
  const atmosphereHaze = MathUtils.clamp(
    Math.max(dawn, dusk) * 0.82 + blueHour * 0.62 + (1 - daylight) * 0.08,
    0,
    1,
  );
  const moonVisibility = 1 - smoothstep(-0.18, 0.12, sunElevation);

  return {
    sunDirection,
    moonDirection,
    sunElevation,
    sunVisibility,
    sunLightFactor,
    daylight,
    blueHour,
    dawn,
    dusk,
    goldenHour,
    horizonGlow,
    atmosphereHaze,
    moonVisibility,
  };
}

/** Owns the procedural sky, atmosphere, and time-dependent outdoor lighting. */
export class EnvironmentSystem {
  private readonly root = new Group();
  private readonly skyGeometry = new SphereGeometry(3_000, 32, 16);
  private readonly skyMaterial: ShaderMaterial;
  private readonly sky: Mesh;
  private readonly sunHaloGeometry = new PlaneGeometry(2, 2);
  private readonly sunHaloMaterial: ShaderMaterial;
  private readonly sunHalo: Mesh;
  private readonly sun: DirectionalLight;
  private readonly moon: DirectionalLight;
  private readonly hemisphereLight: HemisphereLight;
  private readonly sunTarget = new Group();
  private readonly sunDirection = new Vector3();
  private readonly moonDirection = new Vector3();
  private readonly sunOffset = new Vector3();
  private readonly haloDirection = new Vector3();
  private readonly cameraDirection = new Vector3();
  private readonly warmSunColor = new Color(0xff8d52);
  private readonly daySunColor = new Color(0xffedc4);
  private readonly moonColor = new Color(0x9eb9e5);
  private readonly nightZenithColor = new Color(0x0b1630);
  private readonly blueHourZenithColor = new Color(0x3b416d);
  private readonly dawnZenithColor = new Color(0x93617f);
  private readonly duskZenithColor = new Color(0x5b416e);
  private readonly goldenZenithColor = new Color(0x6a6194);
  private readonly dayZenithColor = new Color(0x5b91c4);
  private readonly nightUpperSkyColor = new Color(0x17233f);
  private readonly blueHourUpperSkyColor = new Color(0x59628c);
  private readonly dawnUpperSkyColor = new Color(0xd17b80);
  private readonly duskUpperSkyColor = new Color(0x98617b);
  private readonly goldenUpperSkyColor = new Color(0xd07a69);
  private readonly dayUpperSkyColor = new Color(0x9ac5df);
  private readonly nightHorizonColor = new Color(0x273448);
  private readonly blueHourHorizonColor = new Color(0x666786);
  private readonly dawnHorizonColor = new Color(0xffa067);
  private readonly duskHorizonColor = new Color(0xf17b55);
  private readonly goldenHorizonColor = new Color(0xffb45d);
  private readonly dayHorizonColor = new Color(0xd7e8e4);
  private readonly nightLowerHorizonColor = new Color(0x233040);
  private readonly blueHourLowerHorizonColor = new Color(0x62657d);
  private readonly dawnLowerHorizonColor = new Color(0xe68a68);
  private readonly duskLowerHorizonColor = new Color(0xd96b50);
  private readonly goldenLowerHorizonColor = new Color(0xe7975d);
  private readonly dayLowerHorizonColor = new Color(0xb5caa9);
  private readonly nightGroundColor = new Color(0x101c27);
  private readonly dayGroundColor = new Color(0x9eb17f);
  private readonly warmGroundColor = new Color(0x9a6a4d);
  private readonly dayFogColor = new Color(0xc3d8cf);
  private readonly colorScratch = new Color();
  private readonly colorScratchTwo = new Color();
  private readonly colorScratchThree = new Color();
  private readonly colorScratchFour = new Color();
  private readonly fog: FogExp2;
  private shadowsEnabled = true;
  private timeOfDayMinutes = DEFAULT_TIME_OF_DAY_MINUTES;
  private paused = false;
  private timeScale = DEFAULT_TIME_SCALE;

  constructor(private readonly scene: Scene) {
    this.fog = new FogExp2(this.dayFogColor, 0.00078);
    this.scene.background = this.dayHorizonColor;
    this.scene.fog = this.fog;

    this.skyMaterial = this.createSkyMaterial();
    this.sky = new Mesh(this.skyGeometry, this.skyMaterial);
    this.sky.name = 'Sky';
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;

    this.sunHaloMaterial = this.createSunHaloMaterial();
    this.sunHalo = new Mesh(this.sunHaloGeometry, this.sunHaloMaterial);
    this.sunHalo.name = 'Sun halo';
    this.sunHalo.visible = false;
    this.sunHalo.renderOrder = 1;

    this.hemisphereLight = new HemisphereLight(this.dayUpperSkyColor, this.dayGroundColor, 2.25);
    this.hemisphereLight.name = 'Ambient sky light';

    this.sun = new DirectionalLight(this.daySunColor, 3.6);
    this.sun.name = 'Sun';
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2_048, 2_048);
    this.sun.shadow.camera.near = 50;
    this.sun.shadow.camera.far = 850;
    this.sun.shadow.camera.left = -280;
    this.sun.shadow.camera.right = 280;
    this.sun.shadow.camera.top = 280;
    this.sun.shadow.camera.bottom = -280;
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.025;
    this.sun.target = this.sunTarget;

    this.moon = new DirectionalLight(this.moonColor, 0.2);
    this.moon.name = 'Moonlight';
    this.moon.castShadow = false;
    this.moon.target = this.sunTarget;

    this.root.name = 'Environment';
    this.root.add(this.hemisphereLight, this.sun, this.moon, this.sunTarget, this.sunHalo);
    this.scene.add(this.sky, this.root);
  }

  getState(): EnvironmentState {
    return {
      timeOfDayMinutes: this.timeOfDayMinutes,
      paused: this.paused,
      timeScale: this.timeScale,
      phase: getEnvironmentPhase(this.timeOfDayMinutes),
    };
  }

  setTimeOfDay(minutes: number): void {
    this.timeOfDayMinutes = normalizeTimeOfDay(minutes);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  setTimeScale(timeScale: number): void {
    if (!Number.isFinite(timeScale)) return;
    this.timeScale = TIME_SCALES.reduce((closest, candidate) =>
      Math.abs(candidate - timeScale) < Math.abs(closest - timeScale) ? candidate : closest,
    );
  }

  update(camera: PerspectiveCamera, deltaSeconds: number): void {
    const delta = MathUtils.clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, 0.1);
    if (!this.paused && delta > 0) {
      this.timeOfDayMinutes = normalizeTimeOfDay(
        this.timeOfDayMinutes + delta * GAME_MINUTES_PER_REAL_SECOND * this.timeScale,
      );
    }

    this.updateLighting(camera);
  }

  dispose(): void {
    this.scene.remove(this.sky, this.root);
    this.skyGeometry.dispose();
    this.skyMaterial.dispose();
    this.sunHaloGeometry.dispose();
    this.sunHaloMaterial.dispose();
  }

  private updateLighting(camera: PerspectiveCamera): void {
    const solar = calculateSolarState(this.timeOfDayMinutes, this.sunDirection, this.moonDirection);

    this.sky.position.copy(camera.position);
    this.sunTarget.position.set(camera.position.x, 0, camera.position.z);
    this.sunOffset.copy(solar.sunDirection).multiplyScalar(SUN_DISTANCE);
    this.sun.position.copy(this.sunTarget.position).add(this.sunOffset);
    this.moon.position
      .copy(this.sunTarget.position)
      .addScaledVector(solar.moonDirection, SUN_DISTANCE);

    this.colorScratch.copy(this.warmSunColor).lerp(this.daySunColor, solar.daylight);
    this.sun.color.copy(this.colorScratch);
    this.sun.intensity = 3.65 * solar.sunLightFactor;
    this.updateShadowState(solar);
    this.sun.shadow.bias = MathUtils.lerp(-0.00038, -0.00015, solar.daylight);
    this.sun.shadow.normalBias = MathUtils.lerp(0.045, 0.022, solar.daylight);
    const shadowSpan = MathUtils.lerp(320, 500, solar.horizonGlow);
    this.sun.shadow.camera.left = -shadowSpan;
    this.sun.shadow.camera.right = shadowSpan;
    this.sun.shadow.camera.top = shadowSpan;
    this.sun.shadow.camera.bottom = -shadowSpan;
    this.sun.shadow.camera.far = MathUtils.lerp(850, 1_050, solar.horizonGlow);
    this.sun.shadow.camera.updateProjectionMatrix();

    this.moon.color.copy(this.moonColor);
    this.moon.intensity = 0.22 * solar.moonVisibility;

    this.applyPalette(
      this.colorScratch,
      this.nightUpperSkyColor,
      this.dayUpperSkyColor,
      this.blueHourUpperSkyColor,
      this.dawnUpperSkyColor,
      this.duskUpperSkyColor,
      this.goldenUpperSkyColor,
      solar,
    );
    this.hemisphereLight.color.copy(this.colorScratch);
    this.applyPalette(
      this.colorScratchTwo,
      this.nightGroundColor,
      this.dayGroundColor,
      this.nightGroundColor,
      this.warmGroundColor,
      this.warmGroundColor,
      this.warmGroundColor,
      solar,
    );
    this.hemisphereLight.groundColor.copy(this.colorScratchTwo);
    this.hemisphereLight.intensity = MathUtils.lerp(0.38, 2.2, solar.daylight);
    this.hemisphereLight.intensity += solar.horizonGlow * 0.22;

    this.applyPalette(
      this.colorScratchThree,
      this.nightLowerHorizonColor,
      this.dayLowerHorizonColor,
      this.blueHourLowerHorizonColor,
      this.dawnLowerHorizonColor,
      this.duskLowerHorizonColor,
      this.goldenLowerHorizonColor,
      solar,
    );
    this.fog.color.copy(this.colorScratchThree);
    this.fog.density = MathUtils.lerp(0.00076, 0.00112, solar.atmosphereHaze);
    this.scene.background = this.fog.color;

    const uniforms = this.skyMaterial.uniforms;
    this.applyPalette(
      this.colorScratch,
      this.nightZenithColor,
      this.dayZenithColor,
      this.blueHourZenithColor,
      this.dawnZenithColor,
      this.duskZenithColor,
      this.goldenZenithColor,
      solar,
    );
    uniforms['zenithColor'].value.copy(this.colorScratch);
    this.applyPalette(
      this.colorScratchTwo,
      this.nightUpperSkyColor,
      this.dayUpperSkyColor,
      this.blueHourUpperSkyColor,
      this.dawnUpperSkyColor,
      this.duskUpperSkyColor,
      this.goldenUpperSkyColor,
      solar,
    );
    uniforms['upperSkyColor'].value.copy(this.colorScratchTwo);
    this.applyPalette(
      this.colorScratchThree,
      this.nightHorizonColor,
      this.dayHorizonColor,
      this.blueHourHorizonColor,
      this.dawnHorizonColor,
      this.duskHorizonColor,
      this.goldenHorizonColor,
      solar,
    );
    uniforms['horizonColor'].value.copy(this.colorScratchThree);
    this.applyPalette(
      this.colorScratchFour,
      this.nightLowerHorizonColor,
      this.dayLowerHorizonColor,
      this.blueHourLowerHorizonColor,
      this.dawnLowerHorizonColor,
      this.duskLowerHorizonColor,
      this.goldenLowerHorizonColor,
      solar,
    );
    uniforms['lowerHorizonColor'].value.copy(this.colorScratchFour);
    this.applyPalette(
      this.colorScratchFour,
      this.nightGroundColor,
      this.dayGroundColor,
      this.nightGroundColor,
      this.warmGroundColor,
      this.warmGroundColor,
      this.warmGroundColor,
      solar,
    );
    uniforms['groundColor'].value.copy(this.colorScratchFour);
    uniforms['sunColor'].value.copy(this.sun.color);
    uniforms['sunDirection'].value.copy(solar.sunDirection);
    uniforms['sunVisibility'].value = solar.sunVisibility;
    uniforms['horizonGlowColor'].value.copy(this.colorScratchThree);
    uniforms['horizonGlowStrength'].value = solar.horizonGlow;
    uniforms['sunHaloStrength'].value = solar.horizonGlow * (0.65 + solar.sunVisibility * 0.35);
    uniforms['moonColor'].value.copy(this.moonColor);
    uniforms['moonDirection'].value.copy(solar.moonDirection);
    uniforms['moonVisibility'].value = solar.moonVisibility;
    uniforms['starsIntensity'].value = solar.moonVisibility * 0.85;

    this.sunHalo.position
      .copy(this.sunTarget.position)
      .addScaledVector(solar.sunDirection, SUN_HALO_DISTANCE);
    this.sunHalo.quaternion.copy(camera.quaternion);
    this.sunHalo.scale.setScalar(36 + solar.horizonGlow * 28);
    camera.getWorldDirection(this.cameraDirection);
    this.haloDirection.copy(this.sunHalo.position).sub(camera.position).normalize();
    this.sunHalo.visible =
      solar.horizonGlow > 0.015 &&
      solar.sunVisibility > 0.015 &&
      this.cameraDirection.dot(this.haloDirection) > -0.12;
    this.sunHaloMaterial.uniforms['sunColor'].value.copy(this.sun.color);
    this.sunHaloMaterial.uniforms['intensity'].value = solar.horizonGlow;
  }

  private applyPalette(
    target: Color,
    night: Color,
    day: Color,
    blueHour: Color,
    dawn: Color,
    dusk: Color,
    goldenHour: Color,
    solar: SolarState,
  ): void {
    target.copy(night).lerp(day, solar.daylight);
    target.lerp(blueHour, solar.blueHour * 0.92);
    target.lerp(dawn, solar.dawn * 0.95);
    target.lerp(dusk, solar.dusk * 0.95);
    target.lerp(goldenHour, solar.goldenHour * 0.72);
  }

  private updateShadowState(solar: SolarState): void {
    if (this.shadowsEnabled) {
      if (solar.sunLightFactor < 0.015 && solar.sunElevation < -0.08) {
        this.shadowsEnabled = false;
      }
    } else if (solar.sunLightFactor > 0.08 || solar.sunElevation > 0.02) {
      this.shadowsEnabled = true;
    }
    this.sun.castShadow = this.shadowsEnabled;
  }

  private createSunHaloMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      toneMapped: false,
      uniforms: {
        sunColor: { value: new Color(0xffb15f) },
        intensity: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 sunColor;
        uniform float intensity;
        varying vec2 vUv;

        void main() {
          vec2 centered = vUv - 0.5;
          float distanceFromCenter = length(centered) * 2.0;
          float disc = 1.0 - smoothstep(0.16, 0.25, distanceFromCenter);
          float glow = pow(max(0.0, 1.0 - distanceFromCenter), 2.2);
          float alpha = (disc * 0.95 + glow * 0.22) * intensity;
          vec3 color = sunColor * (disc * 1.3 + glow * 0.34);
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
  }

  private createSkyMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        zenithColor: { value: new Color(0x5b91c4) },
        upperSkyColor: { value: new Color(0x9ac5df) },
        horizonColor: { value: new Color(0xd7e8e4) },
        lowerHorizonColor: { value: new Color(0xb5caa9) },
        groundColor: { value: new Color(0x9eb17f) },
        sunColor: { value: new Color(0xffedc4) },
        sunDirection: { value: new Vector3(0.52, 0.78, 0.34).normalize() },
        sunVisibility: { value: 1 },
        horizonGlowColor: { value: new Color(0xffa067) },
        horizonGlowStrength: { value: 0 },
        sunHaloStrength: { value: 0 },
        moonColor: { value: new Color(0x9eb9e5) },
        moonDirection: { value: new Vector3(-0.52, -0.78, -0.34).normalize() },
        moonVisibility: { value: 0 },
        starsIntensity: { value: 0 },
      },
      vertexShader: `
        varying vec3 vDirection;

        void main() {
          vDirection = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 zenithColor;
        uniform vec3 upperSkyColor;
        uniform vec3 horizonColor;
        uniform vec3 lowerHorizonColor;
        uniform vec3 groundColor;
        uniform vec3 sunColor;
        uniform vec3 sunDirection;
        uniform float sunVisibility;
        uniform vec3 horizonGlowColor;
        uniform float horizonGlowStrength;
        uniform float sunHaloStrength;
        uniform vec3 moonColor;
        uniform vec3 moonDirection;
        uniform float moonVisibility;
        uniform float starsIntensity;
        varying vec3 vDirection;

        void main() {
          vec3 direction = normalize(vDirection);
          float elevation = direction.y;

          vec3 color = mix(groundColor, lowerHorizonColor, smoothstep(-0.44, -0.02, elevation));
          color = mix(color, horizonColor, smoothstep(-0.08, 0.18, elevation));
          color = mix(color, upperSkyColor, smoothstep(0.14, 0.52, elevation));
          color = mix(color, zenithColor, smoothstep(0.46, 0.9, elevation));

          vec3 sunHorizontal = normalize(vec3(sunDirection.x, 0.0001, sunDirection.z));
          vec3 viewHorizontal = normalize(vec3(direction.x, 0.0001, direction.z));
          float horizontalAlignment = max(dot(viewHorizontal, sunHorizontal), 0.0);
          float horizonBand = 1.0 - smoothstep(0.02, 0.42, abs(elevation));
          float directionalGlow = pow(horizontalAlignment, 3.4) * horizonBand;
          color += horizonGlowColor * directionalGlow * horizonGlowStrength * 0.72;

          float sunDot = max(dot(direction, sunDirection), 0.0);
          float sunGlow = pow(sunDot, 22.0) * sunHaloStrength * 0.28;
          float sunDisc = pow(sunDot, 512.0) * sunVisibility * 1.7;
          color += sunColor * (sunGlow + sunDisc);

          float moonDot = max(dot(direction, moonDirection), 0.0);
          float moonGlow = pow(moonDot, 36.0) * moonVisibility * 0.08;
          float moonDisc = pow(moonDot, 768.0) * moonVisibility * 0.5;
          color += moonColor * (moonGlow + moonDisc);

          float starCell = fract(sin(dot(floor(direction * 220.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float stars = step(0.9985, starCell) * smoothstep(0.0, 0.3, elevation) * starsIntensity;
          color += vec3(stars);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
  }
}
