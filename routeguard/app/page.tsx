"use client";
import { useState, useRef, useEffect } from "react";
import "./styles.css";

// Types
interface UrlTarget {
  url: string;
  source_name: string;
  goal: string;
  category?: string;
}

interface AgentResult {
  index: number;
  source: string;
  url: string;
  category?: string;
  success: boolean;
  preview: string;
  streaming_url?: string | null;
}

interface AgentProgress {
  index: number;
  type: string;
  category?: string;
  purpose?: string;
  streaming_url?: string;
  message?: string;
}

interface Signal {
  source: string;
  category?: string;
  risk: string;
  finding: string;
}

interface Alternative {
  name: string;
  transit_days: number;
  cost_change: string;
  risk_score: number;
  description: string;
  recommended: boolean;
}

interface Analysis {
  risk_score: number;
  risk_level: string;
  confidence: number;
  verdict: string;
  expected_delay_days: number;
  freight_change_percent: number;
  estimated_arrival: string;
  resolution_date: string;
  signals: Signal[];
  alternatives: Alternative[];
  risk_breakdown: Record<string, number>;
  timeline_events: { date: string; label: string; type: string }[];
}

// Category display helpers
const CATEGORY_META: Record<string, { icon: string; label: string; color: string }> = {
  weather:        { icon: "⛈", label: "Weather",     color: "#2563eb" },
  port_authority: { icon: "🏗", label: "Port",        color: "#7c3aed" },
  freight_rates:  { icon: "📊", label: "Freight",     color: "#0891b2" },
  geopolitical:   { icon: "🛡", label: "Security",    color: "#dc2626" },
  maritime_news:  { icon: "📡", label: "News",        color: "#c8410a" },
  supply_chain:   { icon: "⛓", label: "Supply",      color: "#059669" },
};
function getCatMeta(cat?: string) {
  return CATEGORY_META[cat || "maritime_news"] || CATEGORY_META.maritime_news;
}

