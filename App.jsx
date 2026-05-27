import { useState, useMemo } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Area, AreaChart, Line, ReferenceLine, BarChart, Bar
} from "recharts";

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt = (n) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)}Cr`
  : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)}L`
  : `₹${Math.round(n).toLocaleString("en-IN")}`;
const fmtFull = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// ── Colors ────────────────────────────────────────────────────────────────────
const C = {
  bg:"#0a0f1e", card:"#0f1629", border:"#1e2d4a",
  accent:"#00d4aa", accent2:"#4f8ef7", accent3:"#f7c94f",
  accent4:"#f7614f", accent5:"#b06ef7",
  text:"#e8f0fe", muted:"#6b7fa3", surface:"#141e35",
};

// ── Tax Engine (New Regime 2024) ───────────────────────────────────────────────
const NEW_REGIME_SLABS = [
  { upto:300000,   rate:0    },
  { upto:700000,   rate:0.05 },
  { upto:1000000,  rate:0.10 },
  { upto:1200000,  rate:0.15 },
  { upto:1500000,  rate:0.20 },
  { upto:Infinity, rate:0.30 },
];
const CESS = 0.04;
const LTCG_EXEMPT = 125000; // ₹1.25L/yr (Budget 2024)

function slabTax(income) {
  let tax = 0, prev = 0;
  for (const { upto, rate } of NEW_REGIME_SLABS) {
    if (income <= prev) break;
    tax += (Math.min(income, upto) - prev) * rate;
    prev = upto;
  }
  return tax * (1 + CESS);
}

// Returns tax on a given gain amount
function calcTax({ gain, fundType, annualIncome, ltcgUsedThisYear = 0 }) {
  if (gain <= 0) return { tax: 0, ltcgUsed: 0 };

  if (fundType === "debt") {
    // Debt: full slab rate, no exemption
    const taxWith    = slabTax(annualIncome + gain);
    const taxWithout = slabTax(annualIncome);
    return { tax: taxWith - taxWithout, ltcgUsed: 0 };
  }

  // Equity / Hybrid: LTCG 12.5% above ₹1.25L exemption
  const remainingExempt = Math.max(0, LTCG_EXEMPT - ltcgUsedThisYear);
  const taxableGain     = Math.max(0, gain - remainingExempt);
  const ltcgUsed        = Math.min(gain, LTCG_EXEMPT - ltcgUsedThisYear + taxableGain > 0 ? gain : 0);
  return {
    tax: taxableGain * 0.125 * (1 + CESS),
    ltcgUsed: Math.min(gain, remainingExempt + taxableGain),
  };
}

// ── UI Components ─────────────────────────────────────────────────────────────
const InputField = ({ label, value, onChange, prefix, suffix, min, max, step, placeholder }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
    <label style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:"0.12em", textTransform:"uppercase", fontFamily:"'Space Mono',monospace" }}>{label}</label>
    <div style={{ display:"flex", alignItems:"center", background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
      {prefix && <span style={{ padding:"0 10px", color:C.accent, fontWeight:700, fontFamily:"'Space Mono',monospace", fontSize:14, borderRight:`1px solid ${C.border}` }}>{prefix}</span>}
      <input type="number" value={value} min={min} max={max} step={step} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{ flex:1, background:"transparent", border:"none", outline:"none", color:C.text, fontSize:14, padding:"10px 12px", fontFamily:"'Space Mono',monospace", fontWeight:600 }} />
      {suffix && <span style={{ padding:"0 10px", color:C.muted, fontWeight:600, fontFamily:"'Space Mono',monospace", fontSize:13 }}>{suffix}</span>}
    </div>
  </div>
);

const StatCard = ({ label, value, sub, color=C.accent, small }) => (
  <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", borderTop:`3px solid ${color}` }}>
    <div style={{ fontSize:10, color:C.muted, letterSpacing:"0.14em", textTransform:"uppercase", fontFamily:"'Space Mono',monospace", marginBottom:6 }}>{label}</div>
    <div style={{ fontSize:small?15:21, fontWeight:800, color, fontFamily:"'Space Mono',monospace", lineHeight:1 }}>{value}</div>
    {sub && <div style={{ fontSize:11, color:C.muted, marginTop:5, fontFamily:"'Space Mono',monospace" }}>{sub}</div>}
  </div>
);

