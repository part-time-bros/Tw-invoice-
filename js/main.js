/* ─── TwinWaves Invoice Generator — App Controller ──
   Runs after all other scripts are loaded (bottom of body).
   No DOMContentLoaded needed — scripts are deferred to body end.
   ─────────────────────────────────────────────────── */

/* ════════════════════════════════════════════════════
   GLOBAL: Toast notification system
   (defined before IIFE so hoisting makes it accessible)
   ════════════════════════════════════════════════════ */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.textContent = message;
  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('visible')));

  // Animate out + remove
  setTimeout(() => {
    toast.classList.remove('visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3800);
}

/* ════════════════════════════════════════════════════
   APP IIFE
   ════════════════════════════════════════════════════ */
(async () => {
  'use strict';

  // ── Date utilities ───────────────────────────────
  const _today = new Date();
  const _fmtISO = d => d.toISOString().split('T')[0];
  const TODAY   = _fmtISO(_today);
  const PLUS7   = _fmtISO(new Date(_today.getTime() + 7 * 864e5));

  // ── State ────────────────────────────────────────
  let selectedPlan = 'starter';
  let previewURL   = null;      // current Blob URL for preview

  // ── DOM refs ─────────────────────────────────────
  const $     = id => document.getElementById(id);
  const invoiceNumEl    = $('invoiceNum');
  const invoiceDateEl   = $('invoiceDate');
  const dueDateEl       = $('dueDate');
  const clientBizEl     = $('clientBiz');
  const contactNameEl   = $('contactName');
  const clientPhoneEl   = $('clientPhone');
  const clientEmailEl   = $('clientEmail');
  const clientAddressEl = $('clientAddress');
  const customPriceEl   = $('customPrice');
  const customPriceWrap = $('customPriceWrapper');
  const customPriceDisp = document.querySelector('.custom-price-display');
  const notesEl         = $('notes');
  const previewIframe   = $('pdfPreview');
  const previewHintEl   = $('previewHint');
  const previewPH       = $('previewPlaceholder');
  const safariFB        = $('safariFallback');
  const pdfFBLink       = $('pdfFallbackLink');
  const planCards       = document.querySelectorAll('.plan-card');

  // ── Startup ──────────────────────────────────────
  const saved = _loadForm();

  if (saved?.invoiceNum) {
    _restoreForm(saved);
    _selectPlan(saved.selectedPlan || 'starter', false);
  } else {
    invoiceNumEl.value  = InvoiceCounter.generate();
    invoiceDateEl.value = TODAY;
    dueDateEl.value     = PLUS7;
    _selectPlan('starter', false);
  }

  // Init signature pad after layout is painted
  requestAnimationFrame(() => SigManager.init());

  // Preload logos in background (non-blocking)
  PDFGenerator.preloadLogos().catch(err =>
    console.warn('Logo preload failed:', err.message)
  );

  // ── Plan card interactions ────────────────────────
  planCards.forEach(card => {
    card.addEventListener('click', () => _selectPlan(card.dataset.plan, true));

    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        _selectPlan(card.dataset.plan, true);
      }
    });
  });

  // Custom price → live display update
  customPriceEl.addEventListener('input', () => {
    if (customPriceDisp) {
      customPriceDisp.textContent = customPriceEl.value || '—';
    }
    _saveForm();
  });

  // Auto-save on all text inputs (invoice num and custom price handled separately)
  [clientBizEl, contactNameEl, clientPhoneEl, clientEmailEl,
   clientAddressEl, notesEl, invoiceDateEl, dueDateEl
  ].forEach(el => el?.addEventListener('input', _saveForm));

  // ── Button events ─────────────────────────────────
  $('clearSigBtn').addEventListener('click', () => SigManager.clear());

  $('previewBtn').addEventListener('click', _generatePreview);

  $('downloadDarkBtn').addEventListener('click',  () => _downloadPDF('dark'));
  $('downloadLightBtn').addEventListener('click', () => _downloadPDF('light'));

  $('clearFormBtn').addEventListener('click', _clearForm);

  // Window resize → re-calibrate signature canvas DPR
  let _resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => SigManager.resize(), 350);
  });

  // ══════════════════════════════════════════════════
  //  Private helpers
  // ══════════════════════════════════════════════════

  function _selectPlan(plan, save) {
    selectedPlan = plan;
    planCards.forEach(card => {
      const active = card.dataset.plan === plan;
      card.classList.toggle('active', active);
      card.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    if (customPriceWrap) customPriceWrap.hidden = (plan !== 'custom');
    if (save) _saveForm();
  }

  function _getFormData() {
    return {
      invoiceNum:    invoiceNumEl.value,
      invoiceDate:   invoiceDateEl.value,
      dueDate:       dueDateEl.value,
      clientBiz:     clientBizEl.value,
      contactName:   contactNameEl.value,
      clientPhone:   clientPhoneEl.value,
      clientEmail:   clientEmailEl.value,
      clientAddress: clientAddressEl.value,
      selectedPlan,
      customPrice:   customPriceEl.value,
      notes:         notesEl.value,
    };
  }

  function _saveForm() {
    try {
      localStorage.setItem('tw_invoice_form', JSON.stringify(_getFormData()));
    } catch { /* storage full — ignore */ }
  }

  function _loadForm() {
    try {
      const raw = localStorage.getItem('tw_invoice_form');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function _restoreForm(d) {
    const set = (el, val) => { if (el != null && val != null) el.value = val; };
    set(invoiceNumEl,    d.invoiceNum);
    set(invoiceDateEl,   d.invoiceDate  || TODAY);
    set(dueDateEl,       d.dueDate      || PLUS7);
    set(clientBizEl,     d.clientBiz);
    set(contactNameEl,   d.contactName);
    set(clientPhoneEl,   d.clientPhone);
    set(clientEmailEl,   d.clientEmail);
    set(clientAddressEl, d.clientAddress);
    set(customPriceEl,   d.customPrice);
    set(notesEl,         d.notes);

    if (d.customPrice && customPriceDisp) {
      customPriceDisp.textContent = d.customPrice || '—';
    }
  }

  // ── Preview ───────────────────────────────────────
  async function _generatePreview() {
    const btn   = $('previewBtn');
    const label = btn.querySelector('.btn-label');

    btn.disabled = true;
    if (label) label.textContent = 'Generating…';

    try {
      const formData   = _getFormData();
      const sigDataURL = SigManager.isEmpty() ? null : SigManager.getDataURL();
      const doc        = PDFGenerator.generate(formData, 'dark', sigDataURL);
      const blob       = doc.output('blob');

      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = URL.createObjectURL(blob);

      // Safari doesn't render PDFs in iframes
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

      if (isSafari) {
        safariFB.hidden   = false;
        pdfFBLink.href    = previewURL;
        previewPH.hidden  = true;
      } else {
        previewIframe.src = previewURL;
        previewPH.hidden  = true;
        safariFB.hidden   = true;
      }

      const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (previewHintEl) previewHintEl.textContent = `Updated at ${t}`;

    } catch (e) {
      console.error('Preview failed:', e);
      showToast('Preview failed: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      if (label) label.textContent = 'Preview PDF';
    }
  }

  // ── Download ──────────────────────────────────────
  async function _downloadPDF(theme) {
    const btnId  = theme === 'dark' ? 'downloadDarkBtn' : 'downloadLightBtn';
    const btn    = $(btnId);
    const origTx = btn.textContent;

    btn.disabled   = true;
    btn.textContent = 'Generating…';

    try {
      const formData = _getFormData();

      // Signature: dark PDF uses light strokes; light PDF uses inverted (dark) strokes
      const sigDataURL = SigManager.isEmpty() ? null
        : (theme === 'dark'
            ? SigManager.getDataURL()
            : SigManager.getInvertedDataURL());

      const doc = PDFGenerator.generate(formData, theme, sigDataURL);

      // Sanitise client name for filename
      const safeClient = (formData.clientBiz || 'Client')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .substring(0, 28)
        || 'Client';

      const filename = `TW-Invoice-${formData.invoiceNum}-${safeClient}-${theme}.pdf`;
      doc.save(filename);

      showToast(`Downloaded: ${filename}`, 'success');

    } catch (e) {
      console.error('Download failed:', e);
      showToast('Download failed: ' + e.message, 'error');
    } finally {
      btn.disabled   = false;
      btn.textContent = origTx;
    }
  }

  // ── Clear form ────────────────────────────────────
  function _clearForm() {
    if (!confirm('Start a new invoice? Current form data will be cleared.')) return;

    localStorage.removeItem('tw_invoice_form');

    // Reset fields
    invoiceNumEl.value    = InvoiceCounter.generate();
    invoiceDateEl.value   = TODAY;
    dueDateEl.value       = PLUS7;
    clientBizEl.value     = '';
    contactNameEl.value   = '';
    clientPhoneEl.value   = '';
    clientEmailEl.value   = '';
    clientAddressEl.value = '';
    customPriceEl.value   = '';
    notesEl.value         = '';
    if (customPriceDisp) customPriceDisp.textContent = '—';

    SigManager.clear();
    _selectPlan('starter', false);

    // Reset preview
    previewIframe.src = '';
    previewPH.hidden  = false;
    safariFB.hidden   = true;
    if (previewHintEl) previewHintEl.textContent = 'Click "Preview PDF" to generate';

    if (previewURL) {
      URL.revokeObjectURL(previewURL);
      previewURL = null;
    }

    showToast('New invoice started.', 'info');
  }

})();
