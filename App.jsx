import { useState, useMemo } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Area, AreaChart, Line, ReferenceLine, BarChart, Bar
} from "recharts";

const fmt = (n) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)}Cr`
  : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)}L`
  : `₹${Math.round(n).toLocaleString("en-IN")}`;
const fmtFull = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const C = {
  bg: "#0a0f1e", card: "#0f1629", border: "#1e2d4a",
  accent: "#00d4aa", accent2: "#4f8ef7", accent3: "#f7c94f", accent4: "#f7614f",
  accent5: "#b06ef7", text: "#e8f0fe", muted: "#6b7fa3", surface: "#141e35",
};

// ── Tax engine ──────────────────────────────────────────────────────────────
// New regime slabs FY 2024-25
const NEW_REGIME_SLABS = [
  { upto: 300000,   rate: 0    },
  { upto: 700000,   rate: 0.05 },
  { upto: 1000000,  rate: 0.10 },
  { upto: 1200000,  rate: 0.15 },
  { upto: 1500000,  rate: 0.20 },
  { upto: Infinity, rate: 0.30 },
];
const CESS = 0.04;

function slabTax(income) {
  let tax = 0, prev = 0;
  for (const { upto, rate } of NEW_REGIME_SLABS) {
    if (income <= prev) break;
    tax += (Math.min(income, upto) - prev) * rate;
    prev = upto;
  }
  return tax * (1 + CESS);
}

// Equity: LTCG 12.5% above ₹1.25L exemption (Budget 2024), STCG 20%
// Debt  : Taxed as slab (no indexation post Apr 2023)
function calcTaxOnGain({ gain, fundType, isLongTerm, annualIncome }) {
  if (gain <= 0) return 0;
  if (fundType === "debt") {
    const taxWith    = slabTax(annualIncome + gain);
    const taxWithout = slabTax(annualIncome);
    return taxWith - taxWithout;
  }
  // equity / hybrid
  if (!isLongTerm) return gain * 0.20 * (1 + CESS);          // STCG 20%
  const LTCG_EXEMPT = 125000;
  const taxableGain = Math.max(0, gain - LTCG_EXEMPT);
  return taxableGain * 0.125 * (1 + CESS);                   // LTCG 12.5%
}

// ── UI helpers ───────────────────────────────────────────────────────────────
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
    <div style={{ fontSize:small?16:21, fontWeight:800, color, fontFamily:"'Space Mono',monospace", lineHeight:1 }}>{value}</div>
    {sub && <div style={{ fontSize:11, color:C.muted, marginTop:5, fontFamily:"'Space Mono',monospace" }}>{sub}</div>}
  </div>
);

