import {
  BackSide,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

/** Owns Stage 1 sky, atmosphere, and outdoor lighting. */
export class EnvironmentSystem {
  private readonly root = new Group();
  private readonly skyGeometry = new SphereGeometry(3_000, 32, 16);
  private readonly skyMaterial: ShaderMaterial;
  private readonly sky: Mesh;

  constructor(private readonly scene: Scene) {
    const horizonColor = new Color(0xcbdcc9);
    this.scene.background = horizonColor;
    this.scene.fog = new FogExp2(horizonColor, 0.00085);

    this.skyMaterial = this.createSkyMaterial();
    this.sky = new Mesh(this.skyGeometry, this.skyMaterial);
    this.sky.name = 'Sky';
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;

    const hemisphereLight = new HemisphereLight(0xddeeff, 0x53623e, 2.25);
    hemisphereLight.name = 'Ambient sky light';

    const sun = new DirectionalLight(0xffedc4, 3.6);
    sun.name = 'Sun';
    sun.position.set(280, 420, 160);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2_048, 2_048);
    sun.shadow.camera.near = 50;
    sun.shadow.camera.far = 850;
    sun.shadow.camera.left = -280;
    sun.shadow.camera.right = 280;
    sun.shadow.camera.top = 280;
    sun.shadow.camera.bottom = -280;
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.025;

    this.root.name = 'Environment';
    this.root.add(hemisphereLight, sun, sun.target);
    this.scene.add(this.sky, this.root);
  }

  update(camera: PerspectiveCamera): void {
    this.sky.position.copy(camera.position);
  }

  dispose(): void {
    this.scene.remove(this.sky, this.root);
    this.skyGeometry.dispose();
    this.skyMaterial.dispose();
  }

  private createSkyMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        zenithColor: { value: new Color(0x78aeda) },
        horizonColor: { value: new Color(0xdce8d8) },
        groundColor: { value: new Color(0x9eb17f) },
        sunColor: { value: new Color(0xffefc6) },
        sunDirection: { value: new Vector3(0.52, 0.78, 0.34).normalize() },
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
        uniform vec3 horizonColor;
        uniform vec3 groundColor;
        uniform vec3 sunColor;
        uniform vec3 sunDirection;
        varying vec3 vDirection;

        void main() {
          vec3 direction = normalize(vDirection);
          float elevation = direction.y;
          float skyBlend = smoothstep(-0.08, 0.68, elevation);
          float groundBlend = smoothstep(-0.42, -0.02, elevation);
          vec3 color = mix(horizonColor, zenithColor, skyBlend);
          color = mix(groundColor, color, groundBlend);

          float sunGlow = pow(max(dot(direction, sunDirection), 0.0), 96.0);
          color += sunColor * sunGlow * 0.55;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
  }
}
