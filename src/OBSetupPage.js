import { useState, useEffect, useCallback, Fragment } from "react";
import FARegisterPage from "./FARegisterPage";

// OBSetupPage.js — ARITHMA Opening Balance Setup
// Five tabs matching the Excel Inv_OB_Setup sheet:
//   GL OB    — BS GL accounts (editable + read-only managed accounts)
//   Inventory OB — RM/FG/Sub/BP qty × rate
//   Party OB — opening balance per party (Dr/Cr based on type)
//   Bank OB  — opening balance per bank/cash GL
//   FA OB    — Fixed Asset Register (future)
//
// "Pull from Previous FY" button pulls closing balances as opening.
// Balance check (Dr - Cr = 0) must pass before posting.

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";

const NAVY    = "#1B3A5C";
const GOLD    = "#B8860B";
const BORDER  = "#D6D0C2";
const TEXT_DIM = "#6B645A";
const ERROR   = "#A8453B";
const GREEN   = "#2E7D4F";
const CREAM   = "#F7F4ED";
const LOCKED  = "#F2EEE2";

const TABS = [
  { key: "gl",        label: "GL OB Setup",    icon: "📒" },
  { key: "inventory", label: "Inventory OB",   icon: "📦" },
  { key: "party",     label: "Party OB",       icon: "👥" },
  { key: "bank",      label: "Bank OB",        icon: "🏦" },
  { key: "fa",        label: "FA OB",          icon: "🏭" },
];

const PARTY_COLORS = {
  Customer: "#2A6F77", Vendor: "#A8453B", Staff: "#3D7A4F",
  LC: "#8A6D3B", TDS: "#6B5B95",
};

