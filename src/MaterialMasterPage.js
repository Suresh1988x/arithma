import { useState, useEffect, useCallback } from "react";

// MaterialMasterPage.js — ARITHMA Material Master
// Five material types per company: RM, FG, Sub-Store, By-Product, Service
// Each company's materials are completely independent (filtered by company_id).
// Company Admin can add/edit; Accountant/Viewer see read-only list.

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";

const NAVY    = "#1B3A5C";
const GOLD    = "#B8860B";
const BORDER  = "#D6D0C2";
const TEXT_DIM = "#6B645A";
const ERROR   = "#A8453B";
const GREEN   = "#2E7D4F";
const CREAM   = "#F7F4ED";

const TYPES = [
  { key: "RM",      label: "Raw Material",   short: "RM",  hasExcise: false, hasGL: false },
  { key: "FG",      label: "Finished Goods", short: "FG",  hasExcise: true,  hasGL: false },
  { key: "Sub",     label: "Sub-Store",      short: "SUB", hasExcise: false, hasGL: false },
  { key: "BP",      label: "By-Product",     short: "BP",  hasExcise: true,  hasGL: false },
  { key: "Service", label: "Service",        short: "SVC", hasExcise: false, hasGL: true  },
];

const DEFAULT_UOMS = ["PCS", "KG", "LTR", "MTR", "BOX", "BAG", "SET", "PAIR", "NOS", "TON", "GM", "ML", "SQ FT", "RFT"];
const EXCISE_TYPES = ["QTY", "VALUE"];

const EMPTY_FORM = {
  product_name: "", product_code: "", uom: "", date: "",
  opening_qty: "", opening_value: "",
  excise_type: "QTY", excise_rate: "", related_gl: "",
};

