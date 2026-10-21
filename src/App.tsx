import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { defaultSettings, type SceneStats, type ViewerSettings, type ViewPreset } from './model';
import { createSphereScene } from './scene/SphereScene';

const STORAGE_KEY = 'sphere196.viewer.v1';
const INITIAL_STATS: SceneStats = { fps: 0, blockCount: 0, starCount: 0, drawCalls: 0, triangles: 0, ready: false };

function readSettings(): ViewerSettings {
  const settings = { ...defaultSettings };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      const value = saved as Record<string, unknown>;
      const boolKeys = ['cutaway', 'shellVisible', 'glassVisible', 'starsVisible', 'autoRotate', 'showGrid'] as const;
      for (const key of boolKeys) if (typeof value[key] === 'boolean') settings[key] = value[key];
      const ranges = { cutPosition: [-0.4, 0.4], glassOpacity: [0.04, 0.3], starIntensity: [0.25, 2.2] } as const;
      for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
        const n = value[key];
        if (typeof n === 'number' && Number.isFinite(n)) settings[key] = Math.min(ranges[key][1], Math.max(ranges[key][0], n));
      }
      if (value.quality === 'auto' || value.quality === 'high' || value.quality === 'low') settings.quality = value.quality;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) settings.autoRotate = false;
  } catch { /* Storage is optional, including in private browsing. */ }
  return settings;
}

type IconName = 'orbit' | 'sliders' | 'close' | 'plus' | 'minus' | 'reset' | 'front' | 'top' | 'inside' | 'rotate' | 'mouse' | 'chevron' | 'layers' | 'cube' | 'sparkles';

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    orbit: <><circle cx="12" cy="12" r="8.3" /><ellipse cx="12" cy="12" rx="3.7" ry="8.3" transform="rotate(-35 12 12)" /><path d="M4.5 8.3c2.1 3.6 9.3 7.7 15 7.5" /></>,
    sliders: <><path d="M4 6h6m4 0h6M4 12h10m4 0h2M4 18h2m4 0h10" /><circle cx="12" cy="6" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="8" cy="18" r="2" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    reset: <><path d="M4 9a8 8 0 1 1 .9 8M4 4v5h5" /></>,
    front: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 12h16M12 4v16" opacity=".55" /></>,
    top: <><path d="m12 3 9 6-9 6-9-6 9-6Z" /><path d="m3 13 9 6 9-6M3 17l9 6 9-6" opacity=".55" transform="translate(0 -2)" /></>,
    inside: <><path d="M8 4H4v16h4m8-16h4v16h-4M8 12h8m-3-3 3 3-3 3" /></>,
    rotate: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.4 7.5A7.5 7.5 0 0 1 18 6l2 3M4 15l2 3a7.5 7.5 0 0 0 12.6-1.5" /></>,
    mouse: <><rect x="6.5" y="3" width="11" height="18" rx="5.5" /><path d="M12 7v3" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" /></>,
    cube: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9L4 7.5M12 12l8-4.5M12 12v9" /></>,
    sparkles: <><path d="m9 3 1.7 5.3L16 10l-5.3 1.7L9 17l-1.7-5.3L2 10l5.3-1.7L9 3ZM18 13l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Toggle({ label, description, checked, onChange, icon, disabled = false }: {
  label: string; description?: string; checked: boolean; onChange: (value: boolean) => void; icon?: IconName; disabled?: boolean;
}) {
  const id = useId();
  return <label className={`toggle-row${description ? ' toggle-row--featured' : ''}${disabled ? ' is-disabled' : ''}`} htmlFor={id}>
    {icon && <span className="row-icon"><Icon name={icon} size={18} /></span>}
    <span className="toggle-copy"><span>{label}</span>{description && <small>{description}</small>}</span>
    <input id={id} className="switch-input" type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span className="switch-track" aria-hidden="true"><span /></span>
  </label>;
}

function Range({ label, value, min, max, step, readout, onChange, disabled = false }: {
  label: string; value: number; min: number; max: number; step: number; readout: string; onChange: (value: number) => void; disabled?: boolean;
}) {
  const id = useId();
  const progress = `${Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))}%`;
  return <div className={`range-control${disabled ? ' is-disabled' : ''}`}>
    <div className="range-caption"><label htmlFor={id}>{label}</label><output htmlFor={id}>{readout}</output></div>
    <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} aria-valuetext={readout} onChange={(e) => onChange(Number(e.target.value))} style={{ '--range-progress': progress } as CSSProperties} />
  </div>;
}

