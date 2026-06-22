import { useState, useEffect, useCallback } from "react";

// GLMasterPage.js — ARITHMA General Ledger Master (Chart of Accounts)
// Extracted from App.js so GL changes never require touching the app shell.
// Props: session, companyId, companies, homeSettings

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";

const MAIN_GROUPS = ["Assets", "Liabilities", "Equity", "Income", "Expense"];

const GROUP_META = {
  Assets:      { color: "#2A6F77" },
  Liabilities: { color: "#A8453B" },
  Equity:      { color: "#8A6D3B" },
  Income:      { color: "#3D7A4F" },
  Expense:     { color: "#6B5B95" },
};

function classifyByCode(gl_code) {
  const first = String(gl_code || "").trim().charAt(0);
  switch (first) {
    case "1": case "2": return "Assets";
    case "3": return "Equity";
    case "4": case "5": return "Liabilities";
    case "6": return "Income";
    case "7": case "8": case "9": return "Expense";
    default: return "Other";
  }
}

function fmt(n) {
  return (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


export default function GLMasterPage({ session, companyId, companies, homeSettings, onGLCreate, onEditGL, onGoToBankCash }) {
  const isSuperAdmin = !!session?.user?.is_super_admin;
  const [accounts, setAccounts]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [online, setOnline]         = useState(false);
  const [filterGroup, setFilterGroup] = useState("All");
  const [search, setSearch]         = useState("");

  const companyName = homeSettings?.company_name
    || companies?.find(c => c.id === companyId)?.name
    || "";

  const fetchAccounts = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await fetch(`${BACKEND}/api/gl-accounts?company_id=${companyId}`);
      const data = await res.json();
      setAccounts(data.gl_accounts || []);
      setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setLoading(true);
    fetchAccounts();
  }, [fetchAccounts]);

  // ── Derived ─────────────────────────────────────────────────
  const filtered = accounts.filter(a => {
    const matchGroup = filterGroup === "All" || classifyByCode(a.gl_code) === filterGroup;
    const q = search.toLowerCase();
    return matchGroup && (!q || a.gl_name.toLowerCase().includes(q) || a.gl_code.includes(q));
  });

  const totalDr = accounts.reduce((s, a) => s + Number(a.opening_dr || 0), 0);
  const totalCr = accounts.reduce((s, a) => s + Number(a.opening_cr || 0), 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.01;

  const byGroup = MAIN_GROUPS.map(g => ({
    name: g,
    count: accounts.filter(a => classifyByCode(a.gl_code) === g).length,
    dr: accounts.filter(a => classifyByCode(a.gl_code) === g).reduce((s, a) => s + Number(a.opening_dr || 0), 0),
    cr: accounts.filter(a => classifyByCode(a.gl_code) === g).reduce((s, a) => s + Number(a.opening_cr || 0), 0),
  }));

  // ── Export helpers ───────────────────────────────────────────
  const exportCSV = () => {
    const headers = ["GL Code", "Account Name", "Main Group", "Sub Group", "Type", "Opening Dr", "Opening Cr"];
    const rows = filtered.map(a => [
      a.gl_code, a.gl_name, a.main_group || "", a.sub_group || "",
      a.account_type,
      Number(a.opening_dr || 0).toFixed(2),
      Number(a.opening_cr || 0).toFixed(2),
    ]);
    const escape = v => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map(r => r.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${companyName}_GL_Master.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const styles = `
      body{font-family:Arial,sans-serif;font-size:9px;margin:10px}
      h2{font-size:12px;margin-bottom:2px}
      p{font-size:8px;color:#666;margin:0 0 8px}
      table{border-collapse:collapse;width:100%}
      th{background:#1B3A5C;color:#fff;padding:5px 8px;font-size:8px;text-align:left}
      td{padding:4px 8px;border-bottom:1px solid #ddd;font-size:8px}
      tr:nth-child(even) td{background:#f7f4ed}
      .num{text-align:right}.dim{color:#999}.bold{font-weight:700}
    `;
    const fmtN = n => Number(n || 0) > 0
      ? `<span class="num">${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>`
      : '<span class="dim">—</span>';
    const thead = `<tr>
      <th>CODE</th><th>ACCOUNT NAME</th><th>GROUP / SUB-GROUP</th>
      <th>TYPE</th><th class="num">OPENING DR</th><th class="num">OPENING CR</th>
    </tr>`;
    const tbody = filtered.map(a =>
      `<tr>
        <td class="dim">${a.gl_code}</td>
        <td class="bold">${a.gl_name}</td>
        <td>${a.main_group || ""}${a.sub_group ? " · " + a.sub_group : ""}</td>
        <td>${a.account_type}</td>
        <td class="num">${fmtN(a.opening_dr)}</td>
        <td class="num">${fmtN(a.opening_cr)}</td>
      </tr>`
    ).join("");
    const html = `<!DOCTYPE html><html><head><style>${styles}</style></head><body>
      <h2>ARITHMA — General Ledger Master</h2>
      <p>${companyName} &nbsp;|&nbsp; FY ${session.fiscalYear} &nbsp;|&nbsp;
         ${filtered.length} accounts &nbsp;|&nbsp; Filter: ${filterGroup}</p>
      <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
    </body></html>`;
    const win = window.open("", "_blank");
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Source Serif Pro', Georgia, serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+Pro:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .sans { font-family: 'Inter', sans-serif; }
        table.ledger { border-collapse: collapse; width: 100%; }
        table.ledger th, table.ledger td { border-bottom: 1px solid #E2DDD0; }
        table.ledger tbody tr:hover { background: #FBF8F0; }
        input, select { font-family: 'Inter', sans-serif; }
        input:focus, select:focus { outline: 2px solid #8A6D3B; outline-offset: 1px; }
        button:focus-visible { outline: 2px solid #8A6D3B; outline-offset: 2px; }
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

      <div style={{ padding: "28px 32px", maxWidth: 1180, margin: "0 auto" }}>

        {/* Trial Balance Summary Strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr) auto", gap: 0, marginBottom: 28, border: "1px solid #2B2B28" }}>
          {byGroup.map(g => (
            <div key={g.name} style={{ padding: "16px 18px", borderRight: "1px solid #2B2B28", background: "#FFFFFF" }}>
              <div className="sans" style={{ fontSize: 10, letterSpacing: "0.18em", color: GROUP_META[g.name].color, fontWeight: 700, marginBottom: 8 }}>
                {g.name.toUpperCase()}
              </div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{g.count}</div>
              <div className="sans" style={{ fontSize: 10, color: "#9A9285" }}>accounts</div>
            </div>
          ))}
          <div style={{ padding: "16px 18px", background: balanced ? "#EFF5EF" : "#FBEAE8", minWidth: 180 }}>
            <div className="sans" style={{ fontSize: 10, letterSpacing: "0.18em", color: balanced ? "#3D7A4F" : "#A8453B", fontWeight: 700, marginBottom: 8 }}>
              {balanced ? "BOOKS BALANCED" : "OUT OF BALANCE"}
            </div>
            <div className="mono" style={{ fontSize: 13 }}>
              <div>Dr {fmt(totalDr)}</div>
              <div>Cr {fmt(totalCr)}</div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div className="sans" style={{ display: "flex", gap: 4, border: "1px solid #2B2B28" }}>
            {["All", ...MAIN_GROUPS].map(g => (
              <button key={g} onClick={() => setFilterGroup(g)} style={{
                background: filterGroup === g ? "#2B2B28" : "transparent",
                color: filterGroup === g ? "#F7F4ED" : "#2B2B28",
                border: "none", padding: "8px 14px", fontSize: 12, cursor: "pointer",
                borderRight: g !== "Expense" ? "1px solid #2B2B28" : "none", fontWeight: 500,
              }}>{g}</button>
            ))}
          </div>
          <input
            placeholder="Search by GL code or name..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: "9px 14px", border: "1px solid #2B2B28", background: "#FFFFFF", fontSize: 13, color: "#2B2B28" }}
          />
          {onGLCreate && (
            <button onClick={onGLCreate} className="sans" style={{
              background: "#2B2B28", color: "#F7F4ED", border: "none",
              padding: "9px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em",
            }}>+ GL Creation Form</button>
          )}
          <button onClick={exportCSV} className="sans" title="Export to CSV" style={{
            background: "transparent", color: "#2B2B28", border: "1px solid #D6D0C2",
            padding: "9px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", letterSpacing: "0.06em",
          }}>⬇ CSV</button>
          <button onClick={exportPDF} className="sans" title="Export to PDF" style={{
            background: "transparent", color: "#2B2B28", border: "1px solid #D6D0C2",
            padding: "9px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", letterSpacing: "0.06em",
          }}>⬇ PDF</button>
          <button onClick={exportPDF} className="sans" title="Print" style={{
            background: "transparent", color: "#2B2B28", border: "1px solid #D6D0C2",
            padding: "9px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", letterSpacing: "0.06em",
          }}>🖨 Print</button>
          {onGoToBankCash && (
            <button onClick={onGoToBankCash} className="sans" title="Bank & Cash Ledger" style={{
              background: "transparent", color: "#2B2B28", border: "1px solid #D6D0C2",
              padding: "9px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", letterSpacing: "0.06em",
            }}>🏦 Bank &amp; Cash</button>
          )}

        </div>

        {/* Ledger Table */}
        <div style={{ border: "1px solid #2B2B28", background: "#FFFFFF" }}>
          {loading ? (
            <div className="sans" style={{ padding: 60, textAlign: "center", color: "#9A9285" }}>Loading ledger…</div>
          ) : !online ? (
            <div style={{ padding: 40, textAlign: "center" }}>
              <div className="sans" style={{ fontSize: 13, color: "#A8453B", marginBottom: 8, fontWeight: 600 }}>Backend not reachable</div>
              <div className="sans" style={{ fontSize: 12, color: "#9A9285" }}>
                Run <code className="mono" style={{ background: "#F2EEE2", padding: "2px 6px" }}>python app.py</code> then refresh.
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="sans" style={{ padding: 60, textAlign: "center", color: "#9A9285" }}>No accounts match.</div>
          ) : (
            <table className="ledger">
              <thead>
                <tr className="sans" style={{ background: "#2B2B28" }}>
                  <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 10, letterSpacing: "0.15em", color: "#F7F4ED", fontWeight: 600 }}>CODE</th>
                  <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 10, letterSpacing: "0.15em", color: "#F7F4ED", fontWeight: 600 }}>ACCOUNT NAME</th>
                  <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 10, letterSpacing: "0.15em", color: "#F7F4ED", fontWeight: 600 }}>GROUP / SUB-GROUP</th>
                  <th style={{ textAlign: "center", padding: "10px 16px", fontSize: 10, letterSpacing: "0.15em", color: "#F7F4ED", fontWeight: 600 }}>TYPE</th>
                  <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 10, letterSpacing: "0.15em", color: "#F7F4ED", fontWeight: 600 }}>OPENING DR</th>
                  <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 10, letterSpacing: "0.15em", color: "#F7F4ED", fontWeight: 600 }}>OPENING CR</th>
                  {isSuperAdmin && <th style={{ textAlign: "center", padding: "10px 16px", fontSize: 10, letterSpacing: "0.15em", color: "#F7F4ED", fontWeight: 600 }}>ACTION</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id}>
                    <td className="mono" style={{ padding: "11px 16px", fontSize: 13, color: "#6B645A" }}>{a.gl_code}</td>
                    <td style={{ padding: "11px 16px", fontSize: 14, fontWeight: 600 }}>{a.gl_name}</td>
                    <td className="sans" style={{ padding: "11px 16px", fontSize: 12 }}>
                      <span style={{ color: GROUP_META[a.main_group]?.color || "#2B2B28", fontWeight: 600 }}>{a.main_group}</span>
                      {a.sub_group && <span style={{ color: "#9A9285" }}> &middot; {a.sub_group}</span>}
                    </td>
                    <td className="sans" style={{ padding: "11px 16px", fontSize: 11, textAlign: "center" }}>
                      <span style={{ border: "1px solid #2B2B28", padding: "2px 8px", letterSpacing: "0.08em", fontWeight: 600 }}>
                        {a.account_type}
                      </span>
                    </td>
                    <td className="mono" style={{ padding: "11px 16px", fontSize: 13, textAlign: "right" }}>
                      {Number(a.opening_dr) > 0 ? fmt(a.opening_dr) : <span style={{ color: "#D8D2C3" }}>—</span>}
                    </td>
                    <td className="mono" style={{ padding: "11px 16px", fontSize: 13, textAlign: "right" }}>
                      {Number(a.opening_cr) > 0 ? fmt(a.opening_cr) : <span style={{ color: "#D8D2C3" }}>—</span>}
                    </td>
                    {isSuperAdmin && (
                      <td style={{ padding: "8px 16px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                          <button onClick={() => onEditGL && onEditGL(a, "edit")} className="sans" style={{
                            border: "1px solid #1B3A5C", background: "transparent", color: "#1B3A5C",
                            padding: "3px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600,
                          }}>Edit</button>
                          <button onClick={() => onEditGL && onEditGL(a, "delete")} className="sans" style={{
                            border: "1px solid #A8453B", background: "transparent", color: "#A8453B",
                            padding: "3px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600,
                          }}>Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid #2B2B28" }}>
                  <td colSpan={isSuperAdmin ? 4 : 4} className="sans" style={{ padding: "12px 16px", fontSize: 11, letterSpacing: "0.15em", fontWeight: 700, textAlign: "right" }}>
                    TOTAL ({filtered.length} {filtered.length === 1 ? "account" : "accounts"})
                  </td>
                  <td className="mono" style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, textAlign: "right" }}>
                    {fmt(filtered.reduce((s, a) => s + Number(a.opening_dr || 0), 0))}
                  </td>
                  <td className="mono" style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, textAlign: "right" }}>
                    {fmt(filtered.reduce((s, a) => s + Number(a.opening_cr || 0), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="sans" style={{ marginTop: 16, fontSize: 11, color: "#9A9285", textAlign: "center" }}>
          ARITHMA General Ledger Master &middot; {companyName} &middot; {accounts.length} accounts total
        </div>
      </div>
    </div>
  );
}
