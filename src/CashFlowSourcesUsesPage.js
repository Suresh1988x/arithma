import { useState, useEffect, useCallback } from "react";

// CashFlowSourcesUsesPage.js — Advanced CFO Analytics: Cash Sources vs Uses
// Shows where cash came from (sources) and where it went (uses) for a
// selected bank account / GL group / all accounts combined, over a
// chosen date range. Rendered as horizontal flow bars (a simplified
// Sankey-style view) with click-to-expand breakdown per category.

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";
const NAVY    = "#1B3A5C";
const BORDER  = "#D6D0C2";
const DIM     = "#6B645A";
const ERR     = "#A8453B";
const GREEN   = "#2E7D4F";
const CREAM   = "#F7F4ED";
const LIGHT   = "#EDF3FB";
const GOLD    = "#B8860B";

const TYPE_COLORS = {
  AR:     {bar:"#2E7D4F", bg:"#EAF5EE"},
  AP:     {bar:"#A8453B", bg:"#FBEEEC"},
  HR:     {bar:"#B8860B", bg:"#FBF3E2"},
  LC:     {bar:"#0F6E56", bg:"#E6F3EF"},
  GL:     {bar:"#534AB7", bg:"#EEEDFB"},
  TDS:    {bar:"#993556", bg:"#FBEAF0"},
  Contra: {bar:"#5F5E5A", bg:"#F1EFE8"},
};

