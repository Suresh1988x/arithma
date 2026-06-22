import { useState, useEffect } from "react";
import SettingsPage from "./SettingsPage";
import HomePage from "./HomePage";
import LoginPage from "./LoginPage";
import UsersPage from "./UsersPage";
import AccessControlPage from "./AccessControlPage";
import ConsultantAccessPage from "./ConsultantAccessPage";
import MaterialMasterPage from "./MaterialMasterPage";
import PartyMasterPage from "./PartyMasterPage";
import OBSetupPage from "./OBSetupPage";
import FARegisterPage from "./FARegisterPage";
import PurchaseEntryPage from "./PurchaseEntryPage";
import PurchaseBookPage from "./PurchaseBookPage";
import GLMasterPage from "./GLMasterPage";
import GLCreationPage from "./GLCreationPage";
import SalesEntryPage from "./SalesEntryPage";
import SalesBookPage from "./SalesBookPage";
import GLBookPage from "./GLBookPage";
import PartyLedgerPage from "./PartyLedgerPage";
import BankLedgerPage  from "./BankLedgerPage";
import BankBalancesPage from "./BankBalancesPage";
import CashFlowSourcesUsesPage from "./CashFlowSourcesUsesPage";
import JournalEntryPage from "./JournalEntryPage";
import ImportRegisterPage from "./ImportRegisterPage";
import VATRegisterPage from "./VATRegisterPage";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5001";

