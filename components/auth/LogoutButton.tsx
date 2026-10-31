"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { useState } from "react";

interface LogoutButtonProps {
  compact?: boolean;
  className?: string;
}

export default function LogoutButton({ compact = false, className = "" }: LogoutButtonProps) {
  const { signOut } = useClerk();
  const { isLoaded } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const handleLogout = async () => {
    setPending(true);
    setError(false);
    try {
      await signOut({ redirectUrl: "/" });
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={handleLogout}
        disabled={!isLoaded || pending}
        aria-label="Sign out"
        title={compact ? "Sign out" : undefined}
        className={`inline-flex items-center gap-2 cursor-pointer disabled:cursor-wait disabled:opacity-50 ${className}`}
      >
        <LogOut size={16} aria-hidden="true" />
        {!compact && <span>{pending ? "Signing out…" : "Log out"}</span>}
      </button>
      {error && <span role="alert" className="mt-1 text-xs text-rose-400">Could not sign out. Please try again.</span>}
    </span>
  );
}
