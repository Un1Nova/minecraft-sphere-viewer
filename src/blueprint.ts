import { construction } from './model';
import { SPHERE_DIAMETER } from './scene/geometry';

export type BlueprintPlane = 'front' | 'side' | 'top';
export interface BlueprintPoint { x: number; y: number }
export interface BlueprintCell extends BlueprintPoint {}
export interface BlueprintSlab extends BlueprintPoint { width: number; height: number }
export interface BlueprintSegment {
  id: string;
  from: BlueprintPoint;
  to: BlueprintPoint;
  axis: 'horizontal' | 'vertical';
  length: number;
  normal: BlueprintPoint;
}
export interface SliceBlueprint {
  plane: BlueprintPlane;
  layer: number;
  coordinate: number;
  diameter: number;
  solidCount: number;
  shellCells: BlueprintCell[];
  shellPath: string;
  /** Все рёбра отдельных клеток оболочки, общие рёбра записаны один раз. */
  shellEdgesPath: string;
  outline: BlueprintPoint[];
  outlinePath: string;
  segments: BlueprintSegment[];
  dimensionSegments: BlueprintSegment[];
  slabs: BlueprintSlab[];
  bounds: { left: number; right: number; top: number; bottom: number };
}

/** Индекс блока, отсчитанный от внешнего минимума сферы, в координатах модели. */
export function sliceCoordinate(layer: number, diameter = SPHERE_DIAMETER): number {
  if (!Number.isInteger(layer) || layer < 0 || layer >= diameter) {
    throw new RangeError(`Слой должен быть целым числом от 0 до ${diameter - 1}.`);
  }
  return layer - (diameter - 1) / 2;
}

/** SVG использует ось вниз; её знак меняется только при этой проекции. */
export function projectVoxel(plane: BlueprintPlane, x: number, y: number, z: number): BlueprintCell {
  return plane === 'top' ? { x: x - 0.5, y: -z - 0.5 }
    : plane === 'side' ? { x: z - 0.5, y: -y - 0.5 }
      : { x: x - 0.5, y: -y - 0.5 };
}

export function sliceSlabs(plane: BlueprintPlane, coordinate: number): BlueprintSlab[] {
  const half = construction.platformWidth / 2;
  if (plane === 'top') {
    return construction.slabCenters.some(center => Math.abs(center - coordinate) < 0.5)
      ? [{ x: -half, y: -half, width: half * 2, height: half * 2 }] : [];
  }
  if (Math.abs(coordinate) >= half) return [];
  return construction.slabCenters.map(center => ({
    x: -half, y: -center - 0.5, width: half * 2, height: 1,
  }));
}

/**
 * Точное сечение той же 3D-оболочки, которую строит buildShell.
 * Для внешнего контура используется заполненный шар, для клеток оболочки —
 * один шестисвязный граничный слой 3D. На полюсах сечение слоя является
 * заполненной шапкой, поэтому заменять его обычным 2D-ободом нельзя.
 */
