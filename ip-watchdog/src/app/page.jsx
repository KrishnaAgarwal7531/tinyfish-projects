"use client";

import { useState, useRef, useCallback } from "react";

const REGISTRIES = [
  { id: "uspto",   name: "USPTO",    region: "United States",          flag: "🇺🇸", color: "#3B82F6", oppositionUrl: "https://www.uspto.gov/trademarks/maintain/opposition" },
  { id: "euipo",   name: "EUIPO",    region: "European Union",         flag: "🇪🇺", color: "#8B5CF6", oppositionUrl: "https://euipo.europa.eu/ohimportal/en/opposition" },
  { id: "ukipo",   name: "UKIPO",    region: "United Kingdom",         flag: "🇬🇧", color: "#EC4899", oppositionUrl: "https://www.gov.uk/government/publications/notice-of-opposition-and-statement-of-grounds" },
  { id: "wipo",    name: "WIPO",     region: "International (Madrid)", flag: "🌐", color: "#22C55E", oppositionUrl: "https://www.wipo.int/madrid/en/" },
  { id: "cipo",    name: "CIPO",     region: "Canada",                 flag: "🇨🇦", color: "#EF4444", oppositionUrl: "https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks/opposition" },
  { id: "ipindia", name: "IP India", region: "India",                  flag: "🇮🇳", color: "#F97316", oppositionUrl: "https://ipindiaonline.gov.in/tmrpublicsearch" },
  { id: "tmview",  name: "TMview",   region: "70+ Countries",          flag: "🗺️", color: "#06B6D4", oppositionUrl: "https://www.tmdn.org/tmview" },
];

const SEV = {
  critical: { bg: "#DC262618", border: "#DC262640", text: "#DC2626" },
  warning:  { bg: "#D9770618", border: "#D9770640", text: "#D97706" },
  info:     { bg: "#2563EB18", border: "#2563EB40", text: "#2563EB" },
};

