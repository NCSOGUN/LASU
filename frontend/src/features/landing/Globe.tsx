"use client";

import { useEffect, useRef } from "react";

/*
 * Rotating wireframe globe (original canvas code, no 3D library). Stands for the facility directory.
 * Draws only while on screen; a single still frame under reduced motion. DPR capped at 2 for low-end phones.
 */
const LATS = 7;
const LONS = 10;
const SEG = 48;

export function Globe({ size = 200, className = "" }: { size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    const R = size * 0.42;
    const c = size / 2;
    const tilt = 0.38;
    const cosT = Math.cos(tilt), sinT = Math.sin(tilt);

    const project = (lat: number, lon: number, rot: number) => {
      const x0 = Math.cos(lat) * Math.sin(lon + rot);
      const y0 = Math.sin(lat);
      const z0 = Math.cos(lat) * Math.cos(lon + rot);
      const y = y0 * cosT - z0 * sinT;
      const z = y0 * sinT + z0 * cosT;
      return { x: c + x0 * R, y: c - y * R, z };
    };

    const stroke = (pts: { x: number; y: number; z: number }[]) => {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const depth = (a.z + b.z) / 2; // -1 back .. 1 front
        ctx.strokeStyle = `rgba(${depth > 0 ? "213,240,228" : "127,209,174"},${0.12 + 0.55 * Math.max(0, depth) + 0.08})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    };

    const draw = (rot: number) => {
      ctx.clearRect(0, 0, size, size);
      ctx.lineWidth = 1;
      for (let i = 1; i < LATS; i++) {
        const lat = -Math.PI / 2 + (Math.PI * i) / LATS;
        stroke(Array.from({ length: SEG + 1 }, (_, s) => project(lat, (2 * Math.PI * s) / SEG, rot)));
      }
      for (let j = 0; j < LONS; j++) {
        const lon = (Math.PI * j) / LONS;
        stroke(Array.from({ length: SEG + 1 }, (_, s) => project(-Math.PI / 2 + (Math.PI * s) / SEG, lon, rot)));
        stroke(Array.from({ length: SEG + 1 }, (_, s) => project(-Math.PI / 2 + (Math.PI * s) / SEG, lon + Math.PI, rot)));
      }
    };

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      draw(0.6);
      return;
    }
    let raf = 0, visible = false, rot = 0, last = 0;
    const loop = (t: number) => {
      rot += Math.min(t - last, 50) * 0.00025;
      last = t;
      draw(rot);
      if (visible) raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    });
    io.observe(canvas);
    draw(0);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [size]);

  return <canvas ref={ref} aria-hidden="true" style={{ width: size, height: size }} className={className} />;
}
