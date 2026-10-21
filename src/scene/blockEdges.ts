import * as THREE from 'three';

/**
 * Полный каркас единичного куба для каждого переданного центра.
 *
 * Пары position образуют ровно 12 рёбер: диагоналей и граней здесь нет.
 * faceMask влияет только на нормали смежных открытых граней, но не удаляет
 * рёбра. Шейдер может ослаблять тыльные линии, сохраняя прозрачность объёма.
 * Нужен THREE.LineSegments; aBlockCenter добавляется к position в шейдере.
 */
export function createCubeEdgesGeometry(faceMask: number, centers: Float32Array): THREE.InstancedBufferGeometry {
  if (!Number.isInteger(faceMask) || faceMask < 0 || faceMask > 63) {
    throw new RangeError('Маска граней должна быть целым числом от 0 до 63.');
  }
  if (centers.length % 3 !== 0) {
    throw new RangeError('Координаты центров должны состоять из полных троек x, y, z.');
  }

  const bounds = new THREE.Box3();
  for (let i = 0; i < centers.length; i += 3) {
    const x = centers[i], y = centers[i + 1], z = centers[i + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new RangeError('Координаты центров должны быть конечными числами.');
    }
    bounds.min.x = Math.min(bounds.min.x, x - 0.5);
    bounds.min.y = Math.min(bounds.min.y, y - 0.5);
    bounds.min.z = Math.min(bounds.min.z, z - 0.5);
    bounds.max.x = Math.max(bounds.max.x, x + 0.5);
    bounds.max.y = Math.max(bounds.max.y, y + 0.5);
    bounds.max.z = Math.max(bounds.max.z, z + 0.5);
  }

  const positions: number[] = [];
  const normalA: number[] = [];
  const normalB: number[] = [];

  for (let axis = 0; axis < 3; axis++) {
    const axisA = (axis + 1) % 3;
    const axisB = (axis + 2) % 3;
    for (const signA of [-1, 1]) {
      for (const signB of [-1, 1]) {
        const a = [0, 0, 0];
        const b = [0, 0, 0];
        if (faceMask & (1 << (axisA * 2 + (signA < 0 ? 1 : 0)))) a[axisA] = signA;
        if (faceMask & (1 << (axisB * 2 + (signB < 0 ? 1 : 0)))) b[axisB] = signB;
        for (const endpoint of [-0.5, 0.5]) {
          const point = [0, 0, 0];
          point[axis] = endpoint;
          point[axisA] = signA * 0.5;
          point[axisB] = signB * 0.5;
          positions.push(...point);
          normalA.push(...a);
          normalB.push(...b);
        }
      }
    }
  }

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aNormalA', new THREE.Float32BufferAttribute(normalA, 3));
  geometry.setAttribute('aNormalB', new THREE.Float32BufferAttribute(normalB, 3));
  geometry.setAttribute('aBlockCenter', new THREE.InstancedBufferAttribute(centers, 3));
  geometry.instanceCount = centers.length / 3;
  geometry.setDrawRange(0, 24);
  // Обычный computeBoundingBox не учитывает пользовательский aBlockCenter.
  geometry.boundingBox = bounds;
  geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
  return geometry;
}