function threatFingerprint(t) {
  const mark = (t.conflicting_mark || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const reg  = (t.registry || "").toLowerCase().replace(/\s/g, "");
  return `${mark}||${reg}`;
}

function mergeThreats(existing, incoming) {
  const map = new Map();
  [...existing, ...incoming].forEach(t => {
    const key = threatFingerprint(t);
    const prev = map.get(key);
    if (!prev || t.similarity > prev.similarity) map.set(key, t);
  });
  return Array.from(map.values()).sort((a, b) => {
    const s = { critical: 0, warning: 1, info: 2 };
    return (s[a.severity] - s[b.severity]) || (b.similarity - a.similarity);
  });
}

function buildOppositionLetter(brandName, userName, threat) {
  const reg   = REGISTRIES.find(r => r.name === threat.registry);
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return `${today}

TO: Trademark Office / Opposition Division
    ${threat.registry}${reg ? ` — ${reg.region}` : ""}

RE: NOTICE OF OPPOSITION
    Conflicting Mark : "${threat.conflicting_mark}"
    Filed by         : ${threat.applicant || "Unknown Applicant"}
    Filing Date      : ${threat.filed || "Unknown"}
    Nice Classes     : ${(threat.classes || []).join(", ") || "Unknown"}
    Mark Status      : ${threat.status || "Unknown"}
    Similarity Score : ${threat.similarity}%

═══════════════════════════════════════════════════
OPPOSER DETAILS  (complete before filing)
═══════════════════════════════════════════════════

Full Legal Name / Company    : ${userName}
Brand / Mark Being Protected : ${brandName}
Attorney Name & Bar No.      : [YOUR ATTORNEY NAME & BAR NUMBER]
Mailing Address              : [YOUR FULL ADDRESS]
Email                        : [YOUR EMAIL ADDRESS]
Phone                        : [YOUR PHONE NUMBER]

═══════════════════════════════════════════════════
GROUNDS FOR OPPOSITION
═══════════════════════════════════════════════════

The undersigned, ${userName}, owner and prior user of the mark "${brandName}"
(the "Opposer's Mark"), hereby opposes registration of the above-referenced
mark on the following grounds:

1. LIKELIHOOD OF CONFUSION

   The applied-for mark "${threat.conflicting_mark}" is ${threat.similarity >= 95 ? "identical or virtually identical" : threat.similarity >= 80 ? "confusingly similar" : "substantially similar"} to
   Opposer's mark "${brandName}" in appearance, sound, connotation, and
   overall commercial impression. A similarity score of ${threat.similarity}% was
   established through comparative analysis across trademark databases.

   Consumers are likely to be confused, mistaken, or deceived as to the
   source, affiliation, or sponsorship of goods/services offered under
   "${threat.conflicting_mark}".

2. PRIORITY OF USE

   Opposer has continuous prior rights in "${brandName}" and has used this
   mark in commerce before the applicant's filing date of ${threat.filed || "[unknown]"}.

3. DAMAGE TO OPPOSER

   Registration of "${threat.conflicting_mark}" would:
   a) Dilute the distinctive character of Opposer's mark "${brandName}";
   b) Damage Opposer's goodwill and customer relationships;
   c) Create marketplace confusion diverting trade from Opposer;
   d) Prevent Opposer from controlling quality associations with the mark.
${(threat.classes || []).length > 0 ? `
4. CLASS OVERLAP

   Applicant's mark covers Nice Class(es): ${(threat.classes || []).join(", ")}.
   These overlap with goods/services under Opposer's mark "${brandName}",
   compounding likelihood of consumer confusion.
` : ""}
═══════════════════════════════════════════════════
RELIEF REQUESTED
═══════════════════════════════════════════════════

WHEREFORE, Opposer respectfully requests that:

   1. The application to register "${threat.conflicting_mark}" be refused;
   2. No registration be issued to the applicant;
   3. Such other relief be granted as this Office deems just and proper.

Respectfully submitted,

_________________________________
${userName}
Date: ${today}

──────────────────────────────────────────────────
⚡ FILE THIS OPPOSITION AT:
   ${reg?.oppositionUrl || "Contact your IP attorney"}
──────────────────────────────────────────────────
Generated by IP Watchdog`;
}

function buildPdfHtml(brandName, userName, threats, summary, scanTime, watchlist, variants) {
  const today    = new Date(scanTime || Date.now()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const sevColor = { critical: "#DC2626", warning: "#D97706", info: "#2563EB" };
  const sevBg    = { critical: "#FEF2F2", warning: "#FFFBEB", info: "#EFF6FF" };
  const criticals = threats.filter(t => t.severity === "critical");
  const warnings  = threats.filter(t => t.severity === "warning");
  const infos     = threats.filter(t => t.severity === "info");

  const threatBlock = (t, i) => `
    <div style="border-left:4px solid ${sevColor[t.severity]||"#64748B"};margin-bottom:20px;padding:14px 18px;background:${sevBg[t.severity]||"#F8FAFC"};border-radius:0 8px 8px 0;page-break-inside:avoid;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div>
          <span style="font-size:16px;font-weight:800;color:#0F172A;">${i + 1}. ${t.conflicting_mark}</span>
          <span style="margin-left:10px;font-size:10px;font-weight:700;color:${sevColor[t.severity]};background:white;border:1px solid ${sevColor[t.severity]};padding:2px 8px;border-radius:4px;text-transform:uppercase;">${t.severity}</span>
          ${watchlist.includes(t.id || t.conflicting_mark) ? '<span style="margin-left:6px;font-size:10px;color:#16A34A;background:#DCFCE7;padding:2px 8px;border-radius:4px;">📌 WATCHLISTED</span>' : ""}
        </div>
        <div style="font-size:22px;font-weight:900;color:${sevColor[t.severity]};font-family:monospace;">${t.similarity}%</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;">
        ${[["Registry",`${t.registry_flag||""} ${t.registry}`],["Applicant",t.applicant||"—"],["Filed",t.filed||"—"],["Status",t.status||"—"],["Classes",(t.classes||[]).join(", ")||"—"],["Deadline",t.deadline?`${t.deadline}${t.days_left!=null?` (${t.days_left} days)`:""}`:t.days_left!=null?`${t.days_left} days`:"—"]].map(([l,v])=>`<div><div style="font-size:9px;color:#64748B;text-transform:uppercase;letter-spacing:.8px;margin-bottom:2px;">${l}</div><div style="font-size:12px;font-weight:600;color:#1E293B;">${v}</div></div>`).join("")}
      </div>
      <p style="font-size:12px;color:#374151;line-height:1.7;margin:0;">${t.description||"No analysis available."}</p>
      ${t.severity==="critical"?`<div style="margin-top:10px;padding:8px 12px;background:#FEE2E2;border-radius:6px;font-size:11px;color:#DC2626;font-weight:700;">⚡ ACTION REQUIRED — File opposition at ${t.registry} before deadline.</div>`:""}
    </div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>IP Watchdog Report — ${brandName}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Segoe UI',Arial,sans-serif;color:#1E293B;background:white;padding:40px;font-size:13px;}@media print{body{padding:20px;}.no-print{display:none;}}h2{font-size:13px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;margin:28px 0 12px;padding-bottom:6px;border-bottom:2px solid #E2E8F0;}.stat{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:14px;text-align:center;}.stat-n{font-size:28px;font-weight:900;font-family:monospace;}.stat-l{font-size:9px;color:#64748B;text-transform:uppercase;letter-spacing:1px;margin-top:4px;}</style>
  </head><body>
  <button class="no-print" onclick="window.print()" style="position:fixed;bottom:24px;right:24px;padding:12px 24px;background:linear-gradient(135deg,#F59E0B,#D97706);color:#0B1120;font-size:13px;font-weight:800;border:none;border-radius:10px;cursor:pointer;font-family:monospace;box-shadow:0 4px 20px rgba(245,158,11,.4);">🖨 Print / Save as PDF</button>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #F59E0B;">
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="width:48px;height:48px;background:linear-gradient(135deg,#F59E0B,#D97706);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;">🛡</div>
      <div><div style="font-size:26px;font-weight:900;color:#0F172A;">IP Watchdog</div><div style="font-size:12px;color:#64748B;">Trademark Threat Intelligence Report</div></div>
    </div>
    <div style="text-align:right;"><div style="font-size:11px;color:#64748B;">Prepared for</div><div style="font-size:15px;font-weight:700;">${userName}</div><div style="font-size:11px;color:#64748B;margin-top:4px;">${today}</div></div>
  </div>
  <div style="margin-bottom:24px;"><div style="font-size:11px;color:#64748B;margin-bottom:4px;">BRAND MONITORED</div><div style="font-size:24px;font-weight:900;color:#0F172A;">${brandName}</div></div>
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px;">
    <div class="stat"><div class="stat-n" style="color:#F59E0B;">${threats.length}</div><div class="stat-l">Total</div></div>
    <div class="stat"><div class="stat-n" style="color:#DC2626;">${criticals.length}</div><div class="stat-l">Critical</div></div>
    <div class="stat"><div class="stat-n" style="color:#D97706;">${warnings.length}</div><div class="stat-l">Warnings</div></div>
    <div class="stat"><div class="stat-n" style="color:#2563EB;">${infos.length}</div><div class="stat-l">Info</div></div>
    <div class="stat"><div class="stat-n" style="color:#16A34A;">${watchlist.length}</div><div class="stat-l">Watched</div></div>
  </div>
  ${variants&&variants.length>0?`<h2>Name Variants Searched</h2><div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;"><span style="font-size:10px;background:#FEF3C7;border:1px solid #F59E0B;color:#92400E;padding:3px 10px;border-radius:20px;font-family:monospace;font-weight:700;">${brandName}</span>${variants.map(v=>`<span style="font-size:10px;background:#F1F5F9;border:1px solid #CBD5E1;padding:3px 10px;border-radius:20px;color:#475569;font-family:monospace;">${v}</span>`).join("")}</div>`:""}
  ${summary?`<h2>AI Analysis Summary</h2><div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:16px;margin-bottom:24px;font-size:13px;line-height:1.8;color:#374151;">${summary}</div>`:""}
  <h2>All Threats (${threats.length})</h2>
  ${threats.map((t,i)=>threatBlock(t,i)).join("")}
  ${watchlist.length>0?`<h2>📌 Watchlist</h2><div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:16px;">${watchlist.map(id=>{const t=threats.find(th=>(th.id||th.conflicting_mark)===id);return t?`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #D1FAE5;font-size:12px;"><span>📌 ${t.conflicting_mark} <span style="color:#64748B;">(${t.registry})</span></span><span style="font-weight:700;color:${sevColor[t.severity]||"#64748B"};">${t.similarity}%</span></div>`:"";}).join("")}</div>`:""}
  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #E2E8F0;font-size:10px;color:#94A3B8;display:flex;justify-content:space-between;"><span>Generated by IP Watchdog · ${today}</span><span>Confidential — For legal use only</span></div>
  </body></html>`;
}

function Ring({ score }) {
  const r = 18, circ = 2 * Math.PI * r, offset = circ - (score / 100) * circ;
  const color = score >= 80 ? "#DC2626" : score >= 60 ? "#D97706" : "#2563EB";
  return (
    <svg width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r={r} fill="none" stroke="#1E293B" strokeWidth="4" />
      <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset} transform="rotate(-90 24 24)"
        style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      <text x="24" y="27" textAnchor="middle" fill={color} fontSize="11" fontWeight="800" fontFamily="monospace">{score}</text>
    </svg>
  );
}

function AgentCard({ agent }) {
  return (
    <div style={{ background: "#111827", border: "1px solid #1E293B", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{agent.icon || "🔍"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#F8FAFC", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{agent.name}</div>
        <div style={{ fontSize: 9, color: "#64748B", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{agent.message}</div>
      </div>
      {agent.status === "running" && <svg width="16" height="16" viewBox="0 0 20 20" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}><circle cx="10" cy="10" r="8" fill="none" stroke="#1E293B" strokeWidth="2.5" /><path d="M 10 2 A 8 8 0 0 1 18 10" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" /></svg>}
      {agent.status === "done"    && <span style={{ color: "#22C55E", fontSize: 14, flexShrink: 0 }}>✓</span>}
      {agent.status === "error"   && <span style={{ color: "#EF4444", fontSize: 14, flexShrink: 0 }}>✗</span>}
      {agent.status === "waiting" && <span style={{ color: "#475569", fontSize: 12, flexShrink: 0 }}>···</span>}
    </div>
  );
}

function OppositionModal({ threat, brandName, userName, onClose }) {
  const letter = buildOppositionLetter(brandName, userName, threat);
  const reg    = REGISTRIES.find(r => r.name === threat.registry);
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard.writeText(letter).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  const download = () => {
    const blob = new Blob([letter], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `Opposition_${threat.conflicting_mark.replace(/\s+/g, "_")}.txt`; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#111827", border: "1px solid #1E293B", borderRadius: 16, width: "100%", maxWidth: 720, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #1E293B", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#F8FAFC" }}>⚡ Opposition Filing Letter</div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Against <span style={{ color: "#DC2626", fontWeight: 700 }}>{threat.conflicting_mark}</span> · {threat.registry_flag} {threat.registry} · {threat.similarity}% match</div>
          </div>
          <button onClick={onClose} style={{ background: "#1E293B", border: "none", borderRadius: 8, color: "#94A3B8", fontSize: 18, cursor: "pointer", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "20px 22px" }}>
          <pre style={{ fontFamily: "monospace", fontSize: 11, color: "#CBD5E1", lineHeight: 1.8, whiteSpace: "pre-wrap", margin: 0 }}>{letter}</pre>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid #1E293B", display: "flex", gap: 8 }}>
          <button onClick={copy} style={{ flex: 1, padding: 10, background: copied ? "#22C55E18" : "#1E293B", border: `1px solid ${copied ? "#22C55E40" : "#334155"}`, borderRadius: 8, color: copied ? "#22C55E" : "#94A3B8", fontSize: 11, fontWeight: 700, fontFamily: "monospace", cursor: "pointer" }}>{copied ? "✓ Copied!" : "📋 Copy"}</button>
          <button onClick={download} style={{ flex: 1, padding: 10, background: "#1E293B", border: "1px solid #334155", borderRadius: 8, color: "#94A3B8", fontSize: 11, fontWeight: 700, fontFamily: "monospace", cursor: "pointer" }}>↓ Download .txt</button>
          <button onClick={() => window.open(reg?.oppositionUrl || "https://www.wipo.int/madrid/en/", "_blank")} style={{ flex: 1, padding: 10, background: "#DC262618", border: "1px solid #DC262640", borderRadius: 8, color: "#DC2626", fontSize: 11, fontWeight: 800, fontFamily: "monospace", cursor: "pointer" }}>⚡ File at {threat.registry} →</button>
        </div>
      </div>
    </div>
  );
}

function WatchlistDrawer({ watchlist, allThreats, onRemove, onOppose }) {
  const [open, setOpen] = useState(false);
  const items = watchlist.map(id => allThreats.find(t => (t.id || t.conflicting_mark) === id)).filter(Boolean);
  return (
    <>
      <button onClick={() => setOpen(o => !o)} style={{ position: "fixed", bottom: 80, left: 0, zIndex: 1500, background: "#111827", border: "1px solid #22C55E40", borderLeft: "none", borderRadius: "0 10px 10px 0", padding: "12px 10px 12px 8px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, boxShadow: "2px 0 16px rgba(0,0,0,0.4)" }}>
        <span style={{ fontSize: 14 }}>📌</span>
        {watchlist.length > 0 && <span style={{ background: "#22C55E", color: "#0B1120", fontSize: 9, fontWeight: 800, fontFamily: "monospace", width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>{watchlist.length}</span>}
      </button>
      {open && (
        <div style={{ position: "fixed", bottom: 0, left: 0, top: 0, width: 290, background: "#0D1525", borderRight: "1px solid #1E293B", zIndex: 1400, display: "flex", flexDirection: "column", boxShadow: "4px 0 32px rgba(0,0,0,0.6)" }}>
          <div style={{ padding: "18px 16px", borderBottom: "1px solid #1E293B", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#F8FAFC" }}>📌 Watchlist</div>
              <div style={{ fontSize: 10, color: "#64748B", marginTop: 2, fontFamily: "monospace" }}>{watchlist.length} mark{watchlist.length !== 1 ? "s" : ""} tracked</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "#1E293B", border: "none", borderRadius: 6, color: "#64748B", cursor: "pointer", fontSize: 16, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "12px 14px" }}>
            {items.length === 0
              ? <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}><div style={{ fontSize: 28, marginBottom: 10 }}>📭</div><div style={{ fontSize: 11, fontFamily: "monospace" }}>Nothing watchlisted yet</div></div>
              : items.map((t, i) => {
                  const s = SEV[t.severity] || SEV.info;
                  return (
                    <div key={i} style={{ background: "#111827", border: `1px solid ${s.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <div><div style={{ fontSize: 12, fontWeight: 800, color: "#F8FAFC" }}>{t.conflicting_mark}</div><div style={{ fontSize: 9, color: "#64748B", marginTop: 2 }}>{t.registry_flag} {t.registry}</div></div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: s.text, fontFamily: "monospace" }}>{t.similarity}%</div>
                      </div>
                      <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                        <span style={{ fontSize: 9, color: s.text, background: s.bg, border: `1px solid ${s.border}`, padding: "2px 7px", borderRadius: 4, fontFamily: "monospace", textTransform: "uppercase", fontWeight: 700 }}>{t.severity}</span>
                        {t.days_left != null && <span style={{ fontSize: 9, color: "#D97706", fontFamily: "monospace" }}>⏰ {t.days_left}d left</span>}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {t.severity === "critical" && <button onClick={() => onOppose(t)} style={{ flex: 1, padding: "6px 0", background: "#DC262618", border: "1px solid #DC262640", borderRadius: 6, color: "#DC2626", fontSize: 9, fontWeight: 800, fontFamily: "monospace", cursor: "pointer" }}>⚡ FILE</button>}
                        <button onClick={() => onRemove(t)} style={{ flex: 1, padding: "6px 0", background: "#1E293B", border: "1px solid #334155", borderRadius: 6, color: "#64748B", fontSize: 9, fontFamily: "monospace", cursor: "pointer" }}>Remove</button>
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      )}
    </>
  );
}

