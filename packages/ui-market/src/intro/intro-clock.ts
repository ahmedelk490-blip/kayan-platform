/**
 * Shared intro timeline position.
 *
 * A module-level mutable object rather than state or context: it updates every
 * frame, and routing it through React would re-render the tree 60 times a
 * second. `BrandIntro` writes it; `IntroScene` reads it inside `useFrame`.
 */
export const introClock = { elapsed: 0 };
