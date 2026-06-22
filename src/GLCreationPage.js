import { useState, useEffect, useCallback } from "react";

// GLCreationPage.js — ARITHMA GL Account Manager (New / Edit / Delete)
// Super Admin only. Mirrors the Excel GL_Entry form:
//   - NEW: fill form → Save/Add GL
//   - EDIT: select existing GL from dropdown → fields auto-fill → correct → Save
//   - DELETE: select existing GL → confirm → Delete GL
// Non-super-admin users see a read-only notice.

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";

const NAVY    = "#1B3A5C";
const GOLD    = "#B8860B";
const BORDER  = "#D6D0C2";
const TEXT_DIM = "#6B645A";
const ERROR   = "#A8453B";
const GREEN   = "#2E7D4F";
const CREAM   = "#F7F4ED";

const ACCOUNT_TYPES = ["BS", "PL"];

// Full GL hierarchy from Excel GL_Master
const HEADER_TO_MAIN = {
  "Non-Current Assets": ["Tangible Fixed Assets","Intangible Assets","Investments","Long-Term Deposits"],
  "Current Assets":     ["Current Assets","Bank & Cash"],
  "Equity":             ["Equity"],
  "Non-Current Liab.":  ["Non-Current Liabilities"],
  "Current Liab.":      ["Current Liabilities"],
  "Income":             ["Sales & Income","Other Income"],
  "COGS":               ["Cost of Goods Sold"],
  "Expenses":           ["Operating Expenses"],
  "Finance":            ["Finance & Tax"],
};

const MAIN_TO_SUB = {
  "Tangible Fixed Assets":  ["Land","Block A - Buildings","Block B - Furniture","Block B - Equipment","Block B - Computers","Block C - Vehicles","Block D - Plant & Mach.","Block D - Electrical","Block D - Tools","Capital WIP","Accumulated Depn."],
  "Intangible Assets":      ["Intangible Assets"],
  "Investments":            ["Long-Term Investments"],
  "Long-Term Deposits":     ["Security Deposits"],
  "Current Assets":         ["Inventories","Trade Debtors","Advances","Staff Advances","Tax Advances","Tax Receivables","VAT Receivable","Prepayments","Accruals"],
  "Bank & Cash":            ["Bank Accounts","Cash In Hand"],
  "Equity":                 ["Share Capital","Proprietor Capital","Retained Earnings","Current Year P&L","Reserves"],
  "Non-Current Liabilities":["Long-Term Borrowings","Finance Lease","Deferred Tax"],
  "Current Liabilities":    ["Trade Creditors","Advances Received","Bank Overdraft & STL","VAT Payable","Tax Payables","Accrued Liabilities","Statutory Payables","Current Liabilities"],
  "Sales & Income":         ["Revenue","Revenue Deductions","Other Income"],
  "Other Income":           ["Finance Income","Other Income"],
  "Cost of Goods Sold":     ["Cost of Production","Stock Movements","Purchases"],
  "Operating Expenses":     ["Personnel Costs","Premises Costs","Utilities","Communication","Office Expenses","Transport & Travel","Marketing Expenses","Professional Fees","Finance Charges","Depreciation","Miscellaneous Expenses","Operating Expenses"],
  "Finance & Tax":          ["Finance Costs","Taxation"],
};

function SubGroupSelect({ value, onChange, mainGroup }) {
  const [adding, setAdding] = useState(false);
  const [newSub, setNewSub] = useState("");
  const [customSubs, setCustomSubs] = useState([]);
  const predefined = MAIN_TO_SUB[mainGroup] || [];
  const allSubs = [...predefined, ...customSubs.filter(s => !predefined.includes(s))];

  const handleChange = (e) => {
    if (e.target.value === "__add_new__") { setAdding(true); }
    else { onChange(e.target.value); }
  };
  const confirmAdd = () => {
    const s = newSub.trim();
    if (s) { setCustomSubs(p => p.includes(s) ? p : [...p, s]); onChange(s); }
    setAdding(false); setNewSub("");
  };

  return adding ? (
    <div style={{ display: "flex", gap: 6 }}>
      <input autoFocus value={newSub} onChange={e => setNewSub(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirmAdd(); } if (e.key === "Escape") { setAdding(false); setNewSub(""); } }}
        placeholder="Type new sub group" style={{ ...fieldStyle, flex: 1 }} />
      <button type="button" onClick={confirmAdd} className="sans" style={{
        background: "#1B3A5C", color: "#F0D78C", border: "none", padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
      }}>ADD</button>
      <button type="button" onClick={() => { setAdding(false); setNewSub(""); }} className="sans" style={{
        background: "transparent", color: "#1B3A5C", border: "1px solid #D6D0C2", padding: "8px 10px", fontSize: 12, cursor: "pointer",
      }}>✕</button>
    </div>
  ) : (
    <select value={value} onChange={handleChange} style={fieldStyle}>
      <option value="">— Select Sub Group —</option>
      {allSubs.map(s => <option key={s} value={s}>{s}</option>)}
      <option value="__add_new__">➕ Add new sub group…</option>
    </select>
  );
}