function ThreatCard({ t, expanded, onToggle, isWatched, onWatch, onOppose, onReport }) {
  const s = SEV[t.severity] || SEV.info;
  return (
    <div style={{ background: "#111827", border: `1px solid ${expanded ? s.text : "#1E293B"}`, borderRadius: 14, overflow: "hidden", transition: "border-color 0.2s" }}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: "pointer" }}>
        <Ring score={t.similarity} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#F8FAFC" }}>{t.conflicting_mark}</span>
            <span style={{ fontSize: 9, fontFamily: "monospace", color: s.text, background: s.bg, border: `1px solid ${s.border}`, padding: "2px 8px", borderRadius: 5, textTransform: "uppercase", fontWeight: 700 }}>{t.severity}</span>
            <span style={{ fontSize: 9, fontFamily: "monospace", color: "#94A3B8", background: "#1E293B", padding: "2px 8px", borderRadius: 5 }}>{t.registry_flag || "🌐"} {t.registry}</span>
            {isWatched && <span style={{ fontSize: 9, fontFamily: "monospace", color: "#22C55E", background: "#22C55E18", border: "1px solid #22C55E40", padding: "2px 8px", borderRadius: 5, fontWeight: 700 }}>📌 WATCHED</span>}
          </div>
          <div style={{ fontSize: 11, color: "#64748B" }}>{t.applicant} · Filed {t.filed || "Unknown"}</div>
        </div>
        {t.days_left != null && (
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: t.days_left <= 30 ? "#DC2626" : "#D97706", fontFamily: "monospace" }}>{t.days_left}</div>
            <div style={{ fontSize: 8, color: "#64748B", fontFamily: "monospace", letterSpacing: 1.2 }}>DAYS LEFT</div>
          </div>
        )}
        <span style={{ color: "#475569", fontSize: 16, transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "", display: "inline-block", flexShrink: 0 }}>▾</span>
      </div>
      {expanded && (
        <div style={{ borderTop: "1px solid #1E293B", padding: "16px 18px", background: "#0D1525" }}>
          <p style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.7, marginBottom: 14 }}>{t.description}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            {[["Classes",(t.classes||[]).join(", ")||"—"],["Status",t.status||"—"],["Deadline",t.deadline||"—"],["Similarity",`${t.similarity}%`],["Registry",`${t.registry_flag||""} ${t.registry}`],["Filed",t.filed||"—"]].map(([l,v],i) => (
              <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid #1E293B" }}>
                <div style={{ fontSize: 9, color: "#475569", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{l}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#F8FAFC" }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={e => { e.stopPropagation(); onReport(t); }} style={{ flex: 1, padding: 10, background: "#1E293B", border: "1px solid #334155", borderRadius: 8, color: "#94A3B8", fontSize: 11, fontWeight: 700, fontFamily: "monospace", cursor: "pointer" }}>📄 Report</button>
            {t.severity === "critical" && <button onClick={e => { e.stopPropagation(); onOppose(t); }} style={{ flex: 1, padding: 10, background: "#DC262618", border: "1px solid #DC262640", borderRadius: 8, color: "#DC2626", fontSize: 11, fontWeight: 800, fontFamily: "monospace", cursor: "pointer" }}>⚡ File Opposition →</button>}
            <button onClick={e => { e.stopPropagation(); onWatch(t); }} style={{ flex: 1, padding: "10px 16px", background: isWatched ? "#22C55E18" : s.bg, border: `1px solid ${isWatched ? "#22C55E40" : s.border}`, borderRadius: 8, color: isWatched ? "#22C55E" : s.text, fontSize: 11, fontWeight: 800, fontFamily: "monospace", cursor: "pointer" }}>{isWatched ? "✓ Watching" : "📌 Watch"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function IPWatchdog() {
  const [view, setView]           = useState("login");
  const [userName, setUserName]   = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [brandName, setBrandName] = useState("");

  const [step, setStep]     = useState("idle");
  const [stepMsg, setStepMsg] = useState("");
  const [agents, setAgents] = useState([]);
  const [threats, setThreats] = useState([]);
  const threatsRef = useRef([]);

  const [scanStats, setScanStats]   = useState(null);
  const [summary, setSummary]       = useState("");
  const [variants, setVariants]     = useState([]);
  const [expandedThreat, setExpandedThreat] = useState(null);
  const [scanTime, setScanTime]     = useState(null);
  const [watchlist, setWatchlist]   = useState([]);
  const [toast, setToast]           = useState(null);
  const [oppositionThreat, setOppositionThreat] = useState(null);
  const [reportThreat, setReportThreat]         = useState(null);

  const [loginName, setLoginName]   = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginBrand, setLoginBrand] = useState("");
  const [searchScope, setSearchScope]         = useState("global");
  const [selectedRegistries, setSelectedRegistries] = useState(REGISTRIES.map(r => r.id));
  const [scanScope, setScanScope] = useState({ scope: "global", registries: REGISTRIES.map(r => r.id) });
  const scrapedRef = useRef([]);

  const showToast = useCallback((msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const addThreats = useCallback((incoming) => {
    setThreats(prev => {
      const merged = mergeThreats(prev, incoming);
      threatsRef.current = merged;
      return merged;
    });
  }, []);

  const toggleWatch = useCallback((threat) => {
    const id = threat.id || threat.conflicting_mark;
    setWatchlist(prev => {
      if (prev.includes(id)) { showToast(`Removed "${threat.conflicting_mark}" from watchlist`, "info"); return prev.filter(x => x !== id); }
      showToast(`Added "${threat.conflicting_mark}" to watchlist`, "success");
      return [...prev, id];
    });
  }, [showToast]);

  const openFullReport = useCallback(() => {
    const html = buildPdfHtml(brandName, userName, threatsRef.current, summary, scanTime, watchlist, variants);
    const win  = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  }, [brandName, userName, summary, scanTime, watchlist, variants]);

  const openThreatReport = useCallback((threat) => {
    const html = buildPdfHtml(brandName, userName, [threat], threat.description || "", new Date().toISOString(), watchlist, variants);
    const win  = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  }, [brandName, userName, watchlist, variants]);

  const runScan = useCallback(async (brand, scope) => {
    setStep("discovering");
    setStepMsg("Generating brand variants & identifying registries...");
    setAgents([]);
    setThreats([]);
    threatsRef.current = [];
    setScanStats(null);
    setSummary("");
    setVariants([]);
    setExpandedThreat(null);
    scrapedRef.current = [];

    try {
      const discoverRes  = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: brand, registry_ids: scope?.registries || null }),
      });
      const discoverData = await discoverRes.json();
      if (discoverData.error) throw new Error(discoverData.error);

      const sources = discoverData.sources || [];
      if (sources.length === 0) throw new Error("No sources discovered");
      if (discoverData.variations) setVariants(discoverData.variations);

      setStep("scraping");
      setStepMsg(`Searching ${sources.length} registries for "${brand}" + ${discoverData.variations?.length || 0} phonetic variants...`);
      setAgents(sources.map(s => ({ name: s.name, icon: s.icon, id: s.id, status: "waiting", message: "Queued..." })));

      const scrapeRes = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources }),
      });

      const reader  = scrapeRes.body?.getReader();
      if (!reader) throw new Error("No response body from scrape");
      const decoder = new TextDecoder();
      let   buffer  = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.index !== undefined && ev.name) {
              if (ev.purpose !== undefined) {
                setAgents(p => { const n = [...p]; if (n[ev.index]) n[ev.index] = { ...n[ev.index], status: "running", message: ev.purpose }; return n; });
              } else if (ev.url !== undefined && ev.hasData === undefined && ev.error === undefined) {
                setAgents(p => { const n = [...p]; if (n[ev.index]) n[ev.index] = { ...n[ev.index], status: "running", message: "Navigating..." }; return n; });
              } else if (ev.hasData !== undefined) {
                setAgents(p => { const n = [...p]; if (n[ev.index]) n[ev.index] = { ...n[ev.index], status: ev.error ? "error" : "done", message: ev.hasData ? "Data extracted ✓" : "No results found" }; return n; });
                if (ev.hasData && ev.result) {
                  const agentName = ev.name, agentResult = ev.result;
                  fetch("/api/analyze", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ brand_name: brand, scraped_results: [{ source_name: agentName, result: agentResult }] }),
                  }).then(r => r.json()).then(d => { if (d.analysis?.threats?.length > 0) addThreats(d.analysis.threats); }).catch(() => {});
                }
              } else if (ev.error !== undefined) {
                setAgents(p => { const n = [...p]; if (n[ev.index]) n[ev.index] = { ...n[ev.index], status: "error", message: "Failed" }; return n; });
              }
            }
            if (ev.results) scrapedRef.current = ev.results;
          } catch { /* skip malformed */ }
        }
      }

      setStep("analyzing");
      setStepMsg("Running final cross-registry conflict analysis...");

      const analyzeRes  = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: brand, scraped_results: scrapedRef.current }),
      });
      const analyzeData = await analyzeRes.json();
      if (analyzeData.error) throw new Error(analyzeData.error);

      addThreats(analyzeData.analysis?.threats || []);
      setScanStats(analyzeData.analysis?.scan_stats || null);
      setSummary(analyzeData.analysis?.summary || "");
      setScanTime(new Date().toISOString());
      setStep("done");
      setStepMsg("");

    } catch (e) {
      setStep("error");
      setStepMsg(`Error: ${e.message}`);
    }
  }, [addThreats]);

  const handleLogin = (name, email, brand) => {
    setUserName(name); setUserEmail(email); setBrandName(brand);
    const scope = { scope: searchScope, registries: searchScope === "global" ? REGISTRIES.map(r => r.id) : selectedRegistries };
    setScanScope(scope);
    setView("dashboard");
    runScan(brand, scope);
  };

  const isScanning = step === "discovering" || step === "scraping" || step === "analyzing";
  const critCount  = threats.filter(t => t.severity === "critical").length;
  const warnCount  = threats.filter(t => t.severity === "warning").length;

  // ═══ LOGIN ═══
  if (view === "login") {
    const ok = loginName.trim() && loginBrand.trim() && (searchScope === "global" || selectedRegistries.length > 0);
    const toggleReg = id => setSelectedRegistries(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
    return (
      <div style={{ minHeight: "100vh", background: "#0B1120", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif", padding: "24px 16px" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}@keyframes toastIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <div style={{ width: 480, maxWidth: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#F59E0B,#D97706)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🛡</div>
              <span style={{ fontSize: 28, fontWeight: 800, color: "#F8FAFC", letterSpacing: -0.5 }}>IP Watchdog</span>
            </div>
            <p style={{ fontSize: 13, color: "#64748B" }}>AI-powered trademark monitoring · 7 global registries · phonetic variant search</p>
          </div>
          <div style={{ background: "#111827", border: "1px solid #1E293B", borderRadius: 16, padding: 32 }}>
            {[
              { label: "Your Name", val: loginName, set: setLoginName, ph: "Arjun Mehta" },
              { label: "Email", val: loginEmail, set: setLoginEmail, ph: "arjun@company.io" },
              { label: "Brand / Company to Monitor", val: loginBrand, set: setLoginBrand, ph: "MamaEarth" },
            ].map((f, i) => (
              <div key={i} style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 1.2, textTransform: "uppercase", fontFamily: "monospace", marginBottom: 6 }}>{f.label}</label>
                <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                  onKeyDown={e => e.key === "Enter" && ok && handleLogin(loginName, loginEmail, loginBrand)}
                  style={{ width: "100%", padding: "12px 14px", background: "#0B1120", border: "1px solid #1E293B", borderRadius: 10, color: "#F8FAFC", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ marginBottom: 26 }}>
              <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 1.2, textTransform: "uppercase", fontFamily: "monospace", marginBottom: 10 }}>Search Scope</label>
              <div style={{ display: "flex", background: "#0B1120", border: "1px solid #1E293B", borderRadius: 10, padding: 4, marginBottom: 14, gap: 4 }}>
                {[{ id: "global", label: "🌍  Global Search", sub: "All 7 registries" }, { id: "custom", label: "🎯  Select Registries", sub: "Pick specific ones" }].map(opt => (
                  <button key={opt.id} onClick={() => setSearchScope(opt.id)} style={{ flex: 1, padding: "10px 8px", borderRadius: 8, border: "none", cursor: "pointer", transition: "all 0.2s", background: searchScope === opt.id ? "linear-gradient(135deg,#F59E0B,#D97706)" : "transparent", color: searchScope === opt.id ? "#0B1120" : "#64748B" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, fontFamily: "monospace" }}>{opt.label}</div>
                    <div style={{ fontSize: 9, marginTop: 2, opacity: 0.8 }}>{opt.sub}</div>
                  </button>
                ))}
              </div>
              {searchScope === "global" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {REGISTRIES.map(r => <span key={r.id} style={{ fontSize: 10, color: "#94A3B8", background: "#1E293B", border: "1px solid #334155", padding: "4px 10px", borderRadius: 6, fontFamily: "monospace" }}>{r.flag} {r.name}</span>)}
                </div>
              )}
              {searchScope === "custom" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {REGISTRIES.map(r => {
                    const active = selectedRegistries.includes(r.id);
                    return (
                      <button key={r.id} onClick={() => toggleReg(r.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: active ? `${r.color}14` : "#0B1120", border: `1px solid ${active ? r.color + "60" : "#1E293B"}`, borderRadius: 10, cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
                        <span style={{ fontSize: 18 }}>{r.flag}</span>
                        <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 700, color: active ? "#F8FAFC" : "#64748B", fontFamily: "monospace" }}>{r.name}</div><div style={{ fontSize: 10, color: active ? "#94A3B8" : "#334155" }}>{r.region}</div></div>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${active ? r.color : "#334155"}`, background: active ? r.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{active && <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>✓</span>}</div>
                      </button>
                    );
                  })}
                  {selectedRegistries.length === 0 && <div style={{ fontSize: 11, color: "#EF4444", fontFamily: "monospace", textAlign: "center", padding: "6px 0" }}>Select at least one registry</div>}
                </div>
              )}
            </div>
            <button onClick={() => ok && handleLogin(loginName, loginEmail, loginBrand)} disabled={!ok}
              style={{ width: "100%", padding: 14, background: ok ? "linear-gradient(135deg,#F59E0B,#D97706)" : "#1E293B", border: "none", borderRadius: 10, color: ok ? "#0B1120" : "#475569", fontSize: 14, fontWeight: 800, fontFamily: "monospace", cursor: ok ? "pointer" : "default" }}>
              {searchScope === "global" ? "Start Global Scan →" : selectedRegistries.length > 0 ? `Search ${selectedRegistries.length} ${selectedRegistries.length === 1 ? "Registry" : "Registries"} →` : "Select a Registry to Continue"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══ DASHBOARD ═══
  return (
    <div style={{ minHeight: "100vh", background: "#0B1120", color: "#F8FAFC", fontFamily: "'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}@keyframes toastIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {oppositionThreat && <OppositionModal threat={oppositionThreat} brandName={brandName} userName={userName} onClose={() => setOppositionThreat(null)} />}

      <WatchlistDrawer watchlist={watchlist} allThreats={threats} onRemove={toggleWatch} onOppose={t => setOppositionThreat(t)} />

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 1000, background: "#111827", border: `1px solid ${toast.type === "success" ? "#22C55E40" : "#3B82F640"}`, borderRadius: 10, padding: "12px 18px", display: "flex", alignItems: "center", gap: 8, animation: "toastIn 0.3s ease", boxShadow: "0 8px 32px rgba(0,0,0,.4)" }}>
          <span style={{ fontSize: 14 }}>{toast.type === "success" ? "✓" : "ℹ"}</span>
          <span style={{ fontSize: 12, color: "#CBD5E1", fontFamily: "monospace" }}>{toast.msg}</span>
        </div>
      )}

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 54, borderBottom: "1px solid #1E293B", background: "#111827", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#F59E0B,#D97706)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🛡</div>
          <span style={{ fontSize: 15, fontWeight: 800 }}>IP Watchdog</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {isScanning && <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontFamily: "monospace", color: "#F59E0B" }}><svg width="12" height="12" viewBox="0 0 20 20" style={{ animation: "spin 1s linear infinite" }}><circle cx="10" cy="10" r="8" fill="none" stroke="#1E293B" strokeWidth="2.5" /><path d="M 10 2 A 8 8 0 0 1 18 10" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" /></svg>Scanning...</div>}
          {step === "done" && <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontFamily: "monospace", color: "#22C55E" }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", animation: "pulse 2s infinite" }} />Complete · {threats.length} threats</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#1E293B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#F59E0B" }}>{userName.charAt(0)}</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#CBD5E1" }}>{userName}</span>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "20px 24px" }}>
        {/* Brand card */}
        <div style={{ background: "#111827", border: "1px solid #1E293B", borderRadius: 14, padding: "18px 22px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg,#1E293B,#334155)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "#F59E0B", fontFamily: "monospace", flexShrink: 0 }}>{brandName.charAt(0)}</div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{brandName}</div>
                <div style={{ fontSize: 11, color: "#64748B" }}>{scanScope.registries.length} {scanScope.scope === "global" ? "registries (global)" : "registries selected"}{variants.length > 0 ? ` · ${variants.length + 1} name variants` : ""} · {watchlist.length} watched · {threats.length} threats</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {scanTime && <div style={{ textAlign: "right", marginRight: 4 }}><div style={{ fontSize: 9, color: "#475569", fontFamily: "monospace", letterSpacing: 1 }}>LAST SCANNED</div><div style={{ fontSize: 11, fontWeight: 700, color: "#CBD5E1", fontFamily: "monospace" }}>{new Date(scanTime).toLocaleTimeString()}</div></div>}
              {step === "done" && threats.length > 0 && <button onClick={openFullReport} style={{ padding: "8px 14px", background: "#F59E0B18", border: "1px solid #F59E0B40", borderRadius: 8, color: "#F59E0B", fontSize: 10, fontWeight: 700, fontFamily: "monospace", cursor: "pointer" }}>📄 Full PDF Report</button>}
              <button onClick={() => runScan(brandName, scanScope)} disabled={isScanning} style={{ padding: "8px 16px", background: isScanning ? "#1E293B" : "#F59E0B18", border: `1px solid ${isScanning ? "#334155" : "#F59E0B40"}`, borderRadius: 8, color: isScanning ? "#475569" : "#F59E0B", fontSize: 10, fontWeight: 700, fontFamily: "monospace", cursor: isScanning ? "default" : "pointer" }}>{isScanning ? "Scanning..." : "▶ Scan Again"}</button>
            </div>
          </div>
          {variants.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #1E293B" }}>
              <div style={{ fontSize: 9, color: "#475569", fontFamily: "monospace", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>AI-Generated Variants Searched</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                <span style={{ fontSize: 9, color: "#F59E0B", background: "#F59E0B14", border: "1px solid #F59E0B40", padding: "2px 8px", borderRadius: 4, fontFamily: "monospace", fontWeight: 700 }}>{brandName} ★</span>
                {variants.map((v, i) => <span key={i} style={{ fontSize: 9, color: "#94A3B8", background: "#1E293B", border: "1px solid #334155", padding: "2px 8px", borderRadius: 4, fontFamily: "monospace" }}>{v}</span>)}
              </div>
            </div>
          )}
        </div>

        {/* Step message */}
        {stepMsg && (
          <div style={{ background: "#111827", border: "1px solid #1E293B", borderRadius: 10, padding: "12px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            {isScanning && <svg width="16" height="16" viewBox="0 0 20 20" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}><circle cx="10" cy="10" r="8" fill="none" stroke="#1E293B" strokeWidth="2.5" /><path d="M 10 2 A 8 8 0 0 1 18 10" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" /></svg>}
            {step === "error" && <span style={{ color: "#EF4444", fontSize: 14, flexShrink: 0 }}>✗</span>}
            <span style={{ fontSize: 12, color: step === "error" ? "#EF4444" : "#94A3B8", fontFamily: "monospace" }}>{stepMsg}</span>
          </div>
        )}

        {/* Agent grid */}
        {agents.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8, marginBottom: 16, width: "100%", boxSizing: "border-box" }}>
            {agents.map((a, i) => <AgentCard key={i} agent={a} />)}
          </div>
        )}

        {/* Stats — show live during scan too */}
        {(step === "done" || threats.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 20 }}>
            {[
              { l: "Total Threats", v: threats.length, c: "#F59E0B" },
              { l: "Critical",      v: critCount,       c: "#DC2626" },
              { l: "Warnings",      v: warnCount,       c: "#D97706" },
              { l: "Registries",    v: scanStats?.registries_searched || scanScope.registries.length, c: "#3B82F6" },
              { l: "Watchlisted",   v: watchlist.length, c: "#22C55E" },
            ].map((s, i) => (
              <div key={i} style={{ background: "#111827", border: "1px solid #1E293B", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 9, color: "#475569", fontFamily: "monospace", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>{s.l}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.c, fontFamily: "monospace", lineHeight: 1 }}>{s.v}</div>
              </div>
            ))}
          </div>
        )}

        {/* AI Summary */}
        {summary && (
          <div style={{ background: "#111827", border: "1px solid #1E293B", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>AI Analysis Summary</div>
            <p style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.7, margin: 0 }}>{summary}</p>
          </div>
        )}

        {/* Threats list — live + final, always deduplicated */}
        {threats.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: step === "done" ? "1fr 260px" : "1fr", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>
                    {isScanning ? "Live Results" : "Threats Found"} ({threats.length})
                  </div>
                  {isScanning && <svg width="12" height="12" viewBox="0 0 20 20" style={{ animation: "spin 1s linear infinite" }}><circle cx="10" cy="10" r="8" fill="none" stroke="#1E293B" strokeWidth="2.5" /><path d="M 10 2 A 8 8 0 0 1 18 10" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" /></svg>}
                </div>
                {step === "done" && <button onClick={openFullReport} style={{ padding: "5px 12px", background: "#1E293B", border: "1px solid #334155", borderRadius: 6, color: "#94A3B8", fontSize: 9, fontFamily: "monospace", cursor: "pointer", fontWeight: 600 }}>📄 Full PDF Report</button>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {threats.map((t, i) => (
                  <ThreatCard
                    key={`${threatFingerprint(t)}`}
                    t={t}
                    expanded={expandedThreat === threatFingerprint(t)}
                    onToggle={() => setExpandedThreat(prev => prev === threatFingerprint(t) ? null : threatFingerprint(t))}
                    isWatched={watchlist.includes(t.id || t.conflicting_mark)}
                    onWatch={() => toggleWatch(t)}
                    onOppose={() => setOppositionThreat(t)}
                    onReport={() => openThreatReport(t)}
                  />
                ))}
              </div>
            </div>

            {step === "done" && (
              <div>
                <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Registries Scanned</div>
                <div style={{ background: "#111827", border: "1px solid #1E293B", borderRadius: 10, padding: 12, marginBottom: 14 }}>
                  {agents.map((a, i) => {
                    const reg = REGISTRIES.find(r => r.name === a.name || r.id === a.id);
                    const hasThreats = threats.some(t => t.registry === a.name);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: i < agents.length - 1 ? "1px solid #1E293B" : "none" }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: a.status === "done" ? "#22C55E" : a.status === "error" ? "#EF4444" : "#334155" }} />
                        <span style={{ fontSize: 11, color: "#CBD5E1", flex: 1 }}>{reg?.flag || "🔍"} {a.name}</span>
                        {hasThreats && <span style={{ fontSize: 8, color: "#F59E0B", fontFamily: "monospace", fontWeight: 700 }}>⚠</span>}
                      </div>
                    );
                  })}
                </div>
                {critCount > 0 && (
                  <>
                    <div style={{ fontSize: 10, color: "#DC2626", fontFamily: "monospace", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>⚡ Action Required</div>
                    <div style={{ background: "#DC262608", border: "1px solid #DC262630", borderRadius: 10, padding: 12, marginBottom: 14 }}>
                      {threats.filter(t => t.severity === "critical").map((t, i, arr) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: i < arr.length - 1 ? "1px solid #1E293B" : "none" }}>
                          <span style={{ fontSize: 9, flexShrink: 0 }}>⚡</span>
                          <span style={{ fontSize: 11, color: "#F8FAFC", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.conflicting_mark}</span>
                          <button onClick={() => setOppositionThreat(t)} style={{ fontSize: 9, color: "#DC2626", background: "none", border: "none", cursor: "pointer", fontFamily: "monospace", fontWeight: 700, flexShrink: 0 }}>FILE</button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ padding: 14, background: "#111827", border: "1px solid #1E293B", borderRadius: 10 }}>
                  <div style={{ fontSize: 8, color: "#334155", fontFamily: "monospace", letterSpacing: 1.5, marginBottom: 4 }}>IP WATCHDOG v2.0</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>TinyFish + Groq AI · Phonetic Search</div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "done" && threats.length === 0 && (
          <div style={{ background: "#111827", border: "1px solid #1E293B", borderRadius: 14, padding: "60px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#22C55E", marginBottom: 6 }}>All Clear</div>
            <div style={{ fontSize: 13, color: "#64748B" }}>No conflicting trademarks found across {scanScope.registries.length} registries and {variants.length + 1} name variants</div>
          </div>
        )}
      </div>
    </div>
  );
}
