import { useState, useEffect, useCallback } from "react";

// GLBookPage.js — ARITHMA General Ledger Book
// Shows all GL postings per account with running balance.
// Matches Excel GL_Book: Date | Unique ID | Ledger Name | Description | Dr | Cr | Balance | Source

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";
const NAVY    = "#1B3A5C";
const BORDER  = "#D6D0C2";
const DIM     = "#6B645A";
const ERR     = "#A8453B";
const GREEN   = "#2E7D4F";
const CREAM   = "#F7F4ED";
const LIGHT   = "#EDF3FB";
const GOLD    = "#B8860B";

function fmt(n, dec = 2) {
  const v = Number(n) || 0; if (v === 0) return "";
  return v.toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtT(n, dec = 2) {
  return (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtBal(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v === 0) return <span style={{ color:DIM }}>—</span>;
  return v > 0
    ? <span style={{ color:NAVY, fontWeight:700 }}>{abs} Dr</span>
    : <span style={{ color:ERR, fontWeight:700 }}>{abs} Cr</span>;
}

const PRINT_CSS = `@media print {
  body * { visibility:hidden !important; }
  #glb-print-area, #glb-print-area * { visibility:visible !important; }
  #glb-print-area { position:absolute; left:0; top:0; width:100%; font-family:Arial,sans-serif; font-size:8px; padding:8mm; box-sizing:border-box; }
  .no-print { display:none !important; }
  table { border-collapse:collapse; width:100%; }
  th { background:#1B3A5C !important; color:#fff !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; padding:3px 5px; font-size:8px; }
  td { padding:2px 5px; border-bottom:1px solid #eee; font-size:8px; }
  tr.ob-row td { background:#FFF8E6 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  tr.tot-row td { background:#1B3A5C !important; color:#fff !important; font-weight:bold; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  @page { size:A4 landscape; margin:8mm; }
}`;
function injectPrint() {
  if (document.getElementById("glb-css")) return;
  const s = document.createElement("style"); s.id = "glb-css"; s.textContent = PRINT_CSS;
  document.head.appendChild(s);
}

// ── Account selector sidebar ──────────────────────────────────
function AccountSidebar({ accounts, selected, onSelect }) {
  const [search, setSearch] = useState("");
  const filtered = accounts.filter(a =>
    !search || a.gl_name.toLowerCase().includes(search.toLowerCase()) ||
    a.gl_code.includes(search)
  );
  // Group by header
  const groups = {};
  filtered.forEach(a => {
    const h = a.header || "Other";
    if (!groups[h]) groups[h] = [];
    groups[h].push(a);
  });
  const headerOrder = ["Non-Current Assets","Current Assets","Equity","Non-Current Liab.","Current Liab.","Income","COGS","Expenses","Finance"];
  const sortedHeaders = [...new Set([...headerOrder, ...Object.keys(groups)])].filter(h => groups[h]);

  return (
    <div style={{ width:260, minWidth:260, background:"#FFF", borderRight:`1px solid ${BORDER}`,
      display:"flex", flexDirection:"column", height:"100vh", position:"sticky", top:0 }}>
      <div style={{ padding:"12px 12px 8px", borderBottom:`1px solid ${BORDER}` }}>
        <div style={{ fontSize:11, fontWeight:700, color:NAVY, letterSpacing:"0.08em", marginBottom:8 }}>
          CHART OF ACCOUNTS
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search code or name…"
          style={{ width:"100%", padding:"6px 8px", border:`1px solid ${BORDER}`,
            fontSize:12, boxSizing:"border-box" }} />
      </div>
      <div style={{ overflowY:"auto", flex:1 }}>
        {/* All accounts option */}
        <div onClick={() => onSelect(null)}
          style={{ padding:"8px 12px", cursor:"pointer", fontSize:12, fontWeight:600,
            background: selected===null ? NAVY : "#FFF",
            color: selected===null ? "#FFF" : NAVY,
            borderBottom:`1px solid ${BORDER}` }}>
          All GL Accounts
        </div>
        {sortedHeaders.map(h => (
          <div key={h}>
            <div style={{ padding:"5px 12px", fontSize:9, fontWeight:700, color:DIM,
              background:"#F5F2EA", letterSpacing:"0.1em", borderBottom:`1px solid ${BORDER}` }}>
              {h.toUpperCase()}
            </div>
            {groups[h].map(a => (
              <div key={a.id} onClick={() => onSelect(a)}
                style={{ padding:"7px 12px 7px 16px", cursor:"pointer", fontSize:11,
                  background: selected?.id===a.id ? LIGHT : "#FFF",
                  borderLeft: selected?.id===a.id ? `3px solid ${NAVY}` : "3px solid transparent",
                  borderBottom:`1px solid #F0EDE5`,
                  color: selected?.id===a.id ? NAVY : "#333" }}>
                <div style={{ fontWeight:600 }}>{a.gl_code}</div>
                <div style={{ fontSize:10, color:DIM, marginTop:1 }}>{a.gl_name.replace(/^\d+ - /,"")}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────
export default function GLBookPage({ session, companyId, companies, homeSettings, onGoToPurchase, onGoToImport, onGoToSales }) {
  const [accounts,  setAccounts]  = useState([]);
  const [entries,   setEntries]   = useState([]);
  const [selAcc,    setSelAcc]    = useState(null);
  const [dateFrom,  setDateFrom]  = useState("");
  const [dateTo,    setDateTo]    = useState("");
  const [search,    setSearch]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [sourceCategory, setSourceCategory] = useState("All");
  const [showVoidTab, setShowVoidTab] = useState(false);
  const [categoryCounts, setCategoryCounts] = useState({});

  const companyName = homeSettings?.company_name || companies?.find(c=>c.id===companyId)?.name||"";
  const fiscalYear  = homeSettings?.fiscal_year_bs || session?.fiscal_year_bs||"";
  injectPrint();

  // Fetch accounts (chart of accounts)
  useEffect(() => {
    if (!companyId) return;
    fetch(`${BACKEND}/api/gl-accounts?company_id=${companyId}`)
      .then(r => r.json())
      .then(d => setAccounts(d.accounts || []))
      .catch(() => {});
  }, [companyId]);

  // Fetch GL Book entries
  const fetchEntries = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setError("");
    try {
      let url = `${BACKEND}/api/gl-book?company_id=${companyId}&limit=2000`;
      if (selAcc)   url += `&gl_code=${selAcc.gl_code}`;
      if (dateFrom) url += `&from_date=${dateFrom}`;
      if (dateTo)   url += `&to_date=${dateTo}`;
      url += `&source_category=${showVoidTab ? "Void" : sourceCategory}`;
      if (showVoidTab) url += `&include_void=true`;
      const res  = await fetch(url);
      const data = await res.json();
      setEntries(data.entries || []);
      setCategoryCounts(data.category_counts || {});
    } catch { setError("Could not load GL Book."); }
    finally { setLoading(false); }
  }, [companyId, selAcc, dateFrom, dateTo, sourceCategory, showVoidTab]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // Filter by search
  const filtered = entries.filter(e => {
    const s = search.toLowerCase();
    return !s || [e.gl_name,e.description,e.unique_id,e.source,e.gl_code]
      .some(v => (v||"").toLowerCase().includes(s));
  });

  // Totals
  const totals = filtered.reduce((a,e) => ({
    dr: a.dr + (Number(e.dr_amount)||0),
    cr: a.cr + (Number(e.cr_amount)||0),
  }), {dr:0, cr:0});

  // Opening balance for selected account
  const openingBal = selAcc
    ? (Number(selAcc.opening_dr)||0) - (Number(selAcc.opening_cr)||0)
    : 0;

  // CSV export
  const exportCSV = () => {
    const hdrs = ["Date","Unique ID","GL Code","GL Name","Description","Dr","Cr","Balance","Source","Txn Type"];
    const rows = [hdrs];
    if (selAcc && openingBal !== 0) {
      rows.push(["Opening Balance","OB",selAcc.gl_code,selAcc.gl_name,"Opening Balance",
        openingBal>0?openingBal:0, openingBal<0?Math.abs(openingBal):0, openingBal,"OB",""]);
    }
    let running = openingBal;
    filtered.forEach(e => {
      running += (Number(e.dr_amount)||0) - (Number(e.cr_amount)||0);
      rows.push([e.entry_date,e.unique_id,e.gl_code,e.gl_name,e.description,
        e.dr_amount||"",e.cr_amount||"",running,e.source,e.transaction_type]);
    });
    const csv = rows.map(r => r.map(v=>`"${v??''}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download = `gl_book_${selAcc?.gl_code||"all"}_${companyName}.csv`;
    a.click();
  };

  const TH  = { padding:"7px 8px", fontSize:10, fontWeight:700, color:"#FFF", background:NAVY, whiteSpace:"nowrap" };
  const THR = { ...TH, textAlign:"right" };
  const TD  = { padding:"8px 8px", fontSize:12, borderBottom:`1px solid ${BORDER}`, whiteSpace:"nowrap" };
  const TDR = { ...TD, textAlign:"right", fontFamily:"monospace" };

  const sourceColor = (src) => {
    if (src==="Purchase_Book") return "#2C5F2E";
    if (src==="Sales_Book")    return "#1B3A8C";
    if (src==="Journal")       return "#5A3A1A";
    if (src==="Void")          return "#A8453B";
    if (src==="OB")            return "#6B4C9A";
    return DIM;
  };

  return (
    <div style={{ fontFamily:"Arial,sans-serif", background:CREAM, minHeight:"100vh", display:"flex" }}>
      {/* Sidebar */}
      <AccountSidebar accounts={accounts} selected={selAcc} onSelect={setSelAcc} />

      {/* Main content */}
      <div id="glb-print-area" style={{ flex:1, padding:"22px 20px", overflowY:"auto" }}>

        {/* Title */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:22, fontWeight:800, color:NAVY }}>
              {selAcc ? `${selAcc.gl_code} — ${selAcc.gl_name.replace(/^\d+ - /,"")}` : "General Ledger Book"}
            </div>
            <div className="sans" style={{ fontSize:12, color:DIM, marginTop:2 }}>
              {companyName} · FY {fiscalYear}
              {selAcc && <> · <span style={{ color:DIM }}>{selAcc.header} / {selAcc.main_group}</span></>}
              · {filtered.length} entries
            </div>
          </div>
          <div className="no-print" style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <button onClick={() => onGoToPurchase && onGoToPurchase()}
              style={{ padding:"7px 12px", background:NAVY, color:"#FFF",
                border:`1px solid ${NAVY}`, cursor:"pointer", fontSize:11, fontWeight:700 }}>
              🛒 Purchase
            </button>
            <button onClick={() => onGoToImport && onGoToImport()}
              style={{ padding:"7px 12px", background:"#FFF", color:NAVY,
                border:`1px solid ${BORDER}`, cursor:"pointer", fontSize:11, fontWeight:600 }}>
              📦 Import
            </button>
            <button onClick={() => onGoToSales && onGoToSales()}
              style={{ padding:"7px 12px", background:"#FFF", color:NAVY,
                border:`1px solid ${BORDER}`, cursor:"pointer", fontSize:11, fontWeight:600 }}>
              🧾 Sales
            </button>
            <button onClick={fetchEntries} title="Refresh"
              style={{ padding:"7px 12px", background:"#FFF", border:`1px solid ${BORDER}`, cursor:"pointer", fontSize:14 }}>⟳</button>
            <button onClick={exportCSV}
              style={{ padding:"7px 14px", background:"#FFF", border:`1px solid ${BORDER}`, cursor:"pointer", fontSize:12, fontWeight:600 }}>↓ CSV</button>
            <button onClick={() => window.print()}
              style={{ padding:"7px 14px", background:"#FFF", border:`1px solid ${BORDER}`, cursor:"pointer", fontSize:12, fontWeight:600, color:ERR }}>↓ PDF</button>
          </div>
        </div>

        {/* Account info card (if selected) */}
        {selAcc && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:16 }}>
            {[
              { label:"GL CODE",       value:selAcc.gl_code },
              { label:"ACCOUNT TYPE",  value:selAcc.account_type==="BS"?"Balance Sheet":"P&L" },
              { label:"OPENING BAL",   value:`Rs.${fmtT(Math.abs(openingBal))} ${openingBal>=0?"Dr":"Cr"}`, color:openingBal>=0?NAVY:ERR },
              { label:"TOTAL DEBITS",  value:`Rs.${fmtT(totals.dr)}`, color:GREEN },
              { label:"TOTAL CREDITS", value:`Rs.${fmtT(totals.cr)}`, color:ERR },
            ].map((c,i) => (
              <div key={i} style={{ background:"#FFF", border:`1px solid ${BORDER}`, padding:"10px 12px" }}>
                <div style={{ fontSize:9, fontWeight:700, color:DIM, letterSpacing:"0.08em", marginBottom:4 }}>{c.label}</div>
                <div style={{ fontSize:13, fontWeight:700, color:c.color||NAVY, fontFamily:"monospace" }}>{c.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Source category tabs */}
        <div className="no-print" style={{ display:"flex", gap:0, borderBottom:`2px solid ${BORDER}`, marginBottom:14, flexWrap:"wrap" }}>
          {["All","Purchase","Sales","Bank","FA","Journal"].map(cat => (
            <button key={cat}
              onClick={() => { setSourceCategory(cat); setShowVoidTab(false); }}
              style={{
                padding:"8px 16px", border:"none", cursor:"pointer", fontSize:12, fontWeight:600,
                background: (!showVoidTab && sourceCategory===cat) ? NAVY : "#FFF",
                color: (!showVoidTab && sourceCategory===cat) ? "#FFF" : DIM,
                borderBottom: (!showVoidTab && sourceCategory===cat) ? `2px solid ${NAVY}` : "2px solid transparent",
                marginBottom:-2,
              }}>
              {cat}{categoryCounts[cat]!=null && ` (${categoryCounts[cat]})`}
            </button>
          ))}
          <button onClick={() => setShowVoidTab(true)}
            style={{
              padding:"8px 16px", border:"none", cursor:"pointer", fontSize:12, fontWeight:700,
              background: showVoidTab ? "#7B3030" : "#FFF",
              color: showVoidTab ? "#FFF" : ERR,
              borderBottom: showVoidTab ? "2px solid #7B3030" : "2px solid transparent",
              marginBottom:-2,
            }}>
            ⚠ Voided{categoryCounts.Void!=null && ` (${categoryCounts.Void})`}
          </button>
        </div>

        {showVoidTab && (
          <div style={{ padding:"8px 12px", marginBottom:12, background:"#FFF0F0",
            border:`1px solid ${ERR}`, fontSize:11.5, color:"#7B3030" }}>
            Voided entries are reversal postings excluded from Trial Balance, P&L, and
            Balance Sheet by default. They are shown here for audit purposes only.
          </div>
        )}

        {/* Filters */}
        <div className="no-print" style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center", flexWrap:"wrap" }}>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            <span style={{ fontSize:12, color:DIM }}>From (AD)</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding:"6px 8px", border:`1px solid ${BORDER}`, fontSize:12 }} />
            <span style={{ fontSize:12, color:DIM }}>To</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding:"6px 8px", border:`1px solid ${BORDER}`, fontSize:12 }} />
            {(dateFrom||dateTo) && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                style={{ padding:"5px 10px", background:"#FFF", border:`1px solid ${BORDER}`, fontSize:11, cursor:"pointer", color:DIM }}>✕</button>
            )}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search description, ref, source…"
            style={{ flex:1, minWidth:180, padding:"7px 12px", border:`1px solid ${BORDER}`, fontSize:13 }} />
        </div>

        {loading && <div style={{ padding:40, textAlign:"center", color:DIM }}>Loading…</div>}
        {error   && <div style={{ padding:16, color:ERR, background:"#FFF0F0", border:`1px solid ${ERR}` }}>{error}</div>}

        {!loading && !error && (
          <div style={{ overflowX:"auto" }}>
            <table style={{ borderCollapse:"collapse", width:"100%", minWidth:900 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width:90 }}>DATE</th>
                  <th style={TH}>UNIQUE ID / REF</th>
                  {!selAcc && <th style={TH}>GL CODE</th>}
                  {!selAcc && <th style={TH}>GL NAME</th>}
                  <th style={{ ...TH, minWidth:220 }}>DESCRIPTION</th>
                  <th style={THR}>DEBIT (Dr)</th>
                  <th style={THR}>CREDIT (Cr)</th>
                  <th style={THR}>BALANCE</th>
                  <th style={TH}>SOURCE</th>
                  <th style={TH}>TXN TYPE</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening balance row for selected account */}
                {selAcc && (
                  <tr className="ob-row" style={{ background:"#FFF8E6" }}>
                    <td style={{ ...TD, color:DIM, fontSize:11 }}>—</td>
                    <td style={{ ...TD, fontFamily:"monospace", fontSize:11, color:GOLD }}>OPENING BALANCE</td>
                    <td style={{ ...TD, fontStyle:"italic", color:DIM }}>Balance brought forward</td>
                    <td style={{ ...TDR, color:openingBal>0?GREEN:DIM }}>
                      {openingBal>0 ? fmtT(openingBal) : ""}
                    </td>
                    <td style={{ ...TDR, color:openingBal<0?ERR:DIM }}>
                      {openingBal<0 ? fmtT(Math.abs(openingBal)) : ""}
                    </td>
                    <td style={{ ...TDR }}>{fmtBal(openingBal)}</td>
                    <td style={{ ...TD, fontSize:10, color:GOLD }}>OB</td>
                    <td style={{ ...TD, fontSize:10, color:DIM }}>—</td>
                  </tr>
                )}

                {filtered.length === 0 ? (
                  <tr><td colSpan={selAcc?8:10}
                    style={{ padding:30, textAlign:"center", color:DIM }}>
                    No GL entries found. {selAcc ? "No transactions posted to this account yet." : ""}
                  </td></tr>
                ) : (() => {
                  let running = openingBal;
                  return filtered.map((e, i) => {
                    running += (Number(e.dr_amount)||0) - (Number(e.cr_amount)||0);
                    return (
                      <tr key={e.id} style={{ background: e.is_void_entry ? "#FFF0F0" : (i%2===0?"#FFF":LIGHT) }}>
                        <td style={{ ...TD, fontSize:11, textDecoration:e.is_void_entry?"line-through":"none", color:e.is_void_entry?DIM:"inherit" }}>{e.entry_date}</td>
                        <td style={{ ...TD, fontFamily:"monospace", fontSize:11, color:e.is_void_entry?ERR:NAVY, fontWeight:600, textDecoration:e.is_void_entry?"line-through":"none" }}>{e.unique_id}</td>
                        {!selAcc && <td style={{ ...TD, fontFamily:"monospace", fontSize:11 }}>{e.gl_code}</td>}
                        {!selAcc && <td style={{ ...TD, fontSize:11 }}>{e.gl_name}</td>}
                        <td style={{ ...TD, maxWidth:280, overflow:"hidden", textOverflow:"ellipsis" }}>{e.description}</td>
                        <td style={{ ...TDR, color:GREEN, fontWeight:Number(e.dr_amount)>0?700:400 }}>
                          {fmt(e.dr_amount)}
                        </td>
                        <td style={{ ...TDR, color:ERR, fontWeight:Number(e.cr_amount)>0?700:400 }}>
                          {fmt(e.cr_amount)}
                        </td>
                        <td style={{ ...TDR }}>{showVoidTab ? "—" : fmtBal(running)}</td>
                        <td style={{ ...TD, fontSize:11, fontWeight:600, color:e.is_void_entry?ERR:sourceColor(e.source) }}>{e.source}</td>
                        <td style={{ ...TD, fontSize:11, color:DIM }}>{e.transaction_type}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
              <tfoot>
                <tr className="tot-row" style={{ background:NAVY }}>
                  <td colSpan={selAcc?3:5}
                    style={{ padding:"9px 8px", fontWeight:700, color:"#FFF", fontSize:12 }}>
                    TOTAL ({filtered.length} entries)
                  </td>
                  <td style={{ ...TDR, background:NAVY, fontWeight:700, color:"#90EE90", fontSize:13, borderBottom:"none" }}>
                    {fmtT(totals.dr)}
                  </td>
                  <td style={{ ...TDR, background:NAVY, fontWeight:700, color:"#FF9999", fontSize:13, borderBottom:"none" }}>
                    {fmtT(totals.cr)}
                  </td>
                  <td style={{ ...TDR, background:NAVY, fontWeight:800, color:"#FFD700", fontSize:13, borderBottom:"none" }}>
                    {fmtBal(openingBal + totals.dr - totals.cr)}
                  </td>
                  <td colSpan={2} style={{ background:NAVY }} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