const VIEWS: { preset: ViewPreset; label: string; icon: IconName; title: string }[] = [
  { preset: 'perspective', label: 'Общий', icon: 'orbit', title: 'Общий вид' },
  { preset: 'front', label: 'Спереди', icon: 'front', title: 'Вид спереди' },
  { preset: 'top', label: 'Сверху', icon: 'top', title: 'Вид сверху' },
  { preset: 'inside', label: 'Внутрь', icon: 'inside', title: 'Посмотреть изнутри' },
];

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ReturnType<typeof createSphereScene> | null>(null);
  const [settings, setSettings] = useState<ViewerSettings>(readSettings);
  const initialSettings = useRef(settings);
  const [stats, setStats] = useState<SceneStats>(INITIAL_STATS);
  const [error, setError] = useState<string | null>(null);
  const [boot, setBoot] = useState(0);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 960);
  const [selectedView, setSelectedView] = useState<ViewPreset | null>('perspective');

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    let alive = true;
    setError(null);
    setStats(INITIAL_STATS);
    try {
      const controller = createSphereScene(container, {
        settings: initialSettings.current,
        onStats: (next) => { if (alive) setStats(next); },
        onError: (message) => { if (alive) setError(message); },
      });
      controllerRef.current = controller;
      return () => {
        alive = false;
        controllerRef.current = null;
        controller.dispose();
      };
    } catch {
      if (alive) setError('Не удалось запустить 3D-сцену. Проверьте, поддерживает ли браузер WebGL, и попробуйте ещё раз.');
    }
    return () => { alive = false; };
  }, [boot]);

  useEffect(() => {
    initialSettings.current = settings;
    controllerRef.current?.setSettings(settings);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Optional preference storage. */ }
  }, [settings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanelOpen(false);
      if ((event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName))) || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key === '+' || event.key === '=') controllerRef.current?.zoom(1);
      if (event.key === '-') controllerRef.current?.zoom(-1);
      if (event.key.toLowerCase() === 'r') { controllerRef.current?.resetCamera(); setSelectedView('perspective'); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function change<K extends keyof ViewerSettings>(key: K, value: ViewerSettings[K]) {
    setSettings((previous) => ({ ...previous, [key]: value }));
  }

  function selectView(preset: ViewPreset) {
    controllerRef.current?.setView(preset);
    setSelectedView(preset);
  }

  function resetView() {
    controllerRef.current?.resetCamera();
    setSelectedView('perspective');
  }

  const opening = Math.round((0.4 - settings.cutPosition) / 0.8 * 100);
  const glassTransparency = Math.round((1 - settings.glassOpacity) * 100);

  return <main className={`viewer-app${panelOpen ? ' panel-open' : ''}`}>
    <section className="scene-viewport" aria-label="Интерактивная трёхмерная модель сферы">
      <div ref={mountRef} className="scene-mount" onPointerDown={() => setSelectedView(null)} />
      <div className="scene-vignette" aria-hidden="true" />
      {!stats.ready && !error && <div className="scene-loading" role="status" aria-live="polite">
        <span className="loading-orbit" aria-hidden="true"><span /></span>
        <strong>Собираем сферу</strong>
        <span>Готовим блоки и стеклянные уровни</span>
      </div>}
      {error && <div className="scene-error" role="alert">
        <Icon name="orbit" size={32} />
        <h1>Сцена пока недоступна</h1>
        <p>{error}</p>
        <button className="primary-button" onClick={() => setBoot((value) => value + 1)}>Попробовать ещё раз</button>
      </div>}
    </section>

    <header className="topbar">
      <div className="brand">
        <div className="brand-symbol"><Icon name="orbit" size={30} /></div>
        <div><h1>СФЕРА <span>/ 196</span></h1><p>Стекло в невесомости</p></div>
      </div>
      <button className={`settings-button${panelOpen ? ' is-active' : ''}`} onClick={() => setPanelOpen((value) => !value)} aria-expanded={panelOpen} aria-controls="scene-settings" title="Настройки сцены">
        <Icon name="sliders" size={19} /><span>Настройки</span>
      </button>
    </header>

    <div className="model-strip" aria-label="Размеры модели">
      <div><span className="model-dot" aria-hidden="true" /><span>Ø <b>196</b> блоков</span></div>
      <i aria-hidden="true" />
      <div><span><b>112 × 112</b> основание</span></div>
      <i aria-hidden="true" />
      <div><span><b>5</b> этажей</span></div>
    </div>

    {panelOpen && <aside id="scene-settings" className="settings-panel" aria-label="Настройки сцены">
      <div className="panel-grip" aria-hidden="true" />
      <div className="panel-header"><div><span className="eyebrow">УПРАВЛЕНИЕ ВИДОМ</span><h2>Сцена</h2></div><button className="icon-button close-panel" onClick={() => setPanelOpen(false)} aria-label="Закрыть настройки" title="Закрыть настройки"><Icon name="close" size={18} /></button></div>
      <div className="panel-scroll">
        <div className="featured-control">
          <Toggle label="Автоматический срез" description="Оболочка открывается со стороны камеры" checked={settings.cutaway} onChange={(v) => change('cutaway', v)} disabled={!settings.shellVisible} />
          <Range label="Открытие оболочки" value={opening} min={0} max={100} step={1} readout={`${opening}%`} onChange={(v) => change('cutPosition', 0.4 - v / 100 * 0.8)} disabled={!settings.cutaway || !settings.shellVisible} />
        </div>

        <section className="control-section" aria-label="Видимость объектов">
          <h3>Видимость</h3>
          <Toggle label="Чёрная оболочка" checked={settings.shellVisible} onChange={(v) => change('shellVisible', v)} icon="cube" />
          <Toggle label="Стеклянные уровни" checked={settings.glassVisible} onChange={(v) => change('glassVisible', v)} icon="layers" />
          <Toggle label="Светящиеся кубы" checked={settings.starsVisible} onChange={(v) => change('starsVisible', v)} icon="sparkles" />
        </section>

        <details className="settings-details">
          <summary><span>Тонкая настройка</span><Icon name="chevron" size={18} /></summary>
          <div className="details-content">
            <Range label="Прозрачность стекла" value={glassTransparency} min={70} max={96} step={1} readout={`${glassTransparency}%`} onChange={(v) => change('glassOpacity', 1 - v / 100)} disabled={!settings.glassVisible} />
            <Toggle label="Сетка блоков на стекле" checked={settings.showGrid} onChange={(v) => change('showGrid', v)} disabled={!settings.glassVisible} />
            <Range label="Свечение" value={settings.starIntensity} min={0.25} max={2.2} step={0.05} readout={`${Math.round(settings.starIntensity * 100)}%`} onChange={(v) => change('starIntensity', v)} disabled={!settings.starsVisible} />
            <label className="select-row"><span>Качество</span><span className="select-wrap"><select value={settings.quality} onChange={(e) => change('quality', e.target.value as ViewerSettings['quality'])} aria-label="Качество изображения"><option value="auto">Авто</option><option value="high">Высокое</option><option value="low">Лёгкое</option></select><Icon name="chevron" size={15} /></span></label>
          </div>
        </details>

        <details className="settings-details geometry-details">
          <summary><span>Размеры модели</span><Icon name="chevron" size={18} /></summary>
          <dl className="model-dimensions">
            <div><dt>Диаметр сферы</dt><dd>196 блоков</dd></div>
            <div><dt>Толщина оболочки</dt><dd>1 блок</dd></div>
            <div><dt>Основание</dt><dd>112 × 112</dd></div>
            <div><dt>Рабочие этажи</dt><dd>5 × 16</dd></div>
            <div><dt>Тех. промежутки</dt><dd>4 × 5</dd></div>
            <div><dt>Высота с полом и крышей</dt><dd>102 блока</dd></div>
          </dl>
          <p className="geometry-note">10 парящих стеклянных плит. У технического промежутка две плиты по 1 блоку и 3 блока воздуха между ними.</p>
        </details>
        <button className="text-button reset-settings" onClick={() => setSettings({ ...defaultSettings })}>Вернуть настройки по умолчанию</button>
      </div>
      <div className="panel-footer"><span className={`status-dot${stats.ready ? ' is-ready' : ''}`} aria-hidden="true" /><span>{error ? 'Сцена недоступна' : stats.ready ? 'Один блок — одна единица' : 'Подготовка модели'}</span><span className="fps" aria-label={stats.ready ? `Частота кадров: ${Math.round(stats.fps)}` : undefined}>{stats.ready ? `${Math.round(stats.fps)} FPS` : '3D'}</span></div>
    </aside>}

    <div className="zoom-controls" role="group" aria-label="Масштаб">
      <button className="icon-button" onClick={() => controllerRef.current?.zoom(1)} disabled={!stats.ready || !!error} aria-label="Приблизить" title="Приблизить (+)"><Icon name="plus" size={19} /></button>
      <span aria-hidden="true" />
      <button className="icon-button" onClick={() => controllerRef.current?.zoom(-1)} disabled={!stats.ready || !!error} aria-label="Отдалить" title="Отдалить (−)"><Icon name="minus" size={19} /></button>
    </div>

    <nav className="camera-dock" aria-label="Камера">
      <div className="view-presets" role="group" aria-label="Выбрать ракурс">
        {VIEWS.map(({ preset, label, icon, title }) => <button key={preset} className={`view-button${selectedView === preset ? ' is-active' : ''}`} aria-pressed={selectedView === preset} title={title} aria-label={title} onClick={() => selectView(preset)} disabled={!stats.ready || !!error}><Icon name={icon} size={18} /><span>{label}</span></button>)}
      </div>
      <span className="dock-divider" aria-hidden="true" />
      <button className={`icon-button auto-rotate${settings.autoRotate ? ' is-active' : ''}`} aria-pressed={settings.autoRotate} aria-label="Автоматическое вращение" title="Автоматическое вращение" onClick={() => change('autoRotate', !settings.autoRotate)} disabled={!stats.ready || !!error}><Icon name="rotate" size={19} /></button>
      <button className="icon-button" aria-label="Вернуть исходный ракурс" title="Вернуть исходный ракурс (R)" onClick={resetView} disabled={!stats.ready || !!error}><Icon name="reset" size={19} /></button>
    </nav>

    <footer className="interaction-hint"><Icon name="mouse" size={15} /><span className="desktop-hint">Тяните, чтобы вращать <i>·</i> Колесо — масштаб <i>·</i> Правая кнопка — сдвиг</span><span className="touch-hint">Один палец — вращение · Два — масштаб и сдвиг</span></footer>
  </main>;
}
