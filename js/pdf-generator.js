/* ─── TwinWaves PDF Generator ────────────────────────────────────
   Builds A4 invoice PDFs (dark + light) via jsPDF direct drawing.

   Logo strategy:
     Dark PDF  → logo-icon.png (silver wing on dark bg) + text
     Light PDF → logo-full.png (full brand mark on white bg)

   Image resizing: logos resized at preload time to 200 DPI output
   dimensions. Signature resized via resizeSig() before generate().
   This keeps generate() synchronous and PDFs under ~300KB.
   ─────────────────────────────────────────────────────────────── */

const PDFGenerator = (() => {
  'use strict';

  // PDF output resolution for image resizing
  const PDF_DPI    = 200;
  const mm2px      = mm => Math.round(mm * PDF_DPI / 25.4);

  // Cached, pre-resized logo data URLs
  let _logoIcon     = null;
  let _logoFull     = null;
  let _iconAspect   = 1.0;
  let _fullAspect   = 1.75;

  // ── Theme tokens ─────────────────────────────────
  const THEMES = {
    dark: {
      bg:        '#0A0A0A',
      surface:   '#141414',
      text:      '#F0F0F0',
      textMuted: '#6B6B6B',
      textDim:   '#333333',
      accent:    '#4A90E2',
      border:    '#1E1E1E',
      borderMid: '#2A2A2A',
      total:     '#4A90E2',
      dueColor:  '#E07A5F',
    },
    light: {
      bg:        '#FFFFFF',
      surface:   '#F6F6F6',
      text:      '#111111',
      textMuted: '#666666',
      textDim:   '#BBBBBB',
      accent:    '#1A56DB',
      border:    '#E8E8E8',
      borderMid: '#D5D5D5',
      total:     '#1A56DB',
      dueColor:  '#DC2626',
    },
  };

  // ── Colour helper ────────────────────────────────
  function _hex2rgb(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // ── Fetch URL → base64 data URL ──────────────────
  async function _fetchBase64(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}: ${url}`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(fr.result);
      fr.onerror   = reject;
      fr.readAsDataURL(blob);
    });
  }

  // ── Get aspect ratio of an image data URL ────────
  async function _getAspect(dataURL) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload  = () => resolve(img.naturalWidth / Math.max(img.naturalHeight, 1));
      img.onerror = () => resolve(1.75);
      img.src = dataURL;
    });
  }

  // ── Resize image to target pixel width (PNG, keeps transparency) ──
  // This is the key fix for PDF file size: embed at output resolution,
  // not at original source resolution.
  async function _resizeToWidth(dataURL, targetPx) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        // Already smaller than target — no upscaling needed
        if (img.naturalWidth <= targetPx) { resolve(dataURL); return; }

        const ratio = img.naturalWidth / img.naturalHeight;
        const w = targetPx;
        const h = Math.round(w / ratio);

        const cv = document.createElement('canvas');
        cv.width  = w;
        cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/png'));
      };
      img.onerror = () => resolve(dataURL); // fallback: use original
      img.src = dataURL;
    });
  }

  // ── PUBLIC: resize signature before calling generate() ────────────
  // Dark PDF  → use SigManager.getDataURL()         (light strokes)
  // Light PDF → use SigManager.getInvertedDataURL() (dark strokes)
  async function resizeSig(dataURL) {
    const SIG_W_MM = 65; // must match SIG_W in generate()
    return _resizeToWidth(dataURL, mm2px(SIG_W_MM));
  }

  // ── Preload + resize both logos once at startup ──────────────────
  async function preloadLogos() {
    const [iconResult, fullResult] = await Promise.allSettled([
      _fetchBase64(TW.logos.icon),
      _fetchBase64(TW.logos.full),
    ]);

    if (iconResult.status === 'fulfilled') {
      const raw     = iconResult.value;
      _iconAspect   = await _getAspect(raw);
      // Icon used at ~22mm × iconAspect in PDF → resize to 200 DPI
      _logoIcon     = await _resizeToWidth(raw, mm2px(22 * _iconAspect));
    } else {
      console.warn('logo-icon.png not loaded:', iconResult.reason?.message);
    }

    if (fullResult.status === 'fulfilled') {
      const raw     = fullResult.value;
      _fullAspect   = await _getAspect(raw);
      // Full logo used at ~55mm wide → resize to 200 DPI
      _logoFull     = await _resizeToWidth(raw, mm2px(55));
    } else {
      console.warn('logo-full.png not loaded:', fullResult.reason?.message);
    }
  }

  // ── autoTable compatibility shim ─────────────────
  function _runAutoTable(doc, opts) {
    try {
      if (typeof autoTable === 'function') {
        autoTable(doc, opts);                 // v5+ standalone export
      } else if (typeof doc.autoTable === 'function') {
        doc.autoTable(opts);                  // UMD prototype method
      } else {
        _tableFallback(doc, opts);
      }
    } catch (e) {
      console.warn('autoTable error — fallback renderer:', e.message);
      _tableFallback(doc, opts);
    }
  }

  // ── Manual table fallback ────────────────────────
  function _tableFallback(doc, opts) {
    const ML   = opts.margin?.left  ?? 14;
    const MR   = opts.margin?.right ?? 14;
    const TBW  = 210 - ML - MR;
    const col  = [42, TBW - 42 - 34, 34];
    const cx   = [ML, ML + col[0], ML + col[0] + col[1]];
    let y      = opts.startY;

    // Head
    const hc   = opts.headStyles?.textColor  ?? [74, 144, 226];
    const hbg  = opts.headStyles?.fillColor  ?? [10, 10, 10];
    doc.setFillColor(...hbg);
    doc.rect(ML, y, TBW, 9, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.setTextColor(...hc);
    opts.head[0].forEach((cell, i) => {
      if (i === 2) doc.text(String(cell), cx[i] + col[i] - 4, y + 5.5, { align: 'right' });
      else         doc.text(String(cell), cx[i] + 3, y + 5.5);
    });
    y += 10;

    // Body
    const bodyBg = opts.bodyStyles?.fillColor ?? [20, 20, 20];
    const stc    = opts.styles?.textColor     ?? [240, 240, 240];
    const mtc    = opts.columnStyles?.[1]?.textColor ?? [110, 110, 110];
    const atc    = opts.columnStyles?.[2]?.textColor ?? [74, 144, 226];

    opts.body.forEach(row => {
      const rowY = y;
      const lines = row.map((cell, i) => doc.splitTextToSize(String(cell), col[i] - 6));
      const maxH  = Math.max(...lines.map(l => l.length)) * 4.8 + 12;

      doc.setFillColor(...bodyBg);
      doc.rect(ML, rowY, TBW, maxH, 'F');

      lines.forEach((cellLines, i) => {
        doc.setFontSize(8.5);
        doc.setFont('helvetica', i === 0 || i === 2 ? 'bold' : 'normal');
        doc.setTextColor(...(i === 2 ? atc : i === 1 ? mtc : stc));
        cellLines.forEach((line, li) => {
          if (i === 2) doc.text(line, cx[i] + col[i] - 4, rowY + 6 + li * 4.8, { align: 'right' });
          else         doc.text(line, cx[i] + 3,           rowY + 6 + li * 4.8);
        });
      });
      y = rowY + maxH;
    });
    doc.lastAutoTable = { finalY: y };
  }

  // ── Date formatter ───────────────────────────────
  function _fmtDate(str) {
    if (!str) return '—';
    const [y, m, d] = str.split('-').map(Number);
    const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${MN[m - 1]} ${d}, ${y}`;
  }

  // ── Text-only logo fallback ──────────────────────
  function _textLogo(doc, x, y, C) {
    doc.setFont('helvetica', 'bold');   doc.setFontSize(18);
    doc.setTextColor(..._hex2rgb(C.text));
    doc.text('TWINWAVES', x, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.setTextColor(..._hex2rgb(C.accent));
    doc.text('DIGITAL', x, y + 5.5);
  }

  // ══════════════════════════════════════════════════
  //  GENERATE — synchronous (logos pre-resized, sig pre-resized by caller)
  // ══════════════════════════════════════════════════
  function generate(formData, theme, sigDataURL) {
    if (!window.jspdf?.jsPDF) {
      throw new Error('jsPDF not loaded. Check CDN script in <head>.');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const C   = THEMES[theme];

    const PW  = 210; const PH  = 297;
    const M   = 14;  const RX  = PW - M;
    const CW  = PW - 2*M; const MID = M + CW/2;

    const rgb   = hex => _hex2rgb(hex);
    const setTx = hex => doc.setTextColor(...rgb(hex));
    const setFx = hex => doc.setFillColor(...rgb(hex));
    const setDx = hex => doc.setDrawColor(...rgb(hex));

    // ─ 1. Background ──────────────────────────────
    setFx(C.bg);
    doc.rect(0, 0, PW, PH, 'F');
    setFx(C.accent);
    doc.rect(0, 0, PW, 1.8, 'F');

    // ─ 2. Header ──────────────────────────────────
    const LOGO_H = 22;

    if (theme === 'dark') {
      if (_logoIcon) {
        const iconW = LOGO_H * _iconAspect;
        try { doc.addImage(_logoIcon, 'PNG', M, 10, iconW, LOGO_H); }
        catch { _textLogo(doc, M, 22, C); }
        const tx = M + iconW + 6;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
        setTx(C.text); doc.text('TWINWAVES', tx, 20);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
        setTx(C.accent); doc.text('DIGITAL', tx, 25.5);
      } else {
        _textLogo(doc, M, 22, C);
      }
    } else {
      if (_logoFull) {
        const fullW = LOGO_H * _fullAspect;
        try { doc.addImage(_logoFull, 'PNG', M, 10, fullW, LOGO_H); }
        catch { _textLogo(doc, M, 22, C); }
      } else {
        _textLogo(doc, M, 22, C);
      }
    }

    // INVOICE title
    doc.setFont('helvetica', 'bold'); doc.setFontSize(26);
    setTx(C.text); doc.text('INVOICE', RX, 22, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    setTx(C.accent); doc.text(formData.invoiceNum || '—', RX, 29, { align: 'right' });

    // ─ 3. Date meta ───────────────────────────────
    let metaY = 35;
    const metaLX = RX - 44;
    const printMeta = (label, value, vColor) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      setTx(C.textMuted); doc.text(label, metaLX, metaY);
      doc.setFont('helvetica', 'bold');
      setTx(vColor || C.text); doc.text(value || '—', RX, metaY, { align: 'right' });
      metaY += 5.2;
    };
    printMeta('Issue Date', _fmtDate(formData.invoiceDate));
    printMeta('Due Date',   _fmtDate(formData.dueDate), C.dueColor);

    // ─ 4. Divider ─────────────────────────────────
    let y = 47;
    setDx(C.borderMid); doc.setLineWidth(0.25);
    doc.line(M, y, RX, y);

    // ─ 5. FROM / BILL TO ──────────────────────────
    y += 7;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); setTx(C.accent);
    doc.text('FROM', M, y); doc.text('BILL TO', MID, y);
    y += 6;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setTx(C.text);
    doc.text(TW.company.name, M, y);
    const fromBaseY = y + 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setTx(C.textMuted);
    doc.text(TW.company.email,  M, fromBaseY);
    doc.text(TW.company.phone1, M, fromBaseY + 4.8);
    doc.text(TW.company.phone2, M, fromBaseY + 9.6);
    const fromEndY = fromBaseY + 14;

    let billY = y;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setTx(C.text);
    doc.text((formData.clientBiz || 'Client').trim() || '—', MID, billY);
    billY += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setTx(C.textMuted);
    [formData.contactName, formData.clientPhone, formData.clientEmail]
      .filter(Boolean).forEach(f => { doc.text(f.trim(), MID, billY); billY += 4.8; });
    if (formData.clientAddress?.trim()) {
      const addrLines = doc.splitTextToSize(formData.clientAddress.trim(), MID - M - 6);
      doc.text(addrLines, MID, billY);
      billY += addrLines.length * 4.5;
    }
    y = Math.max(fromEndY, billY) + 7;

    // ─ 6. Service table ───────────────────────────
    setDx(C.borderMid); doc.setLineWidth(0.25); doc.line(M, y, RX, y);
    y += 2;

    const planKey = formData.selectedPlan || 'starter';
    const plan    = planKey === 'custom' ? TW.plans.custom : (TW.plans[planKey] || TW.plans.starter);
    const price   = planKey === 'custom' ? (parseFloat(formData.customPrice) || 0) : plan.price;
    const tableStartY = y;

    _runAutoTable(doc, {
      startY: tableStartY,
      head:   [['SERVICE', 'DESCRIPTION', 'AMOUNT']],
      body:   [[plan.tier, plan.features.join('\n'), `$${price.toLocaleString('en-US')}/mo`]],
      theme:  'plain',
      margin: { left: M, right: M },
      styles: {
        overflow: 'linebreak', cellPadding: { top: 5, right: 4, bottom: 6, left: 4 },
        lineWidth: 0, font: 'helvetica', fontSize: 8.5, valign: 'top',
        textColor: rgb(C.text), fillColor: false,
      },
      headStyles: {
        fontSize: 7, fontStyle: 'bold', textColor: rgb(C.accent),
        fillColor: rgb(C.bg), lineWidth: 0,
        cellPadding: { top: 3, right: 4, bottom: 4, left: 4 },
      },
      bodyStyles: { fillColor: rgb(C.surface), minCellHeight: 16 },
      alternateRowStyles: { fillColor: rgb(C.surface) },
      columnStyles: {
        0: { cellWidth: 42,     fontStyle: 'bold', textColor: rgb(C.text) },
        1: { cellWidth: 'auto',                    textColor: rgb(C.textMuted) },
        2: { cellWidth: 34, halign: 'right', fontStyle: 'bold', textColor: rgb(C.accent) },
      },
    });

    y = (doc.lastAutoTable?.finalY ?? tableStartY + 30) + 4;
    setDx(C.borderMid); doc.setLineWidth(0.25); doc.line(M, y, RX, y);
    y += 8;

    // ─ 7. Total block ─────────────────────────────
    const totalLX = RX - 72;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    setTx(C.textMuted); doc.text('SUBTOTAL', totalLX, y);
    setTx(C.text);      doc.text(`$${price.toLocaleString('en-US')}`, RX, y, { align: 'right' });
    y += 5;
    setTx(C.textMuted); doc.text('TAX', totalLX, y);
    doc.text('—', RX, y, { align: 'right' });
    y += 6;
    setDx(C.borderMid); doc.setLineWidth(0.4);
    doc.line(totalLX, y, RX, y); doc.setLineWidth(0.25);
    y += 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    setTx(C.textMuted); doc.text('TOTAL DUE', totalLX, y);
    doc.setFontSize(15); setTx(C.total);
    doc.text(`$${price.toLocaleString('en-US')}/mo`, RX, y, { align: 'right' });
    y += 14;

    // ─ 8. Payment terms ───────────────────────────
    setDx(C.borderMid); doc.setLineWidth(0.25); doc.line(M, y, RX, y);
    y += 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); setTx(C.accent);
    doc.text('PAYMENT TERMS', M, y); y += 5;
    TW.paymentTerms.forEach(line => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); setTx(C.text);
      doc.text(line, M, y); y += 5;
    });

    // ─ 9. Notes ───────────────────────────────────
    const notesText = formData.notes?.trim() || '';
    if (notesText) {
      y += 4;
      setDx(C.borderMid); doc.setLineWidth(0.25); doc.line(M, y, RX, y);
      y += 6;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); setTx(C.accent);
      doc.text('NOTES', M, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); setTx(C.textMuted);
      const noteLines = doc.splitTextToSize(notesText, CW);
      doc.text(noteLines, M, y);
      y += noteLines.length * 4.6 + 4;
    }

    // ─ 10. Signature ──────────────────────────────
    const SIG_W = 65; const SIG_H = 20; const SIG_X = RX - SIG_W;
    if (sigDataURL && y + SIG_H + 14 < PH - 22) {
      y += 6;
      if (theme === 'light') {
        setFx('#F0F0F0');
        doc.rect(SIG_X - 3, y - 2, SIG_W + 6, SIG_H + 4, 'F');
      }
      try { doc.addImage(sigDataURL, 'PNG', SIG_X, y, SIG_W, SIG_H); }
      catch (e) { console.warn('Sig embed failed:', e.message); }
      y += SIG_H + 2;
      setDx(C.borderMid); doc.setLineWidth(0.4); doc.line(SIG_X, y, RX, y);
      y += 4;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setTx(C.textMuted);
      doc.text('Authorized Signatory', SIG_X + SIG_W / 2, y, { align: 'center' });
      y += 4;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); setTx(C.accent);
      doc.text(TW.company.name, SIG_X + SIG_W / 2, y, { align: 'center' });
    }

    // ─ 11. Footer ─────────────────────────────────
    const FY = PH - 15;
    if (theme === 'dark') { setFx('#060606'); doc.rect(0, PH - 18, PW, 18, 'F'); }
    setDx(C.borderMid); doc.setLineWidth(0.25); doc.line(M, FY - 4, RX, FY - 4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setTx(C.textMuted);
    doc.text(TW.company.email, M, FY);
    doc.text(`${TW.company.phone1}  ·  ${TW.company.phone2}`, RX, FY, { align: 'right' });
    doc.setFontSize(6.5); setTx(C.textDim);
    doc.text(TW.company.tagline, PW / 2, FY, { align: 'center' });

    return doc;
  }

  return { preloadLogos, resizeSig, generate };
})();
