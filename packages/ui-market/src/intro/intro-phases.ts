/**
 * The KAYAN opening signature.
 *
 * The directive names eight beats. They are implemented as one continuous
 * particle system driven by a single timeline uniform rather than eight
 * separate scenes — the beats read as one transformation of the same matter,
 * which is the point: light becomes thread becomes cloth becomes product
 * becomes data. Eight discrete scenes would cut where the story should flow.
 *
 * Timings are in seconds from intro start.
 */
export const PHASES = [
  { id: 'particles', at: 0.0, label: 'Light particles' },
  { id: 'thread', at: 0.9, label: 'Embroidery thread' },
  { id: 'fabric', at: 1.9, label: 'Fabric' },
  { id: 'printing', at: 2.8, label: 'Printing' },
  { id: 'uniform', at: 3.6, label: 'Finished uniform' },
  { id: 'digital', at: 4.4, label: 'Digital transformation' },
  { id: 'network', at: 5.2, label: 'ERP network' },
  { id: 'logo', at: 6.1, label: 'KAYAN' },
] as const;

export const INTRO_DURATION = 7.4;

/** Normalised 0→1 position along the intro timeline. */
export function timelineProgress(elapsed: number) {
  return Math.min(1, Math.max(0, elapsed / INTRO_DURATION));
}

/** Smooth 0→1 ramp between two times, for crossfading a beat in. */
export function ramp(elapsed: number, from: number, to: number) {
  if (to <= from) return elapsed >= to ? 1 : 0;
  const t = Math.min(1, Math.max(0, (elapsed - from) / (to - from)));
  return t * t * (3 - 2 * t); // smoothstep
}
