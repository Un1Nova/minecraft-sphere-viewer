/** Вся геометрия задана в блоках Minecraft: один куб имеет сторону 1. */
export const SPHERE_DIAMETER = 196;
export const SPHERE_RADIUS = SPHERE_DIAMETER / 2;
export const STAR_SAFE_RADIUS = 95.5;

export const FACE_DIRECTIONS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

export interface ShellGroup {
  /** Биты: +X, −X, +Y, −Y, +Z, −Z. */
  faceMask: number;
  /** Последовательность x, y, z центров единичных блоков. */
  centers: Float32Array;
}

export interface ShellGeometry {
  groups: ShellGroup[];
  blockCount: number;
}

export interface Star {
  x: number;
  y: number;
  z: number;
  size: number;
  /** 0 — холодный белый, 1 — тёплый белый. */
  warmth: number;
  phase: number;
}

/**
 * Однослойная замкнутая цифровая оболочка.
 *
 * Сначала определяется полный шар по центрам вокселей, затем сохраняются
 * только блоки с хотя бы одним внешним соседом. Соседние грани блоков
 * оболочки исключаются из отрисовки. Временная сетка занимает 196³ байт.
 * Параметр diameter используется также для небольших проверочных моделей.
 */
export function buildShell(diameter = SPHERE_DIAMETER): ShellGeometry {
  if (!Number.isInteger(diameter) || diameter < 4 || diameter > 512 || diameter % 2 !== 0) {
    throw new RangeError('Диаметр должен быть чётным целым числом от 4 до 512.');
  }

  const n = diameter;
  const strideX = n * n;
  const radius = n / 2;
  const radiusSquared = radius * radius;
  const origin = radius - 0.5;
  const cells = new Uint8Array(n * strideX);
  const groupCounts = new Uint32Array(64);
  let blockCount = 0;

  for (let ix = 0; ix < n; ix++) {
    const x = ix - origin;
    const xSquared = x * x;
    for (let iy = 0; iy < n; iy++) {
      const y = iy - origin;
      const xySquared = xSquared + y * y;
      if (xySquared > radiusSquared) continue;

      const limit = Math.sqrt(radiusSquared - xySquared);
      const firstZ = Math.max(0, Math.ceil(origin - limit));
      const lastZ = Math.min(n - 1, Math.floor(origin + limit));
      const row = ix * strideX + iy * n;
      const maxXY = Math.max(Math.abs(x), Math.abs(y));

      for (let iz = firstZ; iz <= lastZ; iz++) {
        const z = iz - origin;
        const distanceSquared = xySquared + z * z;
        // Самый дальний из шести осевых соседей должен лежать вне шара.
        const farthestNeighborSquared = distanceSquared + 1 + 2 * Math.max(maxXY, Math.abs(z));
        if (farthestNeighborSquared > radiusSquared) {
          cells[row + iz] = 1;
          blockCount++;
        }
      }
    }
  }

  for (let ix = 0; ix < n; ix++) {
    for (let iy = 0; iy < n; iy++) {
      const row = ix * strideX + iy * n;
      for (let iz = 0; iz < n; iz++) {
        const index = row + iz;
        if ((cells[index] & 1) === 0) continue;

        let faceMask = 0;
        if (ix === n - 1 || (cells[index + strideX] & 1) === 0) faceMask |= 1;
        if (ix === 0 || (cells[index - strideX] & 1) === 0) faceMask |= 2;
        if (iy === n - 1 || (cells[index + n] & 1) === 0) faceMask |= 4;
        if (iy === 0 || (cells[index - n] & 1) === 0) faceMask |= 8;
        if (iz === n - 1 || (cells[index + 1] & 1) === 0) faceMask |= 16;
        if (iz === 0 || (cells[index - 1] & 1) === 0) faceMask |= 32;

        // Низший бит сохраняет занятость во время того же прохода.
        cells[index] = (faceMask << 1) | 1;
        groupCounts[faceMask]++;
      }
    }
  }

  const groups: ShellGroup[] = [];
  const arraysByMask: Array<Float32Array | undefined> = new Array(64);
  const cursors = new Uint32Array(64);
  for (let faceMask = 1; faceMask < 64; faceMask++) {
    if (!groupCounts[faceMask]) continue;
    const centers = new Float32Array(groupCounts[faceMask] * 3);
    arraysByMask[faceMask] = centers;
    groups.push({ faceMask, centers });
  }

  for (let ix = 0; ix < n; ix++) {
    const x = ix - origin;
    for (let iy = 0; iy < n; iy++) {
      const y = iy - origin;
      const row = ix * strideX + iy * n;
      for (let iz = 0; iz < n; iz++) {
        const encoded = cells[row + iz];
        if ((encoded & 1) === 0) continue;
        const faceMask = encoded >> 1;
        const centers = arraysByMask[faceMask]!;
        const offset = cursors[faceMask];
        centers[offset] = x;
        centers[offset + 1] = y;
        centers[offset + 2] = iz - origin;
        cursors[faceMask] += 3;
      }
    }
  }

  return { groups, blockCount };
}

function randomGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Детерминированные звёзды полностью находятся в свободной внутренней полости. */
export function makeStars(count = 150, seed = 196112): Star[] {
  if (!Number.isInteger(count) || count < 0 || count > 10000) {
    throw new RangeError('Количество звёзд должно быть целым числом от 0 до 10000.');
  }
  if (!Number.isFinite(seed)) throw new RangeError('Seed должен быть конечным числом.');

  const random = randomGenerator(seed);
  const stars: Star[] = [];
  const radiusSquared = STAR_SAFE_RADIUS * STAR_SAFE_RADIUS;
  const maxAttempts = Math.max(2000, count * 400);

  for (let attempt = 0; attempt < maxAttempts && stars.length < count; attempt++) {
    const size = 0.65 + random() * 0.45;
    const half = size / 2;
    const x = (random() * 2 - 1) * STAR_SAFE_RADIUS;
    const y = (random() * 2 - 1) * STAR_SAFE_RADIUS;
    const z = (random() * 2 - 1) * STAR_SAFE_RADIUS;
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const az = Math.abs(z);

    // Проверяется дальний угол куба, а не только его центр.
    if ((ax + half) ** 2 + (ay + half) ** 2 + (az + half) ** 2 > radiusSquared) continue;
    // Запас вокруг полного центрального объёма включает все стеклянные плиты.
    if (ax - half < 58 && ay - half < 53 && az - half < 58) continue;

    let crowded = false;
    for (const other of stars) {
      const clearance = (size + other.size) / 2 + 2;
      if ((other.x - x) ** 2 + (other.y - y) ** 2 + (other.z - z) ** 2 < clearance ** 2) {
        crowded = true;
        break;
      }
    }
    if (crowded) continue;

    stars.push({ x, y, z, size, warmth: random() ** 3, phase: random() * Math.PI * 2 });
  }

  if (stars.length !== count) throw new Error('Не удалось разместить звёзды без пересечений.');
  return stars;
}
