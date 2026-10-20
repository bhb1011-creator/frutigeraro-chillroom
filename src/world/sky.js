import * as THREE from 'three';
import { createCloudNoise } from './cloudNoise.js';

export const SUN_DIRECTION = new THREE.Vector3(0.78, 0.52, 0.18).normalize();

let cloudNoise = null;

/**
 * Sky dome: blue gradient, sun disc and raymarched volumetric cumulus clouds in a layer
 * high above the landscape (1200–3300 m). Light cover by default: scattered, puffy clouds.
 */
export function createSky({ coverage = 0.32, steps = 56 } = {}) {
  cloudNoise ??= createCloudNoise();
  const geo = new THREE.SphereGeometry(1000, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x0a64cf) },
      uMid: { value: new THREE.Color(0x3fb0f2) },
      uHorizon: { value: new THREE.Color(0xd9f6ff) },
      uSunDir: { value: SUN_DIRECTION },
      uNoise: { value: cloudNoise },
      uTime: { value: 0 },
      uCoverage: { value: coverage },
    },
    defines: { STEPS: steps },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp sampler3D;
      uniform vec3 uTop, uMid, uHorizon, uSunDir;
      uniform sampler3D uNoise;
      uniform float uTime;
      uniform float uCoverage;
      varying vec3 vDir;

      const float CLOUD_BASE = 1200.0;
      const float CLOUD_TOP = 3300.0;
      const float EXTINCTION = 0.06;

      float remap(float v, float a, float b, float c, float d) {
        return c + (v - a) / (b - a) * (d - c);
      }

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      float density(vec3 p, bool detailed) {
        float h = (p.y - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE);
        if (h < 0.0 || h > 1.0) return 0.0;
        vec3 wind = vec3(uTime * 8.0, 0.0, uTime * 3.0);
        // Big, slow weather pattern decides where clouds may form (keeps the sky only lightly clouded).
        float weather = texture(uNoise, vec3((p.x + wind.x * 0.3) / 60000.0, 0.31, (p.z + wind.z * 0.3) / 60000.0)).r;
        float cover = clamp(uCoverage + (weather - 0.5) * 0.35, 0.0, 1.0);
        // Cumulus profile: flat base, round towering top.
        float profile = smoothstep(0.0, 0.06, h) * smoothstep(1.0, 0.3, h) * mix(1.0, 0.75, h);
        float shape = texture(uNoise, (p + wind) / 8500.0).r;
        float d = remap(shape * profile, 1.0 - cover, 1.0, 0.0, 1.0);
        if (d <= 0.0) return 0.0;
        if (detailed) {
          // Erode the edges with fine Worley detail: wispy at the bottom, billowy at the top.
          float detail = texture(uNoise, (p + wind * 1.6) / 1150.0).g;
          float erosion = mix(1.0 - detail, detail, smoothstep(0.1, 0.7, h));
          d = remap(d, erosion * 0.45, 1.0, 0.0, 1.0);
        }
        return clamp(d, 0.0, 1.0);
      }

      float hg(float c, float g) {
        float g2 = g * g;
        return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * c, 1.5));
      }

      vec4 clouds(vec3 ro, vec3 rd) {
        if (rd.y < 0.01) return vec4(0.0, 0.0, 0.0, 1.0);
        float t0 = (CLOUD_BASE - ro.y) / rd.y;
        float t1 = (CLOUD_TOP - ro.y) / rd.y;
        if (t0 > 60000.0) return vec4(0.0, 0.0, 0.0, 1.0);
        float len = min(t1 - t0, 12000.0);
        float dt = len / float(STEPS);
        float t = t0 + dt * hash(gl_FragCoord.xy);
        float cosA = dot(rd, uSunDir);
        float phase = mix(hg(cosA, 0.6), hg(cosA, -0.2), 0.35) * 4.0 * 3.14159;
        vec3 sunCol = vec3(1.0, 0.97, 0.9) * 3.2;
        vec3 color = vec3(0.0);
        float trans = 1.0;
        for (int i = 0; i < STEPS; i++) {
          vec3 p = ro + rd * t;
          float d = density(p, true);
          if (d > 0.001) {
            // Light march towards the sun for self-shadowing.
            float shadow = 0.0;
            float ls = 60.0;
            vec3 lp = p;
            for (int j = 0; j < 6; j++) {
              lp += uSunDir * ls;
              shadow += density(lp, false) * ls;
              ls *= 1.7;
            }
            float tau = shadow * EXTINCTION;
            // Beer + a soft multiple-scattering term, plus the "powder" darkening of dense cores.
            float light = max(exp(-tau), exp(-tau * 0.25) * 0.5);
            float powder = 1.0 - exp(-d * 6.0);
            float h = (p.y - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE);
            vec3 ambient = mix(vec3(0.36, 0.45, 0.6), vec3(0.85, 0.92, 1.0), smoothstep(0.0, 0.75, h));
            vec3 S = sunCol * light * phase * mix(0.5, 1.0, powder) + ambient * 0.8;
            float a = exp(-d * EXTINCTION * dt);
            color += trans * S * (1.0 - a);
            trans *= a;
            if (trans < 0.03) break;
          }
          t += dt;
        }
        // Distant clouds melt into the horizon haze.
        float fade = exp(-t0 * 0.000045);
        return vec4(color * fade, mix(1.0, trans, fade));
      }

      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.25, y));
        col = mix(col, uTop, smoothstep(0.25, 0.9, y));
        col = mix(col, uHorizon * 0.97, smoothstep(0.0, -0.2, y));
        float s = max(dot(d, uSunDir), 0.0);
        col += vec3(1.0, 0.97, 0.85) * (pow(s, 6.0) * 0.25 + pow(s, 64.0) * 0.6);
        col += vec3(1.0) * smoothstep(0.9993, 0.9997, s) * 6.0;
        vec4 c = clouds(cameraPosition, d);
        // Low clouds pick up a little horizon haze.
        vec3 cloudCol = mix(c.rgb, c.rgb * 0.8 + uHorizon * 0.2 * (1.0 - c.a), smoothstep(0.25, 0.0, y));
        col = col * c.a + cloudCol;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'sky';
  sky.frustumCulled = false;
  // Drawn after the opaque world so early depth testing skips the (expensive) cloud pixels hidden behind it.
  sky.renderOrder = 100;
  sky.userData.update = (t) => {
    mat.uniforms.uTime.value = t;
  };
  return sky;
}
