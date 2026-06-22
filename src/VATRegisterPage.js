import { useState, useEffect, useCallback } from "react";

// VATRegisterPage.js — ARITHMA VAT Register (Purchase-side, merged)
//
// Merges Domestic Purchase Book + Import Register into ONE Input VAT
// register, matching the layout of the Excel's VAT_Summary sheet
// (PURCHASE SIDE section): category rows for Local, Import, Capital,
// Non-Taxable, and Returns — each shown as Taxable | VAT | Total —
// plus a GL_Book reconciliation check against 1320 VAT Input Tax.
//
// This is Purchase/Input VAT only. Sales (Output VAT) and the full
// Net VAT Payable/Refundable return are a separate report, out of
// scope here by design.

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";
const NAVY    = "#1B3A5C";
const BORDER  = "#D6D0C2";
const DIM     = "#6B645A";
const ERR     = "#A8453B";
const GREEN   = "#2E7D4F";
const CREAM   = "#F7F4ED";
const LIGHT   = "#EDF3FB";
const GOLD    = "#B8860B";
const PURPLE  = "#6B4FA0";
const CAP_BG  = "#3A6090";

const fld = {padding:"7px 9px",border:"1px solid "+BORDER,background:"#FFF",
  fontSize:12,boxSizing:"border-box"};
const lbl = {fontSize:9,letterSpacing:"0.1em",color:DIM,fontWeight:700,
  display:"block",marginBottom:3};

