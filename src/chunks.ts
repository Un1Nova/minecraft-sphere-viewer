import { construction } from './model';

export type ChunkMode = 'off' | 'borders' | 'grid';
export const CHUNK_SIZE = 16;
export const CHUNK_DETAIL_STEP = 4;
// Seven chunks have their centre inside the middle chunk, not on its boundary.
// Local platform edges -56 and 56 therefore coincide with chunk boundaries.
export const CHUNK_OFFSET = CHUNK_SIZE / 2;
export const PLATFORM_CHUNKS = construction.platformWidth / CHUNK_SIZE;
export const SPHERE_CHUNKS = 13;
export const CHUNK_EXTENT = SPHERE_CHUNKS * CHUNK_SIZE / 2;
export const CHUNK_MIN_Y = -104;
export const CHUNK_MAX_Y = 104;
export const CHUNK_BOUNDARIES: readonly number[] = Array.from(
  { length: SPHERE_CHUNKS + 1 }, (_, index) => -CHUNK_EXTENT + index * CHUNK_SIZE,
);

export function isChunkBoundary(coordinate: number): boolean {
  return Number.isInteger((coordinate - CHUNK_OFFSET) / CHUNK_SIZE);
}

export interface ChunkLineData { borders: Float32Array; grid: Float32Array }

/** Each line is stored once. The overlay contains no solid surfaces. */
export function buildChunkLines(): ChunkLineData {
  const borders: number[] = [];
  const grid: number[] = [];
  for (const x of CHUNK_BOUNDARIES) {
    for (const z of CHUNK_BOUNDARIES) {
      borders.push(x, CHUNK_MIN_Y, z, x, CHUNK_MAX_Y, z);
    }
  }
  // Smaller divisions lie on vertical chunk planes only, not inside chunks.
  for (const boundary of CHUNK_BOUNDARIES) {
    for (let c = -CHUNK_EXTENT; c <= CHUNK_EXTENT; c += CHUNK_DETAIL_STEP) {
      if (!isChunkBoundary(c)) {
        grid.push(boundary, CHUNK_MIN_Y, c, boundary, CHUNK_MAX_Y, c);
        grid.push(c, CHUNK_MIN_Y, boundary, c, CHUNK_MAX_Y, boundary);
      }
    }
    for (let y = CHUNK_MIN_Y; y <= CHUNK_MAX_Y; y += CHUNK_DETAIL_STEP) {
      grid.push(boundary, y, -CHUNK_EXTENT, boundary, y, CHUNK_EXTENT);
      grid.push(-CHUNK_EXTENT, y, boundary, CHUNK_EXTENT, y, boundary);
    }
  }
  return { borders: new Float32Array(borders), grid: new Float32Array(grid) };
}
