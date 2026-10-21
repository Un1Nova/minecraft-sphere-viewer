import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const scene = read('scene.mjs');
const plan = read('plan.mjs');
const app = read('app.mjs');

test('Контраст в 3D меняет цвет рёбер, не удаляет заполнение граней', () => {
  assert.match(scene, /if\(contrast>\.5&&kind<\.5\)col=mix\(col,edgeColor,edge\*\.92\)/);
  assert.doesNotMatch(scene, /if\(wire>.*discard/);
  assert.match(scene, /mat\.transparent=false;mat\.depthWrite=true/);
  assert.match(scene, /float alpha=1\./);
  assert.match(scene, /#include <colorspace_fragment>/);
});

test('Оба стиля строят одни и те же открытые грани; переключение не перестраивает геометрию', () => {
  const build = scene.slice(scene.indexOf(' function rebuild()'), scene.indexOf(' function request()'));
  assert.doesNotMatch(build, /settings\.style/);
  assert.match(build, /faceGeometry\(mask\)/);
  const rebuildCondition = scene.match(/const mustBuild=([^;]+);/)[1];
  assert.doesNotMatch(rebuildCondition, /style/);
});

test('2D сохраняет серую заливку и добавляет только красный контур', () => {
  assert.match(plan, /rect\(c,'#a4a6ac',state\.style==='edges'\?'#d44243'/);
  assert.doesNotMatch(plan, /state\.style==='solid'\?'#a4a6ac':null/);
});

test('Тени доступны при контрасте, прежний сохранённый стиль edges поддерживается', () => {
  assert.match(app, /style:\['solid','edges'\]/);
  assert.match(app, /\['edges','Контрастные'\]/);
  assert.doesNotMatch(app, /disabled:s\.style==='edges'/);
  assert.match(scene, /U\.shadows\.value=settings\.shadows\?1:0/);
  assert.match(scene, /U\.contrast\.value=settings\.style==='edges'\?1:0/);
});
