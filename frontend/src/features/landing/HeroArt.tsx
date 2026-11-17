"use client";

import { useEffect, useRef } from "react";

/*
 * Layered hero art (CardiaTec structure, original HealthAccess artwork). Each layer is its own file in
 * /public/landing/hero/ so it can be swapped. `factor` sets the depth of the pointer tilt per layer.
 */
const LAYERS = [
  { src: "/landing/hero/dot-field.svg", factor: 0.2, className: "drift" },
  { src: "/landing/hero/code-ring.svg", factor: 0.45, className: "slow-spin" },
  { src: "/landing/hero/network.svg", factor: 0.7, className: "" },
  { src: "/landing/hero/body.svg", factor: 1, className: "" },
  { src: "/landing/hero/facility-nodes.svg", factor: 1.5, className: "" },
] as const;

const MAX_DEG = 6;

export function HeroArt() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const fine = matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)");
    if (!fine.matches) return;

    const layers = Array.from(root.querySelectorAll<HTMLElement>("[data-tilt]"));
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;

    const tick = () => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      for (const el of layers) {
        const f = Number(el.dataset.tilt);
        el.style.transform = `perspective(1000px) rotateX(${(-y * MAX_DEG * f).toFixed(2)}deg) rotateY(${(x * MAX_DEG * f).toFixed(2)}deg) translate3d(${(x * 10 * f).toFixed(1)}px, ${(y * 10 * f).toFixed(1)}px, 0)`;
      }
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / innerWidth) * 2 - 1;
      ty = (e.clientY / innerHeight) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={rootRef} aria-hidden="true" className="relative mx-auto aspect-square w-full max-w-[340px] sm:max-w-[440px] lg:max-w-[600px]">
      {LAYERS.map((l, i) => (
        <div key={l.src} data-tilt={l.factor} className="hero-layer absolute inset-0 will-change-transform" style={{ "--depth": i } as React.CSSProperties}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static decorative SVG layers; next/image adds nothing here */}
          <img data-hero-layer src={l.src} alt="" width={600} height={600} decoding="async" className={`size-full ${l.className}`} />
        </div>
      ))}
    </div>
  );
}
