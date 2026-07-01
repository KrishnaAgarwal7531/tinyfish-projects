"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import KpiCard from "@/components/KpiCard";
import AgentSwarm from "@/components/AgentSwarm";
import FareChart from "@/components/FareChart";
import RouteTable from "@/components/RouteTable";
import RecommendationBanner from "@/components/RecommendationBanner";
import DashboardSkeleton from "@/components/DashboardSkeleton";
import Sparkline from "@/components/Sparkline";
import RouteMiniIcon from "@/components/RouteMiniIcon";
import MiniBar from "@/components/MiniBar";
import MiniDonut from "@/components/MiniDonut";
import { ROUTES, SITES } from "@/lib/seed";
import type { SitePriceSeries, AgentStatus, RouteRecommendation, RouteCode, BookingRequest, ScheduleMeta } from "@/lib/types";
import { formatVnd } from "@/lib/format";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};

export default function DashboardPage() {
  const [priceSeries, setPriceSeries] = useState<Record<string, SitePriceSeries>>({});
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>({});
  const [recommendations, setRecommendations] = useState<RouteRecommendation[]>([]);
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);
  const [meta, setMeta] = useState<ScheduleMeta | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<RouteCode>("HAN-SGN");
  const [running, setRunning] = useState(false);
  const [triggerNote, setTriggerNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadAll = useCallback(async () => {
    const [trackRes, analyzeRes, bookingRes] = await Promise.all([
      fetch("/api/track"),
      fetch("/api/analyze"),
      fetch("/api/booking-requests"),
    ]);
    const track = await trackRes.json();
    const analyze = await analyzeRes.json();
    const booking = await bookingRes.json();
    setPriceSeries(track.priceSeries);
    setAgentStatuses(track.agentStatuses);
    setMeta(track.meta);
    setRecommendations(analyze.recommendations);
    setBookingRequests(booking.requests);
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // While no sweep has ever completed yet, poll quietly in the background —
  // this is what picks up the local-dev bootstrap sweep once it finishes,
  // without blocking the initial paint.
  useEffect(() => {
    if (meta?.lastSweepAt) return;
    const id = setInterval(() => {
      loadAll();
    }, 8000);
    return () => clearInterval(id);
  }, [meta?.lastSweepAt, loadAll]);

  async function runSweepNow() {
    setRunning(true);
    setTriggerNote(null);
    const res = await fetch("/api/track", { method: "POST" });
    const data = await res.json();
    if (data.status === "dispatched") {
      setTriggerNote("Triggered the GitHub Actions sweep — data will update in a few minutes once it finishes.");
    } else if (data.status === "already_triggered") {
      setTriggerNote("Already running — give it a couple of minutes.");
    } else {
      setTriggerNote("Sweep complete.");
    }
    await loadAll();
    setRunning(false);
  }

  const savingsIdentified = useMemo(() => {
    let total = 0;
    ROUTES.forEach((route) => {
      const series = SITES.map((s) => priceSeries[`${s.id}__${route.code}`]).filter(Boolean) as SitePriceSeries[];
      series.forEach((s) => {
        const realPoints = s.history.filter((p) => p.source === "real");
        if (realPoints.length < 2) return; // not enough real history yet — don't borrow from seed data
        const prices = realPoints.map((p) => p.priceVnd);
        total += Math.max(...prices) - prices[prices.length - 1];
      });
    });
    return total;
  }, [priceSeries]);

  const marketTrend = useMemo(() => {
    const series = priceSeries["vietjet__HAN-SGN"];
    return series ? series.history.map((p) => p.priceVnd) : [];
  }, [priceSeries]);

  const queueCount = bookingRequests.filter((r) => r.status === "waiting").length;
  const bookedCount = bookingRequests.filter((r) => r.status === "booked").length;

  if (!loaded) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-medium">Dashboard</h1>
          <p className="text-sm text-text-muted mt-1">Live fare and demand tracking across Vietnam routes.</p>
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-medium">Dashboard</h1>
        <p className="text-sm text-text-muted mt-1">Live fare and demand tracking across Vietnam routes.</p>
      </div>

      <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
        <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="Savings identified"
            value={savingsIdentified}
            format={formatVnd}
            hint="from real tracked sweeps only"
            visual={<Sparkline data={marketTrend} color="var(--success)" />}
          />
          <KpiCard
            label="Routes monitored"
            value={ROUTES.length}
            format={(v) => String(Math.round(v))}
            hint="domestic only"
            visual={<RouteMiniIcon />}
          />
          <KpiCard
            label="Auto-book queue"
            value={queueCount}
            format={(v) => String(Math.round(v))}
            hint={`${bookedCount} booked this period`}
            visual={
              <MiniBar
                segments={[
                  { value: queueCount, color: "var(--text-muted)", label: "waiting" },
                  { value: bookedCount, color: "var(--success)", label: "booked" },
                ]}
              />
            }
          />
          <KpiCard
            label="Sites tracked"
            value={SITES.length}
            format={(v) => String(Math.round(v))}
            hint="3 airlines, 4 OTAs"
            visual={
              <MiniDonut
                segments={[
                  { value: SITES.filter((s) => s.type === "Airline").length, color: "var(--accent)", label: "Airlines" },
                  { value: SITES.filter((s) => s.type === "OTA").length, color: "var(--text-muted)", label: "OTAs" },
                ]}
              />
            }
          />
        </motion.div>

        <motion.div variants={item}>
          <AgentSwarm agentStatuses={agentStatuses} meta={meta} onRunNow={runSweepNow} running={running} />
          {triggerNote && <p className="text-xs text-text-muted mt-2">{triggerNote}</p>}
        </motion.div>

        <motion.div variants={item} className="card-surface rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="font-medium text-sm">
                {ROUTES.find((r) => r.code === selectedRoute)?.label}, economy
              </p>
              <p className="text-xs text-text-muted mt-0.5">14-day fare history across 7 sites</p>
            </div>
          </div>
          <FareChart
            priceSeries={priceSeries}
            routeCode={selectedRoute}
            recommendation={recommendations.find((r) => r.routeCode === selectedRoute)}
          />
        </motion.div>

        <motion.div variants={item}>
          <RecommendationBanner recommendations={recommendations} routeCode={selectedRoute} meta={meta} />
        </motion.div>

        <motion.div variants={item} className="card-surface rounded-xl p-5">
          <p className="text-xs text-text-secondary mb-2">Monitored routes — click to view chart</p>
          <RouteTable priceSeries={priceSeries} recommendations={recommendations} selectedRoute={selectedRoute} onSelect={setSelectedRoute} />
        </motion.div>
      </motion.div>
    </div>
  );
}
