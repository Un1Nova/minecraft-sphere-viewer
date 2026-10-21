import * as THREE from 'three';

export function createShellMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uCameraDirection: { value: new THREE.Vector3(0.5, 0.25, 0.8).normalize() },
      uCutaway: { value: 1 },
      uCutPosition: { value: 0 },
      uSoftness: { value: 0.14 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      varying vec3 vBlockCenter;
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        mat4 instanceTransform = modelMatrix * instanceMatrix;
        vec4 world = instanceTransform * vec4(position, 1.0);
        vBlockCenter = (instanceTransform * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vWorldPosition = world.xyz;
        vNormal = normalize(mat3(instanceTransform) * normal);
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uCameraDirection;
      uniform float uCutaway;
      uniform float uCutPosition;
      uniform float uSoftness;
      varying vec3 vWorldPosition;
      varying vec3 vBlockCenter;
      varying vec3 vNormal;
      varying vec2 vUv;

      float hash31(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float screenNoise(vec2 p) {
        return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
      }

      void main() {
        float facing = dot(normalize(vBlockCenter), uCameraDirection);
        float cut = smoothstep(uCutPosition - uSoftness, uCutPosition + uSoftness, facing);
        float visibility = 1.0 - uCutaway * cut;
        if (visibility <= 0.001) discard;
        if (visibility < 0.999 && screenNoise(gl_FragCoord.xy) > visibility) discard;

        vec3 n = normalize(vNormal);
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float key = max(dot(n, normalize(vec3(-0.45, 0.85, 0.65))), 0.0);
        float fill = max(dot(n, normalize(vec3(0.7, 0.2, -0.7))), 0.0);
        float frontLight = 0.24 * max(dot(n, viewDir), 0.0);
        float variation = mix(0.78, 1.18, hash31(vBlockCenter));
        vec2 edgeDist = min(vUv, 1.0 - vUv);
        float edge = 1.0 - smoothstep(0.013, 0.045, min(edgeDist.x, edgeDist.y));
        float grain = hash31(floor(vec3(vUv * 16.0, 0.0)) + vBlockCenter);
        vec3 base = vec3(0.019, 0.025, 0.036);
        vec3 color = base * variation * (0.57 + 0.67 * key + 0.25 * fill + frontLight);
        color *= 0.93 + 0.12 * grain;
        color *= mix(1.0, 0.46, edge);
        float rim = pow(1.0 - abs(dot(n, viewDir)), 5.0);
        color += vec3(0.005, 0.011, 0.018) * rim;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.FrontSide,
    depthWrite: true,
    depthTest: true,
    transparent: false,
    toneMapped: true,
  });
}

export function createGlassMaterial(opacity: number, showGrid: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: opacity },
      uGrid: { value: showGrid ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform float uGrid;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;

      void main() {
        vec3 n = normalize(vNormal);
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float facing = abs(dot(n, viewDir));
        float fresnel = pow(1.0 - facing, 3.0);
        vec2 gridPosition = abs(n.y) > 0.5 ? vWorldPosition.xz :
          (abs(n.x) > 0.5 ? vWorldPosition.zy : vWorldPosition.xy);
        vec2 derivatives = max(fwidth(gridPosition), vec2(0.0001));
        vec2 pixelGrid = abs(fract(gridPosition - 0.5) - 0.5) / derivatives;
        float grid = 1.0 - min(min(pixelGrid.x, pixelGrid.y), 1.0);
        float gridDistanceFade = 1.0 - smoothstep(0.4, 1.25, max(derivatives.x, derivatives.y));
        grid *= uGrid * gridDistanceFade;
        float edge = smoothstep(55.68, 55.97, max(abs(vWorldPosition.x), abs(vWorldPosition.z)));
        vec3 reflected = reflect(-viewDir, n);
        float highlight = pow(max(dot(reflected, normalize(vec3(-0.35, 0.8, 0.45))), 0.0), 28.0);
        float sheen = pow(max(dot(reflected, normalize(vec3(0.6, 0.2, -0.7))), 0.0), 8.0);
        vec3 color = mix(vec3(0.07, 0.15, 0.24), vec3(0.33, 0.56, 0.78), 0.3 + fresnel * 0.4);
        color += vec3(0.32, 0.49, 0.63) * grid;
        color += vec3(0.45, 0.64, 0.8) * edge;
        color += vec3(0.8, 0.93, 1.0) * highlight * 0.75;
        color += vec3(0.04, 0.10, 0.18) * sheen;
        float alpha = uOpacity * (0.38 + 0.55 * fresnel) + grid * 0.14 + edge * 0.23 + highlight * 0.16;
        gl_FragColor = vec4(color, min(alpha, 0.66));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: false,
    depthTest: true,
    toneMapped: true,
  });
}

export function createStarMaterial(intensity: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uIntensity: { value: intensity } },
    vertexShader: /* glsl */ `
      varying vec3 vColor;
      varying vec3 vNormal;
      void main() {
        vColor = instanceColor;
        vNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      varying vec3 vColor;
      varying vec3 vNormal;
      void main() {
        float faceLight = 0.7 + 0.3 * max(dot(normalize(vNormal), normalize(vec3(-0.3, 0.8, 0.6))), 0.0);
        gl_FragColor = vec4(vColor * (1.6 + uIntensity * 1.6) * faceLight, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    depthWrite: true,
    toneMapped: true,
  });
}

export function createGlowMaterial(intensity: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uHeight: { value: 600 },
      uIntensity: { value: intensity },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute vec3 aColor;
      uniform float uHeight;
      varying vec3 vColor;
      void main() {
        vColor = aColor;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * uHeight * projectionMatrix[1][1] / max(1.0, -mvPosition.z), 2.0, 150.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      varying vec3 vColor;
      void main() {
        float radius = length(gl_PointCoord - 0.5) * 2.0;
        if (radius > 1.0) discard;
        float halo = exp(-radius * radius * 9.0) * pow(1.0 - radius, 2.0);
        gl_FragColor = vec4(vColor * uIntensity, halo * 0.28);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    toneMapped: true,
  });
}
