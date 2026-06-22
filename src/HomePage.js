import { useState } from "react";

// HomePage.js — ARITHMA Dashboard / Navigation Hub
// Theme: Cream canvas + Navy/Sky-Blue + Gold + Platinum accents
//
// Mirrors the structure of the Excel "Dashboard" sheet:
//   1. Company Settings
//   2. Masters (2.1 Accounting Setup, 2.2 Inventory Setup, 2.3 Edit/View Masters)
//   3. Activities (3.1 Opening Balances, 3.2-3.4 Trade Transactions,
//                   3.5-3.6 Production & Stores, 3.7-3.8 Operations & Finance)
//   4. Inventory Insights
//
// Only "Settings" and "GL Master" (Chart of Accounts) are wired to working
// pages so far. Everything else renders as a "Coming Soon" card.

const CREAM       = "#F7F4ED";  // page background (matches GL/Settings pages)
const NAVY        = "#1B3A5C";  // primary ink / borders for ready items
const NAVY_DEEP   = "#10243B";  // banner gradient start
const SKY         = "#2E6E9E";  // section accent (Masters / Insights)
const GOLD        = "#B8860B";  // primary accent (Settings / Activities)
const GOLD_SOFT   = "#F0D78C";
const PLATINUM    = "#EDEBE4";  // soft card bg for "soon" items
const TEXT_DIM    = "#6B645A";
const TEXT_SOON   = "#7A7366";
const BORDER_DIM  = "#D6D0C2";
const GREEN       = "#2E7D4F";

