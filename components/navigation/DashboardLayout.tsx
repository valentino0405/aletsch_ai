"use client";

import { useEffect, useRef, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { Menu, X } from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
  preview?: boolean;
}

export default function DashboardLayout({ children, preview = false }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const navigation = navigationRef.current;
    const focusable = () => Array.from(navigation?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex="0"]'
    ) ?? []).filter((element) => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    navigation?.addEventListener("keydown", trapFocus);
    return () => {
      navigation?.removeEventListener("keydown", trapFocus);
      previousFocus?.focus();
    };
  }, [mobileOpen]);

  return (
    <div className="dashboard-shell app-shell text-zinc-100 flex">
      <div className="ambient-bg" aria-hidden="true" />
      {/* Sidebar Navigation */}
      <div className="desktop-navigation"><Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} preview={preview} /></div>
      {mobileOpen && <div ref={navigationRef} className="mobile-navigation" role="dialog" aria-modal="true" aria-label="Navigation" onKeyDown={(event) => { if (event.key === "Escape") setMobileOpen(false); }} onClick={(event) => { if ((event.target as HTMLElement).closest("a")) setMobileOpen(false); }}>
        <button className="fixed inset-0 z-40 bg-black/70" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
        <Sidebar isOpen={true} setIsOpen={() => setMobileOpen(false)} preview={preview} />
      </div>}

      {/* Main Content Area */}
      <div
        className={`dashboard-workspace flex-1 min-w-0 flex flex-col transition-all duration-300 ${
          sidebarOpen ? "md:pl-64" : "md:pl-20"
        }`}
      >
        {/* Top Header Navigation */}
        <div className="dashboard-header">
          <button className="mobile-menu-button" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button>
          <Topbar preview={preview} />
        </div>

        {/* Inner Page Viewport */}
        <main className="dashboard-content relative flex-1 min-h-0 min-w-0 p-4 sm:p-6 lg:px-9 lg:py-8 overflow-y-auto w-full">
          <div className="page-enter">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