export function buildSliceBlueprint(
  plane: BlueprintPlane = 'front', layer = SPHERE_DIAMETER / 2, diameter = SPHERE_DIAMETER,
): SliceBlueprint {
  if (!Number.isInteger(diameter) || diameter < 4 || diameter > 512 || diameter % 2 !== 0) {
    throw new RangeError('Диаметр должен быть чётным целым числом от 4 до 512.');
  }
  if (!['front', 'side', 'top'].includes(plane)) throw new RangeError('Неизвестная плоскость сечения.');
  const coordinate = sliceCoordinate(layer, diameter);
  const radius = diameter / 2;
  const radiusSquared = radius * radius;
  const origin = radius - 0.5;
  const solid = new Uint8Array(diameter * diameter);
  const shellCells: BlueprintCell[] = [];
  let solidCount = 0;
  const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (let v = 0; v < diameter; v++) {
    const b = v - origin;
    for (let u = 0; u < diameter; u++) {
      const a = u - origin;
      const squared = a * a + b * b + coordinate * coordinate;
      if (squared > radiusSquared) continue;
      solid[v * diameter + u] = 1;
      solidCount++;
      const x = u - radius;
      const y = radius - v - 1;
      bounds.left = Math.min(bounds.left, x);
      bounds.right = Math.max(bounds.right, x + 1);
      bounds.top = Math.min(bounds.top, y);
      bounds.bottom = Math.max(bounds.bottom, y + 1);
      if (squared + 1 + 2 * Math.max(Math.abs(a), Math.abs(b), Math.abs(coordinate)) > radiusSquared) {
        shellCells.push({ x, y });
      }
    }
  }

  const occupied = (u: number, v: number) => u >= 0 && v >= 0 && u < diameter && v < diameter
    && solid[v * diameter + u] === 1;
  const key = (p: BlueprintPoint) => `${p.x},${p.y}`;
  const edges = new Map<string, BlueprintPoint>();
  let first: BlueprintPoint | undefined;
  function edge(x1: number, y1: number, x2: number, y2: number) {
    const from = { x: x1, y: y1 };
    edges.set(key(from), { x: x2, y: y2 });
    if (!first || y1 < first.y || (y1 === first.y && x1 < first.x)) first = from;
  }
  for (let v = 0; v < diameter; v++) {
    for (let u = 0; u < diameter; u++) {
      if (!occupied(u, v)) continue;
      const x = u - radius, y = radius - v - 1;
      if (!occupied(u, v + 1)) edge(x, y, x + 1, y);
      if (!occupied(u + 1, v)) edge(x + 1, y, x + 1, y + 1);
      if (!occupied(u, v - 1)) edge(x + 1, y + 1, x, y + 1);
      if (!occupied(u - 1, v)) edge(x, y + 1, x, y);
    }
  }
  const perimeter: BlueprintPoint[] = [];
  if (first) {
    let cursor = first;
    do {
      perimeter.push(cursor);
      const next = edges.get(key(cursor));
      if (!next || perimeter.length > edges.size) throw new Error('Незамкнутый контур сечения.');
      cursor = next;
    } while (key(cursor) !== key(first));
    if (perimeter.length !== edges.size) throw new Error('Сечение содержит несколько внешних контуров.');
  }
  const outline = perimeter.filter((point, index) => {
    const previous = perimeter[(index + perimeter.length - 1) % perimeter.length];
    const next = perimeter[(index + 1) % perimeter.length];
    return point.x - previous.x !== next.x - point.x || point.y - previous.y !== next.y - point.y;
  });
  const segments = outline.map((from, index): BlueprintSegment => {
    const to = outline[(index + 1) % outline.length];
    const dx = to.x - from.x, dy = to.y - from.y;
    const length = Math.abs(dx) + Math.abs(dy);
    const axis = dy === 0 ? 'horizontal' : 'vertical';
    return { id: `${from.x},${from.y}:${to.x},${to.y}`, from, to, axis, length,
      normal: { x: dy / length, y: -dx / length } };
  });
  const dimensionSegments = segments.filter(segment =>
    segment.from.x + segment.to.x >= 0 && segment.from.y + segment.to.y <= 0,
  ).sort((a, b) => Math.atan2(a.from.x + a.to.x, -a.from.y - a.to.y)
    - Math.atan2(b.from.x + b.to.x, -b.from.y - b.to.y));

  // One SVG element keeps dense polar slices cheap to render. Canonical
  // left-to-right / top-to-bottom edges retain every block division without
  // overdrawing a shared edge twice or confusing it with the outer contour.
  const cellEdges = new Set<string>();
  for (const { x, y } of shellCells) {
    cellEdges.add(`M${x} ${y}h1`);
    cellEdges.add(`M${x} ${y + 1}h1`);
    cellEdges.add(`M${x} ${y}v1`);
    cellEdges.add(`M${x + 1} ${y}v1`);
  }

  return {
    plane, layer, coordinate, diameter, solidCount, shellCells, bounds, outline, segments, dimensionSegments,
    shellPath: shellCells.map(cell => `M${cell.x} ${cell.y}h1v1h-1Z`).join(''),
    shellEdgesPath: [...cellEdges].join(''),
    outlinePath: outline.length ? `M${outline.map(point => `${point.x} ${point.y}`).join('L')}Z` : '',
    slabs: diameter === SPHERE_DIAMETER ? sliceSlabs(plane, coordinate) : [],
  };
}

export function distanceToSegment(point: BlueprintPoint, segment: BlueprintSegment): number {
  const dx = segment.to.x - segment.from.x, dy = segment.to.y - segment.from.y;
  const t = Math.max(0, Math.min(1, ((point.x - segment.from.x) * dx + (point.y - segment.from.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - segment.from.x - t * dx, point.y - segment.from.y - t * dy);
}
