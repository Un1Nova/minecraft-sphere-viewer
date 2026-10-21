// Точная блочная геометрия. Та же оболочка, что в опубликованном проекте.
export const D = 196, R = 98, HALF = 56, STACK = 64;
export const SLABS = [-50.5,-33.5,-29.5,-12.5,-8.5,8.5,12.5,29.5,33.5,50.5];
export const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
export const key = (x,y,z) => `${x},${y},${z}`;
export const word = (n,one,few,many) => n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many;
export const number = n => n.toLocaleString('ru-RU');
export function stacks(n) {
  if(!Number.isSafeInteger(n)||n<0) throw new RangeError('Количество должно быть целым неотрицательным числом.');
  return { full:Math.floor(n/STACK), remainder:n%STACK, slots:Math.ceil(n/STACK) };
}
export function stackText(n) {
  const {full,remainder}=stacks(n);
  if(!full) return `${remainder} ${word(remainder,'блок','блока','блоков')}`;
  return `${number(full)} ${word(full,'стак','стака','стаков')}`+(remainder?` + ${remainder} ${word(remainder,'блок','блока','блоков')}`:'');
}
export function layerY(layer) {
  if(!Number.isInteger(layer)||layer<1||layer>D) throw new RangeError('Слой: 1–196.');
  return layer-R-.5;
}
export const layerOf = y => Math.round(y+R+.5);
export function shellAt(x,y,z) {
  const d=x*x+y*y+z*z;
  return d<=R*R && d+1+2*Math.max(Math.abs(x),Math.abs(y),Math.abs(z))>R*R;
}
export const isSkeleton = (x,y,z) => Math.min(Math.abs(x),Math.abs(y),Math.abs(z))<1;
export function makeModel() {
  const shell=[], layers=Array.from({length:D},()=>[]);
  for(let yi=0;yi<D;yi++) {
    const y=yi-R+.5;
    for(let xi=0;xi<D;xi++) {
      const x=xi-R+.5, limit2=R*R-x*x-y*y;
      if(limit2<0) continue;
      const lim=Math.sqrt(limit2);
      for(let zi=Math.max(0,Math.ceil(R-.5-lim));zi<=Math.min(D-1,Math.floor(R-.5+lim));zi++) {
        const z=zi-R+.5;
        if(shellAt(x,y,z)) { const cell={x,y,z};shell.push(cell);layers[yi].push(cell); }
      }
    }
  }
  // Сохраняем seed и характер старой раскладки, но фиксируем кубы на целой сетке.
  let state=196112;
  const random=()=>{state=(state+0x6D2B79F5)>>>0;let v=state;v=Math.imul(v^(v>>>15),v|1);v^=v+Math.imul(v^(v>>>7),v|61);return((v^(v>>>14))>>>0)/4294967296;};
  const lights=[];
  for(let t=0;t<65000&&lights.length<164;t++) {
    const x=Math.floor((random()*2-1)*95.5)+.5,y=Math.floor((random()*2-1)*95.5)+.5,z=Math.floor((random()*2-1)*95.5)+.5;
    if((Math.abs(x)+.5)**2+(Math.abs(y)+.5)**2+(Math.abs(z)+.5)**2>95.5**2)continue;
    if(Math.abs(x)<58.5&&Math.abs(y)<53.5&&Math.abs(z)<58.5)continue;
    if(lights.some(c=>(c.x-x)**2+(c.y-y)**2+(c.z-z)**2<9))continue;
    lights.push({x,y,z});
  }
  if(lights.length!==164)throw Error('Не удалось разместить светящиеся блоки.');
  return {shell,layers,lights};
}
export function inScope(c,scope,layer) {
  if(scope==='layer'||scope==='support') return c.y===layerY(layer);
  if(scope==='until')return c.y<=layerY(layer);
  if(scope==='skeleton')return isSkeleton(c.x,c.y,c.z);
  return true;
}
export function counts(model,scope='all',layer=1) {
  const shell=model.shell.reduce((n,c)=>n+Number(inScope(c,scope,layer)),0);
  let glass=0;
  if(scope!=='skeleton') glass=SLABS.filter(y=>inScope({x:0,y,z:0},scope,layer)).length*112*112;
  const lights=scope==='skeleton'?0:model.lights.reduce((n,c)=>n+Number(inScope(c,scope,layer)),0);
  return {shell,glass,lights,total:shell+glass+lights,slots:stacks(shell).slots+stacks(glass).slots+stacks(lights).slots};
}
export function world(c,origin) {
  return {x:Math.floor(c.x)+56+origin.x,y:Math.floor(c.y)+98+origin.y,z:Math.floor(c.z)+56+origin.z};
}
export function rowRun(c,cells,axis='x') {
  const occupied=new Set(cells.map(v=>key(v.x,v.y,v.z)));
  const first={...c},last={...c};
  while(occupied.has(key(axis==='x'?first.x-1:first.x,first.y,axis==='z'?first.z-1:first.z)))first[axis]--;
  while(occupied.has(key(axis==='x'?last.x+1:last.x,last.y,axis==='z'?last.z+1:last.z)))last[axis]++;
  return {first,last,length:last[axis]-first[axis]+1};
}
