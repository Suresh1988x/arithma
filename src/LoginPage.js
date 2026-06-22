import { useState, useEffect } from "react";

// LoginPage.js — ARITHMA Login
// Two side-by-side sign-in panels:
//   LEFT  = Consultant Sign-In (software-provider side: Super Admin /
//           Support staff — user_type "consultant")
//   RIGHT = Company Sign-In (client/tenant side: Company Admin /
//           Accountant / Viewer — user_type "tenant")
//
// Calls POST /api/login {username, password, portal}. On success, shows
// the list of companies the user has access to (returned by the backend)
// and lets the user pick a company + fiscal year before continuing.
// Only after both are selected does onLogin(...) fire, which the
// parent (App.js) uses to unlock the rest of the app.

const CREAM     = "#F7F4ED";
const NAVY      = "#1B3A5C";
const NAVY_DEEP = "#10243B";
const SKY       = "#2E6E9E";
const GOLD      = "#B8860B";
const GOLD_SOFT = "#F0D78C";
const BORDER    = "#D6D0C2";
const TEXT_DIM  = "#6B645A";
const ERROR     = "#A8453B";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";

const PANELS = {
  consultant: {
    title: "Consultant Sign-In",
    subtitle: "Software provider · Super Admin & Support",
    accent: GOLD,
  },
  tenant: {
    title: "Company Sign-In",
    subtitle: "Admin · Accountant · Viewer",
    accent: SKY,
  },
};

