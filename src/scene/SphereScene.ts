import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { construction, type SceneStats, type ViewerSettings, type ViewPreset } from '../model';
import { buildShell, makeStars } from './geometry';
import { createGlassMaterial, createGlowMaterial, createShellMaterial, createStarMaterial } from './materials';

export interface SceneController {
  setSettings(settings: ViewerSettings): void;
  setView(preset: ViewPreset): void;
  zoom(direction: 1 | -1): void;
  resetCamera(): void;
  dispose(): void;
}

export interface SphereSceneOptions {
  settings: ViewerSettings;
  onStats?: (stats: SceneStats) => void;
  onError?: (message: string) => void;
}

type ShellData = ReturnType<typeof buildShell>;

/** Cube faces in the same order as the worker's face mask. */
function faceGeometry(mask: number): THREE.BufferGeometry {
  const faces = [
    { n: [1, 0, 0], p: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
    { n: [-1, 0, 0], p: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]] },
    { n: [0, 1, 0], p: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
    { n: [0, -1, 0], p: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
    { n: [0, 0, 1], p: [[0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, 0.5]] },
    { n: [0, 0, -1], p: [[-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, -0.5, -0.5]] },
  ];
  const position: number[] = [], normal: number[] = [], uv: number[] = [], index: number[] = [];
  for (let face = 0; face < 6; face++) {
    if (!(mask & (1 << face))) continue;
    const start = position.length / 3;
    faces[face].p.forEach((p) => { position.push(...p); normal.push(...faces[face].n); });
    uv.push(0, 0, 0, 1, 1, 1, 1, 0);
    index.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return geometry;
}

export function createSphereScene(container: HTMLElement, options: SphereSceneOptions): SceneController {
  let settings = { ...options.settings };
  let disposed = false;
  let contextLost = false;
  let ready = false;
  let blockCount = 0;
  let frameHandle = 0;
  let worker: Worker | null = null;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  let fallbackStarted = false;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = window.matchMedia('(pointer: coarse)').matches;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    options.onError?.('Не удалось запустить 3D. Проверь, включено ли аппаратное ускорение, или открой страницу в другом браузере.');
    return { setSettings() {}, setView() {}, zoom() {}, resetCamera() {}, dispose() {} };
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
    console.error('Sphere shader:', gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertexShader), gl.getShaderInfoLog(fragmentShader));
    options.onError?.('Видеодрайвер не смог отобразить сцену. Попробуй другой браузер или обнови страницу.');
  };
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = 'sphere-canvas';
  renderer.domElement.setAttribute('aria-label', 'Интерактивная трёхмерная сфера. Перетаскивание вращает, колесо или щипок приближает.');
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.65;
  controls.minDistance = 6;
  controls.maxDistance = 1100;
  controls.minPolarAngle = 0.003;
  controls.maxPolarAngle = Math.PI - 0.003;
  controls.autoRotateSpeed = 0.42;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;

  const shellGroup = new THREE.Group();
  const glassGroup = new THREE.Group();
  const starGroup = new THREE.Group();
  scene.add(shellGroup, glassGroup, starGroup);

  const shellMaterial = createShellMaterial();
  shellMaterial.uniforms.uCutaway.value = settings.cutaway ? 1 : 0;
  shellMaterial.uniforms.uCutPosition.value = settings.cutPosition;
  const glassMaterial = createGlassMaterial(settings.glassOpacity, settings.showGrid);
  const glassGeometry = new THREE.BoxGeometry(construction.platformWidth, 1, construction.platformWidth);
  for (const y of construction.slabCenters) {
    const platform = new THREE.Mesh(glassGeometry, glassMaterial);
    platform.position.y = y;
    platform.name = `glass-platform-${y}`;
    glassGroup.add(platform);
  }

  const stars = makeStars(164, 196112);
  const starGeometry = new THREE.BoxGeometry(1, 1, 1);
  const starMaterial = createStarMaterial(settings.starIntensity);
  const starMesh = new THREE.InstancedMesh(starGeometry, starMaterial, stars.length);
  starMesh.frustumCulled = false;
  const matrix = new THREE.Matrix4();
  const warm = new THREE.Color('#ffdfad');
  const cool = new THREE.Color('#a6d3ff');
  const white = new THREE.Color('#f5f7ff');
  const starColor = new THREE.Color();
  const haloPosition = new Float32Array(stars.length * 3);
  const haloColor = new Float32Array(stars.length * 3);
  const haloSize = new Float32Array(stars.length);
  stars.forEach((star, i) => {
    matrix.makeScale(star.size, star.size, star.size);
    matrix.setPosition(star.x, star.y, star.z);
    starMesh.setMatrixAt(i, matrix);
    starColor.copy(white).lerp(star.warmth > 0.7 ? warm : cool, star.warmth > 0.7 ? 0.48 : 0.28);
    starMesh.setColorAt(i, starColor);
    haloPosition.set([star.x, star.y, star.z], i * 3);
    haloColor.set(starColor.toArray(), i * 3);
    haloSize[i] = star.size * 4.2;
  });
  starMesh.instanceMatrix.needsUpdate = true;
  if (starMesh.instanceColor) starMesh.instanceColor.needsUpdate = true;
  const glowGeometry = new THREE.BufferGeometry();
  glowGeometry.setAttribute('position', new THREE.BufferAttribute(haloPosition, 3));
  glowGeometry.setAttribute('aColor', new THREE.BufferAttribute(haloColor, 3));
  glowGeometry.setAttribute('aSize', new THREE.BufferAttribute(haloSize, 1));
  const glowMaterial = createGlowMaterial(settings.starIntensity);
  const glows = new THREE.Points(glowGeometry, glowMaterial);
  glows.frustumCulled = false;
  glows.renderOrder = 2;
  starGroup.add(starMesh, glows);

  type CameraTransition = {
    started: number;
    duration: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    targetFrom: THREE.Vector3;
    targetTo: THREE.Vector3;
  };
  let cameraTransition: CameraTransition | null = null;
  let lastFrameTime = performance.now();
  let statsTime = lastFrameTime;
  let frames = 0;
  const cameraDirection = new THREE.Vector3();
  const temporaryVector = new THREE.Vector3();
  let hasInitialView = false;

  function requestFrame() {
    if (!frameHandle && !disposed && !contextLost && !document.hidden) frameHandle = requestAnimationFrame(renderFrame);
  }

  function fitDistance() {
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const effectiveHalfFov = Math.atan(Math.tan(halfFov) * Math.min(camera.aspect, 1));
    return 98 / Math.sin(effectiveHalfFov) * 1.12;
  }

  function getView(preset: ViewPreset) {
    const distance = fitDistance();
    if (preset === 'front') return { position: new THREE.Vector3(0, 2, distance), target: new THREE.Vector3() };
    if (preset === 'top') return { position: new THREE.Vector3(0, distance, 0.5), target: new THREE.Vector3() };
    if (preset === 'inside') return { position: new THREE.Vector3(33, 1.5, 72), target: new THREE.Vector3(-5, 0, -18) };
    return { position: new THREE.Vector3(0.64, 0.31, 0.82).normalize().multiplyScalar(distance), target: new THREE.Vector3() };
  }

  function transitionTo(position: THREE.Vector3, target: THREE.Vector3, duration = 780) {
    cameraTransition = {
      started: performance.now(), duration: reduceMotion ? 120 : duration,
      from: camera.position.clone(), to: position,
      targetFrom: controls.target.clone(), targetTo: target,
    };
    requestFrame();
  }

  function resize() {
    if (disposed) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const cap = settings.quality === 'low' ? 1 : settings.quality === 'high' ? 1.6 : mobile ? 1.25 : 1.6;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    glowMaterial.uniforms.uHeight.value = height * renderer.getPixelRatio() * 0.5;
    if (!hasInitialView) {
      const view = getView('perspective');
      camera.position.copy(view.position);
      controls.target.copy(view.target);
      controls.update();
      shellMaterial.uniforms.uCameraDirection.value.copy(camera.position).normalize();
      hasInitialView = true;
    }
    requestFrame();
  }

  function emitStats(fps: number) {
    options.onStats?.({
      fps, blockCount, starCount: stars.length, ready,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    });
  }

  function renderFrame(now: number) {
    frameHandle = 0;
    if (disposed || contextLost || document.hidden) return;
    const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;
    if (cameraTransition) {
      const t = THREE.MathUtils.clamp((now - cameraTransition.started) / cameraTransition.duration, 0, 1);
      const smooth = t * t * (3 - 2 * t);
      camera.position.lerpVectors(cameraTransition.from, cameraTransition.to, smooth);
      controls.target.lerpVectors(cameraTransition.targetFrom, cameraTransition.targetTo, smooth);
      if (t >= 1) cameraTransition = null;
    }
    controls.autoRotate = settings.autoRotate && !cameraTransition;
    const controlsChanged = controls.update(dt);

    cameraDirection.copy(camera.position);
    if (cameraDirection.lengthSq() < 0.0001) cameraDirection.copy(temporaryVector.set(0, 0, 1).applyQuaternion(camera.quaternion));
    cameraDirection.normalize();
    const fadeSpeed = 1 - Math.exp(-dt * 17);
    const cutUniform = shellMaterial.uniforms.uCutaway;
    const thresholdUniform = shellMaterial.uniforms.uCutPosition;
    cutUniform.value = THREE.MathUtils.lerp(cutUniform.value, settings.cutaway ? 1 : 0, fadeSpeed);
    thresholdUniform.value = THREE.MathUtils.lerp(thresholdUniform.value, settings.cutPosition, fadeSpeed);
    const directionUniform = shellMaterial.uniforms.uCameraDirection.value as THREE.Vector3;
    directionUniform.lerp(cameraDirection, fadeSpeed).normalize();
    const fadeMoving = Math.abs(cutUniform.value - (settings.cutaway ? 1 : 0)) > 0.001 ||
      Math.abs(thresholdUniform.value - settings.cutPosition) > 0.001 || directionUniform.distanceToSquared(cameraDirection) > 0.000001;
    renderer.render(scene, camera);
    frames++;
    if (now - statsTime >= 1000) {
      emitStats(Math.round(frames * 1000 / (now - statsTime)));
      statsTime = now;
      frames = 0;
    }
    if (cameraTransition || controlsChanged || fadeMoving || controls.autoRotate) requestFrame();
  }

  function installShell(data: ShellData) {
    if (disposed) return;
    const instanceMatrix = new THREE.Matrix4();
    for (const group of data.groups) {
      if (!group.centers.length) continue;
      const geometry = faceGeometry(group.faceMask);
      const mesh = new THREE.InstancedMesh(geometry, shellMaterial, group.centers.length / 3);
      mesh.frustumCulled = false;
      mesh.name = `shell-faces-${group.faceMask}`;
      for (let i = 0; i < group.centers.length; i += 3) {
        instanceMatrix.makeTranslation(group.centers[i], group.centers[i + 1], group.centers[i + 2]);
        mesh.setMatrixAt(i / 3, instanceMatrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      shellGroup.add(mesh);
    }
    blockCount = data.blockCount;
    ready = true;
    worker?.terminate();
    worker = null;
    requestFrame();
    emitStats(0);
  }

  function buildWithoutWorker() {
    if (fallbackStarted || ready || disposed) return;
    fallbackStarted = true;
    fallbackTimer = setTimeout(() => {
      if (disposed) return;
      try { installShell(buildShell()); }
      catch { options.onError?.('Не удалось построить сферу. Обнови страницу и попробуй ещё раз.'); }
    }, 0);
  }

  try {
    worker = new Worker(new URL('./shell.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<ShellData & { type: string; message?: string }>) => {
      if (disposed) return;
      if (event.data.type === 'shell') installShell(event.data);
      else if (event.data.type === 'error') {
        worker?.terminate(); worker = null; buildWithoutWorker();
      }
    };
    worker.onerror = () => { worker?.terminate(); worker = null; buildWithoutWorker(); };
    worker.postMessage({ type: 'build' });
  } catch { buildWithoutWorker(); }

  function cancelCameraTransition() { cameraTransition = null; }
  controls.addEventListener('start', cancelCameraTransition);
  controls.addEventListener('change', requestFrame);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const onVisibility = () => {
    if (document.hidden && frameHandle) { cancelAnimationFrame(frameHandle); frameHandle = 0; }
    if (!document.hidden) { lastFrameTime = performance.now(); requestFrame(); }
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    if (frameHandle) cancelAnimationFrame(frameHandle);
    frameHandle = 0;
    options.onError?.('Браузер временно остановил 3D-графику. Попробуй обновить страницу.');
  };
  const onContextRestored = () => {
    contextLost = false;
    options.onError?.('');
    resize();
    requestFrame();
  };
  document.addEventListener('visibilitychange', onVisibility);
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

  function applySettings(next: ViewerSettings) {
    const qualityChanged = next.quality !== settings.quality;
    settings = { ...next };
    shellGroup.visible = settings.shellVisible;
    glassGroup.visible = settings.glassVisible;
    starGroup.visible = settings.starsVisible;
    glassMaterial.uniforms.uOpacity.value = settings.glassOpacity;
    glassMaterial.uniforms.uGrid.value = settings.showGrid ? 1 : 0;
    starMaterial.uniforms.uIntensity.value = settings.starIntensity;
    glowMaterial.uniforms.uIntensity.value = settings.starIntensity;
    if (qualityChanged) resize();
    requestFrame();
  }
  applySettings(settings);
  resize();

  return {
    setSettings: applySettings,
    setView(preset) {
      const view = getView(preset);
      transitionTo(view.position, view.target);
    },
    zoom(direction) {
      const offset = camera.position.clone().sub(controls.target);
      const length = THREE.MathUtils.clamp(offset.length() * (direction > 0 ? 0.77 : 1.3), controls.minDistance, controls.maxDistance);
      transitionTo(offset.normalize().multiplyScalar(length).add(controls.target), controls.target.clone(), 300);
    },
    resetCamera() {
      const view = getView('perspective');
      transitionTo(view.position, view.target);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frameHandle) cancelAnimationFrame(frameHandle);
      if (fallbackTimer !== undefined) clearTimeout(fallbackTimer);
      worker?.terminate();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      controls.removeEventListener('start', cancelCameraTransition);
      controls.removeEventListener('change', requestFrame);
      controls.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach((material) => materials.add(material));
          else materials.add(mesh.material);
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      scene.clear();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
