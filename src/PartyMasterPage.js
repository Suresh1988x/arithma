import { useState, useEffect, useCallback } from "react";

// PartyMasterPage.js — ARITHMA Party Master
// Two modes:
//   mode="create" → Party Entry Form (add new parties, all types)
//   mode="view"   → Party Master (read-only list, Export CSV/PDF/Print)
// Party types: Customer / Vendor / Staff / LC / TDS
// GL Account auto-filled by type but editable.
// Company Admin / Super Admin can add/edit; Viewer sees read-only list.

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";

const NAVY    = "#1B3A5C";
const GOLD    = "#B8860B";
const BORDER  = "#D6D0C2";
const TEXT_DIM = "#6B645A";
const ERROR   = "#A8453B";
const GREEN   = "#2E7D4F";
const CREAM   = "#F7F4ED";

const BUILTIN_GL_DEFAULTS = {
  Customer: "2100 - Trade Debtors / Receivables",
  Vendor:   "5010 - Trade Creditors / Payables",
  Staff:    "2120 - Advance to Staff",
  LC:       "2100 - Trade Debtors / Receivables",
  TDS:      "5060 - TDS Payables",
};

const PARTY_COLORS = {
  Customer: "#2A6F77", Vendor: "#A8453B", Staff: "#3D7A4F",
  LC: "#8A6D3B", TDS: "#6B5B95",
};

const EMPTY_FORM = {
  party_type: "Customer", name: "", pan: "", phone: "",
  email: "", gl_account: BUILTIN_GL_DEFAULTS["Customer"], is_import: false,
};

const fieldStyle = {
  width: "100%", padding: "9px 10px", border: `1px solid ${NAVY}`,
  background: "#FFFFFF", fontSize: 13, boxSizing: "border-box",
};
const labelStyle = {
  fontSize: 10, letterSpacing: "0.12em", color: TEXT_DIM,
  fontWeight: 700, display: "block", marginBottom: 4,
};

