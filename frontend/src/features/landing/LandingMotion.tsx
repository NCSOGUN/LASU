"use client";

import { useEffect } from "react";

/*
 * One IntersectionObserver for the whole page: marks [data-inview] elements with [data-in] the first time they
 * enter the viewport. CSS (globals.css) does the animating, and only when html[data-motion] is set.
 * Replaces GSAP: the template's motion is reveal-on-enter, which CSS handles without a 40 KB library.
 */
export function LandingMotion() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-inview]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.setAttribute("data-in", "");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
