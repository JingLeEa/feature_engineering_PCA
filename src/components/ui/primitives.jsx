// ─── MetricCard ───────────────────────────────────────────────────────────────

export function MetricCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: "var(--metric-bg)",
      border: "0.5px solid var(--border)",
      borderRadius: 8,
      padding: "10px 14px",
      borderLeft: accent ? `3px solid ${accent}` : undefined,
    }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Callout ──────────────────────────────────────────────────────────────────

export function Callout({ children, borderColor, bg }) {
  return (
    <div style={{
      borderLeft: `3px solid ${borderColor}`,
      background: bg,
      borderRadius: "0 8px 8px 0",
      padding: "10px 14px",
      fontSize: 13.5,
      lineHeight: 1.65,
      color: "var(--text-secondary)",
    }}>
      {children}
    </div>
  );
}

// ─── VarBar ───────────────────────────────────────────────────────────────────

export function VarBar({ pct, color }) {
  return (
    <div style={{
      height: 5,
      background: "var(--border)",
      borderRadius: 3,
      overflow: "hidden",
      marginTop: 6,
    }}>
      <div style={{
        height: "100%",
        borderRadius: 3,
        background: color,
        width: `${Math.min(pct, 100)}%`,
        transition: "width 0.04s",
      }} />
    </div>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

export function Divider() {
  return (
    <div style={{
      height: "0.5px",
      background: "var(--border)",
      margin: "2.5rem 0",
    }} />
  );
}

// ─── SectionTag ───────────────────────────────────────────────────────────────

export function SectionTag({ children }) {
  return (
    <span style={{
      fontSize: 10.5,
      fontWeight: 600,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: "var(--text-muted)",
      background: "var(--surface)",
      border: "0.5px solid var(--border)",
      borderRadius: 20,
      padding: "3px 10px",
      display: "inline-block",
      marginBottom: "0.75rem",
    }}>
      {children}
    </span>
  );
}
