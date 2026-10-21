import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createCubeEdgesGeometry } from '../src/scene/blockEdges.ts';
import { buildShell, FACE_DIRECTIONS } from '../src/scene/geometry.ts';

function point(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, index: number): number[] {
  return [attribute.getX(index), attribute.getY(index), attribute.getZ(index)];
}

test('Любая маска сохраняет все 12 осевых рёбер куба без диагоналей', () => {
  for (let mask = 0; mask < 64; mask++) {
    const geometry = createCubeEdgesGeometry(mask, new Float32Array([0.5, 1.5, -0.5]));
    const positions = geometry.getAttribute('position');
    const uniqueEdges = new Set<string>();
    const cornerDegree = new Map<string, number>();
    assert.equal(positions.count, 24);
    assert.equal(geometry.index, null, 'У линейной геометрии нет треугольного индекса.');
    assert.deepEqual(geometry.drawRange, { start: 0, count: 24 });

    for (let i = 0; i < positions.count; i += 2) {
      const a = point(positions, i), b = point(positions, i + 1);
      for (const coordinate of [...a, ...b]) assert.equal(Math.abs(coordinate), 0.5);
      assert.equal(a.filter((coordinate, axis) => coordinate !== b[axis]).length, 1);
      assert.equal(a.reduce((distance, coordinate, axis) => distance + (coordinate - b[axis]) ** 2, 0), 1);
      const endpoints = [a.join(','), b.join(',')].sort();
      uniqueEdges.add(endpoints.join('|'));
      for (const endpoint of endpoints) cornerDegree.set(endpoint, (cornerDegree.get(endpoint) ?? 0) + 1);
    }

    assert.equal(uniqueEdges.size, 12, `Маска ${mask}: ни повторных, ни отсутствующих рёбер.`);
    assert.equal(cornerDegree.size, 8);
    for (const degree of cornerDegree.values()) assert.equal(degree, 3);
    geometry.dispose();
  }
});

test('Нормали описывают именно смежные открытые грани, не меняя каркас', () => {
  for (let mask = 0; mask < 64; mask++) {
    const geometry = createCubeEdgesGeometry(mask, new Float32Array([0, 0, 0]));
    const positions = geometry.getAttribute('position');
    const normalA = geometry.getAttribute('aNormalA');
    const normalB = geometry.getAttribute('aNormalB');
    for (let i = 0; i < positions.count; i += 2) {
      const a = point(positions, i), b = point(positions, i + 1);
      const expected = FACE_DIRECTIONS.filter((normal, side) => {
        if (!(mask & (1 << side))) return false;
        const axis = normal.findIndex((coordinate) => coordinate !== 0);
        return a[axis] === normal[axis] * 0.5 && b[axis] === normal[axis] * 0.5;
      }).map((normal) => normal.join(',')).sort();
      const actual = [point(normalA, i), point(normalB, i)]
        .filter((normal) => normal.some((coordinate) => coordinate !== 0))
        .map((normal) => normal.join(',')).sort();
      assert.deepEqual(actual, expected);
      assert.deepEqual(point(normalA, i), point(normalA, i + 1));
      assert.deepEqual(point(normalB, i), point(normalB, i + 1));
    }
    geometry.dispose();
  }
});

test('Инстансинг сохраняет каждый блок сферы и её точные габариты 196', () => {
  const shell = buildShell();
  const bounds = new THREE.Box3();
  let instances = 0;
  for (const group of shell.groups) {
    const geometry = createCubeEdgesGeometry(group.faceMask, group.centers);
    const centers = geometry.getAttribute('aBlockCenter') as THREE.InstancedBufferAttribute;
    assert.equal(centers.isInstancedBufferAttribute, true);
    assert.equal(centers.meshPerAttribute, 1);
    assert.equal(centers.array, group.centers, 'Данные центров используются без размножения геометрии.');
    assert.equal(centers.count, geometry.instanceCount);
    assert.equal(geometry.getAttribute('position').count, 24, 'Число вершин не растёт с числом блоков.');
    bounds.union(geometry.boundingBox!);
    instances += geometry.instanceCount;
    geometry.dispose();
  }
  assert.equal(instances, shell.blockCount);
  assert.deepEqual(bounds.min.toArray(), [-98, -98, -98]);
  assert.deepEqual(bounds.max.toArray(), [98, 98, 98]);
});

test('Пустой набор безопасен, а неполные или нечисловые координаты отвергаются', () => {
  const geometry = createCubeEdgesGeometry(0, new Float32Array());
  assert.equal(geometry.instanceCount, 0);
  assert.equal(geometry.boundingBox!.isEmpty(), true);
  assert.equal(geometry.boundingSphere!.isEmpty(), true);
  geometry.dispose();
  assert.throws(() => createCubeEdgesGeometry(64, new Float32Array()), RangeError);
  assert.throws(() => createCubeEdgesGeometry(-1, new Float32Array()), RangeError);
  assert.throws(() => createCubeEdgesGeometry(1.5, new Float32Array()), RangeError);
  assert.throws(() => createCubeEdgesGeometry(63, new Float32Array([0, 1])), RangeError);
  assert.throws(() => createCubeEdgesGeometry(63, new Float32Array([0, NaN, 1])), RangeError);
});