function fmtT(n) {
  return (Number(n)||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
}

const PRINT_CSS = `@media print{
body *{visibility:hidden!important;}
#cf-print-area,#cf-print-area *{visibility:visible!important;}
#cf-print-area{position:absolute;left:0;top:0;width:100%;font-family:Arial;font-size:10px;padding:8mm;box-sizing:border-box;}
.no-print{display:none!important;}
@page{size:A4 landscape;margin:10mm;}}`;
function injectPrint(){
  if(document.getElementById("cf-css"))return;
  const s=document.createElement("style");s.id="cf-css";s.textContent=PRINT_CSS;
  document.head.appendChild(s);
}

export default function CashFlowSourcesUsesPage({ session, companyId, companies, homeSettings, onBack, onGoToBankCash }) {
  const [accounts,   setAccounts]   = useState([]);
  const [glGroups,   setGlGroups]   = useState([]);
  const [scope,      setScope]      = useState("all");      // all | gl | account
  const [scopeGl,    setScopeGl]    = useState("");
  const [scopeAcct,  setScopeAcct]  = useState("");
  const [dateFrom,   setDateFrom]   = useState("");
  const [dateTo,     setDateTo]     = useState("");
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [expanded,   setExpanded]   = useState({}); // {side_type: bool}
  const [viewMode,   setViewMode]   = useState("condensed"); // condensed | detailed

  const companyName = homeSettings?.company_name || companies?.find(c=>c.id===companyId)?.name || "";
  const fiscalYear  = homeSettings?.fiscal_year_bs || session?.fiscal_year_bs || "";
  injectPrint();

  // Load accounts/GL groups for the scope selectors
  useEffect(()=>{
    if(!companyId) return;
    fetch(BACKEND+"/api/bank-accounts?company_id="+companyId)
      .then(r=>r.json())
      .then(d=>{
        setAccounts(d.accounts||[]);
        setGlGroups(d.gl_groups||[]);
      })
      .catch(()=>{});
  },[companyId]);

  const fetchCashFlow = useCallback(async()=>{
    if(!companyId) return;
    setLoading(true); setError("");
    try{
      let url = BACKEND+"/api/bank-accounts/cash-flow?company_id="+companyId+"&scope="+scope;
      if(scope==="gl" && scopeGl) url += "&gl_code="+encodeURIComponent(scopeGl);
      if(scope==="account" && scopeAcct) url += "&bank_account_id="+scopeAcct;
      if(dateFrom) url += "&from_date="+dateFrom;
      if(dateTo)   url += "&to_date="+dateTo;
      const r = await fetch(url);
      const d = await r.json();
      if(d.error) setError(d.error);
      else setData(d);
    } catch(err){
      setError("Network error: "+err.message);
    } finally {
      setLoading(false);
    }
  },[companyId,scope,scopeGl,scopeAcct,dateFrom,dateTo]);

  useEffect(()=>{
    if(scope==="gl" && !scopeGl && glGroups.length>0) setScopeGl(glGroups[0].gl_code);
    if(scope==="account" && !scopeAcct && accounts.length>0) setScopeAcct(String(accounts[0].id));
  },[scope,glGroups,accounts,scopeGl,scopeAcct]);

  useEffect(()=>{ fetchCashFlow(); },[fetchCashFlow]);

  const maxAmt = data ? Math.max(
    ...data.sources.map(s=>s.amount), ...data.uses.map(u=>u.amount), 1
  ) : 1;

  const toggleExpand = (side, type) => {
    const key = side+"_"+type;
    setExpanded(prev=>({...prev, [key]: !prev[key]}));
  };

  // When switching to Detailed, expand every category. When switching
  // to Condensed, collapse everything. Manual per-row clicks still work
  // afterward to override within either mode.
  useEffect(()=>{
    if(!data) return;
    const next = {};
    if(viewMode==="detailed"){
      data.sources.forEach(s=>{ next["sources_"+s.type] = true; });
      data.uses.forEach(u=>{ next["uses_"+u.type] = true; });
    }
    setExpanded(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[viewMode,data]);

  const exportCSV = () => {
    if(!data) return;
    const rows = [["Side","Type","Label","Amount"]];
    rows.push(["Source","Opening Balance","Balance b/f",data.opening_balance]);
    data.sources.forEach(s=>s.breakdown.forEach(b=>rows.push(["Source",s.type_label,b.label,b.amount])));
    data.uses.forEach(u=>u.breakdown.forEach(b=>rows.push(["Use",u.type_label,b.label,b.amount])));
    rows.push(["","","TOTAL IN",data.total_in]);
    rows.push(["","","TOTAL OUT",data.total_out]);
    rows.push(["","","NET",data.net]);
    rows.push(["","","CLOSING BALANCE",data.closing_balance]);
    const csv = rows.map(r=>r.map(v=>'"'+(v??"")+'"').join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download = ("cash_sources_uses_"+companyName).replace(/\s+/g,"_")+".csv";
    a.click();
  };

  const FlowBar = ({ side, item }) => {
    const colors = TYPE_COLORS[item.type] || TYPE_COLORS.GL;
    const pct = maxAmt>0 ? (item.amount/maxAmt)*100 : 0;
    const key = side+"_"+item.type;
    const isOpen = !!expanded[key];
    return (
      <div style={{marginBottom:10}}>
        <div onClick={()=>toggleExpand(side,item.type)}
          style={{cursor:"pointer",userSelect:"none"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:3,gap:12}}>
            <span style={{textAlign:"left",fontSize:12.5,fontWeight:700,color:"#333",flex:1,fontFamily:"Arial,sans-serif"}}>
              {isOpen?"▾":"▸"} {item.type_label}
            </span>
            <span style={{textAlign:"right",fontSize:13,fontWeight:800,color:colors.bar,fontFamily:"'IBM Plex Mono',monospace",whiteSpace:"nowrap"}}>
              Rs.{fmtT(item.amount)}
            </span>
          </div>
          <div style={{height:18,background:LIGHT,borderRadius:3,overflow:"hidden"}}>
            <div style={{
              height:"100%",width:pct+"%",background:colors.bar,
              transition:"width .3s",borderRadius:3,
              [side==="uses"?"marginLeft":"marginRight"]:side==="uses"?"auto":0,
            }}/>
          </div>
        </div>
        {isOpen && (
          <div style={{marginTop:6,marginLeft:14,paddingLeft:10,borderLeft:"2px solid "+colors.bar}}>
            {item.breakdown.map((b,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",
                padding:"3px 0",fontSize:11,color:DIM,gap:12}}>
                <span style={{textAlign:"left",flex:1,overflow:"hidden",textOverflow:"ellipsis",
                  whiteSpace:"nowrap",fontFamily:"Arial,sans-serif",fontWeight:400,fontStyle:"italic"}}>
                  {b.label}
                </span>
                <span style={{textAlign:"right",fontFamily:"'IBM Plex Mono',monospace",fontWeight:400,
                  whiteSpace:"nowrap",fontSize:11}}>
                  Rs.{fmtT(b.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{fontFamily:"Arial,sans-serif",background:CREAM,minHeight:"100vh",padding:"22px 28px"}}>
      <div id="cf-print-area">

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:22,fontWeight:700,color:NAVY}}>Cash Sources vs Uses</div>
            <div style={{fontSize:12,color:DIM,marginTop:2}}>
              {companyName} · FY {fiscalYear} · Where funds came from and how they moved out
            </div>
          </div>
          <div className="no-print" style={{display:"flex",gap:6}}>
            {onGoToBankCash && (
              <button onClick={onGoToBankCash} style={{padding:"7px 12px",background:"#FFF",
                border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:NAVY}}>
                🏦 Bank &amp; Cash
              </button>
            )}
            {onBack && (
              <button onClick={onBack} style={{padding:"7px 12px",background:"#FFF",
                border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:NAVY}}>
                ← Back
              </button>
            )}
          </div>
        </div>

        {/* Scope + date filters */}
        <div className="no-print" style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{display:"flex",gap:0}}>
            {[["condensed","Condensed"],["detailed","Detailed"]].map(([k,label])=>(
              <button key={k} onClick={()=>setViewMode(k)} style={{
                padding:"7px 14px",border:"1px solid "+GOLD,cursor:"pointer",fontSize:11.5,fontWeight:700,
                background:viewMode===k?GOLD:"#FFF", color:viewMode===k?"#FFF":GOLD,
                borderRight:k==="condensed"?"none":"1px solid "+GOLD,
              }}>{label}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:0}}>
            {[["all","All Accounts"],["gl","By Bank (GL)"],["account","Single Account"]].map(([k,label])=>(
              <button key={k} onClick={()=>setScope(k)} style={{
                padding:"7px 14px",border:"1px solid "+BORDER,cursor:"pointer",fontSize:11.5,fontWeight:600,
                background:scope===k?NAVY:"#FFF", color:scope===k?"#FFF":DIM,
                borderRight:k!=="account"?"none":"1px solid "+BORDER,
              }}>{label}</button>
            ))}
          </div>

          {scope==="gl" && (
            <select value={scopeGl} onChange={e=>setScopeGl(e.target.value)}
              style={{padding:"7px 10px",border:"1px solid "+BORDER,fontSize:12}}>
              {glGroups.map(g=>(
                <option key={g.gl_code} value={g.gl_code}>{g.gl_code} — {g.gl_name}</option>
              ))}
            </select>
          )}
          {scope==="account" && (
            <select value={scopeAcct} onChange={e=>setScopeAcct(e.target.value)}
              style={{padding:"7px 10px",border:"1px solid "+BORDER,fontSize:12}}>
              {accounts.map(a=>(
                <option key={a.id} value={a.id}>{a.account_name}{a.account_no?" ("+a.account_no+")":""}</option>
              ))}
            </select>
          )}

          <span style={{fontSize:12,color:DIM}}>From</span>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
            style={{padding:"6px 8px",border:"1px solid "+BORDER,fontSize:12}}/>
          <span style={{fontSize:12,color:DIM}}>To</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
            style={{padding:"6px 8px",border:"1px solid "+BORDER,fontSize:12}}/>
          {(dateFrom||dateTo) && (
            <button onClick={()=>{setDateFrom("");setDateTo("");}}
              style={{padding:"5px 10px",background:"#FFF",border:"1px solid "+BORDER,
                fontSize:11,cursor:"pointer",color:DIM}}>✕ Clear</button>
          )}
          <div style={{flex:1}}/>
          <button onClick={exportCSV} style={{padding:"6px 14px",background:"#FFF",
            border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:GREEN}}>
            ↓ CSV
          </button>
          <button onClick={()=>window.print()} style={{padding:"6px 14px",background:"#FFF",
            border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:ERR}}>
            ↓ PDF
          </button>
        </div>

        {!dateFrom && !dateTo && (
          <div style={{fontSize:11,color:DIM,marginBottom:10,fontStyle:"italic"}}>
            Showing all-time totals since inception. Set a date range above for a specific period.
          </div>
        )}

        {loading ? (
          <div style={{padding:40,textAlign:"center",color:DIM}}>Loading…</div>
        ) : error ? (
          <div style={{padding:12,color:ERR,background:"#FFF0F0",border:"1px solid "+ERR}}>{error}</div>
        ) : !data ? null : (
          <>
            {/* Summary cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:20}}>
              {[
                {label:"OPENING BALANCE",          value:fmtT(data.opening_balance),  color:NAVY},
                {label:"TOTAL CASH IN (SOURCES)",  value:fmtT(data.total_in),  color:GREEN},
                {label:"TOTAL CASH OUT (USES)",    value:fmtT(data.total_out), color:ERR},
                {label:"CLOSING BALANCE",          value:fmtT(data.closing_balance), color:NAVY, bold:true},
                {label:"NET MOVEMENT",             value:fmtT(Math.abs(data.net))+" "+(data.net>=0?"Surplus":"Deficit"),
                 color:data.net>=0?NAVY:ERR, bold:true},
              ].map((c,i)=>(
                <div key={i} style={{background:"#FFF",border:"1px solid "+BORDER,padding:"12px 14px"}}>
                  <div style={{fontSize:9,fontWeight:700,color:DIM,letterSpacing:"0.08em",marginBottom:5}}>{c.label}</div>
                  <div style={{fontSize:15,fontWeight:c.bold?800:700,color:c.color,fontFamily:"monospace"}}>
                    Rs.{c.value}
                  </div>
                </div>
              ))}
            </div>

            {data.sources.length===0 && data.uses.length===0 ? (
              <div style={{padding:40,textAlign:"center",color:DIM,background:"#FFF",border:"1px solid "+BORDER}}>
                No cash movement found for this scope and date range.
              </div>
            ) : (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
                {/* Sources column */}
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:GREEN,marginBottom:10,
                    borderBottom:"2px solid "+GREEN,paddingBottom:6}}>
                    ↓ SOURCES — where funds came from
                  </div>

                  {/* Opening balance — always the first line */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",
                    padding:"6px 8px",marginBottom:10,background:LIGHT,borderRadius:3,gap:12}}>
                    <span style={{textAlign:"left",fontSize:12.5,fontWeight:700,color:NAVY,fontFamily:"Arial,sans-serif"}}>
                      Opening Balance
                    </span>
                    <span style={{textAlign:"right",fontSize:13,fontWeight:800,color:NAVY,
                      fontFamily:"'IBM Plex Mono',monospace",whiteSpace:"nowrap"}}>
                      Rs.{fmtT(data.opening_balance)}
                    </span>
                  </div>

                  {data.sources.length===0 ? (
                    <div style={{fontSize:12,color:DIM,padding:10}}>No inflows in this period.</div>
                  ) : data.sources.map(item=>(
                    <FlowBar key={item.type} side="sources" item={item}/>
                  ))}
                </div>

                {/* Uses column */}
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:ERR,marginBottom:10,
                    borderBottom:"2px solid "+ERR,paddingBottom:6}}>
                    ↑ USES — how funds moved out
                  </div>
                  {data.uses.length===0 ? (
                    <div style={{fontSize:12,color:DIM,padding:10}}>No outflows in this period.</div>
                  ) : data.uses.map(item=>(
                    <FlowBar key={item.type} side="uses" item={item}/>
                  ))}

                  {/* Closing balance — last line on the Uses side */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",
                    padding:"6px 8px",marginTop:10,background:LIGHT,borderRadius:3,gap:12}}>
                    <span style={{textAlign:"left",fontSize:12.5,fontWeight:700,color:NAVY,fontFamily:"Arial,sans-serif"}}>
                      Closing Balance
                    </span>
                    <span style={{textAlign:"right",fontSize:13,fontWeight:800,color:NAVY,
                      fontFamily:"'IBM Plex Mono',monospace",whiteSpace:"nowrap"}}>
                      Rs.{fmtT(data.closing_balance)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Reconciliation totals — Total In (Opening + Sources) vs Total Out (Uses + Closing) */}
            {(data.sources.length>0 || data.uses.length>0) && (
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:0,marginTop:14,
                border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
                {[
                  {label:"Total In",  sub:"(Opening + Sources)", value:data.opening_balance+data.total_in,  color:GREEN},
                  {label:"Total Out", sub:"(Uses + Closing)",    value:data.total_out+data.closing_balance, color:ERR},
                ].map((c,i)=>(
                  <div key={i} style={{padding:"9px 14px",background:"#FFF",
                    borderLeft:i>0?"1px solid "+BORDER:"none",
                    display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8}}>
                    <span style={{textAlign:"left",fontFamily:"Arial,sans-serif"}}>
                      <span style={{fontSize:12,fontWeight:700,color:"#333"}}>{c.label}</span>
                      <span style={{fontSize:10,color:DIM,marginLeft:6}}>{c.sub}</span>
                    </span>
                    <span style={{textAlign:"right",fontSize:13,fontWeight:800,color:c.color,
                      fontFamily:"'IBM Plex Mono',monospace",whiteSpace:"nowrap"}}>
                      Rs.{fmtT(c.value)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{fontSize:10,color:DIM,marginTop:18,fontStyle:"italic"}}>
              Inter-account transfers (Contra) between your own bank/cash accounts are netted to a single
              line and shown only if non-zero — under "All Accounts" scope this is normally zero since every
              transfer's both legs are included.
              {viewMode==="condensed"
                ? " Click any category to see its breakdown by party or GL account, or switch to Detailed above to expand everything at once."
                : " Detailed view — click any category to collapse it, or switch to Condensed above."}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
