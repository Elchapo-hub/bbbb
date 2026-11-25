import { useEffect } from 'react';
import Lenis from 'lenis';

/** Enables eased scrolling without overriding a visitor's reduced-motion preference. */
export function SmoothScroll() {
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) return;

    const lenis = new Lenis({
      duration: 1.05,
      lerp: 0.09,
      smoothWheel: true,
      touchMultiplier: 1.25,
    });

    let frame = 0;
    const animate = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return null;
}
