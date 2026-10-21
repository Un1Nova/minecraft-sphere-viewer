import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSliceBlueprint, projectVoxel, sliceCoordinate, sliceSlabs, type BlueprintPlane } from '../src/blueprint.ts';
import { buildShell } from '../src/scene/geometry.ts';

test('центральный чертёж сохраняет точный габарит, площадь и длины ступенек', () => {
  const slice = buildSliceBlueprint();
  assert.deepEqual(slice.bounds, { left: -98, right: 98, top: -98, bottom: 98 });
  assert.equal(slice.solidCount, 30172);
  assert.equal(slice.shellCells.length, 552);
  assert.equal(slice.segments.length, 460);
  assert.equal(slice.dimensionSegments.length, 116);
  assert.equal(slice.segments.reduce((sum, segment) => sum + segment.length, 0), 784);
  assert.equal(slice.dimensionSegments[0].length, 20, 'Верхняя площадка целиком 20, а не половина 10.');
  assert.equal(slice.dimensionSegments.at(-1)!.length, 20);
  assert.deepEqual([...new Set(slice.segments.map(segment => segment.length))].sort((a, b) => a - b), [1, 2, 3, 4, 5, 7, 20]);
  const doubleArea = slice.outline.reduce((sum, point, index) => {
    const next = slice.outline[(index + 1) % slice.outline.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  assert.equal(Math.abs(doubleArea) / 2, slice.solidCount);
  for (const segment of slice.segments) {
    assert.equal(Number.isInteger(segment.length), true);
    assert.ok(segment.length > 0);
    assert.equal(segment.from.x === segment.to.x || segment.from.y === segment.to.y, true);
  }
  assert.deepEqual(buildSliceBlueprint('front', 97).shellCells, slice.shellCells);
});

test('все плоскости берут именно клетки 3D-оболочки, включая полярные шапки', () => {
  const shell = buildShell();
  const planes: BlueprintPlane[] = ['front', 'side', 'top'];
  const layers = [0, 7, 29, 97, 98, 188, 195];
  for (const plane of planes) {
    for (const layer of layers) {
      const coordinate = sliceCoordinate(layer);
      const expected: string[] = [];
      for (const group of shell.groups) {
        for (let i = 0; i < group.centers.length; i += 3) {
          const [x, y, z] = group.centers.subarray(i, i + 3);
          const fixed = plane === 'top' ? y : plane === 'side' ? x : z;
          if (fixed !== coordinate) continue;
          const cell = projectVoxel(plane, x, y, z);
          expected.push(`${cell.x},${cell.y}`);
        }
      }
      const actual = buildSliceBlueprint(plane, layer).shellCells.map(cell => `${cell.x},${cell.y}`);
      assert.deepEqual(actual.sort(), expected.sort(), `${plane}, слой ${layer}`);
    }
  }
  const cap = buildSliceBlueprint('front', 195);
  assert.equal(cap.solidCount, 308);
  assert.equal(cap.shellCells.length, 308);
  assert.equal(buildSliceBlueprint('front', 188).shellCells.length, 600);
});

test('стекло показывается только при действительном пересечении выбранным срезом', () => {
  assert.equal(sliceSlabs('front', 0.5).length, 10);
  assert.equal(sliceSlabs('side', 55.5).length, 10);
  assert.equal(sliceSlabs('front', 56.5).length, 0);
  assert.deepEqual(sliceSlabs('top', 50.5), [{ x: -56, y: -56, width: 112, height: 112 }]);
  assert.equal(sliceSlabs('top', 0.5).length, 0, 'В рабочем пространстве горизонтальной стеклянной плиты нет.');
  for (const slab of sliceSlabs('front', 0.5)) {
    assert.equal(slab.width, 112);
    assert.equal(slab.height, 1);
    assert.equal(Number.isInteger(slab.x) && Number.isInteger(slab.y), true);
  }
});

test('запрещены дробные и отсутствующие слои', () => {
  assert.throws(() => buildSliceBlueprint('front', -1), RangeError);
  assert.throws(() => buildSliceBlueprint('front', 196), RangeError);
  assert.throws(() => buildSliceBlueprint('front', 98.5), RangeError);
  assert.throws(() => buildSliceBlueprint('front', 1, 195), RangeError);
});
