/**
 * @file src/world/SceneManager.js
 * @description Core 3D rendering engine, Hillaire-inspired atmospheric sky dome,
 * dynamic day/night directional sun & shadow system, post-processing pipeline
 * (ACESFilmic tone mapping + UnrealBloomPass), and tactical 3rd-person orbit/zoom
 * camera controller for Genesis Bastion.
 *
 * Inspired by visual techniques from `dgreenheck/tidewater`:
 * - Physical Rayleigh & Mie horizon scattering with solar corona and twilight golden hour
 * - Emerging nocturnal starfield and subtle aurora/galactic zenith tint at night
 * - Texel-snapped cascading-style PCFSoftShadowMap following the player
 * - Balanced UnrealBloomPass so fire mutations (`pyro_gland`), Scout Patient Zero sky
 *   beacons, and Bastion lanterns glow richly without washing out terrain readability.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CONFIG } from '../config.js';
import { clamp, lerp } from '../utils/math.js';
import { logger } from '../utils/logger.js';

/**
 * Vertex shader for the Hillaire-inspired procedural Atmospheric Sky Dome.
 */
const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec3 vViewDir;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vViewDir = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

/**
 * Fragment shader for the procedural Atmospheric Sky Dome:
 * - Rayleigh & Mie scattering approximation across zenith, horizon, and solar azimuth
 * - Crisp solar disk + warm Mie forward-scattering halo
 * - Golden hour amber/crimson twilight transitions
 * - Procedural multi-layer twinkling starfield & subtle nocturnal nebula band
 * - High-altitude cirrus cloud wisps
 */
const SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uNightFactor;
  uniform float uTwilightFactor;

  varying vec3 vWorldPosition;
  varying vec3 vViewDir;

  // Deterministic 3D hash for procedural starfield
  float hash31(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  // Smooth value noise for high-altitude cirrus clouds
  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash31(vec3(i, 0.0));
    float b = hash31(vec3(i + vec2(1.0, 0.0), 0.0));
    float c = hash31(vec3(i + vec2(0.0, 1.0), 0.0));
    float d = hash31(vec3(i + vec2(1.0, 1.0), 0.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Henyey-Greenstein phase function for Mie aerosol forward scattering
  float henyeyGreenstein(float cosTheta, float g) {
    float g2 = g * g;
    float denom = max(0.001, pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
    return (1.0 - g2) / (4.0 * 3.14159265 * denom);
  }

  void main() {
    vec3 dir = normalize(vViewDir);
    vec3 sunDir = normalize(uSunDir);

    float zenithAngle = clamp(dir.y, 0.0, 1.0);
    float horizonFactor = pow(1.0 - zenithAngle, 3.2);
    float cosTheta = dot(dir, sunDir);

    // Day Rayleigh palette (Tidewater-style crisp ocean sky)
    vec3 dayZenith = vec3(0.11, 0.32, 0.64);
    vec3 dayHorizon = vec3(0.56, 0.79, 0.94);

    // Twilight / Golden Hour palette
    vec3 duskZenith = vec3(0.14, 0.19, 0.42);
    vec3 duskHorizon = vec3(0.95, 0.46, 0.24);
    vec3 duskGlow = vec3(1.00, 0.72, 0.34);

    // Nocturnal palette
    vec3 nightZenith = vec3(0.025, 0.045, 0.095);
    vec3 nightHorizon = vec3(0.065, 0.115, 0.205);

    // Blend zenith & horizon across Day -> Twilight -> Night
    vec3 zenithCol = mix(dayZenith, duskZenith, uTwilightFactor);
    zenithCol = mix(zenithCol, nightZenith, uNightFactor);

    vec3 horizonCol = mix(dayHorizon, duskHorizon, uTwilightFactor);
    horizonCol = mix(horizonCol, nightHorizon, uNightFactor);

    vec3 skyColor = mix(zenithCol, horizonCol, horizonFactor);

    // Azimuthal warm horizon blush toward the sun during golden hour
    float sunAzimuthGlow = pow(max(0.0, cosTheta), 2.5) * pow(1.0 - zenithAngle, 1.8);
    skyColor += duskGlow * sunAzimuthGlow * (0.45 * uTwilightFactor + 0.18 * (1.0 - uNightFactor));

    // Mie forward scattering halo around sun
    float miePhase = henyeyGreenstein(cosTheta, 0.78);
    vec3 mieColor = mix(vec3(1.0, 0.92, 0.76), vec3(1.0, 0.52, 0.22), uTwilightFactor);
    float sunVis = smoothstep(-0.08, 0.15, sunDir.y);
    skyColor += mieColor * miePhase * 0.42 * sunVis;

    // Crisp solar disk + HDR bloom corona
    float sunDisk = smoothstep(0.9991, 0.99965, cosTheta) * sunVis;
    float sunCorona = pow(max(0.0, cosTheta), 180.0) * sunVis;
    skyColor += vec3(2.4, 2.1, 1.65) * sunDisk + mieColor * sunCorona * 0.65;

    // Subtle high-altitude cirrus wisps above horizon
    if (dir.y > 0.04) {
      vec2 cloudUv = dir.xz / (dir.y + 0.18) * 1.35 + vec2(uTime * 0.008, -uTime * 0.004);
      float c1 = noise2(cloudUv * 2.2);
      float c2 = noise2(cloudUv * 5.1 + 3.7);
      float cirrus = smoothstep(0.54, 0.86, c1 * 0.65 + c2 * 0.35);
      float cloudFade = smoothstep(0.04, 0.28, dir.y) * (1.0 - smoothstep(0.55, 0.95, dir.y));
      vec3 cloudColor = mix(vec3(0.96, 0.98, 1.0), vec3(1.0, 0.64, 0.38), uTwilightFactor);
      cloudColor = mix(cloudColor, vec3(0.12, 0.18, 0.29), uNightFactor);
      skyColor = mix(skyColor, cloudColor, cirrus * cloudFade * 0.28);
    }

    // Nocturnal starfield & faint nebula band
    if (uNightFactor > 0.02 && dir.y > 0.02) {
      vec3 starCell = floor(dir * 260.0);
      float h = hash31(starCell);
      float starMask = step(0.9945, h);
      float twinkle = 0.65 + 0.35 * sin(uTime * 2.8 + h * 62.83);
      float horizonFade = smoothstep(0.02, 0.25, dir.y);
      vec3 starTint = mix(vec3(0.75, 0.88, 1.0), vec3(1.0, 0.9, 0.75), fract(h * 17.3));
      skyColor += starTint * starMask * twinkle * horizonFade * uNightFactor * 1.45;

      // Subtle milky-way / arcane atmospheric band
      float band = exp(-pow((dir.x * 0.65 + dir.z * 0.35) * 3.2, 2.0)) * horizonFade;
      skyColor += vec3(0.04, 0.09, 0.16) * band * uNightFactor;
    }

    // Below-horizon abyssal ocean reflection bounce
    if (dir.y < 0.0) {
      vec3 groundBounce = mix(vec3(0.06, 0.19, 0.28), vec3(0.02, 0.04, 0.08), uNightFactor);
      skyColor = mix(horizonCol, groundBounce, clamp(-dir.y * 4.0, 0.0, 1.0));
    }

    gl_FragColor = vec4(skyColor, 1.0);
  }
`;

export class SceneManager {
  /**
   * Initializes the Three.js WebGLRenderer, PerspectiveCamera, EffectComposer with
   * UnrealBloomPass, Hillaire-inspired Atmospheric Sky Dome, and dynamic lights.
   *
   * @param {HTMLElement|string} [containerEl] - DOM element or selector to mount the canvas into.
   */
  constructor(containerEl) {
    /** @type {HTMLElement} */
    this.container =
      typeof containerEl === 'string'
        ? document.querySelector(containerEl)
        : containerEl || document.getElementById('app') || document.body;

    const rawW = this.container?.clientWidth || window.innerWidth || 1280;
    const rawH = this.container?.clientHeight || window.innerHeight || 720;
    const width = Math.max(320, Number.isFinite(rawW) ? rawW : 1280);
    const height = Math.max(240, Number.isFinite(rawH) ? rawH : 720);

    /** @type {THREE.Scene} */
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x3a6ea5);
    this.scene.fog = new THREE.FogExp2(0x7fb2d9, 0.0036);

    /** @type {THREE.WebGLRenderer} */
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvasEl = this.renderer.domElement;
    if (canvasEl && canvasEl.style) {
      canvasEl.style.display = 'block';
      canvasEl.style.width = '100%';
      canvasEl.style.height = '100%';
      canvasEl.style.position = 'absolute';
      canvasEl.style.inset = '0';
      canvasEl.style.zIndex = '0';
    }

    if (this.container) {
      this.container.appendChild(canvasEl);
    }

    /** @type {THREE.PerspectiveCamera} */
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 1100);

    // Tactical 3D Isometric-style (3/4 top-down V Rising / Ravenswatch) camera state
    /** @type {THREE.Vector3} */
    this.cameraTarget = new THREE.Vector3(0, 2.2, 6.5);
    /** @type {number} Default 45-degree isometric diagonal yaw */
    this.cameraYaw = Math.PI * 0.25;
    /** @type {number} */
    this.targetCameraYaw = Math.PI * 0.25;
    /** @type {number} ~45 deg 3/4 tactical top-down angle */
    this.cameraPitch = 0.78;
    /** @type {number} */
    this.targetCameraPitch = 0.78;
    /** @type {number} Tactical default distance with wide zoom-out support (12..140) */
    this.cameraDistance = 42;
    /** @type {number} */
    this.targetCameraDistance = 42;

    /** @type {boolean} Tutorial camera flags */
    this.hasZoomed = false;
    /** @type {boolean} */
    this.hasRotatedCamera = false;

    // Temporary focus override (e.g. when player clicks a mutant lineage in the HUD)
    /** @type {THREE.Vector3|null} */
    this.focusOverridePos = null;
    /** @type {number} */
    this.focusOverrideTimer = 0;

    // Input state for smooth camera orbit & zoom
    /** @type {{ rotateLeft: boolean, rotateRight: boolean, isDragging: boolean, lastMouseX: number, lastMouseY: number }} */
    this._camInput = {
      rotateLeft: false,
      rotateRight: false,
      isDragging: false,
      lastMouseX: 0,
      lastMouseY: 0,
    };

    // Post-processing pipeline (RenderPass + subtle UnrealBloomPass)
    /** @type {EffectComposer} */
    this.composer = new EffectComposer(this.renderer);
    /** @type {RenderPass} */
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    /** @type {UnrealBloomPass} */
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.38, // strength: rich glow on fire mutations & sky beacons without over-blooming
      0.62, // radius
      0.80  // threshold
    );
    this.composer.addPass(this.bloomPass);

    // Day / Night cycle state
    /** @type {number} Full day/night cycle duration in seconds */
    this.dayCycleDuration = CONFIG?.WORLD?.DAY_DURATION || 120;
    /** @type {number} Start in bright morning light (0.28 of cycle) */
    this.timeOfDayNormalized = 0.28;
    /** @type {number} Current survival day counter (1-based) */
    this.dayNumber = 1;
    /** @type {THREE.Vector3} Normalized direction vector toward the sun */
    this.sunDirection = new THREE.Vector3(0.45, 0.72, 0.52).normalize();

    // Reusable raycasting helpers for screenToWorld
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this._initSkyDome();
    this._initLighting();
    this._bindEvents();
    this._updateCameraTransform(1.0);
    this._updateAtmosphere(0.016, 0);

    logger.info('WORLD', 'SceneManager initialized (ACESFilmic + PCFSoftShadowMap + Hillaire Sky + Bloom)', {
      viewport: `${width}x${height}`,
      pixelRatio: this.renderer.getPixelRatio(),
    });
  }

  /**
   * Alias getter for camera yaw angle in radians.
   * @returns {number}
   */
  get yaw() {
    return this.cameraYaw;
  }

  /**
   * Returns the current horizontal camera yaw angle in radians.
   * @returns {number}
   */
  getCameraYaw() {
    return this.cameraYaw;
  }

  /**
   * Builds the procedural Hillaire-inspired atmospheric sky dome mesh.
   * @private
   */
  _initSkyDome() {
    const skyGeo = new THREE.SphereGeometry(520, 48, 32);
    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      uniforms: {
        uSunDir: { value: this.sunDirection.clone() },
        uTime: { value: 0 },
        uNightFactor: { value: 0 },
        uTwilightFactor: { value: 0.15 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.skyDome = new THREE.Mesh(skyGeo, this.skyMaterial);
    this.skyDome.renderOrder = -10;
    this.scene.add(this.skyDome);
  }

  /**
   * Sets up directional sun light with player-tracking shadow frustum, hemisphere sky/ground
   * bounce light, ambient fill, and warm Bastion sanctuary point lights.
   * @private
   */
  _initLighting() {
    // Primary directional sun/moon light with soft shadow map
    this.sunLight = new THREE.DirectionalLight(0xfff4dc, 2.5);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 230;
    const shadowHalfExtent = 72;
    this.sunLight.shadow.camera.left = -shadowHalfExtent;
    this.sunLight.shadow.camera.right = shadowHalfExtent;
    this.sunLight.shadow.camera.top = shadowHalfExtent;
    this.sunLight.shadow.camera.bottom = -shadowHalfExtent;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.025;

    this.sunLight.position.copy(this.sunDirection).multiplyScalar(95);
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Hemisphere bounce light (sky cyan-blue top, mossy forest-earth bottom)
    this.hemiLight = new THREE.HemisphereLight(0x8ec8ff, 0x3b4d36, 0.78);
    this.scene.add(this.hemiLight);

    // Subtle ambient fill so deep shadows remain readable at night
    this.ambientLight = new THREE.AmbientLight(0x243246, 0.36);
    this.scene.add(this.ambientLight);

    // Warm Bastion campfire & lantern point lights at central plateau
    const bastionX = CONFIG?.BASTION?.POS?.x ?? 0;
    const bastionZ = CONFIG?.BASTION?.POS?.z ?? 0;
    this.bastionLight = new THREE.PointLight(0xff8a33, 3.4, 34, 1.45);
    this.bastionLight.position.set(bastionX, 4.4, bastionZ);
    this.scene.add(this.bastionLight);
  }

  /**
   * Attaches window resize, mouse-wheel zoom, right-drag camera orbit, and Q/E rotation listeners.
   * @private
   */
  _bindEvents() {
    this._onResize = () => {
      const width = this.container?.clientWidth || window.innerWidth || 1280;
      const height = this.container?.clientHeight || window.innerHeight || 720;
      this.camera.aspect = width / Math.max(1, height);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      this.composer.setSize(width, height);
    };

    this._onWheel = (e) => {
      // Allow scrolling inside modal overlays without zooming the 3D camera
      if (e.target && e.target !== this.renderer.domElement && e.target.closest?.('.modal, .codex-modal, .feed-list, .lineage-list')) {
        return;
      }
      const step = Math.max(3.2, this.targetCameraDistance * 0.09);
      const delta = Math.sign(e.deltaY) * step;
      this.targetCameraDistance = clamp(this.targetCameraDistance + delta, 12, 145);
      this.hasZoomed = true;
    };

    this._onMouseDown = (e) => {
      if (e.button === 2 || e.button === 1) {
        this._camInput.isDragging = true;
        this._camInput.lastMouseX = e.clientX;
        this._camInput.lastMouseY = e.clientY;
      }
    };

    this._onMouseMove = (e) => {
      if (!this._camInput.isDragging) return;
      const dx = e.clientX - this._camInput.lastMouseX;
      const dy = e.clientY - this._camInput.lastMouseY;
      this._camInput.lastMouseX = e.clientX;
      this._camInput.lastMouseY = e.clientY;

      this.targetCameraYaw -= dx * 0.0065;
      this.targetCameraPitch = clamp(this.targetCameraPitch + dy * 0.005, 0.32, 1.32);
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        this.hasRotatedCamera = true;
      }
    };

    this._onMouseUp = () => {
      this._camInput.isDragging = false;
    };

    this._onContextMenu = (e) => {
      if (e.target === this.renderer.domElement) {
        e.preventDefault();
      }
    };

    this._onKeyDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'KeyQ') {
        this._camInput.rotateLeft = true;
        this.hasRotatedCamera = true;
      }
      if (e.code === 'KeyE') {
        this._camInput.rotateRight = true;
        this.hasRotatedCamera = true;
      }
    };

    this._onKeyUp = (e) => {
      if (e.code === 'KeyQ') this._camInput.rotateLeft = false;
      if (e.code === 'KeyE') this._camInput.rotateRight = false;
    };

    window.addEventListener('resize', this._onResize);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  /**
   * Temporarily focuses the camera toward a world position (e.g. when inspecting a Patient Zero beacon).
   *
   * @param {{x: number, y?: number, z: number}} pos - World coordinates to inspect.
   * @param {number} [durationSec=2.2] - Duration in seconds before returning to the player.
   */
  focusOnPosition(pos, durationSec = 2.2) {
    if (!pos || typeof pos.x !== 'number' || typeof pos.z !== 'number') return;
    this.focusOverridePos = new THREE.Vector3(pos.x, (pos.y ?? 2.0) + 1.5, pos.z);
    this.focusOverrideTimer = durationSec;
  }

  /**
   * Alias for `focusOnPosition(pos, durationSec)`.
   *
   * @param {{x: number, y?: number, z: number}} pos - World coordinates to focus on.
   * @param {number} [durationSec=2.2] - Duration in seconds.
   */
  focusOn(pos, durationSec = 2.2) {
    this.focusOnPosition(pos, durationSec);
  }

  /**
   * Updates spherical camera transform around `this.cameraTarget`.
   *
   * @param {number} dt - Frame delta time in seconds.
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} [playerPos] - Current player world coordinates.
   * @private
   */
  _updateCameraTransform(dt, playerPos) {
    const safeDt = Number.isFinite(dt) ? clamp(dt, 0.001, 0.1) : 0.016;
    const yawSpeed = 1.85;
    if (this._camInput.rotateLeft) {
      this.targetCameraYaw += yawSpeed * safeDt;
    }
    if (this._camInput.rotateRight) {
      this.targetCameraYaw -= yawSpeed * safeDt;
    }

    if (!Number.isFinite(this.targetCameraYaw)) this.targetCameraYaw = Math.PI * 0.25;
    if (!Number.isFinite(this.targetCameraPitch)) this.targetCameraPitch = 0.78;
    if (!Number.isFinite(this.targetCameraDistance)) this.targetCameraDistance = 42;

    const smoothFactor = clamp(safeDt * 9.5, 0.01, 1.0);
    this.cameraYaw = lerp(
      Number.isFinite(this.cameraYaw) ? this.cameraYaw : Math.PI * 0.25,
      this.targetCameraYaw,
      smoothFactor
    );
    this.cameraPitch = lerp(
      Number.isFinite(this.cameraPitch) ? this.cameraPitch : 0.78,
      this.targetCameraPitch,
      smoothFactor
    );
    this.cameraDistance = lerp(
      Number.isFinite(this.cameraDistance) ? this.cameraDistance : 42,
      this.targetCameraDistance,
      smoothFactor
    );

    // Dynamically attenuate fog density when zoomed out wide for clear tactical ecosystem visibility
    if (this.scene.fog) {
      const zoomOutFactor = clamp((this.cameraDistance - 45) / 95, 0.0, 1.0);
      this.scene.fog.density = lerp(0.0034, 0.0014, zoomOutFactor);
    }

    // Ensure cameraTarget itself is finite before interpolating
    if (!Number.isFinite(this.cameraTarget.x) || !Number.isFinite(this.cameraTarget.y) || !Number.isFinite(this.cameraTarget.z)) {
      this.cameraTarget.set(0, 3.6, 6.5);
    }

    // Determine target anchor (either temporary focus override or player position)
    let targetX = this.cameraTarget.x;
    let targetY = this.cameraTarget.y;
    let targetZ = this.cameraTarget.z;

    if (this.focusOverrideTimer > 0 && this.focusOverridePos) {
      this.focusOverrideTimer = Math.max(0, this.focusOverrideTimer - safeDt);
      if (Number.isFinite(this.focusOverridePos.x) && Number.isFinite(this.focusOverridePos.z)) {
        targetX = this.focusOverridePos.x;
        targetY = Number.isFinite(this.focusOverridePos.y) ? this.focusOverridePos.y : 3.6;
        targetZ = this.focusOverridePos.z;
      }
    } else if (playerPos) {
      const rawPx = playerPos.x ?? playerPos.position?.x;
      const rawPy = playerPos.y ?? playerPos.position?.y;
      const rawPz = playerPos.z ?? playerPos.position?.z;
      const px = Number.isFinite(rawPx) ? rawPx : 0;
      const py = Number.isFinite(rawPy) ? rawPy : 2.2;
      const pz = Number.isFinite(rawPz) ? rawPz : 6.5;
      targetX = px;
      targetY = py + 1.4;
      targetZ = pz;
    }

    const followLerp = clamp(safeDt * 7.5, 0.01, 1.0);
    this.cameraTarget.x = lerp(this.cameraTarget.x, targetX, followLerp);
    this.cameraTarget.y = lerp(this.cameraTarget.y, targetY, followLerp);
    this.cameraTarget.z = lerp(this.cameraTarget.z, targetZ, followLerp);

    const horizontalDist = this.cameraDistance * Math.cos(this.cameraPitch);
    const verticalDist = this.cameraDistance * Math.sin(this.cameraPitch);

    const camX = this.cameraTarget.x + Math.sin(this.cameraYaw) * horizontalDist;
    const camY = this.cameraTarget.y + verticalDist;
    const camZ = this.cameraTarget.z + Math.cos(this.cameraYaw) * horizontalDist;

    if (Number.isFinite(camX) && Number.isFinite(camY) && Number.isFinite(camZ)) {
      this.camera.position.set(camX, camY, camZ);
    } else {
      this.cameraTarget.set(0, 3.6, 6.5);
      this.camera.position.set(21, 32, 27);
    }
    this.camera.lookAt(this.cameraTarget);

    if (this.skyDome) {
      this.skyDome.position.copy(this.camera.position);
    }
  }

  /**
   * Advances the day/night cycle, updates solar trajectory, sky dome shader uniforms,
   * directional shadow light frustum, hemisphere colors, and atmospheric fog.
   *
   * @param {number} dt - Frame delta time in seconds.
   * @param {number} elapsedTime - Total elapsed seconds.
   * @private
   */
  _updateAtmosphere(dt, elapsedTime) {
    const prevNorm = this.timeOfDayNormalized;
    this.timeOfDayNormalized = (this.timeOfDayNormalized + dt / this.dayCycleDuration) % 1.0;
    if (this.timeOfDayNormalized < prevNorm) {
      this.dayNumber += 1;
      logger.info('WORLD', `Un nouveau jour se lève sur Genesis Bastion (Jour ${this.dayNumber})`, {
        dayNumber: this.dayNumber,
      });
    }

    // Map normalized [0..1] cycle to sun angle:
    // 0.00 = midnight, 0.25 = dawn, 0.50 = solar noon, 0.75 = sunset, 1.00 = midnight
    const cycleAngle = (this.timeOfDayNormalized - 0.25) * Math.PI * 2.0;
    const sunElevation = Math.sin(cycleAngle); // [-1..1]
    const sunAzimuth = cycleAngle * 0.65 + 0.55;

    const horizRadius = Math.cos( Math.asin(clamp(sunElevation, -0.98, 0.98)) );
    this.sunDirection
      .set(
        Math.cos(sunAzimuth) * horizRadius,
        sunElevation,
        Math.sin(sunAzimuth) * horizRadius
      )
      .normalize();

    const nightFactor = clamp((-sunElevation + 0.08) / 0.35, 0.0, 1.0);
    const twilightFactor = clamp(1.0 - Math.abs(sunElevation - 0.06) / 0.34, 0.0, 1.0);

    // Update sky shader uniforms
    this.skyMaterial.uniforms.uSunDir.value.copy(this.sunDirection);
    this.skyMaterial.uniforms.uTime.value = elapsedTime;
    this.skyMaterial.uniforms.uNightFactor.value = nightFactor;
    this.skyMaterial.uniforms.uTwilightFactor.value = twilightFactor;

    // Directional light follows either the sun (day) or high silver moon (night)
    const activeLightDir =
      sunElevation >= -0.05
        ? this.sunDirection
        : new THREE.Vector3(-this.sunDirection.x, Math.max(0.38, -this.sunDirection.y), -this.sunDirection.z).normalize();

    // Texel-snap shadow target around cameraTarget to eliminate shadow edge shimmering
    const snapStep = 1.5;
    const snappedX = Math.round(this.cameraTarget.x / snapStep) * snapStep;
    const snappedZ = Math.round(this.cameraTarget.z / snapStep) * snapStep;

    this.sunLight.target.position.set(snappedX, 0, snappedZ);
    this.sunLight.position
      .copy(activeLightDir)
      .multiplyScalar(95)
      .add(this.sunLight.target.position);

    // Blend directional light color & intensity across day / golden hour / night
    const daySunCol = new THREE.Color(0xfff5e0);
    const duskSunCol = new THREE.Color(0xff8442);
    const nightMoonCol = new THREE.Color(0x5a82b8);

    this.sunLight.color
      .copy(daySunCol)
      .lerp(duskSunCol, twilightFactor)
      .lerp(nightMoonCol, nightFactor);
    this.sunLight.intensity = lerp(lerp(2.6, 1.85, twilightFactor), 0.72, nightFactor);

    // Hemisphere & fog atmospheric harmony
    const daySkyHemi = new THREE.Color(0x8ec8ff);
    const duskSkyHemi = new THREE.Color(0xd9865b);
    const nightSkyHemi = new THREE.Color(0x1b2c47);
    this.hemiLight.color
      .copy(daySkyHemi)
      .lerp(duskSkyHemi, twilightFactor)
      .lerp(nightSkyHemi, nightFactor);
    this.hemiLight.intensity = lerp(0.82, 0.42, nightFactor);

    const dayFog = new THREE.Color(0x82b5dc);
    const duskFog = new THREE.Color(0xc46d4e);
    const nightFog = new THREE.Color(0x0b1526);
    this.scene.fog.color
      .copy(dayFog)
      .lerp(duskFog, twilightFactor * 0.75)
      .lerp(nightFog, nightFactor);

    // Warm campfire flicker at the Bastion (stronger during twilight and night)
    const flicker =
      Math.sin(elapsedTime * 11.3) * 0.18 +
      Math.sin(elapsedTime * 23.7) * 0.11 +
      Math.cos(elapsedTime * 6.1) * 0.14;
    this.bastionLight.intensity = (2.8 + nightFactor * 2.2) + flicker;
  }

  /**
   * Main per-frame update: smoothly tracks `playerPos` with the 3rd-person tactical camera,
   * advances the Hillaire atmospheric sky & sun cycle, and renders the scene through the
   * post-processing `EffectComposer` (with automatic direct-renderer fallback).
   *
   * @param {number} dt - Delta time in seconds.
   * @param {number} elapsedTime - Total elapsed session time in seconds.
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} [playerPos] - Player world position.
   */
  update(dt, elapsedTime, playerPos) {
    const safeDt = Number.isFinite(dt) ? clamp(dt, 0.001, 0.1) : 0.016;
    const safeElapsed = Number.isFinite(elapsedTime) ? elapsedTime : 0;

    this._updateCameraTransform(safeDt, playerPos);
    this._updateAtmosphere(safeDt, safeElapsed);
    this.render();
  }

  /**
   * Explicit render helper with automatic direct-renderer fallback if post-processing fails.
   */
  render() {
    try {
      if (this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    } catch (_err) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Returns the current normalized sun direction vector in world space.
   *
   * @returns {THREE.Vector3} Normalized sun direction vector.
   */
  getSunDirection() {
    return this.sunDirection.clone();
  }

  /**
   * Returns structured time-of-day telemetry for the HUD clock and game logic.
   *
   * @returns {{ normalized: number, label: string, isNight: boolean, dayNumber: number, hour: number, formattedTime: string, phase: string }}
   */
  getTimeOfDay() {
    const norm = this.timeOfDayNormalized;
    const totalHours = norm * 24;
    const hour = Math.floor(totalHours);
    const mins = Math.floor((totalHours - hour) * 60);
    const formattedTime = `${String(hour).padStart(2, '0')}h${String(mins).padStart(2, '0')}`;

    const isNight = norm < 0.21 || norm >= 0.79;
    let label = 'Jour';
    let phase = 'day';

    if (norm >= 0.21 && norm < 0.30) {
      label = 'Aube';
      phase = 'dawn';
    } else if (norm >= 0.30 && norm < 0.70) {
      label = 'Jour';
      phase = 'day';
    } else if (norm >= 0.70 && norm < 0.79) {
      label = 'Crépuscule';
      phase = 'dusk';
    } else {
      label = 'Nuit';
      phase = 'night';
    }

    return {
      normalized: norm,
      label,
      isNight,
      dayNumber: this.dayNumber,
      hour,
      formattedTime,
      phase,
    };
  }

  /**
   * Projects 2D viewport coordinates `(clientX, clientY)` onto a horizontal world plane `y = groundY`.
   *
   * @param {number} clientX - Viewport X coordinate in pixels.
   * @param {number} clientY - Viewport Y coordinate in pixels.
   * @param {number} [groundY=0] - Target horizontal plane elevation.
   * @returns {THREE.Vector3 | null} World intersection point, or null if ray does not intersect.
   */
  screenToWorld(clientX, clientY, groundY = 0) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;

    this._ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(this._ndc, this.camera);
    this._groundPlane.constant = -groundY;

    const hitTarget = new THREE.Vector3();
    const hit = this._raycaster.ray.intersectPlane(this._groundPlane, hitTarget);
    return hit ? hitTarget : null;
  }

  /**
   * Projects a 3D world position `{x, y, z}` into 2D viewport pixel coordinates `{x, y, visible}`
   * for floating damage numbers and contextual tutorial action badges.
   *
   * @param {THREE.Vector3|{x: number, y?: number, z: number}} worldPos - 3D world position.
   * @param {number} [yOffset=0] - Additional vertical offset in world units.
   * @returns {{ x: number, y: number, visible: boolean }} Screen coordinates in pixels.
   */
  worldToScreen(worldPos, yOffset = 0) {
    if (!worldPos) return { x: 0, y: 0, visible: false };
    const wx = worldPos.x ?? worldPos.position?.x ?? 0;
    const wy = (worldPos.y ?? worldPos.position?.y ?? 2.0) + yOffset;
    const wz = worldPos.z ?? worldPos.position?.z ?? 0;

    const vec = new THREE.Vector3(wx, wy, wz);
    vec.project(this.camera);

    const width = this.container?.clientWidth || window.innerWidth || 1280;
    const height = this.container?.clientHeight || window.innerHeight || 720;

    const visible = vec.z >= -1 && vec.z <= 1;
    const x = (vec.x * 0.5 + 0.5) * width;
    const y = (-(vec.y * 0.5) + 0.5) * height;
    return { x, y, visible };
  }

  /**
   * Disposes event listeners and GPU buffers.
   */
  dispose() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('contextmenu', this._onContextMenu);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.renderer.dispose();
  }
}

export default SceneManager;
