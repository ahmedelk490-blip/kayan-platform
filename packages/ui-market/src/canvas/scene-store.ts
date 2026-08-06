'use client';

import { create } from 'zustand';

export type SceneId = 'intro' | 'hero' | null;

interface SceneState {
  /**
   * What the page would like on screen, set by whichever SceneAnchor is in
   * view. Not necessarily what renders — the intro outranks it.
   */
  desiredScene: SceneId;
  /** True while the opening signature owns the canvas. */
  introActive: boolean;
  /** 0→1 progress of the active scene, driven by scroll. */
  progress: number;
  /** Device capability rung — the degradation ladder (07_UI_UX §8.1). */
  tier: 'full' | 'reduced' | 'minimal' | 'static';
  setDesiredScene: (scene: SceneId) => void;
  setIntroActive: (active: boolean) => void;
  setProgress: (value: number) => void;
  setTier: (tier: SceneState['tier']) => void;
}

/**
 * Scene coordination for the one persistent WebGL Canvas.
 *
 * Intro and scroll anchors are kept on SEPARATE fields deliberately. When
 * both wrote to a single `activeScene`, the hero's IntersectionObserver —
 * which fires immediately at scroll top — raced the intro and silently stole
 * the canvas, so the opening signature never rendered. Precedence is now
 * resolved at read time instead of by whoever writes last.
 *
 * Progress lives here rather than in React state because it updates every
 * frame; routing it through a re-render would defeat the renderer. Scenes
 * read it inside `useFrame` via `getState()`, never via the hook.
 */
export const useSceneStore = create<SceneState>((set) => ({
  desiredScene: null,
  introActive: false,
  progress: 0,
  tier: 'full',
  setDesiredScene: (desiredScene) => set({ desiredScene }),
  setIntroActive: (introActive) => set({ introActive }),
  setProgress: (progress) => set({ progress }),
  setTier: (tier) => set({ tier }),
}));

/** The scene that should actually render. Intro outranks scroll anchors. */
export function resolveActiveScene(state: {
  introActive: boolean;
  desiredScene: SceneId;
}): SceneId {
  return state.introActive ? 'intro' : state.desiredScene;
}
