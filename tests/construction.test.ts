import assert from 'node:assert/strict';
import test from 'node:test';
import { construction } from '../src/model.ts';

test('пять рабочих этажей сохраняют 16 блоков свободной высоты', () => {
  assert.equal(construction.workingRanges.length, 5);
  for (const [bottom, top] of construction.workingRanges) {
    assert.equal(top - bottom, 16);
    assert.ok(construction.slabCenters.some(y => y + 0.5 === bottom));
    assert.ok(construction.slabCenters.some(y => y - 0.5 === top));
  }
});

test('четыре технических габарита по 5 включают две плиты и 3 блока воздуха', () => {
  assert.equal(construction.technicalRanges.length, 4);
  for (const [bottom, top] of construction.technicalRanges) {
    assert.equal(top - bottom, 5);
    assert.ok(construction.slabCenters.includes((bottom + 0.5) as typeof construction.slabCenters[number]));
    assert.ok(construction.slabCenters.includes((top - 0.5) as typeof construction.slabCenters[number]));
    assert.equal((top - 1) - (bottom + 1), 3);
  }
});

test('десять стеклянных плит не пересекаются и полностью помещаются внутри оболочки', () => {
  assert.equal(construction.slabCenters.length, 10);
  const halfWidth = construction.platformWidth / 2;
  const innerRadius = construction.outerDiameter / 2 - construction.shellThickness;
  let previousTop = -Infinity;
  for (const center of construction.slabCenters) {
    assert.ok(center - 0.5 > previousTop);
    previousTop = center + 0.5;
    for (const edgeY of [center - 0.5, center + 0.5]) {
      assert.ok(2 * halfWidth ** 2 + edgeY ** 2 < innerRadius ** 2);
    }
  }
  assert.equal(construction.slabCenters.at(-1)! - construction.slabCenters[0] + 1, 102);
});