// Logo SVG component
function LogoSVG({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="24" cy="24" r="22" stroke="#1a1209" strokeWidth="1.2" />
      <circle
        cx="24"
        cy="24"
        r="14"
        stroke="#1a1209"
        strokeWidth="0.7"
        strokeDasharray="3 3"
      />
      <circle cx="24" cy="24" r="3.5" fill="#c8410a" />
      <path
        d="M24 6 L25.5 22 L24 24 L22.5 22 Z"
        fill="#c8410a"
        opacity="0.85"
      />
      <path
        d="M24 42 L25.5 26 L24 24 L22.5 26 Z"
        fill="#1a1209"
        opacity="0.2"
      />
      <path
        d="M 5 28 Q 13 22 21 28 Q 27 33 33 28 Q 41 22 48 28"
        stroke="#c8410a"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}

export default function Home() {
  // State
  const [phase, setPhase] = useState<"home" | "loading" | "results">("home");
  const [origin, setOrigin] = useState("Singapore");
  const [destination, setDestination] = useState("Rotterdam");
  const [cargo, setCargo] = useState("Electronics");
  const [departureDate, setDepartureDate] = useState("2026-04-07");
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [currentStep, setCurrentStep] = useState(1);
  const [urls, setUrls] = useState<UrlTarget[]>([]);
  const [agentResults, setAgentResults] = useState<AgentResult[]>([]);
  const [agentProgress, setAgentProgress] = useState<Record<number, AgentProgress>>({});
  const [llmText, setLlmText] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [showPDF, setShowPDF] = useState(false);
  const [error, setError] = useState("");
  const [visibleCards, setVisibleCards] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("overview");

  // Refs
  const llmIntervalRef = useRef<NodeJS.Timeout | null>(null);

  function fillExample(o: string, d: string, c: string) {
    setOrigin(o);
    setDestination(d);
    setCargo(c);
  }

  // Show result cards with staggered animation
  function showCards() {
    const ids = ["cRisk", "cTimeline", "cDonut", "cBars", "cAlt", "cSignals", "cActions", "cReport"];
    ids.forEach((id, i) => {
      setTimeout(() => setVisibleCards((prev) => [...prev, id]), 200 + i * 200);
    });
  }

  // Main scan flow
  async function startScan() {
    setError("");
    setAgentResults([]);
    setAgentProgress({});
    setLlmText("");
    setAnalysis(null);
    setVisibleCards([]);
    setPhase("loading");
    setProgress(5);
    setCurrentStep(1);
    setStatusMsg("Searching for intelligence sources…");

    try {
      // Step 1: Discover URLs
      setProgress(10);
      const discoverRes = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination, cargo, departureDate }),
      });

      const discovered = await discoverRes.json();
      const discoveredUrls: UrlTarget[] = discovered.urls || [];
      
      if (discoveredUrls.length === 0) {
        throw new Error("No URLs found to scan");
      }

      setUrls(discoveredUrls);
      setProgress(20);
      setStatusMsg(`Found ${discoveredUrls.length} sources — deploying agents…`);

      // Step 2: Fire TinyFish agents
      setTimeout(() => {
        setCurrentStep(2);
        setStatusMsg("Deploying web agents to scrape sites…");
        setProgress(25);
      }, 800);

      // Wait a beat then start scanning
      await new Promise((r) => setTimeout(r, 1200));

      const scanRes = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: discoveredUrls,
          origin,
          destination,
          cargo,
          departureDate,
        }),
      });

      if (!scanRes.ok) throw new Error("Scan failed");

      // Read SSE stream
      const reader = scanRes.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ") && eventType) {
            try {
              const data = JSON.parse(line.slice(6));
              handleSSEEvent(eventType, data, discoveredUrls.length);
            } catch {}
            eventType = "";
          }
        }
      }
    } catch (err: any) {
      console.error("Scan error:", err);
      setError(err.message || "Something went wrong");
      setStatusMsg("Error: " + (err.message || "Analysis failed"));
    }
  }

  function handleSSEEvent(event: string, data: any, totalAgents: number) {
    switch (event) {
      case "status":
        setStatusMsg(data.message);
        if (data.step) setCurrentStep(data.step);
        break;

      case "agent_progress":
        // Store only the latest step per agent — previous step disappears, replaced by new one
        if (data.type === "progress" || data.type === "started" || data.type === "streaming_url") {
          setAgentProgress((prev) => ({
            ...prev,
            [data.index]: data, // single object, not array — just the current step
          }));
        }
        break;

      case "agent_done":
        setAgentResults((prev) => {
          const next = [...prev, data];
          const pct = 25 + (next.length / totalAgents) * 50;
          setProgress(Math.min(pct, 78));
          const remaining = totalAgents - next.length;
          if (remaining > 0) {
            setStatusMsg(`Collecting intelligence… ${next.length}/${totalAgents} agents done, ${remaining} still running`);
          } else {
            setStatusMsg(`All ${totalAgents} sources collected — running analysis…`);
          }
          return next;
        });
        break;

      case "analysis":
        setProgress(95);
        setCurrentStep(3);
        setStatusMsg("Analysis complete — loading results…");
        setAnalysis(data);
        // All agents done + analysis complete — NOW transition to results
        setTimeout(() => {
          setProgress(100);
          setTimeout(() => {
            setPhase("results");
            showCards();
          }, 800);
        }, 700);
        break;

      case "error":
        setError(data.message);
        setStatusMsg("Error: " + data.message);
        break;

      case "complete":
        break;
    }
  }

  function resetAll() {
    setPhase("home");
    setProgress(0);
    setStatusMsg("");
    setCurrentStep(1);
    setUrls([]);
    setAgentResults([]);
    setAgentProgress({});
    setLlmText("");
    setAnalysis(null);
    setVisibleCards([]);
    setError("");
  }

  function getRiskColor(level: string) {
    if (level === "HIGH" || level === "CRITICAL") return "var(--red)";
    if (level === "MEDIUM") return "var(--amber)";
    return "var(--green)";
  }

  function downloadPDF() {
    const content = document.getElementById("pdfContent")?.innerHTML || "";
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>RouteGuard Report</title><style>
      body{font-family:Georgia,serif;color:#1a1209;padding:48px;max-width:680px;margin:0 auto}
      table{width:100%;border-collapse:collapse;margin:10px 0}
      th,td{padding:7px 10px;text-align:left;border-bottom:1px solid #e0d9c6;font-size:12px}
      th{background:#faf8f4;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#8a7d6b}
      h2{font-size:18px;margin-top:20px}h3{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#8a7d6b;margin-top:18px}
    </style></head><body>${content}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }

  // ==================== RENDER ====================

  // HOME PAGE
  if (phase === "home") {
    return (
      <div className="pg-home">
        <div className="sea-bg">
          <svg className="sea-wave1" viewBox="0 0 1200 180" preserveAspectRatio="none">
            <path d="M0 80 Q50 40 100 80 Q150 120 200 80 Q250 40 300 80 Q350 120 400 80 Q450 40 500 80 Q550 120 600 80 Q650 40 700 80 Q750 120 800 80 Q850 40 900 80 Q950 120 1000 80 Q1050 40 1100 80 Q1150 120 1200 80 V180 H0 Z" fill="var(--ink)"/>
          </svg>
        </div>
        <div className="deco-ship a">🚢</div>
        <div className="deco-ship b">⛴</div>

        <div className="home-content">
          <div className="logo-area">
            <div className="logo-row">
              <LogoSVG size={48} />
              <div className="logo-name">
                Route<span>Guard</span>
              </div>
            </div>
            <div className="tagline">Know what's ahead, before you ship.</div>
          </div>

          <div className="input-card">
            <div className="input-ports">
              <div className="f-group">
                <label>Origin Port</label>
                <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Singapore" />
              </div>
              <div className="port-arrow">→</div>
              <div className="f-group">
                <label>Destination Port</label>
                <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Rotterdam" />
              </div>
            </div>
            <div className="input-row2">
              <div className="f-group">
                <label>Cargo Type</label>
                <select value={cargo} onChange={(e) => setCargo(e.target.value)}>
                  <option>Electronics</option>
                  <option>Textiles</option>
                  <option>Perishables</option>
                  <option>Chemicals</option>
                  <option>Machinery</option>
                  <option>Automotive</option>
                </select>
              </div>
              <div className="f-group">
                <label>Departure Date</label>
                <input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />
              </div>
            </div>
            <button className="go-btn" onClick={startScan}>
              Analyse Route
            </button>
          </div>

          <div className="chips">
            <div className="chip" onClick={() => fillExample("Singapore", "Rotterdam", "Electronics")}>Singapore → Rotterdam</div>
            <div className="chip" onClick={() => fillExample("Shanghai", "Hamburg", "Textiles")}>Shanghai → Hamburg</div>
            <div className="chip" onClick={() => fillExample("Ho Chi Minh", "Los Angeles", "Machinery")}>HCMC → Los Angeles</div>
          </div>
        </div>
      </div>
    );
  }

  // LOADING PAGE
  if (phase === "loading") {
    return (
      <div className="pg-loading">
        <div className="top-bar">
          <div className="logo-s">
            <LogoSVG size={22} />
            <div className="logo-s-text">Route<span>Guard</span></div>
          </div>
          <div className="prog-wrap">
            <div className="prog-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="prog-pct">{progress}%</div>
        </div>

        <div className="load-center">
          <div className="load-route">
            <em>{origin}</em> → <em>{destination}</em>
          </div>
          <div className="load-meta">{cargo} · {departureDate}</div>

          <div className="ship-area">
            <div className="ship-bob">🚢</div>
            <div className="wave-line">
              <svg viewBox="0 0 900 10" preserveAspectRatio="none">
                <path d="M0 5Q15 1 30 5Q45 9 60 5Q75 1 90 5Q105 9 120 5Q135 1 150 5Q165 9 180 5Q195 1 210 5Q225 9 240 5Q255 1 270 5Q285 9 300 5Q315 1 330 5Q345 9 360 5Q375 1 390 5Q405 9 420 5Q435 1 450 5Q465 9 480 5Q495 1 510 5Q525 9 540 5Q555 1 570 5Q585 9 600 5Q615 1 630 5Q645 9 660 5Q675 1 690 5Q705 9 720 5Q735 1 750 5Q765 9 780 5Q795 1 810 5Q825 9 840 5Q855 1 870 5Q885 9 900 5" stroke="#c8b89a" strokeWidth="1" fill="none" />
              </svg>
            </div>
          </div>
          <div className="load-status">{statusMsg}</div>

          {error && <div className="error-msg">{error}</div>}

          <div className="steps">
            <div className={`st ${currentStep === 1 ? "on" : currentStep > 1 ? "ok" : ""}`}>
              <div className="st-d" />Finding Sources
            </div>
            <div className={`st ${currentStep === 2 ? "on" : currentStep > 2 ? "ok" : ""}`}>
              <div className="st-d" />Scraping Sites
            </div>
            <div className={`st ${currentStep === 3 ? "on" : currentStep > 3 ? "ok" : ""}`}>
              <div className="st-d" />Analysing Risk
            </div>
          </div>

          {/* Browser windows */}
          {urls.length > 0 && (
            <div className="b-area on">
              <div className="b-label">Web Agents · Live</div>
              <div className="b-grid">
                {urls.map((u, i) => {
                  const done = agentResults.find((r) => r.index === i);
                  const step = agentProgress[i];
                  const liveUrl = done?.streaming_url || step?.streaming_url;
                  const cat = getCatMeta(u.category);
                  return (
                    <div key={i} className={`mb v ${done ? "d" : ""}`}>
                      <div className="mb-t">
                        <div className="mb-dt"><i /><i /><i /></div>
                        <div className="mb-u">{u.url.replace(/https?:\/\//, "").split("/")[0]}</div>
                        <div className="mb-cat" style={{ color: cat.color }}>{cat.icon} {cat.label}</div>
                        {liveUrl && !done && (
                          <a className="mb-live" href={liveUrl} target="_blank" rel="noreferrer" title="Watch live">▶ live</a>
                        )}
                      </div>
                      <div className="mb-b">
                        {!done ? (
                          // Still running — show current step or skeleton
                          step?.purpose ? (
                            <div className="mb-step active">⟳ {step.purpose}</div>
                          ) : step?.type === "started" ? (
                            <div className="mb-step active">⟳ Starting browser…</div>
                          ) : (
                            <>
                              <div className="mb-sk a" />
                              <div className="mb-sk b" />
                              <div className="mb-sk c" />
                            </>
                          )
                        ) : (
                          // Done — always show "done", preview only if we got data
                          <div className="mb-r">
                            {done.success && done.preview
                              ? `✓ ${done.preview.slice(0, 80)}…`
                              : "✓ Completed"}
                          </div>
                        )}
                      </div>
                      <div className={`mb-s ${done ? "f" : "r"}`}>
                        {done
                          ? "✓ done"
                          : step?.purpose
                            ? `● ${step.purpose.slice(0, 35)}…`
                            : "● connecting…"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // RESULTS PAGE
  if (phase === "results" && analysis) {
    const a = analysis;
    const riskColor = getRiskColor(a.risk_level);
    const maxScore = 20;
    const scorePct = Math.min((a.risk_score / maxScore) * 100, 100);
    const dashArray = `${scorePct} ${100 - scorePct}`;

    const tabs = [
      { id: "overview",    icon: "◈", label: "Overview"   },
      { id: "timeline",    icon: "◉", label: "Timeline"   },
      { id: "signals",     icon: "◎", label: "Signals"    },
      { id: "routes",      icon: "◐", label: "Routes"     },
      { id: "breakdown",   icon: "◑", label: "Breakdown"  },
    ];

    return (
      <div className="pg-results">
        {/* Sticky header */}
        <div className="top-bar sticky-top">
          <div className="logo-s">
            <LogoSVG size={22} />
            <div className="logo-s-text">Route<span>Guard</span></div>
          </div>
          <div style={{ flex: 1 }} />
          <div className="res-conf">{a.confidence}% confidence · <span style={{ color: riskColor, fontWeight: 700 }}>{a.risk_level}</span></div>
          <button className="new-btn" onClick={resetAll} style={{ marginLeft: 14 }}>↺ New Scan</button>
        </div>

        {/* Hero summary bar */}
        <div className={`res-hero ${visibleCards.includes("cRisk") ? "v" : ""}`}>
          <div className="hero-left">
            <div className="hero-route">{origin} <span className="hero-arrow">→</span> {destination}</div>
            <div className="hero-meta">{cargo} · Dep. {departureDate} · Est. arrival <strong>{a.estimated_arrival}</strong></div>
            <div className="hero-verdict">"{a.verdict}"</div>
          </div>
          <div className="hero-right">
            <div className="hero-ring-wrap">
              <svg className="hero-ring-svg" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border-light)" strokeWidth="8" />
                <circle cx="60" cy="60" r="52" fill="none" stroke={riskColor} strokeWidth="8"
                  strokeDasharray={`${scorePct * 3.267} ${326.7 - scorePct * 3.267}`}
                  strokeLinecap="round"
                  style={{ transform: "rotate(-90deg)", transformOrigin: "center", transition: "stroke-dasharray 1.2s ease" }}
                />
              </svg>
              <div className="hero-ring-inner">
                <div className="hero-score" style={{ color: riskColor }}>{a.risk_score}</div>
                <div className="hero-level" style={{ color: riskColor }}>{a.risk_level}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Key stats strip */}
        <div className={`stats-strip ${visibleCards.includes("cRisk") ? "v" : ""}`}>
          <div className="stat-pill">
            <div className="stat-val" style={{ color: a.expected_delay_days > 0 ? "var(--red)" : "var(--green)" }}>
              {a.expected_delay_days > 0 ? `+${a.expected_delay_days}d` : "On time"}
            </div>
            <div className="stat-lbl">Expected Delay</div>
          </div>
          <div className="stat-divider" />
          <div className="stat-pill">
            <div className="stat-val" style={{ color: a.freight_change_percent > 0 ? "var(--amber)" : "var(--green)" }}>
              {a.freight_change_percent > 0 ? "+" : ""}{a.freight_change_percent}%
            </div>
            <div className="stat-lbl">Freight Change</div>
          </div>
          <div className="stat-divider" />
          <div className="stat-pill">
            <div className="stat-val">{a.estimated_arrival}</div>
            <div className="stat-lbl">Revised Arrival</div>
          </div>
          <div className="stat-divider" />
          <div className="stat-pill">
            <div className="stat-val" style={{ color: "var(--green)" }}>{a.resolution_date}</div>
            <div className="stat-lbl">Resolution Est.</div>
          </div>
        </div>

        {/* Tab nav */}
        <div className="tab-nav">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`tab-btn ${activeTab === t.id ? "active" : ""}`}
              onClick={() => setActiveTab(t.id)}
            >
              <span className="tab-icon">{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Tab pages */}
        <div className="tab-content">

          {/* ── OVERVIEW ── */}
          {activeTab === "overview" && (
            <div className="tab-page">
              <div className="tp-title">Risk Overview</div>

              {/* Risk breakdown bars */}
              <div className="section-card">
                <div className="sc-head">Risk Factor Breakdown</div>
                {a.risk_breakdown && Object.entries(a.risk_breakdown).map(([key, val]) => {
                  const colors: Record<string,string> = {
                    port_disruption: "var(--red)", freight_surge: "var(--amber)",
                    weather: "#2563eb", geopolitical: "#7c3aed", other: "#8a7d6b"
                  };
                  const icons: Record<string,string> = {
                    port_disruption: "🏗", freight_surge: "📊",
                    weather: "⛈", geopolitical: "🛡", other: "◦"
                  };
                  const color = colors[key] || "var(--border)";
                  return (
                    <div key={key} className="rb-row">
                      <div className="rb-label">
                        <span className="rb-icon">{icons[key] || "◦"}</span>
                        {key.replace(/_/g, " ")}
                      </div>
                      <div className="rb-track">
                        <div className="rb-fill" style={{ width: `${val}%`, background: color }} />
                      </div>
                      <div className="rb-val" style={{ color }}>{val}%</div>
                    </div>
                  );
                })}
              </div>

              {/* Route comparison */}
              {a.alternatives && a.alternatives.length > 0 && (
                <div className="section-card">
                  <div className="sc-head">Route Comparison — Transit Days</div>
                  <div className="hb">
                    <div className="hbi">
                      <div className="hbl">Current</div>
                      <div className="hbt">
                        <div className="hbf" style={{ width: `${Math.min(((26 + a.expected_delay_days) / 60) * 100, 100)}%`, background: "var(--red)" }}>
                          <span className="hbv">{26 + a.expected_delay_days}d</span>
                        </div>
                      </div>
                    </div>
                    {a.alternatives.slice(0, 4).map((alt: any, i: number) => (
                      <div key={i} className="hbi">
                        <div className="hbl">{alt.name.split(" ").slice(0,2).join(" ")}</div>
                        <div className="hbt">
                          <div className="hbf" style={{ width: `${Math.min((alt.transit_days / 60) * 100, 100)}%`, background: alt.recommended ? "var(--green)" : "var(--amber)" }}>
                            <span className="hbv">{alt.transit_days}d</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TIMELINE ── */}
          {activeTab === "timeline" && (
            <div className="tab-page">
              <div className="tp-title">Shipment Timeline</div>
              <div className="section-card" style={{ overflowX: "auto" }}>
                <div className="sc-head">Voyage Events — {origin} to {destination}</div>
                <div className="tl-wrap">
                  {a.timeline_events?.map((evt: any, i: number) => {
                    const color = evt.type === "risk" ? "var(--red)"
                      : evt.type === "resolution" ? "var(--amber)"
                      : evt.type === "arrival" ? "var(--green)"
                      : evt.type === "waypoint" ? "#2563eb"
                      : "var(--ink)";
                    const icons: Record<string,string> = {
                      departure: "⚓", risk: "⚠", resolution: "↻",
                      arrival: "✓", waypoint: "◈"
                    };
                    return (
                      <div key={i} className={`tl-item ${i % 2 === 0 ? "tl-up" : "tl-dn"}`}>
                        <div className="tl-label-area">
                          <div className="tl-label">{evt.label}</div>
                          <div className="tl-date">{evt.date}</div>
                        </div>
                        <div className="tl-dot-area">
                          <div className="tl-line-seg" style={{ background: color }} />
                          <div className="tl-dot" style={{ background: color, borderColor: color }}>
                            <span className="tl-dot-icon">{icons[evt.type] || "◈"}</span>
                          </div>
                          <div className="tl-line-seg" style={{ background: color }} />
                        </div>
                        <div className="tl-type-label" style={{ color }}>{evt.type}</div>
                      </div>
                    );
                  })}
                </div>
                {/* Horizontal scrollable timeline alternative */}
                <div className="tl-horiz">
                  <div className="tl-h-line" />
                  {a.timeline_events?.map((evt: any, i: number) => {
                    const total = a.timeline_events.length;
                    const pos = (i / Math.max(total - 1, 1)) * 88 + 4;
                    const above = i % 2 === 0;
                    const color = evt.type === "risk" ? "var(--red)"
                      : evt.type === "resolution" ? "var(--amber)"
                      : evt.type === "arrival" ? "var(--green)"
                      : evt.type === "waypoint" ? "#2563eb"
                      : "var(--ink)";
                    return (
                      <div key={i} className={`tlp ${above ? "tlp-up" : "tlp-dn"}`} style={{ left: `${pos}%` }}>
                        {above && (
                          <>
                            <div className="tlp-l">{evt.label}</div>
                            <div className="tlp-v">{evt.date}</div>
                          </>
                        )}
                        <div className="tlp-connector" style={{ background: color }} />
                        <div className="tlp-d" style={{ background: color }} />
                        {!above && (
                          <>
                            <div className="tlp-connector" style={{ background: color }} />
                            <div className="tlp-v">{evt.date}</div>
                            <div className="tlp-l">{evt.label}</div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── SIGNALS ── */}
          {activeTab === "signals" && (
            <div className="tab-page">
              <div className="tp-title">Intelligence Signals</div>
              <div className="sig-grid">
                {a.signals?.map((sig: any, i: number) => {
                  const cat = getCatMeta(sig.category);
                  const rClass = sig.risk === "HIGH" ? "sig-high" : sig.risk === "MEDIUM" ? "sig-med" : "sig-low";
                  return (
                    <div key={i} className={`sig-card ${rClass}`}>
                      <div className="sig-card-top">
                        <div className="sig-card-cat" style={{ color: cat.color }}>
                          {cat.icon} {cat.label}
                        </div>
                        <div className={`sig-risk-badge ${rClass}`}>{sig.risk}</div>
                      </div>
                      <div className="sig-card-source">{sig.source}</div>
                      <div className="sig-card-finding">{sig.finding}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── ROUTES ── */}
          {activeTab === "routes" && (
            <div className="tab-page">
              <div className="tp-title">Alternative Routes</div>
              <div className="alt-grid">
                {a.alternatives?.map((alt: any, i: number) => (
                  <div key={i} className={`alt2-card ${alt.recommended ? "alt2-rec" : ""}`}>
                    {alt.recommended && <div className="alt2-rec-banner">★ Recommended</div>}
                    <div className="alt2-name">{alt.name}</div>
                    <div className="alt2-stats">
                      <div className="alt2-stat">
                        <div className="alt2-stat-v">{alt.transit_days}d</div>
                        <div className="alt2-stat-l">Transit</div>
                      </div>
                      <div className="alt2-stat">
                        <div className="alt2-stat-v" style={{ color: alt.cost_change?.startsWith("+") ? "var(--amber)" : "var(--green)" }}>
                          {alt.cost_change}
                        </div>
                        <div className="alt2-stat-l">Cost Δ</div>
                      </div>
                      <div className="alt2-stat">
                        <div className="alt2-stat-v" style={{ color: alt.risk_score > 10 ? "var(--red)" : alt.risk_score > 5 ? "var(--amber)" : "var(--green)" }}>
                          {alt.risk_score}
                        </div>
                        <div className="alt2-stat-l">Risk</div>
                      </div>
                    </div>
                    <div className="alt2-desc">{alt.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── BREAKDOWN ── */}
          {activeTab === "breakdown" && (
            <div className="tab-page">
              <div className="tp-title">Risk Breakdown</div>
              <div className="section-card">
                <div className="sc-head">Scoring Model — How This Score Was Calculated</div>
                <div className="score-model">
                  <div className="score-total-row">
                    <div className="score-total-label">Total Risk Score</div>
                    <div className="score-total-val" style={{ color: riskColor }}>{a.risk_score} / 20</div>
                    <div className="score-total-level" style={{ background: riskColor }}>{a.risk_level}</div>
                  </div>
                  <div className="score-scale">
                    {[
                      { range: "0–3", label: "Low", color: "var(--green)" },
                      { range: "4–7", label: "Medium", color: "var(--amber)" },
                      { range: "8–12", label: "High", color: "var(--red)" },
                      { range: "13+", label: "Critical", color: "#7c0a00" },
                    ].map(s => (
                      <div key={s.range} className="score-scale-item" style={{
                        borderTop: `3px solid ${s.color}`,
                        opacity: a.risk_level === s.label.toUpperCase() ? 1 : 0.35
                      }}>
                        <div className="score-scale-range" style={{ color: s.color }}>{s.range}</div>
                        <div className="score-scale-label">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="section-card">
                <div className="sc-head">Category Detail</div>
                {a.risk_breakdown && Object.entries(a.risk_breakdown).map(([key, val]) => {
                  const colors: Record<string,string> = {
                    port_disruption: "var(--red)", freight_surge: "var(--amber)",
                    weather: "#2563eb", geopolitical: "#7c3aed", other: "#8a7d6b"
                  };
                  const icons: Record<string,string> = {
                    port_disruption: "🏗", freight_surge: "📊",
                    weather: "⛈", geopolitical: "🛡", other: "◦"
                  };
                  const descs: Record<string,string> = {
                    port_disruption: "Congestion, berth availability, strike action",
                    freight_surge: "Spot rate movements, carrier surcharges",
                    weather: "Active storms, wave heights, seasonal conditions",
                    geopolitical: "Security threats, conflict zones, sanctions",
                    other: "Supply chain disruptions, miscellaneous factors"
                  };
                  return (
                    <div key={key} className="bd-row">
                      <div className="bd-icon">{icons[key] || "◦"}</div>
                      <div className="bd-body">
                        <div className="bd-name">{key.replace(/_/g, " ")}</div>
                        <div className="bd-desc">{descs[key] || ""}</div>
                      </div>
                      <div className="bd-bar-wrap">
                        <div className="bd-bar">
                          <div className="bd-fill" style={{ width: `${val}%`, background: colors[key] || "var(--border)" }} />
                        </div>
                        <div className="bd-pct" style={{ color: colors[key] || "var(--muted)" }}>{val}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="section-card" style={{ textAlign: "center", paddingBottom: 24 }}>
                <button className="rpt-btn" onClick={() => setShowPDF(true)} style={{ margin: "8px auto 0" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  Generate Full Report
                </button>
              </div>
            </div>
          )}

        </div>

        <div className="foot">© 2026 RouteGuard · Singapore</div>

        {/* PDF Modal */}
        {showPDF && (
          <div className="pdf-ov open" onClick={(e) => { if (e.target === e.currentTarget) setShowPDF(false); }}>
            <div className="pdf-mod">
              <div className="pdf-top">
                <div className="pdf-tt">Route Risk Report</div>
                <div className="pdf-acts">
                  <button className="pdf-dl" onClick={downloadPDF}>↓ Download PDF</button>
                  <button className="pdf-cl" onClick={() => setShowPDF(false)}>Close</button>
                </div>
              </div>
              <div className="pdf-body">
                <div className="pdf-pg" id="pdfContent">
                  <h2 style={{ fontFamily: "var(--serif)", fontSize: 20, marginBottom: 4 }}>RouteGuard — Route Risk Assessment</h2>
                  <div style={{ height: 2, background: "var(--accent)", margin: "10px 0 18px", borderRadius: 1 }} />
                  <h2>{origin} → {destination}</h2>
                  <p style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)" }}>
                    Generated {new Date().toLocaleDateString("en-GB")} · {cargo} · Departing {departureDate}
                  </p>
                  <h3>Risk Score</h3>
                  <div style={{ display: "flex", gap: 18, padding: 14, background: "var(--red-light)", borderRadius: 6, borderLeft: "4px solid var(--red)", marginTop: 6 }}>
                    <div>
                      <div style={{ fontFamily: "var(--serif)", fontSize: 34, fontWeight: 700, color: riskColor }}>{a.risk_score}</div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: riskColor, textTransform: "uppercase" as const }}>{a.risk_level}</div>
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.5 }}>{a.verdict}</div>
                  </div>
                  <h3>Route Details</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 12 }}>
                    <tbody>
                      {[["Origin", origin], ["Destination", destination], ["Cargo", cargo], ["Departure", departureDate],
                        ["Expected Delay", `+${a.expected_delay_days} days`], ["Estimated Arrival", a.estimated_arrival]].map(([l,v]) => (
                        <tr key={l}><td style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-light)" }}>{l}</td>
                        <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-light)", fontWeight: 500 }}>{v}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <h3>Intelligence Signals</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 12 }}>
                    <thead><tr>{["Source","Risk","Finding"].map(h => (
                      <th key={h} style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", textAlign: "left" as const, fontSize: 9, textTransform: "uppercase" as const, color: "var(--muted)" }}>{h}</th>
                    ))}</tr></thead>
                    <tbody>{a.signals?.map((s: any, i: number) => (
                      <tr key={i}><td style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-light)" }}>{s.source}</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-light)", color: s.risk === "HIGH" ? "var(--red)" : s.risk === "MEDIUM" ? "var(--amber)" : "var(--green)" }}>{s.risk}</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-light)" }}>{s.finding}</td></tr>
                    ))}</tbody>
                  </table>
                  <h3>Alternative Routes</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 12 }}>
                    <thead><tr>{["Route","Transit","Cost Δ","Risk"].map(h => (
                      <th key={h} style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", textAlign: "left" as const, fontSize: 9, textTransform: "uppercase" as const, color: "var(--muted)" }}>{h}</th>
                    ))}</tr></thead>
                    <tbody>{a.alternatives?.map((alt: any, i: number) => (
                      <tr key={i}><td style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-light)", fontWeight: alt.recommended ? 600 : 400 }}>{alt.name}</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-light)" }}>{alt.transit_days}d</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-light)" }}>{alt.cost_change}</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-light)" }}>{alt.risk_score}</td></tr>
                    ))}</tbody>
                  </table>
                  <div style={{ marginTop: 28, paddingTop: 10, borderTop: "1px solid var(--border)", fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
                    <span>RouteGuard · Confidential</span>
                    <span>Generated {new Date().toLocaleDateString("en-GB")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}