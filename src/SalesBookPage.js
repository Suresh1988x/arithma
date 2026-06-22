import { useState, useEffect, useCallback } from "react";

// SalesBookPage.js — ARITHMA Sales Book (VAT Sales Register)
// Matches Excel Sales_Book — 31 columns:
// Col 1–14:  Same as Purchase (Date→Non-Taxable) but Customer
// Col 15–21: Capital Items
// Col 22–23: Transaction Type, Original Bill Ref
// Col 24–25: Geography Type, Export Amount
// Col 26–27: Gross Amount, Trade Discount
// Col 28–31: Excisable Amount, Excise Type, Excise Rate, Excise Amount
//
// Tabs: Sales Register | VAT Summary (by Month + by Customer) | Voided

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";

const NAVY   = "#1B3A5C";
const BORDER = "#D6D0C2";
const DIM    = "#6B645A";
const ERR    = "#A8453B";
const GREEN  = "#2E7D4F";
const CREAM  = "#F7F4ED";
const LIGHT  = "#EDF3FB";
const CAP_BG = "#3A6090";
const EXP_BG = "#2E5E3E";  // dark green for export columns

function fmt(n, dec = 2) {
  const v = Number(n) || 0; if (v === 0) return "";
  return v.toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtT(n, dec = 2) {
  return (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ── Print CSS ──────────────────────────────────────────────────
const PRINT_CSS = `@media print {
  body * { visibility:hidden !important; }
  #sb-print-area, #sb-print-area * { visibility:visible !important; }
  #sb-print-area { position:absolute; left:0; top:0; width:100%; font-family:Arial,sans-serif; font-size:8px; padding:6mm; box-sizing:border-box; }
  .no-print { display:none !important; }
  table { border-collapse:collapse; width:100% !important; table-layout:fixed; }
  th, td { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  th { background:#1B3A5C !important; color:#fff !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; padding:2px 3px; font-size:7px; }
  td { padding:2px 3px; border-bottom:1px solid #e0e0e0; font-size:7px; }
  tr.ret-row { background:#FFF0F0 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  tr.exp-row { background:#E8F5E9 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  tr.tot-row td { background:#1B3A5C !important; color:#fff !important; font-weight:bold; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  tr.grd-row td { background:#0F2840 !important; color:#FFD700 !important; font-weight:bold; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .summary-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:4px; margin-bottom:8px; }
  .summary-card { border:1px solid #D6D0C2; padding:4px 6px; }
  .s-label { font-size:6px; font-weight:700; color:#6B645A; letter-spacing:.06em; display:block; }
  .s-value { font-size:10px; font-weight:700; color:#1B3A5C; font-family:monospace; display:block; }
  @page { size:A4 landscape; margin:8mm; }
}`;
function injectPrintCSS() {
  if (document.getElementById("sb-print-css")) return;
  const s = document.createElement("style"); s.id = "sb-print-css"; s.textContent = PRINT_CSS;
  document.head.appendChild(s);
}

// ── Void Modal ─────────────────────────────────────────────────
function VoidModal({ entry, onConfirm, onCancel, loading }) {
  const [doc, setDoc] = useState(""); const [reason, setReason] = useState(""); const [err, setErr] = useState("");
  const submit = () => { if (!doc.trim()) { setErr("Enter document number to confirm."); return; } setErr(""); onConfirm({ confirm_doc_number: doc.trim(), void_reason: reason.trim() }); };
  if (!entry) return null;
  const tot = (Number(entry.total_amount)||0) + (Number(entry.cap_total)||0) + (Number(entry.non_taxable_value)||0) + (Number(entry.export_amount)||0);
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999 }}>
      <div style={{ background:"#FFF", width:480, borderRadius:2, boxShadow:"0 8px 32px rgba(0,0,0,0.22)", fontFamily:"Arial,sans-serif" }}>
        <div style={{ background:ERR, padding:"14px 20px" }}>
          <div style={{ color:"#FFF", fontWeight:700, fontSize:15 }}>⚠ VOID SALES ENTRY</div>
          <div style={{ color:"rgba(255,255,255,0.8)", fontSize:12, marginTop:4 }}>Cannot be undone. GL postings will be reversed.</div>
        </div>
        <div style={{ padding:"14px 20px", background:"#FFF8F8", borderBottom:`1px solid ${BORDER}` }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 16px", fontSize:13 }}>
            <div><span style={{ color:DIM, fontSize:11 }}>CUSTOMER</span><br/><strong>{entry.customer_name}</strong></div>
            <div><span style={{ color:DIM, fontSize:11 }}>DATE</span><br/><strong>{entry.entry_date}</strong></div>
            <div><span style={{ color:DIM, fontSize:11 }}>BILL NO</span><br/><strong>{entry.bill_no||"—"}</strong></div>
            <div><span style={{ color:DIM, fontSize:11 }}>INTERNAL REF</span><br/><strong style={{ color:NAVY }}>{entry.internal_ref}</strong></div>
            <div><span style={{ color:DIM, fontSize:11 }}>TYPE</span><br/><strong>{entry.transaction_type}</strong></div>
            <div><span style={{ color:DIM, fontSize:11 }}>TOTAL</span><br/><strong style={{ color:ERR }}>Rs.{fmtT(tot)}</strong></div>
          </div>
        </div>
        <div style={{ padding:"16px 20px" }}>
          <label style={{ display:"block", fontSize:11, fontWeight:700, color:DIM, marginBottom:5, letterSpacing:"0.08em" }}>TYPE BILL NO OR INTERNAL REF TO CONFIRM *</label>
          <input autoFocus value={doc} onKeyDown={e => e.key==="Enter" && submit()} onChange={e => { setDoc(e.target.value); setErr(""); }}
            placeholder={`e.g. ${entry.bill_no||entry.internal_ref}`}
            style={{ width:"100%", padding:"9px 12px", fontSize:14, fontWeight:600, border:`2px solid ${err?ERR:BORDER}`, boxSizing:"border-box", marginBottom:4 }} />
          {err && <div style={{ color:ERR, fontSize:12, marginBottom:10 }}>{err}</div>}
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional)"
            style={{ width:"100%", padding:"9px 12px", fontSize:13, border:`1px solid ${BORDER}`, boxSizing:"border-box", marginBottom:12 }} />
          <div style={{ fontSize:12, color:DIM, background:"#FFF8E6", padding:"8px 12px", marginBottom:12, border:"1px solid #EDD" }}>
            Marks as VOID. GL postings reversed. Stays in Voided tab permanently for audit.
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={submit} disabled={loading} style={{ flex:1, padding:11, background:ERR, color:"#FFF", border:"none", fontWeight:700, fontSize:13, cursor:loading?"not-allowed":"pointer", opacity:loading?0.7:1 }}>
              {loading?"VOIDING…":"CONFIRM VOID"}
            </button>
            <button onClick={onCancel} disabled={loading} style={{ flex:1, padding:11, background:"#FFF", color:NAVY, border:`2px solid ${BORDER}`, fontWeight:700, fontSize:13, cursor:"pointer" }}>CANCEL</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────
export default function SalesBookPage({ session, companyId, companies, homeSettings, onGoToSalesEntry, onGoToFARegister }) {
  const [entries,    setEntries]    = useState([]);
  const [voided,     setVoided]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [search,     setSearch]     = useState("");
  const [filterType, setFilterType] = useState("All");
  const [filterGeo,  setFilterGeo]  = useState("All");
  const [dateFrom,   setDateFrom]   = useState("");
  const [dateTo,     setDateTo]     = useState("");
  const [activeTab,  setActiveTab]  = useState("register");
  const [vatView,    setVatView]    = useState("month");
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidLoading,setVoidLoading]= useState(false);
  const [voidMsg,    setVoidMsg]    = useState("");

  const companyName = homeSettings?.company_name || companies?.find(c => c.id === companyId)?.name || "";
  const fiscalYear  = homeSettings?.fiscal_year_bs || session?.fiscal_year_bs || "";
  const userRole    = session?.company?.role || session?.role || "";
  const isSuperAdmin= session?.user?.is_super_admin || session?.is_super_admin || false;
  const canVoid     = isSuperAdmin || ["company_admin","admin","accountant"].includes(userRole);

  // eslint-disable-next-line no-console
  console.log("[SalesBook] session:", session, "| userRole:", userRole, "| canVoid:", canVoid);

  injectPrintCSS();

  // ── Fetch ──────────────────────────────────────────────────
  const fetchEntries = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setError("");
    try {
      const [aRes, vRes] = await Promise.all([
        fetch(`${BACKEND}/api/sales?company_id=${companyId}&limit=1000`),
        fetch(`${BACKEND}/api/sales?company_id=${companyId}&limit=1000&include_voided=true`),
      ]);
      const [aData, vData] = await Promise.all([aRes.json(), vRes.json()]);
      setEntries((aData.entries  || []).filter(e => !e.is_void));
      setVoided( (vData.entries  || []).filter(e =>  e.is_void));
    } catch { setError("Could not load Sales Book. Check backend connection."); }
    finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // ── Void ───────────────────────────────────────────────────
  const handleVoidConfirm = async ({ confirm_doc_number, void_reason }) => {
    if (!voidTarget) return;
    setVoidLoading(true);
    try {
      const res  = await fetch(`${BACKEND}/api/sales/${voidTarget.id}/void`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesting_user_id: session?.user?.id || session?.id,
          company_id: companyId, confirm_doc_number, void_reason }),
      });
      const data = await res.json();
      if (!res.ok) { alert("❌ " + (data.error || "Void failed")); }
      else {
        setVoidMsg(`✅ ${data.message} (${data.gl_reversals} GL reversal(s) posted)`);
        setVoidTarget(null); fetchEntries();
        setTimeout(() => setVoidMsg(""), 6000);
      }
    } catch { alert("Network error — void failed."); }
    finally { setVoidLoading(false); }
  };

  // ── Filters ────────────────────────────────────────────────
  const filtered = entries.filter(e => {
    const tm = filterType === "All" || e.transaction_type === filterType;
    const gm = filterGeo  === "All" || (e.geography_type || "Local") === filterGeo;
    const s  = search.toLowerCase();
    const sm = !s || [e.customer_name, e.bill_no, e.product_name, e.customer_pan, e.internal_ref, e.capital_item_name]
                     .some(v => (v||"").toLowerCase().includes(s));
    const df = !dateFrom || e.entry_date >= dateFrom;
    const dt = !dateTo   || e.entry_date <= dateTo;
    return tm && gm && sm && df && dt;
  });

  // ── Totals ─────────────────────────────────────────────────
  const totals = filtered.reduce((a, e) => {
    const capTax = Number(e.cap_taxable_value) || 0;
    const capTot = Number(e.cap_total)         || 0;
    const expAmt = Number(e.export_amount)     || 0;
    return {
      count:      a.count      + 1,
      taxable:    a.taxable    + (Number(e.taxable_value)      || 0),
      vat:        a.vat        + (Number(e.vat_amount)         || 0),
      lineTotal:  a.lineTotal  + (Number(e.total_amount)       || 0),
      nonTax:     a.nonTax     + (Number(e.non_taxable_value)  || 0),
      exportAmt:  a.exportAmt  + expAmt,
      capTaxable: a.capTaxable + capTax,
      capVat:     a.capVat     + (capTot - capTax),
      capTotal:   a.capTotal   + capTot,
      grandTotal: a.grandTotal + (Number(e.total_amount)||0) + (Number(e.non_taxable_value)||0) + capTot + expAmt,
    };
  }, { count:0, taxable:0, vat:0, lineTotal:0, nonTax:0, exportAmt:0, capTaxable:0, capVat:0, capTotal:0, grandTotal:0 });

  // Summary cards from ALL entries (not just filtered)
  const allTot = entries.reduce((a, e) => {
    const capTot = Number(e.cap_total) || 0;
    const expAmt = Number(e.export_amount) || 0;
    return {
      taxable:   a.taxable   + (Number(e.taxable_value)     || 0),
      vat:       a.vat       + (Number(e.vat_amount)        || 0),
      exportAmt: a.exportAmt + expAmt,
      capTotal:  a.capTotal  + capTot,
      grandTotal:a.grandTotal+ (Number(e.total_amount)||0) + (Number(e.non_taxable_value)||0) + capTot + expAmt,
    };
  }, { taxable:0, vat:0, exportAmt:0, capTotal:0, grandTotal:0 });

  // ── VAT by Month ───────────────────────────────────────────
  const vatMonth = {};
  filtered.forEach(e => {
    const m = e.month_bs || e.entry_date?.slice(0,7) || "Unknown";
    if (!vatMonth[m]) vatMonth[m] = { taxable:0, vat:0, nonTax:0, exportAmt:0, capTotal:0, grandTotal:0 };
    const r = vatMonth[m];
    r.taxable    += Number(e.taxable_value)     || 0;
    r.vat        += Number(e.vat_amount)        || 0;
    r.nonTax     += Number(e.non_taxable_value) || 0;
    r.exportAmt  += Number(e.export_amount)     || 0;
    r.capTotal   += Number(e.cap_total)         || 0;
    r.grandTotal += (Number(e.total_amount)||0) + (Number(e.non_taxable_value)||0) + (Number(e.cap_total)||0) + (Number(e.export_amount)||0);
  });

  // ── VAT by Customer ────────────────────────────────────────
  const vatCustomer = {};
  filtered.forEach(e => {
    const key = `${e.customer_name}||${e.customer_pan||""}`;
    if (!vatCustomer[key]) vatCustomer[key] = { name:e.customer_name, pan:e.customer_pan||"", taxable:0, vat:0, nonTax:0, exportAmt:0, capTotal:0, grandTotal:0, txns:0 };
    const r = vatCustomer[key];
    r.txns++;
    r.taxable    += Number(e.taxable_value)     || 0;
    r.vat        += Number(e.vat_amount)        || 0;
    r.nonTax     += Number(e.non_taxable_value) || 0;
    r.exportAmt  += Number(e.export_amount)     || 0;
    r.capTotal   += Number(e.cap_total)         || 0;
    r.grandTotal += (Number(e.total_amount)||0) + (Number(e.non_taxable_value)||0) + (Number(e.cap_total)||0) + (Number(e.export_amount)||0);
  });
  const customerRows = Object.values(vatCustomer).sort((a,b) => b.vat - a.vat);

  // ── CSV export ─────────────────────────────────────────────
  const exportCSV = () => {
    const hdrs = ["Date","Month","Bill No","Customer Name","Customer PAN","Prod Code","Product Name",
      "Qty","Rate","Tax?","Taxable Val","VAT","Total","Non-Tax Val",
      "Cap Item Name","Cap Qty","Cap Rate","Cap Taxable","Cap VAT","Cap Total","FA Code",
      "Txn Type","Orig Ref","Geography","Export Amt","Gross Amt","Trade Disc",
      "Excisable Amt","Excise Type","Excise Rate","Excise Amt","Internal Ref"];
    const rows = [hdrs];
    filtered.forEach(e => {
      const capTax = Number(e.cap_taxable_value)||0, capTot = Number(e.cap_total)||0;
      rows.push([
        e.entry_date, e.month_bs, e.bill_no, e.customer_name, e.customer_pan,
        e.product_code, e.product_name, e.qty||"", e.rate||"", e.is_taxable?"Y":"N",
        e.taxable_value||"", e.vat_amount||"", e.total_amount||"", e.non_taxable_value||"",
        e.capital_item_name||"", e.cap_qty||"", e.cap_rate||"",
        capTax||"", capTot-capTax||"", capTot||"", e.fa_code||"",
        e.transaction_type, e.original_bill_ref||"", e.geography_type||"Local",
        e.export_amount||"", e.gross_amount||"", e.trade_discount||"",
        e.excisable_amount||"", e.excise_type||"", e.excise_rate||"", e.excise_amount||"",
        e.internal_ref,
      ]);
    });
    rows.push(["TOTAL","","","","","","","","","",
      totals.taxable, totals.vat, totals.lineTotal, totals.nonTax,
      "","","",totals.capTaxable,totals.capVat,totals.capTotal,"",
      "","","",totals.exportAmt,"","","","","","",`Grand:${totals.grandTotal}`]);
    const csv = rows.map(r => r.map(v => `"${v??''}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = `sales_book_${companyName}_${fiscalYear}.csv`; a.click();
  };

  // ── Styles ─────────────────────────────────────────────────
  const TH   = { padding:"7px 7px", fontSize:10, fontWeight:700, letterSpacing:"0.06em", color:"#FFF", textAlign:"left", whiteSpace:"nowrap", background:NAVY };
  const THR  = { ...TH, textAlign:"right" };
  const THC  = { ...TH, background:CAP_BG };
  const THCR = { ...TH, background:CAP_BG, textAlign:"right" };
  const THE  = { ...TH, background:EXP_BG };
  const THER = { ...TH, background:EXP_BG, textAlign:"right" };
  const TD   = { padding:"8px 7px", fontSize:12, borderBottom:`1px solid ${BORDER}`, whiteSpace:"nowrap" };
  const TDR  = { ...TD, textAlign:"right", fontFamily:"monospace" };

  const rowBg = (e) => {
    if (e.transaction_type !== "Sales") return "#FFF0F0";
    if ((e.geography_type||"Local") === "Export") return "#E8F5E9";
    return "#FFF";
  };
  const rowCls = (e) => {
    if (e.transaction_type !== "Sales") return "ret-row";
    if ((e.geography_type||"Local") === "Export") return "exp-row";
    return "";
  };

  const colCount = 30 + (canVoid ? 1 : 0);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{ fontFamily:"Arial,sans-serif", background:CREAM, minHeight:"100vh" }}>
      {voidTarget && <VoidModal entry={voidTarget} onConfirm={handleVoidConfirm} onCancel={() => setVoidTarget(null)} loading={voidLoading} />}

      <div id="sb-print-area" style={{ maxWidth:1600, margin:"0 auto", padding:"22px 16px" }}>

        {/* Title */}
        <div style={{ fontSize:22, fontWeight:800, color:NAVY }}>Sales Book — {companyName}</div>
        <div className="sans" style={{ fontSize:13, color:DIM, marginBottom:14 }}>
          VAT Sales Register · FY {fiscalYear} · {entries.length} active{voided.length > 0 ? ` · ${voided.length} voided` : ""}
        </div>

        {/* Action bar */}
        <div className="no-print" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={fetchEntries} title="Refresh" style={{ padding:"8px 12px", background:"#FFF", border:`1px solid ${BORDER}`, cursor:"pointer", fontSize:14 }}>⟳</button>
            <button onClick={exportCSV} style={{ padding:"8px 16px", background:"#FFF", border:`1px solid ${BORDER}`, cursor:"pointer", fontSize:13, fontWeight:600 }}>↓ CSV</button>
            <button onClick={() => window.print()} style={{ padding:"8px 16px", background:"#FFF", border:`1px solid ${BORDER}`, cursor:"pointer", fontSize:13, fontWeight:600, color:ERR }}>↓ PDF</button>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {onGoToFARegister && (
              <button onClick={onGoToFARegister} style={{ padding:"8px 20px", background:"#FFF", color:NAVY, border:`2px solid ${NAVY}`, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                ↗ FA Register
              </button>
            )}
            {onGoToSalesEntry && (
              <button onClick={onGoToSalesEntry} style={{ padding:"8px 20px", background:NAVY, color:"#FFF", border:"none", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                + Sales Entry
              </button>
            )}
          </div>
        </div>

        {/* Void success */}
        {voidMsg && <div style={{ background:"#D4EDDA", border:"1px solid #C3E6CB", color:GREEN, padding:"10px 16px", marginBottom:14, fontSize:13, fontWeight:600 }}>{voidMsg}</div>}

        {/* Summary cards */}
        <div className="summary-grid" style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:10, marginBottom:18 }}>
          {[
            { label:"SALES ENTRIES",  value:`${entries.length}`,              sub:"total" },
            { label:"TAXABLE VALUE",  value:`Rs.${fmtT(allTot.taxable)}`,     sub:"local taxable" },
            { label:"VAT OUTPUT",     value:`Rs.${fmtT(allTot.vat)}`,         sub:"payable to IRD", color:"#C0392B" },
            { label:"EXPORT SALES",   value:`Rs.${fmtT(allTot.exportAmt)}`,   sub:"zero-rated", color:GREEN },
            { label:"CAPITAL TOTAL",  value:`Rs.${fmtT(allTot.capTotal)}`,    sub:"incl. VAT" },
            { label:"GRAND TOTAL",    value:`Rs.${fmtT(allTot.grandTotal)}`,  sub:"all sales", color:NAVY, bold:true },
          ].map((c, i) => (
            <div key={i} className="summary-card" style={{ background:"#FFF", border:`1px solid ${BORDER}`, padding:"13px 14px 11px" }}>
              <div className="s-label" style={{ fontSize:9, letterSpacing:"0.1em", fontWeight:700, color:DIM, marginBottom:6 }}>{c.label}</div>
              <div className="s-value" style={{ fontSize:14, fontWeight:c.bold?800:700, color:c.color||NAVY, fontFamily:"monospace" }}>{c.value}</div>
              <div style={{ fontSize:10, color:DIM, marginTop:2 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="no-print" style={{ display:"flex", borderBottom:`2px solid ${BORDER}`, marginBottom:16 }}>
          {[
            { id:"register",    label:"Sales Register" },
            { id:"vat-summary", label:"VAT Summary" },
            { id:"voided",      label:`Voided (${voided.length})` },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding:"9px 20px", border:"none", cursor:"pointer", fontSize:13, fontWeight:600,
              background:activeTab===t.id?NAVY:"#FFF", color:activeTab===t.id?"#FFF":DIM,
              borderBottom:activeTab===t.id?`2px solid ${NAVY}`:"2px solid transparent", marginBottom:-2,
            }}>{t.label}</button>
          ))}
        </div>

        {loading && <div style={{ padding:40, textAlign:"center", color:DIM }}>Loading…</div>}
        {error   && <div style={{ padding:20, color:ERR, background:"#FFF0F0", border:`1px solid ${ERR}` }}>{error}</div>}

        {/* ════════════════════════════════════════════════════
            SALES REGISTER TAB
        ════════════════════════════════════════════════════ */}
        {!loading && !error && activeTab === "register" && (
          <>
            {/* Filter bar */}
            <div className="no-print" style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center", flexWrap:"wrap" }}>
              {["All","Sales","Sales Return","Credit Note"].map(t => (
                <button key={t} onClick={() => setFilterType(t)} style={{
                  padding:"6px 12px", fontWeight:600, fontSize:12, cursor:"pointer",
                  border:`1px solid ${filterType===t?NAVY:BORDER}`,
                  background:filterType===t?NAVY:"#FFF", color:filterType===t?"#FFF":NAVY,
                }}>{t}</button>
              ))}
              {["All","Local","Export"].map(g => (
                <button key={g} onClick={() => setFilterGeo(g)} style={{
                  padding:"6px 12px", fontWeight:600, fontSize:12, cursor:"pointer",
                  border:`1px solid ${filterGeo===g?EXP_BG:BORDER}`,
                  background:filterGeo===g?EXP_BG:"#FFF", color:filterGeo===g?"#FFF":DIM,
                }}>{g}</button>
              ))}
              {/* Date range */}
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                <span style={{ fontSize:12, color:DIM, whiteSpace:"nowrap" }}>From (AD)</span>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding:"6px 8px", border:`1px solid ${BORDER}`, fontSize:12 }} />
                <span style={{ fontSize:12, color:DIM }}>To</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding:"6px 8px", border:`1px solid ${BORDER}`, fontSize:12 }} />
                {(dateFrom||dateTo) && (
                  <button onClick={() => { setDateFrom(""); setDateTo(""); }} style={{ padding:"5px 10px", background:"#FFF", border:`1px solid ${BORDER}`, fontSize:11, cursor:"pointer", color:DIM }}>✕ Clear</button>
                )}
              </div>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer, bill no, product, PAN, ref…"
                style={{ flex:1, minWidth:180, padding:"7px 12px", border:`1px solid ${BORDER}`, fontSize:13 }} />
              <span style={{ fontSize:12, color:DIM, whiteSpace:"nowrap" }}>{filtered.length} entries</span>
            </div>

            <div style={{ overflowX:"auto" }}>
              <table style={{ borderCollapse:"collapse", width:"100%", minWidth:2000 }}>
                <thead>
                  {/* Group headers */}
                  <tr>
                    <th colSpan={2}  style={{ ...TH,  textAlign:"center", fontSize:9, padding:"4px 7px", background:"#243F6B" }}>DATE</th>
                    <th colSpan={3}  style={{ ...TH,  textAlign:"center", fontSize:9, padding:"4px 7px" }}>PARTY</th>
                    <th colSpan={2}  style={{ ...TH,  textAlign:"center", fontSize:9, padding:"4px 7px", background:"#243F6B" }}>PRODUCT</th>
                    <th colSpan={3}  style={{ ...TH,  textAlign:"center", fontSize:9, padding:"4px 7px" }}>QTY / RATE</th>
                    <th colSpan={4}  style={{ ...TH,  textAlign:"center", fontSize:9, padding:"4px 7px", background:"#243F6B" }}>LOCAL AMOUNTS (Col 11–14)</th>
                    <th colSpan={6}  style={{ ...THC, textAlign:"center", fontSize:9, padding:"4px 7px" }}>CAPITAL ITEMS (Col 15–20)</th>
                    <th colSpan={3}  style={{ ...TH,  textAlign:"center", fontSize:9, padding:"4px 7px" }}>META</th>
                    <th colSpan={2}  style={{ ...THE, textAlign:"center", fontSize:9, padding:"4px 7px" }}>EXPORT</th>
                    <th colSpan={4}  style={{ ...THE, textAlign:"center", fontSize:9, padding:"4px 7px", background:"#1A4A2A" }}>EXCISE / DISC</th>
                    <th colSpan={1}  style={{ ...TH,  textAlign:"center", fontSize:9, padding:"4px 7px", background:"#243F6B" }}>REF</th>
                    {canVoid && <th style={{ ...TH, textAlign:"center", fontSize:9, padding:"4px 7px", background:"#5A3030" }}>ACT</th>}
                  </tr>
                  {/* Column headers */}
                  <tr>
                    <th style={TH}>DATE</th>
                    <th style={TH}>MONTH</th>
                    <th style={TH}>BILL NO</th>
                    <th style={TH}>CUSTOMER NAME</th>
                    <th style={TH}>PAN</th>
                    <th style={{ ...TH, background:"#243F6B" }}>PROD CODE</th>
                    <th style={{ ...TH, background:"#243F6B" }}>PRODUCT NAME</th>
                    <th style={THR}>QTY</th>
                    <th style={THR}>RATE</th>
                    <th style={{ ...TH, textAlign:"center" }}>TAX?</th>
                    <th style={{ ...THR, background:"#243F6B" }}>TAXABLE VAL</th>
                    <th style={{ ...THR, background:"#243F6B" }}>VAT</th>
                    <th style={{ ...THR, background:"#243F6B" }}>TOTAL</th>
                    <th style={{ ...THR, background:"#243F6B" }}>NON-TAX VAL</th>
                    <th style={THC}>CAP ITEM NAME</th>
                    <th style={THCR}>CAP QTY</th>
                    <th style={THCR}>CAP RATE</th>
                    <th style={THCR}>CAP TAXABLE</th>
                    <th style={THCR}>CAP VAT</th>
                    <th style={THCR}>CAP TOTAL</th>
                    <th style={TH}>FA CODE</th>
                    <th style={TH}>TXN TYPE</th>
                    <th style={TH}>ORIG REF</th>
                    <th style={THE}>GEO TYPE</th>
                    <th style={THER}>EXPORT AMT</th>
                    <th style={{ ...THER, background:"#1A4A2A" }}>GROSS AMT</th>
                    <th style={{ ...THER, background:"#1A4A2A" }}>TRADE DISC</th>
                    <th style={{ ...THER, background:"#1A4A2A" }}>EXCISE TYPE</th>
                    <th style={{ ...THER, background:"#1A4A2A" }}>EXCISE AMT</th>
                    <th style={{ ...TH,  background:"#243F6B" }}>INTERNAL REF</th>
                    {canVoid && <th style={{ ...TH, background:"#5A3030", textAlign:"center" }}>VOID</th>}
                  </tr>
                </thead>

                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={colCount} style={{ padding:30, textAlign:"center", color:DIM }}>No entries found.</td></tr>
                  ) : filtered.map(e => {
                    const isCapRow = !!e.is_capital;
                    const capTax = isCapRow ? (Number(e.cap_taxable_value)||0) : 0;
                    const capTot = isCapRow ? (Number(e.cap_total)||0) : 0;
                    const isExport = (e.geography_type||"Local") === "Export";
                    return (
                      <tr key={e.id} className={rowCls(e)} style={{ background:rowBg(e) }}>
                        <td style={TD}>{e.entry_date}</td>
                        <td style={{ ...TD, fontSize:11, color:DIM }}>{e.month_bs}</td>
                        <td style={{ ...TD, fontWeight:700, color:NAVY }}>{e.bill_no}</td>
                        <td style={{ ...TD, fontWeight:600 }}>{e.customer_name}</td>
                        <td style={{ ...TD, fontFamily:"monospace", fontSize:11 }}>{e.customer_pan}</td>
                        <td style={{ ...TD, fontSize:11, color:DIM }}>{e.product_code}</td>
                        <td style={TD}>{e.product_name}</td>
                        <td style={TDR}>{fmt(e.qty)}</td>
                        <td style={TDR}>{fmt(e.rate)}</td>
                        <td style={{ ...TD, textAlign:"center", fontWeight:700, color:e.is_taxable?GREEN:ERR }}>{e.is_taxable?"Y":"N"}</td>
                        <td style={TDR}>{fmt(e.taxable_value)}</td>
                        <td style={{ ...TDR, color:"#C0392B", fontWeight:700 }}>{fmt(e.vat_amount)}</td>
                        <td style={{ ...TDR, fontWeight:700 }}>{fmt(e.total_amount)}</td>
                        <td style={TDR}>{fmt(e.non_taxable_value)}</td>
                        <td style={{ ...TD, background:"#F0F4FA" }}>{isCapRow ? e.capital_item_name : ""}</td>
                        <td style={{ ...TDR, background:"#F0F4FA" }}>{isCapRow ? fmt(e.cap_qty) : ""}</td>
                        <td style={{ ...TDR, background:"#F0F4FA" }}>{isCapRow ? fmt(e.cap_rate) : ""}</td>
                        <td style={{ ...TDR, background:"#F0F4FA" }}>{isCapRow ? fmt(capTax) : ""}</td>
                        <td style={{ ...TDR, background:"#F0F4FA", color:"#C0392B" }}>{isCapRow ? fmt(capTot-capTax) : ""}</td>
                        <td style={{ ...TDR, background:"#F0F4FA", fontWeight:700 }}>{isCapRow ? fmt(capTot) : ""}</td>
                        <td style={{ ...TD, fontSize:11, color:DIM }}>{isCapRow ? e.fa_code : ""}</td>
                        <td style={{ ...TD, fontSize:11 }}>{e.transaction_type}</td>
                        <td style={{ ...TD, fontSize:11, color:DIM }}>
                          {(e.transaction_type==="Sales Return"||e.transaction_type==="Credit Note")
                            ? <span style={{ color:ERR, fontWeight:600 }}>{e.original_bill_ref||"—"}</span> : ""}
                        </td>
                        <td style={{ ...TD, background:"#E8F5E9", fontWeight:isExport?700:400, color:isExport?GREEN:DIM }}>{e.geography_type||"Local"}</td>
                        <td style={{ ...TDR, background:"#E8F5E9", color:GREEN, fontWeight:isExport?700:400 }}>{fmt(e.export_amount)}</td>
                        <td style={{ ...TDR, background:"#F0FFF4" }}>{fmt(e.gross_amount)}</td>
                        <td style={{ ...TDR, background:"#F0FFF4" }}>{fmt(e.trade_discount)}</td>
                        <td style={{ ...TD, background:"#F0FFF4", fontSize:11 }}>{e.excise_type||"NONE"}</td>
                        <td style={{ ...TDR, background:"#F0FFF4", color:"#B8860B" }}>{fmt(e.excise_amount)}</td>
                        <td style={{ ...TD, fontFamily:"monospace", fontSize:11, color:NAVY }}>{e.internal_ref}</td>
                        {canVoid && (
                          <td style={{ ...TD, textAlign:"center", background:"#FDF8F8" }}>
                            <button onClick={() => setVoidTarget(e)} title={`Void ${e.internal_ref}`}
                              style={{ padding:"3px 10px", background:"#FFF", color:ERR, border:`1px solid ${ERR}`, fontSize:11, fontWeight:700, cursor:"pointer", borderRadius:2 }}>
                              VOID
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>

                {/* Footer totals */}
                <tfoot>
                  <tr className="tot-row" style={{ background:NAVY }}>
                    <td colSpan={7} style={{ padding:"9px 7px", fontSize:12, fontWeight:700, color:"#FFF" }}>
                      TOTAL ({totals.count}){(dateFrom||dateTo) ? " · Filtered" : ""}
                    </td>
                    <td colSpan={3} style={{ background:NAVY }} />
                    <td style={{ padding:"9px 7px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#FFF", fontSize:12, background:NAVY }}>{fmtT(totals.taxable)}</td>
                    <td style={{ padding:"9px 7px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#FF9999", fontSize:12, background:NAVY }}>{fmtT(totals.vat)}</td>
                    <td style={{ padding:"9px 7px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#FFF", fontSize:12, background:NAVY }}>{fmtT(totals.lineTotal)}</td>
                    <td style={{ padding:"9px 7px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#FFF", fontSize:12, background:NAVY }}>{fmtT(totals.nonTax)}</td>
                    <td style={{ background:CAP_BG }} />
                    <td colSpan={2} style={{ background:CAP_BG }} />
                    <td style={{ padding:"9px 7px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#ADD8E6", fontSize:12, background:CAP_BG }}>{fmtT(totals.capTaxable)}</td>
                    <td style={{ padding:"9px 7px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#ADD8E6", fontSize:12, background:CAP_BG }}>{fmtT(totals.capVat)}</td>
                    <td style={{ padding:"9px 7px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#ADD8E6", fontSize:12, background:CAP_BG }}>{fmtT(totals.capTotal)}</td>
                    <td colSpan={3} style={{ background:NAVY }} />
                    <td style={{ padding:"9px 7px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#90EE90", fontSize:12, background:EXP_BG }}>{fmtT(totals.exportAmt)}</td>
                    <td colSpan={4} style={{ background:NAVY }} />
                    <td style={{ padding:"9px 7px", textAlign:"right", fontFamily:"monospace", fontWeight:800, color:"#FFD700", fontSize:13, background:NAVY }}>{fmtT(totals.grandTotal)}</td>
                    {canVoid && <td style={{ background:NAVY }} />}
                  </tr>
                  {/* Legend */}
                  <tr className="grd-row" style={{ background:"#0F2840" }}>
                    <td colSpan={10} style={{ padding:"5px 7px", fontSize:10, color:"rgba(255,255,255,0.6)", fontStyle:"italic" }}>
                      Grand Total = Local Lines ({fmtT(totals.lineTotal)}) + Non-Taxable ({fmtT(totals.nonTax)}) + Capital ({fmtT(totals.capTotal)}) + Export ({fmtT(totals.exportAmt)})
                    </td>
                    <td style={{ padding:"5px 7px", textAlign:"right", fontFamily:"monospace", fontSize:10, color:"rgba(255,255,255,0.5)", background:"#0F2840" }}>{fmtT(totals.taxable)}</td>
                    <td style={{ padding:"5px 7px", textAlign:"right", fontFamily:"monospace", fontSize:10, color:"rgba(255,100,100,0.7)", background:"#0F2840" }}>{fmtT(totals.vat)}</td>
                    <td style={{ padding:"5px 7px", textAlign:"right", fontFamily:"monospace", fontSize:10, color:"rgba(255,255,255,0.5)", background:"#0F2840" }}>{fmtT(totals.lineTotal)}</td>
                    <td style={{ padding:"5px 7px", textAlign:"right", fontFamily:"monospace", fontSize:10, color:"rgba(255,255,255,0.5)", background:"#0F2840" }}>{fmtT(totals.nonTax)}</td>
                    <td style={{ background:"#0F2840" }} /><td colSpan={2} style={{ background:"#0F2840" }} />
                    <td style={{ padding:"5px 7px", textAlign:"right", fontFamily:"monospace", fontSize:10, color:"rgba(173,216,230,0.6)", background:"#0F2840" }}>{fmtT(totals.capTaxable)}</td>
                    <td style={{ padding:"5px 7px", textAlign:"right", fontFamily:"monospace", fontSize:10, color:"rgba(173,216,230,0.6)", background:"#0F2840" }}>{fmtT(totals.capVat)}</td>
                    <td style={{ padding:"5px 7px", textAlign:"right", fontFamily:"monospace", fontSize:10, color:"rgba(173,216,230,0.6)", background:"#0F2840" }}>{fmtT(totals.capTotal)}</td>
                    <td colSpan={3} style={{ background:"#0F2840" }} />
                    <td style={{ padding:"5px 7px", textAlign:"right", fontFamily:"monospace", fontSize:10, color:"rgba(144,238,144,0.7)", background:"#0F2840" }}>{fmtT(totals.exportAmt)}</td>
                    <td colSpan={4} style={{ background:"#0F2840" }} />
                    <td style={{ padding:"5px 7px", textAlign:"right", fontFamily:"monospace", fontWeight:800, color:"#FFD700", fontSize:12, background:"#0F2840" }}>{fmtT(totals.grandTotal)}</td>
                    {canVoid && <td style={{ background:"#0F2840" }} />}
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════════
            VAT SUMMARY TAB
        ════════════════════════════════════════════════════ */}
        {!loading && !error && activeTab === "vat-summary" && (
          <div>
            {/* Date filter */}
            <div className="no-print" style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center", flexWrap:"wrap" }}>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                <span style={{ fontSize:12, color:DIM, whiteSpace:"nowrap" }}>From (AD)</span>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding:"6px 8px", border:`1px solid ${BORDER}`, fontSize:12 }} />
                <span style={{ fontSize:12, color:DIM }}>To</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding:"6px 8px", border:`1px solid ${BORDER}`, fontSize:12 }} />
                {(dateFrom||dateTo) && <button onClick={() => { setDateFrom(""); setDateTo(""); }} style={{ padding:"5px 10px", background:"#FFF", border:`1px solid ${BORDER}`, fontSize:11, cursor:"pointer", color:DIM }}>✕ Clear</button>}
              </div>
              <span style={{ fontSize:12, color:DIM }}>{filtered.length} entries in range</span>
            </div>

            {/* Sub-tabs */}
            <div style={{ display:"flex", gap:0, marginBottom:16, borderBottom:`2px solid ${BORDER}` }}>
              {[{ id:"month", label:"By Month (BS)" }, { id:"customer", label:"By Customer" }].map(t => (
                <button key={t.id} onClick={() => setVatView(t.id)} style={{
                  padding:"8px 18px", border:"none", cursor:"pointer", fontSize:13, fontWeight:600,
                  background:vatView===t.id?NAVY:"#FFF", color:vatView===t.id?"#FFF":DIM,
                  borderBottom:vatView===t.id?`2px solid ${NAVY}`:"2px solid transparent", marginBottom:-2,
                }}>{t.label}</button>
              ))}
            </div>

            {/* By Month */}
            {vatView === "month" && (
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:NAVY, marginBottom:10 }}>
                  VAT Output Summary — by Month (BS)
                  {(dateFrom||dateTo) && <span style={{ fontWeight:400, color:DIM, fontSize:12 }}> · Filtered: {dateFrom||"start"} → {dateTo||"end"}</span>}
                </div>
                <table style={{ borderCollapse:"collapse", width:"100%", maxWidth:1000 }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH, width:130 }}>MONTH (BS)</th>
                      <th style={THR}>TAXABLE VALUE</th>
                      <th style={THR}>VAT OUTPUT</th>
                      <th style={THR}>TAXABLE + VAT</th>
                      <th style={THR}>NON-TAXABLE</th>
                      <th style={{ ...THR, background:EXP_BG }}>EXPORT (0%)</th>
                      <th style={{ ...THR, background:CAP_BG }}>CAP TOTAL</th>
                      <th style={{ ...THR, background:"#243F6B" }}>GRAND TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(vatMonth).sort().map((m, i) => {
                      const r = vatMonth[m];
                      return (
                        <tr key={m} style={{ background:i%2===0?"#FFF":LIGHT }}>
                          <td style={{ ...TD, fontWeight:700 }}>{m}</td>
                          <td style={TDR}>{fmtT(r.taxable)}</td>
                          <td style={{ ...TDR, color:"#C0392B", fontWeight:700 }}>{fmtT(r.vat)}</td>
                          <td style={{ ...TDR, fontWeight:600 }}>{fmtT(r.taxable+r.vat)}</td>
                          <td style={TDR}>{fmtT(r.nonTax)}</td>
                          <td style={{ ...TDR, color:GREEN, fontWeight:600 }}>{fmtT(r.exportAmt)}</td>
                          <td style={{ ...TDR, color:CAP_BG, fontWeight:600 }}>{fmtT(r.capTotal)}</td>
                          <td style={{ ...TDR, fontWeight:700 }}>{fmtT(r.grandTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>{(() => {
                    const v = Object.values(vatMonth), sum = f => v.reduce((s,r) => s+r[f], 0);
                    return (
                      <tr style={{ background:NAVY }}>
                        <td style={{ padding:"9px 7px", fontWeight:700, color:"#FFF" }}>GRAND TOTAL</td>
                        <td style={{ ...TDR, fontWeight:700, color:"#FFF", background:NAVY, borderBottom:"none" }}>{fmtT(sum("taxable"))}</td>
                        <td style={{ ...TDR, fontWeight:700, color:"#FF9999", background:NAVY, borderBottom:"none" }}>{fmtT(sum("vat"))}</td>
                        <td style={{ ...TDR, fontWeight:700, color:"#FFF", background:NAVY, borderBottom:"none" }}>{fmtT(sum("taxable")+sum("vat"))}</td>
                        <td style={{ ...TDR, fontWeight:700, color:"#FFF", background:NAVY, borderBottom:"none" }}>{fmtT(sum("nonTax"))}</td>
                        <td style={{ ...TDR, fontWeight:700, color:"#90EE90", background:EXP_BG, borderBottom:"none" }}>{fmtT(sum("exportAmt"))}</td>
                        <td style={{ ...TDR, fontWeight:700, color:"#ADD8E6", background:CAP_BG, borderBottom:"none" }}>{fmtT(sum("capTotal"))}</td>
                        <td style={{ ...TDR, fontWeight:800, color:"#FFD700", background:"#243F6B", borderBottom:"none", fontSize:13 }}>{fmtT(sum("grandTotal"))}</td>
                      </tr>
                    );
                  })()}</tfoot>
                </table>
              </div>
            )}

            {/* By Customer */}
            {vatView === "customer" && (
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:NAVY, marginBottom:6 }}>
                  VAT Output Summary — by Customer
                  {(dateFrom||dateTo) && <span style={{ fontWeight:400, color:DIM, fontSize:12 }}> · {dateFrom||"start"} → {dateTo||"end"}</span>}
                </div>
                <div style={{ fontSize:12, color:DIM, marginBottom:12 }}>Sorted by VAT Output (highest first). Useful for customer-wise VAT reconciliation.</div>
                <table style={{ borderCollapse:"collapse", width:"100%", maxWidth:1100 }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH, width:30 }}>#</th>
                      <th style={TH}>CUSTOMER NAME</th>
                      <th style={{ ...TH, width:120 }}>CUSTOMER PAN</th>
                      <th style={{ ...THR, width:60 }}>BILLS</th>
                      <th style={THR}>TAXABLE VALUE</th>
                      <th style={THR}>VAT OUTPUT</th>
                      <th style={THR}>TAXABLE + VAT</th>
                      <th style={THR}>NON-TAXABLE</th>
                      <th style={{ ...THR, background:EXP_BG }}>EXPORT AMT</th>
                      <th style={{ ...THR, background:CAP_BG }}>CAP TOTAL</th>
                      <th style={{ ...THR, background:"#243F6B" }}>GRAND TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerRows.length === 0 ? (
                      <tr><td colSpan={11} style={{ padding:20, textAlign:"center", color:DIM }}>No data.</td></tr>
                    ) : customerRows.map((r, i) => (
                      <tr key={r.name+r.pan} style={{ background:i%2===0?"#FFF":LIGHT }}>
                        <td style={{ ...TD, color:DIM, fontSize:11, textAlign:"center" }}>{i+1}</td>
                        <td style={{ ...TD, fontWeight:600 }}>{r.name}</td>
                        <td style={{ ...TD, fontFamily:"monospace", fontSize:11 }}>{r.pan||"—"}</td>
                        <td style={{ ...TDR, fontSize:11, color:DIM }}>{r.txns}</td>
                        <td style={TDR}>{fmtT(r.taxable)}</td>
                        <td style={{ ...TDR, color:"#C0392B", fontWeight:700 }}>{fmtT(r.vat)}</td>
                        <td style={{ ...TDR, fontWeight:600 }}>{fmtT(r.taxable+r.vat)}</td>
                        <td style={TDR}>{fmtT(r.nonTax)}</td>
                        <td style={{ ...TDR, color:GREEN, fontWeight:600 }}>{fmtT(r.exportAmt)}</td>
                        <td style={{ ...TDR, color:CAP_BG, fontWeight:600 }}>{fmtT(r.capTotal)}</td>
                        <td style={{ ...TDR, fontWeight:700 }}>{fmtT(r.grandTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>{(() => {
                    const sum = f => customerRows.reduce((s,r) => s+r[f], 0);
                    return (
                      <tr style={{ background:NAVY }}>
                        <td colSpan={3} style={{ padding:"9px 7px", fontWeight:700, color:"#FFF", fontSize:12 }}>
                          TOTAL — {customerRows.length} customers
                        </td>
                        <td style={{ ...TDR, fontWeight:700, color:"#FFF", background:NAVY, borderBottom:"none" }}>{sum("txns")}</td>
                        <td style={{ ...TDR, fontWeight:700, color:"#FFF", background:NAVY, borderBottom:"none" }}>{fmtT(sum("taxable"))}</td>
                        <td style={{ ...TDR, fontWeight:700, color:"#FF9999", background:NAVY, borderBottom:"none" }}>{fmtT(sum("vat"))}</td>
                        <td style={{ ...TDR, fontWeight:700, color:"#FFF", background:NAVY, borderBottom:"none" }}>{fmtT(sum("taxable")+sum("vat"))}</td>
                        <td style={{ ...TDR, fontWeight:700, color:"#FFF", background:NAVY, borderBottom:"none" }}>{fmtT(sum("nonTax"))}</td>
                        <td style={{ ...TDR, fontWeight:700, color:"#90EE90", background:EXP_BG, borderBottom:"none" }}>{fmtT(sum("exportAmt"))}</td>
                        <td style={{ ...TDR, fontWeight:700, color:"#ADD8E6", background:CAP_BG, borderBottom:"none" }}>{fmtT(sum("capTotal"))}</td>
                        <td style={{ ...TDR, fontWeight:800, color:"#FFD700", background:"#243F6B", borderBottom:"none", fontSize:13 }}>{fmtT(sum("grandTotal"))}</td>
                      </tr>
                    );
                  })()}</tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            VOIDED TAB
        ════════════════════════════════════════════════════ */}
        {!loading && !error && activeTab === "voided" && (
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:ERR, marginBottom:6 }}>Voided Entries — Permanent Audit Trail</div>
            <div style={{ fontSize:12, color:DIM, marginBottom:14 }}>Soft-deleted. GL postings reversed. Cannot be removed.</div>
            {voided.length === 0 ? (
              <div style={{ padding:30, textAlign:"center", color:DIM, background:"#FFF", border:`1px solid ${BORDER}` }}>No voided entries.</div>
            ) : (
              <table style={{ borderCollapse:"collapse", width:"100%" }}>
                <thead>
                  <tr>
                    {["DATE","BILL NO","INTERNAL REF","CUSTOMER","PRODUCT","TOTAL","TYPE","GEO","VOIDED BY","VOIDED AT","REASON"].map(h => (
                      <th key={h} style={{ ...TH, background:"#7B3030", textAlign:h==="TOTAL"?"right":"left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {voided.map((e, i) => {
                    const tot = (Number(e.total_amount)||0)+(Number(e.cap_total)||0)+(Number(e.non_taxable_value)||0)+(Number(e.export_amount)||0);
                    return (
                      <tr key={e.id} style={{ background:i%2===0?"#FFF8F8":"#FFF0F0", opacity:.85 }}>
                        <td style={{ ...TD, color:DIM, textDecoration:"line-through" }}>{e.entry_date}</td>
                        <td style={{ ...TD, color:DIM, textDecoration:"line-through" }}>{e.bill_no}</td>
                        <td style={{ ...TD, fontFamily:"monospace", fontSize:11, color:ERR }}>{e.internal_ref}</td>
                        <td style={{ ...TD, color:DIM }}>{e.customer_name}</td>
                        <td style={{ ...TD, color:DIM }}>{e.product_name}</td>
                        <td style={{ ...TDR, color:ERR, fontWeight:700 }}>Rs.{fmtT(tot)}</td>
                        <td style={{ ...TD, fontSize:11 }}>{e.transaction_type}</td>
                        <td style={{ ...TD, fontSize:11, color:GREEN }}>{e.geography_type||"Local"}</td>
                        <td style={{ ...TD, fontWeight:700, color:ERR }}>{e.voided_by||"—"}</td>
                        <td style={{ ...TD, fontSize:11, color:DIM }}>{e.voided_at?new Date(e.voided_at).toLocaleString():"—"}</td>
                        <td style={{ ...TD, fontSize:11, fontStyle:"italic", color:DIM }}>{e.void_reason||"—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
