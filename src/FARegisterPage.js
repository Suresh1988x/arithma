import { useState, useEffect, useCallback } from "react";

// FARegisterPage.js — ARITHMA Fixed Asset Register
// Two modes:
//   mode="register" → Full FA Register (view all assets, add/edit)
//   mode="ob"       → FA OB Setup (opening accumulated depreciation per asset)
//
// Block Guide (from Excel):
//   LAND = 1010  |  BLOCK A = 1020 Factory Building
//   BLOCK B = 1050 Office Equipment  |  BLOCK C = 1070 Vehicles
//   BLOCK D = 1030 Plant & Mach.     |  BLOCK E = 1300 Intangibles

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";

const NAVY    = "#1B3A5C";
const GOLD    = "#B8860B";
const BORDER  = "#D6D0C2";
const TEXT_DIM = "#6B645A";
const ERROR   = "#A8453B";
const GREEN   = "#2E7D4F";
const CREAM   = "#F7F4ED";

const FA_BLOCKS = ["LAND", "BLOCK A", "BLOCK B", "BLOCK C", "BLOCK D", "BLOCK E"];

const FA_BLOCK_GL = {
  "LAND":    "1010 - Factory Land",
  "BLOCK A": "1020 - Factory Building",
  "BLOCK B": "1050 - Office Equipment",
  "BLOCK C": "1070 - Vehicles",
  "BLOCK D": "1030 - Plant & Machinery",
  "BLOCK E": "1300 - Intangible Assets",
};

const FA_BLOCK_LABELS = {
  "LAND":    "Land",
  "BLOCK A": "Block A — Factory Building",
  "BLOCK B": "Block B — Office Equipment & Computers",
  "BLOCK C": "Block C — Vehicles",
  "BLOCK D": "Block D — Plant & Machinery",
  "BLOCK E": "Block E — Intangible Assets",
};

const DEP_METHODS = ["WDV", "SLM"];
const SOURCES     = ["Opening", "Purchase", "Transfer"];

const EMPTY_FORM = {
  fa_code: "", capital_item: "", vendor: "", sub_group: "BLOCK B",
  gl_account: FA_BLOCK_GL["BLOCK B"],
  addition_date: new Date().toISOString().slice(0, 10),
  qty: "1", additions_amount: "", disposals: "0",
  residual_value_pct: "5", dep_rate_pct: "", dep_method: "WDV",
  opening_accum_dep: "0", source: "Opening", reference: "",
};

