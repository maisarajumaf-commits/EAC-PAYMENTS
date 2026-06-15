import { useState, useEffect, useRef } from "react";

// ─── Mock Data (mirrors DB schema) ───────────────────────────────────────────
const CUSTOMER = {
  id: "a1b2c3d4-0001",
  first_name: "Amara",
  last_name: "Osei",
  email: "amara.osei@example.com",
  country_code: "KE",
  wallet_address: "0x3f2a9c1b7D4e8F2A1c3b5D7E9F1a2c4B6D8E0f2A",
  kyc_status: "APPROVED",
  mnemonic_confirmed: true,
};

const TOKENS = [
  { symbol: "EAC-USD", name: "EAC Dollar",      balance: 1284.50,  decimals: 6, color: "#D4A017", icon: "◈" },
  { symbol: "MATIC",   name: "Polygon MATIC",   balance: 4.2182,   decimals: 18, color: "#8247E5", icon: "⬡" },
  { symbol: "USDC",    name: "USD Coin",         balance: 320.00,   decimals: 6, color: "#2775CA", icon: "◎" },
];

const EAC_CURRENCIES = [
  { code: "KES", name: "Kenyan Shilling",      flag: "🇰🇪", symbol: "KSh"  },
  { code: "TZS", name: "Tanzanian Shilling",   flag: "🇹🇿", symbol: "TSh"  },
  { code: "UGX", name: "Ugandan Shilling",     flag: "🇺🇬", symbol: "USh"  },
  { code: "RWF", name: "Rwandan Franc",        flag: "🇷🇼", symbol: "RF"   },
  { code: "BIF", name: "Burundian Franc",      flag: "🇧🇮", symbol: "FBu"  },
  { code: "SSP", name: "South Sudanese Pound", flag: "🇸🇸", symbol: "SSP"  },
  { code: "CDF", name: "Congolese Franc",      flag: "🇨🇩", symbol: "FC"   },
  { code: "SOS", name: "Somali Shilling",      flag: "🇸🇴", symbol: "SOS"  },
];

const FX_RATES = {
  "KES/TZS": 22.84, "KES/UGX": 28.31, "KES/RWF": 8.94,
  "KES/BIF": 19.72, "KES/SSP": 0.562, "KES/CDF": 184.5,
  "KES/SOS": 311.8, "TZS/UGX": 1.24,  "UGX/RWF": 0.316,
};

const BANKS = [
  { name: "Equity Bank Kenya",    swift: "EQBLKENA", country: "KE", flag: "🇰🇪" },
  { name: "KCB Group",            swift: "KCBLKENX", country: "KE", flag: "🇰🇪" },
  { name: "CRDB Bank Tanzania",   swift: "CORUTZTZ", country: "TZ", flag: "🇹🇿" },
  { name: "Stanbic Uganda",       swift: "SBICUGKA", country: "UG", flag: "🇺🇬" },
  { name: "Bank of Kigali",       swift: "BKIGRWRW", country: "RW", flag: "🇷🇼" },
  { name: "NMB Bank Tanzania",    swift: "NMIBTZTZ", country: "TZ", flag: "🇹🇿" },
];

