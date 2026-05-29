import { useEffect, useRef, useState } from "react";

/**
 * Плавающая отладочная панель для диагностики багов перемотки.
 */
export default function SeekDebugPanel({
  debugLog, clearDebugLog, _debugRefs, currentFileType,
}) {
  const { wavesurferRef, videoRef, seekPendingRef, pendingPlayRef } = _debugRefs || {};

  const [live, setLive] = useState({
    seekPending: false, pendingPlay: false, videoTime: null, wsTime: null,
    diff: null, videoSeeking: false, videoPlaying: false,
  });
  const intervalRef = useRef(null);
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const vt  = videoRef?.current?.currentTime ?? null;
      const wst = wavesurferRef?.current?.getCurrentTime() ?? null;
      setLive({
        seekPending: seekPendingRef?.current ?? false,
        pendingPlay: pendingPlayRef?.current ?? false,
        videoTime:  vt,
        wsTime:     wst,
        diff: vt !== null && wst !== null ? +(vt - wst).toFixed(3) : null,
        videoSeeking: videoRef?.current?.seeking ?? false,
        videoPlaying: videoRef?.current ? !videoRef.current.paused : false,
      });
    }, 80);
    return () => clearInterval(intervalRef.current);
  }, [videoRef, wavesurferRef, seekPendingRef]);

  const [collapsed, setCollapsed]   = useState(false);
  const [filter,    setFilter]      = useState("");
  const [paused,    setPaused]      = useState(false);
  const [frozenLog, setFrozenLog]   = useState([]);

  useEffect(() => { if (paused) setFrozenLog(debugLog); }, [paused]); // eslint-disable-line

  const displayLog = paused ? frozenLog : debugLog;
  const filtered   = filter
    ? displayLog.filter(e => e.event.toLowerCase().includes(filter.toLowerCase()))
    : displayLog;

  const eventColor = (ev) => {
    if (ev.startsWith("interaction"))   return "#60a5fa";
    if (ev === "seekVideoTo")           return "#34d399";
    if (ev === "seekVideoTo:after")     return "#86efac";
    if (ev === "seekWaveSurferTo")      return "#6ee7b7";
    if (ev.includes("skip"))            return "#f97316";
    if (ev.includes("syncWS"))          return "#a78bfa";
    if (ev.includes("syncInterval"))    return "#7c3aed";
    if (ev.includes("ZERO"))            return "#ef4444";
    if (ev.includes("TimeUpdate"))      return "#475569";
    return "#94a3b8";
  };

  const fmt = (v) =>
    v == null ? "—" : typeof v === "number" ? v.toFixed(3) : String(v);

  // Inline-подсказка: ключевые поля без раскрытия строки
  const inlineHint = (e) => {
    const ev = e.event;
    if (ev === "seekVideoTo")
      return `→ ${fmt(e.targetTime)}`;
    if (ev === "seekVideoTo:after")
      return `cur=${fmt(e.currentTimeAfter)} seekableLen=${fmt(e.seekableLen)} seekableEnd=${fmt(e.seekableEnd)}`;
    if (ev === "loadedmetadata")
      return `dur=${fmt(e.duration)} seekableLen=${fmt(e.seekableLen)} seekableEnd=${fmt(e.seekableEnd)}`;
    if (ev === "seekWaveSurferTo")
      return `→ ${fmt(e.targetTime)}`;
    if (ev.startsWith("interaction"))
      return `seek=${fmt(e.seekTime)} was=${fmt(e.videoTime ?? e.wsTime)}`;
    if (ev.includes("pending:done"))
      return `v=${fmt(e.videoTime)} target=${fmt(e.target)} ${e.missed?"⚠MISSED":"✓ok"}`;
    if (ev.includes("missed"))
      return `v=${fmt(e.videoTime)} target=${fmt(e.target)}`;
    if (ev.includes("skip") || ev.includes("syncWS"))
      return `v=${fmt(e.videoTime)} ws=${fmt(e.wsTime)}`;
    if (ev.includes("syncInterval"))
      return `drift=${fmt(e.drift)}`;
    if (ev.includes("TimeUpdate") || ev.includes("ZERO"))
      return `t=${fmt(e.time ?? e.videoTime)}`;
    return "";
  };

  // Аномалия: seekTo с targetTime~0 после ненулевых операций
  const isAnomaly = (entry, i, arr) => {
    if ((entry.event === "seekVideoTo" || entry.event === "seekWaveSurferTo")
        && (entry.targetTime ?? 1) < 0.05) {
      return arr.slice(i + 1).some(
        e => (e.event === "seekVideoTo" || e.event === "seekWaveSurferTo")
             && (e.targetTime ?? 0) > 0.1
      );
    }
    if (entry.event === "ws:timeupdate→ZERO") return true;
    if (entry.event === "onSeeked→missed") return true;
    if (entry.event === "onSeeked→pending:done" && entry.missed) return true;
    return false;
  };

  const S = {  // style shortcuts
    root: {
      position: "fixed", bottom: 0, right: 0,
      width: collapsed ? "170px" : "520px",
      maxHeight: collapsed ? "36px" : "520px",
      background: "#0a0f1a",
      border: "1px solid #334155",
      borderRadius: "8px 0 0 0",
      zIndex: 9999,
      display: "flex", flexDirection: "column",
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
      fontSize: "11px", color: "#e2e8f0",
      boxShadow: "0 -4px 32px rgba(0,0,0,0.6)",
      overflow: "hidden",
    },
    header: {
      display: "flex", alignItems: "center", gap: "6px",
      padding: "5px 8px", background: "#111827",
      borderBottom: collapsed ? "none" : "1px solid #1e293b",
      userSelect: "none", flexShrink: 0,
    },
  };

  return (
    <div style={S.root}>
      {/* Заголовок */}
      <div style={S.header}>
        <span style={{ cursor:"pointer", display:"flex", alignItems:"center", gap:"6px", flex:1 }}
              onClick={() => setCollapsed(c => !c)}>
          <span style={{ color:"#f97316" }}>{"🐛"}</span>
          <span style={{ color:"#64748b", fontSize:"10px", fontWeight:600, letterSpacing:"0.08em" }}>
            SEEK DEBUG
          </span>
        </span>
        {!collapsed && (
          <button onClick={() => setPaused(p => !p)}
            style={{ background: paused?"#7c3aed":"#1e293b", border:"none", borderRadius:"3px",
                     color: paused?"#fff":"#64748b", padding:"1px 6px", cursor:"pointer", fontSize:"10px" }}>
            {paused ? "▶ resume" : "⏸ pause"}
          </button>
        )}
        <span style={{ background:"#ef4444", color:"#fff", borderRadius:"4px",
                       padding:"0 5px", fontSize:"10px", minWidth:"18px", textAlign:"center" }}>
          {displayLog.length}
        </span>
        <span style={{ color:"#64748b", fontSize:"10px", cursor:"pointer" }}
              onClick={() => setCollapsed(c => !c)}>
          {collapsed ? "▲" : "▼"}
        </span>
      </div>

      {!collapsed && (<>
        {/* Live-панель */}
        <div style={{ padding:"5px 8px", background:"#0a0f1a", borderBottom:"1px solid #1e293b",
                      display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"3px 8px", flexShrink:0 }}>
          <LR label="type"       value={currentFileType}
              color={currentFileType==="video"?"#60a5fa":"#34d399"} />
          <LR label="seekPending" value={String(live.seekPending)}
              color={live.seekPending?"#ef4444":"#334155"} />
          <LR label="pendPlay"   value={String(live.pendingPlay)}
              color={live.pendingPlay?"#f59e0b":"#334155"} />
          <LR label="seeking"    value={String(live.videoSeeking)}
              color={live.videoSeeking?"#f97316":"#334155"} />

          <LR label="video.t"    value={fmt(live.videoTime)} color="#e2e8f0" />
          <LR label="playing"    value={String(live.videoPlaying)}
              color={live.videoPlaying?"#34d399":"#334155"} />
          <LR label="drift"
              value={live.diff==null ? "—" : (live.diff>=0?"+":"")+fmt(live.diff)}
              color={live.diff==null?"#334155":Math.abs(live.diff)>0.5?"#ef4444":Math.abs(live.diff)>0.1?"#f97316":"#34d399"} />

          <LR label="ws.t"       value={fmt(live.wsTime)} color="#e2e8f0" />
        </div>

        {/* Фильтр + очистка */}
        <div style={{ display:"flex", gap:"5px", padding:"4px 6px",
                      borderBottom:"1px solid #1e293b", flexShrink:0, alignItems:"center" }}>
          <input placeholder="filter events…" value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ flex:1, background:"#1e293b", border:"1px solid #334155", borderRadius:"3px",
                     color:"#e2e8f0", padding:"2px 6px", fontSize:"10px", fontFamily:"inherit" }} />
          <button onClick={() => { clearDebugLog(); setFrozenLog([]); }}
            style={{ background:"#1e293b", border:"1px solid #334155", borderRadius:"3px",
                     color:"#94a3b8", padding:"2px 8px", cursor:"pointer", fontSize:"10px" }}>
            clear
          </button>
        </div>

        {/* Легенда */}
        <div style={{ padding:"2px 8px", borderBottom:"1px solid #0f172a",
                      display:"flex", gap:"10px", flexShrink:0, flexWrap:"wrap" }}>
          {[["interaction","#60a5fa"],["seekTo","#34d399"],["skip","#f97316"],
            ["syncWS","#a78bfa"],["interval","#7c3aed"],["ZERO","#ef4444"]
          ].map(([l,c]) => (
            <span key={l} style={{ fontSize:"9px", color:c, opacity:0.8 }}>● {l}</span>
          ))}
          <span style={{ fontSize:"9px", color:"#ef4444", marginLeft:"auto" }}>⚠ = аномалия</span>
        </div>

        {/* Журнал */}
        <div style={{ overflowY:"auto", flex:1 }}>
          {filtered.length === 0
            ? <div style={{ padding:"12px", color:"#334155", textAlign:"center" }}>
                Нет событий — перемотайте видео/аудио
              </div>
            : filtered.map((entry, i) => (
                <LogRow key={i} entry={entry} idx={i} arr={filtered}
                  eventColor={eventColor} fmt={fmt}
                  inlineHint={inlineHint} isAnomaly={isAnomaly} />
              ))
          }
        </div>
      </>)}
    </div>
  );
}