function fmt(n, dec = 2) {
  return (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

const fieldStyle = {
  width: "100%", padding: "8px 10px", border: `1px solid ${NAVY}`,
  background: "#FFFFFF", fontSize: 13, boxSizing: "border-box",
};
const labelStyle = {
  fontSize: 10, letterSpacing: "0.12em", color: TEXT_DIM,
  fontWeight: 700, display: "block", marginBottom: 4,
};
const inputNumStyle = {
  width: "100%", padding: "6px 8px", border: `1px solid ${BORDER}`,
  background: "#FFFFFF", fontSize: 13, textAlign: "right", boxSizing: "border-box",
};

export default function FARegisterPage({ session, companyId, companies, homeSettings, mode = "register", onFAOBSetup, onGoToSalesBook }) {
  const [records, setRecords]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState("");
  const [error, setError]         = useState("");
  const [formError, setFormError] = useState("");
  const [search, setSearch]       = useState("");

  const companyName = homeSettings?.company_name
    || companies?.find(c => c.id === companyId)?.name || "";
  const isSuperAdmin = !!session?.user?.is_super_admin;
  const myRole = session?.companies?.find(c => c.id === companyId)?.role;
  const canEdit = isSuperAdmin || myRole === "company_admin";

  const fetchRecords = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${BACKEND}/api/fa-register?company_id=${companyId}`);
      const data = await res.json();
      setRecords(data.records || []);
    } catch { setError("Could not load FA Register."); }
    finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // Group by block
  const byBlock = FA_BLOCKS.reduce((acc, b) => {
    const items = records.filter(r => r.sub_group === b);
    if (items.length > 0) acc[b] = items;
    return acc;
  }, {});

  // Also catch any records not in standard blocks
  const otherRecords = records.filter(r => !FA_BLOCKS.includes(r.sub_group));
  if (otherRecords.length > 0) byBlock["OTHER"] = otherRecords;

  const totalCost = records.reduce((s, r) => s + r.additions, 0);
  const totalDep  = records.reduce((s, r) => s + r.opening_accum_dep, 0);
  const totalWDV  = records.reduce((s, r) => s + r.wdv, 0);

  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    return !q || r.fa_code.toLowerCase().includes(q) || r.capital_item.toLowerCase().includes(q) || r.sub_group.toLowerCase().includes(q);
  });

  const openAdd = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, addition_date: new Date().toISOString().slice(0, 10) });
    setFormError(""); setMsg("");
    setShowForm(true);
  };

  const openEdit = (r) => {
    setEditId(r.id);
    setForm({
      fa_code: r.fa_code, capital_item: r.capital_item,
      vendor: r.vendor, sub_group: r.sub_group,
      gl_account: r.gl_account,
      addition_date: r.addition_date || "",
      qty: String(r.qty), additions_amount: String(r.additions),
      disposals: String(r.disposals),
      residual_value_pct: String(r.residual_value_pct),
      dep_rate_pct: String(r.dep_rate_pct),
      dep_method: r.dep_method || "WDV",
      opening_accum_dep: String(r.opening_accum_dep),
      source: r.source || "Opening",
      reference: r.reference || "",
    });
    setFormError(""); setMsg("");
    setShowForm(true);
  };

  const handleBlockChange = (block) => {
    setForm(f => ({ ...f, sub_group: block, gl_account: FA_BLOCK_GL[block] || "" }));
  };

  const saveFA = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.fa_code.trim() || !form.capital_item.trim()) {
      setFormError("FA Code and Capital Item are required."); return;
    }
    if (!form.additions_amount || parseFloat(form.additions_amount) <= 0) {
      setFormError("Cost / Additions amount must be greater than 0."); return;
    }
    setSaving(true);
    const url = editId ? `${BACKEND}/api/fa-register/${editId}` : `${BACKEND}/api/fa-register`;
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          company_id: companyId,
          requesting_user_id: session.user.id,
          qty: parseFloat(form.qty) || 1,
          rate: parseFloat(form.qty) > 0 ? parseFloat(form.additions_amount) / parseFloat(form.qty) : parseFloat(form.additions_amount) || 0,
          disposals: parseFloat(form.disposals) || 0,
          residual_value_pct: parseFloat(form.residual_value_pct) || 5,
          dep_rate_pct: parseFloat(form.dep_rate_pct) || 0,
          opening_accum_dep: parseFloat(form.opening_accum_dep) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setFormError(data.error || "Save failed."); }
      else {
        setMsg(editId ? `'${form.capital_item}' updated.` : `'${form.capital_item}' added to FA Register.`);
        setShowForm(false); fetchRecords();
      }
    } catch { setFormError("Could not reach the server."); }
    finally { setSaving(false); }
  };

  // ── OB Mode: save opening accumulated dep ────────────────
  const [obSaving, setObSaving] = useState(false);
  const [obRecords, setObRecords] = useState([]);

  useEffect(() => {
    if (mode === "ob") setObRecords(records.map(r => ({ ...r })));
  }, [records, mode]);

  const saveOB = async () => {
    setObSaving(true); setMsg(""); setError("");
    try {
      const results = await Promise.all(obRecords.map(r =>
        fetch(`${BACKEND}/api/fa-register/${r.id}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            opening_accum_dep: r.opening_accum_dep,
            requesting_user_id: session.user.id,
          }),
        }).then(r => r.json())
      ));
      const failed = results.filter(r => r.error);
      if (failed.length > 0) setError(`${failed.length} records failed to save.`);
      else { setMsg(`FA Opening Balances saved. GL accounts updated.`); fetchRecords(); }
    } catch { setError("Save failed."); }
    finally { setObSaving(false); }
  };

  const exportCSV = () => {
    const headers = ["FA Code","Capital Item","Vendor","Block","GL Account","Date","Qty","Rate","Cost","Disposals","Dep Method","Dep Rate %","Residual %","Opening Accum Dep","WDV"];
    const rows = records.map(r => [
      r.fa_code, r.capital_item, r.vendor, r.sub_group, r.gl_account,
      r.addition_date || "", r.qty, r.rate, r.additions, r.disposals,
      r.dep_method, r.dep_rate_pct, r.residual_value_pct, r.opening_accum_dep, r.wdv
    ]);
    const escape = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map(r => r.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${companyName}_FA_Register.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const styles = `
      body{font-family:Arial,sans-serif;font-size:8px;margin:10px}
      h2{font-size:12px;margin-bottom:2px} p{font-size:8px;color:#666;margin:0 0 8px}
      table{border-collapse:collapse;width:100%}
      th{background:#1B3A5C;color:#fff;padding:4px 6px;font-size:7px;text-align:left}
      td{padding:3px 6px;border-bottom:1px solid #ddd;font-size:8px}
      tr:nth-child(even) td{background:#f7f4ed}
      .num{text-align:right} .dim{color:#999} .grp td{background:#EAE6DC!important;font-weight:700;font-size:8px;color:#1B3A5C}
      .tot td{border-top:2px solid #1B3A5C;font-weight:700}
    `;
    const thead = `<tr>
      <th>FA CODE</th><th>CAPITAL ITEM</th><th>BLOCK</th><th>DATE</th>
      <th class="num">COST</th><th class="num">DEP%</th><th>METHOD</th>
      <th class="num">ACCUM DEP</th><th class="num">WDV</th>
    </tr>`;

    // Group by block
    const blocks = [...new Set(records.map(r => r.sub_group))];
    let tbody = "";
    let grandCost = 0, grandDep = 0, grandWdv = 0;
    blocks.forEach(block => {
      const items = records.filter(r => r.sub_group === block);
      const blockLabel = FA_BLOCK_LABELS[block] || block;
      const blockGL = FA_BLOCK_GL[block] || "";
      tbody += `<tr class="grp"><td colspan="9">${blockLabel} &nbsp;·&nbsp; ${blockGL}</td></tr>`;
      let bCost = 0, bDep = 0, bWdv = 0;
      items.forEach(r => {
        tbody += `<tr>
          <td class="dim">${r.fa_code}</td><td><b>${r.capital_item}</b></td>
          <td>${r.sub_group}</td><td>${r.addition_date || "—"}</td>
          <td class="num">${fmt(r.additions)}</td>
          <td class="num">${r.dep_rate_pct}%</td><td>${r.dep_method}</td>
          <td class="num" style="color:#A8453B">${r.opening_accum_dep > 0 ? fmt(r.opening_accum_dep) : "—"}</td>
          <td class="num" style="color:#2E7D4F;font-weight:700">${fmt(r.wdv)}</td>
        </tr>`;
        bCost += r.additions; bDep += r.opening_accum_dep; bWdv += r.wdv;
      });
      tbody += `<tr class="tot">
        <td colspan="4" style="text-align:right">${block} TOTAL</td>
        <td class="num">${fmt(bCost)}</td><td></td><td></td>
        <td class="num">${fmt(bDep)}</td><td class="num">${fmt(bWdv)}</td>
      </tr>`;
      grandCost += bCost; grandDep += bDep; grandWdv += bWdv;
    });
    tbody += `<tr class="tot" style="background:#1B3A5C">
      <td colspan="4" style="text-align:right;color:#fff">GRAND TOTAL</td>
      <td class="num" style="color:#fff">${fmt(grandCost)}</td><td></td><td></td>
      <td class="num" style="color:#F0D78C">${fmt(grandDep)}</td>
      <td class="num" style="color:#90EE90;font-weight:700">${fmt(grandWdv)}</td>
    </tr>`;

    const html = `<!DOCTYPE html><html><head><style>${styles}</style></head><body>
      <h2>ARITHMA — Fixed Assets Register</h2>
      <p>${companyName} &nbsp;|&nbsp; FY ${session.fiscalYear} &nbsp;|&nbsp; ${records.length} assets &nbsp;|&nbsp;
         Total Cost: Rs.${fmt(grandCost)} &nbsp;|&nbsp; WDV: Rs.${fmt(grandWdv)}</p>
      <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
    </body></html>`;
    const win = window.open("", "_blank");
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  // ── FA OB TAB RENDER ─────────────────────────────────────
  if (mode === "ob") {
    const obTotalCost = obRecords.reduce((s, r) => s + r.additions, 0);
    const obTotalDep  = obRecords.reduce((s, r) => s + Number(r.opening_accum_dep || 0), 0);
    const obTotalWDV  = obTotalCost - obTotalDep;

    return (
      <div style={{ fontFamily: "'Source Serif Pro', Georgia, serif" }}>
        <style>{`.sans{font-family:'Inter',sans-serif;} .mono{font-family:'IBM Plex Mono',monospace;} input:focus{outline:2px solid ${GOLD};outline-offset:1px;} table.fa{border-collapse:collapse;width:100%} table.fa th,table.fa td{border-bottom:1px solid ${BORDER}}`}</style>

        {loading ? (
          <div className="sans" style={{ padding: 40, textAlign: "center", color: TEXT_DIM }}>Loading…</div>
        ) : records.length === 0 ? (
          <div style={{ border: `1px solid ${BORDER}`, background: "#FFFFFF", padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: NAVY, marginBottom: 8 }}>No FA Records Found</div>
            <div className="sans" style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 16 }}>
              Add assets to the FA Register first, then enter their opening accumulated depreciation here.
            </div>
          </div>
        ) : (
          <>
            {/* Summary strip */}
            <div style={{ display: "flex", gap: 0, marginBottom: 16, border: `1px solid ${NAVY}` }}>
              {[
                { label: "Total Cost (Additions)", value: fmt(obTotalCost), color: NAVY },
                { label: "Opening Accum. Dep", value: fmt(obTotalDep), color: ERROR },
                { label: "WDV (Net Book Value)", value: fmt(obTotalWDV), color: GREEN },
              ].map((s, i) => (
                <div key={i} style={{ flex: 1, padding: "12px 16px", background: "#FFFFFF", borderRight: i < 2 ? `1px solid ${NAVY}` : "none" }}>
                  <div className="sans" style={{ fontSize: 10, letterSpacing: "0.12em", color: TEXT_DIM, marginBottom: 4 }}>{s.label}</div>
                  <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {error && <div className="sans" style={{ color: ERROR, fontSize: 13, marginBottom: 10 }}>{error}</div>}
            {msg && <div className="sans" style={{ color: GREEN, fontSize: 13, marginBottom: 10, fontWeight: 600 }}>{msg}</div>}

            <div style={{ border: `1px solid ${NAVY}`, background: "#FFFFFF" }}>
              <table className="fa">
                <thead>
                  <tr className="sans" style={{ background: NAVY }}>
                    <th style={{ padding: "9px 12px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, textAlign: "left" }}>FA CODE</th>
                    <th style={{ padding: "9px 12px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, textAlign: "left" }}>CAPITAL ITEM</th>
                    <th style={{ padding: "9px 12px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, textAlign: "left", width: 100 }}>BLOCK</th>
                    <th style={{ padding: "9px 12px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, textAlign: "right", width: 140 }}>COST (Rs.)</th>
                    <th style={{ padding: "9px 12px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, textAlign: "right", width: 170 }}>OPENING ACCUM. DEP (Rs.)</th>
                    <th style={{ padding: "9px 12px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, textAlign: "right", width: 140 }}>WDV (Rs.)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(
                    obRecords.reduce((acc, r) => {
                      const b = r.sub_group || "OTHER";
                      if (!acc[b]) acc[b] = [];
                      acc[b].push(r);
                      return acc;
                    }, {})
                  ).map(([block, items]) => (
                    <>
                      <tr key={`b-${block}`}>
                        <td colSpan={6} className="sans" style={{ padding: "8px 12px", background: "#EAE6DC", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: NAVY }}>
                          {FA_BLOCK_LABELS[block] || block} &nbsp;·&nbsp; {FA_BLOCK_GL[block] || ""}
                        </td>
                      </tr>
                      {items.map(r => {
                        const wdv = r.additions - Number(r.opening_accum_dep || 0);
                        return (
                          <tr key={r.id}>
                            <td className="mono" style={{ padding: "7px 12px", fontSize: 12, color: TEXT_DIM }}>{r.fa_code}</td>
                            <td style={{ padding: "7px 12px", fontSize: 13, fontWeight: 600 }}>{r.capital_item}</td>
                            <td className="sans" style={{ padding: "7px 12px", fontSize: 11, color: TEXT_DIM }}>{r.sub_group}</td>
                            <td className="mono" style={{ padding: "7px 12px", fontSize: 13, textAlign: "right" }}>{fmt(r.additions)}</td>
                            <td style={{ padding: "4px 8px" }}>
                              <input type="number" min="0" step="0.01"
                                value={r.opening_accum_dep || ""}
                                onChange={e => setObRecords(prev => prev.map(x => x.id === r.id ? { ...x, opening_accum_dep: parseFloat(e.target.value) || 0 } : x))}
                                style={{ ...inputNumStyle }} placeholder="0.00" />
                            </td>
                            <td className="mono" style={{ padding: "7px 12px", fontSize: 13, textAlign: "right", color: wdv < 0 ? ERROR : NAVY, fontWeight: 600 }}>
                              {fmt(wdv)}
                            </td>
                          </tr>
                        );
                      })}
                      <tr key={`bs-${block}`} style={{ borderTop: `1px solid ${BORDER}` }}>
                        <td colSpan={3} className="sans" style={{ padding: "6px 12px", fontSize: 10, fontWeight: 700, textAlign: "right", color: TEXT_DIM }}>
                          {block} TOTAL
                        </td>
                        <td className="mono" style={{ padding: "6px 12px", fontSize: 12, fontWeight: 700, textAlign: "right" }}>
                          {fmt(items.reduce((s, r) => s + r.additions, 0))}
                        </td>
                        <td className="mono" style={{ padding: "6px 12px", fontSize: 12, fontWeight: 700, textAlign: "right" }}>
                          {fmt(items.reduce((s, r) => s + Number(r.opening_accum_dep || 0), 0))}
                        </td>
                        <td className="mono" style={{ padding: "6px 12px", fontSize: 12, fontWeight: 700, textAlign: "right" }}>
                          {fmt(items.reduce((s, r) => s + r.additions - Number(r.opening_accum_dep || 0), 0))}
                        </td>
                      </tr>
                    </>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${NAVY}` }}>
                    <td colSpan={3} className="sans" style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, textAlign: "right" }}>GRAND TOTAL</td>
                    <td className="mono" style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, textAlign: "right" }}>{fmt(obTotalCost)}</td>
                    <td className="mono" style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, textAlign: "right", color: ERROR }}>{fmt(obTotalDep)}</td>
                    <td className="mono" style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, textAlign: "right", color: GREEN }}>{fmt(obTotalWDV)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {canEdit && (
              <button onClick={saveOB} disabled={obSaving} className="sans" style={{
                marginTop: 16, background: NAVY, color: "#F0D78C", border: "none",
                padding: "11px 28px", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer",
              }}>{obSaving ? "SAVING…" : "SAVE FA OPENING BALANCES"}</button>
            )}
          </>
        )}
      </div>
    );
  }

  // ── REGISTER MODE RENDER ─────────────────────────────────
  return (
    <div style={{ fontFamily: "'Source Serif Pro', Georgia, serif", background: CREAM, minHeight: "calc(100vh - 90px)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+Pro:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap');
        .sans{font-family:'Inter',sans-serif;} .mono{font-family:'IBM Plex Mono',monospace;}
        input:focus,select:focus{outline:2px solid ${GOLD};outline-offset:1px;}
        table.fa{border-collapse:collapse;width:100%}
        table.fa th,table.fa td{border-bottom:1px solid ${BORDER}}
        table.fa tbody tr:hover td{background:#FBF8F0}
      `}</style>

      {/* Ribbon */}
      <div style={{ background: "linear-gradient(135deg,#10243B 0%,#1E3F61 55%,#2E6E9E 100%)", padding: "12px 32px", borderBottom: "3px solid #B8860B" }}>
        <div className="sans" style={{ fontSize: 13, fontWeight: 700, color: "#F0D78C", letterSpacing: "0.08em" }}>
          {companyName.toUpperCase()}
          {session.fiscalYear && <><span style={{ color: "#7E97AE", margin: "0 10px" }}>&middot;</span><span style={{ color: "#C8D4DE" }}>FY {session.fiscalYear}</span></>}
        </div>
      </div>

      <div style={{ padding: "24px 32px", maxWidth: 1280, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, color: NAVY }}>Fixed Assets Register</div>
            <div className="sans" style={{ fontSize: 12, color: TEXT_DIM, marginTop: 2 }}>
              {companyName} · {records.length} asset{records.length !== 1 ? "s" : ""} registered
            </div>
          </div>
            <div style={{ display: "flex", gap: 10 }}>
            {msg && <span className="sans" style={{ fontSize: 12, color: GREEN, fontWeight: 600 }}>{msg}</span>}
            {onFAOBSetup && (
              <button onClick={onFAOBSetup} className="sans" style={{
                background: "transparent", color: NAVY, border: `1px solid ${BORDER}`,
                padding: "8px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}>⚖ FA OB Setup</button>
            )}
	   {onGoToSalesBook && (
              <button onClick={onGoToSalesBook} className="sans" style={{
                background: "transparent", color: NAVY, border: `1px solid ${BORDER}`,
                padding: "8px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}>↗ Sales Book</button>
            )}
            <button onClick={exportCSV} className="sans" style={{ background: "transparent", color: NAVY, border: `1px solid ${BORDER}`, padding: "8px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>⬇ CSV</button>
            <button onClick={exportPDF} className="sans" style={{ background: "transparent", color: NAVY, border: `1px solid ${BORDER}`, padding: "8px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>⬇ PDF</button>
            <button onClick={exportPDF} className="sans" style={{ background: "transparent", color: NAVY, border: `1px solid ${BORDER}`, padding: "8px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>🖨 Print</button>
            {canEdit && (
              <button onClick={openAdd} className="sans" style={{ background: NAVY, color: "#F0D78C", border: "none", padding: "10px 20px", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer" }}>
                + ADD ASSET
              </button>
            )}
          </div>
        </div>

        {/* Summary strip */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 0, marginBottom: 20, border: `1px solid ${NAVY}` }}>
          {[
            { label: "TOTAL COST", value: fmt(totalCost), color: NAVY },
            { label: "OPENING ACCUM. DEP", value: fmt(totalDep), color: ERROR },
            { label: "NET BOOK VALUE (WDV)", value: fmt(totalWDV), color: GREEN },
          ].map((s, i) => (
            <div key={i} style={{ padding: "14px 18px", background: "#FFFFFF", borderRight: `1px solid ${NAVY}` }}>
              <div className="sans" style={{ fontSize: 10, letterSpacing: "0.15em", color: s.color, fontWeight: 700, marginBottom: 6 }}>{s.label}</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
          <div style={{ padding: "14px 18px", background: "#FFFFFF" }}>
            <div className="sans" style={{ fontSize: 10, letterSpacing: "0.15em", color: TEXT_DIM, fontWeight: 700, marginBottom: 6 }}>ASSETS</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>{records.length}</div>
          </div>
        </div>

        {/* Search */}
        <div style={{ marginBottom: 14 }}>
          <input placeholder="Search by FA code, item name or block…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", padding: "9px 14px", border: `1px solid ${NAVY}`, background: "#FFFFFF", fontSize: 13, boxSizing: "border-box" }} />
        </div>

        {error && <div className="sans" style={{ color: ERROR, fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {/* Table */}
        {loading ? (
          <div className="sans" style={{ padding: 40, textAlign: "center", color: TEXT_DIM }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="sans" style={{ padding: 40, textAlign: "center", color: TEXT_DIM, border: `1px solid ${BORDER}`, background: "#FFFFFF" }}>
            No assets found.{canEdit ? " Click + ADD ASSET to register the first one." : ""}
          </div>
        ) : (
          <div style={{ border: `1px solid ${NAVY}`, background: "#FFFFFF" }}>
            <table className="fa">
              <thead>
                <tr className="sans" style={{ background: NAVY }}>
                  <th style={{ padding: "9px 10px", fontSize: 10, letterSpacing: "0.1em", color: CREAM, textAlign: "left" }}>FA CODE</th>
                  <th style={{ padding: "9px 10px", fontSize: 10, letterSpacing: "0.1em", color: CREAM, textAlign: "left" }}>CAPITAL ITEM</th>
                  <th style={{ padding: "9px 10px", fontSize: 10, letterSpacing: "0.1em", color: CREAM, textAlign: "left" }}>BLOCK</th>
                  <th style={{ padding: "9px 10px", fontSize: 10, letterSpacing: "0.1em", color: CREAM, textAlign: "left" }}>GL ACCOUNT</th>
                  <th style={{ padding: "9px 10px", fontSize: 10, letterSpacing: "0.1em", color: CREAM, textAlign: "center" }}>DATE</th>
                  <th style={{ padding: "9px 10px", fontSize: 10, letterSpacing: "0.1em", color: CREAM, textAlign: "right" }}>QTY</th>
                  <th style={{ padding: "9px 10px", fontSize: 10, letterSpacing: "0.1em", color: CREAM, textAlign: "right" }}>RATE</th>
                  <th style={{ padding: "9px 10px", fontSize: 10, letterSpacing: "0.1em", color: CREAM, textAlign: "right" }}>COST</th>
                  <th style={{ padding: "9px 10px", fontSize: 10, letterSpacing: "0.1em", color: CREAM, textAlign: "center" }}>DEP%</th>
                  <th style={{ padding: "9px 10px", fontSize: 10, letterSpacing: "0.1em", color: CREAM, textAlign: "right" }}>ACCUM DEP</th>
                  <th style={{ padding: "9px 10px", fontSize: 10, letterSpacing: "0.1em", color: CREAM, textAlign: "right" }}>WDV</th>
                  {canEdit && <th style={{ padding: "9px 10px", fontSize: 10, letterSpacing: "0.1em", color: CREAM, textAlign: "center" }}>ACTION</th>}
                </tr>
              </thead>
              <tbody>
                {Object.entries(byBlock).map(([block, items]) => (
                  <>
                    <tr key={`hdr-${block}`}>
                      <td colSpan={canEdit ? 12 : 11} className="sans" style={{ padding: "7px 10px", background: "#EAE6DC", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: NAVY }}>
                        {FA_BLOCK_LABELS[block] || block} &nbsp;·&nbsp; {FA_BLOCK_GL[block] || ""}
                      </td>
                    </tr>
                    {items.filter(r => {
                      const q = search.toLowerCase();
                      return !q || r.fa_code.toLowerCase().includes(q) || r.capital_item.toLowerCase().includes(q) || r.sub_group.toLowerCase().includes(q);
                    }).map(r => (
                      <tr key={r.id}>
                        <td className="mono" style={{ padding: "7px 10px", fontSize: 11, color: TEXT_DIM }}>{r.fa_code}</td>
                        <td style={{ padding: "7px 10px", fontSize: 13, fontWeight: 600 }}>{r.capital_item}</td>
                        <td className="sans" style={{ padding: "7px 10px", fontSize: 11 }}>{r.sub_group}</td>
                        <td className="sans" style={{ padding: "7px 10px", fontSize: 11, color: TEXT_DIM }}>{r.gl_account}</td>
                        <td className="sans" style={{ padding: "7px 10px", fontSize: 11, textAlign: "center" }}>{r.addition_date || "—"}</td>
                        <td className="mono" style={{ padding: "7px 10px", fontSize: 12, textAlign: "right" }}>{fmt(r.qty, 0)}</td>
                        <td className="mono" style={{ padding: "7px 10px", fontSize: 12, textAlign: "right" }}>{fmt(r.rate)}</td>
                        <td className="mono" style={{ padding: "7px 10px", fontSize: 12, textAlign: "right", fontWeight: 600 }}>{fmt(r.additions)}</td>
                        <td className="sans" style={{ padding: "7px 10px", fontSize: 11, textAlign: "center" }}>
                          {r.dep_rate_pct}% {r.dep_method}
                        </td>
                        <td className="mono" style={{ padding: "7px 10px", fontSize: 12, textAlign: "right", color: ERROR }}>
                          {r.opening_accum_dep > 0 ? fmt(r.opening_accum_dep) : <span style={{ color: "#D8D2C3" }}>—</span>}
                        </td>
                        <td className="mono" style={{ padding: "7px 10px", fontSize: 12, textAlign: "right", fontWeight: 700, color: GREEN }}>
                          {fmt(r.wdv)}
                        </td>
                        {canEdit && (
                          <td style={{ padding: "6px 10px", textAlign: "center" }}>
                            <button onClick={() => openEdit(r)} className="sans" style={{
                              border: `1px solid ${NAVY}`, background: "transparent", color: NAVY,
                              padding: "3px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600,
                            }}>Edit</button>
                          </td>
                        )}
                      </tr>
                    ))}
                    <tr key={`sub-${block}`} style={{ borderTop: `1px solid ${BORDER}` }}>
                      <td colSpan={7} className="sans" style={{ padding: "6px 10px", fontSize: 10, fontWeight: 700, textAlign: "right", color: TEXT_DIM }}>{block} TOTAL</td>
                      <td className="mono" style={{ padding: "6px 10px", fontSize: 12, fontWeight: 700, textAlign: "right" }}>{fmt(items.reduce((s, r) => s + r.additions, 0))}</td>
                      <td />
                      <td className="mono" style={{ padding: "6px 10px", fontSize: 12, fontWeight: 700, textAlign: "right", color: ERROR }}>{fmt(items.reduce((s, r) => s + r.opening_accum_dep, 0))}</td>
                      <td className="mono" style={{ padding: "6px 10px", fontSize: 12, fontWeight: 700, textAlign: "right", color: GREEN }}>{fmt(items.reduce((s, r) => s + r.wdv, 0))}</td>
                      {canEdit && <td />}
                    </tr>
                  </>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${NAVY}` }}>
                  <td colSpan={7} className="sans" style={{ padding: "10px 10px", fontSize: 11, fontWeight: 700, textAlign: "right" }}>GRAND TOTAL</td>
                  <td className="mono" style={{ padding: "10px 10px", fontSize: 13, fontWeight: 700, textAlign: "right" }}>{fmt(totalCost)}</td>
                  <td />
                  <td className="mono" style={{ padding: "10px 10px", fontSize: 13, fontWeight: 700, textAlign: "right", color: ERROR }}>{fmt(totalDep)}</td>
                  <td className="mono" style={{ padding: "10px 10px", fontSize: 13, fontWeight: 700, textAlign: "right", color: GREEN }}>{fmt(totalWDV)}</td>
                  {canEdit && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(27,58,92,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={() => setShowForm(false)}>
          <form onSubmit={saveFA} onClick={e => e.stopPropagation()} style={{
            background: CREAM, border: `1px solid ${NAVY}`, width: 620, padding: 28, maxHeight: "90vh", overflowY: "auto",
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 4 }}>
              {editId ? "Edit Asset" : "Add New Asset"}
            </div>
            <div className="sans" style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 20 }}>FA Register · {companyName}</div>

            {/* FA Code + Capital Item */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label className="sans" style={labelStyle}>FA CODE *</label>
                <input value={form.fa_code} onChange={e => setForm(f => ({ ...f, fa_code: e.target.value }))}
                  style={fieldStyle} placeholder="e.g. FA-B-2025" disabled={!!editId} />
              </div>
              <div>
                <label className="sans" style={labelStyle}>CAPITAL ITEM *</label>
                <input value={form.capital_item} onChange={e => setForm(f => ({ ...f, capital_item: e.target.value }))}
                  style={fieldStyle} placeholder="Asset description" />
              </div>
            </div>

            {/* Block + GL */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label className="sans" style={labelStyle}>FA BLOCK</label>
                <select value={form.sub_group} onChange={e => handleBlockChange(e.target.value)} style={fieldStyle}>
                  {FA_BLOCKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="sans" style={labelStyle}>GL ACCOUNT (auto)</label>
                <div style={{ ...fieldStyle, background: "#F2EEE2", color: TEXT_DIM, padding: "9px 10px" }}>
                  {form.gl_account || "—"}
                </div>
              </div>
            </div>

            {/* Vendor + Date */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label className="sans" style={labelStyle}>VENDOR / SUPPLIER</label>
                <input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}
                  style={fieldStyle} placeholder="Optional" />
              </div>
              <div>
                <label className="sans" style={labelStyle}>ADDITION DATE</label>
                <input type="date" value={form.addition_date} onChange={e => setForm(f => ({ ...f, addition_date: e.target.value }))} style={fieldStyle} />
              </div>
            </div>

            {/* Qty + Rate + Cost (auto) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label className="sans" style={labelStyle}>QTY</label>
                <input type="number" min="0.001" step="0.001" value={form.qty}
                  onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} style={fieldStyle} />
              </div>
              <div>
                <label className="sans" style={labelStyle}>TOTAL COST / ADDITIONS (Rs.) *</label>
                <input type="number" min="0" step="0.01" value={form.additions_amount}
                  onChange={e => setForm(f => ({ ...f, additions_amount: e.target.value }))} style={fieldStyle} placeholder="0.00" />
              </div>
              <div>
                <label className="sans" style={labelStyle}>RATE (auto: Amount ÷ Qty)</label>
                <div style={{ ...fieldStyle, background: "#F2EEE2", color: TEXT_DIM, textAlign: "right" }}>
                  {parseFloat(form.qty) > 0 && parseFloat(form.additions_amount) > 0 ? fmt(parseFloat(form.additions_amount) / parseFloat(form.qty)) : "—"}
                </div>
              </div>
            </div>

            {/* Dep Rate + Method + Residual */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label className="sans" style={labelStyle}>DEP RATE %</label>
                <input type="number" min="0" max="100" step="0.01" value={form.dep_rate_pct}
                  onChange={e => setForm(f => ({ ...f, dep_rate_pct: e.target.value }))} style={fieldStyle} placeholder="e.g. 15" />
              </div>
              <div>
                <label className="sans" style={labelStyle}>DEP METHOD</label>
                <select value={form.dep_method} onChange={e => setForm(f => ({ ...f, dep_method: e.target.value }))} style={fieldStyle}>
                  {DEP_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="sans" style={labelStyle}>RESIDUAL VALUE %</label>
                <input type="number" min="0" max="100" step="0.01" value={form.residual_value_pct}
                  onChange={e => setForm(f => ({ ...f, residual_value_pct: e.target.value }))} style={fieldStyle} />
              </div>
            </div>

            {/* Opening Accum Dep + Source */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label className="sans" style={labelStyle}>OPENING ACCUM. DEP (Rs.)</label>
                <input type="number" min="0" step="0.01" value={form.opening_accum_dep}
                  onChange={e => setForm(f => ({ ...f, opening_accum_dep: e.target.value }))} style={fieldStyle} placeholder="0.00" />
              </div>
              <div>
                <label className="sans" style={labelStyle}>SOURCE</label>
                <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} style={fieldStyle}>
                  {SOURCES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="sans" style={labelStyle}>REFERENCE / BILL NO.</label>
                <input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                  style={fieldStyle} placeholder="Optional" />
              </div>
            </div>

            {/* WDV preview */}
            <div style={{ background: "#EFF5EF", border: `1px solid #B8D4BA`, padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
              <span className="sans" style={{ fontSize: 12, color: TEXT_DIM }}>Net Book Value (WDV) Preview</span>
              <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: GREEN }}>
                Rs. {fmt((parseFloat(form.additions_amount) || 0) - (parseFloat(form.opening_accum_dep) || 0))}
              </span>
            </div>

            {formError && <div className="sans" style={{ color: ERROR, fontSize: 12, marginBottom: 10 }}>{formError}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" disabled={saving} className="sans" style={{
                flex: 1, background: NAVY, color: "#F0D78C", border: "none",
                padding: "12px", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer",
              }}>{saving ? "SAVING…" : editId ? "UPDATE ASSET" : "ADD TO REGISTER"}</button>
              <button type="button" onClick={() => setShowForm(false)} className="sans" style={{
                flex: 1, background: "transparent", color: NAVY, border: `1px solid ${NAVY}`,
                padding: "12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>CANCEL</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
