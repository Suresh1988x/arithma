import { useState, useEffect, useCallback } from "react";

// JournalEntryPage.js — ARITHMA Journal Entry (Step 20)
// Multi-line Dr/Cr journal voucher entry, mirroring Excel's
// Module_JournalEntry. GL picker excludes Bank Account and Cash In
// Hand GLs by design — those route through Bank & Cash Ledger.
// Party-linked lines look up the GL from the party's own record,
// so any party type (including custom ones like Directors, Payables,
// LTL, STL) works without code changes.

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";
const NAVY    = "#1B3A5C";
const BORDER  = "#D6D0C2";
const DIM     = "#6B645A";
const ERR     = "#A8453B";
const GREEN   = "#2E7D4F";
const CREAM   = "#F7F4ED";
const LIGHT   = "#EDF3FB";
const GOLD    = "#B8860B";

function fmtT(n) {
  return (Number(n)||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
}

const fld = {padding:"7px 9px",border:"1px solid "+BORDER,background:"#FFF",
  fontSize:12,width:"100%",boxSizing:"border-box"};
const lbl = {fontSize:9,letterSpacing:"0.1em",color:DIM,fontWeight:700,
  display:"block",marginBottom:3};

const PRINT_CSS = `@media print{
body *{visibility:hidden!important;}
#je-print-area,#je-print-area *{visibility:visible!important;}
#je-print-area{position:absolute;left:0;top:0;width:100%;font-family:Arial;font-size:9px;padding:8mm;box-sizing:border-box;}
#je-print-area table{border-collapse:collapse;width:100%;}
#je-print-area th{background:#1B3A5C!important;color:#fff!important;-webkit-print-color-adjust:exact;padding:4px 6px;font-size:9px;}
#je-print-area td{padding:3px 6px;border-bottom:1px solid #eee;font-size:9px;}
.no-print{display:none!important;}
.voucher-overlay,.voucher-card,.voucher-scroll{
  position:static!important;width:100%!important;max-width:none!important;
  height:auto!important;max-height:none!important;overflow:visible!important;
  background:#FFF!important;padding:0!important;display:block!important;
}
#voucher-print-area{position:absolute;left:0;top:0;width:100%;box-sizing:border-box;padding:0!important;margin:0!important;background:#FFF;}
#voucher-print-area table{width:100%!important;}
.voucher-chrome{display:none!important;}
@page{size:A4;margin:12mm;}}`;
function injectPrint(){
  if(document.getElementById("je-css"))return;
  const s=document.createElement("style");s.id="je-css";s.textContent=PRINT_CSS;
  document.head.appendChild(s);
}

// ── Void Confirmation Modal (same pattern as Bank Ledger) ──────
function VoidModal({ entry, onConfirm, onCancel }) {
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const matches = confirmText.trim() === (entry.internal_ref||"").trim();

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}}>
      <div style={{background:"#FFF",width:"min(480px,92vw)",borderRadius:4,
        boxShadow:"0 8px 32px rgba(0,0,0,0.2)",overflow:"hidden"}}>
        <div style={{background:ERR,padding:"14px 20px",display:"flex",gap:10,alignItems:"center"}}>
          <span style={{fontSize:20}}>⚠</span>
          <span style={{color:"#FFF",fontWeight:700,fontSize:15,fontFamily:"Arial"}}>Void Journal Entry</span>
        </div>
        <div style={{padding:"20px 24px"}}>
          <p style={{fontSize:13,color:"#333",marginBottom:14}}>
            This will void <strong>{entry.internal_ref}</strong> and reverse its GL Book and
            Party Ledger postings. The entry stays visible in the Voided list for audit purposes.
          </p>
          <div style={{background:CREAM,border:"1px solid "+BORDER,padding:"10px 14px",
            borderRadius:4,marginBottom:16,fontSize:12}}>
            <div><strong>Date:</strong> {entry.entry_date}</div>
            <div><strong>Description:</strong> {entry.description}</div>
            <div><strong>Amount:</strong> Rs.{fmtT(entry.total_dr)}</div>
          </div>
          <label className="sans" style={lbl}>TYPE "{entry.internal_ref}" TO CONFIRM *</label>
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
            placeholder="e.g. Entered in error, duplicate"
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