const SegBtn = ({ options, value, onChange }) => (
  <div style={{ display:"flex", background:C.surface, borderRadius:10, padding:3, gap:3 }}>
    {options.map(o => (
      <button key={o.value} onClick={() => onChange(o.value)} style={{
        flex:1, padding:"7px 4px", borderRadius:8, border:"none", cursor:"pointer",
        background: String(value)===String(o.value) ? C.accent : "transparent",
        color: String(value)===String(o.value) ? C.bg : C.muted,
        fontSize:11, fontFamily:"'Space Mono',monospace", fontWeight:700, transition:"all .2s",
      }}>{o.label}</button>
    ))}
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#0f1629ee", border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 16px", fontFamily:"'Space Mono',monospace" }}>
      <div style={{ color:C.muted, fontSize:11, marginBottom:8 }}>Year {label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ color:p.color, fontSize:12, marginBottom:3 }}>
          {p.name}: <span style={{ fontWeight:700 }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  // Investment params
  const [lumpsum,       setLumpsum]       = useState(500000);
  const [sip,           setSip]           = useState(10000);
  const [sipDuration,   setSipDuration]   = useState(20);
  const [sipStepup,     setSipStepup]     = useState(10);
  const [swp,           setSwp]           = useState(0);
  const [swpStartYear,  setSwpStartYear]  = useState(10);
  const [rate,          setRate]          = useState(12);
  const [years,         setYears]         = useState(20);
  const [extraLumpsums, setExtraLumpsums] = useState([{ year:5, amount:200000, label:"Bonus" }]);

  // Partial redemptions — one-time withdrawals at any year
  const [partialRedemptions, setPartialRedemptions] = useState([
    { year:10, amount:500000, label:"Dream Home" }
  ]);

  // Tax params
  const [fundType,     setFundType]     = useState("equity");
  const [annualIncome, setAnnualIncome] = useState(1000000);
  // Final redemption: what to do with remaining corpus at horizon end
  const [finalAction,  setFinalAction]  = useState("redeem"); // "redeem" | "hold"

  const [activeTab, setActiveTab] = useState("growth");

  // Helpers
  const addLumpsum    = () => setExtraLumpsums([...extraLumpsums, { year:1, amount:100000, label:"" }]);
  const removeLumpsum = i  => setExtraLumpsums(extraLumpsums.filter((_,idx) => idx !== i));
  const updateLumpsum = (i,f,v) => { const u=[...extraLumpsums]; u[i]={...u[i],[f]:f==="label"?v:Number(v)}; setExtraLumpsums(u); };

  const addRedemption    = () => setPartialRedemptions([...partialRedemptions, { year:1, amount:100000, label:"" }]);
  const removeRedemption = i  => setPartialRedemptions(partialRedemptions.filter((_,idx) => idx !== i));
  const updateRedemption = (i,f,v) => { const u=[...partialRedemptions]; u[i]={...u[i],[f]:f==="label"?v:Number(v)}; setPartialRedemptions(u); };

  // ── Core simulation ──────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const monthlyRate = Number(rate) / 100 / 12;
    const sipEndYear  = Math.min(Number(sipDuration), Number(years));

    let corpus      = Number(lumpsum);
    let costBasis   = Number(lumpsum); // actual capital invested (adjusted for withdrawals)
    let currentSip  = Number(sip);

    // Running totals (cumulative across all years)
    let cumInvested          = Number(lumpsum);
    let cumSwpGross          = 0;  // gross SWP paid out (before tax)
    let cumSwpTax            = 0;
    let cumPartialGross      = 0;  // gross partial redemptions
    let cumPartialTax        = 0;
    let cumPartialNet        = 0;  // net after tax

    const rows = [];

    for (let y = 1; y <= Number(years); y++) {
      if (y > 1) currentSip = currentSip * (1 + Number(sipStepup) / 100);
      const sipActive = y <= sipEndYear;

      // Extra lumpsums at start of year
      const extraIn = extraLumpsums
        .filter(e => Number(e.year) === y)
        .reduce((s,e) => s + Number(e.amount), 0);
      corpus      += extraIn;
      costBasis   += extraIn;
      cumInvested += extraIn;

      let ltcgUsedThisYear = 0; // track ₹1.25L LTCG exemption per year
      let sipThisYear      = 0;
      let swpTaxThisYear   = 0;
      let swpGrossThisYear = 0;

      // Monthly loop
      for (let m = 0; m < 12; m++) {
        corpus = corpus * (1 + monthlyRate);

        if (sipActive) {
          corpus      += currentSip;
          sipThisYear += currentSip;
          costBasis   += currentSip;
        }

        // SWP
        if (y >= Number(swpStartYear) && Number(swp) > 0 && corpus > 0) {
          const gross     = Math.min(Number(swp), corpus);
          const gainRatio = corpus > 0 ? Math.max(0, (corpus - costBasis) / corpus) : 0;
          const gainPart  = gross * gainRatio;
          const costPart  = gross - gainPart;

          const { tax, ltcgUsed } = calcTax({ gain: gainPart, fundType, annualIncome: Number(annualIncome), ltcgUsedThisYear });
          ltcgUsedThisYear += ltcgUsed;

          corpus        -= gross;
          costBasis     -= costPart;
          costBasis      = Math.max(0, costBasis);
          cumSwpGross   += gross;
          cumSwpTax     += tax;
          swpTaxThisYear += tax;
          swpGrossThisYear += gross;
        }
      }
      cumInvested += sipThisYear;

      // Partial redemptions at end of year (annual, not monthly)
      let partialGrossThisYear = 0;
      let partialTaxThisYear   = 0;
      let partialNetThisYear   = 0;

      const reds = partialRedemptions.filter(r => Number(r.year) === y);
      for (const r of reds) {
        if (corpus <= 0) break;
        const gross     = Math.min(Number(r.amount), corpus);
        const gainRatio = corpus > 0 ? Math.max(0, (corpus - costBasis) / corpus) : 0;
        const gainPart  = gross * gainRatio;
        const costPart  = gross - gainPart;

        const { tax, ltcgUsed } = calcTax({ gain: gainPart, fundType, annualIncome: Number(annualIncome), ltcgUsedThisYear });
        ltcgUsedThisYear += ltcgUsed;

        corpus     -= gross;
        costBasis  -= costPart;
        costBasis   = Math.max(0, costBasis);

        partialGrossThisYear += gross;
        partialTaxThisYear   += tax;
        partialNetThisYear   += (gross - tax);
      }
      cumPartialGross += partialGrossThisYear;
      cumPartialTax   += partialTaxThisYear;
      cumPartialNet   += partialNetThisYear;

      rows.push({
        year: y,
        corpus:     Math.max(0, corpus),
        costBasis:  Math.max(0, costBasis),
        invested:   cumInvested,
        gains:      Math.max(0, corpus - costBasis),
        // SWP
        swpGross:   cumSwpGross,
        swpTax:     cumSwpTax,
        swpNet:     cumSwpGross - cumSwpTax,
        swpTaxYear: swpTaxThisYear,
        // Partial
        partialGross:     cumPartialGross,
        partialTax:       cumPartialTax,
        partialNet:       cumPartialNet,
        partialGrossYear: partialGrossThisYear,
        partialTaxYear:   partialTaxThisYear,
        partialNetYear:   partialNetThisYear,
        // Combined tax this year
        totalTaxYear: swpTaxThisYear + partialTaxThisYear,
        totalTaxCum:  cumSwpTax + cumPartialTax,
      });
    }
    return rows;
  }, [lumpsum, sip, sipDuration, sipStepup, swp, swpStartYear, rate, years,
      extraLumpsums, partialRedemptions, fundType, annualIncome]);

  // ── Tax summary (final state) ──────────────────────────────────────────────
  const summary = useMemo(() => {
    const last = chartData[chartData.length - 1] || {};
    const corpus    = last.corpus    || 0;
    const costBasis = last.costBasis || 0;
    const invested  = last.invested  || 0;

    // Tax if remaining corpus is redeemed at end
    const finalGain = Math.max(0, corpus - costBasis);
    const { tax: finalTax } = finalAction === "redeem"
      ? calcTax({ gain: finalGain, fundType, annualIncome: Number(annualIncome), ltcgUsedThisYear: 0 })
      : { tax: 0 };

    const postTaxCorpus = corpus - finalTax;

    const swpNet      = last.swpNet      || 0;
    const swpTax      = last.swpTax      || 0;
    const partialNet  = last.partialNet  || 0;
    const partialTax  = last.partialTax  || 0;

    const totalTax      = swpTax + partialTax + finalTax;
    const totalReceived = swpNet + partialNet + postTaxCorpus; // all money in hand
    const netGains      = totalReceived - invested;

    return {
      corpus, costBasis, finalGain, finalTax, postTaxCorpus,
      swpNet, swpTax,
      partialNet, partialTax,
      totalTax, totalReceived, invested, netGains,
    };
  }, [chartData, fundType, annualIncome, finalAction]);

  const milestones = [1,3,5,10,15,20,25,30].filter(m => m <= Number(years));

  const tabs = [
    { id:"growth",  label:"📈 Growth"   },
    { id:"tax",     label:"🧾 Tax View" },
    { id:"table",   label:"📋 Table"    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"'Space Mono',monospace", color:C.text, padding:"24px 16px" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ maxWidth:1160, margin:"0 auto 22px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:44, height:44, borderRadius:12, background:`linear-gradient(135deg,${C.accent},${C.accent2})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>📈</div>
          <div>
            <h1 style={{ margin:0, fontSize:25, fontFamily:"'Syne',sans-serif", fontWeight:800, background:`linear-gradient(90deg,${C.accent},${C.accent2})`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
              MF Wealth Calculator
            </h1>
            <div style={{ fontSize:11, color:C.muted, letterSpacing:"0.1em" }}>LUMPSUM · SIP · STEP-UP · SWP · PARTIAL REDEMPTION · TAX (NEW REGIME 2024)</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1160, margin:"0 auto", display:"grid", gridTemplateColumns:"345px 1fr", gap:20 }}>

        {/* ══ LEFT PANEL ══════════════════════════════════════════════════ */}
        <div style={{ display:"flex", flexDirection:"column", gap:13 }}>

          {/* Core */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:18 }}>
            <div style={{ fontSize:11, color:C.accent, letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:14, fontWeight:700 }}>⚡ Core Parameters</div>
            <div style={{ display:"grid", gap:12 }}>
              <InputField label="Initial Lumpsum"    value={lumpsum}     onChange={setLumpsum}     prefix="₹" />
              <InputField label="Monthly SIP"        value={sip}         onChange={setSip}         prefix="₹" />
              <InputField label="SIP Duration"       value={sipDuration} onChange={setSipDuration} suffix="yrs" min={1} max={50} step={1} />
              <InputField label="Annual SIP Step-Up" value={sipStepup}   onChange={setSipStepup}   suffix="%" min={0} max={50} step={1} />
              <InputField label="Expected Return"    value={rate}        onChange={setRate}        suffix="%" min={1} max={50} step={0.5} />
              <InputField label="Investment Horizon" value={years}       onChange={setYears}       suffix="yrs" min={1} max={50} step={1} />
            </div>
          </div>

          {/* SWP */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:18 }}>
            <div style={{ fontSize:11, color:C.accent3, letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:14, fontWeight:700 }}>💸 Monthly SWP</div>
            <div style={{ display:"grid", gap:12 }}>
              <InputField label="Monthly Withdrawal" value={swp}          onChange={setSwp}          prefix="₹" placeholder="0 = disabled" />
              <InputField label="Start from Year"    value={swpStartYear} onChange={setSwpStartYear} suffix="yr" min={1} max={years} step={1} />
            </div>
          </div>

          {/* Tax Settings */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:18, borderLeft:`3px solid ${C.accent5}` }}>
            <div style={{ fontSize:11, color:C.accent5, letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:14, fontWeight:700 }}>🧾 Tax Settings (New Regime)</div>
            <div style={{ display:"grid", gap:12 }}>
              <div>
                <div style={{ fontSize:10, color:C.muted, marginBottom:7, letterSpacing:"0.1em" }}>FUND TYPE</div>
                <SegBtn
                  options={[{value:"equity",label:"Equity"},{value:"hybrid",label:"Hybrid"},{value:"debt",label:"Debt"}]}
                  value={fundType} onChange={setFundType} />
              </div>
              <InputField label="Your Other Annual Income" value={annualIncome} onChange={setAnnualIncome} prefix="₹" />
              <div>
                <div style={{ fontSize:10, color:C.muted, marginBottom:7, letterSpacing:"0.1em" }}>REMAINING CORPUS AT HORIZON END</div>
                <SegBtn
                  options={[{value:"redeem",label:"Redeem & Tax"},{value:"hold",label:"Stay Invested"}]}
                  value={finalAction} onChange={setFinalAction} />
                <div style={{ fontSize:10, color:C.muted, marginTop:6, lineHeight:1.6 }}>
                  {finalAction==="redeem"
                    ? "✓ Tax on remaining corpus calculated at year "+years
                    : "✓ No redemption tax — corpus stays invested beyond "+years+"yrs"}
                </div>
              </div>
              {/* Tax rules box */}
              <div style={{ background:C.surface, borderRadius:10, padding:12, fontSize:11, color:C.muted, lineHeight:1.8 }}>
                {fundType==="debt" ? (
                  <>
                    <div style={{ color:C.accent3, fontWeight:700, marginBottom:3 }}>Debt Fund Rules (post Apr 2023)</div>
                    <div>• All gains → <span style={{color:C.text}}>slab rate</span> (no indexation)</div>
                    <div>• + 4% Health & Education Cess</div>
                  </>
                ) : (
                  <>
                    <div style={{ color:C.accent, fontWeight:700, marginBottom:3 }}>Equity/Hybrid Rules (Budget 2024)</div>
                    <div>• LTCG (&gt;1yr): <span style={{color:C.text}}>12.5%</span> above ₹1.25L/yr</div>
                    <div>• STCG (&lt;1yr): <span style={{color:C.text}}>20%</span></div>
                    <div>• + 4% Health & Education Cess</div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Extra Lumpsums */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:18 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:13 }}>
              <div style={{ fontSize:11, color:C.accent2, letterSpacing:"0.14em", textTransform:"uppercase", fontWeight:700 }}>🎯 Extra Investments</div>
              <button onClick={addLumpsum} style={{ background:`${C.accent2}22`, border:`1px solid ${C.accent2}55`, color:C.accent2, borderRadius:8, padding:"5px 12px", fontSize:11, cursor:"pointer", fontFamily:"'Space Mono',monospace", fontWeight:700 }}>+ ADD</button>
            </div>
            {extraLumpsums.length===0 && <div style={{ fontSize:12, color:C.muted, textAlign:"center", padding:"6px 0" }}>No extra investments added</div>}
            {extraLumpsums.map((e,i) => (
              <div key={i} style={{ marginBottom:10, background:C.surface, borderRadius:10, padding:10, border:`1px solid ${C.border}` }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1.4fr auto", gap:8, marginBottom:7, alignItems:"end" }}>
                  <div>
                    <div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>YEAR</div>
                    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8 }}>
                      <input type="number" value={e.year} min={1} max={years} onChange={ev=>updateLumpsum(i,"year",ev.target.value)}
                        style={{ width:"100%", background:"transparent", border:"none", outline:"none", color:C.text, fontSize:13, padding:"8px 10px", fontFamily:"'Space Mono',monospace", fontWeight:600, boxSizing:"border-box" }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>AMOUNT (₹)</div>
                    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8 }}>
                      <input type="number" value={e.amount} min={0} onChange={ev=>updateLumpsum(i,"amount",ev.target.value)}
                        style={{ width:"100%", background:"transparent", border:"none", outline:"none", color:C.text, fontSize:13, padding:"8px 10px", fontFamily:"'Space Mono',monospace", fontWeight:600, boxSizing:"border-box" }} />
                    </div>
                  </div>
                  <button onClick={()=>removeLumpsum(i)} style={{ background:`${C.accent4}22`, border:`1px solid ${C.accent4}44`, color:C.accent4, borderRadius:8, padding:"8px 10px", fontSize:13, cursor:"pointer", alignSelf:"end" }}>✕</button>
                </div>
                <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8 }}>
                  <input type="text" value={e.label} placeholder="Label (e.g. Bonus, FD Maturity)"
                    onChange={ev=>updateLumpsum(i,"label",ev.target.value)}
                    style={{ width:"100%", background:"transparent", border:"none", outline:"none", color:C.text, fontSize:12, padding:"8px 10px", fontFamily:"'Space Mono',monospace", boxSizing:"border-box" }} />
                </div>
              </div>
            ))}
          </div>

          {/* Partial Redemptions */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:18, borderLeft:`3px solid ${C.accent4}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <div style={{ fontSize:11, color:C.accent4, letterSpacing:"0.14em", textTransform:"uppercase", fontWeight:700 }}>💰 Partial Redemptions</div>
              <button onClick={addRedemption} style={{ background:`${C.accent4}22`, border:`1px solid ${C.accent4}55`, color:C.accent4, borderRadius:8, padding:"5px 12px", fontSize:11, cursor:"pointer", fontFamily:"'Space Mono',monospace", fontWeight:700 }}>+ ADD</button>
            </div>
            <div style={{ fontSize:11, color:C.muted, marginBottom:12, lineHeight:1.5 }}>
              One-time withdrawals at a specific year. Tax on the gains portion is auto-calculated.
            </div>
            {partialRedemptions.length===0 && <div style={{ fontSize:12, color:C.muted, textAlign:"center", padding:"6px 0" }}>No partial redemptions added</div>}
            {partialRedemptions.map((r,i) => {
              // Live tax estimate for this redemption
              const row = chartData.find(d => d.year === Number(r.year));
              const canCalc = row && row.corpus > 0;
              const gross    = canCalc ? Math.min(Number(r.amount), row.corpus) : 0;
              const gainRatio= canCalc ? Math.max(0,(row.corpus-row.costBasis)/row.corpus) : 0;
              const gainPart = gross * gainRatio;
              const { tax }  = canCalc ? calcTax({ gain:gainPart, fundType, annualIncome:Number(annualIncome), ltcgUsedThisYear:0 }) : { tax:0 };
              const netAmt   = gross - tax;

              return (
                <div key={i} style={{ marginBottom:12, background:C.surface, borderRadius:10, padding:10, border:`1px solid ${C.border}` }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1.4fr auto", gap:8, marginBottom:7, alignItems:"end" }}>
                    <div>
                      <div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>YEAR</div>
                      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8 }}>
                        <input type="number" value={r.year} min={1} max={years} onChange={ev=>updateRedemption(i,"year",ev.target.value)}
                          style={{ width:"100%", background:"transparent", border:"none", outline:"none", color:C.text, fontSize:13, padding:"8px 10px", fontFamily:"'Space Mono',monospace", fontWeight:600, boxSizing:"border-box" }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>AMOUNT (₹)</div>
                      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8 }}>
                        <input type="number" value={r.amount} min={0} onChange={ev=>updateRedemption(i,"amount",ev.target.value)}
                          style={{ width:"100%", background:"transparent", border:"none", outline:"none", color:C.text, fontSize:13, padding:"8px 10px", fontFamily:"'Space Mono',monospace", fontWeight:600, boxSizing:"border-box" }} />
                      </div>
                    </div>
                    <button onClick={()=>removeRedemption(i)} style={{ background:`${C.accent4}22`, border:`1px solid ${C.accent4}44`, color:C.accent4, borderRadius:8, padding:"8px 10px", fontSize:13, cursor:"pointer", alignSelf:"end" }}>✕</button>
                  </div>
                  <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, marginBottom:8 }}>
                    <input type="text" value={r.label} placeholder="Purpose (e.g. Dream Home, Car)"
                      onChange={ev=>updateRedemption(i,"label",ev.target.value)}
                      style={{ width:"100%", background:"transparent", border:"none", outline:"none", color:C.text, fontSize:12, padding:"8px 10px", fontFamily:"'Space Mono',monospace", boxSizing:"border-box" }} />
                  </div>
                  {/* Live tax estimate */}
                  {canCalc && (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                      {[
                        {label:"Gain Part", val:fmt(gainPart), color:C.accent3},
                        {label:"Est. Tax",  val:fmt(tax),      color:C.accent4},
                        {label:"Net In Hand",val:fmt(netAmt),  color:C.accent},
                      ].map(({label,val,color})=>(
                        <div key={label} style={{ background:C.bg, borderRadius:8, padding:"7px 6px", textAlign:"center" }}>
                          <div style={{ fontSize:9, color:C.muted, marginBottom:3 }}>{label}</div>
                          <div style={{ fontSize:11, fontWeight:700, color, fontFamily:"'Space Mono',monospace" }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ══ RIGHT PANEL ═════════════════════════════════════════════════ */}
        <div style={{ display:"flex", flexDirection:"column", gap:13 }}>

          {/* Main stat cards */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:11 }}>
            <StatCard label="Corpus at Horizon End"   value={fmt(summary.corpus)}       sub={fmtFull(summary.corpus)}       color={C.accent}  />
            <StatCard label="Post-Tax Corpus (Final)"  value={fmt(summary.postTaxCorpus)} sub={fmtFull(summary.postTaxCorpus)} color={C.accent2} />
            <StatCard label="Total Tax Paid"           value={fmt(summary.totalTax)}
              sub={`SWP ₹${Math.round(summary.swpTax/1000)}K + Partial ₹${Math.round(summary.partialTax/1000)}K + Final ₹${Math.round(summary.finalTax/1000)}K`}
              color={C.accent4} />
            <StatCard label="Net Wealth (Post-Tax)"    value={fmt(summary.netGains)}
              sub={`${summary.invested>0?((summary.netGains/summary.invested)*100).toFixed(1):0}% net return on invested`}
              color={C.accent3} />
          </div>

          {/* Secondary cards */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:11 }}>
            <StatCard small label="Total Invested"      value={fmt(summary.invested)}    color={C.accent2} />
            <StatCard small label="SWP Net Received"    value={fmt(summary.swpNet)}      color={C.accent3} />
            <StatCard small label="Partial Net Received" value={fmt(summary.partialNet)}  color={C.accent}  />
          </div>

          {/* Tabs */}
          <div style={{ display:"flex", gap:6, background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:5 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
                flex:1, padding:"8px 0", borderRadius:10,
                border: activeTab===t.id?`1px solid ${C.accent}44`:"1px solid transparent",
                cursor:"pointer",
                background: activeTab===t.id?`linear-gradient(135deg,${C.accent}22,${C.accent2}22)`:"transparent",
                color: activeTab===t.id?C.accent:C.muted,
                fontSize:11, fontFamily:"'Space Mono',monospace", fontWeight:700, transition:"all .2s",
              }}>{t.label}</button>
            ))}
          </div>

          {/* Chart / Table area */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>

            {/* Growth chart */}
            {activeTab==="growth" && (
              <>
                <div style={{ fontSize:11, color:C.muted, marginBottom:14 }}>Corpus vs invested capital — dashed lines show key events</div>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData} margin={{top:5,right:5,left:5,bottom:5}}>
                    <defs>
                      <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={C.accent}  stopOpacity={0.3}  />
                        <stop offset="95%" stopColor={C.accent}  stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={C.accent2} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={C.accent2} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="year" stroke={C.muted} tick={{fontSize:10,fill:C.muted,fontFamily:"'Space Mono',monospace"}} />
                    <YAxis stroke={C.muted} tick={{fontSize:10,fill:C.muted,fontFamily:"'Space Mono',monospace"}} tickFormatter={fmt} width={74} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{fontSize:11,fontFamily:"'Space Mono',monospace"}} />
                    {Number(swp)>0 && (
                      <ReferenceLine x={Number(swpStartYear)} stroke={C.accent3} strokeDasharray="4 3"
                        label={{value:"SWP↓",fill:C.accent3,fontSize:10,position:"top"}} />
                    )}
                    {Number(sipDuration)<Number(years) && (
                      <ReferenceLine x={Number(sipDuration)} stroke={C.accent2} strokeDasharray="4 3"
                        label={{value:"SIP end",fill:C.accent2,fontSize:10,position:"top"}} />
                    )}
                    {partialRedemptions.map((r,i) => (
                      <ReferenceLine key={i} x={Number(r.year)} stroke={C.accent4} strokeDasharray="3 3"
                        label={{value:`💰${r.label||"Redeem"}`,fill:C.accent4,fontSize:9,position:"insideTopRight"}} />
                    ))}
                    <Area type="monotone" dataKey="corpus"   name="Corpus"   stroke={C.accent}  fill="url(#gc)" strokeWidth={2.5} dot={false} />
                    <Area type="monotone" dataKey="invested" name="Invested" stroke={C.accent2} fill="url(#gi)" strokeWidth={2}   dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </>
            )}

            {/* Tax view */}
            {activeTab==="tax" && (
              <>
                <div style={{ fontSize:11, color:C.muted, marginBottom:14 }}>Annual tax breakdown — SWP tax vs partial redemption tax per year</div>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={chartData} margin={{top:5,right:5,left:5,bottom:5}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="year" stroke={C.muted} tick={{fontSize:10,fill:C.muted,fontFamily:"'Space Mono',monospace"}} />
                    <YAxis stroke={C.muted} tick={{fontSize:10,fill:C.muted,fontFamily:"'Space Mono',monospace"}} tickFormatter={fmt} width={74} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{fontSize:11,fontFamily:"'Space Mono',monospace"}} />
                    <Bar dataKey="swpTaxYear"     name="SWP Tax"     fill={C.accent3} radius={[3,3,0,0]} />
                    <Bar dataKey="partialTaxYear" name="Partial Tax" fill={C.accent4} radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>

                {/* Summary grid */}
                <div style={{ marginTop:16, background:C.surface, borderRadius:12, padding:16, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                  {[
                    {label:"Capital Gains",     val:fmt(summary.corpus - summary.costBasis + summary.partialTax + summary.swpTax), color:C.accent3},
                    {label:"Tax on SWP",         val:fmt(summary.swpTax),      color:C.accent3},
                    {label:"Tax on Partials",    val:fmt(summary.partialTax),  color:C.accent4},
                    {label:"Final Redeem Tax",   val:fmt(summary.finalTax),    color:C.accent5},
                    {label:"Total Tax",          val:fmt(summary.totalTax),    color:C.accent4},
                    {label:"Post-Tax Corpus",    val:fmt(summary.postTaxCorpus), color:C.accent2},
                  ].map(({label,val,color})=>(
                    <div key={label} style={{ borderBottom:`1px solid ${C.border}`, paddingBottom:10 }}>
                      <div style={{ fontSize:10, color:C.muted, marginBottom:3 }}>{label}</div>
                      <div style={{ fontSize:14, fontWeight:700, color, fontFamily:"'Space Mono',monospace" }}>{val}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Table */}
            {activeTab==="table" && (
              <div style={{ overflowY:"auto", maxHeight:400 }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, fontFamily:"'Space Mono',monospace" }}>
                  <thead style={{ position:"sticky", top:0, background:C.card }}>
                    <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                      {["Yr","Invested","Corpus","Gains","SWP Net","Partial Net","Tax/Yr","Total Tax"].map(h=>(
                        <th key={h} style={{ padding:"8px 7px", textAlign:"right", color:C.muted, fontWeight:700, fontSize:10 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((row,i)=>(
                      <tr key={i} style={{ borderBottom:`1px solid ${C.border}22`, background:i%2===0?"transparent":`${C.surface}66` }}>
                        <td style={{ padding:"6px 7px", textAlign:"right", color:C.muted }}>{row.year}</td>
                        <td style={{ padding:"6px 7px", textAlign:"right", color:C.accent2 }}>{fmt(row.invested)}</td>
                        <td style={{ padding:"6px 7px", textAlign:"right", color:C.accent, fontWeight:700 }}>{fmt(row.corpus)}</td>
                        <td style={{ padding:"6px 7px", textAlign:"right", color:C.accent3 }}>{fmt(row.gains)}</td>
                        <td style={{ padding:"6px 7px", textAlign:"right", color:C.muted }}>{row.swpNet>0?fmt(row.swpNet):"—"}</td>
                        <td style={{ padding:"6px 7px", textAlign:"right", color:row.partialNetYear>0?C.accent4:C.muted, fontWeight:row.partialNetYear>0?700:400 }}>
                          {row.partialNetYear>0?fmt(row.partialNetYear):"—"}
                        </td>
                        <td style={{ padding:"6px 7px", textAlign:"right", color:C.accent4 }}>{row.totalTaxYear>0?fmt(row.totalTaxYear):"—"}</td>
                        <td style={{ padding:"6px 7px", textAlign:"right", color:C.accent5 }}>{fmt(row.totalTaxCum)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Milestones */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:16 }}>
            <div style={{ fontSize:11, color:C.muted, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:10, fontWeight:700 }}>🏁 Corpus at Milestones</div>
            <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
              {milestones.map(m => {
                const row = chartData.find(r => r.year===m);
                if (!row) return null;
                return (
                  <div key={m} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 12px", flex:"1 1 55px", minWidth:58, textAlign:"center" }}>
                    <div style={{ fontSize:10, color:C.muted, marginBottom:3 }}>Yr {m}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:C.accent }}>{fmt(row.corpus)}</div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      <div style={{ maxWidth:1160, margin:"12px auto 0", fontSize:10, color:C.muted, textAlign:"center", lineHeight:1.7 }}>
        * New Regime 2024: Equity LTCG 12.5% (above ₹1.25L/yr exemption), Debt at slab rate, +4% cess on all. Partial redemption tax uses LTCG rate (assumes &gt;1yr holding).<br/>
        Illustrative only — not financial or tax advice. Consult a SEBI-registered advisor & CA.
      </div>
    </div>
  );
}
