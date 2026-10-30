"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import styles from "./landing.module.css";

/** Scope motion to the landing route and restore every style on cleanup. */
export default function LandingMotion({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    let disposed = false;

    media.add(
      {
        desktop: "(min-width: 961px)",
        mobile: "(max-width: 960px)",
        reduce: "(prefers-reduced-motion: reduce)",
      },
      (context) => {
        const { desktop, reduce } = context.conditions!;
        if (reduce) return;

        const lenis = new Lenis({
          lerp: 0.085,
          smoothWheel: !!desktop,
          syncTouch: false,
          // Lenis reads each section's CSS scroll-margin for the fixed header.
          anchors: true,
          prevent: (node) => node.id === "mobile-navigation",
        });
        lenis.on("scroll", ScrollTrigger.update);
        const tick = (seconds: number) => lenis.raf(seconds * 1000);
        gsap.ticker.add(tick);

        if (window.scrollY < window.innerHeight) {
          gsap.fromTo(
            root.querySelectorAll("[data-hero-line]"),
            { opacity: 0, filter: "blur(9px)", y: 18 },
            { opacity: 1, filter: "blur(0px)", y: 0, duration: 1.15, stagger: 0.13, ease: "power2.out", clearProps: "all" },
          );
          gsap.fromTo(
            root.querySelectorAll("[data-hero-copy]"),
            { opacity: 0, y: 14 },
            { opacity: 1, y: 0, duration: 0.85, delay: 0.4, stagger: 0.12, ease: "power2.out", clearProps: "all" },
          );
        }

        root.querySelectorAll<HTMLElement>("[data-card-slot]").forEach((slot, index) => {
          const card = slot.querySelector("article");
          if (!card) return;
          gsap.fromTo(
            card,
            { rotation: desktop ? [16, 19, 14, 17][index] : 8, y: desktop ? 72 : 35, transformOrigin: "50% 60%" },
            {
              rotation: 0,
              y: 0,
              ease: "none",
              scrollTrigger: {
                trigger: slot,
                start: "top bottom",
                end: desktop ? "top 43%" : "top 65%",
                scrub: 0.65,
                invalidateOnRefresh: true,
              },
            },
          );
        });

        root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => {
          if (element.getBoundingClientRect().bottom < 0) return;
          const heading = element.dataset.reveal === "heading";
          gsap.fromTo(
            element,
            { opacity: heading ? 0.12 : 0, filter: heading ? "blur(8px)" : "blur(0px)", y: heading ? 0 : 18 },
            {
              opacity: 1,
              filter: "blur(0px)",
              y: 0,
              duration: heading ? 1.25 : 0.85,
              ease: "power2.out",
              clearProps: "all",
              scrollTrigger: { trigger: element, start: "top 90%", once: true },
            },
          );
        });

        return () => {
          gsap.ticker.remove(tick);
          lenis.destroy();
        };
      },
      root,
    );

    // Font loading can move headings and therefore the card trigger positions.
    void document.fonts.ready.then(() => {
      if (!disposed) ScrollTrigger.refresh();
    });
    return () => {
      disposed = true;
      media.revert();
    };
  }, []);

  return <div id="top" ref={rootRef} className={styles.landing}>{children}</div>;
}
