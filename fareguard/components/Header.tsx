"use client";

import { useEffect, useState } from "react";
import { Search, Bell, User } from "lucide-react";

export default function Header() {
  const [synced, setSynced] = useState<boolean | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const [trackRes, bookingRes] = await Promise.all([fetch("/api/track"), fetch("/api/booking-requests")]);
        const track = await trackRes.json();
        const booking = await bookingRes.json();
        if (cancelled) return;
        setSynced(Boolean(track.meta?.lastSweepAt));
        setPendingCount(booking.requests.filter((r: any) => r.status === "waiting").length);
      } catch {
        // header status is best-effort — don't break the page over it
      }
    }
    check();
    const id = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <header className="hidden md:flex items-center justify-between gap-4 px-6 py-3 border-b border-border bg-surface">
      <div className="relative w-full max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          placeholder="Search routes, sites, bookings…"
          className="w-full bg-surface-alt border border-border rounded-md pl-9 pr-3 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-shadow"
        />
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
            synced ? "border-success/30 bg-success/10 text-success" : "border-border text-text-muted"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${synced ? "bg-success" : "bg-text-muted"}`} />
          {synced === null ? "Checking…" : synced ? "All systems synced" : "Awaiting first sync"}
        </div>
        <button className="relative text-text-secondary hover:text-text-primary transition-colors">
          <Bell size={17} />
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-warning text-[9px] text-white flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </button>
        <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-white">
          <User size={14} />
        </div>
      </div>
    </header>
  );
}
