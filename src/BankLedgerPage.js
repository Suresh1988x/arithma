import { useState, useEffect, useCallback, useRef } from "react";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";
const NAVY    = "#1B3A5C";
const BORDER  = "#D6D0C2";
const DIM     = "#6B645A";
const ERR     = "#A8453B";
const GREEN   = "#2E7D4F";
const CREAM   = "#F7F4ED";
const LIGHT   = "#EDF3FB";
const GOLD    = "#B8860B";

// Structural classification — what the transaction NEEDS as input,
// not what kind of party it is. "Party" covers every party type
// (Customer/Vendor/Staff/LC/TDS/Share Capital/Directors/Payables/
// LTL/STL/any future addition) — the actual party type is picked
// separately once "Party" is selected, and is read live from the
// party_types table so the dropdown never needs a code change.
const ENTRY_TYPES = ["GL","Party","Contra"];
const ENTRY_TYPE_LABELS = {
  GL:     "GL — General Ledger",
  Party:  "Party — Customer / Vendor / Staff / etc.",
  Contra: "Contra — Bank ↔ Bank / Cash",
};
const ENTRY_TYPE_COLORS = {
  GL:"#534AB7", Party:"#2E7D4F", Contra:"#444441", SPLIT:"#1B3A5C",
};
// Fallback color palette for party types beyond the well-known ones,
// matching the same deterministic-hash approach used in PartyLedgerPage.
const KNOWN_PARTY_TYPE_COLOR = {
  Customer:"#2E7D4F", Vendor:"#A8453B", Staff:"#B8860B", TDS:"#6B2FA0",
};
const LC_TAG_COLOR = "#0F6E56"; // badge color for the LC No. tag shown on a row, independent of party type
const FALLBACK_TYPE_PALETTE = ["#B8742E","#1D6FA8","#5B4FC4","#1E8E5A","#C23B5E","#8A6D3B"];
function getPartyTypeColor(typeName) {
  if (!typeName) return DIM;
  if (KNOWN_PARTY_TYPE_COLOR[typeName]) return KNOWN_PARTY_TYPE_COLOR[typeName];
  let hash = 0;
  for (let i = 0; i < typeName.length; i++) hash = (hash * 31 + typeName.charCodeAt(i)) >>> 0;
  return FALLBACK_TYPE_PALETTE[hash % FALLBACK_TYPE_PALETTE.length];
}

const LC_CHARGE_TYPES = [
  "Material Value", "Import Freight", "Import Duty", "CSC", "VAT",
  "Agent Commission", "Local Freight", "Packing & Forwarding",
  "Bank Charges", "Insurance",
];

