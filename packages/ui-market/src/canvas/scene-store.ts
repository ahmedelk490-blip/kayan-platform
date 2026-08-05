'use client';

import { create } from 'zustand';

export type SceneId = 'hero' | null;

interface SceneState {
  /** Which scene the single persistent Canvas should render. */
  activeScene: SceneId;
  /** 0→1 progress of the active scene, driven by scroll. */
  progress: number;
  /** Device capability rung — the degradation ladder (07_UI_UX §8.1). */
  tier: 'full' | 'reduced' | 'minimal' | 'static';
  setActiveScene: (scene: SceneId) => void;
  setProgress: (value: number) => void;
  setTier: (tier: SceneState['tier']) => void;
}

/**
 * Scene coordination for the one persistent WebGL Canvas.
 *
 * Progress lives here rather than in React state because it updates every
 * frame — routing it through a re-render would defeat the renderer. Scenes
 * read it inside `useFrame` via `getState()`, never via the hook.
 */
export const useSceneStore = create<SceneState>((set) => ({
  activeScene: null,
  progress: 0,
  tier: 'full',
  setActiveScene: (activeScene) => set({ activeScene }),
  setProgress: (progress) => set({ progress }),
  setTier: (tier) => set({ tier }),
}));
