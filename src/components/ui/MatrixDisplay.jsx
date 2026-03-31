export default function MatrixDisplay({ rows, label, color = "var(--text-primary)", size = 15 }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "monospace" }}>
      {label && <span style={{ fontSize: size, color: "var(--text-muted)", marginRight: 4 }}>{label} =</span>}
      <span style={{ fontSize: size + 4, color: "var(--text-muted)", lineHeight: 1 }}>[</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "flex", gap: 12 }}>
            {row.map((v, j) => (
              <span key={j} style={{ fontSize: size, color, minWidth: 28, textAlign: "right", fontWeight: 500 }}>
                {typeof v === "number" ? v : v}
              </span>
            ))}
          </div>
        ))}
      </div>
      <span style={{ fontSize: size + 4, color: "var(--text-muted)", lineHeight: 1 }}>]</span>
    </div>
  );
}