const SECTIONS = [
  {
    num: "1", title: "Company Settings", color: GOLD,
    groups: [
      { label: null, cards: [
        { key: "settings", title: "Settings", desc: "Company, FY, Users & Preferences", ready: true },
        { key: "users", title: "Users & Access", desc: "Manage logins, roles, password", ready: true },
        { key: "access", title: "Access Control", desc: "Tick module access per role", ready: true },
      ]}
    ]
  },
  {
    num: "2", title: "Masters", color: SKY,
    groups: [
      { label: "2.1 · Accounting Setup", cards: [
        { key: "gl-create", title: "GL Account Manager", desc: "New / Edit / Delete GL accounts", ready: true },
        { key: "party-create", title: "Party Creation", desc: "Vendors, customers, staff", ready: true },
      ]},
      { label: "2.2 · Inventory Setup", cards: [
        { key: "material-create", title: "Material Creation", desc: "RM, FG, BP, Sub, Service", ready: true },
      ]},
      { label: "2.3 · Edit / View Masters", cards: [
        { key: "rm-master", title: "RM Master", desc: "Raw material register", ready: true },
        { key: "fg-master", title: "FG Master", desc: "Finished goods register", ready: true },
        { key: "sub-master", title: "Sub-Store Master", desc: "Packing materials", ready: true },
        { key: "service-master", title: "Service Master", desc: "Services", ready: true },
        { key: "party-master", title: "Party Master", desc: "Customer, Vendor, Staff, LC, TDS", ready: true },
        { key: "gl", title: "GL Master", desc: "Chart of accounts", ready: true },
      ]},
    ]
  },
  {
    num: "3", title: "Activities", color: NAVY,
    groups: [
      { label: "3.1 · Opening Balances", cards: [
        { key: "inv-ob",   title: "Inventory OB",  desc: "RM, FG, BP, Sub opening",    ready: true },
        { key: "party-ob", title: "Party OB",       desc: "Dr, Cr, LC, TDS",            ready: true },
        { key: "bank-ob",  title: "Bank OB",        desc: "Bank & Cash opening",        ready: true },
        { key: "fa-ob",    title: "FA OB",          desc: "Fixed Assets opening",       ready: true },
        { key: "gl-ob",    title: "GL OB Setup",    desc: "Account opening balances",   ready: true },
      ]},
      { label: "3.2 – 3.4 · Trade Transactions", cards: [
        { key: "purchase", title: "Purchase", desc: "Local purchase entry", ready: true },
	{ key: "import-purchase", title: "Import Purchase", desc: "Phase I item entry + Phase II landed cost", ready: true },
        { key: "sales", title: "Sales", desc: "Sales invoice entry", ready: true },
      ]},
      { label: "3.5 – 3.6 · Production & Stores", cards: [
        { key: "production", title: "Production Orders", desc: "Batch / production entry" },
        { key: "sub-issue", title: "Sub-Store Issue", desc: "Packing material issues" },
      ]},
      { label: "3.7 – 3.8 · Operations & Finance", cards: [
        { key: "bank-cash", title: "Bank & Cash", desc: "Statements & ledger", ready: true  },
        { key: "journal", title: "Journal Entries", desc: "Manual JV & adjustments", ready: true },
      ]},
    ]
  },
  {
    num: "4", title: "Inventory Insights", color: SKY,
    groups: [
      { label: null, cards: [
        { key: "rm-stock", title: "RM Stock Report", desc: "Raw material balances" },
        { key: "fg-stock", title: "FG Stock Report", desc: "Finished goods balances" },
        { key: "sub-stock", title: "Sub-Store Report", desc: "Packing material stock" },
        { key: "refresh-stock", title: "Refresh Stock Journal", desc: "Sync all movements" },
      ]}
    ]
  },
  {
    num: "5", title: "Ledgers & Drill-Down Reports", color: NAVY,
    groups: [
      { label: null, cards: [
        { key: "stock-book", title: "Stock Book", desc: "All stock movements" },
        { key: "production-book", title: "Production Book", desc: "Consumption & output log" },
        { key: "costing-budget", title: "Costing & Budget", desc: "Cost analysis & variances" },
        { key: "gl-book", title: "GL Book", desc: "Full general ledger", ready: true },
        { key: "party-ledger", title: "Party Ledger", desc: "Receivables & payables", ready: true },
        { key: "fa-register", title: "Fixed Assets Register", desc: "WDV & depreciation", ready: true },
      ]}
    ]
  },
  {
    num: "6", title: "VAT & Compliance Reports", color: SKY,
    groups: [
      { label: null, cards: [
        { key: "purchase-book", title: "Purchase Book", desc: "VAT purchase register", ready: true },
	{ key: "import-register-report", title: "Import Landed Register", desc: "Item-wise landed cost report, downloadable", ready: true },
        { key: "sales-book", title: "Sales Book", desc: "VAT sales register", ready: true },
	{ key: "vat-register", title: "VAT Register", desc: "Merged Purchase + Import Input VAT", ready: true },      
]}
    ]
  },
  {
    num: "7", title: "Advanced CFO Analytics", color: GOLD,
    groups: [
      { label: null, cards: [
        { key: "trial-balance", title: "Trial Balance", desc: "All GL account balances" },
        { key: "pl-account", title: "P & L Account", desc: "Income vs expenses" },
        { key: "balance-sheet", title: "Balance Sheet", desc: "Assets, liabilities, equity" },
        { key: "cash-flow", title: "Cash Flow Statement", desc: "Operating, investing, financing" },
	{ key: "bank-balances", title: "Bank Balances", desc: "Opening, withdrawal, deposit & closing", ready: true },
	{ key: "cash-flow", title: "Cash Sources Vs Uses", desc: "Where funds came from & how they moved", ready: true },
	{ key: "ageing-analysis", title: "Ageing Analysis", desc: "Debtors & Creditors", ready: true },
      ]}
    ]
  },
];

