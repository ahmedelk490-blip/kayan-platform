'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS } from '@erp/brand';
import { useSceneStore } from '../canvas/scene-store';

/** Weave dimensions. 120 × 70 = 8,400 — the stitch count of design DSN-0042. */
const COLS = 120;
const ROWS = 70;
const COUNT = COLS * ROWS;

const vertexShader = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aTarget;
  attribute float aRandom;

  uniform float uProgress;
  uniform float uTime;
  uniform float uSize;

  varying float vAssembled;

  void main() {
    // Per-point delay so the weave assembles progressively rather than
    // snapping as one mass.
    float delay = aRandom * 0.35;
    float t = clamp((uProgress - delay) / 0.65, 0.0, 1.0);

    // easeOutExpo — mirrors --ease-out-expo in @erp/brand.
    float e = t >= 1.0 ? 1.0 : 1.0 - pow(2.0, -10.0 * t);

    vec3 pos = mix(aStart, aTarget, e);

    // Ambient drift, fading out as the point finds its place.
    float drift = 1.0 - e;
    pos.x += sin(uTime * 0.4 + aRandom * 6.2831) * 0.18 * drift;
    pos.y += cos(uTime * 0.33 + aRandom * 6.2831) * 0.18 * drift;

    vAssembled = e;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // Weave spacing is ~0.126 world units ≈ 11.5px at this camera. Points
    // must stay well under that or the grid reads as a solid sheet — and
    // with additive blending, overdraw saturates to white.
    gl_PointSize = uSize * (0.55 + e * 0.75) * (14.0 / -mv.z);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColorFrom;
  uniform vec3 uColorTo;

  varying float vAssembled;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;

    float alpha = smoothstep(0.5, 0.1, d);
    vec3 col = mix(uColorFrom, uColorTo, vAssembled);
    gl_FragColor = vec4(col, alpha * (0.12 + vAssembled * 0.45));
  }
`;

export function HeroWeaveScene() {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  /** Autoplay assembly clock, seconds since mount. */
  const assembleClock = useRef(0);

  const { geometry, uniforms } = useMemo(() => {
    const starts = new Float32Array(COUNT * 3);
    const targets = new Float32Array(COUNT * 3);
    const randoms = new Float32Array(COUNT);

    const width = 15;
    const height = 8.5;

    for (let j = 0; j < ROWS; j += 1) {
      for (let i = 0; i < COLS; i += 1) {
        const index = j * COLS + i;
        const o = index * 3;

        // Target: an ordered woven grid, with the slight over/under
        // undulation of an actual weave.
        const u = i / (COLS - 1);
        const v = j / (ROWS - 1);
        targets[o] = (u - 0.5) * width;
        targets[o + 1] = (v - 0.5) * height;
        targets[o + 2] = Math.sin(i * 0.85) * 0.1 + Math.cos(j * 0.85) * 0.1;

        // Start: scattered through a sphere — raw, unordered material.
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 7 + Math.random() * 6;
        starts[o] = r * Math.sin(phi) * Math.cos(theta);
        starts[o + 1] = r * Math.sin(phi) * Math.sin(theta);
        starts[o + 2] = r * Math.cos(phi) * 0.5;

        randoms[index] = Math.random();
      }
    }

    const geo = new THREE.BufferGeometry();
    // `position` must exist for three to compute draw range; aStart doubles as it.
    geo.setAttribute('position', new THREE.BufferAttribute(starts.slice(), 3));
    geo.setAttribute('aStart', new THREE.BufferAttribute(starts, 3));
    geo.setAttribute('aTarget', new THREE.BufferAttribute(targets, 3));
    geo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 16);

    return {
      geometry: geo,
      uniforms: {
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uSize: { value: 2.0 },
        // Raw, unordered material resolving into finished cloth: deep KAYAN
        // maroon lifting to its lighter tint as the weave assembles.
        uColorFrom: { value: new THREE.Color(COLORS.primaryLight) },
        uColorTo: { value: new THREE.Color(COLORS.accent) },
      },
    };
  }, []);

  useFrame((state, delta) => {
    const material = materialRef.current;
    if (!material) return;

    material.uniforms.uTime.value += delta;

    // Interaction grammar: autoplay, THEN scroll-dolly (07_UI_UX §4.3).
    // The weave assembles on its own over ~2.6s so the Hero does its job
    // before the visitor touches anything, then scroll disperses it as the
    // story moves on to Act II.
    assembleClock.current += delta;
    const assemble = Math.min(1, assembleClock.current / 2.6);
    const eased = 1 - Math.pow(1 - assemble, 3); // easeOutCubic

    // Read scroll from the store, not from a hook — a re-render per frame
    // would defeat the renderer (3d-websites playbook).
    const disperse = useSceneStore.getState().progress;
    const target = eased * (1 - disperse);

    const current = material.uniforms.uProgress.value as number;
    // Critically damped follow, so scroll feels weighted rather than rigid.
    material.uniforms.uProgress.value = current + (target - current) * Math.min(1, delta * 6);

    if (pointsRef.current) {
      pointsRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.12) * 0.09;
      pointsRef.current.rotation.x = Math.cos(state.clock.elapsedTime * 0.1) * 0.05;
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
