"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Menu, UserRound, X } from "lucide-react";
import Logo from "@/components/brand/Logo";
import AccountDropdown from "./AccountDropdown";
import styles from "./landing.module.css";

const LINKS = [
  { label: "Solutions", href: "#features" },
  { label: "How It Works", href: "#how" },
  { label: "Our Vision", href: "#vision" },
];

export default function LandingNav({ signedIn }: { signedIn: boolean }) {
  const { isLoaded, isSignedIn } = useAuth();
  const authenticated = isLoaded ? !!isSignedIn : signedIn;
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const startHref = authenticated ? "/dashboard" : "/sign-up";

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); toggleRef.current?.focus(); }
    };
    const handleOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) setOpen(false);
    };
    const desktop = window.matchMedia("(min-width: 961px)");
    const handleResize = () => { if (desktop.matches) setOpen(false); };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleOutsideClick);
    desktop.addEventListener("change", handleResize);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleOutsideClick);
      desktop.removeEventListener("change", handleResize);
    };
  }, [open]);

  return (
    <header ref={headerRef} className={styles.header}>
      <Link href="#top" className={styles.brand} onClick={() => setOpen(false)} aria-label="Aletsch AI home"><Logo /></Link>
      <div className={styles.desktopNavigation}>
        <div className={styles.navViewport}>
          <nav className={styles.navGroup} aria-label="Main navigation">
            {LINKS.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
            <Link href={startHref} className={styles.navCta}>{authenticated ? "Dashboard" : "Get Started"}<ArrowUpRight size={15} aria-hidden="true" /></Link>
          </nav>
        </div>
        {authenticated ? <AccountDropdown /> : (
          <Link href="/sign-in" className={styles.login}><UserRound size={19} aria-hidden="true" />Sign in</Link>
        )}
      </div>
      <button ref={toggleRef} type="button" className={styles.menuToggle} onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-navigation">{open ? <X size={23} /> : <Menu size={23} />}</button>
      <nav id="mobile-navigation" className={styles.mobileNavigation} aria-label="Mobile navigation" hidden={!open}>
        {LINKS.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}<ArrowUpRight size={17} aria-hidden="true" /></Link>)}
        {authenticated ? <AccountDropdown mobile /> : (
          <Link href="/sign-in" onClick={() => setOpen(false)}>Sign in<UserRound size={17} aria-hidden="true" /></Link>
        )}
        <Link href={startHref} className={styles.primaryButton} onClick={() => setOpen(false)}>{authenticated ? "Dashboard" : "Get Started"}<ArrowUpRight size={17} aria-hidden="true" /></Link>
      </nav>
    </header>
  );
}
