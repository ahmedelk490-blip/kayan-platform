'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS } from '@erp/brand';
import { ramp } from './intro-phases';
import { introClock } from './intro-clock';

/**
 * One particle system carrying every beat of the opening signature.
 *
 * Each particle holds four target positions — a thread line, a woven grid, a
 * garment silhouette, and a network node — and the timeline crossfades
 * between them. Interpolation happens in the vertex shader, so the whole
 * sequence costs one draw call and no per-frame CPU work.
 */

const COLS = 110;
const ROWS = 64;
const COUNT = COLS * ROWS;

const vertexShader = /* glsl */ `
  attribute vec3 aScatter;
  attribute vec3 aThread;
  attribute vec3 aWeave;
  attribute vec3 aGarment;
  attribute vec3 aNetwork;
  attribute float aRandom;

  uniform float uThread;
  uniform float uFabric;
  uniform float uGarment;
  uniform float uNetwork;
  uniform float uDissolve;
  uniform float uTime;

  varying float vStage;
  varying float vRandom;

  void main() {
    float d = aRandom * 0.25;

    vec3 pos = aScatter;
    pos = mix(pos, aThread,  clamp(uThread  - d, 0.0, 1.0));
    pos = mix(pos, aWeave,   clamp(uFabric  - d, 0.0, 1.0));
    pos = mix(pos, aGarment, clamp(uGarment - d, 0.0, 1.0));
    pos = mix(pos, aNetwork, clamp(uNetwork - d, 0.0, 1.0));

    // Drift while still loose; settles as the form resolves.
    float loose = 1.0 - clamp(uFabric, 0.0, 1.0);
    pos.x += sin(uTime * 0.7 + aRandom * 6.2831) * 0.35 * loose;
    pos.y += cos(uTime * 0.6 + aRandom * 6.2831) * 0.35 * loose;

    // Final beat: the field falls away so the logo can stand alone.
    pos += normalize(pos + vec3(0.001)) * uDissolve * 9.0;

    vStage = clamp(uFabric, 0.0, 1.0) + clamp(uNetwork, 0.0, 1.0);
    vRandom = aRandom;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.6 + clamp(uNetwork, 0.0, 1.0) * 1.4) * (16.0 / -mv.z);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColorRaw;
  uniform vec3 uColorCloth;
  uniform vec3 uColorData;
  uniform float uPrint;
  uniform float uFade;

  varying float vStage;
  varying float vRandom;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float dist = length(c);
    if (dist > 0.5) discard;
    float alpha = smoothstep(0.5, 0.08, dist);

    vec3 col = mix(uColorRaw, uColorCloth, clamp(vStage, 0.0, 1.0));
    col = mix(col, uColorData, clamp(vStage - 1.0, 0.0, 1.0));

    // Printing beat: a lighter maroon pass sweeps across the cloth.
    float sweep = smoothstep(0.0, 0.35, uPrint - vRandom * 0.6);
    col = mix(col, uColorCloth * 1.35, sweep * (1.0 - clamp(vStage - 1.0, 0.0, 1.0)) * 0.55);

    gl_FragColor = vec4(col, alpha * 0.85 * uFade);
  }
`;

