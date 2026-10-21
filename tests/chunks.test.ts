import assert from 'node:assert/strict';
import { buildChunkLines, CHUNK_BOUNDARIES, CHUNK_EXTENT, CHUNK_SIZE, isChunkBoundary, PLATFORM_CHUNKS, SPHERE_CHUNKS } from '../src/chunks';
import { construction } from '../src/model';

assert.equal(PLATFORM_CHUNKS, 7);
assert.equal(construction.platformWidth, 7 * CHUNK_SIZE);
assert.ok(isChunkBoundary(-construction.platformWidth / 2));
assert.ok(isChunkBoundary(construction.platformWidth / 2));
assert.equal(CHUNK_BOUNDARIES.filter(x => x >= -56 && x <= 56).length, 8);
assert.equal(SPHERE_CHUNKS, 13);
assert.equal(CHUNK_BOUNDARIES.length, 14);
assert.equal(CHUNK_EXTENT * 2, 208);
assert.ok(CHUNK_EXTENT >= construction.outerDiameter / 2);
assert.ok(CHUNK_EXTENT - CHUNK_SIZE < construction.outerDiameter / 2);
for (let i = 1; i < CHUNK_BOUNDARIES.length; i++) {
  assert.equal(CHUNK_BOUNDARIES[i] - CHUNK_BOUNDARIES[i - 1], CHUNK_SIZE);
}
const lines = buildChunkLines();
assert.equal(lines.borders.length / 6, 14 * 14);
const seen = new Set<string>();
for (const set of [lines.borders, lines.grid]) {
  assert.equal(set.length % 6, 0);
  for (let i = 0; i < set.length; i += 6) {
    const coordinates = [...set.subarray(i, i + 6)];
    const key = coordinates.join(',');
    assert.ok(!seen.has(key), `Duplicate line ${key}`);
    seen.add(key);
    assert.ok(coordinates.every(Number.isFinite));
    assert.equal(coordinates.filter((c, j) => j < 3 && c !== coordinates[j + 3]).length, 1);
  }
}
console.log('Chunk alignment: platforms 7×7, sphere bounds 13×13, thin line lattice verified.');
