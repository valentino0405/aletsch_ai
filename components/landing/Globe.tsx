"use client";

import createGlobe from "cobe";
import { useEffect, useRef } from "react";

// Live counting originates in India.
const INDIA: [number, number] = [19.07, 72.87]; // Mumbai
const DESTS: [number, number][] = [
  [37.77, -122.42], // San Francisco
  [40.71, -74.0], // New York
  [51.5, -0.12], // London
  [1.35, 103.82], // Singapore
  [-23.55, -46.63], // São Paulo
  [-33.87, 151.21], // Sydney
];

/**
 * Earth-style dotted globe (continents sampled from cobe's built-in map).
 * A bright marker sits on India with arcs fanning out to other regions, so the
 * "live counting" visibly originates there. Auto-rotates, pauses off-screen,
 * stays still for prefers-reduced-motion.
 */
export default function Globe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let phi = 1.8; // start with Asia / India toward the viewer
    let width = 0;
    let running = true;

    const onResize = () => {
      width = canvas.offsetWidth || 440;
    };
    onResize();
    window.addEventListener("resize", onResize);

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi,
      theta: 0.28,
      dark: 1,
      diffuse: 1.15,
      mapSamples: 16000,
      mapBrightness: 5.4,
      mapBaseBrightness: 0.04,
      baseColor: [0.09, 0.1, 0.14],
      markerColor: [0.5, 0.53, 0.98],
      glowColor: [0.18, 0.15, 0.42],
      markers: [
        { location: INDIA, size: 0.12 },
        ...DESTS.map((location) => ({ location, size: 0.045 })),
      ],
      arcs: DESTS.map((to) => ({ from: INDIA, to })),
      arcColor: [0.56, 0.6, 1],
      arcWidth: 0.55,
      arcHeight: 0.42,
    });

    let raf = 0;
    const render = () => {
      if (running) phi += 0.004;
      globe.update({ phi, width: width * 2, height: width * 2 });
      raf = requestAnimationFrame(render);
    };

    if (reduce) {
      globe.update({ phi, width: width * 2, height: width * 2 });
    } else {
      raf = requestAnimationFrame(render);
    }

    requestAnimationFrame(() => {
      canvas.style.opacity = "1";
    });

    const io = new IntersectionObserver(
      ([e]) => {
        running = e.isIntersecting;
        if (reduce) return;
        cancelAnimationFrame(raf);
        if (running) raf = requestAnimationFrame(render);
      },
      { threshold: 0 }
    );
    io.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      globe.destroy();
      io.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        width: "100%",
        height: "100%",
        aspectRatio: "1",
        opacity: 0,
        transition: "opacity 1s ease",
      }}
    />
  );
}
