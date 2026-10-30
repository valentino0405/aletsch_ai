"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X, ChevronsRight } from "lucide-react";

const LINKS = [
  { label: "Home", href: "#top" },
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how" },
  { label: "Token", href: "#power" },
];

/**
 * Floating pill navbar (DegenKit style): rounded bar, logo left, centre links,
 * primary CTA right. Sits over the hero and blurs its background.
 */
export default function LandingNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4">
      <div className="mx-auto flex max-w-5xl items-center justify-between rounded-full border border-white/10 bg-[#0b1120]/80 py-2.5 pl-5 pr-2.5 backdrop-blur-xl">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <ChevronsRight size={18} className="text-blue-500" />
          <span className="text-sm font-bold tracking-tight text-white">Aletsch AI</span>
        </Link>

        {/* Center links */}
        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[13px] font-medium text-slate-400 transition-colors hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>

        {/* CTA */}
        <div className="flex items-center gap-2">
          <Link
            href={signedIn ? "/dashboard" : "/sign-up"}
            className="hidden rounded-full bg-blue-600 px-5 py-2 text-[13px] font-semibold text-white shadow-lg shadow-blue-600/25 transition-colors hover:bg-blue-500 sm:inline-block"
          >
            {signedIn ? "Dashboard" : "Get Started"}
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="mx-auto mt-2 max-w-5xl rounded-2xl border border-white/10 bg-[#0b1120]/95 p-5 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col gap-4">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-slate-300"
              >
                {l.label}
              </a>
            ))}
            <Link
              href={signedIn ? "/dashboard" : "/sign-up"}
              onClick={() => setOpen(false)}
              className="mt-1 rounded-full bg-blue-600 px-5 py-2.5 text-center text-sm font-semibold text-white"
            >
              {signedIn ? "Dashboard" : "Get Started"}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
