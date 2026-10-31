import { Waypoints } from "lucide-react";
import styles from "./logo.module.css";

interface LogoProps {
  compact?: boolean;
  size?: "default" | "small";
  className?: string;
}

export default function Logo({ compact = false, size = "default", className = "" }: LogoProps) {
  return (
    <span
      role="img"
      aria-label="Aletsch AI"
      className={`${styles.logo} ${size === "small" ? styles.small : ""} ${className}`}
    >
      <Waypoints size={25} strokeWidth={1.6} className={styles.mark} aria-hidden="true" />
      {!compact && <span aria-hidden="true">ALETSCH.AI</span>}
    </span>
  );
}
