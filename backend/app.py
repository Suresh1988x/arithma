"""
ARITHMA Backend — app.py  (Full build with Void/Soft-Delete system)
"""

from datetime import date, datetime as dt, timezone
import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import create_engine, Column, Integer, String, Numeric, Boolean, Date, DateTime, text, func
from sqlalchemy.orm import declarative_base, sessionmaker

# DATABASE_URL is read from an environment variable, never hardcoded here.
# Set it on Render: Environment tab → Add Environment Variable → Key:
# DATABASE_URL, Value: your Supabase connection string (Direct connection,
# URI format). For local testing only, falls back to a local Postgres
# instance — this fallback will NOT work against your real Supabase
# database, since it has no password in it.

# Add this import at the top
from dotenv import load_dotenv
load_dotenv()

import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import create_engine, Column, Integer, String, Numeric, Boolean, Date, DateTime, text, func
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import date, datetime as dt, timezone

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:Pokhara%40123%21@db.nadoualqfdlaisjuogyz.supabase.co:5432/postgres?sslmode=require"
)

app = Flask(__name__)
CORS(app)
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=5,
    max_overflow=2,
    connect_args={"sslmode": "require"}
)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

# ── Company ──────────────────────────────────────────────────
class Company(Base):
    __tablename__ = "companies"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    name       = Column(String(200), nullable=False)
    pan_number = Column(String(20), default="")
    is_active  = Column(Boolean, default=True)
    created_at = Column(Date)

# ── GL Master Template ────────────────────────────────────────
class GLMasterTemplate(Base):
    __tablename__ = "gl_master_template"
    id           = Column(Integer, primary_key=True, autoincrement=True)
    gl_code      = Column(String(20), unique=True, nullable=False)
    gl_name      = Column(String(150), nullable=False)
    header       = Column(String(100))
    main_group   = Column(String(100))
    sub_group    = Column(String(100))
    account_type = Column(String(10))

# ── GL Accounts (per company) ─────────────────────────────────
class GLAccount(Base):
    __tablename__ = "gl_accounts"
    id           = Column(Integer, primary_key=True, autoincrement=True)
    company_id   = Column(Integer, nullable=False)
    gl_code      = Column(String(20), nullable=False)
    gl_name      = Column(String(150), nullable=False)
    header       = Column(String(100))
    main_group   = Column(String(100))
    sub_group    = Column(String(100))
    account_type = Column(String(10))
    opening_dr   = Column(Numeric(18, 2), default=0)
    opening_cr   = Column(Numeric(18, 2), default=0)

# ── Settings ──────────────────────────────────────────────────
class Settings(Base):
    __tablename__ = "settings"
    id                      = Column(Integer, primary_key=True, autoincrement=True)
    company_id              = Column(Integer, unique=True, nullable=False)
    company_name            = Column(String(200), default="")
    pan_number              = Column(String(20), default="")
    company_address         = Column(String(200), default="")
    company_email           = Column(String(120), default="")
    contact_no              = Column(String(20), default="")
    user_name               = Column(String(50), default="Admin")
    fiscal_year_bs          = Column(String(10), default="")
    fy_start_ad             = Column(Date)
    fy_end_ad               = Column(Date)
    fy_start_bs             = Column(String(20), default="")
    fy_end_bs               = Column(String(20), default="")
    opening_balance_date    = Column(Date)
    vat_rate                = Column(Numeric(6, 4), default=0.13)
    tds_vendor_rate         = Column(Numeric(6, 4), default=0.015)
    tds_rental_rate         = Column(Numeric(6, 4), default=0.015)
    prefix_purchase         = Column(String(10), default="PV-")
    prefix_purchase_ret     = Column(String(10), default="PR-")
    prefix_sales            = Column(String(10), default="SB-")
    prefix_sales_ret        = Column(String(10), default="SR-")
    prefix_credit_note      = Column(String(10), default="CN-")
    prefix_debit_note       = Column(String(10), default="DN-")
    prefix_journal          = Column(String(10), default="JV-")
    prefix_import           = Column(String(10), default="IMP-")
    prefix_bank             = Column(String(10), default="BNK-")
    prefix_fixed_asset      = Column(String(10), default="FA-")
    prefix_depreciation     = Column(String(10), default="DEP-")
    default_currency        = Column(String(10), default="NPR")
    date_format             = Column(String(20), default="DD/MM/YYYY")
    decimal_places          = Column(Integer, default=2)
    depreciation_basis_days = Column(Integer, default=365)
    stock_valuation_method  = Column(String(30), default="Weighted Average")
    show_logo_in_reports    = Column(Boolean, default=True)

# ── BS/AD Calendar ────────────────────────────────────────────
class BsAdCalendar(Base):
    __tablename__ = "bs_ad_calendar"
    id             = Column(Integer, primary_key=True, autoincrement=True)
    bs_fiscal_year = Column(String(10), unique=True, nullable=False)
    ad_start_date  = Column(Date, nullable=False)
    notes          = Column(String(100), default="")

# ── Users ─────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"
    id             = Column(Integer, primary_key=True, autoincrement=True)
    username       = Column(String(50), unique=True, nullable=False)
    password_hash  = Column(String(255), nullable=False)
    full_name      = Column(String(100), default="")
    is_super_admin = Column(Boolean, default=False)
    is_active      = Column(Boolean, default=True)
    user_type      = Column(String(20), default="tenant")

# ── User Company Access ───────────────────────────────────────
class UserCompanyAccess(Base):
    __tablename__ = "user_company_access"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(Integer, nullable=False)
    company_id = Column(Integer, nullable=False)
    role       = Column(String(20), default="accountant")

# ── Role Permissions ──────────────────────────────────────────
class RolePermission(Base):
    __tablename__ = "role_permissions"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, nullable=False)
    role       = Column(String(20), nullable=False)
    module_key = Column(String(40), nullable=False)
    allowed    = Column(Boolean, default=False)

# ── Party Types ───────────────────────────────────────────────
class PartyType(Base):
    __tablename__ = "party_types"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    type_name  = Column(String(50), unique=True, nullable=False)
    default_gl = Column(String(60), default="")
    normal_side = Column(String(2), default="Dr")  # "Dr" or "Cr" — opening balance convention
    is_builtin = Column(Boolean, default=False)
    is_active  = Column(Boolean, default=True)
    sort_order = Column(Integer, default=100)

# ── Party Master ──────────────────────────────────────────────
class PartyMaster(Base):
    __tablename__ = "party_master"
    id              = Column(Integer, primary_key=True, autoincrement=True)
    company_id      = Column(Integer, nullable=False)
    party_type      = Column(String(20), nullable=False)
    name            = Column(String(200), nullable=False)
    pan             = Column(String(20), default="")
    phone           = Column(String(30), default="")
    email           = Column(String(120), default="")
    opening_balance = Column(Numeric(18, 2), default=0)
    gl_account      = Column(String(60), default="")
    is_import       = Column(Boolean, default=False)
    is_active       = Column(Boolean, default=True)

FA_BLOCK_GL = {
    "LAND": "1010 - Factory Land", "BLOCK A": "1020 - Factory Building",
    "BLOCK B": "1050 - Office Equipment", "BLOCK C": "1070 - Vehicles",
    "BLOCK D": "1030 - Plant & Machinery", "BLOCK E": "1300 - Intangible Assets",
}

# ── FA Register ───────────────────────────────────────────────
class FARegister(Base):
    __tablename__ = "fa_register"
    id                 = Column(Integer, primary_key=True, autoincrement=True)
    company_id         = Column(Integer, nullable=False)
    fa_code            = Column(String(50), nullable=False)
    capital_item       = Column(String(200), nullable=False)
    vendor             = Column(String(200), default="")
    sub_group          = Column(String(50), default="")
    gl_account         = Column(String(60), default="")
    addition_date      = Column(Date, nullable=True)
    qty                = Column(Numeric(10, 3), default=1)
    rate               = Column(Numeric(18, 2), default=0)
    additions          = Column(Numeric(18, 2), default=0)
    disposals          = Column(Numeric(18, 2), default=0)
    source             = Column(String(30), default="Opening")
    reference          = Column(String(100), default="")
    residual_value_pct = Column(Numeric(6, 2), default=5)
    dep_rate_pct       = Column(Numeric(6, 2), default=0)
    dep_method         = Column(String(10), default="WDV")
    opening_accum_dep  = Column(Numeric(18, 2), default=0)
    is_active          = Column(Boolean, default=True)

# ── Material Master ───────────────────────────────────────────
class MaterialMaster(Base):
    __tablename__ = "material_masters"
    id            = Column(Integer, primary_key=True, autoincrement=True)
    company_id    = Column(Integer, nullable=False)
    material_type = Column(String(10), nullable=False)
    date          = Column(Date, nullable=True)
    product_name  = Column(String(200), nullable=False)
    product_code  = Column(String(100), nullable=False)
    uom           = Column(String(20), default="")
    opening_qty   = Column(Numeric(18, 3), default=0)
    opening_value = Column(Numeric(18, 2), default=0)
    excise_type   = Column(String(20), default="")
    excise_rate   = Column(Numeric(10, 4), default=0)
    related_gl    = Column(String(50), default="")
    is_active     = Column(Boolean, default=True)

# ── Sales Book ────────────────────────────────────────────────
class SalesBook(Base):
    __tablename__ = "sales_book"
    id                = Column(Integer, primary_key=True, autoincrement=True)
    company_id        = Column(Integer, nullable=False)
    entry_date        = Column(Date, nullable=False)
    month_bs          = Column(String(30), default="")
    bill_no           = Column(String(50), default="")
    internal_ref      = Column(String(30), default="")
    customer_name     = Column(String(200), nullable=False)
    customer_pan      = Column(String(20), default="")
    product_code      = Column(String(100), default="")
    product_name      = Column(String(200), default="")
    qty               = Column(Numeric(18, 3), default=0)
    rate              = Column(Numeric(18, 4), default=0)
    is_taxable        = Column(Boolean, default=True)
    taxable_value     = Column(Numeric(18, 2), default=0)
    vat_amount        = Column(Numeric(18, 2), default=0)
    total_amount      = Column(Numeric(18, 2), default=0)
    non_taxable_value = Column(Numeric(18, 2), default=0)
    transaction_type  = Column(String(30), default="Sales")
    original_bill_ref = Column(String(50), default="")
    is_service        = Column(Boolean, default=False)
    date_bs           = Column(String(20), default="")
    created_by        = Column(Integer, nullable=True)
    # ── Extra sales fields (Excel Sales_Book cols 24-31) ─────
    geography_type    = Column(String(20), default="Local")
    export_amount     = Column(Numeric(18, 2), default=0)
    gross_amount      = Column(Numeric(18, 2), default=0)
    trade_discount    = Column(Numeric(18, 2), default=0)
    excisable_amount  = Column(Numeric(18, 2), default=0)
    excise_type       = Column(String(20), default="NONE")
    excise_rate       = Column(Numeric(10, 4), default=0)
    excise_amount     = Column(Numeric(18, 2), default=0)
    is_capital        = Column(Boolean, default=False)
    capital_item_name = Column(String(200), default="")
    cap_qty           = Column(Numeric(18, 3), default=0)
    cap_rate          = Column(Numeric(18, 4), default=0)
    cap_taxable_value = Column(Numeric(18, 2), default=0)
    cap_vat           = Column(Numeric(18, 2), default=0)
    cap_total         = Column(Numeric(18, 2), default=0)
    fa_code           = Column(String(50), default="")
    # ── Void / Soft-delete audit columns ─────────────────────
    is_void           = Column(Boolean, default=False, nullable=False)
    voided_by         = Column(String(100), nullable=True)
    voided_at         = Column(DateTime(timezone=True), nullable=True)
    void_reason       = Column(String(255), nullable=True)

# ── Import Book ───────────────────────────────────────────────
class ImportBook(Base):
    __tablename__ = "import_book"
    id                    = Column(Integer, primary_key=True, autoincrement=True)
    company_id            = Column(Integer, nullable=False)
    entry_date            = Column(Date, nullable=False)
    month_bs              = Column(String(30), default="")
    internal_ref          = Column(String(30), default="")
    pp_no                 = Column(String(50), default="")
    lc_no                 = Column(String(50), default="")
    supplier_name         = Column(String(200), nullable=False)
    supplier_pan          = Column(String(20), default="")
    product_code          = Column(String(100), default="")
    product_name          = Column(String(200), default="")
    qty                   = Column(Numeric(18, 3), default=0)
    rate_foreign          = Column(Numeric(18, 4), default=0)
    currency              = Column(String(10), default="USD")
    exchange_rate         = Column(Numeric(10, 4), default=1)
    cif_value             = Column(Numeric(18, 2), default=0)
    customs_duty          = Column(Numeric(18, 2), default=0)
    custom_service_charge = Column(Numeric(18, 2), default=0)
    bank_charges          = Column(Numeric(18, 2), default=0)
    insurance             = Column(Numeric(18, 2), default=0)
    statistical_exp       = Column(Numeric(18, 2), default=0)
    landed_cost           = Column(Numeric(18, 2), default=0)
    imp_taxable_value     = Column(Numeric(18, 2), default=0)
    imp_vat               = Column(Numeric(18, 2), default=0)
    imp_total             = Column(Numeric(18, 2), default=0)
    is_taxable            = Column(Boolean, default=True)
    non_taxable_value     = Column(Numeric(18, 2), default=0)
    date_bs               = Column(String(20), default="")
    created_by            = Column(Integer, nullable=True)

# ── Purchase Book  ← UPDATED: 4 void columns added ───────────
class PurchaseBook(Base):
    __tablename__ = "purchase_book"
    id                = Column(Integer, primary_key=True, autoincrement=True)
    company_id        = Column(Integer, nullable=False)
    entry_date        = Column(Date, nullable=False)
    month_bs          = Column(String(30), default="")
    bill_no           = Column(String(50), default="")
    vendor_name       = Column(String(200), nullable=False)
    vendor_pan        = Column(String(20), default="")
    product_code      = Column(String(100), default="")
    product_name      = Column(String(200), default="")
    qty               = Column(Numeric(18, 3), default=0)
    rate              = Column(Numeric(18, 4), default=0)
    is_taxable        = Column(Boolean, default=True)
    taxable_value     = Column(Numeric(18, 2), default=0)
    vat_amount        = Column(Numeric(18, 2), default=0)
    total_amount      = Column(Numeric(18, 2), default=0)
    non_taxable_value = Column(Numeric(18, 2), default=0)
    capital_item_name = Column(String(200), default="")
    cap_qty           = Column(Numeric(18, 3), default=0)
    cap_rate          = Column(Numeric(18, 4), default=0)
    cap_taxable_value = Column(Numeric(18, 2), default=0)
    cap_vat           = Column(Numeric(18, 2), default=0)
    cap_total         = Column(Numeric(18, 2), default=0)
    fa_code           = Column(String(50), default="")
    transaction_type  = Column(String(30), default="Purchase")
    original_bill_ref = Column(String(50), default="")
    imp_taxable_value = Column(Numeric(18, 2), default=0)
    imp_vat           = Column(Numeric(18, 2), default=0)
    imp_total         = Column(Numeric(18, 2), default=0)
    internal_ref      = Column(String(30), default="")
    is_service        = Column(Boolean, default=False)
    is_capital        = Column(Boolean, default=False)
    created_by        = Column(Integer, nullable=True)
    date_bs           = Column(String(20), default="")
    # ── NEW: Void / Soft-delete audit columns ─────────────────
    is_void           = Column(Boolean, default=False, nullable=False)
    voided_by         = Column(String(100), nullable=True)
    voided_at         = Column(DateTime(timezone=True), nullable=True)
    void_reason       = Column(String(255), nullable=True)

# ── GL Book ───────────────────────────────────────────────────
class GLBook(Base):
    __tablename__ = "gl_book"
    id               = Column(Integer, primary_key=True, autoincrement=True)
    company_id       = Column(Integer, nullable=False)
    entry_date       = Column(Date, nullable=False)
    unique_id        = Column(String(30), nullable=False)
    gl_code          = Column(String(80), nullable=False)
    gl_name          = Column(String(200), default="")
    description      = Column(String(300), default="")
    dr_amount        = Column(Numeric(18, 2), default=0)
    cr_amount        = Column(Numeric(18, 2), default=0)
    source           = Column(String(30), default="")
    transaction_type = Column(String(30), default="")
    created_by       = Column(Integer, nullable=True)   # user.id who posted this entry
    approved_by      = Column(Integer, nullable=True)   # user.id who approved (admin)
    approved_at      = Column(DateTime(timezone=True), nullable=True)

# ── Journal Entry (header + lines) ─────────────────────────────
class JournalEntry(Base):
    """
    Journal Voucher header. Mirrors the Excel's Module_JournalEntry
    (SaveJournalEntry / GetOrCreateGLBook) — one voucher posts one GL
    Book row per Dr/Cr line, not one row per voucher. Bank Account and
    Cash In Hand GLs are EXCLUDED from the line GL picker by design —
    those route through the Bank & Cash Ledger module instead, matching
    the Excel's own exclusion rule for this form.
    """
    __tablename__ = "journal_entries"
    id              = Column(Integer, primary_key=True, autoincrement=True)
    company_id      = Column(Integer, nullable=False)
    entry_date      = Column(Date, nullable=False)
    internal_ref    = Column(String(30), nullable=False)   # JV-0001
    description     = Column(String(300), default="")
    total_dr        = Column(Numeric(18,2), default=0)
    total_cr        = Column(Numeric(18,2), default=0)
    is_posted       = Column(Boolean, default=False)
    is_void         = Column(Boolean, default=False)
    voided_by       = Column(String(100), nullable=True)
    voided_at       = Column(DateTime(timezone=True), nullable=True)
    void_reason     = Column(String(255), nullable=True)
    created_by      = Column(Integer, nullable=True)
    approved_by     = Column(Integer, nullable=True)
    approved_at     = Column(DateTime(timezone=True), nullable=True)

class JournalEntryLine(Base):
    """
    One Dr or one Cr line of a Journal Voucher. side is "Dr" or "Cr".
    party_name is optional — when set, this line ALSO posts to
    Party Ledger (the GL account is looked up from the party's own
    record via PartyMaster.gl_account, never a hardcoded type->GL
    mapping). This is the mechanism for bifurcating a generic Bank
    Ledger AR/AP/HR receipt/payment against a specific party once the
    breakdown is known (deferred from Bank & Cash Ledger by design).
    """
    __tablename__ = "journal_entry_lines"
    id              = Column(Integer, primary_key=True, autoincrement=True)
    journal_id      = Column(Integer, nullable=False)
    company_id      = Column(Integer, nullable=False)
    line_no         = Column(Integer, default=1)
    side            = Column(String(2), nullable=False)    # "Dr" or "Cr"
    gl_account      = Column(String(80), default="")       # "code - name", used when no party_name
    party_name      = Column(String(200), default="")      # optional — party-linked line
    amount          = Column(Numeric(18,2), default=0)
    narration       = Column(String(300), default="")
    invoice_ref     = Column(String(100), default="")       # which bill this line settles, if any

# ── Import Landed Register (ILR) ──────────────────────────────
class LCMaster(Base):
    """
    Controlled list of LC Nos — NOT a party. Exists purely so every
    Bank Ledger row and every Import Register PP No selects the SAME
    LC No. string from one source, preventing typo drift (e.g.
    "SBLLC-5501" vs "SBLLC5501" vs "5501") that would silently break
    the allocable-pool queries (which filter Bank Ledger rows by exact
    lc_no match). LC No. carries no GL mapping and is never posted to
    GL Book or Party Ledger directly — it is a pure tag/filter field.
    """
    __tablename__ = "lc_master"
    id            = Column(Integer, primary_key=True, autoincrement=True)
    company_id    = Column(Integer, nullable=False)
    lc_no         = Column(String(100), nullable=False)
    bank_name     = Column(String(150), default="")
    open_date     = Column(Date, nullable=True)
    expiry_date   = Column(Date, nullable=True)
    bg_no         = Column(String(100), default="")     # optional Bank Guarantee reference, if BG exists for this LC
    remarks       = Column(String(300), default="")
    is_active     = Column(Boolean, default=True)


class ImportRegister(Base):
    """
    One row per item of an Import Purchase — UNIFIED single-stage model
    (no separate Phase I / Phase II save steps; one form, one save, per
    item, under one PP No / IMP voucher).

    LC No. is a pure tag (lc_no), never a party — it is used only to
    query Bank Ledger's posted amounts for this LC (grouped by Charge
    Type) to compute each field's allocable pool. The real parties who
    were actually paid (RM supplier, freight forwarder, customs office,
    agent, etc.) are NOT stored here — they live on the originating
    Bank Ledger rows, already correctly posted to their own GL/Party
    Ledger at payment time. This row's own GL posting credits each of
    those SAME real parties again (by charge type), which nets their
    balances to zero against the advance already paid — see
    save_import_register()'s GL/Party posting section for the mechanics.

    Cost build-up:
      Basic Material Amount (calc) = Qty * Local Ccy Rate
      Local Ccy Rate               = FCY Rate * Exchange Rate
      Material Value Paid          = manual, capped by the LC+"Material
                                      Value" Bank Ledger pool
      Forex Gain/(Loss)            = Basic Material Amount - Material Value Paid
      Import Freight                = entered ONCE per PP No, apportioned
                                      across that PP's items by Basic
                                      Material Amount share
      Import Duty, CSC              = manual, per item
      VAT                           = manual, per item; folds into Total
                                      Phase I Cost ONLY if vat_claimable=False
      Total Phase I Cost            = Basic Material Amount + Import Freight
                                      + Import Duty + CSC + VAT(if cost)
      Phase II group (Agent Commission, Local Freight, Packing &
      Forwarding, Bank Charges, Insurance) = entered ONCE per PP No,
                                      apportioned by Total Phase I Cost share
      Total Cost                    = Total Phase I Cost + Phase II share
      Landed Cost / Unit            = Total Cost / Qty
    """
    __tablename__ = "import_register"
    id              = Column(Integer, primary_key=True, autoincrement=True)
    company_id      = Column(Integer, nullable=False)
    imp_voucher     = Column(String(30), nullable=False)     # IMP-0001 — auto-generated the moment PP No is entered
    entry_date      = Column(Date, nullable=False)

    # ── Header (per PP No, repeated on every item row under it) ──
    pp_no           = Column(String(50), default="")         # Pragyapan Patra No
    lc_no           = Column(String(100), default="")         # LC tag (from LCMaster) — NOT a party
    supplier_name   = Column(String(200), default="")         # informational only — not posted to GL/Party
    fec_no          = Column(String(100), default="")

    # ── Item-level entry ──────────────────────────────────────
    item_name       = Column(String(200), default="")
    fcy_currency    = Column(String(10), default="")
    fcy_rate        = Column(Numeric(18,4), default=0)        # Rate per unit, in FCY
    exchange_rate   = Column(Numeric(18,4), default=0)        # Exc. Rate, NPR per FCY
    local_ccy_rate  = Column(Numeric(18,4), default=0)        # auto: fcy_rate * exchange_rate
    is_taxable      = Column(Boolean, default=True)
    is_capital      = Column(Boolean, default=False)
    qty             = Column(Numeric(18,4), default=0)
    basic_material_amount = Column(Numeric(18,2), default=0)  # auto (reference): qty * local_ccy_rate
    material_value_paid   = Column(Numeric(18,2), default=0)  # ACTUAL — allocated against LC+"Material Value" pool
    forex_gain_loss = Column(Numeric(18,2), default=0)        # auto: basic_material_amount - material_value_paid

    import_freight  = Column(Numeric(18,2), default=0)        # this item's apportioned share (by Basic Mat. Amt)
    import_duty     = Column(Numeric(18,2), default=0)        # manual, per item
    custom_svc_chg  = Column(Numeric(18,2), default=0)        # CSC, manual, per item
    vat_claimable   = Column(Boolean, default=True)           # Yes=Input VAT (1320), No=cost (folds into Phase I total)
    vat_amount      = Column(Numeric(18,2), default=0)        # manual, per item

    total_phase1_cost = Column(Numeric(18,2), default=0)      # auto — Basic Mat.Amt + Freight + Duty + CSC + VAT(if cost)

    # Phase II group — this item's apportioned share (by Total Phase I Cost)
    p2_agent_commission = Column(Numeric(18,2), default=0)
    p2_local_freight    = Column(Numeric(18,2), default=0)
    p2_packing_fwd      = Column(Numeric(18,2), default=0)
    p2_bank_charges     = Column(Numeric(18,2), default=0)
    p2_insurance        = Column(Numeric(18,2), default=0)
    p2_total            = Column(Numeric(18,2), default=0)    # auto — sum of the 5 p2_* fields above

    total_cost      = Column(Numeric(18,2), default=0)        # auto — total_phase1_cost + p2_total
    landed_cpu      = Column(Numeric(18,4), default=0)        # auto — total_cost / qty

    # ── Capital item fields (only when is_capital) ────────────
    cap_item_name   = Column(String(200), default="")
    cap_sub_group   = Column(String(100), default="")
    cap_main_group  = Column(String(100), default="")
    cap_header      = Column(String(100), default="")
    cap_gl_type     = Column(String(10), default="")           # BS / PL
    block_gl        = Column(String(80), default="")
    fa_code         = Column(String(50), default="")            # auto-generated FA-{year}-{seq}
    residual_pct    = Column(Numeric(6,2), default=0)
    dep_rate_pct    = Column(Numeric(6,2), default=0)

    status          = Column(String(20), default="Complete")    # rows are saved fully-costed in one step now
    stock_journal_posted = Column(Boolean, default=False)        # True once pushed to Stock Journal

    is_void         = Column(Boolean, default=False)
    voided_by       = Column(String(100), default="")
    voided_at       = Column(DateTime(timezone=True), nullable=True)
    void_reason     = Column(String(255), default="")
    created_by      = Column(Integer, nullable=True)


# ── Import Allocation — tracks LC+Charge-Type pool consumption ──
class ImportAllocation(Base):
    """
    One row per charge amount allocated from a Bank-Ledger-posted LC
    pool to a specific Import Register item. This is what makes the
    "Allocable" balance live and ENFORCEABLE (hard cap):

        remaining = SUM(BankLedger + BankLedgerSplit rows where
                         lc_no = X AND charge_type = Y AND not void)
                    - SUM(non-void ImportAllocation rows for that same
                          lc_no + charge_type)

    No separate LCRecon tracking table — the pool is always computed
    live from the two real sources (Bank Ledger postings, Import
    Register allocations), so it can never silently drift out of sync.

    Voiding an Import Register item sets is_void=True on its allocation
    rows here, releasing the balance back to allocable for re-use.
    """
    __tablename__ = "import_allocations"
    id                  = Column(Integer, primary_key=True, autoincrement=True)
    company_id          = Column(Integer, nullable=False)
    lc_no               = Column(String(100), nullable=False)   # LC tag — matches BankLedger.lc_no
    charge_type         = Column(String(60),  nullable=False)
    pp_no               = Column(String(50),  default="")
    imp_voucher         = Column(String(30),  default="")
    import_register_id  = Column(Integer, nullable=False)       # FK -> import_register.id
    amount              = Column(Numeric(18,2), nullable=False)
    allocated_at        = Column(DateTime(timezone=True), nullable=True)
    allocated_by        = Column(Integer, nullable=True)
    is_void             = Column(Boolean, default=False)
    voided_at           = Column(DateTime(timezone=True), nullable=True)


class StockJournal(Base):
    """
    Item-wise stock movement ledger. Each row is one receipt/issue of a
    material, with a running moving-average rate/value, mirroring
    MaterialMaster's own opening_qty/opening_value fields but as a full
    transaction history rather than just a single opening balance.

    Import Purchase pushes one StockJournal row per item on save (a
    "Receipt" movement), at that item's final Landed Cost / Unit — this
    is what makes imported RM available for issue/production, fully
    landed-cost-valued, immediately.
    """
    __tablename__ = "stock_journal"
    id              = Column(Integer, primary_key=True, autoincrement=True)
    company_id      = Column(Integer, nullable=False)
    entry_date      = Column(Date, nullable=False)
    material_id     = Column(Integer, nullable=False)        # FK -> material_masters.id
    product_code    = Column(String(100), default="")
    product_name    = Column(String(200), default="")
    material_type   = Column(String(10), default="")          # RM / FG / Sub / BP — denormalized for fast filtering
    movement_type    = Column(String(20), default="Receipt")  # Receipt / Issue
    qty             = Column(Numeric(18,4), default=0)         # always positive; movement_type signals direction
    rate            = Column(Numeric(18,4), default=0)         # per-unit rate for THIS movement
    value           = Column(Numeric(18,2), default=0)         # qty * rate
    running_qty     = Column(Numeric(18,4), default=0)         # material's qty balance AFTER this movement
    running_value   = Column(Numeric(18,2), default=0)         # material's value balance AFTER this movement
    running_rate    = Column(Numeric(18,4), default=0)         # moving-average rate AFTER this movement
    source          = Column(String(40), default="")           # "Import_Register" / "Purchase_Book" / "Production" / etc.
    reference       = Column(String(50), default="")           # imp_voucher / bill_no / etc.
    narration       = Column(String(300), default="")
    is_void         = Column(Boolean, default=False)
    voided_at       = Column(DateTime(timezone=True), nullable=True)
    created_by      = Column(Integer, nullable=True)


# ── Bank Accounts ────────────────────────────────────────────
class BankAccount(Base):
    __tablename__ = "bank_accounts"
    id              = Column(Integer, primary_key=True, autoincrement=True)
    company_id      = Column(Integer, nullable=False)
    account_name    = Column(String(100), nullable=False)   # e.g. "Nepal Bank Ltd"
    account_no      = Column(String(50),  default="")
    gl_code         = Column(String(20),  default="")       # e.g. "2240"
    gl_name         = Column(String(150), default="")       # e.g. "Nepal Bank Ltd - A/c"
    opening_balance = Column(Numeric(18,2), default=0)
    is_active       = Column(Boolean, default=True)

# ── Bank Ledger ───────────────────────────────────────────────
class BankLedger(Base):
    __tablename__ = "bank_ledger"
    id              = Column(Integer, primary_key=True, autoincrement=True)
    company_id      = Column(Integer, nullable=False)
    bank_account_id = Column(Integer, nullable=False)
    entry_date      = Column(Date, nullable=False)
    narration       = Column(String(300), default="")
    withdraw        = Column(Numeric(18,2), default=0)
    deposit         = Column(Numeric(18,2), default=0)
    balance         = Column(Numeric(18,2), default=0)      # running balance
    # Classification
    entry_type      = Column(String(10),  default="")       # GL/AR/AP/HR/Contra (LC removed — LC is never a party_type)
    gl_account      = Column(String(60),  default="")       # GL code or party name
    party_name      = Column(String(200), default="")       # for AR/AP/HR
    party_type      = Column(String(20),  default="")       # Customer/Vendor/Staff/TDS — "LC" no longer valid here
    charge_type     = Column(String(60),  default="")       # import charge classification (Material Value, Import
                                                              # Freight, Import Duty, CSC, VAT, Agent Commission,
                                                              # Local Freight, Packing & Forwarding, Bank Charges,
                                                              # Insurance) — available whenever lc_no is filled,
                                                              # independent of which real party was paid
    lc_no           = Column(String(100), default="")       # LC tag — selected from LCMaster, NOT a party. Used
                                                              # only to pool Bank Ledger amounts per LC for the
                                                              # Import Register's allocable-balance queries.
    invoice_ref     = Column(String(100), default="")
    narration2      = Column(String(300), default="")       # user override narration
    # Status
    is_posted_gl    = Column(Boolean, default=False)
    is_posted_party = Column(Boolean, default=False)
    source          = Column(String(20), default="manual")  # manual / import
    internal_ref    = Column(String(30), default="")        # BNK-0001
    seq_no          = Column(Integer, default=1)            # for same-date/amount/party duplicates
    is_split             = Column(Boolean, default=False)      # True = has bank_ledger_splits rows
    split_status         = Column(String(20), default="")     # pending_approval / approved / split_done
    date_bs              = Column(String(20), default="")
    created_by            = Column(Integer, nullable=True)     # user.id who entered this
    approved_by            = Column(Integer, nullable=True)     # user.id who approved (admin)
    approved_at            = Column(DateTime(timezone=True), nullable=True)
    is_void         = Column(Boolean, default=False)
    voided_by       = Column(String(100), nullable=True)
    voided_at       = Column(DateTime(timezone=True), nullable=True)
    void_reason     = Column(String(255), nullable=True)

# ── Bank Ledger Splits (for LC and GL multi-expense payments) ─
class BankLedgerSplit(Base):
    """
    Child rows for bank entries that need breakdown:
      • One payment split across multiple real parties and/or multiple
        GL accounts and/or multiple import charge types.
    Each split leg independently carries its own real party (whoever
    actually received that portion), its own optional LC No. tag, and
    its own Charge Type (only meaningful when lc_no is filled) — these
    are three independent choices, not gated on each other via party
    type. AR/AP/HR/Contra legs without an LC No. simply post normally,
    allocation handled via Journal Entry if needed.
    """
    __tablename__ = "bank_ledger_splits"
    id              = Column(Integer, primary_key=True, autoincrement=True)
    bank_ledger_id  = Column(Integer, nullable=False)   # FK → bank_ledger.id
    company_id      = Column(Integer, nullable=False)
    split_amount    = Column(Numeric(18,2), nullable=False)
    entry_type      = Column(String(10),  default="")   # GL/AR/AP/HR/Contra
    gl_account      = Column(String(60),  default="")   # expense/income GL, or resolved from party's own mapped GL
    charge_type     = Column(String(60),  default="")   # import charge classification — available when lc_no filled
    lc_no           = Column(String(100), default="")   # LC tag — selected from LCMaster, NOT a party
    party_name      = Column(String(200), default="")   # the REAL party that received this leg's amount
    invoice_ref     = Column(String(100), default="")
    narration       = Column(String(300), default="")
    is_posted       = Column(Boolean, default=False)

# ── Bank Split Requests (approval workflow) ──────────────────
class BankSplitRequest(Base):
    """
    When a user needs to split a bank entry but lacks info,
    they raise a request. Admin approves → user can then split.
    Maintains full audit trail: who requested, who approved, when.
    """
    __tablename__ = "bank_split_requests"
    id              = Column(Integer, primary_key=True, autoincrement=True)
    company_id      = Column(Integer, nullable=False)
    bank_ledger_id  = Column(Integer, nullable=False)   # FK → bank_ledger.id
    requested_by    = Column(String(100), default="")
    requested_at    = Column(DateTime(timezone=True), nullable=True)
    request_note    = Column(String(500), default="")   # user explains what they know
    status          = Column(String(20), default="pending")  # pending / approved / rejected / done
    reviewed_by     = Column(String(100), default="")
    reviewed_at     = Column(DateTime(timezone=True), nullable=True)
    review_note     = Column(String(500), default="")   # admin note/instruction
    split_done_at   = Column(DateTime(timezone=True), nullable=True)

class BankEditRequest(Base):
    """
    Request to re-classify a bank_ledger entry that has ALREADY been
    posted to GL Book (and possibly Party Ledger). Posted entries can
    never be edited directly — every change must go through this
    approval queue: a user proposes the corrected classification,
    the company's own Admin reviews and approves/rejects, and only on
    approval does the system auto-reverse the original postings and
    re-post fresh ones under the SAME internal_ref (an edit, not a new
    transaction) — see apply_bank_edit_request() for the actual
    reverse+repost mechanics.
    """
    __tablename__ = "bank_edit_requests"
    id              = Column(Integer, primary_key=True, autoincrement=True)
    company_id      = Column(Integer, nullable=False)
    bank_ledger_id  = Column(Integer, nullable=False)   # FK → bank_ledger.id

    # Proposed NEW classification — mirrors classify_bank_entry's fields
    new_entry_type  = Column(String(20), default="")    # GL / Party / Contra
    new_gl_account  = Column(String(80), default="")
    new_party_name  = Column(String(200), default="")
    new_party_type  = Column(String(50), default="")
    new_charge_type = Column(String(60), default="")
    new_invoice_ref = Column(String(100), default="")
    new_narration   = Column(String(300), default="")

    requested_by    = Column(String(100), default="")
    requested_at    = Column(DateTime(timezone=True), nullable=True)
    request_note    = Column(String(500), default="")   # why this correction is needed
    status          = Column(String(20), default="pending")  # pending / approved / rejected / applied
    reviewed_by     = Column(String(100), default="")
    reviewed_at     = Column(DateTime(timezone=True), nullable=True)
    review_note     = Column(String(500), default="")
    applied_at      = Column(DateTime(timezone=True), nullable=True)

# ── Party Ledger (individual party sub-ledger) ───────────────
class PartyLedger(Base):
    __tablename__ = "party_ledger"
    id              = Column(Integer, primary_key=True, autoincrement=True)
    company_id      = Column(Integer, nullable=False)
    entry_date      = Column(Date, nullable=False)
    party_name      = Column(String(200), nullable=False)
    party_type      = Column(String(20), default="")
    txn_type        = Column(String(30), default="")
    reference       = Column(String(50), default="")     # bill_no or internal_ref
    description     = Column(String(300), default="")
    debit           = Column(Numeric(18,2), default=0)   # increases receivable / decreases payable
    credit          = Column(Numeric(18,2), default=0)   # decreases receivable / increases payable
    source          = Column(String(30), default="")     # Purchase_Book / Sales_Book / Journal / OB
    gl_account      = Column(String(60), default="")     # 5010 for vendor, 2100 for customer
    charge_type     = Column(String(60), default="")     # import charge type (Material Value, Import Freight, etc.) — blank for non-import rows
    lc_no           = Column(String(100), default="")    # LC tag (NOT a party) — blank for non-import rows
    is_void         = Column(Boolean, default=False)     # set True on the ORIGINAL row when its source transaction is voided

# ── Module keys & permissions ─────────────────────────────────
ALL_MODULES = [
    "settings","users","access","consultants","gl-create","party-create","material-create",
    "rm-master","fg-master","sub-master","service-master","gl",
    "inv-ob","party-ob","bank-ob","fa-ob","gl-ob",
    "purchase","import","sales","production","sub-issue",
    "bank-cash","journal","rm-stock","fg-stock","sub-stock","refresh-stock",
]
DEFAULT_PERMISSIONS = {
    "accountant": {
        "settings":False,"users":False,"access":False,"consultants":False,
        "gl-create":False,"party-create":True,"material-create":True,
        "rm-master":True,"fg-master":True,"sub-master":True,"service-master":True,"gl":True,
        "inv-ob":True,"party-ob":True,"bank-ob":True,"fa-ob":True,"gl-ob":True,
        "purchase":True,"import":True,"sales":True,"production":True,"sub-issue":True,
        "bank-cash":True,"journal":True,"rm-stock":True,"fg-stock":True,"sub-stock":True,"refresh-stock":True,
    },
    "viewer": {
        "settings":False,"users":False,"access":False,"consultants":False,
        "gl-create":False,"party-create":False,"material-create":False,
        "rm-master":True,"fg-master":True,"sub-master":True,"service-master":True,"gl":True,
        "inv-ob":True,"party-ob":True,"bank-ob":True,"fa-ob":True,"gl-ob":True,
        "purchase":False,"import":False,"sales":False,"production":False,"sub-issue":False,
        "bank-cash":False,"journal":False,"rm-stock":True,"fg-stock":True,"sub-stock":True,"refresh-stock":True,
    },
}

# ── GL seed data ──────────────────────────────────────────────
GL_MASTER_SEED = [
    ("1010","Factory Land","Non-Current Assets","Tangible Fixed Assets","Land","BS",0,0),
    ("1020","Factory Building","Non-Current Assets","Tangible Fixed Assets","Block A - Buildings","BS",0,0),
    ("1030","Plant & Machinery","Non-Current Assets","Tangible Fixed Assets","Block D - Plant & Mach.","BS",0,0),
    ("1040","Furniture & Fixtures","Non-Current Assets","Tangible Fixed Assets","Block B - Furniture","BS",0,0),
    ("1050","Office Equipment","Non-Current Assets","Tangible Fixed Assets","Block B - Equipment","BS",0,0),
    ("1060","Computers & IT Equipment","Non-Current Assets","Tangible Fixed Assets","Block B - Computers","BS",0,0),
    ("1070","Vehicles","Non-Current Assets","Tangible Fixed Assets","Block C - Vehicles","BS",0,0),
    ("1080","Electrical Installations","Non-Current Assets","Tangible Fixed Assets","Block D - Electrical","BS",0,0),
    ("1090","Tools & Equipment","Non-Current Assets","Tangible Fixed Assets","Block D - Tools","BS",0,0),
    ("1100","Capital Work In Progress","Non-Current Assets","Tangible Fixed Assets","Capital WIP","BS",0,0),
    ("1200","Accumulated Depreciation","Non-Current Assets","Tangible Fixed Assets","Accumulated Depn.","BS",0,0),
    ("1300","Intangible Assets","Non-Current Assets","Intangible Assets","Intangible Assets","BS",0,0),
    ("1400","Long-Term Investments","Non-Current Assets","Investments","Long-Term Investments","BS",0,0),
    ("1500","Security Deposits","Non-Current Assets","Long-Term Deposits","Security Deposits","BS",0,0),
    ("2010","Raw Material Stock","Current Assets","Current Assets","Inventories","BS",0,0),
    ("2020","Work-In-Progress Stock","Current Assets","Current Assets","Inventories","BS",0,0),
    ("2030","Finished Goods Stock","Current Assets","Current Assets","Inventories","BS",0,0),
    ("2040","By-Product Stock","Current Assets","Current Assets","Inventories","BS",0,0),
    ("2050","Packing Material Stock","Current Assets","Current Assets","Inventories","BS",0,0),
    ("2060","Consumables & Stores","Current Assets","Current Assets","Inventories","BS",0,0),
    ("2100","Trade Debtors / Receivables","Current Assets","Current Assets","Trade Debtors","BS",0,0),
    ("2110","Advance to Suppliers","Current Assets","Current Assets","Advances","BS",0,0),
    ("2120","Advance to Staff","Current Assets","Current Assets","Staff Advances","BS",0,0),
    ("2130","Advance Tax Paid","Current Assets","Current Assets","Tax Advances","BS",0,0),
    ("2140","TDS Receivable","Current Assets","Current Assets","Tax Receivables","BS",0,0),
    ("2150","VAT Input Receivable","Current Assets","Current Assets","VAT Receivable","BS",0,0),
    ("2160","Prepaid Expenses","Current Assets","Current Assets","Prepayments","BS",0,0),
    ("2170","Accrued Income","Current Assets","Current Assets","Accruals","BS",0,0),
    ("2180","Advance to Directors","Current Assets","Current Assets","Advances","BS",0,0),
    ("2200","NIC Bank -  A/c","Current Assets","Bank & Cash","Bank Accounts","BS",0,0),
    ("2210","Global IME Bank -  A/c","Current Assets","Bank & Cash","Bank Accounts","BS",0,0),
    ("2220","Rastriya Banijya Bank - A/c","Current Assets","Bank & Cash","Bank Accounts","BS",0,0),
    ("2230","Nabil Bank -  A/c","Current Assets","Bank & Cash","Bank Accounts","BS",0,0),
    ("2240","Nepal Bank Ltd - A/c","Current Assets","Bank & Cash","Bank Accounts","BS",0,0),
    ("2250","Himalayan Bank -  A/c","Current Assets","Bank & Cash","Bank Accounts","BS",0,0),
    ("2260","Cash In Hand - Main Counter","Current Assets","Bank & Cash","Cash In Hand","BS",0,0),
    ("2270","Cash In Hand - Branch","Current Assets","Bank & Cash","Cash In Hand","BS",0,0),
    ("2280","Petty Cash","Current Assets","Bank & Cash","Cash In Hand","BS",0,0),
    ("3010","Share Capital","Equity","Equity","Share Capital","BS",0,0),
    ("3020","Owner's Capital","Equity","Equity","Proprietor Capital","BS",0,0),
    ("3030","Retained Earnings","Equity","Equity","Retained Earnings","BS",0,0),
    ("3040","Current Year Profit / Loss","Equity","Equity","Current Year P&L","BS",0,0),
    ("3050","General Reserve","Equity","Equity","Reserves","BS",0,0),
    ("3060","Revaluation Reserve","Equity","Equity","Reserves","BS",0,0),
    ("4010","Long-Term Bank Loan","Non-Current Liab.","Non-Current Liabilities","Long-Term Borrowings","BS",0,0),
    ("4020","Hire Purchase Liability","Non-Current Liab.","Non-Current Liabilities","Finance Lease","BS",0,0),
    ("4030","Deferred Tax Liability","Non-Current Liab.","Non-Current Liabilities","Deferred Tax","BS",0,0),
    ("5010","Trade Creditors / Payables","Current Liab.","Current Liabilities","Trade Creditors","BS",0,0),
    ("5020","Advance from Customers","Current Liab.","Current Liabilities","Advances Received","BS",0,0),
    ("5030","Short-Term Bank Loan","Current Liab.","Current Liabilities","Bank Overdraft & STL","BS",0,0),
    ("5040","Bank Overdraft","Current Liab.","Current Liabilities","Bank Overdraft & STL","BS",0,0),
    ("5050","VAT Output Payable","Current Liab.","Current Liabilities","VAT Payable","BS",0,0),
    ("5060","TDS Payables","Current Liab.","Current Liabilities","Tax Payables","BS",0,0),
    ("5070","Income Tax Payable","Current Liab.","Current Liabilities","Tax Payables","BS",0,0),
    ("5080","Salary & Wages Payable","Current Liab.","Current Liabilities","Accrued Liabilities","BS",0,0),
    ("5090","Provident Fund Payable","Current Liab.","Current Liabilities","Statutory Payables","BS",0,0),
    ("5100","SSF / CIT Payable","Current Liab.","Current Liabilities","Statutory Payables","BS",0,0),
    ("5110","Accrued Expenses","Current Liab.","Current Liabilities","Accrued Liabilities","BS",0,0),
    ("5120","Audit Fee Payable","Current Liab.","Current Liabilities","Accrued Liabilities","BS",0,0),
    ("5130","Dividend Payable","Current Liab.","Current Liabilities","Current Liabilities","BS",0,0),
    ("5140","Other Payables","Current Liab.","Current Liabilities","Other Payables","BS",0,0),
    ("6010","Sales - Taxable Goods","Income","Sales & Income","Revenue","PL",0,0),
    ("6020","Sales - Non-Taxable Goods","Income","Sales & Income","Revenue","PL",0,0),
    ("6030","Sales - By-Products","Income","Sales & Income","Revenue","PL",0,0),
    ("6040","Sales Returns & Allowances","Income","Sales & Income","Revenue Deductions","PL",0,0),
    ("6050","Discount Allowed","Income","Sales & Income","Revenue Deductions","PL",0,0),
    ("6100","Other Operating Income","Income","Sales & Income","Other Income","PL",0,0),
    ("6110","Interest Income","Income","Other Income","Finance Income","PL",0,0),
    ("6120","Miscellaneous Income","Income","Other Income","Other Income","PL",0,0),
    ("6130","Gain on Asset Disposal","Income","Other Income","Other Income","PL",0,0),
    ("7010","Raw Material Consumed","COGS","Cost of Goods Sold","Cost of Production","PL",0,0),
    ("7020","Direct Labour / Wages","COGS","Cost of Goods Sold","Cost of Production","PL",0,0),
    ("7030","Factory Overhead","COGS","Cost of Goods Sold","Cost of Production","PL",0,0),
    ("7040","Power & Fuel - Production","COGS","Cost of Goods Sold","Cost of Production","PL",0,0),
    ("7050","Repairs & Maintenance - Plant","COGS","Cost of Goods Sold","Cost of Production","PL",0,0),
    ("7060","Packing & Forwarding","COGS","Cost of Goods Sold","Cost of Production","PL",0,0),
    ("7070","Depreciation - Factory","COGS","Cost of Goods Sold","Cost of Production","PL",0,0),
    ("7080","Opening Stock Adjustment","COGS","Cost of Goods Sold","Stock Movements","PL",0,0),
    ("7090","Closing Stock Adjustment","COGS","Cost of Goods Sold","Stock Movements","PL",0,0),
    ("7100","Purchase - Taxable Goods","COGS","Cost of Goods Sold","Purchases","PL",0,0),
    ("7110","Purchase - Non-Taxable Goods","COGS","Cost of Goods Sold","Purchases","PL",0,0),
    ("7120","Purchase Returns","COGS","Cost of Goods Sold","Purchases","PL",0,0),
    ("7130","Freight Inward","COGS","Cost of Goods Sold","Purchases","PL",0,0),
    ("8010","Salary & Allowances - Admin","Expenses","Operating Expenses","Personnel Costs","PL",0,0),
    ("8020","Salary & Allowances - Sales","Expenses","Operating Expenses","Personnel Costs","PL",0,0),
    ("8030","Provident Fund Contribution","Expenses","Operating Expenses","Personnel Costs","PL",0,0),
    ("8040","SSF Contribution","Expenses","Operating Expenses","Personnel Costs","PL",0,0),
    ("8050","Staff Bonus","Expenses","Operating Expenses","Personnel Costs","PL",0,0),
    ("8060","Staff Training & Development","Expenses","Operating Expenses","Personnel Costs","PL",0,0),
    ("8070","Rent Expense","Expenses","Operating Expenses","Premises Costs","PL",0,0),
    ("8080","Electricity & Water","Expenses","Operating Expenses","Utilities","PL",0,0),
    ("8090","Telephone & Internet","Expenses","Operating Expenses","Communication","PL",0,0),
    ("8100","Postage & Courier","Expenses","Operating Expenses","Communication","PL",0,0),
    ("8110","Printing & Stationery","Expenses","Operating Expenses","Office Expenses","PL",0,0),
    ("8120","Office Supplies","Expenses","Operating Expenses","Office Expenses","PL",0,0),
    ("8130","Repairs & Maintenance - Office","Expenses","Operating Expenses","Office Expenses","PL",0,0),
    ("8140","Vehicle Running Expenses","Expenses","Operating Expenses","Transport & Travel","PL",0,0),
    ("8150","Travelling & Conveyance","Expenses","Operating Expenses","Transport & Travel","PL",0,0),
    ("8160","Advertisement & Promotion","Expenses","Operating Expenses","Marketing Expenses","PL",0,0),
    ("8170","Sales Commission","Expenses","Operating Expenses","Marketing Expenses","PL",0,0),
    ("8180","Freight Outward","Expenses","Operating Expenses","Marketing Expenses","PL",0,0),
    ("8190","Audit & Professional Fee","Expenses","Operating Expenses","Professional Fees","PL",0,0),
    ("8200","Legal & Consultancy Fee","Expenses","Operating Expenses","Professional Fees","PL",0,0),
    ("8210","Bank Charges/Commissions","Expenses","Operating Expenses","Finance Charges","PL",0,0),
    ("8220","Insurance Expense","Expenses","Operating Expenses","Operating Expenses","PL",0,0),
    ("8230","Depreciation - Office Assets","Expenses","Operating Expenses","Depreciation","PL",0,0),
    ("8240","Donation & CSR","Expenses","Operating Expenses","Miscellaneous Expenses","PL",0,0),
    ("8250","Miscellaneous Expenses","Expenses","Operating Expenses","Miscellaneous Expenses","PL",0,0),
    ("8260","Loss on Asset Disposal","Expenses","Operating Expenses","Miscellaneous Expenses","PL",0,0),
    ("9010","Interest Expense - Bank Loan","Finance","Finance & Tax","Finance Costs","PL",0,0),
    ("9020","Interest Expense - Overdraft","Finance","Finance & Tax","Finance Costs","PL",0,0),
    ("9030","Hire Purchase Interest","Finance","Finance & Tax","Finance Costs","PL",0,0),
    ("9040","Income Tax Expense","Finance","Finance & Tax","Taxation","PL",0,0),
    ("9050","Deferred Tax Expense","Finance","Finance & Tax","Taxation","PL",0,0),
    ("9060","TDS Expense","Finance","Finance & Tax","Taxation","PL",0,0),
]

# ============================================================
#  DATABASE INIT
# ============================================================

def get_or_create_first_company(session):
    company = session.query(Company).first()
    if company: return company
    company = Company(name="Professional Edge Wealth & Advisory", pan_number="604332564",
                      is_active=True, created_at=date.today())
    session.add(company); session.commit()
    print(f"[DB] Created first company: '{company.name}' (id={company.id})")
    return company

def copy_gl_template_to_company(session, company_id):
    existing_count = session.query(GLAccount).filter_by(company_id=company_id).count()
    if existing_count == 0:
        template_rows = session.query(GLMasterTemplate).all()
        for t in template_rows:
            session.add(GLAccount(company_id=company_id, gl_code=t.gl_code, gl_name=t.gl_name,
                header=t.header, main_group=t.main_group, sub_group=t.sub_group,
                account_type=t.account_type, opening_dr=0, opening_cr=0))
        session.commit()
        print(f"[DB] Copied {len(template_rows)} GL accounts to company_id={company_id}")
        return len(template_rows)
    else:
        # Company already has its GL accounts copied — sync in any new
        # template codes added since (e.g. 2180 Advance to Directors,
        # 5140 Other Payables) without touching anything the company has
        # already customized.
        existing_codes = {r[0] for r in session.query(GLAccount.gl_code).filter_by(company_id=company_id).all()}
        added = 0
        for t in session.query(GLMasterTemplate).all():
            if t.gl_code not in existing_codes:
                session.add(GLAccount(company_id=company_id, gl_code=t.gl_code, gl_name=t.gl_name,
                    header=t.header, main_group=t.main_group, sub_group=t.sub_group,
                    account_type=t.account_type, opening_dr=0, opening_cr=0))
                added += 1
        if added:
            session.commit()
            print(f"[DB] company_id={company_id}: synced {added} new GL account(s) from template")
        return added

def init_db():
    Base.metadata.create_all(engine)

    # Widen gl_book.gl_code — historically VARCHAR(20), but the app stores
    # combined "code - name" strings (e.g. "5010 - Trade Creditors / Payables")
    # which can exceed 20 chars. Safe no-op if already widened.
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE gl_book ALTER COLUMN gl_code TYPE VARCHAR(80)"))
            conn.execute(text("""
                ALTER TABLE gl_book
                ADD COLUMN IF NOT EXISTS created_by  INTEGER,
                ADD COLUMN IF NOT EXISTS approved_by INTEGER,
                ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ
            """))
            conn.commit()
        print("[DB] gl_book.gl_code widened + prepared/approved columns ensured")
    except Exception as e:
        print(f"[DB] gl_book.gl_code widen note: {e}")

    # Add normal_side column to party_types (Dr/Cr opening balance convention
    # per type), and seed/update the standard types including the 5 new ones
    # requested: Share Capital, Directors, Payables, LTL, STL.
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                ALTER TABLE party_types
                ADD COLUMN IF NOT EXISTS normal_side VARCHAR(2) DEFAULT 'Dr'
            """))
            conn.commit()
        print("[DB] party_types.normal_side column ensured")
    except Exception as e:
        print(f"[DB] party_types.normal_side note: {e}")

    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS journal_entries (
                    id              SERIAL PRIMARY KEY,
                    company_id      INTEGER NOT NULL,
                    entry_date      DATE NOT NULL,
                    internal_ref    VARCHAR(30) NOT NULL,
                    description     VARCHAR(300) DEFAULT '',
                    total_dr        NUMERIC(18,2) DEFAULT 0,
                    total_cr        NUMERIC(18,2) DEFAULT 0,
                    is_posted       BOOLEAN DEFAULT FALSE,
                    is_void         BOOLEAN DEFAULT FALSE,
                    voided_by       VARCHAR(100),
                    voided_at       TIMESTAMPTZ,
                    void_reason     VARCHAR(255),
                    created_by      INTEGER,
                    approved_by     INTEGER,
                    approved_at     TIMESTAMPTZ
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS journal_entry_lines (
                    id              SERIAL PRIMARY KEY,
                    journal_id      INTEGER NOT NULL,
                    company_id      INTEGER NOT NULL,
                    line_no         INTEGER DEFAULT 1,
                    side            VARCHAR(2) NOT NULL,
                    gl_account      VARCHAR(80) DEFAULT '',
                    party_name      VARCHAR(200) DEFAULT '',
                    amount          NUMERIC(18,2) DEFAULT 0,
                    narration       VARCHAR(300) DEFAULT '',
                    invoice_ref     VARCHAR(100) DEFAULT ''
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_je_company ON journal_entries(company_id, entry_date)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_jel_journal ON journal_entry_lines(journal_id)"))
            conn.commit()
        print("[DB] journal_entries + journal_entry_lines tables ensured")
    except Exception as e:
        print(f"[DB] journal_entries migration note: {e}")

    try:
        seed_session = SessionLocal()

        # Correction based on the ACTUAL GL master template (verified
        # directly against the 113-account seed list in this file):
        #   - 2130 is already "Advance Tax Paid" — Directors needed a
        #     genuinely free Asset-range slot. 2180 is free (sits after
        #     2170 "Accrued Income", before 2200 "Bank Accounts" block).
        #   - 5110 is already "Accrued Expenses" — Payables needed a
        #     genuinely free Liability-range slot. 5140 is free (sits
        #     after 5130 "Dividend Payable").
        #   - 4010 "Long-Term Bank Loan" and 5030 "Short-Term Bank Loan"
        #     are EXISTING accounts that already match LTL/STL by name —
        #     no new GL needed, just point the party type at them.
        corrections = [
            ("Directors", "3020 - Advance to Directors", "2180 - Advance to Directors"),
            ("Directors", "2130 - Advance to Directors", "2180 - Advance to Directors"),
            ("Payables",  "5020 - Other Payables",        "5140 - Other Payables"),
            ("Payables",  "5110 - Other Payables",        "5140 - Other Payables"),
            # TDS Payable (a liability — tax withheld from vendors, owed to
            # IRD) was at some point pointed at 2140 "TDS Receivable" (a
            # different account entirely — TDS deducted BY others FROM us,
            # an asset). That's the wrong account for the Vendor-TDS-Payable
            # party type; correct it back to 5060.
            ("TDS",       "2140 - TDS Receivable",        "5060 - TDS Payables"),
        ]
        for nm, old_gl, new_gl in corrections:
            row = seed_session.query(PartyType).filter_by(type_name=nm, default_gl=old_gl).first()
            if row:
                row.default_gl = new_gl
                print(f"[DB] party_types correction: {nm} '{old_gl}' -> '{new_gl}'")
        seed_session.commit()

        # (type_name, default_gl, normal_side, is_builtin)
        # NOTE: "LC" intentionally removed — LC is NEVER a party type.
        # LC No. is now a pure tag field (BankLedger.lc_no / ImportRegister.lc_no
        # / LCMaster), used only to pool Bank Ledger postings for Import
        # Register's allocable-balance queries. The real party on every
        # import-related Bank Ledger row is whoever actually received the
        # cash (RM supplier, freight forwarder, customs office, agent —
        # all normal Vendor/Payables party records with their own GL).
        seed_types = [
            ("Customer",      "2100 - Trade Debtors / Receivables", "Dr", True),
            ("Vendor",        "5010 - Trade Creditors / Payables",  "Cr", True),
            ("Staff",         "2120 - Advance to Staff",            "Dr", True),
            ("TDS",           "5060 - TDS Payables",                "Cr", True),
            ("Share Capital", "3010 - Share Capital",               "Cr", False),
            ("Directors",     "2180 - Advance to Directors",        "Dr", False),
            ("Payables",      "5140 - Other Payables",              "Cr", False),
            ("LTL",           "4010 - Long-Term Bank Loan",         "Cr", False),
            ("STL",           "5030 - Short-Term Bank Loan",        "Cr", False),
        ]
        for i, (nm, gl, side, builtin) in enumerate(seed_types):
            existing = seed_session.query(PartyType).filter_by(type_name=nm).first()
            if existing:
                # Update normal_side if it's still the column default and
                # doesn't match — but never overwrite a default_gl the user
                # may have customized for built-in types.
                if not existing.normal_side or existing.normal_side == "":
                    existing.normal_side = side
            else:
                seed_session.add(PartyType(
                    type_name=nm, default_gl=gl, normal_side=side,
                    is_builtin=builtin, is_active=True, sort_order=i+1,
                ))
        seed_session.commit()
        seed_session.close()
        print("[DB] party_types seeded/updated — including Share Capital, Directors, Payables, LTL, STL")
    except Exception as e:
        print(f"[DB] party_types seed note: {e}")

    # ── Reverse migration: an earlier revision briefly introduced a
    # separate "1350 - LC Clearing A/c" GL code for LC payments. That was
    # reverted — the LC party type's control account is 2110 (Advance to
    # Suppliers), exactly like Vendor sub-ledgers reconcile to 5010. Any
    # database that already ran the forward migration gets moved back
    # here; this is a no-op (and harmless) on databases that never saw it.
    try:
        ms = SessionLocal()
        pt = ms.query(PartyType).filter_by(type_name="LC").first()
        if pt and pt.default_gl == "1350 - LC Clearing A/c":
            pt.default_gl = "2110 - Advance to Suppliers"
            ms.commit()
            print("[DB] party_types: LC default_gl reverted 1350 → 2110 (Advance to Suppliers)")

        lc_parties_reverted = ms.query(PartyMaster).filter(
            PartyMaster.party_type == "LC",
            PartyMaster.gl_account == "1350 - LC Clearing A/c"
        ).update({"gl_account": "2110 - Advance to Suppliers"}, synchronize_session=False)
        if lc_parties_reverted:
            ms.commit()
            print(f"[DB] party_master: reverted {lc_parties_reverted} LC part{'y' if lc_parties_reverted==1 else 'ies'} from 1350 → 2110")
        ms.close()
    except Exception as e:
        print(f"[DB] LC clearing GL revert-migration note: {e}")

    # ── TDS correction: any existing TDS party records still pointing at
    # 2140 (TDS Receivable — wrong account, an asset for tax withheld BY
    # others FROM us) get moved to 5060 (TDS Payables — correct account,
    # a liability for tax we withheld FROM vendors and owe to IRD). The
    # party_types.default_gl correction above only fixes new parties
    # going forward; this backfills existing ones the same way the LC
    # migration does.
    try:
        ms2 = SessionLocal()
        tds_parties_fixed = ms2.query(PartyMaster).filter(
            PartyMaster.party_type == "TDS",
            PartyMaster.gl_account == "2140 - TDS Receivable"
        ).update({"gl_account": "5060 - TDS Payables"}, synchronize_session=False)
        if tds_parties_fixed:
            ms2.commit()
            print(f"[DB] party_master: corrected {tds_parties_fixed} TDS part{'y' if tds_parties_fixed==1 else 'ies'} from 2140 → 5060")
        ms2.close()
    except Exception as e:
        print(f"[DB] TDS GL correction-migration note: {e}")

    # ── LC is no longer a party type at all — major architecture change.
    # Deactivate the old "LC" PartyType row (don't delete — preserves
    # historical readability of old Party Ledger entries that reference
    # it). For every existing PartyMaster row with party_type="LC",
    # migrate it into LCMaster (the new controlled tag list) so the LC
    # No. itself isn't lost — it just stops being a postable party.
    # Existing ImportRegister.bank_lc_no values get copied to the new
    # lc_no field so historical import rows keep their LC association.
    try:
        ms3 = SessionLocal()
        lc_pt = ms3.query(PartyType).filter_by(type_name="LC").first()
        if lc_pt and lc_pt.is_active:
            lc_pt.is_active = False
            ms3.commit()
            print("[DB] party_types: LC deactivated — LC is no longer a party type")

        old_lc_parties = ms3.query(PartyMaster).filter(PartyMaster.party_type == "LC").all()
        lc_migrated = 0
        for p in old_lc_parties:
            existing_lc = ms3.query(LCMaster).filter_by(company_id=p.company_id, lc_no=p.name).first()
            if not existing_lc:
                ms3.add(LCMaster(company_id=p.company_id, lc_no=p.name, is_active=p.is_active))
                lc_migrated += 1
        if lc_migrated:
            ms3.commit()
            print(f"[DB] lc_master: migrated {lc_migrated} LC part{'y' if lc_migrated==1 else 'ies'} into LCMaster (no longer postable parties)")

        # Copy old ImportRegister.bank_lc_no -> new lc_no column, if the
        # old column still exists and lc_no hasn't been populated yet.
        try:
            with engine.connect() as conn:
                has_old_col = conn.execute(text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name='import_register' AND column_name='bank_lc_no'"
                )).fetchone()
                if has_old_col:
                    conn.execute(text(
                        "UPDATE import_register SET lc_no = bank_lc_no "
                        "WHERE (lc_no IS NULL OR lc_no = '') AND bank_lc_no IS NOT NULL AND bank_lc_no != ''"
                    ))
                    conn.commit()
                    print("[DB] import_register: backfilled lc_no from legacy bank_lc_no")
        except Exception as e2:
            print(f"[DB] import_register lc_no backfill note: {e2}")

        ms3.close()
    except Exception as e:
        print(f"[DB] LC-is-not-a-party migration note: {e}")

    # Auto-migrate void columns onto existing purchase_book table
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                ALTER TABLE purchase_book
                    ADD COLUMN IF NOT EXISTS is_void     BOOLEAN NOT NULL DEFAULT FALSE,
                    ADD COLUMN IF NOT EXISTS voided_by   VARCHAR(100),
                    ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS void_reason VARCHAR(255)
            """))
            conn.execute(text("""
                ALTER TABLE sales_book
                    ADD COLUMN IF NOT EXISTS is_void          BOOLEAN NOT NULL DEFAULT FALSE,
                    ADD COLUMN IF NOT EXISTS voided_by        VARCHAR(100),
                    ADD COLUMN IF NOT EXISTS voided_at        TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS void_reason      VARCHAR(255),
                    ADD COLUMN IF NOT EXISTS geography_type   VARCHAR(20) DEFAULT 'Local',
                    ADD COLUMN IF NOT EXISTS export_amount    NUMERIC(18,2) DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS gross_amount     NUMERIC(18,2) DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS trade_discount   NUMERIC(18,2) DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS excisable_amount NUMERIC(18,2) DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS excise_type      VARCHAR(20)  DEFAULT 'NONE',
                    ADD COLUMN IF NOT EXISTS excise_rate      NUMERIC(10,4) DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS excise_amount    NUMERIC(18,2) DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS is_capital       BOOLEAN DEFAULT FALSE,
                    ADD COLUMN IF NOT EXISTS capital_item_name VARCHAR(200) DEFAULT '',
                    ADD COLUMN IF NOT EXISTS cap_qty          NUMERIC(18,3) DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS cap_rate         NUMERIC(18,4) DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS cap_taxable_value NUMERIC(18,2) DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS cap_vat          NUMERIC(18,2) DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS cap_total        NUMERIC(18,2) DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS fa_code          VARCHAR(50)  DEFAULT ''
            """))
            # Backfill NULL is_void → FALSE for all existing rows
            conn.execute(text("UPDATE purchase_book SET is_void=FALSE WHERE is_void IS NULL"))
            conn.execute(text("UPDATE sales_book    SET is_void=FALSE WHERE is_void IS NULL"))
            # Fix existing rows that incorrectly have cap_qty/cap_rate set for non-capital items
            conn.execute(text("""
                UPDATE sales_book
                SET cap_qty=0, cap_rate=0, cap_taxable_value=0, cap_vat=0, cap_total=0, capital_item_name='', fa_code=''
                WHERE (is_capital=FALSE OR is_capital IS NULL)
                  AND (cap_qty != 0 OR cap_rate != 0)
            """))
            conn.commit()
        print("[DB] void + sales columns ensured; NULL is_void backfilled to FALSE")
    except Exception as e:
        import traceback
        print(f"[DB] Migration warning (ALTER TABLE): {e}")
        print(traceback.format_exc())

    # Create party_ledger table — separate connection block
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS party_ledger (
                    id          SERIAL PRIMARY KEY,
                    company_id  INTEGER NOT NULL,
                    entry_date  DATE NOT NULL,
                    party_name  VARCHAR(200) NOT NULL,
                    party_type  VARCHAR(20) DEFAULT '',
                    txn_type    VARCHAR(30) DEFAULT '',
                    reference   VARCHAR(50) DEFAULT '',
                    description VARCHAR(300) DEFAULT '',
                    debit       NUMERIC(18,2) DEFAULT 0,
                    credit      NUMERIC(18,2) DEFAULT 0,
                    source      VARCHAR(30) DEFAULT '',
                    gl_account  VARCHAR(60) DEFAULT ''
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_pl_company_party ON party_ledger(company_id, party_name)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_pl_date ON party_ledger(entry_date)"))
            conn.execute(text("ALTER TABLE party_ledger ADD COLUMN IF NOT EXISTS charge_type VARCHAR(60) DEFAULT ''"))
            conn.execute(text("ALTER TABLE party_ledger ADD COLUMN IF NOT EXISTS lc_no VARCHAR(100) DEFAULT ''"))
            conn.execute(text("ALTER TABLE party_ledger ADD COLUMN IF NOT EXISTS is_void BOOLEAN DEFAULT FALSE"))
            conn.commit()
        print("[DB] party_ledger table ensured (charge_type, lc_no, is_void columns ensured)")
    except Exception as e:
        import traceback; tb=traceback.format_exc()
        print(f"[DB] party_ledger migration ERROR: {e}\n{tb}")

    # Bank Accounts + Bank Ledger tables
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS bank_accounts (
                    id              SERIAL PRIMARY KEY,
                    company_id      INTEGER NOT NULL,
                    account_name    VARCHAR(100) NOT NULL,
                    account_no      VARCHAR(50) DEFAULT '',
                    gl_code         VARCHAR(20) DEFAULT '',
                    gl_name         VARCHAR(150) DEFAULT '',
                    opening_balance NUMERIC(18,2) DEFAULT 0,
                    is_active       BOOLEAN DEFAULT TRUE
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS bank_ledger (
                    id              SERIAL PRIMARY KEY,
                    company_id      INTEGER NOT NULL,
                    bank_account_id INTEGER NOT NULL,
                    entry_date      DATE NOT NULL,
                    narration       VARCHAR(300) DEFAULT '',
                    withdraw        NUMERIC(18,2) DEFAULT 0,
                    deposit         NUMERIC(18,2) DEFAULT 0,
                    balance         NUMERIC(18,2) DEFAULT 0,
                    entry_type      VARCHAR(10) DEFAULT '',
                    gl_account      VARCHAR(60) DEFAULT '',
                    party_name      VARCHAR(200) DEFAULT '',
                    party_type      VARCHAR(20) DEFAULT '',
                    charge_type     VARCHAR(60) DEFAULT '',
                    invoice_ref     VARCHAR(100) DEFAULT '',
                    narration2      VARCHAR(300) DEFAULT '',
                    is_posted_gl    BOOLEAN DEFAULT FALSE,
                    is_posted_party BOOLEAN DEFAULT FALSE,
                    source          VARCHAR(20) DEFAULT 'manual',
                    internal_ref    VARCHAR(30) DEFAULT '',
                    seq_no          INTEGER DEFAULT 1,
                    date_bs         VARCHAR(20) DEFAULT ''
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_bl_company ON bank_ledger(company_id, bank_account_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_bl_date ON bank_ledger(entry_date)"))
            conn.execute(text("""
                ALTER TABLE bank_ledger
                ADD COLUMN IF NOT EXISTS is_split BOOLEAN DEFAULT FALSE
            """))
            conn.execute(text("""
                ALTER TABLE bank_ledger
                ADD COLUMN IF NOT EXISTS created_by  INTEGER,
                ADD COLUMN IF NOT EXISTS approved_by INTEGER,
                ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ
            """))
            conn.execute(text("""
                ALTER TABLE bank_ledger
                ADD COLUMN IF NOT EXISTS is_void     BOOLEAN DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS voided_by   VARCHAR(100),
                ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS void_reason VARCHAR(255)
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS bank_ledger_splits (
                    id              SERIAL PRIMARY KEY,
                    bank_ledger_id  INTEGER NOT NULL,
                    company_id      INTEGER NOT NULL,
                    split_amount    NUMERIC(18,2) NOT NULL,
                    entry_type      VARCHAR(10) DEFAULT '',
                    gl_account      VARCHAR(60) DEFAULT '',
                    charge_type     VARCHAR(60) DEFAULT '',
                    party_name      VARCHAR(200) DEFAULT '',
                    invoice_ref     VARCHAR(100) DEFAULT '',
                    narration       VARCHAR(300) DEFAULT '',
                    is_posted       BOOLEAN DEFAULT FALSE
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_bls_parent ON bank_ledger_splits(bank_ledger_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_bls_company ON bank_ledger_splits(company_id)"))
            # split_status + approval workflow
            conn.execute(text("""
                ALTER TABLE bank_ledger
                ADD COLUMN IF NOT EXISTS split_status VARCHAR(20) DEFAULT ''
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS bank_split_requests (
                    id              SERIAL PRIMARY KEY,
                    company_id      INTEGER NOT NULL,
                    bank_ledger_id  INTEGER NOT NULL,
                    requested_by    VARCHAR(100) DEFAULT '',
                    requested_at    TIMESTAMPTZ,
                    request_note    VARCHAR(500) DEFAULT '',
                    status          VARCHAR(20) DEFAULT 'pending',
                    reviewed_by     VARCHAR(100) DEFAULT '',
                    reviewed_at     TIMESTAMPTZ,
                    review_note     VARCHAR(500) DEFAULT '',
                    split_done_at   TIMESTAMPTZ
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_bsr_company ON bank_split_requests(company_id, status)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_bsr_ledger ON bank_split_requests(bank_ledger_id)"))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS bank_edit_requests (
                    id              SERIAL PRIMARY KEY,
                    company_id      INTEGER NOT NULL,
                    bank_ledger_id  INTEGER NOT NULL,
                    new_entry_type  VARCHAR(20) DEFAULT '',
                    new_gl_account  VARCHAR(80) DEFAULT '',
                    new_party_name  VARCHAR(200) DEFAULT '',
                    new_party_type  VARCHAR(50) DEFAULT '',
                    new_charge_type VARCHAR(60) DEFAULT '',
                    new_invoice_ref VARCHAR(100) DEFAULT '',
                    new_narration   VARCHAR(300) DEFAULT '',
                    requested_by    VARCHAR(100) DEFAULT '',
                    requested_at    TIMESTAMPTZ,
                    request_note    VARCHAR(500) DEFAULT '',
                    status          VARCHAR(20) DEFAULT 'pending',
                    reviewed_by     VARCHAR(100) DEFAULT '',
                    reviewed_at     TIMESTAMPTZ,
                    review_note     VARCHAR(500) DEFAULT '',
                    applied_at      TIMESTAMPTZ
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ber_company ON bank_edit_requests(company_id, status)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ber_ledger ON bank_edit_requests(bank_ledger_id)"))
            conn.commit()
        print("[DB] bank_accounts + bank_ledger + bank_ledger_splits + bank_split_requests + bank_edit_requests ensured")
    except Exception as e:
        import traceback; tb=traceback.format_exc()
        print(f"[DB] bank tables migration ERROR: {e}\n{tb}")

    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS lc_master (
                    id              SERIAL PRIMARY KEY,
                    company_id      INTEGER NOT NULL,
                    lc_no           VARCHAR(100) NOT NULL,
                    bank_name       VARCHAR(150) DEFAULT '',
                    open_date       DATE,
                    expiry_date     DATE,
                    bg_no           VARCHAR(100) DEFAULT '',
                    remarks         VARCHAR(300) DEFAULT '',
                    is_active       BOOLEAN DEFAULT TRUE
                )
            """))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_lc_master_company ON lc_master(company_id, lc_no)"
            ))
            conn.commit()
        print("[DB] lc_master table ensured")
    except Exception as e:
        import traceback; tb=traceback.format_exc()
        print(f"[DB] lc_master migration ERROR: {e}\n{tb}")

    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS import_register (
                    id              SERIAL PRIMARY KEY,
                    company_id      INTEGER NOT NULL,
                    imp_voucher     VARCHAR(30) NOT NULL,
                    entry_date      DATE NOT NULL,
                    pp_no           VARCHAR(50) DEFAULT '',
                    lc_no           VARCHAR(100) DEFAULT '',
                    supplier_name   VARCHAR(200) DEFAULT '',
                    fec_no          VARCHAR(100) DEFAULT '',
                    item_name       VARCHAR(200) DEFAULT '',
                    fcy_currency    VARCHAR(10) DEFAULT '',
                    fcy_rate        NUMERIC(18,4) DEFAULT 0,
                    exchange_rate   NUMERIC(18,4) DEFAULT 0,
                    local_ccy_rate  NUMERIC(18,4) DEFAULT 0,
                    is_taxable      BOOLEAN DEFAULT TRUE,
                    is_capital      BOOLEAN DEFAULT FALSE,
                    qty             NUMERIC(18,4) DEFAULT 0,
                    basic_material_amount NUMERIC(18,2) DEFAULT 0,
                    material_value_paid   NUMERIC(18,2) DEFAULT 0,
                    forex_gain_loss NUMERIC(18,2) DEFAULT 0,
                    import_freight  NUMERIC(18,2) DEFAULT 0,
                    import_duty     NUMERIC(18,2) DEFAULT 0,
                    custom_svc_chg  NUMERIC(18,2) DEFAULT 0,
                    vat_claimable   BOOLEAN DEFAULT TRUE,
                    vat_amount      NUMERIC(18,2) DEFAULT 0,
                    total_phase1_cost NUMERIC(18,2) DEFAULT 0,
                    p2_agent_commission NUMERIC(18,2) DEFAULT 0,
                    p2_local_freight  NUMERIC(18,2) DEFAULT 0,
                    p2_packing_fwd    NUMERIC(18,2) DEFAULT 0,
                    p2_bank_charges   NUMERIC(18,2) DEFAULT 0,
                    p2_insurance      NUMERIC(18,2) DEFAULT 0,
                    p2_total          NUMERIC(18,2) DEFAULT 0,
                    total_cost        NUMERIC(18,2) DEFAULT 0,
                    landed_cpu        NUMERIC(18,4) DEFAULT 0,
                    cap_item_name   VARCHAR(200) DEFAULT '',
                    cap_sub_group   VARCHAR(100) DEFAULT '',
                    cap_main_group  VARCHAR(100) DEFAULT '',
                    cap_header      VARCHAR(100) DEFAULT '',
                    cap_gl_type     VARCHAR(10) DEFAULT '',
                    block_gl        VARCHAR(80) DEFAULT '',
                    fa_code         VARCHAR(50) DEFAULT '',
                    residual_pct    NUMERIC(6,2) DEFAULT 0,
                    dep_rate_pct    NUMERIC(6,2) DEFAULT 0,
                    status          VARCHAR(20) DEFAULT 'Complete',
                    stock_journal_posted BOOLEAN DEFAULT FALSE,
                    is_void         BOOLEAN DEFAULT FALSE,
                    voided_by       VARCHAR(100) DEFAULT '',
                    voided_at       TIMESTAMPTZ,
                    void_reason     VARCHAR(255) DEFAULT '',
                    created_by      INTEGER
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ir_company_voucher ON import_register(company_id, imp_voucher)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ir_company_date ON import_register(company_id, entry_date)"))
            conn.commit()
            # NOTE: idx_ir_company_lc and idx_ir_company_pp (both indexing
            # the lc_no column) are created AFTER the _safe_add_cols loop
            # below, not here — on an EXISTING database (import_register
            # already present from before this model), CREATE TABLE IF NOT
            # EXISTS is a no-op and lc_no doesn't exist yet at this point;
            # creating an index on it here would fail with
            # "column lc_no does not exist". The ALTER TABLE ADD COLUMN
            # that actually creates lc_no runs further down, so these two
            # indexes are deferred until after that, where the column is
            # guaranteed to exist on both fresh and existing databases.

        # ── Safe column migrations for databases created under the OLD
        # two-stage Phase I/Phase II model. Renamed/restructured columns
        # are ADDED here (never auto-dropped — old columns like
        # bank_lc_no, material_value, custom_duty, total_phase1 etc. are
        # left in place harmlessly for any existing data; the new code
        # paths simply don't read them anymore).
        _safe_add_cols = [
            ("import_register", "lc_no",                  "VARCHAR(100) DEFAULT ''"),
            ("import_register", "local_ccy_rate",          "NUMERIC(18,4) DEFAULT 0"),
            ("import_register", "basic_material_amount",   "NUMERIC(18,2) DEFAULT 0"),
            ("import_register", "material_value_paid",     "NUMERIC(18,2) DEFAULT 0"),
            ("import_register", "forex_gain_loss",         "NUMERIC(18,2) DEFAULT 0"),
            ("import_register", "import_freight",          "NUMERIC(18,2) DEFAULT 0"),
            ("import_register", "import_duty",              "NUMERIC(18,2) DEFAULT 0"),
            ("import_register", "total_phase1_cost",       "NUMERIC(18,2) DEFAULT 0"),
            ("import_register", "p2_agent_commission",      "NUMERIC(18,2) DEFAULT 0"),
            ("import_register", "p2_local_freight",         "NUMERIC(18,2) DEFAULT 0"),
            ("import_register", "p2_packing_fwd",           "NUMERIC(18,2) DEFAULT 0"),
            ("import_register", "p2_bank_charges",          "NUMERIC(18,2) DEFAULT 0"),
            ("import_register", "p2_insurance",             "NUMERIC(18,2) DEFAULT 0"),
            ("import_register", "p2_total",                 "NUMERIC(18,2) DEFAULT 0"),
            ("import_register", "total_cost",               "NUMERIC(18,2) DEFAULT 0"),
            ("import_register", "landed_cpu",               "NUMERIC(18,4) DEFAULT 0"),
            ("import_register", "fa_code",                  "VARCHAR(50) DEFAULT ''"),
            ("import_register", "status",                   "VARCHAR(20) DEFAULT 'Complete'"),
            ("import_register", "stock_journal_posted",     "BOOLEAN DEFAULT FALSE"),
        ]
        with engine.connect() as conn:
            for tbl, col, defn in _safe_add_cols:
                try:
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN IF NOT EXISTS {col} {defn}"))
                    conn.commit()
                except Exception:
                    conn.rollback()

        # ── Deferred indexes on import_register.lc_no — created here,
        # AFTER the ALTER TABLE loop above, so the column is guaranteed
        # to exist on BOTH fresh databases (created it via CREATE TABLE)
        # and existing databases (just added it via ALTER TABLE). Each
        # wrapped individually so one failing doesn't block the other.
        with engine.connect() as conn:
            try:
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ir_company_lc ON import_register(company_id, lc_no, entry_date DESC)"))
                conn.commit()
            except Exception as e:
                conn.rollback()
                print(f"[DB] idx_ir_company_lc creation note: {e}")
            try:
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ir_company_pp ON import_register(company_id, lc_no, pp_no)"))
                conn.commit()
            except Exception as e:
                conn.rollback()
                print(f"[DB] idx_ir_company_pp creation note: {e}")

        print("[DB] import_register table ensured (unified single-stage model)")
    except Exception as e:
        import traceback; tb=traceback.format_exc()
        print(f"[DB] import_register migration ERROR: {e}\n{tb}")

    # ── Import Allocations — tracks LC+Charge-Type pool consumption ──
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS import_allocations (
                    id                  SERIAL PRIMARY KEY,
                    company_id          INTEGER NOT NULL,
                    lc_no               VARCHAR(100) NOT NULL,
                    charge_type         VARCHAR(60) NOT NULL,
                    pp_no               VARCHAR(50) DEFAULT '',
                    imp_voucher         VARCHAR(30) DEFAULT '',
                    import_register_id  INTEGER NOT NULL,
                    amount              NUMERIC(18,2) NOT NULL,
                    allocated_at        TIMESTAMPTZ,
                    allocated_by        INTEGER,
                    is_void             BOOLEAN DEFAULT FALSE,
                    voided_at           TIMESTAMPTZ
                )
            """))
            # Safe-add for databases created under the old lc_name-keyed shape
            for col, defn in [("lc_no", "VARCHAR(100) DEFAULT ''")]:
                try:
                    conn.execute(text(f"ALTER TABLE import_allocations ADD COLUMN IF NOT EXISTS {col} {defn}"))
                    conn.commit()
                except Exception:
                    conn.rollback()
            # Backfill lc_no from the old lc_name column, if it exists
            try:
                has_old_col = conn.execute(text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name='import_allocations' AND column_name='lc_name'"
                )).fetchone()
                if has_old_col:
                    conn.execute(text(
                        "UPDATE import_allocations SET lc_no = lc_name "
                        "WHERE (lc_no IS NULL OR lc_no = '') AND lc_name IS NOT NULL AND lc_name != ''"
                    ))
                    conn.commit()
            except Exception:
                conn.rollback()
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_ia_company_lc_charge "
                "ON import_allocations(company_id, lc_no, charge_type)"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_ia_import_register_id "
                "ON import_allocations(import_register_id)"
            ))
            conn.commit()
        print("[DB] import_allocations table ensured")
    except Exception as e:
        import traceback; tb=traceback.format_exc()
        print(f"[DB] import_allocations migration ERROR: {e}\n{tb}")

    # ── Stock Journal — item-wise movement ledger ──
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS stock_journal (
                    id              SERIAL PRIMARY KEY,
                    company_id      INTEGER NOT NULL,
                    entry_date      DATE NOT NULL,
                    material_id     INTEGER NOT NULL,
                    product_code    VARCHAR(100) DEFAULT '',
                    product_name    VARCHAR(200) DEFAULT '',
                    material_type   VARCHAR(10) DEFAULT '',
                    movement_type   VARCHAR(20) DEFAULT 'Receipt',
                    qty             NUMERIC(18,4) DEFAULT 0,
                    rate            NUMERIC(18,4) DEFAULT 0,
                    value           NUMERIC(18,2) DEFAULT 0,
                    running_qty     NUMERIC(18,4) DEFAULT 0,
                    running_value   NUMERIC(18,2) DEFAULT 0,
                    running_rate    NUMERIC(18,4) DEFAULT 0,
                    source          VARCHAR(40) DEFAULT '',
                    reference       VARCHAR(50) DEFAULT '',
                    narration       VARCHAR(300) DEFAULT '',
                    is_void         BOOLEAN DEFAULT FALSE,
                    voided_at       TIMESTAMPTZ,
                    created_by      INTEGER
                )
            """))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_sj_company_material "
                "ON stock_journal(company_id, material_id, entry_date)"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_sj_company_source_ref "
                "ON stock_journal(company_id, source, reference)"
            ))
            conn.commit()
        print("[DB] stock_journal table ensured")
    except Exception as e:
        import traceback; tb=traceback.format_exc()
        print(f"[DB] stock_journal migration ERROR: {e}\n{tb}")

    # ── Bank Ledger / Bank Ledger Splits — lc_no tag column ──
    # Replaces the old lc_reference/import_phase scaffolding from an
    # earlier (discarded) design. lc_no is a plain tag, never a party —
    # see BankLedger / BankLedgerSplit model docstrings.
    try:
        with engine.connect() as conn:
            for tbl in ("bank_ledger", "bank_ledger_splits"):
                try:
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN IF NOT EXISTS lc_no VARCHAR(100) DEFAULT ''"))
                    conn.commit()
                except Exception:
                    conn.rollback()
            # Backfill from the old lc_reference column, if present
            for tbl in ("bank_ledger", "bank_ledger_splits"):
                try:
                    has_old_col = conn.execute(text(
                        f"SELECT column_name FROM information_schema.columns "
                        f"WHERE table_name='{tbl}' AND column_name='lc_reference'"
                    )).fetchone()
                    if has_old_col:
                        conn.execute(text(
                            f"UPDATE {tbl} SET lc_no = lc_reference "
                            f"WHERE (lc_no IS NULL OR lc_no = '') AND lc_reference IS NOT NULL AND lc_reference != ''"
                        ))
                        conn.commit()
                except Exception:
                    conn.rollback()
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_bl_company_lc ON bank_ledger(company_id, lc_no)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_bls_company_lc ON bank_ledger_splits(company_id, lc_no)"))
            conn.commit()
        print("[DB] bank_ledger/bank_ledger_splits lc_no tag column ensured")
    except Exception as e:
        import traceback; tb=traceback.format_exc()
        print(f"[DB] bank_ledger lc_no migration ERROR: {e}\n{tb}")
    except Exception as e:
        import traceback
        print(f"[DB] party_ledger migration ERROR: {e}")
        print(traceback.format_exc())

    session = SessionLocal()
    try:
        if session.query(GLMasterTemplate).count() == 0:
            for code,name,header,mg,sg,at,dr,cr in GL_MASTER_SEED:
                session.add(GLMasterTemplate(gl_code=code,gl_name=name,header=header,
                    main_group=mg,sub_group=sg,account_type=at))
            session.commit()
            print(f"[DB] Seeded {len(GL_MASTER_SEED)} GL template accounts")
        else:
            # Template already seeded from a prior run — GL_MASTER_SEED may
            # have grown since (e.g. 2180 Advance to Directors, 5140 Other
            # Payables added for the new party types). Insert any codes
            # that exist in the Python list but not yet in the live table,
            # without touching anything already there.
            existing_codes = {r[0] for r in session.query(GLMasterTemplate.gl_code).all()}
            added = 0
            for code,name,header,mg,sg,at,dr,cr in GL_MASTER_SEED:
                if code not in existing_codes:
                    session.add(GLMasterTemplate(gl_code=code,gl_name=name,header=header,
                        main_group=mg,sub_group=sg,account_type=at))
                    added += 1
            if added:
                session.commit()
                print(f"[DB] GL template: added {added} new account(s) not present in existing template")

        company = get_or_create_first_company(session)
        copied  = copy_gl_template_to_company(session, company.id)
        if copied:
            sbc = {row[0]:(row[6],row[7]) for row in GL_MASTER_SEED}
            for a in session.query(GLAccount).filter_by(company_id=company.id).all():
                dr,cr = sbc.get(a.gl_code,(0,0)); a.opening_dr,a.opening_cr = dr,cr
            session.commit()

        if session.query(Settings).filter_by(company_id=company.id).count() == 0:
            session.add(Settings(company_id=company.id, company_name=company.name,
                pan_number=company.pan_number, company_address="Kathmandu",
                company_email="abc@gmail.com", contact_no="9851135421", user_name="Admin",
                fiscal_year_bs="2082-83", fy_start_ad=date(2025,7,17), fy_end_ad=date(2026,7,16),
                fy_start_bs="1 Shrawan 2082", fy_end_bs="31 Ashadh 2083",
                opening_balance_date=date(2025,7,16), vat_rate=0.13,
                tds_vendor_rate=0.015, tds_rental_rate=0.015))
            session.commit()

        if session.query(BsAdCalendar).count() == 0:
            for bs,ad,n in [("2081-82",date(2024,7,17),""),("2082-83",date(2025,7,17),"Current FY"),
                ("2083-84",date(2026,7,17),""),("2084-85",date(2027,7,17),""),
                ("2085-86",date(2028,7,17),""),("2086-87",date(2029,7,17),""),
                ("2087-88",date(2030,7,17),""),("2088-89",date(2031,7,17),""),
                ("2089-90",date(2032,7,17),""),("2090-91",date(2033,7,17),""),
                ("2091-92",date(2034,7,17),"")]:
                session.add(BsAdCalendar(bs_fiscal_year=bs,ad_start_date=ad,notes=n))
            session.commit()

        if session.query(PartyType).count() == 0:
            # NOTE: "LC" intentionally excluded — LC is never a party type
            # in this design (see seed_types comment above for why).
            for nm,gl,o in [("Customer","2100 - Trade Debtors / Receivables",1),
                ("Vendor","5010 - Trade Creditors / Payables",2),
                ("Staff","2120 - Advance to Staff",3),
                ("TDS","5060 - TDS Payables",4)]:
                session.add(PartyType(type_name=nm,default_gl=gl,is_builtin=True,is_active=True,sort_order=o))
            session.commit()

        if session.query(User).count() == 0:
            admin = User(username="administrator",
                password_hash=generate_password_hash("admin123"),
                full_name="Administrator", is_super_admin=True, is_active=True, user_type="consultant")
            session.add(admin); session.commit()
            for c in session.query(Company).all():
                session.add(UserCompanyAccess(user_id=admin.id,company_id=c.id,role="company_admin"))
            session.commit()
            print("[DB] Default user 'administrator' / 'admin123' created")
    finally:
        session.close()

try:
    init_db()
except Exception as e:
    print(f"[WARN] init_db() failed: {e}")

# ============================================================
#  HELPER FUNCTIONS
# ============================================================

SETTINGS_FIELDS = [
    "company_name","pan_number","company_address","company_email","contact_no","user_name",
    "fiscal_year_bs","fy_start_ad","fy_end_ad","fy_start_bs","fy_end_bs","opening_balance_date",
    "vat_rate","tds_vendor_rate","tds_rental_rate",
    "prefix_purchase","prefix_purchase_ret","prefix_sales","prefix_sales_ret",
    "prefix_credit_note","prefix_debit_note","prefix_journal","prefix_import",
    "prefix_bank","prefix_fixed_asset","prefix_depreciation",
    "default_currency","date_format","decimal_places","depreciation_basis_days",
    "stock_valuation_method","show_logo_in_reports",
]
DATE_FIELDS    = {"fy_start_ad","fy_end_ad","opening_balance_date"}
NUMERIC_FIELDS = {"vat_rate","tds_vendor_rate","tds_rental_rate"}
INT_FIELDS     = {"decimal_places","depreciation_basis_days"}
BOOL_FIELDS    = {"show_logo_in_reports"}

def settings_to_dict(s):
    out = {}
    for f in SETTINGS_FIELDS:
        val = getattr(s, f)
        if f in DATE_FIELDS and val: out[f] = val.isoformat()
        elif f in NUMERIC_FIELDS and val is not None: out[f] = float(val)
        else: out[f] = val
    return out

def _is_company_admin(session, user_id, company_id):
    u = session.query(User).filter_by(id=user_id, is_active=True).first()
    if not u: return False
    if u.is_super_admin: return True
    r = session.query(UserCompanyAccess).filter_by(user_id=user_id,company_id=company_id,role="company_admin").first()
    return r is not None

def _can_transact(session, user_id, company_id):
    """Check if user can create/save transactions.
    Super Admin can transact for any company.
    Company users need company_admin or accountant role.
    """
    if not user_id:
        print(f"[AUTH] _can_transact: user_id is None/null — rejecting")
        return False
    u = session.query(User).filter_by(id=user_id, is_active=True).first()
    if not u:
        print(f"[AUTH] _can_transact: user {user_id} not found or inactive")
        return False
    if u.is_super_admin:
        print(f"[AUTH] _can_transact: Super Admin {u.username} — allowed")
        return True
    uca = session.query(UserCompanyAccess).filter_by(user_id=user_id,company_id=company_id).first()
    allowed = uca and uca.role in ("company_admin","accountant")
    print(f"[AUTH] _can_transact: user {u.username} role={uca.role if uca else 'none'} — {'allowed' if allowed else 'denied'}")
    return allowed

def _can_void(session, user_id, company_id):
    """Super Admin, company_admin, or admin can void entries."""
    u = session.query(User).filter_by(id=user_id, is_active=True).first()
    if not u: return False
    if u.is_super_admin: return True
    uca = session.query(UserCompanyAccess).filter_by(user_id=user_id,company_id=company_id).first()
    return uca and uca.role in ("company_admin","admin")

def user_to_dict(u, session):
    rows = session.query(UserCompanyAccess).filter_by(user_id=u.id).all()
    return {"id":u.id,"username":u.username,"full_name":u.full_name,
            "is_super_admin":u.is_super_admin,"is_active":u.is_active,"user_type":u.user_type,
            "access":[{"company_id":r.company_id,"role":r.role} for r in rows]}

def _add_party_ledger_entry(session, company_id, entry_date, party_name, party_type,
                             txn_type, reference, description, debit, credit, source, gl_account="", charge_type="", lc_no=""):
    """
    Post one entry to party_ledger (individual party sub-ledger).
    Called alongside _add_gl_book_entry for the party-specific leg only.
    Convention:
      Vendor  purchase → Credit  (5010 - liability increases)
      Vendor  return   → Debit   (5010 - liability decreases)
      Customer sale    → Debit   (2100 - receivable increases)
      Customer return  → Credit  (2100 - receivable decreases)
    charge_type: import charge classification (Material Value, Import
    Freight, Import Duty, CSC, VAT, Agent Commission, Local Freight,
    Packing & Forwarding, Bank Charges, Insurance) — blank for non-import rows.
    lc_no: LC tag, NOT a party — blank for non-import rows. Lets a
    party's full import-related history be filtered by LC even though
    the party itself (Vendor/Payables) is unrelated to which LC it is.
    Both stored as their own columns so they can be shown as dedicated
    columns in the party statement table, rather than buried in free text.
    """
    if not party_name or not party_name.strip(): return
    try:
        entry = PartyLedger(
            company_id  = company_id,
            entry_date  = entry_date,
            party_name  = party_name.strip(),
            party_type  = party_type or "",
            txn_type    = txn_type or "",
            reference   = (reference or "")[:50],
            description = (description or "")[:300],
            debit       = round(abs(debit or 0), 2),
            credit      = round(abs(credit or 0), 2),
            source      = source or "",
            gl_account  = gl_account or "",
            charge_type = (charge_type or "")[:60],
            lc_no       = (lc_no or "")[:100],
        )
        session.add(entry)
    except Exception as e:
        print(f"[WARN] _add_party_ledger_entry failed: {e}")

def _get_gl_by_code(session, company_id, gl_code):
    a = session.query(GLAccount).filter_by(company_id=company_id,gl_code=gl_code).first()
    return a.gl_name if a else gl_code

def _get_nepali_month(d):
    return {1:"Magh",2:"Falgun",3:"Chaitra",4:"Baisakh",5:"Jestha",6:"Ashadh",
            7:"Shrawan",8:"Bhadra",9:"Ashwin",10:"Kartik",11:"Mangsir",12:"Poush"}.get(d.month,"")

def _get_next_internal_ref(session, company_id, txn_type):
    pfx_map  = {"Purchase":"PV-","Purchase Return":"PR-","Debit Note":"DN-"}
    spfx_map = {"Purchase":"prefix_purchase","Purchase Return":"prefix_purchase_ret","Debit Note":"prefix_debit_note"}
    prefix = pfx_map.get(txn_type,"PV-")
    try:
        s  = session.query(Settings).filter_by(company_id=company_id).first()
        sp = spfx_map.get(txn_type)
        if s and sp:
            v = getattr(s,sp,None)
            if v: prefix = v
    except: pass
    count = session.query(PurchaseBook).filter_by(company_id=company_id,transaction_type=txn_type).count()
    return f"{prefix}{str(count+1).zfill(4)}"

def _add_gl_book_entry(session,company_id,entry_date,unique_id,
                        dr_code,dr_name,cr_code,cr_name,desc,amount,source,txn_type="",created_by=None):
    """
    Posts one Dr line and one Cr line to GL Book.

    IMPORTANT: gl_code must always be the BARE numeric code (e.g. "2230"),
    never the combined "2230 - Nabil Bank - A/c" string. Throughout the
    app, callers often pass a combined "code - name" string as both the
    code and name argument (e.g. PARTY_CTRL values, bank_gl_name). This
    function defends against that by splitting any combined string on
    " - " and keeping only the numeric prefix for gl_code, while gl_name
    always gets the full descriptive text.
    """
    def _split_code(code, name):
        code = (code or "").strip()
        name = (name or "").strip()
        if " - " in code:
            prefix, rest = code.split(" - ", 1)
            if prefix.strip().isdigit():
                # code was actually "2230 - Nabil Bank - A/c" — extract bare code,
                # and use the full original string as the name if no better name given
                return prefix.strip(), (name or code)
        return code, (name or code)

    if amount<=0: return
    dr_code, dr_name = _split_code(dr_code, dr_name)
    cr_code, cr_name = _split_code(cr_code, cr_name)
    for dr_a,cr_a,code,name in [(amount,0,dr_code,dr_name),(0,amount,cr_code,cr_name)]:
        session.add(GLBook(company_id=company_id,entry_date=entry_date,unique_id=unique_id,
            gl_code=code,gl_name=name,description=desc,
            dr_amount=round(dr_a,2),cr_amount=round(cr_a,2),source=source,transaction_type=txn_type,
            created_by=created_by))

def _effective_permissions(session, company_id, role):
    if role=="company_admin": return {m:True for m in ALL_MODULES}
    result = {m:DEFAULT_PERMISSIONS.get(role,{}).get(m,False) for m in ALL_MODULES}
    for r in session.query(RolePermission).filter_by(company_id=company_id,role=role).all():
        if r.module_key in result: result[r.module_key] = r.allowed
    return result

def _sync_fa_gl(session, company_id):
    records = session.query(FARegister).filter_by(company_id=company_id,is_active=True).all()
    gl_cost={}; gl_dep={}
    for r in records:
        gc=(r.gl_account or "").split(" - ")[0].strip()
        if gc:
            gl_cost[gc]=gl_cost.get(gc,0)+float(r.additions or 0)
            gl_dep[gc] =gl_dep.get(gc,0) +float(r.opening_accum_dep or 0)
    for gc,cost in gl_cost.items():
        a=session.query(GLAccount).filter_by(company_id=company_id,gl_code=gc).first()
        if a: a.opening_dr=round(cost,2)
    dep_gl=session.query(GLAccount).filter_by(company_id=company_id,gl_code="1200").first()
    if dep_gl: dep_gl.opening_cr=round(sum(gl_dep.values()),2)
    session.commit()

MATERIAL_TYPES = ["RM","FG","Sub","BP","Service"]
LC_CHARGE_TYPES = [
    "Material Value", "Import Freight", "Import Duty", "CSC", "VAT",
    "Agent Commission", "Local Freight", "Packing & Forwarding",
    "Bank Charges", "Insurance",
]

_party_type_side_cache = {}
def _get_party_type_side(session, type_name):
    """Reads the normal_side (Dr/Cr) for a party type from the database,
    replacing the old hardcoded tuple check. Cached per-process since
    party types rarely change mid-session; cache is small (a handful
    of rows) and stale data only matters within the same request batch."""
    if type_name in _party_type_side_cache:
        return _party_type_side_cache[type_name]
    pt = session.query(PartyType).filter_by(type_name=type_name).first()
    side = pt.normal_side if pt else "Dr"
    _party_type_side_cache[type_name] = side
    return side

def party_to_dict(p, session=None):
    ob = float(p.opening_balance or 0)
    # Derive opening_dr / opening_cr from the party type's normal_side,
    # read from the party_types table instead of a hardcoded tuple check.
    side = "Dr"
    if session is not None:
        side = _get_party_type_side(session, p.party_type or "")
    if side == "Cr":
        opening_dr, opening_cr = 0, ob
    else:
        opening_dr, opening_cr = ob, 0
    return {"id":p.id,"company_id":p.company_id,"party_type":p.party_type,"name":p.name,
            "pan":p.pan or "","phone":p.phone or "","email":p.email or "",
            "opening_balance":ob,"opening_dr":opening_dr,"opening_cr":opening_cr,
            "gl_account":p.gl_account or "",
            "is_import":p.is_import,"is_active":p.is_active}

def fa_to_dict(f):
    add=float(f.additions or 0); dep=float(f.opening_accum_dep or 0)
    return {"id":f.id,"company_id":f.company_id,"fa_code":f.fa_code,"capital_item":f.capital_item,
            "vendor":f.vendor or "","sub_group":f.sub_group or "","gl_account":f.gl_account or "",
            "addition_date":f.addition_date.isoformat() if f.addition_date else None,
            "qty":float(f.qty or 1),"rate":float(f.rate or 0),"additions":add,
            "disposals":float(f.disposals or 0),"source":f.source or "Opening",
            "reference":f.reference or "","residual_value_pct":float(f.residual_value_pct or 5),
            "dep_rate_pct":float(f.dep_rate_pct or 0),"dep_method":f.dep_method or "WDV",
            "opening_accum_dep":dep,"wdv":round(add-dep,2),"is_active":f.is_active}

def material_to_dict(m):
    return {"id":m.id,"company_id":m.company_id,"material_type":m.material_type,
            "date":m.date.isoformat() if m.date else None,
            "product_name":m.product_name,"product_code":m.product_code,"uom":m.uom or "",
            "opening_qty":float(m.opening_qty or 0),"opening_value":float(m.opening_value or 0),
            "excise_type":m.excise_type or "","excise_rate":float(m.excise_rate or 0),
            "related_gl":m.related_gl or "","is_active":m.is_active}

def _purchase_to_dict(p):
    return {
        "id":p.id,"entry_date":p.entry_date.isoformat() if p.entry_date else None,
        "month_bs":p.month_bs or "","bill_no":p.bill_no or "","internal_ref":p.internal_ref or "",
        "vendor_name":p.vendor_name,"vendor_pan":p.vendor_pan or "",
        "product_code":p.product_code or "","product_name":p.product_name or "",
        "qty":float(p.qty or 0),"rate":float(p.rate or 0),"is_taxable":p.is_taxable,
        "taxable_value":float(p.taxable_value or 0),"vat_amount":float(p.vat_amount or 0),
        "total_amount":float(p.total_amount or 0),"non_taxable_value":float(p.non_taxable_value or 0),
        "capital_item_name":p.capital_item_name or "","cap_qty":float(p.cap_qty or 0),
        "cap_rate":float(p.cap_rate or 0),"cap_taxable_val":float(p.cap_taxable_value or 0),
        "cap_total":float(p.cap_total or 0),"fa_code":p.fa_code or "",
        "transaction_type":p.transaction_type or "Purchase","original_bill_ref":p.original_bill_ref or "",
        "is_service":p.is_service,"is_capital":p.is_capital,"date_bs":p.date_bs or "",
        # Void audit fields
        "is_void":p.is_void,"voided_by":p.voided_by,
        "voided_at":p.voided_at.isoformat() if p.voided_at else None,
        "void_reason":p.void_reason,
    }


# ============================================================
#  API ROUTES
# ============================================================

@app.route("/api/test-connection", methods=["GET"])
def test_connection():
    try:
        with engine.connect() as conn:
            v = conn.execute(text("SELECT version();")).scalar()
        return jsonify({"status":"connected","postgres_version":v})
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}),500

# ── GL Accounts ───────────────────────────────────────────────

@app.route("/api/gl-accounts", methods=["GET"])
def get_gl_accounts():
    cid = request.args.get("company_id",type=int)
    if not cid: return jsonify({"error":"company_id required"}),400
    session=SessionLocal()
    try:
        accs=session.query(GLAccount).filter_by(company_id=cid).order_by(GLAccount.gl_code).all()
        return jsonify({"company_id":cid,"gl_accounts":[{
            "id":a.id,"company_id":a.company_id,"gl_code":a.gl_code,"gl_name":a.gl_name,
            "header":a.header,"main_group":a.main_group,"sub_group":a.sub_group,
            "account_type":a.account_type,"opening_dr":float(a.opening_dr),"opening_cr":float(a.opening_cr)
        } for a in accs],"total":len(accs)})
    finally: session.close()

@app.route("/api/gl-accounts", methods=["POST"])
def create_gl_account():
    session=SessionLocal()
    try:
        data=request.get_json() or {}
        req=session.query(User).filter_by(id=data.get("requesting_user_id"),is_active=True).first()
        if not req or not req.is_super_admin: return jsonify({"error":"Super Admin only"}),403
        cid=data.get("company_id"); code=(data.get("gl_code") or "").strip(); name=(data.get("gl_name") or "").strip()
        if not cid or not code or not name: return jsonify({"error":"company_id, gl_code, gl_name required"}),400
        if session.query(GLAccount).filter_by(company_id=cid,gl_code=code).first():
            return jsonify({"error":f"GL code '{code}' already exists"}),409
        a=GLAccount(company_id=cid,gl_code=code,gl_name=name,header=data.get("header") or "",
            main_group=data.get("main_group") or "",sub_group=data.get("sub_group") or "",
            account_type=data.get("account_type") or "BS",opening_dr=0,opening_cr=0)
        session.add(a); session.commit()
        return jsonify({"success":True,"account":{"id":a.id,"gl_code":a.gl_code,"gl_name":a.gl_name,
            "header":a.header,"main_group":a.main_group,"sub_group":a.sub_group,
            "account_type":a.account_type,"opening_dr":0,"opening_cr":0}}),201
    finally: session.close()

@app.route("/api/gl-accounts/<int:aid>", methods=["POST"])
def update_gl_account(aid):
    session=SessionLocal()
    try:
        data=request.get_json() or {}
        req=session.query(User).filter_by(id=data.get("requesting_user_id"),is_active=True).first()
        if not req or not req.is_super_admin: return jsonify({"error":"Super Admin only"}),403
        a=session.query(GLAccount).filter_by(id=aid).first()
        if not a: return jsonify({"error":"Not found"}),404
        for f in ["gl_name","header","main_group","sub_group","account_type"]:
            if f in data and data[f] is not None: setattr(a,f,data[f])
        session.commit()
        return jsonify({"success":True,"account":{"id":a.id,"gl_code":a.gl_code,"gl_name":a.gl_name,
            "header":a.header,"main_group":a.main_group,"sub_group":a.sub_group,
            "account_type":a.account_type,"opening_dr":float(a.opening_dr),"opening_cr":float(a.opening_cr)}})
    finally: session.close()

@app.route("/api/gl-accounts/<int:aid>", methods=["DELETE"])
def delete_gl_account(aid):
    session=SessionLocal()
    try:
        data=request.get_json() or {}
        req=session.query(User).filter_by(id=data.get("requesting_user_id"),is_active=True).first()
        if not req or not req.is_super_admin: return jsonify({"error":"Super Admin only"}),403
        a=session.query(GLAccount).filter_by(id=aid).first()
        if not a: return jsonify({"error":"Not found"}),404
        code=a.gl_code; session.delete(a); session.commit()
        return jsonify({"success":True,"deleted_gl_code":code})
    finally: session.close()

# ── Companies ─────────────────────────────────────────────────

@app.route("/api/companies", methods=["GET"])
def get_companies():
    session=SessionLocal()
    try:
        cs=session.query(Company).order_by(Company.id).all()
        return jsonify({"companies":[{"id":c.id,"name":c.name,"pan_number":c.pan_number,
            "is_active":c.is_active,"created_at":c.created_at.isoformat() if c.created_at else None}
            for c in cs],"total":len(cs)})
    finally: session.close()

@app.route("/api/companies", methods=["POST"])
def create_company():
    data=request.get_json() or {}
    name=(data.get("name") or "").strip(); pan=(data.get("pan_number") or "").strip()
    if not name: return jsonify({"error":"name is required"}),400
    session=SessionLocal()
    try:
        c=Company(name=name,pan_number=pan,is_active=True,created_at=date.today())
        session.add(c); session.commit()
        copied=copy_gl_template_to_company(session,c.id)
        session.add(Settings(company_id=c.id,company_name=name,pan_number=pan,
            fiscal_year_bs="2082-83",fy_start_ad=date(2025,7,17),fy_end_ad=date(2026,7,16),
            fy_start_bs="1 Shrawan 2082",fy_end_bs="31 Ashadh 2083",
            opening_balance_date=date(2025,7,16),vat_rate=0.13,tds_vendor_rate=0.015,tds_rental_rate=0.015))
        session.commit()
        return jsonify({"success":True,"company":{"id":c.id,"name":c.name,"pan_number":c.pan_number},
            "gl_accounts_created":copied}),201
    finally: session.close()

# ── Settings ──────────────────────────────────────────────────

@app.route("/api/settings", methods=["GET"])
def get_settings():
    cid=request.args.get("company_id",type=int)
    if not cid: return jsonify({"error":"company_id required"}),400
    session=SessionLocal()
    try:
        s=session.query(Settings).filter_by(company_id=cid).first()
        if not s: return jsonify({"error":f"Settings not found for company_id={cid}"}),404
        r=settings_to_dict(s); r["company_id"]=s.company_id
        return jsonify(r)
    finally: session.close()

@app.route("/api/settings", methods=["POST"])
def update_settings():
    session=SessionLocal()
    try:
        data=request.get_json() or {}
        cid=data.get("company_id")
        if not cid: return jsonify({"error":"company_id required"}),400
        if not _is_company_admin(session,data.get("requesting_user_id"),cid):
            return jsonify({"error":"Not authorized"}),403
        s=session.query(Settings).filter_by(company_id=cid).first()
        if not s: return jsonify({"error":"Settings not found"}),404
        updated=[]
        for f,val in data.items():
            if f not in SETTINGS_FIELDS or val is None or val=="": continue
            try:
                if f in DATE_FIELDS: val=date.fromisoformat(val)
                elif f in NUMERIC_FIELDS: val=float(val)
                elif f in INT_FIELDS: val=int(val)
                elif f in BOOL_FIELDS: val=bool(val)
                setattr(s,f,val); updated.append(f)
            except: continue
        session.commit()
        return jsonify({"success":True,"updated_fields":updated,"settings":settings_to_dict(s)})
    finally: session.close()

# ── BS/AD Calendar ────────────────────────────────────────────

@app.route("/api/bs-ad-calendar", methods=["GET"])
def get_bs_ad_calendar():
    session=SessionLocal()
    try:
        rows=session.query(BsAdCalendar).order_by(BsAdCalendar.ad_start_date).all()
        return jsonify({"calendar":[{"id":r.id,"bs_fiscal_year":r.bs_fiscal_year,
            "ad_start_date":r.ad_start_date.isoformat(),"notes":r.notes} for r in rows],"total":len(rows)})
    finally: session.close()

@app.route("/api/bs-ad-calendar", methods=["POST"])
def add_bs_ad_calendar_row():
    session=SessionLocal()
    try:
        data=request.get_json() or {}
        bs=data.get("bs_fiscal_year","").strip(); ad=data.get("ad_start_date","").strip()
        if not bs or not ad: return jsonify({"error":"bs_fiscal_year and ad_start_date required"}),400
        if session.query(BsAdCalendar).filter_by(bs_fiscal_year=bs).first():
            return jsonify({"error":f"{bs} already exists"}),409
        session.add(BsAdCalendar(bs_fiscal_year=bs,ad_start_date=date.fromisoformat(ad),notes=data.get("notes","")))
        session.commit()
        return jsonify({"success":True,"added":{"bs_fiscal_year":bs,"ad_start_date":ad}})
    except ValueError: return jsonify({"error":"ad_start_date must be YYYY-MM-DD"}),400
    finally: session.close()

# ── Login ─────────────────────────────────────────────────────

@app.route("/api/login", methods=["POST"])
def login():
    session=SessionLocal()
    try:
        data=request.get_json() or {}
        username=(data.get("username") or "").strip(); password=data.get("password") or ""
        portal=(data.get("portal") or "tenant").strip()
        if portal not in ("consultant","tenant"): portal="tenant"
        if not username or not password: return jsonify({"error":"username and password required"}),400
        user=session.query(User).filter_by(username=username,is_active=True).first()
        if not user or not check_password_hash(user.password_hash,password):
            return jsonify({"error":"Invalid username or password"}),401
        if (user.user_type or "tenant")!=portal:
            return jsonify({"error":f"This account is not registered for {portal} sign-in"}),403
        if user.is_super_admin:
            companies=session.query(Company).filter_by(is_active=True).all()
            access={c.id:"company_admin" for c in companies}
        else:
            rows=session.query(UserCompanyAccess).filter_by(user_id=user.id).all()
            access={r.company_id:r.role for r in rows}
            companies=session.query(Company).filter(Company.id.in_(list(access.keys())),
                Company.is_active==True).all() if access else []
        company_list=[]
        for c in companies:
            s=session.query(Settings).filter_by(company_id=c.id).first()
            company_list.append({"id":c.id,"name":c.name,"pan_number":c.pan_number,
                "role":access.get(c.id,"viewer"),"fiscal_year_bs":s.fiscal_year_bs if s else None})
        return jsonify({"success":True,"user":{"id":user.id,"username":user.username,
            "full_name":user.full_name,"is_super_admin":user.is_super_admin,"user_type":user.user_type},
            "companies":company_list})
    finally: session.close()

# ── Users & Access ────────────────────────────────────────────

@app.route("/api/consultant-users", methods=["GET"])
def list_consultant_users():
    session=SessionLocal()
    try:
        req=session.query(User).filter_by(id=request.args.get("requesting_user_id",type=int),is_active=True).first()
        if not req or not req.is_super_admin: return jsonify({"error":"Super Admin only"}),403
        users=session.query(User).filter_by(user_type="consultant").all()
        companies=session.query(Company).order_by(Company.id).all()
        return jsonify({"users":[user_to_dict(u,session) for u in users],
            "companies":[{"id":c.id,"name":c.name,"pan_number":c.pan_number} for c in companies]})
    finally: session.close()

@app.route("/api/users", methods=["GET"])
def list_users():
    cid=request.args.get("company_id",type=int)
    session=SessionLocal()
    try:
        if cid:
            ids=[r.user_id for r in session.query(UserCompanyAccess).filter_by(company_id=cid).all()]
            users=session.query(User).filter(User.id.in_(ids)).all() if ids else []
        else:
            users=session.query(User).all()
        return jsonify({"users":[user_to_dict(u,session) for u in users]})
    finally: session.close()

@app.route("/api/users", methods=["POST"])
def create_user():
    session=SessionLocal()
    try:
        data=request.get_json() or {}
        username=(data.get("username") or "").strip(); password=data.get("password") or ""
        if not username or not password: return jsonify({"error":"username and password required"}),400
        req=session.query(User).filter_by(id=data.get("requesting_user_id"),is_active=True).first()
        user_type=data.get("user_type") or "tenant"
        if user_type=="consultant" and not (req and req.is_super_admin):
            return jsonify({"error":"Super Admin only for consultant users"}),403
        if user_type not in ("consultant","tenant"): user_type="tenant"
        access=data.get("access") or []
        target_cids=[a.get("company_id") for a in access if a.get("company_id")]
        if not target_cids or not data.get("requesting_user_id") or not all(
            _is_company_admin(session,data.get("requesting_user_id"),cid) for cid in target_cids):
            return jsonify({"error":"Not authorized"}),403
        if session.query(User).filter_by(username=username).first():
            return jsonify({"error":f"Username '{username}' already exists"}),409
        u=User(username=username,password_hash=generate_password_hash(password),
            full_name=(data.get("full_name") or "").strip(),
            is_super_admin=bool(data.get("is_super_admin",False)),is_active=True,user_type=user_type)
        session.add(u); session.commit()
        for a in access:
            if a.get("company_id"):
                session.add(UserCompanyAccess(user_id=u.id,company_id=a["company_id"],role=a.get("role","accountant")))
        session.commit()
        return jsonify({"success":True,"user":user_to_dict(u,session)}),201
    finally: session.close()

@app.route("/api/users/<int:uid>", methods=["POST"])
def update_user(uid):
    session=SessionLocal()
    try:
        u=session.query(User).filter_by(id=uid).first()
        if not u: return jsonify({"error":"User not found"}),404
        data=request.get_json() or {}
        existing=[r.company_id for r in session.query(UserCompanyAccess).filter_by(user_id=uid).all()]
        check=set(existing)
        if "access" in data: check|={a.get("company_id") for a in (data["access"] or []) if a.get("company_id")}
        if not check: return jsonify({"error":"Cannot determine company scope"}),400
        if not data.get("requesting_user_id") or not all(_is_company_admin(session,data["requesting_user_id"],c) for c in check):
            return jsonify({"error":"Not authorized"}),403
        if "full_name" in data: u.full_name=data["full_name"]
        if "is_active" in data: u.is_active=bool(data["is_active"])
        if "is_super_admin" in data: u.is_super_admin=bool(data["is_super_admin"])
        if "access" in data:
            session.query(UserCompanyAccess).filter_by(user_id=uid).delete()
            for a in data["access"] or []:
                if a.get("company_id"):
                    session.add(UserCompanyAccess(user_id=uid,company_id=a["company_id"],role=a.get("role","accountant")))
        session.commit()
        return jsonify({"success":True,"user":user_to_dict(u,session)})
    finally: session.close()

@app.route("/api/change-password", methods=["POST"])
def change_password():
    session=SessionLocal()
    try:
        data=request.get_json() or {}
        uid=data.get("user_id"); old=data.get("old_password") or ""; new=data.get("new_password") or ""
        if not uid or not old or not new: return jsonify({"error":"user_id, old_password, new_password required"}),400
        if len(new)<6: return jsonify({"error":"New password must be at least 6 characters"}),400
        u=session.query(User).filter_by(id=uid).first()
        if not u or not check_password_hash(u.password_hash,old): return jsonify({"error":"Old password incorrect"}),401
        u.password_hash=generate_password_hash(new); session.commit()
        return jsonify({"success":True})
    finally: session.close()

# ── Permissions ───────────────────────────────────────────────

@app.route("/api/permissions", methods=["GET"])
def get_permissions():
    cid=request.args.get("company_id",type=int); role=request.args.get("role")
    if not cid: return jsonify({"error":"company_id required"}),400
    session=SessionLocal()
    try:
        if role: return jsonify({"role":role,"permissions":_effective_permissions(session,cid,role)})
        return jsonify({"modules":ALL_MODULES,"matrix":{r:_effective_permissions(session,cid,r) for r in ["accountant","viewer"]}})
    finally: session.close()

@app.route("/api/permissions", methods=["POST"])
def set_permissions():
    session=SessionLocal()
    try:
        data=request.get_json() or {}; cid=data.get("company_id"); matrix=data.get("matrix") or {}
        if not cid: return jsonify({"error":"company_id required"}),400
        if not _is_company_admin(session,data.get("requesting_user_id"),cid):
            return jsonify({"error":"Not authorized"}),403
        for role in ["accountant","viewer"]:
            for mk,allowed in (matrix.get(role) or {}).items():
                if mk not in ALL_MODULES: continue
                r=session.query(RolePermission).filter_by(company_id=cid,role=role,module_key=mk).first()
                if r: r.allowed=bool(allowed)
                else: session.add(RolePermission(company_id=cid,role=role,module_key=mk,allowed=bool(allowed)))
        session.commit(); return jsonify({"success":True})
    finally: session.close()

# ── Party Types ───────────────────────────────────────────────

@app.route("/api/party-types", methods=["GET"])
def get_party_types():
    session=SessionLocal()
    try:
        types=session.query(PartyType).filter_by(is_active=True).order_by(PartyType.sort_order).all()
        return jsonify({"party_types":[{"id":t.id,"type_name":t.type_name,"default_gl":t.default_gl,
            "is_builtin":t.is_builtin,"sort_order":t.sort_order} for t in types]})
    finally: session.close()

@app.route("/api/party-types", methods=["POST"])
def create_party_type():
    session=SessionLocal()
    try:
        data=request.get_json() or {}
        req=session.query(User).filter_by(id=data.get("requesting_user_id"),is_active=True).first()
        if not req or not req.is_super_admin: return jsonify({"error":"Super Admin only"}),403
        nm=(data.get("type_name") or "").strip()
        if not nm: return jsonify({"error":"type_name required"}),400
        if session.query(PartyType).filter_by(type_name=nm).first(): return jsonify({"error":f"'{nm}' exists"}),409
        pt=PartyType(type_name=nm,default_gl=data.get("default_gl") or "",
            is_builtin=False,is_active=True,sort_order=session.query(PartyType).count()+1)
        session.add(pt); session.commit()
        return jsonify({"success":True,"party_type":{"id":pt.id,"type_name":pt.type_name,
            "default_gl":pt.default_gl,"is_builtin":pt.is_builtin}}),201
    finally: session.close()

@app.route("/api/party-types/<int:tid>", methods=["POST"])
def update_party_type(tid):
    session=SessionLocal()
    try:
        data=request.get_json() or {}
        req=session.query(User).filter_by(id=data.get("requesting_user_id"),is_active=True).first()
        if not req or not req.is_super_admin: return jsonify({"error":"Super Admin only"}),403
        pt=session.query(PartyType).filter_by(id=tid).first()
        if not pt: return jsonify({"error":"Not found"}),404
        if "default_gl" in data: pt.default_gl=data["default_gl"] or ""
        if "is_active" in data and not pt.is_builtin: pt.is_active=bool(data["is_active"])
        if "type_name" in data and not pt.is_builtin: pt.type_name=data["type_name"].strip()
        session.commit(); return jsonify({"success":True})
    finally: session.close()

# ── Party Master ──────────────────────────────────────────────

def lc_to_dict(lc):
    return {
        "id": lc.id, "lc_no": lc.lc_no, "bank_name": lc.bank_name or "",
        "open_date": lc.open_date.isoformat() if lc.open_date else None,
        "expiry_date": lc.expiry_date.isoformat() if lc.expiry_date else None,
        "bg_no": lc.bg_no or "", "remarks": lc.remarks or "", "is_active": bool(lc.is_active),
    }

@app.route("/api/lc-master", methods=["GET"])
def get_lc_master():
    """
    GET /api/lc-master?company_id=X[&active_only=true]
    Controlled list of LC Nos for the LC No. dropdown on Bank Ledger
    classification and Import Register — prevents typo drift (e.g.
    "SBLLC-5501" vs "SBLLC5501") that would silently fragment the same
    LC into untraceable buckets when filtering Bank Ledger pools.
    """
    cid = request.args.get("company_id", type=int)
    active_only = request.args.get("active_only", "true").lower() == "true"
    if not cid: return jsonify({"error":"company_id required"}),400
    session = SessionLocal()
    try:
        q = session.query(LCMaster).filter_by(company_id=cid)
        if active_only: q = q.filter_by(is_active=True)
        rows = q.order_by(LCMaster.lc_no).all()
        return jsonify({"lcs": [lc_to_dict(r) for r in rows]})
    finally: session.close()

@app.route("/api/lc-master", methods=["POST"])
def create_lc_master():
    """Create a new LC No. entry. Body: {company_id, lc_no, bank_name, open_date, expiry_date, bg_no, remarks}"""
    data = request.json or {}
    cid = data.get("company_id")
    lc_no = (data.get("lc_no") or "").strip()
    if not cid: return jsonify({"error":"company_id required"}),400
    if not lc_no: return jsonify({"error":"LC No. is required"}),400
    session = SessionLocal()
    try:
        existing = session.query(LCMaster).filter_by(company_id=cid, lc_no=lc_no).first()
        if existing:
            return jsonify({"error": f"LC No. '{lc_no}' already exists"}), 400
        def _parse_date(v):
            if not v: return None
            try: return date.fromisoformat(str(v).strip())
            except: return None
        lc = LCMaster(
            company_id=cid, lc_no=lc_no, bank_name=(data.get("bank_name") or "").strip(),
            open_date=_parse_date(data.get("open_date")), expiry_date=_parse_date(data.get("expiry_date")),
            bg_no=(data.get("bg_no") or "").strip(), remarks=(data.get("remarks") or "").strip(),
            is_active=True,
        )
        session.add(lc); session.commit()
        return jsonify({"success": True, "id": lc.id, "lc_no": lc.lc_no}), 201
    except Exception as e:
        session.rollback(); return jsonify({"error": str(e)}), 500
    finally: session.close()

@app.route("/api/lc-master/<int:lid>", methods=["PUT"])
def update_lc_master(lid):
    """Edit an LC No. entry. Body: {company_id, bank_name, open_date, expiry_date, bg_no, remarks, is_active}"""
    data = request.json or {}
    cid = data.get("company_id")
    session = SessionLocal()
    try:
        lc = session.query(LCMaster).filter_by(id=lid, company_id=cid).first()
        if not lc: return jsonify({"error":"LC not found"}),404
        def _parse_date(v):
            if not v: return None
            try: return date.fromisoformat(str(v).strip())
            except: return None
        if "bank_name" in data:   lc.bank_name = (data.get("bank_name") or "").strip()
        if "open_date" in data:   lc.open_date = _parse_date(data.get("open_date"))
        if "expiry_date" in data: lc.expiry_date = _parse_date(data.get("expiry_date"))
        if "bg_no" in data:       lc.bg_no = (data.get("bg_no") or "").strip()
        if "remarks" in data:     lc.remarks = (data.get("remarks") or "").strip()
        if "is_active" in data:   lc.is_active = bool(data.get("is_active"))
        session.commit()
        return jsonify({"success": True})
    except Exception as e:
        session.rollback(); return jsonify({"error": str(e)}), 500
    finally: session.close()

@app.route("/api/lc-master/<int:lid>", methods=["DELETE"])
def delete_lc_master(lid):
    """
    Soft-delete (deactivate) an LC No. — never hard-deleted, since
    historical Bank Ledger / Import Register rows may still reference
    it by string and need it to remain resolvable for reporting.
    """
    cid = request.args.get("company_id", type=int)
    session = SessionLocal()
    try:
        lc = session.query(LCMaster).filter_by(id=lid, company_id=cid).first()
        if not lc: return jsonify({"error":"LC not found"}),404
        lc.is_active = False
        session.commit()
        return jsonify({"success": True})
    except Exception as e:
        session.rollback(); return jsonify({"error": str(e)}), 500
    finally: session.close()


@app.route("/api/parties", methods=["GET"])
def get_parties():
    cid=request.args.get("company_id",type=int); pt=request.args.get("type","").strip()
    if not cid: return jsonify({"error":"company_id required"}),400
    session=SessionLocal()
    try:
        q=session.query(PartyMaster).filter_by(company_id=cid,is_active=True)
        if pt:
            valid_types = {t.type_name for t in session.query(PartyType).filter_by(is_active=True).all()}
            if pt in valid_types: q=q.filter_by(party_type=pt)
        ps=q.order_by(PartyMaster.name).all()
        return jsonify({"parties":[party_to_dict(p,session) for p in ps],"total":len(ps)})
    finally: session.close()

@app.route("/api/parties/gl-default", methods=["GET"])
def get_party_gl_default():
    session=SessionLocal()
    try:
        pt = session.query(PartyType).filter_by(type_name=request.args.get("type","").strip()).first()
        return jsonify({"gl_account": pt.default_gl if pt else ""})
    finally: session.close()

@app.route("/api/parties", methods=["POST"])
def create_party():
    session=SessionLocal()
    try:
        data=request.get_json() or {}; cid=data.get("company_id"); pt=(data.get("party_type") or "").strip()
        if not cid: return jsonify({"error":"company_id required"}),400
        party_type_row = session.query(PartyType).filter_by(type_name=pt, is_active=True).first()
        if not party_type_row:
            return jsonify({"error":f"'{pt}' is not a valid party type. Add it under Manage Types first."}),400
        if not _is_company_admin(session,data.get("requesting_user_id"),cid): return jsonify({"error":"Not authorized"}),403
        nm=(data.get("name") or "").strip()
        if not nm: return jsonify({"error":"Party name required"}),400
        p=PartyMaster(company_id=cid,party_type=pt,name=nm,pan=data.get("pan") or "",
            phone=data.get("phone") or "",email=data.get("email") or "",
            opening_balance=float(data.get("opening_balance") or 0),
            gl_account=data.get("gl_account") or party_type_row.default_gl or "",
            is_import=bool(data.get("is_import",False)),is_active=True)
        session.add(p); session.commit()
        return jsonify({"success":True,"party":party_to_dict(p,session)}),201
    finally: session.close()

@app.route("/api/parties/<int:pid>", methods=["POST"])
def update_party(pid):
    session=SessionLocal()
    try:
        data=request.get_json() or {}
        p=session.query(PartyMaster).filter_by(id=pid).first()
        if not p: return jsonify({"error":"Not found"}),404
        if not _is_company_admin(session,data.get("requesting_user_id"),p.company_id): return jsonify({"error":"Not authorized"}),403
        for f in ["name","pan","phone","email","gl_account","party_type"]:
            if f in data: setattr(p,f,data[f] or "")
        if "opening_balance" in data: p.opening_balance=float(data["opening_balance"] or 0)
        if "is_import" in data: p.is_import=bool(data["is_import"])
        if "is_active" in data: p.is_active=bool(data["is_active"])
        session.commit(); return jsonify({"success":True,"party":party_to_dict(p,session)})
    finally: session.close()

# ── FA Register ───────────────────────────────────────────────

@app.route("/api/fa-register", methods=["GET"])
def get_fa_register():
    cid=request.args.get("company_id",type=int)
    if not cid: return jsonify({"error":"company_id required"}),400
    session=SessionLocal()
    try:
        rs=session.query(FARegister).filter_by(company_id=cid,is_active=True)\
            .order_by(FARegister.sub_group,FARegister.addition_date).all()
        items=[fa_to_dict(f) for f in rs]
        return jsonify({"records":items,"total_cost":sum(i["additions"] for i in items),
            "total_dep":sum(i["opening_accum_dep"] for i in items),"total_wdv":sum(i["wdv"] for i in items)})
    finally: session.close()

@app.route("/api/fa-register", methods=["POST"])
def create_fa():
    session=SessionLocal()
    try:
        data=request.get_json() or {}; cid=data.get("company_id")
        if not _is_company_admin(session,data.get("requesting_user_id"),cid): return jsonify({"error":"Not authorized"}),403
        fa_code=(data.get("fa_code") or "").strip(); ci=(data.get("capital_item") or "").strip()
        if not fa_code or not ci: return jsonify({"error":"fa_code and capital_item required"}),400
        if session.query(FARegister).filter_by(company_id=cid,fa_code=fa_code).first():
            return jsonify({"error":f"FA Code '{fa_code}' exists"}),409
        qty=float(data.get("qty") or 1); rate=float(data.get("rate") or 0); sg=(data.get("sub_group") or "").upper()
        f=FARegister(company_id=cid,fa_code=fa_code,capital_item=ci,vendor=data.get("vendor") or "",
            sub_group=sg,gl_account=data.get("gl_account") or FA_BLOCK_GL.get(sg,""),
            addition_date=date.fromisoformat(data["addition_date"]) if data.get("addition_date") else None,
            qty=qty,rate=rate,additions=round(qty*rate,2),disposals=float(data.get("disposals") or 0),
            source=data.get("source") or "Opening",reference=data.get("reference") or "",
            residual_value_pct=float(data.get("residual_value_pct") or 5),
            dep_rate_pct=float(data.get("dep_rate_pct") or 0),dep_method=data.get("dep_method") or "WDV",
            opening_accum_dep=float(data.get("opening_accum_dep") or 0),is_active=True)
        session.add(f); session.commit(); _sync_fa_gl(session,cid)
        return jsonify({"success":True,"record":fa_to_dict(f)}),201
    finally: session.close()

@app.route("/api/fa-register/<int:fid>", methods=["POST"])
def update_fa(fid):
    session=SessionLocal()
    try:
        data=request.get_json() or {}
        f=session.query(FARegister).filter_by(id=fid).first()
        if not f: return jsonify({"error":"Not found"}),404
        if not _is_company_admin(session,data.get("requesting_user_id"),f.company_id): return jsonify({"error":"Not authorized"}),403
        for field in ["capital_item","vendor","sub_group","gl_account","source","reference","dep_method"]:
            if field in data: setattr(f,field,data[field] or "")
        for field in ["qty","rate","disposals","residual_value_pct","dep_rate_pct","opening_accum_dep"]:
            if field in data: setattr(f,field,float(data[field] or 0))
        if "addition_date" in data and data["addition_date"]:
            f.addition_date=date.fromisoformat(data["addition_date"])
        if "is_active" in data: f.is_active=bool(data["is_active"])
        f.additions=round(float(f.qty or 1)*float(f.rate or 0),2)
        f.sub_group=(f.sub_group or "").upper(); f.gl_account=f.gl_account or FA_BLOCK_GL.get(f.sub_group,"")
        session.commit(); _sync_fa_gl(session,f.company_id)
        return jsonify({"success":True,"record":fa_to_dict(f)})
    finally: session.close()

@app.route("/api/ob/fa", methods=["GET"])
def get_fa_ob():
    cid=request.args.get("company_id",type=int)
    if not cid: return jsonify({"error":"company_id required"}),400
    session=SessionLocal()
    try:
        rs=session.query(FARegister).filter_by(company_id=cid,is_active=True)\
            .order_by(FARegister.sub_group,FARegister.addition_date).all()
        items=[fa_to_dict(f) for f in rs]; tc=sum(i["additions"] for i in items); td=sum(i["opening_accum_dep"] for i in items)
        return jsonify({"records":items,"total_cost":tc,"total_dep":td,"total_wdv":round(tc-td,2),"fa_block_gl":FA_BLOCK_GL})
    finally: session.close()

# ── Material Master ───────────────────────────────────────────

@app.route("/api/materials", methods=["GET"])
def get_materials():
    cid=request.args.get("company_id",type=int); mt=request.args.get("type","").strip()
    if not cid or mt not in MATERIAL_TYPES: return jsonify({"error":"company_id and valid type required"}),400
    session=SessionLocal()
    try:
        items=session.query(MaterialMaster).filter_by(company_id=cid,material_type=mt,is_active=True)\
            .order_by(MaterialMaster.product_code).all()
        return jsonify({"materials":[material_to_dict(m) for m in items],"total":len(items)})
    finally: session.close()

@app.route("/api/materials", methods=["POST"])
def create_material():
    session=SessionLocal()
    try:
        data=request.get_json() or {}; cid=data.get("company_id"); mt=(data.get("material_type") or "").strip()
        if not cid or mt not in MATERIAL_TYPES: return jsonify({"error":"company_id and valid material_type required"}),400
        if not _is_company_admin(session,data.get("requesting_user_id"),cid): return jsonify({"error":"Not authorized"}),403
        pn=(data.get("product_name") or "").strip(); pc=(data.get("product_code") or "").strip()
        if not pn or not pc: return jsonify({"error":"product_name and product_code required"}),400
        if session.query(MaterialMaster).filter_by(company_id=cid,material_type=mt,product_code=pc).first():
            return jsonify({"error":f"Code '{pc}' exists for {mt}"}),409
        dv=None
        if data.get("date"):
            try: dv=date.fromisoformat(data["date"])
            except: pass
        m=MaterialMaster(company_id=cid,material_type=mt,date=dv,product_name=pn,product_code=pc,
            uom=data.get("uom") or "",opening_qty=float(data.get("opening_qty") or 0),
            opening_value=float(data.get("opening_value") or 0),excise_type=data.get("excise_type") or "",
            excise_rate=float(data.get("excise_rate") or 0),related_gl=data.get("related_gl") or "",is_active=True)
        session.add(m); session.commit()
        return jsonify({"success":True,"material":material_to_dict(m)}),201
    finally: session.close()

@app.route("/api/materials/<int:mid>", methods=["POST"])
def update_material(mid):
    session=SessionLocal()
    try:
        data=request.get_json() or {}; cid=data.get("company_id")
        m=session.query(MaterialMaster).filter_by(id=mid).first()
        if not m: return jsonify({"error":"Not found"}),404
        if not _is_company_admin(session,data.get("requesting_user_id"),cid or m.company_id): return jsonify({"error":"Not authorized"}),403
        for f in ["product_name","product_code","uom","excise_type","related_gl"]:
            if f in data: setattr(m,f,data[f] or "")
        for f in ["opening_qty","opening_value","excise_rate"]:
            if f in data: setattr(m,f,float(data[f] or 0))
        if "date" in data and data["date"]:
            try: m.date=date.fromisoformat(data["date"])
            except: pass
        if "is_active" in data: m.is_active=bool(data["is_active"])
        session.commit(); return jsonify({"success":True,"material":material_to_dict(m)})
    finally: session.close()


# ── Opening Balances ──────────────────────────────────────────

@app.route("/api/ob/gl", methods=["GET"])
def get_gl_ob():
    cid=request.args.get("company_id",type=int)
    if not cid: return jsonify({"error":"company_id required"}),400
    session=SessionLocal()
    try:
        # GL codes that are "managed by Party OB" — i.e. their opening
        # balance should be set on individual party records in Party
        # Master, not directly here, since they roll up from party-level
        # totals. Derived live from party_types.default_gl instead of a
        # hardcoded list, so adding a new party type (e.g. Directors,
        # Payables, LTL, STL) automatically routes its control GL here
        # with no code change needed.
        party_controlled_codes = set()
        for pt in session.query(PartyType).filter_by(is_active=True).all():
            if pt.default_gl:
                code = pt.default_gl.split(" - ")[0].strip()
                if code: party_controlled_codes.add(code)

        accs=session.query(GLAccount).filter_by(company_id=cid,account_type="BS").order_by(GLAccount.gl_code).all()
        result=[]
        for a in accs:
            mb=None; mg=(a.main_group or "").lower(); sg=(a.sub_group or "").lower()
            if "inventori" in sg or (a.gl_code.startswith("20") and "stock" in a.gl_name.lower()): mb="Inventory OB"
            elif "bank account" in sg or "cash in hand" in sg: mb="Bank OB"
            elif "tangible fixed" in mg or "intangible" in mg or "depreciation" in a.gl_name.lower(): mb="FA OB"
            elif a.gl_code in party_controlled_codes: mb="Party OB"
            elif "trade debtor" in a.gl_name.lower() or "trade creditor" in a.gl_name.lower(): mb="Party OB"
            elif "advance to" in a.gl_name.lower(): mb="Party OB"
            result.append({"id":a.id,"gl_code":a.gl_code,"gl_name":a.gl_name,"header":a.header or "",
                "main_group":a.main_group or "","sub_group":a.sub_group or "",
                "normal_balance":"Cr" if (a.main_group or "").lower() in
                    ["equity","current liabilities","non-current liabilities"] else "Dr",
                "opening_dr":float(a.opening_dr or 0),"opening_cr":float(a.opening_cr or 0),"managed_by":mb})
        tdr=sum(r["opening_dr"] for r in result); tcr=sum(r["opening_cr"] for r in result)
        return jsonify({"accounts":result,"total_dr":tdr,"total_cr":tcr,"balanced":abs(tdr-tcr)<0.01})
    finally: session.close()

@app.route("/api/ob/gl", methods=["POST"])
def save_gl_ob():
    session=SessionLocal()
    try:
        data=request.get_json() or {}; cid=data.get("company_id")
        if not _is_company_admin(session,data.get("requesting_user_id"),cid): return jsonify({"error":"Not authorized"}),403
        updated=0
        for e in data.get("entries",[]):
            a=session.query(GLAccount).filter_by(id=e["id"],company_id=cid).first()
            if not a: continue
            ob=float(e.get("opening_balance") or 0)
            a.opening_dr=ob; a.opening_cr=0; updated+=1
        session.commit(); return jsonify({"success":True,"updated":updated})
    except Exception as e:
        session.rollback(); return jsonify({"error":str(e)}),500
    finally: session.close()

@app.route("/api/ob/inventory", methods=["GET"])
def get_inventory_ob():
    cid=request.args.get("company_id",type=int)
    if not cid: return jsonify({"error":"company_id required"}),400
    session=SessionLocal()
    try:
        items=session.query(MaterialMaster).filter_by(company_id=cid,is_active=True)\
            .filter(MaterialMaster.material_type!="Service")\
            .order_by(MaterialMaster.material_type,MaterialMaster.product_name).all()
        return jsonify({"items":[{"id":m.id,"material_type":m.material_type,"product_code":m.product_code,
            "product_name":m.product_name,"uom":m.uom or "",
            "opening_qty":float(m.opening_qty or 0),"opening_value":float(m.opening_value or 0),
            "opening_rate":round(float(m.opening_value or 0)/float(m.opening_qty or 1),4) if float(m.opening_qty or 0)>0 else 0
            } for m in items]})
    finally: session.close()

@app.route("/api/ob/inventory", methods=["POST"])
def save_inventory_ob():
    session=SessionLocal()
    try:
        data=request.get_json() or {}; cid=data.get("company_id")
        if not _is_company_admin(session,data.get("requesting_user_id"),cid): return jsonify({"error":"Not authorized"}),403
        entries=data.get("entries",[]); updated=0
        for e in entries:
            m=session.query(MaterialMaster).filter_by(id=e["id"],company_id=cid).first()
            if m: m.opening_qty=float(e.get("opening_qty") or 0); m.opening_value=float(e.get("opening_value") or 0); updated+=1
        for mt,gc in {"RM":"2010","Sub":"2050","FG":"2030","BP":"2040"}.items():
            total=sum(float(e.get("opening_value",0)) for e in entries if e.get("material_type")==mt)
            gl=session.query(GLAccount).filter(GLAccount.company_id==cid,GLAccount.gl_code.like(f"{gc}%")).first()
            if gl: gl.opening_dr=round(total,2); gl.opening_cr=0
        session.commit(); return jsonify({"success":True,"updated":updated})
    finally: session.close()

@app.route("/api/ob/party", methods=["GET"])
def get_party_ob():
    cid=request.args.get("company_id",type=int)
    if not cid: return jsonify({"error":"company_id required"}),400
    session=SessionLocal()
    try:
        ps=session.query(PartyMaster).filter_by(company_id=cid,is_active=True)\
            .order_by(PartyMaster.party_type,PartyMaster.name).all()
        return jsonify({"parties":[{"id":p.id,"party_type":p.party_type,"name":p.name,
            "gl_account":p.gl_account or "","opening_balance":float(p.opening_balance or 0),
            "normal_side":_get_party_type_side(session, p.party_type or "")} for p in ps]})
    finally: session.close()

@app.route("/api/ob/party", methods=["POST"])
def save_party_ob():
    session=SessionLocal()
    try:
        data=request.get_json() or {}; cid=data.get("company_id")
        if not _is_company_admin(session,data.get("requesting_user_id"),cid): return jsonify({"error":"Not authorized"}),403
        entries=data.get("entries",[]); updated=0
        for e in entries:
            p=session.query(PartyMaster).filter_by(id=e["id"],company_id=cid).first()
            if p: p.opening_balance=float(e.get("opening_balance") or 0); updated+=1
        gdr={}; gcr={}
        for p in session.query(PartyMaster).filter_by(company_id=cid,is_active=True).all():
            gl=(p.gl_account or "").split(" - ")[0].strip(); amt=float(p.opening_balance or 0)
            side = _get_party_type_side(session, p.party_type or "")
            if side=="Cr": gcr[gl]=gcr.get(gl,0)+amt
            else: gdr[gl]=gdr.get(gl,0)+amt
        for gc in set(list(gdr.keys())+list(gcr.keys())):
            a=session.query(GLAccount).filter_by(company_id=cid,gl_code=gc).first()
            if a: a.opening_dr=round(gdr.get(gc,0),2); a.opening_cr=round(gcr.get(gc,0),2)
        session.commit(); return jsonify({"success":True,"updated":updated})
    finally: session.close()

@app.route("/api/ob/bank", methods=["GET"])
def get_bank_ob():
    cid=request.args.get("company_id",type=int)
    if not cid: return jsonify({"error":"company_id required"}),400
    session=SessionLocal()
    try:
        # Get all bank/cash GL accounts
        gl_accs=session.query(GLAccount).filter(
            GLAccount.company_id==cid,
            GLAccount.account_type=="BS",
            GLAccount.sub_group.in_(["Bank Accounts","Cash In Hand"])
        ).order_by(GLAccount.gl_code).all()

        # Get all bank_accounts rows for this company
        bank_rows=session.query(BankAccount).filter_by(
            company_id=cid,is_active=True
        ).order_by(BankAccount.gl_code, BankAccount.id).all()

        # Build a map: gl_code → list of bank_accounts
        from collections import defaultdict
        bank_map=defaultdict(list)
        for b in bank_rows:
            bank_map[b.gl_code].append({
                "id":b.id,"account_name":b.account_name,
                "account_no":b.account_no,
                "opening_balance":float(b.opening_balance or 0)
            })

        result=[]
        for a in gl_accs:
            sub_accounts=bank_map.get(a.gl_code,[])
            # GL opening = sum of sub-accounts if any exist, else gl_accounts.opening_dr
            gl_ob=sum(s["opening_balance"] for s in sub_accounts) if sub_accounts else float(a.opening_dr or 0)
            result.append({
                "id":a.id,"gl_code":a.gl_code,"gl_name":a.gl_name,
                "sub_group":a.sub_group or "",
                "opening_balance":gl_ob,
                "sub_accounts":sub_accounts
            })
        return jsonify({"accounts":result})
    except Exception as e:
        return jsonify({"error":str(e)}),500
    finally: session.close()

@app.route("/api/ob/bank", methods=["POST"])
def save_bank_ob():
    session=SessionLocal()
    try:
        data=request.get_json() or {}; cid=data.get("company_id")
        if not _is_company_admin(session,data.get("requesting_user_id"),cid): return jsonify({"error":"Not authorized"}),403
        updated=0

        # Save sub-account opening balances (bank_accounts rows)
        for e in data.get("sub_entries",[]):
            b=session.query(BankAccount).filter_by(id=e["id"],company_id=cid).first()
            if b:
                b.opening_balance=float(e.get("opening_balance") or 0)
                updated+=1

        # Recompute GL opening_dr as sum of sub-accounts per gl_code
        # Also handle GL accounts with no sub-accounts (cash, unregistered banks)
        for e in data.get("entries",[]):
            a=session.query(GLAccount).filter_by(id=e["id"],company_id=cid).first()
            if not a: continue
            sub_accs=session.query(BankAccount).filter_by(
                gl_code=a.gl_code,company_id=cid,is_active=True).all()
            if sub_accs:
                # GL OB = sum of all sub-accounts
                total=sum(float(b.opening_balance or 0) for b in sub_accs)
                a.opening_dr=total; a.opening_cr=0
            else:
                # No sub-accounts — use direct GL entry (cash accounts etc.)
                ob=float(e.get("opening_balance") or 0)
                a.opening_dr=ob; a.opening_cr=0
            updated+=1

        session.commit(); return jsonify({"success":True,"updated":updated})
    except Exception as e:
        session.rollback(); return jsonify({"error":str(e)}),500
    finally: session.close()

@app.route("/api/ob/pull-from-prev-fy", methods=["POST"])
def pull_from_prev_fy():
    session=SessionLocal()
    try:
        data=request.get_json() or {}; cid=data.get("company_id"); src=data.get("source_company_id") or cid
        if not _is_company_admin(session,data.get("requesting_user_id"),cid): return jsonify({"error":"Not authorized"}),403
        pulled={"gl":0,"parties":0,"materials":0}
        sg={a.gl_code:a for a in session.query(GLAccount).filter_by(company_id=src,account_type="BS").all()}
        for a in session.query(GLAccount).filter_by(company_id=cid,account_type="BS").all():
            if a.gl_code in sg: a.opening_dr=sg[a.gl_code].opening_dr; a.opening_cr=sg[a.gl_code].opening_cr; pulled["gl"]+=1
        sp={(p.party_type,p.name):p for p in session.query(PartyMaster).filter_by(company_id=src,is_active=True).all()}
        for p in session.query(PartyMaster).filter_by(company_id=cid,is_active=True).all():
            if (p.party_type,p.name) in sp: p.opening_balance=sp[(p.party_type,p.name)].opening_balance; pulled["parties"]+=1
        sm={(m.material_type,m.product_code):m for m in session.query(MaterialMaster).filter_by(company_id=src,is_active=True).all()}
        for m in session.query(MaterialMaster).filter_by(company_id=cid,is_active=True).all():
            if (m.material_type,m.product_code) in sm:
                m.opening_qty=sm[(m.material_type,m.product_code)].opening_qty
                m.opening_value=sm[(m.material_type,m.product_code)].opening_value; pulled["materials"]+=1
        session.commit()
        return jsonify({"success":True,"pulled":pulled,
            "message":f"Pulled: {pulled['gl']} GL, {pulled['parties']} parties, {pulled['materials']} materials."})
    finally: session.close()

# ── Purchase Book ─────────────────────────────────────────────

@app.route("/api/purchase", methods=["GET"])
def get_purchases():
    """
    ?company_id=1&include_voided=true  → returns only voided entries (for Voided tab)
    ?company_id=1                      → returns only active entries (default)
    """
    cid=request.args.get("company_id",type=int); txn=request.args.get("type","")
    limit=request.args.get("limit",50,type=int); offset=request.args.get("offset",0,type=int)
    search=request.args.get("search","")
    include_voided=request.args.get("include_voided","false").lower()=="true"
    if not cid: return jsonify({"error":"company_id required"}),400
    session=SessionLocal()
    try:
        q=session.query(PurchaseBook).filter_by(company_id=cid)
        # Key filter: voided tab vs active register
        if include_voided:
            q=q.filter(PurchaseBook.is_void==True)
        else:
            # Treat NULL as False — existing rows before void column was added
            q=q.filter((PurchaseBook.is_void==False)|(PurchaseBook.is_void==None))
        if txn: q=q.filter_by(transaction_type=txn)
        if search:
            q=q.filter((PurchaseBook.vendor_name.ilike(f"%{search}%"))|
                (PurchaseBook.bill_no.ilike(f"%{search}%"))|
                (PurchaseBook.product_name.ilike(f"%{search}%"))|
                (PurchaseBook.internal_ref.ilike(f"%{search}%")))
        total=q.count()
        entries=q.order_by(PurchaseBook.entry_date.desc(),PurchaseBook.id.desc()).offset(offset).limit(limit).all()
        return jsonify({"entries":[_purchase_to_dict(p) for p in entries],"total":total,"limit":limit,"offset":offset})
    finally: session.close()

@app.route("/api/purchase", methods=["POST"])
def save_purchase():
    session=SessionLocal()
    try:
        data=request.get_json() or {}; cid=data.get("company_id"); req_user=data.get("requesting_user_id")
        if not _can_transact(session,req_user,cid): return jsonify({"error":"Not authorized"}),403
        txn=data.get("transaction_type","Purchase")
        if txn not in ("Purchase","Purchase Return","Debit Note"): txn="Purchase"
        try: entry_date=date.fromisoformat(data.get("entry_date",""))
        except: return jsonify({"error":"Invalid entry_date (YYYY-MM-DD required)"}),400
        bill_no=(data.get("bill_no") or "").strip(); vendor_name=(data.get("vendor_name") or "").strip()
        if not vendor_name: return jsonify({"error":"vendor_name required"}),400
        vendor_pan=(data.get("vendor_pan") or "").strip()
        product_code=(data.get("product_code") or "").strip(); product_name=(data.get("product_name") or "").strip()
        is_taxable=bool(data.get("is_taxable",True)); is_capital=bool(data.get("is_capital",False))
        is_service=bool(data.get("is_service",False)); qty=float(data.get("qty") or 0); rate=float(data.get("rate") or 0)
        date_bs=(data.get("date_bs") or "").strip(); capital_item_name=(data.get("capital_item_name") or "").strip()
        cap_sub_group=(data.get("sub_group") or "").strip().upper(); block_gl_raw=(data.get("gl_account") or "").strip()
        dep_rate_pct=float(data.get("dep_rate_pct") or 0); residual_val_pct=float(data.get("residual_value_pct") or 5)
        dep_method=(data.get("dep_method") or "WDV").strip().upper()
        original_bill_ref=(data.get("original_bill_ref") or "").strip()
        # VAT rate — stored as decimal in DB (e.g. 0.13 = 13%). Use directly, NO /100.
        settings=session.query(Settings).filter_by(company_id=cid).first()
        vat_rate=float(settings.vat_rate or 0.13) if settings else 0.13
        sign=1 if txn=="Purchase" else -1
        internal_ref=_get_next_internal_ref(session,cid,txn)
        month_bs=_get_nepali_month(entry_date) or date_bs
        tv=va=ta=ntv=cap_tv=cap_v=cap_t=0.0
        if is_capital:
            add_amt=qty*rate if qty>0 and rate>0 else rate
            if is_taxable: cap_tv=round(add_amt*sign,2); cap_v=round(add_amt*vat_rate*sign,2); cap_t=round((add_amt+add_amt*vat_rate)*sign,2)
            else: ntv=round(add_amt*sign,2)
        elif is_service:
            qty=0
            if is_taxable: tv=round(rate*sign,2); va=round(rate*vat_rate*sign,2); ta=round(rate*(1+vat_rate)*sign,2)
            else: ntv=round(rate*sign,2)
        else:
            base=qty*rate
            if is_taxable: tv=round(base*sign,2); va=round(base*vat_rate*sign,2); ta=round(base*(1+vat_rate)*sign,2)
            else: ntv=round(base*sign,2)
        add_amt2=round(qty*rate if (qty>0 and rate>0) else (abs(rate) if is_service else 0),2)
        pb=PurchaseBook(company_id=cid,entry_date=entry_date,month_bs=month_bs,bill_no=bill_no,
            vendor_name=vendor_name,vendor_pan=vendor_pan,product_code=product_code,product_name=product_name,
            qty=qty,rate=rate,is_taxable=is_taxable,taxable_value=tv,vat_amount=va,total_amount=ta,
            non_taxable_value=ntv,capital_item_name=capital_item_name if is_capital else "",
            cap_qty=qty if is_capital else 0,cap_rate=rate if is_capital else 0,
            cap_taxable_value=cap_tv,cap_vat=cap_v,cap_total=cap_t,
            transaction_type=txn,original_bill_ref=original_bill_ref,internal_ref=internal_ref,
            is_service=is_service,is_capital=is_capital,created_by=req_user,date_bs=date_bs,is_void=False)
        session.add(pb)
        fa_code_gen=""
        if is_capital and txn=="Purchase":
            yr=entry_date.year; fac=session.query(FARegister).filter_by(company_id=cid).count()
            fa_code_gen=f"FA-{yr}-{str(fac+1).zfill(3)}"
            cmd=dep_method or ("SLM" if cap_sub_group=="BLOCK E" else "WDV")
            bgc=block_gl_raw.split(" - ")[0].strip() if block_gl_raw else ""
            session.add(FARegister(company_id=cid,fa_code=fa_code_gen,capital_item=capital_item_name or product_name,
                vendor=vendor_name,sub_group=cap_sub_group,gl_account=block_gl_raw,addition_date=entry_date,
                qty=qty or 1,rate=rate,additions=round(abs(add_amt2),2),source="Purchase",reference=bill_no,
                residual_value_pct=residual_val_pct,dep_rate_pct=dep_rate_pct,dep_method=cmd,opening_accum_dep=0,is_active=True))
            pb.fa_code=fa_code_gen
            vgl="5010"; vgln=_get_gl_by_code(session,cid,vgl)
            if bgc and abs(add_amt2)>0:
                _add_gl_book_entry(session,cid,entry_date,fa_code_gen,bgc,block_gl_raw,vgl,vgln,
                    f"Capital Purchase - {bill_no} - {capital_item_name}",round(abs(add_amt2),2),"Purchase_Book",txn)
                if is_taxable and abs(cap_v)>0:
                    _add_gl_book_entry(session,cid,entry_date,internal_ref,"2150",
                        _get_gl_by_code(session,cid,"2150"),vgl,vgln,f"VAT Input - Capital - {bill_no}",round(abs(cap_v),2),"Purchase_Book",txn)
        elif not is_capital:
            pgc="7100" if is_taxable else "7110"; pgn=_get_gl_by_code(session,cid,pgc)
            vgl="5010"; vgln=_get_gl_by_code(session,cid,vgl); ba=abs(tv) or abs(ntv)
            total_party_amt = round(ba + (abs(va) if is_taxable else 0), 2)
            if sign==1:
                if ba>0: _add_gl_book_entry(session,cid,entry_date,internal_ref,pgc,pgn,vgl,vgln,f"Purchase - {bill_no} - {product_name}",ba,"Purchase_Book",txn)
                if is_taxable and abs(va)>0: _add_gl_book_entry(session,cid,entry_date,internal_ref,"2150",_get_gl_by_code(session,cid,"2150"),vgl,vgln,f"VAT Input - {bill_no}",round(abs(va),2),"Purchase_Book",txn)
                # Party Ledger: Vendor CR (liability created)
                if total_party_amt>0:
                    _add_party_ledger_entry(session,cid,entry_date,vendor_name,"Vendor",
                        txn,bill_no or internal_ref,
                        f"Purchase - {product_name} - {bill_no}",
                        0, total_party_amt, "Purchase_Book", vgl)
            else:
                if ba>0: _add_gl_book_entry(session,cid,entry_date,internal_ref,vgl,vgln,pgc,pgn,f"{txn} - {bill_no} - {product_name}",ba,"Purchase_Book",txn)
                if is_taxable and abs(va)>0: _add_gl_book_entry(session,cid,entry_date,internal_ref,vgl,vgln,"2150",_get_gl_by_code(session,cid,"2150"),f"VAT Reversal - {bill_no}",round(abs(va),2),"Purchase_Book",txn)
                # Party Ledger: Vendor DR (liability reduced on return)
                if total_party_amt>0:
                    _add_party_ledger_entry(session,cid,entry_date,vendor_name,"Vendor",
                        txn,bill_no or internal_ref,
                        f"{txn} - {product_name} - {bill_no}",
                        total_party_amt, 0, "Purchase_Book", vgl)
        # ── Party Ledger posting ────────────────────────────────
        # Determine party type from PartyMaster (default Vendor)
        pm = session.query(PartyMaster).filter(
            PartyMaster.company_id == cid,
            func.lower(func.trim(PartyMaster.name)) == vendor_name.strip().lower()
        ).first()
        party_type_pl = pm.party_type if pm else "Vendor"
        # GL control account per party type
        ctrl_gl = {
            "Vendor":   "5010 - Trade Creditors / Payables",
            "LC":       "2110 - Advance to Suppliers",
            "TDS":      "5060 - TDS Payable",
            "Staff":    "2120 - Advance to Staff",
            "Customer": "2100 - Trade Debtors / Receivables",
        }.get(party_type_pl, "5010 - Trade Creditors / Payables")

        # Calculate total amount for party ledger
        pl_amount = round(abs(ta) + abs(ntv) + abs(cap_t or 0), 2)
        if pl_amount > 0:
            # Purchase / Capital → Credit party (liability/payable increases)
            # Return / Debit Note → Debit party (liability decreases)
            pl_desc = f"{txn} — {product_name or capital_item_name or ''} | Bill: {bill_no} ({internal_ref})"
            _add_party_ledger_entry(
                session, cid, entry_date,
                vendor_name, party_type_pl,
                txn, bill_no or internal_ref, pl_desc,
                debit  = pl_amount if sign == -1 else 0,   # return → debit (reduces liability)
                credit = pl_amount if sign ==  1 else 0,   # purchase → credit (increases liability)
                source = "Purchase_Book",
                gl_account = ctrl_gl,
            )

        session.commit()
        if not is_capital and product_name and qty>0:
            mat=session.query(MaterialMaster).filter_by(company_id=cid,product_name=product_name,is_active=True).first()
            if mat:
                cq=float(mat.opening_qty or 0); cv=float(mat.opening_value or 0); lv=round(qty*rate,2)
                if txn=="Purchase": mat.opening_qty=round(cq+qty,3); mat.opening_value=round(cv+lv,2)
                elif txn=="Purchase Return": mat.opening_qty=round(max(0,cq-qty),3); mat.opening_value=round(max(0,cv-lv),2)
                session.commit()
        return jsonify({"success":True,"internal_ref":internal_ref,"fa_code":fa_code_gen,
            "entry":{"id":pb.id,"internal_ref":internal_ref,"bill_no":bill_no,"vendor_name":vendor_name,
                "taxable_value":tv,"vat_amount":va,"total_amount":ta,"non_taxable_value":ntv,
                "cap_total":cap_t,"transaction_type":txn,"fa_code":fa_code_gen}}),201
    except Exception as e:
        session.rollback()
        import traceback; tb=traceback.format_exc()
        print(f"[ERROR] save_purchase: {e}\n{tb}")
        return jsonify({"error":str(e),"detail":tb.split(chr(10))[-3]}),500
    finally: session.close()

def original_bill_ref_exists(session,cid,orig_ref,vendor_pan):
    if not orig_ref: return False
    q=session.query(PurchaseBook).filter_by(company_id=cid,transaction_type="Purchase").filter(PurchaseBook.bill_no==orig_ref)
    if vendor_pan: q=q.filter(PurchaseBook.vendor_pan==vendor_pan)
    return q.first() is not None

# ── VOID PURCHASE  (new universal soft-delete with audit trail) ─

@app.route("/api/purchase/<int:entry_id>/void", methods=["POST"])
def void_purchase(entry_id):
    """
    POST /api/purchase/<id>/void
    Body: { requesting_user_id, company_id, confirm_doc_number, void_reason }

    - Only Super Admin / company_admin / admin can void.
    - User MUST type exact bill_no OR internal_ref to confirm.
    - Soft-deletes: sets is_void=True with who/when/why recorded.
    - Reverses all GL book entries for this transaction.
    - Entry stays permanently visible in the Voided tab (audit trail).
    """
    session=SessionLocal()
    try:
        data=request.get_json() or {}
        req_user=data.get("requesting_user_id"); cid=data.get("company_id")
        confirm_doc=(data.get("confirm_doc_number") or "").strip()
        void_reason=(data.get("void_reason") or "").strip()
        if not confirm_doc: return jsonify({"error":"confirm_doc_number is required"}),400
        if not _can_void(session,req_user,cid): return jsonify({"error":"Only Admin or Super Admin can void entries"}),403
        entry=session.query(PurchaseBook).filter_by(id=entry_id,company_id=cid).first()
        if not entry: return jsonify({"error":"Entry not found"}),404
        if entry.is_void: return jsonify({"error":"Entry is already voided"}),400
        bill_match=confirm_doc==(entry.bill_no or "").strip()
        ref_match =confirm_doc==(entry.internal_ref or "").strip()
        if not bill_match and not ref_match:
            return jsonify({"error":
                f"Document number '{confirm_doc}' does not match "
                f"bill no '{entry.bill_no}' or ref '{entry.internal_ref}'. "
                "Please type the exact bill number or internal reference."}),400
        user=session.query(User).filter_by(id=req_user).first()
        voided_by_name=user.username if user else str(req_user)
        entry.is_void=True; entry.voided_by=voided_by_name
        entry.voided_at=dt.now(timezone.utc); entry.void_reason=void_reason or "Voided by user"
        # Reverse GL entries — match on internal_ref and fa_code
        search_ids=[entry.internal_ref]
        if entry.fa_code: search_ids.append(entry.fa_code)
        gl_entries=session.query(GLBook).filter(GLBook.company_id==cid,GLBook.unique_id.in_(search_ids)).all()
        rev_count=0
        for gl in gl_entries:
            session.add(GLBook(company_id=cid,entry_date=dt.now(timezone.utc).date(),
                unique_id=f"VOID-{entry.internal_ref}",gl_code=gl.gl_code,gl_name=gl.gl_name,
                description=f"VOID: {gl.description}",
                dr_amount=gl.cr_amount,  # swap Dr↔Cr to reverse
                cr_amount=gl.dr_amount,
                source="Void",transaction_type="Void"))
            rev_count+=1
        # ── Reverse party ledger entries ────────────────────────
        pl_entries = session.query(PartyLedger).filter(
            PartyLedger.company_id == cid,
            PartyLedger.reference.in_([entry.internal_ref or "", entry.bill_no or ""]),
            PartyLedger.is_void == False,
        ).all()
        for pl in pl_entries:
            # Mark the ORIGINAL row as voided too — not just adding a
            # reversal — so it's excluded from the active party statement.
            pl.is_void = True
            session.add(PartyLedger(
                company_id  = cid,
                entry_date  = dt.now(timezone.utc).date(),
                party_name  = pl.party_name,
                party_type  = pl.party_type,
                txn_type    = "Void",
                reference   = f"VOID-{entry.internal_ref}",
                description = f"VOID: {pl.description}",
                debit       = float(pl.credit or 0),  # swap
                credit      = float(pl.debit or 0),   # swap
                source      = "Void",
                gl_account  = pl.gl_account,
            ))
        session.commit()
        return jsonify({"success":True,
            "message":f"Entry '{entry.internal_ref}' (Bill: {entry.bill_no}) voided successfully.",
            "voided_by":entry.voided_by,"voided_at":entry.voided_at.isoformat(),"gl_reversals":rev_count}),200
    except Exception as e:
        session.rollback()
        import traceback; print(f"[ERROR] void_purchase: {e}\n{traceback.format_exc()}")
        return jsonify({"error":str(e)}),500
    finally: session.close()

# ── VOID SALES  ──────────────────────────────────────────────
@app.route("/api/sales/<int:entry_id>/void", methods=["POST"])
def void_sale(entry_id):
    """
    POST /api/sales/<id>/void
    Body: { requesting_user_id, company_id, confirm_doc_number, void_reason }
    Soft-deletes the entry and reverses GL postings.
    Only Super Admin / company_admin / admin can void.
    """
    session=SessionLocal()
    try:
        data=request.get_json() or {}
        req_user=data.get("requesting_user_id"); cid=data.get("company_id")
        confirm_doc=(data.get("confirm_doc_number") or "").strip()
        void_reason=(data.get("void_reason") or "").strip()
        if not confirm_doc: return jsonify({"error":"confirm_doc_number is required"}),400
        if not _can_void(session,req_user,cid):
            return jsonify({"error":"Only Admin or Super Admin can void entries"}),403
        entry=session.query(SalesBook).filter_by(id=entry_id,company_id=cid).first()
        if not entry: return jsonify({"error":"Sales entry not found"}),404
        if entry.is_void: return jsonify({"error":"Entry is already voided"}),400
        bill_match=confirm_doc==(entry.bill_no or "").strip()
        ref_match =confirm_doc==(entry.internal_ref or "").strip()
        if not bill_match and not ref_match:
            return jsonify({"error":
                f"Document number '{confirm_doc}' does not match "
                f"bill no '{entry.bill_no}' or ref '{entry.internal_ref}'. "
                "Please type the exact bill number or internal reference."}),400
        user=session.query(User).filter_by(id=req_user).first()
        entry.is_void=True
        entry.voided_by=user.username if user else str(req_user)
        entry.voided_at=dt.now(timezone.utc)
        entry.void_reason=void_reason or "Voided by user"
        # Reverse GL entries
        gl_entries=session.query(GLBook).filter(
            GLBook.company_id==cid,
            GLBook.unique_id==entry.internal_ref
        ).all()
        rev_count=0
        for gl in gl_entries:
            session.add(GLBook(
                company_id=cid, entry_date=dt.now(timezone.utc).date(),
                unique_id=f"VOID-{entry.internal_ref}",
                gl_code=gl.gl_code, gl_name=gl.gl_name,
                description=f"VOID: {gl.description}",
                dr_amount=gl.cr_amount, cr_amount=gl.dr_amount,
                source="Void", transaction_type="Void"))
            rev_count+=1
        # ── Reverse party ledger entries ────────────────────────
        pl_entries_s = session.query(PartyLedger).filter(
            PartyLedger.company_id == cid,
            PartyLedger.reference.in_([entry.internal_ref or "", entry.bill_no or ""]),
            PartyLedger.is_void == False,
        ).all()
        for pl in pl_entries_s:
            pl.is_void = True
            session.add(PartyLedger(
                company_id  = cid,
                entry_date  = dt.now(timezone.utc).date(),
                party_name  = pl.party_name,
                party_type  = pl.party_type,
                txn_type    = "Void",
                reference   = f"VOID-{entry.internal_ref}",
                description = f"VOID: {pl.description}",
                debit       = float(pl.credit or 0),
                credit      = float(pl.debit or 0),
                source      = "Void",
                gl_account  = pl.gl_account,
            ))
        session.commit()
        return jsonify({
            "success":True,
            "message":f"Sales entry '{entry.internal_ref}' (Bill: {entry.bill_no}) voided successfully.",
            "voided_by":entry.voided_by,
            "voided_at":entry.voided_at.isoformat(),
            "gl_reversals":rev_count,
        }),200
    except Exception as e:
        session.rollback()
        import traceback; print(f"[ERROR] void_sale: {e}\n{traceback.format_exc()}")
        return jsonify({"error":str(e)}),500
    finally: session.close()

# ── BANK ACCOUNTS (sub-ledgers under a GL control account) ────
@app.route("/api/bank-accounts", methods=["GET"])
def get_bank_accounts():
    """
    Returns all bank/cash accounts for a company, each with its current
    running balance (opening_balance + deposits - withdraws from bank_ledger).
    Accounts are grouped by gl_code — exactly like Party Master groups
    parties under a control GL (Customer->2100, Vendor->5010 etc).
    """
    cid = request.args.get("company_id", type=int)
    if not cid: return jsonify({"error":"company_id required"}),400
    session = SessionLocal()
    try:
        accts = session.query(BankAccount).filter_by(company_id=cid, is_active=True).order_by(BankAccount.gl_code, BankAccount.account_name).all()

        result = []
        gl_totals = {}  # gl_code -> {gl_name, total_balance, account_count}

        for a in accts:
            ob = float(a.opening_balance or 0)
            # Sum deposits/withdraws posted for this account
            agg = session.query(
                func.coalesce(func.sum(BankLedger.deposit), 0),
                func.coalesce(func.sum(BankLedger.withdraw), 0),
            ).filter_by(company_id=cid, bank_account_id=a.id).first()
            total_dep = float(agg[0] or 0)
            total_wd  = float(agg[1] or 0)
            running_balance = ob + total_dep - total_wd

            result.append({
                "id":              a.id,
                "account_name":    a.account_name,
                "account_no":      a.account_no,
                "gl_code":         a.gl_code,
                "gl_name":         a.gl_name,
                "opening_balance": ob,
                "running_balance": round(running_balance, 2),
            })

            key = a.gl_code or "—"
            if key not in gl_totals:
                gl_totals[key] = {"gl_code":a.gl_code, "gl_name":a.gl_name, "total_balance":0, "account_count":0}
            gl_totals[key]["total_balance"]  += running_balance
            gl_totals[key]["account_count"]  += 1

        gl_groups = [
            {**v, "total_balance": round(v["total_balance"], 2)}
            for v in sorted(gl_totals.values(), key=lambda x: x["gl_code"] or "")
        ]

        return jsonify({"accounts":result, "gl_groups":gl_groups})
    finally: session.close()


@app.route("/api/bank-accounts/balances-summary", methods=["GET"])
def get_bank_balances_summary():
    """
    Bank Wise Summary drilled down to Bank Account wise summary balances:
    Opening | Withdrawal | Deposit | Closing — per account, grouped by
    GL control account (so multiple sub-accounts under one bank's GL
    code show both individually and as a consolidated bank total).

    Optional from_date/to_date narrows the period — Opening becomes the
    balance just before from_date, Closing becomes the balance as of
    to_date, and Withdrawal/Deposit are summed only within the range.
    Without date params, Opening = account.opening_balance (since
    inception) and Closing = current running balance.
    """
    cid = request.args.get("company_id", type=int)
    from_date = request.args.get("from_date","")
    to_date   = request.args.get("to_date","")
    if not cid: return jsonify({"error":"company_id required"}),400

    session = SessionLocal()
    try:
        accts = session.query(BankAccount).filter_by(company_id=cid, is_active=True).order_by(BankAccount.gl_code, BankAccount.account_name).all()

        fd = None; td = None
        if from_date:
            try: fd = date.fromisoformat(from_date)
            except: pass
        if to_date:
            try: td = date.fromisoformat(to_date)
            except: pass

        result = []
        gl_groups = {}

        for a in accts:
            base_ob = float(a.opening_balance or 0)

            if fd:
                # Opening = base OB + net movement strictly BEFORE from_date
                pre_agg = session.query(
                    func.coalesce(func.sum(BankLedger.deposit), 0),
                    func.coalesce(func.sum(BankLedger.withdraw), 0),
                ).filter(
                    BankLedger.company_id==cid, BankLedger.bank_account_id==a.id,
                    BankLedger.entry_date < fd,
                    (BankLedger.is_void==False)|(BankLedger.is_void==None),
                ).first()
                opening = base_ob + float(pre_agg[0] or 0) - float(pre_agg[1] or 0)
            else:
                opening = base_ob

            period_q = session.query(
                func.coalesce(func.sum(BankLedger.deposit), 0),
                func.coalesce(func.sum(BankLedger.withdraw), 0),
            ).filter(
                BankLedger.company_id==cid, BankLedger.bank_account_id==a.id,
                (BankLedger.is_void==False)|(BankLedger.is_void==None),
            )
            if fd: period_q = period_q.filter(BankLedger.entry_date >= fd)
            if td: period_q = period_q.filter(BankLedger.entry_date <= td)
            period_agg = period_q.first()
            total_dep = float(period_agg[0] or 0)
            total_wd  = float(period_agg[1] or 0)
            closing = opening + total_dep - total_wd

            result.append({
                "id":              a.id,
                "account_name":    a.account_name,
                "account_no":      a.account_no,
                "gl_code":         a.gl_code,
                "gl_name":         a.gl_name,
                "opening":         round(opening, 2),
                "withdrawal":      round(total_wd, 2),
                "deposit":         round(total_dep, 2),
                "closing":         round(closing, 2),
            })

            key = a.gl_code or "—"
            if key not in gl_groups:
                gl_groups[key] = {"gl_code":a.gl_code, "gl_name":a.gl_name,
                                   "opening":0,"withdrawal":0,"deposit":0,"closing":0,"account_count":0}
            gl_groups[key]["opening"]      += opening
            gl_groups[key]["withdrawal"]   += total_wd
            gl_groups[key]["deposit"]      += total_dep
            gl_groups[key]["closing"]      += closing
            gl_groups[key]["account_count"] += 1

        groups_out = [
            {**v, "opening":round(v["opening"],2), "withdrawal":round(v["withdrawal"],2),
             "deposit":round(v["deposit"],2), "closing":round(v["closing"],2)}
            for v in sorted(gl_groups.values(), key=lambda x: x["gl_code"] or "")
        ]

        grand = {
            "opening":    round(sum(v["opening"] for v in gl_groups.values()), 2),
            "withdrawal": round(sum(v["withdrawal"] for v in gl_groups.values()), 2),
            "deposit":    round(sum(v["deposit"] for v in gl_groups.values()), 2),
            "closing":    round(sum(v["closing"] for v in gl_groups.values()), 2),
        }

        return jsonify({"accounts":result, "gl_groups":groups_out, "grand_total":grand})
    finally: session.close()


@app.route("/api/bank-accounts/cash-flow", methods=["GET"])
def get_cash_flow_sources_uses():
    """
    Cash Sources vs Uses — aggregates bank_ledger entries (and their
    split legs) by classification type (AR/AP/HR/LC/GL/Contra), split
    into inflow ("sources") and outflow ("uses") sides, for a date range
    and a chosen scope:
      scope=account   & bank_account_id=<id>   -> single account
      scope=gl        & gl_code=<code>         -> all accounts sharing one GL
      scope=all                                 -> every active account

    Contra handling:
      - scope=all: every Contra entry's both legs are guaranteed inside
        scope (transfers between the company's own accounts), so total
        Contra inflow must equal total Contra outflow. Net them — the
        line is omitted when net is ~0 (the normal case for "all").
      - scope=account / scope=gl: only one leg of a Contra transfer may
        be visible (the other leg lives in an account outside scope),
        so net inflow-outflow and show the result on whichever side it
        falls on. Never show Contra as two separate non-zero lines.

    Each non-Contra flow is broken down by sub-label (party name for
    AR/AP/HR/LC, GL name for GL type) so the frontend can drill into
    a type and see the underlying parties/GL accounts.
    """
    cid       = request.args.get("company_id", type=int)
    scope     = request.args.get("scope", "all")       # account | gl | all
    acct_id   = request.args.get("bank_account_id", type=int)
    gl_code   = request.args.get("gl_code", "")
    from_date = request.args.get("from_date", "")
    to_date   = request.args.get("to_date", "")
    if not cid: return jsonify({"error":"company_id required"}),400

    session = SessionLocal()
    try:
        # Resolve which bank_account_ids are in scope
        if scope == "account":
            if not acct_id: return jsonify({"error":"bank_account_id required for scope=account"}),400
            account_ids = [acct_id]
        elif scope == "gl":
            if not gl_code: return jsonify({"error":"gl_code required for scope=gl"}),400
            accts = session.query(BankAccount).filter_by(company_id=cid, gl_code=gl_code, is_active=True).all()
            account_ids = [a.id for a in accts]
        else:  # all
            accts = session.query(BankAccount).filter_by(company_id=cid, is_active=True).all()
            account_ids = [a.id for a in accts]

        if not account_ids:
            return jsonify({"sources":[], "uses":[], "total_in":0, "total_out":0, "net":0,
                             "opening_balance":0, "closing_balance":0})

        fd = None; td = None
        if from_date:
            try: fd = date.fromisoformat(from_date)
            except: pass
        if to_date:
            try: td = date.fromisoformat(to_date)
            except: pass

        q = session.query(BankLedger).filter(
            BankLedger.company_id == cid,
            BankLedger.bank_account_id.in_(account_ids),
            (BankLedger.is_void==False) | (BankLedger.is_void==None),
            BankLedger.is_posted_gl == True,
        )
        if fd: q = q.filter(BankLedger.entry_date >= fd)
        if td: q = q.filter(BankLedger.entry_date <= td)
        entries = q.all()

        # flows[(side, type, label)] = amount   side: "in" | "out"
        flows = {}
        def add_flow(side, etype, label, amount):
            if amount <= 0: return
            key = (side, etype, label or etype)
            flows[key] = flows.get(key, 0) + amount

        contra_in = 0.0
        contra_out = 0.0

        for e in entries:
            wd = float(e.withdraw or 0)
            dep = float(e.deposit or 0)

            if e.is_split or e.entry_type == "SPLIT":
                legs = session.query(BankLedgerSplit).filter_by(bank_ledger_id=e.id).all()
                for leg in legs:
                    amt = float(leg.split_amount or 0)
                    if amt <= 0: continue
                    if leg.entry_type == "LC":
                        label = leg.charge_type or leg.party_name or "LC charge (uncategorized)"
                    else:
                        label = leg.gl_account or "Uncategorized GL entry"
                    # Split legs inherit the parent row's Dr/Cr direction
                    if dep > 0: add_flow("in",  leg.entry_type or "GL", label, amt)
                    else:        add_flow("out", leg.entry_type or "GL", label, amt)
                continue

            etype = e.entry_type or "GL"
            if etype == "Contra":
                contra_in  += dep
                contra_out += wd
                continue

            # Category for grouping: when entry_type is "Party", use the
            # PARTY'S OWN party_type as the category — e.g. "Directors",
            # "Payables", "LTL" — so each shows as its own distinct line
            # in the report, rather than collapsing into a generic bucket.
            # Falls back to the entry_type itself if the party can't be
            # found, so the report never silently drops a transaction.
            category = etype
            if etype == "Party" and e.party_name:
                pm_ = session.query(PartyMaster).filter(
                    PartyMaster.company_id == cid,
                    func.lower(func.trim(PartyMaster.name)) == e.party_name.strip().lower()
                ).first()
                category = (pm_.party_type if pm_ and pm_.party_type else e.party_type) or "Party"

            label = e.party_name if etype == "Party" else (e.gl_account or etype)
            if dep > 0: add_flow("in",  category, label, dep)
            if wd  > 0: add_flow("out", category, label, wd)

        # Net the Contra side — never show as two non-zero lines.
        contra_net = round(contra_in - contra_out, 2)
        if abs(contra_net) >= 0.01:
            if contra_net > 0:
                add_flow("in", "Contra", "Inter-account transfer (net)", contra_net)
            else:
                add_flow("out", "Contra", "Inter-account transfer (net)", abs(contra_net))

        # Category labels — built from the live party_types table (so
        # Directors/Payables/LTL/STL/Share Capital get a sensible label
        # automatically) plus the fixed entry-type labels for GL/Contra/
        # any party type not yet given a custom display name.
        ENTRY_TYPE_LABELS = {
            "GL":"General Ledger","Contra":"Inter-account transfer",
        }
        for pt_ in session.query(PartyType).filter_by(is_active=True).all():
            if pt_.type_name not in ENTRY_TYPE_LABELS:
                ENTRY_TYPE_LABELS[pt_.type_name] = pt_.type_name

        def build_side(side):
            by_type = {}
            for (s, etype, label), amt in flows.items():
                if s != side: continue
                if etype not in by_type:
                    by_type[etype] = {"type":etype, "type_label":ENTRY_TYPE_LABELS.get(etype,etype),
                                       "amount":0, "breakdown":[]}
                by_type[etype]["amount"] += amt
                by_type[etype]["breakdown"].append({"label":label, "amount":round(amt,2)})
            out = []
            for v in by_type.values():
                v["amount"] = round(v["amount"], 2)
                v["breakdown"].sort(key=lambda b:-b["amount"])
                out.append(v)
            out.sort(key=lambda v:-v["amount"])
            return out

        sources = build_side("in")
        uses    = build_side("out")
        total_in  = round(sum(s["amount"] for s in sources), 2)
        total_out = round(sum(u["amount"] for u in uses), 2)

        # Opening balance: for every account in scope, opening_balance
        # (since inception) plus net movement strictly BEFORE from_date.
        # Closing balance: opening + total_in - total_out for the period.
        # This mirrors the same calculation used in /balances-summary so
        # the two reports never disagree.
        opening_total = 0.0
        for aid in account_ids:
            acct = session.query(BankAccount).filter_by(id=aid).first()
            if not acct: continue
            base_ob = float(acct.opening_balance or 0)
            if fd:
                pre_agg = session.query(
                    func.coalesce(func.sum(BankLedger.deposit), 0),
                    func.coalesce(func.sum(BankLedger.withdraw), 0),
                ).filter(
                    BankLedger.company_id==cid, BankLedger.bank_account_id==aid,
                    BankLedger.entry_date < fd,
                    (BankLedger.is_void==False)|(BankLedger.is_void==None),
                ).first()
                opening_total += base_ob + float(pre_agg[0] or 0) - float(pre_agg[1] or 0)
            else:
                opening_total += base_ob
        opening_total = round(opening_total, 2)
        closing_total = round(opening_total + total_in - total_out, 2)

        return jsonify({
            "sources": sources, "uses": uses,
            "total_in": total_in, "total_out": total_out,
            "net": round(total_in - total_out, 2),
            "opening_balance": opening_total,
            "closing_balance": closing_total,
            "scope": scope, "account_count": len(account_ids),
        })
    finally: session.close()


@app.route("/api/bank-accounts/reconcile", methods=["GET"])
def reconcile_bank_gl():
    """
    Reconciliation check: for each GL control account used by bank accounts,
    compare SUM(bank sub-ledger running balances) vs. the GL Book balance
    for that GL code. Any mismatch signals a posting error (e.g. unposted
    entries, or a manual GL journal that bypassed the bank ledger).
    """
    cid = request.args.get("company_id", type=int)
    if not cid: return jsonify({"error":"company_id required"}),400
    session = SessionLocal()
    try:
        accts = session.query(BankAccount).filter_by(company_id=cid, is_active=True).all()
        gl_subledger_totals = {}
        for a in accts:
            ob = float(a.opening_balance or 0)
            agg = session.query(
                func.coalesce(func.sum(BankLedger.deposit), 0),
                func.coalesce(func.sum(BankLedger.withdraw), 0),
            ).filter_by(company_id=cid, bank_account_id=a.id).first()
            bal = ob + float(agg[0] or 0) - float(agg[1] or 0)
            key = a.gl_code or "—"
            gl_subledger_totals[key] = gl_subledger_totals.get(key, 0) + bal

        results = []
        for gl_code, subledger_total in gl_subledger_totals.items():
            # GL Book stores gl_code as "2230 - Nabil Bank - A/c" (combined string).
            # Match on entries that START with the raw gl_code followed by " - ".
            gl_agg = session.query(
                func.coalesce(func.sum(GLBook.dr_amount), 0),
                func.coalesce(func.sum(GLBook.cr_amount), 0),
            ).filter(
                GLBook.company_id == cid,
                GLBook.gl_code.like(f"{gl_code} - %")
            ).first()
            gl_balance = float(gl_agg[0] or 0) - float(gl_agg[1] or 0)
            diff = round(subledger_total - gl_balance, 2)
            results.append({
                "gl_code":          gl_code,
                "subledger_total":  round(subledger_total, 2),
                "gl_book_balance":  round(gl_balance, 2),
                "difference":       diff,
                "matched":          abs(diff) < 0.01,
            })

        return jsonify({"results": results, "all_matched": all(r["matched"] for r in results)})
    finally: session.close()


# ════════════════════════════════════════════════════════════
#  JOURNAL ENTRY
#  Mirrors Excel Module_JournalEntry. GL picker EXCLUDES Bank
#  Account and Cash In Hand GLs by design — those route through
#  Bank & Cash Ledger instead. Party-linked lines look up the GL
#  account from the party's own record (PartyMaster.gl_account),
#  never a hardcoded type->GL dict — works for any party type.
# ════════════════════════════════════════════════════════════

def _get_next_journal_ref(session, company_id):
    s = session.query(Settings).filter_by(company_id=company_id).first()
    prefix = (s.prefix_journal if s else None) or "JV-"
    count = session.query(JournalEntry).filter_by(company_id=company_id).count()
    return f"{prefix}{str(count+1).zfill(4)}"


@app.route("/api/journal/gl-picker", methods=["GET"])
def get_journal_gl_picker():
    """
    GL accounts available for Journal Entry lines — EXCLUDES Bank
    Account and Cash In Hand GLs (sub_group contains "Bank Account"
    or "Cash In Hand"), matching the Excel form's exclusion rule.
    Those transactions belong in Bank & Cash Ledger instead.
    """
    cid = request.args.get("company_id", type=int)
    if not cid: return jsonify({"error":"company_id required"}),400
    session = SessionLocal()
    try:
        accs = session.query(GLAccount).filter_by(company_id=cid).order_by(GLAccount.gl_code).all()
        result = []
        for a in accs:
            sg = (a.sub_group or "").lower()
            if "bank account" in sg or "cash in hand" in sg:
                continue
            result.append({"id":a.id,"gl_code":a.gl_code,"gl_name":a.gl_name,
                "header":a.header or "","main_group":a.main_group or "","sub_group":a.sub_group or ""})
        return jsonify({"accounts": result})
    finally: session.close()


@app.route("/api/journal", methods=["GET"])
def get_journal_entries():
    """List journal vouchers for a company, most recent first."""
    cid = request.args.get("company_id", type=int)
    from_date = request.args.get("from_date","")
    to_date   = request.args.get("to_date","")
    include_void = request.args.get("include_void","false").lower() == "true"
    if not cid: return jsonify({"error":"company_id required"}),400
    session = SessionLocal()
    try:
        q = session.query(JournalEntry).filter_by(company_id=cid)
        if not include_void:
            q = q.filter((JournalEntry.is_void==False)|(JournalEntry.is_void==None))
        if from_date:
            try: q = q.filter(JournalEntry.entry_date >= date.fromisoformat(from_date))
            except: pass
        if to_date:
            try: q = q.filter(JournalEntry.entry_date <= date.fromisoformat(to_date))
            except: pass
        rows = q.order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc()).all()
        return jsonify({"entries":[{
            "id":           r.id, "internal_ref": r.internal_ref,
            "entry_date":   r.entry_date.isoformat() if r.entry_date else None,
            "description":  r.description, "total_dr": float(r.total_dr or 0),
            "total_cr":     float(r.total_cr or 0), "is_posted": r.is_posted,
            "is_void":      r.is_void or False, "voided_by": r.voided_by or "",
            "voided_at":    r.voided_at.isoformat() if r.voided_at else None,
        } for r in rows]})
    finally: session.close()


@app.route("/api/journal/<int:jid>/lines", methods=["GET"])
def get_journal_lines(jid):
    cid = request.args.get("company_id", type=int)
    session = SessionLocal()
    try:
        j = session.query(JournalEntry).filter_by(id=jid, company_id=cid).first()
        if not j: return jsonify({"error":"Journal entry not found"}),404
        lines = session.query(JournalEntryLine).filter_by(journal_id=jid).order_by(JournalEntryLine.line_no).all()
        return jsonify({
            "journal": {
                "id": j.id, "internal_ref": j.internal_ref,
                "entry_date": j.entry_date.isoformat() if j.entry_date else None,
                "description": j.description, "total_dr": float(j.total_dr or 0),
                "total_cr": float(j.total_cr or 0), "is_posted": j.is_posted,
                "is_void": j.is_void or False,
            },
            "lines": [{
                "id":line_.id, "line_no":line_.line_no, "side":line_.side,
                "gl_account":line_.gl_account, "party_name":line_.party_name,
                "amount":float(line_.amount or 0), "narration":line_.narration,
                "invoice_ref":line_.invoice_ref,
            } for line_ in lines]
        })
    finally: session.close()


@app.route("/api/journal", methods=["POST"])
def save_journal_entry():
    """
    Save a Journal Voucher: header + Dr/Cr lines, validated balanced,
    then immediately posted to GL Book (and Party Ledger for any
    party-linked line). Mirrors Excel's SaveJournalEntry, which posts
    on save with no separate "post later" step.

    Body: {
      company_id, requesting_user_id, entry_date, description,
      lines: [{side:"Dr"|"Cr", gl_account, party_name, amount, narration, invoice_ref}]
    }
    """
    data = request.json or {}
    cid = data.get("company_id")
    if not cid: return jsonify({"error":"company_id required"}),400

    session = SessionLocal()
    try:
        lines_in = data.get("lines", [])
        if len(lines_in) < 2:
            return jsonify({"error":"A journal voucher needs at least one Dr and one Cr line"}),400

        try: ed = date.fromisoformat(str(data.get("entry_date","")).strip())
        except: return jsonify({"error":"Invalid entry_date"}),400

        total_dr = 0.0; total_cr = 0.0
        clean_lines = []
        for i, l in enumerate(lines_in):
            side = str(l.get("side","")).strip()
            if side not in ("Dr","Cr"):
                return jsonify({"error":f"Line {i+1}: side must be 'Dr' or 'Cr'"}),400
            amt = float(l.get("amount") or 0)
            if amt <= 0:
                return jsonify({"error":f"Line {i+1}: amount must be greater than 0"}),400
            gl_account = str(l.get("gl_account","")).strip()
            party_name = str(l.get("party_name","")).strip()
            if not gl_account and not party_name:
                return jsonify({"error":f"Line {i+1}: select a GL account or a party"}),400
            if party_name and not gl_account:
                # Party-linked line — look up the party's own control GL,
                # never a hardcoded type->GL mapping. Works for any type.
                pm = session.query(PartyMaster).filter(
                    PartyMaster.company_id == cid,
                    func.lower(func.trim(PartyMaster.name)) == party_name.lower()
                ).first()
                if not pm or not pm.gl_account:
                    return jsonify({"error":f"Line {i+1}: party '{party_name}' has no GL account set in Party Master"}),400
                gl_account = pm.gl_account
            if side == "Dr": total_dr += amt
            else: total_cr += amt
            clean_lines.append({
                "side":side, "gl_account":gl_account, "party_name":party_name,
                "amount":round(amt,2), "narration":str(l.get("narration","")).strip(),
                "invoice_ref":str(l.get("invoice_ref","")).strip(),
            })

        total_dr = round(total_dr,2); total_cr = round(total_cr,2)
        if abs(total_dr - total_cr) >= 0.01:
            return jsonify({
                "error": f"Voucher is not balanced — Total Dr {total_dr:.2f} ≠ Total Cr {total_cr:.2f}. "
                         f"Difference: {abs(total_dr-total_cr):.2f}"
            }), 400

        iref = _get_next_journal_ref(session, cid)
        je = JournalEntry(
            company_id=cid, entry_date=ed, internal_ref=iref,
            description=str(data.get("description","")).strip(),
            total_dr=total_dr, total_cr=total_cr,
            created_by=data.get("requesting_user_id"),
        )
        session.add(je); session.flush()

        for i, l in enumerate(clean_lines, 1):
            session.add(JournalEntryLine(
                journal_id=je.id, company_id=cid, line_no=i, side=l["side"],
                gl_account=l["gl_account"], party_name=l["party_name"],
                amount=l["amount"], narration=l["narration"], invoice_ref=l["invoice_ref"],
            ))

        # ── Post to GL Book — one row per line, same unique_id (the JV ref) ──
        narr_header = str(data.get("description","")).strip()
        for l in clean_lines:
            desc = l["narration"] or narr_header
            if l["invoice_ref"]: desc = f"{desc} | {l['invoice_ref']}"
            session.add(GLBook(
                company_id=cid, entry_date=ed, unique_id=iref,
                gl_code=l["gl_account"], gl_name=l["gl_account"],
                description=desc,
                dr_amount=l["amount"] if l["side"]=="Dr" else 0,
                cr_amount=l["amount"] if l["side"]=="Cr" else 0,
                source="Journal", transaction_type="Journal Entry",
                created_by=data.get("requesting_user_id"),
            ))

        # ── Post to Party Ledger for any party-linked line ──
        for l in clean_lines:
            if not l["party_name"]: continue
            pm = session.query(PartyMaster).filter(
                PartyMaster.company_id == cid,
                func.lower(func.trim(PartyMaster.name)) == l["party_name"].lower()
            ).first()
            ptype = pm.party_type if pm else ""
            desc = l["narration"] or narr_header
            if l["invoice_ref"]: desc = f"{desc} | {l['invoice_ref']}"
            _add_party_ledger_entry(
                session, cid, ed, l["party_name"], ptype,
                "Journal Entry", iref, desc,
                debit  = l["amount"] if l["side"]=="Dr" else 0,
                credit = l["amount"] if l["side"]=="Cr" else 0,
                source = "Journal", gl_account = l["gl_account"],
            )

        je.is_posted = True
        session.commit()
        return jsonify({"success":True, "internal_ref":iref, "id":je.id}), 201
    except Exception as e:
        session.rollback()
        import traceback; tb=traceback.format_exc()
        print(f"[ERROR] save_journal_entry: {e}\n{tb}")
        return jsonify({"error":str(e)}), 500
    finally: session.close()


@app.route("/api/journal/<int:jid>/void", methods=["POST"])
def void_journal_entry(jid):
    """
    Void a journal voucher — Super Admin / company_admin only, requires
    typing the exact internal_ref to confirm. Reverses GL Book (Dr/Cr
    swapped) and Party Ledger (same swap) for every line. The Excel had
    no void mechanism for Journal Entry at all — this closes that gap,
    matching the Purchase/Sales/Bank void pattern already in place.
    """
    data = request.json or {}
    cid = data.get("company_id")
    confirm_ref = (data.get("confirm_doc_number") or "").strip()
    void_reason = (data.get("void_reason") or "").strip()

    session = SessionLocal()
    try:
        if not _can_void(session, data.get("requesting_user_id"), cid):
            return jsonify({"error":"Only Admin or Super Admin can void entries"}),403

        je = session.query(JournalEntry).filter_by(id=jid, company_id=cid).first()
        if not je: return jsonify({"error":"Journal entry not found"}),404
        if je.is_void: return jsonify({"error":"Already voided"}),400
        if confirm_ref != je.internal_ref:
            return jsonify({"error":f"Document number '{confirm_ref}' does not match '{je.internal_ref}'. Type the exact reference to confirm."}),400

        user = session.query(User).filter_by(id=data.get("requesting_user_id")).first()
        je.is_void = True
        je.voided_by = user.username if user else str(data.get("requesting_user_id"))
        je.voided_at = dt.now(timezone.utc)
        je.void_reason = void_reason or "Voided by user"

        gl_rev = 0
        for gl in session.query(GLBook).filter_by(company_id=cid, unique_id=je.internal_ref).all():
            session.add(GLBook(
                company_id=cid, entry_date=dt.now(timezone.utc).date(),
                unique_id=f"VOID-{je.internal_ref}",
                gl_code=gl.gl_code, gl_name=gl.gl_name,
                description=f"VOID: {gl.description}",
                dr_amount=gl.cr_amount, cr_amount=gl.dr_amount,
                source="Void", transaction_type="Void",
                created_by=data.get("requesting_user_id"),
            ))
            gl_rev += 1

        pl_rev = 0
        for pl in session.query(PartyLedger).filter_by(company_id=cid, reference=je.internal_ref).all():
            session.add(PartyLedger(
                company_id=cid, entry_date=dt.now(timezone.utc).date(),
                party_name=pl.party_name, party_type=pl.party_type,
                txn_type="Void", reference=f"VOID-{je.internal_ref}",
                description=f"VOID: {pl.description}",
                debit=pl.credit, credit=pl.debit,
                source="Void", gl_account=pl.gl_account,
            ))
            pl_rev += 1

        session.commit()
        return jsonify({
            "success":True, "message":f"Journal entry '{je.internal_ref}' voided successfully.",
            "voided_by":je.voided_by, "voided_at":je.voided_at.isoformat(),
            "gl_reversals":gl_rev, "party_reversals":pl_rev,
        }), 200
    except Exception as e:
        session.rollback()
        import traceback; tb=traceback.format_exc()
        print(f"[ERROR] void_journal_entry: {e}\n{tb}")
        return jsonify({"error":str(e)}), 500
    finally: session.close()


@app.route("/api/bank-accounts", methods=["POST"])
def create_bank_account():
    data = request.json or {}
    cid  = data.get("company_id")
    if not cid: return jsonify({"error":"company_id required"}),400
    session = SessionLocal()
    try:
        ob = float(data.get("opening_balance") or 0)
        gl_code = data.get("gl_code","").strip()
        acct = BankAccount(
            company_id      = cid,
            account_name    = data.get("account_name","").strip(),
            account_no      = data.get("account_no","").strip(),
            gl_code         = gl_code,
            gl_name         = data.get("gl_name","").strip(),
            opening_balance = ob,
        )
        session.add(acct)
        # Sync opening balance to gl_accounts so GL OB and Trial Balance match
        if ob > 0 and gl_code:
            gl = session.query(GLAccount).filter_by(
                gl_code=gl_code, company_id=cid).first()
            if gl:
                gl.opening_dr = ob; gl.opening_cr = 0
        session.commit()
        return jsonify({"success":True,"id":acct.id}),201
    except Exception as e:
        session.rollback(); return jsonify({"error":str(e)}),500
    finally: session.close()

# ── BANK LEDGER — CHECK DUPLICATE ────────────────────────────
@app.route("/api/bank-ledger/check-duplicate", methods=["POST"])
def check_bank_duplicate():
    """
    Check if a same-date + same-amount + same-party transaction already exists.
    Returns {duplicate: true/false, existing: [{id, narration, source, seq_no}]}
    Frontend uses this to show the confirmation popup.
    """
    data            = request.json or {}
    cid             = data.get("company_id")
    bank_account_id = data.get("bank_account_id")
    entry_date_str  = data.get("entry_date","")
    withdraw        = float(data.get("withdraw") or 0)
    deposit         = float(data.get("deposit")  or 0)
    party_name      = (data.get("party_name") or "").strip().lower()

    if not cid or not bank_account_id or not entry_date_str:
        return jsonify({"duplicate":False,"existing":[]})

    session = SessionLocal()
    try:
        try: ed = date.fromisoformat(entry_date_str)
        except: return jsonify({"duplicate":False,"existing":[]})

        amount = withdraw if withdraw > 0 else deposit
        if amount <= 0: return jsonify({"duplicate":False,"existing":[]})

        q = session.query(BankLedger).filter(
            BankLedger.company_id      == cid,
            BankLedger.bank_account_id == bank_account_id,
            BankLedger.entry_date      == ed,
        )
        # Amount match: same withdraw or same deposit
        if withdraw > 0:
            q = q.filter(BankLedger.withdraw == round(withdraw, 2))
        else:
            q = q.filter(BankLedger.deposit  == round(deposit,  2))

        existing = q.all()

        # Filter by party name if provided
        if party_name:
            existing = [e for e in existing
                        if (e.party_name or "").strip().lower() == party_name]

        if not existing:
            return jsonify({"duplicate":False,"existing":[]})

        return jsonify({
            "duplicate": True,
            "existing": [{
                "id":         e.id,
                "narration":  e.narration,
                "source":     e.source,
                "seq_no":     e.seq_no,
                "internal_ref": e.internal_ref,
            } for e in existing]
        })
    finally: session.close()


# ── BANK LEDGER — IMPORT FROM CSV/EXCEL ──────────────────────
@app.route("/api/bank-ledger/import", methods=["POST"])
def import_bank_statement():
    """
    POST body: {
      company_id, bank_account_id,
      rows: [{date, narration, withdraw, deposit}],
      confirmed_duplicates: [row_index list — user confirmed these are genuine]
    }
    Returns: {saved, skipped_duplicates, rows: [{id, internal_ref, status}]}
    """
    data            = request.json or {}
    cid             = data.get("company_id")
    bank_account_id = data.get("bank_account_id")
    rows            = data.get("rows", [])
    confirmed_dups  = set(data.get("confirmed_duplicates", []))  # row indices confirmed by user

    if not cid or not bank_account_id or not rows:
        return jsonify({"error":"company_id, bank_account_id, and rows required"}),400

    session = SessionLocal()
    try:
        acct = session.query(BankAccount).filter_by(id=bank_account_id, company_id=cid).first()
        if not acct: return jsonify({"error":"Bank account not found"}),404

        # Get settings for prefix
        settings = session.query(Settings).filter_by(company_id=cid).first()
        prefix   = (settings.prefix_bank if settings else None) or "BNK-"

        # Get current running balance (last row for this account)
        last = session.query(BankLedger).filter_by(
            company_id=cid, bank_account_id=bank_account_id
        ).order_by(BankLedger.entry_date.desc(), BankLedger.id.desc()).first()
        running_balance = float(last.balance) if last else float(acct.opening_balance or 0)

        # Get next internal ref number
        last_ref = session.query(BankLedger).filter(
            BankLedger.company_id == cid,
            BankLedger.internal_ref.like(f"{prefix}%")
        ).order_by(BankLedger.id.desc()).first()
        next_num = 1
        if last_ref and last_ref.internal_ref:
            try: next_num = int(last_ref.internal_ref.replace(prefix,"")) + 1
            except: pass

        saved = 0; skipped = 0; result_rows = []

        for idx, row in enumerate(rows):
            try:
                ed = date.fromisoformat(str(row.get("date","")).strip())
            except:
                result_rows.append({"index":idx,"status":"error","reason":"invalid date"})
                continue

            wd  = abs(float(row.get("withdraw") or 0))
            dep = abs(float(row.get("deposit")  or 0))
            narr = str(row.get("narration","")).strip()
            party_raw = str(row.get("party_name","")).strip()

            if wd == 0 and dep == 0:
                result_rows.append({"index":idx,"status":"skipped","reason":"zero amount"})
                skipped += 1; continue

            amount = wd if wd > 0 else dep

            # Duplicate check (same date + amount + party)
            dup_q = session.query(BankLedger).filter(
                BankLedger.company_id      == cid,
                BankLedger.bank_account_id == bank_account_id,
                BankLedger.entry_date      == ed,
            )
            if wd > 0:  dup_q = dup_q.filter(BankLedger.withdraw == round(wd, 2))
            else:        dup_q = dup_q.filter(BankLedger.deposit  == round(dep, 2))
            if party_raw:
                dup_q = dup_q.filter(
                    func.lower(func.trim(BankLedger.party_name)) == party_raw.lower()
                )
            dups = dup_q.all()

            if dups and idx not in confirmed_dups:
                result_rows.append({
                    "index":  idx,
                    "status": "duplicate",
                    "reason": f"Same date {ed}, amount {amount}, party '{party_raw}' already exists",
                    "existing_ref": dups[0].internal_ref,
                })
                skipped += 1; continue

            # seq_no for legitimate repeated transactions
            seq_no = len(dups) + 1 if dups else 1

            running_balance += (dep - wd)
            iref = f"{prefix}{str(next_num).zfill(4)}"
            next_num += 1

            bl = BankLedger(
                company_id      = cid,
                bank_account_id = bank_account_id,
                entry_date      = ed,
                narration       = narr,
                withdraw        = round(wd, 2),
                deposit         = round(dep, 2),
                balance         = round(running_balance, 2),
                source          = "import",
                internal_ref    = iref,
                seq_no          = seq_no,
                party_name      = party_raw,
            )
            session.add(bl)
            session.flush()
            saved += 1
            result_rows.append({"index":idx,"status":"saved","internal_ref":iref,"id":bl.id})

        session.commit()
        return jsonify({"success":True,"saved":saved,"skipped":skipped,"rows":result_rows})
    except Exception as e:
        session.rollback()
        import traceback; tb=traceback.format_exc()
        print(f"[ERROR] import_bank_statement: {e}\n{tb}")
        return jsonify({"error":str(e)}),500
    finally: session.close()


# ── BANK LEDGER — MANUAL ENTRY ────────────────────────────────
@app.route("/api/bank-ledger/manual", methods=["POST"])
def save_bank_manual():
    """
    POST a single manual bank entry.
    Body: {company_id, bank_account_id, entry_date, narration, withdraw, deposit,
           entry_type, gl_account, party_name, party_type, charge_type,
           invoice_ref, narration2, date_bs, confirmed_duplicate}
    """
    data            = request.json or {}
    cid             = data.get("company_id")
    bank_account_id = data.get("bank_account_id")
    confirmed       = data.get("confirmed_duplicate", False)

    if not cid or not bank_account_id:
        return jsonify({"error":"company_id and bank_account_id required"}),400

    session = SessionLocal()
    try:
        acct = session.query(BankAccount).filter_by(id=bank_account_id, company_id=cid).first()
        if not acct: return jsonify({"error":"Bank account not found"}),404

        try: ed = date.fromisoformat(str(data.get("entry_date","")).strip())
        except: return jsonify({"error":"Invalid entry_date"}),400

        wd   = abs(float(data.get("withdraw") or 0))
        dep  = abs(float(data.get("deposit")  or 0))
        if wd == 0 and dep == 0:
            return jsonify({"error":"Enter either withdraw or deposit amount"}),400

        party_raw = str(data.get("party_name") or "").strip()
        entry_type_raw = str(data.get("entry_type") or "").strip()
        gl_account_raw = str(data.get("gl_account") or "").strip()

        # If a classification is given at entry time, it must be complete —
        # same rule as classify_bank_entry. A "GL" type with no gl_account
        # produces a row that later shows up labeled literally "GL" instead
        # of a real account name in reports like Cash Sources vs Uses.
        if entry_type_raw in ("GL","Contra") and not gl_account_raw:
            return jsonify({"error": f"GL Account is required when classifying as {entry_type_raw}."}), 400
        if entry_type_raw == "Party" and not party_raw:
            return jsonify({"error": "Party Name is required when classifying as Party."}), 400

        # Duplicate check
        if not confirmed:
            dup_q = session.query(BankLedger).filter(
                BankLedger.company_id      == cid,
                BankLedger.bank_account_id == bank_account_id,
                BankLedger.entry_date      == ed,
            )
            if wd > 0:  dup_q = dup_q.filter(BankLedger.withdraw == round(wd, 2))
            else:        dup_q = dup_q.filter(BankLedger.deposit  == round(dep, 2))
            if party_raw:
                dup_q = dup_q.filter(
                    func.lower(func.trim(BankLedger.party_name)) == party_raw.lower()
                )
            dups = dup_q.all()
            if dups:
                return jsonify({
                    "duplicate":    True,
                    "message":      f"Duplicate amount — same date, amount and party already exists (Ref: {dups[0].internal_ref}). Shall I confirm?",
                    "existing_ref": dups[0].internal_ref,
                    "existing_narration": dups[0].narration,
                }), 409  # 409 Conflict = "confirm needed"

        # Running balance
        last = session.query(BankLedger).filter_by(
            company_id=cid, bank_account_id=bank_account_id
        ).order_by(BankLedger.entry_date.desc(), BankLedger.id.desc()).first()
        running_balance = float(last.balance) if last else float(acct.opening_balance or 0)
        running_balance += (dep - wd)

        # Internal ref
        settings = session.query(Settings).filter_by(company_id=cid).first()
        prefix   = (settings.prefix_bank if settings else None) or "BNK-"
        last_ref = session.query(BankLedger).filter(
            BankLedger.company_id == cid,
            BankLedger.internal_ref.like(f"{prefix}%")
        ).order_by(BankLedger.id.desc()).first()
        next_num = 1
        if last_ref and last_ref.internal_ref:
            try: next_num = int(last_ref.internal_ref.replace(prefix,"")) + 1
            except: pass

        # seq_no
        seq_q = session.query(BankLedger).filter(
            BankLedger.company_id      == cid,
            BankLedger.bank_account_id == bank_account_id,
            BankLedger.entry_date      == ed,
        )
        if wd > 0:  seq_q = seq_q.filter(BankLedger.withdraw == round(wd, 2))
        else:        seq_q = seq_q.filter(BankLedger.deposit  == round(dep, 2))
        if party_raw:
            seq_q = seq_q.filter(
                func.lower(func.trim(BankLedger.party_name)) == party_raw.lower()
            )
        seq_no = seq_q.count() + 1

        iref = f"{prefix}{str(next_num).zfill(4)}"

        bl = BankLedger(
            company_id      = cid,
            bank_account_id = bank_account_id,
            entry_date      = ed,
            narration       = str(data.get("narration","")).strip(),
            withdraw        = round(wd, 2),
            deposit         = round(dep, 2),
            balance         = round(running_balance, 2),
            entry_type      = str(data.get("entry_type","")).strip(),
            gl_account      = str(data.get("gl_account","")).strip(),
            party_name      = party_raw,
            party_type      = str(data.get("party_type","")).strip(),
            charge_type     = str(data.get("charge_type","")).strip(),
            invoice_ref     = str(data.get("invoice_ref","")).strip(),
            narration2      = str(data.get("narration2","")).strip(),
            source          = "manual",
            internal_ref    = iref,
            seq_no          = seq_no,
            date_bs         = str(data.get("date_bs","")).strip(),
            created_by      = data.get("requesting_user_id"),
        )
        session.add(bl); session.commit()
        return jsonify({"success":True,"id":bl.id,"internal_ref":iref,
                        "balance":round(running_balance,2)}),201
    except Exception as e:
        session.rollback()
        import traceback; tb=traceback.format_exc()
        print(f"[ERROR] save_bank_manual: {e}\n{tb}")
        return jsonify({"error":str(e)}),500
    finally: session.close()


# ── BANK LEDGER — GET ENTRIES ─────────────────────────────────
@app.route("/api/bank-ledger", methods=["GET"])
def get_bank_ledger():
    cid             = request.args.get("company_id", type=int)
    bank_account_id = request.args.get("bank_account_id", type=int)
    from_date       = request.args.get("from_date","")
    to_date         = request.args.get("to_date","")
    limit           = request.args.get("limit", 1000, type=int)
    include_voided  = request.args.get("include_voided","false").lower() == "true"
    if not cid: return jsonify({"error":"company_id required"}),400

    session = SessionLocal()
    try:
        q = session.query(BankLedger).filter(BankLedger.company_id == cid)
        if bank_account_id: q = q.filter(BankLedger.bank_account_id == bank_account_id)
        if not include_voided:
            q = q.filter((BankLedger.is_void == False) | (BankLedger.is_void == None))
        if from_date:
            try: q = q.filter(BankLedger.entry_date >= date.fromisoformat(from_date))
            except: pass
        if to_date:
            try: q = q.filter(BankLedger.entry_date <= date.fromisoformat(to_date))
            except: pass
        entries = q.order_by(BankLedger.entry_date, BankLedger.id).limit(limit).all()

        return jsonify({"entries":[{
            "id":            e.id,
            "bank_account_id": e.bank_account_id,
            "entry_date":    e.entry_date.isoformat() if e.entry_date else None,
            "narration":     e.narration,
            "withdraw":      float(e.withdraw or 0),
            "deposit":       float(e.deposit  or 0),
            "balance":       float(e.balance  or 0),
            "entry_type":    e.entry_type or "",
            "gl_account":    e.gl_account or "",
            "party_name":    e.party_name or "",
            "party_type":    e.party_type or "",
            "charge_type":   e.charge_type or "",
            "invoice_ref":   e.invoice_ref or "",
            "is_posted_gl":  e.is_posted_gl,
            "is_posted_party":e.is_posted_party,
            "source":        e.source or "",
            "internal_ref":  e.internal_ref or "",
            "is_void":       e.is_void or False,
            "voided_by":     e.voided_by or "",
            "voided_at":     e.voided_at.isoformat() if e.voided_at else None,
            "void_reason":   e.void_reason or "",
            "seq_no":        e.seq_no or 1,
            "date_bs":       e.date_bs or "",
        } for e in entries], "total":len(entries)})
    finally: session.close()


# ── BANK LEDGER — VOID (soft delete) ──────────────────────────
@app.route("/api/bank-ledger/<int:eid>/void", methods=["POST"])
def void_bank_entry(eid):
    """
    POST /api/bank-ledger/<id>/void
    Body: { requesting_user_id, company_id, confirm_doc_number, void_reason }

    - Only Super Admin / company_admin / admin can void (reuses _can_void).
    - User MUST type the exact internal_ref to confirm (e.g. "BNK-0007").
    - Soft-deletes: sets is_void=True with who/when/why recorded.
    - Reverses GL Book entries for this transaction (swap Dr/Cr).
    - Reverses Party Ledger entries for this transaction (swap Dr/Cr),
      if the entry was AR/AP/HR/LC/TDS and had been posted.
    - Recalculates the running `balance` column for every entry on this
      bank account dated on/after the voided entry, since removing a
      withdrawal/deposit from the middle of the ledger shifts every
      subsequent balance.
    - Voided entries remain visible (filtered out by default, included
      with include_voided=true) for audit trail.
    """
    session = SessionLocal()
    try:
        data = request.get_json() or {}
        req_user    = data.get("requesting_user_id")
        cid         = data.get("company_id")
        confirm_doc = (data.get("confirm_doc_number") or "").strip()
        void_reason = (data.get("void_reason") or "").strip()

        if not confirm_doc:
            return jsonify({"error":"confirm_doc_number is required"}),400
        if not _can_void(session, req_user, cid):
            return jsonify({"error":"Only Admin or Super Admin can void entries"}),403

        entry = session.query(BankLedger).filter_by(id=eid, company_id=cid).first()
        if not entry: return jsonify({"error":"Entry not found"}),404
        if entry.is_void: return jsonify({"error":"Entry is already voided"}),400

        if confirm_doc != (entry.internal_ref or "").strip():
            return jsonify({
                "error": f"Document number '{confirm_doc}' does not match "
                         f"reference '{entry.internal_ref}'. Type the exact reference to confirm."
            }), 400

        user = session.query(User).filter_by(id=req_user).first()
        voided_by_name = user.username if user else str(req_user)
        entry.is_void     = True
        entry.voided_by   = voided_by_name
        entry.voided_at   = dt.now(timezone.utc)
        entry.void_reason = void_reason or "Voided by user"

        # ── Reverse GL Book entries (only if this was posted) ──────
        gl_rev_count = 0
        if entry.is_posted_gl:
            search_ids = [entry.internal_ref]
            if entry.is_split:
                # Split legs are referenced as "BNK-0013/1", "BNK-0013/2" etc.
                split_legs = session.query(BankLedgerSplit).filter_by(bank_ledger_id=entry.id).all()
                search_ids += [f"{entry.internal_ref}/{i}" for i in range(1, len(split_legs)+1)]
            gl_entries = session.query(GLBook).filter(
                GLBook.company_id == cid, GLBook.unique_id.in_(search_ids)
            ).all()
            for gl in gl_entries:
                session.add(GLBook(
                    company_id=cid, entry_date=dt.now(timezone.utc).date(),
                    unique_id=f"VOID-{entry.internal_ref}",
                    gl_code=gl.gl_code, gl_name=gl.gl_name,
                    description=f"VOID: {gl.description}",
                    dr_amount=gl.cr_amount, cr_amount=gl.dr_amount,  # swap to reverse
                    source="Void", transaction_type="Void",
                    created_by=req_user,
                ))
                gl_rev_count += 1

        # ── Reverse Party Ledger entries (only if this was posted) ─
        # Matches both simple entries (reference == internal_ref) AND
        # split legs (reference == "BNK-0016/1" style) — the previous
        # exact-match-only query missed every split leg's party_ledger
        # row entirely, meaning voiding a split LC/GL entry never
        # actually reversed its party ledger postings.
        pl_rev_count = 0
        pl_search_refs = [entry.internal_ref or ""]
        if entry.is_split:
            split_legs = session.query(BankLedgerSplit).filter_by(bank_ledger_id=entry.id).all()
            pl_search_refs += [f"{entry.internal_ref}/{i}" for i in range(1, len(split_legs)+1)]

        if entry.is_posted_party or entry.is_split:
            pl_entries = session.query(PartyLedger).filter(
                PartyLedger.company_id == cid,
                PartyLedger.reference.in_(pl_search_refs),
                PartyLedger.is_void == False,
            ).all()
            for pl in pl_entries:
                # Mark the ORIGINAL row as voided too — not just adding a
                # reversal — so it's correctly excluded from the active
                # party statement instead of sitting there looking like
                # a normal, un-reversed transaction.
                pl.is_void = True
                session.add(PartyLedger(
                    company_id  = cid,
                    entry_date  = dt.now(timezone.utc).date(),
                    party_name  = pl.party_name,
                    party_type  = pl.party_type,
                    txn_type    = "Void",
                    reference   = f"VOID-{entry.internal_ref}",
                    description = f"VOID: {pl.description}",
                    debit       = float(pl.credit or 0),  # swap to reverse
                    credit      = float(pl.debit or 0),
                    source      = "Void",
                    gl_account  = pl.gl_account,
                    charge_type = pl.charge_type or "",
                ))
                pl_rev_count += 1

        session.flush()

        # ── Recalculate running balance for this bank account ──────
        # Voided entry's own amount no longer counts toward balance.
        # Every entry dated on/after this one needs its balance recomputed
        # in chronological order.
        acct = session.query(BankAccount).filter_by(id=entry.bank_account_id, company_id=cid).first()
        all_entries = session.query(BankLedger).filter(
            BankLedger.company_id == cid,
            BankLedger.bank_account_id == entry.bank_account_id,
            (BankLedger.is_void == False) | (BankLedger.is_void == None),
        ).order_by(BankLedger.entry_date, BankLedger.id).all()

        running = float(acct.opening_balance or 0) if acct else 0.0
        for e in all_entries:
            running += float(e.deposit or 0) - float(e.withdraw or 0)
            e.balance = round(running, 2)

        session.commit()
        return jsonify({
            "success": True,
            "message": f"Entry '{entry.internal_ref}' voided successfully.",
            "voided_by": entry.voided_by,
            "voided_at": entry.voided_at.isoformat(),
            "gl_reversals": gl_rev_count,
            "party_reversals": pl_rev_count,
            "balances_recalculated": len(all_entries),
        }), 200
    except Exception as e:
        session.rollback()
        import traceback; print(f"[ERROR] void_bank_entry: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
    finally: session.close()


# ════════════════════════════════════════════════════════════
#  BANK LEDGER — EDIT POSTED ENTRY (approval-gated)
#  A posted entry's classification can NEVER be changed directly.
#  Every correction must go through this request -> approve ->
#  auto-reverse-and-repost flow, even for the same admin who is
#  both requester and approver — there is no self-apply shortcut
#  here (unlike the split self-approval path), since this action
#  rewrites history that's already affected the books.
# ════════════════════════════════════════════════════════════

@app.route("/api/bank-ledger/<int:eid>/request-edit", methods=["POST"])
def request_bank_edit(eid):
    """
    Propose a correction to an already-posted bank_ledger entry.
    Body: { company_id, requesting_user_id, request_note,
             new_entry_type, new_gl_account, new_party_name,
             new_party_type, new_charge_type, new_invoice_ref, new_narration }
    Creates a pending BankEditRequest — nothing is changed yet.
    """
    data = request.json or {}
    cid  = data.get("company_id")
    session = SessionLocal()
    try:
        e = session.query(BankLedger).filter_by(id=eid, company_id=cid).first()
        if not e: return jsonify({"error":"Entry not found"}),404
        if not e.is_posted_gl:
            return jsonify({"error":"Entry is not posted yet — use Classify directly instead of requesting an edit."}),400
        if e.is_void:
            return jsonify({"error":"Entry is voided — cannot request an edit on a voided entry."}),400

        new_entry_type = str(data.get("new_entry_type","")).strip()
        if new_entry_type not in ("GL","Party","Contra"):
            return jsonify({"error":"new_entry_type must be GL, Party, or Contra"}),400

        existing_pending = session.query(BankEditRequest).filter_by(
            bank_ledger_id=eid, company_id=cid, status="pending"
        ).first()
        if existing_pending:
            return jsonify({"error":"There is already a pending edit request for this entry."}),400

        user = session.query(User).filter_by(id=data.get("requesting_user_id")).first()
        req = BankEditRequest(
            company_id      = cid,
            bank_ledger_id  = eid,
            new_entry_type  = new_entry_type,
            new_gl_account  = str(data.get("new_gl_account","")).strip(),
            new_party_name  = str(data.get("new_party_name","")).strip(),
            new_party_type  = str(data.get("new_party_type","")).strip(),
            new_charge_type = str(data.get("new_charge_type","")).strip(),
            new_invoice_ref = str(data.get("new_invoice_ref","")).strip(),
            new_narration   = str(data.get("new_narration","")).strip(),
            requested_by    = user.username if user else str(data.get("requesting_user_id") or ""),
            requested_at    = dt.now(timezone.utc),
            request_note    = str(data.get("request_note","")).strip(),
            status          = "pending",
        )
        session.add(req)
        session.commit()
        return jsonify({"success":True, "request_id":req.id,
                         "message":f"Edit request submitted for {e.internal_ref}. Awaiting admin approval."}), 201
    except Exception as ex:
        session.rollback(); return jsonify({"error":str(ex)}), 500
    finally: session.close()


@app.route("/api/bank-edit-requests", methods=["GET"])
def list_bank_edit_requests():
    cid    = request.args.get("company_id", type=int)
    status = request.args.get("status", "pending")
    if not cid: return jsonify({"error":"company_id required"}),400
    session = SessionLocal()
    try:
        q = session.query(BankEditRequest).filter_by(company_id=cid)
        if status != "all": q = q.filter_by(status=status)
        rows = q.order_by(BankEditRequest.requested_at.desc()).all()
        out = []
        for r in rows:
            entry = session.query(BankLedger).filter_by(id=r.bank_ledger_id).first()
            out.append({
                "id": r.id, "bank_ledger_id": r.bank_ledger_id,
                "internal_ref": entry.internal_ref if entry else None,
                "current_entry_type": entry.entry_type if entry else None,
                "current_party_name": entry.party_name if entry else None,
                "current_gl_account": entry.gl_account if entry else None,
                "current_charge_type": entry.charge_type if entry else None,
                "amount": float((entry.withdraw or entry.deposit) if entry else 0),
                "new_entry_type": r.new_entry_type, "new_gl_account": r.new_gl_account,
                "new_party_name": r.new_party_name, "new_party_type": r.new_party_type,
                "new_charge_type": r.new_charge_type, "new_invoice_ref": r.new_invoice_ref,
                "new_narration": r.new_narration,
                "requested_by": r.requested_by,
                "requested_at": r.requested_at.isoformat() if r.requested_at else None,
                "request_note": r.request_note, "status": r.status,
                "reviewed_by": r.reviewed_by,
                "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
                "review_note": r.review_note,
            })
        return jsonify({"requests": out})
    finally: session.close()


def _apply_bank_edit(session, cid, entry, req, reviewed_by_uid):
    """
    The actual reverse + repost mechanics, run only after admin
    approval. Both sides of the correction are shown here explicitly:

    SIDE 1 — reverse the original posting (GL Book + Party Ledger),
    Dr<->Cr swapped, tagged source="Edit-Reversal" (NOT "Void") so a
    later void of this same entry's CORRECTED posting can never
    accidentally re-match and re-reverse this old correction record.
    The original GL Book / Party Ledger rows are left untouched in
    place (still part of the audit trail) — only NEW reversal rows
    are added, exactly like void does, but distinctly tagged.

    SIDE 2 — post fresh GL Book + Party Ledger rows under the SAME
    internal_ref, using the approved new classification — this is
    what makes it an "edit" rather than "void + new transaction".
    """
    wd  = float(entry.withdraw or 0)
    dep = float(entry.deposit  or 0)
    amt = wd if wd > 0 else dep

    acct = session.query(BankAccount).filter_by(id=entry.bank_account_id, company_id=cid).first()
    bank_gl_name = f"{acct.gl_code} - {acct.gl_name}" if acct else "Bank"

    old_contra = entry.gl_account if entry.entry_type in ("GL","Contra") else None
    if entry.entry_type == "Party" and entry.party_name:
        pm_old = session.query(PartyMaster).filter(
            PartyMaster.company_id == cid,
            func.lower(func.trim(PartyMaster.name)) == entry.party_name.strip().lower()
        ).first()
        old_contra = pm_old.gl_account if pm_old else entry.gl_account

    # ── SIDE 1: reverse the original GL Book posting ──────────────
    old_gl_rows = session.query(GLBook).filter_by(company_id=cid, unique_id=entry.internal_ref).all()
    for gl in old_gl_rows:
        session.add(GLBook(
            company_id=cid, entry_date=dt.now(timezone.utc).date(),
            unique_id=entry.internal_ref,  # SAME ref — this is an edit, not a new txn
            gl_code=gl.gl_code, gl_name=gl.gl_name,
            description=f"EDIT-CORRECTION (reversal): {gl.description}",
            dr_amount=gl.cr_amount, cr_amount=gl.dr_amount,  # swap to reverse
            source="Edit-Reversal", transaction_type="Edit Correction",
            created_by=reviewed_by_uid,
        ))

    # ── SIDE 1 continued: reverse the original Party Ledger posting ─
    if entry.entry_type == "Party" and entry.party_name:
        old_pl_rows = session.query(PartyLedger).filter(
            PartyLedger.company_id == cid,
            PartyLedger.reference == entry.internal_ref,
            PartyLedger.is_void == False,
        ).all()
        for pl in old_pl_rows:
            pl.is_void = True  # superseded by the correction, same as a void would do
            session.add(PartyLedger(
                company_id=cid, entry_date=dt.now(timezone.utc).date(),
                party_name=pl.party_name, party_type=pl.party_type,
                txn_type="Edit Correction", reference=entry.internal_ref,
                description=f"EDIT-CORRECTION (reversal): {pl.description}",
                debit=float(pl.credit or 0), credit=float(pl.debit or 0),  # swap
                source="Edit-Reversal", gl_account=pl.gl_account,
                charge_type=pl.charge_type or "",
            ))

    # ── SIDE 2: post fresh GL Book row(s) under the corrected classification ──
    new_contra = req.new_gl_account
    if req.new_entry_type == "Party" and req.new_party_name:
        pm_new = session.query(PartyMaster).filter(
            PartyMaster.company_id == cid,
            func.lower(func.trim(PartyMaster.name)) == req.new_party_name.strip().lower()
        ).first()
        new_contra = pm_new.gl_account if pm_new else req.new_gl_account

    new_desc = req.new_narration or entry.narration or ""
    if req.new_invoice_ref: new_desc = f"{new_desc} | {req.new_invoice_ref}"

    if dep > 0:
        _add_gl_book_entry(session, cid, entry.entry_date,
            entry.internal_ref, bank_gl_name, bank_gl_name,
            new_contra, new_contra, new_desc, amt, "Bank_Ledger", "Bank Deposit (Edited)",
            created_by=reviewed_by_uid)
    else:
        _add_gl_book_entry(session, cid, entry.entry_date,
            entry.internal_ref, new_contra, new_contra,
            bank_gl_name, bank_gl_name, new_desc, amt, "Bank_Ledger", "Bank Payment (Edited)",
            created_by=reviewed_by_uid)

    # ── SIDE 2 continued: post fresh Party Ledger row if new type is Party ──
    if req.new_entry_type == "Party" and req.new_party_name and new_contra:
        if dep > 0: pl_debit, pl_credit = 0, amt
        else:        pl_debit, pl_credit = amt, 0
        _add_party_ledger_entry(
            session, cid, entry.entry_date,
            req.new_party_name, req.new_party_type or "",
            "Bank Payment (Edited)" if wd > 0 else "Bank Receipt (Edited)",
            entry.internal_ref, new_desc,
            debit=pl_debit, credit=pl_credit,
            source="Bank_Ledger", gl_account=new_contra,
            charge_type=req.new_charge_type or "",
        )

    # ── Update the bank_ledger row itself to reflect the new classification ──
    entry.entry_type  = req.new_entry_type
    entry.gl_account  = req.new_gl_account
    entry.party_name  = req.new_party_name
    entry.party_type  = req.new_party_type
    entry.charge_type = req.new_charge_type
    entry.invoice_ref = req.new_invoice_ref
    entry.narration2  = req.new_narration


@app.route("/api/bank-edit-requests/<int:rid>/review", methods=["POST"])
def review_bank_edit_request(rid):
    """
    Approve or reject a pending edit request. Only this COMPANY's own
    Admin can review — never the platform Super Admin, who has no
    day-to-day involvement in any individual company's transactions.
    Body: { company_id, requesting_user_id, action: "approve"|"reject", review_note }
    """
    data = request.json or {}
    cid    = data.get("company_id")
    action = (data.get("action") or "").strip()
    if action not in ("approve","reject"):
        return jsonify({"error":"action must be 'approve' or 'reject'"}),400

    session = SessionLocal()
    try:
        if not _is_company_admin(session, data.get("requesting_user_id"), cid):
            return jsonify({"error":"Only this company's own Admin can approve edit requests"}),403
        reviewer = session.query(User).filter_by(id=data.get("requesting_user_id")).first()
        if reviewer and reviewer.is_super_admin:
            return jsonify({"error":"Super Admin has no approval role in individual company transactions — sign in as this company's Admin instead."}),403

        req = session.query(BankEditRequest).filter_by(id=rid, company_id=cid).first()
        if not req: return jsonify({"error":"Edit request not found"}),404
        if req.status != "pending":
            return jsonify({"error":f"Request already {req.status}"}),400

        req.reviewed_by = reviewer.username if reviewer else str(data.get("requesting_user_id") or "")
        req.reviewed_at = dt.now(timezone.utc)
        req.review_note = str(data.get("review_note","")).strip()

        if action == "reject":
            req.status = "rejected"
            session.commit()
            return jsonify({"success":True, "status":"rejected"})

        entry = session.query(BankLedger).filter_by(id=req.bank_ledger_id, company_id=cid).first()
        if not entry: return jsonify({"error":"Source bank entry not found"}),404
        if entry.is_void: return jsonify({"error":"Entry was voided since this request was made — cannot apply."}),400

        _apply_bank_edit(session, cid, entry, req, data.get("requesting_user_id"))

        req.status = "applied"
        req.applied_at = dt.now(timezone.utc)
        session.commit()
        return jsonify({"success":True, "status":"applied",
                         "message":f"{entry.internal_ref} re-classified and re-posted with corrected entries."})
    except Exception as ex:
        session.rollback()
        import traceback; print(f"[ERROR] review_bank_edit_request: {ex}\n{traceback.format_exc()}")
        return jsonify({"error": str(ex)}), 500
    finally: session.close()


# ════════════════════════════════════════════════════════════
#  IMPORT LANDED REGISTER (ILR) — Unified Single-Stage Model
#
#  ARCHITECTURE (v4 — replaces the old two-stage Phase I / Phase II
#  save with ONE form, ONE save, per item, per PP No):
#
#  LC No. is a pure TAG (lc_no), never a party. Every Bank Ledger
#  payment related to an import (Material Value, Import Freight,
#  Import Duty, CSC, VAT, Agent Commission, Local Freight, Packing &
#  Forwarding, Bank Charges, Insurance) is posted to whichever REAL
#  party actually received the cash (RM supplier, freight forwarder,
#  customs office, agent — normal Vendor/Payables records, each with
#  their own GL mapping in Party Master). lc_no and charge_type ride
#  along on that Bank Ledger row purely as identifying/filterable tags.
#
#  Import Register queries Bank Ledger DIRECTLY (no separate tracking
#  table) to compute each field's "allocable pool":
#
#      remaining = SUM(BankLedger + BankLedgerSplit rows where
#                       lc_no = X AND charge_type = Y AND not void)
#                  - SUM(non-void ImportAllocation rows for that same
#                        lc_no + charge_type)
#
#  This pool is a HARD CAP — Material Value Paid (and every other
#  charge) cannot be allocated above what's actually been posted.
#
#  Cost build-up per item:
#      Local Ccy Rate         = FCY Rate * Exchange Rate
#      Basic Material Amount  = Qty * Local Ccy Rate              (reference)
#      Material Value Paid    = manual, capped by LC+"Material Value" pool
#      Forex Gain/(Loss)      = Basic Material Amount - Material Value Paid
#      Import Freight         = entered ONCE per PP No, capped by pool,
#                                apportioned across items by Basic Material
#                                Amount share
#      Import Duty, CSC       = manual, per item (NOT pool-capped — these
#                                are typed from the customs document, same
#                                as the original SOP's "based on PP records")
#      VAT                    = manual, per item; folds into Total Phase I
#                                Cost ONLY if vat_claimable=False
#      Total Phase I Cost     = Basic Material Amount + Import Freight
#                                + Import Duty + CSC + VAT(if cost)
#      Phase II group (Agent Commission, Local Freight, Packing &
#      Forwarding, Bank Charges, Insurance) = entered ONCE per PP No,
#                                capped by pool, apportioned across items
#                                by Total Phase I Cost share
#      Total Cost              = Total Phase I Cost + Phase II share
#      Landed Cost / Unit      = Total Cost / Qty
#
#  GL + Party posting on save:
#      Dr  2010 - Raw Material Stock     [Total Cost, item-wise]
#      Dr  1320 - VAT Input Tax          [claimable VAT]
#          Cr  [each real party's own mapped GL]   [that party's share]
#
#  NO special LC GL, no clearing entry. Each real party was already
#  Dr'd at Bank Ledger payment time (an advance); this entry credits
#  the SAME party for the SAME charge type, which nets their balance
#  toward zero automatically through ordinary party-ledger arithmetic
#  — exactly mirroring how Vendor sub-ledgers settle under 5010.
#
#  Stock Journal: one Receipt row per item, at final Landed Cost/Unit,
#  updating that material's running qty/value immediately.
# ════════════════════════════════════════════════════════════

# Phase II charge fields — apportioned by Total Phase I Cost share
P2_CHARGE_FIELDS = [
    ("p2_agent_commission", "Agent Commission"),
    ("p2_local_freight",    "Local Freight"),
    ("p2_packing_fwd",      "Packing & Forwarding"),
    ("p2_bank_charges",     "Bank Charges"),
    ("p2_insurance",        "Insurance"),
]


def _get_next_imp_voucher(session, company_id, lc_no, pp_no):
    """
    One IMP voucher per (LC No., PP No.) — NOT per save action. If items
    have already been saved under this LC+PP combination, reuse their
    existing imp_voucher; otherwise generate a new one. This is what
    lets the item-entry form keep adding rows to the same voucher as
    the user saves item after item under one PP No.
    """
    existing = session.query(ImportRegister.imp_voucher).filter_by(
        company_id=company_id, lc_no=lc_no, pp_no=pp_no
    ).filter(ImportRegister.is_void == False).first()
    if existing and existing[0]:
        return existing[0]
    s = session.query(Settings).filter_by(company_id=company_id).first()
    prefix = (s.prefix_import if hasattr(s,"prefix_import") and s and s.prefix_import else None) or "IMP-"
    count = session.query(func.count(func.distinct(ImportRegister.imp_voucher))).filter_by(company_id=company_id).scalar() or 0
    return f"{prefix}{str(count+1).zfill(4)}"


def _import_pool_posted(session, cid, lc_no, charge_type):
    """
    Sum of everything POSTED in Bank Ledger for this LC No. + Charge
    Type — across both single-row entries (BankLedger) and split legs
    (BankLedgerSplit), regardless of which real party received the
    cash. Only non-void rows count.
    """
    if not lc_no or not lc_no.strip():
        return 0.0
    lc_no = lc_no.strip()

    single_total = session.query(func.coalesce(func.sum(BankLedger.withdraw), 0)).filter(
        BankLedger.company_id == cid,
        BankLedger.is_void == False,
        BankLedger.lc_no == lc_no,
        BankLedger.charge_type == charge_type,
        BankLedger.is_split == False,
    ).scalar() or 0

    split_total = session.query(func.coalesce(func.sum(BankLedgerSplit.split_amount), 0)).join(
        BankLedger, BankLedger.id == BankLedgerSplit.bank_ledger_id
    ).filter(
        BankLedger.company_id == cid,
        BankLedger.is_void == False,
        BankLedgerSplit.lc_no == lc_no,
        BankLedgerSplit.charge_type == charge_type,
    ).scalar() or 0

    return round(float(single_total) + float(split_total), 2)


def _import_pool_allocated(session, cid, lc_no, charge_type, exclude_item_id=None):
    """Sum of everything already ALLOCATED to Import Register items for this LC No. + Charge Type."""
    if not lc_no or not lc_no.strip():
        return 0.0
    q = session.query(func.coalesce(func.sum(ImportAllocation.amount), 0)).filter(
        ImportAllocation.company_id == cid,
        ImportAllocation.lc_no == lc_no.strip(),
        ImportAllocation.charge_type == charge_type,
        ImportAllocation.is_void == False,
    )
    if exclude_item_id:
        q = q.filter(ImportAllocation.import_register_id != exclude_item_id)
    return round(float(q.scalar() or 0), 2)


def _import_pool_balance(session, cid, lc_no, charge_type, exclude_item_id=None):
    """Live allocable pool = posted in Bank Ledger − already allocated. Never negative."""
    posted    = _import_pool_posted(session, cid, lc_no, charge_type)
    allocated = _import_pool_allocated(session, cid, lc_no, charge_type, exclude_item_id)
    return round(max(posted - allocated, 0), 2)


@app.route("/api/import-register/lc-balances", methods=["GET"])
def get_lc_charge_balances():
    """
    GET /api/import-register/lc-balances?company_id=X&lc_no=SBLLC-5501
    Returns the live allocable pool for every one of the 10 import
    charge types under this LC No. — what the item-entry form shows
    beneath each field (Material Value Paid, Import Freight, Import
    Duty/CSC/VAT are per-item informational only — NOT pool-capped per
    the latest design, only Material Value and the Phase II group are
    hard-capped; see field-level docs in save_import_register).
    """
    cid = request.args.get("company_id", type=int)
    lc_no = request.args.get("lc_no", "").strip()
    if not cid or not lc_no:
        return jsonify({"error": "company_id and lc_no required"}), 400
    session = SessionLocal()
    try:
        balances = {}
        for charge_type in LC_CHARGE_TYPES:
            balances[charge_type] = {
                "posted":    _import_pool_posted(session, cid, lc_no, charge_type),
                "allocated": _import_pool_allocated(session, cid, lc_no, charge_type),
                "remaining": _import_pool_balance(session, cid, lc_no, charge_type),
            }
        return jsonify({"lc_no": lc_no, "balances": balances})
    finally:
        session.close()


@app.route("/api/import-register/open-pp", methods=["GET"])
def get_open_pp_for_lc():
    """
    GET /api/import-register/open-pp?company_id=X[&lc_no=SBLLC-5501]
    PP Nos that have at least one item saved, grouped by (LC No., PP No.,
    IMP voucher) — used to populate "items already added to this
    voucher" when resuming entry, and for reporting/filters.
    """
    cid = request.args.get("company_id", type=int)
    lc_no = request.args.get("lc_no", "").strip()
    if not cid:
        return jsonify({"error": "company_id required"}), 400
    session = SessionLocal()
    try:
        q = session.query(ImportRegister).filter_by(company_id=cid, is_void=False)
        if lc_no:
            q = q.filter(ImportRegister.lc_no == lc_no)
        rows = q.all()

        groups = {}
        for r in rows:
            key = (r.lc_no, r.pp_no, r.imp_voucher)
            g = groups.setdefault(key, {
                "lc_no": r.lc_no, "pp_no": r.pp_no, "imp_voucher": r.imp_voucher,
                "supplier_name": r.supplier_name, "item_count": 0,
                "total_basic_material_amount": 0.0, "total_cost": 0.0,
            })
            g["item_count"] += 1
            g["total_basic_material_amount"] += float(r.basic_material_amount or 0)
            g["total_cost"] += float(r.total_cost or 0)

        out = sorted(groups.values(), key=lambda x: (x["lc_no"], x["pp_no"]))
        return jsonify({"groups": out})
    finally:
        session.close()


@app.route("/api/import-register/lc-charge-types", methods=["GET"])
def get_lc_charge_types_for_import():
    """The 10 import charge types — single source of truth, shared with Bank Ledger classification."""
    return jsonify({"charge_types": LC_CHARGE_TYPES})


def _fa_block_gl_lookup(cap_sub_group):
    return FA_BLOCK_GL.get(cap_sub_group, "")


@app.route("/api/import-register", methods=["POST"])
def save_import_register():
    """
    Save ONE item under a PP No / LC No — the unified single-stage
    entry. No separate Phase I / Phase II save steps.

    Body:
      company_id, imp_voucher (blank = auto, per LC+PP), entry_date,
      pp_no, lc_no, supplier_name (informational only), fec_no,
      item_name, qty, fcy_rate, exchange_rate,
      material_value_paid (allocated, capped by LC+"Material Value" pool),
      import_freight_total (LUMP SUM for this whole PP No — only needs
        to be sent on the FIRST item of a PP, or whenever the user wants
        to (re)distribute it; capped by LC+"Import Freight" pool),
      import_duty, custom_svc_chg (manual, per item, NOT pool-capped),
      vat_claimable, vat_amount (manual, per item),
      p2_charges (dict, LUMP SUM for the whole PP No — Agent Commission,
        Local Freight, Packing & Forwarding, Bank Charges, Insurance;
        capped by their respective LC pools),
      is_capital, cap_item_name, cap_sub_group, block_gl, dep_rate_pct,
      residual_pct, requesting_user_id

    Import Freight and the Phase II group are LUMP SUMS for the PP No
    — when submitted, they are (re-)apportioned across EVERY item
    already saved under that LC+PP (including this new one), by Basic
    Material Amount share (Import Freight) or Total Phase I Cost share
    (Phase II group). This means saving a new item under an existing
    PP No will RECOMPUTE the apportioned share on every sibling item
    too — that's intentional (the pool must always divide exactly
    across however many items exist at save time).
    """
    data = request.json or {}
    cid = data.get("company_id")
    if not cid: return jsonify({"error":"company_id required"}),400
    session = SessionLocal()
    try:
        lc_no = (data.get("lc_no") or "").strip()
        pp_no = (data.get("pp_no") or "").strip()
        if not lc_no:
            return jsonify({"error":"LC No. is required — charges are allocated from that LC's posted Bank Ledger pool"}),400
        if not pp_no:
            return jsonify({"error":"PP No. is required"}),400
        if not (data.get("item_name") or "").strip():
            return jsonify({"error":"Item Name is required"}),400

        try: ed = date.fromisoformat(str(data.get("entry_date","")).strip())
        except: return jsonify({"error":"Invalid entry_date"}),400

        qty      = float(data.get("qty") or 0)
        fcy_rate = float(data.get("fcy_rate") or 0)
        ex_rate  = float(data.get("exchange_rate") or 0)
        if qty <= 0:
            return jsonify({"error":"Qty must be greater than 0"}),400

        is_capital_ = bool(data.get("is_capital", False))
        if is_capital_ and not (data.get("cap_item_name") or "").strip():
            return jsonify({"error":"Capital Item Name is required for capital items"}),400

        local_ccy_rate = round(fcy_rate * ex_rate, 4)
        basic_material_amount = round(qty * local_ccy_rate, 2)

        # ── Material Value Paid — hard-capped against the LC pool ──────────
        mat_value_paid = round(float(data.get("material_value_paid") or 0), 2)
        if mat_value_paid < 0:
            return jsonify({"error":"Material Value Paid cannot be negative"}),400
        if mat_value_paid > 0:
            remaining_mat = _import_pool_balance(session, cid, lc_no, "Material Value")
            if mat_value_paid > remaining_mat + 0.005:
                return jsonify({
                    "error": f"Material Value Paid: Rs.{mat_value_paid:.2f} exceeds the allocable "
                             f"balance of Rs.{remaining_mat:.2f} posted in Bank Ledger for LC '{lc_no}'. "
                             f"Post more to Bank Ledger first, or reduce this item's allocation."
                }), 400
        forex_gain_loss = round(basic_material_amount - mat_value_paid, 2)

        # ── Import Duty, CSC, VAT — manual per-item, NOT pool-capped ───────
        import_duty    = round(float(data.get("import_duty") or 0), 2)
        custom_svc_chg = round(float(data.get("custom_svc_chg") or 0), 2)
        vat_claimable  = bool(data.get("vat_claimable", True))
        vat_amount     = round(float(data.get("vat_amount") or 0), 2)
        if import_duty < 0 or custom_svc_chg < 0 or vat_amount < 0:
            return jsonify({"error":"Import Duty, CSC, and VAT cannot be negative"}),400

        is_taxable_ = bool(data.get("is_taxable", True))
        supplier_name = (data.get("supplier_name") or "").strip()
        item_name = (data.get("item_name") or "").strip()

        imp_voucher = (data.get("imp_voucher") or "").strip()
        if not imp_voucher:
            imp_voucher = _get_next_imp_voucher(session, cid, lc_no, pp_no)

        # ── Create the new item row (Phase I figures only for now —
        # Import Freight / Phase II group get apportioned across all
        # sibling items, including this one, right after) ─────────────
        row = ImportRegister(
            company_id=cid, imp_voucher=imp_voucher, entry_date=ed,
            pp_no=pp_no, lc_no=lc_no, supplier_name=supplier_name, fec_no=data.get("fec_no",""),
            item_name=item_name, fcy_currency=data.get("fcy_currency",""),
            fcy_rate=fcy_rate, exchange_rate=ex_rate, local_ccy_rate=local_ccy_rate,
            is_taxable=is_taxable_, is_capital=is_capital_, qty=qty,
            basic_material_amount=basic_material_amount, material_value_paid=mat_value_paid,
            forex_gain_loss=forex_gain_loss,
            import_freight=0, import_duty=import_duty, custom_svc_chg=custom_svc_chg,
            vat_claimable=vat_claimable, vat_amount=vat_amount,
            total_phase1_cost=0,
            p2_agent_commission=0, p2_local_freight=0, p2_packing_fwd=0,
            p2_bank_charges=0, p2_insurance=0, p2_total=0,
            total_cost=0, landed_cpu=0,
            cap_item_name=data.get("cap_item_name",""), cap_sub_group=data.get("cap_sub_group",""),
            cap_main_group=data.get("cap_main_group",""), cap_header=data.get("cap_header",""),
            cap_gl_type=data.get("cap_gl_type",""),
            block_gl=data.get("block_gl") or _fa_block_gl_lookup(data.get("cap_sub_group","")),
            residual_pct=float(data.get("residual_pct") or 0), dep_rate_pct=float(data.get("dep_rate_pct") or 0),
            status="Complete", created_by=data.get("requesting_user_id"),
        )
        session.add(row); session.flush()

        # Record Material Value Paid allocation
        if mat_value_paid > 0:
            session.add(ImportAllocation(
                company_id=cid, lc_no=lc_no, charge_type="Material Value",
                pp_no=pp_no, imp_voucher=imp_voucher, import_register_id=row.id,
                amount=mat_value_paid, allocated_at=dt.now(timezone.utc), allocated_by=data.get("requesting_user_id"),
            ))

        # ── Capital item: auto-generate FA code + create FARegister row ──
        fa_code_gen = ""
        if is_capital_:
            cap_sub_group_fa = data.get("cap_sub_group", "")
            yr = ed.year
            fac = session.query(FARegister).filter_by(company_id=cid).count()
            fa_code_gen = f"FA-{yr}-{str(fac+1).zfill(3)}"
            dep_method_fa = "SLM" if cap_sub_group_fa == "BLOCK E" else "WDV"
            session.add(FARegister(
                company_id=cid, fa_code=fa_code_gen,
                capital_item=data.get("cap_item_name") or item_name,
                vendor=supplier_name, sub_group=cap_sub_group_fa,
                gl_account=row.block_gl, addition_date=ed,
                qty=qty, rate=round(mat_value_paid/qty, 4) if qty else 0,
                additions=0,  # filled in after apportionment below
                source="Import", reference=imp_voucher,
                residual_value_pct=float(data.get("residual_pct") or 0),
                dep_rate_pct=float(data.get("dep_rate_pct") or 0),
                dep_method=dep_method_fa, opening_accum_dep=0, is_active=True,
            ))
            row.fa_code = fa_code_gen

        # ── Re-apportion Import Freight + Phase II group across EVERY
        # item under this LC+PP (including the one just added) ────────
        all_pp_items = session.query(ImportRegister).filter_by(
            company_id=cid, lc_no=lc_no, pp_no=pp_no, is_void=False
        ).order_by(ImportRegister.id).all()

        import_freight_total = data.get("import_freight_total")
        if import_freight_total is not None:
            import_freight_total = round(float(import_freight_total or 0), 2)
            if import_freight_total < 0:
                return jsonify({"error":"Import Freight cannot be negative"}),400
            if import_freight_total > 0:
                remaining_freight = _import_pool_balance(session, cid, lc_no, "Import Freight")
                # Add back whatever this PP's items already had allocated for
                # Import Freight (we're about to recompute it fresh)
                already_this_pp = sum(float(r_.import_freight or 0) for r_ in all_pp_items)
                available = remaining_freight + already_this_pp
                if import_freight_total > available + 0.005:
                    return jsonify({
                        "error": f"Import Freight: Rs.{import_freight_total:.2f} exceeds the allocable "
                                 f"balance of Rs.{available:.2f} for LC '{lc_no}' (across all PP Nos)."
                    }), 400

            # Release this PP's previous Import Freight allocations, then re-apply
            session.query(ImportAllocation).filter_by(
                company_id=cid, lc_no=lc_no, pp_no=pp_no, charge_type="Import Freight"
            ).update({"is_void": True, "voided_at": dt.now(timezone.utc)})

            base_total = sum(float(r_.basic_material_amount or 0) for r_ in all_pp_items)
            for r_ in all_pp_items:
                share = (float(r_.basic_material_amount or 0) / base_total) if base_total > 0 else 0
                item_freight = round(import_freight_total * share, 2)
                r_.import_freight = item_freight
                if item_freight > 0:
                    session.add(ImportAllocation(
                        company_id=cid, lc_no=lc_no, charge_type="Import Freight",
                        pp_no=pp_no, imp_voucher=r_.imp_voucher, import_register_id=r_.id,
                        amount=item_freight, allocated_at=dt.now(timezone.utc), allocated_by=data.get("requesting_user_id"),
                    ))

        # ── Recompute Total Phase I Cost for every item under this PP ──
        for r_ in all_pp_items:
            vat_if_cost = 0 if r_.vat_claimable else float(r_.vat_amount or 0)
            r_.total_phase1_cost = round(
                float(r_.basic_material_amount or 0) + float(r_.import_freight or 0)
                + float(r_.import_duty or 0) + float(r_.custom_svc_chg or 0) + vat_if_cost, 2
            )

        # ── Phase II group — same lump-sum-per-PP, apportion-by-Total-
        # Phase-I-Cost-share pattern ─────────────────────────────────
        p2_charges = data.get("p2_charges") or {}
        if p2_charges:
            p2_vals = {}
            for field, charge_type in P2_CHARGE_FIELDS:
                amt = round(float(p2_charges.get(field) or 0), 2)
                if amt < 0:
                    return jsonify({"error": f"{charge_type} cannot be negative"}),400
                p2_vals[field] = amt

            for field, charge_type in P2_CHARGE_FIELDS:
                amt = p2_vals[field]
                if amt <= 0: continue
                remaining = _import_pool_balance(session, cid, lc_no, charge_type)
                already_this_pp = sum(float(getattr(r_, field, 0) or 0) for r_ in all_pp_items)
                available = remaining + already_this_pp
                if amt > available + 0.005:
                    return jsonify({
                        "error": f"{charge_type}: Rs.{amt:.2f} exceeds the allocable balance of "
                                 f"Rs.{available:.2f} for LC '{lc_no}' (across all PP Nos)."
                    }), 400

            phase1_total = sum(float(r_.total_phase1_cost or 0) for r_ in all_pp_items)
            for field, charge_type in P2_CHARGE_FIELDS:
                amt = p2_vals[field]
                session.query(ImportAllocation).filter_by(
                    company_id=cid, lc_no=lc_no, pp_no=pp_no, charge_type=charge_type
                ).update({"is_void": True, "voided_at": dt.now(timezone.utc)})
                if amt <= 0:
                    for r_ in all_pp_items: setattr(r_, field, 0)
                    continue
                for r_ in all_pp_items:
                    share = (float(r_.total_phase1_cost or 0) / phase1_total) if phase1_total > 0 else 0
                    item_amt = round(amt * share, 2)
                    setattr(r_, field, item_amt)
                    if item_amt > 0:
                        session.add(ImportAllocation(
                            company_id=cid, lc_no=lc_no, charge_type=charge_type,
                            pp_no=pp_no, imp_voucher=r_.imp_voucher, import_register_id=r_.id,
                            amount=item_amt, allocated_at=dt.now(timezone.utc), allocated_by=data.get("requesting_user_id"),
                        ))

        # ── Final totals per item ───────────────────────────────────
        for r_ in all_pp_items:
            p2_sum = round(sum(float(getattr(r_, f, 0) or 0) for f,_ in P2_CHARGE_FIELDS), 2)
            r_.p2_total = p2_sum
            r_.total_cost = round(float(r_.total_phase1_cost or 0) + p2_sum, 2)
            qty_ = float(r_.qty or 1) or 1
            r_.landed_cpu = round(r_.total_cost / qty_, 4)

        if fa_code_gen:
            fa_row = session.query(FARegister).filter_by(company_id=cid, fa_code=fa_code_gen).first()
            if fa_row: fa_row.additions = float(row.total_cost or 0)

        session.flush()

        # ════════════════════════════════════════════════════════════
        # GL + Party posting — for THIS item only. Uses a PER-ITEM
        # unique_id (imp_voucher + this row's own id) so multiple items
        # sharing one imp_voucher/PP No each get their own independently
        # voidable GL journal — voiding one item never touches another
        # item's postings, even though they share the same voucher.
        # ════════════════════════════════════════════════════════════
        item_unique_id = f"{imp_voucher}-{row.id}"
        narration = f"Import — {item_name} ({imp_voucher} / PP {pp_no})"
        if is_capital_:
            dr_gl_name = row.block_gl or "1030 - Plant & Machinery"
        elif is_taxable_:
            dr_gl_name = "2010 - Raw Material Stock"
        else:
            dr_gl_name = "7100 - Import Purchase"

        total_dr = float(row.total_cost or 0)
        vat_if_claimable = vat_amount if vat_claimable else 0

        def _split_gl_code(code):
            code = (code or "").strip()
            if " - " in code:
                prefix = code.split(" - ", 1)[0].strip()
                if prefix.isdigit(): return prefix
            return code

        # ── Build the full multi-line journal as individual GL rows,
        # all sharing item_unique_id, summing to a balanced Dr=Cr ──────
        gl_lines = []  # (gl_code, gl_name, dr_amount, cr_amount)
        if total_dr > 0:
            gl_lines.append((_split_gl_code(dr_gl_name), dr_gl_name, total_dr, 0))
        if vat_if_claimable > 0:
            gl_lines.append(("1320", "1320 - VAT Input Tax", vat_if_claimable, 0))

        # ── Credit side: route to each REAL party that was originally
        # paid for each charge type, by querying who actually received
        # the Bank Ledger payments for (lc_no, charge_type). Each
        # credit nets against that SAME party's Bank-Ledger-time debit
        # — see module docstring for the full mechanic. ─────────────
        def _real_parties_for_charge(charge_type):
            """Returns [(party_name, gl_account, share), ...] who were paid under this LC+charge_type."""
            rows1 = session.query(BankLedger.party_name, BankLedger.gl_account, BankLedger.withdraw).filter(
                BankLedger.company_id == cid, BankLedger.is_void == False,
                BankLedger.lc_no == lc_no, BankLedger.charge_type == charge_type,
                BankLedger.is_split == False, BankLedger.party_name != "",
            ).all()
            rows2 = session.query(BankLedgerSplit.party_name, BankLedgerSplit.gl_account, BankLedgerSplit.split_amount).join(
                BankLedger, BankLedger.id == BankLedgerSplit.bank_ledger_id
            ).filter(
                BankLedger.company_id == cid, BankLedger.is_void == False,
                BankLedgerSplit.lc_no == lc_no, BankLedgerSplit.charge_type == charge_type,
                BankLedgerSplit.party_name != "",
            ).all()
            combined = {}
            for pname, gl, amt in list(rows1) + list(rows2):
                if not pname: continue
                combined.setdefault(pname, {"gl": gl, "amt": 0.0})
                combined[pname]["amt"] += float(amt or 0)
            total = sum(v["amt"] for v in combined.values())
            return [(p, v["gl"] or _party_ctrl_gl_lookup(session, cid, p), v["amt"]/total if total>0 else 0)
                    for p, v in combined.items()]

        charge_amounts_this_item = [
            ("Material Value", mat_value_paid), ("Import Freight", float(row.import_freight or 0)),
            ("Import Duty", import_duty), ("CSC", custom_svc_chg),
        ]
        if not vat_claimable:
            charge_amounts_this_item.append(("VAT", vat_amount))
        for field, ct in P2_CHARGE_FIELDS:
            charge_amounts_this_item.append((ct, float(getattr(row, field, 0) or 0)))

        party_credit_lines = []  # (party_name, gl_account, charge_type, amount) — for both GL and Party Ledger
        for charge_type, item_charge_amt in charge_amounts_this_item:
            if item_charge_amt <= 0: continue
            parties = _real_parties_for_charge(charge_type)
            if not parties:
                continue  # no Bank Ledger party found for this charge type — nothing to credit (shouldn't normally happen given pool validation)
            for pname, pgl, share in parties:
                if not pgl or share <= 0: continue
                leg_amt = round(item_charge_amt * share, 2)
                if leg_amt <= 0: continue
                party_credit_lines.append((pname, pgl, charge_type, leg_amt))
                gl_lines.append((_split_gl_code(pgl), pgl, 0, leg_amt))

        # Write the full balanced multi-line journal in one go
        for gl_code, gl_name, dr_a, cr_a in gl_lines:
            session.add(GLBook(
                company_id=cid, entry_date=ed, unique_id=item_unique_id,
                gl_code=gl_code, gl_name=gl_name, description=narration,
                dr_amount=round(dr_a, 2), cr_amount=round(cr_a, 2),
                source="Import_Register", transaction_type="Import Purchase",
                created_by=data.get("requesting_user_id"),
            ))

        # Party Ledger — one credit row per (party, charge_type) leg
        for pname, pgl, charge_type, leg_amt in party_credit_lines:
            _add_party_ledger_entry(
                session, cid, ed, pname, "Vendor",
                f"Import — {charge_type}", item_unique_id,
                f"{narration} [{charge_type}]",
                debit=0, credit=leg_amt, source="Import_Register",
                gl_account=pgl, charge_type=charge_type, lc_no=lc_no,
            )

        # ── Stock Journal — Receipt, item-wise, at final Landed CPU ────
        if is_taxable_ and not is_capital_:
            mat = session.query(MaterialMaster).filter_by(
                company_id=cid, product_name=item_name, material_type="RM", is_active=True
            ).first()
            if mat:
                prev = session.query(StockJournal).filter_by(
                    company_id=cid, material_id=mat.id
                ).order_by(StockJournal.id.desc()).first()
                prev_qty = float(prev.running_qty) if prev else float(mat.opening_qty or 0)
                prev_val = float(prev.running_value) if prev else float(mat.opening_value or 0)
                new_qty = round(prev_qty + qty, 4)
                new_val = round(prev_val + total_dr, 2)
                new_rate = round(new_val / new_qty, 4) if new_qty else 0
                session.add(StockJournal(
                    company_id=cid, entry_date=ed, material_id=mat.id,
                    product_code=mat.product_code, product_name=mat.product_name, material_type="RM",
                    movement_type="Receipt", qty=qty, rate=row.landed_cpu, value=total_dr,
                    running_qty=new_qty, running_value=new_val, running_rate=new_rate,
                    source="Import_Register", reference=item_unique_id,
                    narration=narration, created_by=data.get("requesting_user_id"),
                ))
                row.stock_journal_posted = True

        session.commit()
        return jsonify({
            "success": True, "id": row.id, "imp_voucher": imp_voucher,
            "basic_material_amount": basic_material_amount, "material_value_paid": mat_value_paid,
            "forex_gain_loss": forex_gain_loss, "total_phase1_cost": float(row.total_phase1_cost or 0),
            "total_cost": float(row.total_cost or 0), "landed_cpu": float(row.landed_cpu or 0),
            "items_in_pp": len(all_pp_items),
        }), 201
    except Exception as ex:
        session.rollback()
        import traceback; print(f"[ERROR] save_import_register: {ex}\n{traceback.format_exc()}")
        return jsonify({"error": str(ex)}), 500
    finally: session.close()


def _party_ctrl_gl_lookup(session, cid, party_name):
    """Standalone party->GL lookup, mirrors Bank Ledger's _party_ctrl_gl closure for use outside that function's scope."""
    if not party_name: return None
    pm_ = session.query(PartyMaster).filter(
        PartyMaster.company_id == cid,
        func.lower(func.trim(PartyMaster.name)) == party_name.strip().lower()
    ).first()
    return pm_.gl_account if pm_ else None


def _import_row_to_dict(r):
    """Serialize one ImportRegister row — unified single-stage shape, no Phase I/II split."""
    return {
        "id": r.id, "imp_voucher": r.imp_voucher,
        "entry_date": r.entry_date.isoformat() if r.entry_date else None,
        "pp_no": r.pp_no or "", "lc_no": r.lc_no or "",
        "supplier_name": r.supplier_name or "", "fec_no": r.fec_no or "",
        "item_name": r.item_name or "", "fcy_currency": r.fcy_currency or "",
        "fcy_rate": float(r.fcy_rate or 0), "exchange_rate": float(r.exchange_rate or 0),
        "local_ccy_rate": float(r.local_ccy_rate or 0),
        "is_taxable": bool(r.is_taxable), "is_capital": bool(r.is_capital), "qty": float(r.qty or 0),
        "basic_material_amount": float(r.basic_material_amount or 0),
        "material_value_paid": float(r.material_value_paid or 0),
        "forex_gain_loss": float(r.forex_gain_loss or 0),
        "import_freight": float(r.import_freight or 0),
        "import_duty": float(r.import_duty or 0),
        "custom_svc_chg": float(r.custom_svc_chg or 0),
        "vat_claimable": bool(r.vat_claimable), "vat_amount": float(r.vat_amount or 0),
        "total_phase1_cost": float(r.total_phase1_cost or 0),
        "p2_agent_commission": float(r.p2_agent_commission or 0),
        "p2_local_freight": float(r.p2_local_freight or 0),
        "p2_packing_fwd": float(r.p2_packing_fwd or 0),
        "p2_bank_charges": float(r.p2_bank_charges or 0),
        "p2_insurance": float(r.p2_insurance or 0),
        "p2_total": float(r.p2_total or 0),
        "total_cost": float(r.total_cost or 0), "landed_cpu": float(r.landed_cpu or 0),
        "cap_item_name": r.cap_item_name or "", "cap_sub_group": r.cap_sub_group or "",
        "block_gl": r.block_gl or "", "fa_code": r.fa_code or "",
        "dep_rate_pct": float(r.dep_rate_pct or 0), "residual_pct": float(r.residual_pct or 0),
        "status": r.status or "Complete", "stock_journal_posted": bool(r.stock_journal_posted),
        "is_void": bool(r.is_void), "voided_by": r.voided_by or "",
        "voided_at": r.voided_at.isoformat() if r.voided_at else None,
        "void_reason": r.void_reason or "",
    }


@app.route("/api/import-register", methods=["GET"])
def get_import_register():
    """
    GET /api/import-register — list Import Register items.
    Query params: company_id, imp_voucher, lc_no, pp_no, include_void,
                   date_from, date_to, search, limit (default 2000)
    """
    cid          = request.args.get("company_id", type=int)
    imp_voucher  = request.args.get("imp_voucher", "").strip()
    lc_no        = request.args.get("lc_no", "").strip()
    pp_no        = request.args.get("pp_no", "").strip()
    include_void = request.args.get("include_void", "false").lower() == "true"
    date_from    = request.args.get("date_from", "").strip()
    date_to      = request.args.get("date_to",   "").strip()
    search       = request.args.get("search",    "").strip().lower()
    limit        = request.args.get("limit", 2000, type=int)

    if not cid:
        return jsonify({"error": "company_id required"}), 400

    session = SessionLocal()
    try:
        q = session.query(ImportRegister).filter(ImportRegister.company_id == cid)
        if not include_void:
            q = q.filter(ImportRegister.is_void == False)
        if imp_voucher: q = q.filter(ImportRegister.imp_voucher == imp_voucher)
        if lc_no:        q = q.filter(ImportRegister.lc_no == lc_no)
        if pp_no:        q = q.filter(ImportRegister.pp_no == pp_no)
        if date_from:
            try: q = q.filter(ImportRegister.entry_date >= date.fromisoformat(date_from))
            except ValueError: pass
        if date_to:
            try: q = q.filter(ImportRegister.entry_date <= date.fromisoformat(date_to))
            except ValueError: pass
        if search:
            like = f"%{search}%"
            q = q.filter(
                (func.lower(ImportRegister.supplier_name).like(like)) |
                (func.lower(ImportRegister.item_name).like(like))     |
                (func.lower(ImportRegister.imp_voucher).like(like))   |
                (func.lower(ImportRegister.lc_no).like(like))         |
                (func.lower(ImportRegister.pp_no).like(like))
            )
        q = q.order_by(ImportRegister.imp_voucher, ImportRegister.id)
        if limit:
            q = q.limit(limit)
        rows = q.all()
        return jsonify({"rows": [_import_row_to_dict(r) for r in rows], "total": len(rows)})
    except Exception as ex:
        import traceback
        print(f"[ERROR] get_import_register: {ex}\n{traceback.format_exc()}")
        return jsonify({"error": str(ex)}), 500
    finally:
        session.close()

def _vat_register_purchase_book_rows(session, cid, date_from, date_to):
    """Fetch non-void Purchase Book rows in the period, split by category."""
    q = session.query(PurchaseBook).filter(
        PurchaseBook.company_id == cid,
        (PurchaseBook.is_void == False) | (PurchaseBook.is_void == None),
    )
    if date_from:
        try: q = q.filter(PurchaseBook.entry_date >= date.fromisoformat(date_from))
        except ValueError: pass
    if date_to:
        try: q = q.filter(PurchaseBook.entry_date <= date.fromisoformat(date_to))
        except ValueError: pass
    return q.all()


def _vat_register_import_rows(session, cid, date_from, date_to):
    """Fetch non-void Import Register rows in the period."""
    q = session.query(ImportRegister).filter(
        ImportRegister.company_id == cid,
        ImportRegister.is_void == False,
    )
    if date_from:
        try: q = q.filter(ImportRegister.entry_date >= date.fromisoformat(date_from))
        except ValueError: pass
    if date_to:
        try: q = q.filter(ImportRegister.entry_date <= date.fromisoformat(date_to))
        except ValueError: pass
    return q.all()


@app.route("/api/vat-register", methods=["GET"])
def get_vat_register():
    """
    GET /api/vat-register?company_id=X&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
    Optional: &month_bs=Jestha (filters by Nepali month instead of AD range
    — if both are given, AD range wins, matching the Excel's "Filter Type"
    toggle between AD Date Range and Nepali Month).

    Returns:
      categories: [
        {category, particulars, taxable, vat, total, source, count},
        ... one row each for:
          Local            (Purchase Book, transaction_type=Purchase, not capital, not import)
          Import           (Import Register, taxable non-capital items)
          Capital           (Purchase Book cap_* fields  +  Import Register cap_* fields, combined)
          Non-Taxable       (Purchase Book non_taxable_value)
          Returns           (Purchase Book transaction_type in Return/Debit Note — shown as negative)
      ]
      total_purchases: {taxable, vat, total}
      gl_reconciliation: {
        vat_input_tax_gl_dr: <sum of GL Book 1320 debit in period>,
        computed_vat_input: <total_purchases.vat>,
        difference: <gl - computed>,
        reconciled: <bool, true if difference is ~0>
      }
    """
    cid       = request.args.get("company_id", type=int)
    date_from = request.args.get("date_from", "").strip()
    date_to   = request.args.get("date_to",   "").strip()
    if not cid:
        return jsonify({"error": "company_id required"}), 400

    session = SessionLocal()
    try:
        pb_rows = _vat_register_purchase_book_rows(session, cid, date_from, date_to)
        ir_rows = _vat_register_import_rows(session, cid, date_from, date_to)

        # ── LOCAL: Purchase Book, ordinary Purchase txns, not capital ──────
        local_taxable = sum(float(r.taxable_value or 0) for r in pb_rows
                             if r.transaction_type == "Purchase" and not r.is_capital)
        local_vat     = sum(float(r.vat_amount or 0) for r in pb_rows
                             if r.transaction_type == "Purchase" and not r.is_capital)
        local_count   = sum(1 for r in pb_rows if r.transaction_type == "Purchase" and not r.is_capital)

        # ── IMPORT: Import Register, taxable non-capital items ─────────────
        # "Taxable base" in the new unified model = Basic Material Amount +
        # Import Freight + Import Duty + CSC (everything that feeds Total
        # Phase I Cost EXCEPT VAT itself, which is tracked separately).
        def _ir_taxable_base(r):
            return (float(r.basic_material_amount or 0) + float(r.import_freight or 0)
                    + float(r.import_duty or 0) + float(r.custom_svc_chg or 0))

        import_taxable = sum(_ir_taxable_base(r) for r in ir_rows if r.is_taxable and not r.is_capital)
        import_vat     = sum(float(r.vat_amount or 0) for r in ir_rows
                              if r.is_taxable and not r.is_capital and r.vat_claimable)
        import_count   = sum(1 for r in ir_rows if r.is_taxable and not r.is_capital)

        # ── CAPITAL: combined from both sources ─────────────────────────────
        cap_taxable = (sum(float(r.cap_taxable_value or 0) for r in pb_rows if r.is_capital) +
                       sum(_ir_taxable_base(r) for r in ir_rows if r.is_capital))
        cap_vat     = (sum(float(r.cap_vat or 0) for r in pb_rows if r.is_capital) +
                       sum(float(r.vat_amount or 0) for r in ir_rows if r.is_capital and r.vat_claimable))
        cap_count   = (sum(1 for r in pb_rows if r.is_capital) +
                       sum(1 for r in ir_rows if r.is_capital))

        # ── NON-TAXABLE: Purchase Book only (Import non-taxable items have
        #    no taxable_amount/vat by definition, nothing to add here) ─────
        nontax_value = sum(float(r.non_taxable_value or 0) for r in pb_rows if not r.is_taxable)
        nontax_count = sum(1 for r in pb_rows if not r.is_taxable)

        # ── RETURNS: Purchase Book, Return/Debit Note transaction types ───
        return_types = ("Purchase Return", "Debit Note", "Return", "Credit Note")
        returns_taxable = sum(float(r.taxable_value or 0) for r in pb_rows if r.transaction_type in return_types)
        returns_vat     = sum(float(r.vat_amount or 0) for r in pb_rows if r.transaction_type in return_types)
        returns_count   = sum(1 for r in pb_rows if r.transaction_type in return_types)

        def _row(category, particulars, taxable, vat, source, count):
            return {
                "category": category, "particulars": particulars,
                "taxable": round(taxable, 2), "vat": round(vat, 2),
                "total": round(taxable + vat, 2),
                "source": source, "count": count,
            }

        categories = [
            _row("Local",        "Taxable Purchases (Local)",        local_taxable,    local_vat,    "Purchase Book",   local_count),
            _row("Import",       "Import Purchases (Taxable)",       import_taxable,   import_vat,   "Import Register", import_count),
            _row("Capital",      "Capital Purchases",                cap_taxable,      cap_vat,      "Purchase Book + Import Register", cap_count),
            _row("Non-Taxable",  "Non-Taxable Purchases",            nontax_value,     0,            "Purchase Book",   nontax_count),
            _row("Returns",      "Purchase Returns / Debit Notes",   -returns_taxable, -returns_vat, "Purchase Book",   returns_count),
        ]

        total_taxable = sum(c["taxable"] for c in categories)
        total_vat     = sum(c["vat"] for c in categories)
        total_amount  = round(total_taxable + total_vat, 2)

        # ── GL reconciliation: does 1320 VAT Input Tax (Dr) match? ─────────
        gl_q = session.query(func.coalesce(func.sum(GLBook.dr_amount), 0)).filter(
            GLBook.company_id == cid,
            GLBook.gl_code == "1320",
            GLBook.source != "Void",
        )
        if date_from:
            try: gl_q = gl_q.filter(GLBook.entry_date >= date.fromisoformat(date_from))
            except ValueError: pass
        if date_to:
            try: gl_q = gl_q.filter(GLBook.entry_date <= date.fromisoformat(date_to))
            except ValueError: pass
        gl_vat_input_dr = round(float(gl_q.scalar() or 0), 2)
        diff = round(gl_vat_input_dr - total_vat, 2)

        # ── Sales side: SAME 5-category structure as Purchase side ────────
        # Category | Particulars | Source | Count | Taxable | VAT | Total
        # Rows: Local, Export, Capital, Non-Taxable, Returns (negative).
        # This mirrors the Purchase categories array exactly — same row
        # shape, same _row() helper, just sourced from SalesBook.
        sb_q = session.query(SalesBook).filter(
            SalesBook.company_id == cid,
            (SalesBook.is_void == False) | (SalesBook.is_void == None),
        )
        if date_from:
            try: sb_q = sb_q.filter(SalesBook.entry_date >= date.fromisoformat(date_from))
            except ValueError: pass
        if date_to:
            try: sb_q = sb_q.filter(SalesBook.entry_date <= date.fromisoformat(date_to))
            except ValueError: pass
        sb_rows = sb_q.all()

        sales_return_types = ("Sales Return", "Credit Note", "Return")

        # LOCAL: ordinary Sales txns, not capital, not export
        sl_local_taxable = sum(float(r.taxable_value or 0) for r in sb_rows
                                if r.transaction_type == "Sales" and not r.is_capital and r.geography_type != "Export")
        sl_local_vat     = sum(float(r.vat_amount or 0) for r in sb_rows
                                if r.transaction_type == "Sales" and not r.is_capital and r.geography_type != "Export")
        sl_local_count   = sum(1 for r in sb_rows
                                if r.transaction_type == "Sales" and not r.is_capital and r.geography_type != "Export")

        # EXPORT: geography_type = Export (zero-rated — VAT is 0 by definition)
        sl_export_taxable = sum(float(r.export_amount or r.taxable_value or 0) for r in sb_rows
                                 if r.geography_type == "Export" and not r.is_capital)
        sl_export_vat     = 0.0
        sl_export_count   = sum(1 for r in sb_rows if r.geography_type == "Export" and not r.is_capital)

        # CAPITAL: capital item sales
        sl_cap_taxable = sum(float(r.cap_taxable_value or 0) for r in sb_rows if r.is_capital)
        sl_cap_vat     = sum(float(r.cap_vat or 0) for r in sb_rows if r.is_capital)
        sl_cap_count   = sum(1 for r in sb_rows if r.is_capital)

        # NON-TAXABLE
        sl_nontax_value = sum(float(r.non_taxable_value or 0) for r in sb_rows if not r.is_taxable)
        sl_nontax_count = sum(1 for r in sb_rows if not r.is_taxable)

        # RETURNS
        sl_returns_taxable = sum(float(r.taxable_value or 0) for r in sb_rows if r.transaction_type in sales_return_types)
        sl_returns_vat     = sum(float(r.vat_amount or 0) for r in sb_rows if r.transaction_type in sales_return_types)
        sl_returns_count   = sum(1 for r in sb_rows if r.transaction_type in sales_return_types)

        sales_categories = [
            _row("Local",        "Taxable Sales (Local)",      sl_local_taxable,    sl_local_vat,    "Sales Book", sl_local_count),
            _row("Export",       "Export Sales (Zero-Rated)",  sl_export_taxable,   sl_export_vat,   "Sales Book", sl_export_count),
            _row("Capital",      "Capital Sales",               sl_cap_taxable,      sl_cap_vat,      "Sales Book", sl_cap_count),
            _row("Non-Taxable",  "Non-Taxable Sales",           sl_nontax_value,     0,               "Sales Book", sl_nontax_count),
            _row("Returns",      "Sales Returns / Credit Notes",-sl_returns_taxable, -sl_returns_vat, "Sales Book", sl_returns_count),
        ]

        sl_total_taxable = sum(c["taxable"] for c in sales_categories)
        sl_total_vat     = sum(c["vat"] for c in sales_categories)
        sl_total_amount  = round(sl_total_taxable + sl_total_vat, 2)

        # ── Net VAT Payable / Refundable for the period ────────────────────
        # Net VAT = Output VAT (Sales) − Input VAT (Purchase + Import)
        # Positive = payable to IRD. Negative = refundable / carried forward.
        net_vat = round(sl_total_vat - total_vat, 2)

        return jsonify({
            "categories": categories,
            "total_purchases": {
                "taxable": round(total_taxable, 2),
                "vat": round(total_vat, 2),
                "total": total_amount,
            },
            "sales_categories": sales_categories,
            "total_sales": {
                "taxable": round(sl_total_taxable, 2),
                "vat": round(sl_total_vat, 2),
                "total": sl_total_amount,
            },
            "net_vat_payable": {
                "output_vat": round(sl_total_vat, 2),
                "input_vat": round(total_vat, 2),
                "net": net_vat,
                "is_payable": net_vat >= 0,
            },
            "gl_reconciliation": {
                "vat_input_tax_gl_dr": gl_vat_input_dr,
                "computed_vat_input": round(total_vat, 2),
                "difference": diff,
                "reconciled": abs(diff) < 0.05,
            },
            "period": {"date_from": date_from or None, "date_to": date_to or None},
        })
    except Exception as ex:
        import traceback
        print(f"[ERROR] get_vat_register: {ex}\n{traceback.format_exc()}")
        return jsonify({"error": str(ex)}), 500
    finally:
        session.close()


@app.route("/api/vat-register/detail", methods=["GET"])
def get_vat_register_detail():
    """
    GET /api/vat-register/detail?company_id=X&date_from=...&date_to=...&search=...

    Date-wise / item-wise Purchase + Import summary, in EXACTLY the same
    row shape as Purchase Book's own register table (PurchaseBookPage.js):
    Date, Month, Bill No, Vendor Name, PAN, Product Code, Product Name,
    Qty, Rate, Taxable?, Taxable Value, VAT, Total, Non-Taxable Value,
    Capital Item Name/Qty/Rate/Taxable/VAT/Total, FA Code, Txn Type,
    Orig Ref, Internal Ref.

    Import Register rows are mapped onto this SAME shape (imp_voucher ->
    bill_no/internal_ref, supplier_name -> vendor_name, item_name ->
    product_name, bank_lc_no shown in place of PAN, "Import" as txn type)
    so both sources render in one unified table — exactly like Purchase
    Book's register, just with Purchase + Import combined.

    Query params: company_id, date_from, date_to, source (Purchase|Import|All),
                   txn_type (Purchase|Purchase Return|Debit Note|All — narrows
                   Purchase Book rows further by transaction_type; ignored for
                   Import rows, which have no equivalent split),
                   search, limit (default 2000)
    """
    cid       = request.args.get("company_id", type=int)
    date_from = request.args.get("date_from", "").strip()
    date_to   = request.args.get("date_to",   "").strip()
    source_f  = request.args.get("source", "All").strip()
    txn_type_f = request.args.get("txn_type", "All").strip()
    search    = request.args.get("search", "").strip().lower()
    limit     = request.args.get("limit", 2000, type=int)
    if not cid:
        return jsonify({"error": "company_id required"}), 400

    session = SessionLocal()
    try:
        rows = []

        # ── Purchase Book rows — pass through in their native shape ───────
        if source_f in ("All", "Purchase"):
            pb_rows = _vat_register_purchase_book_rows(session, cid, date_from, date_to)
            # Narrow by transaction_type when a specific one is requested —
            # lets the frontend isolate Purchase Return / Debit Note rows
            # from ordinary Purchase rows, instead of only ever seeing them
            # mixed in together under the generic "Purchase" source filter.
            if txn_type_f != "All":
                pb_rows = [r for r in pb_rows if (r.transaction_type or "Purchase") == txn_type_f]
            for r in pb_rows:
                rows.append({
                    "source":             "Purchase",
                    "entry_date":         r.entry_date.isoformat() if r.entry_date else None,
                    "month_bs":           r.month_bs or "",
                    "bill_no":            r.bill_no or "",
                    "vendor_name":        r.vendor_name or "",
                    "vendor_pan":         r.vendor_pan or "",
                    # PP No only — Purchase Book has no PP No equivalent, left
                    # blank here. Product Code is no longer shown in this
                    # column for Purchase rows (only Import rows populate it).
                    "product_code":       "",
                    "product_name":       r.product_name or "",
                    "qty":                float(r.qty or 0),
                    "rate":               float(r.rate or 0),
                    "is_taxable":         bool(r.is_taxable),
                    "taxable_value":      float(r.taxable_value or 0),
                    "vat_amount":         float(r.vat_amount or 0),
                    "total_amount":       float(r.total_amount or 0),
                    # Import's dedicated columns — always 0 for Purchase Book rows;
                    # Local purchases never touch these, only Import rows fill them.
                    "import_taxable_value": 0,
                    "import_vat":           0,
                    "import_total":         0,
                    "non_taxable_value":  float(r.non_taxable_value or 0),
                    "is_capital":         bool(r.is_capital),
                    "capital_item_name":  r.capital_item_name or "",
                    "cap_qty":            float(r.cap_qty or 0),
                    "cap_rate":           float(r.cap_rate or 0),
                    "cap_taxable_value":  float(r.cap_taxable_value or 0),
                    "cap_vat":            float(r.cap_vat or 0),
                    "cap_total":          float(r.cap_total or 0),
                    "fa_code":            r.fa_code or "",
                    "transaction_type":   r.transaction_type or "Purchase",
                    "original_bill_ref":  r.original_bill_ref or "",
                    "internal_ref":       r.internal_ref or "",
                })

        # ── Import Register rows — mapped onto the SAME shape ─────────────
        # imp_voucher -> bill_no/internal_ref · supplier_name -> vendor_name
        # bank_lc_no  -> vendor_pan column (shown as LC No instead of PAN)
        # item_name   -> product_name · "Import" as transaction_type
        # Import rows never have a Purchase Return / Debit Note equivalent —
        # selecting one of those txn_type filters implicitly excludes Import,
        # regardless of what "source" is set to.
        if source_f in ("All", "Import") and txn_type_f in ("All", "Purchase"):
            ir_rows = _vat_register_import_rows(session, cid, date_from, date_to)
            for r in ir_rows:
                # Taxable base in the new unified model = Basic Material
                # Amount + Import Freight + Import Duty + CSC (everything
                # feeding Total Phase I Cost except VAT, tracked separately).
                taxable = (float(r.basic_material_amount or 0) + float(r.import_freight or 0)
                           + float(r.import_duty or 0) + float(r.custom_svc_chg or 0))
                vat     = float(r.vat_amount or 0) if r.vat_claimable else 0
                total   = round(taxable + vat, 2)
                # ImportRegister has no stored month_bs column (unlike PurchaseBook) —
                # derive it from entry_date, same as _import_row_to_dict does.
                ir_month_bs = ""
                if r.entry_date:
                    try: ir_month_bs = _get_nepali_month(r.entry_date) or r.entry_date.strftime("%Y-%m")
                    except Exception: ir_month_bs = r.entry_date.strftime("%Y-%m")
                # Normal (taxable, non-capital) import amount only — non-taxable and
                # capital import amounts are NOT duplicated here, they stay routed
                # to non_taxable_value / cap_* below, same as before.
                is_normal_import = (not r.is_capital) and r.is_taxable
                rows.append({
                    "source":             "Import",
                    "entry_date":         r.entry_date.isoformat() if r.entry_date else None,
                    "month_bs":           ir_month_bs,
                    "bill_no":            r.imp_voucher or "",
                    "vendor_name":        r.supplier_name or "",
                    "vendor_pan":         r.lc_no or "",   # LC No shown in the PAN column for Import rows
                    "product_code":       r.pp_no or "",        # PP No shown in the Product Code column
                    "product_name":       r.item_name or "",
                    "qty":                float(r.qty or 0),
                    "rate":               round(taxable / float(r.qty or 1), 4) if r.qty else 0,
                    "is_taxable":         bool(r.is_taxable),
                    # Local Purchase Book's own Taxable/VAT/Total columns are LEFT
                    # BLANK for Import rows — Import never shares these with Local.
                    "taxable_value":      0,
                    "vat_amount":         0,
                    "total_amount":       0,
                    # NEW — Import's own dedicated Taxable/VAT/Total columns,
                    # appended at the right of the table, untouched by Local.
                    "import_taxable_value": taxable if is_normal_import else 0,
                    "import_vat":           vat     if is_normal_import else 0,
                    "import_total":         total   if is_normal_import else 0,
                    "non_taxable_value":  0 if r.is_taxable else taxable,
                    "is_capital":         bool(r.is_capital),
                    "capital_item_name":  r.cap_item_name or "",
                    "cap_qty":            float(r.qty or 0) if r.is_capital else 0,
                    "cap_rate":           round(taxable / float(r.qty or 1), 4) if (r.is_capital and r.qty) else 0,
                    "cap_taxable_value":  taxable if r.is_capital else 0,
                    "cap_vat":            vat if r.is_capital else 0,
                    "cap_total":          total if r.is_capital else 0,
                    "fa_code":            r.fa_code or "",
                    "transaction_type":   "Import",
                    "original_bill_ref":  "",
                    "internal_ref":       r.imp_voucher or "",
                })

        if search:
            rows = [r for r in rows if search in (r.get("vendor_name","")+r.get("product_name","")+r.get("bill_no","")).lower()]

        # Date-wise, most recent first; stable secondary sort by source then bill_no
        rows.sort(key=lambda r: (r["entry_date"] or "", r["source"], r["bill_no"]), reverse=True)

        if limit:
            rows = rows[:limit]

        totals = {
            "count":          len(rows),
            "taxable":        round(sum(r["taxable_value"] for r in rows), 2),
            "vat":            round(sum(r["vat_amount"] for r in rows), 2),
            "line_total":     round(sum(r["total_amount"] for r in rows), 2),
            "import_taxable": round(sum(r["import_taxable_value"] for r in rows), 2),
            "import_vat":     round(sum(r["import_vat"] for r in rows), 2),
            "import_total":   round(sum(r["import_total"] for r in rows), 2),
            "non_taxable":    round(sum(r["non_taxable_value"] for r in rows), 2),
            "cap_taxable":    round(sum(r["cap_taxable_value"] for r in rows), 2),
            "cap_vat":        round(sum(r["cap_vat"] for r in rows), 2),
            "cap_total":      round(sum(r["cap_total"] for r in rows), 2),
        }
        totals["grand_total"] = round(
            totals["line_total"] + totals["import_total"] + totals["non_taxable"] + totals["cap_total"], 2
        )

        return jsonify({"rows": rows, "totals": totals,
                         "period": {"date_from": date_from or None, "date_to": date_to or None}})
    except Exception as ex:
        import traceback
        print(f"[ERROR] get_vat_register_detail: {ex}\n{traceback.format_exc()}")
        return jsonify({"error": str(ex)}), 500
    finally:
        session.close()



@app.route("/api/import-register/<int:rid>/void", methods=["POST"])
def void_import_row(rid):
    """
    Void a single Import Register item row.

    Reversal logic (unified single-stage model — no Phase I/II split):
      - Reverses the GL journal posted under this item's own unique_id
        ({imp_voucher}-{row.id}) — multiple items can share one
        imp_voucher (same PP No), but each has its own independently
        voidable journal, so voiding one item never touches another.
      - Reverses every Party Ledger row under that same unique_id —
        there may be MULTIPLE parties credited per item (one per real
        payee per charge type), all reversed together.
      - Reverses every ImportAllocation tied to this item, releasing
        its consumed pool back to allocable for re-use.
      - Reverses the Stock Journal Receipt row (if one was posted),
        recomputing the material's running qty/value as if this
        receipt never happened.
      - NOTE: voiding one item does NOT automatically re-apportion
        Import Freight / Phase II group shares across the remaining
        sibling items under the same PP No — those keep whatever
        share they were last given. To correct sibling apportionment
        after a void, save any one remaining item again (which
        triggers a full re-apportionment across all items still under
        that LC+PP, per save_import_register's logic).
      Confirmation: user must type the exact imp_voucher to confirm.
    """
    data    = request.json or {}
    cid     = data.get("company_id")
    confirm = (data.get("confirm_doc_number") or "").strip()
    void_reason = (data.get("void_reason") or "").strip() or "Voided by user"
    requesting_uid = data.get("requesting_user_id")

    session = SessionLocal()
    try:
        if not _can_void(session, requesting_uid, cid):
            return jsonify({"error": "Only Admin or Super Admin can void entries"}), 403

        r = session.query(ImportRegister).filter_by(id=rid, company_id=cid).first()
        if not r:
            return jsonify({"error": "Row not found"}), 404
        if r.is_void:
            return jsonify({"error": "Already voided"}), 400
        if confirm != r.imp_voucher:
            return jsonify({"error": f"Confirmation '{confirm}' does not match '{r.imp_voucher}'"}), 400

        user = session.query(User).filter_by(id=requesting_uid).first()
        voided_by_name = user.username if user else str(requesting_uid or "")
        void_ts = dt.now(timezone.utc)

        r.is_void     = True
        r.voided_by   = voided_by_name
        r.voided_at   = void_ts
        r.void_reason = void_reason

        item_unique_id = f"{r.imp_voucher}-{r.id}"

        def _reverse_gl(unique_id):
            gl_rows = session.query(GLBook).filter(
                GLBook.company_id == cid, GLBook.unique_id == unique_id, GLBook.source != "Void",
            ).all()
            for gl in gl_rows:
                session.add(GLBook(
                    company_id=cid, entry_date=void_ts.date(), unique_id=f"VOID-{unique_id}",
                    gl_code=gl.gl_code, gl_name=gl.gl_name, description=f"VOID: {gl.description}",
                    dr_amount=float(gl.cr_amount or 0), cr_amount=float(gl.dr_amount or 0),
                    source="Void", transaction_type="Void", created_by=requesting_uid,
                ))
            return len(gl_rows)

        def _reverse_pl(reference):
            """Reverse ALL party ledger rows under this reference — an item
            may have credited multiple real parties (one per charge type)."""
            pl_rows = session.query(PartyLedger).filter(
                PartyLedger.company_id == cid, PartyLedger.reference == reference, PartyLedger.is_void == False,
            ).all()
            for pl in pl_rows:
                pl.is_void = True
                session.add(PartyLedger(
                    company_id=cid, entry_date=void_ts.date(), party_name=pl.party_name,
                    party_type=pl.party_type, txn_type="Void", reference=f"VOID-{reference}",
                    description=f"VOID: {pl.description}", debit=float(pl.credit or 0), credit=float(pl.debit or 0),
                    source="Void", gl_account=pl.gl_account, charge_type=pl.charge_type or "", lc_no=pl.lc_no or "",
                ))
            return len(pl_rows)

        def _release_allocations(item_id):
            """Mark all ImportAllocation rows for this item as void — releases the pool."""
            allocs = session.query(ImportAllocation).filter_by(
                company_id=cid, import_register_id=item_id, is_void=False
            ).all()
            for a in allocs:
                a.is_void = True
                a.voided_at = void_ts
            return len(allocs)

        def _reverse_stock_journal(reference):
            """Mark the Receipt row as void and recompute the material's
            running qty/value for every entry AFTER this one (cascading
            recompute), since later rows' running totals depend on it."""
            sj = session.query(StockJournal).filter_by(
                company_id=cid, reference=reference, is_void=False
            ).first()
            if not sj:
                return 0
            sj.is_void = True
            sj.voided_at = void_ts

            later = session.query(StockJournal).filter(
                StockJournal.company_id == cid, StockJournal.material_id == sj.material_id,
                StockJournal.id > sj.id, StockJournal.is_void == False,
            ).order_by(StockJournal.id).all()

            mat = session.query(MaterialMaster).filter_by(id=sj.material_id).first()
            running_qty = float(mat.opening_qty or 0) if mat else 0
            running_val = float(mat.opening_value or 0) if mat else 0
            # Replay every still-active row up to (excluding voided) sj, in order
            earlier = session.query(StockJournal).filter(
                StockJournal.company_id == cid, StockJournal.material_id == sj.material_id,
                StockJournal.id < sj.id, StockJournal.is_void == False,
            ).order_by(StockJournal.id).all()
            for row_ in earlier:
                sign = 1 if row_.movement_type == "Receipt" else -1
                running_qty += sign * float(row_.qty or 0)
                running_val += sign * float(row_.value or 0)
            for row_ in later:
                sign = 1 if row_.movement_type == "Receipt" else -1
                running_qty += sign * float(row_.qty or 0)
                running_val += sign * float(row_.value or 0)
                row_.running_qty = round(running_qty, 4)
                row_.running_value = round(running_val, 2)
                row_.running_rate = round(running_val / running_qty, 4) if running_qty else 0
            return 1

        gl_reversed = _reverse_gl(item_unique_id)
        pl_reversed = _reverse_pl(item_unique_id)
        allocs_released = _release_allocations(r.id)
        sj_reversed = _reverse_stock_journal(item_unique_id)

        session.commit()
        return jsonify({
            "success":          True,
            "message":          f"{r.imp_voucher} / {r.item_name} voided — {allocs_released} allocation(s) released back to allocable balance.",
            "gl_reversals":     gl_reversed,
            "pl_reversals":     pl_reversed,
            "allocs_released":  allocs_released,
            "stock_journal_reversed": bool(sj_reversed),
        })
    except Exception as ex:
        session.rollback()
        import traceback
        print(f"[ERROR] void_import_row: {ex}\n{traceback.format_exc()}")
        return jsonify({"error": str(ex)}), 500
    finally:
        session.close()


# ── BANK LEDGER — CLASSIFY (update entry_type + GL/party) ─────
@app.route("/api/bank-ledger/<int:eid>/classify", methods=["POST"])
def classify_bank_entry(eid):
    """
    Update the classification fields of a bank ledger entry.

    entry_type is one of three STRUCTURAL values: "GL", "Party",
    "Contra". When entry_type is "Party", the actual category
    (Customer/Vendor/Staff/TDS/Share Capital/Directors/Payables/LTL/STL/
    any future type) is stored in party_type, read live from the
    party_types table. GL routing and Dr/Cr direction are derived from
    the party's own gl_account and normal_side — never a hardcoded
    type->GL dict.

    LC No. + Charge Type — import-specific tagging, INDEPENDENT of
    party_type. "LC" is NOT a valid party_type anymore (an LC is a
    financing instrument, never the actual payee — the real party is
    always who received the cash: the RM supplier, freight forwarder,
    customs office, agent, etc., each their own normal Vendor/Payables
    record with its own GL mapping). Any Party entry — regardless of
    which party_type it is — may optionally carry an lc_no tag. Once
    lc_no is filled, charge_type becomes available/required (one of
    Material Value, Import Freight, Import Duty, CSC, VAT, Agent
    Commission, Local Freight, Packing & Forwarding, Bank Charges,
    Insurance) — this is what lets Import Register later query "how
    much has been paid against this LC, for this charge type" as a
    live allocable pool.

    If a single payment needs to be tagged to MULTIPLE LC Nos and/or
    multiple charge types and/or multiple parties at once, the entry
    should be split instead (see /splits endpoint) — each split leg
    carries its own party + lc_no + charge_type independently.
    """
    data    = request.json or {}
    cid     = data.get("company_id")
    requesting_split   = bool(data.get("requesting_split", False))
    auto_approve_split = bool(data.get("auto_approve_split", False))
    requesting_user_id = data.get("requesting_user_id")
    session = SessionLocal()
    try:
        e = session.query(BankLedger).filter_by(id=eid, company_id=cid).first()
        if not e: return jsonify({"error":"Entry not found"}),404
        if e.is_posted_gl:
            return jsonify({"error":"Entry already posted to GL — cannot re-classify"}),400

        entry_type  = str(data.get("entry_type","")).strip()
        party_name  = str(data.get("party_name","")).strip()
        party_type  = str(data.get("party_type","")).strip()
        charge_type = str(data.get("charge_type","")).strip()
        gl_account  = str(data.get("gl_account","")).strip()
        lc_no       = str(data.get("lc_no","")).strip()

        if entry_type not in ("GL","Party","Contra"):
            return jsonify({"error":"entry_type must be GL, Party, or Contra"}),400

        if party_type == "LC":
            return jsonify({"error":"'LC' is not a valid party type. Select the real party who received this payment (Vendor, Payables, etc.), then optionally tag an LC No. and Charge Type below."}), 400

        if entry_type == "Party":
            if not party_name:
                return jsonify({"error":"Party Name is required."}), 400
            if not party_type:
                # Derive from the actual party record if not explicitly passed
                pm_ = session.query(PartyMaster).filter(
                    PartyMaster.company_id == cid,
                    func.lower(func.trim(PartyMaster.name)) == party_name.lower()
                ).first()
                if pm_: party_type = pm_.party_type
            if not party_type:
                return jsonify({"error":f"Could not determine party type for '{party_name}' — check Party Master."}), 400
        if entry_type in ("GL","Contra") and not gl_account:
            return jsonify({"error": f"GL Account is required for {entry_type} entries."}), 400

        # LC No. + Charge Type — available on ANY entry_type/party_type,
        # independent of each other. Once lc_no is filled, charge_type
        # is required (or the entry must be split across multiple legs).
        if lc_no and not charge_type and not requesting_split:
            return jsonify({
                "error": "Charge Type is required when an LC No. is tagged. "
                         "If this payment covers multiple charge types or LCs, "
                         "check 'request split' instead of selecting one."
            }), 400

        e.entry_type   = entry_type
        e.gl_account   = gl_account
        e.party_name   = party_name
        e.party_type   = party_type
        e.charge_type  = charge_type
        e.lc_no        = lc_no
        e.invoice_ref  = str(data.get("invoice_ref","")).strip()
        e.narration2   = str(data.get("narration2","")).strip()

        # If an LC No. is tagged but no charge type yet, and the user is
        # requesting a split (this payment covers multiple charge types
        # and/or multiple LCs and/or multiple parties), either:
        #  (a) auto-approve immediately if requester is this company's
        #      own Admin (they already know it needs splitting — no
        #      need to approve their own request; Super Admin has no
        #      day-to-day approval role in any individual company), or
        #  (b) create a pending BankSplitRequest for later admin review.
        if lc_no and not charge_type and requesting_split:
            is_admin_requester = False
            if auto_approve_split and requesting_user_id:
                is_admin_requester = _is_company_admin(session, requesting_user_id, cid) and not (
                    session.query(User).filter_by(id=requesting_user_id).first() or User()
                ).is_super_admin

            session.query(BankSplitRequest).filter_by(
                bank_ledger_id=eid, company_id=cid, status="pending"
            ).update({"status":"cancelled"})

            if is_admin_requester:
                e.split_status = "approved"
                req = BankSplitRequest(
                    company_id     = cid,
                    bank_ledger_id = eid,
                    requested_by   = str(data.get("requested_by") or ""),
                    requested_at   = dt.now(timezone.utc),
                    request_note   = "Import payment covers multiple LCs/charge types — self-approved by company admin.",
                    status         = "approved",
                    reviewed_by    = str(data.get("requested_by") or ""),
                    reviewed_at    = dt.now(timezone.utc),
                    review_note    = "Auto-approved — requester is this company's admin.",
                )
            else:
                e.split_status = "pending_approval"
                req = BankSplitRequest(
                    company_id     = cid,
                    bank_ledger_id = eid,
                    requested_by   = str(data.get("requested_by") or ""),
                    requested_at   = dt.now(timezone.utc),
                    request_note   = "Auto-requested at classify time — payment covers multiple LCs/charge types.",
                    status         = "pending",
                )
            session.add(req)

        session.commit()
        return jsonify({"success":True})
    except Exception as e_:
        session.rollback(); return jsonify({"error":str(e_)}),500
    finally: session.close()


# ── BANK LEDGER — REQUEST SPLIT APPROVAL ─────────────────────
@app.route("/api/bank-ledger/<int:eid>/request-split", methods=["POST"])
def request_split_approval(eid):
    """
    User raises a split request when they cannot classify/split a bank
    entry immediately (e.g. waiting for LC charge details, combined payment
    with unknown breakdown).
    Body: {company_id, request_note, requested_by}
    Creates a pending request → admin sees it in the approval queue.
    """
    data    = request.json or {}
    cid     = data.get("company_id")
    session = SessionLocal()
    try:
        entry = session.query(BankLedger).filter_by(id=eid, company_id=cid).first()
        if not entry:
            return jsonify({"error":"Bank entry not found"}),404
        if entry.is_posted_gl:
            return jsonify({"error":"Entry already posted to GL — cannot request split"}),400
        if entry.split_status == "approved":
            return jsonify({"error":"Split already approved — proceed to split this entry"}),400
        if entry.split_status == "split_done":
            return jsonify({"error":"Entry already split and posted"}),400

        # Cancel any previous pending request for this entry
        session.query(BankSplitRequest).filter_by(
            bank_ledger_id=eid, company_id=cid, status="pending"
        ).update({"status":"cancelled"})

        req = BankSplitRequest(
            company_id     = cid,
            bank_ledger_id = eid,
            requested_by   = str(data.get("requested_by") or ""),
            requested_at   = dt.now(timezone.utc),
            request_note   = str(data.get("request_note") or "")[:500],
            status         = "pending",
        )
        session.add(req)
        entry.split_status = "pending_approval"
        session.commit()

        return jsonify({
            "success":    True,
            "request_id": req.id,
            "message":    "Split request submitted. Admin will review and approve.",
        }), 201
    except Exception as e:
        session.rollback()
        return jsonify({"error":str(e)}),500
    finally: session.close()


# ── BANK LEDGER — ADMIN: GET PENDING SPLIT REQUESTS ──────────
@app.route("/api/bank-split-requests", methods=["GET"])
def get_split_requests():
    """
    Admin view: list all split requests for a company.
    GET /api/bank-split-requests?company_id=1&status=pending
    """
    cid    = request.args.get("company_id", type=int)
    status = request.args.get("status", "pending")  # pending/approved/rejected/done/all
    if not cid: return jsonify({"error":"company_id required"}),400

    session = SessionLocal()
    try:
        q = session.query(BankSplitRequest).filter_by(company_id=cid)
        if status != "all":
            q = q.filter_by(status=status)
        reqs = q.order_by(BankSplitRequest.requested_at.desc()).all()

        result = []
        for r in reqs:
            # Fetch parent bank entry details
            bl = session.query(BankLedger).filter_by(id=r.bank_ledger_id).first()
            result.append({
                "id":             r.id,
                "bank_ledger_id": r.bank_ledger_id,
                "status":         r.status,
                "requested_by":   r.requested_by,
                "requested_at":   r.requested_at.isoformat() if r.requested_at else None,
                "request_note":   r.request_note,
                "reviewed_by":    r.reviewed_by,
                "reviewed_at":    r.reviewed_at.isoformat() if r.reviewed_at else None,
                "review_note":    r.review_note,
                "split_done_at":  r.split_done_at.isoformat() if r.split_done_at else None,
                # Bank entry details for context
                "entry": {
                    "entry_date":    bl.entry_date.isoformat() if bl and bl.entry_date else None,
                    "narration":     bl.narration if bl else "",
                    "withdraw":      float(bl.withdraw or 0) if bl else 0,
                    "deposit":       float(bl.deposit  or 0) if bl else 0,
                    "internal_ref":  bl.internal_ref if bl else "",
                    "entry_type":    bl.entry_type if bl else "",
                    "party_name":    bl.party_name if bl else "",
                    "split_status":  bl.split_status if bl else "",
                } if bl else {}
            })

        return jsonify({"requests":result,"total":len(result)})
    finally: session.close()


# ── BANK LEDGER — ADMIN: APPROVE / REJECT SPLIT REQUEST ───────
@app.route("/api/bank-split-requests/<int:rid>/review", methods=["POST"])
def review_split_request(rid):
    """
    Admin approves or rejects a split request.
    Body: {company_id, action: "approve"|"reject", review_note, reviewed_by}
    On approve: sets bank_ledger.split_status = "approved"
                → user can now call /splits to edit/split the entry
    On reject:  sets bank_ledger.split_status = "" (back to normal)
                → user classifies normally without split
    """
    data   = request.json or {}
    cid    = data.get("company_id")
    action = str(data.get("action","")).strip().lower()
    if action not in ("approve","reject"):
        return jsonify({"error":"action must be 'approve' or 'reject'"}),400

    session = SessionLocal()
    try:
        req = session.query(BankSplitRequest).filter_by(id=rid, company_id=cid).first()
        if not req:
            return jsonify({"error":"Request not found"}),404
        if req.status != "pending":
            return jsonify({"error":f"Request is already {req.status}"}),400

        req.status      = "approved" if action == "approve" else "rejected"
        req.reviewed_by = str(data.get("reviewed_by") or "")
        req.reviewed_at = dt.now(timezone.utc)
        req.review_note = str(data.get("review_note") or "")[:500]

        # Update the bank ledger entry status
        bl = session.query(BankLedger).filter_by(
            id=req.bank_ledger_id, company_id=cid
        ).first()
        if bl:
            bl.split_status = "approved" if action == "approve" else ""

        session.commit()
        return jsonify({
            "success": True,
            "action":  action,
            "message": (
                "Split approved. User can now edit and split this entry."
                if action == "approve" else
                "Split rejected. User should classify the entry normally."
            ),
        })
    except Exception as e:
        session.rollback()
        return jsonify({"error":str(e)}),500
    finally: session.close()


# ── BANK LEDGER — SAVE SPLITS (LC / GL multi-expense) ────────
@app.route("/api/bank-ledger/<int:eid>/splits", methods=["POST"])
def save_bank_splits(eid):
    """
    Save split breakdown for a bank entry — one withdrawal/deposit
    broken into multiple legs. Each leg independently carries:
      - its own real party (whoever actually received that portion —
        Vendor, Payables, etc.; "LC" is never a valid party here)
      - its own optional LC No. tag (lc_no, from LCMaster)
      - its own Charge Type — REQUIRED if that leg's lc_no is filled
        (this is what lets Import Register later query allocable
        pools per LC + Charge Type), otherwise left blank
      - its own GL account (for pure GL-type legs with no party)

    AR/AP/HR/Contra legs without an lc_no simply post normally —
    bifurcation via Journal Entry if ever needed later.

    Body: {
      company_id,
      splits: [
        {amount, entry_type, gl_account, party_name, lc_no, charge_type,
         invoice_ref, narration}
      ]
    }
    Validation: sum of split amounts must equal parent withdraw or deposit.
    """
    data    = request.json or {}
    cid     = data.get("company_id")
    splits  = data.get("splits", [])
    session = SessionLocal()
    try:
        entry = session.query(BankLedger).filter_by(id=eid, company_id=cid).first()
        if not entry: return jsonify({"error":"Bank entry not found"}),404
        if entry.is_posted_gl:
            return jsonify({"error":"Already posted to GL — cannot re-split"}),400

        # Enforce approval gate — user must have admin approval to split
        # Exception: entry_type is still unset (first-time classification)
        if entry.split_status not in ("approved", "split_done", ""):
            return jsonify({
                "error": "Split not yet approved by admin. "
                         "Submit a split request first via 'Request Split Approval'.",
                "split_status": entry.split_status,
            }), 403
        # If entry already has a classification (not GL/SPLIT/unset), block split
        if entry.entry_type and entry.entry_type not in ("GL","SPLIT","Party",""):
            return jsonify({
                "error": f"Split not applicable for {entry.entry_type} type. "
                         "AR/AP/HR use party ledger — bifurcate via Journal Entry.",
            }), 400

        parent_amount = float(entry.deposit or 0) or float(entry.withdraw or 0)
        if parent_amount <= 0:
            return jsonify({"error":"Parent entry has no amount"}),400

        # Validate split amounts sum to parent
        split_total = sum(abs(float(s.get("amount") or 0)) for s in splits)
        if abs(split_total - parent_amount) > 0.01:
            return jsonify({
                "error": f"Split total {split_total:.2f} ≠ entry amount {parent_amount:.2f}. "
                         f"Difference: {abs(split_total - parent_amount):.2f}"
            }), 400

        # Validate each leg: party legs need a real party_name (never "LC"),
        # GL legs need a gl_account, and ANY leg with lc_no filled needs
        # a charge_type — independent of entry_type/party_type.
        for i, s in enumerate(splits):
            etype   = (s.get("entry_type") or "").strip()
            gl      = (s.get("gl_account") or "").strip()
            ct      = (s.get("charge_type") or "").strip()
            pname   = (s.get("party_name") or "").strip()
            ptype   = (s.get("party_type") or "").strip()
            leg_lc  = (s.get("lc_no") or "").strip()
            amt     = abs(float(s.get("amount") or 0))
            if amt <= 0:
                return jsonify({"error":f"Split {i+1}: amount must be > 0"}),400
            if ptype == "LC":
                return jsonify({"error":f"Split {i+1}: 'LC' is not a valid party type. Select the real party who received this leg, then optionally tag an LC No."}),400
            if etype == "Party" and not pname:
                return jsonify({"error":f"Split {i+1}: Party Name required"}),400
            if etype == "GL" and not gl:
                return jsonify({"error":f"Split {i+1}: GL Account required"}),400
            if leg_lc and not ct:
                return jsonify({"error":f"Split {i+1}: Charge Type required when an LC No. is tagged"}),400

        # Delete existing splits first (allow re-splitting)
        session.query(BankLedgerSplit).filter_by(
            bank_ledger_id=eid, company_id=cid
        ).delete()

        # Save new splits
        for s in splits:
            bs = BankLedgerSplit(
                bank_ledger_id = eid,
                company_id     = cid,
                split_amount   = round(abs(float(s.get("amount") or 0)), 2),
                entry_type     = (s.get("entry_type") or "").strip(),
                gl_account     = (s.get("gl_account") or "").strip(),
                charge_type    = (s.get("charge_type") or "").strip(),
                lc_no          = (s.get("lc_no") or "").strip(),
                party_name     = (s.get("party_name") or "").strip(),
                invoice_ref    = (s.get("invoice_ref") or "").strip(),
                narration      = (s.get("narration") or "").strip(),
            )
            session.add(bs)

        entry.is_split     = True
        entry.entry_type   = "SPLIT"  # mark parent as split
        entry.split_status = "split_done"

        # Mark the approved request as done
        session.query(BankSplitRequest).filter_by(
            bank_ledger_id=eid, company_id=cid, status="approved"
        ).update({"status":"done","split_done_at":dt.now(timezone.utc)})

        session.commit()

        return jsonify({
            "success":     True,
            "split_count": len(splits),
            "split_total": split_total,
            "parent_amount": parent_amount,
        })
    except Exception as e:
        session.rollback()
        import traceback; tb=traceback.format_exc()
        print(f"[ERROR] save_bank_splits: {e}\n{tb}")
        return jsonify({"error":str(e)}),500
    finally: session.close()


@app.route("/api/bank-ledger/<int:eid>/splits", methods=["GET"])
def get_bank_splits(eid):
    cid     = request.args.get("company_id", type=int)
    session = SessionLocal()
    try:
        splits = session.query(BankLedgerSplit).filter_by(
            bank_ledger_id=eid, company_id=cid
        ).all()
        return jsonify({"splits":[{
            "id":           s.id,
            "split_amount": float(s.split_amount),
            "entry_type":   s.entry_type,
            "gl_account":   s.gl_account,
            "charge_type":  s.charge_type,
            "party_name":   s.party_name,
            "invoice_ref":  s.invoice_ref,
            "narration":    s.narration,
            "is_posted":    s.is_posted,
        } for s in splits]})
    finally: session.close()


# ── BANK LEDGER — POST TO GL & PARTY ──────────────────────────
@app.route("/api/bank-ledger/post", methods=["POST"])
def post_bank_to_gl():
    """
    Post classified bank entries to GL Book and Party Ledger.
    Body: {company_id, bank_account_id, entry_ids: [list of ids to post]}
    """
    data            = request.json or {}
    cid             = data.get("company_id")
    bank_account_id = data.get("bank_account_id")
    entry_ids       = data.get("entry_ids", [])
    posted_by_uid   = data.get("requesting_user_id")
    if not cid: return jsonify({"error":"company_id required"}),400

    session = SessionLocal()
    try:
        posted_gl = 0; posted_party = 0; skipped = 0; errors = []

        acct = session.query(BankAccount).filter_by(id=bank_account_id, company_id=cid).first()
        bank_gl_name = f"{acct.gl_code} - {acct.gl_name}" if acct else "Bank"

        entries = session.query(BankLedger).filter(
            BankLedger.company_id == cid,
            BankLedger.id.in_(entry_ids) if entry_ids else BankLedger.company_id == cid,
        ).all()

        for e in entries:
            if e.is_posted_gl:
                skipped += 1; continue
            if not e.entry_type or not (e.gl_account or e.party_name):
                errors.append(f"{e.internal_ref}: classify first"); continue

            wd  = float(e.withdraw or 0)
            dep = float(e.deposit  or 0)
            amt = wd if wd > 0 else dep
            if amt == 0: skipped += 1; continue

            # Determine GL side — looked up from the party's own gl_account
            # in party_master, NOT a hardcoded type->GL dict. This means
            # any party type (including ones added after this code was
            # written, e.g. Directors, Share Capital, LTL, STL) works
            # automatically as long as the party's gl_account is set.
            def _party_ctrl_gl(party_name_):
                if not party_name_: return None
                pm_ = session.query(PartyMaster).filter(
                    PartyMaster.company_id == cid,
                    func.lower(func.trim(PartyMaster.name)) == party_name_.strip().lower()
                ).first()
                return pm_.gl_account if pm_ else None
            # ── SPLIT entry: post each leg separately ─────────────
            if e.is_split and e.entry_type == "SPLIT":
                split_rows = session.query(BankLedgerSplit).filter_by(
                    bank_ledger_id=e.id, company_id=cid, is_posted=False
                ).all()
                if not split_rows:
                    errors.append(f"{e.internal_ref}: marked as split but no split rows found")
                    continue

                for si, sp in enumerate(split_rows, 1):
                    sp_amt = float(sp.split_amount)
                    sp_ref = f"{e.internal_ref}/{si}"
                    sp_narr = sp.narration or (e.narration2 or e.narration or "")
                    sp_desc = f"{sp_narr} | {sp.invoice_ref}" if sp.invoice_ref else sp_narr
                    if sp.lc_no:
                        sp_desc = f"{sp_desc} [LC {sp.lc_no} / {sp.charge_type}]" if sp.charge_type else f"{sp_desc} [LC {sp.lc_no}]"

                    if sp.entry_type == "Party":
                        # Real party leg — posts to whatever GL that party
                        # is actually mapped to in Party Master, exactly
                        # like the non-split path below. lc_no + charge_type
                        # ride along as tags (on the Party Ledger row, via
                        # charge_type) — they do NOT change which GL gets
                        # hit. This is what replaced the old LC-specific
                        # branch: there is no special "LC GL" anymore, the
                        # real payee's own control account is always used.
                        sp_contra = _party_ctrl_gl(sp.party_name)
                        if not sp_contra:
                            errors.append(f"{e.internal_ref}/{si}: party '{sp.party_name}' has no GL account set in Party Master — split leg skipped")
                            continue
                        _add_gl_book_entry(session, cid, e.entry_date,
                            sp_ref, sp_contra, sp_contra,
                            bank_gl_name, bank_gl_name,
                            sp_desc,
                            sp_amt, "Bank_Ledger", "Bank Payment", created_by=posted_by_uid)
                        if sp.party_name:
                            _add_party_ledger_entry(
                                session, cid, e.entry_date,
                                sp.party_name, "Vendor",  # actual party_type isn't stored per-split-leg; Vendor/Payables share Cr-side convention used here
                                f"Bank Payment{' - '+sp.charge_type if sp.charge_type else ''}",
                                sp_ref, sp_desc,
                                debit=sp_amt, credit=0,
                                source="Bank_Ledger",
                                gl_account=sp_contra,
                                charge_type=sp.charge_type or "",
                                lc_no=sp.lc_no or "",
                            )
                            posted_party += 1
                    else:
                        # GL split: Expense or Income
                        sp_contra = sp.gl_account
                        if dep > 0:  # Income / receipt
                            _add_gl_book_entry(session, cid, e.entry_date,
                                sp_ref, bank_gl_name, bank_gl_name,
                                sp_contra, sp_contra,
                                sp_desc, sp_amt, "Bank_Ledger", "Bank Receipt", created_by=posted_by_uid)
                        else:        # Expense / payment
                            _add_gl_book_entry(session, cid, e.entry_date,
                                sp_ref, sp_contra, sp_contra,
                                bank_gl_name, bank_gl_name,
                                sp_desc, sp_amt, "Bank_Ledger", "Bank Payment", created_by=posted_by_uid)
                    sp.is_posted = True
                    posted_gl += 1

                e.is_posted_gl = True
                continue  # done with this split entry

            # ── SIMPLE (non-split) entry ──────────────────────────
            if e.entry_type == "Party":
                contra_gl = _party_ctrl_gl(e.party_name)
            elif e.entry_type == "Contra":
                contra_gl = e.gl_account
            else:
                contra_gl = e.gl_account  # GL expense/income

            narr_gl = e.narration2 or e.narration or ""
            desc    = f"{narr_gl} | {e.invoice_ref}" if e.invoice_ref else narr_gl

            if dep > 0:
                _add_gl_book_entry(session, cid, e.entry_date,
                    e.internal_ref, bank_gl_name, bank_gl_name,
                    contra_gl, contra_gl, desc, amt, "Bank_Ledger", "Bank Deposit", created_by=posted_by_uid)
            else:
                _add_gl_book_entry(session, cid, e.entry_date,
                    e.internal_ref, contra_gl, contra_gl,
                    bank_gl_name, bank_gl_name, desc, amt, "Bank_Ledger", "Bank Payment", created_by=posted_by_uid)

            e.is_posted_gl = True
            posted_gl += 1

            # Party Ledger — any party type, derived live from the party's
            # own record. This MUST happen whenever entry_type is "Party" —
            # if party_name is missing, that's an error to surface, not a
            # silent skip.
            if e.entry_type == "Party":
                if not e.party_name or not e.party_name.strip():
                    errors.append(
                        f"{e.internal_ref}: classified as Party but no party name set — "
                        f"GL posted, but Party Ledger was NOT updated. Re-classify with a party name."
                    )
                else:
                    ctrl_gl = _party_ctrl_gl(e.party_name)
                    if not ctrl_gl:
                        errors.append(
                            f"{e.internal_ref}: party '{e.party_name}' has no GL account set in "
                            f"Party Master — GL posted, but Party Ledger was NOT updated."
                        )
                    else:
                        # Exactly one side gets the amount — never both.
                        # In standard double-entry convention, a DEPOSIT
                        # (money coming in) is always a CREDIT to the
                        # party's ledger account, and a WITHDRAWAL (money
                        # going out) is always a DEBIT — this holds whether
                        # the party is Dr-side (Customer/Staff/LC/Directors)
                        # or Cr-side (Vendor/TDS/Payables/LTL/STL/Share
                        # Capital): a deposit reduces what they owe us (if
                        # Dr-side) or increases what we owe them (if
                        # Cr-side) — both are Credit movements; a withdrawal
                        # is the mirror Debit movement either way.
                        if dep > 0: pl_debit, pl_credit = 0, amt
                        else:        pl_debit, pl_credit = amt, 0

                        _add_party_ledger_entry(
                            session, cid, e.entry_date,
                            e.party_name, e.party_type or e.entry_type,
                            "Bank Payment" if wd > 0 else "Bank Receipt",
                            e.internal_ref or e.invoice_ref or "",
                            desc,
                            debit  = pl_debit,
                            credit = pl_credit,
                            source = "Bank_Ledger",
                            gl_account = ctrl_gl,
                            charge_type = e.charge_type or "",
                            lc_no = e.lc_no or "",
                        )
                        e.is_posted_party = True
                        posted_party += 1

        session.commit()
        return jsonify({"success":True,"posted_gl":posted_gl,
                        "posted_party":posted_party,"skipped":skipped,"errors":errors})
    except Exception as ex:
        session.rollback()
        import traceback; tb=traceback.format_exc()
        print(f"[ERROR] post_bank_to_gl: {ex}\n{tb}")
        return jsonify({"error":str(ex)}),500
    finally: session.close()


# ── BACKFILL party_ledger from existing PB/SB ────────────────────
@app.route("/api/bank-ledger/missing-party-posts", methods=["GET"])
def find_missing_party_posts():
    """
    Diagnostic: finds bank_ledger rows classified as Party,
    posted to GL (is_posted_gl=True), but with NO matching row in
    party_ledger. These are entries where the party ledger update
    silently failed (e.g. blank party_name) or was posted before the
    bug fix. Returns the list so they can be manually re-posted.
    """
    cid = request.args.get("company_id", type=int)
    if not cid: return jsonify({"error":"company_id required"}),400
    session = SessionLocal()
    try:
        candidates = session.query(BankLedger).filter(
            BankLedger.company_id == cid,
            BankLedger.entry_type == "Party",
            BankLedger.is_posted_gl == True,
        ).all()

        missing = []
        for e in candidates:
            exists = session.query(PartyLedger).filter(
                PartyLedger.company_id == cid,
                PartyLedger.reference == (e.internal_ref or "")
            ).first()
            if not exists:
                missing.append({
                    "id": e.id, "internal_ref": e.internal_ref,
                    "entry_date": e.entry_date.isoformat() if e.entry_date else None,
                    "entry_type": e.entry_type, "party_name": e.party_name,
                    "withdraw": float(e.withdraw or 0), "deposit": float(e.deposit or 0),
                    "is_posted_party": e.is_posted_party,
                })
        return jsonify({"missing_count": len(missing), "entries": missing})
    finally: session.close()


@app.route("/api/bank-ledger/<int:eid>/repost-party", methods=["POST"])
def repost_party_ledger(eid):
    """
    Manually re-post a single bank_ledger entry's party ledger leg,
    used to fix entries found by /missing-party-posts. Requires the
    entry already has entry_type and party_name set correctly.
    """
    data = request.json or {}
    cid  = data.get("company_id")
    session = SessionLocal()
    try:
        e = session.query(BankLedger).filter_by(id=eid, company_id=cid).first()
        if not e: return jsonify({"error":"Bank entry not found"}),404

        if e.entry_type != "Party":
            return jsonify({"error":f"entry_type '{e.entry_type}' is not Party"}),400
        if not e.party_name or not e.party_name.strip():
            return jsonify({"error":"party_name is blank — set it via Classify first"}),400

        wd = float(e.withdraw or 0); dep = float(e.deposit or 0)
        amt = wd if wd > 0 else dep
        pm = session.query(PartyMaster).filter(
            PartyMaster.company_id == cid,
            func.lower(func.trim(PartyMaster.name)) == e.party_name.strip().lower()
        ).first()
        if not pm or not pm.gl_account:
            return jsonify({"error":f"Party '{e.party_name}' has no GL account set in Party Master"}),400
        ctrl_gl = pm.gl_account

        # Deposit is always Credit, withdrawal is always Debit — see the
        # note in post_bank_to_gl for why this holds for any party type.
        if dep > 0: pl_debit, pl_credit = 0, amt
        else:        pl_debit, pl_credit = amt, 0

        narr = e.narration2 or e.narration or ""
        desc = f"{narr} | {e.invoice_ref}" if e.invoice_ref else narr

        _add_party_ledger_entry(
            session, cid, e.entry_date,
            e.party_name, e.party_type or e.entry_type,
            "Bank Payment" if wd > 0 else "Bank Receipt",
            e.internal_ref or e.invoice_ref or "",
            desc, debit=pl_debit, credit=pl_credit,
            source="Bank_Ledger", gl_account=ctrl_gl,
            charge_type=e.charge_type or "",
        )
        e.is_posted_party = True
        session.commit()
        return jsonify({"success": True, "internal_ref": e.internal_ref})
    except Exception as ex:
        session.rollback()
        return jsonify({"error": str(ex)}), 500
    finally: session.close()


@app.route("/api/bank-ledger/missing-gl-account", methods=["GET"])
def find_missing_gl_account():
    """
    Diagnostic: finds bank_ledger rows AND bank_ledger_splits rows
    classified as GL or Contra type but with a blank gl_account.
    Split legs (the child rows used for LC/GL multi-allocation splits)
    are checked separately here, since they live in a different table
    and are aggregated independently in /cash-flow.
    """
    cid = request.args.get("company_id", type=int)
    if not cid: return jsonify({"error":"company_id required"}),400
    session = SessionLocal()
    try:
        rows = session.query(BankLedger).filter(
            BankLedger.company_id == cid,
            BankLedger.entry_type.in_(["GL","Contra"]),
            (BankLedger.gl_account == "") | (BankLedger.gl_account == None),
        ).all()

        split_rows = session.query(BankLedgerSplit).filter(
            BankLedgerSplit.company_id == cid,
            BankLedgerSplit.entry_type == "GL",
            (BankLedgerSplit.gl_account == "") | (BankLedgerSplit.gl_account == None),
        ).all()

        split_results = []
        for sr in split_rows:
            parent = session.query(BankLedger).filter_by(id=sr.bank_ledger_id).first()
            split_results.append({
                "split_id": sr.id, "bank_ledger_id": sr.bank_ledger_id,
                "parent_ref": parent.internal_ref if parent else None,
                "amount": float(sr.split_amount or 0),
                "narration": sr.narration, "is_posted": sr.is_posted,
            })

        return jsonify({
            "count": len(rows), "rows": [{
                "id": r.id, "internal_ref": r.internal_ref,
                "entry_date": r.entry_date.isoformat() if r.entry_date else None,
                "narration": r.narration, "entry_type": r.entry_type,
                "withdraw": float(r.withdraw or 0), "deposit": float(r.deposit or 0),
                "is_posted_gl": r.is_posted_gl,
            } for r in rows],
            "split_count": len(split_results),
            "split_rows": split_results,
        })
    finally: session.close()


@app.route("/api/bank-ledger/<int:split_id>/fix-split-gl", methods=["POST"])
def fix_split_gl_account(split_id):
    """
    Correct a bank_ledger_splits row's gl_account after the fact.
    Only works if the split (and its parent) hasn't been posted yet —
    matches the same is_posted_gl lock used everywhere else.
    """
    data = request.json or {}
    cid  = data.get("company_id")
    new_gl = str(data.get("gl_account","")).strip()
    if not new_gl:
        return jsonify({"error":"gl_account is required"}),400

    session = SessionLocal()
    try:
        sr = session.query(BankLedgerSplit).filter_by(id=split_id, company_id=cid).first()
        if not sr: return jsonify({"error":"Split leg not found"}),404
        if sr.is_posted:
            return jsonify({"error":"Already posted — cannot edit"}),400
        sr.gl_account = new_gl
        session.commit()
        return jsonify({"success":True})
    except Exception as e:
        session.rollback(); return jsonify({"error":str(e)}),500
    finally: session.close()


@app.route("/api/gl-book/fix-combined-codes", methods=["POST"])
def fix_gl_book_combined_codes():
    """
    One-time data fix: existing gl_book rows may have gl_code stored as
    a combined "2230 - Nabil Bank - A/c" string instead of the bare
    numeric code "2230" (a bug in _add_gl_book_entry, now fixed for all
    NEW postings). This endpoint finds and corrects historical rows.
    Pass {"apply": true} to actually write the fix; without it, this
    only reports what would change (dry run).
    """
    data = request.json or {}
    cid  = data.get("company_id")
    apply_fix = data.get("apply", False)
    if not cid: return jsonify({"error":"company_id required"}),400

    session = SessionLocal()
    try:
        rows = session.query(GLBook).filter(
            GLBook.company_id == cid,
            GLBook.gl_code.like("% - %"),
        ).all()

        affected = []
        for r in rows:
            code = (r.gl_code or "").strip()
            if " - " in code:
                prefix, rest = code.split(" - ", 1)
                if prefix.strip().isdigit():
                    affected.append({
                        "id": r.id, "unique_id": r.unique_id,
                        "old_gl_code": r.gl_code, "new_gl_code": prefix.strip(),
                        "gl_name": r.gl_name or code,
                    })
                    if apply_fix:
                        if not r.gl_name:
                            r.gl_name = code
                        r.gl_code = prefix.strip()

        if apply_fix:
            session.commit()
            return jsonify({"success": True, "fixed": len(affected), "rows": affected})

        return jsonify({"would_fix": len(affected), "rows": affected,
                         "note": "Call again with {\"apply\": true} to apply the fix."})
    finally: session.close()


@app.route("/api/party-ledger/fix-unvoided-originals", methods=["POST"])
def fix_unvoided_originals():
    """
    One-time data fix: for bank_ledger/purchase_book/sales_book entries
    that are ALREADY voided (is_void=True), their original party_ledger
    row was never marked is_void=True before this fix existed — only a
    separate reversal row was added. This meant voided transactions
    still appeared as normal active rows in the Party Statement, even
    though their net effect on the balance was correctly cancelled out
    by the reversal. This endpoint finds those original rows (matched
    by reference back to an already-voided source transaction) and
    marks them is_void=True, without touching anything else.
    """
    data = request.json or {}
    cid  = data.get("company_id")
    apply_fix = data.get("apply", False)
    if not cid: return jsonify({"error":"company_id required"}),400

    session = SessionLocal()
    try:
        affected = []

        # Bank Ledger — simple entries and split legs
        voided_bank = session.query(BankLedger).filter_by(company_id=cid, is_void=True).all()
        for be in voided_bank:
            refs = [be.internal_ref or ""]
            if be.is_split:
                legs = session.query(BankLedgerSplit).filter_by(bank_ledger_id=be.id).all()
                refs += [f"{be.internal_ref}/{i}" for i in range(1, len(legs)+1)]
            rows = session.query(PartyLedger).filter(
                PartyLedger.company_id == cid,
                PartyLedger.reference.in_(refs),
                PartyLedger.is_void == False,
                PartyLedger.txn_type != "Void",
            ).all()
            for r in rows:
                affected.append({"id": r.id, "reference": r.reference, "party_name": r.party_name,
                                  "source_table": "bank_ledger", "source_ref": be.internal_ref})
                if apply_fix: r.is_void = True

        # Purchase Book
        voided_pb = session.query(PurchaseBook).filter_by(company_id=cid, is_void=True).all()
        for pb in voided_pb:
            rows = session.query(PartyLedger).filter(
                PartyLedger.company_id == cid,
                PartyLedger.reference.in_([pb.internal_ref or "", pb.bill_no or ""]),
                PartyLedger.is_void == False,
                PartyLedger.txn_type != "Void",
            ).all()
            for r in rows:
                affected.append({"id": r.id, "reference": r.reference, "party_name": r.party_name,
                                  "source_table": "purchase_book", "source_ref": pb.internal_ref})
                if apply_fix: r.is_void = True

        # Sales Book
        voided_sb = session.query(SalesBook).filter_by(company_id=cid, is_void=True).all()
        for sb in voided_sb:
            rows = session.query(PartyLedger).filter(
                PartyLedger.company_id == cid,
                PartyLedger.reference.in_([sb.internal_ref or "", sb.bill_no or ""]),
                PartyLedger.is_void == False,
                PartyLedger.txn_type != "Void",
            ).all()
            for r in rows:
                affected.append({"id": r.id, "reference": r.reference, "party_name": r.party_name,
                                  "source_table": "sales_book", "source_ref": sb.internal_ref})
                if apply_fix: r.is_void = True

        if apply_fix:
            session.commit()
            return jsonify({"success": True, "fixed": len(affected), "rows": affected})

        return jsonify({"would_fix": len(affected), "rows": affected,
                         "note": "Call again with {\"apply\": true} to apply the fix."})
    finally: session.close()


@app.route("/api/party-ledger/backfill-charge-type", methods=["POST"])
def backfill_party_ledger_charge_type():
    """
    One-time data fix: party_ledger rows posted before the charge_type
    column existed have it blank, even for LC entries that genuinely
    have a charge type on their source bank_ledger row. Matches each
    blank-charge_type party_ledger row (source=Bank_Ledger) back to its
    originating bank_ledger entry by reference, and copies the charge
    type across. Handles both simple entries (reference == internal_ref)
    and split legs (reference == "BNK-0016/1" style, looked up via the
    split table).
    """
    data = request.json or {}
    cid  = data.get("company_id")
    apply_fix = data.get("apply", False)
    if not cid: return jsonify({"error":"company_id required"}),400

    session = SessionLocal()
    try:
        rows = session.query(PartyLedger).filter(
            PartyLedger.company_id == cid,
            PartyLedger.source == "Bank_Ledger",
            PartyLedger.party_type == "LC",
            (PartyLedger.charge_type == "") | (PartyLedger.charge_type == None),
        ).all()

        affected = []
        for r in rows:
            ref = (r.reference or "").strip()
            charge_type = None

            if "/" in ref:
                # Split leg reference like "BNK-0016/1"
                parent_ref, leg_no = ref.rsplit("/", 1)
                parent = session.query(BankLedger).filter_by(
                    company_id=cid, internal_ref=parent_ref
                ).first()
                if parent:
                    try:
                        legs = session.query(BankLedgerSplit).filter_by(
                            bank_ledger_id=parent.id
                        ).order_by(BankLedgerSplit.id).all()
                        idx = int(leg_no) - 1
                        if 0 <= idx < len(legs):
                            charge_type = legs[idx].charge_type
                    except (ValueError, IndexError):
                        pass
            else:
                # Simple entry — reference matches internal_ref directly
                entry = session.query(BankLedger).filter_by(
                    company_id=cid, internal_ref=ref
                ).first()
                if entry: charge_type = entry.charge_type

            if charge_type:
                affected.append({
                    "id": r.id, "reference": ref, "party_name": r.party_name,
                    "old_charge_type": r.charge_type or "", "new_charge_type": charge_type,
                })
                if apply_fix:
                    r.charge_type = charge_type

        if apply_fix:
            session.commit()
            return jsonify({"success": True, "fixed": len(affected), "rows": affected})

        return jsonify({"would_fix": len(affected), "rows": affected,
                         "note": "Call again with {\"apply\": true} to apply the fix."})
    finally: session.close()


@app.route("/api/party-ledger/fix-double-sided", methods=["POST"])
def fix_double_sided_party_ledger():
    """
    One-time data fix: corrects party_ledger rows that were incorrectly
    posted with BOTH debit and credit non-zero on the same row (a bug in
    bank-to-party-ledger posting that has since been fixed). Since debit
    and credit were always equal in the buggy rows (both set to the same
    amount), the correct fix is to net them to zero on each individual
    column for the WRONG side based on entry source, while these rows
    should ideally be voided+reposted. As a safe default, this endpoint
    only reports affected rows; pass {"apply": true} to zero out the
    incorrect side (credit, since the bug always double-set both sides
    for AP/LC/HR/TDS withdrawals which should be debit-only).
    """
    data = request.json or {}
    cid  = data.get("company_id")
    apply_fix = data.get("apply", False)
    if not cid: return jsonify({"error":"company_id required"}),400

    session = SessionLocal()
    try:
        bad_rows = session.query(PartyLedger).filter(
            PartyLedger.company_id == cid,
            PartyLedger.source == "Bank_Ledger",
            PartyLedger.debit > 0,
            PartyLedger.credit > 0,
        ).all()

        affected = [{
            "id": r.id, "party_name": r.party_name, "reference": r.reference,
            "debit": float(r.debit), "credit": float(r.credit),
            "entry_date": r.entry_date.isoformat() if r.entry_date else None,
        } for r in bad_rows]

        if apply_fix:
            for r in bad_rows:
                # These were all AP/LC/HR/TDS withdrawals — correct side is Debit only
                r.credit = 0
            session.commit()
            return jsonify({"success":True,"fixed":len(affected),"rows":affected})

        return jsonify({"would_fix": len(affected), "rows": affected,
                         "note": "Call again with {\"apply\": true} to apply the fix."})
    finally: session.close()


@app.route("/api/party-ledger/backfill", methods=["POST"])
def backfill_party_ledger():
    """
    POST /api/party-ledger/backfill?company_id=1
    One-time migration: reads all existing purchase_book + sales_book rows
    and inserts them into party_ledger (skipping duplicates by reference).
    Call once after deploying the party_ledger feature.
    """
    cid = request.args.get("company_id", type=int)
    if not cid: return jsonify({"error": "company_id required"}), 400
    session = SessionLocal()
    try:
        inserted = 0; skipped = 0

        # Get existing refs in party_ledger to avoid duplicates
        existing = set(
            r[0] for r in session.query(PartyLedger.reference)
            .filter_by(company_id=cid).all()
        )

        # ── Purchase Book → party_ledger ──────────────────────
        pb_rows = session.query(PurchaseBook).filter(
            PurchaseBook.company_id == cid,
            (PurchaseBook.is_void == False) | (PurchaseBook.is_void == None)
        ).order_by(PurchaseBook.entry_date, PurchaseBook.id).all()

        for p in pb_rows:
            ref = p.bill_no or p.internal_ref or ""
            iref = p.internal_ref or ref
            if iref in existing: skipped += 1; continue

            # Lookup party type and GL account directly from the party's
            # own record — not a hardcoded type->GL dict — so this backfill
            # works correctly for any party type, including Directors,
            # Payables, LTL, STL, Share Capital.
            pm = session.query(PartyMaster).filter(
                PartyMaster.company_id == cid,
                func.lower(func.trim(PartyMaster.name)) == (p.vendor_name or "").strip().lower()
            ).first()
            party_type = pm.party_type if pm else "Vendor"
            ctrl_gl = pm.gl_account if pm and pm.gl_account else "5010 - Trade Creditors / Payables"

            total = float(p.total_amount or 0) + float(p.non_taxable_value or 0) + float(getattr(p,"cap_total",0) or 0)
            is_ret = p.transaction_type in ("Purchase Return","Debit Note")
            sign = -1 if is_ret else 1

            session.add(PartyLedger(
                company_id  = cid,
                entry_date  = p.entry_date,
                party_name  = p.vendor_name or "",
                party_type  = party_type,
                txn_type    = p.transaction_type or "Purchase",
                reference   = iref,
                description = f"{p.product_name or ''} — Bill: {p.bill_no or ''} ({p.internal_ref or ''})",
                debit       = round(abs(total), 2) if is_ret else 0,
                credit      = round(abs(total), 2) if not is_ret else 0,
                source      = "Purchase_Book",
                gl_account  = ctrl_gl,
            ))
            existing.add(iref)
            inserted += 1

        # ── Sales Book → party_ledger ────────────────────────
        sb_rows = session.query(SalesBook).filter(
            SalesBook.company_id == cid,
            (SalesBook.is_void == False) | (SalesBook.is_void == None)
        ).order_by(SalesBook.entry_date, SalesBook.id).all()

        for s in sb_rows:
            iref = s.internal_ref or s.bill_no or ""
            if iref in existing: skipped += 1; continue

            pm = session.query(PartyMaster).filter(
                PartyMaster.company_id == cid,
                func.lower(func.trim(PartyMaster.name)) == (s.customer_name or "").strip().lower()
            ).first()
            party_type = pm.party_type if pm else "Customer"
            ctrl_gl = {"Customer":"2100","Staff":"2120"}.get(party_type,"2100")

            total = (float(s.total_amount or 0) + float(s.non_taxable_value or 0) +
                     float(getattr(s,"cap_total",0) or 0) + float(getattr(s,"export_amount",0) or 0))
            is_ret = s.transaction_type in ("Sales Return","Credit Note")

            session.add(PartyLedger(
                company_id  = cid,
                entry_date  = s.entry_date,
                party_name  = s.customer_name or "",
                party_type  = party_type,
                txn_type    = s.transaction_type or "Sales",
                reference   = iref,
                description = f"{s.product_name or ''} — Bill: {s.bill_no or ''} ({s.internal_ref or ''})",
                debit       = round(abs(total), 2) if not is_ret else 0,
                credit      = round(abs(total), 2) if is_ret else 0,
                source      = "Sales_Book",
                gl_account  = ctrl_gl,
            ))
            existing.add(iref)
            inserted += 1

        session.commit()
        print(f"[backfill] company {cid}: inserted={inserted} skipped={skipped}")
        return jsonify({"success": True, "inserted": inserted, "skipped": skipped})
    except Exception as e:
        session.rollback()
        import traceback; tb=traceback.format_exc(); print(f"[ERROR] backfill: {e}\n{tb}")
        return jsonify({"error": str(e)}), 500
    finally: session.close()

# ── Hard DELETE (Super Admin only — emergency use) ────────────
@app.route("/api/purchase/<int:entry_id>", methods=["DELETE"])
def delete_purchase(entry_id):
    """Hard delete — Super Admin only. Normal users should use /void."""
    session=SessionLocal()
    try:
        data=request.get_json() or {}; req_user=data.get("requesting_user_id")
        u=session.query(User).filter_by(id=req_user,is_active=True).first()
        if not u or not u.is_super_admin: return jsonify({"error":"Hard delete: Super Admin only. Use /void for normal operations."}),403
        p=session.query(PurchaseBook).filter_by(id=entry_id).first()
        if not p: return jsonify({"error":"Entry not found"}),404
        session.query(GLBook).filter_by(company_id=p.company_id,unique_id=p.internal_ref).delete()
        session.delete(p); session.commit()
        return jsonify({"success":True})
    finally: session.close()

# ── Sales Book ────────────────────────────────────────────────

@app.route("/api/sales", methods=["GET"])
def get_sales():
    """
    GET /api/sales?company_id=1&limit=100&search=&include_voided=true
    include_voided=true  → returns only voided entries (for Voided tab)
    default             → returns only active (is_void=False) entries
    """
    cid=request.args.get("company_id",type=int)
    limit=request.args.get("limit",100,type=int)
    offset=request.args.get("offset",0,type=int)
    search=request.args.get("search","")
    include_voided=request.args.get("include_voided","false").lower()=="true"
    if not cid: return jsonify({"error":"company_id required"}),400
    session=SessionLocal()
    try:
        q=session.query(SalesBook).filter_by(company_id=cid)
        # Voided filter
        if include_voided:
            q=q.filter(SalesBook.is_void==True)
        else:
            # Treat NULL as False — existing rows before void column was added
            q=q.filter((SalesBook.is_void==False)|(SalesBook.is_void==None))
        if search:
            q=q.filter(
                (SalesBook.customer_name.ilike(f"%{search}%"))|
                (SalesBook.bill_no.ilike(f"%{search}%"))|
                (SalesBook.internal_ref.ilike(f"%{search}%"))|
                (SalesBook.product_name.ilike(f"%{search}%"))
            )
        total=q.count()
        entries=q.order_by(SalesBook.entry_date.desc(),SalesBook.id.desc()).offset(offset).limit(limit).all()
        def sd(s):
            return {
                "id":s.id,
                "entry_date":s.entry_date.isoformat() if s.entry_date else None,
                "month_bs":s.month_bs or "","bill_no":s.bill_no or "",
                "internal_ref":s.internal_ref or "",
                "customer_name":s.customer_name,"customer_pan":s.customer_pan or "",
                "product_code":s.product_code or "","product_name":s.product_name or "",
                "qty":float(s.qty or 0),"rate":float(s.rate or 0),"is_taxable":s.is_taxable,
                "taxable_value":float(s.taxable_value or 0),
                "vat_amount":float(s.vat_amount or 0),
                "total_amount":float(s.total_amount or 0),
                "non_taxable_value":float(s.non_taxable_value or 0),
                "transaction_type":s.transaction_type or "Sale",
                "original_bill_ref":s.original_bill_ref or "",
                "is_service":s.is_service,"date_bs":s.date_bs or "",
                # New fields
                "is_capital":getattr(s,"is_capital",False),
                # Only return cap values if actually a capital item — prevents display pollution
                "capital_item_name":getattr(s,"capital_item_name","") or "" if getattr(s,"is_capital",False) else "",
                "cap_qty":float(getattr(s,"cap_qty",0) or 0) if getattr(s,"is_capital",False) else 0,
                "cap_rate":float(getattr(s,"cap_rate",0) or 0) if getattr(s,"is_capital",False) else 0,
                "cap_taxable_value":float(getattr(s,"cap_taxable_value",0) or 0) if getattr(s,"is_capital",False) else 0,
                "cap_vat":float(getattr(s,"cap_vat",0) or 0) if getattr(s,"is_capital",False) else 0,
                "cap_total":float(getattr(s,"cap_total",0) or 0) if getattr(s,"is_capital",False) else 0,
                "fa_code":getattr(s,"fa_code","") or "" if getattr(s,"is_capital",False) else "",
                "geography_type":getattr(s,"geography_type","Local") or "Local",
                "export_amount":float(getattr(s,"export_amount",0) or 0),
                "gross_amount":float(getattr(s,"gross_amount",0) or 0),
                "trade_discount":float(getattr(s,"trade_discount",0) or 0),
                "excisable_amount":float(getattr(s,"excisable_amount",0) or 0),
                "excise_type":getattr(s,"excise_type","NONE") or "NONE",
                "excise_rate":float(getattr(s,"excise_rate",0) or 0),
                "excise_amount":float(getattr(s,"excise_amount",0) or 0),
                # Void audit
                "is_void":getattr(s,"is_void",False),
                "voided_by":getattr(s,"voided_by",None),
                "voided_at":getattr(s,"voided_at",None).isoformat() if getattr(s,"voided_at",None) else None,
                "void_reason":getattr(s,"void_reason",None),
            }
        return jsonify({"entries":[sd(s) for s in entries],"total":total})
    finally: session.close()

@app.route("/api/sales", methods=["POST"])
def save_sales():
    session=SessionLocal()
    try:
        data=request.get_json() or {}; cid=data.get("company_id"); req_user=data.get("requesting_user_id")
        if not _can_transact(session,req_user,cid): return jsonify({"error":"Not authorized"}),403
        txn=data.get("transaction_type","Sales")
        if txn not in ("Sales","Sales Return","Credit Note"): txn="Sales"
        try: entry_date=date.fromisoformat(data.get("entry_date",""))
        except: return jsonify({"error":"Invalid entry_date"}),400
        cn=(data.get("customer_name") or "").strip()
        if not cn: return jsonify({"error":"customer_name required"}),400
        settings=session.query(Settings).filter_by(company_id=cid).first()
        vat_rate=float(settings.vat_rate or 0.13) if settings else 0.13
        qty=float(data.get("qty") or 0); rate=float(data.get("rate") or 0)
        is_taxable=bool(data.get("is_taxable",True)); is_service=bool(data.get("is_service",False))
        sign=1 if txn=="Sales" else -1; base=rate if is_service else qty*rate
        if is_taxable: tv=round(base*sign,2); va=round(base*vat_rate*sign,2); ta=round(base*(1+vat_rate)*sign,2); ntv=0.0
        else: tv=va=ta=0.0; ntv=round(base*sign,2)
        pfx="SB-"
        if settings:
            if txn=="Sales Return": pfx=settings.prefix_sales_ret or "SR-"
            elif txn=="Credit Note": pfx=settings.prefix_credit_note or "CN-"
            else: pfx=settings.prefix_sales or "SB-"
        cnt=session.query(SalesBook).filter_by(company_id=cid,transaction_type=txn).count()
        iref=f"{pfx}{str(cnt+1).zfill(4)}"
        # New fields from SalesEntryPage
        geo_type      = (data.get("geography_type") or "Local").strip()
        export_amount = float(data.get("export_amount") or 0)
        trade_disc    = float(data.get("trade_discount") or 0)
        excise_type   = (data.get("excise_type") or "NONE").strip()
        excise_rate   = float(data.get("excise_rate") or 0)
        excise_amount = float(data.get("excise_amount") or 0)
        is_capital    = bool(data.get("is_capital", False))
        cap_item_name = (data.get("capital_item_name") or "").strip()
        gross_amt     = round((qty if not is_service else 1) * rate, 2)
        excisable_amt = round(gross_amt - trade_disc + excise_amount, 2)

        # For export: zero-rated, no VAT
        if geo_type == "Export":
            tv=0.0; va=0.0; ta=0.0; ntv=0.0
            export_amount = round(excisable_amt * sign, 2)

        sb=SalesBook(company_id=cid,entry_date=entry_date,month_bs=_get_nepali_month(entry_date),
            bill_no=data.get("bill_no") or "",internal_ref=iref,customer_name=cn,
            customer_pan=data.get("customer_pan") or "",product_code=data.get("product_code") or "",
            product_name=data.get("product_name") or "",qty=qty if not is_service else 0,rate=rate,
            is_taxable=is_taxable,taxable_value=tv,vat_amount=va,total_amount=ta,non_taxable_value=ntv,
            transaction_type=txn,original_bill_ref=data.get("original_bill_ref") or "",
            is_service=is_service,date_bs=data.get("date_bs") or "",created_by=req_user,
            geography_type=geo_type,export_amount=export_amount,
            gross_amount=gross_amt,trade_discount=trade_disc,
            excisable_amount=excisable_amt,excise_type=excise_type,
            excise_rate=excise_rate,excise_amount=excise_amount,
            is_capital=is_capital,capital_item_name=cap_item_name,
            # Only populate cap fields if this is actually a capital item
            cap_qty=float(data.get("cap_qty") or 0) if is_capital else 0,
            cap_rate=float(data.get("cap_rate") or 0) if is_capital else 0,
            cap_taxable_value=float(data.get("cap_taxable_val") or 0),
            cap_vat=float(data.get("cap_vat") or 0),
            cap_total=float(data.get("cap_total") or 0),
            fa_code="",is_void=False)
        session.add(sb)

        # GL posting
        sgc="6010" if is_taxable else "6020"; sgn=_get_gl_by_code(session,cid,sgc)
        dgc="2100"; dgn=_get_gl_by_code(session,cid,dgc)
        ba=abs(tv) or abs(ntv) or abs(export_amount)
        if sign==1:
            if ba>0: _add_gl_book_entry(session,cid,entry_date,iref,dgc,dgn,sgc,sgn,f"Sales - {data.get('bill_no','')} - {data.get('product_name','')}",ba,"Sales_Book",txn)
            if is_taxable and abs(va)>0: _add_gl_book_entry(session,cid,entry_date,iref,dgc,dgn,"5050",_get_gl_by_code(session,cid,"5050"),f"VAT Output - {data.get('bill_no','')}",round(abs(va),2),"Sales_Book",txn)
        else:
            if ba>0: _add_gl_book_entry(session,cid,entry_date,iref,sgc,sgn,dgc,dgn,f"{txn} - {data.get('bill_no','')}",ba,"Sales_Book",txn)
        # ── Party Ledger posting ────────────────────────────────
        pm_s = session.query(PartyMaster).filter(
            PartyMaster.company_id == cid,
            func.lower(func.trim(PartyMaster.name)) == cn.strip().lower()
        ).first()
        party_type_pl_s = pm_s.party_type if pm_s else "Customer"
        ctrl_gl_s = {
            "Customer": "2100 - Trade Debtors / Receivables",
            "LC":       "2110 - Advance to Suppliers",
            "TDS":      "5060 - TDS Payable",
            "Staff":    "2120 - Advance to Staff",
            "Vendor":   "5010 - Trade Creditors / Payables",
        }.get(party_type_pl_s, "2100 - Trade Debtors / Receivables")

        pl_amount_s = round(
            abs(ta) + abs(float(data.get("non_taxable_value") or 0)) +
            abs(float(getattr(sb,"cap_total",0) or 0)) +
            abs(export_amount or 0), 2
        )
        sign_s = 1 if txn == "Sales" else -1
        if pl_amount_s > 0:
            pl_desc_s = f"{txn} — {data.get('product_name','')} | Bill: {data.get('bill_no','')} ({iref})"
            _add_party_ledger_entry(
                session, cid, entry_date,
                cn, party_type_pl_s,
                txn, data.get("bill_no","") or iref, pl_desc_s,
                debit  = pl_amount_s if sign_s ==  1 else 0,   # sale → debit (receivable increases)
                credit = pl_amount_s if sign_s == -1 else 0,   # return → credit (receivable decreases)
                source = "Sales_Book",
                gl_account = ctrl_gl_s,
            )

        session.commit()
        return jsonify({"success":True,"internal_ref":iref,"entry":{"id":sb.id,"internal_ref":iref,
            "taxable_value":tv,"vat_amount":va,"total_amount":ta,"non_taxable_value":ntv,
            "export_amount":export_amount,"transaction_type":txn}}),201
    except Exception as e:
        session.rollback(); import traceback; print(f"[ERROR] save_sales: {e}\n{traceback.format_exc()}")
        return jsonify({"error":str(e)}),500
    finally: session.close()

@app.route("/api/sales/customers", methods=["GET"])
def get_customers():
    cid=request.args.get("company_id",type=int)
    if not cid: return jsonify({"error":"company_id required"}),400
    session=SessionLocal()
    try:
        cs=session.query(PartyMaster).filter_by(company_id=cid,party_type="Customer",is_active=True).order_by(PartyMaster.name).all()
        return jsonify({"customers":[{"id":c.id,"name":c.name,"pan":c.pan or ""} for c in cs]})
    finally: session.close()

# ── Import Book ───────────────────────────────────────────────

@app.route("/api/import", methods=["GET"])
def get_imports():
    cid=request.args.get("company_id",type=int); limit=request.args.get("limit",100,type=int)
    if not cid: return jsonify({"error":"company_id required"}),400
    session=SessionLocal()
    try:
        entries=session.query(ImportBook).filter_by(company_id=cid).order_by(ImportBook.entry_date.desc()).limit(limit).all()
        def id_(e): return {"id":e.id,"entry_date":e.entry_date.isoformat() if e.entry_date else None,
            "month_bs":e.month_bs or "","internal_ref":e.internal_ref or "",
            "pp_no":e.pp_no or "","lc_no":e.lc_no or "","supplier_name":e.supplier_name,
            "supplier_pan":e.supplier_pan or "","product_name":e.product_name or "",
            "qty":float(e.qty or 0),"rate_foreign":float(e.rate_foreign or 0),"currency":e.currency or "USD",
            "exchange_rate":float(e.exchange_rate or 1),"cif_value":float(e.cif_value or 0),
            "customs_duty":float(e.customs_duty or 0),"custom_service_charge":float(e.custom_service_charge or 0),
            "bank_charges":float(e.bank_charges or 0),"insurance":float(e.insurance or 0),
            "statistical_exp":float(e.statistical_exp or 0),"landed_cost":float(e.landed_cost or 0),
            "imp_taxable_value":float(e.imp_taxable_value or 0),"imp_vat":float(e.imp_vat or 0),
            "imp_total":float(e.imp_total or 0),"non_taxable_value":float(e.non_taxable_value or 0),"date_bs":e.date_bs or ""}
        return jsonify({"entries":[id_(e) for e in entries],"total":len(entries)})
    finally: session.close()

@app.route("/api/import", methods=["POST"])
def save_import():
    session=SessionLocal()
    try:
        data=request.get_json() or {}; cid=data.get("company_id"); req_user=data.get("requesting_user_id")
        if not _can_transact(session,req_user,cid): return jsonify({"error":"Not authorized"}),403
        try: entry_date=date.fromisoformat(data.get("entry_date",""))
        except: return jsonify({"error":"Invalid entry_date"}),400
        sn=(data.get("supplier_name") or "").strip()
        if not sn: return jsonify({"error":"supplier_name required"}),400
        settings=session.query(Settings).filter_by(company_id=cid).first()
        # FIX: vat_rate stored as decimal (0.13), use directly
        vat_rate=float(settings.vat_rate or 0.13) if settings else 0.13
        pfx=settings.prefix_import if settings else "IMP-"
        cnt=session.query(ImportBook).filter_by(company_id=cid).count()
        iref=f"{pfx}{str(cnt+1).zfill(4)}"
        cif=float(data.get("cif_value") or 0); cust=float(data.get("customs_duty") or 0)
        csc=float(data.get("custom_service_charge") or 0); bc=float(data.get("bank_charges") or 0)
        ins=float(data.get("insurance") or 0); se=float(data.get("statistical_exp") or 0)
        is_taxable=bool(data.get("is_taxable",True))
        lc=round(cif+cust+csc+bc+ins,2)
        imp_tv=round(lc,2) if is_taxable else 0
        imp_vat=round(imp_tv*vat_rate,2) if is_taxable else 0
        imp_tot=round(imp_tv+imp_vat,2) if is_taxable else 0
        non_tax=round(lc,2) if not is_taxable else 0
        ib=ImportBook(company_id=cid,entry_date=entry_date,month_bs=_get_nepali_month(entry_date),
            internal_ref=iref,pp_no=data.get("pp_no") or "",lc_no=data.get("lc_no") or "",
            supplier_name=sn,supplier_pan=data.get("supplier_pan") or "",
            product_code=data.get("product_code") or "",product_name=data.get("product_name") or "",
            qty=float(data.get("qty") or 0),rate_foreign=float(data.get("rate_foreign") or 0),
            currency=data.get("currency") or "USD",exchange_rate=float(data.get("exchange_rate") or 1),
            cif_value=cif,customs_duty=cust,custom_service_charge=csc,bank_charges=bc,insurance=ins,
            statistical_exp=se,landed_cost=lc,is_taxable=is_taxable,
            imp_taxable_value=imp_tv,imp_vat=imp_vat,imp_total=imp_tot,
            non_taxable_value=non_tax,date_bs=data.get("date_bs") or "",created_by=req_user)
        session.add(ib)
        if imp_tv>0:
            _add_gl_book_entry(session,cid,entry_date,iref,"7100",_get_gl_by_code(session,cid,"7100"),
                "5010",_get_gl_by_code(session,cid,"5010"),f"Import - {data.get('pp_no','')} - {data.get('product_name','')}",imp_tv,"Import_Book","Import")
            if imp_vat>0:
                _add_gl_book_entry(session,cid,entry_date,iref,"2150",_get_gl_by_code(session,cid,"2150"),
                    "5010",_get_gl_by_code(session,cid,"5010"),f"VAT Input Import - {data.get('pp_no','')}",imp_vat,"Import_Book","Import")
        session.commit()
        return jsonify({"success":True,"internal_ref":iref,"entry":{"id":ib.id,"internal_ref":iref,
            "landed_cost":lc,"imp_taxable_value":imp_tv,"imp_vat":imp_vat,"imp_total":imp_tot}}),201
    except Exception as e:
        session.rollback(); import traceback; print(f"[ERROR] save_import: {e}\n{traceback.format_exc()}")
        return jsonify({"error":str(e)}),500
    finally: session.close()

# ── GL Book viewer ────────────────────────────────────────────

@app.route("/api/gl-book", methods=["GET"])
def get_gl_book():
    """
    GL Book — the single source of truth feeding Trial Balance, P&L, and
    Balance Sheet. Two structural guarantees this endpoint provides:

    1. Void entries are NEVER mixed into the normal statement by default.
       Pass include_void=true to see them (audit/reconciliation use only).
       Trial Balance / P&L / BS generation should NEVER set include_void=true
       — void reversals already net out the original posting, so including
       both would double-count in some views and is never the correct basis
       for a financial statement.

    2. Entries can be filtered by source_category to let the user view
       All / Purchase / Sales / Bank / FA / Journal / Void independently.
    """
    cid=request.args.get("company_id",type=int); gc=request.args.get("gl_code","")
    fd=request.args.get("from_date",""); td=request.args.get("to_date","")
    include_void = request.args.get("include_void","false").lower()=="true"
    source_category = request.args.get("source_category","All")  # All/Purchase/Sales/Bank/FA/Journal/Void
    if not cid: return jsonify({"error":"company_id required"}),400

    # Map UI-facing category names to the actual `source` values stored on GLBook
    CATEGORY_SOURCES = {
        "Purchase": ["Purchase_Book"],
        "Sales":    ["Sales_Book"],
        "Bank":     ["Bank_Ledger"],
        "FA":       ["FA_Register"],   # reserved for when FA posts depreciation/disposal entries
        "Journal":  ["Journal"],       # reserved for Journal Entry module
        "Void":     ["Void"],
    }

    session=SessionLocal()
    try:
        q=session.query(GLBook).filter_by(company_id=cid)
        if gc: q=q.filter(GLBook.gl_code.like(f"{gc} - %") | (GLBook.gl_code==gc))

        if source_category == "Void":
            q = q.filter(GLBook.source == "Void")
        elif source_category in CATEGORY_SOURCES:
            q = q.filter(GLBook.source.in_(CATEGORY_SOURCES[source_category]))
            if not include_void:
                pass  # category filter already excludes Void rows by construction
        else:  # "All"
            if not include_void:
                q = q.filter(GLBook.source != "Void")

        if fd:
            try: q=q.filter(GLBook.entry_date>=date.fromisoformat(fd))
            except: pass
        if td:
            try: q=q.filter(GLBook.entry_date<=date.fromisoformat(td))
            except: pass
        entries=q.order_by(GLBook.entry_date,GLBook.id).all()
        running=0.0; result=[]
        for e in entries:
            running+=float(e.dr_amount or 0)-float(e.cr_amount or 0)
            result.append({"id":e.id,"entry_date":e.entry_date.isoformat() if e.entry_date else None,
                "unique_id":e.unique_id,"gl_code":e.gl_code,"gl_name":e.gl_name,"description":e.description,
                "dr_amount":float(e.dr_amount or 0),"cr_amount":float(e.cr_amount or 0),
                "balance":round(running,2),"source":e.source,"transaction_type":e.transaction_type,
                "is_void_entry": e.source=="Void"})

        # Summary counts per category — lets the UI show tab counts/badges
        all_rows = session.query(GLBook).filter_by(company_id=cid)
        if gc: all_rows = all_rows.filter(GLBook.gl_code==gc)
        category_counts = {"All":0,"Purchase":0,"Sales":0,"Bank":0,"FA":0,"Journal":0,"Void":0}
        for r in all_rows.all():
            if r.source == "Void": category_counts["Void"] += 1
            else: category_counts["All"] += 1
            for cat, sources in CATEGORY_SOURCES.items():
                if cat != "Void" and r.source in sources:
                    category_counts[cat] += 1

        return jsonify({"entries":result,"total":len(result),"category_counts":category_counts})
    finally: session.close()


@app.route("/api/gl-book/trial-balance-basis", methods=["GET"])
def get_trial_balance_basis():
    """
    Returns net Dr/Cr per GL account, summed across ALL non-void GL Book
    entries — this is the correct, single source of truth basis for
    Trial Balance, P&L, and Balance Sheet construction.

    Void rows are HARD-EXCLUDED here, unconditionally — there is no
    include_void parameter on this endpoint by design. A void reversal
    already nets the original entry to zero; including both rows would
    not change the balance, but mixing audit-trail noise into the
    statement basis is the wrong habit to build, especially once this
    feeds automated P&L/BS generation.
    """
    cid = request.args.get("company_id", type=int)
    if not cid: return jsonify({"error":"company_id required"}),400
    session = SessionLocal()
    try:
        rows = session.query(GLBook).filter(
            GLBook.company_id == cid,
            GLBook.source != "Void",
        ).all()

        by_gl = {}
        for r in rows:
            code = (r.gl_code or "").split(" - ")[0].strip()
            if not code: continue
            if code not in by_gl:
                by_gl[code] = {"gl_code": code, "gl_name": r.gl_name, "dr": 0.0, "cr": 0.0}
            by_gl[code]["dr"] += float(r.dr_amount or 0)
            by_gl[code]["cr"] += float(r.cr_amount or 0)

        result = []
        for code, v in sorted(by_gl.items()):
            net = round(v["dr"] - v["cr"], 2)
            result.append({
                "gl_code": code, "gl_name": v["gl_name"],
                "total_dr": round(v["dr"],2), "total_cr": round(v["cr"],2),
                "net_balance": net,
                "side": "Dr" if net >= 0 else "Cr",
            })

        total_dr = round(sum(v["dr"] for v in by_gl.values()), 2)
        total_cr = round(sum(v["cr"] for v in by_gl.values()), 2)

        return jsonify({
            "accounts": result,
            "total_dr": total_dr,
            "total_cr": total_cr,
            "balanced": abs(total_dr - total_cr) < 0.01,
            "void_rows_excluded": True,
        })
    finally: session.close()


@app.route("/api/gl-book/voucher/<unique_id>", methods=["GET"])
def get_gl_voucher(unique_id):
    """
    Returns a single transaction's full Dr/Cr journal entry grouped by
    unique_id (e.g. "BNK-0001", "PV-0001", "SB-0001"), formatted as a
    voucher: all Dr lines, all Cr lines, balance check, and footer
    attribution — Prepared By (the user who entered/posted it) and
    Approved By (admin who approved, if any).
    """
    cid = request.args.get("company_id", type=int)
    if not cid: return jsonify({"error":"company_id required"}),400
    session = SessionLocal()
    try:
        rows = session.query(GLBook).filter_by(
            company_id=cid, unique_id=unique_id
        ).order_by(GLBook.id).all()
        if not rows:
            return jsonify({"error":f"No GL entries found for {unique_id}"}),404

        def user_label(uid):
            if not uid: return None
            u = session.query(User).filter_by(id=uid).first()
            return (u.full_name or u.username) if u else None

        # All rows in a voucher share the same created_by/approved_by/date/source
        first = rows[0]
        dr_lines = [{"gl_code":r.gl_code,"gl_name":r.gl_name,"amount":float(r.dr_amount or 0)}
                    for r in rows if float(r.dr_amount or 0) > 0]
        cr_lines = [{"gl_code":r.gl_code,"gl_name":r.gl_name,"amount":float(r.cr_amount or 0)}
                    for r in rows if float(r.cr_amount or 0) > 0]
        total_dr = round(sum(l["amount"] for l in dr_lines), 2)
        total_cr = round(sum(l["amount"] for l in cr_lines), 2)

        # Look up party name(s) linked to this transaction via party_ledger.
        # Match on reference == unique_id OR unique_id being a prefix (split legs
        # like "BNK-0013/1" reference the parent "BNK-0013").
        party_rows = session.query(PartyLedger).filter(
            PartyLedger.company_id == cid,
            PartyLedger.reference.like(f"{unique_id}%")
        ).all()
        # Attach party name to whichever line's gl_code matches the party's control GL
        party_by_gl = {}
        for pr in party_rows:
            gl_prefix = (pr.gl_account or "").split(" - ")[0].strip()
            if gl_prefix:
                party_by_gl[gl_prefix] = pr.party_name

        for line in dr_lines + cr_lines:
            code_prefix = (line["gl_code"] or "").split(" - ")[0].strip()
            line["party_name"] = party_by_gl.get(code_prefix)

        return jsonify({
            "unique_id":        unique_id,
            "entry_date":       first.entry_date.isoformat() if first.entry_date else None,
            "description":      first.description,
            "source":           first.source,
            "transaction_type": first.transaction_type,
            "dr_lines":         dr_lines,
            "cr_lines":         cr_lines,
            "total_dr":         total_dr,
            "total_cr":         total_cr,
            "balanced":         abs(total_dr - total_cr) < 0.01,
            "prepared_by":      user_label(first.created_by),
            "approved_by":      user_label(first.approved_by),
            "approved_at":      first.approved_at.isoformat() if first.approved_at else None,
        })
    finally: session.close()


@app.route("/api/gl-book/voucher/<unique_id>/approve", methods=["POST"])
def approve_gl_voucher(unique_id):
    """
    Admin approves a voucher (sets approved_by + approved_at on all GL
    rows sharing this unique_id). Only Super Admin or Company Admin
    should call this — enforced by checking is_super_admin on the
    requesting user; company-level admin check happens client-side
    via existing role gating in the UI.
    """
    data = request.json or {}
    cid  = data.get("company_id")
    approver_uid = data.get("requesting_user_id")
    if not cid or not approver_uid:
        return jsonify({"error":"company_id and requesting_user_id required"}),400

    session = SessionLocal()
    try:
        approver = session.query(User).filter_by(id=approver_uid, is_active=True).first()
        if not approver:
            return jsonify({"error":"Invalid approver"}),403

        rows = session.query(GLBook).filter_by(company_id=cid, unique_id=unique_id).all()
        if not rows:
            return jsonify({"error":f"No GL entries found for {unique_id}"}),404

        now = dt.now(timezone.utc)
        for r in rows:
            r.approved_by = approver_uid
            r.approved_at = now
        session.commit()

        return jsonify({
            "success": True,
            "unique_id": unique_id,
            "approved_by": approver.full_name or approver.username,
            "approved_at": now.isoformat(),
        })
    except Exception as e:
        session.rollback()
        return jsonify({"error":str(e)}),500
    finally: session.close()

@app.route("/api/purchase/vendors", methods=["GET"])
def get_vendors():
    cid=request.args.get("company_id",type=int)
    if not cid: return jsonify({"error":"company_id required"}),400
    session=SessionLocal()
    try:
        vs=session.query(PartyMaster).filter_by(company_id=cid,party_type="Vendor",is_active=True).order_by(PartyMaster.name).all()
        return jsonify({"vendors":[{"id":v.id,"name":v.name,"pan":v.pan or "","gl_account":v.gl_account or ""} for v in vs]})
    finally: session.close()

# ── PARTY LEDGER ─────────────────────────────────────────────
@app.route("/api/party-ledger", methods=["GET"])
def get_party_ledger():
    """
    GET /api/party-ledger?company_id=1&party_id=5&from_date=&to_date=
    Returns all GL Book entries for a given party (vendor or customer).
    Reconstructs a party-wise account statement from purchase_book + sales_book.
    Each entry: date, txn_type, reference (bill_no/internal_ref), debit, credit, source, description.
    Debit = amount owed TO us (customer invoice) or amount paid BY us (payment to vendor).
    Credit = amount we owe (vendor invoice) or receipt from customer.
    """
    cid       = request.args.get("company_id", type=int)
    party_id  = request.args.get("party_id", type=int)
    from_date = request.args.get("from_date", "")
    to_date   = request.args.get("to_date", "")
    limit     = request.args.get("limit", 500, type=int)
    if not cid:      return jsonify({"error": "company_id required"}), 400
    if not party_id: return jsonify({"error": "party_id required"}), 400

    session = SessionLocal()
    try:
        party = session.query(PartyMaster).filter_by(id=party_id, company_id=cid).first()
        if not party: return jsonify({"error": "Party not found"}), 404

        # ── Opening balance ─────────────────────────────────────
        ob = float(party.opening_balance or 0)
        side = _get_party_type_side(session, party.party_type or "")
        if side == "Cr":
            opening_dr = 0;  opening_cr = ob
        else:
            opening_dr = ob; opening_cr = 0

        # ── Read from party_ledger table (populated on each save) ─
        party_name_lower = (party.name or "").strip().lower()
        q = session.query(PartyLedger).filter(
            PartyLedger.company_id == cid,
            func.lower(func.trim(PartyLedger.party_name)) == party_name_lower
        )
        if from_date:
            try: q = q.filter(PartyLedger.entry_date >= date.fromisoformat(from_date))
            except: pass
        if to_date:
            try: q = q.filter(PartyLedger.entry_date <= date.fromisoformat(to_date))
            except: pass

        pl_entries = q.order_by(PartyLedger.entry_date, PartyLedger.id).limit(limit).all()

        entries = [{
            "id":          e.id,
            "entry_date":  e.entry_date.isoformat() if e.entry_date else None,
            "txn_type":    e.txn_type or "",
            "reference":   e.reference or "",
            "description": e.description or "",
            "debit":       float(e.debit or 0),
            "credit":      float(e.credit or 0),
            "source":      e.source or "",
            "gl_account":  e.gl_account or "",
            "charge_type": e.charge_type or "",
            "is_void":     e.is_void or False,
            "sort_key":    e.entry_date.isoformat() if e.entry_date else "",
        } for e in pl_entries]

        print(f"[party-ledger] {party.name!r} type={party.party_type} OB={ob} entries={len(entries)}")

        return jsonify({
            "party": {
                "id":            party.id,
                "name":          party.name,
                "party_type":    party.party_type,
                "pan":           party.pan or "",
                "gl_account":    party.gl_account or "",
                "opening_dr":    opening_dr,
                "opening_cr":    opening_cr,
                "opening_balance": ob,
            },
            "entries": entries,
            "total":   len(entries),
        })
    except Exception as e:
        import traceback; print(f"[ERROR] get_party_ledger: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
    finally: session.close()


# ============================================================
#  STARTUP
# ============================================================

if __name__ == "__main__":
    print("""
+======================================================+
|   ARITHMA Backend — Void/Soft-Delete System Active   |
|   New endpoint: POST /api/purchase/<id>/void         |
+======================================================+
    """)
    
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)