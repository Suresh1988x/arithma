import { useState, useEffect, useCallback } from "react";

// PartyLedgerPage.js — ARITHMA Party Ledger
// Party Types: Customer | Vendor | Staff | LC | TDS
// Features:
//   • Left sidebar: filter by all 5 party types, search, click to select
//   • Running balance per transaction (chronological)
//   • Ageing Report tab (0-30, 31-60, 61-90, 91-180, 180+ days)
//   • Company-specific: entries filtered by company_id
//   • PDF + CSV export

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";
const NAVY    = "#1B3A5C";
const BORDER  = "#D6D0C2";
const DIM     = "#6B645A";
const ERR     = "#A8453B";
const GREEN   = "#2E7D4F";
const CREAM   = "#F7F4ED";
const LIGHT   = "#EDF3FB";
const GOLD    = "#B8860B";

// Known colors for the 5 original built-in types. Any other type
// (Share Capital, Directors, Payables, LTL, STL, or future additions)
// gets a deterministic color assigned by getTypeColor() below, so the
// sidebar never breaks or shows "undefined" styling for a new type.
const KNOWN_TYPE_COLOR = {
  Customer: { bg:"#E8F5E9", color:GREEN,   label:"Customer"  },
  Vendor:   { bg:"#FFF0F0", color:ERR,     label:"Vendor"    },
  Staff:    { bg:"#EDF3FB", color:NAVY,    label:"Staff"     },
  LC:       { bg:"#FFF8E6", color:GOLD,    label:"LC"        },
  TDS:      { bg:"#F3E8FF", color:"#6B2FA0", label:"TDS"     },
};
const FALLBACK_PALETTE = [
  { bg:"#FFF4E5", color:"#B8742E" }, { bg:"#E5F4FF", color:"#1D6FA8" },
  { bg:"#F0EEFF", color:"#5B4FC4" }, { bg:"#E9F7EF", color:"#1E8E5A" },
  { bg:"#FDEBEE", color:"#C23B5E" }, { bg:"#F5F0E6", color:"#8A6D3B" },
];
function getTypeColor(typeName) {
  if (KNOWN_TYPE_COLOR[typeName]) return KNOWN_TYPE_COLOR[typeName];
  // Deterministic hash so the same type always gets the same color
  // across renders/sessions, without needing to hardcode it.
  let hash = 0;
  for (let i = 0; i < typeName.length; i++) hash = (hash * 31 + typeName.charCodeAt(i)) >>> 0;
  const picked = FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
  return { ...picked, label: typeName };
}

const AGEING_BUCKETS = [
  { label:"0–30 days",    min:0,   max:30  },
  { label:"31–60 days",   min:31,  max:60  },
  { label:"61–90 days",   min:61,  max:90  },
  { label:"91–180 days",  min:91,  max:180 },
  { label:"181+ days",    min:181, max:Infinity },
];

function fmt(n, dec=2) {
  const v=Number(n)||0; if(v===0) return "";
  return v.toLocaleString("en-IN",{minimumFractionDigits:dec,maximumFractionDigits:dec});
}
function fmtT(n, dec=2) {
  return (Number(n)||0).toLocaleString("en-IN",{minimumFractionDigits:dec,maximumFractionDigits:dec});
}
function fmtBal(n, showZero=false) {
  const v=Number(n)||0;
  if(v===0 && !showZero) return <span style={{color:DIM}}>—</span>;
  const abs=Math.abs(v).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
  return v>=0
    ? <span style={{color:NAVY,fontWeight:700}}>{abs} Dr</span>
    : <span style={{color:ERR,fontWeight:700}}>{abs} Cr</span>;
}
function daysDiff(dateStr) {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - d) / (1000 * 60 * 60 * 24));
}

const PRINT_CSS=`@media print{
body *{visibility:hidden!important;}
#pl-print-area,#pl-print-area *{visibility:visible!important;}
#pl-print-area{position:absolute;left:0;top:0;width:100%;font-family:Arial,sans-serif;font-size:8px;padding:8mm;box-sizing:border-box;}
.no-print{display:none!important;}
table{border-collapse:collapse;width:100%;}
th{background:#1B3A5C!important;color:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:3px 5px;font-size:8px;}
td{padding:2px 5px;border-bottom:1px solid #eee;font-size:8px;}
tr.ob-row td{background:#FFF8E6!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
tr.tot-row td{background:#1B3A5C!important;color:#fff!important;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
@page{size:A4 landscape;margin:8mm;}}`;
function injectPrint(){
  if(document.getElementById("pl-css"))return;
  const s=document.createElement("style");s.id="pl-css";s.textContent=PRINT_CSS;
  document.head.appendChild(s);
}

