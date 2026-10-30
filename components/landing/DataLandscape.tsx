"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import styles from "./landing.module.css";

function noise(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/** A drifting network of particles, matching the reference's dark data field. */
export default function DataLandscape() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    let lastFrame = 0;
    let time = phaseRef.current;

    // Seed geometry once, so individual points drift instead of flickering randomly.
    const columns = 76;
    const rows = 11;
    const points = Array.from({ length: columns * rows * 3 }, (_, index) => ({
      u: (index % columns) / (columns - 1) * 1.4 - 0.2,
      v: (Math.floor(index / columns) % rows) / (rows - 1) - 0.5,
      layer: Math.floor(index / (columns * rows)),
      jitterX: (noise(index + 1) - 0.5) * 0.016,
      jitterY: (noise(index + 7) - 0.5) * 0.026,
      brightness: noise(index + 17),
      size: 0.55 + noise(index + 29) * 1.3,
      visible: noise(index + 43) > 0.24,
    }));
    const projected = new Float32Array(points.length * 3);
    const stars = Array.from({ length: 260 }, (_, index) => ({
      x: noise(index + 4001),
      y: noise(index + 5001),
      size: 0.5 + noise(index + 6001) * 1.1,
      brightness: 0.1 + noise(index + 7001) * 0.28,
    }));

    const draw = () => {
      context.clearRect(0, 0, width, height);
      if (!width || !height) return;
      const drift = Math.sin(time * 0.13) * 0.045;
      const mobile = width < 600;

      points.forEach((point, index) => {
        const { u, v, layer, jitterX, jitterY } = point;
        const depth = 0.65 + Math.sin(u * 8 + v * 3 + layer + time * 0.09) * 0.35;
        const x = (u + jitterX + drift * (layer + 1) * 0.45) * width;
        const y = (0.47 + Math.sin(u * 6.4 + layer * 2.1 + time * 0.12) * 0.23
          + Math.cos(u * 15 - layer + time * 0.07) * 0.075
          + v * 0.32 + jitterY) * height;
        projected[index * 3] = x;
        projected[index * 3 + 1] = y;
        projected[index * 3 + 2] = depth;
      });

      context.lineWidth = 0.55;
      points.forEach((point, index) => {
        if (!point.visible || (mobile && index % 2 === 0)) return;
        const x = projected[index * 3];
        const y = projected[index * 3 + 1];
        const depth = projected[index * 3 + 2];
        const opacity = (0.18 + point.brightness * 0.52) * depth;

        if (index % columns > 0 && point.brightness > 0.7) {
          const previous = (index - 1) * 3;
          context.strokeStyle = `rgba(194,217,210,${opacity * 0.28})`;
          context.beginPath();
          context.moveTo(projected[previous], projected[previous + 1]);
          context.lineTo(x, y);
          context.stroke();
        }
        if (index >= columns && point.brightness > 0.91) {
          const above = (index - columns) * 3;
          context.strokeStyle = `rgba(194,217,210,${opacity * 0.2})`;
          context.beginPath();
          context.moveTo(projected[above], projected[above + 1]);
          context.lineTo(x, y);
          context.stroke();
        }
        context.fillStyle = `rgba(218,232,223,${opacity})`;
        context.beginPath();
        context.arc(x, y, point.size * (0.55 + depth * 0.55), 0, Math.PI * 2);
        context.fill();
      });

      stars.forEach((star) => {
        const x = ((star.x + time * 0.004) % 1) * width;
        const y = ((star.y + time * 0.0015) % 1) * height;
        context.fillStyle = `rgba(219,231,221,${star.brightness})`;
        context.beginPath();
        context.arc(x, y, star.size, 0, Math.PI * 2);
        context.fill();
      });
    };

    const animate = (timestamp: number) => {
      if (timestamp - lastFrame >= 1000 / 30) {
        time += Math.min(timestamp - lastFrame, 50) * 0.00016;
        lastFrame = timestamp;
        draw();
      }
      frame = requestAnimationFrame(animate);
    };
    const syncAnimation = () => {
      cancelAnimationFrame(frame);
      draw();
      if (!paused && !motion.matches && visible && !document.hidden) {
        lastFrame = performance.now();
        frame = requestAnimationFrame(animate);
      }
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
      syncAnimation();
    });
    resize.observe(canvas);
    intersection.observe(canvas);
    motion.addEventListener("change", syncAnimation);
    document.addEventListener("visibilitychange", syncAnimation);
    return () => {
      phaseRef.current = time;
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      motion.removeEventListener("change", syncAnimation);
      document.removeEventListener("visibilitychange", syncAnimation);
    };
  }, [paused]);

  return (
    <>
      <canvas ref={canvasRef} className={styles.landscape} aria-hidden="true" />
      <button className={styles.motionToggle} type="button" onClick={() => setPaused(!paused)} aria-label={paused ? "Play background animation" : "Pause background animation"} aria-pressed={paused}>
        {paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
      </button>
    </>
  );
}
