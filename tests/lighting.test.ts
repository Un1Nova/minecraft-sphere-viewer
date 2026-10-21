import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createCameraLighting, getCornerView } from '../src/scene/lighting';
import { createShellDepthMaterial, createShellEdgesMaterial, createShellMaterial } from '../src/scene/materials';
import { buildShell, FACE_DIRECTIONS } from '../src/scene/geometry';

function shaderAfterHook(material: THREE.Material, library: typeof THREE.ShaderLib.standard) {
  const shader = {
    uniforms: {}, vertexShader: library.vertexShader, fragmentShader: library.fragmentShader,
  } as Parameters<THREE.Material['onBeforeCompile']>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

test('all solid blocks use the same neutral standard material and real shadow chunks', () => {
  const material = createShellMaterial();
  assert.equal(material.isMeshStandardMaterial, true);
  assert.equal(material.color.getHex(), 0x8c8c8c);
  assert.equal(material.color.r, material.color.g);
  assert.equal(material.color.g, material.color.b);
  assert.equal(material.vertexColors, false);
  assert.equal(material.metalness, 0);
  assert.equal(material.shadowSide, THREE.FrontSide);
  const shader = shaderAfterHook(material, THREE.ShaderLib.standard);
  assert.ok(shader.vertexShader.includes('#include <shadowmap_vertex>'));
  assert.ok(shader.fragmentShader.includes('#include <shadowmap_pars_fragment>'));
  assert.ok(shader.fragmentShader.includes('#include <lights_fragment_begin>'));
  assert.ok(shader.fragmentShader.includes('fwidth(vShellUv)'));
  assert.ok(!shader.fragmentShader.includes('hash31'));
  material.dispose();
});

test('visible material and custom shadow depth share the same live cutaway', () => {
  const surface = createShellMaterial();
  const depth = createShellDepthMaterial(surface.uniforms);
  const colorShader = shaderAfterHook(surface, THREE.ShaderLib.standard);
  const depthShader = shaderAfterHook(depth, THREE.ShaderLib.depth);
  for (const name of Object.keys(surface.uniforms)) {
    assert.equal(colorShader.uniforms[name], depthShader.uniforms[name]);
  }
  surface.uniforms.uCutOuterCosine.value = 0.82;
  assert.equal(depthShader.uniforms.uCutOuterCosine.value, 0.82);
  const coverage = /float sphereShellCoverage\(\)\s*\{[^}]+\}/;
  const colorCoverage = colorShader.fragmentShader.match(coverage)?.[0];
  const depthCoverage = depthShader.fragmentShader.match(coverage)?.[0];
  assert.ok(colorCoverage);
  assert.equal(colorCoverage, depthCoverage);
  assert.ok(!depthCoverage!.includes('cameraPosition'));
  for (const shader of [colorShader, depthShader]) {
    assert.ok(shader.vertexShader.indexOf('shellWorldPosition = instanceMatrix * shellWorldPosition') > shader.vertexShader.indexOf('#include <project_vertex>'));
    assert.ok(shader.vertexShader.includes('vShellWorldPosition = (modelMatrix * shellWorldPosition).xyz'));
    assert.ok(shader.fragmentShader.includes('if (shellCoverage <= 0.0) discard'));
  }
  surface.dispose();
  depth.dispose();
});

test('red edge material has transparent fill and cannot occlude the interior with depth', () => {
  const surface = createShellMaterial();
  const edges = createShellEdgesMaterial(surface.uniforms);
  assert.equal(edges.transparent, true);
  assert.equal(edges.depthWrite, false);
  assert.equal(edges.depthTest, true);
  assert.equal(edges.uniforms.uShellOpacity, surface.uniforms.uShellOpacity);
  assert.equal(edges.uniforms.uCutOuterCosine, surface.uniforms.uCutOuterCosine);
  assert.ok(edges.fragmentShader.includes('coverage * vEdgeVisibility'));
  surface.dispose();
  edges.dispose();
});

test('key light keeps the same upper-left position relative to all camera orientations', () => {
  const lighting = createCameraLighting(98);
  const camera = new THREE.PerspectiveCamera();
  const expected = new THREE.Vector3(-0.75, 0.72, 1).normalize();
  for (const position of [[0, 0, 300], [300, 0, 0], [120, 120, 120], [-200, 90, -200], [0.01, 300, 0.01]]) {
    camera.position.fromArray(position);
    camera.lookAt(0, 0, 0);
    lighting.update(camera);
    const cameraLocal = lighting.key.position.clone().applyQuaternion(camera.quaternion.clone().invert()).normalize();
    assert.ok(cameraLocal.distanceTo(expected) < 1e-12);
  }
  camera.position.set(120, 120, 120);
  camera.lookAt(0, 0, 0);
  lighting.update(camera);
  const diagonalDirection = lighting.key.position.clone().normalize();
  assert.ok(diagonalDirection.x < 0, 'a grazing key is needed for real stepped-surface occlusion');
  assert.ok(diagonalDirection.y - diagonalDirection.z > 0.15, 'Y and Z faces must remain distinct');
  lighting.dispose();
});

