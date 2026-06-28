/* ─── TwinWaves Invoice Generator — App Controller ──────────── */

/* ════════════════════════════════════════════════════
   TOAST SYSTEM (global, hoisted via function declaration)
   ════════════════════════════════════════════════════ */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('visible')));
  setTimeout(() => {
    toast.classList.remove('visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3800);
}

/* ════════════════════════════════════════════════════
   APP
   ════════════════════════════════════════════════════ */
(async () => {
  'use strict';

  // ── Date utils ───────────────────────────────────
  const _today = new Date();
  const _iso   = d => d.toISOString().split('T')[0];
  const TODAY  = _iso(_today);
  const PLUS7  = _iso(new Date(_today.getTime() + 7 * 864e5));

  // ── Storage keys ─────────────────────────────────
  const HIST_KEY = 'tw_invoice_history';
  const FORM_KEY = 'tw_invoice_form';
  const MAX_HIST = 25;

  // ── App state ────────────────────────────────────
  let selectedPlan = 'starter';
  let previewURL   = null;
  let historyOpen  = false;

  // ── DOM refs ─────────────────────────────────────
  const $ = id => document.getElementById(id);
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
  const histPanel       = $('historyPanel');
  const histList        = $('historyList');
  const histEmpty       = $('historyEmpty');
  const histBtnCount    = $('histBtnCount');
  const histCountEl     = $('historyCount');

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

  requestAnimationFrame(() => SigManager.init());
  PDFGenerator.preloadLogos().catch(e => console.warn('Logo preload:', e.message));
  _updateHistBadge();

  // ── Plan cards ───────────────────────────────────
  planCards.forEach(card => {
    card.addEventListener('click', () => _selectPlan(card.dataset.plan, true));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        _selectPlan(card.dataset.plan, true);
      }
    });
  });

  customPriceEl.addEventListener('input', () => {
    if (customPriceDisp) customPriceDisp.textContent = customPriceEl.value || '—';
    _saveForm();
  });

  [clientBizEl, contactNameEl, clientPhoneEl, clientEmailEl,
   clientAddressEl, notesEl, invoiceDateEl, dueDateEl
  ].forEach(el => el?.addEventListener('input', _saveForm));

  // ── Buttons ──────────────────────────────────────
  $('clearSigBtn').addEventListener('click',      () => SigManager.clear());
  $('previewBtn').addEventListener('click',       _generatePreview);
  $('downloadDarkBtn').addEventListener('click',  () => _downloadPDF('dark'));
  $('downloadLightBtn').addEventListener('click', () => _downloadPDF('light'));
  $('nextInvoiceBtn').addEventListener('click',   _nextInvoice);
  $('clearFormBtn').addEventListener('click',     _clearForm);

  // ── History panel ─────────────────────────────────
  $('historyBtn').addEventListener('click',      _toggleHistory);
  $('closeHistoryBtn').addEventListener('click', _toggleHistory);
  $('historyBackdrop').addEventListener('click', _toggleHistory);

  histList?.addEventListener('click', e => {
    const entry = e.target.closest('.history-entry');
    if (!entry) return;
    const idx = parseInt(entry.dataset.index);
    if (isNaN(idx)) return;
    if (e.target.classList.contains('he-load-btn')) _loadHistoryEntry(idx);
    if (e.target.classList.contains('he-del-btn'))  _deleteHistoryEntry(idx);
  });

  // ── Window resize ────────────────────────────────
  let _rTimer;
  window.addEventListener('resize', () => {
    clearTimeout(_rTimer);
    _rTimer = setTimeout(() => SigManager.resize(), 350);
  });

  // ══════════════════════════════════════════════════
  //  FORM
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
    try { localStorage.setItem(FORM_KEY, JSON.stringify(_getFormData())); }
    catch { /* quota */ }
  }

  function _loadForm() {
    try { const r = localStorage.getItem(FORM_KEY); return r ? JSON.parse(r) : null; }
    catch { return null; }
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
    if (d.customPrice && customPriceDisp) customPriceDisp.textContent = d.customPrice || '—';
  }

  function _clearClientFields() {
    clientBizEl.value     = '';
    contactNameEl.value   = '';
    clientPhoneEl.value   = '';
    clientEmailEl.value   = '';
    clientAddressEl.value = '';
    customPriceEl.value   = '';
    notesEl.value         = '';
    if (customPriceDisp) customPriceDisp.textContent = '—';
  }

  function _resetPreview() {
    previewIframe.src = '';
    previewPH.hidden  = false;
    safariFB.hidden   = true;
    if (previewHintEl) previewHintEl.textContent = 'Click "Preview PDF" to generate';
    if (previewURL) { URL.revokeObjectURL(previewURL); previewURL = null; }
  }

  // ══════════════════════════════════════════════════
  //  PREVIEW
  // ══════════════════════════════════════════════════

  async function _generatePreview() {
    const btn   = $('previewBtn');
    const label = btn.querySelector('.btn-label');
    btn.disabled = true;
    if (label) label.textContent = 'Generating…';

    try {
      const formData   = _getFormData();
      const rawSig     = SigManager.isEmpty() ? null : SigManager.getDataURL();
      const sigDataURL = rawSig ? await PDFGenerator.resizeSig(rawSig) : null;
      const doc        = PDFGenerator.generate(formData, 'dark', sigDataURL);
      const blob       = doc.output('blob');

      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = URL.createObjectURL(blob);

      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      if (isSafari) {
        safariFB.hidden = false; pdfFBLink.href = previewURL; previewPH.hidden = true;
      } else {
        previewIframe.src = previewURL; previewPH.hidden = true; safariFB.hidden = true;
      }

      const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (previewHintEl) previewHintEl.textContent = `Updated at ${t}`;

    } catch (e) {
      console.error(e);
      showToast('Preview failed: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      if (label) label.textContent = 'Preview PDF';
    }
  }

  // ══════════════════════════════════════════════════
  //  DOWNLOAD
  // ══════════════════════════════════════════════════

  async function _downloadPDF(theme) {
    const btn    = $(theme === 'dark' ? 'downloadDarkBtn' : 'downloadLightBtn');
    const origTx = btn.textContent;
    btn.disabled = true; btn.textContent = 'Generating…';

    try {
      const formData   = _getFormData();
      const rawSig     = SigManager.isEmpty() ? null
        : (theme === 'dark' ? SigManager.getDataURL() : SigManager.getInvertedDataURL());
      const sigDataURL = rawSig ? await PDFGenerator.resizeSig(rawSig) : null;

      const doc = PDFGenerator.generate(formData, theme, sigDataURL);

      const safeClient = (formData.clientBiz || 'Client')
        .replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-')
        .replace(/^-|-$/g, '').substring(0, 28) || 'Client';

      const filename = `TW-Invoice-${formData.invoiceNum}-${safeClient}-${theme}.pdf`;
      doc.save(filename);

      _saveToHistory(formData);   // auto-save to history on every download
      showToast(`Downloaded: ${filename}`, 'success');

    } catch (e) {
      console.error(e);
      showToast('Download failed: ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = origTx;
    }
  }

  // ══════════════════════════════════════════════════
  //  NEXT INVOICE
  //  Saves current data to history, then prepares a
  //  fresh form: new invoice #, reset dates, clear
  //  client fields. Keeps the plan selection.
  // ══════════════════════════════════════════════════

  function _nextInvoice() {
    const formData = _getFormData();

    // Save current invoice to history if it has meaningful data
    if (formData.clientBiz?.trim() || formData.contactName?.trim()) {
      _saveToHistory(formData);
      showToast(`Saved ${formData.invoiceNum} to history.`, 'info');
    }

    // New invoice number
    invoiceNumEl.value  = InvoiceCounter.generate();

    // Reset dates
    invoiceDateEl.value = TODAY;
    dueDateEl.value     = PLUS7;

    // Clear client / job fields — keep plan selection
    _clearClientFields();
    SigManager.clear();

    // Persist the fresh state
    _saveForm();
    _resetPreview();
  }

  // ══════════════════════════════════════════════════
  //  CLEAR FORM (full reset including plan + invoice #)
  // ══════════════════════════════════════════════════

  function _clearForm() {
    if (!confirm('Start a new invoice? Current form data will be cleared.')) return;
    localStorage.removeItem(FORM_KEY);
    invoiceNumEl.value = InvoiceCounter.generate();
    invoiceDateEl.value = TODAY; dueDateEl.value = PLUS7;
    _clearClientFields();
    SigManager.clear();
    _selectPlan('starter', false);
    _resetPreview();
    showToast('New invoice started.', 'info');
  }

  // ══════════════════════════════════════════════════
  //  INVOICE HISTORY
  // ══════════════════════════════════════════════════

  function _loadHistoryArr() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); }
    catch { return []; }
  }

  function _saveHistoryArr(arr) {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(arr)); }
    catch { /* quota */ }
  }

  function _saveToHistory(formData) {
    const planKey = formData.selectedPlan || 'starter';
    const price   = planKey === 'custom'
      ? (parseFloat(formData.customPrice) || 0)
      : (TW.plans[planKey]?.price || 0);

    const entry = {
      id:        formData.invoiceNum,
      savedAt:   Date.now(),
      clientBiz: (formData.clientBiz || 'Unknown Client').trim(),
      plan:      planKey,
      price,
      form:      { ...formData },
    };

    let history = _loadHistoryArr();
    history = history.filter(h => h.id !== formData.invoiceNum); // dedupe by invoice #
    history.unshift(entry);
    if (history.length > MAX_HIST) history = history.slice(0, MAX_HIST);
    _saveHistoryArr(history);
    _updateHistBadge();
    if (historyOpen) _renderHistory();
  }

  function _updateHistBadge() {
    const count = _loadHistoryArr().length;
    if (histBtnCount) histBtnCount.textContent = count > 0 ? count : '';
    if (histCountEl)  histCountEl.textContent  = count > 0 ? `${count} saved` : '';
  }

  function _toggleHistory() {
    historyOpen = !historyOpen;
    histPanel.classList.toggle('open', historyOpen);
    $('historyBackdrop').classList.toggle('visible', historyOpen);
    if (historyOpen) _renderHistory();
  }

  function _renderHistory() {
    const history = _loadHistoryArr();
    _updateHistBadge();

    if (history.length === 0) {
      histList.innerHTML = '';
      histEmpty.hidden   = false;
      return;
    }
    histEmpty.hidden = true;

    histList.innerHTML = history.map((entry, i) => {
      const d     = new Date(entry.savedAt);
      const date  = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const plan  = (entry.plan || 'custom').toUpperCase();
      const price = entry.price ? `$${entry.price.toLocaleString('en-US')}/mo` : 'Custom';
      return `
        <div class="history-entry" data-index="${i}">
          <div class="he-top">
            <span class="he-num">${entry.id}</span>
            <span class="he-date">${date}</span>
          </div>
          <div class="he-client">${entry.clientBiz}</div>
          <div class="he-bottom">
            <span class="he-plan">${plan}</span>
            <span class="he-price">${price}</span>
          </div>
          <div class="he-actions">
            <button class="he-load-btn">Load Invoice</button>
            <button class="he-del-btn">Delete</button>
          </div>
        </div>`;
    }).join('');
  }

  function _loadHistoryEntry(idx) {
    const history = _loadHistoryArr();
    const entry   = history[idx];
    if (!entry?.form) return;
    if (!confirm(`Load invoice ${entry.id} for ${entry.clientBiz}?\nCurrent form will be replaced.`)) return;

    localStorage.setItem(FORM_KEY, JSON.stringify(entry.form));
    _restoreForm(entry.form);
    _selectPlan(entry.form.selectedPlan || 'starter', false);
    SigManager.clear();
    _toggleHistory();
    _resetPreview();
    showToast(`Loaded: ${entry.id}`, 'info');
  }

  function _deleteHistoryEntry(idx) {
    const history = _loadHistoryArr();
    const entry   = history[idx];
    if (!entry) return;
    if (!confirm(`Delete invoice ${entry.id} from history?`)) return;
    history.splice(idx, 1);
    _saveHistoryArr(history);
    _renderHistory();
  }

})();
