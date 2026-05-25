import { useState, useMemo } from "react";
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, Line, ReferenceLine } from "recharts";

const fmt = (n) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)}Cr`
  : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)}L`
  : `₹${Math.round(n).toLocaleString("en-IN")}`;

const fmtFull = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const C = {
  bg: "#0a0f1e", card: "#0f1629", border: "#1e2d4a",
  accent: "#00d4aa", accent2: "#4f8ef7", accent3: "#f7c94f", accent4: "#f7614f",
  text: "#e8f0fe", muted: "#6b7fa3", surface: "#141e35",
};

const InputField = ({ label, value, onChange, prefix, suffix, min, step, placeholder }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "'Space Mono', monospace" }}>
      {label}
    </label>
    <div style={{ display: "flex", alignItems: "center", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      {prefix && <span style={{ padding: "0 10px", color: C.accent, fontWeight: 700, fontFamily: "'Space Mono', monospace", fontSize: 14, borderRight: `1px solid ${C.border}` }}>{prefix}</span>}
      <input
        type="number" value={value} min={min} step={step} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 14, padding: "10px 12px", fontFamily: "'Space Mono', monospace", fontWeight: 600 }}
      />
      {suffix && <span style={{ padding: "0 10px", color: C.muted, fontWeight: 600, fontFamily: "'Space Mono', monospace", fontSize: 13 }}>{suffix}</span>}
    </div>
  </div>
);

