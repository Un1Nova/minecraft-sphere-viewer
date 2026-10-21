import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeModel,stacks,stackText,layerY,counts,shellAt,DIRS,world,rowRun} from '../src/model.mjs';
const m=makeModel();
test('Реальный счётчик оболочки совпадает с независимым расчётом всех 196 слоёв',()=>{
  const reference=JSON.parse(readFileSync(new URL('./reference-counts.json',import.meta.url)));
  assert.deepEqual(m.layers.map(c=>c.length),reference);
  assert.equal(m.shell.length,99680);
  assert.equal(m.layers[0].length,308);
  assert.equal(m.layers[195].length,308);
  assert.equal(m.layers.flat().length,m.shell.length);
});
test('Только граничные блоки; каждый имеет внешнего осевого соседа',()=>{
 for(const c of m.shell) {assert.ok(c.x*c.x+c.y*c.y+c.z*c.z<=98**2);assert.ok(DIRS.some(([a,b,d])=>(c.x+a)**2+(c.y+b)**2+(c.z+d)**2>98**2));}
});
test('Стаки: 0, неполный, точный, остаток и крупные количества',()=>{
 for(const [n,f,r] of [[0,0,0],[1,0,1],[63,0,63],[64,1,0],[65,1,1],[128,2,0],[1000,15,40],[99680,1557,32],[125440,1960,0]]){
  assert.deepEqual(stacks(n),{full:f,remainder:r,slots:Math.ceil(n/64)});assert.equal(f*64+r,n);
 }
 assert.equal(stackText(64),'1 стак');assert.equal(stackText(128),'2 стака');assert.equal(stackText(320),'5 стаков');
 assert.equal(stackText(1000),'15 стаков + 40 блоков');
 for(const n of [-1,1.5,NaN,Infinity]) assert.throws(()=>stacks(n),RangeError);
});
test('Материалы по высотам: стекло не появляется на постороннем слое',()=>{
 assert.equal(counts(m).glass,125440);assert.equal(counts(m,'layer',1).glass,0);assert.equal(counts(m,'layer',48).glass,12544);
 assert.equal(counts(m,'until',196).total,counts(m).total);
 const aggregate=Array.from({length:196},(_,i)=>counts(m,'layer',i+1)).reduce((a,b)=>a+b.total,0);assert.equal(aggregate,counts(m).total);
});
test('Все светящиеся блоки единичные и лежат внутри оболочки',()=>{
 assert.equal(m.lights.length,164);const positions=new Set();
 for(const c of m.lights){assert.ok([c.x,c.y,c.z].every(v=>Number.isInteger(v-.5)));assert.ok((Math.abs(c.x)+.5)**2+(Math.abs(c.y)+.5)**2+(Math.abs(c.z)+.5)**2<95.5**2);assert.ok(!shellAt(c.x,c.y,c.z));positions.add(JSON.stringify(c));}
 assert.equal(positions.size,164);
});
test('Нумерация снизу и привязка семи чанков к внутреннему полу',()=>{
 assert.equal(layerY(1),-97.5);assert.equal(layerY(196),97.5);
 assert.deepEqual(world({x:-55.5,y:-97.5,z:55.5},{x:0,y:64,z:0}),{x:0,y:64,z:111});
 assert.throws(()=>layerY(0));assert.throws(()=>layerY(197));
});
test('Длина ряда считается включительно, не как разность координат',()=>{
 const cells=[1,2,3,4,5].map(x=>({x,y:.5,z:.5}));
 assert.equal(rowRun(cells[2],cells).length,5);
});