// ── Party Selector Sidebar ────────────────────────────────────
function PartySidebar({ parties, selected, onSelect, filterType, onFilterType, partyTypeNames }) {
  const [search, setSearch] = useState("");
  const allOptions = ["All", ...partyTypeNames];

  const filtered = parties.filter(p => {
    const tm = filterType==="All" || p.party_type===filterType;
    const s  = search.toLowerCase();
    return tm && (!s || p.name.toLowerCase().includes(s) || (p.pan||"").includes(s));
  });

  // Group by type
  const groups = {};
  partyTypeNames.forEach(t => { groups[t] = []; });
  filtered.forEach(p => { if(groups[p.party_type]) groups[p.party_type].push(p); });

  return (
    <div style={{width:270,minWidth:270,background:"#FFF",borderRight:`1px solid ${BORDER}`,
      display:"flex",flexDirection:"column",height:"100vh",position:"sticky",top:0,overflowY:"auto"}}>

      <div style={{padding:"12px 12px 8px",borderBottom:`1px solid ${BORDER}`,position:"sticky",top:0,background:"#FFF",zIndex:1}}>
        <div style={{fontSize:11,fontWeight:700,color:NAVY,letterSpacing:"0.08em",marginBottom:8}}>
          PARTY LEDGER
        </div>

        {/* Type filter buttons — every active party type, fetched live */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4,marginBottom:8}}>
          {allOptions.map(t => {
            const tc = t!=="All" ? getTypeColor(t) : null;
            return (
              <button key={t} onClick={()=>onFilterType(t)} style={{
                padding:"4px 2px",fontSize:10,fontWeight:700,cursor:"pointer",
                border:`1px solid ${filterType===t?NAVY:BORDER}`,
                background:filterType===t?NAVY:tc?.bg||"#FFF",
                color:filterType===t?"#FFF":tc?.color||DIM,
              }}>{t}</button>
            );
          })}
        </div>

        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search name or PAN…"
          style={{width:"100%",padding:"6px 8px",border:`1px solid ${BORDER}`,
            fontSize:12,boxSizing:"border-box"}}/>
      </div>

      <div style={{flex:1,overflowY:"auto"}}>
        {filterType==="All" ? (
          // Show all groups
          partyTypeNames.map(type => {
            const pts = groups[type] || [];
            if (pts.length===0) return null;
            const tc = getTypeColor(type);
            return (
              <div key={type}>
                <div style={{padding:"5px 12px",fontSize:9,fontWeight:700,
                  color:tc.color,background:tc.bg,
                  letterSpacing:"0.1em",borderBottom:`1px solid ${BORDER}`,
                  display:"flex",justifyContent:"space-between"}}>
                  <span>{type.toUpperCase()}</span>
                  <span>{pts.length}</span>
                </div>
                {pts.map(p => <PartyRow key={p.id} p={p} selected={selected} onSelect={onSelect} tc={tc}/>)}
              </div>
            );
          })
        ) : (
          // Single type view
          filtered.length===0
            ? <div style={{padding:20,textAlign:"center",color:DIM,fontSize:12}}>
                No {filterType} parties found.<br/>
                <span style={{fontSize:10}}>({parties.length} total parties loaded)</span>
              </div>
            : filtered.map(p => <PartyRow key={p.id} p={p} selected={selected}
                onSelect={onSelect} tc={getTypeColor(p.party_type)}/>)
        )}
      </div>
    </div>
  );
}