const TRANSACTIONS = [
  { id: "txn-001", reference: "EAC-20260601-A3F2", status: "CONFIRMED", smart_contract_status: "ON_CHAIN",
    source_currency: "KES", dest_currency: "TZS", source_amount: 50000, dest_amount: 1137150,
    fx_rate: 22.743, fee_amount: 400, receiver_name: "Fatuma Hassan", receiver_bank: "CRDB Bank",
    on_chain_tx_hash: "0x3f2a9c1b7d4e8f2a1c3b5d7e9f1a2c4b6d8e0f2a4c6b8d0e2f4a6c8b0d2e4f6a",
    block_number: 104825, narration: "School fees payment", initiated_at: "2026-06-08T10:00:00Z", confirmed_at: "2026-06-08T10:00:55Z" },
  { id: "txn-002", reference: "EAC-20260607-B8D1", status: "CONFIRMED", smart_contract_status: "ON_CHAIN",
    source_currency: "KES", dest_currency: "UGX", source_amount: 25000, dest_amount: 707750,
    fx_rate: 28.31, fee_amount: 200, receiver_name: "Grace Nakato", receiver_bank: "Stanbic Uganda",
    on_chain_tx_hash: "0x8d1c4f7e2a9b3c5d1f6e8a0b2c4d6f8a0b2c4d6f8a0b2c4d6f8a0b2c4d6f8a0b",
    block_number: 104791, narration: "Business payment", initiated_at: "2026-06-07T14:22:00Z", confirmed_at: "2026-06-07T14:22:48Z" },
  { id: "txn-003", reference: "EAC-20260605-C1E9", status: "CONFIRMED", smart_contract_status: "ON_CHAIN",
    source_currency: "KES", dest_currency: "RWF", source_amount: 10000, dest_amount: 89400,
    fx_rate: 8.94, fee_amount: 80, receiver_name: "Ibrahim Mugenyi", receiver_bank: "Bank of Kigali",
    on_chain_tx_hash: "0x1b9f2a3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a",
    block_number: 104612, narration: "Family support", initiated_at: "2026-06-05T09:15:00Z", confirmed_at: "2026-06-05T09:16:02Z" },
  { id: "txn-004", reference: "EAC-20260603-D4F7", status: "PENDING", smart_contract_status: "SUBMITTED",
    source_currency: "KES", dest_currency: "TZS", source_amount: 15000, dest_amount: 341850,
    fx_rate: 22.79, fee_amount: 120, receiver_name: "Emmanuel Nkurunziza", receiver_bank: "CRDB Bank",
    on_chain_tx_hash: null, block_number: null, narration: "Medical expenses",
    initiated_at: "2026-06-03T16:40:00Z", confirmed_at: null },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function shortAddr(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}
function formatAmount(n, currency) {
  if (n >= 1000000) return `${(n/1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n/1000).toFixed(1)}K`;
  return n.toLocaleString("en-KE", { maximumFractionDigits: 2 });
}
function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,700;0,9..144,900;1,9..144,400&family=Outfit:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --emerald:       #1B4332;
    --emerald-mid:   #2D6A4F;
    --emerald-light: #40916C;
    --emerald-pale:  #95D5B2;
    --gold:          #D4A017;
    --gold-light:    #F2C94C;
    --sunset:        #E76F51;
    --cream:         #FAF7F0;
    --ink:           #0D1F17;
    --ink2:          #0A1A12;
    --mist:          rgba(255,255,255,0.06);
    --border:        rgba(255,255,255,0.09);
    --border-hi:     rgba(255,255,255,0.16);
    --text-dim:      rgba(250,247,240,0.45);
    --text-mid:      rgba(250,247,240,0.7);
    --radius:        14px;
    --shadow:        0 8px 32px rgba(0,0,0,0.4);
  }

  body {
    font-family: 'Outfit', sans-serif;
    background: var(--ink2);
    color: var(--cream);
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* Noise texture */
  body::before {
    content: '';
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
    opacity: 0.5;
  }

  .wallet-root {
    display: grid;
    grid-template-columns: 240px 1fr;
    min-height: 100vh;
    position: relative; z-index: 1;
  }

  /* ── SIDEBAR ── */
  .sidebar {
    background: rgba(13,26,18,0.95);
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column;
    padding: 0;
    position: sticky; top: 0; height: 100vh;
    overflow: hidden;
  }
  .sidebar-logo {
    display: flex; align-items: center; gap: 0.6rem;
    padding: 1.5rem 1.4rem 1.2rem;
    border-bottom: 1px solid var(--border);
  }
  .logo-mark {
    width: 34px; height: 34px;
    background: linear-gradient(135deg, var(--emerald-light), var(--gold));
    border-radius: 8px;
    display: grid; place-items: center;
    font-family: 'Fraunces', serif; font-weight: 700; font-size: 1rem; color: #fff;
    flex-shrink: 0;
  }
  .logo-text {
    font-family: 'Fraunces', serif; font-weight: 700;
    font-size: 1.2rem; color: var(--cream); letter-spacing: -0.02em;
  }
  .logo-text span { color: var(--gold); }

  .sidebar-user {
    padding: 1.2rem 1.4rem;
    border-bottom: 1px solid var(--border);
  }
  .user-avatar {
    width: 44px; height: 44px; border-radius: 50%;
    background: linear-gradient(135deg, var(--emerald-mid), var(--gold));
    display: grid; place-items: center;
    font-family: 'Fraunces', serif; font-weight: 700; font-size: 1rem; color: #fff;
    margin-bottom: 0.7rem;
    box-shadow: 0 0 0 3px rgba(212,160,23,0.25);
  }
  .user-name { font-size: 0.88rem; font-weight: 600; color: var(--cream); }
  .user-addr { font-size: 0.68rem; font-family: monospace; color: var(--text-dim); margin-top: 0.15rem; }
  .kyc-badge {
    display: inline-flex; align-items: center; gap: 0.3rem;
    background: rgba(82,196,26,0.12); border: 1px solid rgba(82,196,26,0.25);
    color: #52c41a; font-size: 0.65rem; font-weight: 600;
    padding: 0.15rem 0.5rem; border-radius: 20px; margin-top: 0.4rem;
  }
  .kyc-badge::before { content: '✓'; }

  .sidebar-nav { flex: 1; padding: 0.8rem 0.7rem; overflow-y: auto; }
  .nav-label {
    font-size: 0.62rem; font-weight: 600; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--text-dim);
    padding: 0.5rem 0.7rem 0.3rem; display: block;
  }
  .nav-item {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.65rem 0.8rem; border-radius: 9px;
    cursor: pointer; transition: all 0.18s;
    font-size: 0.85rem; font-weight: 400; color: var(--text-mid);
    margin-bottom: 1px; border: 1px solid transparent;
  }
  .nav-item:hover { background: var(--mist); color: var(--cream); }
  .nav-item.active {
    background: rgba(64,145,108,0.18);
    border-color: rgba(64,145,108,0.25);
    color: var(--emerald-pale); font-weight: 500;
  }
  .nav-icon { font-size: 1rem; width: 20px; text-align: center; flex-shrink: 0; }
  .nav-badge {
    margin-left: auto; background: var(--gold); color: var(--ink);
    font-size: 0.62rem; font-weight: 700; padding: 0.1rem 0.45rem;
    border-radius: 10px;
  }

  .sidebar-bottom {
    padding: 1rem 0.7rem;
    border-top: 1px solid var(--border);
  }
  .network-pill {
    display: flex; align-items: center; gap: 0.5rem;
    background: rgba(130,71,229,0.12); border: 1px solid rgba(130,71,229,0.25);
    border-radius: 8px; padding: 0.55rem 0.9rem;
    font-size: 0.75rem; color: rgba(180,150,255,0.9);
  }
  .network-dot {
    width: 6px; height: 6px; background: #52c41a; border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
    flex-shrink: 0;
  }
  @keyframes pulse {
    0%,100% { opacity: 1; box-shadow: 0 0 0 0 rgba(82,196,26,0.4); }
    50% { opacity: 0.7; box-shadow: 0 0 0 4px rgba(82,196,26,0); }
  }

  /* ── MAIN ── */
  .main {
    display: flex; flex-direction: column;
    min-height: 100vh; overflow: hidden;
  }

  .topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1.2rem 2rem;
    border-bottom: 1px solid var(--border);
    background: rgba(13,26,18,0.6);
    backdrop-filter: blur(12px);
    position: sticky; top: 0; z-index: 10;
  }
  .page-title {
    font-family: 'Fraunces', serif; font-weight: 700;
    font-size: 1.3rem; color: var(--cream); letter-spacing: -0.02em;
  }
  .page-title span { color: var(--text-dim); font-weight: 300; font-size: 1rem; margin-left: 0.5rem; }
  .topbar-actions { display: flex; align-items: center; gap: 0.7rem; }
  .icon-btn {
    width: 36px; height: 36px; border-radius: 8px;
    background: var(--mist); border: 1px solid var(--border);
    display: grid; place-items: center; cursor: pointer;
    font-size: 0.9rem; transition: all 0.2s; color: var(--text-mid);
  }
  .icon-btn:hover { background: rgba(255,255,255,0.1); color: var(--cream); }
  .notif-btn { position: relative; }
  .notif-dot {
    position: absolute; top: 6px; right: 6px;
    width: 7px; height: 7px; background: var(--gold);
    border-radius: 50%; border: 1.5px solid var(--ink2);
  }

  .content { flex: 1; padding: 1.8rem 2rem; overflow-y: auto; }

  /* ── OVERVIEW TAB ── */
  .overview-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 1.2rem;
    margin-bottom: 1.8rem;
  }

  /* Hero balance card */
  .balance-hero {
    grid-column: span 2;
    background: linear-gradient(135deg, var(--emerald) 0%, rgba(45,106,79,0.8) 100%);
    border: 1px solid rgba(64,145,108,0.35);
    border-radius: var(--radius); padding: 1.8rem;
    position: relative; overflow: hidden;
  }
  .balance-hero::before {
    content: '';
    position: absolute; top: -60px; right: -60px;
    width: 200px; height: 200px;
    background: radial-gradient(circle, rgba(212,160,23,0.18) 0%, transparent 70%);
  }
  .balance-hero::after {
    content: '';
    position: absolute; bottom: -40px; left: 40px;
    width: 150px; height: 150px;
    background: radial-gradient(circle, rgba(149,213,178,0.1) 0%, transparent 70%);
  }
  .bal-label { font-size: 0.72rem; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(149,213,178,0.7); margin-bottom: 0.4rem; }
  .bal-total {
    font-family: 'Fraunces', serif; font-weight: 900;
    font-size: 2.8rem; color: var(--cream); line-height: 1;
    letter-spacing: -0.03em; margin-bottom: 0.2rem;
    position: relative; z-index: 1;
  }
  .bal-sub { font-size: 0.8rem; color: rgba(149,213,178,0.6); position: relative; z-index: 1; }
  .bal-actions { display: flex; gap: 0.8rem; margin-top: 1.4rem; position: relative; z-index: 1; }
  .bal-btn {
    display: flex; align-items: center; gap: 0.4rem;
    padding: 0.55rem 1.1rem; border-radius: 8px;
    font-size: 0.82rem; font-weight: 600; cursor: pointer;
    transition: all 0.2s; border: none;
  }
  .bal-btn.primary { background: var(--gold); color: var(--ink); }
  .bal-btn.primary:hover { background: var(--gold-light); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(212,160,23,0.35); }
  .bal-btn.ghost { background: rgba(255,255,255,0.1); color: var(--cream); border: 1px solid rgba(255,255,255,0.15); }
  .bal-btn.ghost:hover { background: rgba(255,255,255,0.16); }

  /* Chain status mini card */
  .chain-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border); border-radius: var(--radius);
    padding: 1.5rem 1.4rem;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .chain-title { font-size: 0.7rem; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 1rem; }
  .chain-stat { margin-bottom: 0.9rem; }
  .chain-stat-val {
    font-family: 'Fraunces', serif; font-size: 1.3rem; font-weight: 700;
    color: var(--cream);
  }
  .chain-stat-label { font-size: 0.72rem; color: var(--text-dim); margin-top: 0.15rem; }
  .healthy-badge {
    display: inline-flex; align-items: center; gap: 0.35rem;
    background: rgba(82,196,26,0.12); border: 1px solid rgba(82,196,26,0.25);
    color: #52c41a; font-size: 0.7rem; font-weight: 600;
    padding: 0.25rem 0.6rem; border-radius: 20px;
  }
  .healthy-badge::before { content: '●'; font-size: 0.5rem; }

  /* Token rows */
  .tokens-section { margin-bottom: 1.8rem; }
  .section-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 1rem;
  }
  .section-title {
    font-family: 'Fraunces', serif; font-size: 1rem; font-weight: 700;
    color: var(--cream); letter-spacing: -0.01em;
  }
  .section-link { font-size: 0.78rem; color: var(--gold); cursor: pointer; }
  .token-row {
    display: flex; align-items: center; gap: 1rem;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border); border-radius: 11px;
    padding: 1rem 1.2rem; margin-bottom: 0.6rem;
    transition: all 0.2s; cursor: default;
  }
  .token-row:hover { background: rgba(255,255,255,0.055); border-color: var(--border-hi); }
  .token-icon {
    width: 38px; height: 38px; border-radius: 10px;
    display: grid; place-items: center;
    font-size: 1.1rem; flex-shrink: 0;
    border: 1px solid rgba(255,255,255,0.1);
  }
  .token-name { font-weight: 500; font-size: 0.88rem; color: var(--cream); }
  .token-full { font-size: 0.72rem; color: var(--text-dim); margin-top: 0.1rem; }
  .token-bal { margin-left: auto; text-align: right; }
  .token-bal-main { font-family: 'Fraunces', serif; font-size: 1rem; font-weight: 700; color: var(--cream); }
  .token-bal-usd { font-size: 0.72rem; color: var(--text-dim); margin-top: 0.1rem; }
  .token-change { font-size: 0.72rem; margin-left: 1rem; }
  .change-up { color: #52c41a; }
  .change-dn { color: var(--sunset); }

  /* Recent transactions */
  .tx-row {
    display: flex; align-items: center; gap: 0.9rem;
    padding: 0.9rem 1rem; border-radius: 10px;
    transition: background 0.18s; cursor: pointer;
    border: 1px solid transparent;
  }
  .tx-row:hover { background: var(--mist); border-color: var(--border); }
  .tx-icon {
    width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0;
    display: grid; place-items: center; font-size: 0.9rem;
  }
  .tx-icon.out { background: rgba(231,111,81,0.15); border: 1px solid rgba(231,111,81,0.25); }
  .tx-icon.in  { background: rgba(82,196,26,0.12);  border: 1px solid rgba(82,196,26,0.2); }
  .tx-icon.pending { background: rgba(212,160,23,0.12); border: 1px solid rgba(212,160,23,0.25); }
  .tx-to { font-size: 0.85rem; font-weight: 500; color: var(--cream); }
  .tx-meta { font-size: 0.72rem; color: var(--text-dim); margin-top: 0.15rem; }
  .tx-hash { font-family: monospace; font-size: 0.65rem; color: var(--emerald-pale); margin-top: 0.1rem; }
  .tx-amount { margin-left: auto; text-align: right; }
  .tx-amt-main { font-family: 'Fraunces', serif; font-size: 0.92rem; font-weight: 700; }
  .tx-amt-dest { font-size: 0.7rem; color: var(--text-dim); margin-top: 0.1rem; }
  .amt-out { color: var(--sunset); }
  .amt-in  { color: #52c41a; }
  .amt-pending { color: var(--gold); }
  .status-pill {
    font-size: 0.62rem; font-weight: 700; padding: 0.18rem 0.5rem;
    border-radius: 20px; text-transform: uppercase; letter-spacing: 0.05em;
    flex-shrink: 0;
  }
  .pill-confirmed { background: rgba(82,196,26,0.15); color: #52c41a; border: 1px solid rgba(82,196,26,0.25); }
  .pill-pending   { background: rgba(212,160,23,0.15); color: var(--gold); border: 1px solid rgba(212,160,23,0.25); }
  .pill-rejected  { background: rgba(231,111,81,0.15); color: var(--sunset); border: 1px solid rgba(231,111,81,0.25); }
  .pill-onchain   { background: rgba(130,71,229,0.15); color: rgba(180,150,255,0.9); border: 1px solid rgba(130,71,229,0.25); }

  /* ── SEND PANEL ── */
  .send-container { max-width: 560px; margin: 0 auto; }
  .send-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border); border-radius: var(--radius);
    overflow: hidden;
  }
  .send-header {
    padding: 1.4rem 1.8rem;
    border-bottom: 1px solid var(--border);
    background: linear-gradient(135deg, rgba(27,67,50,0.5) 0%, transparent 100%);
  }
  .send-title { font-family: 'Fraunces', serif; font-size: 1.1rem; font-weight: 700; color: var(--cream); }
  .send-subtitle { font-size: 0.78rem; color: var(--text-dim); margin-top: 0.2rem; }
  .send-body { padding: 1.8rem; }
  .field-group { margin-bottom: 1.4rem; }
  .field-label { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 0.5rem; display: block; }
  .field-input {
    width: 100%; background: rgba(0,0,0,0.25);
    border: 1px solid var(--border); border-radius: 9px;
    padding: 0.75rem 1rem; color: var(--cream);
    font-family: 'Outfit', sans-serif; font-size: 0.9rem;
    outline: none; transition: border-color 0.2s;
  }
  .field-input:focus { border-color: var(--emerald-light); }
  .field-input::placeholder { color: var(--text-dim); }
  .field-select {
    width: 100%; background: rgba(0,0,0,0.25);
    border: 1px solid var(--border); border-radius: 9px;
    padding: 0.75rem 1rem; color: var(--cream);
    font-family: 'Outfit', sans-serif; font-size: 0.9rem;
    outline: none; cursor: pointer; appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2395D5B2' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 1rem center;
    transition: border-color 0.2s;
  }
  .field-select:focus { border-color: var(--emerald-light); }
  .field-select option { background: #0D1F17; }
  .amount-row { display: grid; grid-template-columns: 1fr auto; gap: 0.6rem; align-items: end; }
  .currency-tag {
    background: rgba(64,145,108,0.15); border: 1px solid rgba(64,145,108,0.3);
    border-radius: 8px; padding: 0.75rem 0.9rem;
    font-size: 0.85rem; font-weight: 600; color: var(--emerald-pale);
    white-space: nowrap;
  }
  .quote-box {
    background: rgba(212,160,23,0.07); border: 1px solid rgba(212,160,23,0.2);
    border-radius: 10px; padding: 1.1rem 1.2rem; margin-bottom: 1.4rem;
  }
  .quote-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.45rem; }
  .quote-row:last-child { margin-bottom: 0; }
  .quote-key { font-size: 0.78rem; color: var(--text-dim); }
  .quote-val { font-size: 0.82rem; font-weight: 600; color: var(--cream); }
  .quote-val.highlight { color: var(--gold); font-family: 'Fraunces', serif; font-size: 1rem; }
  .quote-divider { border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 0.5rem 0; }
  .send-btn {
    width: 100%; padding: 0.9rem;
    background: linear-gradient(135deg, var(--emerald-light), var(--gold));
    border: none; border-radius: 10px; cursor: pointer;
    font-family: 'Fraunces', serif; font-size: 1rem; font-weight: 700;
    color: var(--ink); letter-spacing: -0.01em;
    transition: all 0.25s; display: flex; align-items: center; justify-content: center; gap: 0.5rem;
  }
  .send-btn:hover { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 8px 24px rgba(212,160,23,0.3); }
  .send-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
  .eip712-notice {
    display: flex; align-items: flex-start; gap: 0.6rem;
    background: rgba(130,71,229,0.08); border: 1px solid rgba(130,71,229,0.2);
    border-radius: 9px; padding: 0.8rem 1rem; margin-bottom: 1.2rem;
    font-size: 0.75rem; color: rgba(180,150,255,0.8); line-height: 1.5;
  }
  .eip712-icon { flex-shrink: 0; font-size: 1rem; }

  /* ── TRANSACTIONS TAB ── */
  .tx-table-header {
    display: grid; grid-template-columns: 1fr 0.8fr 0.8fr 0.7fr 0.7fr 80px;
    padding: 0.6rem 1rem;
    font-size: 0.68rem; font-weight: 600; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--text-dim);
    border-bottom: 1px solid var(--border);
  }
  .tx-detail-row {
    display: grid; grid-template-columns: 1fr 0.8fr 0.8fr 0.7fr 0.7fr 80px;
    align-items: center; padding: 0.85rem 1rem;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    font-size: 0.82rem; transition: background 0.15s; cursor: pointer;
  }
  .tx-detail-row:hover { background: var(--mist); }
  .tx-ref { font-family: monospace; font-size: 0.72rem; color: var(--emerald-pale); }
  .tx-hash-short { font-family: monospace; font-size: 0.68rem; color: var(--text-dim); }
  .tx-narration { font-size: 0.78rem; color: var(--text-mid); }

  /* ── FX RATES TAB ── */
  .fx-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 1rem; }
  .fx-card {
    background: rgba(255,255,255,0.03); border: 1px solid var(--border);
    border-radius: 12px; padding: 1.2rem 1.4rem; transition: all 0.2s;
  }
  .fx-card:hover { border-color: rgba(212,160,23,0.3); background: rgba(212,160,23,0.04); }
  .fx-pair { font-size: 0.72rem; color: var(--text-dim); font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 0.4rem; }
  .fx-rate-val { font-family: 'Fraunces', serif; font-size: 1.4rem; font-weight: 700; color: var(--gold); line-height: 1; }
  .fx-spread { font-size: 0.7rem; color: var(--text-dim); margin-top: 0.3rem; }
  .fx-flags { font-size: 1rem; margin-bottom: 0.6rem; }

  /* ── MODAL ── */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.7);
    backdrop-filter: blur(6px); z-index: 100;
    display: flex; align-items: center; justify-content: center;
    padding: 1.5rem;
  }
  .modal {
    background: var(--ink); border: 1px solid var(--border);
    border-radius: 16px; max-width: 480px; width: 100%;
    box-shadow: var(--shadow);
    animation: modal-in 0.25s ease;
  }
  @keyframes modal-in {
    from { opacity: 0; transform: scale(0.94) translateY(12px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  .modal-header {
    padding: 1.4rem 1.6rem 1rem;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
  }
  .modal-title { font-family: 'Fraunces', serif; font-size: 1rem; font-weight: 700; color: var(--cream); }
  .modal-close { cursor: pointer; color: var(--text-dim); font-size: 1.1rem; transition: color 0.2s; }
  .modal-close:hover { color: var(--cream); }
  .modal-body { padding: 1.4rem 1.6rem; }
  .modal-field { margin-bottom: 0.9rem; display: flex; justify-content: space-between; align-items: flex-start; }
  .modal-field-key { font-size: 0.75rem; color: var(--text-dim); }
  .modal-field-val { font-size: 0.82rem; color: var(--cream); font-weight: 500; text-align: right; max-width: 65%; word-break: break-all; }
  .modal-field-val.mono { font-family: monospace; font-size: 0.7rem; color: var(--emerald-pale); }
  .modal-divider { border: none; border-top: 1px solid var(--border); margin: 0.8rem 0; }
  .modal-footer { padding: 1rem 1.6rem 1.4rem; }
  .modal-btn {
    width: 100%; padding: 0.75rem; border-radius: 9px;
    font-family: 'Outfit', sans-serif; font-size: 0.88rem; font-weight: 600;
    cursor: pointer; transition: all 0.2s; border: 1px solid var(--border);
    background: rgba(255,255,255,0.06); color: var(--cream);
  }
  .modal-btn:hover { background: rgba(255,255,255,0.1); }
  .polygonscan-link {
    display: flex; align-items: center; gap: 0.4rem; justify-content: center;
    color: var(--gold); font-size: 0.75rem; margin-top: 0.6rem;
    cursor: pointer; text-decoration: none;
  }

  /* ── SUCCESS TOAST ── */
  .toast {
    position: fixed; bottom: 2rem; right: 2rem; z-index: 200;
    background: rgba(27,67,50,0.98); border: 1px solid var(--emerald-light);
    border-radius: 12px; padding: 1rem 1.4rem;
    display: flex; align-items: center; gap: 0.8rem;
    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
    animation: toast-in 0.3s ease;
    max-width: 340px;
  }
  @keyframes toast-in {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .toast-icon { font-size: 1.2rem; flex-shrink: 0; }
  .toast-msg { font-size: 0.82rem; color: var(--cream); font-weight: 500; line-height: 1.4; }
  .toast-ref { font-size: 0.7rem; color: var(--emerald-pale); font-family: monospace; margin-top: 0.2rem; }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
`;

// ─── Component ────────────────────────────────────────────────────────────────
export default function EACPayWallet() {
  const [activeTab, setActiveTab] = useState("overview");
  const [sendForm, setSendForm] = useState({
    recipientAddress: "", recipientName: "", sourceCurrency: "KES",
    destCurrency: "TZS", amount: "", bank: "", narration: "",
  });
  const [quote, setQuote] = useState(null);
  const [isSigning, setIsSigning] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectedTx, setSelectedTx] = useState(null);
  const [fxJitter, setFxJitter] = useState({});

  // Inject CSS
  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
    return () => document.head.removeChild(styleEl);
  }, []);

  // FX live jitter
  useEffect(() => {
    const iv = setInterval(() => {
      const j = {};
      Object.keys(FX_RATES).forEach(k => {
        j[k] = FX_RATES[k] * (1 + (Math.random() - 0.5) * 0.001);
      });
      setFxJitter(j);
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  // Compute FX quote
  useEffect(() => {
    if (!sendForm.amount || parseFloat(sendForm.amount) <= 0) { setQuote(null); return; }
    const key = `${sendForm.sourceCurrency}/${sendForm.destCurrency}`;
    const revKey = `${sendForm.destCurrency}/${sendForm.sourceCurrency}`;
    const rates = { ...FX_RATES, ...fxJitter };
    let rate = rates[key] || (rates[revKey] ? 1 / rates[revKey] : null);
    if (sendForm.sourceCurrency === sendForm.destCurrency) rate = 1;
    if (!rate) { setQuote(null); return; }
    const src = parseFloat(sendForm.amount);
    const fee = parseFloat((src * 0.008).toFixed(2));
    const dest = parseFloat(((src - fee) * rate).toFixed(2));
    setQuote({ rate: rate.toFixed(4), fee, dest, destCurrency: sendForm.destCurrency });
  }, [sendForm.amount, sendForm.sourceCurrency, sendForm.destCurrency, fxJitter]);

  function showToast(msg, ref) {
    setToast({ msg, ref });
    setTimeout(() => setToast(null), 5000);
  }

  async function handleSend() {
    if (!sendForm.amount || !sendForm.recipientAddress || !sendForm.bank || !quote) return;
    setIsSigning(true);
    await new Promise(r => setTimeout(r, 1800));
    setIsSigning(false);
    const ref = `EAC-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
    showToast(`Payment initiated! Awaiting bank confirmation.`, ref);
    setSendForm({ recipientAddress:"", recipientName:"", sourceCurrency:"KES", destCurrency:"TZS", amount:"", bank:"", narration:"" });
    setQuote(null);
  }

  const totalUSD = (1284.50 + 320.00 + 4.2182 * 0.54).toFixed(2);

  const NAV = [
    { key: "overview",      icon: "◈", label: "Overview" },
    { key: "send",          icon: "↗", label: "Send Money",  badge: null },
    { key: "transactions",  icon: "≡", label: "Transactions" },
    { key: "fx",            icon: "⇌", label: "FX Rates" },
    { key: "security",      icon: "⚿", label: "Security" },
  ];

  return (
    <div className="wallet-root">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">E</div>
          <span className="logo-text">EAC<span>Pay</span></span>
        </div>
        <div className="sidebar-user">
          <div className="user-avatar">{CUSTOMER.first_name[0]}{CUSTOMER.last_name[0]}</div>
          <div className="user-name">{CUSTOMER.first_name} {CUSTOMER.last_name}</div>
          <div className="user-addr">{shortAddr(CUSTOMER.wallet_address)}</div>
          <div className="kyc-badge">KYC Approved</div>
        </div>
        <nav className="sidebar-nav">
          <span className="nav-label">Wallet</span>
          {NAV.map(n => (
            <div
              key={n.key}
              className={`nav-item${activeTab === n.key ? " active" : ""}`}
              onClick={() => setActiveTab(n.key)}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
              {n.badge && <span className="nav-badge">{n.badge}</span>}
            </div>
          ))}
          <span className="nav-label" style={{marginTop:"1rem"}}>Network</span>
          <div className="nav-item"><span className="nav-icon">🏦</span>Partner Banks</div>
          <div className="nav-item"><span className="nav-icon">⬡</span>Chain Explorer</div>
        </nav>
        <div className="sidebar-bottom">
          <div className="network-pill">
            <span className="network-dot"></span>
            Polygon Amoy · Block #104,825
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main">
        {/* Topbar */}
        <header className="topbar">
          <div className="page-title">
            {NAV.find(n=>n.key===activeTab)?.label || "Wallet"}
            <span>· EACPay</span>
          </div>
          <div className="topbar-actions">
            <div className="icon-btn notif-btn">🔔<span className="notif-dot"></span></div>
            <div className="icon-btn">⚙</div>
            <div style={{
              display:"flex", alignItems:"center", gap:"0.5rem",
              padding:"0.4rem 0.9rem", borderRadius:"8px",
              background:"rgba(255,255,255,0.04)", border:"1px solid var(--border)",
              fontSize:"0.78rem", color:"var(--text-mid)"
            }}>
              🇰🇪 KE · KES
            </div>
          </div>
        </header>

        <div className="content">

          {/* ════ OVERVIEW ════ */}
          {activeTab === "overview" && (
            <>
              <div className="overview-grid">
                {/* Balance hero */}
                <div className="balance-hero">
                  <div className="bal-label">Total Balance</div>
                  <div className="bal-total">$ {Number(totalUSD).toLocaleString()}</div>
                  <div className="bal-sub">≈ KES {(parseFloat(totalUSD)*129.87).toLocaleString("en-KE",{maximumFractionDigits:0})} · Updated just now</div>
                  <div className="bal-actions">
                    <button className="bal-btn primary" onClick={() => setActiveTab("send")}>↗ Send Money</button>
                    <button className="bal-btn ghost">↙ Receive</button>
                    <button className="bal-btn ghost">⇌ Swap</button>
                  </div>
                </div>

                {/* Chain status */}
                <div className="chain-card">
                  <div className="chain-title">Chain Status</div>
                  <div className="chain-stat">
                    <div className="chain-stat-val">104,825</div>
                    <div className="chain-stat-label">Latest Block</div>
                  </div>
                  <div className="chain-stat">
                    <div className="chain-stat-val">3</div>
                    <div className="chain-stat-label">Confirmed Txns</div>
                  </div>
                  <div className="healthy-badge">Chain Healthy</div>
                </div>
              </div>

              {/* Tokens */}
              <div className="tokens-section">
                <div className="section-header">
                  <div className="section-title">Your Assets</div>
                  <span className="section-link">Manage →</span>
                </div>
                {TOKENS.map(t => (
                  <div className="token-row" key={t.symbol}>
                    <div className="token-icon" style={{background:`${t.color}18`, borderColor:`${t.color}30`, color:t.color}}>
                      {t.icon}
                    </div>
                    <div>
                      <div className="token-name">{t.symbol}</div>
                      <div className="token-full">{t.name}</div>
                    </div>
                    <div className="token-change">
                      <span className={Math.random()>0.4?"change-up":"change-dn"}>
                        {Math.random()>0.4?"▲":"▼"} {(Math.random()*0.5+0.05).toFixed(2)}%
                      </span>
                    </div>
                    <div className="token-bal">
                      <div className="token-bal-main">{t.balance.toFixed(t.decimals > 6 ? 4 : 2)} {t.symbol}</div>
                      <div className="token-bal-usd">≈ ${(t.symbol==="EAC-USD"||t.symbol==="USDC" ? t.balance : t.balance*0.54).toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Recent transactions */}
              <div>
                <div className="section-header">
                  <div className="section-title">Recent Transactions</div>
                  <span className="section-link" onClick={() => setActiveTab("transactions")}>See all →</span>
                </div>
                {TRANSACTIONS.slice(0, 3).map(tx => (
                  <div className="tx-row" key={tx.id} onClick={() => setSelectedTx(tx)}>
                    <div className={`tx-icon ${tx.status === "CONFIRMED" ? "out" : "pending"}`}>
                      {tx.status === "CONFIRMED" ? "↗" : "⏳"}
                    </div>
                    <div style={{flex:1, minWidth:0}}>
                      <div className="tx-to">{tx.receiver_name}</div>
                      <div className="tx-meta">{tx.narration} · {timeAgo(tx.initiated_at)}</div>
                      {tx.on_chain_tx_hash && (
                        <div className="tx-hash">{shortAddr(tx.on_chain_tx_hash)} · Block #{tx.block_number?.toLocaleString()}</div>
                      )}
                    </div>
                    <span className={`status-pill ${tx.status === "CONFIRMED" ? "pill-confirmed" : "pill-pending"}`}>
                      {tx.status === "CONFIRMED" ? "✓" : "⏳"} {tx.status}
                    </span>
                    <div className="tx-amount" style={{marginLeft:"0.8rem"}}>
                      <div className={`tx-amt-main amt-out`}>
                        -{formatAmount(tx.source_amount)} {tx.source_currency}
                      </div>
                      <div className="tx-amt-dest">+{formatAmount(tx.dest_amount)} {tx.dest_currency}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ════ SEND MONEY ════ */}
          {activeTab === "send" && (
            <div className="send-container">
              <div className="send-card">
                <div className="send-header">
                  <div className="send-title">Cross-Border Transfer</div>
                  <div className="send-subtitle">EIP-712 signed · Polygon PoS · 0.8% FX spread</div>
                </div>
                <div className="send-body">
                  <div className="eip712-notice">
                    <span className="eip712-icon">🔐</span>
                    <span>Your payment will be cryptographically signed with your wallet key (EIP-712) before broadcast to <strong style={{color:"rgba(180,150,255,1)"}}>EACSettlement.sol</strong> on Polygon.</span>
                  </div>

                  <div className="field-group">
                    <label className="field-label">Recipient Wallet Address</label>
                    <input className="field-input" placeholder="0x…" value={sendForm.recipientAddress}
                      onChange={e => setSendForm(f=>({...f,recipientAddress:e.target.value}))} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Recipient Name</label>
                    <input className="field-input" placeholder="Full name" value={sendForm.recipientName}
                      onChange={e => setSendForm(f=>({...f,recipientName:e.target.value}))} />
                  </div>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.8rem"}}>
                    <div className="field-group">
                      <label className="field-label">From Currency</label>
                      <select className="field-select" value={sendForm.sourceCurrency}
                        onChange={e => setSendForm(f=>({...f,sourceCurrency:e.target.value}))}>
                        {EAC_CURRENCIES.map(c => (
                          <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field-group">
                      <label className="field-label">To Currency</label>
                      <select className="field-select" value={sendForm.destCurrency}
                        onChange={e => setSendForm(f=>({...f,destCurrency:e.target.value}))}>
                        {EAC_CURRENCIES.filter(c => c.code !== sendForm.sourceCurrency).map(c => (
                          <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Amount ({sendForm.sourceCurrency})</label>
                    <div className="amount-row">
                      <input className="field-input" type="number" placeholder="0.00" value={sendForm.amount}
                        onChange={e => setSendForm(f=>({...f,amount:e.target.value}))} />
                      <div className="currency-tag">{sendForm.sourceCurrency}</div>
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Receiving Bank</label>
                    <select className="field-select" value={sendForm.bank}
                      onChange={e => setSendForm(f=>({...f,bank:e.target.value}))}>
                      <option value="">Select a partner bank…</option>
                      {BANKS.map(b => (
                        <option key={b.swift} value={b.swift}>{b.flag} {b.name} · {b.swift}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Narration (optional)</label>
                    <input className="field-input" placeholder="e.g. School fees, Business payment…" value={sendForm.narration}
                      onChange={e => setSendForm(f=>({...f,narration:e.target.value}))} />
                  </div>

                  {/* Live quote */}
                  {quote && (
                    <div className="quote-box">
                      <div className="quote-row">
                        <span className="quote-key">Exchange Rate</span>
                        <span className="quote-val">1 {sendForm.sourceCurrency} = {quote.rate} {sendForm.destCurrency}</span>
                      </div>
                      <div className="quote-row">
                        <span className="quote-key">Network Fee (0.8%)</span>
                        <span className="quote-val">{quote.fee} {sendForm.sourceCurrency}</span>
                      </div>
                      <hr className="quote-divider" />
                      <div className="quote-row">
                        <span className="quote-key">Recipient Receives</span>
                        <span className="quote-val highlight">{quote.dest.toLocaleString()} {quote.destCurrency}</span>
                      </div>
                    </div>
                  )}

                  <button
                    className="send-btn"
                    disabled={!sendForm.amount || !sendForm.recipientAddress || !sendForm.bank || isSigning}
                    onClick={handleSend}
                  >
                    {isSigning ? (
                      <><span style={{animation:"pulse 0.8s ease-in-out infinite"}}>⬡</span> Signing with EIP-712…</>
                    ) : (
                      <>↗ Sign & Initiate Payment</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ════ TRANSACTIONS ════ */}
          {activeTab === "transactions" && (
            <div>
              <div style={{
                background:"rgba(255,255,255,0.03)", border:"1px solid var(--border)",
                borderRadius:"var(--radius)", overflow:"hidden"
              }}>
                <div style={{padding:"1.2rem 1.4rem", borderBottom:"1px solid var(--border)",
                  display:"flex", alignItems:"center", justifyContent:"space-between"}}>
                  <div className="section-title">All Transactions</div>
                  <div style={{display:"flex", gap:"0.6rem"}}>
                    {["All","Confirmed","Pending","Rejected"].map(f=>(
                      <span key={f} style={{
                        padding:"0.25rem 0.7rem", borderRadius:"20px",
                        fontSize:"0.72rem", cursor:"pointer",
                        background: f==="All" ? "rgba(64,145,108,0.2)" : "var(--mist)",
                        border: f==="All" ? "1px solid rgba(64,145,108,0.35)" : "1px solid var(--border)",
                        color: f==="All" ? "var(--emerald-pale)" : "var(--text-mid)"
                      }}>{f}</span>
                    ))}
                  </div>
                </div>
                <div className="tx-table-header">
                  <span>Reference / Narration</span>
                  <span>Amount</span>
                  <span>Converted</span>
                  <span>Rate</span>
                  <span>Status</span>
                  <span>When</span>
                </div>
                {TRANSACTIONS.map(tx => (
                  <div className="tx-detail-row" key={tx.id} onClick={() => setSelectedTx(tx)}>
                    <div>
                      <div className="tx-ref">{tx.reference}</div>
                      <div className="tx-narration">{tx.narration}</div>
                      <div style={{fontSize:"0.7rem", color:"var(--text-dim)", marginTop:"0.1rem"}}>→ {tx.receiver_name}</div>
                    </div>
                    <div>
                      <div style={{fontFamily:"Fraunces, serif", fontSize:"0.9rem", color:"var(--sunset)"}}>
                        -{formatAmount(tx.source_amount)} {tx.source_currency}
                      </div>
                      <div style={{fontSize:"0.7rem", color:"var(--text-dim)"}}>Fee: {tx.fee_amount} {tx.source_currency}</div>
                    </div>
                    <div style={{fontFamily:"Fraunces, serif", fontSize:"0.9rem", color:"#52c41a"}}>
                      +{formatAmount(tx.dest_amount)} {tx.dest_currency}
                    </div>
                    <div style={{fontSize:"0.78rem", color:"var(--gold)"}}>
                      {tx.fx_rate}
                    </div>
                    <div style={{display:"flex", flexDirection:"column", gap:"0.25rem"}}>
                      <span className={`status-pill ${tx.status==="CONFIRMED"?"pill-confirmed":"pill-pending"}`}>{tx.status}</span>
                      <span className={`status-pill ${tx.smart_contract_status==="ON_CHAIN"?"pill-onchain":"pill-pending"}`}>{tx.smart_contract_status}</span>
                    </div>
                    <div style={{fontSize:"0.72rem", color:"var(--text-dim)"}}>{timeAgo(tx.initiated_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ════ FX RATES ════ */}
          {activeTab === "fx" && (
            <div>
              <div style={{marginBottom:"1.5rem", display:"flex", alignItems:"center", gap:"0.8rem"}}>
                <div className="healthy-badge">● Live</div>
                <span style={{fontSize:"0.78rem", color:"var(--text-dim)"}}>Mid-market rates · 0.8% spread applied on transactions · Refreshes every 15 min</span>
              </div>
              <div className="fx-grid">
                {Object.entries({...FX_RATES, ...fxJitter}).map(([pair, rate]) => {
                  const [from, to] = pair.split("/");
                  const fromC = EAC_CURRENCIES.find(c=>c.code===from);
                  const toC = EAC_CURRENCIES.find(c=>c.code===to);
                  return (
                    <div className="fx-card" key={pair}>
                      <div className="fx-flags">{fromC?.flag} → {toC?.flag}</div>
                      <div className="fx-pair">{pair}</div>
                      <div className="fx-rate-val">{Number(rate).toFixed(rate < 2 ? 4 : 2)}</div>
                      <div className="fx-spread">Spread: 0.80% · Bid: {(rate*0.992).toFixed(3)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ════ SECURITY ════ */}
          {activeTab === "security" && (
            <div style={{maxWidth:"600px"}}>
              {[
                { icon:"🔐", title:"Wallet Address", val: CUSTOMER.wallet_address, mono: true },
                { icon:"✍️", title:"EIP-712 Signing", val:"Enabled · All payments require your wallet signature before submission" },
                { icon:"🔑", title:"Key Storage", val:"Client-side only · AES-256-GCM encrypted · Never transmitted to servers" },
                { icon:"📋", title:"Mnemonic Phrase", val: CUSTOMER.mnemonic_confirmed ? "✓ Confirmed and backed up" : "⚠ Not yet confirmed — please back up your seed phrase" },
                { icon:"🪪", title:"KYC Status", val:`${CUSTOMER.kyc_status} · Kenya (KE)` },
                { icon:"🛡️", title:"Smart Contract", val:"EACSettlement.sol · Polygon Amoy · Verified on Polygonscan" },
              ].map(item => (
                <div key={item.title} style={{
                  background:"rgba(255,255,255,0.03)", border:"1px solid var(--border)",
                  borderRadius:"12px", padding:"1.2rem 1.4rem", marginBottom:"0.8rem",
                  display:"flex", alignItems:"flex-start", gap:"1rem"
                }}>
                  <span style={{fontSize:"1.3rem", marginTop:"0.1rem"}}>{item.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:"0.72rem", color:"var(--text-dim)", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"0.3rem"}}>{item.title}</div>
                    <div style={{fontSize:"0.82rem", color:"var(--cream)", fontFamily: item.mono ? "monospace" : "inherit", wordBreak:"break-all"}}>{item.val}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>{/* /content */}
      </main>

      {/* ── Transaction Detail Modal ── */}
      {selectedTx && (
        <div className="modal-overlay" onClick={() => setSelectedTx(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Transaction Detail</span>
              <span className="modal-close" onClick={() => setSelectedTx(null)}>✕</span>
            </div>
            <div className="modal-body">
              <div className="modal-field"><span className="modal-field-key">Reference</span><span className="modal-field-val mono">{selectedTx.reference}</span></div>
              <div className="modal-field"><span className="modal-field-key">Recipient</span><span className="modal-field-val">{selectedTx.receiver_name}</span></div>
              <div className="modal-field"><span className="modal-field-key">Bank</span><span className="modal-field-val">{selectedTx.receiver_bank}</span></div>
              <hr className="modal-divider" />
              <div className="modal-field">
                <span className="modal-field-key">Sent</span>
                <span className="modal-field-val" style={{color:"var(--sunset)"}}>
                  {formatAmount(selectedTx.source_amount)} {selectedTx.source_currency}
                </span>
              </div>
              <div className="modal-field">
                <span className="modal-field-key">Received</span>
                <span className="modal-field-val" style={{color:"#52c41a"}}>
                  {formatAmount(selectedTx.dest_amount)} {selectedTx.dest_currency}
                </span>
              </div>
              <div className="modal-field"><span className="modal-field-key">FX Rate</span><span className="modal-field-val">{selectedTx.fx_rate}</span></div>
              <div className="modal-field"><span className="modal-field-key">Fee</span><span className="modal-field-val">{selectedTx.fee_amount} {selectedTx.source_currency}</span></div>
              <div className="modal-field"><span className="modal-field-key">Narration</span><span className="modal-field-val">{selectedTx.narration}</span></div>
              <hr className="modal-divider" />
              <div className="modal-field">
                <span className="modal-field-key">Status</span>
                <span className={`status-pill ${selectedTx.status==="CONFIRMED"?"pill-confirmed":"pill-pending"}`}>{selectedTx.status}</span>
              </div>
              <div className="modal-field">
                <span className="modal-field-key">Chain Status</span>
                <span className={`status-pill ${selectedTx.smart_contract_status==="ON_CHAIN"?"pill-onchain":"pill-pending"}`}>{selectedTx.smart_contract_status}</span>
              </div>
              {selectedTx.on_chain_tx_hash && (
                <div className="modal-field">
                  <span className="modal-field-key">Tx Hash</span>
                  <span className="modal-field-val mono">{shortAddr(selectedTx.on_chain_tx_hash)}</span>
                </div>
              )}
              {selectedTx.block_number && (
                <div className="modal-field">
                  <span className="modal-field-key">Block</span>
                  <span className="modal-field-val">#{selectedTx.block_number?.toLocaleString()}</span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="modal-btn">Copy Reference</button>
              {selectedTx.on_chain_tx_hash && (
                <div className="polygonscan-link">⬡ View on Polygonscan →</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="toast">
          <span className="toast-icon">✓</span>
          <div>
            <div className="toast-msg">{toast.msg}</div>
            {toast.ref && <div className="toast-ref">{toast.ref}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