function Card({ card, onNavigate, onComingSoon }) {
  const ready = !!card.ready;
  return (
    <button
      onClick={() => ready ? onNavigate(card.key) : onComingSoon(card.title)}
      className="sans"
      style={{
        textAlign: "left",
        border: "1px solid " + (ready ? NAVY : "#BFB8A8"),
        background: ready ? "#FFFFFF" : PLATINUM,
        padding: "14px 16px",
        cursor: "pointer",
        position: "relative",
        transition: "box-shadow 0.15s, transform 0.1s, border-color 0.15s",
      }}
      onMouseEnter={e => {
        if (ready) {
          e.currentTarget.style.boxShadow = `3px 3px 0 ${GOLD}`;
          e.currentTarget.style.transform = "translate(-2px,-2px)";
        } else {
          e.currentTarget.style.borderColor = SKY;
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.borderColor = ready ? NAVY : "#BFB8A8";
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: ready ? NAVY : "#5C5648", marginBottom: 3, letterSpacing: "0.01em" }}>
        {card.title}
      </div>
      <div className="sans" style={{ fontSize: 11, color: ready ? TEXT_DIM : TEXT_SOON, fontWeight: 500 }}>{card.desc}</div>
      {ready
        ? <div style={{ position: "absolute", top: 12, right: 12, width: 7, height: 7, borderRadius: "50%", background: GREEN }} />
        : <div className="sans" style={{ position: "absolute", top: 11, right: 11, fontSize: 9, letterSpacing: "0.12em", color: "#8A8473", fontWeight: 700, border: "1px solid #C7C0B0", padding: "1px 6px", background: "#F7F4ED" }}>SOON</div>
      }
    </button>
  );
}

export default function HomePage({ company, settings, permissions, session, onNavigate }) {
  const [toast, setToast] = useState("");

  const showComingSoon = (title) => {
    setToast(`"${title}" module is coming soon.`);
    setTimeout(() => setToast(""), 2200);
  };

  const companyName = settings?.company_name || company?.name || "Company";
  const fy = settings?.fiscal_year_bs ? `FY ${settings.fiscal_year_bs}` : "";

  return (
    <div style={{ background: CREAM, minHeight: "calc(100vh - 90px)", padding: "0 0 40px" }}>
      {/* Title banner — navy/sky gradient with gold accent, sits on cream canvas */}
      <div style={{
        background: `linear-gradient(135deg, ${NAVY_DEEP} 0%, #1E3F61 55%, ${SKY} 100%)`,
        padding: "20px 32px",
        borderBottom: `3px solid ${GOLD}`,
      }}>
        <div className="sans" style={{ fontSize: 15, fontWeight: 700, color: GOLD_SOFT, letterSpacing: "0.08em" }}>
          {companyName.toUpperCase()}
          {fy && <><span style={{ color: "#7E97AE", margin: "0 10px" }}>&middot;</span><span style={{ color: "#C8D4DE" }}>{fy}</span></>}
        </div>
      </div>

      <div style={{ padding: "24px 32px", maxWidth: 1180, margin: "0 auto" }}>
        {SECTIONS.map(section => {
          if (section.num === "1" && session?.user?.is_super_admin) {
            section = {
              ...section,
              groups: section.groups.map((g, gi) => gi === 0 ? {
                ...g,
                cards: [...g.cards, { key: "consultants", title: "Consultant Access", desc: "Manage consultant roles per company", ready: true }],
              } : g),
            };
          }
          const sectionHasVisible = section.groups.some(group =>
            group.cards.some(card => !permissions || permissions[card.key] !== false)
          );
          if (!sectionHasVisible) return null;
          return (
          <div key={section.num} style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, paddingBottom: 6, borderBottom: `2px solid ${section.color}` }}>
              <div className="sans" style={{
                width: 22, height: 22, borderRadius: "50%", background: section.color,
                color: "#FFFFFF", fontSize: 12, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                {section.num}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: section.color }}>{section.title}</div>
            </div>

            {section.groups.map((group, gi) => {
              const visibleCards = group.cards.filter(card =>
                !permissions || permissions[card.key] !== false
              );
              if (visibleCards.length === 0) return null;
              return (
              <div key={gi} style={{ marginBottom: 14 }}>
                {group.label && (
                  <div className="sans" style={{ fontSize: 11, letterSpacing: "0.1em", color: "#5C5648", fontWeight: 700, marginBottom: 8 }}>
                    {group.label.toUpperCase()}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                  {visibleCards.map(card => (
                    <Card key={card.key} card={card} onNavigate={onNavigate} onComingSoon={showComingSoon} />
                  ))}
                </div>
              </div>
              );
            })}
          </div>
          );
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div className="sans" style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: NAVY, color: GOLD_SOFT, border: `1px solid ${GOLD}`,
          padding: "10px 20px", fontSize: 12, fontWeight: 600, letterSpacing: "0.04em",
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)", zIndex: 200
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