export function IntroScene() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const pointsRef = useRef<THREE.Points>(null);

  const { geometry, uniforms } = useMemo(() => {
    const scatter = new Float32Array(COUNT * 3);
    const thread = new Float32Array(COUNT * 3);
    const weave = new Float32Array(COUNT * 3);
    const garment = new Float32Array(COUNT * 3);
    const network = new Float32Array(COUNT * 3);
    const randoms = new Float32Array(COUNT);

    const W = 13;
    const H = 7.6;

    for (let j = 0; j < ROWS; j += 1) {
      for (let i = 0; i < COLS; i += 1) {
        const index = j * COLS + i;
        const o = index * 3;
        const u = i / (COLS - 1);
        const v = j / (ROWS - 1);

        // 1 — light particles, loose in space
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 8 + Math.random() * 7;
        scatter[o] = r * Math.sin(phi) * Math.cos(theta);
        scatter[o + 1] = r * Math.sin(phi) * Math.sin(theta);
        scatter[o + 2] = r * Math.cos(phi) * 0.4;

        // 2 — thread: gathered into a few running lines
        const strand = j % 8;
        thread[o] = (u - 0.5) * W * 1.15;
        thread[o + 1] = (strand - 3.5) * 0.55 + Math.sin(u * 9 + strand) * 0.16;
        thread[o + 2] = Math.cos(u * 7 + strand) * 0.3;

        // 3 — fabric: an ordered weave with over/under undulation
        weave[o] = (u - 0.5) * W;
        weave[o + 1] = (v - 0.5) * H;
        weave[o + 2] = Math.sin(i * 0.85) * 0.1 + Math.cos(j * 0.85) * 0.1;

        // 4 — garment: the weave curved into a worn silhouette
        const bodyX = (u - 0.5) * W * 0.62;
        const taper = 1 - Math.abs(v - 0.5) * 0.35;
        garment[o] = bodyX * taper;
        garment[o + 1] = (v - 0.5) * H * 0.95;
        garment[o + 2] = Math.cos((u - 0.5) * Math.PI) * 1.9 * taper;

        // 5 — network: a sparse lattice of system nodes
        const gx = Math.round(u * 9) / 9 - 0.5;
        const gy = Math.round(v * 6) / 6 - 0.5;
        network[o] = gx * W * 1.05 + (Math.random() - 0.5) * 0.18;
        network[o + 1] = gy * H * 1.05 + (Math.random() - 0.5) * 0.18;
        network[o + 2] = (Math.random() - 0.5) * 1.4;

        randoms[index] = Math.random();
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(scatter.slice(), 3));
    geo.setAttribute('aScatter', new THREE.BufferAttribute(scatter, 3));
    geo.setAttribute('aThread', new THREE.BufferAttribute(thread, 3));
    geo.setAttribute('aWeave', new THREE.BufferAttribute(weave, 3));
    geo.setAttribute('aGarment', new THREE.BufferAttribute(garment, 3));
    geo.setAttribute('aNetwork', new THREE.BufferAttribute(network, 3));
    geo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 24);

    return {
      geometry: geo,
      uniforms: {
        uThread: { value: 0 },
        uFabric: { value: 0 },
        uGarment: { value: 0 },
        uNetwork: { value: 0 },
        uPrint: { value: 0 },
        uDissolve: { value: 0 },
        uFade: { value: 0 },
        uTime: { value: 0 },
        uColorRaw: { value: new THREE.Color(COLORS.primaryLight) },
        uColorCloth: { value: new THREE.Color(COLORS.accent) },
        uColorData: { value: new THREE.Color(COLORS.accentLight) },
      },
    };
  }, []);

  useFrame((_, delta) => {
    const m = materialRef.current;
    if (!m) return;

    const t = introClock.elapsed;
    m.uniforms.uTime.value += delta;

    m.uniforms.uFade.value = ramp(t, 0.0, 0.7) * (1 - ramp(t, 6.3, 7.1));
    m.uniforms.uThread.value = ramp(t, 0.9, 1.9);
    m.uniforms.uFabric.value = ramp(t, 1.9, 2.8);
    m.uniforms.uPrint.value = ramp(t, 2.8, 3.6);
    m.uniforms.uGarment.value = ramp(t, 3.6, 4.4);
    m.uniforms.uNetwork.value = ramp(t, 4.6, 5.6);
    m.uniforms.uDissolve.value = ramp(t, 6.0, 7.2);

    if (pointsRef.current) {
      pointsRef.current.rotation.y = Math.sin(t * 0.22) * 0.16;
      pointsRef.current.rotation.x = Math.cos(t * 0.18) * 0.07;
    }
  });

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