function PartyRow({ p, selected, onSelect, tc }) {
  return (
    <div onClick={()=>onSelect(p)} style={{
      padding:"9px 12px",cursor:"pointer",
      background:selected?.id===p.id?LIGHT:"#FFF",
      borderLeft:selected?.id===p.id?`3px solid ${NAVY}`:"3px solid transparent",
      borderBottom:`1px solid #F0EDE5`,
    }}>
      <div style={{fontSize:12,fontWeight:600,color:selected?.id===p.id?NAVY:"#333",
        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
      <div style={{fontSize:10,color:DIM,marginTop:2,display:"flex",gap:6,alignItems:"center"}}>
        <span style={{background:tc.bg,color:tc.color,padding:"1px 5px",
          fontSize:9,fontWeight:700}}>{p.party_type}</span>
        {p.pan && <span>PAN: {p.pan}</span>}
      </div>
    </div>
  );
}

// ── Ageing Report ─────────────────────────────────────────────
function AgeingReport({ parties, allEntries, companyName, fiscalYear, filterType }) {
  const today = new Date();

  const ageing = parties
    .filter(p => filterType==="All" || p.party_type===filterType)
    .map(p => {
      const pEntries = allEntries[p.id] || [];
      const ob = (Number(p.opening_dr)||0) - (Number(p.opening_cr)||0);
      let running = ob;
      pEntries.forEach(e => { running += (Number(e.debit)||0) - (Number(e.credit)||0); });
      const balance = running; // positive = Dr (they owe us), negative = Cr (we owe them)
      if (Math.abs(balance) < 0.01) return null; // skip zero-balance

      // Find oldest outstanding entry
      const outstanding = [];
      let runBal = ob;
      if (ob !== 0) outstanding.push({ date: null, amount: ob, days: 9999 });
      pEntries.forEach(e => {
        const net = (Number(e.debit)||0) - (Number(e.credit)||0);
        runBal += net;
        if (net !== 0) outstanding.push({ date: e.entry_date, amount: net, days: daysDiff(e.entry_date) });
      });

      // Simple ageing: distribute closing balance across buckets
      const buckets = [0,0,0,0,0];
      let remaining = balance;
      // Walk from oldest to newest
      const sorted = [...outstanding].sort((a,b) => b.days - a.days);
      sorted.forEach(item => {
        if (Math.abs(remaining) < 0.01) return;
        const contrib = Math.min(Math.abs(item.amount), Math.abs(remaining)) * Math.sign(remaining);
        const bi = AGEING_BUCKETS.findIndex(b => item.days >= b.min && item.days <= b.max);
        if (bi >= 0) buckets[bi] += contrib;
        remaining -= contrib;
      });

      return { party: p, balance, buckets };
    }).filter(Boolean);

  const bucketTotals = [0,0,0,0,0];
  ageing.forEach(r => r.buckets.forEach((v,i) => bucketTotals[i]+=v));
  const grandTotal = ageing.reduce((s,r) => s+r.balance, 0);

  const TH  = {padding:"7px 8px",fontSize:10,fontWeight:700,color:"#FFF",background:NAVY,whiteSpace:"nowrap"};
  const THR = {...TH,textAlign:"right"};
  const TD  = {padding:"8px 8px",fontSize:12,borderBottom:`1px solid ${BORDER}`,whiteSpace:"nowrap"};
  const TDR = {...TD,textAlign:"right",fontFamily:"monospace"};

  if (ageing.length===0) return (
    <div style={{padding:40,textAlign:"center",color:DIM}}>
      No outstanding balances found{filterType!=="All"?` for ${filterType}s`:""}.
    </div>
  );

  return (
    <div>
      <div style={{fontSize:14,fontWeight:700,color:NAVY,marginBottom:4}}>
        Ageing Report — {filterType==="All"?"All Parties":filterType+"s"}
      </div>
      <div style={{fontSize:12,color:DIM,marginBottom:14}}>
        {companyName} · FY {fiscalYear} · As of today · {ageing.length} parties with outstanding balances
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",minWidth:900}}>
          <thead>
            <tr>
              <th style={TH}>PARTY NAME</th>
              <th style={TH}>TYPE</th>
              <th style={TH}>PAN</th>
              {AGEING_BUCKETS.map(b => <th key={b.label} style={THR}>{b.label}</th>)}
              <th style={{...THR,background:"#243F6B"}}>TOTAL OUTSTANDING</th>
            </tr>
          </thead>
          <tbody>
            {ageing.map((r,i) => {
              const tc = getTypeColor(r.party.party_type);
              return (
                <tr key={r.party.id} style={{background:i%2===0?"#FFF":LIGHT}}>
                  <td style={{...TD,fontWeight:600}}>{r.party.name}</td>
                  <td style={{...TD}}>
                    <span style={{background:tc.bg,color:tc.color,padding:"2px 7px",
                      fontSize:10,fontWeight:700}}>{r.party.party_type}</span>
                  </td>
                  <td style={{...TD,fontFamily:"monospace",fontSize:11}}>{r.party.pan||"—"}</td>
                  {r.buckets.map((v,bi) => (
                    <td key={bi} style={{...TDR,
                      color:v>0?NAVY:v<0?ERR:DIM,
                      background:Math.abs(v)>0&&bi>=3?"#FFF8F0":"inherit"}}>
                      {v!==0 ? fmtT(Math.abs(v)) : ""}
                    </td>
                  ))}
                  <td style={{...TDR,fontWeight:700,
                    color:r.balance>0?NAVY:ERR,background:LIGHT}}>
                    {fmtT(Math.abs(r.balance))} {r.balance>=0?"Dr":"Cr"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{background:NAVY}}>
              <td colSpan={3} style={{padding:"9px 8px",fontWeight:700,color:"#FFF",fontSize:12}}>
                TOTAL ({ageing.length} parties)
              </td>
              {bucketTotals.map((v,i) => (
                <td key={i} style={{...TDR,fontWeight:700,color:"#90EE90",background:NAVY,borderBottom:"none"}}>
                  {v!==0?fmtT(Math.abs(v)):""}
                </td>
              ))}
              <td style={{...TDR,fontWeight:800,color:"#FFD700",background:"#243F6B",borderBottom:"none",fontSize:13}}>
                {fmtT(Math.abs(grandTotal))} {grandTotal>=0?"Dr":"Cr"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function PartyLedgerPage({ session, companyId, companies, homeSettings, onGoToPurchase, onGoToImport, onGoToSales, initialTab }) {
  const [parties,    setParties]    = useState([]);
  const [entries,    setEntries]    = useState([]);       // current party entries
  const [allEntries, setAllEntries] = useState({});       // {party_id: [entries]} for ageing
  const [selParty,   setSelParty]   = useState(null);
  const [filterType, setFilterType] = useState("All");
  const [dateFrom,   setDateFrom]   = useState("");
  const [dateTo,     setDateTo]     = useState("");
  const [activeTab,  setActiveTab]  = useState(initialTab || "ledger"); // "ledger" | "ageing" | "voided"
  const [ageingType, setAgeingType] = useState("All");  // party type filter for ageing tab
  const [loading,    setLoading]    = useState(false);
  const [ageingLoad, setAgeingLoad] = useState(false);
  const [error,      setError]      = useState("");
  const [partyTypeNames, setPartyTypeNames] = useState(["Customer","Vendor","Staff","LC","TDS"]); // fallback until fetched

  const companyName = homeSettings?.company_name || companies?.find(c=>c.id===companyId)?.name||"";
  const fiscalYear  = homeSettings?.fiscal_year_bs || session?.fiscal_year_bs||"";
  injectPrint();

  // Fetch live party types (so Share Capital, Directors, Payables, LTL,
  // STL — and any future additions — show up without a code change)
  useEffect(()=>{
    fetch(`${BACKEND}/api/party-types`)
      .then(r=>r.json())
      .then(d=>{
        const names = (d.party_types||[]).map(t=>t.type_name);
        if(names.length>0) setPartyTypeNames(names);
      })
      .catch(e=>console.error("[PartyLedger] party-types fetch failed:", e));
  },[]);

  // Fetch all parties for this company
  useEffect(()=>{
    if(!companyId)return;
    fetch(`${BACKEND}/api/parties?company_id=${companyId}&limit=1000`)
      .then(r=>r.json())
      .then(d=>{
        if(d.error) { console.error("[PartyLedger] parties fetch error:", d.error); return; }
        console.log(`[PartyLedger] loaded ${(d.parties||[]).length} parties for company ${companyId}`);
        setParties(d.parties||[]);
      })
      .catch(e=>console.error("[PartyLedger] parties fetch failed:", e));
  },[companyId]);

  // Fetch ledger for selected party
  const fetchLedger = useCallback(async()=>{
    if(!companyId||!selParty) return;
    setLoading(true); setError("");
    try {
      let url=`${BACKEND}/api/party-ledger?company_id=${companyId}&party_id=${selParty.id}&limit=1000`;
      if(dateFrom) url+=`&from_date=${dateFrom}`;
      if(dateTo)   url+=`&to_date=${dateTo}`;
      const res=await fetch(url);
      const data=await res.json();
      if(data.error) { setError(data.error); }
      else {
        setEntries(data.entries||[]);
        // Update selParty with opening balance data from API
        if(data.party) {
          setSelParty(prev => ({
            ...prev,
            opening_dr: data.party.opening_dr || 0,
            opening_cr: data.party.opening_cr || 0,
            opening_balance: data.party.opening_balance || 0,
          }));
        }
      }
    } catch { setError("Could not load party ledger."); }
    finally { setLoading(false); }
  },[companyId,selParty?.id,dateFrom,dateTo]);

  useEffect(()=>{ fetchLedger(); },[fetchLedger]);

  // Fetch all party entries for ageing (when ageing tab opens)
  const fetchAllForAgeing = useCallback(async()=>{
    if(!companyId || parties.length===0) return;
    setAgeingLoad(true);
    try {
      const results = await Promise.all(
        parties.map(p =>
          fetch(`${BACKEND}/api/party-ledger?company_id=${companyId}&party_id=${p.id}&limit=500`)
            .then(r=>r.json())
            .then(d=>({ id:p.id, entries:d.entries||[] }))
            .catch(()=>({ id:p.id, entries:[] }))
        )
      );
      const map = {};
      results.forEach(r => { map[r.id]=r.entries; });
      setAllEntries(map);
    } finally { setAgeingLoad(false); }
  },[companyId,parties]);

  useEffect(()=>{
    if(activeTab==="ageing" && parties.length>0 && Object.keys(allEntries).length===0) {
      fetchAllForAgeing();
    }
  },[activeTab,parties,allEntries,fetchAllForAgeing]);

  // Split entries: active (non-void) vs voided
  const activeEntries = entries.filter(e => !e.is_void && e.txn_type !== "Void");
  const voidedEntries = entries.filter(e => e.is_void || e.txn_type === "Void");

  // Totals for selected party
  // opening_dr/opening_cr set by API response (vendor=credit, customer=debit)
  const openingBal = selParty
    ? (Number(selParty.opening_dr)||0) - (Number(selParty.opening_cr)||0) : 0;
  // Totals only from active (non-voided) entries
  const totals = activeEntries.reduce((a,e)=>({
    dr:a.dr+(Number(e.debit)||0),
    cr:a.cr+(Number(e.credit)||0),
  }),{dr:0,cr:0});
  const closingBal = openingBal + totals.dr - totals.cr;

  // CSV export
  const exportCSV=()=>{
    if(!selParty) return;
    const hdrs=["Date","Txn Type","Reference","Description","Debit","Credit","Running Balance","Source"];
    const rows=[hdrs];
    let running=openingBal;
    rows.push(["Opening","Opening Balance","OB","Balance b/f",
      openingBal>0?openingBal:0,openingBal<0?Math.abs(openingBal):0,openingBal,"OB"]);
    activeEntries.forEach(e=>{
      running+=(Number(e.debit)||0)-(Number(e.credit)||0);
      rows.push([e.entry_date,e.txn_type,e.reference,e.description||"",
        e.debit||"",e.credit||"",running,e.source]);
    });
    rows.push(["","CLOSING BALANCE","","",fmtT(totals.dr),fmtT(totals.cr),closingBal,""]);
    const csv=rows.map(r=>r.map(v=>`"${v??''}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download=`party_ledger_${selParty.name}_${companyName}.csv`.replace(/\s+/g,"_");
    a.click();
  };

  const TH  ={padding:"7px 8px",fontSize:10,fontWeight:700,color:"#FFF",background:NAVY,whiteSpace:"nowrap"};
  const THR ={...TH,textAlign:"right"};
  const TD  ={padding:"8px 8px",fontSize:12,borderBottom:`1px solid ${BORDER}`,whiteSpace:"nowrap"};
  const TDR ={...TD,textAlign:"right",fontFamily:"monospace"};

  return (
    <div style={{fontFamily:"Arial,sans-serif",background:CREAM,minHeight:"100vh",display:"flex"}}>

      <PartySidebar parties={parties} selected={selParty}
        onSelect={p=>{setSelParty(p);setEntries([]);setError("");}}
        filterType={filterType} onFilterType={t=>{setFilterType(t);setSelParty(null);setEntries([]);setError("");}}
        partyTypeNames={partyTypeNames}/>

      <div id="pl-print-area" style={{flex:1,padding:"22px 20px",overflowY:"auto"}}>

        {/* Tabs */}
        <div className="no-print" style={{display:"flex",gap:0,borderBottom:`2px solid ${BORDER}`,marginBottom:16}}>
          {[
            {id:"ledger", label:"Party Statement"},
            {id:"ageing", label:"Ageing Report"},
            {id:"voided", label:"Voided"},
          ].map(t=>(
            <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
              padding:"9px 20px",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,
              background:activeTab===t.id?NAVY:"#FFF",
              color:activeTab===t.id?"#FFF":DIM,
              borderBottom:activeTab===t.id?`2px solid ${NAVY}`:"2px solid transparent",
              marginBottom:-2,
            }}>{t.label}</button>
          ))}

          {/* Spacer + actions */}
          <div style={{flex:1}}/>
          <div style={{display:"flex",gap:8,alignItems:"center",paddingBottom:4}}>
            <button onClick={() => onGoToPurchase && onGoToPurchase()}
              style={{padding:"6px 11px",background:NAVY,color:"#FFF",
                border:`1px solid ${NAVY}`,cursor:"pointer",fontSize:11,fontWeight:700}}>
              🛒 Purchase
            </button>
            <button onClick={() => onGoToImport && onGoToImport()}
              style={{padding:"6px 11px",background:"#FFF",color:NAVY,
                border:`1px solid ${BORDER}`,cursor:"pointer",fontSize:11,fontWeight:600}}>
              📦 Import
            </button>
            <button onClick={() => onGoToSales && onGoToSales()}
              style={{padding:"6px 11px",background:"#FFF",color:NAVY,
                border:`1px solid ${BORDER}`,cursor:"pointer",fontSize:11,fontWeight:600}}>
              🧾 Sales
            </button>
            {activeTab==="ageing" && (
              <button onClick={fetchAllForAgeing} title="Refresh ageing"
                style={{padding:"6px 12px",background:"#FFF",border:`1px solid ${BORDER}`,cursor:"pointer",fontSize:13}}>⟳</button>
            )}
            {activeTab==="ledger" && selParty && (
              <button onClick={exportCSV}
                style={{padding:"6px 14px",background:"#FFF",border:`1px solid ${BORDER}`,cursor:"pointer",fontSize:12,fontWeight:600}}>↓ CSV</button>
            )}
            <button onClick={()=>window.print()}
              style={{padding:"6px 14px",background:"#FFF",border:`1px solid ${BORDER}`,cursor:"pointer",fontSize:12,fontWeight:600,color:ERR}}>↓ PDF</button>
          </div>
        </div>

        {/* ══ AGEING REPORT TAB ══ */}
        {activeTab==="ageing" && (
          ageingLoad ? (
            <div style={{padding:40,textAlign:"center",color:DIM}}>Loading ageing data…</div>
          ) : (
            <>
              {/* Ageing sub-tabs by party type */}
              <div style={{display:"flex",gap:4,marginBottom:16,flexWrap:"wrap"}}>
                {["All",...partyTypeNames].map(t => {
                  const tc = t!=="All" ? getTypeColor(t) : null;
                  const isActive = ageingType===t;
                  return (
                    <button key={t} onClick={()=>setAgeingType(t)} style={{
                      padding:"6px 16px", fontWeight:700, fontSize:12, cursor:"pointer",
                      border:`2px solid ${isActive?NAVY:tc?.color||BORDER}`,
                      background: isActive ? NAVY : tc?.bg||"#FFF",
                      color: isActive ? "#FFF" : tc?.color||DIM,
                    }}>{t}</button>
                  );
                })}
              </div>
              <AgeingReport parties={parties} allEntries={allEntries}
                companyName={companyName} fiscalYear={fiscalYear} filterType={ageingType}/>
            </>
          )
        )}

        {/* ══ PARTY STATEMENT TAB ══ */}
        {activeTab==="ledger" && (
          <>
            {/* Empty state */}
            {!selParty && (
              <div style={{padding:60,textAlign:"center",color:DIM}}>
                <div style={{fontSize:48,marginBottom:16}}>📒</div>
                <div style={{fontSize:16,fontWeight:600,color:NAVY,marginBottom:8}}>Select a Party</div>
                <div style={{fontSize:13}}>Choose any party from the left panel to view their account statement.</div>
                <div style={{marginTop:16,display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
                  {partyTypeNames.map(t=>{
                    const tc=getTypeColor(t);
                    return(
                      <span key={t} style={{background:tc.bg,color:tc.color,
                        padding:"6px 14px",fontSize:12,fontWeight:700}}>
                        {tc.label||t}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {selParty && (
              <>
                {/* Party header */}
                <div style={{marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:4}}>
                    <div style={{fontSize:22,fontWeight:800,color:NAVY}}>{selParty.name}</div>
                    {(() => {
                      const tc=getTypeColor(selParty.party_type);
                      return <span style={{background:tc.bg,color:tc.color,padding:"4px 12px",fontSize:11,fontWeight:700}}>{selParty.party_type}</span>;
                    })()}
                  </div>
                  <div style={{fontSize:12,color:DIM}}>
                    {companyName} · FY {fiscalYear}
                    {selParty.pan && <> · PAN: <strong>{selParty.pan}</strong></>}
                    {selParty.gl_account && <> · GL: <strong>{selParty.gl_account}</strong></>}
                  </div>
                </div>

                {/* Balance cards */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:16}}>
                  {[
                    {label:"OPENING BALANCE", value:`Rs.${fmtT(Math.abs(openingBal))} ${openingBal>=0?"Dr":"Cr"}`, color:openingBal>=0?NAVY:ERR},
                    {label:"TOTAL DEBITS",    value:`Rs.${fmtT(totals.dr)}`,    color:GREEN},
                    {label:"TOTAL CREDITS",   value:`Rs.${fmtT(totals.cr)}`,    color:ERR},
                    {label:"NET MOVEMENT",    value:`Rs.${fmtT(Math.abs(totals.dr-totals.cr))} ${totals.dr>=totals.cr?"Dr":"Cr"}`, color:NAVY},
                    {label:"CLOSING BALANCE", value:`Rs.${fmtT(Math.abs(closingBal))} ${closingBal>=0?"Dr":"Cr"}`, color:closingBal>=0?NAVY:ERR, bold:true},
                  ].map((c,i)=>(
                    <div key={i} style={{background:"#FFF",border:`1px solid ${BORDER}`,padding:"10px 12px"}}>
                      <div style={{fontSize:9,fontWeight:700,color:DIM,letterSpacing:"0.08em",marginBottom:4}}>{c.label}</div>
                      <div style={{fontSize:13,fontWeight:c.bold?800:700,color:c.color,fontFamily:"monospace"}}>{c.value}</div>
                    </div>
                  ))}
                </div>

                {/* Date filters */}
                <div className="no-print" style={{display:"flex",gap:8,marginBottom:14,alignItems:"center"}}>
                  <span style={{fontSize:12,color:DIM}}>From (AD)</span>
                  <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                    style={{padding:"6px 8px",border:`1px solid ${BORDER}`,fontSize:12}}/>
                  <span style={{fontSize:12,color:DIM}}>To</span>
                  <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                    style={{padding:"6px 8px",border:`1px solid ${BORDER}`,fontSize:12}}/>
                  {(dateFrom||dateTo)&&(
                    <button onClick={()=>{setDateFrom("");setDateTo("");}}
                      style={{padding:"5px 10px",background:"#FFF",border:`1px solid ${BORDER}`,fontSize:11,cursor:"pointer",color:DIM}}>✕ Clear</button>
                  )}
                  <span style={{fontSize:12,color:DIM}}>{activeEntries.length} active · {voidedEntries.length} voided</span>
                </div>

                {loading && <div style={{padding:30,textAlign:"center",color:DIM}}>Loading…</div>}
                {error   && <div style={{padding:14,color:ERR,background:"#FFF0F0",border:`1px solid ${ERR}`,marginBottom:12}}>{error}</div>}

                {!loading && !error && (
                  <div style={{overflowX:"auto"}}>
                    <table style={{borderCollapse:"collapse",width:"100%",minWidth:800}}>
                      <thead>
                        <tr>
                          <th style={{...TH,width:90}}>DATE</th>
                          <th style={TH}>TXN TYPE</th>
                          <th style={TH}>REFERENCE / BILL NO</th>
                          {selParty.party_type==="LC" && <th style={{...TH,width:140}}>CHARGE TYPE</th>}
                          <th style={{...TH,minWidth:200}}>DESCRIPTION</th>
                          <th style={THR}>DEBIT (Dr)</th>
                          <th style={THR}>CREDIT (Cr)</th>
                          <th style={THR}>RUNNING BALANCE</th>
                          <th style={TH}>SOURCE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Opening balance row */}
                        <tr className="ob-row" style={{background:"#FFF8E6"}}>
                          <td style={{...TD,color:DIM,fontSize:11}}>—</td>
                          <td style={{...TD,fontSize:11,color:GOLD,fontWeight:600}}>Opening Balance</td>
                          <td style={{...TD,fontFamily:"monospace",fontSize:11,color:GOLD}}>OB</td>
                          {selParty.party_type==="LC" && <td style={{...TD,fontSize:10.5,color:DIM}}>—</td>}
                          <td style={{...TD,fontStyle:"italic",color:DIM}}>Balance brought forward</td>
                          <td style={{...TDR,color:GREEN}}>{openingBal>0?fmtT(openingBal):""}</td>
                          <td style={{...TDR,color:ERR}}>{openingBal<0?fmtT(Math.abs(openingBal)):""}</td>
                          <td style={{...TDR}}>{fmtBal(openingBal, true)}</td>
                          <td style={{...TD,fontSize:10,color:GOLD}}>OB Setup</td>
                        </tr>

                        {activeEntries.length===0 ? (
                          <tr><td colSpan={selParty.party_type==="LC" ? 9 : 8}
                            style={{padding:30,textAlign:"center",color:DIM}}>
                            No transactions found{(dateFrom||dateTo)?" in selected date range":""}.
                          </td></tr>
                        ) : (() => {
                          let running = openingBal;
                          return activeEntries.map((e,i)=>{
                            const dr = Number(e.debit)||0;
                            const cr = Number(e.credit)||0;
                            running += dr - cr;
                            const isReturn = ["Purchase Return","Debit Note","Sales Return","Credit Note"].includes(e.txn_type);
                            const srcColor = e.source==="Purchase_Book"?GREEN:e.source==="Sales_Book"?NAVY:DIM;
                            return(
                              <tr key={e.id||i} style={{background:isReturn?"#FFF5F5":i%2===0?"#FFF":LIGHT}}>
                                <td style={{...TD,fontSize:11}}>{e.entry_date}</td>
                                <td style={{...TD,fontSize:11,fontWeight:600,
                                  color:isReturn?ERR:dr>0&&cr===0?GREEN:NAVY}}>
                                  {e.txn_type}
                                </td>
                                <td style={{...TD,fontFamily:"monospace",fontSize:11,fontWeight:600,color:NAVY}}>
                                  {e.reference}
                                </td>
                                {selParty.party_type==="LC" && (
                                  <td style={{...TD,fontSize:10.5,color:GOLD,fontWeight:600}}>
                                    {e.charge_type || "—"}
                                  </td>
                                )}
                                <td style={{...TD,maxWidth:260,overflow:"hidden",textOverflow:"ellipsis",color:DIM,fontSize:11}}>
                                  {e.description}
                                </td>
                                <td style={{...TDR,color:GREEN,fontWeight:dr>0?700:400}}>{fmt(dr)}</td>
                                <td style={{...TDR,color:ERR,fontWeight:cr>0?700:400}}>{fmt(cr)}</td>
                                <td style={{...TDR}}>{fmtBal(running,true)}</td>
                                <td style={{...TD,fontSize:11,fontWeight:600,color:srcColor}}>{e.source}</td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                      <tfoot>
                        <tr className="tot-row" style={{background:NAVY}}>
                          <td colSpan={selParty.party_type==="LC" ? 5 : 4} style={{padding:"9px 8px",fontWeight:700,color:"#FFF",fontSize:12}}>
                            CLOSING BALANCE — {activeEntries.length} transactions
                          </td>
                          <td style={{...TDR,background:NAVY,fontWeight:700,color:"#90EE90",fontSize:13,borderBottom:"none"}}>{fmtT(totals.dr)}</td>
                          <td style={{...TDR,background:NAVY,fontWeight:700,color:"#FF9999",fontSize:13,borderBottom:"none"}}>{fmtT(totals.cr)}</td>
                          <td style={{...TDR,background:NAVY,fontWeight:800,color:"#FFD700",fontSize:13,borderBottom:"none"}}>
                            {fmtT(Math.abs(closingBal))} {closingBal>=0?"Dr":"Cr"}
                          </td>
                          <td style={{background:NAVY}}/>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ══ VOIDED TAB ══ */}
        {activeTab==="voided" && (
          <div>
            {!selParty ? (
              <div style={{padding:40,textAlign:"center",color:DIM}}>
                Select a party from the left panel to view voided transactions.
              </div>
            ) : voidedEntries.length===0 ? (
              <div style={{padding:30,textAlign:"center",color:DIM,background:"#FFF",border:`1px solid ${BORDER}`}}>
                No voided transactions for {selParty.name}.
              </div>
            ) : (
              <>
                <div style={{fontSize:14,fontWeight:700,color:ERR,marginBottom:4}}>
                  Voided Entries — {selParty.name}
                </div>
                <div style={{fontSize:12,color:DIM,marginBottom:14}}>
                  Reversal entries posted when bills were voided. Dr↔Cr swapped — net effect = zero.
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{borderCollapse:"collapse",width:"100%"}}>
                    <thead>
                      <tr>
                        {["DATE","REFERENCE","DESCRIPTION","DEBIT (Dr)","CREDIT (Cr)","SOURCE"].map(h=>(
                          <th key={h} style={{padding:"7px 8px",fontSize:10,fontWeight:700,
                            color:"#FFF",background:"#7B3030",whiteSpace:"nowrap",
                            textAlign:["DEBIT (Dr)","CREDIT (Cr)"].includes(h)?"right":"left"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {voidedEntries.map((e,i)=>(
                        <tr key={e.id||i} style={{background:i%2===0?"#FFF8F8":"#FFF0F0",opacity:0.85}}>
                          <td style={{padding:"8px",fontSize:11,borderBottom:`1px solid ${BORDER}`,color:DIM,textDecoration:"line-through"}}>{e.entry_date}</td>
                          <td style={{padding:"8px",fontSize:11,borderBottom:`1px solid ${BORDER}`,fontFamily:"monospace",color:ERR,fontWeight:700}}>{e.reference}</td>
                          <td style={{padding:"8px",fontSize:11,borderBottom:`1px solid ${BORDER}`,color:DIM,maxWidth:280,overflow:"hidden",textOverflow:"ellipsis"}}>{e.description}</td>
                          <td style={{padding:"8px",fontSize:12,borderBottom:`1px solid ${BORDER}`,textAlign:"right",fontFamily:"monospace",color:GREEN,fontWeight:Number(e.debit)>0?700:400}}>{fmt(e.debit)}</td>
                          <td style={{padding:"8px",fontSize:12,borderBottom:`1px solid ${BORDER}`,textAlign:"right",fontFamily:"monospace",color:ERR,fontWeight:Number(e.credit)>0?700:400}}>{fmt(e.credit)}</td>
                          <td style={{padding:"8px",fontSize:11,borderBottom:`1px solid ${BORDER}`,color:DIM}}>{e.source}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{background:"#7B3030"}}>
                        <td colSpan={3} style={{padding:"9px 8px",fontWeight:700,color:"#FFF",fontSize:12}}>
                          TOTAL REVERSALS ({voidedEntries.length})
                        </td>
                        <td style={{padding:"9px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:"#90EE90",fontSize:13}}>
                          {fmtT(voidedEntries.reduce((s,e)=>s+(Number(e.debit)||0),0))}
                        </td>
                        <td style={{padding:"9px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:"#FF9999",fontSize:13}}>
                          {fmtT(voidedEntries.reduce((s,e)=>s+(Number(e.credit)||0),0))}
                        </td>
                        <td style={{background:"#7B3030"}}/>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