function fmtT(n) {
  return (Number(n)||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
}

const NEPALI_MONTHS = ["Baisakh","Jestha","Ashadh","Shrawan","Bhadra","Ashwin",
  "Kartik","Mangsir","Poush","Magh","Falgun","Chaitra"];

const CATEGORY_COLORS = {
  "Local":       "#1B3A5C",
  "Import":      "#1D6FA8",
  "Export":      "#0F8B6C",
  "Capital":     "#6B4FA0",
  "Non-Taxable": "#8A6D3B",
  "Returns":     "#A8453B",
};

const PRINT_CSS = `@media print{
body *{visibility:hidden!important;}
#vat-print-area,#vat-print-area *{visibility:visible!important;}
#vat-print-area{position:absolute;left:0;top:0;width:100%;font-family:Arial;font-size:9px;padding:8mm;box-sizing:border-box;}
.no-print{display:none!important;}
table{border-collapse:collapse;width:100%!important;}
th{background:#1B3A5C!important;color:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:4px 6px;font-size:8px;font-weight:700;}
td{padding:4px 6px;border-bottom:1px solid #e0e0e0;font-size:8px;}
tr.tot-row td{background:#1B3A5C!important;color:#fff!important;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
@page{size:A4 portrait;margin:10mm;}}`;

function injectPrint(){
  if(document.getElementById("vat-reg-css")) return;
  const s=document.createElement("style"); s.id="vat-reg-css"; s.textContent=PRINT_CSS;
  document.head.appendChild(s);
}

// ── Category Pie Chart — pure SVG, no external chart library ───────
// Renders a donut-style pie for the 5 VAT categories (Local/Import or
// Export/Capital/Non-Taxable/Returns). Negative values (Returns) are
// shown by absolute magnitude in the slice — the legend still displays
// the true signed amount so the sign isn't lost, just not represented
// as a "negative angle" (which has no visual meaning in a pie).
function CategoryPieChart({ title, categories, total }) {
  const slices = (categories || []).filter(c => c.taxable !== 0);
  const absTotal = slices.reduce((s, c) => s + Math.abs(c.taxable), 0);
  if (absTotal <= 0) return null;

  const cx = 90, cy = 90, r = 70, innerR = 40; // donut hole
  let cumulativeAngle = -90; // start at 12 o'clock

  const arcs = slices.map((c, i) => {
    const value = Math.abs(c.taxable);
    const angle = (value / absTotal) * 360;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle = endAngle;

    const toXY = (deg, radius) => {
      const rad = (deg * Math.PI) / 180;
      return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
    };
    const [x1, y1] = toXY(startAngle, r);
    const [x2, y2] = toXY(endAngle, r);
    const [ix1, iy1] = toXY(endAngle, innerR);
    const [ix2, iy2] = toXY(startAngle, innerR);
    const largeArc = angle > 180 ? 1 : 0;
    const pct = (value / absTotal) * 100;

    const d = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
      "Z",
    ].join(" ");

    return { d, color: CATEGORY_COLORS[c.category] || "#888", category: c.category, value: c.taxable, pct };
  });

  return (
    <div style={{background:"#FFF",border:"1px solid "+BORDER,padding:"14px 16px"}}>
      <div style={{fontSize:11,fontWeight:700,color:NAVY,marginBottom:10}}>{title}</div>
      <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
        <svg width="180" height="180" viewBox="0 0 180 180" style={{flexShrink:0}}>
          {arcs.map((a, i) => (
            <path key={i} d={a.d} fill={a.color} opacity={0.92}>
              <title>{a.category}: Rs.{fmtT(a.value)} ({a.pct.toFixed(1)}%)</title>
            </path>
          ))}
          <text x={cx} y={cy-4} textAnchor="middle" fontSize="11" fontWeight="700" fill={NAVY} fontFamily="monospace">
            Rs.{fmtT(total)}
          </text>
          <text x={cx} y={cy+12} textAnchor="middle" fontSize="8" fill={DIM}>TOTAL</text>
        </svg>
        <div style={{display:"flex",flexDirection:"column",gap:5,fontSize:11,flex:1,minWidth:140}}>
          {arcs.map((a, i) => (
            <div key={i} style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{width:9,height:9,background:a.color,borderRadius:2,display:"inline-block",flexShrink:0}}/>
              <span style={{color:DIM,flex:1}}>{a.category}</span>
              <span style={{fontFamily:"monospace",fontWeight:600,color:a.value<0?ERR:"#333"}}>
                {a.value<0?"-":""}{fmtT(Math.abs(a.value))}
              </span>
              <span style={{color:DIM,fontSize:9,width:36,textAlign:"right"}}>{a.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Reconciliation Badge ────────────────────────────────────────
function ReconBadge({ recon }) {
  if(!recon) return null;
  const ok = recon.reconciled;
  return (
    <div style={{padding:"12px 16px",marginBottom:18,border:"1px solid "+(ok?GREEN:ERR),
      background:ok?"#F0FFF4":"#FFF0F0",borderRadius:2}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:16}}>{ok?"✅":"⚠"}</span>
          <span style={{fontWeight:700,fontSize:13,color:ok?GREEN:ERR}}>
            GL Book Reconciliation — {ok ? "Matched" : "Discrepancy Found"}
          </span>
        </div>
        <span style={{fontSize:10,color:DIM}}>1320 — VAT Input Tax (Dr)</span>
      </div>
      <div style={{display:"flex",gap:24,marginTop:10,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:9,color:DIM,letterSpacing:"0.08em"}}>GL BOOK (1320 Dr)</div>
          <div style={{fontFamily:"monospace",fontSize:14,fontWeight:700,color:NAVY}}>Rs.{fmtT(recon.vat_input_tax_gl_dr)}</div>
        </div>
        <div>
          <div style={{fontSize:9,color:DIM,letterSpacing:"0.08em"}}>COMPUTED FROM REGISTERS</div>
          <div style={{fontFamily:"monospace",fontSize:14,fontWeight:700,color:NAVY}}>Rs.{fmtT(recon.computed_vat_input)}</div>
        </div>
        <div>
          <div style={{fontSize:9,color:DIM,letterSpacing:"0.08em"}}>DIFFERENCE</div>
          <div style={{fontFamily:"monospace",fontSize:14,fontWeight:700,color:ok?GREEN:ERR}}>
            {recon.difference>=0?"+":""}{fmtT(recon.difference)}
          </div>
        </div>
      </div>
      {!ok && (
        <div style={{fontSize:10,color:ERR,marginTop:8,fontStyle:"italic"}}>
          GL Book and the computed register total don't match. This can happen if a GL entry was posted
          manually outside Purchase Book / Import Register, or if a void wasn't fully reversed. Check the
          GL Book for 1320 entries in this period and compare against the category rows below.
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────
export default function VATRegisterPage({
  session, companyId, companies, homeSettings,
  onGoToPurchaseBook, onGoToImportRegister, onBack
}) {
  const [activeTab, setActiveTab] = useState("summary"); // summary | detail
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterMode, setFilterMode] = useState("range"); // range | month
  const [selectedMonth, setSelectedMonth] = useState("");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Detail register (item/date-wise, merged Purchase Book + Import Register)
  const [detailRows, setDetailRows] = useState([]);
  const [detailTotals, setDetailTotals] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailSource, setDetailSource] = useState("All"); // All | Purchase | Import
  const [detailTxnType, setDetailTxnType] = useState("All"); // All | Purchase | Purchase Return | Debit Note
  const [detailSearch, setDetailSearch] = useState("");

  const companyName = homeSettings?.company_name || companies?.find(c=>c.id===companyId)?.name || "";
  const fiscalYear  = homeSettings?.fiscal_year_bs || session?.fiscal_year_bs || "";
  injectPrint();

  const fetchData = useCallback(async()=>{
    if(!companyId) return;
    setLoading(true); setError("");
    try{
      const params = new URLSearchParams({company_id: companyId});
      if(dateFrom) params.set("date_from", dateFrom);
      if(dateTo)   params.set("date_to", dateTo);
      const r = await fetch(BACKEND+"/api/vat-register?"+params.toString());
      const d = await r.json();
      if(d.error) setError(d.error); else setData(d);
    } catch(e){ setError("Network error: "+e.message); }
    finally{ setLoading(false); }
  },[companyId, dateFrom, dateTo]);

  useEffect(()=>{ fetchData(); },[fetchData]);

  const fetchDetailData = useCallback(async()=>{
    if(!companyId) return;
    setDetailLoading(true); setDetailError("");
    try{
      const params = new URLSearchParams({company_id: companyId, source: detailSource, txn_type: detailTxnType});
      if(dateFrom) params.set("date_from", dateFrom);
      if(dateTo)   params.set("date_to", dateTo);
      if(detailSearch) params.set("search", detailSearch);
      const r = await fetch(BACKEND+"/api/vat-register/detail?"+params.toString());
      const d = await r.json();
      if(d.error) setDetailError(d.error);
      else { setDetailRows(d.rows || []); setDetailTotals(d.totals || null); }
    } catch(e){ setDetailError("Network error: "+e.message); }
    finally{ setDetailLoading(false); }
  },[companyId, dateFrom, dateTo, detailSource, detailTxnType, detailSearch]);

  useEffect(()=>{ if(activeTab==="detail") fetchDetailData(); },[activeTab, fetchDetailData]);

  const clearFilters = () => { setDateFrom(""); setDateTo(""); setSelectedMonth(""); };

  const exportCSV = () => {
    if(!data) return;
    const hdrs = ["Category","Particulars","Source","Count","Taxable Amount","VAT Amount","Total Amount"];
    const lines = [hdrs.join(",")];
    data.categories.forEach(c=>{
      lines.push([c.category,c.particulars,c.source,c.count,c.taxable,c.vat,c.total]
        .map(v=>`"${v??""}"`).join(","));
    });
    lines.push(["TOTAL PURCHASES","","","",data.total_purchases.taxable,data.total_purchases.vat,data.total_purchases.total]
      .map(v=>`"${v??""}"`).join(","));
    lines.push([]);
    lines.push(["GL Reconciliation","","","","","",""].join(","));
    lines.push(["VAT Input Tax (1320, GL Dr)","","","","","",fmtT(data.gl_reconciliation.vat_input_tax_gl_dr)].map(v=>`"${v??""}"`).join(","));
    lines.push(["Computed from Registers","","","","","",fmtT(data.gl_reconciliation.computed_vat_input)].map(v=>`"${v??""}"`).join(","));
    lines.push(["Difference","","","","","",fmtT(data.gl_reconciliation.difference)].map(v=>`"${v??""}"`).join(","));
    const csv = lines.join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download = ("vat_register_"+companyName).replace(/\s+/g,"_")+".csv";
    a.click();
  };

  const exportDetailCSV = () => {
    if(!detailRows.length) return;
    const hdrs = ["Date","Month","Source","Bill/Voucher No","Vendor/Supplier","PAN/LC No",
      "PP No","Product Name","Qty","Rate","Taxable?",
      "Taxable Value","VAT","Total","Non-Taxable Value",
      "Cap Item Name","Cap Qty","Cap Rate","Cap Taxable","Cap VAT","Cap Total",
      "FA Code","Txn Type","Orig Ref","Internal Ref",
      "Import Taxable","Import VAT","Import Total"];
    const lines = [hdrs.join(",")];
    detailRows.forEach(r=>{
      lines.push([r.entry_date,r.month_bs,r.source,r.bill_no,r.vendor_name,r.vendor_pan,
        r.product_code,r.product_name,r.qty,r.rate,r.is_taxable?"Yes":"No",
        r.taxable_value,r.vat_amount,r.total_amount,r.non_taxable_value,
        r.capital_item_name,r.cap_qty,r.cap_rate,r.cap_taxable_value,r.cap_vat,r.cap_total,
        r.fa_code,r.transaction_type,r.original_bill_ref,r.internal_ref,
        r.import_taxable_value,r.import_vat,r.import_total]
        .map(v=>`"${v??""}"`).join(","));
    });
    if(detailTotals){
      lines.push(["TOTAL ("+detailTotals.count+")","","","","","","","","","","",
        detailTotals.taxable,detailTotals.vat,detailTotals.line_total,detailTotals.non_taxable,
        "","","",detailTotals.cap_taxable,detailTotals.cap_vat,detailTotals.cap_total,
        "","","","",
        detailTotals.import_taxable,detailTotals.import_vat,detailTotals.import_total]
        .map(v=>`"${v??""}"`).join(","));
      lines.push(["GRAND TOTAL","","","","","","","","","","","","","","","","","","","","","","","","","","",detailTotals.grand_total]
        .map(v=>`"${v??""}"`).join(","));
    }
    const csv = lines.join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download = ("vat_register_detail_"+companyName).replace(/\s+/g,"_")+".csv";
    a.click();
  };

  const TH  = {padding:"9px 12px",fontSize:10,fontWeight:700,color:"#FFF",background:NAVY,whiteSpace:"nowrap",textAlign:"left"};
  const THR = {...TH,textAlign:"right"};
  const TD  = {padding:"9px 12px",fontSize:12,borderBottom:"1px solid "+BORDER,whiteSpace:"nowrap"};
  const TDR = {...TD,textAlign:"right",fontFamily:"monospace"};
  // Hide the 3 Import-dedicated columns when viewing Purchase-only rows —
  // they'd be empty for every visible row in that filter, matching
  // Purchase Book's own register, which never has these columns at all.
  const showImportCols = detailSource !== "Purchase";

  return (
    <div style={{fontFamily:"Arial,sans-serif",background:CREAM,minHeight:"100vh",padding:"22px 28px"}}>
      <div id="vat-print-area">

        {/* ── Header ── */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
          <div>
            <div style={{fontSize:22,fontWeight:700,color:NAVY}}>VAT Register — Purchase Side</div>
            <div style={{fontSize:12,color:DIM,marginTop:2}}>
              {companyName} · FY {fiscalYear} · Merged Domestic Purchase Book + Import Register (Input VAT)
            </div>
          </div>
          <div className="no-print" style={{display:"flex",gap:6}}>
            {onGoToPurchaseBook && <button onClick={onGoToPurchaseBook} style={{padding:"7px 12px",background:"#FFF",border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:NAVY}}>🛒 Purchase Register</button>}
            {onGoToImportRegister && <button onClick={onGoToImportRegister} style={{padding:"7px 12px",background:"#FFF",border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:NAVY}}>🚢 Import Register</button>}
            {onBack && <button onClick={onBack} style={{padding:"7px 12px",background:"#FFF",border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:NAVY}}>← Back</button>}
          </div>
        </div>
        <div style={{fontSize:10,color:DIM,marginBottom:18,fontStyle:"italic"}}>
          Nepal IRD VAT Return — Purchase Side. Output VAT (Sales) is a separate report.
        </div>

        {/* ── Summary / Detail tabs ── */}
        <div className="no-print" style={{display:"flex",gap:0,borderBottom:"2px solid "+BORDER,marginBottom:18}}>
          {[["summary","📊 Summary"],["detail","📋 Detail Register (Item/Date-wise)"]].map(([k,label])=>(
            <button key={k} onClick={()=>setActiveTab(k)} style={{
              padding:"9px 18px",border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              background:activeTab===k?NAVY:"#FFF", color:activeTab===k?"#FFF":DIM,
              borderBottom:activeTab===k?"2px solid "+NAVY:"2px solid transparent",marginBottom:-2,
            }}>{label}</button>
          ))}
        </div>

        {/* ── Filter bar ── */}
        <div className="no-print" style={{display:"flex",gap:16,alignItems:"flex-end",marginBottom:18,
          padding:"14px 16px",background:"#FFF",border:"1px solid "+BORDER,flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:0}}>
            {[["range","AD Date Range"],["month","Nepali Month"]].map(([k,label])=>(
              <button key={k} onClick={()=>setFilterMode(k)} style={{
                padding:"7px 14px",border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,
                background:filterMode===k?GOLD:"#FFF",color:filterMode===k?"#FFF":DIM,
              }}>{label}</button>
            ))}
          </div>

          {filterMode==="range" ? (
            <>
              <div>
                <label className="sans" style={lbl}>FROM DATE (AD)</label>
                <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={fld}/>
              </div>
              <div>
                <label className="sans" style={lbl}>TO DATE (AD)</label>
                <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={fld}/>
              </div>
            </>
          ) : (
            <div>
              <label className="sans" style={lbl}>NEPALI MONTH</label>
              <select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} style={fld}>
                <option value="">— select month —</option>
                {NEPALI_MONTHS.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
              <div style={{fontSize:9,color:DIM,marginTop:3}}>
                Note: month filtering uses AD-equivalent date range; set From/To above for exact control.
              </div>
            </div>
          )}

          {(dateFrom||dateTo||selectedMonth) && (
            <button onClick={clearFilters} style={{padding:"7px 12px",background:"#FFF",
              border:"1px solid "+BORDER,fontSize:11,cursor:"pointer",color:DIM}}>✕ Clear</button>
          )}

          <div style={{flex:1}}/>
          <button onClick={()=>activeTab==="summary"?fetchData():fetchDetailData()} style={{padding:"7px 14px",background:"#FFF",
            border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:NAVY}}>
            ⟳ Refresh
          </button>
          {activeTab==="summary" ? (
            <>
              <button onClick={exportCSV} disabled={!data} style={{padding:"7px 14px",background:"#FFF",
                border:"1px solid "+BORDER,cursor:data?"pointer":"not-allowed",fontSize:11,fontWeight:600,
                color:data?GREEN:"#CCC"}}>↓ CSV</button>
              <button onClick={()=>window.print()} disabled={!data} style={{padding:"7px 14px",background:"#FFF",
                border:"1px solid "+BORDER,cursor:data?"pointer":"not-allowed",fontSize:11,fontWeight:600,
                color:data?ERR:"#CCC"}}>↓ PDF</button>
            </>
          ) : (
            <>
              <button onClick={exportDetailCSV} disabled={!detailRows.length} style={{padding:"7px 14px",background:"#FFF",
                border:"1px solid "+BORDER,cursor:detailRows.length?"pointer":"not-allowed",fontSize:11,fontWeight:600,
                color:detailRows.length?GREEN:"#CCC"}}>↓ CSV</button>
              <button onClick={()=>window.print()} disabled={!detailRows.length} style={{padding:"7px 14px",background:"#FFF",
                border:"1px solid "+BORDER,cursor:detailRows.length?"pointer":"not-allowed",fontSize:11,fontWeight:600,
                color:detailRows.length?ERR:"#CCC"}}>↓ PDF</button>
            </>
          )}
        </div>

        {activeTab==="summary" && data?.period && (data.period.date_from || data.period.date_to) && (
          <div style={{fontSize:11,color:DIM,marginBottom:14}}>
            Period: {data.period.date_from || "(start)"} to {data.period.date_to || "(today)"}
          </div>
        )}

        {activeTab==="summary" && (loading ? (
          <div style={{padding:50,textAlign:"center",color:DIM}}>Loading VAT Register…</div>
        ) : error ? (
          <div style={{padding:12,color:ERR,background:"#FFF0F0",border:"1px solid "+ERR,marginBottom:18}}>{error}</div>
        ) : !data ? null : (
          <>
            {/* ── Summary cards ── */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:18}}>
              <div style={{background:"#FFF",border:"1px solid "+BORDER,padding:"14px 16px 12px"}}>
                <div style={{fontSize:9,letterSpacing:"0.1em",fontWeight:700,color:DIM,marginBottom:6}}>TAXABLE PURCHASES</div>
                <div style={{fontSize:16,fontWeight:800,color:NAVY,fontFamily:"monospace"}}>Rs.{fmtT(data.total_purchases.taxable)}</div>
              </div>
              <div style={{background:"#FFF",border:"1px solid "+BORDER,padding:"14px 16px 12px"}}>
                <div style={{fontSize:9,letterSpacing:"0.1em",fontWeight:700,color:DIM,marginBottom:6}}>VAT INPUT</div>
                <div style={{fontSize:16,fontWeight:800,color:GREEN,fontFamily:"monospace"}}>Rs.{fmtT(data.total_purchases.vat)}</div>
              </div>
              <div style={{background:NAVY,border:"1px solid "+NAVY,padding:"14px 16px 12px"}}>
                <div style={{fontSize:9,letterSpacing:"0.1em",fontWeight:700,color:"#CBD5E0",marginBottom:6}}>PURCHASE TOTAL</div>
                <div style={{fontSize:16,fontWeight:800,color:"#FFD700",fontFamily:"monospace"}}>Rs.{fmtT(data.total_purchases.total)}</div>
              </div>
              <div style={{background:"#FFF",border:"1px solid "+BORDER,padding:"14px 16px 12px"}}>
                <div style={{fontSize:9,letterSpacing:"0.1em",fontWeight:700,color:DIM,marginBottom:6}}>OUTPUT TOTAL</div>
                <div style={{fontSize:16,fontWeight:800,color:NAVY,fontFamily:"monospace"}}>Rs.{fmtT(data.total_sales?.total)}</div>
              </div>
              <div style={{background:"#FFF",border:"1px solid "+BORDER,padding:"14px 16px 12px"}}>
                <div style={{fontSize:9,letterSpacing:"0.1em",fontWeight:700,color:DIM,marginBottom:6}}>OUTPUT VAT</div>
                <div style={{fontSize:16,fontWeight:800,color:"#A8453B",fontFamily:"monospace"}}>Rs.{fmtT(data.total_sales?.vat)}</div>
              </div>
              <div style={{background:data.net_vat_payable?.is_payable?"#7B2D2D":"#1F5C3D",
                border:"1px solid "+(data.net_vat_payable?.is_payable?"#7B2D2D":"#1F5C3D"),padding:"14px 16px 12px"}}>
                <div style={{fontSize:9,letterSpacing:"0.1em",fontWeight:700,color:"#FFF",opacity:0.85,marginBottom:6}}>
                  NET VAT {data.net_vat_payable?.is_payable?"PAYABLE":"REFUNDABLE"}
                </div>
                <div style={{fontSize:16,fontWeight:800,color:"#FFD700",fontFamily:"monospace"}}>Rs.{fmtT(Math.abs(data.net_vat_payable?.net||0))}</div>
              </div>
            </div>

            {/* ── GL Reconciliation ── */}
            <ReconBadge recon={data.gl_reconciliation}/>

            {/* ── Category breakdown ── */}
            <div style={{overflowX:"auto",marginBottom:18}}>
              <table style={{borderCollapse:"collapse",width:"100%",minWidth:760}}>
                <thead>
                  <tr>
                    <th style={TH}>CATEGORY</th>
                    <th style={TH}>PARTICULARS</th>
                    <th style={TH}>SOURCE</th>
                    <th style={THR}>COUNT</th>
                    <th style={THR}>TAXABLE AMOUNT</th>
                    <th style={THR}>VAT AMOUNT</th>
                    <th style={{...THR,background:"#0F2840"}}>TOTAL AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((c,i)=>(
                    <tr key={c.category} style={{background:i%2===0?"#FFF":"#FAFAFA"}}>
                      <td style={TD}>
                        <span style={{display:"inline-flex",alignItems:"center",gap:6}}>
                          <span style={{width:8,height:8,borderRadius:2,background:CATEGORY_COLORS[c.category]||DIM,display:"inline-block"}}/>
                          <span style={{fontWeight:700,color:CATEGORY_COLORS[c.category]||NAVY}}>{c.category}</span>
                        </span>
                      </td>
                      <td style={TD}>{c.particulars}</td>
                      <td style={{...TD,fontSize:10,color:DIM}}>{c.source}</td>
                      <td style={{...TDR,color:DIM}}>{c.count}</td>
                      <td style={{...TDR,color:c.taxable<0?ERR:"#333"}}>{c.taxable<0?"-":""}{fmtT(Math.abs(c.taxable))}</td>
                      <td style={{...TDR,color:c.vat<0?ERR:GREEN}}>{c.vat<0?"-":""}{fmtT(Math.abs(c.vat))}</td>
                      <td style={{...TDR,fontWeight:700,background:"#F0F4FA",color:c.total<0?ERR:NAVY}}>
                        {c.total<0?"-":""}{fmtT(Math.abs(c.total))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="tot-row" style={{background:NAVY}}>
                    <td colSpan={3} style={{...TD,fontWeight:700,color:"#FFF",background:NAVY}}>TOTAL PURCHASES</td>
                    <td style={{...TDR,fontWeight:700,color:"#FFF",background:NAVY}}>
                      {data.categories.reduce((s,c)=>s+c.count,0)}
                    </td>
                    <td style={{...TDR,fontWeight:800,color:"#FFD700",background:NAVY}}>{fmtT(data.total_purchases.taxable)}</td>
                    <td style={{...TDR,fontWeight:800,color:"#A8F0BB",background:NAVY}}>{fmtT(data.total_purchases.vat)}</td>
                    <td style={{...TDR,fontWeight:800,color:"#FFD700",background:"#0F2840"}}>{fmtT(data.total_purchases.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ── Sales side: SAME 5-category table structure as Purchase
                 (Category | Particulars | Source | Count | Taxable | VAT | Total)
                 rows: Local, Export, Capital, Non-Taxable, Returns ── */}
            {data.sales_categories && (
              <div style={{marginBottom:18}}>
                <div style={{fontSize:11,fontWeight:700,color:DIM,marginBottom:8,letterSpacing:"0.05em"}}>
                  SALES SIDE — OUTPUT VAT
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{borderCollapse:"collapse",width:"100%",minWidth:760}}>
                    <thead>
                      <tr>
                        <th style={TH}>CATEGORY</th>
                        <th style={TH}>PARTICULARS</th>
                        <th style={TH}>SOURCE</th>
                        <th style={THR}>COUNT</th>
                        <th style={THR}>TAXABLE AMOUNT</th>
                        <th style={THR}>VAT AMOUNT</th>
                        <th style={{...THR,background:"#0F2840"}}>TOTAL AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sales_categories.map((c,i)=>(
                        <tr key={c.category} style={{background:i%2===0?"#FFF":"#FAFAFA"}}>
                          <td style={TD}>
                            <span style={{display:"inline-flex",alignItems:"center",gap:6}}>
                              <span style={{width:8,height:8,borderRadius:2,background:CATEGORY_COLORS[c.category]||DIM,display:"inline-block"}}/>
                              <span style={{fontWeight:700,color:CATEGORY_COLORS[c.category]||NAVY}}>{c.category}</span>
                            </span>
                          </td>
                          <td style={TD}>{c.particulars}</td>
                          <td style={{...TD,fontSize:10,color:DIM}}>{c.source}</td>
                          <td style={{...TDR,color:DIM}}>{c.count}</td>
                          <td style={{...TDR,color:c.taxable<0?ERR:"#333"}}>{c.taxable<0?"-":""}{fmtT(Math.abs(c.taxable))}</td>
                          <td style={{...TDR,color:c.vat<0?ERR:GREEN}}>{c.vat<0?"-":""}{fmtT(Math.abs(c.vat))}</td>
                          <td style={{...TDR,fontWeight:700,background:"#F0F4FA",color:c.total<0?ERR:NAVY}}>
                            {c.total<0?"-":""}{fmtT(Math.abs(c.total))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="tot-row" style={{background:NAVY}}>
                        <td colSpan={3} style={{...TD,fontWeight:700,color:"#FFF",background:NAVY}}>TOTAL SALES</td>
                        <td style={{...TDR,fontWeight:700,color:"#FFF",background:NAVY}}>
                          {data.sales_categories.reduce((s,c)=>s+c.count,0)}
                        </td>
                        <td style={{...TDR,fontWeight:800,color:"#FFD700",background:NAVY}}>{fmtT(data.total_sales.taxable)}</td>
                        <td style={{...TDR,fontWeight:800,color:"#A8F0BB",background:NAVY}}>{fmtT(data.total_sales.vat)}</td>
                        <td style={{...TDR,fontWeight:800,color:"#FFD700",background:"#0F2840"}}>{fmtT(data.total_sales.total)}</td>
                      </tr>

                      {/* ── Net VAT Payable / Refundable for the period ── */}
                      {data.net_vat_payable && (
                        <tr style={{background:data.net_vat_payable.is_payable?"#7B2D2D":"#1F5C3D"}}>
                          <td colSpan={6} style={{padding:"10px 12px",fontWeight:800,color:"#FFF",fontSize:13,
                            background:data.net_vat_payable.is_payable?"#7B2D2D":"#1F5C3D"}}>
                            NET VAT {data.net_vat_payable.is_payable?"PAYABLE":"REFUNDABLE / CARRIED FORWARD"}
                            <span style={{fontWeight:400,fontSize:10,marginLeft:8,opacity:0.85}}>
                              (Output VAT {fmtT(data.net_vat_payable.output_vat)} − Input VAT {fmtT(data.net_vat_payable.input_vat)})
                            </span>
                          </td>
                          <td style={{padding:"10px 12px",textAlign:"right",fontFamily:"monospace",fontWeight:800,
                            color:"#FFD700",fontSize:14,background:data.net_vat_payable.is_payable?"#7B2D2D":"#1F5C3D"}}>
                            Rs.{fmtT(Math.abs(data.net_vat_payable.net))}
                          </td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ── Category breakdown pie charts — Purchase & Sales side ── */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:10}}>
              {data.total_purchases.taxable !== 0 && (
                <CategoryPieChart
                  title="PURCHASE — TAXABLE VALUE BY CATEGORY"
                  categories={data.categories}
                  total={data.total_purchases.taxable}
                />
              )}
              {data.total_sales && data.total_sales.taxable !== 0 && (
                <CategoryPieChart
                  title="SALES — TAXABLE VALUE BY CATEGORY"
                  categories={data.sales_categories}
                  total={data.total_sales.taxable}
                />
              )}
            </div>
          </>
        ))}

        {/* ══════════════════════════════════════════
            DETAIL REGISTER TAB — date-wise / item-wise
            Purchase Book + Import Register merged, rendered in the EXACT
            same column format as PurchaseBookPage.js's own register table.
        ══════════════════════════════════════════ */}
        {activeTab==="detail" && (
          <>
            <div className="no-print" style={{display:"flex",gap:8,alignItems:"center",marginBottom:14,flexWrap:"wrap"}}>
              {[
                {label:"All",             source:"All",      txnType:"All"},
                {label:"Purchase",        source:"Purchase", txnType:"Purchase"},
                {label:"Purchase Return", source:"Purchase", txnType:"Purchase Return"},
                {label:"Debit Note",      source:"Purchase", txnType:"Debit Note"},
                {label:"Import",          source:"Import",   txnType:"All"},
              ].map(opt=>{
                const active = detailSource===opt.source && detailTxnType===opt.txnType;
                return (
                  <button key={opt.label} onClick={()=>{ setDetailSource(opt.source); setDetailTxnType(opt.txnType); }} style={{
                    padding:"6px 13px",fontWeight:600,fontSize:12,cursor:"pointer",
                    border:"1px solid "+(active?NAVY:BORDER),
                    background:active?NAVY:"#FFF",color:active?"#FFF":NAVY,
                  }}>{opt.label}</button>
                );
              })}
              <input value={detailSearch} onChange={e=>setDetailSearch(e.target.value)}
                placeholder="Search vendor, product, bill no…"
                style={{width:220,padding:"7px 12px",border:"1px solid "+BORDER,fontSize:12}}/>
              <span style={{fontSize:12,color:DIM}}>{detailRows.length} entries</span>
            </div>

            {detailLoading ? (
              <div style={{padding:50,textAlign:"center",color:DIM}}>Loading…</div>
            ) : detailError ? (
              <div style={{padding:12,color:ERR,background:"#FFF0F0",border:"1px solid "+ERR,marginBottom:18}}>{detailError}</div>
            ) : (
              <div style={{overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",width:"100%",minWidth:1550}}>
                  <thead>
                    {/* Group row */}
                    <tr>
                      <th colSpan={3}  style={{...TH,textAlign:"center",fontSize:9,padding:"4px 8px",background:"#243F6B"}}>DATE / SOURCE</th>
                      <th colSpan={6}  style={{...TH,textAlign:"center",fontSize:9,padding:"4px 8px"}}>PARTY</th>
                      <th colSpan={2}  style={{...TH,textAlign:"center",fontSize:9,padding:"4px 8px",background:"#243F6B"}}>PRODUCT</th>
                      <th colSpan={3}  style={{...TH,textAlign:"center",fontSize:9,padding:"4px 8px"}}>QTY / RATE</th>
                      <th colSpan={4}  style={{...TH,textAlign:"center",fontSize:9,padding:"4px 8px",background:"#243F6B"}}>AMOUNTS</th>
                      <th colSpan={6}  style={{...TH,textAlign:"center",fontSize:9,padding:"4px 8px",background:CAP_BG}}>CAPITAL ITEMS</th>
                      <th colSpan={1}  style={{...TH,textAlign:"center",fontSize:9,padding:"4px 8px"}}>META</th>
                      {showImportCols && (
                        <th colSpan={3}  style={{...TH,textAlign:"center",fontSize:9,padding:"4px 8px",background:"#1D6FA8"}}>IMPORT (NORMAL PURCHASE)</th>
                      )}
                    </tr>
                    {/* Column row */}
                    <tr>
                      <th style={TH}>DATE</th>
                      <th style={TH}>MONTH</th>
                      <th style={TH}>SOURCE</th>
                      <th style={TH}>BILL / VOUCHER NO</th>
                      <th style={TH}>VENDOR / SUPPLIER</th>
                      <th style={TH}>PAN / LC NO</th>
                      <th style={TH}>TXN TYPE</th>
                      <th style={TH}>ORIG REF</th>
                      <th style={{...TH,background:"#243F6B"}}>INTERNAL REF</th>
                      <th style={{...TH,background:"#243F6B"}}>PP NO</th>
                      <th style={{...TH,background:"#243F6B"}}>PRODUCT NAME</th>
                      <th style={THR}>QTY</th>
                      <th style={THR}>RATE</th>
                      <th style={{...TH,textAlign:"center"}}>TAX?</th>
                      <th style={{...THR,background:"#243F6B"}}>TAXABLE VAL</th>
                      <th style={{...THR,background:"#243F6B"}}>VAT</th>
                      <th style={{...THR,background:"#243F6B"}}>TOTAL</th>
                      <th style={{...THR,background:"#243F6B"}}>NON-TAX VAL</th>
                      <th style={{...TH,background:CAP_BG}}>CAP ITEM NAME</th>
                      <th style={{...THR,background:CAP_BG}}>CAP QTY</th>
                      <th style={{...THR,background:CAP_BG}}>CAP RATE</th>
                      <th style={{...THR,background:CAP_BG}}>CAP TAXABLE</th>
                      <th style={{...THR,background:CAP_BG}}>CAP VAT</th>
                      <th style={{...THR,background:CAP_BG}}>CAP TOTAL</th>
                      <th style={TH}>FA CODE</th>
                      {showImportCols && (<>
                        <th style={{...THR,background:"#1D6FA8"}}>IMPORT TAXABLE</th>
                        <th style={{...THR,background:"#1D6FA8"}}>IMPORT VAT</th>
                        <th style={{...THR,background:"#1D6FA8"}}>IMPORT TOTAL</th>
                      </>)}
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.length===0 ? (
                      <tr><td colSpan={showImportCols?28:25} style={{padding:30,textAlign:"center",color:DIM}}>No entries found.</td></tr>
                    ) : detailRows.map((r,i)=>{
                      const isCapRow = !!r.is_capital;
                      const isReturn = r.transaction_type==="Purchase Return"||r.transaction_type==="Debit Note"
                                     ||r.transaction_type==="Sales Return"||r.transaction_type==="Credit Note";
                      const rowBg = r.source==="Import" ? "#F5F9FF" : isReturn ? "#FFF8F8" : (i%2===0?"#FFF":"#FAFAFA");
                      return (
                        <tr key={i} style={{background:rowBg}}>
                          <td style={TD}>{r.entry_date}</td>
                          <td style={{...TD,fontSize:11,color:DIM}}>{r.month_bs}</td>
                          <td style={{...TD,fontSize:9}}>
                            <span style={{padding:"2px 7px",borderRadius:2,fontWeight:700,
                              background:r.source==="Import"?"#E6F1FB":"#F0F4E8",
                              color:r.source==="Import"?"#0C447C":"#4A6B2A"}}>
                              {r.source==="Import"?"IMPORT":"PURCHASE"}
                            </span>
                          </td>
                          <td style={{...TD,fontWeight:700,color:NAVY}}>{r.bill_no}</td>
                          <td style={{...TD,fontWeight:600}}>{r.vendor_name}</td>
                          <td style={{...TD,fontFamily:"monospace",fontSize:11}}>{r.vendor_pan}</td>
                          <td style={{...TD,fontSize:11}}>{r.transaction_type}</td>
                          <td style={{...TD,fontSize:11,color:DIM}}>
                            {isReturn ? <span style={{color:ERR,fontWeight:600}}>{r.original_bill_ref||"—"}</span> : ""}
                          </td>
                          <td style={{...TD,fontFamily:"monospace",fontSize:11,color:NAVY,background:"#243F6B0D"}}>{r.internal_ref}</td>
                          <td style={{...TD,fontSize:11,color:DIM,background:"#243F6B0D"}}>{r.product_code}</td>
                          <td style={TD}>{r.product_name}</td>
                          <td style={TDR}>{fmtT(r.qty)}</td>
                          <td style={TDR}>{fmtT(r.rate)}</td>
                          <td style={{...TD,textAlign:"center",fontWeight:700,color:r.is_taxable?GREEN:ERR}}>{r.is_taxable?"Y":"N"}</td>
                          <td style={{...TDR,color:r.taxable_value<0?ERR:"#333"}}>{r.taxable_value<0?"-":""}{fmtT(Math.abs(r.taxable_value))}</td>
                          <td style={{...TDR,color:"#2A6F77",fontWeight:700}}>{fmtT(r.vat_amount)}</td>
                          <td style={{...TDR,fontWeight:700}}>{fmtT(r.total_amount)}</td>
                          <td style={TDR}>{fmtT(r.non_taxable_value)}</td>
                          <td style={{...TD,background:"#F0F4FA"}}>{isCapRow ? r.capital_item_name : ""}</td>
                          <td style={{...TDR,background:"#F0F4FA"}}>{isCapRow ? fmtT(r.cap_qty) : ""}</td>
                          <td style={{...TDR,background:"#F0F4FA"}}>{isCapRow ? fmtT(r.cap_rate) : ""}</td>
                          <td style={{...TDR,background:"#F0F4FA"}}>{isCapRow ? fmtT(r.cap_taxable_value) : ""}</td>
                          <td style={{...TDR,background:"#F0F4FA",color:"#2A6F77"}}>{isCapRow ? fmtT(r.cap_vat) : ""}</td>
                          <td style={{...TDR,background:"#F0F4FA",fontWeight:700}}>{isCapRow ? fmtT(r.cap_total) : ""}</td>
                          <td style={{...TD,fontSize:11,color:DIM}}>{r.fa_code}</td>
                          {showImportCols && (<>
                            <td style={{...TDR,background:"#EDF3FB"}}>{r.import_taxable_value ? fmtT(r.import_taxable_value) : ""}</td>
                            <td style={{...TDR,background:"#EDF3FB",color:GREEN}}>{r.import_vat ? fmtT(r.import_vat) : ""}</td>
                            <td style={{...TDR,background:"#EDF3FB",fontWeight:700}}>{r.import_total ? fmtT(r.import_total) : ""}</td>
                          </>)}
                        </tr>
                      );
                    })}
                  </tbody>
                  {detailTotals && (
                    <tfoot>
                      <tr className="tot-row" style={{background:NAVY}}>
                        <td colSpan={14} style={{padding:"9px 8px",fontSize:12,fontWeight:700,color:"#FFF"}}>
                          TOTAL ({detailTotals.count})
                        </td>
                        <td style={{padding:"9px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:"#FFF",fontSize:12,background:NAVY}}>{fmtT(detailTotals.taxable)}</td>
                        <td style={{padding:"9px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:"#90EE90",fontSize:12,background:NAVY}}>{fmtT(detailTotals.vat)}</td>
                        <td style={{padding:"9px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:"#FFF",fontSize:12,background:NAVY}}>{fmtT(detailTotals.line_total)}</td>
                        <td style={{padding:"9px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:"#FFF",fontSize:12,background:NAVY}}>{fmtT(detailTotals.non_taxable)}</td>
                        <td style={{background:CAP_BG}}/>
                        <td colSpan={2} style={{background:CAP_BG}}/>
                        <td style={{padding:"9px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:"#ADD8E6",fontSize:12,background:CAP_BG}}>{fmtT(detailTotals.cap_taxable)}</td>
                        <td style={{padding:"9px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:"#ADD8E6",fontSize:12,background:CAP_BG}}>{fmtT(detailTotals.cap_vat)}</td>
                        <td style={{padding:"9px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:"#ADD8E6",fontSize:12,background:CAP_BG}}>{fmtT(detailTotals.cap_total)}</td>
                        <td style={{padding:"9px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:800,color:"#FFD700",fontSize:13,background:NAVY}} title="Grand Total">{fmtT(detailTotals.grand_total)}</td>
                        {showImportCols && (<>
                          <td style={{padding:"9px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:"#FFD700",fontSize:12,background:"#1D6FA8"}}>{fmtT(detailTotals.import_taxable)}</td>
                          <td style={{padding:"9px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:"#A8F0BB",fontSize:12,background:"#1D6FA8"}}>{fmtT(detailTotals.import_vat)}</td>
                          <td style={{padding:"9px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:800,color:"#FFD700",fontSize:13,background:"#1D6FA8"}}>{fmtT(detailTotals.import_total)}</td>
                        </>)}
                      </tr>
                      <tr style={{background:"#0F2840"}}>
                        <td colSpan={14} style={{padding:"5px 8px",fontSize:10,color:"rgba(255,255,255,0.6)",fontStyle:"italic"}}>
                          Grand Total = Normal Lines ({fmtT(detailTotals.line_total)}){showImportCols?` + Import (${fmtT(detailTotals.import_total)})`:""} + Non-Taxable ({fmtT(detailTotals.non_taxable)}) + Capital ({fmtT(detailTotals.cap_total)})
                        </td>
                        <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace",fontSize:10,color:"rgba(255,255,255,0.5)",background:"#0F2840"}}>{fmtT(detailTotals.taxable)}</td>
                        <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace",fontSize:10,color:"rgba(144,238,144,0.6)",background:"#0F2840"}}>{fmtT(detailTotals.vat)}</td>
                        <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace",fontSize:10,color:"rgba(255,255,255,0.5)",background:"#0F2840"}}>{fmtT(detailTotals.line_total)}</td>
                        <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace",fontSize:10,color:"rgba(255,255,255,0.5)",background:"#0F2840"}}>{fmtT(detailTotals.non_taxable)}</td>
                        <td style={{background:"#0F2840"}}/><td colSpan={2} style={{background:"#0F2840"}}/>
                        <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace",fontSize:10,color:"rgba(173,216,230,0.6)",background:"#0F2840"}}>{fmtT(detailTotals.cap_taxable)}</td>
                        <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace",fontSize:10,color:"rgba(173,216,230,0.6)",background:"#0F2840"}}>{fmtT(detailTotals.cap_vat)}</td>
                        <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace",fontSize:10,color:"rgba(173,216,230,0.6)",background:"#0F2840"}}>{fmtT(detailTotals.cap_total)}</td>
                        <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:800,color:"#FFD700",fontSize:12,background:"#0F2840"}}>{fmtT(detailTotals.grand_total)}</td>
                        {showImportCols && (<>
                          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace",fontSize:10,color:"rgba(255,215,0,0.6)",background:"#0F2840"}}>{fmtT(detailTotals.import_taxable)}</td>
                          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace",fontSize:10,color:"rgba(144,238,144,0.6)",background:"#0F2840"}}>{fmtT(detailTotals.import_vat)}</td>
                          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:800,color:"#FFD700",fontSize:12,background:"#0F2840"}}>{fmtT(detailTotals.import_total)}</td>
                        </>)}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
