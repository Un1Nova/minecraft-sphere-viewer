import {R,SLABS,layerY,isSkeleton,key} from './model.mjs';
export function createPlan(host,model,initial,onPick){
 const canvas=document.createElement('canvas');canvas.setAttribute('aria-label','Точный блочный чертёж выбранного слоя');canvas.style.touchAction='none';host.appendChild(canvas);const ctx=canvas.getContext('2d');
 let state=initial,w=1,h=1,zoom=1,pan={x:0,y:0},base=1,fitSpan=216,scale=1,origin={x:0,y:0},cells=[],map=new Map(),frame=0,disposed=false;
 const project=c=>state.scope==='all'||state.scope==='skeleton'?state.plane==='front'?{x:c.x,y:-c.y}:state.plane==='side'?{x:c.z,y:-c.y}:{x:c.x,y:c.z}:{x:c.x,y:c.z};
 function rebuild(){
  const layer=layerY(state.layer),full=state.scope==='all'||state.scope==='skeleton';
  cells=model.shell.filter(c=>full?(state.plane==='front'?c.z===.5:state.plane==='side'?c.x===.5:c.y===.5):c.y===layer);
  map=new Map(cells.map(c=>{const p=project(c);return [`${Math.floor(p.x)},${Math.floor(p.y)}`,c];}));
 }
 function request(){if(!frame&&!disposed)frame=requestAnimationFrame(draw);}
 function coord(p){return {x:origin.x+p.x*scale,y:origin.y+p.y*scale};}
 function rect(c,fill,stroke){const p=project(c),a=coord({x:p.x-.5,y:p.y-.5});if(a.x+scale<0||a.y+scale<0||a.x>w||a.y>h)return;ctx.fillStyle=fill;if(fill)ctx.fillRect(a.x,a.y,scale,scale);if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.8;ctx.strokeRect(a.x,a.y,scale,scale);}}
 function line(x1,y1,x2,y2,color,width=1){const a=coord({x:x1,y:y1}),b=coord({x:x2,y:y2});ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
 function label(text,x,y,color='#59626f',size=11){ctx.font=`500 ${size}px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif`;const width=ctx.measureText(text).width+10;ctx.fillStyle='rgba(245,246,248,.94)';ctx.beginPath();ctx.roundRect(x-width/2,y-9,width,18,5);ctx.fill();ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,y);}
 function draw(){frame=0;if(disposed)return;const dpr=Math.min(devicePixelRatio||1,2);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#e9eaed';ctx.fillRect(0,0,w,h);
  const ext=Math.min(w-44,h-44);base=Math.max(.1,ext/fitSpan);scale=base*zoom;origin={x:w/2+pan.x,y:h/2+pan.y};
  if(state.grid){const spacing=state.gridStep===16?16:scale>=3?1:scale>=1.4?4:16;const l=Math.floor(-origin.x/scale/spacing)*spacing,r=(w-origin.x)/scale,t=Math.floor(-origin.y/scale/spacing)*spacing,b=(h-origin.y)/scale;for(let x=l;x<=r;x+=spacing)line(x,t,x,b,'rgba(255,255,255,.83)',.7);for(let y=t;y<=b;y+=spacing)line(l,y,r,y,'rgba(255,255,255,.83)',.7);line(0,t,0,b,'#c3c7cf',1);line(l,0,r,0,'#c3c7cf',1);}
  if(state.scope==='support'&&state.layer>1)for(const c of model.layers[state.layer-2])rect(c,'rgba(97,125,167,.18)',null);
  if(state.shell)for(const c of cells)rect(c,'#a4a6ac',state.style==='edges'?'#d44243':scale>3?'rgba(70,73,80,.35)':null);
  const full=['all','skeleton'].includes(state.scope),yy=layerY(state.layer);
  if(state.glass&&state.scope!=='skeleton'){
   const slabYs=full?SLABS:SLABS.filter(y=>y===yy);
   if((!full||state.plane==='top')&&slabYs.length){const a=coord({x:-56,y:-56});ctx.fillStyle='rgba(93,162,186,.16)';ctx.fillRect(a.x,a.y,112*scale,112*scale);ctx.strokeStyle='#729daf';ctx.lineWidth=1.1;ctx.strokeRect(a.x,a.y,112*scale,112*scale);}
   else if(full&&state.plane!=='top')for(const y of SLABS){const a=coord({x:-56,y:-y-.5});ctx.fillStyle='rgba(68,142,171,.5)';ctx.fillRect(a.x,a.y,112*scale,Math.max(1,scale));}
  }
  if(state.lights&&!full)for(const c of model.lights)if(c.y===yy)rect(c,'#e0b762',scale>3?'#b18733':null);
  if(state.chunks!=='off'){
   const color=state.chunks==='grid'?'#bb9715':'#d34b4b';
   for(let c=-104;c<=104;c+=16){line(c,-104,c,104,color,.9);line(-104,c,104,c,color,.9);}
   if(state.chunks==='grid'&&scale>2){for(let c=-104;c<=104;c+=4)if((c+104)%16!==0){line(c,-104,c,104,'rgba(28,146,78,.32)',.55);line(-104,c,104,c,'rgba(28,146,78,.32)',.55);}}
  }
  if(state.scope==='skeleton'){line(-100,0,100,0,'rgba(94,107,125,.3)',1);line(0,-100,0,100,'rgba(94,107,125,.3)',1);}
  if(state.selected){const row=state.row;for(const c of cells)if(row&&c.y===state.selected.y&&c.z===state.selected.z)rect(c,'rgba(32,113,231,.25)',null);rect(state.selected,'rgba(29,112,232,.68)','#005bd4');}
  if(state.dimensions&&state.shell&&cells.length){
   let loX=Infinity,hiX=-Infinity,loY=Infinity,hiY=-Infinity;for(const c of cells){const p=project(c);loX=Math.min(loX,p.x-.5);hiX=Math.max(hiX,p.x+.5);loY=Math.min(loY,p.y-.5);hiY=Math.max(hiY,p.y+.5);}
   const a=coord({x:(loX+hiX)/2,y:loY});label(`${hiX-loX} блоков`,a.x,a.y-23);
   // Внешние ступеньки: верхняя граница заполненного сечения; без внутренних рёбер кольца.
   const tops=new Map(),bottoms=new Map(),lefts=new Map(),rights=new Map();
   for(const c of cells){const p=project(c),x=Math.floor(p.x),y=Math.floor(p.y);tops.set(x,Math.min(tops.get(x)??Infinity,y));bottoms.set(x,Math.max(bottoms.get(x)??-Infinity,y+1));lefts.set(y,Math.min(lefts.get(y)??Infinity,x));rights.set(y,Math.max(rights.get(y)??-Infinity,x+1));}
   function runs(values,horizontal,sign){const entries=[...values].sort((a,b)=>a[0]-b[0]);for(let i=0;i<entries.length;){let j=i+1;while(j<entries.length&&entries[j][0]===entries[j-1][0]+1&&entries[j][1]===entries[i][1])j++;const length=j-i;if(length*scale>=21){const mid=entries[i][0]+length/2,level=entries[i][1],p=coord(horizontal?{x:mid,y:level}:{x:level,y:mid});if(p.x>12&&p.x<w-12&&p.y>12&&p.y<h-12)label(String(length),p.x+(horizontal?0:sign*13),p.y+(horizontal?sign*12:0),'#59626f',10);}i=j;}}
   runs(tops,true,-1);runs(bottoms,true,1);runs(lefts,false,-1);runs(rights,false,1);
  }
  // Always retain clear orientation; numbers are in blocks, not screen pixels.
  ctx.fillStyle='#7b828d';ctx.font='10px -apple-system,Segoe UI,sans-serif';ctx.textAlign='left';ctx.fillText(full&&state.plane==='front'?'X → · Y ↑':full&&state.plane==='side'?'Z → · Y ↑':'X → · Z ↓',14,h-12);
 }
 function resize(){w=host.clientWidth;h=host.clientHeight;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';request();}
 function zoomAt(factor,p={x:w/2,y:h/2}){const next=Math.max(.35,Math.min(80/base,zoom*factor)),k=next/zoom;pan={x:pan.x*k+(p.x-w/2)*(1-k),y:pan.y*k+(p.y-h/2)*(1-k)};zoom=next;request();}
 const pointers=new Map();let downAt=null,moved=false;
 function point(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
 function down(e){if(e.pointerType==='mouse'&&e.button!==0)return;canvas.setPointerCapture(e.pointerId);const p=point(e);pointers.set(e.pointerId,p);downAt=p;moved=pointers.size>1;}
 function move(e){if(!pointers.has(e.pointerId))return;const before=[...pointers.values()],old=pointers.get(e.pointerId),p=point(e);pointers.set(e.pointerId,p);if(pointers.size>1){const after=[...pointers.values()],a=before[0],b=before[1],c=after[0],d=after[1];const oldLen=Math.hypot(a.x-b.x,a.y-b.y),newLen=Math.hypot(c.x-d.x,c.y-d.y);if(oldLen>1)zoomAt(newLen/oldLen,{x:(a.x+b.x)/2,y:(a.y+b.y)/2});pan.x+=(c.x+d.x-a.x-b.x)/2;pan.y+=(c.y+d.y-a.y-b.y)/2;moved=true;}else{pan.x+=p.x-old.x;pan.y+=p.y-old.y;if(downAt&&Math.hypot(p.x-downAt.x,p.y-downAt.y)>5)moved=true;}request();}
 function up(e){if(!moved&&pointers.size===1&&e.type!=='pointercancel'){const p=point(e),x=Math.floor((p.x-origin.x)/scale),y=Math.floor((p.y-origin.y)/scale);onPick(map.get(`${x},${y}`)||null);}pointers.delete(e.pointerId);if(pointers.size)moved=true;}
 function wheel(e){e.preventDefault();zoomAt(Math.exp(-Math.max(-400,Math.min(400,e.deltaY))*.002),point(e));}
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});
 function fit(){zoom=1;pan={x:0,y:0};fitSpan=['all','skeleton'].includes(state.scope)?216:Math.max(24,...cells.map(c=>Math.max(Math.abs(c.x),Math.abs(c.z))*2))+12;request();}
 const observer=new ResizeObserver(resize);observer.observe(host);rebuild();fit();resize();
 return {apply(next){const scopeChanged=state.scope!==next.scope;const changed=scopeChanged||state.layer!==next.layer||state.plane!==next.plane;state=next;if(changed)rebuild();if(scopeChanged)fit();request();},zoom(d){zoomAt(d>0?1.25:.8);},fit,dispose(){disposed=true;observer.disconnect();cancelAnimationFrame(frame);canvas.remove();}};
}