function fmt(n, dec = 2) {
  return (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

const inputStyle = {
  width: "100%", padding: "6px 8px", border: `1px solid ${BORDER}`,
  background: "#FFFFFF", fontSize: 13, textAlign: "right", boxSizing: "border-box",
};
const lockedStyle = {
  ...inputStyle, background: LOCKED, color: TEXT_DIM, cursor: "not-allowed",
};

export default function OBSetupPage({ session, companyId, companies, homeSettings, initialTab = "gl", onFARegister }) {
  const [activeTab, setActiveTab]   = useState(initialTab);
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState("");
  const [error, setError]           = useState("");
  const [pulling, setPulling]       = useState(false);
  const [pullMsg, setPullMsg]       = useState("");

  // GL OB state
  const [glAccounts, setGlAccounts] = useState([]);
  const [glLoading, setGlLoading]   = useState(false);

  // Inventory OB state
  const [invItems, setInvItems]     = useState([]);
  const [invLoading, setInvLoading] = useState(false);

  // Party OB state
  const [parties, setParties]       = useState([]);
  const [partyLoading, setPartyLoading] = useState(false);

  // Bank OB state
  const [bankAccs, setBankAccs]     = useState([]);
  const [bankLoading, setBankLoading] = useState(false);

  const companyName = homeSettings?.company_name
    || companies?.find(c => c.id === companyId)?.name || "";
  const canEdit = !!(session?.user?.is_super_admin ||
    session?.companies?.find(c => c.id === companyId)?.role === "company_admin");

  useEffect(() => { setActiveTab(initialTab); }, [initialTab]);

  // ── Fetch functions ──────────────────────────────────────
  const fetchGL = useCallback(async () => {
    if (!companyId) return;
    setGlLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/ob/gl?company_id=${companyId}`);
      const data = await res.json();
      setGlAccounts((data.accounts || []).map(a => ({ ...a })));
    } catch { setError("Could not load GL accounts."); }
    finally { setGlLoading(false); }
  }, [companyId]);

  const fetchInventory = useCallback(async () => {
    if (!companyId) return;
    setInvLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/ob/inventory?company_id=${companyId}`);
      const data = await res.json();
      setInvItems((data.items || []).map(i => ({ ...i })));
    } catch { setError("Could not load inventory."); }
    finally { setInvLoading(false); }
  }, [companyId]);

  const fetchParties = useCallback(async () => {
    if (!companyId) return;
    setPartyLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/ob/party?company_id=${companyId}`);
      const data = await res.json();
      setParties((data.parties || []).map(p => ({ ...p })));
    } catch { setError("Could not load parties."); }
    finally { setPartyLoading(false); }
  }, [companyId]);

  const fetchBank = useCallback(async () => {
    if (!companyId) return;
    setBankLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/ob/bank?company_id=${companyId}`);
      const data = await res.json();
      setBankAccs((data.accounts || []).map(a => ({ ...a })));
    } catch { setError("Could not load bank accounts."); }
    finally { setBankLoading(false); }
  }, [companyId]);

  useEffect(() => {
    setMsg(""); setError();
    if (activeTab === "gl") fetchGL();
    else if (activeTab === "inventory") fetchInventory();
    else if (activeTab === "party") fetchParties();
    else if (activeTab === "bank") fetchBank();
  }, [activeTab, fetchGL, fetchInventory, fetchParties, fetchBank]);

  // ── Save functions ───────────────────────────────────────
  const saveGL = async () => {
    setSaving(true); setMsg(""); setError("");
    try {
      const editableAccs = glAccounts.filter(a => !a.managed_by);
      const res = await fetch(`${BACKEND}/api/ob/gl`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId, requesting_user_id: session.user.id,
          entries: editableAccs.map(a => ({ id: a.id, opening_dr: a.opening_dr, opening_cr: a.opening_cr })),
        }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else { setMsg(`Saved ${data.updated} GL opening balances.`); fetchGL(); }
    } catch { setError("Save failed."); }
    finally { setSaving(false); }
  };

  const saveInventory = async () => {
    setSaving(true); setMsg(""); setError("");
    try {
      const res = await fetch(`${BACKEND}/api/ob/inventory`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId, requesting_user_id: session.user.id,
          entries: invItems.map(i => ({
            id: i.id, material_type: i.material_type,
            opening_qty: i.opening_qty, opening_value: i.opening_value,
          })),
        }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else { setMsg(`Saved ${data.updated} inventory OBs. GL stock accounts updated.`); fetchInventory(); }
    } catch { setError("Save failed."); }
    finally { setSaving(false); }
  };

  const saveParty = async () => {
    setSaving(true); setMsg(""); setError("");
    try {
      const res = await fetch(`${BACKEND}/api/ob/party`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId, requesting_user_id: session.user.id,
          entries: parties.map(p => ({ id: p.id, opening_balance: p.opening_balance })),
        }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else { setMsg(`Saved ${data.updated} party OBs. GL accounts updated.`); fetchParties(); }
    } catch { setError("Save failed."); }
    finally { setSaving(false); }
  };

  const saveBank = async () => {
    setSaving(true); setMsg(""); setError("");
    try {
      // Collect sub-account entries
      const subEntries = [];
      bankAccs.forEach(gl => {
        (gl.sub_accounts || []).forEach(sa => {
          subEntries.push({ id: sa.id, opening_balance: sa.opening_balance });
        });
      });
      const res = await fetch(`${BACKEND}/api/ob/bank`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          requesting_user_id: session.user.id,
          entries: bankAccs.map(a => ({ id: a.id, opening_balance: a.opening_balance })),
          sub_entries: subEntries,
        }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else { setMsg(`Saved ${data.updated} bank/cash OBs.`); fetchBank(); }
    } catch { setError("Save failed."); }
    finally { setSaving(false); }
  };

  // ── Pull from previous FY ────────────────────────────────
  const pullFromPrevFY = async () => {
    if (!window.confirm("This will overwrite all current opening balances with the previous year's closing balances. Continue?")) return;
    setPulling(true); setPullMsg(""); setMsg(""); setError("");
    try {
      const res = await fetch(`${BACKEND}/api/ob/pull-from-prev-fy`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, requesting_user_id: session.user.id }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else {
        setPullMsg(data.message || "Opening balances pulled.");
        // Refresh current tab
        if (activeTab === "gl") fetchGL();
        else if (activeTab === "inventory") fetchInventory();
        else if (activeTab === "party") fetchParties();
        else if (activeTab === "bank") fetchBank();
      }
    } catch { setError("Pull failed."); }
    finally { setPulling(false); }
  };

  // ── Computed totals ──────────────────────────────────────
  const glTotalDr = glAccounts.reduce((s, a) => s + Number(a.opening_dr || 0), 0);
  const glTotalCr = glAccounts.reduce((s, a) => s + Number(a.opening_cr || 0), 0);
  const glBalanced = Math.abs(glTotalDr - glTotalCr) < 0.01;
  const invTotal = invItems.reduce((s, i) => s + Number(i.opening_value || 0), 0);
  const partyDrTotal = parties.filter(p => p.normal_side === "Dr").reduce((s, p) => s + Number(p.opening_balance || 0), 0);
  const partyCrTotal = parties.filter(p => p.normal_side === "Cr").reduce((s, p) => s + Number(p.opening_balance || 0), 0);
  // bank OB total is computed inline in the table footer below, so it
  // correctly reflects sub-account edits live, rather than going stale
  // between fetches (a GL with sub_accounts has its parent opening_balance
  // synced only on load, not on every keystroke).

  // Group GL by header for display
  const glByHeader = glAccounts.reduce((acc, a) => {
    const h = a.header || "Other";
    if (!acc[h]) acc[h] = [];
    acc[h].push(a);
    return acc;
  }, {});

  // Group inventory by type — fixed order
  const INV_TYPE_ORDER = ["RM", "FG", "BP", "Sub"];
  const invByType = INV_TYPE_ORDER.reduce((acc, type) => {
    const items = invItems.filter(i => i.material_type === type);
    if (items.length > 0) acc[type] = items;
    return acc;
  }, {});

  // Group parties by type
  const partiesByType = parties.reduce((acc, p) => {
    if (!acc[p.party_type]) acc[p.party_type] = [];
    acc[p.party_type].push(p);
    return acc;
  }, {});

  return (
    <div style={{ fontFamily: "'Source Serif Pro', Georgia, serif", background: CREAM, minHeight: "calc(100vh - 90px)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+Pro:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap');
        .mono{font-family:'IBM Plex Mono',monospace;} .sans{font-family:'Inter',sans-serif;}
        input[type=number]::-webkit-inner-spin-button{opacity:0.4}
        input:focus{outline:2px solid ${GOLD};outline-offset:1px;}
        table.ob{border-collapse:collapse;width:100%}
        table.ob th,table.ob td{border-bottom:1px solid ${BORDER}}
        table.ob tbody tr:hover td{background:#FBF8F0}
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
            <div style={{ fontSize:28, fontWeight:700, color:NAVY }}>Opening Balance Setup</div>
            <div className="sans" style={{ fontSize:12, color:TEXT_DIM, marginTop:2 }}>
              Enter or correct opening balances · Balance Check must = 0 before posting
            </div>
          </div>
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            {pullMsg && <span className="sans" style={{ fontSize:12, color:GREEN }}>{pullMsg}</span>}
            {canEdit && (
              <button onClick={pullFromPrevFY} disabled={pulling} className="sans" style={{
                background:"transparent", color:NAVY, border:`1px solid ${GOLD}`,
                padding:"9px 16px", fontSize:11, fontWeight:700, cursor:"pointer",
              }}>
                {pulling ? "Pulling…" : "⬇ Pull from Previous FY"}
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="sans" style={{ display:"flex", border:`1px solid ${NAVY}`, marginBottom:20, width:"fit-content" }}>
          {TABS.map((t, i) => (
            <button key={t.key} onClick={() => { setActiveTab(t.key); setMsg(""); setError(""); }} className="sans" style={{
              background: activeTab === t.key ? NAVY : "transparent",
              color: activeTab === t.key ? "#F0D78C" : NAVY,
              border:"none", padding:"9px 20px", fontSize:12, fontWeight:600, cursor:"pointer",
              borderRight: i < TABS.length - 1 ? `1px solid ${NAVY}` : "none",
            }}>{t.icon} {t.label}</button>
          ))}
        </div>

        {error && <div className="sans" style={{ color:ERROR, fontSize:13, marginBottom:10 }}>{error}</div>}
        {msg && <div className="sans" style={{ color:GREEN, fontSize:13, marginBottom:10, fontWeight:600 }}>{msg}</div>}

        {/* ── GL OB TAB ── */}
        {activeTab === "gl" && (
          <div>
            {/* Balance check strip */}
            <div style={{ display:"flex", gap:0, marginBottom:16, border:`1px solid ${NAVY}` }}>
              {[
                { label:"Total Dr", value:fmt(glTotalDr), color:NAVY },
                { label:"Total Cr", value:fmt(glTotalCr), color:NAVY },
                { label:"Balance Check (Dr − Cr)", value:fmt(glTotalDr - glTotalCr),
                  color: glBalanced ? GREEN : ERROR },
              ].map((s, i) => (
                <div key={i} style={{ flex:1, padding:"12px 16px", background:"#FFFFFF", borderRight: i < 2 ? `1px solid ${NAVY}` : "none" }}>
                  <div className="sans" style={{ fontSize:10, letterSpacing:"0.12em", color:TEXT_DIM, marginBottom:4 }}>{s.label}</div>
                  <div className="mono" style={{ fontSize:16, fontWeight:700, color:s.color }}>{s.value}</div>
                </div>
              ))}
              <div style={{ padding:"12px 16px", background: glBalanced ? "#EFF5EF" : "#FBEAE8", minWidth:160 }}>
                <div className="sans" style={{ fontSize:11, fontWeight:700, color: glBalanced ? GREEN : ERROR }}>
                  {glBalanced ? "✓ BALANCED" : "✗ OUT OF BALANCE"}
                </div>
                <div className="sans" style={{ fontSize:10, color:TEXT_DIM, marginTop:4 }}>Must = 0 to post</div>
              </div>
            </div>

            {glLoading ? <div className="sans" style={{ padding:40, textAlign:"center", color:TEXT_DIM }}>Loading…</div> : (
              <div style={{ border:`1px solid ${NAVY}`, background:"#FFFFFF" }}>
                <table className="ob">
                  <thead>
                    <tr className="sans" style={{ background:NAVY }}>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"left", width:120 }}>GL CODE</th>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"left" }}>ACCOUNT NAME</th>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"center", width:60 }}>NORMAL</th>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"right", width:160 }}>OPENING DR</th>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"right", width:160 }}>OPENING CR</th>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"left", width:120 }}>MANAGED BY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(glByHeader).map(([header, accs]) => (
                      <>
                        <tr key={`hdr-${header}`}>
                          <td colSpan={6} className="sans" style={{ padding:"8px 12px", background:"#EAE6DC", fontSize:10, fontWeight:700, letterSpacing:"0.14em", color:NAVY }}>
                            {header.toUpperCase()}
                          </td>
                        </tr>
                        {accs.map(a => (
                          <tr key={a.id}>
                            <td className="mono" style={{ padding:"7px 12px", fontSize:12, color:TEXT_DIM }}>{a.gl_code}</td>
                            <td style={{ padding:"7px 12px", fontSize:13, fontWeight:600 }}>{a.gl_name}</td>
                            <td className="sans" style={{ padding:"7px 12px", fontSize:11, textAlign:"center", color: a.normal_balance === "Dr" ? "#2A6F77" : "#A8453B", fontWeight:700 }}>
                              {a.normal_balance}
                            </td>
                            <td style={{ padding:"4px 8px" }}>
                              {a.managed_by ? (
                                <div style={lockedStyle}>{a.opening_dr > 0 ? fmt(a.opening_dr) : "—"}</div>
                              ) : (
                                <input type="number" min="0" step="0.01"
                                  value={a.opening_dr || ""}
                                  onChange={e => setGlAccounts(prev => prev.map(x => x.id === a.id ? { ...x, opening_dr: parseFloat(e.target.value) || 0 } : x))}
                                  style={inputStyle} placeholder="0.00" />
                              )}
                            </td>
                            <td style={{ padding:"4px 8px" }}>
                              {a.managed_by ? (
                                <div style={lockedStyle}>{a.opening_cr > 0 ? fmt(a.opening_cr) : "—"}</div>
                              ) : (
                                <input type="number" min="0" step="0.01"
                                  value={a.opening_cr || ""}
                                  onChange={e => setGlAccounts(prev => prev.map(x => x.id === a.id ? { ...x, opening_cr: parseFloat(e.target.value) || 0 } : x))}
                                  style={inputStyle} placeholder="0.00" />
                              )}
                            </td>
                            <td className="sans" style={{ padding:"7px 12px", fontSize:10, color: a.managed_by ? GOLD : TEXT_DIM, fontStyle: a.managed_by ? "italic" : "normal" }}>
                              {a.managed_by || ""}
                            </td>
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop:`2px solid ${NAVY}` }}>
                      <td colSpan={3} className="sans" style={{ padding:"10px 12px", fontSize:11, fontWeight:700, textAlign:"right" }}>TOTAL</td>
                      <td className="mono" style={{ padding:"10px 12px", fontSize:13, fontWeight:700, textAlign:"right", color: glBalanced ? GREEN : ERROR }}>{fmt(glTotalDr)}</td>
                      <td className="mono" style={{ padding:"10px 12px", fontSize:13, fontWeight:700, textAlign:"right", color: glBalanced ? GREEN : ERROR }}>{fmt(glTotalCr)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {canEdit && !glLoading && (
              <div style={{ marginTop:16, display:"flex", gap:10 }}>
                <button onClick={saveGL} disabled={saving} className="sans" style={{
                  background:NAVY, color:"#F0D78C", border:"none", padding:"11px 28px",
                  fontSize:12, fontWeight:700, letterSpacing:"0.1em", cursor:"pointer",
                }}>{saving ? "SAVING…" : "SAVE GL OPENING BALANCES"}</button>
                <span className="sans" style={{ fontSize:11, color:TEXT_DIM, alignSelf:"center" }}>
                  Grey fields are managed by Inventory OB / Party OB / Bank OB / FA OB and update automatically.
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── INVENTORY OB TAB ── */}
        {activeTab === "inventory" && (
          <div>
            <div className="sans" style={{ fontSize:12, color:TEXT_DIM, marginBottom:12 }}>
              Enter Opening Qty and Amount per item. Rate is auto-calculated (Amount ÷ Qty) for reference. Saving updates the GL stock accounts automatically.
            </div>
            {invLoading ? <div className="sans" style={{ padding:40, textAlign:"center", color:TEXT_DIM }}>Loading…</div> : (
              <div style={{ border:`1px solid ${NAVY}`, background:"#FFFFFF" }}>
                <table className="ob">
                  <thead>
                    <tr className="sans" style={{ background:NAVY }}>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"left" }}>CODE</th>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"left" }}>ITEM NAME</th>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"center" }}>UOM</th>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"right", width:140 }}>OB QTY</th>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"right", width:170 }}>OB AMOUNT (Rs.)</th>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"right", width:150 }}>RATE (auto)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(invByType).map(([type, items]) => (
                      <>
                        <tr key={`type-${type}`}>
                          <td colSpan={6} className="sans" style={{ padding:"8px 12px", background:"#EAE6DC", fontSize:10, fontWeight:700, letterSpacing:"0.14em", color:NAVY }}>
                            {type === "RM" ? "RAW MATERIALS" : type === "FG" ? "FINISHED GOODS" : type === "BP" ? "BY-PRODUCTS" : type === "Sub" ? "SUB-STORE / PACKING" : type}
                          </td>
                        </tr>
                        {items.map(item => {

                          return (
                            <tr key={item.id}>
                              <td className="mono" style={{ padding:"7px 12px", fontSize:12, color:TEXT_DIM }}>{item.product_code}</td>
                              <td style={{ padding:"7px 12px", fontSize:13, fontWeight:600 }}>{item.product_name}</td>
                              <td className="sans" style={{ padding:"7px 12px", fontSize:12, textAlign:"center" }}>{item.uom || "—"}</td>
                              <td style={{ padding:"4px 8px" }}>
                                <input type="number" min="0" step="0.001"
                                  value={item.opening_qty || ""}
                                  onChange={e => setInvItems(prev => prev.map(x => x.id === item.id ? { ...x, opening_qty: parseFloat(e.target.value) || 0 } : x))}
                                  style={inputStyle} placeholder="0" />
                              </td>
                              <td style={{ padding:"4px 8px" }}>
                                <input type="number" min="0" step="0.01"
                                  value={item.opening_value || ""}
                                  onChange={e => setInvItems(prev => prev.map(x => x.id === item.id ? { ...x, opening_value: parseFloat(e.target.value) || 0 } : x))}
                                  style={inputStyle} placeholder="0.00" />
                              </td>
                              <td className="mono" style={{ padding:"7px 12px", fontSize:12, textAlign:"right", color:TEXT_DIM, background:"#F7F4ED" }}>
                                {Number(item.opening_qty || 0) > 0
                                  ? fmt(Number(item.opening_value || 0) / Number(item.opening_qty), 4)
                                  : <span style={{ color:"#D8D2C3" }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                        <tr key={`sub-${type}`} style={{ borderTop:`1px solid ${BORDER}` }}>
                          <td colSpan={5} className="sans" style={{ padding:"6px 12px", fontSize:10, fontWeight:700, textAlign:"right", color:TEXT_DIM }}>
                            {type} TOTAL
                          </td>
                          <td className="mono" style={{ padding:"6px 12px", fontSize:12, fontWeight:700, textAlign:"right" }}>
                            {fmt(items.reduce((s, i) => s + Number(i.opening_value || 0), 0))}
                          </td>
                        </tr>
                      </>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop:`2px solid ${NAVY}` }}>
                      <td colSpan={5} className="sans" style={{ padding:"10px 12px", fontSize:11, fontWeight:700, textAlign:"right" }}>GRAND TOTAL</td>
                      <td className="mono" style={{ padding:"10px 12px", fontSize:14, fontWeight:700, textAlign:"right", color:NAVY }}>{fmt(invTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {canEdit && !invLoading && (
              <button onClick={saveInventory} disabled={saving} className="sans" style={{
                marginTop:16, background:NAVY, color:"#F0D78C", border:"none", padding:"11px 28px",
                fontSize:12, fontWeight:700, letterSpacing:"0.1em", cursor:"pointer",
              }}>{saving ? "SAVING…" : "SAVE INVENTORY OB"}</button>
            )}
          </div>
        )}

        {/* ── PARTY OB TAB ── */}
        {activeTab === "party" && (
          <div>
            <div className="sans" style={{ fontSize:12, color:TEXT_DIM, marginBottom:12 }}>
              Customer / Staff / LC / TDS = Debit (they owe us) &nbsp;·&nbsp; Vendor = Credit (we owe them). Saving updates GL accounts automatically.
            </div>
            {partyLoading ? <div className="sans" style={{ padding:40, textAlign:"center", color:TEXT_DIM }}>Loading…</div> : (
              <div style={{ border:`1px solid ${NAVY}`, background:"#FFFFFF" }}>
                <table className="ob">
                  <thead>
                    <tr className="sans" style={{ background:NAVY }}>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"left", width:100 }}>TYPE</th>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"left" }}>PARTY NAME</th>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"left" }}>GL ACCOUNT</th>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"center", width:60 }}>SIDE</th>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"right", width:180 }}>OPENING BALANCE (Rs.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(partiesByType).map(([type, pts]) => (
                      <>
                        <tr key={`ptype-${type}`}>
                          <td colSpan={5} className="sans" style={{ padding:"8px 12px", background:"#EAE6DC", fontSize:10, fontWeight:700, letterSpacing:"0.14em", color: PARTY_COLORS[type] || NAVY }}>
                            {type.toUpperCase()}
                          </td>
                        </tr>
                        {pts.map(p => (
                          <tr key={p.id}>
                            <td className="sans" style={{ padding:"7px 12px", fontSize:11, color: PARTY_COLORS[p.party_type] || NAVY, fontWeight:700 }}>{p.party_type}</td>
                            <td style={{ padding:"7px 12px", fontSize:13, fontWeight:600 }}>{p.name}</td>
                            <td className="sans" style={{ padding:"7px 12px", fontSize:11, color:TEXT_DIM }}>{p.gl_account || "—"}</td>
                            <td className="sans" style={{ padding:"7px 12px", fontSize:11, textAlign:"center", fontWeight:700, color: p.normal_side === "Dr" ? "#2A6F77" : "#A8453B" }}>
                              {p.normal_side}
                            </td>
                            <td style={{ padding:"4px 8px" }}>
                              <input type="number" min="0" step="0.01"
                                value={p.opening_balance || ""}
                                onChange={e => setParties(prev => prev.map(x => x.id === p.id ? { ...x, opening_balance: parseFloat(e.target.value) || 0 } : x))}
                                style={inputStyle} placeholder="0.00" />
                            </td>
                          </tr>
                        ))}
                        <tr key={`psub-${type}`} style={{ borderTop:`1px solid ${BORDER}` }}>
                          <td colSpan={4} className="sans" style={{ padding:"6px 12px", fontSize:10, fontWeight:700, textAlign:"right", color:TEXT_DIM }}>
                            {type} TOTAL
                          </td>
                          <td className="mono" style={{ padding:"6px 12px", fontSize:12, fontWeight:700, textAlign:"right" }}>
                            {fmt(pts.reduce((s, p) => s + Number(p.opening_balance || 0), 0))}
                          </td>
                        </tr>
                      </>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop:`2px solid ${NAVY}` }}>
                      <td colSpan={4} className="sans" style={{ padding:"10px 12px", fontSize:11, fontWeight:700, textAlign:"right" }}>
                        Dr Total &nbsp;|&nbsp; Cr Total
                      </td>
                      <td className="mono" style={{ padding:"10px 12px", fontSize:13, textAlign:"right" }}>
                        <span style={{ color:"#2A6F77" }}>{fmt(partyDrTotal)}</span>
                        <span style={{ color:TEXT_DIM, margin:"0 6px" }}>|</span>
                        <span style={{ color:"#A8453B" }}>{fmt(partyCrTotal)}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {canEdit && !partyLoading && (
              <button onClick={saveParty} disabled={saving} className="sans" style={{
                marginTop:16, background:NAVY, color:"#F0D78C", border:"none", padding:"11px 28px",
                fontSize:12, fontWeight:700, letterSpacing:"0.1em", cursor:"pointer",
              }}>{saving ? "SAVING…" : "SAVE PARTY OB"}</button>
            )}
          </div>
        )}

        {/* ── BANK OB TAB ── */}
        {activeTab === "bank" && (
          <div>
            <div className="sans" style={{ fontSize:12, color:TEXT_DIM, marginBottom:12 }}>
              Enter opening balance per account. GL total is auto-summed from accounts below it.
              Cash accounts without sub-accounts are entered directly.
            </div>
            {bankLoading ? <div className="sans" style={{ padding:40, textAlign:"center", color:TEXT_DIM }}>Loading…</div> : (
              <div style={{ border:"1px solid "+NAVY, background:"#FFFFFF" }}>
                <table className="ob">
                  <thead>
                    <tr className="sans" style={{ background:NAVY }}>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"left", width:100 }}>GL CODE</th>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"left" }}>ACCOUNT NAME</th>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"center", width:120 }}>TYPE</th>
                      <th style={{ padding:"9px 12px", fontSize:10, letterSpacing:"0.12em", color:CREAM, textAlign:"right", width:200 }}>OPENING BALANCE (Rs.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankAccs.map(a => (
                      <Fragment key={a.id}>
                        {/* GL header row */}
                        <tr style={{ background:"#F2EEE2", borderTop:"2px solid "+BORDER }}>
                          <td className="mono" style={{ padding:"7px 12px", fontSize:12, fontWeight:700, color:NAVY }}>{a.gl_code}</td>
                          <td style={{ padding:"7px 12px", fontSize:13, fontWeight:700, color:NAVY }}>{a.gl_name}</td>
                          <td className="sans" style={{ padding:"7px 12px", fontSize:11, textAlign:"center", color:TEXT_DIM }}>{a.sub_group}</td>
                          <td className="mono" style={{ padding:"7px 12px", fontSize:13, fontWeight:700, textAlign:"right", color:NAVY }}>
                            {(a.sub_accounts && a.sub_accounts.length > 0)
                              ? fmt(a.sub_accounts.reduce((s,x)=>s+Number(x.opening_balance||0),0))+" ←"
                              : <input type="number" min="0" step="0.01"
                                  value={a.opening_balance || ""}
                                  onChange={e => setBankAccs(prev => prev.map(x => x.id===a.id ? {...x, opening_balance: parseFloat(e.target.value)||0} : x))}
                                  style={inputStyle} placeholder="0.00" />
                            }
                          </td>
                        </tr>
                        {/* Sub-account rows */}
                        {(a.sub_accounts || []).map(sa => (
                          <tr key={"sa-"+sa.id} style={{ background:"#FAFAF7" }}>
                            <td style={{ padding:"6px 12px 6px 28px", fontSize:11, color:TEXT_DIM }}>└─ {sa.account_no||"—"}</td>
                            <td style={{ padding:"6px 12px", fontSize:12, color:"#333" }}>{sa.account_name}</td>
                            <td/>
                            <td style={{ padding:"4px 8px" }}>
                              <input type="number" min="0" step="0.01"
                                value={sa.opening_balance || ""}
                                onChange={e => setBankAccs(prev => prev.map(x => x.id===a.id ? {
                                  ...x,
                                  sub_accounts: x.sub_accounts.map(s => s.id===sa.id ? {...s, opening_balance: parseFloat(e.target.value)||0} : s)
                                } : x))}
                                style={inputStyle} placeholder="0.00" />
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop:"2px solid "+NAVY }}>
                      <td colSpan={3} className="sans" style={{ padding:"10px 12px", fontSize:11, fontWeight:700, textAlign:"right" }}>TOTAL BANK & CASH OB</td>
                      <td className="mono" style={{ padding:"10px 12px", fontSize:14, fontWeight:700, textAlign:"right", color:NAVY }}>
                        {fmt(bankAccs.reduce((s,a) => {
                          if(a.sub_accounts && a.sub_accounts.length>0)
                            return s + a.sub_accounts.reduce((ss,x)=>ss+Number(x.opening_balance||0),0);
                          return s + Number(a.opening_balance||0);
                        },0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {canEdit && !bankLoading && (
              <button onClick={saveBank} disabled={saving} className="sans" style={{
                marginTop:16, background:NAVY, color:"#F0D78C", border:"none", padding:"11px 28px",
                fontSize:12, fontWeight:700, letterSpacing:"0.1em", cursor:"pointer",
              }}>{saving ? "SAVING…" : "SAVE BANK OB"}</button>
            )}
          </div>
        )}

        {/* ── FA OB TAB ── */}
        {activeTab === "fa" && (
          <div>
            {onFARegister && (
              <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
                <div className="sans" style={{ fontSize: 12, color: TEXT_DIM }}>
                  Add assets to the FA Register first, then enter their opening accumulated depreciation below.
                </div>
                <button onClick={onFARegister} className="sans" style={{
                  background: "transparent", color: NAVY, border: `1px solid ${BORDER}`,
                  padding: "8px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                }}>☰ Go to FA Register</button>
              </div>
            )}
            <FARegisterPage
              session={session}
              companyId={companyId}
              companies={companies}
              homeSettings={homeSettings}
              mode="ob"
            />
          </div>
        )}
      </div>
    </div>
  );
}
