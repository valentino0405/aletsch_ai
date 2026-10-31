"use client";

import createGlobe, { type Globe as GlobeInstance } from "cobe";
import { useEffect, useId, useRef } from "react";
import styles from "./landing.module.css";

const INDIA: [number, number] = [19.07, 72.87];
const DESTINATIONS: [number, number][] = [
  [37.77, -122.42],
  [40.71, -74.0],
  [51.5, -0.12],
  [1.35, 103.82],
  [-23.55, -46.63],
  [-33.87, 151.21],
];

/** Decorative Earth with slow rotation, cursor tilt, and a static SVG fallback. */
export default function Globe() {
  const stageRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<HTMLDivElement>(null);
  const gradientId = useId();

  useEffect(() => {
    const stage = stageRef.current;
    const renderer = rendererRef.current;
    if (!stage || !renderer) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let globe: GlobeInstance | undefined;
    let initialized = false;
    let visible = false;
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastFrame = 0;
    let warmupUntil = 0;
    let phi = 3.5;
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, hovering: false };

    const draw = () => {
      globe?.update({ phi: phi + pointer.x, theta: 0.24 + pointer.y });
    };
    const animate = (timestamp: number) => {
      const delta = Math.min(timestamp - lastFrame, 50) / 1000;
      lastFrame = timestamp;
      if (!motion.matches) {
        const ease = 1 - Math.exp(-delta * 5);
        pointer.x += (pointer.targetX - pointer.x) * ease;
        pointer.y += (pointer.targetY - pointer.y) * ease;
        phi += delta * (pointer.hovering ? 0.018 : 0.075);
      }
      draw();
      // Static warm-up draws let COBE's embedded continent texture finish loading.
      if (visible && !document.hidden && (!motion.matches || timestamp < warmupUntil)) {
        frame = requestAnimationFrame(animate);
      }
    };
    const initialize = () => {
      if (initialized || !width || !height) return;
      initialized = true;
      // COBE wraps its canvas in a DOM element. Keep that tree outside React's ownership.
      const canvas = document.createElement("canvas");
      const contextOptions = { alpha: true, antialias: true, depth: false, stencil: false };
      const context = canvas.getContext("webgl2", contextOptions) || canvas.getContext("webgl", contextOptions);
      if (!context) return;
      renderer.append(canvas);
      try {
        globe = createGlobe(canvas, {
          devicePixelRatio: Math.min(window.devicePixelRatio || 1, 1.75),
          // COBE v2 applies the pixel ratio internally; these dimensions are CSS pixels.
          width,
          height,
          phi,
          theta: 0.24,
          dark: 1,
          diffuse: 1.6,
          scale: 0.94,
          mapSamples: width < 400 ? 14000 : 22000,
          mapBrightness: 3.6,
          mapBaseBrightness: 0.025,
          baseColor: [0.42, 0.54, 0.48],
          markerColor: [1, 0.38, 0.27],
          glowColor: [0.09, 0.15, 0.14],
          markers: [
            { location: INDIA, size: 0.065 },
            ...DESTINATIONS.map((location) => ({ location, size: 0.025 })),
          ],
          arcs: DESTINATIONS.map((to, index) => ({
            from: INDIA,
            to,
            color: (index % 2 ? [0.66, 0.79, 0.71] : [0.93, 0.38, 0.28]) as [number, number, number],
          })),
          arcColor: [0.93, 0.38, 0.28],
          arcWidth: 0.45,
          arcHeight: 0.28,
          markerElevation: 0.025,
        });
        stage.dataset.ready = "true";
        warmupUntil = performance.now() + 300;
      } catch {
        // Retain the illustration if this device cannot initialize the renderer.
        globe?.destroy();
        globe = undefined;
        renderer.replaceChildren();
      }
    };
    const syncAnimation = () => {
      cancelAnimationFrame(frame);
      stage.dataset.animate = String(visible && !document.hidden && !motion.matches);
      if (!visible || document.hidden) return;
      initialize();
      draw();
      if (globe && (!motion.matches || performance.now() < warmupUntil)) {
        lastFrame = performance.now();
        frame = requestAnimationFrame(animate);
      }
    };
    const leave = () => {
      pointer.hovering = false;
      pointer.targetX = 0;
      pointer.targetY = 0;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch" || motion.matches) return;
      const bounds = stage.getBoundingClientRect();
      pointer.targetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.5;
      pointer.targetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 0.28;
      pointer.hovering = true;
    };
    const syncMotion = () => {
      leave();
      if (motion.matches) {
        pointer.x = 0;
        pointer.y = 0;
      }
      syncAnimation();
    };
    const syncVisibility = () => {
      if (document.hidden) leave();
      syncAnimation();
    };
    const resize = new ResizeObserver(([entry]) => {
      width = Math.round(entry.contentRect.width);
      height = Math.round(entry.contentRect.height);
      if (width && height) globe?.update({ width, height });
      syncAnimation();
    });
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) leave();
      syncAnimation();
    });
    resize.observe(stage);
    intersection.observe(stage);
    stage.addEventListener("pointermove", move, { passive: true });
    stage.addEventListener("pointerleave", leave);
    stage.addEventListener("pointercancel", leave);
    window.addEventListener("blur", leave);
    motion.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerleave", leave);
      stage.removeEventListener("pointercancel", leave);
      window.removeEventListener("blur", leave);
      motion.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
      globe?.destroy();
      renderer.replaceChildren();
      delete stage.dataset.ready;
      delete stage.dataset.animate;
    };
  }, []);

  return (
    <div className={styles.globeVisual} aria-hidden="true">
      <div ref={stageRef} className={styles.globeStage}>
        <div className={styles.globeHalo} />
        <svg className={styles.globeOrbits} viewBox="0 0 600 500" fill="none">
          <ellipse cx="300" cy="250" rx="272" ry="99" transform="rotate(-24 300 250)" stroke="var(--color-blue-400)" strokeOpacity=".22" strokeWidth=".7" />
          <ellipse className={styles.globeOrbitTrack} cx="300" cy="250" rx="262" ry="118" transform="rotate(24 300 250)" stroke="var(--color-secondary)" strokeOpacity=".3" strokeWidth=".7" strokeDasharray="2 9" />
          <g stroke="var(--color-blue-500)" strokeOpacity=".35" strokeWidth=".8">
            <path d="M46 112V92h20M534 92h20v20M46 388v20h20M534 408h20v-20" />
          </g>
          <g fill="var(--color-accent)"><circle cx="74" cy="332" r="3" /><circle cx="527" cy="171" r="3" /></g>
        </svg>
        <svg className={styles.globeFallback} viewBox="0 0 600 500" fill="none">
          <defs>
            <radialGradient id={gradientId} cx="35%" cy="28%" r="75%">
              <stop stopColor="#30493d" /><stop offset="1" stopColor="#0a1510" />
            </radialGradient>
          </defs>
          <circle cx="300" cy="250" r="187" fill={`url(#${gradientId})`} stroke="var(--color-blue-400)" strokeOpacity=".25" />
          <g stroke="var(--color-cyan-300)" strokeOpacity=".28" strokeWidth=".8" strokeDasharray="1 5" strokeLinecap="round">
            <ellipse cx="300" cy="250" rx="187" ry="62" /><ellipse cx="300" cy="250" rx="187" ry="128" />
            <ellipse cx="300" cy="250" rx="66" ry="187" /><ellipse cx="300" cy="250" rx="132" ry="187" />
            <path d="M113 250h374M300 63v374" />
          </g>
          <path d="M344 205Q235 85 165 221M344 205Q434 109 454 283M344 205Q284 349 229 385" stroke="var(--color-accent)" strokeOpacity=".65" strokeWidth="1" />
          <g fill="var(--color-accent)"><circle cx="344" cy="205" r="4" /><circle cx="165" cy="221" r="2.5" /><circle cx="454" cy="283" r="2.5" /><circle cx="229" cy="385" r="2.5" /></g>
        </svg>
        <div ref={rendererRef} className={styles.globeRenderer} />
      </div>
    </div>
  );
}