const EMPTY_FORM = {
  gl_code: "", gl_name: "", header: "", main_group: "", sub_group: "", account_type: "BS",
};

const fieldStyle = {
  width: "100%", padding: "9px 10px", border: `1px solid ${NAVY}`,
  background: "#FFFFFF", fontSize: 13, boxSizing: "border-box",
};
const labelStyle = {
  fontSize: 10, letterSpacing: "0.12em", color: TEXT_DIM,
  fontWeight: 700, display: "block", marginBottom: 4,
};

export default function GLCreationPage({ session, companyId, companies, homeSettings, onViewMaster, initialAccount, initialMode }) {
  const isSuperAdmin = !!session?.user?.is_super_admin;
  const companyName = homeSettings?.company_name
    || companies?.find(c => c.id === companyId)?.name || "";

  const [mode, setMode]       = useState(initialMode || "new");
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState(initialAccount?.id ? String(initialAccount.id) : "");
  const [form, setForm]       = useState(initialAccount ? {
    gl_code: initialAccount.gl_code || "",
    gl_name: initialAccount.gl_name || "",
    header: initialAccount.header || "",
    main_group: initialAccount.main_group || "",
    sub_group: initialAccount.sub_group || "",
    account_type: initialAccount.account_type || "BS",
  } : EMPTY_FORM);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState("");
  const [error, setError]     = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchAccounts = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await fetch(`${BACKEND}/api/gl-accounts?company_id=${companyId}`);
      const data = await res.json();
      setAccounts(data.gl_accounts || []);
    } catch {}
  }, [companyId]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  // When a GL is selected in edit/delete mode, auto-fill the form
  const handleSelect = (id) => {
    setSelectedId(id);
    setMsg(""); setError(""); setConfirmDelete(false);
    if (!id) { setForm(EMPTY_FORM); return; }
    const a = accounts.find(a => String(a.id) === String(id));
    if (a) setForm({
      gl_code: a.gl_code, gl_name: a.gl_name,
      header: a.header || "", main_group: a.main_group || "",
      sub_group: a.sub_group || "", account_type: a.account_type || "BS",
    });
  };

  const switchMode = (m) => {
    setMode(m); setSelectedId(""); setForm(EMPTY_FORM);
    setMsg(""); setError(""); setConfirmDelete(false);
  };

  const save = async (e) => {
    e.preventDefault();
    setMsg(""); setError("");
    if (!form.gl_code.trim() || !form.gl_name.trim()) {
      setError("GL Code and GL Name are required."); return;
    }
    setSaving(true);
    try {
      const url = mode === "edit" && selectedId
        ? `${BACKEND}/api/gl-accounts/${selectedId}`
        : `${BACKEND}/api/gl-accounts`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesting_user_id: session.user.id,
          company_id: companyId,
          ...form,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || "Save failed."); }
      else {
        setMsg(mode === "edit" ? `GL '${form.gl_code}' updated.` : `GL '${form.gl_code}' added.`);
        setForm(EMPTY_FORM); setSelectedId("");
        fetchAccounts();
      }
    } catch { setError("Could not reach the server."); }
    finally { setSaving(false); }
  };

  const doDelete = async () => {
    setMsg(""); setError("");
    if (!selectedId) { setError("Please select a GL account to delete."); return; }
    setSaving(true);
    try {
      const res = await fetch(`${BACKEND}/api/gl-accounts/${selectedId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesting_user_id: session.user.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || "Delete failed."); }
      else {
        setMsg(`GL '${form.gl_code}' deleted.`);
        setForm(EMPTY_FORM); setSelectedId(""); setConfirmDelete(false);
        fetchAccounts();
      }
    } catch { setError("Could not reach the server."); }
    finally { setSaving(false); }
  };

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: "28px 32px", fontFamily: "'Source Serif Pro', Georgia, serif" }}>
        <div className="sans" style={{ fontSize: 13, color: TEXT_DIM }}>
          Only the Super Admin can create, edit, or delete GL accounts.
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Source Serif Pro', Georgia, serif", background: CREAM, minHeight: "calc(100vh - 90px)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+Pro:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap');
        .sans { font-family: 'Inter', sans-serif; }
        input:focus, select:focus { outline: 2px solid ${GOLD}; outline-offset: 1px; }
      `}</style>

      {/* Blue ribbon */}
      <div style={{
        background: "linear-gradient(135deg, #10243B 0%, #1E3F61 55%, #2E6E9E 100%)",
        padding: "12px 32px", borderBottom: "3px solid #B8860B",
      }}>
        <div className="sans" style={{ fontSize: 13, fontWeight: 700, color: "#F0D78C", letterSpacing: "0.08em" }}>
          {companyName.toUpperCase()}
          {session.fiscalYear && <>
            <span style={{ color: "#7E97AE", margin: "0 10px" }}>&middot;</span>
            <span style={{ color: "#C8D4DE" }}>FY {session.fiscalYear}</span>
          </>}
        </div>
      </div>

      <div style={{ padding: "28px 32px", maxWidth: 700, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, color: NAVY }}>GL Account Manager</div>
            <div className="sans" style={{ fontSize: 12, color: TEXT_DIM, marginTop: 2 }}>
              Super Admin only · New / Edit / Delete · {companyName}
            </div>
          </div>
          {onViewMaster && (
            <button onClick={onViewMaster} className="sans" style={{
              background: "transparent", color: NAVY, border: `1px solid ${BORDER}`,
              padding: "8px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}>☰ View GL Master</button>
          )}
        </div>

        {/* Mode selector — mirrors Excel buttons */}
        <div className="sans" style={{ display: "flex", border: `1px solid ${NAVY}`, marginBottom: 24, width: "fit-content" }}>
          {[["new", "NEW GL"], ["edit", "EDIT GL"], ["delete", "DELETE GL"]].map(([m, label], i) => (
            <button key={m} onClick={() => switchMode(m)} className="sans" style={{
              background: mode === m ? (m === "delete" ? ERROR : NAVY) : "transparent",
              color: mode === m ? "#F0D78C" : NAVY,
              border: "none", padding: "9px 20px", fontSize: 12, fontWeight: 700,
              cursor: "pointer", letterSpacing: "0.08em",
              borderRight: i < 2 ? `1px solid ${NAVY}` : "none",
            }}>{label}</button>
          ))}
        </div>

        <div style={{ border: `1px solid ${NAVY}`, background: "#FFFFFF", padding: 28 }}>

          {/* Select existing GL (edit/delete modes) */}
          {(mode === "edit" || mode === "delete") && (
            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${BORDER}` }}>
              <label className="sans" style={labelStyle}>
                SELECT GL TO {mode.toUpperCase()}
              </label>
              <select value={selectedId} onChange={e => handleSelect(e.target.value)} style={fieldStyle}>
                <option value="">— Select a GL Account —</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.gl_code} — {a.gl_name}</option>
                ))}
              </select>
              {selectedId && mode === "edit" && (
                <div className="sans" style={{ fontSize: 11, color: TEXT_DIM, marginTop: 6 }}>
                  Fields below have been auto-filled. Edit as needed, then click Save.
                </div>
              )}
            </div>
          )}

          {/* Delete mode — confirm block */}
          {mode === "delete" && selectedId && (
            <div>
              <div className="sans" style={{ fontSize: 14, marginBottom: 16, color: "#2B2B28" }}>
                You are about to <strong style={{ color: ERROR }}>permanently delete</strong> GL account:
              </div>
              <div style={{ background: "#FDF0EE", border: `1px solid ${ERROR}`, padding: "14px 18px", marginBottom: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>{form.gl_code} — {form.gl_name}</div>
                <div className="sans" style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4 }}>
                  {form.main_group}{form.sub_group ? " · " + form.sub_group : ""} &nbsp;|&nbsp; Type: {form.account_type}
                </div>
              </div>
              <div className="sans" style={{ fontSize: 12, color: ERROR, marginBottom: 16, fontWeight: 600 }}>
                ⚠ This cannot be undone. Any transactions linked to this GL code will lose their account reference.
              </div>
              <label className="sans" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, marginBottom: 16, cursor: "pointer" }}>
                <input type="checkbox" checked={confirmDelete} onChange={e => setConfirmDelete(e.target.checked)} />
                I understand this is permanent and confirm deletion.
              </label>
              {error && <div className="sans" style={{ color: ERROR, fontSize: 12, marginBottom: 10 }}>{error}</div>}
              {msg && <div className="sans" style={{ color: GREEN, fontSize: 12, marginBottom: 10 }}>{msg}</div>}
              <button onClick={doDelete} disabled={!confirmDelete || saving} className="sans" style={{
                background: confirmDelete ? ERROR : "#D6C4C4", color: "#FFFFFF", border: "none",
                padding: "11px 24px", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
                cursor: confirmDelete ? "pointer" : "not-allowed",
              }}>
                {saving ? "DELETING…" : "DELETE GL ACCOUNT"}
              </button>
            </div>
          )}

          {/* New / Edit form */}
          {(mode === "new" || (mode === "edit" && selectedId)) && mode !== "delete" && (
            <form onSubmit={save}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label className="sans" style={labelStyle}>GL CODE *</label>
                  <input value={form.gl_code}
                    onChange={e => setForm(f => ({ ...f, gl_code: e.target.value }))}
                    disabled={mode === "edit"}
                    placeholder="e.g. 1300"
                    style={{ ...fieldStyle, background: mode === "edit" ? "#F2EEE2" : "#FFFFFF" }} />
                  {mode === "edit" && (
                    <div className="sans" style={{ fontSize: 10, color: TEXT_DIM, marginTop: 3 }}>GL Code cannot be changed.</div>
                  )}
                </div>
                <div>
                  <label className="sans" style={labelStyle}>GL NAME *</label>
                  <input value={form.gl_name}
                    onChange={e => setForm(f => ({ ...f, gl_name: e.target.value }))}
                    placeholder="e.g. Inventory - Raw Material"
                    style={fieldStyle} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label className="sans" style={labelStyle}>HEADER</label>
                  <select value={form.header} onChange={e => setForm(f => ({ ...f, header: e.target.value, main_group: "", sub_group: "" }))} style={fieldStyle}>
                    <option value="">— Select Header —</option>
                    {Object.keys(HEADER_TO_MAIN).map(h => <option key={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="sans" style={labelStyle}>MAIN GROUP</label>
                  <select value={form.main_group} onChange={e => setForm(f => ({ ...f, main_group: e.target.value, sub_group: "" }))} style={fieldStyle}
                    disabled={!form.header}>
                    <option value="">— Select Main Group —</option>
                    {(HEADER_TO_MAIN[form.header] || []).map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 20 }}>
                <div>
                  <label className="sans" style={labelStyle}>SUB GROUP</label>
                  <SubGroupSelect
                    value={form.sub_group}
                    onChange={v => setForm(f => ({ ...f, sub_group: v }))}
                    mainGroup={form.main_group}
                  />
                </div>
                <div>
                  <label className="sans" style={labelStyle}>TYPE (BS / PL)</label>
                  <select value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))} style={fieldStyle}>
                    {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div className="sans" style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 16, fontStyle: "italic" }}>
                Opening balances (Dr/Cr) are entered separately via the GL Opening Balance Setup module.
              </div>

              {error && <div className="sans" style={{ color: ERROR, fontSize: 12, marginBottom: 10 }}>{error}</div>}
              {msg && <div className="sans" style={{ color: GREEN, fontSize: 12, marginBottom: 10 }}>{msg}</div>}

              <div style={{ display: "flex", gap: 10 }}>
                <button type="submit" disabled={saving} className="sans" style={{
                  flex: 1, background: NAVY, color: "#F0D78C", border: "none",
                  padding: "12px", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer",
                }}>
                  {saving ? "SAVING…" : mode === "edit" ? "SAVE CHANGES" : "SAVE / ADD GL"}
                </button>
                <button type="button" onClick={() => switchMode(mode)} className="sans" style={{
                  flex: 1, background: "transparent", color: NAVY, border: `1px solid ${NAVY}`,
                  padding: "12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>CLEAR</button>
              </div>
            </form>
          )}

          {mode === "delete" && !selectedId && (
            <div className="sans" style={{ color: TEXT_DIM, fontSize: 13 }}>
              Select a GL account above to proceed with deletion.
            </div>
          )}
        </div>

        <div className="sans" style={{ marginTop: 16, fontSize: 11, color: TEXT_DIM, textAlign: "center" }}>
          {accounts.length} GL accounts in {companyName}
        </div>
      </div>
    </div>
  );
}