function fmt(n, decimals = 2) {
  const num = Number(n) || 0;
  return num.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const fieldStyle = {
  width: "100%", padding: "8px 10px", border: `1px solid ${NAVY}`,
  background: "#FFFFFF", fontSize: 13, boxSizing: "border-box",
};
const labelStyle = {
  fontSize: 10, letterSpacing: "0.12em", color: TEXT_DIM,
  fontWeight: 700, display: "block", marginBottom: 4,
};

function UomSelect({ value, onChange, customUoms, onAddUom }) {
  const [adding, setAdding] = useState(false);
  const [newUom, setNewUom] = useState("");
  const allUoms = [...DEFAULT_UOMS, ...customUoms.filter(u => !DEFAULT_UOMS.includes(u))];

  const handleChange = (e) => {
    if (e.target.value === "__add_new__") {
      setAdding(true);
    } else {
      onChange(e.target.value);
    }
  };

  const confirmAdd = () => {
    const uom = newUom.trim().toUpperCase();
    if (uom) {
      onAddUom(uom);
      onChange(uom);
    }
    setAdding(false);
    setNewUom("");
  };

  return (
    <div>
      {!adding ? (
        <select value={value} onChange={handleChange} style={fieldStyle}>
          <option value="">— Select UOM —</option>
          {allUoms.map(u => <option key={u} value={u}>{u}</option>)}
          <option value="__add_new__">➕ Add new UOM…</option>
        </select>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            autoFocus
            value={newUom}
            onChange={e => setNewUom(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirmAdd(); } if (e.key === "Escape") { setAdding(false); setNewUom(""); } }}
            placeholder="Type new UOM (e.g. DRUM)"
            style={{ ...fieldStyle, flex: 1 }}
          />
          <button type="button" onClick={confirmAdd} className="sans" style={{
            background: NAVY, color: "#F0D78C", border: "none",
            padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>ADD</button>
          <button type="button" onClick={() => { setAdding(false); setNewUom(""); }} className="sans" style={{
            background: "transparent", color: NAVY, border: `1px solid ${BORDER}`,
            padding: "8px 10px", fontSize: 12, cursor: "pointer",
          }}>✕</button>
        </div>
      )}
    </div>
  );
}

export default function MaterialMasterPage({ session, companyId, companies, mode = "create", initialType = "RM", onViewMaster, onCreateMaterial }) {
  // mode="create" → Material Creation Form (all tabs, Add button visible, no Export)
  // mode="view"   → Master view (locked to initialType tab, no Add button, Export visible)
  const isViewMode = mode === "view";
  const [activeType, setActiveType] = useState(isViewMode ? initialType : "RM");
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const isSuperAdmin = !!session?.user?.is_super_admin;
  const myRole = session?.companies?.find(c => c.id === companyId)?.role;
  const canEdit = isSuperAdmin || myRole === "company_admin";

  const companyName = companies?.find(c => c.id === companyId)?.name || "";
  const typeMeta = TYPES.find(t => t.key === activeType);

  const [customUoms, setCustomUoms] = useState([]);

  const addCustomUom = (uom) => {
    setCustomUoms(prev => prev.includes(uom) ? prev : [...prev, uom]);
  };

  // GL accounts for Service "Related GL" dropdown
  const [glAccounts, setGlAccounts] = useState([]);

  const fetchMaterials = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${BACKEND}/api/materials?company_id=${companyId}&type=${activeType}`);
      const data = await res.json();
      if (data.error) setError(data.error);
      else setMaterials(data.materials || []);
    } catch {
      setError("Could not load materials.");
    } finally {
      setLoading(false);
    }
  }, [companyId, activeType]);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  useEffect(() => {
    if (activeType === "Service" && companyId) {
      fetch(`${BACKEND}/api/gl-accounts?company_id=${companyId}`)
        .then(r => r.json())
        .then(d => setGlAccounts(d.gl_accounts || []))
        .catch(() => {});
    }
  }, [activeType, companyId]);

  const openAdd = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10), _codeManual: false });
    setFormError(""); setMsg("");
    setShowForm(true);
  };

  const openEdit = (m) => {
    setEditId(m.id);
    setForm({
      product_name: m.product_name,
      product_code: m.product_code,
      uom: m.uom || "",
      date: m.date || "",
      opening_qty: m.opening_qty === 0 ? "" : String(m.opening_qty),
      opening_value: m.opening_value === 0 ? "" : String(m.opening_value),
      excise_type: m.excise_type || "QTY",
      excise_rate: m.excise_rate === 0 ? "" : String(m.excise_rate),
      related_gl: m.related_gl || "",
      _codeManual: true,
    });
    setFormError(""); setMsg("");
    setShowForm(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.product_name.trim() || !form.product_code.trim()) {
      setFormError("Product Name and Product Code are required.");
      return;
    }
    setSaving(true);
    const body = {
      company_id: companyId,
      requesting_user_id: session.user.id,
      material_type: activeType,
      product_name: form.product_name.trim(),
      product_code: (form.product_code.trim() || form.product_name.trim()),
      uom: form.uom,
      opening_qty: parseFloat(form.opening_qty) || 0,
      opening_value: parseFloat(form.opening_value) || 0,
      excise_type: form.excise_type,
      excise_rate: parseFloat(form.excise_rate) || 0,
      related_gl: form.related_gl,
    };
    try {
      const url = editId ? `${BACKEND}/api/materials/${editId}` : `${BACKEND}/api/materials`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setFormError(data.error || "Save failed.");
      } else {
        setMsg(editId ? "Record updated." : "Material added.");
        setShowForm(false);
        fetchMaterials();
      }
    } catch {
      setFormError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m) => {
    try {
      await fetch(`${BACKEND}/api/materials/${m.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          requesting_user_id: session.user.id,
          is_active: !m.is_active,
        }),
      });
      fetchMaterials();
    } catch {}
  };

  // ── Export helpers ──────────────────────────────────────────
  const buildHeaders = () => {
    const h = ["Code", "Product Name", "UOM"];
    if (activeType !== "Service") { h.push("OB Qty", "OB Amount (Rs.)"); }
    if (typeMeta?.hasExcise) { h.push("Excise Type", "Excise Rate"); }
    if (typeMeta?.hasGL) { h.push("Related GL"); }
    return h;
  };

  const buildRow = (m) => {
    const r = [m.product_code, m.product_name, m.uom || ""];
    if (activeType !== "Service") { r.push(m.opening_qty || 0, m.opening_value || 0); }
    if (typeMeta?.hasExcise) { r.push(m.excise_type || "", m.excise_rate || 0); }
    if (typeMeta?.hasGL) { r.push(m.related_gl || ""); }
    return r;
  };

  const exportCSV = () => {
    const headers = buildHeaders();
    const rows = filtered.map(buildRow);
    const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map(r => r.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `${companyName}_${typeMeta?.label}_Master.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const headers = buildHeaders();
    const rows = filtered.map(buildRow);
    const colW = headers.map(() => Math.floor(170 / headers.length));
    const rowH = 18;
    const margin = 20;
    const pageW = 210; // A4 landscape mm approx handled via scale
    const tableW = pageW - margin * 2;

    // Build an HTML page and use browser print to PDF
    const styles = `
      body { font-family: Arial, sans-serif; font-size: 9px; margin: 10px; }
      h2 { font-size: 12px; margin-bottom: 2px; }
      p { font-size: 8px; color: #666; margin: 0 0 8px; }
      table { border-collapse: collapse; width: 100%; }
      th { background: #1B3A5C; color: #fff; padding: 5px 8px; font-size: 8px; text-align: left; }
      td { padding: 4px 8px; border-bottom: 1px solid #ddd; font-size: 8px; }
      tr:nth-child(even) td { background: #f7f4ed; }
      .num { text-align: right; }
    `;
    const thead = `<tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>`;
    const tbody = rows.map(r =>
      `<tr>${r.map((v, i) => `<td class="${typeof v === "number" ? "num" : ""}">${v}</td>`).join("")}</tr>`
    ).join("");
    const html = `<!DOCTYPE html><html><head><style>${styles}</style></head><body>
      <h2>ARITHMA — ${typeMeta?.label} Master</h2>
      <p>${companyName} &nbsp;|&nbsp; FY ${session.fiscalYear} &nbsp;|&nbsp; ${filtered.length} items</p>
      <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
    </body></html>`;
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  const printTable = () => exportPDF();

  // ────────────────────────────────────────────────────────────
    const filtered = materials.filter(m => {
    const q = search.toLowerCase();
    return !q || m.product_name.toLowerCase().includes(q) || m.product_code.toLowerCase().includes(q);
  });

  return (
    <div style={{ fontFamily: "'Source Serif Pro', Georgia, serif", background: CREAM, minHeight: "calc(100vh - 90px)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+Pro:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap');
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .sans { font-family: 'Inter', sans-serif; }
        input:focus, select:focus { outline: 2px solid ${GOLD}; outline-offset: 1px; }
        table.mat { border-collapse: collapse; width: 100%; }
        table.mat th, table.mat td { border-bottom: 1px solid ${BORDER}; }
        table.mat tbody tr:hover { background: #FBF8F0; }
      `}</style>

      {/* Blue ribbon */}
      <div style={{
        background: `linear-gradient(135deg, #10243B 0%, #1E3F61 55%, #2E6E9E 100%)`,
        padding: "12px 32px", borderBottom: "3px solid #B8860B",
      }}>
        <div className="sans" style={{ fontSize: 13, fontWeight: 700, color: "#F0D78C", letterSpacing: "0.08em" }}>
          {companyName.toUpperCase()}
          {session.fiscalYear && <><span style={{ color: "#7E97AE", margin: "0 10px" }}>&middot;</span><span style={{ color: "#C8D4DE" }}>FY {session.fiscalYear}</span></>}
        </div>
      </div>

      <div style={{ padding: "24px 32px", maxWidth: 1180, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, color: NAVY }}>
              {isViewMode ? `${typeMeta?.label} Master` : "Material Creation Form"}
            </div>
            <div className="sans" style={{ fontSize: 12, color: TEXT_DIM, marginTop: 2 }}>
              Each company's materials are independent. Showing: <strong>{companyName || "—"}</strong>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {msg && <span className="sans" style={{ fontSize: 12, color: GREEN, fontWeight: 600 }}>{msg}</span>}

            {/* In create mode: button to jump to the master list for current type */}
            {!isViewMode && onViewMaster && (
              <button onClick={() => onViewMaster(activeType)} className="sans" style={{
                background: "transparent", color: NAVY, border: `1px solid ${BORDER}`,
                padding: "8px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", letterSpacing: "0.06em",
              }}>☰ View {typeMeta?.label} Master</button>
            )}

            {/* In view mode: button to jump back to creation form */}
            {isViewMode && onCreateMaterial && (
              <button onClick={onCreateMaterial} className="sans" style={{
                background: NAVY, color: "#F0D78C", border: "none",
                padding: "8px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em",
              }}>+ Create Material</button>
            )}

            {/* Export — view mode only */}
            {isViewMode && <>
              <button onClick={() => exportCSV()} className="sans" title="Export to CSV" style={{
                background: "transparent", color: NAVY, border: `1px solid ${BORDER}`,
                padding: "8px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", letterSpacing: "0.06em",
              }}>⬇ CSV</button>
              <button onClick={() => exportPDF()} className="sans" title="Export to PDF" style={{
                background: "transparent", color: NAVY, border: `1px solid ${BORDER}`,
                padding: "8px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", letterSpacing: "0.06em",
              }}>⬇ PDF</button>
              <button onClick={() => printTable()} className="sans" title="Print" style={{
                background: "transparent", color: NAVY, border: `1px solid ${BORDER}`,
                padding: "8px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", letterSpacing: "0.06em",
              }}>🖨 Print</button>
            </>}

            {/* Add button — create mode only */}
            {!isViewMode && canEdit && (
              <button onClick={openAdd} className="sans" style={{
                background: NAVY, color: "#F0D78C", border: "none",
                padding: "10px 20px", fontSize: 12, fontWeight: 700,
                letterSpacing: "0.1em", cursor: "pointer",
              }}>
                + ADD {typeMeta?.short}
              </button>
            )}
          </div>
        </div>

        {/* Material type tabs — all types in create mode, single tab in view mode */}
        {!isViewMode && (
        <div className="sans" style={{ display: "flex", border: `1px solid ${NAVY}`, marginBottom: 20, width: "fit-content" }}>
          {TYPES.map((t, i) => (
            <button key={t.key} onClick={() => { setActiveType(t.key); setMsg(""); setSearch(""); }} className="sans" style={{
              background: activeType === t.key ? NAVY : "transparent",
              color: activeType === t.key ? "#F0D78C" : NAVY,
              border: "none", padding: "8px 18px", fontSize: 12, fontWeight: 600,
              cursor: "pointer", letterSpacing: "0.06em",
              borderRight: i < TYPES.length - 1 ? `1px solid ${NAVY}` : "none",
            }}>
              {t.label}
            </button>
          ))}
        </div>
        )}

        {/* Search */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
          <input
            placeholder={`Search ${typeMeta?.label} by name or code…`}
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, padding: "9px 14px", border: `1px solid ${NAVY}`, background: "#FFFFFF", fontSize: 13 }}
          />
          <div className="sans" style={{ fontSize: 12, color: TEXT_DIM }}>
            {filtered.length} item{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        {error && <div className="sans" style={{ color: ERROR, fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {/* Table */}
        <div style={{ border: `1px solid ${NAVY}`, background: "#FFFFFF" }}>
          {loading ? (
            <div className="sans" style={{ padding: 40, textAlign: "center", color: TEXT_DIM }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="sans" style={{ padding: 40, textAlign: "center", color: TEXT_DIM }}>
              No {typeMeta?.label} items yet.{canEdit ? " Click + ADD to create the first one." : ""}
            </div>
          ) : (
            <table className="mat">
              <thead>
                <tr className="sans" style={{ background: NAVY }}>
                  <th style={{ padding: "10px 16px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, fontWeight: 600, textAlign: "left" }}>CODE</th>
                  <th style={{ padding: "10px 16px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, fontWeight: 600, textAlign: "left" }}>PRODUCT NAME</th>
                  <th style={{ padding: "10px 16px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, fontWeight: 600, textAlign: "center" }}>UOM</th>
                  {activeType !== "Service" && <>
                    <th style={{ padding: "10px 16px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, fontWeight: 600, textAlign: "right" }}>OB QTY</th>
                    <th style={{ padding: "10px 16px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, fontWeight: 600, textAlign: "right" }}>OB AMOUNT (Rs.)</th>
                  </>}
                  {typeMeta.hasExcise && <th style={{ padding: "10px 16px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, fontWeight: 600, textAlign: "center" }}>EXCISE</th>}
                  {typeMeta.hasGL && <th style={{ padding: "10px 16px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, fontWeight: 600, textAlign: "left" }}>RELATED GL</th>}
                  {canEdit && !isViewMode && <th style={{ padding: "10px 16px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, fontWeight: 600, textAlign: "center" }}>ACTION</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id} style={{ opacity: m.is_active ? 1 : 0.45 }}>
                    <td className="mono" style={{ padding: "10px 16px", fontSize: 13, color: TEXT_DIM }}>{m.product_code}</td>
                    <td style={{ padding: "10px 16px", fontSize: 14, fontWeight: 600 }}>{m.product_name}</td>
                    <td className="sans" style={{ padding: "10px 16px", fontSize: 12, textAlign: "center" }}>{m.uom || "—"}</td>
                    {activeType !== "Service" && <>
                      <td className="mono" style={{ padding: "10px 16px", fontSize: 13, textAlign: "right" }}>
                        {m.opening_qty > 0 ? fmt(m.opening_qty, 3) : <span style={{ color: "#D8D2C3" }}>—</span>}
                      </td>
                      <td className="mono" style={{ padding: "10px 16px", fontSize: 13, textAlign: "right" }}>
                        {m.opening_value > 0 ? fmt(m.opening_value) : <span style={{ color: "#D8D2C3" }}>—</span>}
                      </td>
                    </>}
                    {typeMeta.hasExcise && (
                      <td className="sans" style={{ padding: "10px 16px", fontSize: 12, textAlign: "center" }}>
                        {m.excise_type ? `${m.excise_type} @ ${m.excise_rate}` : "—"}
                      </td>
                    )}
                    {typeMeta.hasGL && (
                      <td className="sans" style={{ padding: "10px 16px", fontSize: 12 }}>{m.related_gl || "—"}</td>
                    )}
                    {canEdit && !isViewMode && (
                      <td style={{ padding: "10px 16px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                          <button onClick={() => openEdit(m)} className="sans" style={{
                            border: `1px solid ${NAVY}`, background: "transparent", color: NAVY,
                            padding: "4px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600,
                          }}>Edit</button>
                          <button onClick={() => toggleActive(m)} className="sans" style={{
                            border: "none", background: "none", cursor: "pointer",
                            color: m.is_active ? ERROR : GREEN, fontSize: 11, fontWeight: 700,
                          }}>
                            {m.is_active ? "Disable" : "Enable"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {activeType !== "Service" && (
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${NAVY}` }}>
                    <td colSpan={3} className="sans" style={{ padding: "10px 16px", fontSize: 11, letterSpacing: "0.12em", fontWeight: 700, textAlign: "right" }}>
                      TOTAL ({filtered.length})
                    </td>
                    <td className="mono" style={{ padding: "10px 16px", fontSize: 13, fontWeight: 700, textAlign: "right" }}>
                      {fmt(filtered.reduce((s, m) => s + (m.opening_qty || 0), 0), 3)}
                    </td>
                    <td className="mono" style={{ padding: "10px 16px", fontSize: 13, fontWeight: 700, textAlign: "right" }}>
                      {fmt(filtered.reduce((s, m) => s + (m.opening_value || 0), 0))}
                    </td>
                    {typeMeta.hasExcise && <td />}
                    {canEdit && !isViewMode && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showForm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(27,58,92,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        }} onClick={() => setShowForm(false)}>
          <form onSubmit={save} onClick={e => e.stopPropagation()} style={{
            background: CREAM, border: `1px solid ${NAVY}`, width: 520, padding: 28,
            maxHeight: "90vh", overflowY: "auto",
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 4 }}>
              {editId ? "Edit" : "Add"} {typeMeta.label}
            </div>
            <div className="sans" style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 20 }}>
              Company: {companyName} · Type: {typeMeta.label}
            </div>

            {/* Name + Code */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label className="sans" style={labelStyle}>PRODUCT NAME *</label>
                <input value={form.product_name}
                  onChange={e => {
                    const name = e.target.value;
                    setForm(f => ({
                      ...f,
                      product_name: name,
                      // auto-fill code from name if code hasn't been manually set
                      product_code: f._codeManual ? f.product_code : name,
                    }));
                  }}
                  style={fieldStyle} />
              </div>
              <div>
                <label className="sans" style={labelStyle}>PRODUCT CODE <span style={{ color: TEXT_DIM, fontWeight: 400 }}>(optional — defaults to name)</span></label>
                <input value={form.product_code}
                  onChange={e => setForm(f => ({ ...f, product_code: e.target.value, _codeManual: true }))}
                  style={fieldStyle} placeholder="Leave blank to use product name" />
              </div>
            </div>

            {/* UOM only */}
            <div style={{ marginBottom: 12 }}>
              <label className="sans" style={labelStyle}>UNIT OF MEASURE</label>
              <div style={{ width: "50%" }}>
                <UomSelect
                  value={form.uom}
                  onChange={uom => setForm(f => ({ ...f, uom }))}
                  customUoms={customUoms}
                  onAddUom={addCustomUom}
                />
              </div>
            </div>

            {/* Excise — FG and BP only */}
            {typeMeta.hasExcise && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label className="sans" style={labelStyle}>EXCISE TYPE</label>
                  <select value={form.excise_type} onChange={e => setForm(f => ({ ...f, excise_type: e.target.value }))} style={fieldStyle}>
                    {EXCISE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="sans" style={labelStyle}>EXCISE RATE</label>
                  <input type="number" min="0" step="0.01" value={form.excise_rate}
                    onChange={e => setForm(f => ({ ...f, excise_rate: e.target.value }))}
                    style={fieldStyle} placeholder="0" />
                </div>
              </div>
            )}

            {/* Related GL — Service only */}
            {typeMeta.hasGL && (
              <div style={{ marginBottom: 12 }}>
                <label className="sans" style={labelStyle}>RELATED GL ACCOUNT</label>
                <select value={form.related_gl} onChange={e => setForm(f => ({ ...f, related_gl: e.target.value }))} style={fieldStyle}>
                  <option value="">— Select GL Account —</option>
                  {glAccounts.map(g => (
                    <option key={g.gl_code} value={`${g.gl_code} - ${g.gl_name}`}>
                      {g.gl_code} - {g.gl_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {formError && <div className="sans" style={{ color: ERROR, fontSize: 12, marginBottom: 10 }}>{formError}</div>}

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="submit" disabled={saving} className="sans" style={{
                flex: 1, background: NAVY, color: "#F0D78C", border: "none",
                padding: "11px", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer",
              }}>
                {saving ? "SAVING…" : editId ? "UPDATE" : "ADD MATERIAL"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="sans" style={{
                flex: 1, background: "transparent", color: NAVY, border: `1px solid ${NAVY}`,
                padding: "11px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>CANCEL</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
