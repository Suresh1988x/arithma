import { useState, useEffect, useCallback } from "react";

// PurchaseEntryPage.js — ARITHMA Local Purchase Entry
// Multi-item form: fill header once, add up to 10 item rows, SAVE BILL posts all at once.
// Purchase Return: auto-fetches original bill items when bill ref is entered.

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";

const NAVY     = "#1B3A5C";
const GOLD     = "#B8860B";
const BORDER   = "#D6D0C2";
const TEXT_DIM = "#6B645A";
const ERROR    = "#A8453B";
const GREEN    = "#2E7D4F";
const CREAM    = "#F7F4ED";

const TXN_TYPES = ["Purchase", "Purchase Return", "Debit Note"];

const FA_BLOCK_GL = {
  "LAND":    "1010 - Factory Land",
  "BLOCK A": "1020 - Factory Building",
  "BLOCK B": "1050 - Office Equipment",
  "BLOCK C": "1070 - Vehicles",
  "BLOCK D": "1030 - Plant & Machinery",
  "BLOCK E": "1300 - Intangible Assets",
};
const FA_BLOCKS = Object.keys(FA_BLOCK_GL);

const EMPTY_ITEM = {
  _id: 0,
  product_name: "", product_code: "", qty: "", rate: "",
  is_taxable: true, is_service: false, is_capital: false,
  capital_item_name: "", sub_group: "BLOCK B",
  gl_account: FA_BLOCK_GL["BLOCK B"],
  dep_rate_pct: "", residual_value_pct: "5", dep_method: "WDV",
};

function makeItem(id) { return { ...EMPTY_ITEM, _id: id }; }