function fmt(n, dec=2) {
  const v=Number(n)||0; if(v===0) return "";
  return v.toLocaleString("en-IN",{minimumFractionDigits:dec,maximumFractionDigits:dec});
}
function fmtT(n) {
  return (Number(n)||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtBal(n) {
  const v=Number(n)||0;
  const abs=Math.abs(v).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
  if(v===0) return <span style={{color:DIM}}>0.00</span>;
  return v>0
    ? <span style={{color:NAVY,fontWeight:700}}>{abs} Dr</span>
    : <span style={{color:ERR,fontWeight:700}}>{abs} Cr</span>;
}

const fld = {padding:"7px 9px",border:"1px solid "+BORDER,background:"#FFF",
  fontSize:12,width:"100%",boxSizing:"border-box"};
const fldAuto = {...fld,background:"#F2EEE2",color:DIM};
const lbl = {fontSize:9,letterSpacing:"0.1em",color:DIM,fontWeight:700,
  display:"block",marginBottom:3};

const PRINT_CSS = `@media print{
body *{visibility:hidden!important;}
#bl-print-area,#bl-print-area *{visibility:visible!important;}
#bl-print-area{position:absolute;left:0;top:0;width:100%;font-family:Arial;font-size:8px;padding:8mm;box-sizing:border-box;}
.no-print{display:none!important;}
table{border-collapse:collapse;width:100%;}
th{background:#1B3A5C!important;color:#fff!important;-webkit-print-color-adjust:exact;padding:3px 5px;font-size:8px;}
td{padding:2px 5px;border-bottom:1px solid #eee;font-size:8px;}
@page{size:A4 landscape;margin:8mm;}}`;
function injectPrint(){
  if(document.getElementById("bl-css"))return;
  const s=document.createElement("style");s.id="bl-css";s.textContent=PRINT_CSS;
  document.head.appendChild(s);
}

// ── GL Voucher Modal — Dr/Cr journal entry with Prepared/Approved footer ──
// ── GL Voucher Modal — formal printable journal voucher ──────────
const VOUCHER_PRINT_CSS = `@media print{
body *{visibility:hidden!important;}
#bl-print-area{display:none!important;}
#voucher-print-area,#voucher-print-area *{visibility:visible!important;}
.voucher-overlay,.voucher-card,.voucher-scroll{
  position:static!important;width:100%!important;max-width:none!important;
  height:auto!important;max-height:none!important;overflow:visible!important;
  background:#FFF!important;padding:0!important;display:block!important;
}
#voucher-print-area{
  position:absolute;left:0;top:0;width:100%;
  box-sizing:border-box;padding:0!important;margin:0!important;
  background:#FFF;z-index:99999;
}
#voucher-print-area table{width:100%!important;}
.voucher-chrome{display:none!important;}
@page{size:A4;margin:14mm;}}`;
function injectVoucherPrint(){
  if(document.getElementById("vch-css")) return;
  const s=document.createElement("style"); s.id="vch-css"; s.textContent=VOUCHER_PRINT_CSS;
  document.head.appendChild(s);
}

function VoucherModal({ uniqueId, companyId, companyName, fiscalYear, session, isSuperAdmin, onClose }) {
  const [voucher,  setVoucher]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [approving,setApproving]= useState(false);
  injectVoucherPrint();

  const fetchVoucher = async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch(BACKEND+"/api/gl-book/voucher/"+uniqueId+"?company_id="+companyId);
      const d = await r.json();
      if(!r.ok || d.error) setError(d.error || "Server error (status "+r.status+")");
      else setVoucher(d);
    } catch(err) {
      setError("Network error: "+err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(()=>{ fetchVoucher(); /* eslint-disable-next-line */ },[uniqueId]);

  const approve = async () => {
    setApproving(true);
    try {
      const r = await fetch(BACKEND+"/api/gl-book/voucher/"+uniqueId+"/approve",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({company_id:companyId,requesting_user_id:session?.user?.id}),
      });
      const d = await r.json();
      if(d.success) fetchVoucher();
      else setError(d.error||"Approval failed");
    } catch(err) {
      setError("Network error: "+err.message);
    } finally {
      setApproving(false);
    }
  };

  const todayStr = new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});

  return (
    <div className="voucher-overlay" style={{position:"fixed",inset:0,background:"rgba(20,22,28,0.6)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20}}
      onClick={onClose}>
      <div className="voucher-card" onClick={e=>e.stopPropagation()} style={{background:"#FFF",width:"min(680px,94vw)",
        boxShadow:"0 16px 48px rgba(0,0,0,0.3)",overflow:"hidden",
        maxHeight:"92vh",display:"flex",flexDirection:"column"}}>

        {/* Modal chrome — hidden on print */}
        <div className="voucher-chrome" style={{background:NAVY,padding:"12px 20px",display:"flex",
          justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:"#FFF",fontWeight:700,fontSize:14,fontFamily:"Arial",letterSpacing:"0.02em"}}>
            BANK / CASH JOURNAL VOUCHER
          </span>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {voucher && (
              <button onClick={()=>window.print()} style={{padding:"6px 14px",
                background:"rgba(255,255,255,0.12)",color:"#FFF",border:"1px solid rgba(255,255,255,0.4)",
                fontSize:11,fontWeight:700,cursor:"pointer",borderRadius:3}}>
                🖨 Print
              </button>
            )}
            <button onClick={onClose} style={{background:"transparent",border:"none",
              color:"#FFF",fontSize:18,cursor:"pointer",padding:"0 4px"}}>✕</button>
          </div>
        </div>

        <div className="voucher-scroll" style={{overflowY:"auto",flex:1}}>
          {loading ? (
            <div style={{textAlign:"center",color:DIM,padding:60,fontSize:13}}>Loading voucher…</div>
          ) : error ? (
            <div style={{color:ERR,padding:20,margin:20,background:"#FFF0F0",
              border:"1px solid "+ERR,fontSize:13}}>{error}</div>
          ) : voucher && (
            <div id="voucher-print-area" style={{padding:"28px 36px",fontFamily:"'Georgia',serif"}}>

              {/* ── Letterhead ── */}
              <div style={{textAlign:"center",borderBottom:"3px double "+NAVY,paddingBottom:14,marginBottom:18}}>
                <div style={{fontSize:19,fontWeight:700,color:NAVY,letterSpacing:"0.03em"}}>
                  {companyName || "Company Name"}
                </div>
                <div style={{fontSize:11,color:DIM,marginTop:3,fontFamily:"Arial"}}>
                  Fiscal Year {fiscalYear}
                </div>
                <div style={{fontSize:13,fontWeight:700,color:"#333",marginTop:10,
                  letterSpacing:"0.12em",fontFamily:"Arial"}}>
                  BANK / CASH JOURNAL VOUCHER
                </div>
              </div>

              {/* ── Voucher meta row ── */}
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:16,
                fontSize:12,fontFamily:"Arial"}}>
                <div>
                  <span style={{color:DIM}}>Voucher No: </span>
                  <span style={{fontWeight:700,color:NAVY,fontFamily:"monospace"}}>{uniqueId}</span>
                </div>
                <div>
                  <span style={{color:DIM}}>Date: </span>
                  <span style={{fontWeight:600}}>{voucher.entry_date}</span>
                </div>
                <div>
                  <span style={{color:DIM}}>Type: </span>
                  <span style={{fontWeight:600}}>{voucher.transaction_type}</span>
                </div>
              </div>

              {/* ── Narration ── */}
              <div style={{fontSize:12,color:"#333",marginBottom:18,fontFamily:"Arial",
                fontStyle:"italic",borderLeft:"3px solid "+BORDER,paddingLeft:10}}>
                {voucher.description}
              </div>

              {/* ── Dr / Cr ledger table ── */}
              <table style={{width:"100%",borderCollapse:"collapse",marginBottom:4,
                fontFamily:"Arial",border:"1px solid "+NAVY}}>
                <thead>
                  <tr>
                    <th style={{textAlign:"left",fontSize:10,fontWeight:700,color:"#FFF",
                      background:NAVY,padding:"8px 12px",borderRight:"1px solid rgba(255,255,255,0.25)"}}>
                      PARTICULARS (GL ACCOUNT)
                    </th>
                    <th style={{textAlign:"right",fontSize:10,fontWeight:700,color:"#FFF",
                      background:NAVY,padding:"8px 12px",width:130,
                      borderRight:"1px solid rgba(255,255,255,0.25)"}}>
                      DEBIT (Rs.)
                    </th>
                    <th style={{textAlign:"right",fontSize:10,fontWeight:700,color:"#FFF",
                      background:NAVY,padding:"8px 12px",width:130}}>
                      CREDIT (Rs.)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {voucher.dr_lines.map((l,i)=>(
                    <tr key={"dr"+i} style={{borderBottom:"1px solid "+BORDER}}>
                      <td style={{padding:"9px 12px",fontSize:12.5}}>
                        <span style={{fontFamily:"monospace",fontWeight:700,color:NAVY,marginRight:8}}>
                          {l.gl_code.split(" - ")[0]}
                        </span>
                        Dr. {l.gl_name}
                        {l.party_name && (
                          <div style={{fontSize:10.5,color:DIM,marginTop:2,marginLeft:2}}>
                            Party: {l.party_name}
                          </div>
                        )}
                      </td>
                      <td style={{padding:"9px 12px",textAlign:"right",fontFamily:"monospace",
                        fontWeight:700,color:NAVY,fontSize:13}}>{fmtT(l.amount)}</td>
                      <td style={{borderLeft:"1px solid "+BORDER}}/>
                    </tr>
                  ))}
                  {voucher.cr_lines.map((l,i)=>(
                    <tr key={"cr"+i} style={{borderBottom:"1px solid "+BORDER}}>
                      <td style={{padding:"9px 12px 9px 34px",fontSize:12.5}}>
                        <span style={{fontFamily:"monospace",fontWeight:700,color:ERR,marginRight:8}}>
                          {l.gl_code.split(" - ")[0]}
                        </span>
                        To {l.gl_name}
                        {l.party_name && (
                          <div style={{fontSize:10.5,color:DIM,marginTop:2,marginLeft:24}}>
                            Party: {l.party_name}
                          </div>
                        )}
                      </td>
                      <td style={{borderRight:"1px solid "+BORDER}}/>
                      <td style={{padding:"9px 12px",textAlign:"right",fontFamily:"monospace",
                        fontWeight:700,color:ERR,fontSize:13}}>{fmtT(l.amount)}</td>
                    </tr>
                  ))}
                  {/* Pad with a couple of blank ruled lines, like a real voucher book */}
                  {[...Array(2)].map((_,i)=>(
                    <tr key={"blank"+i} style={{borderBottom:"1px solid "+BORDER}}>
                      <td style={{padding:"9px 12px",height:14}}>&nbsp;</td>
                      <td style={{borderLeft:"1px solid "+BORDER}}/>
                      <td/>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{background:voucher.balanced?"#EDF7F0":"#FFF8E1"}}>
                    <td style={{padding:"9px 12px",fontWeight:700,fontSize:11.5,
                      borderTop:"2px solid "+NAVY,fontFamily:"Arial"}}>
                      TOTAL
                      <span style={{marginLeft:10,fontWeight:600,fontSize:10.5,
                        color:voucher.balanced?GREEN:"#9A7B1A"}}>
                        {voucher.balanced ? "✓ Balanced" : "⚠ Out of balance"}
                      </span>
                    </td>
                    <td style={{padding:"9px 12px",textAlign:"right",fontFamily:"monospace",
                      fontWeight:800,fontSize:13.5,borderTop:"2px solid "+NAVY,color:NAVY}}>
                      {fmtT(voucher.total_dr)}
                    </td>
                    <td style={{padding:"9px 12px",textAlign:"right",fontFamily:"monospace",
                      fontWeight:800,fontSize:13.5,borderTop:"2px solid "+NAVY,
                      borderLeft:"1px solid "+BORDER,color:ERR}}>
                      {fmtT(voucher.total_cr)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              <div style={{fontSize:9.5,color:DIM,marginTop:4,marginBottom:26,fontFamily:"Arial"}}>
                Source: {voucher.source} &nbsp;·&nbsp; Posted via ARITHMA VAT &amp; Inventory Manager
              </div>

              {/* ── Signature blocks — formal voucher footer ── */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:28,
                marginTop:30,fontFamily:"Arial"}}>
                <div>
                  <div style={{borderTop:"1px solid #333",paddingTop:6,minHeight:34}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#222"}}>
                      {voucher.prepared_by || "\u00A0"}
                    </div>
                  </div>
                  <div style={{fontSize:9.5,fontWeight:700,color:DIM,letterSpacing:"0.08em",marginTop:4}}>
                    PREPARED BY
                  </div>
                </div>

                <div>
                  <div style={{borderTop:"1px solid #333",paddingTop:6,minHeight:34}}>
                    <div style={{fontSize:13,color:"#BBB"}}>&nbsp;</div>
                  </div>
                  <div style={{fontSize:9.5,fontWeight:700,color:DIM,letterSpacing:"0.08em",marginTop:4}}>
                    CHECKED BY
                  </div>
                </div>

                <div>
                  <div style={{borderTop:"1px solid #333",paddingTop:6,minHeight:34}}>
                    {voucher.approved_by ? (
                      <div style={{fontSize:13,fontWeight:600,color:"#222"}}>
                        {voucher.approved_by}
                      </div>
                    ) : (
                      <div style={{fontSize:13,color:"#BBB"}}>&nbsp;</div>
                    )}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginTop:4}}>
                    <div style={{fontSize:9.5,fontWeight:700,color:DIM,letterSpacing:"0.08em"}}>
                      APPROVED BY
                    </div>
                    {voucher.approved_at && (
                      <div style={{fontSize:9.5,color:DIM}}>{voucher.approved_at.slice(0,10)}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Approve action — screen only, never printed */}
              {!voucher.approved_by && (
                <div className="voucher-chrome" style={{marginTop:18,textAlign:"right"}}>
                  {isSuperAdmin ? (
                    <button onClick={approve} disabled={approving}
                      style={{padding:"8px 18px",background:approving?"#AAA":GREEN,
                        color:"#FFF",border:"none",fontWeight:700,fontSize:12,
                        cursor:approving?"not-allowed":"pointer",borderRadius:3,fontFamily:"Arial"}}>
                      {approving?"Approving…":"✓ Approve as Admin"}
                    </button>
                  ) : (
                    <span style={{fontSize:11,color:GOLD,fontFamily:"Arial",fontWeight:600}}>
                      ⏳ Pending admin approval
                    </span>
                  )}
                </div>
              )}

              <div style={{textAlign:"right",fontSize:9,color:"#BBB",marginTop:20,fontFamily:"Arial"}}>
                Printed on {todayStr}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Void Confirmation Modal — requires typing exact reference ────
function VoidModal({ entry, onConfirm, onCancel }) {
  const [confirmText, setConfirmText] = useState("");
  const [reason,      setReason]      = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const matches = confirmText.trim() === (entry.internal_ref||"").trim();

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}}>
      <div style={{background:"#FFF",width:"min(480px,92vw)",borderRadius:4,
        boxShadow:"0 8px 32px rgba(0,0,0,0.2)",overflow:"hidden"}}>
        <div style={{background:ERR,padding:"14px 20px",display:"flex",gap:10,alignItems:"center"}}>
          <span style={{fontSize:20}}>⚠</span>
          <span style={{color:"#FFF",fontWeight:700,fontSize:15,fontFamily:"Arial"}}>
            Void Bank Entry
          </span>
        </div>
        <div style={{padding:"20px 24px"}}>
          <p style={{fontSize:13,color:"#333",marginBottom:14}}>
            This will soft-delete <strong>{entry.internal_ref}</strong> and reverse its
            GL Book and Party Ledger postings. The entry stays visible in the Voided tab
            for audit purposes — it cannot be permanently deleted.
          </p>
          <div style={{background:CREAM,border:"1px solid "+BORDER,padding:"10px 14px",
            borderRadius:4,marginBottom:16,fontSize:12}}>
            <div><strong>Date:</strong> {entry.entry_date}</div>
            <div><strong>Narration:</strong> {entry.narration}</div>
            <div><strong>Amount:</strong> Rs.{fmtT(entry.withdraw||entry.deposit)} {entry.withdraw>0?"(Withdraw)":"(Deposit)"}</div>
          </div>
          <label className="sans" style={lbl}>
            TYPE "{entry.internal_ref}" TO CONFIRM *
          </label>
          <input value={confirmText} onChange={e=>setConfirmText(e.target.value)}
            placeholder={entry.internal_ref} style={{...fld, marginBottom:6,
              border: confirmText && !matches ? "1px solid "+ERR : fld.border}}/>
          {confirmText && !matches && (
            <div style={{fontSize:11,color:ERR,marginBottom:6}}>
              Doesn't match — expected exactly "{entry.internal_ref}"
            </div>
          )}
          <div style={{marginBottom:matches?12:6}}/>
          <label className="sans" style={lbl}>REASON FOR VOID (optional)</label>
          <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2}
            placeholder="e.g. Duplicate entry, wrong amount, entered in error"
            style={{...fld, marginBottom:18, resize:"vertical"}}/>
          <div style={{display:"flex",gap:10}}>
            <button onClick={async()=>{ setSubmitting(true); await onConfirm(confirmText, reason); setSubmitting(false); }}
              disabled={!matches||submitting}
              style={{flex:2,padding:"11px",background:matches&&!submitting?ERR:"#CCC",
                color:"#FFF",border:"none",fontWeight:700,fontSize:13,
                cursor:matches&&!submitting?"pointer":"not-allowed",fontFamily:"Arial"}}>
              {submitting?"Voiding…":"⚠ Confirm Void"}
            </button>
            <button onClick={onCancel} style={{flex:1,padding:"11px",background:"#FFF",
              color:DIM,border:"1px solid "+BORDER,fontWeight:700,fontSize:13,cursor:"pointer",
              fontFamily:"Arial"}}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Edit Request Modal — propose a correction to a POSTED entry ──
// Every change to a posted entry requires admin approval; this modal
// only SUBMITS a proposal, it never applies anything directly.
function EditRequestModal({ entry, glAccounts, parties, partyTypeNames, lcOptions, onSubmit, onCancel }) {
  const [newType,       setNewType]       = useState(entry.entry_type||"");
  const [newGl,         setNewGl]         = useState(entry.gl_account||"");
  const [newPartyName,  setNewPartyName]  = useState(entry.party_name||"");
  const [newPartyType,  setNewPartyType]  = useState(entry.party_type||"");
  const [newLcNo,       setNewLcNo]       = useState(entry.lc_no||"");
  const [newChargeType, setNewChargeType] = useState(entry.charge_type||"");
  const [newInvoiceRef, setNewInvoiceRef] = useState(entry.invoice_ref||"");
  const [newNarration,  setNewNarration]  = useState(entry.narration2||entry.narration||"");
  const [reason,        setReason]        = useState("");
  const [submitting,    setSubmitting]    = useState(false);

  const isPartyType = newType === "Party";
  const isGL         = newType === "GL";
  const isContra     = newType === "Contra";

  // LC No. + Charge Type independent of party_type — "LC" is never a
  // valid party type here.
  const missingGl    = (isGL||isContra) && !newGl.trim();
  const missingParty = isPartyType && !newPartyName.trim();
  const missingPartyType = isPartyType && !newPartyType;
  const missingCharge = !!newLcNo && !newChargeType;
  const missingReason = !reason.trim();
  const canSubmit = !!newType && !missingGl && !missingParty && !missingPartyType && !missingCharge && !missingReason;

  useEffect(()=>{
    if(!newPartyName.trim()) return;
    const match = parties.find(p=>p.name.toLowerCase()===newPartyName.trim().toLowerCase());
    if(match && match.party_type && match.party_type!==newPartyType) setNewPartyType(match.party_type);
  },[newPartyName, parties]); // eslint-disable-line react-hooks/exhaustive-deps

  const noChange = newType===entry.entry_type && newGl===(entry.gl_account||"") &&
    newPartyName===(entry.party_name||"") && newChargeType===(entry.charge_type||"") &&
    newLcNo===(entry.lc_no||"");

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20}}>
      <div style={{background:"#FFF",width:"min(560px,94vw)",borderRadius:4,
        boxShadow:"0 8px 32px rgba(0,0,0,0.2)",overflow:"hidden",maxHeight:"90vh",
        display:"flex",flexDirection:"column"}}>
        <div style={{background:GOLD,padding:"14px 20px",display:"flex",gap:10,alignItems:"center"}}>
          <span style={{fontSize:20}}>✎</span>
          <span style={{color:"#FFF",fontWeight:700,fontSize:15,fontFamily:"Arial"}}>
            Request Edit — {entry.internal_ref}
          </span>
        </div>
        <div style={{padding:"20px 24px",overflowY:"auto"}}>
          <p style={{fontSize:12.5,color:"#333",marginBottom:14}}>
            This entry is already posted to GL Book. Your proposed correction will be
            sent to this company's Admin for approval. On approval, the original posting
            is automatically reversed and a fresh, corrected one is posted under the
            same reference number — nothing changes until then.
          </p>

          <div style={{background:CREAM,border:"1px solid "+BORDER,padding:"10px 14px",
            borderRadius:4,marginBottom:16,fontSize:12}}>
            <div style={{fontWeight:700,color:DIM,marginBottom:4,fontSize:10,letterSpacing:"0.06em"}}>
              CURRENT CLASSIFICATION
            </div>
            <div>Type: <strong>{entry.entry_type}</strong>
              {entry.entry_type==="Party" && <> · Party Type: <strong>{entry.party_type||"—"}</strong> · Party: <strong>{entry.party_name||"—"}</strong></>}
              {(entry.entry_type==="GL"||entry.entry_type==="Contra") && <> · GL: <strong>{entry.gl_account||"—"}</strong></>}
              {entry.lc_no && <> · LC No.: <strong>{entry.lc_no}</strong></>}
              {entry.charge_type && <> · Charge: <strong>{entry.charge_type}</strong></>}
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
            <div>
              <label className="sans" style={lbl}>NEW TYPE *</label>
              <select value={newType} onChange={e=>{setNewType(e.target.value);setNewGl("");setNewPartyName("");setNewPartyType("");setNewChargeType("");}} style={fld}>
                <option value="">— select —</option>
                {ENTRY_TYPES.map(t=><option key={t} value={t}>{ENTRY_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            {(isGL||isContra) && (
              <div style={{gridColumn:"span 2"}}>
                <label className="sans" style={lbl}>{isContra?"CONTRA GL":"GL ACCOUNT *"}</label>
                <input list="edit-gl-list" value={newGl} onChange={e=>setNewGl(e.target.value)}
                  placeholder="GL code or name" style={{...fld,border:missingGl?"1px solid "+ERR:fld.border}}/>
                <datalist id="edit-gl-list">
                  {glAccounts.map(a=><option key={a.id} value={a.gl_code+" - "+a.gl_name}/>)}
                </datalist>
              </div>
            )}
            {isPartyType && (
              <div>
                <label className="sans" style={lbl}>PARTY TYPE *</label>
                <select value={newPartyType} onChange={e=>setNewPartyType(e.target.value)}
                  style={{...fld,border:missingPartyType?"1px solid "+ERR:fld.border}}>
                  <option value="">— select —</option>
                  {partyTypeNames.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
            {isPartyType && (
              <div>
                <label className="sans" style={lbl}>PARTY NAME *</label>
                <input list="edit-party-list" value={newPartyName} onChange={e=>setNewPartyName(e.target.value)}
                  placeholder="Party name" style={{...fld,border:missingParty?"1px solid "+ERR:fld.border}}/>
                <datalist id="edit-party-list">
                  {(newPartyType ? parties.filter(p=>p.party_type===newPartyType) : parties)
                    .map(p=><option key={p.id} value={p.name}/>)}
                </datalist>
              </div>
            )}
            {!!newType && (
              <div>
                <label className="sans" style={lbl}>LC NO. (optional)</label>
                <input list="edit-lc-list" value={newLcNo} onChange={e=>setNewLcNo(e.target.value)}
                  placeholder="Tag to an import" style={fld}/>
                <datalist id="edit-lc-list">
                  {(lcOptions||[]).map(l=><option key={l} value={l}/>)}
                </datalist>
              </div>
            )}
            {!!newLcNo && (
              <div>
                <label className="sans" style={lbl}>CHARGE TYPE *</label>
                <select value={newChargeType} onChange={e=>setNewChargeType(e.target.value)}
                  style={{...fld,border:missingCharge?"1px solid "+ERR:fld.border}}>
                  <option value="">— select —</option>
                  {LC_CHARGE_TYPES.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>

          <label className="sans" style={lbl}>INVOICE / REF (optional)</label>
          <input value={newInvoiceRef} onChange={e=>setNewInvoiceRef(e.target.value)}
            placeholder="e.g. SB-0003" style={{...fld,marginBottom:10}}/>

          <label className="sans" style={lbl}>NARRATION OVERRIDE (optional)</label>
          <input value={newNarration} onChange={e=>setNewNarration(e.target.value)}
            placeholder="Optional" style={{...fld,marginBottom:14}}/>

          <label className="sans" style={{...lbl,color:missingReason?ERR:DIM}}>REASON FOR CORRECTION *</label>
          <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2}
            placeholder="e.g. Misclassified as Material Value, should be Custom Duty"
            style={{...fld,marginBottom:6,resize:"vertical",border:missingReason?"1px solid "+ERR:fld.border}}/>

          {noChange && (
            <div style={{fontSize:11,color:"#856404",marginBottom:10}}>
              ⚠ This matches the current classification exactly — change at least one field.
            </div>
          )}

          <div style={{display:"flex",gap:10,marginTop:14}}>
            <button onClick={async()=>{
                setSubmitting(true);
                await onSubmit({
                  new_entry_type:newType, new_gl_account:newGl,
                  new_party_name:newPartyName, new_party_type:newPartyType,
                  new_lc_no:newLcNo, new_charge_type:newChargeType, new_invoice_ref:newInvoiceRef,
                  new_narration:newNarration, request_note:reason,
                });
                setSubmitting(false);
              }}
              disabled={!canSubmit||noChange||submitting}
              style={{flex:2,padding:"11px",background:canSubmit&&!noChange&&!submitting?GOLD:"#CCC",
                color:"#FFF",border:"none",fontWeight:700,fontSize:13,
                cursor:canSubmit&&!noChange&&!submitting?"pointer":"not-allowed",fontFamily:"Arial"}}>
              {submitting?"Submitting…":"✎ Submit for Approval"}
            </button>
            <button onClick={onCancel} style={{flex:1,padding:"11px",background:"#FFF",
              color:DIM,border:"1px solid "+BORDER,fontWeight:700,fontSize:13,cursor:"pointer",
              fontFamily:"Arial"}}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DuplicateModal({ message, existingRef, existingNarration, onConfirm, onCancel }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}}>
      <div style={{background:"#FFF",width:"min(480px,92vw)",borderRadius:4,
        boxShadow:"0 8px 32px rgba(0,0,0,0.2)",overflow:"hidden"}}>
        <div style={{background:GOLD,padding:"14px 20px",display:"flex",gap:10,alignItems:"center"}}>
          <span style={{fontSize:20}}>⚠</span>
          <span style={{color:"#FFF",fontWeight:700,fontSize:15,fontFamily:"Arial"}}>
            Duplicate Amount Detected
          </span>
        </div>
        <div style={{padding:"20px 24px"}}>
          <p style={{fontSize:13,color:NAVY,fontWeight:600,marginBottom:8}}>{message}</p>
          <div style={{background:CREAM,border:"1px solid "+BORDER,padding:"10px 14px",
            borderRadius:4,marginBottom:16}}>
            <div style={{fontSize:11,color:DIM}}>Existing entry:</div>
            <div style={{fontSize:12,fontFamily:"monospace",color:NAVY,fontWeight:700}}>
              {existingRef}
            </div>
            <div style={{fontSize:11,color:DIM,marginTop:4}}>{existingNarration}</div>
          </div>
          <p style={{fontSize:12,color:DIM,marginBottom:20}}>
            Is this a genuinely different transaction? Confirming will save it
            with a sequence number to distinguish it from the existing entry.
          </p>
          <div style={{display:"flex",gap:10}}>
            <button onClick={onConfirm} style={{flex:2,padding:"11px",background:GREEN,
              color:"#FFF",border:"none",fontWeight:700,fontSize:13,cursor:"pointer",
              fontFamily:"Arial"}}>
              ✓ Yes, this is a different transaction
            </button>
            <button onClick={onCancel} style={{flex:1,padding:"11px",background:"#FFF",
              color:ERR,border:"2px solid "+ERR,fontWeight:700,fontSize:13,cursor:"pointer",
              fontFamily:"Arial"}}>
              ✕ Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountSidebar({ accounts, selected, onSelect, onAdd, glAccounts, companyId, session, onGlAdded }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({account_name:"",account_no:"",gl_code:"",gl_name:"",opening_balance:""});
  const [saving, setSaving] = useState(false);
  const [showGlDropdown, setShowGlDropdown] = useState(false);
  const [showAddBank, setShowAddBank] = useState(false);
  const [newBankName, setNewBankName] = useState("");
  const [glSaving, setGlSaving] = useState(false);
  const [glError, setGlError] = useState("");
  const [createError, setCreateError] = useState("");

  // Bank GL accounts: codes starting with "22"
  const bankGLs = glAccounts.filter(a => (a.gl_code||"").startsWith("22"));

  // Filter by what user has typed so far in gl_code
  const glMatches = form.gl_code
    ? bankGLs.filter(a =>
        a.gl_code.startsWith(form.gl_code) ||
        a.gl_name.toLowerCase().includes(form.gl_code.toLowerCase())
      )
    : bankGLs;

  const pickGL = (a) => {
    setForm(p=>({...p, gl_code:a.gl_code, gl_name:a.gl_name}));
    setShowGlDropdown(false);
  };

  const createNewBankGL = async () => {
    if(!newBankName.trim()){ setGlError("Enter a bank/account name"); return; }
    setGlSaving(true); setGlError("");
    // Auto-suggest next available code in 22xx range
    const usedCodes = bankGLs.map(a=>parseInt(a.gl_code,10)).filter(n=>!isNaN(n));
    let nextCode = 2200;
    while(usedCodes.includes(nextCode)) nextCode += 10;

    const r = await fetch(BACKEND+"/api/gl-accounts",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        company_id: companyId,
        requesting_user_id: session?.user?.id,
        gl_code: String(nextCode),
        gl_name: newBankName.trim(),
        header: "Current Assets",
        main_group: "Bank & Cash",
        sub_group: "Bank Accounts",
        account_type: "BS",
      }),
    });
    const d = await r.json();
    if(d.success){
      setForm(p=>({...p, gl_code:d.account.gl_code, gl_name:d.account.gl_name}));
      setShowAddBank(false); setShowGlDropdown(false); setNewBankName("");
      onGlAdded && onGlAdded();  // refresh glAccounts list in parent
    } else {
      setGlError(d.error || "Failed to create GL account. Super Admin permission required.");
    }
    setGlSaving(false);
  };

  return (
    <div style={{width:240,minWidth:240,background:"#FFF",borderRight:"1px solid "+BORDER,
      display:"flex",flexDirection:"column",height:"100vh",position:"sticky",top:0}}>
      <div style={{padding:"12px 12px 8px",borderBottom:"1px solid "+BORDER}}>
        <div style={{fontSize:11,fontWeight:700,color:NAVY,letterSpacing:"0.08em",marginBottom:8}}>
          BANK / CASH ACCOUNTS
        </div>
        <button onClick={()=>{setShowAdd(s=>!s);setShowGlDropdown(false);setShowAddBank(false);}}
          style={{width:"100%",padding:"7px",
          background:NAVY,color:"#FFF",border:"none",fontSize:11,fontWeight:700,
          cursor:"pointer",fontFamily:"Arial"}}>
          {showAdd?"✕ Cancel":"+ Add Account"}
        </button>
      </div>

      {showAdd && (
        <div style={{padding:"10px 12px",borderBottom:"1px solid "+BORDER,background:CREAM}}>
          <div style={{marginBottom:8}}>
            <label className="sans" style={lbl}>ACCOUNT NAME *</label>
            <input value={form.account_name} placeholder="e.g. Nepal Bank Ltd"
              onChange={e=>setForm(p=>({...p,account_name:e.target.value}))} style={fld}/>
          </div>
          <div style={{marginBottom:8}}>
            <label className="sans" style={lbl}>ACCOUNT NO</label>
            <input value={form.account_no} placeholder="e.g. 0456789"
              onChange={e=>setForm(p=>({...p,account_no:e.target.value}))} style={fld}/>
          </div>

          {/* ── Smart GL Code field with dropdown ── */}
          <div style={{marginBottom:8,position:"relative"}}>
            <label className="sans" style={lbl}>GL CODE *</label>
            <input value={form.gl_code} placeholder="e.g. 2240 — type to search"
              onChange={e=>{
                setForm(p=>({...p,gl_code:e.target.value,gl_name:""}));
                setShowGlDropdown(true);
              }}
              onFocus={()=>setShowGlDropdown(true)}
              style={fld}/>

            {showGlDropdown && (
              <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,
                background:"#FFF",border:"1px solid "+NAVY,borderTop:"none",
                maxHeight:220,overflowY:"auto",boxShadow:"0 4px 10px rgba(0,0,0,0.12)"}}>
                {glMatches.length>0 && glMatches.map(a=>(
                  <div key={a.id} onClick={()=>pickGL(a)}
                    style={{padding:"7px 10px",cursor:"pointer",fontSize:11,
                      borderBottom:"1px solid #F0EDE5",display:"flex",
                      justifyContent:"space-between",gap:8}}
                    onMouseDown={e=>e.preventDefault()}>
                    <span style={{fontFamily:"monospace",fontWeight:700,color:NAVY}}>{a.gl_code}</span>
                    <span style={{color:"#333",flex:1,textAlign:"left",marginLeft:8,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.gl_name}</span>
                  </div>
                ))}
                {glMatches.length===0 && (
                  <div style={{padding:"8px 10px",fontSize:11,color:DIM}}>
                    No bank GL found starting with "22"
                    {form.gl_code && <> matching "{form.gl_code}"</>}.
                  </div>
                )}
                <div onClick={()=>{setShowAddBank(true);setShowGlDropdown(false);}}
                  onMouseDown={e=>e.preventDefault()}
                  style={{padding:"8px 10px",cursor:"pointer",fontSize:11,fontWeight:700,
                    color:GREEN,background:"#F2FAF5",borderTop:"1px solid "+BORDER}}>
                  + ADD BANK (create new GL account)
                </div>
              </div>
            )}
          </div>

          {/* ── Add Bank inline mini-form ── */}
          {showAddBank && (
            <div style={{padding:"10px",background:"#F2FAF5",border:"1px solid "+GREEN,
              marginBottom:8}}>
              <label className="sans" style={lbl}>NEW BANK / GL NAME *</label>
              <input value={newBankName} placeholder="e.g. Himalayan Bank Ltd - A/c"
                onChange={e=>setNewBankName(e.target.value)} style={fld}/>
              <div style={{fontSize:10,color:DIM,marginTop:4,marginBottom:8}}>
                Will be created under GL group "Bank &amp; Cash" with an auto-assigned 22xx code.
              </div>
              {glError && <div style={{fontSize:11,color:ERR,marginBottom:6}}>{glError}</div>}
              <div style={{display:"flex",gap:6}}>
                <button onClick={createNewBankGL} disabled={glSaving}
                  style={{flex:1,padding:7,background:glSaving?"#AAA":GREEN,color:"#FFF",
                    border:"none",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                  {glSaving?"Creating…":"✓ Create GL"}
                </button>
                <button onClick={()=>{setShowAddBank(false);setGlError("");}}
                  style={{padding:"7px 10px",background:"#FFF",border:"1px solid "+BORDER,
                    fontSize:11,cursor:"pointer",color:DIM}}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* GL Name — auto-filled, read-only once picked */}
          <div style={{marginBottom:8}}>
            <label className="sans" style={lbl}>GL NAME</label>
            <input value={form.gl_name} placeholder="Auto-filled from GL code selection"
              readOnly style={fldAuto}/>
          </div>

          <div style={{marginBottom:8}}>
            <label className="sans" style={lbl}>OPENING BALANCE</label>
            <input value={form.opening_balance} placeholder="0.00"
              onChange={e=>setForm(p=>({...p,opening_balance:e.target.value}))} style={fld}/>
          </div>

          {createError && (
            <div style={{padding:8,marginBottom:8,fontSize:11,color:ERR,
              background:"#FFF0F0",border:"1px solid "+ERR}}>
              {createError}
            </div>
          )}

          <button disabled={saving||!form.account_name||!form.gl_code}
            onClick={async()=>{
              setSaving(true); setCreateError("");
              try {
                const r=await fetch(BACKEND+"/api/bank-accounts",{
                  method:"POST",headers:{"Content-Type":"application/json"},
                  body:JSON.stringify({...form,company_id:companyId,opening_balance:parseFloat(form.opening_balance)||0}),
                });
                const d=await r.json();
                if(d.success){
                  setForm({account_name:"",account_no:"",gl_code:"",gl_name:"",opening_balance:""});
                  setShowAdd(false); onAdd();
                } else {
                  setCreateError(d.error || "Failed to create account (status "+r.status+")");
                }
              } catch(err) {
                setCreateError("Network error: "+err.message);
              }
              setSaving(false);
            }}
            style={{width:"100%",padding:8,background:GREEN,color:"#FFF",border:"none",
              fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"Arial",
              opacity:saving?0.7:1}}>
            {saving?"Saving…":"✓ Create Account"}
          </button>
        </div>
      )}

      <div style={{overflowY:"auto",flex:1}}>
        {accounts.length===0
          ? <div style={{padding:20,textAlign:"center",color:DIM,fontSize:12}}>
              No accounts yet. Add one above.
            </div>
          : (() => {
              // Group accounts by gl_code — sub-ledger pattern, same as Party Ledger
              // groups parties by party_type under one control GL.
              const groups = {};
              accounts.forEach(a => {
                const key = a.gl_code || "—";
                if (!groups[key]) groups[key] = { gl_code:a.gl_code, gl_name:a.gl_name, items:[] };
                groups[key].items.push(a);
              });
              const sortedGroups = Object.values(groups).sort((g1,g2)=>
                (g1.gl_code||"").localeCompare(g2.gl_code||"")
              );

              return sortedGroups.map(grp => {
                const groupTotal = grp.items.reduce((s,a)=>s+(Number(a.running_balance ?? a.opening_balance)||0),0);
                return (
                  <div key={grp.gl_code||"none"}>
                    {/* GL control account header — like a party-type header */}
                    <div style={{padding:"7px 12px",background:"#EFEAE0",
                      borderBottom:"1px solid "+BORDER,borderTop:"1px solid "+BORDER,
                      display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:10,fontWeight:700,color:NAVY,fontFamily:"monospace"}}>
                          {grp.gl_code}
                        </div>
                        <div style={{fontSize:9,color:DIM,overflow:"hidden",textOverflow:"ellipsis",
                          whiteSpace:"nowrap",maxWidth:150}}>
                          {grp.gl_name}
                        </div>
                      </div>
                      <div style={{fontSize:10,fontWeight:700,
                        color:groupTotal>=0?NAVY:ERR}}>
                        {fmtT(Math.abs(groupTotal))} {groupTotal>=0?"Dr":"Cr"}
                      </div>
                    </div>

                    {/* Sub-ledger accounts under this GL */}
                    {grp.items.map(a=>(
                      <div key={a.id} onClick={()=>onSelect(a)}
                        style={{padding:"10px 12px 10px 20px",cursor:"pointer",
                          background:selected?.id===a.id?LIGHT:"#FFF",
                          borderLeft:selected?.id===a.id?"3px solid "+NAVY:"3px solid transparent",
                          borderBottom:"1px solid #F5F2EA"}}>
                        <div style={{fontSize:12,fontWeight:600,color:selected?.id===a.id?NAVY:"#333",
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {a.account_name}
                        </div>
                        <div style={{fontSize:10,color:DIM,marginTop:2}}>
                          {a.account_no || "—"}
                        </div>
                        <div style={{fontSize:11,fontWeight:700,marginTop:3,
                          color:(Number(a.running_balance ?? a.opening_balance)||0)>=0?NAVY:ERR}}>
                          Rs.{fmtT(Math.abs(Number(a.running_balance ?? a.opening_balance)||0))}
                          {" "}{(Number(a.running_balance ?? a.opening_balance)||0)>=0?"Dr":"Cr"}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              });
            })()
        }
      </div>
    </div>
  );
}

function ClassifyRow({ entry, glAccounts, parties, partyTypeNames, lcOptions, onSave, isSuperAdmin, companyId, onSplitDone }) {
  const [type,        setType]        = useState(entry.entry_type||"");
  const [glAccount,   setGlAccount]   = useState(entry.gl_account||"");
  const [partyName,   setPartyName]   = useState(entry.party_name||"");
  const [partyType,   setPartyType]   = useState(entry.party_type||"");
  const [lcNo,        setLcNo]        = useState(entry.lc_no||"");
  const [chargeType,  setChargeType]  = useState(entry.charge_type||"");
  const [invoiceRef,  setInvoiceRef]  = useState(entry.invoice_ref||"");
  const [narration2,  setNarration2]  = useState(entry.narration2||"");
  const [saving,      setSaving]      = useState(false);
  const [requestingMultiSplit, setRequestingMultiSplit] = useState(false);
  const [splitError,  setSplitError]  = useState("");

  // Split legs — only used when requestingMultiSplit is checked
  const parentAmt = Number(entry.deposit||0)||Number(entry.withdraw||0);
  const [legs, setLegs] = useState([
    {entry_type:"Party",gl_account:"",charge_type:"",lc_no:"",party_name:"",party_type:"",amount:"",invoice_ref:"",narration:""},
    {entry_type:"Party",gl_account:"",charge_type:"",lc_no:"",party_name:"",party_type:"",amount:"",invoice_ref:"",narration:""},
  ]);
  const legTotal  = legs.reduce((s,l)=>s+(parseFloat(l.amount)||0),0);
  const remaining = Math.round((parentAmt - legTotal)*100)/100;
  const legsBalanced = Math.abs(remaining) < 0.01;
  const updateLeg = (i,k,v) => setLegs(prev=>prev.map((l,idx)=>idx===i?{...l,[k]:v}:l));
  const addLeg    = () => setLegs(p=>[...p,{entry_type:"Party",gl_account:"",charge_type:"",lc_no:"",party_name:"",party_type:"",amount:"",invoice_ref:"",narration:""}]);
  const removeLeg = (i) => setLegs(p=>p.filter((_,idx)=>idx!==i));

  // Auto-fill party type whenever the typed party name matches an
  // existing party — saves a step, and prevents mismatched type/name.
  useEffect(()=>{
    if(!partyName.trim()) return;
    const match = parties.find(p=>p.name.toLowerCase()===partyName.trim().toLowerCase());
    if(match && match.party_type && match.party_type!==partyType) setPartyType(match.party_type);
  },[partyName, parties]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPartyType = type === "Party";
  const isGL         = type === "GL";
  const isContra     = type === "Contra";

  // LC No. + Charge Type are independent of party_type — "LC" is NEVER
  // a valid party type. Any Party/GL/Contra entry can optionally be
  // tagged with an LC No., and once tagged, Charge Type becomes
  // required (or the entry must be split into multiple legs).
  const missingChargeType = !!lcNo && !chargeType && !requestingMultiSplit;
  const missingParty = isPartyType && !partyName.trim();
  const missingPartyType = isPartyType && !partyType;
  const missingGl = (isGL||isContra) && !glAccount.trim();
  const canSaveSimple = !!type && !missingChargeType && !missingParty && !missingPartyType && !missingGl;
  const canSaveSplit  = !!type && requestingMultiSplit && isSuperAdmin && legsBalanced &&
    legs.every(l => l.amount && (l.entry_type==="Party" ? l.party_name : l.gl_account) && (!l.lc_no || l.charge_type));

  const save = async () => {
    setSaving(true); setSplitError("");

    if (requestingMultiSplit && isSuperAdmin) {
      // Direct split path (this company's Admin): classify with no single
      // charge_type, auto-approve, THEN immediately save the split legs.
      const result = await onSave(entry.id,{
        entry_type:type, gl_account:glAccount,
        party_name:partyName, party_type:partyType, lc_no:"", charge_type:"",
        invoice_ref:invoiceRef, narration2:narration2,
        requesting_split:true, auto_approve_split:true,
      });
      if (!result?.success) { setSaving(false); return; }

      const r = await fetch(BACKEND+"/api/bank-ledger/"+entry.id+"/splits",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          company_id:companyId,
          splits:legs.map(l=>({...l,amount:parseFloat(l.amount)||0})),
        }),
      });
      const d = await r.json();
      setSaving(false);
      if (d.success) { onSplitDone && onSplitDone(); }
      else setSplitError(d.error||"Split save failed");
      return;
    }

    // Simple path: single classification, no split
    await onSave(entry.id,{
      entry_type:type, gl_account:glAccount,
      party_name:partyName, party_type:partyType, lc_no:lcNo, charge_type:chargeType,
      invoice_ref:invoiceRef, narration2:narration2,
      requesting_split:requestingMultiSplit,
      auto_approve_split:false,
    });
    setSaving(false);
  };

  return (
    <div style={{padding:"10px 12px",background:CREAM,border:"1px solid "+BORDER,
      borderTop:"none"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
        <div>
          <label className="sans" style={lbl}>TYPE *</label>
          <select value={type} onChange={e=>{setType(e.target.value);setGlAccount("");setPartyName("");setPartyType("");setLcNo("");setChargeType("");setRequestingMultiSplit(false);}} style={fld}>
            <option value="">— select —</option>
            {ENTRY_TYPES.map(t=><option key={t} value={t}>{ENTRY_TYPE_LABELS[t]}</option>)}
          </select>
        </div>

        {(isGL||isContra) && (
          <div>
            <label className="sans" style={lbl}>{isContra?"CONTRA GL (Bank/Cash)":"GL ACCOUNT *"}</label>
            <input list="gl-list" value={glAccount} onChange={e=>setGlAccount(e.target.value)}
              placeholder="Type GL code or name" style={fld}/>
            <datalist id="gl-list">
              {glAccounts.map(a=><option key={a.id} value={a.gl_code+" - "+a.gl_name}/>)}
            </datalist>
          </div>
        )}

        {isPartyType && (
          <div>
            <label className="sans" style={lbl}>PARTY TYPE *</label>
            <select value={partyType} onChange={e=>{setPartyType(e.target.value);}}
              style={{...fld, border:missingPartyType?"1px solid "+ERR:fld.border}}>
              <option value="">— select —</option>
              {partyTypeNames.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}

        {isPartyType && (
          <div>
            <label className="sans" style={lbl}>PARTY NAME *</label>
            <input list="party-list" value={partyName} onChange={e=>setPartyName(e.target.value)}
              placeholder="Type party name" style={{...fld, border:missingParty?"1px solid "+ERR:fld.border}}/>
            <datalist id="party-list">
              {(partyType ? parties.filter(p=>p.party_type===partyType) : parties)
                .map(p=><option key={p.id} value={p.name}/>)}
            </datalist>
          </div>
        )}

        {!!type && !requestingMultiSplit && (
          <div>
            <label className="sans" style={lbl}>LC NO. (optional — tags this to an import)</label>
            <input list="lc-list" value={lcNo} onChange={e=>{setLcNo(e.target.value);}}
              placeholder="Leave blank if not import-related" style={fld}/>
            <datalist id="lc-list">
              {(lcOptions||[]).map(l=><option key={l} value={l}/>)}
            </datalist>
          </div>
        )}

        {!!lcNo && !requestingMultiSplit && (
          <div>
            <label className="sans" style={lbl}>CHARGE TYPE *</label>
            <select value={chargeType} onChange={e=>setChargeType(e.target.value)}
              style={{...fld, border:missingChargeType?"1px solid "+ERR:fld.border}}>
              <option value="">— select charge —</option>
              {LC_CHARGE_TYPES.map(c=><option key={c}>{c}</option>)}
            </select>
            {missingChargeType && (
              <div style={{fontSize:9.5,color:ERR,marginTop:3}}>
                Required — an LC No. is tagged, so Charge Type cannot be blank.
              </div>
            )}
          </div>
        )}

        {!requestingMultiSplit && (
          <>
            <div>
              <label className="sans" style={lbl}>INVOICE / BILL REF</label>
              <input value={invoiceRef} onChange={e=>setInvoiceRef(e.target.value)}
                placeholder="e.g. SB-0003" style={fld}/>
            </div>
            <div>
              <label className="sans" style={lbl}>NARRATION OVERRIDE</label>
              <input value={narration2} onChange={e=>setNarration2(e.target.value)}
                placeholder="Optional override" style={fld}/>
            </div>
          </>
        )}
      </div>

      {!!type && (
        <label style={{display:"flex",alignItems:"center",gap:5,marginTop:10,cursor:"pointer"}}>
          <input type="checkbox" checked={requestingMultiSplit}
            onChange={e=>{ setRequestingMultiSplit(e.target.checked); if(e.target.checked) setChargeType(""); }}/>
          <span style={{fontSize:10.5,fontWeight:600,color:requestingMultiSplit?NAVY:DIM}}>
            {isSuperAdmin
              ? "This payment covers multiple parties / LCs / charge types — allocate amounts below"
              : "This payment covers multiple parties / LCs / charge types — request split instead"}
          </span>
        </label>
      )}

      {/* ── Inline split allocation rows (Super Admin only) ──
           Each leg independently carries its own real party + optional
           LC No. + Charge Type (required only when that leg's LC No.
           is filled) — these are three independent choices, not gated
           on each other via party type. "LC" is never a party here. */}
      {requestingMultiSplit && isSuperAdmin && (
        <div style={{marginTop:10,background:"#F0F4FA",border:"1px solid "+NAVY,
          borderRadius:4,padding:"10px 12px"}}>
          <div style={{display:"flex",gap:12,marginBottom:10,padding:"7px 10px",
            background:legsBalanced?"#D4EDDA":"#FFF3CD",
            border:"1px solid "+(legsBalanced?"#C3E6CB":"#FFE08A")}}>
            <span style={{fontSize:11,fontWeight:700,color:legsBalanced?GREEN:"#856404"}}>
              {legsBalanced?"✅ Balanced":"⚠ Unbalanced"}
            </span>
            <span style={{fontSize:10,color:DIM}}>
              Allocated: Rs.{fmtT(legTotal)} / Rs.{fmtT(parentAmt)}
              {!legsBalanced && " · Remaining: Rs."+fmtT(Math.abs(remaining))}
            </span>
          </div>

          {legs.map((leg,i)=>(
            <div key={i} style={{background:"#FFF",border:"1px solid "+BORDER,
              padding:"8px 10px",marginBottom:6,borderRadius:4}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 100px 26px",
                gap:8,alignItems:"end"}}>
                <div>
                  <label className="sans" style={lbl}>PARTY NAME *</label>
                  <input list={"party-list-sp-"+entry.id} value={leg.party_name}
                    onChange={e=>{
                      const v=e.target.value;
                      const match = parties.find(p=>p.name.toLowerCase()===v.trim().toLowerCase());
                      updateLeg(i,"party_name",v);
                      if(match) updateLeg(i,"party_type",match.party_type||"");
                    }}
                    placeholder="Real party who received this leg" style={{...fld,border:!leg.party_name?"1px solid "+ERR:fld.border}}/>
                  <datalist id={"party-list-sp-"+entry.id}>
                    {parties.map(p=><option key={p.id} value={p.name}/>)}
                  </datalist>
                </div>
                <div>
                  <label className="sans" style={lbl}>LC NO. (optional)</label>
                  <input list={"lc-list-sp-"+entry.id} value={leg.lc_no||""}
                    onChange={e=>updateLeg(i,"lc_no",e.target.value)}
                    placeholder="Tag to an import" style={fld}/>
                  <datalist id={"lc-list-sp-"+entry.id}>
                    {(lcOptions||[]).map(l=><option key={l} value={l}/>)}
                  </datalist>
                </div>
                <div>
                  <label className="sans" style={lbl}>CHARGE TYPE{leg.lc_no?" *":""}</label>
                  <select value={leg.charge_type}
                    onChange={e=>updateLeg(i,"charge_type",e.target.value)}
                    disabled={!leg.lc_no}
                    style={{...fld, background:!leg.lc_no?"#F0EEE8":"#FFF",
                      border:(leg.lc_no && !leg.charge_type)?"1px solid "+ERR:fld.border}}>
                    <option value="">— select —</option>
                    {LC_CHARGE_TYPES.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="sans" style={lbl}>NARRATION</label>
                  <input value={leg.narration} onChange={e=>updateLeg(i,"narration",e.target.value)}
                    placeholder="Optional" style={fld}/>
                </div>
                <div>
                  <label className="sans" style={{...lbl,color:ERR}}>AMOUNT *</label>
                  <input type="number" value={leg.amount}
                    onChange={e=>updateLeg(i,"amount",e.target.value)}
                    placeholder="0.00"
                    style={{...fld,textAlign:"right",fontWeight:700,
                      border:!leg.amount?"1px solid "+ERR:"1px solid "+GREEN}}/>
                </div>
                <button onClick={()=>removeLeg(i)} disabled={legs.length<=1}
                  style={{padding:"7px",background:"transparent",border:"1px solid "+BORDER,
                    cursor:legs.length<=1?"not-allowed":"pointer",color:ERR,fontSize:13}}>
                  ✕
                </button>
              </div>
            </div>
          ))}

          <button onClick={addLeg} style={{padding:"6px 12px",background:"#FFF",
            border:"1px solid "+NAVY,color:NAVY,fontWeight:600,fontSize:11,cursor:"pointer"}}>
            + Add Leg
          </button>

          {splitError && (
            <div style={{marginTop:8,padding:8,color:ERR,background:"#FFF0F0",
              border:"1px solid "+ERR,fontSize:11}}>{splitError}</div>
          )}
        </div>
      )}

      <div style={{marginTop:10,display:"flex",justifyContent:"flex-end"}}>
        <button onClick={save}
          disabled={saving || (requestingMultiSplit ? !canSaveSplit : !canSaveSimple)}
          style={{padding:"8px 20px",
            background:saving || (requestingMultiSplit ? !canSaveSplit : !canSaveSimple) ? "#AAA":GREEN,
            color:"#FFF",border:"none",fontWeight:700,fontSize:12,
            cursor:saving || (requestingMultiSplit ? !canSaveSplit : !canSaveSimple) ?"not-allowed":"pointer",
            fontFamily:"Arial"}}>
          {saving?"Saving…":(requestingMultiSplit?"✓ Save All "+legs.length+" Allocations":"✓ Save")}
        </button>
      </div>
    </div>
  );
}

function SplitPanel({ entry, glAccounts, parties, lcOptions, companyId, session, onClose, onSaved }) {
  const parentAmt = Number(entry.deposit||0)||Number(entry.withdraw||0);
  const isWithdraw = Number(entry.withdraw||0) > 0;
  const [legs,    setLegs]    = useState([
    {entry_type:"Party",gl_account:"",charge_type:"",lc_no:"",party_name:"",party_type:"",amount:"",invoice_ref:"",narration:""},
    {entry_type:"Party",gl_account:"",charge_type:"",lc_no:"",party_name:"",party_type:"",amount:"",invoice_ref:"",narration:""},
  ]);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  const legTotal  = legs.reduce((s,l)=>s+(parseFloat(l.amount)||0),0);
  const remaining = Math.round((parentAmt - legTotal)*100)/100;
  const balanced  = Math.abs(remaining) < 0.01;
  // Each leg: a real party (Party type) or a GL line (GL type) needs
  // its identifying field, PLUS — independent of that — if an LC No.
  // is tagged, Charge Type becomes required too. "LC" is never a leg
  // entry_type or a party_type here.
  const legsComplete = legs.every(l =>
    l.amount && (l.entry_type==="Party" ? l.party_name.trim() : l.gl_account.trim())
    && (!l.lc_no || l.charge_type)
  );
  const canSave = balanced && legsComplete;

  const updateLeg = (i,k,v) => setLegs(prev=>prev.map((l,idx)=>idx===i?{...l,[k]:v}:l));
  const addLeg    = () => setLegs(p=>[...p,{entry_type:"Party",gl_account:"",charge_type:"",lc_no:"",party_name:"",party_type:"",amount:"",invoice_ref:"",narration:""}]);
  const removeLeg = (i) => setLegs(p=>p.filter((_,idx)=>idx!==i));

  const save = async () => {
    setError(""); setSaving(true);
    const r = await fetch(BACKEND+"/api/bank-ledger/"+entry.id+"/splits",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        company_id:companyId,
        splits:legs.map(l=>({...l,amount:parseFloat(l.amount)||0})),
      }),
    });
    const d = await r.json();
    if(d.success){ onSaved(); onClose(); }
    else setError(d.error||"Save failed");
    setSaving(false);
  };

  return (
    <div style={{padding:"16px",background:"#F0F4FA",border:"2px solid "+NAVY,
      borderTop:"none"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div>
          <span style={{fontSize:13,fontWeight:700,color:NAVY}}>Split Entry — {entry.internal_ref}</span>
          <span style={{fontSize:11,color:DIM,marginLeft:8}}>
            {isWithdraw?"Withdraw":"Deposit"}: Rs.{fmtT(parentAmt)}
          </span>
        </div>
        <button onClick={onClose} style={{background:"transparent",border:"none",
          cursor:"pointer",fontSize:16,color:DIM}}>✕</button>
      </div>

      <div style={{display:"flex",gap:12,marginBottom:12,padding:"8px 12px",
        background:balanced?"#D4EDDA":"#FFF3CD",
        border:"1px solid "+(balanced?"#C3E6CB":"#FFE08A")}}>
        <span style={{fontSize:12,fontWeight:700,color:balanced?GREEN:"#856404"}}>
          {balanced?"✅ Balanced":"⚠ Unbalanced"}
        </span>
        <span style={{fontSize:11,color:DIM}}>
          Allocated: Rs.{fmtT(legTotal)} / Rs.{fmtT(parentAmt)}
          {!balanced && " · Remaining: Rs."+fmtT(Math.abs(remaining))}
        </span>
      </div>

      {!legsComplete && (
        <div style={{padding:"8px 12px",marginBottom:12,fontSize:11.5,color:ERR,
          background:"#FFF0F0",border:"1px solid "+ERR}}>
          ⚠ Every leg needs an Amount, plus a Party Name (Party type) or GL Account (GL type).
          If a leg is tagged with an LC No., its Charge Type is also required.
        </div>
      )}

      {legs.map((leg,i)=>(
        <div key={i} style={{background:"#FFF",border:"1px solid "+BORDER,
          padding:"10px 12px",marginBottom:8,borderRadius:4}}>
          <div style={{display:"grid",gridTemplateColumns:"110px 1fr 1fr 1fr 1fr 100px 28px",
            gap:8,alignItems:"end"}}>
            <div>
              <label className="sans" style={lbl}>TYPE *</label>
              <select value={leg.entry_type}
                onChange={e=>updateLeg(i,"entry_type",e.target.value)} style={fld}>
                <option value="Party">Party</option>
                <option value="GL">GL — General Ledger</option>
              </select>
            </div>

            {leg.entry_type==="Party" ? (
              <>
                <div>
                  <label className="sans" style={lbl}>PARTY NAME *</label>
                  <input list="party-list-sp" value={leg.party_name}
                    onChange={e=>{
                      const v=e.target.value;
                      const match = parties.find(p=>p.name.toLowerCase()===v.trim().toLowerCase());
                      updateLeg(i,"party_name",v);
                      if(match) updateLeg(i,"party_type",match.party_type||"");
                    }}
                    placeholder="Real party who received this leg" style={fld}/>
                  <datalist id="party-list-sp">
                    {parties.map(p=><option key={p.id} value={p.name}/>)}
                  </datalist>
                </div>
                <div>
                  <label className="sans" style={lbl}>LC NO. (optional)</label>
                  <input list="lc-list-sp" value={leg.lc_no||""}
                    onChange={e=>updateLeg(i,"lc_no",e.target.value)}
                    placeholder="Tag to an import" style={fld}/>
                  <datalist id="lc-list-sp">
                    {(lcOptions||[]).map(l=><option key={l} value={l}/>)}
                  </datalist>
                </div>
                <div>
                  <label className="sans" style={lbl}>CHARGE TYPE{leg.lc_no?" *":""}</label>
                  <select value={leg.charge_type}
                    onChange={e=>updateLeg(i,"charge_type",e.target.value)}
                    disabled={!leg.lc_no}
                    style={{...fld, background:!leg.lc_no?"#F0EEE8":"#FFF"}}>
                    <option value="">— select —</option>
                    {LC_CHARGE_TYPES.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div style={{gridColumn:"span 3"}}>
                  <label className="sans" style={lbl}>GL ACCOUNT *</label>
                  <input list="gl-list-sp" value={leg.gl_account}
                    onChange={e=>updateLeg(i,"gl_account",e.target.value)}
                    placeholder="GL code or name" style={fld}/>
                  <datalist id="gl-list-sp">
                    {glAccounts.map(a=><option key={a.id} value={a.gl_code+" - "+a.gl_name}/>)}
                  </datalist>
                </div>
              </>
            )}

            <div>
              <label className="sans" style={lbl}>NARRATION</label>
              <input value={leg.narration} onChange={e=>updateLeg(i,"narration",e.target.value)}
                placeholder="Optional" style={fld}/>
            </div>

            <div>
              <label className="sans" style={lbl}>AMOUNT *</label>
              <input type="number" value={leg.amount}
                onChange={e=>updateLeg(i,"amount",e.target.value)}
                placeholder="0.00" style={{...fld,textAlign:"right"}}/>
            </div>

            <button onClick={()=>removeLeg(i)} disabled={legs.length<=1}
              style={{padding:"7px",background:"transparent",border:"1px solid "+BORDER,
                cursor:legs.length<=1?"not-allowed":"pointer",color:ERR,fontSize:14}}>
              ✕
            </button>
          </div>
        </div>
      ))}

      {error && <div style={{padding:8,color:ERR,background:"#FFF0F0",
        border:"1px solid "+ERR,marginBottom:8,fontSize:12}}>{error}</div>}

      <div style={{display:"flex",gap:8}}>
        <button onClick={addLeg} style={{padding:"8px 14px",background:"#FFF",
          border:"1px solid "+NAVY,color:NAVY,fontWeight:600,fontSize:12,cursor:"pointer"}}>
          + Add Leg
        </button>
        <button onClick={save} disabled={!canSave||saving}
          style={{flex:1,padding:8,background:canSave&&!saving?GREEN:"#AAA",
            color:"#FFF",border:"none",fontWeight:700,fontSize:13,
            cursor:canSave&&!saving?"pointer":"not-allowed",fontFamily:"Arial"}}>
          {saving?"Saving…":"✓ Confirm Split & Save"}
        </button>
        <button onClick={onClose} style={{padding:"8px 14px",background:"#FFF",
          border:"1px solid "+BORDER,color:DIM,fontWeight:600,fontSize:12,cursor:"pointer"}}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function BankLedgerPage({
  session, companyId, companies, homeSettings,
  onGoToGLMaster, onGoToBankBalances,
}) {
  const [accounts,     setAccounts]     = useState([]);
  const [selAccount,   setSelAccount]   = useState(null);
  const [entries,      setEntries]      = useState([]);
  const [glAccounts,   setGlAccounts]   = useState([]);
  const [parties,      setParties]      = useState([]);
  const [partyTypeNames, setPartyTypeNames] = useState(["Customer","Vendor","Staff","TDS"]); // fallback until fetched — "LC" intentionally excluded, LC is never a party
  const [lcOptions,    setLcOptions]    = useState([]); // controlled LC No. list from LCMaster — a tag, NOT a party
  const [splitReqs,    setSplitReqs]    = useState([]);
  const [editReqs,     setEditReqs]     = useState([]);
  const [editRequestEntry, setEditRequestEntry] = useState(null); // entry being requested for edit
  const [activeTab,    setActiveTab]    = useState("ledger");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [classifyError,setClassifyError]= useState("");
  const [expandedRow,  setExpandedRow]  = useState(null);
  const [splitRow,     setSplitRow]     = useState(null);
  const [dupModal,     setDupModal]     = useState(null);
  const [voucherId,    setVoucherId]    = useState(null);
  const [voidEntry,    setVoidEntry]    = useState(null);
  const [posting,      setPosting]      = useState(false);
  const [postMsg,      setPostMsg]      = useState("");

  const [manDate,    setManDate]    = useState(new Date().toISOString().slice(0,10));
  const [manDateBs,  setManDateBs]  = useState("");
  const [manNarr,    setManNarr]    = useState("");
  const [manWd,      setManWd]      = useState("");
  const [manDep,     setManDep]     = useState("");
  const [manType,    setManType]    = useState("");
  const [manGL,      setManGL]      = useState("");
  const [manParty,   setManParty]   = useState("");
  const [manPartyType, setManPartyType] = useState("");
  const [manLcNo,    setManLcNo]    = useState("");
  const [manCharge,  setManCharge]  = useState("");
  const [manRef,     setManRef]     = useState("");
  const [manSaving,  setManSaving]  = useState(false);
  const [manMsg,     setManMsg]     = useState("");

  const [importText,  setImportText]  = useState("");
  const [importRows,  setImportRows]  = useState([]);
  const [importing,   setImporting]   = useState(false);
  const [importMsg,   setImportMsg]   = useState("");
  const [confirmedDups, setConfirmedDups] = useState(new Set());

  // Column-mapping wizard state — user pastes once, then assigns each
  // detected column to a role (Date/Narration/Withdrawal/Deposit/Ignore).
  const [rawTable,     setRawTable]     = useState([]);  // array of arrays, parsed cells
  const [colRoles,     setColRoles]     = useState([]);  // role per column index
  const [mappingStep,  setMappingStep]  = useState("paste"); // paste | map | preview

  // Excel date serial number -> ISO date string (Excel epoch: Dec 30 1899)
  const excelSerialToISO = (serial) => {
    const n = parseFloat(serial);
    if (isNaN(n) || n < 1000 || n > 100000) return null;
    const ms = Math.round((n - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0,10);
  };

  const normalizeDate = (raw) => {
    const s = (raw||"").trim();
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{4,6}(\.\d+)?$/.test(s)) {
      const iso = excelSerialToISO(s);
      if (iso) return iso;
    }
    let m = s.match(/^(\d{1,2})[-\/\s]([A-Za-z]{3,9})[-\/\s](\d{2,4})$/);
    if (m) {
      const d = new Date(m[2]+" "+m[1]+", "+(m[3].length===2?"20"+m[3]:m[3]));
      if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
    }
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      let [, a, b, y] = m;
      if (y.length===2) y = "20"+y;
      const day = parseInt(a,10), mon = parseInt(b,10);
      if (day <= 31 && mon <= 12) return y+"-"+String(mon).padStart(2,"0")+"-"+String(day).padStart(2,"0");
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
    return s;
  };

  const cleanNumber = (raw) => {
    let s = (raw||"").toString().trim();
    // Strip currency symbols/labels first (Rs, ₨, $) and any whitespace
    s = s.replace(/Rs\.?|\u20a8|\$/gi,"").replace(/\s+/g,"");
    // Now strip thousands-separator commas, but never touch the decimal
    // point — "9,190.00" -> "9190.00", not "919000".
    s = s.replace(/,/g,"");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  // Parse pasted text into a 2D grid of cells. Excel cell-range copy
  // always uses real tabs between columns and \n between rows — this
  // is the standard Windows/Mac clipboard text format for spreadsheet
  // selections, so pasting straight from Excel works the same as CSV.
  const parseRawTable = (text) => {
    const lines = text.replace(/\r/g,"").split("\n").filter(l=>l.trim()!=="");
    return lines.map(line=>{
      // Tab takes priority: if the line has any tabs, it's tab-separated
      // (Excel cell-range copy) and commas inside it are just thousands
      // separators in numbers (e.g. "9,190.00") — never split on those.
      // Only fall back to comma-splitting for genuine CSV (no tabs at all).
      let cells;
      if (/\t/.test(line)) {
        cells = line.split("\t");
      } else if (/,/.test(line)) {
        // True CSV: split on commas NOT inside quotes and NOT between two
        // digits (so "9,190.00" stays whole, but "9,190.00,Narration" still
        // splits at the boundary after the number).
        cells = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)(?!\d{3}\b)/);
      } else {
        cells = line.split(/\s{2,}/);
      }
      return cells.map(c=>c.replace(/^["']|["']$/g,"").trim());
    });
  };

  const startColumnMapping = () => {
    const table = parseRawTable(importText);
    if (table.length === 0) { setImportMsg("Nothing to parse — paste some rows first."); return; }
    const colCount = Math.max(...table.map(r=>r.length));
    setRawTable(table);
    const guesses = Array.from({length:colCount}, (_,i)=>{
      const sample = (table[0]?.[i]||"").toLowerCase();
      if (/date/.test(sample)) return "date";
      if (/narrat|descr|particular|remark/.test(sample)) return "narration";
      if (/withdraw|debit|paid/.test(sample)) return "withdraw";
      if (/deposit|credit|received/.test(sample)) return "deposit";
      return "ignore";
    });
    setColRoles(guesses);
    setMappingStep("map");
    setImportMsg("");
  };

  const firstRowIsHeader = (table, roles) => {
    if (table.length === 0) return false;
    const r0 = table[0];
    const dateIdx = roles.indexOf("date");
    if (dateIdx === -1) return false;
    const cell = (r0[dateIdx]||"").trim();
    return cell !== "" && isNaN(Date.parse(cell)) && !/^\d{4,6}$/.test(cell);
  };

  const applyColumnMapping = () => {
    const dateIdx     = colRoles.indexOf("date");
    const narrIdx      = colRoles.indexOf("narration");
    const withdrawIdx  = colRoles.indexOf("withdraw");
    const depositIdx   = colRoles.indexOf("deposit");

    if (dateIdx === -1) { setImportMsg("Assign a column to Date before continuing."); return; }
    if (withdrawIdx === -1 && depositIdx === -1) {
      setImportMsg("Assign at least one column to Withdrawal or Deposit."); return;
    }

    const skipHeader = firstRowIsHeader(rawTable, colRoles);
    const dataRows = skipHeader ? rawTable.slice(1) : rawTable;

    const rows = dataRows.map((r,i)=>{
      const dateRaw = r[dateIdx] || "";
      const narration = narrIdx>=0 ? (r[narrIdx]||"") : "";
      const withdraw = withdrawIdx>=0 ? cleanNumber(r[withdrawIdx]) : 0;
      const deposit  = depositIdx>=0  ? cleanNumber(r[depositIdx])  : 0;
      return {
        index:i, date:normalizeDate(dateRaw), dateRaw, narration:narration.trim(),
        withdraw, deposit, status:"new",
      };
    });
    setImportRows(rows);
    setConfirmedDups(new Set());
    setMappingStep("preview");
    setImportMsg("Mapped "+rows.length+" rows. Review below then click Import."+(skipHeader?" (header row skipped)":""));
  };

  const resetImportWizard = () => {
    setImportText(""); setRawTable([]); setColRoles([]);
    setImportRows([]); setMappingStep("paste"); setImportMsg("");
  };

  const companyName = homeSettings?.company_name || "";
  const fiscalYear  = homeSettings?.fiscal_year_bs || "";
  // Approval/void rights belong to the COMPANY's OWN admin, not the
  // platform Super Admin — Super Admin has no day-to-day involvement
  // in any individual company's transactions, by explicit design.
  // `companies` (from login) carries a per-company role; find this
  // user's role for the company currently in view.
  const myCompanyRole = (companies||[]).find(c=>c.id===companyId)?.role;
  const isCompanyAdmin = myCompanyRole === "company_admin";
  const isSuperAdmin = isCompanyAdmin; // kept as alias so existing JSX checks below need no further renaming
  injectPrint();

  const fetchAccounts = useCallback(async()=>{
    if(!companyId) return;
    const r = await fetch(BACKEND+"/api/bank-accounts?company_id="+companyId);
    const d = await r.json();
    setAccounts(d.accounts||[]);
  },[companyId]);

  useEffect(()=>{ fetchAccounts(); },[fetchAccounts]);

  const fetchGlAccounts = useCallback(()=>{
    if(!companyId) return;
    fetch(BACKEND+"/api/gl-accounts?company_id="+companyId)
      .then(r=>r.json()).then(d=>setGlAccounts(d.gl_accounts||[]));
  },[companyId]);

  useEffect(()=>{
    fetchGlAccounts();
    fetch(BACKEND+"/api/parties?company_id="+companyId+"&limit=500")
      .then(r=>r.json()).then(d=>setParties(d.parties||[]));
    fetch(BACKEND+"/api/party-types")
      .then(r=>r.json())
      .then(d=>{
        const names = (d.party_types||[]).map(t=>t.type_name);
        if(names.length>0) setPartyTypeNames(names);
      })
      .catch(e=>console.error("[BankLedger] party-types fetch failed:", e));
    fetch(BACKEND+"/api/lc-master?company_id="+companyId+"&active_only=true")
      .then(r=>r.json())
      .then(d=>setLcOptions((d.lcs||[]).map(l=>l.lc_no)))
      .catch(e=>console.error("[BankLedger] lc-master fetch failed:", e));
  },[companyId,fetchGlAccounts]);

  const fetchEntries = useCallback(async()=>{
    if(!companyId||!selAccount) return;
    setLoading(true); setError("");
    let url=BACKEND+"/api/bank-ledger?company_id="+companyId+"&bank_account_id="+selAccount.id+"&limit=500";
    if(dateFrom) url+="&from_date="+dateFrom;
    if(dateTo)   url+="&to_date="+dateTo;
    const r=await fetch(url);
    const d=await r.json();
    if(d.error) setError(d.error);
    else setEntries(d.entries||[]);
    setLoading(false);
  },[companyId,selAccount,dateFrom,dateTo]);

  useEffect(()=>{ fetchEntries(); },[fetchEntries]);

  const [voidedEntries, setVoidedEntries] = useState([]);
  const fetchVoidedEntries = useCallback(async()=>{
    if(!companyId||!selAccount) return;
    const url=BACKEND+"/api/bank-ledger?company_id="+companyId+"&bank_account_id="+selAccount.id+"&limit=500&include_voided=true";
    const r=await fetch(url);
    const d=await r.json();
    setVoidedEntries((d.entries||[]).filter(e=>e.is_void));
  },[companyId,selAccount]);

  useEffect(()=>{ if(activeTab==="voided") fetchVoidedEntries(); },[activeTab,fetchVoidedEntries]);

  const fetchSplitReqs = useCallback(async()=>{
    if(!companyId||!isSuperAdmin) return;
    const r=await fetch(BACKEND+"/api/bank-split-requests?company_id="+companyId+"&status=pending");
    const d=await r.json();
    setSplitReqs(d.requests||[]);
  },[companyId,isSuperAdmin]);

  const fetchEditReqs = useCallback(async()=>{
    if(!companyId||!isSuperAdmin) return;
    const r=await fetch(BACKEND+"/api/bank-edit-requests?company_id="+companyId+"&status=pending");
    const d=await r.json();
    setEditReqs(d.requests||[]);
  },[companyId,isSuperAdmin]);

  useEffect(()=>{ if(activeTab==="split-requests") fetchSplitReqs(); },[activeTab,fetchSplitReqs]);
  useEffect(()=>{ if(activeTab==="edit-requests") fetchEditReqs(); },[activeTab,fetchEditReqs]);

  const totals = entries.reduce((a,e)=>({
    wd:  a.wd  +(Number(e.withdraw)||0),
    dep: a.dep +(Number(e.deposit)||0),
    unclassified: a.unclassified + (!e.entry_type||e.entry_type===""?1:0),
    unposted: a.unposted + (!e.is_posted_gl?1:0),
  }),{wd:0,dep:0,unclassified:0,unposted:0});

  const closingBal = entries.length>0 ? entries[entries.length-1].balance : (selAccount?.opening_balance||0);

  const exportCSV = () => {
    if(!selAccount) return;
    const hdrs = ["Ref","Date","Narration","Withdraw","Deposit","Balance",
      "Type","GL/Party","Charge Type","Source","Posted GL","Posted Party","Status"];
    const rows = [hdrs];
    rows.push(["","Opening Balance","Balance b/f","","",
      Number(selAccount.opening_balance||0),"OB","","","OB Setup","","",""]);
    entries.forEach(e=>{
      rows.push([
        e.internal_ref, e.entry_date, e.narration,
        e.withdraw||"", e.deposit||"", e.balance,
        e.entry_type||"", e.party_name||e.gl_account||"", e.charge_type||"",
        e.source||"", e.is_posted_gl?"Yes":"No", e.is_posted_party?"Yes":"No",
        e.is_void?"VOIDED":"Active",
      ]);
    });
    rows.push(["","","CLOSING BALANCE","","",closingBal,"","","","","","",""]);
    const csv = rows.map(r=>r.map(v=>`"${v??""}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download = ("bank_ledger_"+selAccount.account_name+"_"+companyName+".csv").replace(/\s+/g,"_");
    a.click();
  };

  const classifySave = async(id, data) => {
    setClassifyError("");
    try {
      const r = await fetch(BACKEND+"/api/bank-ledger/"+id+"/classify",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          company_id:companyId,
          requested_by:session?.user?.username||"",
          requesting_user_id:session?.user?.id,
          ...data,
        }),
      });
      const d = await r.json();
      if(d.success){ setExpandedRow(null); await fetchEntries(); return d; }
      else { setClassifyError(d.error||"Classify failed"); return d; }
    } catch(err) {
      setClassifyError("Network error: "+err.message);
      return { success:false, error:err.message };
    }
  };

  const requestSplit = async(entry) => {
    const note = window.prompt(
      "Request split approval for "+entry.internal_ref+"\n"+
      "Amount: Rs."+fmtT(entry.deposit||entry.withdraw)+"\n\n"+
      "Describe what you know (e.g. 'LC payment — awaiting charge breakdown from bank'):"
    );
    if(note===null) return;
    try {
      const r = await fetch(BACKEND+"/api/bank-ledger/"+entry.id+"/request-split",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          company_id:companyId,
          request_note:note,
          requested_by:session?.user?.username||"",
        }),
      });
      const d = await r.json();
      if(d.success) { alert("Split request submitted. Admin will review.\n"+d.message); fetchEntries(); }
      else alert("Error: "+d.error);
    } catch(err) {
      alert("Network error: "+err.message);
    }
  };

  const reviewSplit = async(reqId, action) => {
    const note = window.prompt(
      (action==="approve"?"Approve":"Reject")+" split request?\n\nAdd a note for the user:"
    );
    if(note===null) return;
    try {
      const r = await fetch(BACKEND+"/api/bank-split-requests/"+reqId+"/review",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          company_id:companyId, action, review_note:note,
          reviewed_by:session?.user?.username||"",
        }),
      });
      const d = await r.json();
      if(d.success){ alert(d.message); fetchSplitReqs(); }
      else alert("Error: "+d.error);
    } catch(err) {
      alert("Network error: "+err.message);
    }
  };

  const submitEditRequest = async(proposedData) => {
    if(!editRequestEntry) return;
    try {
      const r = await fetch(BACKEND+"/api/bank-ledger/"+editRequestEntry.id+"/request-edit",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          company_id:companyId,
          requesting_user_id:session?.user?.id,
          ...proposedData,
        }),
      });
      const d = await r.json();
      if(d.success){
        setEditRequestEntry(null);
        setPostMsg("✅ "+d.message);
        fetchEditReqs();
      } else {
        alert("Error: "+d.error);
      }
    } catch(err) {
      alert("Network error: "+err.message);
    }
  };

  const reviewEdit = async(reqId, action) => {
    const note = window.prompt(
      (action==="approve"?"Approve":"Reject")+" this edit request?\n\n"+
      (action==="approve"
        ? "Approving will automatically reverse the original GL/Party Ledger postings and re-post fresh ones with the corrected classification, under the same reference number.\n\n"
        : "")+
      "Add a note:"
    );
    if(note===null) return;
    try {
      const r = await fetch(BACKEND+"/api/bank-edit-requests/"+reqId+"/review",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          company_id:companyId, action, review_note:note,
          requesting_user_id:session?.user?.id,
        }),
      });
      const d = await r.json();
      if(d.success){ alert(d.message||("Request "+d.status)); fetchEditReqs(); fetchEntries(); }
      else alert("Error: "+d.error);
    } catch(err) {
      alert("Network error: "+err.message);
    }
  };

  const doVoid = async(confirmText, reason) => {
    if(!voidEntry) return;
    try {
      const r = await fetch(BACKEND+"/api/bank-ledger/"+voidEntry.id+"/void",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          company_id:companyId,
          requesting_user_id:session?.user?.id,
          confirm_doc_number:confirmText,
          void_reason:reason,
        }),
      });
      const d = await r.json();
      if(d.success){
        setVoidEntry(null);
        setPostMsg("✅ "+d.message+" GL reversals: "+d.gl_reversals+" · Party reversals: "+d.party_reversals);
        fetchEntries();
        fetchVoidedEntries();
      } else {
        alert("Error: "+d.error);
      }
    } catch(err) {
      alert("Network error: "+err.message);
    }
  };

  const postToGL = async(ids) => {
    setPosting(true); setPostMsg("");
    const r=await fetch(BACKEND+"/api/bank-ledger/post",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        company_id:companyId,
        bank_account_id:selAccount?.id,
        entry_ids:ids,
        requesting_user_id:session?.user?.id,
      }),
    });
    const d=await r.json();
    if(d.success){
      let msg = "✅ Posted: "+d.posted_gl+" GL entries, "+d.posted_party+" party entries. Skipped: "+d.skipped+".";
      if(d.errors && d.errors.length > 0){
        msg += "\n⚠ "+d.errors.length+" warning(s): "+d.errors.join(" | ");
      }
      setPostMsg(msg);
      fetchEntries();
    } else setPostMsg("❌ "+d.error);
    setPosting(false);
  };

  const saveManual = async(confirmed=false) => {
    if(!selAccount){ setManMsg("Select a bank account first"); return; }
    setManSaving(true); setManMsg("");
    const body = {
      company_id:companyId, bank_account_id:selAccount.id,
      entry_date:manDate, date_bs:manDateBs, narration:manNarr,
      withdraw:parseFloat(manWd)||0, deposit:parseFloat(manDep)||0,
      entry_type:manType, gl_account:manGL, party_name:manParty,
      party_type:manPartyType, lc_no:manLcNo, charge_type:manCharge, invoice_ref:manRef,
      confirmed_duplicate:confirmed,
      requesting_user_id:session?.user?.id,
    };
    const r=await fetch(BACKEND+"/api/bank-ledger/manual",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body),
    });
    const d=await r.json();
    if(r.status===409&&d.duplicate){
      setDupModal({
        message:d.message, ref:d.existing_ref, narr:d.existing_narration,
        pendingData:body,
      });
      setManSaving(false); return;
    }
    if(d.success){
      setManMsg("✅ Saved: "+d.internal_ref+" · Balance: Rs."+fmtT(d.balance));
      setManDate(new Date().toISOString().slice(0,10));
      setManNarr(""); setManWd(""); setManDep(""); setManRef("");
      setManType(""); setManGL(""); setManParty(""); setManPartyType(""); setManLcNo(""); setManCharge("");
      fetchEntries();
    } else setManMsg("❌ "+(d.error||"Save failed"));
    setManSaving(false);
  };

  const doImport = async() => {
    if(!selAccount){ setImportMsg("Select a bank account first"); return; }
    setImporting(true); setImportMsg("");
    try {
      const r=await fetch(BACKEND+"/api/bank-ledger/import",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          company_id:companyId, bank_account_id:selAccount.id,
          rows:importRows, confirmed_duplicates:[...confirmedDups],
        }),
      });
      const d=await r.json();
      if(d.success){
        setImportMsg("✅ Saved: "+d.saved+" · Skipped: "+d.skipped);
        const statusMap={};
        (d.rows||[]).forEach(r=>{ statusMap[r.index]=r; });
        setImportRows(prev=>prev.map((row,i)=>({
          ...row,
          status: statusMap[i]?.status||row.status,
          internal_ref: statusMap[i]?.internal_ref||"",
          reason: statusMap[i]?.reason||"",
        })));
        fetchEntries();
      } else setImportMsg("❌ "+d.error);
    } catch(err) {
      setImportMsg("❌ Network error: "+err.message);
    } finally {
      setImporting(false);
    }
  };

  const TH  = {padding:"7px 8px",fontSize:9,fontWeight:700,color:"#FFF",background:NAVY,whiteSpace:"nowrap"};
  const THR  = {...TH,textAlign:"right"};
  const TD  = {padding:"7px 8px",fontSize:11,borderBottom:"1px solid "+BORDER,whiteSpace:"nowrap"};
  const TDR = {...TD,textAlign:"right",fontFamily:"monospace"};

  const STATUS_COLORS = {
    new:"#E8F5E9", duplicate:"#FFF3CD", saved:"#E8F5E9", error:"#FEECEC", skipped:"#F5F5F5",
  };

  return (
    <div style={{fontFamily:"Arial,sans-serif",background:CREAM,minHeight:"100vh",display:"flex"}}>

      {dupModal && (
        <DuplicateModal
          message={dupModal.message}
          existingRef={dupModal.ref}
          existingNarration={dupModal.narr}
          onConfirm={async()=>{
            setDupModal(null);
            setManSaving(true);
            const r=await fetch(BACKEND+"/api/bank-ledger/manual",{
              method:"POST",headers:{"Content-Type":"application/json"},
              body:JSON.stringify({...dupModal.pendingData,confirmed_duplicate:true}),
            });
            const d=await r.json();
            if(d.success){
              setManMsg("✅ Saved (seq "+(d.seq_no||"")+": "+d.internal_ref);
              fetchEntries();
            } else setManMsg("❌ "+d.error);
            setManSaving(false);
          }}
          onCancel={()=>setDupModal(null)}
        />
      )}

      {voucherId && (
        <VoucherModal
          uniqueId={voucherId}
          companyId={companyId}
          companyName={companyName}
          fiscalYear={fiscalYear}
          session={session}
          isSuperAdmin={isSuperAdmin}
          onClose={()=>setVoucherId(null)}
        />
      )}

      {voidEntry && (
        <VoidModal
          entry={voidEntry}
          onConfirm={doVoid}
          onCancel={()=>setVoidEntry(null)}
        />
      )}

      {editRequestEntry && (
        <EditRequestModal
          entry={editRequestEntry}
          glAccounts={glAccounts}
          parties={parties}
          partyTypeNames={partyTypeNames}
          lcOptions={lcOptions}
          onSubmit={submitEditRequest}
          onCancel={()=>setEditRequestEntry(null)}
        />
      )}

      <AccountSidebar
        accounts={accounts} selected={selAccount}
        onSelect={a=>{ setSelAccount(a); setEntries([]); setExpandedRow(null); setSplitRow(null); }}
        onAdd={fetchAccounts}
        glAccounts={glAccounts}
        companyId={companyId}
        session={session}
        onGlAdded={fetchGlAccounts}
      />

      <div id="bl-print-area" style={{flex:1,padding:"22px 20px",overflowY:"auto"}}>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:22,fontWeight:700,color:NAVY}}>
              {selAccount ? selAccount.account_name : "Bank & Cash Ledger"}
            </div>
            <div style={{fontSize:12,color:DIM,marginTop:2}}>
              {companyName+" · FY "+fiscalYear}
              {selAccount && <> · <span style={{fontFamily:"monospace"}}>{selAccount.gl_code}</span>
                {selAccount.account_no && <> · Acc: {selAccount.account_no}</>}</>}
            </div>
          </div>
          <div className="no-print" style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {onGoToGLMaster       && <button onClick={onGoToGLMaster}       style={{padding:"7px 12px",background:"#FFF",border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:NAVY}}>📘 GL Master</button>}
            {onGoToBankBalances   && <button onClick={onGoToBankBalances}   style={{padding:"7px 12px",background:"#FFF",border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:NAVY}}>📊 Bank Balances</button>}
          </div>
        </div>

        {selAccount && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:16}}>
            {[
              {label:"OPENING BAL",   value:"Rs."+fmtT(selAccount.opening_balance||0), color:NAVY},
              {label:"TOTAL WITHDRAW",value:"Rs."+fmtT(totals.wd),   color:ERR},
              {label:"TOTAL DEPOSIT", value:"Rs."+fmtT(totals.dep),  color:GREEN},
              {label:"CLOSING BAL",   value:"Rs."+fmtT(closingBal),  color:NAVY, bold:true},
              {label:"UNPOSTED",      value:totals.unposted+" entries",
               color:totals.unposted>0?ERR:GREEN},
            ].map((c,i)=>(
              <div key={i} style={{background:"#FFF",border:"1px solid "+BORDER,padding:"10px 12px"}}>
                <div style={{fontSize:9,fontWeight:700,color:DIM,letterSpacing:"0.08em",marginBottom:4}}>{c.label}</div>
                <div style={{fontSize:13,fontWeight:c.bold?800:700,color:c.color,fontFamily:"monospace"}}>{c.value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="no-print" style={{display:"flex",gap:0,borderBottom:"2px solid "+BORDER,marginBottom:16}}>
          {[
            {id:"ledger",  label:"Bank Ledger"},
            {id:"manual",  label:"+ Manual Entry"},
            {id:"import",  label:"↑ Import Statement"},
            {id:"voided",  label:"Voided"},
            ...(isSuperAdmin?[{id:"split-requests",label:"Split Requests"+(splitReqs.length>0?" ("+splitReqs.length+")":"")}]:[]),
            ...(isSuperAdmin?[{id:"edit-requests",label:"Edit Requests"+(editReqs.length>0?" ("+editReqs.length+")":"")}]:[]),
          ].map(t=>(
            <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
              padding:"9px 18px",border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              background:activeTab===t.id?NAVY:"#FFF",
              color:activeTab===t.id?"#FFF":DIM,
              borderBottom:"2px solid "+(activeTab===t.id?NAVY:"transparent"),
              marginBottom:-2,fontFamily:"Arial",
            }}>{t.label}</button>
          ))}
          <div style={{flex:1}}/>
          {activeTab==="ledger" && selAccount && (
            <div style={{display:"flex",gap:6,paddingBottom:4,alignItems:"center"}}>
              <span style={{fontSize:11,color:DIM}}>From</span>
              <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                style={{padding:"5px 8px",border:"1px solid "+BORDER,fontSize:11}}/>
              <span style={{fontSize:11,color:DIM}}>To</span>
              <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                style={{padding:"5px 8px",border:"1px solid "+BORDER,fontSize:11}}/>
              <button onClick={exportCSV} style={{padding:"5px 12px",background:"#FFF",border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:GREEN}}>↓ CSV</button>
              <button onClick={()=>window.print()} style={{padding:"5px 12px",background:"#FFF",border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:ERR}}>↓ PDF</button>
            </div>
          )}
        </div>

        {activeTab==="ledger" && (
          <>
            {!selAccount ? (
              <div style={{padding:60,textAlign:"center",color:DIM}}>
                <div style={{fontSize:48,marginBottom:12}}>🏦</div>
                <div style={{fontSize:16,fontWeight:600,color:NAVY,marginBottom:6}}>Select a Bank Account</div>
                <div style={{fontSize:13}}>Choose from the left panel or add a new bank/cash account.</div>
              </div>
            ) : loading ? (
              <div style={{padding:40,textAlign:"center",color:DIM}}>Loading…</div>
            ) : error ? (
              <div style={{padding:12,color:ERR,background:"#FFF0F0",border:"1px solid "+ERR}}>{error}</div>
            ) : (
              <>
                {classifyError && (
                  <div style={{padding:10,marginBottom:12,fontSize:12,fontWeight:600,
                    background:"#FFF0F0",color:ERR,border:"1px solid "+ERR,
                    display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span>⚠ {classifyError}</span>
                    <button onClick={()=>setClassifyError("")} style={{background:"transparent",
                      border:"none",color:ERR,cursor:"pointer",fontSize:14,padding:"0 4px"}}>✕</button>
                  </div>
                )}
                {postMsg && (
                  <div style={{padding:10,marginBottom:12,fontSize:12,fontWeight:600,
                    background:postMsg.startsWith("✅")?"#D4EDDA":"#FFF0F0",
                    color:postMsg.startsWith("✅")?GREEN:ERR,
                    border:"1px solid "+(postMsg.startsWith("✅")?"#C3E6CB":ERR),
                    whiteSpace:"pre-wrap"}}>
                    {postMsg}
                  </div>
                )}

                {totals.unposted > 0 && (
                  <div style={{marginBottom:12,display:"flex",gap:8,alignItems:"center"}}>
                    <button disabled={posting}
                      onClick={()=>postToGL(
                        entries.filter(e=>!e.is_posted_gl&&e.entry_type&&e.entry_type!=="")
                          .map(e=>e.id)
                      )}
                      style={{padding:"9px 18px",background:posting?"#AAA":NAVY,
                        color:"#FFF",border:"none",fontWeight:700,fontSize:12,
                        cursor:posting?"not-allowed":"pointer",fontFamily:"Arial"}}>
                      {posting?"Posting…":"▶ Post "+entries.filter(e=>!e.is_posted_gl&&e.entry_type&&e.entry_type!=="").length+" classified entries to GL"}
                    </button>
                    <span style={{fontSize:11,color:DIM}}>
                      {totals.unclassified+" unclassified · "+totals.unposted+" unposted"}
                    </span>
                  </div>
                )}

                <div style={{overflowX:"auto"}}>
                  <table style={{borderCollapse:"collapse",width:"100%",minWidth:1000}}>
                    <thead>
                      <tr>
                        <th style={TH}>REF</th>
                        <th style={TH}>DATE</th>
                        <th style={{...TH,minWidth:220}}>NARRATION</th>
                        <th style={THR}>WITHDRAW</th>
                        <th style={THR}>DEPOSIT</th>
                        <th style={THR}>BALANCE</th>
                        <th style={TH}>TYPE</th>
                        <th style={TH}>GL / PARTY</th>
                        <th style={TH}>CHARGE</th>
                        <th style={TH}>GL</th>
                        <th style={TH}>PTY</th>
                        <th style={{...TH,width:120}}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selAccount && (
                        <tr style={{background:"#FFF8E6"}}>
                          <td style={{...TD,fontWeight:700,color:GOLD}}>—</td>
                          <td style={{...TD,fontSize:10}}>—</td>
                          <td style={{...TD,fontWeight:700,color:GOLD,fontStyle:"italic"}}>
                            Opening Balance
                          </td>
                          <td style={THR}/>
                          <td style={THR}/>
                          <td style={{...TDR,fontWeight:800,color:Number(selAccount.opening_balance||0)>=0?NAVY:ERR}}>
                            {fmtT(Math.abs(Number(selAccount.opening_balance)||0))}
                            {" "}{Number(selAccount.opening_balance||0)>=0?"Dr":"Cr"}
                          </td>
                          <td style={TD}/><td style={TD}/><td style={TD}/><td style={TD}/><td style={TD}/><td style={TD}/>
                        </tr>
                      )}
                      {entries.length===0 ? (
                        <tr><td colSpan={12} style={{padding:30,textAlign:"center",color:DIM}}>
                          No entries yet. Use Import or Manual Entry tabs to add transactions.
                        </td></tr>
                      ) : entries.map((e,i)=>{
                        const isExpanded = expandedRow===e.id;
                        const isSplit    = splitRow===e.id;
                        const canSplit   = (e.entry_type==="Party"||e.entry_type==="GL"||!e.entry_type)
                                           && !e.is_posted_gl;
                        const splitApproved = e.split_status==="approved";
                        const splitPending  = e.split_status==="pending_approval";
                        const splitDone     = e.split_status==="split_done"||e.is_split;
                        const seqBadge = (e.seq_no||1)>1;
                        const badgeText  = e.entry_type==="Party" ? (e.party_type||"Party") : e.entry_type;
                        const typeColor  = e.entry_type==="Party"
                          ? getPartyTypeColor(e.party_type)
                          : (ENTRY_TYPE_COLORS[e.entry_type]||DIM);

                        return [
                          <tr key={e.id} style={{
                            background:i%2===0?"#FFF":LIGHT,
                            opacity:e.is_posted_gl?0.75:1,
                          }}>
                            <td style={{...TD,fontFamily:"monospace",fontWeight:600,color:NAVY}}>
                              {e.is_posted_gl ? (
                                <span onClick={()=>setVoucherId(e.internal_ref)}
                                  style={{cursor:"pointer",textDecoration:"underline",
                                    textDecorationStyle:"dotted"}}
                                  title="View journal voucher">
                                  {e.internal_ref}
                                </span>
                              ) : e.internal_ref}
                              {seqBadge && <span style={{fontSize:9,background:GOLD,color:"#FFF",
                                padding:"1px 4px",marginLeft:4,borderRadius:2}}>{"seq"+e.seq_no}</span>}
                              {splitDone && <span style={{fontSize:9,background:NAVY,color:"#FFF",
                                padding:"1px 4px",marginLeft:4,borderRadius:2}}>SPLIT</span>}
                            </td>
                            <td style={{...TD,fontSize:10}}>{e.entry_date}</td>
                            <td style={{...TD,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis"}}>
                              {e.narration}
                              {e.source==="manual" && <span style={{fontSize:9,color:GOLD,marginLeft:4}}>manual</span>}
                            </td>
                            <td style={{...TDR,color:ERR,fontWeight:Number(e.withdraw)>0?700:400}}>
                              {fmt(e.withdraw)}
                            </td>
                            <td style={{...TDR,color:GREEN,fontWeight:Number(e.deposit)>0?700:400}}>
                              {fmt(e.deposit)}
                            </td>
                            <td style={{...TDR,fontWeight:700,color:Number(e.balance)>=0?NAVY:ERR}}>
                              {fmtT(e.balance)}
                            </td>
                            <td style={{...TD}}>
                              {e.entry_type ? (
                                <span style={{background:typeColor,color:"#FFF",
                                  padding:"2px 7px",fontSize:10,fontWeight:700,
                                  borderRadius:2}}>{badgeText}</span>
                              ) : (
                                <span style={{color:ERR,fontSize:10}}>unclassified</span>
                              )}
                            </td>
                            <td style={{...TD,fontSize:10,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis"}}>
                              {e.party_name||e.gl_account||"—"}
                            </td>
                            <td style={{...TD,fontSize:10,color:DIM}}>
                              {e.charge_type||"—"}
                              {e.lc_no && (
                                <div style={{marginTop:2}}>
                                  <span style={{background:LC_TAG_COLOR,color:"#FFF",padding:"1px 5px",
                                    fontSize:8.5,fontWeight:700,borderRadius:2}}>LC {e.lc_no}</span>
                                </div>
                              )}
                            </td>
                            <td style={{...TD,textAlign:"center",fontSize:13}}>
                              {e.is_posted_gl ? "✅" : "⏳"}
                            </td>
                            <td style={{...TD,textAlign:"center",fontSize:13}}>
                              {e.is_posted_party ? "✅" : e.entry_type==="Party" ? "⏳" : "—"}
                            </td>
                            <td style={{...TD}}>
                              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                                {!e.is_posted_gl && !splitDone && (
                                  <button onClick={()=>setExpandedRow(isExpanded?null:e.id)}
                                    style={{padding:"3px 7px",fontSize:9,fontWeight:700,
                                      background:isExpanded?NAVY:"#FFF",
                                      color:isExpanded?"#FFF":NAVY,
                                      border:"1px solid "+NAVY,cursor:"pointer"}}>
                                    {isExpanded?"▲":"▼"} Classify
                                  </button>
                                )}
                                {canSplit && !splitDone && (
                                  splitApproved ? (
                                    <button onClick={()=>setSplitRow(isSplit?null:e.id)}
                                      style={{padding:"5px 10px",fontSize:10,fontWeight:800,
                                        background:isSplit?NAVY:GREEN,color:"#FFF",
                                        border:"none",cursor:"pointer",borderRadius:3,
                                        boxShadow:isSplit?"none":"0 0 0 2px rgba(46,125,79,0.25)",
                                        animation:isSplit?"none":undefined}}>
                                      {isSplit?"▲ Close":"✂ Allocate Now"}
                                    </button>
                                  ) : splitPending ? (
                                    <span style={{fontSize:9,color:GOLD,fontWeight:700}}>⏳ Pending</span>
                                  ) : (
                                    <button onClick={()=>requestSplit(e)}
                                      style={{padding:"3px 7px",fontSize:9,fontWeight:600,
                                        background:"#FFF",color:GOLD,
                                        border:"1px solid "+GOLD,cursor:"pointer"}}>
                                      ✂ Req. Split
                                    </button>
                                  )
                                )}
                                {e.is_posted_gl && !e.is_void && (
                                  <button onClick={()=>setEditRequestEntry(e)}
                                    title="Request a correction to this posted entry (requires admin approval)"
                                    style={{padding:"3px 7px",fontSize:9,fontWeight:600,
                                      background:"#FFF",color:GOLD,
                                      border:"1px solid "+GOLD,cursor:"pointer"}}>
                                    ✎ Edit
                                  </button>
                                )}
                                {isSuperAdmin && !e.is_void && (
                                  <button onClick={()=>setVoidEntry(e)}
                                    title="Void this entry (soft delete with audit trail)"
                                    style={{padding:"3px 7px",fontSize:9,fontWeight:700,
                                      background:"#FFF",color:ERR,
                                      border:"1px solid "+ERR,cursor:"pointer"}}>
                                    ✕ Void
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>,
                          splitApproved && !splitDone && !isSplit && (
                            <tr key={"approved-banner-"+e.id}>
                              <td colSpan={12} style={{padding:0,display:"table-cell",minWidth:"100%"}}>
                                <div style={{position:"sticky",left:0,width:"min(94vw, 1400px)",boxSizing:"border-box"}}>
                                <div onClick={()=>setSplitRow(e.id)}
                                  style={{padding:"7px 14px",background:"#EAF7EE",
                                    borderTop:"1px solid #C3E6CB",borderBottom:"1px solid #C3E6CB",
                                    cursor:"pointer",display:"flex",justifyContent:"space-between",
                                    alignItems:"center"}}>
                                  <span style={{fontSize:11,color:GREEN,fontWeight:700}}>
                                    ✓ Admin approved this entry for splitting — allocate Rs.{fmtT(Number(e.deposit||0)||Number(e.withdraw||0))} across charge types or GL heads.
                                  </span>
                                  <span style={{fontSize:10,color:GREEN,fontWeight:800,
                                    textDecoration:"underline"}}>
                                    Allocate now →
                                  </span>
                                </div>
                                </div>
                              </td>
                            </tr>
                          ),
                          isExpanded && !splitDone && (
                            <tr key={"cl-"+e.id}>
                              <td colSpan={12} style={{padding:0,display:"table-cell",minWidth:"100%"}}>
                                <div style={{position:"sticky",left:0,width:"min(94vw, 1400px)",boxSizing:"border-box"}}>
                                <ClassifyRow
                                  entry={e}
                                  glAccounts={glAccounts}
                                  parties={parties}
                                  partyTypeNames={partyTypeNames}
                                  lcOptions={lcOptions}
                                  onSave={classifySave}
                                  isSuperAdmin={isSuperAdmin}
                                  companyId={companyId}
                                  onSplitDone={()=>{ setExpandedRow(null); fetchEntries(); }}
                                />
                                </div>
                              </td>
                            </tr>
                          ),
                          isSplit && splitApproved && !splitDone && (
                            <tr key={"sp-"+e.id}>
                              <td colSpan={12} style={{padding:0,display:"table-cell",minWidth:"100%"}}>
                                <div style={{position:"sticky",left:0,width:"min(94vw, 1400px)",boxSizing:"border-box"}}>
                                <SplitPanel
                                  entry={e}
                                  glAccounts={glAccounts}
                                  parties={parties}
                                  lcOptions={lcOptions}
                                  companyId={companyId}
                                  session={session}
                                  onClose={()=>setSplitRow(null)}
                                  onSaved={()=>{ setSplitRow(null); fetchEntries(); }}
                                />
                                </div>
                              </td>
                            </tr>
                          ),
                          isSplit && !splitApproved && !splitDone && (
                            <tr key={"sp-wait-"+e.id}>
                              <td colSpan={12} style={{padding:"14px 18px",background:"#FFF8E6",
                                borderTop:"1px solid "+GOLD,borderBottom:"1px solid "+GOLD}}>
                                <span style={{fontSize:12,color:"#856404"}}>
                                  ⏳ Refreshing entry status… If this doesn't open the split
                                  allocation panel within a moment, close this row and click
                                  "▼ Classify" again, then re-check the split box and save.
                                </span>
                              </td>
                            </tr>
                          ),
                        ];
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{background:NAVY}}>
                        <td colSpan={3} style={{padding:"9px 8px",fontWeight:700,color:"#FFF",fontSize:12}}>
                          {"TOTAL ("+entries.length+" entries)"}
                        </td>
                        <td style={{...TDR,background:NAVY,fontWeight:700,color:"#FF9999",fontSize:13,borderBottom:"none"}}>{fmtT(totals.wd)}</td>
                        <td style={{...TDR,background:NAVY,fontWeight:700,color:"#90EE90",fontSize:13,borderBottom:"none"}}>{fmtT(totals.dep)}</td>
                        <td style={{...TDR,background:NAVY,fontWeight:800,color:"#FFD700",fontSize:13,borderBottom:"none"}}>{fmtT(closingBal)}</td>
                        <td colSpan={6} style={{background:NAVY}}/>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* ══ VOIDED TAB ══ */}
        {activeTab==="voided" && (
          <div>
            {!selAccount ? (
              <div style={{padding:40,textAlign:"center",color:DIM}}>
                Select a bank account from the left panel to view voided entries.
              </div>
            ) : voidedEntries.length===0 ? (
              <div style={{padding:30,textAlign:"center",color:DIM,background:"#FFF",
                border:"1px solid "+BORDER}}>
                No voided entries for {selAccount.account_name}.
              </div>
            ) : (
              <>
                <div style={{fontSize:14,fontWeight:700,color:ERR,marginBottom:4}}>
                  Voided Entries — {selAccount.account_name}
                </div>
                <div style={{fontSize:12,color:DIM,marginBottom:14}}>
                  Soft-deleted entries. GL and Party Ledger postings reversed. Cannot be permanently removed.
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{borderCollapse:"collapse",width:"100%"}}>
                    <thead>
                      <tr>
                        {["REF","DATE","NARRATION","WITHDRAW","DEPOSIT","VOIDED BY","VOIDED AT","REASON"].map(h=>(
                          <th key={h} style={{padding:"7px 8px",fontSize:9,fontWeight:700,
                            color:"#FFF",background:"#7B3030",whiteSpace:"nowrap",
                            textAlign:["WITHDRAW","DEPOSIT"].includes(h)?"right":"left"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {voidedEntries.map((e,i)=>(
                        <tr key={e.id} style={{background:i%2===0?"#FFF8F8":"#FFF0F0"}}>
                          <td style={{padding:"8px",fontSize:11,borderBottom:"1px solid "+BORDER,
                            fontFamily:"monospace",fontWeight:700,color:ERR,textDecoration:"line-through"}}>
                            {e.internal_ref}
                          </td>
                          <td style={{padding:"8px",fontSize:10,borderBottom:"1px solid "+BORDER,
                            color:DIM,textDecoration:"line-through"}}>{e.entry_date}</td>
                          <td style={{padding:"8px",fontSize:11,borderBottom:"1px solid "+BORDER,
                            color:DIM,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis"}}>
                            {e.narration}
                          </td>
                          <td style={{padding:"8px",fontSize:12,borderBottom:"1px solid "+BORDER,
                            textAlign:"right",fontFamily:"monospace",color:ERR}}>{fmt(e.withdraw)}</td>
                          <td style={{padding:"8px",fontSize:12,borderBottom:"1px solid "+BORDER,
                            textAlign:"right",fontFamily:"monospace",color:GREEN}}>{fmt(e.deposit)}</td>
                          <td style={{padding:"8px",fontSize:11,borderBottom:"1px solid "+BORDER}}>{e.voided_by}</td>
                          <td style={{padding:"8px",fontSize:10,borderBottom:"1px solid "+BORDER,color:DIM}}>
                            {e.voided_at?.slice(0,10)}
                          </td>
                          <td style={{padding:"8px",fontSize:11,borderBottom:"1px solid "+BORDER,
                            color:"#333",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis"}}>
                            {e.void_reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab==="manual" && (
          <div style={{maxWidth:760}}>
            <div style={{fontSize:14,fontWeight:700,color:NAVY,marginBottom:14}}>
              Manual Bank / Cash Entry
              {selAccount && <span style={{fontSize:12,color:DIM,fontWeight:400,marginLeft:8}}>
                {"— "+selAccount.account_name}
              </span>}
            </div>
            {!selAccount && (
              <div style={{padding:12,color:GOLD,background:"#FFF8E6",
                border:"1px solid "+GOLD,marginBottom:14,fontSize:12}}>
                ⚠ Select a bank account from the left panel first.
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
              <div>
                <label className="sans" style={lbl}>ENTRY DATE (AD) *</label>
                <input type="date" value={manDate} onChange={e=>setManDate(e.target.value)} style={fld}/>
              </div>
              <div>
                <label className="sans" style={lbl}>DATE (BS)</label>
                <input value={manDateBs} onChange={e=>setManDateBs(e.target.value)}
                  placeholder="e.g. 02 Ashadh 2082" style={fld}/>
              </div>
              <div/>
              <div style={{gridColumn:"span 3"}}>
                <label className="sans" style={lbl}>NARRATION *</label>
                <input value={manNarr} onChange={e=>setManNarr(e.target.value)}
                  placeholder="e.g. NEFT payment to Papa Pustak Bhandar" style={fld}/>
              </div>
              <div>
                <label className="sans" style={lbl}>WITHDRAW (NPR)</label>
                <input type="number" value={manWd} onChange={e=>{setManWd(e.target.value);if(e.target.value)setManDep("");}}
                  placeholder="0.00" min="0" step="0.01" style={{...fld,textAlign:"right"}}/>
              </div>
              <div>
                <label className="sans" style={lbl}>DEPOSIT (NPR)</label>
                <input type="number" value={manDep} onChange={e=>{setManDep(e.target.value);if(e.target.value)setManWd("");}}
                  placeholder="0.00" min="0" step="0.01" style={{...fld,textAlign:"right"}}/>
              </div>
              <div/>
            </div>

            <div style={{padding:"12px",background:CREAM,border:"1px solid "+BORDER,marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:NAVY,marginBottom:10}}>
                CLASSIFY (optional — can be done later in the Ledger tab)
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10}}>
                <div>
                  <label className="sans" style={lbl}>TYPE</label>
                  <select value={manType} onChange={e=>{setManType(e.target.value);setManGL("");setManParty("");setManPartyType("");setManCharge("");}} style={fld}>
                    <option value="">— classify later —</option>
                    {ENTRY_TYPES.map(t=><option key={t} value={t}>{ENTRY_TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
                {(manType==="GL"||manType==="Contra") && (
                  <div>
                    <label className="sans" style={lbl}>GL ACCOUNT</label>
                    <input list="gl-man" value={manGL} onChange={e=>setManGL(e.target.value)}
                      placeholder="Type GL code or name" style={fld}/>
                    <datalist id="gl-man">
                      {glAccounts.map(a=><option key={a.id} value={a.gl_code+" - "+a.gl_name}/>)}
                    </datalist>
                  </div>
                )}
                {manType==="Party" && (
                  <div>
                    <label className="sans" style={lbl}>PARTY TYPE</label>
                    <select value={manPartyType} onChange={e=>setManPartyType(e.target.value)} style={fld}>
                      <option value="">— select —</option>
                      {partyTypeNames.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
                {manType==="Party" && (
                  <div>
                    <label className="sans" style={lbl}>PARTY NAME</label>
                    <input list="pty-man" value={manParty} onChange={e=>{
                        setManParty(e.target.value);
                        const match = parties.find(p=>p.name.toLowerCase()===e.target.value.trim().toLowerCase());
                        if(match && match.party_type) setManPartyType(match.party_type);
                      }}
                      placeholder="Party name" style={fld}/>
                    <datalist id="pty-man">
                      {(manPartyType ? parties.filter(p=>p.party_type===manPartyType) : parties)
                        .map(p=><option key={p.id} value={p.name}/>)}
                    </datalist>
                  </div>
                )}
                {!!manType && (
                  <div>
                    <label className="sans" style={lbl}>LC NO. (optional)</label>
                    <input list="lc-man" value={manLcNo} onChange={e=>setManLcNo(e.target.value)}
                      placeholder="Tag to an import" style={fld}/>
                    <datalist id="lc-man">
                      {(lcOptions||[]).map(l=><option key={l} value={l}/>)}
                    </datalist>
                  </div>
                )}
                {!!manLcNo && (
                  <div>
                    <label className="sans" style={lbl}>CHARGE TYPE *</label>
                    <select value={manCharge} onChange={e=>setManCharge(e.target.value)} style={fld}>
                      <option value="">— select —</option>
                      {LC_CHARGE_TYPES.map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="sans" style={lbl}>INVOICE / REF</label>
                  <input value={manRef} onChange={e=>setManRef(e.target.value)}
                    placeholder="e.g. SB-0003" style={fld}/>
                </div>
              </div>
            </div>

            {manMsg && (
              <div style={{padding:10,marginBottom:10,fontSize:12,fontWeight:600,
                background:manMsg.startsWith("✅")?"#D4EDDA":"#FFF0F0",
                color:manMsg.startsWith("✅")?GREEN:ERR,
                border:"1px solid "+(manMsg.startsWith("✅")?"#C3E6CB":ERR)}}>
                {manMsg}
              </div>
            )}

            <button onClick={()=>saveManual(false)}
              disabled={manSaving||!manNarr||(!manWd&&!manDep)||!selAccount}
              style={{padding:"12px 28px",background:manSaving?"#AAA":NAVY,color:"#FFF",
                border:"none",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"Arial",
                opacity:manSaving||!manNarr||(!manWd&&!manDep)||!selAccount?0.6:1}}>
              {manSaving?"Saving…":"✓ Save Entry"}
            </button>
          </div>
        )}

        {activeTab==="import" && (
          <div>
            <div style={{fontSize:14,fontWeight:700,color:NAVY,marginBottom:6}}>
              Import Bank Statement
            </div>

            {!selAccount && (
              <div style={{padding:10,color:GOLD,background:"#FFF8E6",
                border:"1px solid "+GOLD,marginBottom:12,fontSize:12}}>
                ⚠ Select a bank account from the left panel first.
              </div>
            )}

            {/* Step indicator */}
            <div style={{display:"flex",gap:6,marginBottom:16}}>
              {[["paste","1. Paste"],["map","2. Map Columns"],["preview","3. Review & Import"]].map(([k,label])=>(
                <div key={k} style={{padding:"5px 12px",fontSize:11,fontWeight:700,borderRadius:3,
                  background:mappingStep===k?NAVY:"#EFEAE0",
                  color:mappingStep===k?"#FFF":DIM}}>
                  {label}
                </div>
              ))}
            </div>

            {/* ── STEP 1: PASTE ── */}
            {mappingStep==="paste" && (
              <>
                <div style={{fontSize:12,color:DIM,marginBottom:10}}>
                  Select a range of cells in Excel (or your bank's statement) and copy
                  (Ctrl+C), then paste here. Works with Excel column copy, CSV, or
                  comma/tab separated text — any number of columns, any order.
                </div>
                <textarea value={importText} onChange={e=>setImportText(e.target.value)}
                  rows={8} placeholder={"Paste here — e.g. straight from Excel:\n\n2026-06-01\tNEFT CR 9876 SURESH\t\t16950\n2026-06-02\tCHQ PAY PUSTAK\t33900\t"}
                  style={{width:"100%",padding:"10px",border:"1px solid "+BORDER,
                    fontFamily:"monospace",fontSize:12,boxSizing:"border-box",marginBottom:10,resize:"vertical"}}/>
                <button onClick={startColumnMapping} disabled={!importText.trim()}
                  style={{padding:"9px 18px",background:!importText.trim()?"#AAA":NAVY,color:"#FFF",
                    border:"none",fontWeight:700,fontSize:12,cursor:!importText.trim()?"not-allowed":"pointer"}}>
                  Next: Map Columns →
                </button>
              </>
            )}

            {/* ── STEP 2: MAP COLUMNS ── */}
            {mappingStep==="map" && rawTable.length>0 && (
              <>
                <div style={{fontSize:12,color:DIM,marginBottom:12}}>
                  Tell us which column is which. Pick a role for each column below —
                  unused columns can stay <strong>Ignore</strong>.
                </div>
                <div style={{overflowX:"auto",marginBottom:14}}>
                  <table style={{borderCollapse:"collapse",width:"100%"}}>
                    <thead>
                      <tr>
                        {colRoles.map((role,ci)=>(
                          <th key={ci} style={{padding:"6px 8px",background:CREAM,
                            border:"1px solid "+BORDER,minWidth:140}}>
                            <select value={role} onChange={e=>{
                                const next=[...colRoles]; next[ci]=e.target.value; setColRoles(next);
                              }}
                              style={{width:"100%",padding:"5px 6px",fontSize:11,fontWeight:700,
                                border:"1px solid "+(role==="ignore"?BORDER:GREEN),
                                color:role==="ignore"?DIM:GREEN,background:"#FFF"}}>
                              <option value="ignore">— Ignore —</option>
                              <option value="date">📅 Date</option>
                              <option value="narration">📝 Narration</option>
                              <option value="withdraw">↓ Withdrawal</option>
                              <option value="deposit">↑ Deposit</option>
                            </select>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rawTable.slice(0,6).map((row,ri)=>(
                        <tr key={ri} style={{background:ri%2===0?"#FFF":LIGHT}}>
                          {colRoles.map((_,ci)=>(
                            <td key={ci} style={{padding:"6px 8px",fontSize:11,
                              border:"1px solid "+BORDER,fontFamily:"monospace",
                              maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {row[ci]??""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rawTable.length>6 && (
                    <div style={{fontSize:10,color:DIM,marginTop:4}}>
                      Showing first 6 of {rawTable.length} rows for preview.
                    </div>
                  )}
                </div>
                {!colRoles.includes("date") && (
                  <div style={{padding:8,marginBottom:10,fontSize:11,color:ERR,
                    background:"#FFF0F0",border:"1px solid "+ERR}}>
                    ⚠ Assign one column as Date to continue.
                  </div>
                )}
                {!colRoles.includes("withdraw") && !colRoles.includes("deposit") && (
                  <div style={{padding:8,marginBottom:10,fontSize:11,color:ERR,
                    background:"#FFF0F0",border:"1px solid "+ERR}}>
                    ⚠ Assign at least one column as Withdrawal or Deposit.
                  </div>
                )}
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setMappingStep("paste")}
                    style={{padding:"9px 18px",background:"#FFF",border:"1px solid "+BORDER,
                      color:DIM,fontWeight:600,fontSize:12,cursor:"pointer"}}>
                    ← Back
                  </button>
                  <button onClick={applyColumnMapping}
                    disabled={!colRoles.includes("date")||(!colRoles.includes("withdraw")&&!colRoles.includes("deposit"))}
                    style={{padding:"9px 18px",
                      background:(!colRoles.includes("date")||(!colRoles.includes("withdraw")&&!colRoles.includes("deposit")))?"#AAA":NAVY,
                      color:"#FFF",border:"none",fontWeight:700,fontSize:12,
                      cursor:(!colRoles.includes("date")||(!colRoles.includes("withdraw")&&!colRoles.includes("deposit")))?"not-allowed":"pointer"}}>
                    Next: Review →
                  </button>
                </div>
              </>
            )}

            {/* ── STEP 3: PREVIEW & IMPORT ── */}
            {mappingStep==="preview" && (
              <>
                <div style={{display:"flex",gap:8,marginBottom:14}}>
                  <button onClick={()=>setMappingStep("map")}
                    style={{padding:"9px 18px",background:"#FFF",border:"1px solid "+BORDER,
                      color:DIM,fontWeight:600,fontSize:12,cursor:"pointer"}}>
                    ← Back to Mapping
                  </button>
                  {importRows.length>0 && (
                    <button onClick={doImport} disabled={importing||!selAccount}
                      style={{padding:"9px 18px",background:importing?"#AAA":NAVY,color:"#FFF",
                        border:"none",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                      {importing?"Importing…":"↑ Import "+importRows.length+" rows"}
                    </button>
                  )}
                  <button onClick={resetImportWizard}
                    style={{padding:"9px 18px",background:"#FFF",border:"1px solid "+BORDER,
                      color:ERR,fontWeight:600,fontSize:12,cursor:"pointer"}}>
                    ✕ Start Over
                  </button>
                </div>

                {importRows.length>0 && (
                  <div style={{display:"flex",gap:10,marginBottom:14}}>
                    {(() => {
                      const totalWd = importRows.reduce((s,r)=>s+(Number(r.withdraw)||0),0);
                      const totalDep = importRows.reduce((s,r)=>s+(Number(r.deposit)||0),0);
                      return [
                        {label:"ROWS",          value:importRows.length, color:NAVY},
                        {label:"TOTAL WITHDRAW",value:"Rs."+fmtT(totalWd), color:ERR},
                        {label:"TOTAL DEPOSIT", value:"Rs."+fmtT(totalDep), color:GREEN},
                        {label:"NET MOVEMENT",  value:"Rs."+fmtT(Math.abs(totalDep-totalWd))+" "+(totalDep>=totalWd?"Dr":"Cr"), color:NAVY, bold:true},
                      ].map((c,i)=>(
                        <div key={i} style={{flex:1,background:"#FFF",border:"1px solid "+BORDER,padding:"10px 14px"}}>
                          <div style={{fontSize:9,fontWeight:700,color:DIM,letterSpacing:"0.08em",marginBottom:4}}>{c.label}</div>
                          <div style={{fontSize:15,fontWeight:c.bold?800:700,color:c.color,fontFamily:"monospace"}}>{c.value}</div>
                        </div>
                      ));
                    })()}
                  </div>
                )}

                {importMsg && (
                  <div style={{padding:10,marginBottom:10,fontSize:12,fontWeight:600,
                    background:importMsg.startsWith("✅")?"#D4EDDA":"#FFF3CD",
                    color:importMsg.startsWith("✅")?GREEN:GOLD}}>
                    {importMsg}
                  </div>
                )}

                {importRows.length>0 && (
                  <div style={{overflowX:"auto"}}>
                    <table style={{borderCollapse:"collapse",width:"100%"}}>
                      <thead>
                        <tr>
                          <th style={{...TH,width:40}}>#</th>
                          <th style={TH}>DATE</th>
                          <th style={TH}>NARRATION</th>
                          <th style={THR}>WITHDRAW</th>
                          <th style={THR}>DEPOSIT</th>
                          <th style={TH}>STATUS</th>
                          <th style={TH}>CONFIRM DUP?</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map((row,i)=>(
                          <tr key={i} style={{background:STATUS_COLORS[row.status]||(row.withdraw===0&&row.deposit===0?"#FFF3CD":"#FFF")}}>
                            <td style={{...TD,fontSize:10}}>{i+1}</td>
                            <td style={{...TD,fontFamily:"monospace",fontSize:10}}>
                              {row.date}
                              {row.date!==row.dateRaw && row.dateRaw && (
                                <div style={{fontSize:9,color:DIM}}>(was: {row.dateRaw})</div>
                              )}
                            </td>
                            <td style={{...TD,maxWidth:240,overflow:"hidden",textOverflow:"ellipsis"}}>{row.narration}</td>
                            <td style={{...TDR,color:ERR}}>{row.withdraw?fmt(row.withdraw):""}</td>
                            <td style={{...TDR,color:GREEN}}>{row.deposit?fmt(row.deposit):""}</td>
                            <td style={{...TD}}>
                              <span style={{
                                fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:2,
                                background:row.status==="saved"?"#C3E6CB":row.status==="duplicate"?"#FFE08A":row.status==="error"||row.status==="skipped"?"#F5C6CB":"#E2E3E5",
                                color:row.status==="saved"?GREEN:row.status==="duplicate"?"#856404":row.status==="error"||row.status==="skipped"?ERR:DIM,
                              }}>
                                {row.status==="new"?"ready":row.status}
                              </span>
                              {row.internal_ref && <span style={{fontSize:9,color:NAVY,marginLeft:4}}>{row.internal_ref}</span>}
                              {row.reason && <div style={{fontSize:9.5,color:ERR,marginTop:3}}>{row.reason}</div>}
                              {row.status==="new" && row.withdraw===0 && row.deposit===0 && (
                                <div style={{fontSize:9.5,color:"#856404",marginTop:3}}>
                                  ⚠ No amount parsed — check the row format
                                </div>
                              )}
                            </td>
                            <td style={{...TD,textAlign:"center"}}>
                              {row.status==="duplicate" && (
                                <input type="checkbox"
                                  checked={confirmedDups.has(i)}
                                  onChange={e=>{
                                    setConfirmedDups(prev=>{
                                      const s=new Set(prev);
                                      e.target.checked?s.add(i):s.delete(i);
                                      return s;
                                    });
                                  }}
                                />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importRows.some(r=>r.status==="duplicate") && (
                      <div style={{padding:"10px 12px",background:"#FFF8E6",
                        border:"1px solid "+GOLD,marginTop:8,fontSize:12,color:"#856404"}}>
                        ⚠ Rows marked <strong>duplicate</strong> already exist in the ledger.
                        Check the box to confirm they are genuinely different transactions.
                        Unchecked duplicates will be skipped.
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab==="split-requests" && isSuperAdmin && (
          <div>
            <div style={{fontSize:14,fontWeight:700,color:NAVY,marginBottom:4}}>
              Pending Split Requests
            </div>
            <div style={{fontSize:12,color:DIM,marginBottom:14}}>
              Users have requested permission to split these bank entries.
              Review and approve or reject.
            </div>
            {splitReqs.length===0 ? (
              <div style={{padding:30,textAlign:"center",color:DIM,background:"#FFF",
                border:"1px solid "+BORDER}}>
                No pending split requests.
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {splitReqs.map(req=>(
                  <div key={req.id} style={{background:"#FFF",border:"1px solid "+BORDER,
                    padding:"14px 16px",borderLeft:"4px solid "+GOLD}}>
                    <div style={{display:"flex",justifyContent:"space-between",
                      alignItems:"flex-start",marginBottom:8}}>
                      <div>
                        <span style={{fontSize:13,fontWeight:700,color:NAVY,fontFamily:"monospace"}}>
                          {req.entry?.internal_ref}
                        </span>
                        <span style={{fontSize:11,color:DIM,marginLeft:10}}>
                          {req.entry?.entry_date}
                        </span>
                        <span style={{fontSize:11,color:DIM,marginLeft:10}}>
                          {req.entry?.narration}
                        </span>
                      </div>
                      <div style={{fontFamily:"monospace",fontSize:13,fontWeight:700,color:NAVY}}>
                        {req.entry?.withdraw>0
                          ? "Wd: Rs."+fmtT(req.entry.withdraw)
                          : "Dep: Rs."+fmtT(req.entry?.deposit||0)}
                      </div>
                    </div>
                    <div style={{fontSize:12,color:DIM,marginBottom:8}}>
                      <strong style={{color:NAVY}}>Requested by:</strong> {req.requested_by}
                      <span style={{margin:"0 8px"}}>·</span>
                      {req.requested_at?.slice(0,10)}
                    </div>
                    <div style={{background:CREAM,padding:"8px 12px",fontSize:12,
                      borderRadius:4,marginBottom:10,color:"#333"}}>
                      <strong>User note:</strong> {req.request_note||"(no note)"}
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>reviewSplit(req.id,"approve")}
                        style={{padding:"8px 16px",background:GREEN,color:"#FFF",
                          border:"none",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                        ✓ Approve Split
                      </button>
                      <button onClick={()=>reviewSplit(req.id,"reject")}
                        style={{padding:"8px 16px",background:"#FFF",color:ERR,
                          border:"2px solid "+ERR,fontWeight:700,fontSize:12,cursor:"pointer"}}>
                        ✕ Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab==="edit-requests" && isSuperAdmin && (
          <div>
            <div style={{fontSize:14,fontWeight:700,color:NAVY,marginBottom:4}}>
              Pending Edit Requests
            </div>
            <div style={{fontSize:12,color:DIM,marginBottom:14}}>
              Users have proposed corrections to already-posted entries. Approving
              automatically reverses the original GL/Party Ledger postings and
              re-posts fresh ones with the corrected classification, under the
              same reference number.
            </div>
            {editReqs.length===0 ? (
              <div style={{padding:30,textAlign:"center",color:DIM,background:"#FFF",
                border:"1px solid "+BORDER}}>
                No pending edit requests.
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {editReqs.map(req=>(
                  <div key={req.id} style={{background:"#FFF",border:"1px solid "+BORDER,
                    padding:"14px 16px",borderLeft:"4px solid "+GOLD}}>
                    <div style={{display:"flex",justifyContent:"space-between",
                      alignItems:"flex-start",marginBottom:10}}>
                      <div>
                        <span style={{fontSize:13,fontWeight:700,color:NAVY,fontFamily:"monospace"}}>
                          {req.internal_ref}
                        </span>
                        <span style={{fontSize:11,color:DIM,marginLeft:10}}>
                          {req.requested_at?.slice(0,10)}
                        </span>
                      </div>
                      <div style={{fontFamily:"monospace",fontSize:13,fontWeight:700,color:NAVY}}>
                        Rs.{fmtT(req.amount)}
                      </div>
                    </div>

                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                      <div style={{background:"#FFF0F0",padding:"8px 12px",borderRadius:4,fontSize:11.5}}>
                        <div style={{fontWeight:700,color:ERR,marginBottom:3,fontSize:9.5,letterSpacing:"0.06em"}}>CURRENT</div>
                        <div>Type: <strong>{req.current_entry_type}</strong></div>
                        {req.current_party_name && <div>Party: <strong>{req.current_party_name}</strong></div>}
                        {req.current_gl_account && <div>GL: <strong>{req.current_gl_account}</strong></div>}
                        {req.current_charge_type && <div>Charge: <strong>{req.current_charge_type}</strong></div>}
                      </div>
                      <div style={{background:"#EAF7EE",padding:"8px 12px",borderRadius:4,fontSize:11.5}}>
                        <div style={{fontWeight:700,color:GREEN,marginBottom:3,fontSize:9.5,letterSpacing:"0.06em"}}>PROPOSED</div>
                        <div>Type: <strong>{req.new_entry_type}</strong></div>
                        {req.new_party_name && <div>Party: <strong>{req.new_party_name}</strong>{req.new_party_type && <> ({req.new_party_type})</>}</div>}
                        {req.new_gl_account && <div>GL: <strong>{req.new_gl_account}</strong></div>}
                        {req.new_charge_type && <div>Charge: <strong>{req.new_charge_type}</strong></div>}
                      </div>
                    </div>

                    <div style={{fontSize:12,color:DIM,marginBottom:8}}>
                      <strong style={{color:NAVY}}>Requested by:</strong> {req.requested_by}
                    </div>
                    <div style={{background:CREAM,padding:"8px 12px",fontSize:12,
                      borderRadius:4,marginBottom:10,color:"#333"}}>
                      <strong>Reason:</strong> {req.request_note||"(no reason given)"}
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>reviewEdit(req.id,"approve")}
                        style={{padding:"8px 16px",background:GREEN,color:"#FFF",
                          border:"none",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                        ✓ Approve &amp; Apply Correction
                      </button>
                      <button onClick={()=>reviewEdit(req.id,"reject")}
                        style={{padding:"8px 16px",background:"#FFF",color:ERR,
                          border:"2px solid "+ERR,fontWeight:700,fontSize:12,cursor:"pointer"}}>
                        ✕ Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
