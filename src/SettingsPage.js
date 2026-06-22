import { useState, useEffect } from "react";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";

const TAX_FIELDS = [
  { key: "vat_rate", label: "VAT Rate" },
  { key: "tds_vendor_rate", label: "TDS - Vendor Rate" },
  { key: "tds_rental_rate", label: "TDS - Rental Rate" },
];

const PREFIX_FIELDS = [
  { key: "prefix_purchase", label: "Purchase Voucher" },
  { key: "prefix_purchase_ret", label: "Purchase Return" },
  { key: "prefix_sales", label: "Sales Voucher" },
  { key: "prefix_sales_ret", label: "Sales Return" },
  { key: "prefix_credit_note", label: "Credit Note" },
  { key: "prefix_debit_note", label: "Debit Note" },
  { key: "prefix_journal", label: "Journal Voucher" },
  { key: "prefix_import", label: "Import Voucher" },
  { key: "prefix_bank", label: "Bank Voucher" },
  { key: "prefix_fixed_asset", label: "Fixed Asset" },
  { key: "prefix_depreciation", label: "Depreciation" },
];

function Field({ label, children }) {
  return (
    <div>
      <label className="sans" style={{ fontSize: 10, letterSpacing: "0.12em", color: "#6B645A", display: "block", marginBottom: 4 }}>
        {label.toUpperCase()}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 10px", border: "1px solid #2B2B28",
  background: "#FFFFFF", fontSize: 13, boxSizing: "border-box"
};

export default function SettingsPage({ companyId, session }) {
  const canEdit = !!session?.user?.is_super_admin ||
    session?.companies?.find(c => c.id === companyId)?.role === "company_admin";
  const [settings, setSettings] = useState(null);
  const [calendar, setCalendar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [error, setError] = useState("");
  const [taxPct, setTaxPct] = useState({});

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/settings?company_id=${companyId}`);
      const data = await res.json();
      if (data.error) { setError(data.error); setSettings(null); }
      else {
        setSettings(data);
        setError("");
        setTaxPct({
          vat_rate: data.vat_rate != null ? (Math.round(data.vat_rate * 100 * 1e6) / 1e6).toString() : "",
          tds_vendor_rate: data.tds_vendor_rate != null ? (Math.round(data.tds_vendor_rate * 100 * 1e6) / 1e6).toString() : "",
          tds_rental_rate: data.tds_rental_rate != null ? (Math.round(data.tds_rental_rate * 100 * 1e6) / 1e6).toString() : "",
        });
      }
    } catch {
      setError("Backend not reachable.");
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendar = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/bs-ad-calendar`);
      const data = await res.json();
      setCalendar(data.calendar || []);
    } catch {}
  };

  useEffect(() => {
    fetchSettings();
    fetchCalendar();
    setSavedMsg("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const update = (key, value) => setSettings(s => ({ ...s, [key]: value }));

  const save = async () => {
    setSaving(true);
    setSavedMsg("");
    try {
      const res = await fetch(`${BACKEND}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          company_id: companyId,
          requesting_user_id: session?.user?.id,
          vat_rate: taxPct.vat_rate !== "" ? parseFloat(taxPct.vat_rate) / 100 : settings.vat_rate,
          tds_vendor_rate: taxPct.tds_vendor_rate !== "" ? parseFloat(taxPct.tds_vendor_rate) / 100 : settings.tds_vendor_rate,
          tds_rental_rate: taxPct.tds_rental_rate !== "" ? parseFloat(taxPct.tds_rental_rate) / 100 : settings.tds_rental_rate,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings ? { ...data.settings, company_id: companyId } : settings);
        setSavedMsg(`Saved (${data.updated_fields.length} fields updated)`);
      } else {
        setError(data.error || "Save failed");
      }
    } catch {
      setError("Backend not reachable.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="sans" style={{ padding: 60, textAlign: "center", color: "#9A9285" }}>Loading settings…</div>;
  }
  if (error || !settings) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div className="sans" style={{ fontSize: 13, color: "#A8453B", marginBottom: 8, fontWeight: 600 }}>
          {error || "Settings not available"}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontSize: 28, fontWeight: 700 }}>Settings</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {savedMsg && <span className="sans" style={{ fontSize: 12, color: "#3D7A4F", fontWeight: 600 }}>{savedMsg}</span>}
          {canEdit ? (
            <button onClick={save} disabled={saving} className="sans" style={{
              background: "#2B2B28", color: "#F7F4ED", border: "none", padding: "10px 24px",
              fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", cursor: "pointer"
            }}>
              {saving ? "SAVING…" : "SAVE SETTINGS"}
            </button>
          ) : (
            <span className="sans" style={{ fontSize: 11, color: "#9A9285", fontStyle: "italic" }}>
              Read-only — only Company Admins can edit settings.
            </span>
          )}
        </div>
      </div>

      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>

      {/* A. Company Identity */}
      <div style={{ border: "1px solid #2B2B28", background: "#FFFFFF", marginBottom: 20 }}>
        <div className="sans" style={{ background: "#2B2B28", color: "#F7F4ED", padding: "8px 16px", fontSize: 11, letterSpacing: "0.15em", fontWeight: 600 }}>
          A.&nbsp;&nbsp;COMPANY IDENTITY
        </div>
        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
          <Field label="Company Name">
            <input style={inputStyle} value={settings.company_name || ""} onChange={e => update("company_name", e.target.value)} />
          </Field>
          <Field label="PAN Number">
            <input style={inputStyle} className="mono" value={settings.pan_number || ""} onChange={e => update("pan_number", e.target.value)} />
          </Field>
          <Field label="Address">
            <input style={inputStyle} value={settings.company_address || ""} onChange={e => update("company_address", e.target.value)} />
          </Field>
          <Field label="Contact No">
            <input style={inputStyle} className="mono" value={settings.contact_no || ""} onChange={e => update("contact_no", e.target.value)} />
          </Field>
          <Field label="Email">
            <input style={inputStyle} value={settings.company_email || ""} onChange={e => update("company_email", e.target.value)} />
          </Field>
          <Field label="User / Admin Name">
            <input style={inputStyle} value={settings.user_name || ""} onChange={e => update("user_name", e.target.value)} />
          </Field>
        </div>
      </div>

      {/* B. Fiscal Year */}
      <div style={{ border: "1px solid #2B2B28", background: "#FFFFFF", marginBottom: 20 }}>
        <div className="sans" style={{ background: "#2B2B28", color: "#F7F4ED", padding: "8px 16px", fontSize: 11, letterSpacing: "0.15em", fontWeight: 600 }}>
          B.&nbsp;&nbsp;FISCAL YEAR
        </div>
        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <Field label="Fiscal Year (BS)">
            <input style={inputStyle} className="mono" value={settings.fiscal_year_bs || ""} onChange={e => update("fiscal_year_bs", e.target.value)} placeholder="e.g. 2082-83" />
          </Field>
          <Field label="FY Start (AD)">
            <input type="date" style={inputStyle} className="mono" value={settings.fy_start_ad || ""} onChange={e => update("fy_start_ad", e.target.value)} />
          </Field>
          <Field label="FY End (AD)">
            <input type="date" style={inputStyle} className="mono" value={settings.fy_end_ad || ""} onChange={e => update("fy_end_ad", e.target.value)} />
          </Field>
          <Field label="FY Start (BS)">
            <input style={inputStyle} value={settings.fy_start_bs || ""} onChange={e => update("fy_start_bs", e.target.value)} placeholder="e.g. 1 Shrawan 2082" />
          </Field>
          <Field label="FY End (BS)">
            <input style={inputStyle} value={settings.fy_end_bs || ""} onChange={e => update("fy_end_bs", e.target.value)} placeholder="e.g. 31 Ashadh 2083" />
          </Field>
          <Field label="Opening Balance Date">
            <input type="date" style={inputStyle} className="mono" value={settings.opening_balance_date || ""} onChange={e => update("opening_balance_date", e.target.value)} />
          </Field>
        </div>
      </div>

      {/* C. Tax Rates */}
      <div style={{ border: "1px solid #2B2B28", background: "#FFFFFF", marginBottom: 20 }}>
        <div className="sans" style={{ background: "#2B2B28", color: "#F7F4ED", padding: "8px 16px", fontSize: 11, letterSpacing: "0.15em", fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
          <span>C.&nbsp;&nbsp;TAX RATES</span>
          <span style={{ fontWeight: 400, letterSpacing: "0.05em" }}>editable every fiscal year</span>
        </div>
        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {TAX_FIELDS.map(f => (
            <Field key={f.key} label={f.label}>
              <div style={{ position: "relative" }}>
                <input
                  type="number" step="0.01" className="mono"
                  style={{ ...inputStyle, paddingRight: 28 }}
                  value={taxPct[f.key] ?? ""}
                  onChange={e => setTaxPct(prev => ({ ...prev, [f.key]: e.target.value }))}
                />
                <span className="sans" style={{ position: "absolute", right: 10, top: 9, fontSize: 13, color: "#9A9285" }}>%</span>
              </div>
            </Field>
          ))}
        </div>
      </div>

      {/* E. Voucher Prefixes */}
      <div style={{ border: "1px solid #2B2B28", background: "#FFFFFF", marginBottom: 20 }}>
        <div className="sans" style={{ background: "#2B2B28", color: "#F7F4ED", padding: "8px 16px", fontSize: 11, letterSpacing: "0.15em", fontWeight: 600 }}>
          E.&nbsp;&nbsp;VOUCHER NUMBER PREFIXES
        </div>
        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {PREFIX_FIELDS.map(f => (
            <Field key={f.key} label={f.label}>
              <input style={{ ...inputStyle }} className="mono" value={settings[f.key] || ""} onChange={e => update(f.key, e.target.value)} />
            </Field>
          ))}
        </div>
      </div>

      {/* F. System Preferences */}
      <div style={{ border: "1px solid #2B2B28", background: "#FFFFFF", marginBottom: 20 }}>
        <div className="sans" style={{ background: "#2B2B28", color: "#F7F4ED", padding: "8px 16px", fontSize: 11, letterSpacing: "0.15em", fontWeight: 600 }}>
          F.&nbsp;&nbsp;SYSTEM PREFERENCES
        </div>
        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <Field label="Default Currency">
            <input style={inputStyle} className="mono" value={settings.default_currency || ""} onChange={e => update("default_currency", e.target.value)} />
          </Field>
          <Field label="Date Format">
            <input style={inputStyle} className="mono" value={settings.date_format || ""} onChange={e => update("date_format", e.target.value)} />
          </Field>
          <Field label="Decimal Places">
            <input type="number" style={inputStyle} className="mono" value={settings.decimal_places ?? ""} onChange={e => update("decimal_places", e.target.value)} />
          </Field>
          <Field label="Depreciation Basis (days)">
            <input type="number" style={inputStyle} className="mono" value={settings.depreciation_basis_days ?? ""} onChange={e => update("depreciation_basis_days", e.target.value)} />
          </Field>
          <Field label="Stock Valuation Method">
            <input style={inputStyle} value={settings.stock_valuation_method || ""} onChange={e => update("stock_valuation_method", e.target.value)} />
          </Field>
          <Field label="Show Logo in Reports">
            <select style={inputStyle} value={settings.show_logo_in_reports ? "true" : "false"} onChange={e => update("show_logo_in_reports", e.target.value === "true")}>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </Field>
        </div>
      </div>

      {/* D. BS/AD Calendar — reference only */}
      <div style={{ border: "1px solid #2B2B28", background: "#FFFFFF", marginBottom: 20 }}>
        <div className="sans" style={{ background: "#2B2B28", color: "#F7F4ED", padding: "8px 16px", fontSize: 11, letterSpacing: "0.15em", fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
          <span>D.&nbsp;&nbsp;BS / AD CALENDAR REFERENCE</span>
          <span style={{ fontWeight: 400, letterSpacing: "0.05em" }}>read-only · for manual BS date entry</span>
        </div>
        <div style={{ padding: "0 18px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr className="sans" style={{ fontSize: 10, letterSpacing: "0.12em", color: "#9A9285" }}>
                <th style={{ textAlign: "left", padding: "10px 4px", borderBottom: "1px solid #E2DDD0" }}>BS FISCAL YEAR</th>
                <th style={{ textAlign: "left", padding: "10px 4px", borderBottom: "1px solid #E2DDD0" }}>AD START DATE (1 SHRAWAN)</th>
                <th style={{ textAlign: "left", padding: "10px 4px", borderBottom: "1px solid #E2DDD0" }}>NOTES</th>
              </tr>
            </thead>
            <tbody>
              {calendar.map(c => (
                <tr key={c.id} style={{ background: c.bs_fiscal_year === settings.fiscal_year_bs ? "#FBF8F0" : "transparent" }}>
                  <td className="mono" style={{ padding: "8px 4px", fontSize: 13, borderBottom: "1px solid #F0ECE0" }}>{c.bs_fiscal_year}</td>
                  <td className="mono" style={{ padding: "8px 4px", fontSize: 13, borderBottom: "1px solid #F0ECE0" }}>{c.ad_start_date}</td>
                  <td className="sans" style={{ padding: "8px 4px", fontSize: 12, color: "#9A9285", borderBottom: "1px solid #F0ECE0" }}>
                    {c.notes}{c.bs_fiscal_year === settings.fiscal_year_bs ? (c.notes ? " · " : "") + "Current company FY" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sans" style={{ padding: "10px 18px", fontSize: 11, color: "#9A9285" }}>
          BS dates entered on transaction forms are free-text and matched against this table for reference only — no automatic conversion is performed.
        </div>
      </div>
      </fieldset>
    </div>
  );
}
