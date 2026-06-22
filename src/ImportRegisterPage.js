import { useState, useEffect, useCallback } from "react";

// ImportRegisterPage.js — ARITHMA Import Landed Register (v3)
//
// ARCHITECTURE CHANGE: Bank Ledger is now the SOURCE OF TRUTH for every
// import charge. A user posts each payment in Bank Ledger (entry_type=
// "Party", party_type="LC", charge_type=<one of 16 LC_CHARGE_TYPES>).
// This page no longer accepts free-typed charge amounts — instead it
// shows the "Allocable" balance (posted in Bank Ledger minus already
// allocated to other items) beneath each field, and the user types how
// much of THAT remaining balance applies to the current item. The field
// is capped at the remaining balance — cannot go negative.
//
// Phase II now selects LC + PP No together (a consignment under one LC
// can land at a different time than another PP under the same LC).
// Shared Phase II charges are apportioned across every item under that
// LC by each item's (Taxable Amount + cost-VAT) share.
//
// New tabs: "Landed Cost Register" (full breakdown) replaces the old
// visual register; "Import Register" is now the simplified PP/item-wise
// Taxable + VAT view; "VAT Summary" unchanged in spirit.

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";
const NAVY    = "#1B3A5C";
const BORDER  = "#D6D0C2";
const DIM     = "#6B645A";
const ERR     = "#A8453B";
const GREEN   = "#2E7D4F";
const CREAM   = "#F7F4ED";
const LIGHT   = "#EDF3FB";
const GOLD    = "#B8860B";
const PURPLE  = "#6B4FA0";
const CAP_BG  = "#3A6090";

const fld = {padding:"7px 9px",border:"1px solid "+BORDER,background:"#FFF",
  fontSize:12,width:"100%",boxSizing:"border-box"};
const lbl = {fontSize:9,letterSpacing:"0.1em",color:DIM,fontWeight:700,
  display:"block",marginBottom:3};

