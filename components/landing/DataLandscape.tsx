"use client";

import { useEffect, useRef } from "react";
import styles from "./landing.module.css";

/** A layered point surface with a softly eased cursor wake. */
export default function DataLandscape() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const hero = canvas.parentElement;
    if (!hero) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    let lastFrame = 0;
    let time = 0;
    const pointer = { x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5, strength: 0, active: false };
    const palette = Array.from({ length: 20 }, (_, index) =>
      `rgba(${190 + index * 2},${215 + index},${212 + index},${0.035 + index * 0.034})`,
    );

    const draw = () => {
      context.clearRect(0, 0, width, height);
      if (!width || !height) return;
      const mobile = width < 600;
      const columns = mobile ? 76 : 144;
      const rows = mobile ? 54 : 78;
      const radius = Math.max(150, Math.min(width * 0.22, 280));
      // Batch similarly lit points to keep the dense surface inexpensive to draw.
      const layers = palette.map(() => new Path2D());
      const driftX = (pointer.x - 0.5) * pointer.strength;
      const driftY = (pointer.y - 0.5) * pointer.strength;

      for (let row = 0; row < rows; row++) {
        const depth = row / (rows - 1);
        const perspective = 0.3 + depth * 1.45;
        const amplitude = 0.025 + Math.pow(depth, 0.9) * 0.15;
        const depthLight = Math.pow(depth, 1.25);

        for (let column = 0; column < columns; column++) {
          const u = column / (columns - 1) * 1.4 - 0.2;
          const swell = u * 7.2 + depth * 4.8 - time * 0.42;
          const fold = u * 12.4 - depth * 5.5 + time * 0.28;
          const wave = Math.sin(swell + Math.sin(fold) * 0.32) * amplitude
            + Math.cos(fold) * amplitude * 0.32
            + Math.sin(u * 21 + depth * 8 + time * 0.36) * amplitude * 0.09;
          let x = (0.5 + (u - 0.5) * perspective) * width
            + Math.sin(depth * 4.5 + time * 0.18) * depth * 16 + driftX * depth * 22;
          let y = (0.17 + Math.pow(depth, 1.18) * 0.94 + wave) * height + driftY * depth * 12;

          const dx = x - pointer.x * width;
          const dy = y - pointer.y * height;
          const distance = Math.hypot(dx, dy) / radius;
          const influence = Math.exp(-distance * distance * 2) * pointer.strength;
          const ripple = Math.sin(distance * 10 - time * 2.4) * influence;
          // A local lift and concentric wake follow the cursor without moving the UI.
          x += dx * influence * 0.12;
          y += dy * influence * 0.08 - influence * height * 0.065 + ripple * height * 0.016;

          const crest = (Math.cos(swell) + 1) * 0.5;
          const light = Math.min(1, depthLight * (0.44 + crest * 0.4) + influence * 0.36);
          const size = (0.35 + depth * 1.05) * (0.88 + crest * 0.16 + influence * 0.3);
          if (x < -size || x > width + size || y < -size || y > height + size) continue;
          const layer = layers[Math.round(light * (layers.length - 1))];
          layer.moveTo(x + size, y);
          layer.arc(x, y, size, 0, Math.PI * 2);
        }
      }
      layers.forEach((layer, index) => {
        context.fillStyle = palette[index];
        context.fill(layer);
      });
    };

    const animate = (timestamp: number) => {
      if (timestamp - lastFrame >= 1000 / (width < 600 ? 30 : 60)) {
        const delta = Math.min(timestamp - lastFrame, 50) / 1000;
        time += delta;
        const ease = 1 - Math.exp(-delta * 7);
        pointer.x += (pointer.targetX - pointer.x) * ease;
        pointer.y += (pointer.targetY - pointer.y) * ease;
        pointer.strength += ((pointer.active ? 1 : 0) - pointer.strength) * ease;
        lastFrame = timestamp;
        draw();
      }
      frame = requestAnimationFrame(animate);
    };
    const syncAnimation = () => {
      cancelAnimationFrame(frame);
      draw();
      if (!motion.matches && visible && !document.hidden) {
        lastFrame = performance.now();
        frame = requestAnimationFrame(animate);
      }
    };
    const leave = () => { pointer.active = false; };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch" || motion.matches) return;
      const bounds = canvas.getBoundingClientRect();
      pointer.targetX = (event.clientX - bounds.left) / bounds.width;
      pointer.targetY = (event.clientY - bounds.top) / bounds.height;
      if (!pointer.active && pointer.strength < 0.01) {
        pointer.x = pointer.targetX;
        pointer.y = pointer.targetY;
      }
      pointer.active = true;
    };
    const syncMotion = () => {
      if (motion.matches) {
        leave();
        pointer.strength = 0;
      }
      syncAnimation();
    };
    const syncVisibility = () => {
      if (document.hidden) leave();
      syncAnimation();
    };
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width;
      height = entry.contentRect.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      syncAnimation();
    });
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) leave();
      syncAnimation();
    });
    resize.observe(canvas);
    intersection.observe(canvas);
    hero.addEventListener("pointermove", move, { passive: true });
    hero.addEventListener("pointerleave", leave);
    hero.addEventListener("pointercancel", leave);
    window.addEventListener("blur", leave);
    motion.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      hero.removeEventListener("pointermove", move);
      hero.removeEventListener("pointerleave", leave);
      hero.removeEventListener("pointercancel", leave);
      window.removeEventListener("blur", leave);
      motion.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.landscape} aria-hidden="true" />;
}
