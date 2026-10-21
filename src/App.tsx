import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { construction, defaultSettings, type SceneStats, type ViewerSettings, type ViewPreset } from './model';
import { createSphereScene } from './scene/SphereScene';
import BlueprintView, { type BlueprintHandle } from './BlueprintView';
import type { BlueprintPlane } from './blueprint';
import type { ChunkMode } from './chunks';

const STORAGE_KEY = 'sphere196.viewer.v2';
const INITIAL_STATS: SceneStats = { fps: 0, blockCount: 0, starCount: 0, drawCalls: 0, triangles: 0, ready: false };
type ViewerMode = '3d' | '2d';

function readSettings(): ViewerSettings {
  const settings = { ...defaultSettings };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      const value = saved as Record<string, unknown>;
      const boolKeys = ['cutaway', 'shellVisible', 'glassVisible', 'starsVisible', 'autoRotate', 'showGrid'] as const;
      for (const key of boolKeys) if (typeof value[key] === 'boolean') settings[key] = value[key];
      const ranges = { cutPosition: [0.25, 0.95], shellOpacity: [0, 1], glassOpacity: [0.04, 0.3], starIntensity: [0.25, 2.2] } as const;
      for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
        const n = value[key];
        if (typeof n === 'number' && Number.isFinite(n)) settings[key] = Math.min(ranges[key][1], Math.max(ranges[key][0], n));
      }
      if (value.quality === 'auto' || value.quality === 'high' || value.quality === 'low') settings.quality = value.quality;
      if (value.chunkMode === 'off' || value.chunkMode === 'borders' || value.chunkMode === 'grid') settings.chunkMode = value.chunkMode;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) settings.autoRotate = false;
  } catch { /* Preference storage is optional. */ }
  return settings;
}

