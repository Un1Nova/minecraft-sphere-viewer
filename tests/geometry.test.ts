import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildShell, FACE_DIRECTIONS, makeStars, STAR_SAFE_RADIUS } from '../src/scene/geometry.ts';

const shell = buildShell();

test('Сфера имеет габарит ровно 196 и однослойную границу исходного шара', () => {
  const extrema = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  let count = 0;
  for (const group of shell.groups) {
    assert.ok(group.faceMask > 0 && group.faceMask <= 63);
    assert.equal(group.centers.length % 3, 0);
    for (let index = 0; index < group.centers.length; index += 3) {
      const [x, y, z] = group.centers.subarray(index, index + 3);
      const distanceSquared = x * x + y * y + z * z;
      assert.ok(distanceSquared <= 98 * 98);
      assert.ok(distanceSquared + 1 + 2 * Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > 98 * 98);
      for (const [axis, value] of [x, y, z].entries()) {
        assert.equal(Number.isInteger(value + 0.5), true);
        extrema[axis * 2] = Math.min(extrema[axis * 2], value - 0.5);
        extrema[axis * 2 + 1] = Math.max(extrema[axis * 2 + 1], value + 0.5);
      }
      count++;
    }
  }
  assert.deepEqual(extrema, [-98, 98, -98, 98, -98, 98]);
  assert.equal(count, shell.blockCount);
  assert.ok(count > 50000 && count < 150000);
});

test('Маски всех граней согласованы с соседями; внутренних дублированных граней нет', () => {
  const n = 196;
  const cells = new Uint8Array(n * n * n);
  const key = (x: number, y: number, z: number) => (x * n + y) * n + z;
  for (const group of shell.groups) {
    for (let index = 0; index < group.centers.length; index += 3) {
      const x = group.centers[index] + 97.5;
      const y = group.centers[index + 1] + 97.5;
      const z = group.centers[index + 2] + 97.5;
      assert.equal(cells[key(x, y, z)], 0, 'Один блок не должен встречаться в двух группах.');
      cells[key(x, y, z)] = 1;
    }
  }
  for (const group of shell.groups) {
    for (let index = 0; index < group.centers.length; index += 3) {
      const x = group.centers[index] + 97.5;
      const y = group.centers[index + 1] + 97.5;
      const z = group.centers[index + 2] + 97.5;
      for (let side = 0; side < FACE_DIRECTIONS.length; side++) {
        const direction = FACE_DIRECTIONS[side];
        const nx = x + direction[0], ny = y + direction[1], nz = z + direction[2];
        const outside = nx < 0 || nx >= n || ny < 0 || ny >= n || nz < 0 || nz >= n;
        const exposed = outside || cells[key(nx, ny, nz)] === 0;
        assert.equal(Boolean(group.faceMask & (1 << side)), exposed);
      }
    }
  }
});

test('Оболочка замкнута: заливка снаружи не достигает центра', () => {
  const diameter = 20;
  const sample = buildShell(diameter);
  const n = diameter + 2;
  const cells = new Uint8Array(n * n * n);
  const key = (x: number, y: number, z: number) => (x * n + y) * n + z;
  for (const group of sample.groups) {
    for (let index = 0; index < group.centers.length; index += 3) {
      const x = group.centers[index] + diameter / 2 + 0.5;
      const y = group.centers[index + 1] + diameter / 2 + 0.5;
      const z = group.centers[index + 2] + diameter / 2 + 0.5;
      cells[key(x, y, z)] = 1;
    }
  }
  const queue = new Int32Array(cells.length);
  let first = 0, last = 1;
  cells[0] = 2;
  while (first < last) {
    const index = queue[first++];
    const z = index % n;
    const y = Math.floor(index / n) % n;
    const x = Math.floor(index / (n * n));
    for (const direction of FACE_DIRECTIONS) {
      const nx = x + direction[0], ny = y + direction[1], nz = z + direction[2];
      if (nx < 0 || nx >= n || ny < 0 || ny >= n || nz < 0 || nz >= n) continue;
      const next = key(nx, ny, nz);
      if (cells[next] !== 0) continue;
      cells[next] = 2;
      queue[last++] = next;
    }
  }
  assert.equal(cells[key(n / 2, n / 2, n / 2)], 0);
  assert.equal(cells[cells.length - 1], 2);
});

test('Светящиеся кубы целиком внутри сферы, вне стеклянной рабочей зоны и друг друга', () => {
  const stars = makeStars(300, 42);
  assert.equal(stars.length, 300);
  assert.deepEqual(stars, makeStars(300, 42));
  assert.notDeepEqual(stars, makeStars(300, 43));
  for (let index = 0; index < stars.length; index++) {
    const star = stars[index];
    assert.ok(star.size >= 0.65 && star.size <= 1.1);
    const half = star.size / 2;
    const ax = Math.abs(star.x), ay = Math.abs(star.y), az = Math.abs(star.z);
    assert.ok((ax + half) ** 2 + (ay + half) ** 2 + (az + half) ** 2 <= STAR_SAFE_RADIUS ** 2);
    assert.ok(ax - half >= 58 || ay - half >= 53 || az - half >= 58);
    assert.ok(star.warmth >= 0 && star.warmth <= 1);
    assert.ok(star.phase >= 0 && star.phase < 2 * Math.PI);
    for (const other of stars.slice(index + 1)) {
      const minimum = (star.size + other.size) / 2 + 2;
      assert.ok((star.x - other.x) ** 2 + (star.y - other.y) ** 2 + (star.z - other.z) ** 2 >= minimum ** 2);
    }
  }
});

test('Ошибочные размеры и количества не создают неполную геометрию', () => {
  assert.throws(() => buildShell(195), RangeError);
  assert.throws(() => buildShell(0), RangeError);
  assert.throws(() => makeStars(-1), RangeError);
  assert.throws(() => makeStars(0.5), RangeError);
  assert.throws(() => makeStars(10, NaN), RangeError);
  assert.deepEqual(makeStars(0), []);
});