// ── Printable Voucher Modal ──────────────────────────────────
function JournalVoucherModal({ jid, companyId, companyName, fiscalYear, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(()=>{
    setLoading(true); setError("");
    fetch(BACKEND+"/api/journal/"+jid+"/lines?company_id="+companyId)
      .then(r=>r.json())
      .then(d=>{ if(d.error) setError(d.error); else setData(d); })
      .catch(e=>setError("Network error: "+e.message))
      .finally(()=>setLoading(false));
  },[jid,companyId]);

  const todayStr = new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});

  return (
    <div className="voucher-overlay" style={{position:"fixed",inset:0,background:"rgba(20,22,28,0.6)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20}}
      onClick={onClose}>
      <div className="voucher-card" onClick={e=>e.stopPropagation()} style={{background:"#FFF",
        width:"min(680px,94vw)",boxShadow:"0 16px 48px rgba(0,0,0,0.3)",overflow:"hidden",
        maxHeight:"92vh",display:"flex",flexDirection:"column"}}>

        <div className="voucher-chrome" style={{background:NAVY,padding:"12px 20px",display:"flex",
          justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:"#FFF",fontWeight:700,fontSize:14,fontFamily:"Arial",letterSpacing:"0.02em"}}>
            JOURNAL VOUCHER
          </span>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {data && (
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
            <div style={{color:ERR,padding:20,margin:20,background:"#FFF0F0",border:"1px solid "+ERR,fontSize:13}}>{error}</div>
          ) : data && (
            <div id="voucher-print-area" style={{padding:"28px 36px",fontFamily:"'Georgia',serif"}}>
              <div style={{textAlign:"center",borderBottom:"3px double "+NAVY,paddingBottom:14,marginBottom:18}}>
                <div style={{fontSize:19,fontWeight:700,color:NAVY,letterSpacing:"0.03em"}}>
                  {companyName || "Company Name"}
                </div>
                <div style={{fontSize:11,color:DIM,marginTop:3,fontFamily:"Arial"}}>Fiscal Year {fiscalYear}</div>
                <div style={{fontSize:13,fontWeight:700,color:"#333",marginTop:10,letterSpacing:"0.12em",fontFamily:"Arial"}}>
                  JOURNAL VOUCHER
                </div>
              </div>

              <div style={{display:"flex",justifyContent:"space-between",marginBottom:16,fontSize:12,fontFamily:"Arial"}}>
                <div><span style={{color:DIM}}>Voucher No: </span>
                  <span style={{fontWeight:700,color:NAVY,fontFamily:"monospace"}}>{data.journal.internal_ref}</span></div>
                <div><span style={{color:DIM}}>Date: </span><span style={{fontWeight:600}}>{data.journal.entry_date}</span></div>
              </div>

              <div style={{fontSize:12,color:"#333",marginBottom:18,fontFamily:"Arial",fontStyle:"italic",
                borderLeft:"3px solid "+BORDER,paddingLeft:10}}>
                {data.journal.description}
              </div>

              <table style={{width:"100%",borderCollapse:"collapse",marginBottom:4,fontFamily:"Arial",border:"1px solid "+NAVY}}>
                <thead>
                  <tr>
                    <th style={{textAlign:"left",fontSize:10,fontWeight:700,color:"#FFF",background:NAVY,
                      padding:"8px 12px",borderRight:"1px solid rgba(255,255,255,0.25)"}}>PARTICULARS</th>
                    <th style={{textAlign:"right",fontSize:10,fontWeight:700,color:"#FFF",background:NAVY,
                      padding:"8px 12px",width:130,borderRight:"1px solid rgba(255,255,255,0.25)"}}>DEBIT (Rs.)</th>
                    <th style={{textAlign:"right",fontSize:10,fontWeight:700,color:"#FFF",background:NAVY,
                      padding:"8px 12px",width:130}}>CREDIT (Rs.)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.filter(l=>l.side==="Dr").map((l,i)=>(
                    <tr key={"dr"+i} style={{borderBottom:"1px solid "+BORDER}}>
                      <td style={{padding:"9px 12px",fontSize:12.5}}>
                        <span style={{fontFamily:"monospace",fontWeight:700,color:NAVY,marginRight:8}}>
                          {(l.gl_account||"").split(" - ")[0]}
                        </span>
                        Dr. {l.party_name || (l.gl_account||"").split(" - ").slice(1).join(" - ")}
                        {l.narration && <div style={{fontSize:10.5,color:DIM,marginTop:2}}>{l.narration}</div>}
                      </td>
                      <td style={{padding:"9px 12px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:NAVY,fontSize:13}}>{fmtT(l.amount)}</td>
                      <td style={{borderLeft:"1px solid "+BORDER}}/>
                    </tr>
                  ))}
                  {data.lines.filter(l=>l.side==="Cr").map((l,i)=>(
                    <tr key={"cr"+i} style={{borderBottom:"1px solid "+BORDER}}>
                      <td style={{padding:"9px 12px 9px 34px",fontSize:12.5}}>
                        <span style={{fontFamily:"monospace",fontWeight:700,color:ERR,marginRight:8}}>
                          {(l.gl_account||"").split(" - ")[0]}
                        </span>
                        To {l.party_name || (l.gl_account||"").split(" - ").slice(1).join(" - ")}
                        {l.narration && <div style={{fontSize:10.5,color:DIM,marginTop:2}}>{l.narration}</div>}
                      </td>
                      <td style={{borderRight:"1px solid "+BORDER}}/>
                      <td style={{padding:"9px 12px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:ERR,fontSize:13}}>{fmtT(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{background:"#EDF7F0"}}>
                    <td style={{padding:"9px 12px",fontWeight:700,fontSize:11.5,borderTop:"2px solid "+NAVY,fontFamily:"Arial"}}>TOTAL</td>
                    <td style={{padding:"9px 12px",textAlign:"right",fontFamily:"monospace",fontWeight:800,fontSize:13.5,borderTop:"2px solid "+NAVY,color:NAVY}}>{fmtT(data.journal.total_dr)}</td>
                    <td style={{padding:"9px 12px",textAlign:"right",fontFamily:"monospace",fontWeight:800,fontSize:13.5,borderTop:"2px solid "+NAVY,borderLeft:"1px solid "+BORDER,color:ERR}}>{fmtT(data.journal.total_cr)}</td>
                  </tr>
                </tfoot>
              </table>

              <div style={{fontSize:9.5,color:DIM,marginTop:4,marginBottom:26,fontFamily:"Arial"}}>
                Source: Journal &nbsp;·&nbsp; Posted via ARITHMA VAT &amp; Inventory Manager
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:28,marginTop:30,fontFamily:"Arial"}}>
                <div>
                  <div style={{borderTop:"1px solid #333",paddingTop:6,minHeight:34}}>
                    <div style={{fontSize:13,color:"#BBB"}}>&nbsp;</div>
                  </div>
                  <div style={{fontSize:9.5,fontWeight:700,color:DIM,letterSpacing:"0.08em",marginTop:4}}>PREPARED BY</div>
                </div>
                <div>
                  <div style={{borderTop:"1px solid #333",paddingTop:6,minHeight:34}}><div style={{fontSize:13,color:"#BBB"}}>&nbsp;</div></div>
                  <div style={{fontSize:9.5,fontWeight:700,color:DIM,letterSpacing:"0.08em",marginTop:4}}>CHECKED BY</div>
                </div>
                <div>
                  <div style={{borderTop:"1px solid #333",paddingTop:6,minHeight:34}}><div style={{fontSize:13,color:"#BBB"}}>&nbsp;</div></div>
                  <div style={{fontSize:9.5,fontWeight:700,color:DIM,letterSpacing:"0.08em",marginTop:4}}>APPROVED BY</div>
                </div>
              </div>

              <div style={{textAlign:"right",fontSize:9,color:"#BBB",marginTop:20,fontFamily:"Arial"}}>Printed on {todayStr}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function JournalEntryPage({ session, companyId, companies, homeSettings, onGoToGLBook, onGoToBankCash, onBack }) {
  const [activeTab, setActiveTab] = useState("entry"); // entry | list | voided
  const [glAccounts, setGlAccounts] = useState([]);
  const [parties, setParties] = useState([]);
  const [entries, setEntries] = useState([]);
  const [voidedEntries, setVoidedEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [voucherId, setVoucherId] = useState(null);
  const [voidEntry, setVoidEntry] = useState(null);
  const [postMsg, setPostMsg] = useState("");

  // Entry form state
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0,10));
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState([
    {side:"Dr", mode:"gl", gl_account:"", party_name:"", amount:"", narration:"", invoice_ref:""},
    {side:"Cr", mode:"gl", gl_account:"", party_name:"", amount:"", invoice_ref:""},
  ]);
  const [saving, setSaving] = useState(false);

  const companyName = homeSettings?.company_name || companies?.find(c=>c.id===companyId)?.name || "";
  const fiscalYear  = homeSettings?.fiscal_year_bs || session?.fiscal_year_bs || "";
  const isSuperAdmin = (companies||[]).find(c=>c.id===companyId)?.role === "company_admin";
  injectPrint();

  useEffect(()=>{
    if(!companyId) return;
    fetch(BACKEND+"/api/journal/gl-picker?company_id="+companyId)
      .then(r=>r.json()).then(d=>setGlAccounts(d.accounts||[]));
    fetch(BACKEND+"/api/parties?company_id="+companyId+"&limit=1000")
      .then(r=>r.json()).then(d=>setParties(d.parties||[]));
  },[companyId]);

  const fetchEntries = useCallback(async()=>{
    if(!companyId) return;
    setLoading(true); setError("");
    try{
      const r = await fetch(BACKEND+"/api/journal?company_id="+companyId);
      const d = await r.json();
      if(d.error) setError(d.error); else setEntries(d.entries||[]);
    } catch(e){ setError("Network error: "+e.message); }
    finally{ setLoading(false); }
  },[companyId]);

  const fetchVoided = useCallback(async()=>{
    if(!companyId) return;
    const r = await fetch(BACKEND+"/api/journal?company_id="+companyId+"&include_void=true");
    const d = await r.json();
    setVoidedEntries((d.entries||[]).filter(e=>e.is_void));
  },[companyId]);

  useEffect(()=>{ if(activeTab==="list") fetchEntries(); },[activeTab,fetchEntries]);
  useEffect(()=>{ if(activeTab==="voided") fetchVoided(); },[activeTab,fetchVoided]);

  const exportCSV = () => {
    const rows = [["Ref","Date","Description","Total Dr","Total Cr"]];
    entries.forEach(e=>{
      rows.push([e.internal_ref, e.entry_date, e.description, e.total_dr, e.total_cr]);
    });
    const totalDr_ = entries.reduce((s,e)=>s+(Number(e.total_dr)||0),0);
    const totalCr_ = entries.reduce((s,e)=>s+(Number(e.total_cr)||0),0);
    rows.push(["","","TOTAL", totalDr_.toFixed(2), totalCr_.toFixed(2)]);
    const csv = rows.map(r=>r.map(v=>'"'+(v??"")+'"').join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download = ("journal_entries_"+companyName).replace(/\s+/g,"_")+".csv";
    a.click();
  };

  const updateLine = (i,k,v) => setLines(prev=>prev.map((l,idx)=>idx===i?{...l,[k]:v}:l));
  const addLine = (side) => setLines(p=>[...p,{side, mode:"gl", gl_account:"", party_name:"", amount:"", narration:"", invoice_ref:""}]);
  const removeLine = (i) => setLines(p=>p.filter((_,idx)=>idx!==i));

  const totalDr = lines.filter(l=>l.side==="Dr").reduce((s,l)=>s+(parseFloat(l.amount)||0),0);
  const totalCr = lines.filter(l=>l.side==="Cr").reduce((s,l)=>s+(parseFloat(l.amount)||0),0);
  const balanced = Math.abs(totalDr-totalCr) < 0.01 && totalDr > 0;
  const linesComplete = lines.every(l => l.amount && (l.mode==="party" ? l.party_name : l.gl_account));
  const canSave = balanced && linesComplete && lines.length>=2;

  const resetForm = () => {
    setEntryDate(new Date().toISOString().slice(0,10));
    setDescription("");
    setLines([
      {side:"Dr", mode:"gl", gl_account:"", party_name:"", amount:"", narration:"", invoice_ref:""},
      {side:"Cr", mode:"gl", gl_account:"", party_name:"", amount:"", narration:"", invoice_ref:""},
    ]);
  };

  const save = async () => {
    setSaving(true); setPostMsg("");
    try {
      const r = await fetch(BACKEND+"/api/journal",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          company_id: companyId,
          requesting_user_id: session?.user?.id,
          entry_date: entryDate, description,
          lines: lines.map(l=>({
            side:l.side, gl_account: l.mode==="gl" ? l.gl_account : "",
            party_name: l.mode==="party" ? l.party_name : "",
            amount: parseFloat(l.amount)||0, narration: l.narration, invoice_ref: l.invoice_ref,
          })),
        }),
      });
      const d = await r.json();
      if(d.success){
        setPostMsg("✅ Saved and posted: "+d.internal_ref);
        resetForm();
      } else setPostMsg("❌ "+d.error);
    } catch(e){ setPostMsg("❌ Network error: "+e.message); }
    finally{ setSaving(false); }
  };

  const doVoid = async(confirmText, reason) => {
    if(!voidEntry) return;
    try{
      const r = await fetch(BACKEND+"/api/journal/"+voidEntry.id+"/void",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          company_id: companyId, requesting_user_id: session?.user?.id,
          confirm_doc_number: confirmText, void_reason: reason,
        }),
      });
      const d = await r.json();
      if(d.success){
        setVoidEntry(null);
        setPostMsg("✅ "+d.message+" GL reversals: "+d.gl_reversals+" · Party reversals: "+d.party_reversals);
        fetchEntries(); fetchVoided();
      } else alert("Error: "+d.error);
    } catch(e){ alert("Network error: "+e.message); }
  };

  const TH  = {padding:"7px 8px",fontSize:9,fontWeight:700,color:"#FFF",background:NAVY,whiteSpace:"nowrap"};
  const THR = {...TH,textAlign:"right"};
  const TD  = {padding:"7px 8px",fontSize:11,borderBottom:"1px solid "+BORDER,whiteSpace:"nowrap"};
  const TDR = {...TD,textAlign:"right",fontFamily:"monospace"};

  return (
    <div style={{fontFamily:"Arial,sans-serif",background:CREAM,minHeight:"100vh",padding:"22px 28px"}}>

      {voucherId && (
        <JournalVoucherModal jid={voucherId} companyId={companyId}
          companyName={companyName} fiscalYear={fiscalYear} onClose={()=>setVoucherId(null)}/>
      )}
      {voidEntry && (
        <VoidModal entry={voidEntry} onConfirm={doVoid} onCancel={()=>setVoidEntry(null)}/>
      )}

      <div id={!voucherId && !voidEntry ? "je-print-area" : undefined}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
        <div>
          <div style={{fontSize:22,fontWeight:700,color:NAVY}}>Journal Entry</div>
          <div style={{fontSize:12,color:DIM,marginTop:2}}>
            {companyName} · FY {fiscalYear} · Multi-line Dr/Cr journal vouchers
          </div>
        </div>
        <div className="no-print" style={{display:"flex",gap:6}}>
          {onGoToBankCash && (
            <button onClick={onGoToBankCash} style={{padding:"7px 12px",background:"#FFF",
              border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:NAVY}}>
              🏦 Bank &amp; Cash
            </button>
          )}
          {onGoToGLBook && (
            <button onClick={onGoToGLBook} style={{padding:"7px 12px",background:"#FFF",
              border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:NAVY}}>
              📗 GL Book
            </button>
          )}
          {onBack && (
            <button onClick={onBack} style={{padding:"7px 12px",background:"#FFF",
              border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:NAVY}}>
              ← Back
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="no-print" style={{display:"flex",gap:0,borderBottom:"2px solid "+BORDER,marginBottom:16,alignItems:"flex-end"}}>
        <div style={{display:"flex",gap:0,flex:1}}>
          {[["entry","+ New Entry"],["list","Journal List"],["voided","Voided"]].map(([k,label])=>(
            <button key={k} onClick={()=>setActiveTab(k)} style={{
              padding:"9px 18px",border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              background:activeTab===k?NAVY:"#FFF", color:activeTab===k?"#FFF":DIM,
              borderBottom:activeTab===k?"2px solid "+NAVY:"2px solid transparent",
              marginBottom:-2,
            }}>{label}</button>
          ))}
        </div>
        {activeTab==="list" && (
          <div style={{display:"flex",gap:6,paddingBottom:6}}>
            <button onClick={exportCSV} style={{padding:"6px 14px",background:"#FFF",
              border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:GREEN}}>
              ↓ CSV
            </button>
            <button onClick={()=>window.print()} style={{padding:"6px 14px",background:"#FFF",
              border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:ERR}}>
              ↓ PDF
            </button>
            <button onClick={()=>window.print()} style={{padding:"6px 14px",background:"#FFF",
              border:"1px solid "+BORDER,cursor:"pointer",fontSize:11,fontWeight:600,color:NAVY}}>
              🖨 Print
            </button>
          </div>
        )}
      </div>

      {postMsg && (
        <div style={{padding:10,marginBottom:14,fontSize:12,fontWeight:600,
          background:postMsg.startsWith("✅")?"#D4EDDA":"#FFF0F0",
          color:postMsg.startsWith("✅")?GREEN:ERR,
          border:"1px solid "+(postMsg.startsWith("✅")?"#C3E6CB":ERR)}}>
          {postMsg}
        </div>
      )}

      {/* ══ ENTRY TAB ══ */}
      {activeTab==="entry" && (
        <div style={{maxWidth:980}}>
          <div style={{display:"grid",gridTemplateColumns:"200px 1fr",gap:12,marginBottom:14}}>
            <div>
              <label className="sans" style={lbl}>ENTRY DATE (AD) *</label>
              <input type="date" value={entryDate} onChange={e=>setEntryDate(e.target.value)} style={fld}/>
            </div>
            <div>
              <label className="sans" style={lbl}>DESCRIPTION</label>
              <input value={description} onChange={e=>setDescription(e.target.value)}
                placeholder="e.g. Adjustment for prepaid insurance" style={fld}/>
            </div>
          </div>

          {/* Balance indicator */}
          <div style={{display:"flex",gap:16,marginBottom:14,padding:"9px 14px",
            background:balanced?"#D4EDDA":"#FFF3CD",
            border:"1px solid "+(balanced?"#C3E6CB":"#FFE08A")}}>
            <span style={{fontSize:13,fontWeight:700,color:balanced?GREEN:"#856404"}}>
              {balanced?"✅ Balanced":"⚠ Unbalanced"}
            </span>
            <span style={{fontSize:12,color:DIM}}>
              Total Dr: Rs.{fmtT(totalDr)} &nbsp;·&nbsp; Total Cr: Rs.{fmtT(totalCr)}
              {!balanced && totalDr!==totalCr && " · Difference: Rs."+fmtT(Math.abs(totalDr-totalCr))}
            </span>
          </div>

          {/* Lines */}
          {lines.map((line,i)=>{
            const sideColor = line.side==="Dr" ? NAVY : ERR;
            return (
              <div key={i} style={{background:"#FFF",border:"1px solid "+BORDER,
                borderLeft:"4px solid "+sideColor, padding:"10px 12px",marginBottom:8,borderRadius:3}}>
                <div style={{display:"grid",gridTemplateColumns:"60px 110px 1fr 1fr 110px 110px 28px",
                  gap:8,alignItems:"end"}}>
                  <div>
                    <label className="sans" style={lbl}>SIDE</label>
                    <div style={{padding:"7px 0",fontWeight:800,color:sideColor,fontSize:13,textAlign:"center"}}>
                      {line.side}
                    </div>
                  </div>
                  <div>
                    <label className="sans" style={lbl}>TYPE</label>
                    <select value={line.mode} onChange={e=>updateLine(i,"mode",e.target.value)} style={fld}>
                      <option value="gl">GL Account</option>
                      <option value="party">Party</option>
                    </select>
                  </div>
                  {line.mode==="gl" ? (
                    <div>
                      <label className="sans" style={lbl}>GL ACCOUNT *</label>
                      <input list={"gl-list-"+i} value={line.gl_account}
                        onChange={e=>updateLine(i,"gl_account",e.target.value)}
                        placeholder="Type GL code or name"
                        style={{...fld, border:!line.gl_account?"1px solid "+ERR:fld.border}}/>
                      <datalist id={"gl-list-"+i}>
                        {glAccounts.map(a=><option key={a.id} value={a.gl_code+" - "+a.gl_name}/>)}
                      </datalist>
                    </div>
                  ) : (
                    <div>
                      <label className="sans" style={lbl}>PARTY *</label>
                      <input list={"party-list-"+i} value={line.party_name}
                        onChange={e=>updateLine(i,"party_name",e.target.value)}
                        placeholder="Type party name"
                        style={{...fld, border:!line.party_name?"1px solid "+ERR:fld.border}}/>
                      <datalist id={"party-list-"+i}>
                        {parties.map(p=><option key={p.id} value={p.name}/>)}
                      </datalist>
                    </div>
                  )}
                  <div>
                    <label className="sans" style={lbl}>NARRATION</label>
                    <input value={line.narration} onChange={e=>updateLine(i,"narration",e.target.value)}
                      placeholder="Optional" style={fld}/>
                  </div>
                  <div>
                    <label className="sans" style={lbl}>INVOICE REF</label>
                    <input value={line.invoice_ref} onChange={e=>updateLine(i,"invoice_ref",e.target.value)}
                      placeholder="Optional" style={fld}/>
                  </div>
                  <div>
                    <label className="sans" style={{...lbl,color:ERR}}>AMOUNT *</label>
                    <input type="number" value={line.amount}
                      onChange={e=>updateLine(i,"amount",e.target.value)}
                      placeholder="0.00"
                      style={{...fld,textAlign:"right",fontWeight:700,
                        border:!line.amount?"1px solid "+ERR:"1px solid "+GREEN}}/>
                  </div>
                  <button onClick={()=>removeLine(i)} disabled={lines.length<=2}
                    style={{padding:"7px",background:"transparent",border:"1px solid "+BORDER,
                      cursor:lines.length<=2?"not-allowed":"pointer",color:ERR,fontSize:13}}>
                    ✕
                  </button>
                </div>
              </div>
            );
          })}

          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <button onClick={()=>addLine("Dr")} style={{padding:"7px 14px",background:"#FFF",
              border:"1px solid "+NAVY,color:NAVY,fontWeight:600,fontSize:12,cursor:"pointer"}}>
              + Add Dr Line
            </button>
            <button onClick={()=>addLine("Cr")} style={{padding:"7px 14px",background:"#FFF",
              border:"1px solid "+ERR,color:ERR,fontWeight:600,fontSize:12,cursor:"pointer"}}>
              + Add Cr Line
            </button>
          </div>

          {!linesComplete && (
            <div style={{padding:9,marginBottom:12,fontSize:11.5,color:ERR,
              background:"#FFF0F0",border:"1px solid "+ERR}}>
              ⚠ Every line needs an amount, plus a GL account or a party selected.
            </div>
          )}

          <button onClick={save} disabled={!canSave||saving}
            style={{padding:"12px 28px",background:canSave&&!saving?GREEN:"#AAA",color:"#FFF",
              border:"none",fontWeight:700,fontSize:13,cursor:canSave&&!saving?"pointer":"not-allowed",
              fontFamily:"Arial"}}>
            {saving?"Saving…":"✓ Save & Post Journal Entry"}
          </button>

          <div style={{fontSize:10,color:DIM,marginTop:14,fontStyle:"italic"}}>
            Bank Account and Cash In Hand GLs are excluded from this picker — those transactions
            route through Bank &amp; Cash Ledger instead. A Party line posts to Party Ledger using
            that party's own GL account from Party Master — works for any party type.
          </div>
        </div>
      )}

      {/* ══ LIST TAB ══ */}
      {activeTab==="list" && (
        loading ? (
          <div style={{padding:40,textAlign:"center",color:DIM}}>Loading…</div>
        ) : error ? (
          <div style={{padding:12,color:ERR,background:"#FFF0F0",border:"1px solid "+ERR}}>{error}</div>
        ) : (
          <div style={{overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",width:"100%"}}>
              <thead>
                <tr>
                  <th style={TH}>REF</th>
                  <th style={TH}>DATE</th>
                  <th style={{...TH,minWidth:260}}>DESCRIPTION</th>
                  <th style={THR}>TOTAL DR</th>
                  <th style={THR}>TOTAL CR</th>
                  <th style={{...TH,width:120}}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {entries.length===0 ? (
                  <tr><td colSpan={6} style={{padding:30,textAlign:"center",color:DIM}}>
                    No journal entries yet. Use "+ New Entry" to create one.
                  </td></tr>
                ) : entries.map((e,i)=>(
                  <tr key={e.id} style={{background:i%2===0?"#FFF":LIGHT}}>
                    <td style={{...TD,fontFamily:"monospace",fontWeight:600,color:NAVY}}>
                      <span onClick={()=>setVoucherId(e.id)} style={{cursor:"pointer",
                        textDecoration:"underline",textDecorationStyle:"dotted"}}>
                        {e.internal_ref}
                      </span>
                    </td>
                    <td style={{...TD,fontSize:10}}>{e.entry_date}</td>
                    <td style={{...TD,maxWidth:300,overflow:"hidden",textOverflow:"ellipsis"}}>{e.description}</td>
                    <td style={{...TDR,color:NAVY,fontWeight:700}}>{fmtT(e.total_dr)}</td>
                    <td style={{...TDR,color:ERR,fontWeight:700}}>{fmtT(e.total_cr)}</td>
                    <td style={TD}>
                      {isSuperAdmin && (
                        <button onClick={()=>setVoidEntry(e)}
                          style={{padding:"3px 7px",fontSize:9,fontWeight:700,
                            background:"#FFF",color:ERR,border:"1px solid "+ERR,cursor:"pointer"}}>
                          ✕ Void
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ══ VOIDED TAB ══ */}
      {activeTab==="voided" && (
        voidedEntries.length===0 ? (
          <div style={{padding:30,textAlign:"center",color:DIM,background:"#FFF",border:"1px solid "+BORDER}}>
            No voided journal entries.
          </div>
        ) : (
          <div style={{overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",width:"100%"}}>
              <thead>
                <tr>
                  {["REF","DATE","DESCRIPTION","TOTAL","VOIDED BY","VOIDED AT","REASON"].map(h=>(
                    <th key={h} style={{padding:"7px 8px",fontSize:9,fontWeight:700,color:"#FFF",
                      background:"#7B3030",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {voidedEntries.map((e,i)=>(
                  <tr key={e.id} style={{background:i%2===0?"#FFF8F8":"#FFF0F0"}}>
                    <td style={{padding:"8px",fontSize:11,borderBottom:"1px solid "+BORDER,
                      fontFamily:"monospace",fontWeight:700,color:ERR,textDecoration:"line-through"}}>{e.internal_ref}</td>
                    <td style={{padding:"8px",fontSize:10,borderBottom:"1px solid "+BORDER,color:DIM,textDecoration:"line-through"}}>{e.entry_date}</td>
                    <td style={{padding:"8px",fontSize:11,borderBottom:"1px solid "+BORDER,color:DIM,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis"}}>{e.description}</td>
                    <td style={{padding:"8px",fontSize:12,borderBottom:"1px solid "+BORDER,fontFamily:"monospace",textAlign:"right"}}>{fmtT(e.total_dr)}</td>
                    <td style={{padding:"8px",fontSize:11,borderBottom:"1px solid "+BORDER}}>{e.voided_by}</td>
                    <td style={{padding:"8px",fontSize:10,borderBottom:"1px solid "+BORDER,color:DIM}}>{e.voided_at?.slice(0,10)}</td>
                    <td style={{padding:"8px",fontSize:11,borderBottom:"1px solid "+BORDER,color:"#333"}}>{e.void_reason}</td>
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
