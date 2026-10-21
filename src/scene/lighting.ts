import * as THREE from 'three';

/** One camera-relative key light: real self-shadows, with a neutral ambient fill. */
export function createCameraLighting(sphereRadius: number) {
  const group = new THREE.Group();
  group.name = 'camera-lighting';
  const ambient = new THREE.AmbientLight(0xffffff, 1.05);
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.name = 'camera-key';
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -sphereRadius * 1.08;
  key.shadow.camera.right = key.shadow.camera.top = sphereRadius * 1.08;
  key.shadow.camera.near = sphereRadius * 1.5;
  key.shadow.camera.far = sphereRadius * 6;
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.000025;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 1.1;
  key.shadow.intensity = 0.68;
  group.add(ambient, key, key.target);

  // In camera coordinates +Z points toward the viewer, +Y upward, +X right.
  // This offset gives distinct X/Y/Z illumination at the diagonal preset.
  // Enough lateral offset to cast short shadows on the stepped XYZ surface;
  // a near-headlight would illuminate every outward face without occlusion.
  const localOffset = new THREE.Vector3(-0.75, 0.72, 1).multiplyScalar(sphereRadius * 3);

  return {
    group,
    key,
    update(camera: THREE.Camera) {
      key.position.copy(localOffset).applyQuaternion(camera.quaternion);
    },
    setShadows(enabled: boolean) {
      key.castShadow = enabled;
      if (enabled) key.shadow.needsUpdate = true;
    },
    setMapSize(size: number) {
      if (key.shadow.mapSize.x === size) return;
      key.shadow.mapSize.set(size, size);
      key.shadow.map?.dispose();
      key.shadow.map = null;
      key.shadow.needsUpdate = true;
    },
    dispose() {
      key.shadow.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}

/** A close, exterior XYZ view: the target sits just below the outer surface. */
export function getCornerView(aspect: number, sphereRadius = 98) {
  const direction = new THREE.Vector3(1, 1, 1).normalize();
  const target = direction.clone().multiplyScalar(sphereRadius - 2);
  // At 42° FOV this frames roughly 28 blocks across on the shorter dimension.
  const distance = 37 / Math.max(Math.min(aspect, 1), 0.45);
  return { position: target.clone().addScaledVector(direction, distance), target };
}
