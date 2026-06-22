import { useState, useEffect } from "react";

// UsersPage.js — User & Access Management
// - Lists users with access to the current company (or all users, if Super Admin)
// - Lets a Company Admin / Super Admin invite a new user with a role for this company
// - Lets a Super Admin grant/revoke access to other companies and toggle is_active
// - "Change Password" panel for the currently logged-in user

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";

const NAVY      = "#1B3A5C";
const GOLD      = "#B8860B";
const BORDER    = "#D6D0C2";
const TEXT_DIM  = "#6B645A";
const ERROR     = "#A8453B";
const GREEN     = "#2E7D4F";
const CREAM     = "#F7F4ED";

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

export default function UsersPage({ session, companyId, companies }) {
  const isSuperAdmin = !!session?.user?.is_super_admin;
  const myRoleForCompany = session?.companies?.find(c => c.id === companyId)?.role;
  const canManageUsers = isSuperAdmin || myRoleForCompany === "company_admin";

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // New user form
  const [newUser, setNewUser] = useState({ username: "", full_name: "", password: "", role: "accountant" });
  const [creating, setCreating] = useState(false);

  // Change password form
  const [pw, setPw] = useState({ old_password: "", new_password: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState("");

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/users?company_id=${companyId}`);
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      setError("Could not load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (canManageUsers) fetchUsers(); /* eslint-disable-next-line */ }, [companyId, isSuperAdmin, canManageUsers]);

  const roleFor = (u) => u.access?.find(a => a.company_id === companyId)?.role || "—";

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
    setCreating(true);
    try {
      const res = await fetch(`${BACKEND}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUser.username.trim(),
          password: newUser.password,
          full_name: newUser.full_name.trim(),
          access: [{ company_id: companyId, role: newUser.role }],
          requesting_user_id: session.user.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Could not create user.");
      } else {
        setMsg(`User '${newUser.username}' created.`);
        setNewUser({ username: "", full_name: "", password: "", role: "accountant" });
        fetchUsers();
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setCreating(false);
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
      else fetchUsers();
    } catch {
      setError("Could not reach the server.");
    }
  };

  const changeRole = async (u, role) => {
    setError(""); setMsg("");
    const newAccess = (u.access || []).filter(a => a.company_id !== companyId);
    newAccess.push({ company_id: companyId, role });
    try {
      const res = await fetch(`${BACKEND}/api/users/${u.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access: newAccess, requesting_user_id: session.user.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) setError(data.error || "Update failed.");
      else fetchUsers();
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

  const companyName = companies?.find(c => c.id === companyId)?.name || "this company";

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1180, margin: "0 auto" }}>

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

      {/* Invite User */}
      {canManageUsers && (
      <div style={{ border: `1px solid ${NAVY}`, background: "#FFFFFF", padding: 20, marginBottom: 28, maxWidth: 600 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Add User</div>
        <div className="sans" style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 14 }}>
          Grants access to {companyName}.
        </div>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label className="sans" style={labelStyle}>TEMPORARY PASSWORD</label>
              <input type="password" value={newUser.password}
                onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
                style={fieldStyle()} />
            </div>
            <div>
              <label className="sans" style={labelStyle}>ROLE</label>
              <select value={newUser.role}
                onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}
                style={fieldStyle()}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          {error && <div className="sans" style={{ color: ERROR, fontSize: 12, marginBottom: 10 }}>{error}</div>}
          {msg && <div className="sans" style={{ color: GREEN, fontSize: 12, marginBottom: 10 }}>{msg}</div>}
          <button type="submit" disabled={creating} className="sans" style={{
            background: NAVY, color: "#F0D78C", border: "none", padding: "10px 20px",
            fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer",
          }}>
            {creating ? "CREATING…" : "+ ADD USER"}
          </button>
        </form>
      </div>
      )}

      {/* User List */}
      {canManageUsers ? (
      <div style={{ border: `1px solid ${NAVY}`, background: "#FFFFFF" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${BORDER}`, fontSize: 16, fontWeight: 700, color: NAVY }}>
          {`Users — ${companyName}`}
        </div>
        {loading ? (
          <div className="sans" style={{ padding: 40, textAlign: "center", color: TEXT_DIM }}>Loading…</div>
        ) : users.length === 0 ? (
          <div className="sans" style={{ padding: 40, textAlign: "center", color: TEXT_DIM }}>No users found.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr className="sans" style={{ background: NAVY }}>
                <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, fontWeight: 600 }}>USERNAME</th>
                <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, fontWeight: 600 }}>FULL NAME</th>
                <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, fontWeight: 600 }}>ROLE {isSuperAdmin ? "" : `(${companyName})`}</th>
                <th style={{ textAlign: "center", padding: "10px 16px", fontSize: 10, letterSpacing: "0.12em", color: CREAM, fontWeight: 600 }}>ACTIVE</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td className="mono" style={{ padding: "10px 16px", fontSize: 13 }}>
                    {u.username}{u.is_super_admin && <span className="sans" style={{ marginLeft: 8, fontSize: 10, color: GOLD, fontWeight: 700, letterSpacing: "0.1em" }}>SUPER ADMIN</span>}
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 13 }}>{u.full_name || "—"}</td>
                  <td style={{ padding: "10px 16px", fontSize: 12 }}>
                    {u.is_super_admin ? (
                      <span className="sans" style={{ color: TEXT_DIM }}>all companies</span>
                    ) : (
                      <select className="sans" value={roleFor(u)} onChange={e => changeRole(u, e.target.value)}
                        style={{ padding: "5px 8px", border: `1px solid ${BORDER}`, fontSize: 12 }}>
                        <option value="—" disabled>—</option>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )}
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "center" }}>
                    <button onClick={() => toggleActive(u)} className="sans" style={{
                      border: "none", background: "none", cursor: u.is_super_admin ? "not-allowed" : "pointer",
                      color: u.is_active ? GREEN : ERROR, fontWeight: 700, fontSize: 11, letterSpacing: "0.08em",
                    }} disabled={u.is_super_admin}>
                      {u.is_active ? "ACTIVE" : "DISABLED"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      ) : (
        <div className="sans" style={{ fontSize: 12, color: TEXT_DIM, padding: "12px 0" }}>
          Only Company Admins and the Super Admin can view and manage other users.
        </div>
      )}
    </div>
  );
}
