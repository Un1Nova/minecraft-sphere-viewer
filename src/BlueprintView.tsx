import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { buildSliceBlueprint, distanceToSegment, type BlueprintPlane, type BlueprintPoint, type BlueprintSegment } from './blueprint';
import { construction } from './model';
import { CHUNK_BOUNDARIES, CHUNK_DETAIL_STEP, CHUNK_EXTENT, type ChunkMode } from './chunks';

export interface BlueprintHandle {
  zoom(factor: number): void;
  reset(): void;
}
export interface BlueprintViewProps {
  plane?: BlueprintPlane;
  /** Номер блока от нижнего края выбранной оси: 0…195. */
  layer?: number;
  dimensions?: boolean;
  showGrid?: boolean;
  chunkMode?: ChunkMode;
}
interface Camera2D { zoom: number; x: number; y: number }
interface DimensionLabel {
  segment: BlueprintSegment;
  anchor: BlueprintPoint;
  x: number;
  y: number;
  width: number;
  selected: boolean;
}
const INITIAL_CAMERA: Camera2D = { zoom: 1, x: 0, y: 0 };
const planeTitles: Record<BlueprintPlane, string> = { front: 'Вид спереди', side: 'Вид сбоку', top: 'Вид сверху' };
const blockWord = (value: number) => value % 10 === 1 && value % 100 !== 11 ? 'блок'
  : value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 12 || value % 100 > 14) ? 'блока' : 'блоков';

function DimensionLine({ x1, y1, x2, y2, label, vertical = false }: {
  x1: number; y1: number; x2: number; y2: number; label: string; vertical?: boolean;
}) {
  const tx = (x1 + x2) / 2, ty = (y1 + y2) / 2;
  const w = Math.max(22, label.length * 6.5 + 10);
  return <g pointerEvents="none" aria-hidden="true">
    <path d={vertical
      ? `M${x1} ${y1}V${y2}M${x1 - 4} ${y1}h8M${x1 - 4} ${y2}h8`
      : `M${x1} ${y1}H${x2}M${x1} ${y1 - 4}v8M${x2} ${y1 - 4}v8`}
      fill="none" stroke="#a3a8b0" strokeWidth="0.8" />
    <rect x={tx - w / 2} y={ty - 8} width={w} height="16" rx="6" fill="#eceef1" />
    <text x={tx} y={ty} fill="#6a7079" textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="500">{label}</text>
  </g>;
}

