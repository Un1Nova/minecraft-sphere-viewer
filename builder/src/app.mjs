import {React,createRoot} from '../vendor/runtime.mjs';
import {makeModel,counts,number,stackText,stacks,world,rowRun,layerOf,D,word} from './model.mjs';
import {createScene} from './scene.mjs';
import {createPlan} from './plan.mjs';
const {createElement:h,useState,useRef,useEffect,useMemo}=React;
const MODEL=makeModel(),TOTAL=counts(MODEL),STORAGE='sphere196.construction.v3';
const DEFAULT={mode:'3d',scope:'all',layer:1,plane:'front',style:'solid',cut:true,opening:.86,opacity:1,shadows:true,grid:true,gridStep:1,dimensions:true,chunks:'off',shell:true,glass:true,lights:true,origin:{x:0,y:64,z:0},units:'both',done:[],selected:null,row:false};
const SCOPES=[['all','Вся сфера'],['layer','Только слой'],['support','Слой + опора'],['until','До слоя'],['skeleton','Каркас XYZ']];
function load(){try{const s=JSON.parse(localStorage.getItem(STORAGE)||'{}'),n={...DEFAULT};for(const k of ['cut','shadows','grid','dimensions','shell','glass','lights'])if(typeof s[k]==='boolean')n[k]=s[k];for(const [k,a]of Object.entries({mode:['2d','3d'],scope:SCOPES.map(v=>v[0]),plane:['front','top','side'],style:['solid','edges'],chunks:['off','borders','grid'],units:['both','blocks','stacks']}))if(a.includes(s[k]))n[k]=s[k];n.layer=Math.min(196,Math.max(1,Math.round(Number(s.layer)||1)));n.done=Array.isArray(s.done)?[...new Set(s.done.filter(v=>Number.isInteger(v)&&v>=1&&v<=196))]:[];if(s.origin&&['x','y','z'].every(k=>Number.isSafeInteger(s.origin[k])))n.origin=s.origin;for(const[k,min,max]of[['opacity',0,1],['opening',.25,.95]])if(Number.isFinite(s[k]))n[k]=Math.max(min,Math.min(max,s[k]));if(s.gridStep===16)n.gridStep=16;return n;}catch{return {...DEFAULT};}}
function button(text,onClick,props={}){return h('button',{type:'button',onClick,...props},text);}
function Select({label,value,options,onChange,compact=false}){return h('label',{className:'select '+(compact?'compact':'')},h('span',null,label),h('select',{'aria-label':label,value,onChange:e=>onChange(e.target.value)},options.map(([v,t])=>h('option',{key:v,value:v},t))));}
function Toggle({label,checked,onChange,disabled=false}){return h('label',{className:'toggle'+(disabled?' disabled':'')},h('span',null,label),h('input',{type:'checkbox',role:'switch',checked,disabled,onChange:e=>onChange(e.target.checked)}),h('i',{'aria-hidden':true}));}
function Slider({label,value,min,max,step=1,onChange,suffix='',disabled=false}){return h('label',{className:'range'+(disabled?' disabled':'')},h('span',null,label,h('output',null,Math.round(value*100)/100+suffix)),h('input',{type:'range','aria-label':label,value,min,max,step,disabled,onChange:e=>onChange(Number(e.target.value))}));}
function Quantity({n,units='both',small=false}){return h('div',{className:'quantity'+(small?' small':'')},units!=='stacks'&&h('strong',null,number(n),h('span',null,' '+word(n,'блок','блока','блоков'))),units!=='blocks'&&(n>0||units==='stacks')&&h(units==='stacks'?'strong':'small',null,units==='both'&&n<64?'Меньше стака':stackText(n)));}
function App(){
 const [s,setS]=useState(load),[panel,setPanel]=useState(null),[error,setError]=useState(''),[revision,retry]=useState(0);const host=useRef(null),controller=useRef(null),stateRef=useRef(s),dialog=useRef(null);stateRef.current=s;
 const update=patch=>setS(v=>({...v,...patch}));const pick=c=>setS(v=>({...v,selected:c,row:false}));
 const scoped=useMemo(()=>counts(MODEL,s.scope,s.layer),[s.scope,s.layer]),current=useMemo(()=>counts(MODEL,'layer',s.layer),[s.layer]);
 const layerMode=['layer','support','until'].includes(s.scope),selected=s.selected,location=selected?world(selected,s.origin):null;
 const run=selected?rowRun(selected,MODEL.layers[layerOf(selected.y)-1]):null;
 useEffect(()=>{
  setError('');let c;
  try{c=s.mode==='3d'?createScene(host.current,MODEL,stateRef.current,pick):createPlan(host.current,MODEL,stateRef.current,pick);controller.current=c;}catch(e){setError(e.message||'Не удалось запустить 3D.');}
  return()=>{c?.dispose();controller.current=null;};
 },[s.mode,revision]);
 useEffect(()=>{controller.current?.apply(s);try{const saved={...s,selected:null,row:false};localStorage.setItem(STORAGE,JSON.stringify(saved));}catch{}},[s]);
 useEffect(()=>{if(panel&&!dialog.current.open)dialog.current.showModal();if(!panel&&dialog.current.open)dialog.current.close();},[panel]);
 useEffect(()=>{const listener=e=>{if(e.target.closest('input,select,button,textarea'))return;if(e.key==='ArrowUp'){e.preventDefault();changeLayer(stateRef.current.layer+1);}if(e.key==='ArrowDown'){e.preventDefault();changeLayer(stateRef.current.layer-1);}if(e.key==='Escape'){setPanel(null);update({selected:null});}};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[]);
 function changeLayer(n){update({layer:Math.max(1,Math.min(D,Math.round(Number(n)||1))),selected:null,row:false});}
 function changeScope(scope){update({scope,selected:null,row:false});requestAnimationFrame(()=>controller.current?.fit());}
 function view(v){if(s.mode==='2d'){update({plane:v});controller.current?.fit();}else{if(v==='corner')update({cut:false,scope:'all',opacity:1});requestAnimationFrame(()=>controller.current?.fit(v));}}
 function done(){setS(v=>({...v,done:v.done.includes(v.layer)?v.done.filter(l=>l!==v.layer):[...v.done,v.layer]}));}
 function downloadCSV(){const lines=['layer,worldY,shell,glass,lights,shellStacks,shellRemainder,glassStacks,glassRemainder,lightsStacks,lightsRemainder'];for(let l=1;l<=196;l++){const c=counts(MODEL,'layer',l),a=stacks(c.shell),b=stacks(c.glass),d=stacks(c.lights);lines.push([l,s.origin.y+l-1,c.shell,c.glass,c.lights,a.full,a.remainder,b.full,b.remainder,d.full,d.remainder].join(','));}const url=URL.createObjectURL(new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='sphere196-layers.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function rows(data){return h('div',{className:'material-list'},[['Оболочка','shell','stone'],['Стекло','glass','glass'],['Светящиеся блоки','lights','lamp']].map(([title,k,c])=>h('div',{className:'material-row',key:k},h('span',{className:'swatch '+c}),h('span',{className:'material-name'},title),h(Quantity,{n:data[k],units:s.units,small:true}))),h('div',{className:'material-total'},h('span',null,'Всего блоков'),h('strong',null,number(data.total))),h('p',{className:'note'},'Стак = 64 блока. Остатки разных материалов считаются отдельно.'));}
 return h('main',{className:'app '+(layerMode?'has-layers':'')},
  h('header',{className:'header'},
   h('div',{className:'brand'},h('span',{className:'sphere-mark','aria-hidden':true},'◉'),h('h1',null,'Сфера'),h('span',{className:'badge'},'196')),
   h('div',{className:'segments','aria-label':'Режим просмотра'},['3d','2d'].map(v=>button(v.toUpperCase(),()=>update({mode:v,selected:null}),{key:v,'aria-pressed':s.mode===v,className:s.mode===v?'active':''}))),
   button('Настройки',()=>setPanel('settings'),{className:'settings-btn'})
  ),
  h('nav',{className:'toolbar','aria-label':'Отображение'},
   h(Select,{label:'Показать',value:s.scope,options:SCOPES,onChange:changeScope}),
   button('▦ Сетка',()=>update({grid:!s.grid}),{className:'tool '+(s.grid?'active':''),'aria-pressed':s.grid,'aria-label':'Сетка'}),
   button('↔ Размеры',()=>update({dimensions:!s.dimensions}),{className:'tool '+(s.dimensions?'active':''),'aria-pressed':s.dimensions,'aria-label':'Размеры'}),
   h(Select,{label:'Блоки',compact:true,value:s.style,options:[['solid','Серые'],['edges','Контрастные']],onChange:style=>update({style})}),
   h(Select,{label:'Чанки',compact:true,value:s.chunks,options:[['off','Выкл.'],['borders','Красные границы'],['grid','Жёлтые + сетка']],onChange:chunks=>update({chunks})})
  ),
  h('section',{ref:host,className:'workspace','aria-label':s.mode==='3d'?'Модель':'Чертёж'}),
  error&&h('div',{className:'error-card',role:'alert'},h('strong',null,'3D недоступно'),h('p',null,'Послойный чертёж работает без WebGL.'),button('Открыть 2D',()=>update({mode:'2d'}),{className:'primary'}),button('Повторить',()=>retry(v=>v+1),{className:'plain'})),
  s.mode==='3d'&&s.dimensions&&h('div',{className:'measure-badge'},layerMode?`Y = ${s.origin.y+s.layer-1} · 1 блок высоты`:'X 196 · Y 196 · Z 196'),
  s.mode==='2d'&&layerMode&&h('div',{className:'measure-badge'},`Вид сверху · Y = ${s.origin.y+s.layer-1}`),
  h('div',{className:'zoom-box'},button('+',()=>controller.current?.zoom(1),{'aria-label':'Приблизить'}),button('−',()=>controller.current?.zoom(-1),{'aria-label':'Отдалить'}),button('⤢',()=>controller.current?.fit(),{'aria-label':'Вписать модель'})),
  h('div',{className:'view-box'},h(Select,{label:'Ракурс',value:s.mode==='2d'?s.plane:'',options:s.mode==='2d'?layerMode?[['top','Сверху']]:[['front','Спереди'],['top','Сверху'],['side','Сбоку']]:[['','Выбрать'],['general','Общий'],['corner','Угол XYZ'],['top','Сверху'],['front','Спереди'],['side','Сбоку']],onChange:view})),
  selected&&h('div',{className:'selection-card'},button('×',()=>update({selected:null,row:false}),{className:'close-small','aria-label':'Снять выделение'}),h('strong',null,`X ${location.x} · Y ${location.y} · Z ${location.z}`),h('span',null,`Слой ${layerOf(selected.y)} · ряд ${run.length} бл.`),button(s.row?'Скрыть ряд':'Выделить ряд X',()=>update({row:!s.row}),{className:'plain'})),
  h('footer',{className:'bottom'},
   layerMode&&h('div',{className:'layer-control'},
    button('‹',()=>changeLayer(s.layer-1),{disabled:s.layer===1,'aria-label':'Предыдущий слой',className:'step-button'}),
    h('label',{className:'layer-number'},h('span',null,'Слой'),h('input',{type:'number',inputMode:'numeric',min:1,max:196,value:s.layer,'aria-label':'Номер слоя',onChange:e=>changeLayer(e.target.value)}),h('span',null,'/ 196')),
    button('›',()=>changeLayer(s.layer+1),{disabled:s.layer===196,'aria-label':'Следующий слой',className:'step-button'}),
    h('input',{className:'layer-slider',type:'range',min:1,max:196,value:s.layer,'aria-label':'Выбор слоя',onChange:e=>changeLayer(e.target.value)}),
    button(s.done.includes(s.layer)?'✓ Готов':'Отметить',done,{'aria-pressed':s.done.includes(s.layer),className:'done-button '+(s.done.includes(s.layer)?'active':'')})
   ),
   h('div',{className:'bottom-line'},
    button(h('span',null,h('span',{className:'counter-label'},s.scope==='all'?'Оболочка целиком':s.scope==='skeleton'?'Блоки каркаса':s.scope==='until'?`Оболочка до слоя ${s.layer}`:`Оболочка · слой ${s.layer}`),h(Quantity,{n:scoped.shell,units:s.units})),()=>setPanel('materials'),{className:'counter-card','aria-label':'Количество блоков и стаков'}),
    h('div',{className:'bottom-actions'},button('Материалы',()=>setPanel('materials'),{className:'materials-button'}),layerMode&&h('small',null,`Готово ${s.done.length} / 196`),!layerMode&&button('Начать по слоям',()=>changeScope('layer'),{className:'plain'}))
   )
  ),
  h('dialog',{ref:dialog,className:'sheet',onCancel:e=>{e.preventDefault();setPanel(null);},onClick:e=>{if(e.target===dialog.current)setPanel(null);}},
   h('div',{className:'sheet-header'},h('h2',null,panel==='materials'?'Материалы':'Настройки'),button('×',()=>setPanel(null),{'aria-label':'Закрыть',className:'close'})),
   h('div',{className:'sheet-content'},panel==='materials'?h(React.Fragment,null,
    h(Select,{label:'Единицы',value:s.units,options:[['both','Блоки и стаки'],['blocks','Только блоки'],['stacks','Стаки + остаток']],onChange:units=>update({units})}),
    h('h3',null,'Вся конструкция'),rows(TOTAL),
    h('h3',null,`Слой ${s.layer} · Y ${s.origin.y+s.layer-1}`),rows(current),
    button('Сохранить ведомость всех слоёв · CSV',downloadCSV,{className:'wide-button'})
   ):h(React.Fragment,null,
    h('section',null,h('h3',null,'Оболочка'),h(Toggle,{label:'Вырез со стороны камеры',checked:s.cut,onChange:cut=>update({cut}),disabled:layerMode}),h(Slider,{label:'Размер выреза',value:Math.round(s.opening*100),min:25,max:95,suffix:'%',onChange:v=>update({opening:v/100}),disabled:layerMode||!s.cut}),h(Slider,{label:'Плотность блоков',value:Math.round(s.opacity*100),min:0,max:100,suffix:'%',onChange:v=>update({opacity:v/100})}),h(Toggle,{label:'Небольшие тени',checked:s.shadows,onChange:shadows=>update({shadows})})),
    h('section',null,h('h3',null,'Сетка'),h(Toggle,{label:'Показывать сетку',checked:s.grid,onChange:grid=>update({grid})}),h(Select,{label:'Размер клетки',value:String(s.gridStep),options:[['1','1 блок'],['16','16 блоков']],onChange:v=>update({gridStep:Number(v)})}),h(Toggle,{label:'Показывать размеры',checked:s.dimensions,onChange:dimensions=>update({dimensions})})),
    h('section',null,h('h3',null,'Объекты'),h(Toggle,{label:'Оболочка',checked:s.shell,onChange:shell=>update({shell})}),h(Toggle,{label:'Стеклянные этажи',checked:s.glass,onChange:glass=>update({glass})}),h(Toggle,{label:'Светящиеся блоки',checked:s.lights,onChange:lights=>update({lights})})),
    h('section',null,h('h3',null,'Привязка к миру'),h('p',{className:'note'},'X / Z — минимальный угол этажей 112 × 112. Y — высота первого слоя сферы.'),h('div',{className:'origin-fields'},['x','y','z'].map(axis=>h('label',{key:axis},axis.toUpperCase(),h('input',{type:'number',inputMode:'numeric',defaultValue:s.origin[axis],'aria-label':`Координата ${axis.toUpperCase()}`,onChange:e=>{const n=Number(e.target.value);if(Number.isSafeInteger(n))setS(v=>({...v,origin:{...v.origin,[axis]:n}}));}})))),(s.origin.x%16||s.origin.z%16)?h('p',{className:'warning'},'Угол этажей не совпадает с границами чанков. Для точных 7 × 7 выбери X/Z, кратные 16.'):h('p',{className:'note'},'Этажи совпадают с границами 7 × 7 чанков.')),
    h('details',null,h('summary',null,'О конструкции'),h('p',{className:'note'},'Диаметр 196. Оболочка — один граничный слой. Этажи 112 × 112: пять рабочих высот по 16, четыре технических яруса по 5. Десять стеклянных плит. Общая высота 102.'),h('p',{className:'note'},'Каркас XYZ использует два центральных ряда каждой плоскости: у чётного диаметра центр находится между блоками. Светящиеся блоки закреплены на целой сетке. Количество материалов не зависит от прозрачности и выреза.')),
    button('Сбросить только вид',()=>setS(v=>({...DEFAULT,origin:v.origin,done:v.done,layer:v.layer,mode:v.mode})),{className:'wide-button'})
   ))
  )
 );
}
const root=document.getElementById('root');
if(!root)throw Error('Корневой элемент не найден.');
createRoot(root).render(h(App));
