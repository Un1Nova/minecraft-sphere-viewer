import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CUTAWAY_EDGE_WIDTH, clampOpeningRadius, getCutawayCosines } from '../src/scene/cutaway';
import { faceGeometry } from '../src/scene/SphereScene';
import { buildShell } from '../src/scene/geometry';
import { createShellMaterial, createWorkspaceGridMaterial } from '../src/scene/materials';

const sphereRadius = 98;

/** Project the cap's rim and divide by the true perspective silhouette radius. */
function projectedRadius(cosine: number, distance: number): number {
  const circleRadius = sphereRadius * Math.sqrt(1 - cosine * cosine);
  const circleDepth = distance - sphereRadius * cosine;
  const silhouette = sphereRadius / Math.sqrt(distance * distance - sphereRadius * sphereRadius);
  return circleRadius / circleDepth / silhouette;
}

test('opening size stays circular and proportional to the silhouette during zoom', () => {
  for (const distance of [sphereRadius * 1.08, sphereRadius * 1.4, 300, 700, 1100]) {
    for (const radius of [0.25, 0.5, 0.8, 0.95]) {
      const cap = getCutawayCosines(radius, distance, sphereRadius);
      assert.ok(Math.abs(projectedRadius(cap.outer, distance) - radius) < 1e-10);
      assert.ok(Math.abs(projectedRadius(cap.inner, distance) - (radius - CUTAWAY_EDGE_WIDTH)) < 1e-10);
      // Both rims lie strictly on the near-facing surface, including the
      // largest opening. The silhouette and back hemisphere stay uncut.
      assert.ok(cap.outer > sphereRadius / distance);
      assert.ok(cap.inner > cap.outer);
    }
  }
});

test('back wall is never in the opening, at every supported radius and distance', () => {
  for (let radius = 0.25; radius <= 0.9501; radius += 0.025) {
    for (const distance of [0, 25, 97, 98, 100, 150, 300, 1100]) {
      const cap = getCutawayCosines(radius, distance, sphereRadius);
      // Any back-facing radial dot product is <= 0. A positive outer threshold
      // makes its cut coverage exactly zero, not merely a small opacity.
      assert.ok(cap.outer > 0, `radius=${radius}, distance=${distance}`);
      assert.ok(cap.inner <= 1);
    }
  }
});

test('closing the hole restores an opaque shell without undefined smoothstep', () => {
  for (const distance of [0, 98, 105.84, 300, 1100]) {
    const closed = getCutawayCosines(0, distance, sphereRadius);
    assert.ok(closed.outer > 1);
    assert.ok(closed.inner > closed.outer);
    for (const radius of [0.00011, 0.0005, 0.003, 0.01, 0.025, 0.8]) {
      const cap = getCutawayCosines(radius, distance, sphereRadius);
      assert.ok(Math.fround(cap.inner) > Math.fround(cap.outer));
    }
  }
  assert.equal(clampOpeningRadius(-0.06), 0.25);
  assert.equal(clampOpeningRadius(10), 0.95);
  assert.equal(clampOpeningRadius(Number.NaN), 0.8);
});

test('all generated cube triangles face the same direction as their normals', () => {
  for (let mask = 1; mask < 64; mask++) {
    const geometry = faceGeometry(mask);
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const indices = geometry.getIndex()!;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const expected = new THREE.Vector3();
    for (let i = 0; i < indices.count; i += 3) {
      a.fromBufferAttribute(position, indices.getX(i));
      b.fromBufferAttribute(position, indices.getX(i + 1));
      c.fromBufferAttribute(position, indices.getX(i + 2));
      expected.fromBufferAttribute(normal, indices.getX(i));
      const triangleNormal = b.sub(a).cross(c.sub(a)).normalize();
      assert.equal(triangleNormal.dot(expected), 1, `reversed winding in mask ${mask}`);
    }
    geometry.dispose();
  }
});

test('the actual sphere has visible, front-culled inner faces on all six far walls', () => {
  const shell = buildShell();
  const material = createShellMaterial();
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      const blockCenter = [0.5, 0.5, 0.5];
      blockCenter[axis] = sign * 97.5;
      const group = shell.groups.find(({ centers }) => {
        for (let i = 0; i < centers.length; i += 3) {
          if (centers[i] === blockCenter[0] && centers[i + 1] === blockCenter[1] && centers[i + 2] === blockCenter[2]) return true;
        }
        return false;
      });
      assert.ok(group, 'missing far wall block');
      const geometry = faceGeometry(group.faceMask);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.fromArray(blockCenter);
      mesh.updateMatrixWorld();
      const origin = new THREE.Vector3(0.5, 0.5, 0.5).setComponent(axis, 0);
      const direction = new THREE.Vector3().setComponent(axis, sign);
      const hits = new THREE.Raycaster(origin, direction).intersectObject(mesh, false);
      assert.ok(hits.length >= 1, `inner wall disappeared for axis ${axis}, sign ${sign}`);
      assert.equal(hits[0].distance, 97);
      assert.equal(hits[0].face!.normal.dot(direction), -1);
      geometry.dispose();
    }
  }
  material.dispose();
});

test('shell uses opaque depth and the ground grid cannot write over the model', () => {
  const shell = createShellMaterial();
  assert.equal(shell.uniforms.uShellOpacity.value, 1);
  assert.equal(shell.transparent, false);
  assert.equal(shell.blending, THREE.NoBlending);
  assert.equal(shell.depthWrite, true);
  assert.equal(shell.depthTest, true);
  assert.equal(shell.side, THREE.FrontSide);
  const grid = createWorkspaceGridMaterial();
  assert.equal(grid.depthTest, true);
  assert.equal(grid.depthWrite, false);
  shell.dispose();
  grid.dispose();
});
