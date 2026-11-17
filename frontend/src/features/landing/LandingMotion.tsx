"use client";

import { useEffect } from "react";

/*
 * Scroll motion for the landing page. GSAP + ScrollTrigger are imported lazily after hydration so they stay
 * off the critical path. Content is fully visible without JS: GSAP only sets the "from" state once it runs,
 * and only for elements still below the fold.
 */
export function LandingMotion() {
  useEffect(() => {
    let revert: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      const mm = gsap.matchMedia();

      // How-it-works: highlight the layer for the step at the centre of the viewport (colour only, so it
      // also runs under reduced motion).
      const stepsRoot = document.getElementById("how-it-works");
      if (stepsRoot) {
        stepsRoot.setAttribute("data-steps-ready", "");
        const setActive = (key: string) =>
          stepsRoot.querySelectorAll<SVGGElement>("[data-layer]").forEach((g) => g.toggleAttribute("data-active", g.dataset.layer === key));
        stepsRoot.querySelectorAll<HTMLElement>("[data-step]").forEach((el, i) => {
          if (i === 0) setActive(el.dataset.step!);
          ScrollTrigger.create({
            trigger: el,
            start: "top 60%",
            end: "bottom 60%",
            onToggle: (self) => self.isActive && setActive(el.dataset.step!),
          });
        });
      }

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const items = gsap.utils
          .toArray<HTMLElement>("[data-reveal]")
          .filter((el) => el.getBoundingClientRect().top > window.innerHeight);
        gsap.set(items, { autoAlpha: 0, y: 24 });
        ScrollTrigger.batch(items, {
          start: "top 88%",
          once: true,
          onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.08, overwrite: true }),
        });
      });

      revert = () => {
        mm.revert();
        ScrollTrigger.getAll().forEach((t) => t.kill());
        stepsRoot?.removeAttribute("data-steps-ready");
      };
    })();

    return () => {
      cancelled = true;
      revert?.();
    };
  }, []);

  return null;
}