function fmt(n, dec = 2) {
  return (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

const fld = {
  padding: "7px 9px", border: `1px solid ${BORDER}`,
  background: "#FFFFFF", fontSize: 12, width: "100%", boxSizing: "border-box",
};
const fldAuto = { ...fld, background: "#F2EEE2", color: TEXT_DIM };
const lbl = {
  fontSize: 9, letterSpacing: "0.1em", color: TEXT_DIM,
  fontWeight: 700, display: "block", marginBottom: 3,
};

export default function PurchaseEntryPage({ session, companyId, companies, homeSettings, onViewPurchaseBook, onViewPartyLedger, onViewGLBook }) {

  // ── Header state ───────────────────────────────────────────
  const [entryDate,   setEntryDate]   = useState(new Date().toISOString().slice(0, 10));
  const [dateBs,      setDateBs]      = useState("");
  const [billNo,      setBillNo]      = useState("");
  const [vendorName,  setVendorName]  = useState("");
  const [vendorPan,   setVendorPan]   = useState("");
  const [txnType,     setTxnType]     = useState("Purchase");
  const [origBillRef, setOrigBillRef] = useState("");

  // ── Original bill fetch state (Purchase Return only) ───────
  const [origFetching, setOrigFetching] = useState(false);
  const [origFetchMsg, setOrigFetchMsg] = useState("");

  // ── Item rows ──────────────────────────────────────────────
  const [items,   setItems]   = useState([makeItem(1), makeItem(2), makeItem(3), makeItem(4), makeItem(5)]);
  const [nextId,  setNextId]  = useState(6);
  const [expandedItem, setExpandedItem] = useState(null);

  // ── Lookup data ────────────────────────────────────────────
  const [vendors,   setVendors]   = useState([]);
  const [materials, setMaterials] = useState([]);
  const [vatRate,   setVatRate]   = useState(13);

  // ── UI state ───────────────────────────────────────────────
  const [saving,     setSaving]     = useState(false);
  const [showJournal,setShowJournal] = useState(false);
  const [msg,        setMsg]        = useState("");
  const [error,      setError]      = useState("");
  const [savedBills, setSavedBills] = useState([]);

  const companyName = homeSettings?.company_name
    || companies?.find(c => c.id === companyId)?.name || "";

  // ── Initial data fetch ─────────────────────────────────────
  useEffect(() => {
    if (!companyId) return;

    // Vendors
    fetch(`${BACKEND}/api/purchase/vendors?company_id=${companyId}`)
      .then(r => r.json()).then(d => setVendors(d.vendors || [])).catch(() => {});

    // Materials (all types)
    Promise.all(["RM","FG","Sub","Service"].map(t =>
      fetch(`${BACKEND}/api/materials?company_id=${companyId}&type=${t}`)
        .then(r => r.json()).then(d => d.materials || [])
    )).then(all => setMaterials(all.flat())).catch(() => {});

    // VAT rate: DB stores as decimal (0.13 = 13%). Nepal standard = 13%.
    fetch(`${BACKEND}/api/settings?company_id=${companyId}`)
      .then(r => r.json())
      .then(d => {
        // API returns vat_rate directly at top level (e.g. d.vat_rate = 0.13)
        const raw = parseFloat(d.vat_rate ?? d.settings?.vat_rate ?? 0);
        if (raw > 0) {
          // DB stores as decimal (0.13). Multiply × 100 → 13.
          // Use toFixed(2) then parseFloat to kill JS float precision noise
          const pct = parseFloat((raw * 100).toFixed(2));
          setVatRate(pct);
        }
        // If fetch fails or returns 0, default of 13 (set in useState) is used
      }).catch(() => {});
  }, [companyId]);

  // ── Vendor auto-fill ───────────────────────────────────────
  const handleVendorChange = (name) => {
    const v = vendors.find(v => v.name === name);
    setVendorName(name);
    setVendorPan(v?.pan || "");
  };

  // ── Product auto-fill ──────────────────────────────────────
  const handleProductChange = (id, name) => {
    const mat = materials.find(m => m.product_name === name);
    setItems(prev => prev.map(it => it._id === id ? {
      ...it,
      product_name: name,
      product_code: mat?.product_code || "",
      is_service: mat?.material_type === "Service",
    } : it));
  };

  // ── Capital block change ───────────────────────────────────
  const handleBlockChange = (id, block) => {
    setItems(prev => prev.map(it => it._id === id ? {
      ...it,
      sub_group:  block,
      gl_account: FA_BLOCK_GL[block] || "",
      dep_method: block === "BLOCK E" ? "SLM" : "WDV",
    } : it));
  };

  // ── Fetch original bill for Purchase Return ────────────────
  const fetchOriginalBill = useCallback(async (billRef) => {
    if (!billRef.trim() || txnType === "Purchase") return;
    setOrigFetching(true);
    setOrigFetchMsg("");
    try {
      const res  = await fetch(
        `${BACKEND}/api/purchase?company_id=${companyId}&search=${encodeURIComponent(billRef.trim())}&limit=50`
      );
      const data = await res.json();

      // Exact bill_no match, original Purchase type, not voided
      const matched = (data.entries || []).filter(
        e => (e.bill_no === billRef.trim() || e.internal_ref === billRef.trim()) && e.transaction_type === "Purchase" && !e.is_void
      );

      if (matched.length === 0) {
        setOrigFetchMsg(`⚠ No Purchase entry found for "${billRef.trim()}". Try the internal ref (e.g. PV-0001) from Purchase Book.`);
        return;
      }

      // Pre-fill vendor from first matched entry
      const first = matched[0];
      setVendorName(first.vendor_name || "");
      setVendorPan(first.vendor_pan  || "");

      // Map matched entries → item rows
      const fetched = matched.map((e, i) => ({
        _id:               i + 1,
        product_name:      e.product_name       || "",
        product_code:      e.product_code       || "",
        qty:               e.qty  ? String(e.qty)  : "",
        rate:              e.rate ? String(e.rate) : "",
        is_taxable:        !!e.is_taxable,
        is_service:        !!e.is_service,
        is_capital:        !!e.is_capital,
        capital_item_name: e.capital_item_name  || "",
        sub_group:         e.sub_group          || "BLOCK B",
        gl_account:        e.gl_account         || FA_BLOCK_GL["BLOCK B"],
        dep_rate_pct:      e.dep_rate_pct  ? String(e.dep_rate_pct)       : "",
        residual_value_pct:e.residual_value_pct ? String(e.residual_value_pct) : "5",
        dep_method:        e.dep_method         || "WDV",
      }));

      // Ensure at least 5 rows total
      while (fetched.length < 5) {
        fetched.push({ ...EMPTY_ITEM, _id: fetched.length + 1 });
      }
      setItems(fetched);
      setNextId(fetched.length + 1);

      setOrigFetchMsg(
        `✅ Fetched ${matched.length} item(s) from bill "${billRef.trim()}" · Vendor & items pre-filled. Adjust qty/rate if partial return.`
      );
    } catch {
      setOrigFetchMsg("❌ Could not fetch original bill. Check connection.");
    } finally {
      setOrigFetching(false);
    }
  }, [companyId, txnType]);

  // ── Item field update ──────────────────────────────────────
  const setItemField = (id, field, value) => {
    setItems(prev => prev.map(it => it._id === id ? { ...it, [field]: value } : it));
  };

  // ── Add / remove rows ──────────────────────────────────────
  const addRow = () => {
    if (items.length >= 10) return;
    setItems(prev => [...prev, makeItem(nextId)]);
    setNextId(n => n + 1);
  };

  const removeRow = (id) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter(it => it._id !== id));
    if (expandedItem === id) setExpandedItem(null);
  };

  // ── Per-item amount calculation ────────────────────────────
  const calcItem = (it) => {
    const qty  = parseFloat(it.qty)  || 0;
    const rate = parseFloat(it.rate) || 0;
    const base = it.is_service ? rate : qty * rate;
    const vr   = vatRate / 100;
    const sign = txnType === "Purchase" ? 1 : -1;
    if (it.is_capital) {
      const capTax = it.is_taxable ? round2(base) : 0;
      const capVat = it.is_taxable ? round2(base * vr) : 0;
      return { taxable: 0, vat: 0, lineTotal: 0, nonTax: 0, capTaxable: capTax * sign, capVat: capVat * sign, capTotal: round2((capTax + capVat) * sign) };
    }
    if (it.is_taxable) {
      return { taxable: round2(base * sign), vat: round2(base * vr * sign), lineTotal: round2(base * (1 + vr) * sign), nonTax: 0, capTaxable: 0, capVat: 0, capTotal: 0 };
    }
    return { taxable: 0, vat: 0, lineTotal: 0, nonTax: round2(base * sign), capTaxable: 0, capVat: 0, capTotal: 0 };
  };

  function round2(n) { return Math.round(n * 100) / 100; }

  // ── Grand totals across all items ─────────────────────────
  const filledItems = items.filter(it =>
    (it.product_name || it.capital_item_name) &&
    (parseFloat(it.rate) > 0)
  );

  const grandTotals = filledItems.reduce((acc, it) => {
    const c = calcItem(it);
    return {
      taxable:   acc.taxable   + c.taxable,
      vat:       acc.vat       + c.vat,
      lineTotal: acc.lineTotal + c.lineTotal,
      nonTax:    acc.nonTax    + c.nonTax,
      capTotal:  acc.capTotal  + c.capTotal,
      grand:     acc.grand     + c.lineTotal + c.nonTax + c.capTotal,
    };
  }, { taxable: 0, vat: 0, lineTotal: 0, nonTax: 0, capTotal: 0, grand: 0 });

  // ── Journal preview — what will be posted on SAVE ────────────
  const buildJournalPreview = () => {
    const lines = [];
    const vatRate_ = vatRate / 100;
    const sign = txnType === "Purchase" ? 1 : -1;

    filledItems.forEach((it, i) => {
      const qty  = parseFloat(it.qty)  || 0;
      const rate = parseFloat(it.rate) || 0;
      const base = it.is_service ? rate : qty * rate;
      const ref  = `Item ${i+1}: ${it.product_name || it.capital_item_name}`;

      if (it.is_capital) {
        const capTax = it.is_taxable ? Math.round(base * 100)/100 : 0;
        const capVat = it.is_taxable ? Math.round(base * vatRate_ * 100)/100 : 0;
        const capTot = capTax + capVat;
        // Dr Fixed Asset GL
        lines.push({ dr: it.gl_account || "1050 - Fixed Asset", cr: "", amt: capTot, desc: `Capital Purchase — ${it.capital_item_name}`, ref });
        // Dr VAT Input
        if (capVat > 0) lines.push({ dr: "2150 - VAT Input Receivable", cr: "", amt: capVat, desc: `VAT Input — ${it.capital_item_name}`, ref });
        // Cr Trade Creditors
        lines.push({ dr: "", cr: "5010 - Trade Creditors / Payables", amt: capTot, desc: `Payable to ${vendorName}`, ref });
      } else if (it.is_taxable) {
        const tv = Math.round(base * 100)/100;
        const va = Math.round(base * vatRate_ * 100)/100;
        const ta = tv + va;
        const pgc = txnType === "Purchase" ? "7100 - Purchase - Taxable Goods" : "7120 - Purchase Returns";
        if (sign === 1) {
          lines.push({ dr: pgc, cr: "", amt: tv, desc: `${txnType} — ${it.product_name}`, ref });
          if (va > 0) lines.push({ dr: "2150 - VAT Input Receivable", cr: "", amt: va, desc: `VAT Input — ${it.product_name}`, ref });
          lines.push({ dr: "", cr: "5010 - Trade Creditors / Payables", amt: ta, desc: `Payable to ${vendorName}`, ref });
        } else {
          lines.push({ dr: "5010 - Trade Creditors / Payables", cr: "", amt: ta, desc: `Return — Payable reduced`, ref });
          lines.push({ dr: "", cr: pgc, amt: tv, desc: `${txnType} — ${it.product_name}`, ref });
          if (va > 0) lines.push({ dr: "", cr: "2150 - VAT Input Receivable", amt: va, desc: `VAT Reversal`, ref });
        }
      } else {
        const ntv = Math.round(base * 100)/100;
        const pgc = "7110 - Purchase - Non-Taxable Goods";
        if (sign === 1) {
          lines.push({ dr: pgc, cr: "", amt: ntv, desc: `Non-Taxable Purchase — ${it.product_name}`, ref });
          lines.push({ dr: "", cr: "5010 - Trade Creditors / Payables", amt: ntv, desc: `Payable to ${vendorName}`, ref });
        } else {
          lines.push({ dr: "5010 - Trade Creditors / Payables", cr: "", amt: ntv, desc: `Return`, ref });
          lines.push({ dr: "", cr: pgc, amt: ntv, desc: `Return — ${it.product_name}`, ref });
        }
      }
    });
    return lines;
  };

  // ── Save bill ──────────────────────────────────────────────
  const doSave = async () => {
    setError(""); setMsg("");
    if (!vendorName.trim()) { setError("Vendor Name is required."); return; }
    if (!entryDate)         { setError("Entry Date is required.");  return; }
    if (filledItems.length === 0) { setError("Enter at least one item with a rate."); return; }
    if ((txnType === "Purchase Return" || txnType === "Debit Note") && !origBillRef.trim()) {
      setError("Original Bill Reference is required for Purchase Return and Debit Note."); return;
    }

    for (const it of filledItems) {
      if (it.is_capital && !it.capital_item_name) {
        setError("Capital Item Name is required for capital items."); return;
      }
      if (!it.is_service && !it.is_capital && !(parseFloat(it.qty) > 0)) {
        setError(`Qty is required for: ${it.product_name}`); return;
      }
      if (!(parseFloat(it.rate) > 0)) {
        setError(`Rate is required for: ${it.product_name || it.capital_item_name}`); return;
      }
    }

    setSaving(true);
    try {
      const results = await Promise.all(filledItems.map(it =>
        fetch(`${BACKEND}/api/purchase`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_id:         companyId,
            requesting_user_id: session?.user?.id || session?.id,
            entry_date:         entryDate,
            date_bs:            dateBs,
            bill_no:            billNo,
            vendor_name:        vendorName,
            vendor_pan:         vendorPan,
            product_code:       it.product_code,
            product_name:       it.product_name,
            qty:                parseFloat(it.qty)  || 0,
            rate:               parseFloat(it.rate) || 0,
            is_taxable:         it.is_taxable,
            is_capital:         it.is_capital,
            is_service:         it.is_service,
            transaction_type:   txnType,
            original_bill_ref:  origBillRef,
            capital_item_name:  it.capital_item_name,
            sub_group:          it.sub_group,
            gl_account:         it.gl_account,
            dep_rate_pct:       parseFloat(it.dep_rate_pct)       || 0,
            residual_value_pct: parseFloat(it.residual_value_pct) || 5,
            dep_method:         it.dep_method,
          }),
        }).then(r => r.json())
      ));

      const errs = results.filter(r => r.error);
      if (errs.length > 0) { setError(errs[0].error); return; }

      const refs    = results.map(r => r.internal_ref).join(", ");
      const faCodes = results.filter(r => r.fa_code).map(r => r.fa_code).join(", ");

      setSavedBills(prev => [{
        refs, billNo, vendor: vendorName,
        items: filledItems.length,
        total: fmt(Math.abs(grandTotals.grand)),
        type: txnType, fa_codes: faCodes,
      }, ...prev].slice(0, 20));

      setMsg(`✓ Bill saved! ${filledItems.length} item(s) posted. Refs: ${refs}${faCodes ? " · FA: " + faCodes : ""}`);
      clearForm();
    } catch (e) {
      setError("Could not reach the server: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Clear form ─────────────────────────────────────────────
  const clearForm = () => {
    setBillNo(""); setVendorName(""); setVendorPan(""); setDateBs("");
    setOrigBillRef(""); setOrigFetchMsg(""); setTxnType("Purchase");
    setItems([makeItem(1), makeItem(2), makeItem(3), makeItem(4), makeItem(5)]);
    setNextId(6); setExpandedItem(null); setError(""); setMsg("");
  };

  const isReturn = txnType !== "Purchase";
  const signLabel = isReturn ? "(−  Return / Reversal)" : "";

  const journalLines = showJournal ? buildJournalPreview() : [];
  const totalDr = journalLines.reduce((s,l) => s + (l.dr ? l.amt : 0), 0);
  const totalCr = journalLines.reduce((s,l) => s + (l.cr ? l.amt : 0), 0);
  const isBalanced = Math.abs(totalDr - totalCr) < 0.01;

  // ── Styles ─────────────────────────────────────────────────
  const sectionHead = (letter, title, extra) => (
    <div className="sans" style={{
      background: NAVY, color: CREAM, padding: "6px 14px",
      fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
      display: "flex", justifyContent: "space-between",
    }}>
      <span>{letter}. {title}</span>
      {extra && <span style={{ color: "#C8D4DE", fontWeight: 400 }}>{extra}</span>}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Source Serif Pro',Georgia,serif", background: CREAM, minHeight: "calc(100vh - 90px)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+Pro:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap');
        .sans { font-family:'Inter',sans-serif; }
        .mono { font-family:'IBM Plex Mono',monospace; }
        input:focus, select:focus { outline: 2px solid ${GOLD}; outline-offset: 1px; }
        input[type=checkbox] { width: 15px; height: 15px; cursor: pointer; }
      `}</style>

      {/* ── Journal Preview Modal ── */}
      {showJournal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)",
          display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999, fontFamily:"Arial,sans-serif" }}>
          <div style={{ background:"#FFF", width:"min(780px,96vw)", maxHeight:"85vh",
            display:"flex", flexDirection:"column", borderRadius:2, boxShadow:"0 12px 40px rgba(0,0,0,0.25)" }}>

            {/* Modal header */}
            <div style={{ background:NAVY, padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ color:"#FFF", fontWeight:700, fontSize:16 }}>📋 Journal Entry Preview</div>
                <div style={{ color:"#C8D4DE", fontSize:12, marginTop:3 }}>
                  {txnType} · {vendorName} · {entryDate} · {filledItems.length} item(s)
                </div>
              </div>
              <button onClick={() => setShowJournal(false)}
                style={{ background:"transparent", border:"1px solid rgba(255,255,255,0.4)",
                  color:"#FFF", padding:"6px 14px", cursor:"pointer", fontSize:13, fontWeight:700 }}>
                ✕ Close
              </button>
            </div>

            {/* Balance check banner */}
            <div style={{ padding:"10px 20px", fontSize:12, fontWeight:700,
              background: isBalanced ? "#D4EDDA" : "#FFF3CD",
              color: isBalanced ? GREEN : "#856404",
              borderBottom:`1px solid ${BORDER}` }}>
              {isBalanced
                ? `✅ Balanced — Total Dr = Total Cr = Rs.${(totalDr).toLocaleString("en-IN",{minimumFractionDigits:2})}`
                : `⚠ UNBALANCED — Dr: Rs.${totalDr.toFixed(2)} ≠ Cr: Rs.${totalCr.toFixed(2)} — do not save`}
            </div>

            {/* Journal table */}
            <div style={{ overflowY:"auto", flex:1 }}>
              <table style={{ borderCollapse:"collapse", width:"100%" }}>
                <thead style={{ position:"sticky", top:0 }}>
                  <tr>
                    <th style={{ padding:"8px 10px", fontSize:10, fontWeight:700, color:"#FFF",
                      background:NAVY, textAlign:"left", whiteSpace:"nowrap" }}>GL ACCOUNT (DEBIT)</th>
                    <th style={{ padding:"8px 10px", fontSize:10, fontWeight:700, color:"#FFF",
                      background:NAVY, textAlign:"left", whiteSpace:"nowrap" }}>GL ACCOUNT (CREDIT)</th>
                    <th style={{ padding:"8px 10px", fontSize:10, fontWeight:700, color:"#FFF",
                      background:NAVY, textAlign:"right", whiteSpace:"nowrap" }}>AMOUNT (NPR)</th>
                    <th style={{ padding:"8px 10px", fontSize:10, fontWeight:700, color:"#FFF",
                      background:NAVY, textAlign:"left" }}>NARRATION</th>
                  </tr>
                </thead>
                <tbody>
                  {journalLines.map((l, i) => (
                    <tr key={i} style={{ background: i%2===0?"#FFF":"#F7F4ED" }}>
                      <td style={{ padding:"9px 10px", fontSize:12, borderBottom:`1px solid ${BORDER}`,
                        fontWeight:l.dr?700:400, color:l.dr?GREEN:BORDER }}>
                        {l.dr || "—"}
                      </td>
                      <td style={{ padding:"9px 10px", fontSize:12, borderBottom:`1px solid ${BORDER}`,
                        fontWeight:l.cr?700:400, color:l.cr?ERROR:BORDER }}>
                        {l.cr || "—"}
                      </td>
                      <td style={{ padding:"9px 10px", fontSize:12, borderBottom:`1px solid ${BORDER}`,
                        textAlign:"right", fontFamily:"monospace", fontWeight:700, color:NAVY }}>
                        {l.amt.toLocaleString("en-IN",{minimumFractionDigits:2})}
                      </td>
                      <td style={{ padding:"9px 10px", fontSize:11, borderBottom:`1px solid ${BORDER}`,
                        color:"#555" }}>
                        {l.desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background:NAVY }}>
                    <td style={{ padding:"9px 10px", fontWeight:700, color:"#90EE90", fontSize:12 }}>
                      TOTAL DEBIT
                    </td>
                    <td style={{ padding:"9px 10px", fontWeight:700, color:"#FF9999", fontSize:12 }}>
                      TOTAL CREDIT
                    </td>
                    <td colSpan={2} />
                  </tr>
                  <tr style={{ background:"#0F2840" }}>
                    <td style={{ padding:"9px 10px", fontWeight:800, color:"#90EE90", fontSize:13, fontFamily:"monospace" }}>
                      Rs.{totalDr.toLocaleString("en-IN",{minimumFractionDigits:2})}
                    </td>
                    <td style={{ padding:"9px 10px", fontWeight:800, color:"#FF9999", fontSize:13, fontFamily:"monospace" }}>
                      Rs.{totalCr.toLocaleString("en-IN",{minimumFractionDigits:2})}
                    </td>
                    <td colSpan={2} style={{ padding:"9px 10px", fontSize:11, color:"rgba(255,255,255,0.5)" }}>
                      {isBalanced ? "✅ Ready to post" : "❌ Fix imbalance before saving"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Modal footer buttons */}
            <div style={{ padding:"14px 20px", borderTop:`1px solid ${BORDER}`,
              display:"flex", gap:10, background:"#FAFAF8" }}>
              <button onClick={() => { setShowJournal(false); doSave(); }}
                disabled={!isBalanced || saving}
                className="sans"
                style={{ flex:2, padding:12, background:isBalanced?GREEN:"#AAA",
                  color:"#FFF", border:"none", fontWeight:700, fontSize:14,
                  cursor:isBalanced&&!saving?"pointer":"not-allowed" }}>
                {saving ? "SAVING…" : "✓ CONFIRM & SAVE BILL"}
              </button>
              <button onClick={() => setShowJournal(false)} className="sans"
                style={{ flex:1, padding:12, background:"#FFF", color:NAVY,
                  border:`2px solid ${BORDER}`, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                ← Go Back & Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Company ribbon ── */}
      <div style={{ background: "linear-gradient(135deg,#10243B 0%,#1E3F61 55%,#2E6E9E 100%)", padding: "12px 32px", borderBottom: "3px solid #B8860B" }}>
        <div className="sans" style={{ fontSize: 13, fontWeight: 700, color: "#F0D78C", letterSpacing: "0.08em" }}>
          {companyName.toUpperCase()}
          {session?.fiscalYear && <>
            <span style={{ color: "#7E97AE", margin: "0 10px" }}>·</span>
            <span style={{ color: "#C8D4DE" }}>FY {session.fiscalYear}</span>
          </>}
        </div>
      </div>

      <div style={{ padding: "20px 28px", maxWidth: 1280, margin: "0 auto" }}>

        {/* ── Page header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, color: NAVY }}>Purchase Entry</div>
            <div className="sans" style={{ fontSize: 11, color: TEXT_DIM }}>
              Local Purchases · VAT {Number(vatRate.toFixed(2))}% · {txnType !== "Purchase" && <span style={{ color: ERROR, fontWeight: 700 }}>{txnType.toUpperCase()}</span>}
            </div>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            {onViewPurchaseBook && (
              <button onClick={onViewPurchaseBook} className="sans" style={{
                background:"transparent", color:NAVY, border:`1px solid ${BORDER}`,
                padding:"8px 12px", fontSize:11, fontWeight:600, cursor:"pointer",
              }}>☰ Purchase Book</button>
            )}
            {onViewPartyLedger && (
              <button onClick={onViewPartyLedger} className="sans" style={{
                background:"transparent", color:NAVY, border:`1px solid ${BORDER}`,
                padding:"8px 12px", fontSize:11, fontWeight:600, cursor:"pointer",
              }}>📒 Party Ledger</button>
            )}
            {onViewGLBook && (
              <button onClick={onViewGLBook} className="sans" style={{
                background:"transparent", color:NAVY, border:`1px solid ${BORDER}`,
                padding:"8px 12px", fontSize:11, fontWeight:600, cursor:"pointer",
              }}>📗 GL Book</button>
            )}
          </div>
        </div>

        {/* ── Messages ── */}
        {error && <div className="sans" style={{ color: ERROR, fontSize: 12, padding: "9px 14px", background: "#FBEAE8", border: `1px solid ${ERROR}`, marginBottom: 12 }}>{error}</div>}
        {msg   && <div className="sans" style={{ color: GREEN, fontSize: 12, padding: "9px 14px", background: "#EFF5EF", border: `1px solid ${GREEN}`, marginBottom: 12, fontWeight: 600 }}>{msg}</div>}

        {/* ══════════════════════════════════════════════════════
            SECTION A — BILL HEADER
        ══════════════════════════════════════════════════════ */}
        <div style={{ background: "#FFFFFF", border: `1px solid ${NAVY}`, marginBottom: 10 }}>
          {sectionHead("A", "BILL HEADER")}
          <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12 }}>

            <div>
              <label className="sans" style={lbl}>ENTRY DATE (AD) *</label>
              <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={fld} />
            </div>

            <div>
              <label className="sans" style={lbl}>DATE (BS)</label>
              <input value={dateBs} onChange={e => setDateBs(e.target.value)}
                placeholder="e.g. 15 Shrawan 2082" style={fld} />
            </div>

            <div>
              <label className="sans" style={lbl}>TRANSACTION TYPE</label>
              <select value={txnType} onChange={e => {
                setTxnType(e.target.value);
                setOrigBillRef(""); setOrigFetchMsg("");
              }} style={fld}>
                {TXN_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="sans" style={lbl}>PARTY BILL NO.</label>
              <input value={billNo} onChange={e => setBillNo(e.target.value)}
                placeholder="Supplier's invoice no." style={fld} />
            </div>

            <div style={{ gridColumn: "span 2" }}>
              <label className="sans" style={lbl}>VENDOR NAME *</label>
              <input list="vendor-list" value={vendorName}
                onChange={e => handleVendorChange(e.target.value)}
                placeholder="Type or select vendor" style={fld} />
              <datalist id="vendor-list">
                {vendors.map(v => <option key={v.id} value={v.name} />)}
              </datalist>
            </div>

            <div>
              <label className="sans" style={lbl}>VENDOR PAN (auto)</label>
              <input value={vendorPan} onChange={e => setVendorPan(e.target.value)} style={fldAuto} />
            </div>

            {/* ── Original Bill Ref — Purchase Return & Debit Note ── */}
            {(txnType === "Purchase Return" || txnType === "Debit Note") && (
              <div style={{ gridColumn: "span 3" }}>
                <label className="sans" style={{ ...lbl, color: ERROR }}>
                  ORIGINAL BILL REFERENCE * — enter and press Enter or click ↓ Fetch to auto-fill items (qty & rate editable after fetch)
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={origBillRef}
                    onChange={e => { setOrigBillRef(e.target.value); setOrigFetchMsg(""); }}
                    onBlur={e  => fetchOriginalBill(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && fetchOriginalBill(origBillRef)}
                    placeholder="Supplier's original bill no. (exact match)"
                    style={{ ...fld, flex: 1, border: `1.5px solid ${ERROR}` }}
                  />
                  <button
                    type="button"
                    onClick={() => fetchOriginalBill(origBillRef)}
                    disabled={origFetching || !origBillRef.trim()}
                    className="sans"
                    style={{
                      padding: "7px 16px", background: origFetching ? "#AAA" : NAVY,
                      color: "#FFF", border: "none", fontWeight: 700, fontSize: 12,
                      cursor: (origFetching || !origBillRef.trim()) ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {origFetching ? "Fetching…" : "↓ Fetch Items"}
                  </button>
                </div>
                {origFetchMsg && (
                  <div className="sans" style={{
                    marginTop: 6, fontSize: 11, padding: "7px 12px",
                    background: origFetchMsg.startsWith("✅") ? "#D4EDDA" : origFetchMsg.startsWith("❌") ? "#FBEAE8" : "#FFF3CD",
                    color:      origFetchMsg.startsWith("✅") ? "#2E7D4F" : origFetchMsg.startsWith("❌") ? ERROR : "#856404",
                    border: `1px solid ${origFetchMsg.startsWith("✅") ? "#C3E6CB" : origFetchMsg.startsWith("❌") ? ERROR : "#FFE08A"}`,
                  }}>{origFetchMsg}</div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            SECTION B — ITEM ROWS
        ══════════════════════════════════════════════════════ */}
        <div style={{ background: "#FFFFFF", border: `1px solid ${NAVY}`, marginBottom: 10 }}>
          {sectionHead("B", `ITEM DETAILS ${signLabel}`, `VAT ${Number(vatRate.toFixed(2))}%`)}

          {/* Column headers */}
          <div className="sans" style={{
            display: "grid",
            gridTemplateColumns: "28px 1.8fr 80px 100px 105px 75px 75px 100px 62px 62px 30px",
            gap: 4, padding: "6px 10px", background: "#EAE6DC",
          }}>
            {["#","PRODUCT / ITEM","QTY","RATE","TAXABLE VAL","VAT","NON-TAX","TOTAL","CAPITAL?","SERVICE?",""].map((h, i) => (
              <div key={i} style={{ fontSize: 9, letterSpacing: "0.08em", fontWeight: 700, color: TEXT_DIM,
                textAlign: i >= 4 && i <= 7 ? "right" : "center", }}>
                {h}
              </div>
            ))}
          </div>

          {/* Item rows */}
          <div style={{ padding: "0 10px 10px" }}>
            {items.map((it, idx) => {
              const c = calcItem(it);
              const hasContent = !!(it.product_name || it.capital_item_name);
              return (
                <div key={it._id}>
                  {/* Main item row */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "28px 1.8fr 80px 100px 105px 75px 75px 100px 62px 62px 30px",
                    gap: 4, padding: "5px 0",
                    borderBottom: `1px solid ${BORDER}`,
                    background: hasContent ? "#FDFCFA" : "#FFF",
                  }}>
                    {/* # */}
                    <div className="sans" style={{ fontSize: 11, color: TEXT_DIM, textAlign: "center", paddingTop: 8 }}>{idx + 1}</div>

                    {/* Product */}
                    <div>
                      <input list={`mat-list-${it._id}`}
                        value={it.product_name}
                        onChange={e => handleProductChange(it._id, e.target.value)}
                        placeholder={it.is_capital ? "Capital item — fill Section C below" : "Product name"}
                        style={{ ...fld, fontSize: 11 }}
                      />
                      <datalist id={`mat-list-${it._id}`}>
                        {materials.map(m => <option key={m.id} value={m.product_name} />)}
                      </datalist>
                    </div>

                    {/* Qty */}
                    <input type="number" min="0"
                      value={it.qty}
                      onChange={e => setItemField(it._id, "qty", e.target.value)}
                      placeholder={it.is_service ? "N/A" : ""}
                      disabled={it.is_service}
                      style={{ ...fld, fontSize: 12, textAlign: "right", background: it.is_service ? "#F2EEE2" : "#FFF" }}
                    />

                    {/* Rate */}
                    <input type="number" min="0" step="0.01"
                      value={it.rate}
                      onChange={e => setItemField(it._id, "rate", e.target.value)}
                      placeholder="0.00"
                      style={{ ...fld, fontSize: 12, textAlign: "right" }}
                    />

                    {/* Taxable Val */}
                    <div className="mono" style={{ fontSize: 12, textAlign: "right", paddingTop: 8, color: NAVY }}>
                      {(c.taxable || c.capTaxable) ? fmt(Math.abs(c.taxable || c.capTaxable)) : ""}
                    </div>

                    {/* VAT */}
                    <div className="mono" style={{ fontSize: 12, textAlign: "right", paddingTop: 8, color: "#2A6F77", fontWeight: 600 }}>
                      {(c.vat || c.capVat) ? fmt(Math.abs(c.vat || c.capVat)) : ""}
                    </div>

                    {/* Non-Tax */}
                    <div className="mono" style={{ fontSize: 12, textAlign: "right", paddingTop: 8, color: TEXT_DIM }}>
                      {c.nonTax ? fmt(Math.abs(c.nonTax)) : ""}
                    </div>

                    {/* Total */}
                    <div className="mono" style={{ fontSize: 12, textAlign: "right", paddingTop: 8, fontWeight: 700, color: NAVY }}>
                      {(c.lineTotal || c.capTotal || c.nonTax) ? fmt(Math.abs(c.lineTotal || c.capTotal || c.nonTax)) : ""}
                    </div>

                    {/* Capital? */}
                    <div style={{ textAlign: "center", paddingTop: 8 }}>
                      <input type="checkbox" checked={it.is_capital}
                        onChange={e => {
                          setItemField(it._id, "is_capital", e.target.checked);
                          if (e.target.checked) setExpandedItem(it._id);
                          else if (expandedItem === it._id) setExpandedItem(null);
                        }}
                      />
                    </div>

                    {/* Service? */}
                    <div style={{ textAlign: "center", paddingTop: 8 }}>
                      <input type="checkbox" checked={it.is_service}
                        onChange={e => setItemField(it._id, "is_service", e.target.checked)}
                      />
                    </div>

                    {/* Remove row */}
                    <div style={{ textAlign: "center", paddingTop: 6 }}>
                      <button onClick={() => removeRow(it._id)}
                        style={{ background: "none", border: "none", color: ERROR, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Taxable toggle */}
                  <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "3px 0 3px 32px",
                    background: hasContent ? "#F8F6F2" : "transparent", borderBottom: `1px solid #EAE6DC` }}>
                    <label className="sans" style={{ fontSize: 10, color: TEXT_DIM, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                      <input type="checkbox" checked={it.is_taxable}
                        onChange={e => setItemField(it._id, "is_taxable", e.target.checked)} />
                      <span style={{ fontWeight: 600, color: it.is_taxable ? GREEN : ERROR }}>
                        {it.is_taxable ? "✓ Taxable (VAT applies)" : "✗ Non-Taxable / Exempt"}
                      </span>
                    </label>
                    {it.is_capital && (
                      <button className="sans" onClick={() => setExpandedItem(expandedItem === it._id ? null : it._id)}
                        style={{ fontSize: 10, color: NAVY, background: "none", border: `1px solid ${BORDER}`, padding: "2px 8px", cursor: "pointer" }}>
                        {expandedItem === it._id ? "▲ Hide Capital Details" : "▼ Capital Details"}
                      </button>
                    )}
                  </div>

                  {/* Capital details panel */}
                  {it.is_capital && expandedItem === it._id && (
                    <div style={{ padding: "10px 16px 12px 32px", background: "#F0F4FA",
                      borderBottom: `2px solid ${NAVY}`, display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 10 }}>
                      <div style={{ gridColumn: "span 2" }}>
                        <label className="sans" style={lbl}>CAPITAL ITEM NAME *</label>
                        <input value={it.capital_item_name}
                          onChange={e => setItemField(it._id, "capital_item_name", e.target.value)}
                          placeholder="e.g. Dell Laptop i7" style={fld} />
                      </div>
                      <div>
                        <label className="sans" style={lbl}>FA BLOCK</label>
                        <select value={it.sub_group} onChange={e => handleBlockChange(it._id, e.target.value)} style={fld}>
                          {FA_BLOCKS.map(b => <option key={b}>{b}</option>)}
                        </select>
                      </div>
                      <div style={{ gridColumn: "span 2" }}>
                        <label className="sans" style={lbl}>GL ACCOUNT (auto)</label>
                        <input value={it.gl_account} onChange={e => setItemField(it._id, "gl_account", e.target.value)} style={fldAuto} />
                      </div>
                      <div>
                        <label className="sans" style={lbl}>DEP RATE %</label>
                        <input type="number" value={it.dep_rate_pct}
                          onChange={e => setItemField(it._id, "dep_rate_pct", e.target.value)}
                          placeholder="e.g. 25" style={fld} />
                      </div>
                      <div>
                        <label className="sans" style={lbl}>RESIDUAL VALUE %</label>
                        <input type="number" value={it.residual_value_pct}
                          onChange={e => setItemField(it._id, "residual_value_pct", e.target.value)}
                          style={fld} />
                      </div>
                      <div>
                        <label className="sans" style={lbl}>DEP METHOD (auto)</label>
                        <input value={it.dep_method} readOnly style={fldAuto} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add row button */}
            {items.length < 10 && (
              <button onClick={addRow} className="sans" style={{
                marginTop: 8, background: "none", border: `1px dashed ${BORDER}`,
                width: "100%", padding: "7px", color: TEXT_DIM, cursor: "pointer", fontSize: 12,
              }}>+ Add Row ({items.length}/10)</button>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            SECTION C — TOTALS BAR
        ══════════════════════════════════════════════════════ */}
        <div style={{ background: NAVY, padding: "12px 16px", marginBottom: 12,
          display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 16 }}>
          {[
            { label: "TAXABLE VALUE",  value: fmt(Math.abs(grandTotals.taxable)),   color: "#FFF" },
            { label: "VAT INPUT",      value: fmt(Math.abs(grandTotals.vat)),        color: "#90EE90" },
            { label: "LINE TOTAL",     value: fmt(Math.abs(grandTotals.lineTotal)),  color: "#FFF" },
            { label: "NON-TAXABLE",    value: fmt(Math.abs(grandTotals.nonTax)),     color: "#C8D4DE" },
            { label: "CAPITAL TOTAL",  value: fmt(Math.abs(grandTotals.capTotal)),  color: "#ADD8E6" },
            { label: "GRAND TOTAL",    value: fmt(Math.abs(grandTotals.grand)),     color: "#FFD700", bold: true },
          ].map((c, i) => (
            <div key={i}>
              <div className="sans" style={{ fontSize: 8, letterSpacing: "0.1em", color: "#7E97AE", marginBottom: 3 }}>{c.label}</div>
              <div className="mono" style={{ fontSize: 15, fontWeight: c.bold ? 800 : 600, color: c.color }}>
                {isReturn && c.value !== "0.00" ? <span style={{ fontSize: 11, marginRight: 3, color: "#FF9999" }}>−</span> : ""}
                Rs.{c.value}
              </div>
            </div>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════
            SAVE / CLEAR BUTTONS
        ══════════════════════════════════════════════════════ */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          {/* Review Journal button */}
          <button onClick={() => setShowJournal(true)}
            disabled={filledItems.length === 0}
            className="sans" style={{
              flex: 1, background: "#FFF", color: NAVY,
              border: `2px solid ${NAVY}`, padding: "14px", fontSize: 13, fontWeight: 700,
              cursor: filledItems.length === 0 ? "not-allowed" : "pointer",
              opacity: filledItems.length === 0 ? 0.5 : 1,
            }}>
            📋 Review Journal
          </button>
          <button onClick={doSave} disabled={saving || filledItems.length === 0} className="sans" style={{
            flex: 3, background: GREEN, color: "#FFFFFF", border: "none",
            padding: "14px", fontSize: 14, fontWeight: 700,
            cursor: saving || filledItems.length === 0 ? "not-allowed" : "pointer",
            opacity: saving || filledItems.length === 0 ? 0.7 : 1,
          }}>
            {saving ? "SAVING…" : `SAVE BILL  (${filledItems.length} item${filledItems.length !== 1 ? "s" : ""})`}
          </button>
          <button onClick={clearForm} disabled={saving} className="sans" style={{
            flex: 1, background: ERROR, color: "#FFFFFF", border: "none",
            padding: "14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>CLEAR</button>
        </div>

        {/* ══════════════════════════════════════════════════════
            SAVED BILLS THIS SESSION
        ══════════════════════════════════════════════════════ */}
        {savedBills.length > 0 && (
          <div>
            <div className="sans" style={{ fontSize: 10, letterSpacing: "0.12em", fontWeight: 700, color: TEXT_DIM, marginBottom: 8 }}>
              SAVED THIS SESSION
            </div>
            <div style={{ border: `1px solid ${BORDER}`, background: "#FFFFFF" }}>
              {savedBills.map((b, i) => (
                <div key={i} style={{
                  display: "flex", gap: 12, padding: "9px 14px",
                  borderBottom: i < savedBills.length - 1 ? `1px solid ${BORDER}` : "none",
                  alignItems: "center",
                  background: b.type === "Purchase Return" ? "#FFF0F0" : b.type === "Debit Note" ? "#FFFBEA" : "#FFFFFF",
                }}>
                  <span className="mono" style={{ fontSize: 11, color: NAVY, fontWeight: 700, minWidth: 130 }}>{b.refs}</span>
                  <span className="sans" style={{ fontSize: 10, color: TEXT_DIM, minWidth: 120 }}>{b.type}</span>
                  <span style={{ fontSize: 12, flex: 1 }}>{b.vendor}</span>
                  <span className="sans" style={{ fontSize: 11, color: TEXT_DIM }}>{b.items} item(s) · {b.billNo}</span>
                  {b.fa_codes && <span className="mono" style={{ fontSize: 10, color: GREEN }}>FA: {b.fa_codes}</span>}
                  <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Rs.{b.total}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