test('shadow camera covers the complete sphere and resolves sub-block shadows on mobile', () => {
  const lighting = createCameraLighting(98);
  const camera = new THREE.PerspectiveCamera();
  for (const position of [[0, 0, 300], [120, 120, 120], [-140, 180, -140]]) {
    camera.position.fromArray(position);
    camera.lookAt(0, 0, 0);
    lighting.update(camera);
    lighting.group.updateMatrixWorld(true);
    lighting.key.shadow.updateMatrices(lighting.key);
    for (let azimuth = 0; azimuth < 24; azimuth++) {
      for (let elevation = 0; elevation <= 12; elevation++) {
        const point = new THREE.Vector3().setFromSphericalCoords(99, elevation * Math.PI / 12, azimuth * Math.PI / 12);
        point.project(lighting.key.shadow.camera);
        assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1);
      }
    }
  }
  lighting.setMapSize(1024);
  const shadowCamera = lighting.key.shadow.camera;
  assert.ok((shadowCamera.right - shadowCamera.left) / lighting.key.shadow.mapSize.x < 0.21);
  assert.ok(lighting.key.shadow.normalBias < 0.05);
  lighting.setShadows(false);
  assert.equal(lighting.key.castShadow, false);
  lighting.setShadows(true);
  assert.equal(lighting.key.castShadow, true);
  assert.equal(lighting.key.shadow.needsUpdate, true);
  lighting.dispose();
});

test('the real voxel surface has short neighbouring-block shadows in the XYZ view', () => {
  const lighting = createCameraLighting(98);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(120, 120, 120);
  camera.lookAt(0, 0, 0);
  lighting.update(camera);
  const towardLight = lighting.key.position.clone().normalize();
  const shell = buildShell();
  const occupied = new Set<string>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  for (const { centers } of shell.groups) {
    for (let i = 0; i < centers.length; i += 3) occupied.add(key(centers[i], centers[i + 1], centers[i + 2]));
  }
  let shortShadows = 0;
  const point = new THREE.Vector3();
  const sample = new THREE.Vector3();
  const hit = new THREE.Vector3();
  const box = new THREE.Box3();
  const ray = new THREE.Ray();
  for (const { centers, faceMask } of shell.groups) {
    for (let i = 0; i < centers.length && shortShadows < 5; i += 3) {
      const center = new THREE.Vector3(centers[i], centers[i + 1], centers[i + 2]);
      if (center.toArray().some((value) => value < 48 || value > 65)) continue;
      for (let face = 0; face < 6 && shortShadows < 5; face++) {
        const normal = new THREE.Vector3().fromArray(FACE_DIRECTIONS[face]);
        if (!(faceMask & (1 << face)) || normal.dot(towardLight) <= 0) continue;
        point.copy(center).addScalar(-0.44).setComponent(Math.floor(face / 2), center.getComponent(Math.floor(face / 2)) + normal.getComponent(Math.floor(face / 2)) * 0.501);
        ray.set(point, towardLight);
        for (let distance = 0.03; distance < 1; distance += 0.03) {
          sample.copy(point).addScaledVector(towardLight, distance);
          if (!occupied.has(key(sample.x, sample.y, sample.z))) continue;
          box.min.copy(sample).floor();
          box.max.copy(box.min).addScalar(1);
          assert.ok(ray.intersectBox(box, hit));
          assert.ok(hit.distanceTo(point) < 1);
          shortShadows++;
          break;
        }
      }
    }
  }
  assert.ok(shortShadows >= 5, 'camera key must geometrically shadow neighbouring steps, not only shade normals');
  lighting.dispose();
});

test('corner preset targets an exterior XYZ patch at useful block-counting distance', () => {
  for (const aspect of [0.4, 0.65, 1, 1.7, 2.4]) {
    const view = getCornerView(aspect);
    assert.ok(Math.abs(view.target.length() - 96) < 1e-10);
    assert.ok(view.position.length() > 125);
    assert.equal(view.position.x, view.position.y);
    assert.equal(view.position.y, view.position.z);
    assert.ok(view.position.distanceTo(view.target) >= 37 - 1e-10);
  }
});
