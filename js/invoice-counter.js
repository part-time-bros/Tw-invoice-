/* ─── TwinWaves Invoice Counter ─────────────────────
   Format: TWD-YYMM-001
   Resets to 001 each calendar month.
   Only increments on generate(); peek() is read-only.
   ─────────────────────────────────────────────────── */

const InvoiceCounter = (() => {
  'use strict';

  const KEY = 'tw_invoice_counter';

  function _prefix() {
    const now = new Date();
    const yy  = String(now.getFullYear()).slice(2);
    const mm  = String(now.getMonth() + 1).padStart(2, '0');
    return `TWD-${yy}${mm}`;
  }

  function _load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch { return {}; }
  }

  /** Generate and persist next invoice number. */
  function generate() {
    const prefix  = _prefix();
    const stored  = _load();
    const count   = stored.prefix === prefix ? (stored.count || 0) + 1 : 1;
    localStorage.setItem(KEY, JSON.stringify({ prefix, count }));
    return `${prefix}-${String(count).padStart(3, '0')}`;
  }

  /** Read next number without incrementing. */
  function peek() {
    const prefix  = _prefix();
    const stored  = _load();
    const count   = stored.prefix === prefix ? (stored.count || 0) + 1 : 1;
    return `${prefix}-${String(count).padStart(3, '0')}`;
  }

  return { generate, peek };
})();