function CredentialsPanel({ portal, selected, onSelect, onSuccess, onTenantLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [fiscalYear, setFiscalYear] = useState("2082-83");
  const meta = PANELS[portal];

  useEffect(() => {
    if (portal !== "tenant") return;
    fetch(`${BACKEND}/api/companies`)
      .then(res => res.json())
      .then(data => {
        const list = data.companies || [];
        setCompanies(list);
        if (list.length > 0) setCompanyId(String(list[0].id));
      })
      .catch(() => {});
  }, [portal]);

  const submit = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setError("");
    if (!username.trim() || !password) {
      setError("Please enter both username and password.");
      return;
    }
    if (portal === "tenant" && (!companyId || !fiscalYear.trim())) {
      setError("Please select a company and fiscal year.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, portal }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Login failed. Please try again.");
        setLoading(false);
        return;
      }
      if (!data.companies || data.companies.length === 0) {
        setError("This user has no company access. Contact your administrator.");
        setLoading(false);
        return;
      }
      if (portal === "tenant") {
        const company = data.companies.find(c => String(c.id) === String(companyId));
        if (!company) {
          setError("You do not have access to the selected company.");
          setLoading(false);
          return;
        }
        onTenantLogin(data.user, data.companies, company, fiscalYear.trim());
        return;
      }
      onSuccess(data.user, data.companies);
    } catch {
      setError("Could not reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const fieldStyle = {
    width: "100%", padding: "10px 12px", border: `1px solid ${NAVY}`,
    background: selected ? "#FFFFFF" : "#F0EDE4", color: "#2B2B28",
    fontSize: 13, boxSizing: "border-box",
  };
  const labelStyle = {
    fontSize: 11, letterSpacing: "0.1em", color: TEXT_DIM,
    fontWeight: 700, marginBottom: 6, display: "block",
  };

  return (
    <div style={{ flex: 1, padding: 28, minWidth: 0, opacity: selected ? 1 : 0.45, transition: "opacity 0.15s" }}>
      <label className="sans" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 4 }}>
        <input type="checkbox" checked={!!selected} onChange={() => onSelect(portal)} style={{ width: 16, height: 16, cursor: "pointer" }} />
        <span style={{ fontSize: 11, letterSpacing: "0.18em", color: meta.accent, fontWeight: 700 }}>
          {meta.title.toUpperCase()}
        </span>
      </label>
      <div className="sans" style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 18, marginLeft: 26 }}>
        {meta.subtitle}
      </div>

      <fieldset disabled={!selected} style={{ border: 0, padding: 0, margin: 0 }}>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 14 }}>
          <label className="sans" style={labelStyle}>USERNAME</label>
          <input
            type="text" value={username}
            onChange={e => setUsername(e.target.value)}
            style={fieldStyle} placeholder={portal === "consultant" ? "admin" : "username"}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label className="sans" style={labelStyle}>PASSWORD</label>
          <input
            type="password" value={password}
            onChange={e => setPassword(e.target.value)}
            style={fieldStyle} placeholder="••••••••"
          />
        </div>

        {portal === "tenant" && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label className="sans" style={labelStyle}>COMPANY</label>
              <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={fieldStyle}>
                {companies.length === 0
                  ? <option value="">Loading companies…</option>
                  : companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.pan_number ? ` · PAN ${c.pan_number}` : ""}</option>
                    ))
                }
              </select>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label className="sans" style={labelStyle}>FISCAL YEAR</label>
              <input
                type="text" value={fiscalYear}
                onChange={e => setFiscalYear(e.target.value)}
                style={fieldStyle} placeholder="e.g. 2082-83"
              />
            </div>
          </>
        )}

        {error && (
          <div className="sans" style={{ color: ERROR, fontSize: 12, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={loading || !selected} className="sans" style={{
          width: "100%", background: selected ? NAVY : "#BFB8A8", color: GOLD_SOFT, border: "none",
          padding: "12px", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
          cursor: selected ? "pointer" : "not-allowed",
        }}>
          {loading ? "SIGNING IN…" : "SIGN IN"}
        </button>
      </form>
      </fieldset>

      <div className="sans" style={{ fontSize: 10, color: TEXT_DIM, marginTop: 10, fontStyle: "italic" }}>
        Tick the box above to enable this panel. (OTP verification will be added here in a future update.)
      </div>
    </div>
  );
}

export default function LoginPage({ onLogin }) {
  const [step, setStep] = useState("credentials"); // "credentials" | "select"
  const [selectedPortal, setSelectedPortal] = useState(null); // null | "consultant" | "tenant"
  const [user, setUser] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [fiscalYear, setFiscalYear] = useState("");
  const [error, setError] = useState("");

  const [welcomeUser, setWelcomeUser] = useState(null);

  const handleTenantLogin = (user, comps, company, fiscalYear) => {
    setWelcomeUser(user);
    setTimeout(() => {
      onLogin({ user, company, companies: comps, fiscalYear });
    }, 600);
  };

  const handleSuccess = (u, comps) => {
    setUser(u);
    setCompanies(comps);
    setCompanyId(String(comps[0].id));
    setFiscalYear(comps[0].fiscal_year_bs || "");
    setStep("select");
  };

  const handleCompanyChange = (id) => {
    setCompanyId(id);
    const c = companies.find(c => String(c.id) === String(id));
    setFiscalYear(c?.fiscal_year_bs || "");
  };

  const enterApp = (e) => {
    e.preventDefault();
    if (!companyId || !fiscalYear) {
      setError("Please select a company and fiscal year.");
      return;
    }
    const company = companies.find(c => String(c.id) === String(companyId));
    onLogin({ user, company, companies, fiscalYear });
  };

  const fieldStyle = {
    width: "100%", padding: "10px 12px", border: `1px solid ${NAVY}`,
    background: "#FFFFFF", fontSize: 13, color: "#2B2B28",
    boxSizing: "border-box",
  };
  const labelStyle = {
    fontSize: 11, letterSpacing: "0.1em", color: TEXT_DIM,
    fontWeight: 700, marginBottom: 6, display: "block",
  };
  const buttonStyle = {
    width: "100%", background: NAVY, color: GOLD_SOFT, border: "none",
    padding: "12px", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
    cursor: "pointer",
  };

  return (
    <div style={{
      minHeight: "100vh", background: CREAM,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Source Serif Pro', Georgia, serif", padding: 20,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+Pro:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap');
        .sans { font-family: 'Inter', sans-serif; }
        input:focus, select:focus { outline: 2px solid ${GOLD}; outline-offset: 1px; }
        button:focus-visible { outline: 2px solid ${GOLD}; outline-offset: 2px; }
      `}</style>

      <div style={{ width: step === "credentials" ? 640 : 380, border: `1px solid ${NAVY}`, background: "#FFFFFF", position: "relative" }}>
        {welcomeUser && (
          <div style={{
            position: "absolute", inset: 0, background: "rgba(255,255,255,0.92)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700, color: NAVY, zIndex: 10,
          }}>
            Welcome, {welcomeUser.full_name || welcomeUser.username}…
          </div>
        )}
        {/* Banner */}
        <div style={{
          background: `linear-gradient(135deg, ${NAVY_DEEP} 0%, #1E3F61 55%, ${SKY} 100%)`,
          padding: "22px 28px",
          borderBottom: `3px solid ${GOLD}`,
        }}>
          <div className="sans" style={{ fontSize: 15, fontWeight: 700, color: GOLD_SOFT, letterSpacing: "0.08em" }}>
            ARITHMA
          </div>
          <div className="sans" style={{ fontSize: 11, color: "#C8D4DE", letterSpacing: "0.1em", marginTop: 4 }}>
            VAT &amp; INVENTORY MANAGEMENT
          </div>
        </div>

        {step === "credentials" ? (
          <div style={{ display: "flex" }}>
            <CredentialsPanel portal="consultant" selected={selectedPortal === "consultant"}
              onSelect={(p) => setSelectedPortal(s => s === p ? null : p)} onSuccess={handleSuccess} />
            <div style={{ width: 1, background: BORDER }} />
            <CredentialsPanel portal="tenant" selected={selectedPortal === "tenant"}
              onSelect={(p) => setSelectedPortal(s => s === p ? null : p)} onSuccess={handleSuccess}
              onTenantLogin={handleTenantLogin} />
          </div>
        ) : (
          <div style={{ padding: 28 }}>
            <form onSubmit={enterApp}>
              <div style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 4 }}>
                Welcome, {user?.full_name || user?.username}
              </div>
              <div className="sans" style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 18 }}>
                Select a company and fiscal year to continue.
              </div>

              <div style={{ marginBottom: 14 }}>
                <label className="sans" style={labelStyle}>COMPANY</label>
                <select
                  value={companyId}
                  onChange={e => handleCompanyChange(e.target.value)}
                  style={fieldStyle}
                >
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.pan_number ? ` · PAN ${c.pan_number}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label className="sans" style={labelStyle}>FISCAL YEAR</label>
                <input
                  type="text" value={fiscalYear}
                  onChange={e => setFiscalYear(e.target.value)}
                  style={fieldStyle} placeholder="e.g. 2082-83"
                />
                <div className="sans" style={{ fontSize: 10, color: TEXT_DIM, marginTop: 4 }}>
                  Defaults to the company's current fiscal year (from Settings). Edit only if working in a different FY.
                </div>
              </div>

              {error && (
                <div className="sans" style={{ color: ERROR, fontSize: 12, marginBottom: 14 }}>
                  {error}
                </div>
              )}

              <button type="submit" className="sans" style={buttonStyle}>
                ENTER ARITHMA
              </button>

              <button
                type="button"
                onClick={() => { setStep("credentials"); setError(""); }}
                className="sans"
                style={{
                  width: "100%", background: "transparent", color: NAVY,
                  border: `1px solid ${BORDER}`, padding: "10px", fontSize: 11,
                  fontWeight: 600, letterSpacing: "0.1em", cursor: "pointer", marginTop: 8,
                }}
              >
                BACK
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
