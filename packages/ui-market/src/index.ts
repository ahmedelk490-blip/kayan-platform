export { SmoothScroller } from './scroll/SmoothScroller';
export { ScrollProgress } from './scroll/ScrollProgress';
export { SceneAnchor } from './canvas/SceneAnchor';

/**
 * `CanvasHost` is deliberately NOT exported here.
 *
 * It imports the R3F/three runtime at module scope, so re-exporting it from
 * this barrel would pull ~290 kB of WebGL into the initial bundle for anyone
 * importing so much as a button. Import it from '@erp/ui-market/canvas',
 * behind a dynamic import.
 */
export { useSceneStore } from './canvas/scene-store';
export { MagneticButton } from './primitives/MagneticButton';
export { AnimatedText } from './primitives/AnimatedText';
export { CountingNumber } from './primitives/CountingNumber';
export { SectionShell } from './primitives/SectionShell';