export default function App() {
  const [session,            setSession]            = useState(null);
  const [tab,                setTab]                = useState("home");
  const [homeSettings,       setHomeSettings]       = useState(null);
  const [glEditAccount,      setGlEditAccount]      = useState(null);
  const [obInitialTab,       setObInitialTab]       = useState("gl");
  const [companies,          setCompanies]          = useState([]);
  const [companyId,          setCompanyId]          = useState(1);
  const [permissions,        setPermissions]        = useState(null);
  // Controls which tab PartyLedgerPage opens on:
  // "ledger" = Party Statement (default), "ageing" = Ageing Report
  const [partyLedgerInitTab, setPartyLedgerInitTab] = useState("ledger");

  const fetchPermissions = async (cid) => {
    try {
      const role = session?.user?.is_super_admin
        ? "company_admin"
        : (session?.companies?.find(c => c.id === cid)?.role || "viewer");
      const res = await fetch(`${BACKEND}/api/permissions?company_id=${cid}&role=${role}`);
      const data = await res.json();
      setPermissions(data.permissions || null);
    } catch { setPermissions(null); }
  };

  const fetchHomeSettings = async (cid) => {
    try {
      const res = await fetch(`${BACKEND}/api/settings?company_id=${cid}`);
      const data = await res.json();
      if (!data.error) setHomeSettings(data);
    } catch {}
  };

  useEffect(() => {
    if (!session) return;
    fetchHomeSettings(companyId);
    fetchPermissions(companyId);
  }, [companyId, session]);

  useEffect(() => {
    if (session?.companies) setCompanies(session.companies);
    if (session?.company?.id) setCompanyId(session.company.id);
  }, [session]);

  if (!session) return <LoginPage onLogin={(s) => setSession(s)} />;

  // ── Breadcrumb ────────────────────────────────────────────────
  const breadcrumb =
    tab === "gl"               ? "GENERAL LEDGER MASTER" :
    tab === "gl-create"        ? "GL ACCOUNT MANAGER" :
    tab === "users"            ? "USERS" :
    tab === "access"           ? "ACCESS CONTROL" :
    tab === "consultants"      ? "CONSULTANTS" :
    tab === "material-create"  ? "MATERIAL CREATION FORM" :
    ["rm-master","fg-master","sub-master","service-master"].includes(tab)
                               ? tab.replace("-"," ").toUpperCase() :
    tab === "party-create"     ? "PARTY ENTRY FORM" :
    tab === "party-master"     ? "PARTY MASTER" :
    tab === "ob-setup"         ? "OPENING BALANCE SETUP" :
    tab === "fa-register"      ? "FIXED ASSETS REGISTER" :
    tab === "purchase"         ? "PURCHASE ENTRY" :
    tab === "purchase-book"    ? "PURCHASE BOOK" :
    tab === "sales"            ? "SALES ENTRY" :
    tab === "sales-book"       ? "SALES BOOK" :
    tab === "gl-book"          ? "GL BOOK" :
    tab === "party-ledger"     ? "PARTY LEDGER" :
    tab === "ageing-analysis"  ? "AGEING ANALYSIS" :
    tab === "bank-cash"         ? "BANK & CASH LEDGER" :
    tab === "bank-balances"     ? "BANK BALANCES" :
    tab === "cash-flow"         ? "CASH SOURCES VS USES" :
    tab === "journal"           ? "JOURNAL ENTRY" :
    tab === "import-purchase"   ? "IMPORT PURCHASE" :
    tab === "import-register-report" ? "IMPORT LANDED REGISTER" :
    tab === "vat-register"      ? "VAT REGISTER" :
    "SETTINGS";

  // ── Section heading ───────────────────────────────────────────
  const sectionLabel =
    ["settings","users","access","consultants"].includes(tab)         ? "Company Settings" :
    ["gl","gl-create","material-create","rm-master","fg-master",
     "sub-master","service-master","party-create","fa-register",
     "party-master"].includes(tab)                                    ? "Masters" :
    ["ob-setup"].includes(tab)                                        ? "Activities" :
    ["purchase","purchase-book","sales","sales-book",
     "gl-book","party-ledger","ageing-analysis","bank-cash","bank-balances","cash-flow","journal","import-purchase"].includes(tab) ? "Activities" :
    ["import-register-report","vat-register"].includes(tab)          ? "VAT & Compliance" :
    "Company Settings";

  return (
    <div style={{ fontFamily: "'Source Serif Pro', Georgia, serif", background: "#F7F4ED", minHeight: "100vh", color: "#2B2B28" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+Pro:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .sans { font-family: 'Inter', sans-serif; }
        table.ledger { border-collapse: collapse; width: 100%; }
        table.ledger th, table.ledger td { border-bottom: 1px solid #E2DDD0; }
        table.ledger tbody tr:hover { background: #FBF8F0; }
        .ruled { background-image: repeating-linear-gradient(transparent, transparent 35px, #E9E4D6 35px, #E9E4D6 36px); }
        input, select { font-family: 'Inter', sans-serif; }
        input:focus, select:focus { outline: 2px solid #8A6D3B; outline-offset: 1px; }
        button:focus-visible { outline: 2px solid #8A6D3B; outline-offset: 2px; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ borderBottom: "3px double #2B2B28", padding: "20px 32px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="sans" style={{ fontSize: 11, letterSpacing: "0.25em", color: "#8A6D3B", fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "baseline", gap: 10 }}>
              <button onClick={() => setTab("home")} className="sans"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0,
                  color: tab === "home" ? "#2B2B28" : "#8A6D3B",
                  letterSpacing: "0.18em", fontSize: 22, fontWeight: 800,
                  textDecoration: tab === "home" ? "none" : "underline" }}>
                ARITHMA
              </button>
              <span className="sans" style={{ fontSize: 10, letterSpacing: "0.2em", color: "#9A9285", fontWeight: 600 }}>
                VAT &amp; INVENTORY MANAGER
              </span>
              {tab !== "home" && (
                <span style={{ color: "#C8C2B4" }}>/ {breadcrumb}</span>
              )}
            </div>

            {tab !== "home" && (
              <>
                <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "0.01em" }}>
                  {sectionLabel}
                </div>
                {["settings","users","access","consultants"].includes(tab) && (
                  <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
                    {tab !== "consultants" ? (
                      <select className="sans" value={companyId}
                        onChange={e => setCompanyId(Number(e.target.value))}
                        style={{ padding: "6px 10px", border: "1px solid #2B2B28", background: "#FFFFFF",
                          fontSize: 12, fontWeight: 600, color: "#2B2B28", letterSpacing: "0.04em" }}>
                        {companies.length === 0
                          ? <option value={companyId}>Loading companies…</option>
                          : companies.map(c => (
                            <option key={c.id} value={c.id}>{c.name}{c.pan_number ? ` · PAN ${c.pan_number}` : ""}</option>
                          ))}
                      </select>
                    ) : <div style={{ minWidth: 200 }} />}
                    {companies.length > 1 && companies.filter(c => c.id !== companyId).map(c => (
                      <button key={c.id} onClick={() => setCompanyId(c.id)} className="sans"
                        style={{ padding: "4px 10px", fontSize: 11, border: "1px solid #D6D0C2", background: "#FFF", cursor: "pointer" }}>
                        Switch to {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="sans" style={{ textAlign: "right", fontSize: 12, color: "#6B645A" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3D7A4F", display: "inline-block" }} />
              Connected to database
            </div>
            <div style={{ marginTop: 6 }}>
              {session.user.full_name || session.user.username}
              <span style={{ color: "#C8C2B4", margin: "0 6px" }}>·</span>
              FY {session.fiscalYear}
              <span style={{ color: "#C8C2B4", margin: "0 6px" }}>·</span>
              <button onClick={() => setSession(null)} className="sans"
                style={{ background: "none", border: "none", color: "#A8453B", cursor: "pointer",
                  fontWeight: 600, letterSpacing: "0.04em", padding: 0, fontSize: 12 }}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Page routing ── */}
      {tab === "home" ? (
        <HomePage
          company={companies.find(c => c.id === companyId)}
          settings={homeSettings}
          permissions={permissions}
          session={session}
          onNavigate={(key) => {
            if      (key === "settings")         setTab("settings");
            else if (key === "gl")               setTab("gl");
            else if (key === "gl-create")        setTab("gl-create");
            else if (key === "users")            setTab("users");
            else if (key === "access")           setTab("access");
            else if (key === "consultants")      setTab("consultants");
            else if (key === "party-create")     setTab("party-create");
            else if (key === "party-master")     setTab("party-master");
            else if (key === "fa-register")      setTab("fa-register");
            else if (key === "purchase")         setTab("purchase");
            else if (key === "purchase-book")    setTab("purchase-book");
            else if (key === "sales")            setTab("sales");
            else if (key === "sales-book")       setTab("sales-book");
            else if (key === "gl-book")          setTab("gl-book");
            else if (key === "party-ledger") {
              setPartyLedgerInitTab("ledger");
              setTab("party-ledger");
            }
            else if (key === "bank-cash") {
              setTab("bank-cash");
            }
            else if (key === "bank-balances") {
              setTab("bank-balances");
            }
            else if (key === "cash-flow") {
              setTab("cash-flow");
            }
            else if (key === "journal") {
              setTab("journal");
            }
            else if (key === "import-purchase") {
              setTab("import-purchase");
            }
            else if (key === "import-register-report") {
              setTab("import-register-report");
            }
            else if (key === "vat-register") {
              setTab("vat-register");
            }
            else if (key === "ageing-analysis") {
              setPartyLedgerInitTab("ageing");
              setTab("party-ledger");
            }
            else if (["inv-ob","party-ob","bank-ob","fa-ob","gl-ob"].includes(key)) {
              const tabMap = { "inv-ob":"inventory","party-ob":"party","bank-ob":"bank","fa-ob":"fa","gl-ob":"gl" };
              setObInitialTab(tabMap[key] || "gl");
              setTab("ob-setup");
            }
            else if (key === "material-create")  setTab("material-create");
            else if (key === "rm-master")        setTab("rm-master");
            else if (key === "fg-master")        setTab("fg-master");
            else if (key === "sub-master")       setTab("sub-master");
            else if (key === "service-master")   setTab("service-master");
          }}
        />

      ) : tab === "gl" ? (
        <GLMasterPage
          session={session} companyId={companyId} companies={companies} homeSettings={homeSettings}
          onGLCreate={() => setTab("gl-create")}
          onEditGL={(account, mode) => { setGlEditAccount({ account, mode }); setTab("gl-create"); }}
          onGoToBankCash={() => setTab("bank-cash")}
        />

      ) : tab === "gl-create" ? (
        <GLCreationPage
          session={session} companyId={companyId} companies={companies} homeSettings={homeSettings}
          initialAccount={glEditAccount?.account}
          initialMode={glEditAccount?.mode || "new"}
          onViewMaster={() => { setGlEditAccount(null); setTab("gl"); }}
        />

      ) : tab === "purchase" ? (
        <PurchaseEntryPage
          session={session} companyId={companyId} companies={companies} homeSettings={homeSettings}
          onViewPurchaseBook={() => setTab("purchase-book")}
          onViewPartyLedger={() => { setPartyLedgerInitTab("ledger"); setTab("party-ledger"); }}
          onViewGLBook={() => setTab("gl-book")}
        />

      ) : tab === "purchase-book" ? (
        <PurchaseBookPage
          session={session} companyId={companyId} companies={companies} homeSettings={homeSettings}
          onGoToPurchaseEntry={() => setTab("purchase")}
        />

      ) : tab === "sales" ? (
        <SalesEntryPage
          session={session} companyId={companyId} companies={companies} homeSettings={homeSettings}
          onViewSalesBook={() => setTab("sales-book")}
          onViewFARegister={() => setTab("fa-register")}
        />

      ) : tab === "sales-book" ? (
        <SalesBookPage
          session={session} companyId={companyId} companies={companies} homeSettings={homeSettings}
          onGoToSalesEntry={() => setTab("sales")}
          onGoToFARegister={() => setTab("fa-register")}
        />

      ) : tab === "gl-book" ? (
        <GLBookPage
          session={session} companyId={companyId} companies={companies} homeSettings={homeSettings}
          onGoToPurchase={() => setTab("purchase")}
          onGoToImport={() => setTab("import-purchase")}
          onGoToSales={() => setTab("sales")}
        />

      ) : tab === "bank-cash" ? (
        <BankLedgerPage
          session={session} companyId={companyId}
          companies={companies} homeSettings={homeSettings}
          onGoToGLMaster={()       => setTab("gl")}
          onGoToBankBalances={()   => setTab("bank-balances")}
        />

      ) : tab === "bank-balances" ? (
        <BankBalancesPage
          session={session} companyId={companyId}
          companies={companies} homeSettings={homeSettings}
          onBack={() => setTab("home")}
          onGoToBankCash={() => setTab("bank-cash")}
        />

      ) : tab === "cash-flow" ? (
        <CashFlowSourcesUsesPage
          session={session} companyId={companyId}
          companies={companies} homeSettings={homeSettings}
          onBack={() => setTab("home")}
          onGoToBankCash={() => setTab("bank-cash")}
        />

      ) : tab === "journal" ? (
        <JournalEntryPage
          session={session} companyId={companyId}
          companies={companies} homeSettings={homeSettings}
          onBack={() => setTab("home")}
          onGoToBankCash={() => setTab("bank-cash")}
          onGoToGLBook={() => setTab("gl-book")}
        />

      ) : tab === "import-purchase" ? (
        <ImportRegisterPage
          session={session} companyId={companyId}
          companies={companies} homeSettings={homeSettings}
          onBack={() => setTab("home")}
          onGoToBankCash={() => setTab("bank-cash")}
          onGoToPurchaseBook={() => setTab("purchase-book")}
          defaultTab="phase1"
        />

      ) : tab === "import-register-report" ? (
        <ImportRegisterPage
          session={session} companyId={companyId}
          companies={companies} homeSettings={homeSettings}
          onBack={() => setTab("home")}
          onGoToBankCash={() => setTab("bank-cash")}
          onGoToPurchaseBook={() => setTab("purchase-book")}
          defaultTab="register"
        />

      ) : tab === "vat-register" ? (
        <VATRegisterPage
          session={session} companyId={companyId}
          companies={companies} homeSettings={homeSettings}
          onBack={() => setTab("home")}
          onGoToPurchaseBook={() => setTab("purchase-book")}
          onGoToImportRegister={() => setTab("import-register-report")}
        />

      ) : tab === "party-ledger" ? (
        <PartyLedgerPage
          session={session} companyId={companyId} companies={companies} homeSettings={homeSettings}
          initialTab={partyLedgerInitTab}
          onGoToPurchase={() => setTab("purchase")}
          onGoToImport={() => setTab("import-purchase")}
          onGoToSales={() => setTab("sales")}
        />

      ) : tab === "fa-register" ? (
        <FARegisterPage
          session={session} companyId={companyId} companies={companies} homeSettings={homeSettings}
          mode="register"
          onFAOBSetup={() => { setObInitialTab("fa"); setTab("ob-setup"); }}
          onGoToSalesBook={() => setTab("sales-book")}
        />

      ) : tab === "ob-setup" ? (
        <OBSetupPage
          session={session} companyId={companyId} companies={companies} homeSettings={homeSettings}
          initialTab={obInitialTab}
          onFARegister={() => setTab("fa-register")}
        />

      ) : tab === "party-create" ? (
        <PartyMasterPage
          session={session} companyId={companyId} companies={companies} homeSettings={homeSettings}
          mode="create"
          onViewMaster={() => setTab("party-master")}
        />

      ) : tab === "party-master" ? (
        <PartyMasterPage
          session={session} companyId={companyId} companies={companies} homeSettings={homeSettings}
          mode="view"
          onCreateParty={() => setTab("party-create")}
        />

      ) : tab === "material-create" ? (
        <MaterialMasterPage
          session={session} companyId={companyId} companies={companies} mode="create"
          onViewMaster={(type) => {
            const map = { RM:"rm-master", FG:"fg-master", Sub:"sub-master", BP:"sub-master", Service:"service-master" };
            setTab(map[type] || "rm-master");
          }}
        />

      ) : tab === "rm-master" ? (
        <MaterialMasterPage session={session} companyId={companyId} companies={companies}
          mode="view" initialType="RM" onCreateMaterial={() => setTab("material-create")} />

      ) : tab === "fg-master" ? (
        <MaterialMasterPage session={session} companyId={companyId} companies={companies}
          mode="view" initialType="FG" onCreateMaterial={() => setTab("material-create")} />

      ) : tab === "sub-master" ? (
        <MaterialMasterPage session={session} companyId={companyId} companies={companies}
          mode="view" initialType="Sub" onCreateMaterial={() => setTab("material-create")} />

      ) : tab === "service-master" ? (
        <MaterialMasterPage session={session} companyId={companyId} companies={companies}
          mode="view" initialType="Service" onCreateMaterial={() => setTab("material-create")} />

      ) : tab === "consultants" ? (
        <ConsultantAccessPage session={session} />

      ) : tab === "users" ? (
        <UsersPage session={session} companyId={companyId} companies={companies} />

      ) : tab === "access" ? (
        <AccessControlPage session={session} companyId={companyId} companies={companies} />

      ) : tab === "settings" ? (
        <SettingsPage companyId={companyId} session={session} />

      ) : (
        <SettingsPage companyId={companyId} session={session} />
      )}

    </div>
  );
}