function fmt(n) {
  return (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PartyMasterPage({ session, companyId, companies, homeSettings, mode = "create", onViewMaster, onCreateParty }) {
  const isViewMode = mode === "view";
  const isSuperAdmin = !!session?.user?.is_super_admin;
  const myRole = session?.companies?.find(c => c.id === companyId)?.role;
  const canEdit = isSuperAdmin || myRole === "company_admin";

  const companyName = homeSettings?.company_name
    || companies?.find(c => c.id === companyId)?.name || "";

  const [partyTypes, setPartyTypes]       = useState([]);
  const [glAccountsList, setGlAccountsList] = useState([]);
  const [showManageTypes, setShowManageTypes] = useState(false);
  const [newTypeName, setNewTypeName]     = useState("");
  const [newTypeGL, setNewTypeGL]         = useState("");
  const [typeMsg, setTypeMsg]             = useState("");
  const [typeError, setTypeError]         = useState("");
  const [activeType, setActiveType] = useState("Customer");
  const [parties, setParties]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [error, setError]           = useState("");
  const [msg, setMsg]               = useState("");
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState("");

  const fetchParties = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${BACKEND}/api/parties?company_id=${companyId}&type=${activeType}`);
      const data = await res.json();
      setParties(data.parties || []);
    } catch { setError("Could not load parties."); }
    finally { setLoading(false); }
  }, [companyId, activeType]);

  useEffect(() => { fetchParties(); }, [fetchParties]);

  useEffect(() => {
    fetch(`${BACKEND}/api/party-types`)
      .then(r => r.json())
      .then(d => { if (d.party_types) setPartyTypes(d.party_types); })
      .catch(() => {});
    if (companyId) {
      fetch(`${BACKEND}/api/gl-accounts?company_id=${companyId}`)
        .then(r => r.json()).then(d => setGlAccountsList(d.gl_accounts || [])).catch(() => {});
    }
  }, [companyId]);

  const addPartyType = async () => {
    setTypeError(""); setTypeMsg("");
    if (!newTypeName.trim()) { setTypeError("Type name is required."); return; }
    try {
      const res = await fetch(`${BACKEND}/api/party-types`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesting_user_id: session.user.id, type_name: newTypeName.trim(), default_gl: newTypeGL }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setTypeError(data.error || "Failed."); }
      else {
        setTypeMsg(`Party type '${newTypeName}' added.`);
        setNewTypeName(""); setNewTypeGL("");
        fetch(`${BACKEND}/api/party-types`).then(r => r.json()).then(d => { if (d.party_types) setPartyTypes(d.party_types); });
      }
    } catch { setTypeError("Could not reach the server."); }
  };

  const openAdd = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, party_type: activeType, gl_account: partyTypes.find(t => t.type_name === activeType)?.default_gl || BUILTIN_GL_DEFAULTS[activeType] || "" });
    setFormError(""); setMsg("");
    setShowForm(true);
  };

  const openEdit = (p) => {
    setEditId(p.id);
    setForm({
      party_type: p.party_type, name: p.name, pan: p.pan,
      phone: p.phone, email: p.email, gl_account: p.gl_account,
      is_import: p.is_import,
    });
    setFormError(""); setMsg("");
    setShowForm(true);
  };

  const handleTypeChange = (type) => {
    setForm(f => ({ ...f, party_type: type, gl_account: BUILTIN_GL_DEFAULTS[type] || "" }));
  };

  const save = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim()) { setFormError("Party Name is required."); return; }
    // PAN validation: required (9 digits) for domestic Customer & Vendor
    const isImportType = form.is_import;
    const needsPan = (form.party_type === "Customer" || form.party_type === "Vendor") && !isImportType;
    if (needsPan) {
      const pan = (form.pan || "").trim().replace(/\s/g, "");
      if (!pan) { setFormError("PAN No. is required for domestic Customer/Vendor."); return; }
      if (!/^\d{9}$/.test(pan)) { setFormError("PAN No. must be exactly 9 digits."); return; }
    }
    setSaving(true);
    const url = editId ? `${BACKEND}/api/parties/${editId}` : `${BACKEND}/api/parties`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, gl_account: partyTypes.find(t => t.type_name === form.party_type)?.default_gl || BUILTIN_GL_DEFAULTS[form.party_type] || "", company_id: companyId, requesting_user_id: session.user.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setFormError(data.error || "Save failed."); }
      else {
        setMsg(editId ? `'${form.name}' updated.` : `'${form.name}' added.`);
        setShowForm(false); fetchParties();
      }
    } catch { setFormError("Could not reach the server."); }
    finally { setSaving(false); }
  };

  const toggleActive = async (p) => {
    try {
      await fetch(`${BACKEND}/api/parties/${p.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !p.is_active, requesting_user_id: session.user.id }),
      });
      fetchParties();
    } catch {}
  };

  // ── Export helpers ───────────────────────────────────────────
  const filtered = parties.filter(p => {
    const q = search.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || (p.pan || "").includes(q) || (p.phone || "").includes(q);
  });

  const exportCSV = () => {
    const headers = ["Type","Name","PAN","Phone","Email","GL Account","Import?","OB"];
    const rows = filtered.map(p => [
      p.party_type, p.name, p.pan, p.phone, p.email,
      p.gl_account, p.is_import ? "Yes" : "No",
      Number(p.opening_balance || 0).toFixed(2),
    ]);
    const escape = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map(r => r.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${companyName}_${activeType}_Master.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const styles = `
      body{font-family:Arial,sans-serif;font-size:9px;margin:10px}
      h2{font-size:12px;margin-bottom:2px} p{font-size:8px;color:#666;margin:0 0 8px}
      table{border-collapse:collapse;width:100%}
      th{background:#1B3A5C;color:#fff;padding:5px 8px;font-size:8px;text-align:left}
      td{padding:4px 8px;border-bottom:1px solid #ddd;font-size:8px}
      tr:nth-child(even) td{background:#f7f4ed}
    `;
    const thead = `<tr><th>TYPE</th><th>NAME</th><th>PAN</th><th>PHONE</th><th>EMAIL</th><th>GL ACCOUNT</th><th>IMPORT</th></tr>`;
    const tbody = filtered.map(p =>
      `<tr><td>${p.party_type}</td><td><b>${p.name}</b></td><td>${p.pan||""}</td>
       <td>${p.phone||""}</td><td>${p.email||""}</td><td>${p.gl_account||""}</td>
       <td>${p.is_import?"Yes":"No"}</td></tr>`
    ).join("");
    const html = `<!DOCTYPE html><html><head><style>${styles}</style></head><body>
      <h2>ARITHMA — ${activeType} Master</h2>
      <p>${companyName} | FY ${session.fiscalYear} | ${filtered.length} ${activeType.toLowerCase()}s</p>
      <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
    </body></html>`;
    const win = window.open("", "_blank");
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  return (
    <div style={{ fontFamily: "'Source Serif Pro', Georgia, serif", background: CREAM, minHeight: "calc(100vh - 90px)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+Pro:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap');
        .mono{font-family:'IBM Plex Mono',monospace;} .sans{font-family:'Inter',sans-serif;}
        input:focus,select:focus{outline:2px solid ${GOLD};outline-offset:1px;}
        table.pt{border-collapse:collapse;width:100%}
        table.pt th,table.pt td{border-bottom:1px solid ${BORDER}}
        table.pt tbody tr:hover{background:#FBF8F0}
      `}</style>

      {/* Ribbon */}
      <div style={{ background:"linear-gradient(135deg,#10243B 0%,#1E3F61 55%,#2E6E9E 100%)", padding:"12px 32px", borderBottom:"3px solid #B8860B" }}>
        <div className="sans" style={{ fontSize:13, fontWeight:700, color:"#F0D78C", letterSpacing:"0.08em" }}>
          {companyName.toUpperCase()}
          {session.fiscalYear && <><span style={{ color:"#7E97AE", margin:"0 10px" }}>&middot;</span><span style={{ color:"#C8D4DE" }}>FY {session.fiscalYear}</span></>}
        </div>
      </div>

      <div style={{ padding:"24px 32px", maxWidth:1180, margin:"0 auto" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:20, flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ fontSize:28, fontWeight:700, color:NAVY }}>
              {isViewMode ? `${activeType} Master` : "Party Entry Form"}
            </div>
            <div className="sans" style={{ fontSize:12, color:TEXT_DIM, marginTop:2 }}>
              Each company's parties are independent · <strong>{companyName}</strong>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {msg && <span className="sans" style={{ fontSize:12, color:GREEN, fontWeight:600 }}>{msg}</span>}
            {/* View/Create toggle */}
            {!isViewMode && onViewMaster && (
              <button onClick={() => onViewMaster(activeType)} className="sans" style={{
                background:"transparent", color:NAVY, border:`1px solid ${BORDER}`,
                padding:"8px 14px", fontSize:11, fontWeight:600, cursor:"pointer",
              }}>☰ View {activeType} Master</button>
            )}
            {isViewMode && onCreateParty && (
              <button onClick={onCreateParty} className="sans" style={{
                background:NAVY, color:"#F0D78C", border:"none",
                padding:"8px 14px", fontSize:11, fontWeight:700, cursor:"pointer",
              }}>+ Party Entry</button>
            )}
            {/* Export — view mode only */}
            {isViewMode && <>
              <button onClick={exportCSV} className="sans" style={{ background:"transparent", color:NAVY, border:`1px solid ${BORDER}`, padding:"8px 14px", fontSize:11, fontWeight:600, cursor:"pointer" }}>⬇ CSV</button>
              <button onClick={exportPDF} className="sans" style={{ background:"transparent", color:NAVY, border:`1px solid ${BORDER}`, padding:"8px 14px", fontSize:11, fontWeight:600, cursor:"pointer" }}>⬇ PDF</button>
              <button onClick={exportPDF} className="sans" style={{ background:"transparent", color:NAVY, border:`1px solid ${BORDER}`, padding:"8px 14px", fontSize:11, fontWeight:600, cursor:"pointer" }}>🖨 Print</button>
            </>}
            {/* Add button — create mode only */}
            {!isViewMode && canEdit && (
              <button onClick={openAdd} className="sans" style={{
                background:NAVY, color:"#F0D78C", border:"none",
                padding:"10px 20px", fontSize:12, fontWeight:700, letterSpacing:"0.1em", cursor:"pointer",
              }}>+ ADD {activeType.toUpperCase()}</button>
            )}
          </div>
        </div>

        {/* Type tabs — dynamic */}
        <div style={{ display:"flex", gap:0, flexWrap:"wrap", marginBottom:20 }}>
          <div className="sans" style={{ display:"flex", border:`1px solid ${NAVY}`, flexWrap:"wrap" }}>
            {partyTypes.map((t, i) => (
              <button key={t.type_name} onClick={() => { setActiveType(t.type_name); setMsg(""); setSearch(""); }} className="sans" style={{
                background: activeType === t.type_name ? NAVY : "transparent",
                color: activeType === t.type_name ? "#F0D78C" : NAVY,
                border:"none", padding:"8px 18px", fontSize:12, fontWeight:600, cursor:"pointer",
                borderRight: i < partyTypes.length - 1 ? `1px solid ${NAVY}` : "none",
              }}>{t.type_name}</button>
            ))}
          </div>
          {isSuperAdmin && (
            <button onClick={() => setShowManageTypes(v => !v)} className="sans" style={{
              marginLeft:10, background:"transparent", color:NAVY, border:`1px solid ${BORDER}`,
              padding:"8px 12px", fontSize:11, fontWeight:600, cursor:"pointer",
            }}>⚙ Manage Types</button>
          )}
        </div>

        {/* Manage Party Types panel — Super Admin only */}
        {showManageTypes && isSuperAdmin && (
          <div style={{ border:`1px solid ${GOLD}`, background:"#FFFEF5", padding:20, marginBottom:20 }}>
            <div style={{ fontSize:15, fontWeight:700, color:NAVY, marginBottom:12 }}>Manage Party Types</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr auto", gap:10, alignItems:"end", marginBottom:10 }}>
              <div>
                <label className="sans" style={labelStyle}>NEW TYPE NAME</label>
                <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)}
                  placeholder="e.g. Share Capital" style={fieldStyle} />
              </div>
              <div>
                <label className="sans" style={labelStyle}>DEFAULT GL ACCOUNT</label>
                <select value={newTypeGL} onChange={e => setNewTypeGL(e.target.value)} style={fieldStyle}>
                  <option value="">— Select GL Account —</option>
                  {glAccountsList.map(g => (
                    <option key={g.gl_code} value={`${g.gl_code} - ${g.gl_name}`}>
                      {g.gl_code} - {g.gl_name}
                    </option>
                  ))}
                </select>
              </div>
              <button onClick={addPartyType} className="sans" style={{
                background:NAVY, color:"#F0D78C", border:"none", padding:"9px 16px",
                fontSize:12, fontWeight:700, cursor:"pointer",
              }}>+ ADD TYPE</button>
            </div>
            {typeError && <div className="sans" style={{ color:ERROR, fontSize:12, marginBottom:6 }}>{typeError}</div>}
            {typeMsg && <div className="sans" style={{ color:GREEN, fontSize:12, marginBottom:6 }}>{typeMsg}</div>}
            <div className="sans" style={{ fontSize:11, color:TEXT_DIM, marginTop:8 }}>
              <strong>Current types:</strong> {partyTypes.map(t => `${t.type_name}${t.is_builtin ? " (built-in)" : ""}`).join(" · ")}
            </div>
          </div>
        )}

        {/* Search */}
        <div style={{ display:"flex", gap:12, marginBottom:16, alignItems:"center" }}>
          <input placeholder={`Search ${activeType} by name, PAN or phone…`} value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex:1, padding:"9px 14px", border:`1px solid ${NAVY}`, background:"#FFFFFF", fontSize:13 }} />
          <div className="sans" style={{ fontSize:12, color:TEXT_DIM }}>{filtered.length} {activeType.toLowerCase()}{filtered.length !== 1 ? "s" : ""}</div>
        </div>

        {error && <div className="sans" style={{ color:ERROR, fontSize:13, marginBottom:12 }}>{error}</div>}

        {/* Table */}
        <div style={{ border:`1px solid ${NAVY}`, background:"#FFFFFF" }}>
          {loading ? (
            <div className="sans" style={{ padding:40, textAlign:"center", color:TEXT_DIM }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="sans" style={{ padding:40, textAlign:"center", color:TEXT_DIM }}>
              No {activeType} entries yet.{!isViewMode && canEdit ? " Click + ADD to create the first one." : ""}
            </div>
          ) : (
            <table className="pt">
              <thead>
                <tr className="sans" style={{ background:NAVY }}>
                  <th style={{ padding:"10px 14px", fontSize:10, letterSpacing:"0.12em", color:CREAM, fontWeight:600 }}>NAME</th>
                  <th style={{ padding:"10px 14px", fontSize:10, letterSpacing:"0.12em", color:CREAM, fontWeight:600 }}>PAN</th>
                  <th style={{ padding:"10px 14px", fontSize:10, letterSpacing:"0.12em", color:CREAM, fontWeight:600 }}>PHONE</th>
                  <th style={{ padding:"10px 14px", fontSize:10, letterSpacing:"0.12em", color:CREAM, fontWeight:600 }}>EMAIL</th>
                  <th style={{ padding:"10px 14px", fontSize:10, letterSpacing:"0.12em", color:CREAM, fontWeight:600 }}>GL ACCOUNT</th>
                  {activeType === "Customer" && <th style={{ padding:"10px 14px", fontSize:10, letterSpacing:"0.12em", color:CREAM, fontWeight:600, textAlign:"center" }}>IMPORT</th>}
                  {canEdit && <th style={{ padding:"10px 14px", fontSize:10, letterSpacing:"0.12em", color:CREAM, fontWeight:600, textAlign:"center" }}>ACTION</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.45 }}>
                    <td style={{ padding:"10px 14px", fontSize:14, fontWeight:600 }}>
                      <span style={{ borderLeft:`3px solid ${PARTY_COLORS[p.party_type] || NAVY}`, paddingLeft:8 }}>{p.name}</span>
                    </td>
                    <td className="mono" style={{ padding:"10px 14px", fontSize:12, color:TEXT_DIM }}>{p.pan || "—"}</td>
                    <td className="sans" style={{ padding:"10px 14px", fontSize:12 }}>{p.phone || "—"}</td>
                    <td className="sans" style={{ padding:"10px 14px", fontSize:12 }}>{p.email || "—"}</td>
                    <td className="sans" style={{ padding:"10px 14px", fontSize:11, color:TEXT_DIM }}>{p.gl_account || "—"}</td>
                    {activeType === "Customer" && (
                      <td className="sans" style={{ padding:"10px 14px", fontSize:11, textAlign:"center" }}>
                        {p.is_import ? <span style={{ color:GREEN, fontWeight:700 }}>Yes</span> : "No"}
                      </td>
                    )}
                    {canEdit && (
                      <td style={{ padding:"8px 14px", textAlign:"center" }}>
                        <div style={{ display:"flex", gap:6, justifyContent:"center" }}>
                          <button onClick={() => openEdit(p)} className="sans" style={{
                            border:`1px solid ${NAVY}`, background:"transparent", color:NAVY,
                            padding:"3px 10px", fontSize:11, cursor:"pointer", fontWeight:600,
                          }}>Edit</button>
                          <button onClick={() => toggleActive(p)} className="sans" style={{
                            border:"none", background:"none", cursor:"pointer",
                            color: p.is_active ? ERROR : GREEN, fontSize:11, fontWeight:700,
                          }}>{p.is_active ? "Disable" : "Enable"}</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showForm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(27,58,92,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}
          onClick={() => setShowForm(false)}>
          <form onSubmit={save} onClick={e => e.stopPropagation()} style={{
            background:CREAM, border:`1px solid ${NAVY}`, width:520, padding:28, maxHeight:"90vh", overflowY:"auto",
          }}>
            <div style={{ fontSize:20, fontWeight:700, color:NAVY, marginBottom:4 }}>
              {editId ? "Edit Party" : "Add New Party"}
            </div>
            <div className="sans" style={{ fontSize:11, color:TEXT_DIM, marginBottom:20 }}>Company: {companyName}</div>

            {/* Party Type */}
            <div style={{ marginBottom:14 }}>
              <label className="sans" style={labelStyle}>PARTY TYPE</label>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {partyTypes.map(t => (
                  <button key={t.type_name} type="button" onClick={() => handleTypeChange(t.type_name)} className="sans" style={{
                    background: form.party_type === t.type_name ? (PARTY_COLORS[t.type_name] || NAVY) : "transparent",
                    color: form.party_type === t.type_name ? "#FFFFFF" : NAVY,
                    border:`1px solid ${PARTY_COLORS[t.type_name] || NAVY}`,
                    padding:"5px 14px", fontSize:12, fontWeight:600, cursor:"pointer",
                  }}>{t.type_name}</button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div style={{ marginBottom:12 }}>
              <label className="sans" style={labelStyle}>PARTY NAME *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={fieldStyle} placeholder="Full name or company name" />
            </div>

            {/* PAN + Phone */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
              <div>
                <label className="sans" style={labelStyle}>
                  PAN NO.{" "}
                  {(form.party_type === "Customer" || form.party_type === "Vendor") && !form.is_import
                    ? <span style={{ color: "#A8453B", fontSize: 9 }}>* REQUIRED · 9 DIGITS</span>
                    : <span style={{ color: TEXT_DIM, fontSize: 9 }}>OPTIONAL</span>
                  }
                </label>
                <input value={form.pan} onChange={e => setForm(f => ({ ...f, pan: e.target.value.replace(/\D/g, "").slice(0, 9) }))}
                  style={fieldStyle} placeholder={(form.party_type === "Customer" || form.party_type === "Vendor") && !form.is_import ? "9-digit PAN number" : "Optional"} maxLength={9} />
              </div>
              <div>
                <label className="sans" style={labelStyle}>PHONE</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  style={fieldStyle} placeholder="" />
              </div>
            </div>

            {/* Email */}
            <div style={{ marginBottom:12 }}>
              <label className="sans" style={labelStyle}>EMAIL</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                style={fieldStyle} placeholder="" />
            </div>

            {/* GL Account — fixed by party type, read-only */}
            <div style={{ marginBottom:12 }}>
              <label className="sans" style={labelStyle}>GL ACCOUNT (fixed by party type)</label>
              <div style={{
                padding:"9px 10px", border:`1px solid ${BORDER}`, background:"#F2EEE2",
                fontSize:13, color:TEXT_DIM,
              }}>
                {BUILTIN_GL_DEFAULTS[form.party_type] || "—"}
              </div>
            </div>

            {/* Import/Export flag — Customer or Vendor only */}
            {(form.party_type === "Customer" || form.party_type === "Vendor") && (
              <label className="sans" style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, marginBottom:16, cursor:"pointer" }}>
                <input type="checkbox" checked={form.is_import}
                  onChange={e => setForm(f => ({ ...f, is_import: e.target.checked }))} />
                {form.party_type === "Customer" ? "Export Customer (sells abroad / foreign buyer)" : "Import Vendor (foreign supplier)"}
              </label>
            )}

            <div className="sans" style={{ fontSize:11, color:TEXT_DIM, marginBottom:16, fontStyle:"italic" }}>
              Opening Balance is entered separately via the Party Opening Balance module.
            </div>

            {formError && <div className="sans" style={{ color:ERROR, fontSize:12, marginBottom:10 }}>{formError}</div>}

            <div style={{ display:"flex", gap:10 }}>
              <button type="submit" disabled={saving} className="sans" style={{
                flex:1, background:NAVY, color:"#F0D78C", border:"none",
                padding:"11px", fontSize:12, fontWeight:700, letterSpacing:"0.1em", cursor:"pointer",
              }}>{saving ? "SAVING…" : editId ? "UPDATE" : "ADD PARTY"}</button>
              <button type="button" onClick={() => setShowForm(false)} className="sans" style={{
                flex:1, background:"transparent", color:NAVY, border:`1px solid ${NAVY}`,
                padding:"11px", fontSize:12, fontWeight:600, cursor:"pointer",
              }}>CANCEL</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