const StatCard = ({ label, value, sub, color = C.accent }) => (
  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", borderTop: `3px solid ${color}` }}>
    <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "'Space Mono', monospace", lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 5, fontFamily: "'Space Mono', monospace" }}>{sub}</div>}
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0f1629ee", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", fontFamily: "'Space Mono', monospace" }}>
      <div style={{ color: C.muted, fontSize: 11, marginBottom: 8 }}>Year {label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontSize: 12, marginBottom: 3 }}>
          {p.name}: <span style={{ fontWeight: 700 }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

// v2 - SIP Duration added
export default function MutualFundCalculator() {
  const [lumpsum, setLumpsum] = useState(500000);
  const [sip, setSip] = useState(10000);
  const [sipDuration, setSipDuration] = useState(20);
  const [sipStepup, setSipStepup] = useState(10);
  const [swp, setSwp] = useState(0);
  const [swpStartYear, setSwpStartYear] = useState(10);
  const [rate, setRate] = useState(12);
  const [years, setYears] = useState(20);
  const [extraLumpsums, setExtraLumpsums] = useState([{ year: 5, amount: 200000 }]);
  const [activeTab, setActiveTab] = useState("growth");

  const addLumpsum = () => setExtraLumpsums([...extraLumpsums, { year: 1, amount: 100000 }]);
  const removeLumpsum = (i) => setExtraLumpsums(extraLumpsums.filter((_, idx) => idx !== i));
  const updateLumpsum = (i, field, val) => {
    const updated = [...extraLumpsums];
    updated[i] = { ...updated[i], [field]: Number(val) };
    setExtraLumpsums(updated);
  };

  const chartData = useMemo(() => {
    const monthlyRate = Number(rate) / 100 / 12;
    const sipEndYear = Math.min(Number(sipDuration), Number(years));
    const rows = [];
    let corpus = Number(lumpsum);
    let totalInvested = Number(lumpsum);
    let currentSip = Number(sip);
    let totalWithdrawn = 0;

    for (let y = 1; y <= Number(years); y++) {
      if (y > 1) currentSip = currentSip * (1 + Number(sipStepup) / 100);
      const sipActive = y <= sipEndYear;

      // Add extra lumpsums for this year
      const extraThisYear = extraLumpsums
        .filter((e) => Number(e.year) === y)
        .reduce((s, e) => s + Number(e.amount), 0);
      corpus += extraThisYear;
      totalInvested += extraThisYear;

      // Monthly simulation
      let sipThisYear = 0;
      for (let m = 0; m < 12; m++) {
        corpus = corpus * (1 + monthlyRate);
        if (sipActive) {
          corpus += currentSip;
          sipThisYear += currentSip;
        }
        // SWP
        if (y >= Number(swpStartYear) && Number(swp) > 0) {
          const w = Math.min(Number(swp), corpus);
          corpus = Math.max(0, corpus - w);
          totalWithdrawn += w;
        }
      }
      totalInvested += sipThisYear;

      const netInvested = totalInvested - totalWithdrawn;
      rows.push({
        year: y,
        corpus: Math.max(0, corpus),
        invested: totalInvested,
        gains: Math.max(0, corpus - netInvested),
        withdrawn: totalWithdrawn,
        sipActive,
      });
    }
    return rows;
  }, [lumpsum, sip, sipDuration, sipStepup, swp, swpStartYear, rate, years, extraLumpsums]);

  const last = chartData[chartData.length - 1] || {};
  const corpusFinal = last.corpus || 0;
  const totalInvestedFinal = last.invested || 0;
  const totalWithdrawnFinal = last.withdrawn || 0;
  const netGains = corpusFinal + totalWithdrawnFinal - totalInvestedFinal;

  const milestones = [1, 3, 5, 10, 15, 20, 25, 30].filter((m) => m <= Number(years));

  const tabs = [
    { id: "growth", label: "📈 Growth" },
    { id: "breakdown", label: "🧩 Breakdown" },
    { id: "table", label: "📋 Year Table" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Space Mono', monospace", color: C.text, padding: "24px 16px" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ maxWidth: 1100, margin: "0 auto 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📈</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontFamily: "'Syne', sans-serif", fontWeight: 800, background: `linear-gradient(90deg, ${C.accent}, ${C.accent2})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              MF Wealth Calculator
            </h1>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.1em" }}>LUMPSUM · SIP · STEP-UP · SWP · EXTRA INVESTMENTS</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "340px 1fr", gap: 20 }}>

        {/* ── LEFT PANEL ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Core */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 11, color: C.accent, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 16, fontWeight: 700 }}>⚡ Core Parameters</div>
            <div style={{ display: "grid", gap: 13 }}>
              <InputField label="Initial Lumpsum" value={lumpsum} onChange={setLumpsum} prefix="₹" />
              <InputField label="Monthly SIP" value={sip} onChange={setSip} prefix="₹" />
              <InputField label="SIP Duration" value={sipDuration} onChange={setSipDuration} suffix="yrs" min={1} max={50} step={1} />
              <InputField label="Annual SIP Step-Up" value={sipStepup} onChange={setSipStepup} suffix="%" min={0} max={50} step={1} />
              <InputField label="Expected Annual Return" value={rate} onChange={setRate} suffix="%" min={1} max={50} step={0.5} />
              <InputField label="Investment Horizon" value={years} onChange={setYears} suffix="yrs" min={1} max={50} step={1} />
            </div>
          </div>

          {/* SWP */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 11, color: C.accent3, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 16, fontWeight: 700 }}>💸 Systematic Withdrawal (SWP)</div>
            <div style={{ display: "grid", gap: 13 }}>
              <InputField label="Monthly Withdrawal" value={swp} onChange={setSwp} prefix="₹" placeholder="0 = disabled" />
              <InputField label="Start from Year" value={swpStartYear} onChange={setSwpStartYear} suffix="yr" min={1} max={years} step={1} />
            </div>
          </div>

          {/* Extra Lumpsums */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.accent2, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700 }}>🎯 Extra Lumpsums</div>
              <button onClick={addLumpsum} style={{ background: `${C.accent2}22`, border: `1px solid ${C.accent2}55`, color: C.accent2, borderRadius: 8, padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>+ ADD</button>
            </div>
            {extraLumpsums.length === 0 && (
              <div style={{ fontSize: 12, color: C.muted, textAlign: "center", padding: "8px 0" }}>No extra investments added</div>
            )}
            {extraLumpsums.map((e, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr auto", gap: 8, marginBottom: 10, alignItems: "end" }}>
                <div>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 5, letterSpacing: "0.1em" }}>YEAR</div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                    <input type="number" value={e.year} min={1} max={years}
                      onChange={(ev) => updateLumpsum(i, "year", ev.target.value)}
                      style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 13, padding: "8px 10px", fontFamily: "'Space Mono', monospace", fontWeight: 600, boxSizing: "border-box" }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 5, letterSpacing: "0.1em" }}>AMOUNT (₹)</div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                    <input type="number" value={e.amount} min={0}
                      onChange={(ev) => updateLumpsum(i, "amount", ev.target.value)}
                      style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 13, padding: "8px 10px", fontFamily: "'Space Mono', monospace", fontWeight: 600, boxSizing: "border-box" }} />
                  </div>
                </div>
                <button onClick={() => removeLumpsum(i)} style={{ background: `${C.accent4}22`, border: `1px solid ${C.accent4}44`, color: C.accent4, borderRadius: 8, padding: "8px 10px", fontSize: 13, cursor: "pointer" }}>✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            <StatCard label="Final Corpus" value={fmt(corpusFinal)} sub={fmtFull(corpusFinal)} color={C.accent} />
            <StatCard label="Total Invested" value={fmt(totalInvestedFinal)} sub={fmtFull(totalInvestedFinal)} color={C.accent2} />
            <StatCard label="Wealth Gained" value={fmt(netGains)} sub={`${totalInvestedFinal > 0 ? ((netGains / totalInvestedFinal) * 100).toFixed(1) : 0}% on invested`} color={C.accent3} />
            <StatCard label="Total Withdrawn" value={fmt(totalWithdrawnFinal)} sub={totalWithdrawnFinal > 0 ? fmtFull(totalWithdrawnFinal) : "SWP not active"} color={C.accent4} />
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 5 }}>
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                flex: 1, padding: "8px 0", borderRadius: 10, border: activeTab === t.id ? `1px solid ${C.accent}44` : "1px solid transparent",
                cursor: "pointer", background: activeTab === t.id ? `linear-gradient(135deg, ${C.accent}22, ${C.accent2}22)` : "transparent",
                color: activeTab === t.id ? C.accent : C.muted,
                fontSize: 11, fontFamily: "'Space Mono', monospace", fontWeight: 700, transition: "all 0.2s",
              }}>{t.label}</button>
            ))}
          </div>

          {/* Charts / Table */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
            {activeTab === "growth" && (
              <>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>Total corpus vs invested capital over {years} years</div>
                <ResponsiveContainer width="100%" height={290}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <defs>
                      <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.accent} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={C.accent} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.accent2} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={C.accent2} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="year" stroke={C.muted} tick={{ fontSize: 10, fill: C.muted, fontFamily: "'Space Mono', monospace" }} />
                    <YAxis stroke={C.muted} tick={{ fontSize: 10, fill: C.muted, fontFamily: "'Space Mono', monospace" }} tickFormatter={fmt} width={74} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'Space Mono', monospace" }} />
                    {Number(swp) > 0 && (
                      <ReferenceLine x={Number(swpStartYear)} stroke={C.accent4} strokeDasharray="4 3"
                        label={{ value: "SWP↓", fill: C.accent4, fontSize: 10, fontFamily: "'Space Mono', monospace", position: "top" }} />
                    )}
                    {Number(sipDuration) < Number(years) && (
                      <ReferenceLine x={Number(sipDuration)} stroke={C.accent3} strokeDasharray="4 3"
                        label={{ value: "SIP ends", fill: C.accent3, fontSize: 10, fontFamily: "'Space Mono', monospace", position: "top" }} />
                    )}
                    <Area type="monotone" dataKey="corpus" name="Corpus" stroke={C.accent} fill="url(#gc)" strokeWidth={2.5} dot={false} />
                    <Area type="monotone" dataKey="invested" name="Invested" stroke={C.accent2} fill="url(#gi)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </>
            )}

            {activeTab === "breakdown" && (
              <>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>Wealth gained vs corpus — visualising compounding power</div>
                <ResponsiveContainer width="100%" height={290}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <defs>
                      <linearGradient id="gc2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.accent} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={C.accent} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.accent3} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={C.accent3} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="year" stroke={C.muted} tick={{ fontSize: 10, fill: C.muted, fontFamily: "'Space Mono', monospace" }} />
                    <YAxis stroke={C.muted} tick={{ fontSize: 10, fill: C.muted, fontFamily: "'Space Mono', monospace" }} tickFormatter={fmt} width={74} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'Space Mono', monospace" }} />
                    <Area type="monotone" dataKey="corpus" name="Corpus" stroke={C.accent} fill="url(#gc2)" strokeWidth={2.5} dot={false} />
                    <Area type="monotone" dataKey="gains" name="Gains" stroke={C.accent3} fill="url(#gg)" strokeWidth={2} dot={false} />
                    {Number(swp) > 0 && (
                      <Line type="monotone" dataKey="withdrawn" name="Withdrawn" stroke={C.accent4} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </>
            )}

            {activeTab === "table" && (
              <div style={{ overflowY: "auto", maxHeight: 310 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
                  <thead style={{ position: "sticky", top: 0, background: C.card }}>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {["Year", "Invested", "Corpus", "Gains", "Withdrawn"].map((h) => (
                        <th key={h} style={{ padding: "8px 10px", textAlign: "right", color: C.muted, fontWeight: 700, letterSpacing: "0.08em", fontSize: 10 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((row, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}22`, background: i % 2 === 0 ? "transparent" : `${C.surface}66` }}>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: C.muted }}>{row.year}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: C.accent2 }}>{fmt(row.invested)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: C.accent, fontWeight: 700 }}>{fmt(row.corpus)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: C.accent3 }}>{fmt(row.gains)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: C.accent4 }}>{fmt(row.withdrawn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Milestones */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12, fontWeight: 700 }}>🏁 Corpus at Milestones</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {milestones.map((m) => {
                const row = chartData.find((r) => r.year === m);
                if (!row) return null;
                return (
                  <div key={m} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", flex: "1 1 60px", minWidth: 64, textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Yr {m}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>{fmt(row.corpus)}</div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "14px auto 0", fontSize: 10, color: C.muted, textAlign: "center", lineHeight: 1.6 }}>
        * Illustrative only. Returns not guaranteed. Past performance ≠ future results. Consult a SEBI-registered investment advisor.
      </div>
    </div>
  );
}
