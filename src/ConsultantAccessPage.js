import { useState, useEffect } from "react";

// ConsultantAccessPage.js — Super Admin only.
// Manages "consultant" user_type accounts (software-provider side:
// Super Admin / Support staff) and, separately from tenant Users &
// Access, lets the Super Admin grant each consultant a ROLE PER
// COMPANY (company_admin / accountant / viewer) — independent of
// each company's own tenant users.

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";

const NAVY     = "#1B3A5C";
const GOLD     = "#B8860B";
const BORDER   = "#D6D0C2";
const TEXT_DIM = "#6B645A";
const ERROR    = "#A8453B";
const GREEN    = "#2E7D4F";
const CREAM    = "#F7F4ED";

const ROLES = ["company_admin", "accountant", "viewer"];

function fieldStyle() {
  return {
    width: "100%", padding: "9px 10px", border: `1px solid ${NAVY}`,
    background: "#FFFFFF", fontSize: 13, boxSizing: "border-box",
  };
}
const labelStyle = {
  fontSize: 10, letterSpacing: "0.12em", color: TEXT_DIM,
  fontWeight: 700, display: "block", marginBottom: 4,
};

export default function ConsultantAccessPage({ session }) {
  const isSuperAdmin = !!session?.user?.is_super_admin;

  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [newUser, setNewUser] = useState({ username: "", full_name: "", password: "", is_super_admin: false, access: {} });
  // access: { [company_id]: role_string_or_"" }
  const [creating, setCreating] = useState(false);

  const [pw, setPw] = useState({ old_password: "", new_password: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/consultant-users?requesting_user_id=${session.user.id}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setUsers(data.users || []);
        setCompanies(data.companies || []);
      }
    } catch {
      setError("Could not load consultant access.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isSuperAdmin) fetchData(); /* eslint-disable-next-line */ }, [isSuperAdmin]);

  const roleFor = (u, companyId) => u.access?.find(a => a.company_id === companyId)?.role || "none";

  const setRole = async (u, companyId, role) => {
    setError(""); setMsg("");
    let newAccess = (u.access || []).filter(a => a.company_id !== companyId);
    if (role !== "none") newAccess.push({ company_id: companyId, role });
    try {
      const res = await fetch(`${BACKEND}/api/users/${u.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access: newAccess, requesting_user_id: session.user.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) setError(data.error || "Update failed.");
      else fetchData();
    } catch {
      setError("Could not reach the server.");
    }
  };

  const toggleActive = async (u) => {
    setError(""); setMsg("");
    try {
      const res = await fetch(`${BACKEND}/api/users/${u.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !u.is_active, requesting_user_id: session.user.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) setError(data.error || "Update failed.");
      else fetchData();
    } catch {
      setError("Could not reach the server.");
    }
  };


  const submitPasswordChange = async (e) => {
    e.preventDefault();
    setPwError(""); setPwMsg("");
    if (!pw.old_password || !pw.new_password) {
      setPwError("Please fill in both fields.");
      return;
    }
    if (pw.new_password.length < 6) {
      setPwError("New password must be at least 6 characters.");
      return;
    }
    if (pw.new_password !== pw.confirm) {
      setPwError("New password and confirmation do not match.");
      return;
    }
    setPwSaving(true);
    try {
      const res = await fetch(`${BACKEND}/api/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: session.user.id,
          old_password: pw.old_password,
          new_password: pw.new_password,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) setPwError(data.error || "Could not change password.");
      else {
        setPwMsg("Password updated.");
        setPw({ old_password: "", new_password: "", confirm: "" });
      }
    } catch {
      setPwError("Could not reach the server.");
    } finally {
      setPwSaving(false);
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    setError(""); setMsg("");
    if (!newUser.username.trim() || !newUser.password) {
      setError("Username and password are required.");
      return;
    }
    if (newUser.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (!companies.length) {
      setError("No companies exist yet — create a company before adding consultants.");
      return;
    }
    if (!newUser.is_super_admin) {
      const access = Object.entries(newUser.access).filter(([, role]) => role);
      if (access.length === 0) {
        setError("Select at least one company and role for this consultant.");
        return;
      }
    }
    setCreating(true);
    try {
      const access = newUser.is_super_admin
        ? [{ company_id: companies[0].id, role: "company_admin" }] // placeholder; super admin gets all access anyway
        : Object.entries(newUser.access)
            .filter(([, role]) => role)
            .map(([company_id, role]) => ({ company_id: Number(company_id), role }));

      const res = await fetch(`${BACKEND}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUser.username.trim(),
          password: newUser.password,
          full_name: newUser.full_name.trim(),
          user_type: "consultant",
          is_super_admin: newUser.is_super_admin,
          requesting_user_id: session.user.id,
          access,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Could not create user.");
      } else {
        setMsg(`Consultant '${newUser.username}' created.`);
        setNewUser({ username: "", full_name: "", password: "", is_super_admin: false, access: {} });
        fetchData();
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setCreating(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: "28px 32px", maxWidth: 1180, margin: "0 auto" }}>
        <div className="sans" style={{ fontSize: 12, color: TEXT_DIM }}>
          Only the Super Admin can manage consultant access.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Consultant Access</div>
      <div className="sans" style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 20 }}>
        Consultants (Super Admin / Support) sign in via the left-hand panel and can be granted a
        different role per company — independent of each company's own Users &amp; Access.
      </div>

      {/* Change Password */}
      <div style={{ border: `1px solid ${NAVY}`, background: "#FFFFFF", padding: 20, marginBottom: 28, maxWidth: 460 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 14 }}>Change Your Password</div>
        <form onSubmit={submitPasswordChange}>
          <div style={{ marginBottom: 10 }}>
            <label className="sans" style={labelStyle}>CURRENT PASSWORD</label>
            <input type="password" value={pw.old_password}
              onChange={e => setPw(p => ({ ...p, old_password: e.target.value }))}
              style={fieldStyle()} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label className="sans" style={labelStyle}>NEW PASSWORD</label>
            <input type="password" value={pw.new_password}
              onChange={e => setPw(p => ({ ...p, new_password: e.target.value }))}
              style={fieldStyle()} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label className="sans" style={labelStyle}>CONFIRM NEW PASSWORD</label>
            <input type="password" value={pw.confirm}
              onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
              style={fieldStyle()} />
          </div>
          {pwError && <div className="sans" style={{ color: ERROR, fontSize: 12, marginBottom: 10 }}>{pwError}</div>}
          {pwMsg && <div className="sans" style={{ color: GREEN, fontSize: 12, marginBottom: 10 }}>{pwMsg}</div>}
          <button type="submit" disabled={pwSaving} className="sans" style={{
            background: NAVY, color: "#F0D78C", border: "none", padding: "10px 20px",
            fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer",
          }}>
            {pwSaving ? "SAVING…" : "UPDATE PASSWORD"}
          </button>
        </form>
      </div>

      {/* Add Consultant */}
      <div style={{ border: `1px solid ${NAVY}`, background: "#FFFFFF", padding: 20, marginBottom: 28, maxWidth: 600 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 14 }}>Add Consultant User</div>
        <form onSubmit={createUser}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
            <div>
              <label className="sans" style={labelStyle}>USERNAME</label>
              <input value={newUser.username}
                onChange={e => setNewUser(u => ({ ...u, username: e.target.value }))}
                style={fieldStyle()} />
            </div>
            <div>
              <label className="sans" style={labelStyle}>FULL NAME</label>
              <input value={newUser.full_name}
                onChange={e => setNewUser(u => ({ ...u, full_name: e.target.value }))}
                style={fieldStyle()} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label className="sans" style={labelStyle}>TEMPORARY PASSWORD</label>
            <input type="password" value={newUser.password}
              onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
              style={fieldStyle()} />
          </div>

          <label className="sans" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <input type="checkbox" checked={newUser.is_super_admin}
              onChange={e => setNewUser(u => ({ ...u, is_super_admin: e.target.checked }))} />
            Grant Super Admin (full access to every company — overrides the list below)
          </label>

          {!newUser.is_super_admin && (
            <div style={{ marginBottom: 14, border: `1px solid ${BORDER}`, padding: 10 }}>
              <label className="sans" style={labelStyle}>COMPANIES &amp; ROLE</label>
              {companies.length === 0 ? (
                <div className="sans" style={{ fontSize: 12, color: TEXT_DIM }}>No companies exist yet.</div>
              ) : companies.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                  <input
                    type="checkbox"
                    checked={!!newUser.access[c.id]}
                    onChange={e => setNewUser(u => ({
                      ...u,
                      access: { ...u.access, [c.id]: e.target.checked ? "viewer" : "" },
                    }))}
                  />
                  <span className="sans" style={{ fontSize: 13, flex: 1 }}>{c.name}</span>
                  <select
                    className="sans"
                    disabled={!newUser.access[c.id]}
                    value={newUser.access[c.id] || "viewer"}
                    onChange={e => setNewUser(u => ({ ...u, access: { ...u.access, [c.id]: e.target.value } }))}
                    style={{ padding: "4px 6px", border: `1px solid ${BORDER}`, fontSize: 12 }}
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
          {error && <div className="sans" style={{ color: ERROR, fontSize: 12, marginBottom: 10 }}>{error}</div>}
          {msg && <div className="sans" style={{ color: GREEN, fontSize: 12, marginBottom: 10 }}>{msg}</div>}
          <button type="submit" disabled={creating} className="sans" style={{
            background: NAVY, color: "#F0D78C", border: "none", padding: "10px 20px",
            fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer",
          }}>
            {creating ? "CREATING…" : "+ ADD CONSULTANT"}
          </button>
        </form>
      </div>

      {/* Matrix */}
      <div style={{ border: `1px solid ${NAVY}`, background: "#FFFFFF" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${BORDER}`, fontSize: 16, fontWeight: 700, color: NAVY }}>
          Consultant Users &times; Company Role
        </div>
        {loading ? (
          <div className="sans" style={{ padding: 40, textAlign: "center", color: TEXT_DIM }}>Loading…</div>
        ) : users.length === 0 ? (
          <div className="sans" style={{ padding: 40, textAlign: "center", color: TEXT_DIM }}>No consultant users yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr className="sans" style={{ background: NAVY }}>
                <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, fontWeight: 600 }}>USERNAME</th>
                <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, fontWeight: 600 }}>FULL NAME</th>
                {companies.map(c => (
                  <th key={c.id} style={{ textAlign: "center", padding: "10px 12px", fontSize: 10, letterSpacing: "0.08em", color: CREAM, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {c.name}
                  </th>
                ))}
                <th style={{ textAlign: "center", padding: "10px 16px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, fontWeight: 600 }}>ACTIVE</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td className="mono" style={{ padding: "10px 16px", fontSize: 13 }}>
                    {u.username}
                    {u.is_super_admin && <span className="sans" style={{ marginLeft: 8, fontSize: 10, color: GOLD, fontWeight: 700, letterSpacing: "0.1em" }}>SUPER ADMIN</span>}
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 13 }}>{u.full_name || "—"}</td>
                  {companies.map(c => (
                    <td key={c.id} style={{ padding: "8px 10px", textAlign: "center" }}>
                      {u.is_super_admin ? (
                        <span className="sans" style={{ fontSize: 11, color: TEXT_DIM }}>all</span>
                      ) : (
                        <select className="sans" value={roleFor(u, c.id)} onChange={e => setRole(u, c.id, e.target.value)}
                          style={{ padding: "5px 6px", border: `1px solid ${BORDER}`, fontSize: 11 }}>
                          <option value="none">—</option>
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      )}
                    </td>
                  ))}
                  <td style={{ padding: "10px 16px", textAlign: "center" }}>
                    <button onClick={() => toggleActive(u)} className="sans" style={{
                      border: "none", background: "none", cursor: u.id === session.user.id ? "not-allowed" : "pointer",
                      color: u.is_active ? GREEN : ERROR, fontWeight: 700, fontSize: 11, letterSpacing: "0.08em",
                    }} disabled={u.id === session.user.id}>
                      {u.is_active ? "ACTIVE" : "DISABLED"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
