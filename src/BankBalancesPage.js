import { useState, useEffect, useCallback } from "react";

// BankBalancesPage.js — ARITHMA Bank Balances (Advanced CFO Analytics)
// Bank Wise Summary drilled down to Bank Account wise summary balances:
// Opening | Withdrawal | Deposit | Closing — grouped by GL control account,
// with each individual bank account shown as a sub-row underneath.

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";
const NAVY    = "#1B3A5C";
const BORDER  = "#D6D0C2";
const DIM     = "#6B645A";
const ERR     = "#A8453B";
const GREEN   = "#2E7D4F";
const CREAM   = "#F7F4ED";
const LIGHT   = "#EDF3FB";
const GOLD    = "#B8860B";

function fmtT(n) {
  return (Number(n)||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtBal(n) {
  const v = Number(n)||0;
  const abs = Math.abs(v).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
  if (v===0) return <span style={{color:DIM}}>0.00</span>;
  return v>=0
    ? <span style={{color:NAVY,fontWeight:700}}>{abs} Dr</span>
    : <span style={{color:ERR,fontWeight:700}}>{abs} Cr</span>;
}

const PRINT_CSS = `@media print{
body *{visibility:hidden!important;}
#bb-print-area,#bb-print-area *{visibility:visible!important;}
#bb-print-area{position:absolute;left:0;top:0;width:100%;font-family:Arial;font-size:9px;padding:8mm;box-sizing:border-box;}
.no-print{display:none!important;}
table{border-collapse:collapse;width:100%;}
th{background:#1B3A5C!important;color:#fff!important;-webkit-print-color-adjust:exact;padding:4px 6px;font-size:9px;}
td{padding:3px 6px;border-bottom:1px solid #eee;font-size:9px;}
@page{size:A4 landscape;margin:8mm;}}`;
function injectPrint(){
  if(document.getElementById("bb-css"))return;
  const s=document.createElement("style");s.id="bb-css";s.textContent=PRINT_CSS;
  document.head.appendChild(s);
}

export default function BankBalancesPage({ session, companyId, companies, homeSettings, onBack, onGoToBankCash }) {
  const [accounts,   setAccounts]   = useState([]);
  const [glGroups,   setGlGroups]   = useState([]);
  const [grandTotal, setGrandTotal] = useState(null);
  const [dateFrom,   setDateFrom]   = useState("");
  const [dateTo,     setDateTo]     = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  const companyName = homeSettings?.company_name || companies?.find(c=>c.id===companyId)?.name || "";
  const fiscalYear  = homeSettings?.fiscal_year_bs || session?.fiscal_year_bs || "";
  injectPrint();

  const fetchSummary = useCallback(async()=>{
    if(!companyId) return;
    setLoading(true); setError("");
    try{
      let url = BACKEND+"/api/bank-accounts/balances-summary?company_id="+companyId;
      if(dateFrom) url += "&from_date="+dateFrom;
      if(dateTo)   url += "&to_date="+dateTo;
      const r = await fetch(url);
      const d = await r.json();
      if(d.error) setError(d.error);
      else {
        setAccounts(d.accounts||[]);
        setGlGroups(d.gl_groups||[]);
        setGrandTotal(d.grand_total||null);
      }
    } catch(err) {
      setError("Network error: "+err.message);
    } finally {
      setLoading(false);
    }
  },[companyId,dateFrom,dateTo]);

  useEffect(()=>{ fetchSummary(); },[fetchSummary]);

  const exportCSV = () => {
    const hdrs = ["GL Code","GL Name / Account","Opening","Withdrawal","Deposit","Closing"];
    const rows = [hdrs];
    glGroups.forEach(g=>{
      rows.push([g.gl_code, g.gl_name+" (Consolidated)", g.opening, g.withdrawal, g.deposit, g.closing]);
      accounts.filter(a=>a.gl_code===g.gl_code).forEach(a=>{
        rows.push(["", "  "+a.account_name+(a.account_no?" ("+a.account_no+")":""),
          a.opening, a.withdrawal, a.deposit, a.closing]);
      });
    });
    if(grandTotal) rows.push(["","GRAND TOTAL",grandTotal.opening,grandTotal.withdrawal,grandTotal.deposit,grandTotal.closing]);
    const csv = rows.map(r=>r.map(v=>'"'+(v??"")+'"').join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download = ("bank_balances_"+companyName+".csv").replace(/\s+/g,"_");
    a.click();
  };

  const TH  = {padding:"8px 10px",fontSize:10,fontWeight:700,color:"#FFF",background:NAVY,whiteSpace:"nowrap"};
  const THR = {...TH,textAlign:"right"};
  const TD  = {padding:"9px 10px",fontSize:12,borderBottom:"1px solid "+BORDER,whiteSpace:"nowrap"};
  const TDR = {...TD,textAlign:"right",fontFamily:"monospace"};

  return (
    <div style={{fontFamily:"Arial,sans-serif",background:CREAM,minHeight:"100vh",padding:"22px 28px"}}>
      <div id="bb-print-area">

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:22,fontWeight:700,color:NAVY}}>Bank Balances</div>
            <div style={{fontSize:12,color:DIM,marginTop:2}}>
              {companyName} · FY {fiscalYear} · Bank-wise summary drilled down to account-wise balances
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

        {/* Grand total summary cards */}
        {grandTotal && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:18}}>
            {[
              {label:"TOTAL OPENING",    value:fmtT(grandTotal.opening),    color:NAVY},
              {label:"TOTAL WITHDRAWAL", value:fmtT(grandTotal.withdrawal), color:ERR},
              {label:"TOTAL DEPOSIT",    value:fmtT(grandTotal.deposit),    color:GREEN},
              {label:"TOTAL CLOSING",    value:fmtT(grandTotal.closing),    color:NAVY, bold:true},
            ].map((c,i)=>(
              <div key={i} style={{background:"#FFF",border:"1px solid "+BORDER,padding:"12px 14px"}}>
                <div style={{fontSize:9,fontWeight:700,color:DIM,letterSpacing:"0.08em",marginBottom:5}}>{c.label}</div>
                <div style={{fontSize:16,fontWeight:c.bold?800:700,color:c.color,fontFamily:"monospace"}}>
                  Rs.{c.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="no-print" style={{display:"flex",gap:8,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:DIM}}>From (AD)</span>
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
            Showing balances since inception. Set a date range above to view a specific period.
          </div>
        )}

        {loading ? (
          <div style={{padding:40,textAlign:"center",color:DIM}}>Loading…</div>
        ) : error ? (
          <div style={{padding:12,color:ERR,background:"#FFF0F0",border:"1px solid "+ERR}}>{error}</div>
        ) : glGroups.length===0 ? (
          <div style={{padding:40,textAlign:"center",color:DIM,background:"#FFF",border:"1px solid "+BORDER}}>
            No bank or cash accounts found. Add accounts from the Bank &amp; Cash Ledger page.
          </div>
        ) : (
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr>
                  <th style={TH}>GL CODE</th>
                  <th style={{...TH,minWidth:240}}>BANK / ACCOUNT</th>
                  <th style={THR}>OPENING</th>
                  <th style={THR}>WITHDRAWAL</th>
                  <th style={THR}>DEPOSIT</th>
                  <th style={THR}>CLOSING</th>
                </tr>
              </thead>
              <tbody>
                {glGroups.map(g=>{
                  const subAccounts = accounts.filter(a=>a.gl_code===g.gl_code);
                  return [
                    <tr key={"grp-"+g.gl_code} style={{background:"#EFEAE0"}}>
                      <td style={{...TD,fontFamily:"monospace",fontWeight:700,color:NAVY}}>{g.gl_code}</td>
                      <td style={{...TD,fontWeight:700,color:NAVY}}>
                        {g.gl_name} <span style={{fontSize:10,color:DIM,fontWeight:400}}>
                          ({g.account_count} account{g.account_count!==1?"s":""})
                        </span>
                      </td>
                      <td style={{...TDR,fontWeight:700}}>{fmtBal(g.opening)}</td>
                      <td style={{...TDR,fontWeight:700,color:ERR}}>{fmtT(g.withdrawal)}</td>
                      <td style={{...TDR,fontWeight:700,color:GREEN}}>{fmtT(g.deposit)}</td>
                      <td style={{...TDR,fontWeight:800}}>{fmtBal(g.closing)}</td>
                    </tr>,
                    ...subAccounts.map(a=>(
                      <tr key={"acc-"+a.id} style={{background:"#FFF"}}>
                        <td style={TD}/>
                        <td style={{...TD,paddingLeft:28,color:"#333"}}>
                          {a.account_name}
                          {a.account_no && <span style={{fontSize:10,color:DIM,marginLeft:6}}>· {a.account_no}</span>}
                        </td>
                        <td style={TDR}>{fmtBal(a.opening)}</td>
                        <td style={{...TDR,color:Number(a.withdrawal)>0?ERR:DIM}}>{fmtT(a.withdrawal)}</td>
                        <td style={{...TDR,color:Number(a.deposit)>0?GREEN:DIM}}>{fmtT(a.deposit)}</td>
                        <td style={TDR}>{fmtBal(a.closing)}</td>
                      </tr>
                    )),
                  ];
                })}
              </tbody>
              {grandTotal && (
                <tfoot>
                  <tr style={{background:NAVY}}>
                    <td colSpan={2} style={{padding:"10px 10px",fontWeight:800,color:"#FFF",fontSize:13}}>
                      GRAND TOTAL ({accounts.length} account{accounts.length!==1?"s":""})
                    </td>
                    <td style={{...TDR,background:NAVY,fontWeight:800,color:"#FFD700",fontSize:13,borderBottom:"none"}}>
                      Rs.{fmtT(grandTotal.opening)}
                    </td>
                    <td style={{...TDR,background:NAVY,fontWeight:800,color:"#FF9999",fontSize:13,borderBottom:"none"}}>
                      Rs.{fmtT(grandTotal.withdrawal)}
                    </td>
                    <td style={{...TDR,background:NAVY,fontWeight:800,color:"#90EE90",fontSize:13,borderBottom:"none"}}>
                      Rs.{fmtT(grandTotal.deposit)}
                    </td>
                    <td style={{...TDR,background:NAVY,fontWeight:800,color:"#FFD700",fontSize:13,borderBottom:"none"}}>
                      Rs.{fmtT(grandTotal.closing)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
