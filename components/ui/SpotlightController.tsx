"use client";

import { useEffect } from "react";

/** Adds the cursor-following highlight to every glass card in the app shell. */
export default function SpotlightController() {
  useEffect(() => {
    const updateSpotlights = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !(event.target instanceof Element)) return;

      let card = event.target.closest<HTMLElement>(".glow-card, .glass-surface");
      while (card) {
        const bounds = card.getBoundingClientRect();
        card.style.setProperty("--spotlight-x", `${event.clientX - bounds.left}px`);
        card.style.setProperty("--spotlight-y", `${event.clientY - bounds.top}px`);
        card = card.parentElement?.closest<HTMLElement>(".glow-card, .glass-surface") ?? null;
      }
    };

    document.addEventListener("pointermove", updateSpotlights, { passive: true });
    return () => document.removeEventListener("pointermove", updateSpotlights);
  }, []);

  return null;
}
