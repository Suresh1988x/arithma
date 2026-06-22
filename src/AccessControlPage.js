import { useState, useEffect } from "react";

// AccessControlPage.js — tick/untick module access per role
// Company Admin (or Super Admin) only. company_admin role is always
// full-access and not shown as editable. accountant & viewer columns
// are editable checkboxes, saved as a matrix to /api/permissions.

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";

const NAVY     = "#1B3A5C";
const BORDER   = "#D6D0C2";
const TEXT_DIM = "#6B645A";
const ERROR    = "#A8453B";
const GREEN    = "#2E7D4F";
const CREAM    = "#F7F4ED";

// Grouped for display — mirrors HomePage section structure.
const GROUPS = [
  { label: "Company Settings", modules: [
    { key: "settings", label: "Settings" },
    { key: "users", label: "Users & Access" },
  ]},
  { label: "Masters — Accounting & Inventory Setup", modules: [
    { key: "gl-create", label: "GL Creation" },
    { key: "party-create", label: "Party Creation" },
    { key: "material-create", label: "Material Creation" },
  ]},
  { label: "Masters — Edit / View", modules: [
    { key: "rm-master", label: "RM Master" },
    { key: "fg-master", label: "FG Master" },
    { key: "sub-master", label: "Sub-Store Master" },
    { key: "service-master", label: "Service Master" },
    { key: "gl", label: "GL Master" },
  ]},
  { label: "Opening Balances", modules: [
    { key: "inv-ob", label: "Inventory OB" },
    { key: "party-ob", label: "Party OB" },
    { key: "bank-ob", label: "Bank OB" },
    { key: "fa-ob", label: "FA OB" },
    { key: "gl-ob", label: "GL OB Setup" },
  ]},
  { label: "Trade Transactions", modules: [
    { key: "purchase", label: "Purchase" },
    { key: "import", label: "Import" },
    { key: "sales", label: "Sales" },
  ]},
  { label: "Production & Stores", modules: [
    { key: "production", label: "Production Orders" },
    { key: "sub-issue", label: "Sub-Store Issue" },
  ]},
  { label: "Operations & Finance", modules: [
    { key: "bank-cash", label: "Bank & Cash" },
    { key: "journal", label: "Journal Entries" },
  ]},
  { label: "Inventory Insights", modules: [
    { key: "rm-stock", label: "RM Stock Report" },
    { key: "fg-stock", label: "FG Stock Report" },
    { key: "sub-stock", label: "Sub-Store Report" },
    { key: "refresh-stock", label: "Refresh Stock Journal" },
  ]},
];

const ROLE_COLS = [
  { role: "company_admin", label: "Company Admin" },
  { role: "accountant", label: "Accountant" },
  { role: "viewer", label: "Viewer" },
];

export default function AccessControlPage({ session, companyId, companies }) {
  const isSuperAdmin = !!session?.user?.is_super_admin;
  const myRoleForCompany = session?.companies?.find(c => c.id === companyId)?.role;
  const canManage = isSuperAdmin || myRoleForCompany === "company_admin";

  const [matrix, setMatrix] = useState(null); // {accountant: {...}, viewer: {...}}
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const fetchMatrix = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/permissions?company_id=${companyId}`);
      const data = await res.json();
      setMatrix(data.matrix || { accountant: {}, viewer: {} });
    } catch {
      setError("Could not load permissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (canManage) fetchMatrix(); /* eslint-disable-next-line */ }, [companyId, canManage]);

  const toggle = (role, key) => {
    setMatrix(m => ({
      ...m,
      [role]: { ...m[role], [key]: !m[role]?.[key] },
    }));
  };

  const save = async () => {
    setSaving(true); setMsg(""); setError("");
    try {
      const res = await fetch(`${BACKEND}/api/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          requesting_user_id: session.user.id,
          matrix,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) setError(data.error || "Save failed.");
      else setMsg("Access settings saved.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div style={{ padding: "28px 32px", maxWidth: 1180, margin: "0 auto" }}>
        <div className="sans" style={{ fontSize: 12, color: TEXT_DIM }}>
          Only Company Admins and the Super Admin can configure module access.
        </div>
      </div>
    );
  }

  const companyName = companies?.find(c => c.id === companyId)?.name || "this company";

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: NAVY }}>Access Control</div>
          <div className="sans" style={{ fontSize: 12, color: TEXT_DIM, marginTop: 2 }}>
            Tick the modules each role can access in {companyName}. Company Admin always has full access.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {msg && <span className="sans" style={{ fontSize: 12, color: GREEN, fontWeight: 600 }}>{msg}</span>}
          {error && <span className="sans" style={{ fontSize: 12, color: ERROR, fontWeight: 600 }}>{error}</span>}
          <button onClick={save} disabled={saving || loading} className="sans" style={{
            background: NAVY, color: "#F0D78C", border: "none", padding: "10px 24px",
            fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer",
          }}>
            {saving ? "SAVING…" : "SAVE ACCESS"}
          </button>
        </div>
      </div>

      {loading || !matrix ? (
        <div className="sans" style={{ padding: 40, textAlign: "center", color: TEXT_DIM }}>Loading…</div>
      ) : (
        <div style={{ border: `1px solid ${NAVY}`, background: "#FFFFFF" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr className="sans" style={{ background: NAVY }}>
                <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, fontWeight: 600 }}>MODULE</th>
                {ROLE_COLS.map(c => (
                  <th key={c.role} style={{ textAlign: "center", padding: "10px 16px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, fontWeight: 600 }}>{c.label.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map(group => (
                <>
                  <tr key={group.label} style={{ background: "#F2EEE2" }}>
                    <td colSpan={1 + ROLE_COLS.length} className="sans" style={{ padding: "6px 16px", fontSize: 11, letterSpacing: "0.1em", fontWeight: 700, color: "#5C5648" }}>
                      {group.label.toUpperCase()}
                    </td>
                  </tr>
                  {group.modules.map(m => (
                    <tr key={m.key} style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <td style={{ padding: "9px 16px", fontSize: 13 }}>{m.label}</td>
                      {ROLE_COLS.map(c => (
                        <td key={c.role} style={{ padding: "9px 16px", textAlign: "center" }}>
                          {c.role === "company_admin" ? (
                            <span style={{ color: GREEN, fontWeight: 700, fontSize: 13 }}>✓</span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={!!matrix[c.role]?.[m.key]}
                              onChange={() => toggle(c.role, m.key)}
                              style={{ width: 16, height: 16, cursor: "pointer" }}
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