/** Независимый от WebGL строительный чертёж из точных клеток сферы. */
const BlueprintView = forwardRef<BlueprintHandle, BlueprintViewProps>(function BlueprintView({
  plane = 'front', layer = 98, dimensions = true, showGrid = true, chunkMode = 'off',
}, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 800, height: 700 });
  const [camera, setCamera] = useState<Camera2D>(INITIAL_CAMERA);
  const cameraRef = useRef(camera);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pointers = useRef(new Map<number, BlueprintPoint>());
  const pointerStart = useRef<BlueprintPoint | null>(null);
  const gestureMoved = useRef(false);
  const uid = useId().replace(/:/g, '');
  const slice = useMemo(() => buildSliceBlueprint(plane, layer), [plane, layer]);
  const fitScale = Math.max(0.2, Math.min((size.width - (size.width < 600 ? 52 : 112)) / 244, (size.height - 240) / 238));
  const center = { x: size.width / 2, y: 110 + Math.max(1, size.height - 230) / 2 };
  const scale = fitScale * camera.zoom;
  const origin = { x: center.x + camera.x, y: center.y + camera.y };
  const viewRef = useRef({ fitScale, center });
  viewRef.current = { fitScale, center };
  const selected = slice.segments.find(segment => segment.id === selectedId) ?? null;

  const updateCamera = useCallback((next: Camera2D) => {
    cameraRef.current = next;
    setCamera(next);
  }, []);
  const zoomAt = useCallback((factor: number, anchor?: BlueprintPoint, translation: BlueprintPoint = { x: 0, y: 0 }) => {
    const previous = cameraRef.current;
    const view = viewRef.current;
    const zoom = Math.max(0.5, Math.min(80 / view.fitScale, previous.zoom * factor));
    const ratio = zoom / previous.zoom;
    const focal = anchor ?? view.center;
    updateCamera({ zoom,
      x: previous.x * ratio + (focal.x - view.center.x) * (1 - ratio) + translation.x,
      y: previous.y * ratio + (focal.y - view.center.y) * (1 - ratio) + translation.y,
    });
  }, [updateCamera]);
  const reset = useCallback(() => updateCamera({ ...INITIAL_CAMERA }), [updateCamera]);
  useImperativeHandle(ref, () => ({ zoom: (factor) => zoomAt(factor), reset }), [reset, zoomAt]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setSelectedId(null); }, [plane, layer]);
  useEffect(() => {
    const element = svgRef.current;
    if (!element) return;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      const rect = element!.getBoundingClientRect();
      const amount = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 500 : event.deltaY;
      zoomAt(Math.exp(Math.max(-0.7, Math.min(0.7, -amount * 0.0018))), { x: event.clientX - rect.left, y: event.clientY - rect.top });
    }
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [zoomAt]);

  function localPoint(event: ReactPointerEvent<SVGSVGElement>): BlueprintPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const point = localPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 1) { pointerStart.current = point; gestureMoved.current = false; }
    else gestureMoved.current = true;
  }
  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    const before = [...pointers.current.values()];
    const oldPoint = pointers.current.get(event.pointerId)!;
    const point = localPoint(event);
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size >= 2) {
      const after = [...pointers.current.values()];
      const oldMid = { x: (before[0].x + before[1].x) / 2, y: (before[0].y + before[1].y) / 2 };
      const newMid = { x: (after[0].x + after[1].x) / 2, y: (after[0].y + after[1].y) / 2 };
      const oldDistance = Math.hypot(before[1].x - before[0].x, before[1].y - before[0].y);
      const newDistance = Math.hypot(after[1].x - after[0].x, after[1].y - after[0].y);
      if (oldDistance > 1) zoomAt(newDistance / oldDistance, oldMid, { x: newMid.x - oldMid.x, y: newMid.y - oldMid.y });
      gestureMoved.current = true;
      return;
    }
    const dx = point.x - oldPoint.x, dy = point.y - oldPoint.y;
    const start = pointerStart.current;
    if (start && Math.hypot(point.x - start.x, point.y - start.y) > 4) gestureMoved.current = true;
    const previous = cameraRef.current;
    updateCamera({ ...previous, x: previous.x + dx, y: previous.y + dy });
  }
  function selectAt(point: BlueprintPoint, touch: boolean) {
    if (!dimensions) return;
    const world = { x: (point.x - origin.x) / scale, y: (point.y - origin.y) / scale };
    let closest: BlueprintSegment | null = null;
    let distance = (touch ? 20 : 12) / scale;
    for (const segment of slice.segments) {
      const next = distanceToSegment(world, segment);
      if (next < distance) { closest = segment; distance = next; }
    }
    setSelectedId(closest?.id ?? null);
  }
  function pointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    if (!gestureMoved.current && pointers.current.size === 1 && event.type !== 'pointercancel') {
      selectAt(localPoint(event), event.pointerType === 'touch');
    }
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function chooseStep(delta: number) {
    const index = selected ? slice.segments.indexOf(selected) : slice.segments.indexOf(slice.dimensionSegments[0]);
    setSelectedId(slice.segments[(index + delta + slice.segments.length) % slice.segments.length].id);
  }

  const labels = useMemo((): DimensionLabel[] => {
    if (!dimensions) return [];
    const candidates = [...slice.dimensionSegments];
    if (selected && !candidates.some(segment => segment.id === selected.id)) candidates.push(selected);
    candidates.sort((a, b) => Number(b.id === selected?.id) - Number(a.id === selected?.id) || b.length - a.length);
    const result: DimensionLabel[] = [];
    for (const segment of candidates) {
      const active = segment.id === selected?.id;
      if (!active && segment.length === 1 && scale < 7) continue;
      const anchor = { x: origin.x + (segment.from.x + segment.to.x) / 2 * scale,
        y: origin.y + (segment.from.y + segment.to.y) / 2 * scale };
      if (anchor.x < -10 || anchor.x > size.width + 10 || anchor.y < 65 || anchor.y > size.height - 85) continue;
      const width = Math.max(18, String(segment.length).length * 6.8 + 9);
      for (const offset of active ? [17, 32, 47, 62] : [15, 30, 45, 60]) {
        const x = anchor.x + segment.normal.x * offset;
        const y = anchor.y + segment.normal.y * offset;
        if (x - width / 2 < 7 || x + width / 2 > size.width - 7 || y < 88 || y > size.height - 98) continue;
        const overlaps = result.some(other => Math.abs(x - other.x) < (width + other.width) / 2 + 4 && Math.abs(y - other.y) < 20);
        if (overlaps && !active) continue;
        result.push({ segment, anchor, x, y, width, selected: active });
        break;
      }
    }
    return result;
  }, [dimensions, slice, selected, scale, origin.x, origin.y, size.width, size.height]);

  const project = (x: number, y: number): BlueprintPoint => ({ x: origin.x + x * scale, y: origin.y + y * scale });
  const min = project(slice.bounds.left, slice.bounds.top), max = project(slice.bounds.right, slice.bounds.bottom);
  const minorChunkLines = Array.from({ length: CHUNK_EXTENT * 2 / CHUNK_DETAIL_STEP + 1 }, (_, index) => -CHUNK_EXTENT + index * CHUNK_DETAIL_STEP);
  const chunkColour = chunkMode === 'borders' ? '#df4652' : '#d5b32e';
  const gridUnit = scale >= 4 ? 1 : 8;
  const isPlateSlice = slice.slabs.length > 0;

  return <div ref={hostRef} className="blueprint-view" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
    <svg ref={svgRef} className="blueprint-stage" viewBox={`0 0 ${size.width} ${size.height}`}
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', userSelect: 'none', outline: 'none' }}
      role="application" aria-label={`${planeTitles[plane]}. Строительный срез сферы, слой ${layer + 1}.`}
      tabIndex={0} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
      onContextMenu={event => event.preventDefault()}
      onDoubleClick={event => { const rect = event.currentTarget.getBoundingClientRect(); zoomAt(1.8, { x: event.clientX - rect.left, y: event.clientY - rect.top }); }}
      onKeyDown={event => {
        if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
        if (event.key === '+' || event.key === '=') zoomAt(1.25);
        else if (event.key === '-') zoomAt(0.8);
        else if (event.key === 'Home') reset();
        else if (dimensions && event.key === 'ArrowRight') chooseStep(1);
        else if (dimensions && event.key === 'ArrowLeft') chooseStep(-1);
        else return;
        event.preventDefault(); event.stopPropagation();
      }}>
      <title>{planeTitles[plane]} · слой {layer + 1}</title>
      <desc>Точный срез блочной оболочки. {slice.shellCells.length} чёрных блоков в этом слое. Перетаскивайте для сдвига, используйте колесо или два пальца для масштаба. Нажмите на ступеньку, чтобы увидеть её длину.</desc>
      <defs>
        <pattern id={`${uid}-space`} patternUnits="userSpaceOnUse" width={gridUnit * scale} height={gridUnit * scale} patternTransform={`translate(${origin.x} ${origin.y})`}>
          <path d={`M0 ${gridUnit * scale}V0H${gridUnit * scale}`} fill="none" stroke="#fff" strokeOpacity={gridUnit === 1 ? 0.62 : 0.9} strokeWidth="0.75" />
        </pattern>
        <pattern id={`${uid}-blocks`} patternUnits="userSpaceOnUse" width="1" height="1">
          <path d="M0 1V0H1" fill="none" stroke="#f9fbfd" strokeOpacity="0.55" strokeWidth={0.6 / scale} />
        </pattern>
        <clipPath id={`${uid}-shell`}><path d={slice.shellPath} /></clipPath>
      </defs>
      <rect width={size.width} height={size.height} fill="#e8eaed" />
      {showGrid && <rect width={size.width} height={size.height} fill={`url(#${uid}-space)`} />}
      <g transform={`translate(${origin.x} ${origin.y}) scale(${scale})`}>
        {chunkMode !== 'off' && <g aria-label="Границы чанков" pointerEvents="none">
          {chunkMode === 'grid' && <g stroke="#4ba874" strokeWidth={0.5 / scale} opacity="0.78">
            {minorChunkLines.map(value => <path key={`minor-${value}`} d={`M${value} ${-CHUNK_EXTENT}V${CHUNK_EXTENT}M${-CHUNK_EXTENT} ${value}H${CHUNK_EXTENT}`} fill="none" />)}
          </g>}
          <g stroke={chunkColour} strokeWidth={0.9 / scale} opacity="0.92">
            {CHUNK_BOUNDARIES.map(value => <path key={value} d={plane === 'top' ? `M${value} ${-CHUNK_EXTENT}V${CHUNK_EXTENT}M${-CHUNK_EXTENT} ${value}H${CHUNK_EXTENT}` : `M${value} ${-CHUNK_EXTENT}V${CHUNK_EXTENT}`} fill="none" />)}
          </g>
        </g>}
        <path d={slice.shellPath} fill="#272a30" />
        {scale >= 4 && <rect x={-98} y={-98} width="196" height="196" fill={`url(#${uid}-blocks)`} clipPath={`url(#${uid}-shell)`} />}
        <path d={slice.outlinePath} fill="none" stroke="#202329" strokeWidth={Math.min(0.16, 0.5 / scale)} />
        {slice.slabs.map((slab, index) => <g key={index}>
          <rect {...slab} fill="#69b3d5" fillOpacity="0.44" stroke="#5093b5" strokeWidth={0.7 / scale} />
          {scale >= 4 && <rect {...slab} fill={`url(#${uid}-blocks)`} />}
        </g>)}
        {selected && dimensions && <path d={`M${selected.from.x} ${selected.from.y}L${selected.to.x} ${selected.to.y}`}
          stroke="#007aff" strokeWidth={3 / scale} fill="none" strokeLinecap="round" />}
      </g>
      {dimensions && <g className="blueprint-dimensions">
        {max.x - min.x > 50 && max.y + 30 < size.height - 80 && <DimensionLine x1={min.x} y1={max.y + 28} x2={max.x} y2={max.y + 28} label={`${slice.bounds.right - slice.bounds.left}`} />}
        {min.x > 31 && max.y - min.y > 50 && <DimensionLine x1={min.x - 27} y1={min.y} x2={min.x - 27} y2={max.y} label={`${slice.bounds.bottom - slice.bounds.top}`} vertical />}
        {isPlateSlice && plane !== 'top' && scale >= 1 && <>
          <DimensionLine x1={project(-56, 0).x} y1={project(0, 51).y + 16} x2={project(56, 0).x} y2={project(0, 51).y + 16} label="112" />
          {construction.workingRanges.map(([low, high]) => <DimensionLine key={`working-${low}`} x1={project(-56, 0).x - 17} y1={project(0, -high).y} x2={project(-56, 0).x - 17} y2={project(0, -low).y} label="16" vertical />)}
          {construction.technicalRanges.map(([low, high]) => <DimensionLine key={`technical-${low}`} x1={project(56, 0).x + 17} y1={project(0, -high).y} x2={project(56, 0).x + 17} y2={project(0, -low).y} label="5" vertical />)}
        </>}
        {labels.map(label => <g key={label.segment.id} role="button" tabIndex={0}
          aria-label={`${label.segment.axis === 'horizontal' ? 'Горизонталь' : 'Вертикаль'}: ${label.segment.length} ${blockWord(label.segment.length)}`} aria-pressed={label.selected}
          style={{ cursor: 'pointer' }} onPointerDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); setSelectedId(label.segment.id); }}
          onDoubleClick={event => event.stopPropagation()}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setSelectedId(label.segment.id); } }}>
          <path d={`M${label.anchor.x} ${label.anchor.y}L${label.x} ${label.y}`} fill="none" stroke={label.selected ? '#007aff' : '#8e959f'} strokeWidth={label.selected ? 1.2 : 0.7} pointerEvents="none" />
          <rect x={label.x - Math.max(label.width, 26) / 2} y={label.y - 12} width={Math.max(label.width, 26)} height="24" rx="6" fill="transparent" />
          <rect x={label.x - label.width / 2} y={label.y - 8.5} width={label.width} height="17" rx="5" fill={label.selected ? '#007aff' : '#ffffff'} fillOpacity={label.selected ? 1 : 0.92} />
          <text x={label.x} y={label.y} dominantBaseline="central" textAnchor="middle" fontSize="11" fontWeight="600" fill={label.selected ? '#fff' : '#50565f'}>{label.segment.length}</text>
        </g>)}
      </g>}
    </svg>
    {dimensions && selected && <div className="blueprint-step-card" role="status" style={{
      position: 'absolute', left: size.width < 600 ? 16 : 24,
      bottom: `max(${size.width < 600 ? 132 : 110}px, calc(env(safe-area-inset-bottom) + 106px))`,
      display: 'flex', alignItems: 'center', gap: 2, padding: 6, maxWidth: 'calc(100% - 32px)', zIndex: 2,
    }}>
      <button className="icon-button" type="button" aria-label="Предыдущая ступенька" style={{ fontSize: 26, lineHeight: 1 }} onClick={() => chooseStep(-1)}>‹</button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 88, padding: '0 4px' }}>
        <span style={{ fontSize: 11, lineHeight: 1.3, color: '#7e8189' }}>{selected.axis === 'horizontal' ? 'Горизонталь' : 'Вертикаль'}</span>
        <strong style={{ fontSize: 15, lineHeight: 1.3, fontWeight: 650, color: '#25262b' }}>{selected.length} {blockWord(selected.length)}</strong>
      </div>
      <button className="icon-button" type="button" aria-label="Следующая ступенька" style={{ fontSize: 26, lineHeight: 1 }} onClick={() => chooseStep(1)}>›</button>
      <button className="icon-button" type="button" aria-label="Снять выделение ступеньки" style={{ fontSize: 22, lineHeight: 1 }} onClick={() => setSelectedId(null)}>×</button>
    </div>}
  </div>;
});

export default BlueprintView;