type IconName = 'orbit' | 'sliders' | 'close' | 'plus' | 'minus' | 'reset' | 'front' | 'top' | 'side' | 'inside' | 'rotate' | 'chevron' | 'layers' | 'cube' | 'sparkles' | 'ruler' | 'chunks' | 'left' | 'right';
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    orbit: <><circle cx="12" cy="12" r="8.3" /><ellipse cx="12" cy="12" rx="3.7" ry="8.3" transform="rotate(-35 12 12)" /><path d="M4.5 8.3c2.1 3.6 9.3 7.7 15 7.5" /></>,
    sliders: <><path d="M4 6h6m4 0h6M4 12h10m4 0h2M4 18h2m4 0h10" /><circle cx="12" cy="6" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="8" cy="18" r="2" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />, plus: <path d="M12 5v14M5 12h14" />, minus: <path d="M5 12h14" />,
    reset: <path d="M4 9a8 8 0 1 1 .9 8M4 4v5h5" />,
    front: <><rect x="4" y="4" width="16" height="16" rx="2.3" /><path d="M4 12h16M12 4v16" opacity=".4" /></>,
    side: <><path d="m7 5 10-2v18L7 19V5Z" /><path d="m7 12 10-1" opacity=".4" /></>,
    top: <><path d="m12 4 9 5-9 5-9-5 9-5Z" /><path d="m3 14 9 5 9-5" opacity=".5" /></>,
    inside: <path d="M8 4H4v16h4m8-16h4v16h-4M8 12h8m-3-3 3 3-3 3" />,
    rotate: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.4 7.5A7.5 7.5 0 0 1 18 6l2 3M4 15l2 3a7.5 7.5 0 0 0 12.6-1.5" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    layers: <path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" />,
    cube: <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9L4 7.5M12 12l8-4.5M12 12v9" />,
    sparkles: <path d="m9 3 1.7 5.3L16 10l-5.3 1.7L9 17l-1.7-5.3L2 10l5.3-1.7L9 3ZM18 13l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z" />,
    ruler: <><rect x="3" y="7" width="18" height="10" rx="2" /><path d="M7 7v4m5-4v6m5-6v4" /></>,
    chunks: <><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="M9 3.5v17m6-17v17M3.5 9h17m-17 6h17" /></>,
    left: <path d="m14 6-6 6 6 6" />, right: <path d="m10 6 6 6-6 6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function Toggle({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return <label className={'toggle-row' + (disabled ? ' is-disabled' : '')} htmlFor={id}><span>{label}</span>
    <input id={id} className="switch-input" type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
    <span className="switch-track" aria-hidden="true"><span /></span></label>;
}
function Range({ label, value, min, max, step = 1, readout, onChange, disabled = false }: {
  label: string; value: number; min: number; max: number; step?: number; readout: string; onChange: (value: number) => void; disabled?: boolean;
}) {
  const id = useId();
  const progress = Math.min(100, Math.max(0, (value - min) / (max - min) * 100)) + '%';
  return <div className={'range-control' + (disabled ? ' is-disabled' : '')}>
    <div className="range-caption"><label htmlFor={id}>{label}</label><output htmlFor={id}>{readout}</output></div>
    <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} aria-valuetext={readout}
      onChange={e => onChange(Number(e.target.value))} style={{ '--range-progress': progress } as CSSProperties} /></div>;
}
function ToolButton({ label, icon, active = false, disabled = false, onClick, className = '' }: {
  label: string; icon: IconName; active?: boolean; disabled?: boolean; onClick: () => void; className?: string;
}) {
  return <button className={'icon-button tool-button ' + (active ? 'is-active ' : '') + className} aria-label={label} title={label} aria-pressed={active} disabled={disabled} onClick={onClick}>
    <Icon name={icon} /><span className="tool-tip" aria-hidden="true">{label}</span></button>;
}
const VIEWS: { preset: ViewPreset; icon: IconName; title: string }[] = [
  { preset: 'perspective', icon: 'orbit', title: 'Общий вид' }, { preset: 'front', icon: 'front', title: 'Спереди' },
  { preset: 'top', icon: 'top', title: 'Сверху' }, { preset: 'inside', icon: 'inside', title: 'Внутри' },
];
const PLANES: { plane: BlueprintPlane; icon: IconName; title: string; axis: string }[] = [
  { plane: 'front', icon: 'front', title: 'Спереди', axis: 'Z' }, { plane: 'side', icon: 'side', title: 'Сбоку', axis: 'X' }, { plane: 'top', icon: 'top', title: 'Сверху', axis: 'Y' },
];

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ReturnType<typeof createSphereScene> | null>(null);
  const blueprintRef = useRef<BlueprintHandle>(null);
  const [settings, setSettings] = useState<ViewerSettings>(readSettings);
  const initialSettings = useRef(settings);
  const [mode, setMode] = useState<ViewerMode>(() => new URLSearchParams(location.search).get('mode') === '2d' ? '2d' : '3d');
  const [stats, setStats] = useState<SceneStats>(INITIAL_STATS);
  const [error, setError] = useState<string | null>(null);
  const [boot, setBoot] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedView, setSelectedView] = useState<ViewPreset | null>('perspective');
  const [plane, setPlane] = useState<BlueprintPlane>('front');
  const [layer, setLayer] = useState(98);
  const [dimensions, setDimensions] = useState(true);
  const [lastChunkMode, setLastChunkMode] = useState<Exclude<ChunkMode, 'off'>>(settings.chunkMode === 'grid' ? 'grid' : 'borders');

  useEffect(() => {
    if (mode !== '3d') return;
    const container = mountRef.current;
    if (!container) return;
    let alive = true;
    setError(null); setStats(INITIAL_STATS); setSelectedView('perspective');
    try {
      const controller = createSphereScene(container, {
        settings: initialSettings.current,
        onStats: next => { if (alive) setStats(next); },
        onError: message => { if (alive) setError(message); },
      });
      controllerRef.current = controller;
      return () => { alive = false; controllerRef.current = null; controller.dispose(); };
    } catch {
      if (alive) setError('Браузер не смог запустить 3D. Точный чертёж доступен в режиме 2D.');
    }
    return () => { alive = false; };
  }, [boot, mode]);
  useEffect(() => {
    initialSettings.current = settings;
    controllerRef.current?.setSettings(settings);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Optional storage. */ }
  }, [settings]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (mode === '2d') url.searchParams.set('mode', '2d'); else url.searchParams.delete('mode');
    window.history.replaceState(null, '', url);
  }, [mode]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanelOpen(false);
      if ((event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(event.target.tagName))) || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1); }
      if (event.key === '-') { event.preventDefault(); zoom(-1); }
      if (event.key.toLowerCase() === 'r') resetView();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode]);

  function change<K extends keyof ViewerSettings>(key: K, value: ViewerSettings[K]) { setSettings(previous => ({ ...previous, [key]: value })); }
  function changeMode(next: ViewerMode) { setMode(next); setPanelOpen(false); }
  function selectView(preset: ViewPreset) { controllerRef.current?.setView(preset); setSelectedView(preset); }
  function selectChunkMode(next: ChunkMode) { if (next !== 'off') setLastChunkMode(next); change('chunkMode', next); }
  function zoom(direction: -1 | 1) { if (mode === '2d') blueprintRef.current?.zoom(direction > 0 ? 1.25 : 0.8); else controllerRef.current?.zoom(direction); }
  function resetView() { if (mode === '2d') blueprintRef.current?.reset(); else { controllerRef.current?.resetCamera(); setSelectedView('perspective'); } }
  const unavailable = mode === '3d' && (!stats.ready || !!error);
  const activePlane = PLANES.find(item => item.plane === plane)!;

  return <main className={'viewer-app mode-' + mode + (panelOpen ? ' panel-open' : '')}>
    <section className="scene-viewport" aria-label={mode === '3d' ? 'Трёхмерная модель сферы' : 'Блочный чертёж сферы'}>
      {mode === '3d' ? <>
        <div ref={mountRef} className="scene-mount" onPointerDown={() => setSelectedView(null)} />
        {!stats.ready && !error && <div className="scene-loading" role="status"><span className="spinner" /><span className="sr-only">Загрузка сферы</span></div>}
        {error && <div className="scene-error" role="alert"><Icon name="orbit" size={32} /><h2>3D недоступно</h2><p>Открой точный чертёж или попробуй ещё раз.</p>
          <button className="primary-button" onClick={() => changeMode('2d')}>Открыть 2D</button><button className="text-button" onClick={() => setBoot(value => value + 1)}>Повторить</button>
          <details className="error-detail"><summary>Причина</summary><p>{error}</p></details></div>}
      </> : <div className="blueprint-mount"><BlueprintView ref={blueprintRef} plane={plane} layer={layer} dimensions={dimensions} showGrid={settings.showGrid} chunkMode={settings.chunkMode} /></div>}
    </section>
    <header className="topbar">
      <div className="brand"><Icon name="orbit" size={26} /><h1>Сфера</h1><span className="diameter-badge">196</span></div>
      <div className="mode-switch" role="group" aria-label="Режим просмотра"><button aria-pressed={mode === '3d'} className={mode === '3d' ? 'is-active' : ''} onClick={() => changeMode('3d')}>3D</button><button aria-pressed={mode === '2d'} className={mode === '2d' ? 'is-active' : ''} onClick={() => changeMode('2d')}>2D</button></div>
      <button className={'settings-button icon-button' + (panelOpen ? ' is-active' : '')} onClick={() => setPanelOpen(value => !value)} aria-expanded={panelOpen} aria-controls="scene-settings" aria-label="Настройки" title="Настройки"><Icon name="sliders" /></button>
    </header>
    {mode === '2d' && <div className="slice-navigation" role="group" aria-label="Слой чертежа">
      <button className="icon-button" onClick={() => setLayer(v => Math.max(0, v - 1))} disabled={layer === 0} aria-label="Предыдущий слой" title="Предыдущий слой"><Icon name="left" size={15} /></button>
      <button className="slice-label" onClick={() => setPanelOpen(true)} title="Выбрать слой"><span>{activePlane.axis}</span> {layer + 1}<span> / 196</span></button>
      <button className="icon-button" onClick={() => setLayer(v => Math.min(195, v + 1))} disabled={layer === 195} aria-label="Следующий слой" title="Следующий слой"><Icon name="right" size={15} /></button></div>}
    {panelOpen && <aside id="scene-settings" className="settings-panel" aria-label="Настройки сцены">
      <div className="panel-header"><h2>{mode === '3d' ? 'Сцена' : 'Чертёж'}</h2><button className="icon-button" onClick={() => setPanelOpen(false)} aria-label="Закрыть настройки"><Icon name="close" size={17} /></button></div>
      <div className="panel-scroll">
        {mode === '3d' ? <section className="control-group">
          <Range label="Плотность блоков" value={Math.round(settings.shellOpacity * 100)} min={0} max={100} readout={Math.round(settings.shellOpacity * 100) + '%'} onChange={v => change('shellOpacity', v / 100)} disabled={!settings.shellVisible} />
          <Toggle label="Срез по камере" checked={settings.cutaway} onChange={v => change('cutaway', v)} disabled={!settings.shellVisible} />
          <Range label="Размер выреза" value={Math.round(settings.cutPosition * 100)} min={25} max={95} readout={Math.round(settings.cutPosition * 100) + '%'} onChange={v => change('cutPosition', v / 100)} disabled={!settings.cutaway || !settings.shellVisible} />
        </section> : <section className="control-group">
          <label className="select-row"><span>Плоскость</span><select value={plane} onChange={e => setPlane(e.target.value as BlueprintPlane)}>{PLANES.map(p => <option key={p.plane} value={p.plane}>{p.title}</option>)}</select></label>
          <Range label="Слой" value={layer + 1} min={1} max={196} readout={(layer + 1) + ' / 196'} onChange={v => setLayer(v - 1)} />
          <button className="text-button center-slice" onClick={() => setLayer(98)}>Центральный срез</button>
          <Toggle label="Размеры ступенек" checked={dimensions} onChange={setDimensions} />
        </section>}
        <section className="control-group"><div className="control-heading">Чанки</div>
          <div className="chunk-segment" role="group" aria-label="Отображение чанков">
            <button className={settings.chunkMode === 'off' ? 'is-active' : ''} aria-pressed={settings.chunkMode === 'off'} onClick={() => selectChunkMode('off')}>Выкл.</button>
            <button className={settings.chunkMode === 'borders' ? 'is-active' : ''} aria-pressed={settings.chunkMode === 'borders'} onClick={() => selectChunkMode('borders')}><i className="red-dot" />Границы</button>
            <button className={settings.chunkMode === 'grid' ? 'is-active' : ''} aria-pressed={settings.chunkMode === 'grid'} onClick={() => selectChunkMode('grid')}><i className="yellow-dot" />Сетка</button>
          </div><Toggle label="Сетка пространства" checked={settings.showGrid} onChange={v => change('showGrid', v)} />
        </section>
        {mode === '3d' && <>
          <details className="settings-details"><summary>Объекты<Icon name="chevron" size={16} /></summary><div className="details-content">
            <Toggle label="Оболочка" checked={settings.shellVisible} onChange={v => change('shellVisible', v)} />
            <Toggle label="Стеклянные этажи" checked={settings.glassVisible} onChange={v => change('glassVisible', v)} />
            <Toggle label="Светящиеся блоки" checked={settings.starsVisible} onChange={v => change('starsVisible', v)} />
            <button className="text-button" onClick={() => { selectView('inside'); setPanelOpen(false); }}>Внутрь сферы</button>
          </div></details>
          <details className="settings-details"><summary>Дополнительно<Icon name="chevron" size={16} /></summary><div className="details-content">
            <Range label="Плотность стекла" value={Math.round(settings.glassOpacity * 100)} min={4} max={30} readout={Math.round(settings.glassOpacity * 100) + '%'} onChange={v => change('glassOpacity', v / 100)} disabled={!settings.glassVisible} />
            <Range label="Свечение" value={Math.round(settings.starIntensity * 100)} min={25} max={220} readout={Math.round(settings.starIntensity * 100) + '%'} onChange={v => change('starIntensity', v / 100)} disabled={!settings.starsVisible} />
            <label className="select-row"><span>Качество</span><select value={settings.quality} onChange={e => change('quality', e.target.value as ViewerSettings['quality'])}><option value="auto">Авто</option><option value="high">Высокое</option><option value="low">Лёгкое</option></select></label>
          </div></details>
        </>}
        <details className="settings-details"><summary>Размеры<Icon name="chevron" size={16} /></summary>
          <dl className="model-dimensions">
            <div><dt>Сфера</dt><dd>196 × 196 × 196</dd></div><div><dt>Оболочка</dt><dd>1 блок</dd></div>
            <div><dt>Этажи</dt><dd>112 × 112 · 7 × 7 чанков</dd></div><div><dt>Рабочая высота</dt><dd>5 × 16 блоков</dd></div>
            <div><dt>Технические ярусы</dt><dd>4 × 5 блоков</dd></div><div><dt>Общая высота</dt><dd>{construction.totalHeight} блока</dd></div><div><dt>Сетка чанков</dt><dd>13 × 13</dd></div>
          </dl><p className="detail-note">Границы чанков совпадают с краями этажей. Технический ярус: стекло 1 + воздух 3 + стекло 1.</p>
          {mode === '2d' && <p className="detail-note">Один квадрат — один блок. Размеры относятся к внешнему контуру выбранного среза. Мелкие ступеньки раскрываются при приближении.</p>}
        </details>
        <button className="text-button reset-settings" onClick={() => { setSettings({ ...defaultSettings }); setDimensions(true); setLastChunkMode('borders'); }}>Сбросить настройки</button>
      </div>
    </aside>}
    <div className="zoom-controls" role="group" aria-label="Масштаб"><button className="icon-button" onClick={() => zoom(1)} disabled={unavailable} aria-label="Приблизить" title="Приблизить"><Icon name="plus" size={19} /></button>
      <span /><button className="icon-button" onClick={() => zoom(-1)} disabled={unavailable} aria-label="Отдалить" title="Отдалить"><Icon name="minus" size={19} /></button></div>
    <nav className="camera-dock" aria-label={mode === '3d' ? 'Камера' : 'Инструменты чертежа'}>
      <div className="view-presets" role="group" aria-label="Ракурс">
        {mode === '3d' ? VIEWS.map(v => <ToolButton key={v.preset} label={v.title} icon={v.icon} active={selectedView === v.preset} disabled={unavailable} onClick={() => selectView(v.preset)} className={v.preset === 'inside' ? 'inside-preset' : ''} />)
          : PLANES.map(p => <ToolButton key={p.plane} label={p.title} icon={p.icon} active={plane === p.plane} onClick={() => setPlane(p.plane)} />)}
      </div><span className="dock-divider" />
      {mode === '3d' ? <ToolButton label="Автовращение" icon="rotate" active={settings.autoRotate} disabled={unavailable} onClick={() => change('autoRotate', !settings.autoRotate)} />
        : <ToolButton label="Размеры ступенек" icon="ruler" active={dimensions} onClick={() => setDimensions(value => !value)} />}
      <ToolButton label="Границы чанков" icon="chunks" active={settings.chunkMode !== 'off'} onClick={() => selectChunkMode(settings.chunkMode === 'off' ? lastChunkMode : 'off')} />
      <ToolButton label="Показать целиком" icon="reset" disabled={unavailable} onClick={resetView} />
    </nav>
  </main>;
}
