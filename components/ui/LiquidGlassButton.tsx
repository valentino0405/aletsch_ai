import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/** Liquid-glass link with separate foreground and decorative edge layers. */
export default function LiquidGlassButton({ href, children, className = "" }: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return <Link href={href} className={`liquid-glass-button ${className}`}>
    <span>{children}</span>
    <span className="liquid-glass-button__icon" aria-hidden="true"><ChevronRight size={18} /></span>
  </Link>;
}
