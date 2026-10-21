import * as THREE from 'three';
import { buildChunkLines, type ChunkMode } from '../chunks';

export function createChunkOverlay() {
  const group = new THREE.Group();
  group.name = 'Minecraft chunk boundaries';
  const data = buildChunkLines();
  const borderGeometry = new THREE.BufferGeometry();
  borderGeometry.setAttribute('position', new THREE.BufferAttribute(data.borders, 3));
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute('position', new THREE.BufferAttribute(data.grid, 3));
  const borderMaterial = new THREE.LineBasicMaterial({
    color: 0xe23a3a, transparent: true, opacity: 0.78,
    linewidth: 1, depthTest: true, depthWrite: false, toneMapped: false,
  });
  const gridMaterial = new THREE.LineBasicMaterial({
    color: 0x21965b, transparent: true, opacity: 0.18,
    linewidth: 1, depthTest: true, depthWrite: false, toneMapped: false,
  });
  const borders = new THREE.LineSegments(borderGeometry, borderMaterial);
  const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
  borders.renderOrder = 5;
  grid.renderOrder = 4;
  group.add(grid, borders);
  group.visible = false;
  return {
    group,
    setMode(mode: ChunkMode) {
      group.visible = mode !== 'off';
      grid.visible = mode === 'grid';
      borderMaterial.color.setHex(mode === 'grid' ? 0xc69a05 : 0xe23a3a);
      borderMaterial.opacity = mode === 'grid' ? 0.86 : 0.78;
    },
    dispose() {
      group.removeFromParent();
      borderGeometry.dispose();
      gridGeometry.dispose();
      borderMaterial.dispose();
      gridMaterial.dispose();
      group.clear();
    },
  };
}