function LR({ label, value, color }) {
  return (
    <div style={{ display:"flex", gap:"4px", alignItems:"baseline", minWidth:0 }}>
      <span style={{ color:"#334155", fontSize:"9px", whiteSpace:"nowrap" }}>{label}:</span>
      <span style={{ color: color||"#e2e8f0", fontWeight:"bold", fontSize:"10px" }}>{value}</span>
    </div>
  );
}

function LogRow({ entry, idx, arr, eventColor, fmt, inlineHint, isAnomaly }) {
  const [open, setOpen] = useState(false);
  const extra = Object.entries(entry).filter(
    ([k]) => !["t","ts","event","seekPending"].includes(k)
  );
  const prevEntry = arr[idx + 1];
  const delta     = prevEntry ? Math.round(entry.t - prevEntry.t) : null;
  const anomaly   = isAnomaly(entry, idx, arr);
  const hint      = inlineHint(entry);

  return (
    <div onClick={() => setOpen(o => !o)}
      style={{
        padding:"2px 8px", borderBottom:"1px solid #0a0f1a", cursor:"pointer",
        background: anomaly ? "rgba(239,68,68,0.08)" : open ? "#111827" : "transparent",
        borderLeft: `2px solid ${anomaly?"#ef4444":"transparent"}`,
      }}>
      <div style={{ display:"flex", gap:"5px", alignItems:"center" }}>
        <span style={{ color:"#334155", fontSize:"9px", width:"68px", flexShrink:0 }}>{entry.ts}</span>
        <span style={{
          color: delta!==null && delta<10 ? "#f97316" : "#1e293b",
          fontSize:"9px", width:"28px", textAlign:"right", flexShrink:0
        }}>
          {delta!==null ? `+${delta}` : ""}
        </span>
        <span style={{ color:eventColor(entry.event), minWidth:0, flexShrink:0 }}>{entry.event}</span>
        {hint && (
          <span style={{ color:"#475569", fontSize:"10px", flex:1, overflow:"hidden",
                         textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {hint}
          </span>
        )}
        {anomaly && <span style={{ color:"#ef4444", fontSize:"10px" }}>{"⚠"}</span>}
        <Flag active={entry.seekPending} label="P" />
      </div>
      {open && extra.length > 0 && (
        <div style={{ paddingLeft:"106px", paddingBottom:"3px", paddingTop:"1px" }}>
          {extra.map(([k,v]) => (
            <span key={k} style={{ marginRight:"12px", fontSize:"10px" }}>
              <span style={{ color:"#475569" }}>{k}: </span>
              <span style={{ color:"#f1f5f9", fontWeight:"bold" }}>{fmt(v)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Flag({ active, label }) {
  return (
    <span style={{
      fontSize:"9px", padding:"0 3px", borderRadius:"2px",
      background: active?"#ef4444":"transparent",
      color: active?"#fff":"#1e293b",
      border: `1px solid ${active?"#ef4444":"#1e293b"}`,
      flexShrink:0,
    }}>
      {label}
    </span>
  );
}