const SegBtn = ({ options, value, onChange }) => (
  <div style={{ display:"flex", background:C.surface, borderRadius:10, padding:3, gap:3 }}>
    {options.map(o => (
      <button key={o.value} onClick={() => onChange(o.value)} style={{
        flex:1, padding:"7px 0", borderRadius:8, border:"none", cursor:"pointer",
        background: value===o.value ? C.accent : "transparent",
        color: value===o.value ? C.bg : C.muted,
        fontSize:11, fontFamily:"'Space Mono',monospace", fontWeight:700, transition:"all .2s"
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

// ── Main Component ────────────────────────────────────────────────────────────
export default function App() {
  // investment params
  const [lumpsum,      setLumpsum]      = useState(500000);
  const [sip,          setSip]          = useState(10000);
  const [sipDuration,  setSipDuration]  = useState(20);
  const [sipStepup,    setSipStepup]    = useState(10);
  const [swp,          setSwp]          = useState(0);
  const [swpStartYear, setSwpStartYear] = useState(10);
  const [rate,         setRate]         = useState(12);
  const [years,        setYears]        = useState(20);
  const [extraLumpsums,setExtraLumpsums]= useState([{ year:5, amount:200000, label:"Bonus" }]);
  const [partialRedemptions,setPartialRedemptions] = useState([{ year:10, amount:500000, label:"Dream Home" }]);
  // tax params
  const [fundType,     setFundType]     = useState("equity");   // equity | debt | hybrid
  const [annualIncome, setAnnualIncome] = useState(1000000);    // other income for slab calc
  const [redeemAll,    setRedeemAll]    = useState(true);       // redeem full corpus at end?
  // UI
  const [activeTab,    setActiveTab]    = useState("growth");

  const addLumpsum    = () => setExtraLumpsums([...extraLumpsums, { year:1, amount:100000, label:"" }]);
  const removeLumpsum = i  => setExtraLumpsums(extraLumpsums.filter((_,idx) => idx!==i));
  const updateLumpsum = (i,field,val) => {
    const u=[...extraLumpsums]; u[i]={...u[i],[field]:field==="label"?val:Number(val)}; setExtraLumpsums(u);
  };
  const addRedemption    = () => setPartialRedemptions([...partialRedemptions, { year:1, amount:100000, label:"" }]);
  const removeRedemption = i  => setPartialRedemptions(partialRedemptions.filter((_,idx) => idx!==i));
  const updateRedemption = (i,field,val) => {
    const u=[...partialRedemptions]; u[i]={...u[i],[field]:field==="label"?val:Number(val)}; setPartialRedemptions(u);
  };

  // ── simulation ──
  const chartData = useMemo(() => {
    const monthlyRate  = Number(rate)/100/12;
    const sipEndYear   = Math.min(Number(sipDuration), Number(years));
    let corpus         = Number(lumpsum);
    let totalInvested  = Number(lumpsum);
    let costBasis      = Number(lumpsum);   // tracks invested amount not yet withdrawn
    let currentSip     = Number(sip);
    let totalWithdrawn = 0;
    let totalTaxPaid   = 0;
    let annualLTCGUsed = 0;                 // reset each year for LTCG exemption tracking
    const rows = [];

    for (let y=1; y<=Number(years); y++) {
      if (y>1) currentSip = currentSip*(1+Number(sipStepup)/100);
      const sipActive = y<=sipEndYear;
      annualLTCGUsed  = 0; // reset exemption each year

      const extraThisYear = extraLumpsums
        .filter(e=>Number(e.year)===y)
        .reduce((s,e)=>s+Number(e.amount),0);
      corpus        += extraThisYear;
      totalInvested += extraThisYear;
      costBasis     += extraThisYear;

      let sipThisYear=0, taxThisYear=0;

      for (let m=0; m<12; m++) {
        corpus = corpus*(1+monthlyRate);
        if (sipActive){ corpus+=currentSip; sipThisYear+=currentSip; costBasis+=currentSip; }

        // SWP with tax
        if (y>=Number(swpStartYear) && Number(swp)>0 && corpus>0) {
          const grossWithdraw = Math.min(Number(swp), corpus);
          const gainRatio     = corpus>0 ? Math.max(0,(corpus-costBasis)/corpus) : 0;
          const gainPortion   = grossWithdraw * gainRatio;
          const costPortion   = grossWithdraw - gainPortion;

          // For equity LTCG, track annual exemption
          let remainingExempt = Math.max(0, 125000 - annualLTCGUsed);
          const taxableGain   = fundType==="equity"||fundType==="hybrid"
            ? Math.max(0, gainPortion - remainingExempt)
            : gainPortion;
          annualLTCGUsed += Math.min(gainPortion, 125000);

          const tax = calcTaxOnGain({
            gain: taxableGain,
            fundType,
            isLongTerm: true,
            annualIncome: Number(annualIncome)
          });

          corpus        -= grossWithdraw;
          corpus         = Math.max(0, corpus);
          costBasis     -= costPortion;
          costBasis      = Math.max(0, costBasis);
          totalWithdrawn+= grossWithdraw - tax;
          totalTaxPaid  += tax;
          taxThisYear   += tax;
        }
      }
      totalInvested += sipThisYear;

      // Partial redemptions at end of year
      const redemptionsThisYear = partialRedemptions.filter(r => Number(r.year) === y);
      let partialRedeemedThisYear = 0;
      let partialTaxThisYear = 0;
      for (const r of redemptionsThisYear) {
        if (corpus <= 0) break;
        const redeemAmt  = Math.min(Number(r.amount), corpus);
        const gainRatio  = corpus > 0 ? Math.max(0, (corpus - costBasis) / corpus) : 0;
        const gainPart   = redeemAmt * gainRatio;
        const costPart   = redeemAmt - gainPart;
        const tax = calcTaxOnGain({ gain: gainPart, fundType, isLongTerm: true, annualIncome: Number(annualIncome) });
        corpus         -= redeemAmt;
        corpus          = Math.max(0, corpus);
        costBasis      -= costPart;
        costBasis       = Math.max(0, costBasis);
        totalWithdrawn += redeemAmt - tax;
        totalTaxPaid   += tax;
        taxThisYear    += tax;
        partialRedeemedThisYear += redeemAmt;
        partialTaxThisYear += tax;
      }

      const gains = Math.max(0, corpus - costBasis);
      rows.push({
        year: y,
        corpus: Math.max(0, corpus),
        invested: totalInvested,
        costBasis: Math.max(0, costBasis),
        gains,
        withdrawn: totalWithdrawn,
        taxPaid: totalTaxPaid,
        taxThisYear,
        partialRedeemed: partialRedeemedThisYear,
        partialTax: partialTaxThisYear,
      });
    }
    return rows;
  }, [lumpsum, sip, sipDuration, sipStepup, swp, swpStartYear, rate, years, extraLumpsums, fundType, annualIncome]);

  // ── final redemption tax ──
  const taxSummary = useMemo(() => {
    const last = chartData[chartData.length-1] || {};
    const corpus    = last.corpus    || 0;
    const costBasis = last.costBasis || 0;
    const totalGain = Math.max(0, corpus - costBasis);

    const redemptionTax = redeemAll
      ? calcTaxOnGain({ gain:totalGain, fundType, isLongTerm:true, annualIncome:Number(annualIncome) })
      : 0;

    const postTaxCorpus    = corpus - redemptionTax;
    const totalTaxOnSWP    = last.taxPaid || 0;
    const grandTotalTax    = totalTaxOnSWP + redemptionTax;
    const totalWithdrawn   = last.withdrawn || 0;
    const totalInvested    = last.invested  || 0;
    const netGains         = postTaxCorpus + totalWithdrawn - totalInvested;

    return { corpus, costBasis, totalGain, redemptionTax, postTaxCorpus, totalTaxOnSWP, grandTotalTax, totalWithdrawn, totalInvested, netGains };
  }, [chartData, fundType, annualIncome, redeemAll]);

  const milestones = [1,3,5,10,15,20,25,30].filter(m=>m<=Number(years));
  const tabs = [
    {id:"growth",   label:"📈 Growth"},
    {id:"tax",      label:"🧾 Tax View"},
    {id:"table",    label:"📋 Year Table"},
  ];

  const fundOptions  = [{value:"equity",label:"Equity"},{value:"debt",label:"Debt"},{value:"hybrid",label:"Hybrid"}];

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"'Space Mono',monospace", color:C.text, padding:"24px 16px" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ maxWidth:1140, margin:"0 auto 22px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:44, height:44, borderRadius:12, background:`linear-gradient(135deg,${C.accent},${C.accent2})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>📈</div>
          <div>
            <h1 style={{ margin:0, fontSize:25, fontFamily:"'Syne',sans-serif", fontWeight:800, background:`linear-gradient(90deg,${C.accent},${C.accent2})`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
              MF Wealth Calculator
            </h1>
            <div style={{ fontSize:11, color:C.muted, letterSpacing:"0.1em" }}>LUMPSUM · SIP · STEP-UP · SWP · TAX (NEW REGIME 2024)</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1140, margin:"0 auto", display:"grid", gridTemplateColumns:"345px 1fr", gap:20 }}>

        {/* ── LEFT ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:13 }}>

          {/* Core */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:18 }}>
            <div style={{ fontSize:11, color:C.accent, letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:14, fontWeight:700 }}>⚡ Core Parameters</div>
            <div style={{ display:"grid", gap:12 }}>
              <InputField label="Initial Lumpsum"      value={lumpsum}     onChange={setLumpsum}     prefix="₹" />
              <InputField label="Monthly SIP"          value={sip}         onChange={setSip}         prefix="₹" />
              <InputField label="SIP Duration"         value={sipDuration} onChange={setSipDuration} suffix="yrs" min={1} max={50} step={1} />
              <InputField label="Annual SIP Step-Up"   value={sipStepup}   onChange={setSipStepup}   suffix="%" min={0} max={50} step={1} />
              <InputField label="Expected Return"      value={rate}        onChange={setRate}        suffix="%" min={1} max={50} step={0.5} />
              <InputField label="Investment Horizon"   value={years}       onChange={setYears}       suffix="yrs" min={1} max={50} step={1} />
            </div>
          </div>

          {/* SWP */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:18 }}>
            <div style={{ fontSize:11, color:C.accent3, letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:14, fontWeight:700 }}>💸 Withdrawal (SWP)</div>
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
                <SegBtn options={fundOptions} value={fundType} onChange={setFundType} />
              </div>
              <InputField label="Your Annual Income (Other)" value={annualIncome} onChange={setAnnualIncome} prefix="₹" />
              <div>
                <div style={{ fontSize:10, color:C.muted, marginBottom:7, letterSpacing:"0.1em" }}>REDEEM FULL CORPUS AT END?</div>
                <SegBtn options={[{value:true,label:"Yes"},{value:false,label:"No — Hold"}]} value={redeemAll} onChange={v=>setRedeemAll(v==="true"||v===true)} />
              </div>

              {/* Tax rules summary */}
              <div style={{ background:C.surface, borderRadius:10, padding:12, fontSize:11, color:C.muted, lineHeight:1.7 }}>
                {fundType==="equity"||fundType==="hybrid" ? (
                  <>
                    <div style={{ color:C.accent, fontWeight:700, marginBottom:4 }}>Equity Rules (Budget 2024)</div>
                    <div>• LTCG (&gt;1yr): <span style={{color:C.text}}>12.5%</span> above ₹1.25L/yr exempt</div>
                    <div>• STCG (&lt;1yr): <span style={{color:C.text}}>20%</span></div>
                    <div>• + 4% Health & Education Cess</div>
                  </>
                ) : (
                  <>
                    <div style={{ color:C.accent3, fontWeight:700, marginBottom:4 }}>Debt Rules (post Apr 2023)</div>
                    <div>• All gains taxed at <span style={{color:C.text}}>slab rate</span></div>
                    <div>• No indexation benefit</div>
                    <div>• + 4% Health & Education Cess</div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Extra Lumpsums */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:18 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:13 }}>
              <div style={{ fontSize:11, color:C.accent2, letterSpacing:"0.14em", textTransform:"uppercase", fontWeight:700 }}>🎯 Extra Lumpsums</div>
              <button onClick={addLumpsum} style={{ background:`${C.accent2}22`, border:`1px solid ${C.accent2}55`, color:C.accent2, borderRadius:8, padding:"5px 12px", fontSize:11, cursor:"pointer", fontFamily:"'Space Mono',monospace", fontWeight:700 }}>+ ADD</button>
            </div>
            {extraLumpsums.length===0 && <div style={{ fontSize:12, color:C.muted, textAlign:"center", padding:"8px 0" }}>No extra investments</div>}
            {extraLumpsums.map((e,i) => (
              <div key={i} style={{ marginBottom:12, background:C.surface, borderRadius:10, padding:10, border:`1px solid ${C.border}` }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1.4fr auto", gap:8, marginBottom:8, alignItems:"end" }}>
                  <div>
                    <div style={{ fontSize:10, color:C.muted, marginBottom:5 }}>YEAR</div>
                    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8 }}>
                      <input type="number" value={e.year} min={1} max={years}
                        onChange={ev=>updateLumpsum(i,"year",ev.target.value)}
                        style={{ width:"100%", background:"transparent", border:"none", outline:"none", color:C.text, fontSize:13, padding:"8px 10px", fontFamily:"'Space Mono',monospace", fontWeight:600, boxSizing:"border-box" }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:C.muted, marginBottom:5 }}>AMOUNT (₹)</div>
                    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8 }}>
                      <input type="number" value={e.amount} min={0}
                        onChange={ev=>updateLumpsum(i,"amount",ev.target.value)}
                        style={{ width:"100%", background:"transparent", border:"none", outline:"none", color:C.text, fontSize:13, padding:"8px 10px", fontFamily:"'Space Mono',monospace", fontWeight:600, boxSizing:"border-box" }} />
                    </div>
                  </div>
                  <button onClick={()=>removeLumpsum(i)} style={{ background:`${C.accent4}22`, border:`1px solid ${C.accent4}44`, color:C.accent4, borderRadius:8, padding:"8px 10px", fontSize:13, cursor:"pointer", alignSelf:"end" }}>✕</button>
                </div>
                <div>
                  <div style={{ fontSize:10, color:C.muted, marginBottom:5 }}>LABEL</div>
                  <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8 }}>
                    <input type="text" value={e.label} placeholder="e.g. Bonus, FD Maturity"
                      onChange={ev=>updateLumpsum(i,"label",ev.target.value)}
                      style={{ width:"100%", background:"transparent", border:"none", outline:"none", color:C.text, fontSize:12, padding:"8px 10px", fontFamily:"'Space Mono',monospace", boxSizing:"border-box" }} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Partial Redemptions */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:18, borderLeft:`3px solid ${C.accent4}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:13 }}>
              <div style={{ fontSize:11, color:C.accent4, letterSpacing:"0.14em", textTransform:"uppercase", fontWeight:700 }}>💰 Partial Redemptions</div>
              <button onClick={addRedemption} style={{ background:`${C.accent4}22`, border:`1px solid ${C.accent4}55`, color:C.accent4, borderRadius:8, padding:"5px 12px", fontSize:11, cursor:"pointer", fontFamily:"'Space Mono',monospace", fontWeight:700 }}>+ ADD</button>
            </div>
            <div style={{ fontSize:11, color:C.muted, marginBottom:12, lineHeight:1.6 }}>
              One-time withdrawals at specific years. Tax on gains calculated automatically.
            </div>
            {partialRedemptions.length===0 && <div style={{ fontSize:12, color:C.muted, textAlign:"center", padding:"8px 0" }}>No partial redemptions added</div>}
            {partialRedemptions.map((r,i) => (
              <div key={i} style={{ marginBottom:12, background:C.surface, borderRadius:10, padding:10, border:`1px solid ${C.border}` }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1.4fr auto", gap:8, marginBottom:8, alignItems:"end" }}>
                  <div>
                    <div style={{ fontSize:10, color:C.muted, marginBottom:5 }}>YEAR</div>
                    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8 }}>
                      <input type="number" value={r.year} min={1} max={years}
                        onChange={ev=>updateRedemption(i,"year",ev.target.value)}
                        style={{ width:"100%", background:"transparent", border:"none", outline:"none", color:C.text, fontSize:13, padding:"8px 10px", fontFamily:"'Space Mono',monospace", fontWeight:600, boxSizing:"border-box" }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:C.muted, marginBottom:5 }}>AMOUNT (₹)</div>
                    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8 }}>
                      <input type="number" value={r.amount} min={0}
                        onChange={ev=>updateRedemption(i,"amount",ev.target.value)}
                        style={{ width:"100%", background:"transparent", border:"none", outline:"none", color:C.text, fontSize:13, padding:"8px 10px", fontFamily:"'Space Mono',monospace", fontWeight:600, boxSizing:"border-box" }} />
                    </div>
                  </div>
                  <button onClick={()=>removeRedemption(i)} style={{ background:`${C.accent4}22`, border:`1px solid ${C.accent4}44`, color:C.accent4, borderRadius:8, padding:"8px 10px", fontSize:13, cursor:"pointer", alignSelf:"end" }}>✕</button>
                </div>
                <div>
                  <div style={{ fontSize:10, color:C.muted, marginBottom:5 }}>LABEL (purpose)</div>
                  <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8 }}>
                    <input type="text" value={r.label} placeholder="e.g. Dream Home, Car, Education"
                      onChange={ev=>updateRedemption(i,"label",ev.target.value)}
                      style={{ width:"100%", background:"transparent", border:"none", outline:"none", color:C.text, fontSize:12, padding:"8px 10px", fontFamily:"'Space Mono',monospace", boxSizing:"border-box" }} />
                  </div>
                </div>
                {/* Show tax estimate for this redemption */}
                {(() => {
                  const row = chartData.find(d => d.year === Number(r.year));
                  if (!row || row.corpus <= 0) return null;
                  const gainRatio = Math.max(0, (row.corpus - row.costBasis) / row.corpus);
                  const gainPart  = Math.min(Number(r.amount), row.corpus) * gainRatio;
                  const tax = calcTaxOnGain({ gain: gainPart, fundType, isLongTerm: true, annualIncome: Number(annualIncome) });
                  const net = Math.min(Number(r.amount), row.corpus) - tax;
                  return (
                    <div style={{ marginTop:8, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                      {[
                        {label:"Gain Portion", val:fmt(gainPart), color:C.accent3},
                        {label:"Est. Tax",     val:fmt(tax),      color:C.accent4},
                        {label:"Net Received", val:fmt(net),      color:C.accent},
                      ].map(({label,val,color})=>(
                        <div key={label} style={{ background:C.card, borderRadius:8, padding:"7px 9px", textAlign:"center" }}>
                          <div style={{ fontSize:9, color:C.muted, marginBottom:3 }}>{label}</div>
                          <div style={{ fontSize:12, fontWeight:700, color, fontFamily:"'Space Mono',monospace" }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:13 }}>

          {/* Stat cards row 1 */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:11 }}>
            <StatCard label="Final Corpus (Pre-Tax)"  value={fmt(taxSummary.corpus)}       sub={fmtFull(taxSummary.corpus)}       color={C.accent}  />
            <StatCard label="Post-Tax Corpus"         value={fmt(taxSummary.postTaxCorpus)} sub={fmtFull(taxSummary.postTaxCorpus)} color={C.accent2} />
            <StatCard label="Total Tax Liability"     value={fmt(taxSummary.grandTotalTax)} sub={`SWP tax + redemption tax`}       color={C.accent4} />
            <StatCard label="Net Wealth Gained"       value={fmt(taxSummary.netGains)}      sub={`${taxSummary.totalInvested>0?((taxSummary.netGains/taxSummary.totalInvested)*100).toFixed(1):0}% post-tax return`} color={C.accent3} />
          </div>

          {/* Tax breakdown mini row */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:11 }}>
            <StatCard small label="Total Invested"    value={fmt(taxSummary.totalInvested)}   color={C.accent2} />
            <StatCard small label="Tax on SWP"        value={fmt(taxSummary.totalTaxOnSWP)}   color={C.accent4} />
            <StatCard small label="Tax on Redemption" value={fmt(taxSummary.redemptionTax)}   color={C.accent5} />
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
                fontSize:11, fontFamily:"'Space Mono',monospace", fontWeight:700, transition:"all .2s"
              }}>{t.label}</button>
            ))}
          </div>

          {/* Chart area */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>

            {activeTab==="growth" && (
              <>
                <div style={{ fontSize:11, color:C.muted, marginBottom:14 }}>Corpus vs Invested over {years} years</div>
                <ResponsiveContainer width="100%" height={290}>
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
                    {Number(swp)>0 && <ReferenceLine x={Number(swpStartYear)} stroke={C.accent4} strokeDasharray="4 3" label={{value:"SWP↓",fill:C.accent4,fontSize:10,fontFamily:"'Space Mono',monospace",position:"top"}} />}
                    {Number(sipDuration)<Number(years) && <ReferenceLine x={Number(sipDuration)} stroke={C.accent3} strokeDasharray="4 3" label={{value:"SIP ends",fill:C.accent3,fontSize:10,fontFamily:"'Space Mono',monospace",position:"top"}} />}
                    {partialRedemptions.map((r,i) => (
                      <ReferenceLine key={i} x={Number(r.year)} stroke={C.accent4} strokeDasharray="2 3"
                        label={{value:`↓${r.label||"Redeem"}`,fill:C.accent4,fontSize:9,fontFamily:"'Space Mono',monospace",position:"insideTopRight"}} />
                    ))}
                    <Area type="monotone" dataKey="corpus"   name="Corpus"   stroke={C.accent}  fill="url(#gc)" strokeWidth={2.5} dot={false} />
                    <Area type="monotone" dataKey="invested" name="Invested" stroke={C.accent2} fill="url(#gi)" strokeWidth={2}   dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </>
            )}

            {activeTab==="tax" && (
              <>
                <div style={{ fontSize:11, color:C.muted, marginBottom:14 }}>Annual tax paid on SWP withdrawals + cumulative tax burden</div>
                <ResponsiveContainer width="100%" height={290}>
                  <BarChart data={chartData} margin={{top:5,right:5,left:5,bottom:5}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="year" stroke={C.muted} tick={{fontSize:10,fill:C.muted,fontFamily:"'Space Mono',monospace"}} />
                    <YAxis stroke={C.muted} tick={{fontSize:10,fill:C.muted,fontFamily:"'Space Mono',monospace"}} tickFormatter={fmt} width={74} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{fontSize:11,fontFamily:"'Space Mono',monospace"}} />
                    <Bar dataKey="taxThisYear" name="Tax This Year" fill={C.accent4} radius={[4,4,0,0]} />
                    <Bar dataKey="taxPaid"     name="Cumul. Tax"    fill={C.accent5} radius={[4,4,0,0]} opacity={0.6} />
                  </BarChart>
                </ResponsiveContainer>

                {/* Tax summary box */}
                <div style={{ marginTop:16, background:C.surface, borderRadius:12, padding:16, display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  {[
                    {label:"Total Capital Gains",  val:fmt(taxSummary.totalGain),      color:C.accent3},
                    {label:"Tax on SWP",           val:fmt(taxSummary.totalTaxOnSWP),  color:C.accent4},
                    {label:"Redemption Tax",       val:fmt(taxSummary.redemptionTax),  color:C.accent5},
                    {label:"Total Tax",            val:fmt(taxSummary.grandTotalTax),  color:C.accent4},
                    {label:"Pre-Tax Corpus",       val:fmt(taxSummary.corpus),         color:C.accent},
                    {label:"Post-Tax Corpus",      val:fmt(taxSummary.postTaxCorpus),  color:C.accent2},
                  ].map(({label,val,color})=>(
                    <div key={label} style={{ borderBottom:`1px solid ${C.border}`, paddingBottom:8 }}>
                      <div style={{ fontSize:10, color:C.muted, marginBottom:3 }}>{label}</div>
                      <div style={{ fontSize:15, fontWeight:700, color, fontFamily:"'Space Mono',monospace" }}>{val}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeTab==="table" && (
              <div style={{ overflowY:"auto", maxHeight:380 }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, fontFamily:"'Space Mono',monospace" }}>
                  <thead style={{ position:"sticky", top:0, background:C.card }}>
                    <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                      {["Yr","Invested","Corpus","Gains","Withdrawn","Partial Redeem","Tax/Yr","Cumul.Tax"].map(h=>(
                        <th key={h} style={{ padding:"8px 8px", textAlign:"right", color:C.muted, fontWeight:700, letterSpacing:"0.06em", fontSize:10 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((row,i)=>(
                      <tr key={i} style={{ borderBottom:`1px solid ${C.border}22`, background:i%2===0?"transparent":`${C.surface}66` }}>
                        <td style={{ padding:"6px 8px", textAlign:"right", color:C.muted }}>{row.year}</td>
                        <td style={{ padding:"6px 8px", textAlign:"right", color:C.accent2 }}>{fmt(row.invested)}</td>
                        <td style={{ padding:"6px 8px", textAlign:"right", color:C.accent, fontWeight:700 }}>{fmt(row.corpus)}</td>
                        <td style={{ padding:"6px 8px", textAlign:"right", color:C.accent3 }}>{fmt(row.gains)}</td>
                        <td style={{ padding:"6px 8px", textAlign:"right", color:C.muted }}>{fmt(row.withdrawn)}</td>
                        <td style={{ padding:"6px 8px", textAlign:"right", color:C.accent4 }}>{fmt(row.taxThisYear)}</td>
                        <td style={{ padding:"6px 8px", textAlign:"right", color:C.accent4, fontWeight: row.partialRedeemed>0?700:400 }}>{row.partialRedeemed>0?fmt(row.partialRedeemed):"—"}</td>
                        <td style={{ padding:"6px 8px", textAlign:"right", color:C.accent5 }}>{fmt(row.taxPaid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Milestones */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:16 }}>
            <div style={{ fontSize:11, color:C.muted, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:11, fontWeight:700 }}>🏁 Corpus at Milestones</div>
            <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
              {milestones.map(m=>{
                const row=chartData.find(r=>r.year===m);
                if(!row) return null;
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

      <div style={{ maxWidth:1140, margin:"12px auto 0", fontSize:10, color:C.muted, textAlign:"center", lineHeight:1.7 }}>
        * Tax computed under India's New Tax Regime (Budget 2024). Equity LTCG: 12.5% above ₹1.25L/yr exemption. Debt: slab rate. + 4% cess.<br/>
        Illustrative only — not tax/investment advice. Consult a SEBI-registered advisor & CA before investing or filing.
      </div>
    </div>
  );
}