function fmtT(n) {
  return (Number(n)||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmt(n) {
  const v=Number(n)||0; if(v===0) return "";
  return v.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmt4(n) {
  return (Number(n)||0).toLocaleString("en-IN",{minimumFractionDigits:4,maximumFractionDigits:4});
}

const FA_BLOCK_GL = {
  "LAND":    "1010 - Factory Land",
  "BLOCK A": "1020 - Factory Building",
  "BLOCK B": "1050 - Office Equipment",
  "BLOCK C": "1070 - Vehicles",
  "BLOCK D": "1030 - Plant & Machinery",
  "BLOCK E": "1300 - Intangible Assets",
};
const FA_BLOCKS = Object.keys(FA_BLOCK_GL);

// Phase I charge fields — these are now ALLOCATIONS, not free amounts
const P1_CHARGE_FIELDS = [
  ["custom_duty",    "Custom Duty"],
  ["excise_duty",    "Excise Duty"],
  ["other_duties",   "Other Duties"],
  ["custom_svc_chg", "Custom Service Charge"],
  ["vat_amount",     "VAT"],
];

// Phase II shared charge fields — also allocations
const P2_CHARGE_FIELDS = [
  ["p2_import_freight",   "Import Freight (LCY)"],
  ["p2_import_handling",  "Import Handling (LCY)"],
  ["p2_local_handling",   "Local Handling"],
  ["p2_local_clearing",   "Local Clearing"],
  ["p2_agent_commission", "Agent Commission"],
  ["p2_local_freight",    "Local Freight"],
  ["p2_packing_fwd",      "Packing & Forwarding"],
  ["p2_other_misc",       "Other Misc Charges"],
  ["p2_bank_charges",     "Bank Charges"],
  ["p2_insurance",        "Insurance"],
];

const PRINT_CSS = `@media print{
body *{visibility:hidden!important;}
#ir-print-area,#ir-print-area *{visibility:visible!important;}
#ir-print-area{position:absolute;left:0;top:0;width:100%;font-family:Arial;font-size:8px;padding:6mm;box-sizing:border-box;}
.no-print{display:none!important;}
table{border-collapse:collapse;width:100%!important;table-layout:fixed;}
th,td{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
th{background:#1B3A5C!important;color:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:2px 3px;font-size:7px;font-weight:700;}
td{padding:2px 3px;border-bottom:1px solid #e0e0e0;font-size:7px;}
tr.tot-row td{background:#1B3A5C!important;color:#fff!important;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
@page{size:A4 landscape;margin:8mm;}}`;

function injectPrint(){
  if(document.getElementById("ir-css")) return;
  const s=document.createElement("style"); s.id="ir-css"; s.textContent=PRINT_CSS;
  document.head.appendChild(s);
}

// ── Void Modal ───────────────────────────────────────────────────
function VoidModal({ row, onConfirm, onCancel }) {
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const matches = confirmText.trim() === (row.imp_voucher||"").trim();
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}}>
      <div style={{background:"#FFF",width:"min(480px,92vw)",borderRadius:4,boxShadow:"0 8px 32px rgba(0,0,0,0.2)",overflow:"hidden"}}>
        <div style={{background:ERR,padding:"14px 20px",display:"flex",gap:10,alignItems:"center"}}>
          <span style={{fontSize:20}}>⚠</span>
          <span style={{color:"#FFF",fontWeight:700,fontSize:15,fontFamily:"Arial"}}>Void Import Item</span>
        </div>
        <div style={{padding:"20px 24px"}}>
          <p style={{fontSize:13,color:"#333",marginBottom:14}}>
            Void <strong>{row.item_name}</strong> under <strong>{row.imp_voucher}</strong>.
            GL, Party Ledger AND its LC charge allocations will be reversed — freeing that balance for re-use.
          </p>
          <label className="sans" style={lbl}>TYPE "{row.imp_voucher}" TO CONFIRM *</label>
          <input value={confirmText} onChange={e=>setConfirmText(e.target.value)}
            placeholder={row.imp_voucher} style={{...fld,marginBottom:6,
              border:confirmText&&!matches?"1px solid "+ERR:fld.border}}/>
          {confirmText&&!matches&&<div style={{fontSize:11,color:ERR,marginBottom:6}}>Doesn't match "{row.imp_voucher}"</div>}
          <div style={{marginBottom:12}}/>
          <label className="sans" style={lbl}>REASON (optional)</label>
          <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2}
            style={{...fld,marginBottom:18,resize:"vertical"}}/>
          <div style={{display:"flex",gap:10}}>
            <button onClick={async()=>{setSubmitting(true);await onConfirm(confirmText,reason);setSubmitting(false);}}
              disabled={!matches||submitting}
              style={{flex:2,padding:"11px",background:matches&&!submitting?ERR:"#CCC",color:"#FFF",
                border:"none",fontWeight:700,fontSize:13,cursor:matches&&!submitting?"pointer":"not-allowed",fontFamily:"Arial"}}>
              {submitting?"Voiding…":"⚠ Confirm Void"}
            </button>
            <button onClick={onCancel} style={{flex:1,padding:"11px",background:"#FFF",color:DIM,
              border:"1px solid "+BORDER,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"Arial"}}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Allocable Charge Field — the core new UI primitive ─────────────
// Shows a number input capped at `remaining`, with the remaining
// balance displayed beneath in small font, live-updating as the user
// types. Turns red/locked when remaining is 0.
function AllocableField({ label, value, onChange, remaining, loading, disabled }) {
  const v = parseFloat(value) || 0;
  const exhausted = !loading && remaining <= 0.004;
  const overBudget = v > remaining + 0.004;
  const afterThis = Math.max(remaining - v, 0);

  return (
    <div>
      <label className="sans" style={{...lbl, color: exhausted ? ERR : undefined}}>
        {label}
      </label>
      <input
        type="number"
        value={value}
        disabled={disabled || exhausted}
        onChange={e=>{
          let next = e.target.value;
          // soft-cap on the client too — backend is the hard authority
          const num = parseFloat(next);
          if(!isNaN(num) && num > remaining) next = String(remaining);
          if(!isNaN(num) && num < 0) next = "0";
          onChange(next);
        }}
        style={{...fld, textAlign:"right",
          background: exhausted ? "#FFF0F0" : (v>0 ? "#F0FFF4" : "#FFF"),
          border: overBudget ? "1px solid "+ERR : (v>0 ? "1px solid #A3D9A5" : fld.border),
          cursor: exhausted ? "not-allowed" : "text"}}
      />
      <div style={{fontSize:9,marginTop:3,fontFamily:"monospace"}}>
        {loading ? (
          <span style={{color:DIM}}>loading…</span>
        ) : exhausted ? (
          <span style={{color:ERR,fontWeight:700}}>Fully allocated — Rs.0.00 left</span>
        ) : (
          <span style={{color:GREEN}}>
            Allocable: Rs.{fmtT(remaining)}
            {v>0 && <span style={{color:DIM}}> → Rs.{fmtT(afterThis)} after this</span>}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────
export default function ImportRegisterPage({
  session, companyId, companies, homeSettings,
  onGoToPurchaseBook, onGoToBankCash, onBack, defaultTab
}) {
  const [activeTab, setActiveTab] = useState(defaultTab || "phase1");
  const [parties, setParties] = useState([]);
  const [lcParties, setLcParties] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [rows, setRows] = useState([]);
  const [landedRows, setLandedRows] = useState([]);
  const [voidedRows, setVoidedRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [postMsg, setPostMsg] = useState("");
  const [voidRow, setVoidRow] = useState(null);

  // Register / Landed Cost Register filters
  const [filterType, setFilterType] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [vatView, setVatView] = useState("month");

  // ── Phase I form state ──
  const [impVoucherDraft, setImpVoucherDraft] = useState("");
  const [billItems, setBillItems] = useState([]);
  const [billItemsLoading, setBillItemsLoading] = useState(false);
  const [p1, setP1] = useState({
    entry_date: new Date().toISOString().slice(0,10),
    pp_no:"", supplier_name:"", bank_lc_no:"", fec_no:"", item_name:"",
    fcy_currency:"USD", fcy_rate:"", exchange_rate:"", is_taxable:true, is_capital:false,
    qty:"", material_value:"", material_value_paid:"", custom_duty:"", excise_duty:"", other_duties:"",
    custom_svc_chg:"", vat_claimable:true, vat_amount:"", taxable_amount:"",
    cap_item_name:"", cap_sub_group:"BLOCK B", block_gl:FA_BLOCK_GL["BLOCK B"],
    dep_rate_pct:"", residual_pct:"5",
  });
  const [savingP1, setSavingP1] = useState(false);
  const [p1Msg, setP1Msg] = useState("");
  const [showCapitalPanel, setShowCapitalPanel] = useState(false);

  // LC Phase I balances — { custom_duty: {charge_type, posted, allocated, remaining}, ... }
  const [lcBalances, setLcBalances] = useState(null);
  const [lcBalancesLoading, setLcBalancesLoading] = useState(false);

  // ── Phase II form state ──
  const [p2LcName, setP2LcName] = useState("");
  const [p2PpNo, setP2PpNo] = useState("");
  const [openPpGroups, setOpenPpGroups] = useState([]);
  const [p2Charges, setP2Charges] = useState(
    Object.fromEntries(P2_CHARGE_FIELDS.map(([k])=>[k,""]))
  );
  const [p2Vat, setP2Vat] = useState("");
  const [p2VatIsCost, setP2VatIsCost] = useState(false);
  const [savingP2, setSavingP2] = useState(false);
  const [p2Msg, setP2Msg] = useState("");
  const [p2Preview, setP2Preview] = useState(null);
  const [lcP2Balances, setLcP2Balances] = useState(null);
  const [lcP2BalancesLoading, setLcP2BalancesLoading] = useState(false);

  const companyName = homeSettings?.company_name || companies?.find(c=>c.id===companyId)?.name || "";
  const fiscalYear  = homeSettings?.fiscal_year_bs || session?.fiscal_year_bs || "";
  const userRole    = session?.company?.role || session?.role || "";
  const isSuperAdmin= session?.user?.is_super_admin || session?.is_super_admin || false;
  const canVoid     = isSuperAdmin || ["company_admin","admin","accountant"].includes(userRole);
  injectPrint();

  // ── Initial data ──
  useEffect(()=>{
    if(!companyId) return;
    fetch(BACKEND+"/api/parties?company_id="+companyId+"&type=Vendor&limit=500")
      .then(r=>r.json()).then(d=>setParties(d.parties||[]));
    fetch(BACKEND+"/api/parties?company_id="+companyId+"&type=LC&limit=500")
      .then(r=>r.json()).then(d=>setLcParties(d.parties||[]));
    fetch(BACKEND+"/api/materials?company_id="+companyId+"&type=RM&limit=500")
      .then(r=>r.json()).then(d=>setMaterials(d.materials||[]));
  },[companyId]);

  // ── Fetch LC Phase I balances whenever the LC selection changes ──
  const fetchLcBalances = useCallback(async (lcName)=>{
    if(!lcName || !companyId){ setLcBalances(null); return; }
    setLcBalancesLoading(true);
    try{
      const r = await fetch(BACKEND+"/api/import-register/lc-balances?company_id="+companyId+"&lc_name="+encodeURIComponent(lcName));
      const d = await r.json();
      setLcBalances(d.balances || null);
    } catch(e){ console.error("fetchLcBalances:",e); setLcBalances(null); }
    finally{ setLcBalancesLoading(false); }
  },[companyId]);

  const handleLcSelect = (lcName) => {
    setP1(prev=>({...prev, bank_lc_no:lcName,
      custom_duty:"", excise_duty:"", other_duties:"", custom_svc_chg:"", vat_amount:""}));
    fetchLcBalances(lcName);
  };

  // ── Fetches ──
  const fetchRows = useCallback(async()=>{
    if(!companyId) return;
    setLoading(true); setError("");
    try{
      const r = await fetch(BACKEND+"/api/import-register?company_id="+companyId);
      const d = await r.json();
      if(d.error) setError(d.error); else setRows(d.rows||[]);
    } catch(e){ setError("Network error: "+e.message); }
    finally{ setLoading(false); }
  },[companyId]);

  const fetchLandedRows = useCallback(async()=>{
    if(!companyId) return;
    setLoading(true); setError("");
    try{
      const r = await fetch(BACKEND+"/api/landed-cost-register?company_id="+companyId);
      const d = await r.json();
      if(d.error) setError(d.error); else setLandedRows(d.rows||[]);
    } catch(e){ setError("Network error: "+e.message); }
    finally{ setLoading(false); }
  },[companyId]);

  const fetchVoided = useCallback(async()=>{
    if(!companyId) return;
    const r = await fetch(BACKEND+"/api/import-register?company_id="+companyId+"&include_void=true");
    const d = await r.json();
    setVoidedRows((d.rows||[]).filter(x=>x.is_void));
  },[companyId]);

  const fetchOpenPp = useCallback(async(lcName)=>{
    if(!companyId) return;
    const url = BACKEND+"/api/import-register/open-pp?company_id="+companyId
      + (lcName ? "&lc_name="+encodeURIComponent(lcName) : "");
    const r = await fetch(url);
    const d = await r.json();
    setOpenPpGroups(d.groups||[]);
  },[companyId]);

  useEffect(()=>{ if(activeTab==="register"||activeTab==="vat-summary") fetchRows(); },[activeTab,fetchRows]);
  useEffect(()=>{ if(activeTab==="landed-cost") fetchLandedRows(); },[activeTab,fetchLandedRows]);
  useEffect(()=>{ if(activeTab==="voided") fetchVoided(); },[activeTab,fetchVoided]);
  useEffect(()=>{ if(activeTab==="phase2") fetchOpenPp(p2LcName); },[activeTab,p2LcName,fetchOpenPp]);

  const fetchBillItems = async (voucherNo) => {
    if(!voucherNo || !companyId) return;
    setBillItemsLoading(true);
    try{
      const res = await fetch(BACKEND+"/api/import-register?company_id="+companyId+"&imp_voucher="+encodeURIComponent(voucherNo));
      const data = await res.json();
      setBillItems(data.rows || []);
    } catch(e){ console.error("fetchBillItems:",e); }
    finally{ setBillItemsLoading(false); }
  };

  // ── Phase I derived values ──
  // matVal = CALCULATED material value (FCY×ExRate×Qty) — reference only, does not post to GL.
  const matVal = parseFloat(p1.material_value) || (
    (parseFloat(p1.fcy_rate)||0)*(parseFloat(p1.exchange_rate)||0)*(parseFloat(p1.qty)||0)
  );
  // matValPaid = ACTUAL amount allocated from the bulk LC material payment — this is what
  // posts to GL and feeds Total Phase I Cost.
  const matValPaid = parseFloat(p1.material_value_paid) || 0;
  // forexGainLoss = Calculated − Paid. +ve = paid less than calculated (gain); -ve = loss.
  const forexGainLoss = Math.round((matVal - matValPaid)*100)/100;
  const custD = parseFloat(p1.custom_duty)||0;
  const excD  = parseFloat(p1.excise_duty)||0;
  const othD  = parseFloat(p1.other_duties)||0;
  const svcC  = parseFloat(p1.custom_svc_chg)||0;
  const vatAmt = parseFloat(p1.vat_amount)||0;
  const vatIfCost = p1.vat_claimable ? 0 : vatAmt;
  // subtotal / statExp / totalPhase1 use matValPaid (ACTUAL), matching the backend's calculation.
  const subtotal = matValPaid + custD + excD + othD;
  const taxAmt = parseFloat(p1.taxable_amount)||0;
  const statExp = Math.round((taxAmt - subtotal)*100)/100;
  const totalPhase1 = Math.round((matValPaid + custD + excD + othD + svcC + vatIfCost)*100)/100;

  const saveP1 = async()=>{
    if(!p1.item_name.trim()){ setP1Msg("❌ Item Name is required"); return; }
    if(!(parseFloat(p1.qty)>0)){ setP1Msg("❌ Qty must be greater than 0"); return; }
    if(p1.is_capital && !p1.cap_item_name.trim()){ setP1Msg("❌ Capital Item Name is required"); return; }
    if(!p1.bank_lc_no){ setP1Msg("❌ Select a Bank LC No — charges are allocated from its posted balance"); return; }
    setSavingP1(true); setP1Msg("");
    try{
      const r = await fetch(BACKEND+"/api/import-register/phase1",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({company_id:companyId,requesting_user_id:session?.user?.id,
          imp_voucher:impVoucherDraft,...p1}),
      });
      const d = await r.json();
      if(d.success){
        setImpVoucherDraft(d.imp_voucher);
        let msg = "✅ Item saved under "+d.imp_voucher+" — Total Phase I: Rs."+fmtT(d.total_phase1);
        if(d.forex_gain_loss !== undefined && Math.abs(d.forex_gain_loss) > 0.004){
          msg += " · Forex "+(d.forex_gain_loss>=0?"Gain":"Loss")+": Rs."+fmtT(Math.abs(d.forex_gain_loss));
        }
        setP1Msg(msg);
        setP1(prev=>({...prev, item_name:"", fcy_rate:"", exchange_rate:"", qty:"",
          material_value:"", material_value_paid:"", custom_duty:"", excise_duty:"", other_duties:"",
          custom_svc_chg:"", vat_amount:"", taxable_amount:"",
          is_capital:false, cap_item_name:"", cap_sub_group:"BLOCK B",
          block_gl:FA_BLOCK_GL["BLOCK B"], dep_rate_pct:"", residual_pct:"5"}));
        setShowCapitalPanel(false);
        await fetchBillItems(d.imp_voucher);
        await fetchLcBalances(p1.bank_lc_no);   // refresh remaining balances after allocation
      } else setP1Msg("❌ "+d.error);
    } catch(e){ setP1Msg("❌ Network error: "+e.message); }
    finally{ setSavingP1(false); }
  };

  const finishBill = () => {
    setImpVoucherDraft("");
    setBillItems([]);
    setP1(prev=>({...prev, pp_no:"", supplier_name:"", bank_lc_no:"", fec_no:""}));
    setP1Msg(""); setLcBalances(null);
  };

  // ── Phase II ──
  const totalP2 = Object.values(p2Charges).reduce((s,v)=>s+(parseFloat(v)||0),0);

  const fetchLcP2Balances = useCallback(async(lcName)=>{
    if(!lcName || !companyId){ setLcP2Balances(null); return; }
    setLcP2BalancesLoading(true);
    try{
      const r = await fetch(BACKEND+"/api/import-register/lc-phase2-balances?company_id="+companyId+"&lc_name="+encodeURIComponent(lcName));
      const d = await r.json();
      setLcP2Balances(d.balances || null);
    } catch(e){ console.error("fetchLcP2Balances:",e); setLcP2Balances(null); }
    finally{ setLcP2BalancesLoading(false); }
  },[companyId]);

  useEffect(()=>{ if(p2LcName) fetchLcP2Balances(p2LcName); else setLcP2Balances(null); },[p2LcName,fetchLcP2Balances]);

  const previewP2Allocation = useCallback(()=>{
    if(!p2LcName){ setP2Preview(null); return; }
    fetch(BACKEND+"/api/landed-cost-register?company_id="+companyId+"&bank_lc_no="+encodeURIComponent(p2LcName))
      .then(r=>r.json())
      .then(d=>{
        const items=(d.rows||[]);
        const base=items.reduce((s,r)=>s+(r.taxable_amount||0)+(r.vat_claimable?0:(r.vat_amount||0)),0);
        setP2Preview(items.map(r=>({
          item_name:r.item_name, pp_no:r.pp_no,
          base: (r.taxable_amount||0)+(r.vat_claimable?0:(r.vat_amount||0)),
          share: base>0 ? ((r.taxable_amount||0)+(r.vat_claimable?0:(r.vat_amount||0)))/base : 0,
        })));
      });
  },[p2LcName,companyId]);
  useEffect(()=>{ previewP2Allocation(); },[previewP2Allocation]);

  const saveP2 = async(markNA=false)=>{
    if(!p2LcName){ setP2Msg("❌ Select an LC first"); return; }
    if(!p2PpNo){ setP2Msg("❌ Select a PP No to settle"); return; }
    setSavingP2(true); setP2Msg("");
    try{
      const r = await fetch(BACKEND+"/api/import-register/phase2",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          company_id:companyId, lc_name:p2LcName, pp_no:p2PpNo,
          charges:Object.fromEntries(Object.entries(p2Charges).map(([k,v])=>[k,parseFloat(v)||0])),
          p2_vat:parseFloat(p2Vat)||0, vat_is_cost:p2VatIsCost, mark_na:markNA,
        }),
      });
      const d = await r.json();
      if(d.success){
        let msg = "✅ "+d.adn_voucher+" posted — "+d.items_updated+" item(s) updated.";
        if(d.adv_voucher) msg += " Claimable VAT booked separately under "+d.adv_voucher+".";
        setP2Msg(msg);
        setP2PpNo("");
        setP2Charges(Object.fromEntries(P2_CHARGE_FIELDS.map(([k])=>[k,""])));
        setP2Vat(""); setP2VatIsCost(false);
        fetchOpenPp(p2LcName);
        fetchLcP2Balances(p2LcName);
      } else setP2Msg("❌ "+d.error);
    } catch(e){ setP2Msg("❌ Network error: "+e.message); }
    finally{ setSavingP2(false); }
  };

  // ── Register derived data (simplified: Taxable + VAT only) ──
  const filtered = rows.filter(r=>{
    const tm = filterType==="All"
      || (filterType==="Capital"    && r.is_capital)
      || (filterType==="Taxable"    && r.is_taxable && !r.is_capital)
      || (filterType==="Non-Taxable"&& !r.is_taxable);
    const df = !dateFrom || r.entry_date>=dateFrom;
    const dt_ = !dateTo   || r.entry_date<=dateTo;
    const s  = search.toLowerCase();
    const sm = !s || [r.supplier_name,r.item_name,r.imp_voucher,r.bank_lc_no,r.pp_no]
      .some(v=>(v||"").toLowerCase().includes(s));
    return tm && df && dt_ && sm;
  });

  const totals = filtered.reduce((a,r)=>({
    importTaxable: a.importTaxable + (r.import_taxable||0),
    importVat:     a.importVat     + (r.import_vat||0),
    importTotal:   a.importTotal   + (r.import_total||0),
    capTaxable:    a.capTaxable    + (r.cap_taxable||0),
    capVat:        a.capVat        + (r.cap_vat||0),
    capTotal:      a.capTotal      + (r.cap_total||0),
    grand:         a.grand         + (r.import_total||0) + (r.cap_total||0),
  }),{importTaxable:0,importVat:0,importTotal:0,capTaxable:0,capVat:0,capTotal:0,grand:0});

  const vatMonth = {};
  filtered.forEach(r=>{
    const m = r.month_bs || r.entry_date?.slice(0,7) || "Unknown";
    if(!vatMonth[m]) vatMonth[m]={taxable:0,vat:0,capTaxable:0,capVat:0,capTotal:0,grand:0};
    const v=vatMonth[m];
    v.taxable+=r.import_taxable||0; v.vat+=r.import_vat||0;
    v.capTaxable+=r.cap_taxable||0; v.capVat+=r.cap_vat||0; v.capTotal+=r.cap_total||0;
    v.grand+=(r.import_total||0)+(r.cap_total||0);
  });

  const vatSupplier = {};
  filtered.forEach(r=>{
    const key = r.supplier_name||"Unknown";
    if(!vatSupplier[key]) vatSupplier[key]={name:key,taxable:0,vat:0,capTaxable:0,capVat:0,capTotal:0,grand:0,txns:0};
    const v=vatSupplier[key]; v.txns++;
    v.taxable+=r.import_taxable||0; v.vat+=r.import_vat||0;
    v.capTaxable+=r.cap_taxable||0; v.capVat+=r.cap_vat||0; v.capTotal+=r.cap_total||0;
    v.grand+=(r.import_total||0)+(r.cap_total||0);
  });
  const supplierRows = Object.values(vatSupplier).sort((a,b)=>b.vat-a.vat);

  // ── Landed Cost Register filters ──
  const filteredLanded = landedRows.filter(r=>{
    const df = !dateFrom || r.entry_date>=dateFrom;
    const dt_ = !dateTo   || r.entry_date<=dateTo;
    const s  = search.toLowerCase();
    const sm = !s || [r.supplier_name,r.item_name,r.imp_voucher,r.bank_lc_no,r.pp_no]
      .some(v=>(v||"").toLowerCase().includes(s));
    return df && dt_ && sm;
  });

  // ── CSV Exports ──
  const exportRegisterCSV = () => {
    const hdrs=["IMP Voucher","Date","PP No","Supplier","Bank LC No","Item Name","Qty",
      "Import Taxable","Import VAT","Import Total","Cap Taxable","Cap VAT","Cap Total","Status"];
    const lines=[hdrs.join(",")];
    filtered.forEach(r=>{
      lines.push([r.imp_voucher,r.entry_date,r.pp_no,r.supplier_name,r.bank_lc_no,r.item_name,r.qty,
        r.import_taxable,r.import_vat,r.import_total,r.cap_taxable,r.cap_vat,r.cap_total,r.overall_status]
        .map(v=>`"${v??""}"`).join(","));
    });
    const csv=lines.join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download=("import_register_"+companyName).replace(/\s+/g,"_")+".csv";
    a.click();
  };

  const exportLandedCSV = () => {
    const hdrs=["LC No","PP No","IMP Voucher","Supplier","Item Name","Qty",
      "Material Value (calc)","Material Value Paid","Forex Gain/Loss",
      "Custom Duty","Excise Duty","Other Duties","Custom Svc Chg","VAT","VAT Treatment",
      "Taxable Amount","Statistical Exp","Total Phase I","Phase II","Total Landed Cost","CPU","Status"];
    const lines=[hdrs.join(",")];
    filteredLanded.forEach(r=>{
      lines.push([r.bank_lc_no,r.pp_no,r.imp_voucher,r.supplier_name,r.item_name,r.qty,
        r.material_value,r.material_value_paid,r.forex_gain_loss,
        r.custom_duty,r.excise_duty,r.other_duties,r.custom_svc_chg,r.vat_amount,r.vat_treatment,
        r.taxable_amount,r.statistical_exp,r.total_phase1,r.p2_total,r.total_landed_cost,r.landed_cpu,r.overall_status]
        .map(v=>`"${v??""}"`).join(","));
    });
    const csv=lines.join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download=("landed_cost_register_"+companyName).replace(/\s+/g,"_")+".csv";
    a.click();
  };

  const doVoid = async(confirmText, reason)=>{
    if(!voidRow) return;
    try{
      const r = await fetch(BACKEND+"/api/import-register/"+voidRow.id+"/void",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({company_id:companyId,requesting_user_id:session?.user?.id,
          confirm_doc_number:confirmText,void_reason:reason}),
      });
      const d = await r.json();
      if(d.success){ setVoidRow(null); setPostMsg("✅ "+d.message); fetchRows(); fetchLandedRows(); fetchVoided(); }
      else alert("Error: "+d.error);
    } catch(e){ alert("Network error: "+e.message); }
  };

  // ── Table styles ──
  const TH  ={padding:"7px 8px",fontSize:9,fontWeight:700,color:"#FFF",background:NAVY,whiteSpace:"nowrap",textAlign:"left"};
  const THR ={...TH,textAlign:"right"};
  const THC ={...TH,background:CAP_BG};
  const THCR={...TH,background:CAP_BG,textAlign:"right"};
  const TD  ={padding:"7px 8px",fontSize:11,borderBottom:"1px solid "+BORDER,whiteSpace:"nowrap"};
  const TDR ={...TD,textAlign:"right",fontFamily:"monospace"};
  const TDC ={...TD,background:"#F0F4FA"};
  const TDCR={...TDR,background:"#F0F4FA"};

  const tabs = [
    ["phase1","① Phase I — Item Entry"],
    ["phase2","② Phase II — Landed Cost"],
    ["register","📋 Import Register"],
    ["landed-cost","🧮 Landed Cost Register"],
    ["vat-summary","🧾 VAT Summary"],
    ["voided","Voided"],
  ];

  return (
    <div style={{fontFamily:"Arial,sans-serif",background:CREAM,minHeight:"100vh",padding:"22px 28px"}}>
      {voidRow && <VoidModal row={voidRow} onConfirm={doVoid} onCancel={()=>setVoidRow(null)}/>}

      <div id="ir-print-area">

        {/* ── Header ── */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:22,fontWeight:700,color:NAVY}}>Import Purchase</div>
            <div style={{fontSize:12,color:DIM,marginTop:2}}>
              {companyName} · FY {fiscalYear} · Charges allocated from Bank Ledger LC postings
            </div>
          </div>
          <div className="no-print" style={{display:"flex",gap:6}}>
            {onGoToBankCash && <button onClick={onGoToBankCash} style={{padding:"7px 12px",background:"#FFF",border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:NAVY}}>🏦 Bank &amp; Cash</button>}
            {onGoToPurchaseBook && <button onClick={onGoToPurchaseBook} style={{padding:"7px 12px",background:"#FFF",border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:NAVY}}>🛒 Purchase Register</button>}
            {onBack && <button onClick={onBack} style={{padding:"7px 12px",background:"#FFF",border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:NAVY}}>← Back</button>}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="no-print" style={{display:"flex",gap:0,borderBottom:"2px solid "+BORDER,marginBottom:16,flexWrap:"wrap"}}>
          {tabs.map(([k,label])=>(
            <button key={k} onClick={()=>setActiveTab(k)} style={{
              padding:"9px 16px",border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              background:activeTab===k?NAVY:"#FFF", color:activeTab===k?"#FFF":DIM,
              borderBottom:activeTab===k?"2px solid "+NAVY:"2px solid transparent",marginBottom:-2,
            }}>{label}</button>
          ))}
        </div>

        {postMsg && (
          <div style={{padding:10,marginBottom:14,fontSize:12,fontWeight:600,
            background:postMsg.startsWith("✅")?"#D4EDDA":"#FFF0F0",
            color:postMsg.startsWith("✅")?GREEN:ERR,
            border:"1px solid "+(postMsg.startsWith("✅")?"#C3E6CB":ERR)}}>
            {postMsg}
          </div>
        )}

        {/* ══════════════════════════════════════════
            PHASE I TAB
        ══════════════════════════════════════════ */}
        {activeTab==="phase1" && (
          <div style={{maxWidth:1000}}>
            {impVoucherDraft && (
              <div style={{padding:"10px 14px",marginBottom:14,background:LIGHT,
                border:"1px solid "+NAVY,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,fontWeight:700,color:NAVY}}>
                  Adding items to <span style={{fontFamily:"monospace"}}>{impVoucherDraft}</span>
                </span>
                <button onClick={finishBill} style={{padding:"6px 14px",background:GREEN,color:"#FFF",
                  border:"none",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                  ✓ Finish This Bill — Start New
                </button>
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:14}}>
              <div>
                <label className="sans" style={lbl}>ENTRY DATE *</label>
                <input type="date" value={p1.entry_date} onChange={e=>setP1({...p1,entry_date:e.target.value})} style={fld}/>
              </div>
              <div>
                <label className="sans" style={lbl}>PP NO (PRAGYAPAN PATRA)</label>
                <input value={p1.pp_no} onChange={e=>setP1({...p1,pp_no:e.target.value})} style={fld}/>
              </div>
              <div>
                <label className="sans" style={lbl}>SUPPLIER NAME *</label>
                <input list="ir-supplier-list" value={p1.supplier_name}
                  onChange={e=>setP1({...p1,supplier_name:e.target.value})} style={fld}/>
                <datalist id="ir-supplier-list">{parties.map(p=><option key={p.id} value={p.name}/>)}</datalist>
              </div>
              <div>
                <label className="sans" style={lbl}>
                  BANK LC NO (LC party) *
                  <span style={{marginLeft:6,color:GOLD,fontSize:8,fontWeight:400}}>
                    — loads allocable balances ↓
                  </span>
                </label>
                <select value={p1.bank_lc_no} onChange={e=>handleLcSelect(e.target.value)} style={fld}>
                  <option value="">— select LC party —</option>
                  {lcParties.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>
            </div>

            {p1.bank_lc_no && (
              <div style={{padding:"8px 12px",marginBottom:14,background:"#EDF3FB",
                border:"1px solid "+NAVY,fontSize:11,color:NAVY}}>
                <strong>LC: {p1.bank_lc_no}</strong> — every charge field below shows what's still
                allocable from this LC's posted Bank Ledger balance. Type how much of that balance
                applies to <em>this item</em>; the remaining drops accordingly and never goes negative.
              </div>
            )}

            {/* Item Details */}
            <div style={{background:"#FFF",border:"1px solid "+BORDER,padding:"14px 16px",marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:700,color:NAVY,marginBottom:10}}>ITEM DETAILS</div>

              <div style={{display:"grid",gridTemplateColumns:"1.6fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div>
                  <label className="sans" style={lbl}>ITEM NAME (Raw Material) *</label>
                  <input list="ir-item-list" value={p1.item_name}
                    onChange={e=>setP1({...p1,item_name:e.target.value})} style={fld}/>
                  <datalist id="ir-item-list">{materials.map(m=><option key={m.id} value={m.product_name}/>)}</datalist>
                </div>
                <div>
                  <label className="sans" style={lbl}>FCY CURRENCY</label>
                  <input value={p1.fcy_currency} onChange={e=>setP1({...p1,fcy_currency:e.target.value})} style={fld}/>
                </div>
                <div>
                  <label className="sans" style={lbl}>FCY RATE (PER UNIT)</label>
                  <input type="number" value={p1.fcy_rate}
                    onChange={e=>setP1({...p1,fcy_rate:e.target.value})} style={{...fld,textAlign:"right"}}/>
                </div>
                <div>
                  <label className="sans" style={lbl}>EXCHANGE RATE (NPR/FCY)</label>
                  <input type="number" value={p1.exchange_rate}
                    onChange={e=>setP1({...p1,exchange_rate:e.target.value})} style={{...fld,textAlign:"right"}}/>
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div>
                  <label className="sans" style={lbl}>QTY *</label>
                  <input type="number" value={p1.qty}
                    onChange={e=>setP1({...p1,qty:e.target.value})} style={{...fld,textAlign:"right"}}/>
                </div>
                <div>
                  <label className="sans" style={lbl}>MATERIAL VALUE (calc, reference only)</label>
                  <input value={fmtT(matVal)} readOnly
                    style={{...fld,textAlign:"right",background:LIGHT,color:DIM,fontWeight:600}}/>
                  <div style={{fontSize:9,marginTop:3,color:DIM}}>FCY Rate × Exchange Rate × Qty — does not post to GL.</div>
                </div>
                <AllocableField
                  label="MATERIAL VALUE PAID (actual)"
                  value={p1.material_value_paid}
                  onChange={v=>setP1({...p1,material_value_paid:v})}
                  remaining={lcBalances?.material_value_paid?.remaining ?? 0}
                  loading={lcBalancesLoading}
                  disabled={!p1.bank_lc_no}
                />
                <div>
                  <label className="sans" style={{...lbl, color: forexGainLoss>0?GREEN : forexGainLoss<0?ERR : undefined}}>
                    FOREX {forexGainLoss>=0 ? "GAIN" : "LOSS"} (auto)
                  </label>
                  <input value={(forexGainLoss>=0?"+":"")+fmtT(forexGainLoss)} readOnly
                    style={{...fld,textAlign:"right",background:forexGainLoss>0?"#F0FFF4":forexGainLoss<0?"#FFF0F0":LIGHT,
                      color:forexGainLoss>0?GREEN:forexGainLoss<0?ERR:DIM,fontWeight:700}}/>
                  <div style={{fontSize:9,marginTop:3,color:DIM}}>Calculated − Paid. {forexGainLoss>=0?"Paid less than calculated.":"Paid more than calculated."}</div>
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div>
                  <label className="sans" style={lbl}>IS TAXABLE?</label>
                  <select value={p1.is_taxable?"Yes":"No"}
                    onChange={e=>setP1({...p1,is_taxable:e.target.value==="Yes"})} style={fld}>
                    <option>Yes</option><option>No</option>
                  </select>
                </div>
                <div>
                  <label className="sans" style={lbl}>IS CAPITAL?</label>
                  <select value={p1.is_capital?"Yes":"No"}
                    onChange={e=>{ const c=e.target.value==="Yes"; setP1({...p1,is_capital:c}); setShowCapitalPanel(c); }}
                    style={fld}>
                    <option>No</option><option>Yes</option>
                  </select>
                </div>
              </div>

              {p1.is_capital && (
                <div style={{marginBottom:10}}>
                  <button onClick={()=>setShowCapitalPanel(!showCapitalPanel)}
                    style={{fontSize:10,color:NAVY,background:"none",border:"1px solid "+BORDER,
                      padding:"4px 10px",cursor:"pointer",fontFamily:"Arial"}}>
                    {showCapitalPanel?"▲ Hide Capital Item Details":"▼ Capital Item Details"}
                  </button>
                </div>
              )}
              {p1.is_capital && showCapitalPanel && (
                <div style={{padding:"12px 14px",background:"#F0F4FA",border:"1px solid "+NAVY,
                  marginBottom:10,display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10}}>
                  <div style={{gridColumn:"span 2"}}>
                    <label className="sans" style={lbl}>CAPITAL ITEM NAME *</label>
                    <input value={p1.cap_item_name} onChange={e=>setP1({...p1,cap_item_name:e.target.value})}
                      placeholder="e.g. Imported Generator" style={fld}/>
                  </div>
                  <div>
                    <label className="sans" style={lbl}>FA BLOCK</label>
                    <select value={p1.cap_sub_group}
                      onChange={e=>setP1({...p1,cap_sub_group:e.target.value,block_gl:FA_BLOCK_GL[e.target.value]||""})}
                      style={fld}>
                      {FA_BLOCKS.map(b=><option key={b}>{b}</option>)}
                    </select>
                  </div>
                  <div style={{gridColumn:"span 2"}}>
                    <label className="sans" style={lbl}>GL ACCOUNT (auto)</label>
                    <input value={p1.block_gl} onChange={e=>setP1({...p1,block_gl:e.target.value})}
                      style={{...fld,background:LIGHT,color:NAVY,fontWeight:700}}/>
                  </div>
                  <div>
                    <label className="sans" style={lbl}>DEP RATE %</label>
                    <input type="number" value={p1.dep_rate_pct}
                      onChange={e=>setP1({...p1,dep_rate_pct:e.target.value})} placeholder="e.g. 25" style={fld}/>
                  </div>
                  <div>
                    <label className="sans" style={lbl}>RESIDUAL VALUE %</label>
                    <input type="number" value={p1.residual_pct}
                      onChange={e=>setP1({...p1,residual_pct:e.target.value})} style={fld}/>
                  </div>
                </div>
              )}

              {/* ── Allocable charge fields — driven entirely by lcBalances ── */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <AllocableField
                  label="CUSTOM DUTY"
                  value={p1.custom_duty}
                  onChange={v=>setP1({...p1,custom_duty:v})}
                  remaining={lcBalances?.custom_duty?.remaining ?? 0}
                  loading={lcBalancesLoading}
                  disabled={!p1.bank_lc_no}
                />
                <AllocableField
                  label="EXCISE DUTY"
                  value={p1.excise_duty}
                  onChange={v=>setP1({...p1,excise_duty:v})}
                  remaining={lcBalances?.excise_duty?.remaining ?? 0}
                  loading={lcBalancesLoading}
                  disabled={!p1.bank_lc_no}
                />
                <AllocableField
                  label="OTHER DUTIES"
                  value={p1.other_duties}
                  onChange={v=>setP1({...p1,other_duties:v})}
                  remaining={lcBalances?.other_duties?.remaining ?? 0}
                  loading={lcBalancesLoading}
                  disabled={!p1.bank_lc_no}
                />
                <AllocableField
                  label="CUSTOM SERVICE CHARGE"
                  value={p1.custom_svc_chg}
                  onChange={v=>setP1({...p1,custom_svc_chg:v})}
                  remaining={lcBalances?.custom_svc_chg?.remaining ?? 0}
                  loading={lcBalancesLoading}
                  disabled={!p1.bank_lc_no}
                />
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10}}>
                <div>
                  <label className="sans" style={lbl}>VAT CLAIMABLE? (Yes=Input/No=Cost)</label>
                  <select value={p1.vat_claimable?"Yes":"No"}
                    onChange={e=>setP1({...p1,vat_claimable:e.target.value==="Yes"})} style={fld}>
                    <option>Yes</option><option>No</option>
                  </select>
                </div>
                <AllocableField
                  label="VAT AMOUNT"
                  value={p1.vat_amount}
                  onChange={v=>setP1({...p1,vat_amount:v})}
                  remaining={lcBalances?.vat_amount?.remaining ?? 0}
                  loading={lcBalancesLoading}
                  disabled={!p1.bank_lc_no}
                />
                <div>
                  <label className="sans" style={lbl}>TAXABLE AMOUNT (FROM CUSTOMS DOC) *</label>
                  <input type="number" value={p1.taxable_amount}
                    onChange={e=>setP1({...p1,taxable_amount:e.target.value})}
                    style={{...fld,textAlign:"right"}}/>
                  <div style={{fontSize:9,marginTop:3,color:DIM}}>
                    This is the Phase II apportionment base for this item.
                  </div>
                </div>
                <div>
                  <label className="sans" style={lbl}>STATISTICAL EXPENSES (auto)</label>
                  <input value={fmtT(statExp)} readOnly style={{...fld,textAlign:"right",background:LIGHT,color:DIM}}/>
                </div>
              </div>
            </div>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"12px 16px",background:NAVY,marginBottom:14}}>
              <span style={{color:"#FFF",fontWeight:700,fontSize:13}}>TOTAL PHASE I (this item's direct cost)</span>
              <span style={{color:"#FFD700",fontWeight:800,fontSize:16,fontFamily:"monospace"}}>Rs.{fmtT(totalPhase1)}</span>
            </div>

            {p1Msg && (
              <div style={{padding:10,marginBottom:14,fontSize:12,fontWeight:600,
                background:p1Msg.startsWith("✅")?"#D4EDDA":"#FFF0F0",
                color:p1Msg.startsWith("✅")?GREEN:ERR,
                border:"1px solid "+(p1Msg.startsWith("✅")?"#C3E6CB":ERR)}}>
                {p1Msg}
              </div>
            )}

            <button onClick={saveP1} disabled={savingP1}
              style={{padding:"12px 28px",background:savingP1?"#AAA":NAVY,color:"#FFF",
                border:"none",fontWeight:700,fontSize:13,cursor:savingP1?"not-allowed":"pointer",fontFamily:"Arial"}}>
              {savingP1?"Saving…":"+ Add Item to Bill"}
            </button>

            {/* ── Live Bill Items Grid ── */}
            {(billItems.length > 0 || billItemsLoading) && (
              <div style={{marginTop:22}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                  <div style={{fontSize:12,fontWeight:700,color:NAVY}}>
                    ITEMS ADDED TO THIS BILL
                    {impVoucherDraft && (
                      <span style={{marginLeft:8,fontFamily:"monospace",fontSize:11,
                        color:"#FFF",background:NAVY,padding:"2px 8px",borderRadius:2}}>
                        {impVoucherDraft}
                      </span>
                    )}
                  </div>
                  {billItemsLoading && <span style={{fontSize:11,color:DIM,fontStyle:"italic"}}>Refreshing…</span>}
                </div>

                {(() => {
                  const enriched = billItems.map(r => {
                    const taxable = r.taxable_amount || 0;
                    const vatShow = r.vat_claimable ? (r.vat_amount||0) : 0;
                    const lineTotal = Math.round((taxable + vatShow)*100)/100;
                    return {...r, _taxable:taxable, _vatShow:vatShow, _lineTotal:lineTotal};
                  });
                  const gt = enriched.reduce((a,r)=>({
                    qty:a.qty+(r.qty||0), taxable:a.taxable+r._taxable, vat:a.vat+r._vatShow,
                    lineTotal:a.lineTotal+r._lineTotal, phase1:a.phase1+(r.total_phase1||0),
                    forex:a.forex+(r.forex_gain_loss||0),
                  }),{qty:0,taxable:0,vat:0,lineTotal:0,phase1:0,forex:0});

                  return (
                    <div style={{overflowX:"auto",border:"1px solid "+BORDER,borderRadius:2}}>
                      <table style={{borderCollapse:"collapse",width:"100%",minWidth:1020}}>
                        <thead>
                          <tr>
                            <th style={{...TH,width:26}}>#</th>
                            <th style={TH}>ITEM NAME</th>
                            <th style={THR}>QTY</th>
                            <th style={{...THR,background:"#1E4876"}}>TAXABLE VAL</th>
                            <th style={{...THR,background:"#1E4876",color:"#A8F0BB"}}>VAT</th>
                            <th style={{...THR,background:"#1E4876"}}>TOTAL</th>
                            <th style={THR}>FOREX G/L</th>
                            <th style={{...THR,background:"#0F2840"}}>PHASE I TOTAL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {enriched.map((r,i)=>{
                            const fx = r.forex_gain_loss || 0;
                            return (
                            <tr key={r.id} style={{background:i%2===0?"#FFF":"#FAFAFA"}}>
                              <td style={{...TD,color:DIM,textAlign:"center",fontSize:10}}>{i+1}</td>
                              <td style={TD}>
                                <span style={{fontWeight:600}}>{r.item_name}</span>
                                {r.is_capital && <span style={{marginLeft:5,fontSize:8,padding:"1px 5px",background:"#E6F1FB",color:"#0C447C",borderRadius:2,fontWeight:700}}>CAP</span>}
                              </td>
                              <td style={TDR}>{fmtT(r.qty)}</td>
                              <td style={{...TDR,background:"#EDF3FB"}}>{fmtT(r._taxable)}</td>
                              <td style={{...TDR,background:"#EDF3FB",color:GREEN}}>{r._vatShow>0?fmtT(r._vatShow):<span style={{color:"#CCC"}}>—</span>}</td>
                              <td style={{...TDR,background:"#EDF3FB",fontWeight:700}}>{fmtT(r._lineTotal)}</td>
                              <td style={{...TDR,color:fx>0?GREEN:fx<0?ERR:DIM}}>
                                {Math.abs(fx)>0.004 ? (fx>=0?"+":"")+fmtT(fx) : <span style={{color:"#CCC"}}>—</span>}
                              </td>
                              <td style={{...TDR,background:"#F0F4FA",fontWeight:700,color:NAVY}}>{fmtT(r.total_phase1)}</td>
                            </tr>
                          );})}
                        </tbody>
                        <tfoot>
                          <tr style={{background:"#0F2840"}}>
                            <td colSpan={3} style={{padding:"7px 8px",fontSize:11,fontWeight:700,color:"#FFF",background:"#0F2840"}}>
                              TOTAL ({enriched.length} item{enriched.length!==1?"s":""})
                            </td>
                            <td style={{padding:"7px 8px",textAlign:"right",fontFamily:"monospace",fontSize:11,fontWeight:700,color:"#FFD700",background:"#1E4876"}}>{fmtT(gt.taxable)}</td>
                            <td style={{padding:"7px 8px",textAlign:"right",fontFamily:"monospace",fontSize:11,fontWeight:700,color:"#A8F0BB",background:"#1E4876"}}>{fmtT(gt.vat)}</td>
                            <td style={{padding:"7px 8px",textAlign:"right",fontFamily:"monospace",fontSize:12,fontWeight:800,color:"#FFD700",background:"#1E4876"}}>{fmtT(gt.lineTotal)}</td>
                            <td style={{padding:"7px 8px",textAlign:"right",fontFamily:"monospace",fontSize:11,fontWeight:700,color:gt.forex>0?"#A8F0BB":gt.forex<0?"#FFB3A8":"#FFF",background:"#0F2840"}}>{(gt.forex>=0?"+":"")+fmtT(gt.forex)}</td>
                            <td style={{padding:"7px 8px",textAlign:"right",fontFamily:"monospace",fontSize:12,fontWeight:800,color:"#FFD700",background:"#0F2840"}}>{fmtT(gt.phase1)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  );
                })()}

                {billItems.length > 0 && (
                  <div style={{marginTop:10,padding:"10px 14px",background:"#FFFBEA",
                    border:"1px solid #D4A820",display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:12,color:"#856404"}}>
                      ✓ All items added? Move to <strong>② Phase II — Landed Cost</strong> once this PP No's Phase I is done.
                    </span>
                    <button onClick={()=>setActiveTab("phase2")}
                      style={{padding:"6px 14px",background:GOLD,color:"#FFF",border:"none",
                        fontWeight:700,fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>
                      → Go to Phase II
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════
            PHASE II TAB — LC + PP No selector
        ══════════════════════════════════════════ */}
        {activeTab==="phase2" && (
          <div style={{maxWidth:1040}}>
            <div style={{fontSize:12,color:DIM,marginBottom:14}}>
              Select the LC, then the specific PP No to settle. Shared charges are allocated from the
              LC's posted Bank Ledger balance and apportioned across <strong>every item under this LC</strong> by
              each item's (Taxable Amount + cost-VAT) share — not just items on the PP No you're settling.
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              <div>
                <label className="sans" style={lbl}>SELECT LC *</label>
                <select value={p2LcName} onChange={e=>{ setP2LcName(e.target.value); setP2PpNo(""); }} style={fld}>
                  <option value="">— select LC —</option>
                  {lcParties.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="sans" style={lbl}>SELECT PP NO TO SETTLE *</label>
                <select value={p2PpNo} onChange={e=>setP2PpNo(e.target.value)} style={fld} disabled={!p2LcName}>
                  <option value="">— select PP No —</option>
                  {openPpGroups.map(g=>(
                    <option key={g.pp_no+g.imp_voucher} value={g.pp_no}>
                      {g.pp_no} — {g.imp_voucher} ({g.item_count} items, base Rs.{fmtT(g.total_taxable_base)})
                    </option>
                  ))}
                </select>
                {p2LcName && openPpGroups.length===0 && (
                  <div style={{fontSize:10,color:DIM,marginTop:4}}>No open PP Nos for this LC — all settled, or none entered yet.</div>
                )}
              </div>
            </div>

            {p2Preview && p2Preview.length>0 && (
              <div style={{background:"#FFF",border:"1px solid "+BORDER,padding:"10px 14px",marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:NAVY,marginBottom:6}}>
                  APPORTIONMENT PREVIEW — all items under LC {p2LcName} (by Taxable + cost-VAT share)
                </div>
                {p2Preview.map((p,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0"}}>
                    <span style={{color:"#333"}}>{p.item_name} <span style={{color:DIM,fontSize:10}}>({p.pp_no})</span></span>
                    <span style={{fontFamily:"monospace",color:DIM}}>
                      Rs.{fmtT(p.base)} · <strong style={{color:PURPLE}}>{(p.share*100).toFixed(1)}%</strong> share
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{background:"#FFF",border:"1px solid "+BORDER,padding:"14px 16px",marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:700,color:PURPLE,marginBottom:10}}>SHARED LANDED COSTS — allocated from LC balance</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10}}>
                {P2_CHARGE_FIELDS.map(([key,label])=>(
                  <AllocableField
                    key={key}
                    label={label}
                    value={p2Charges[key]}
                    onChange={v=>setP2Charges({...p2Charges,[key]:v})}
                    remaining={lcP2Balances?.[key]?.remaining ?? 0}
                    loading={lcP2BalancesLoading}
                    disabled={!p2LcName}
                  />
                ))}
                <div>
                  <label className="sans" style={lbl}>VAT IS COST? (apportion vs. separate Input voucher)</label>
                  <select value={p2VatIsCost?"Yes":"No"} onChange={e=>setP2VatIsCost(e.target.value==="Yes")} style={fld}>
                    <option value="No">No — Claimable Input (separate ADV voucher)</option>
                    <option value="Yes">Yes — Cost (apportioned with other charges)</option>
                  </select>
                </div>
                <AllocableField
                  label="PHASE II VAT"
                  value={p2Vat}
                  onChange={setP2Vat}
                  remaining={lcP2Balances?.p2_vat?.remaining ?? 0}
                  loading={lcP2BalancesLoading}
                  disabled={!p2LcName}
                />
              </div>
              {!p2VatIsCost && parseFloat(p2Vat)>0 && (
                <div style={{marginTop:10,fontSize:10,color:DIM,fontStyle:"italic"}}>
                  This VAT will NOT be apportioned — it posts under a new Additional Voucher (ADV-) tied to {openPpGroups.find(g=>g.pp_no===p2PpNo)?.imp_voucher || "the Phase I voucher"}, visible only in Import Register.
                </div>
              )}
            </div>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"12px 16px",background:PURPLE,marginBottom:14}}>
              <span style={{color:"#FFF",fontWeight:700,fontSize:13}}>TOTAL PHASE II (this allocation)</span>
              <span style={{color:"#FFD700",fontWeight:800,fontSize:16,fontFamily:"monospace"}}>Rs.{fmtT(totalP2)}</span>
            </div>

            {p2Msg && (
              <div style={{padding:10,marginBottom:14,fontSize:12,fontWeight:600,
                background:p2Msg.startsWith("✅")?"#D4EDDA":"#FFF0F0",
                color:p2Msg.startsWith("✅")?GREEN:ERR,
                border:"1px solid "+(p2Msg.startsWith("✅")?"#C3E6CB":ERR)}}>
                {p2Msg}
              </div>
            )}

            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>saveP2(false)} disabled={savingP2||!p2LcName||!p2PpNo}
                style={{padding:"12px 28px",background:savingP2||!p2LcName||!p2PpNo?"#AAA":PURPLE,color:"#FFF",
                  border:"none",fontWeight:700,fontSize:13,cursor:savingP2||!p2LcName||!p2PpNo?"not-allowed":"pointer",fontFamily:"Arial"}}>
                {savingP2?"Posting…":"✓ Save & Allocate Phase II"}
              </button>
              <button onClick={()=>saveP2(true)} disabled={savingP2||!p2LcName||!p2PpNo}
                style={{padding:"12px 20px",background:"#FFF",color:DIM,
                  border:"1px solid "+BORDER,fontWeight:600,fontSize:12,cursor:savingP2||!p2LcName||!p2PpNo?"not-allowed":"pointer",fontFamily:"Arial"}}>
                Mark N/A (no shared costs)
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            IMPORT REGISTER TAB — simplified Taxable+VAT
        ══════════════════════════════════════════ */}
        {activeTab==="register" && (
          <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:18}}>
              {[
                {label:"IMPORT ENTRIES",  value:rows.length+" items", sub:"all items"},
                {label:"IMPORT TAXABLE",  value:"Rs."+fmtT(totals.importTaxable), sub:"this filter"},
                {label:"IMPORT VAT",      value:"Rs."+fmtT(totals.importVat), sub:"claimable", color:GREEN},
                {label:"GRAND TOTAL",     value:"Rs."+fmtT(totals.grand), sub:"taxable+VAT+capital", color:NAVY,bold:true},
              ].map((c,i)=>(
                <div key={i} style={{background:"#FFF",border:"1px solid "+BORDER,padding:"13px 14px 11px"}}>
                  <div style={{fontSize:9,letterSpacing:"0.1em",fontWeight:700,color:DIM,marginBottom:6}}>{c.label}</div>
                  <div style={{fontSize:15,fontWeight:c.bold?800:700,color:c.color||NAVY,fontFamily:"monospace"}}>{c.value}</div>
                  <div style={{fontSize:10,color:DIM,marginTop:2}}>{c.sub}</div>
                </div>
              ))}
            </div>

            <div className="no-print" style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                {["All","Taxable","Capital","Non-Taxable"].map(t=>(
                  <button key={t} onClick={()=>setFilterType(t)} style={{
                    padding:"6px 13px",fontWeight:600,fontSize:12,cursor:"pointer",
                    border:"1px solid "+(filterType===t?NAVY:BORDER),
                    background:filterType===t?NAVY:"#FFF",color:filterType===t?"#FFF":NAVY,
                  }}>{t}</button>
                ))}
                <input value={search} onChange={e=>setSearch(e.target.value)}
                  placeholder="Search supplier, item, LC, PP No…"
                  style={{width:220,padding:"7px 12px",border:"1px solid "+BORDER,fontSize:12}}/>
                <span style={{fontSize:12,color:DIM}}>{filtered.length} items</span>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={exportRegisterCSV} style={{padding:"7px 14px",background:"#FFF",
                  border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:GREEN}}>↓ CSV</button>
                <button onClick={fetchRows} style={{padding:"7px 12px",background:"#FFF",
                  border:"1px solid "+BORDER,cursor:"pointer",fontSize:13}}>⟳</button>
              </div>
            </div>

            {loading ? (
              <div style={{padding:40,textAlign:"center",color:DIM}}>Loading…</div>
            ) : error ? (
              <div style={{padding:12,color:ERR,background:"#FFF0F0",border:"1px solid "+ERR}}>{error}</div>
            ) : (
              <div style={{overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",width:"100%",minWidth:1000}}>
                  <thead>
                    <tr>
                      <th style={TH}>DATE</th>
                      <th style={TH}>IMP VOUCHER</th>
                      <th style={TH}>PP NO</th>
                      <th style={TH}>SUPPLIER</th>
                      <th style={TH}>ITEM NAME</th>
                      <th style={THR}>QTY</th>
                      <th style={{...TH,background:"#1E4876",textAlign:"right"}}>IMP TAXABLE</th>
                      <th style={{...TH,background:"#1E4876",textAlign:"right"}}>IMP VAT</th>
                      <th style={{...TH,background:"#1E4876",textAlign:"right"}}>IMP TOTAL</th>
                      <th style={THCR}>CAP TAXABLE</th>
                      <th style={THCR}>CAP VAT</th>
                      <th style={THCR}>CAP TOTAL</th>
                      <th style={THR}>STATUS</th>
                      {canVoid&&<th style={{...TH,background:"#5A3030",textAlign:"center"}}>ACT</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r,i)=>(
                      <tr key={r.id} style={{background:i%2===0?"#FFF":"#FAFAFA"}}>
                        <td style={TD}>{r.entry_date}</td>
                        <td style={{...TD,fontFamily:"monospace",fontWeight:700,color:NAVY}}>{r.imp_voucher}</td>
                        <td style={{...TD,color:DIM,fontSize:10}}>{r.pp_no||"—"}</td>
                        <td style={TD}>{r.supplier_name}</td>
                        <td style={TD}>
                          {r.item_name}
                          {r.is_capital&&<span style={{marginLeft:5,fontSize:8,padding:"1px 5px",background:"#E6F1FB",color:"#0C447C",borderRadius:2,fontWeight:700}}>CAP</span>}
                        </td>
                        <td style={TDR}>{r.qty}</td>
                        <td style={{...TDR,background:"#EDF3FB",fontWeight:600}}>{fmt(r.import_taxable)}</td>
                        <td style={{...TDR,background:"#EDF3FB",color:GREEN,fontWeight:600}}>{fmt(r.import_vat)}</td>
                        <td style={{...TDR,background:"#EDF3FB",fontWeight:700}}>{fmt(r.import_total)}</td>
                        <td style={TDCR}>{fmt(r.cap_taxable)}</td>
                        <td style={TDCR}>{fmt(r.cap_vat)}</td>
                        <td style={{...TDCR,fontWeight:700}}>{fmt(r.cap_total)}</td>
                        <td style={{...TD,fontSize:9,textAlign:"center"}}>
                          <span style={{padding:"2px 6px",borderRadius:2,fontWeight:700,
                            background:r.overall_status==="Complete"?"#D4EDDA":"#FFF3CD",
                            color:r.overall_status==="Complete"?GREEN:"#856404"}}>{r.overall_status}</span>
                        </td>
                        {canVoid&&(
                          <td style={{...TD,textAlign:"center"}}>
                            {!r.is_void&&<button onClick={()=>setVoidRow(r)} style={{padding:"2px 7px",fontSize:9,fontWeight:700,
                              background:"#FFF",color:ERR,border:"1px solid "+ERR,cursor:"pointer"}}>✕</button>}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{background:NAVY}}>
                      <td colSpan={6} style={{...TD,fontWeight:700,color:"#FFF",background:NAVY}}>TOTAL ({filtered.length} items)</td>
                      <td style={{...TDR,fontWeight:800,color:"#FFD700",background:"#1E4876"}}>{fmtT(totals.importTaxable)}</td>
                      <td style={{...TDR,fontWeight:800,color:"#A8F0BB",background:"#1E4876"}}>{fmtT(totals.importVat)}</td>
                      <td style={{...TDR,fontWeight:800,color:"#FFD700",background:"#1E4876"}}>{fmtT(totals.importTotal)}</td>
                      <td style={{...TDR,fontWeight:800,color:"#FFD700",background:CAP_BG}}>{fmtT(totals.capTaxable)}</td>
                      <td style={{...TDR,fontWeight:800,color:"#A8F0BB",background:CAP_BG}}>{fmtT(totals.capVat)}</td>
                      <td style={{...TDR,fontWeight:800,color:"#FFD700",background:CAP_BG}}>{fmtT(totals.capTotal)}</td>
                      <td style={{background:NAVY}}/>
                      {canVoid&&<td style={{background:NAVY}}/>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════
            LANDED COST REGISTER TAB — full breakdown
        ══════════════════════════════════════════ */}
        {activeTab==="landed-cost" && (
          <>
            <div style={{fontSize:12,color:DIM,marginBottom:14}}>
              Full charge-by-charge breakdown: Party, LC No, PP No, Item, Material Value, every direct
              Phase I charge, VAT (flagged Input vs Cost), and Total Phase I Cost — per item.
            </div>

            <div className="no-print" style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:12,color:DIM}}>From (AD)</span>
                <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{padding:"6px 8px",border:"1px solid "+BORDER,fontSize:12}}/>
                <span style={{fontSize:12,color:DIM}}>To</span>
                <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{padding:"6px 8px",border:"1px solid "+BORDER,fontSize:12}}/>
                <input value={search} onChange={e=>setSearch(e.target.value)}
                  placeholder="Search party, LC, PP No, item…"
                  style={{width:220,padding:"7px 12px",border:"1px solid "+BORDER,fontSize:12}}/>
                <span style={{fontSize:12,color:DIM}}>{filteredLanded.length} items</span>
              </div>
              <button onClick={exportLandedCSV} style={{padding:"7px 14px",background:"#FFF",
                border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:GREEN}}>↓ CSV</button>
            </div>

            {loading ? (
              <div style={{padding:40,textAlign:"center",color:DIM}}>Loading…</div>
            ) : (
              <div style={{overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",width:"100%",minWidth:1750}}>
                  <thead>
                    <tr>
                      <th style={TH}>LC NO</th>
                      <th style={TH}>PP NO</th>
                      <th style={TH}>IMP VOUCHER</th>
                      <th style={TH}>PARTY NAME</th>
                      <th style={TH}>ITEM NAME</th>
                      <th style={THR}>QTY</th>
                      <th style={THR}>MAT VALUE (calc)</th>
                      <th style={{...THR,background:"#1E4876"}}>MAT VALUE PAID</th>
                      <th style={THR}>FOREX G/L</th>
                      <th style={THR}>CUST DUTY</th>
                      <th style={THR}>EXCISE DUTY</th>
                      <th style={THR}>OTHER DUTIES</th>
                      <th style={THR}>SVC CHG</th>
                      <th style={THR}>VAT</th>
                      <th style={TH}>VAT TREATMENT</th>
                      <th style={{...THR,background:"#1E4876"}}>TOTAL PHASE I</th>
                      <th style={THR}>PHASE II</th>
                      <th style={{...THR,background:"#0F2840"}}>TOTAL LANDED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLanded.map((r,i)=>{
                      const fx = r.forex_gain_loss || 0;
                      return (
                      <tr key={r.id} style={{background:i%2===0?"#FFF":"#FAFAFA"}}>
                        <td style={{...TD,color:PURPLE,fontSize:10}}>{r.bank_lc_no}</td>
                        <td style={{...TD,fontSize:10}}>{r.pp_no}</td>
                        <td style={{...TD,fontFamily:"monospace",fontWeight:700,color:NAVY}}>{r.imp_voucher}</td>
                        <td style={TD}>{r.supplier_name}</td>
                        <td style={TD}>
                          {r.item_name}
                          {r.is_capital&&<span style={{marginLeft:5,fontSize:8,padding:"1px 5px",background:"#E6F1FB",color:"#0C447C",borderRadius:2,fontWeight:700}}>CAP</span>}
                        </td>
                        <td style={TDR}>{r.qty}</td>
                        <td style={{...TDR,color:DIM}}>{fmt(r.material_value)}</td>
                        <td style={{...TDR,background:"#EDF3FB",fontWeight:600}}>{fmt(r.material_value_paid)}</td>
                        <td style={{...TDR,color:fx>0?GREEN:fx<0?ERR:DIM}}>
                          {Math.abs(fx)>0.004 ? (fx>=0?"+":"")+fmt(fx) : <span style={{color:"#CCC"}}>—</span>}
                        </td>
                        <td style={TDR}>{fmt(r.custom_duty)}</td>
                        <td style={TDR}>{fmt(r.excise_duty)}</td>
                        <td style={TDR}>{fmt(r.other_duties)}</td>
                        <td style={TDR}>{fmt(r.custom_svc_chg)}</td>
                        <td style={TDR}>{fmt(r.vat_amount)}</td>
                        <td style={{...TD,fontSize:9,color:r.vat_claimable?GREEN:ERR}}>{r.vat_treatment}</td>
                        <td style={{...TDR,background:"#EDF3FB",fontWeight:700}}>{fmt(r.total_phase1)}</td>
                        <td style={TDR}>{fmt(r.p2_total)}</td>
                        <td style={{...TDR,background:"#F0F4FA",fontWeight:800,color:NAVY}}>{fmt(r.total_landed_cost)}</td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════
            VAT SUMMARY TAB
        ══════════════════════════════════════════ */}
        {activeTab==="vat-summary" && (
          <>
            <div className="no-print" style={{display:"flex",gap:0,marginBottom:16}}>
              {[["month","By Month"],["supplier","By Supplier"]].map(([k,label])=>(
                <button key={k} onClick={()=>setVatView(k)} style={{
                  padding:"8px 18px",border:"1px solid "+BORDER,cursor:"pointer",fontSize:12,fontWeight:600,
                  background:vatView===k?GOLD:"#FFF",color:vatView===k?"#FFF":DIM,
                }}>{label}</button>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:18}}>
              {[
                {label:"IMPORT TAXABLE",  value:"Rs."+fmtT(totals.importTaxable), color:NAVY},
                {label:"IMPORT VAT",      value:"Rs."+fmtT(totals.importVat), color:GREEN},
                {label:"CAP TAXABLE",     value:"Rs."+fmtT(totals.capTaxable), color:CAP_BG},
                {label:"GRAND TOTAL",     value:"Rs."+fmtT(totals.grand), color:NAVY,bold:true},
              ].map((c,i)=>(
                <div key={i} style={{background:"#FFF",border:"1px solid "+BORDER,padding:"13px 14px 11px"}}>
                  <div style={{fontSize:9,letterSpacing:"0.1em",fontWeight:700,color:DIM,marginBottom:6}}>{c.label}</div>
                  <div style={{fontSize:14,fontWeight:c.bold?800:700,color:c.color,fontFamily:"monospace"}}>{c.value}</div>
                </div>
              ))}
            </div>

            {vatView==="month" ? (
              <div style={{overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",width:"100%",minWidth:800}}>
                  <thead>
                    <tr>
                      <th style={TH}>MONTH</th>
                      <th style={THR}>IMP TAXABLE</th>
                      <th style={{...THR,color:"#A8F0BB"}}>IMP VAT</th>
                      <th style={THCR}>CAP TAXABLE</th>
                      <th style={THCR}>CAP VAT</th>
                      <th style={{...THR,background:"#0F2840"}}>GRAND TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(vatMonth).sort(([a],[b])=>a.localeCompare(b)).map(([month,v],i)=>(
                      <tr key={month} style={{background:i%2===0?"#FFF":"#FAFAFA"}}>
                        <td style={{...TD,fontWeight:700,color:NAVY}}>{month}</td>
                        <td style={TDR}>{fmt(v.taxable)}</td>
                        <td style={{...TDR,color:GREEN}}>{fmt(v.vat)}</td>
                        <td style={TDCR}>{fmt(v.capTaxable)}</td>
                        <td style={TDCR}>{fmt(v.capVat)}</td>
                        <td style={{...TDR,fontWeight:800,color:NAVY}}>{fmt(v.grand)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",width:"100%",minWidth:900}}>
                  <thead>
                    <tr>
                      <th style={TH}>SUPPLIER</th>
                      <th style={THR}>TXNS</th>
                      <th style={THR}>IMP TAXABLE</th>
                      <th style={{...THR,color:"#A8F0BB"}}>IMP VAT</th>
                      <th style={THCR}>CAP TAXABLE</th>
                      <th style={THCR}>CAP VAT</th>
                      <th style={{...THR,background:"#0F2840"}}>GRAND TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierRows.map((v,i)=>(
                      <tr key={v.name} style={{background:i%2===0?"#FFF":"#FAFAFA"}}>
                        <td style={{...TD,fontWeight:600}}>{v.name}</td>
                        <td style={{...TDR,color:DIM}}>{v.txns}</td>
                        <td style={TDR}>{fmt(v.taxable)}</td>
                        <td style={{...TDR,color:GREEN}}>{fmt(v.vat)}</td>
                        <td style={TDCR}>{fmt(v.capTaxable)}</td>
                        <td style={TDCR}>{fmt(v.capVat)}</td>
                        <td style={{...TDR,fontWeight:800,color:NAVY}}>{fmt(v.grand)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════
            VOIDED TAB
        ══════════════════════════════════════════ */}
        {activeTab==="voided" && (
          voidedRows.length===0 ? (
            <div style={{padding:30,textAlign:"center",color:DIM,background:"#FFF",border:"1px solid "+BORDER}}>
              No voided import items.
            </div>
          ) : (
            <div style={{overflowX:"auto"}}>
              <table style={{borderCollapse:"collapse",width:"100%"}}>
                <thead>
                  <tr>
                    {["VOUCHER","ITEM","QTY","TAXABLE","VOIDED BY","REASON"].map(h=>(
                      <th key={h} style={{padding:"7px 8px",fontSize:9,fontWeight:700,color:"#FFF",background:"#7B3030",whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {voidedRows.map((r,i)=>(
                    <tr key={r.id} style={{background:i%2===0?"#FFF8F8":"#FFF0F0"}}>
                      <td style={{padding:"8px",fontSize:11,borderBottom:"1px solid "+BORDER,fontFamily:"monospace",fontWeight:700,color:ERR,textDecoration:"line-through"}}>{r.imp_voucher}</td>
                      <td style={{padding:"8px",fontSize:11,borderBottom:"1px solid "+BORDER,color:DIM,textDecoration:"line-through"}}>{r.item_name}</td>
                      <td style={{padding:"8px",fontSize:11,borderBottom:"1px solid "+BORDER,textAlign:"right"}}>{r.qty}</td>
                      <td style={{padding:"8px",fontSize:11,borderBottom:"1px solid "+BORDER,fontFamily:"monospace",textAlign:"right"}}>{fmtT(r.taxable_amount)}</td>
                      <td style={{padding:"8px",fontSize:11,borderBottom:"1px solid "+BORDER}}>{r.voided_by||"—"}</td>
                      <td style={{padding:"8px",fontSize:11,borderBottom:"1px solid "+BORDER}}>{r.void_reason||"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

      </div>
    </div>
  );
}
