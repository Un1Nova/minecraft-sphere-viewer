import * as THREE from 'three';

export interface ShellUniforms {
  uCameraDirection: THREE.IUniform<THREE.Vector3>;
  uActualCameraDirection: THREE.IUniform<THREE.Vector3>;
  uCutOuterCosine: THREE.IUniform<number>;
  uCutInnerCosine: THREE.IUniform<number>;
  uShellOpacity: THREE.IUniform<number>;
}

export function createShellUniforms(): ShellUniforms {
  return {
    uCameraDirection: { value: new THREE.Vector3(0.5, 0.25, 0.8).normalize() },
    uActualCameraDirection: { value: new THREE.Vector3(0.5, 0.25, 0.8).normalize() },
    uCutOuterCosine: { value: 1.001 },
    uCutInnerCosine: { value: 1.002 },
    uShellOpacity: { value: 1 },
  };
}

// Exactly the same world-space cut is used for surface, shadow depth and red
// edges. It deliberately does not depend on cameraPosition: during the shadow
// pass Three replaces that built-in with the light's camera position.
const shellCoverageGLSL = /* glsl */ `
  uniform vec3 uCameraDirection;
  uniform vec3 uActualCameraDirection;
  uniform float uCutOuterCosine;
  uniform float uCutInnerCosine;
  uniform float uShellOpacity;
  varying vec3 vShellWorldPosition;

  float sphereShellCoverage() {
    vec3 radial = normalize(vShellWorldPosition);
    float facing = dot(radial, uCameraDirection);
    float actualFacing = dot(radial, uActualCameraDirection);
    float cut = smoothstep(uCutOuterCosine, uCutInnerCosine, facing);
    cut *= smoothstep(0.0, 0.08, actualFacing);
    return uShellOpacity * (1.0 - cut);
  }

  float sphereScreenNoise(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }
`;

const shellOpaqueCoverageGLSL = /* glsl */ `
  float shellCoverage = sphereShellCoverage();
  if (shellCoverage <= 0.0) discard;
  if (shellCoverage < 1.0 && sphereScreenNoise(gl_FragCoord.xy) >= shellCoverage) discard;
`;

function addShellCutaway<T extends THREE.MeshStandardMaterial | THREE.MeshDepthMaterial>(
  material: T, uniforms: ShellUniforms, seams: boolean,
): T & { uniforms: ShellUniforms } {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = /* glsl */ `
      varying vec3 vShellWorldPosition;
      ${seams ? 'varying vec2 vShellUv;' : ''}
      ${shader.vertexShader}
    `.replace('#include <project_vertex>', /* glsl */ `
      #include <project_vertex>
      vec4 shellWorldPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        shellWorldPosition = instanceMatrix * shellWorldPosition;
      #endif
      vShellWorldPosition = (modelMatrix * shellWorldPosition).xyz;
      ${seams ? 'vShellUv = uv;' : ''}
    `);
    shader.fragmentShader = `${shellCoverageGLSL}\n${seams ? 'varying vec2 vShellUv;' : ''}\n${shader.fragmentShader}`
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${shellOpaqueCoverageGLSL}`);
    if (seams) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        // Identical, thin joints distinguish coplanar blocks. Actual shadows
        // are still produced by the standard material's shadow-map lighting.
        vec2 shellUvPixel = max(fwidth(vShellUv), vec2(0.00001));
        vec2 shellEdgeDistance = min(vShellUv, 1.0 - vShellUv) / shellUvPixel;
        float shellJoint = 1.0 - smoothstep(0.12, 0.7, min(shellEdgeDistance.x, shellEdgeDistance.y));
        shellJoint *= 1.0 - smoothstep(0.35, 0.9, max(shellUvPixel.x, shellUvPixel.y));
        diffuseColor.rgb *= 1.0 - 0.13 * shellJoint;
      `);
    }
  };
  material.customProgramCacheKey = () => `sphere-shared-cutaway-v3-${seams ? 'surface' : 'shadow'}`;
  return Object.assign(material, { uniforms });
}

export function createShellMaterial(uniforms = createShellUniforms()) {
  return addShellCutaway(new THREE.MeshStandardMaterial({
    color: 0x8c8c8c,
    roughness: 0.88,
    metalness: 0,
    side: THREE.FrontSide,
    // The default shadow-side flip moves short voxel shadows by a whole block.
    shadowSide: THREE.FrontSide,
    depthWrite: true,
    depthTest: true,
    transparent: false,
    blending: THREE.NoBlending,
    toneMapped: true,
  }), uniforms, true);
}

export function createShellDepthMaterial(uniforms: ShellUniforms) {
  return addShellCutaway(new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    side: THREE.FrontSide,
    depthTest: true,
    depthWrite: true,
    blending: THREE.NoBlending,
  }), uniforms, false);
}

/** Instanced cube edges only: there are no invisible filled depth surfaces. */
export function createShellEdgesMaterial(uniforms: ShellUniforms) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms },
    vertexShader: /* glsl */ `
      attribute vec3 aBlockCenter;
      attribute vec3 aNormalA;
      attribute vec3 aNormalB;
      varying vec3 vShellWorldPosition;
      varying float vEdgeVisibility;
      void main() {
        vec4 world = modelMatrix * vec4(position + aBlockCenter, 1.0);
        vec3 center = (modelMatrix * vec4(aBlockCenter, 1.0)).xyz;
        vShellWorldPosition = world.xyz;
        vec3 viewDir = normalize(cameraPosition - world.xyz);
        float faceFacing = max(dot(mat3(modelMatrix) * aNormalA, viewDir), dot(mat3(modelMatrix) * aNormalB, viewDir));
        float radialFacing = dot(normalize(center), viewDir);
        // When inspecting from inside, the inner walls become the readable
        // ones. All twelve edges remain present; back edges are simply fainter.
        float inside = 1.0 - smoothstep(length(center) - 1.0, length(center) + 1.0, length(cameraPosition));
        radialFacing *= 1.0 - 2.0 * inside;
        float nearSide = smoothstep(-0.02, 0.18, radialFacing);
        float faceVisibility = mix(0.3, 1.0, smoothstep(0.0, 0.12, faceFacing));
        vEdgeVisibility = mix(0.065, 0.92, nearSide) * faceVisibility;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `${shellCoverageGLSL}
      varying float vEdgeVisibility;
      void main() {
        float coverage = sphereShellCoverage();
        if (coverage <= 0.0) discard;
        gl_FragColor = vec4(vec3(0.72, 0.025, 0.018), coverage * vEdgeVisibility);
        #include <colorspace_fragment>
      }
    `,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    toneMapped: false,
  });
}

/** Thin, antialiased white lines on the work plane below the model. */
export function createWorkspaceGridMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorldPosition;

      float gridLine(float spacing) {
        vec2 grid = vWorldPosition.xz / spacing;
        vec2 derivatives = max(fwidth(grid), vec2(0.00001));
        vec2 lineDistance = abs(fract(grid - 0.5) - 0.5) / derivatives;
        float line = 1.0 - smoothstep(0.2, 0.95, min(lineDistance.x, lineDistance.y));
        float detailFade = 1.0 - smoothstep(0.3, 0.75, max(derivatives.x, derivatives.y));
        return line * detailFade;
      }

      void main() {
        float minor = gridLine(16.0);
        float major = gridLine(64.0);
        float fade = 1.0 - smoothstep(180.0, 690.0, length(vWorldPosition.xz));
        float alpha = max(minor * 0.5, major * 0.78) * fade;
        if (alpha < 0.001) discard;
        gl_FragColor = vec4(vec3(1.0), alpha);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.FrontSide,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
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
