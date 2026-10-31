"use client";

import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import { ChevronDown, UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import LogoutButton from "@/components/auth/LogoutButton";
import styles from "./landing.module.css";

interface AccountDropdownProps {
  mobile?: boolean;
}

export default function AccountDropdown({ mobile = false }: AccountDropdownProps) {
  const { user } = useUser();
  const displayName = user?.fullName || user?.firstName || user?.username || "My Account";
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const desktop = window.matchMedia("(min-width: 961px)");
    const handleResize = () => setOpen(false);
    document.addEventListener("pointerdown", handleOutsideClick);
    containerRef.current?.addEventListener("keydown", handleEscape);
    desktop.addEventListener("change", handleResize);
    const container = containerRef.current;

    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
      container?.removeEventListener("keydown", handleEscape);
      desktop.removeEventListener("change", handleResize);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className={`${styles.accountControl} ${mobile ? styles.mobileAccount : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.login} ${styles.accountTrigger}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <UserRound size={19} aria-hidden="true" />
        <span>My Account</span>
        <ChevronDown size={14} aria-hidden="true" className={styles.accountChevron} />
      </button>
      {open && (
        <div id={panelId} className={styles.accountPanel} role="group" aria-label="Account options">
          <div className={styles.accountProfile}>
            {user?.imageUrl ? (
              <Image src={user.imageUrl} alt="" width={40} height={40} unoptimized className={styles.accountAvatar} />
            ) : (
              <span className={styles.accountAvatar} aria-hidden="true"><UserRound size={20} /></span>
            )}
            <span className={styles.accountName}>{displayName}</span>
          </div>
          <LogoutButton className={`${styles.accountItem} ${styles.accountLogout}`} />
        </div>
      )}
    </div>
  );
}
