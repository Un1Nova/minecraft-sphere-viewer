import { THREE as T } from '../vendor/runtime.mjs';
import {R,SLABS,DIRS,key,inScope,layerY} from './model.mjs';

const faces=[
 [[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]],
 [[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]],
 [[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]],
 [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]],
 [[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]],
 [[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5]],
];
function faceGeometry(mask){
 const p=[],n=[],uv=[],idx=[];
 for(let f=0;f<6;f++)if(mask&(1<<f)){
  const i=p.length/3;for(const v of faces[f]){p.push(...v);n.push(...DIRS[f]);}uv.push(0,0,0,1,1,1,1,0);idx.push(i,i+1,i+2,i,i+2,i+3);
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(p),3));g.setAttribute('normal',new T.BufferAttribute(new Float32Array(n),3));g.setAttribute('uv',new T.BufferAttribute(new Float32Array(uv),2));g.setIndex(idx);return g;
}
const vertex=`varying vec3 wp;varying vec3 cell;varying vec3 norm;varying vec2 tex;
void main(){mat4 m=modelMatrix;
#ifdef USE_INSTANCING
m=m*instanceMatrix;
#endif
vec4 w=m*vec4(position,1.);wp=w.xyz;cell=(m*vec4(0.,0.,0.,1.)).xyz;norm=normalize(mat3(m)*normal);tex=uv;gl_Position=projectionMatrix*viewMatrix*w;}`;
const fragment=`uniform vec3 base;uniform vec3 edgeColor;uniform vec3 lightDir;uniform vec3 viewDir;uniform float cut;uniform float opening;uniform float density;uniform float contrast;uniform float shadows;uniform float kind;uniform float level;uniform float scope;
varying vec3 wp;varying vec3 cell;varying vec3 norm;varying vec2 tex;
float rand(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
float cutVisibility(vec3 p){float c=sqrt(max(.001,1.-opening*opening));return 1.-cut*smoothstep(c-.018,c+.018,dot(normalize(p),viewDir));}
float occupied(vec3 p){vec3 q=floor(p)+.5;float r2=dot(q,q);float m=max(max(abs(q.x),abs(q.y)),abs(q.z));float v=step(r2,9604.)*step(9604.001,r2+1.+2.*m);if(scope==1.&&abs(q.y-level)>.1)v=0.;if(scope==2.&&q.y>level+.1)v=0.;if(scope==3.&&min(min(abs(q.x),abs(q.y)),abs(q.z))>1.)v=0.;return v*step(.5,cutVisibility(q));}
void main(){float visibility=kind<.5?density*cutVisibility(cell):1.;if(visibility<.001||rand(gl_FragCoord.xy)>visibility)discard;
vec2 e=min(tex,1.-tex);vec2 fw=max(fwidth(tex),vec2(.0001));float edge=1.-smoothstep(.45,1.25,min(e.x/fw.x,e.y/fw.y));
// Contrast is a surface-colour overlay, not a transparent wireframe.
vec3 n=normalize(norm);if(!gl_FrontFacing)n=-n;
float diffuse=max(dot(n,lightDir),0.);float shadow=0.;
if(shadows>.5&&kind<.5&&diffuse>.01){vec3 origin=wp+n*.025;for(int i=1;i<=12;i++){float d=float(i)*.24;shadow=max(shadow,occupied(origin+lightDir*d));}}
vec3 col=base*(.5+diffuse*.63*(1.-shadow*.55));col*=1.-edge*.15;
// Keep the exact grey lighting and shadows in face interiors. The outline
// shares the face's depth, so rear edges cannot bleed through opaque blocks.
if(contrast>.5&&kind<.5)col=mix(col,edgeColor,edge*.92);
float alpha=1.;if(kind>.5&&kind<1.5){col=base;alpha=.09+edge*.45;}if(kind>1.5){col=base*1.45;}
gl_FragColor=vec4(col,alpha);
#include <colorspace_fragment>
}`;
function material(kind,color){return new T.ShaderMaterial({uniforms:{base:{value:new T.Color(color)},edgeColor:{value:new T.Color('#d44243')},lightDir:{value:new T.Vector3(-.5,.8,1).normalize()},viewDir:{value:new T.Vector3(0,0,1)},cut:{value:0},opening:{value:.86},density:{value:1},contrast:{value:0},shadows:{value:1},kind:{value:kind},level:{value:0},scope:{value:0}},vertexShader:vertex,fragmentShader:fragment,transparent:kind===1,depthWrite:kind!==1,side:T.DoubleSide});}
function instanced(cells,g,m){const mesh=new T.InstancedMesh(g,m,cells.length),mx=new T.Matrix4();cells.forEach((c,i)=>{mx.makeTranslation(c.x,c.y,c.z);mesh.setMatrixAt(i,mx);});mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;return mesh;}
function clearGroup(group){const seen=new Set();for(const c of [...group.children]){if(c.geometry&&!seen.has(c.geometry)){seen.add(c.geometry);c.geometry.dispose();}group.remove(c);}}
function planeGeo(size){const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array([-size,0,-size,-size,0,size,size,0,size,size,0,-size]),3));g.setIndex([0,1,2,0,2,3]);return g;}
const gridVertex=`varying vec3 p;void main(){vec4 w=modelMatrix*vec4(position,1.);p=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const gridFragment=`uniform float stepSize;uniform vec3 tint;uniform float alpha;uniform float vertical;varying vec3 p;
float line(vec2 p,float stepSize){vec2 d=abs(fract(p/stepSize-.5)-.5)*stepSize/max(fwidth(p),vec2(.0001));return 1.-min(min(d.x,d.y),1.);}
void main(){vec2 q=vertical>.5?vec2(p.x+p.z,p.y):p.xz;float g=line(q,stepSize);float coarse=line(q+8.,16.);float a=max(g*alpha,coarse*alpha*.9);if(a<.01)discard;gl_FragColor=vec4(tint,a);}`;
function gridMaterial(stepSize=1,tint='#ffffff',alpha=.62,vertical=0){return new T.ShaderMaterial({uniforms:{stepSize:{value:stepSize},tint:{value:new T.Color(tint)},alpha:{value:alpha},vertical:{value:vertical}},vertexShader:gridVertex,fragmentShader:gridFragment,transparent:true,depthWrite:false,side:T.DoubleSide});}
export function createScene(host,model,initial,onPick,onReady){
 let settings=initial,disposed=false,raf=0,lastTime=0,selected=null,previousLayer=initial.layer;
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setClearColor(0xe9eaed,1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NoToneMapping;renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.4));
 host.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','Трёхмерная модель сферы');renderer.domElement.style.touchAction='none';
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(42,1,.1,2000);
 const controls=new T.OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.12;controls.minDistance=3;controls.maxDistance=1200;controls.zoomToCursor=true;controls.screenSpacePanning=true;controls.autoRotate=false;
 const group=new T.Group(),glass=new T.Group(),lights=new T.Group(),support=new T.Group(),chunks=new T.Group();scene.add(group,glass,lights,support,chunks);
 const mat=material(0,'#b8b8bc'),glassMat=material(1,'#80b7cc'),lightMat=material(2,'#fff2ce'),supportMat=material(1,'#8d99ab'),selectionMat=new T.MeshBasicMaterial({color:0x1976ed,transparent:true,opacity:.42,depthWrite:false});
 const box=new T.BoxGeometry(1.035,1.035,1.035),selection=new T.Mesh(box,selectionMat);selection.visible=false;scene.add(selection);
 const gridMat=gridMaterial(),grid=new T.Mesh(planeGeo(420),gridMat);grid.position.y=-101;scene.add(grid);
 const chunkMat=new T.MeshBasicMaterial({color:0xe94746,transparent:true,opacity:.7,depthWrite:false}),detailMat=gridMaterial(4,'#25a35e',.23,1);
 const boundary=[];for(let x=-104;x<=104;x+=16)for(let z=-104;z<=104;z+=16)boundary.push({x,y:0,z});
 chunks.add(instanced(boundary,new T.BoxGeometry(.07,208,.07),chunkMat));
 const detail=new T.Group();chunks.add(detail);
 for(let b=-104;b<=104;b+=16){const a=new T.Mesh(planeGeo(104),detailMat);a.rotation.x=Math.PI/2;a.position.z=b;detail.add(a);const c=new T.Mesh(planeGeo(104),detailMat);c.rotation.z=Math.PI/2;c.position.x=b;detail.add(c);}
 function rebuild(){
  clearGroup(group);clearGroup(glass);clearGroup(lights);clearGroup(support);
  const visible=model.shell.filter(c=>inScope(c,settings.scope,settings.layer));
  // Both styles use the same filled exposed faces. Toggling contrast changes
  // only a shader uniform, without rebuilding the shell or showing hidden faces.
  const occ=new Set(visible.map(c=>key(c.x,c.y,c.z))),bins=new Map();
  for(const c of visible){let mask=0;DIRS.forEach(([a,b,d],f)=>{if(!occ.has(key(c.x+a,c.y+b,c.z+d)))mask|=1<<f;});if(!mask)continue;if(!bins.has(mask))bins.set(mask,[]);bins.get(mask).push(c);}
  for(const [mask,cells]of bins)group.add(instanced(cells,faceGeometry(mask),mat));
  if(settings.scope!=='skeleton'){
   for(const y of SLABS)if(inScope({x:0,y,z:0},settings.scope,settings.layer)){const mesh=new T.Mesh(new T.BoxGeometry(112,1,112),glassMat);mesh.position.y=y;glass.add(mesh);}
   const stars=model.lights.filter(c=>inScope(c,settings.scope,settings.layer));if(stars.length)lights.add(instanced(stars,new T.BoxGeometry(1,1,1),lightMat));
  }
  if(settings.scope==='support'&&settings.layer>1)support.add(instanced(model.layers[settings.layer-2],new T.BoxGeometry(1,1,1),supportMat));
  group.visible=settings.shell;glass.visible=settings.glass;lights.visible=settings.lights;
 }
 function request(){if(!raf&&!disposed)raf=requestAnimationFrame(frame);}
 function frame(time){raf=0;if(disposed)return;const dt=Math.min(.05,Math.max(.001,(time-lastTime)/1000));lastTime=time;const changed=controls.update(dt);
  const dir=camera.position.clone().normalize(),light=new T.Vector3(-.75,.72,1).applyQuaternion(camera.quaternion).normalize();
  for(const m of [mat,glassMat,lightMat,supportMat]){m.uniforms.lightDir.value.copy(light);m.uniforms.viewDir.value.copy(dir);}
  renderer.render(scene,camera);if(changed)request();
 }
 function fit(preset='general'){
  let target=new T.Vector3(),distance=98/Math.sin(Math.atan(Math.tan(42*Math.PI/360)*Math.min(camera.aspect,1)))*1.08;
  if(['layer','support'].includes(settings.scope)){target.y=layerY(settings.layer);const cells=model.layers[settings.layer-1];const radius=Math.max(12,...cells.map(c=>Math.max(Math.abs(c.x),Math.abs(c.z))));distance=radius/Math.sin(Math.atan(Math.tan(42*Math.PI/360)*Math.min(camera.aspect,1)))*1.2;}
  const dir=preset==='top'?new T.Vector3(0,1,.0001):preset==='front'?new T.Vector3(0,.0001,1):preset==='side'?new T.Vector3(1,.0001,0):new T.Vector3(1,.65,1.1).normalize();
  if(preset==='corner'){target=new T.Vector3(1,1,1).normalize().multiplyScalar(96);distance=40/Math.min(1,camera.aspect);dir.set(1,1,1).normalize();}
  controls.target.copy(target);camera.position.copy(target).addScaledVector(dir,distance);controls.update();request();
 }
 function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();request();}
 function apply(next){const mustBuild=settings.scope!==next.scope||settings.layer!==next.layer;
  const shift=next.layer-previousLayer;if(shift&&['layer','support'].includes(next.scope)&&settings.scope===next.scope){camera.position.y+=shift;controls.target.y+=shift;}
  previousLayer=next.layer;settings=next;if(mustBuild)rebuild();
  const U=mat.uniforms;U.cut.value=settings.cut&&['all','skeleton'].includes(settings.scope)?1:0;U.opening.value=settings.opening;U.density.value=settings.opacity;U.contrast.value=settings.style==='edges'?1:0;U.shadows.value=settings.shadows?1:0;U.level.value=layerY(settings.layer);U.scope.value=['layer','support'].includes(settings.scope)?1:settings.scope==='until'?2:settings.scope==='skeleton'?3:0;
  // Opacity/cutaway retain their own controls; contrast never changes alpha.
  mat.transparent=false;mat.depthWrite=true;
  group.visible=settings.shell;glass.visible=settings.glass;lights.visible=settings.lights;grid.visible=settings.grid;
  gridMat.uniforms.stepSize.value=settings.gridStep;grid.position.y=['layer','support'].includes(settings.scope)?layerY(settings.layer)-.51:-101;
  chunks.visible=settings.chunks!=='off';detail.visible=settings.chunks==='grid';chunkMat.color.set(settings.chunks==='grid'?0xd7a411:0xde4545);
  selected=next.selected;selection.visible=Boolean(selected);if(selected)selection.position.set(selected.x,selected.y,selected.z);request();
 }
 function zoom(d){const off=camera.position.clone().sub(controls.target);camera.position.copy(controls.target).add(off.multiplyScalar(d>0?.77:1.3));controls.update();request();}
 let start=null;
 function down(e){start={x:e.clientX,y:e.clientY,t:performance.now()};}
 function up(e){if(!start||Math.hypot(e.clientX-start.x,e.clientY-start.y)>6||performance.now()-start.t>650)return;
  const rect=renderer.domElement.getBoundingClientRect(),origin=camera.position.clone(),dir=new T.Vector3((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1,.5).unproject(camera).sub(origin).normalize();
  let near=Infinity,hit=null;const view=origin.clone().normalize(),cutCos=Math.sqrt(1-settings.opening**2);
  for(const c of model.shell){if(!settings.shell||!inScope(c,settings.scope,settings.layer))continue;if(settings.cut&&['all','skeleton'].includes(settings.scope)&&new T.Vector3(c.x,c.y,c.z).normalize().dot(view)>cutCos)continue;
   let lo=-Infinity,hi=Infinity;for(const k of ['x','y','z']){const a=(c[k]-.5-origin[k])/dir[k],b=(c[k]+.5-origin[k])/dir[k];lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));}if(hi>=Math.max(lo,0)&&lo>=0&&lo<near){near=lo;hit=c;}}
  onPick(hit);
 }
 renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);controls.addEventListener('change',request);
 const observer=new ResizeObserver(resize);observer.observe(host);resize();rebuild();apply(initial);fit();onReady?.();
 return {apply,fit,zoom,project(point){return new T.Vector3(point.x,point.y,point.z).project(camera);},dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();controls.dispose();for(const g of[group,glass,lights,support,chunks])clearGroup(g);for(const m of[mat,glassMat,lightMat,supportMat,selectionMat,gridMat,chunkMat,detailMat])m.dispose();box.dispose();grid.geometry.dispose();renderer.dispose();renderer.domElement.remove();}};
}
