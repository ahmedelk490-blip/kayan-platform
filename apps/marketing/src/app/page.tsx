import { Hero } from '@/components/sections/Hero';
import { TheMaking } from '@/components/sections/TheMaking';
import { TheControl } from '@/components/sections/TheControl';
import { Proof } from '@/components/sections/Proof';

/**
 * Homepage — the five-act narrative spine (07_UI_UX §4.2).
 *
 * Milestone 1 ships Acts I, II, III and V. The remaining WOW moments
 * (Platform Overview, Printing Simulation, Embroidery Thread, Warehouse,
 * Supply Chain, Dashboard Preview, AI Analytics) follow in milestone 2.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <TheMaking />
      <TheControl />
      <Proof />
    </>
  );
}
