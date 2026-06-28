/* ─── TwinWaves PDF Generator ────────────────────────────────────
   Builds A4 invoice PDFs (dark + light) via jsPDF direct drawing.
   autoTable(doc, opts) syntax used with prototype fallback + manual
   fallback renderer if neither is available.

   Logo strategy:
     Dark PDF  → logo-icon.png (silver wing, reads on dark bg)
                 + "TWINWAVES DIGITAL" drawn in text
     Light PDF → logo-full.png (full brand mark, reads on white bg)
   ─────────────────────────────────────────────────────────────── */

const PDFGenerator = (() => {
  'use strict';

  // ── Loaded logo data ──────────────────────────────
  let _logoIcon     = null;  // base64 data URL
  let _logoFull     = null;
  let _iconAspect   = 1.0;   // W ÷ H
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

  // ── Helpers ───────────────────────────────────────
  function _hex2rgb(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

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

  async function _getAspect(dataURL) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload  = () => resolve(img.naturalWidth / Math.max(img.naturalHeight, 1));
      img.onerror = () => resolve(1.75);
      img.src = dataURL;
    });
  }

  /** Fetch and cache both logos. Call once on startup. */
  async function preloadLogos() {
    const results = await Promise.allSettled([
      _fetchBase64(TW.logos.icon),
      _fetchBase64(TW.logos.full),
    ]);

    if (results[0].status === 'fulfilled') {
      _logoIcon   = results[0].value;
      _iconAspect = await _getAspect(_logoIcon);
    } else {
      console.warn('logo-icon.png not loaded:', results[0].reason?.message);
    }

    if (results[1].status === 'fulfilled') {
      _logoFull   = results[1].value;
      _fullAspect = await _getAspect(_logoFull);
    } else {
      console.warn('logo-full.png not loaded:', results[1].reason?.message);
    }
  }

  // ── autoTable shim ────────────────────────────────
  function _runAutoTable(doc, opts) {
    try {
      if (typeof autoTable === 'function') {
        // v5+ standalone export
        autoTable(doc, opts);
      } else if (typeof doc.autoTable === 'function') {
        // Prototype extension (v3.x and earlier)
        doc.autoTable(opts);
      } else {
        _tableFallback(doc, opts);
      }
    } catch (e) {
      console.warn('autoTable error — using fallback renderer:', e.message);
      _tableFallback(doc, opts);
    }
  }

  /** Manual table renderer for when autoTable isn't available. */
  function _tableFallback(doc, opts) {
    const ML  = opts.margin?.left  ?? 14;
    const MR  = opts.margin?.right ?? 14;
    const TW_ = 210 - ML - MR;                      // table width (mm)
    const col = [42, TW_ - 42 - 34, 34];            // col widths
    const cx  = [ML, ML + col[0], ML + col[0] + col[1]]; // col x positions
    let y = opts.startY;

    // ─ Head row
    const head = opts.head[0];
    const hc   = opts.headStyles?.textColor ?? [74, 144, 226];
    const hfill= opts.headStyles?.fillColor ?? [10, 10, 10];
    doc.setFillColor(...hfill);
    doc.rect(ML, y, TW_, 9, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...hc);
    head.forEach((cell, i) => {
      const tx = i === 2 ? cx[i] + col[i] - 4 : cx[i] + 3;
      if (i === 2) {
        doc.text(String(cell), tx, y + 5.5, { align: 'right' });
      } else {
        doc.text(String(cell), tx, y + 5.5);
      }
    });
    y += 10;

    // ─ Body rows
    const bodyFill = opts.bodyStyles?.fillColor ?? [20, 20, 20];
    const textRgb  = opts.styles?.textColor ?? [240, 240, 240];
    const mutedRgb = opts.columnStyles?.[1]?.textColor ?? [110, 110, 110];
    const accentRgb= opts.columnStyles?.[2]?.textColor ?? [74, 144, 226];

    opts.body.forEach(row => {
      const rowY = y;
      const lines = row.map((cell, i) =>
        doc.splitTextToSize(String(cell), col[i] - 6)
      );
      const maxH = Math.max(...lines.map(l => l.length)) * 4.8 + 12;

      doc.setFillColor(...bodyFill);
      doc.rect(ML, rowY, TW_, maxH, 'F');

      lines.forEach((cellLines, i) => {
        doc.setFontSize(8.5);
        doc.setFont('helvetica', i === 0 || i === 2 ? 'bold' : 'normal');
        if      (i === 2) doc.setTextColor(...accentRgb);
        else if (i === 1) doc.setTextColor(...mutedRgb);
        else              doc.setTextColor(...textRgb);

        if (i === 2) {
          cellLines.forEach((line, li) =>
            doc.text(line, cx[i] + col[i] - 4, rowY + 6 + li * 4.8, { align: 'right' })
          );
        } else {
          cellLines.forEach((line, li) =>
            doc.text(line, cx[i] + 3, rowY + 6 + li * 4.8)
          );
        }
      });

      y = rowY + maxH;
    });

    doc.lastAutoTable = { finalY: y };
  }

  // ── Date formatter ────────────────────────────────
  function _fmtDate(str) {
    if (!str) return '—';
    const [y, m, d] = str.split('-').map(Number);
    const M = ['Jan','Feb','Mar','Apr','May','Jun',
                'Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${M[m - 1]} ${d}, ${y}`;
  }

  // ── Text-only logo fallback ────────────────────────
  function _textLogo(doc, x, y, C) {
    const [tr, tg, tb] = _hex2rgb(C.text);
    const [ar, ag, ab] = _hex2rgb(C.accent);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(tr, tg, tb);
    doc.text('TWINWAVES', x, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(ar, ag, ab);
    doc.text('DIGITAL', x, y + 5.5);
  }

  // ══════════════════════════════════════════════════════
  //  MAIN PDF GENERATOR
  // ══════════════════════════════════════════════════════
  function generate(formData, theme, sigDataURL) {
    if (!window.jspdf?.jsPDF) {
      throw new Error('jsPDF not loaded. Check CDN script in <head>.');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const C   = THEMES[theme];

    // Page constants (mm)
    const PW  = 210;       // page width
    const PH  = 297;       // page height
    const M   = 14;        // horizontal margin
    const RX  = PW - M;   // right content edge  = 196
    const CW  = PW - 2*M; // content width       = 182
    const MID = M + CW/2; // column midpoint     = 105

    // Colour helpers (capture doc + C in closure)
    const rgb    = hex => _hex2rgb(hex);
    const setTx  = hex => doc.setTextColor(...rgb(hex));
    const setFx  = hex => doc.setFillColor(...rgb(hex));
    const setDx  = hex => doc.setDrawColor(...rgb(hex));

    // ─────────────────────────────────────────────────
    // 1. FULL-PAGE BACKGROUND
    // ─────────────────────────────────────────────────
    setFx(C.bg);
    doc.rect(0, 0, PW, PH, 'F');

    // Accent stripe at very top
    setFx(C.accent);
    doc.rect(0, 0, PW, 1.8, 'F');

    // ─────────────────────────────────────────────────
    // 2. HEADER — Logo + INVOICE title
    // ─────────────────────────────────────────────────
    const LOGO_H = 22; // target logo height in mm

    if (theme === 'dark') {
      // Wing icon + text (dark bg: full logo text would be invisible)
      if (_logoIcon) {
        const iconW = LOGO_H * _iconAspect;
        try {
          doc.addImage(_logoIcon, 'PNG', M, 10, iconW, LOGO_H);
        } catch { _textLogo(doc, M, 22, C); }

        // Company name alongside icon
        const textX = M + iconW + 6;
        setTx(C.text);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.text('TWINWAVES', textX, 20);
        setTx(C.accent);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text('DIGITAL', textX, 25.5);
      } else {
        _textLogo(doc, M, 22, C);
      }
    } else {
      // Light PDF: full logo with text — transparent bg, perfect on white
      if (_logoFull) {
        const fullW = LOGO_H * _fullAspect;
        try {
          doc.addImage(_logoFull, 'PNG', M, 10, fullW, LOGO_H);
        } catch { _textLogo(doc, M, 22, C); }
      } else {
        _textLogo(doc, M, 22, C);
      }
    }

    // INVOICE title (right)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    setTx(C.text);
    doc.text('INVOICE', RX, 22, { align: 'right' });

    // Invoice number (accent, below title)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setTx(C.accent);
    doc.text(formData.invoiceNum || '—', RX, 29, { align: 'right' });

    // ─────────────────────────────────────────────────
    // 3. DATE META — right column
    // ─────────────────────────────────────────────────
    let metaY    = 35;
    const metaLX = RX - 44;

    const printMeta = (label, value, vColor) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      setTx(C.textMuted);
      doc.text(label, metaLX, metaY);
      doc.setFont('helvetica', 'bold');
      setTx(vColor || C.text);
      doc.text(value || '—', RX, metaY, { align: 'right' });
      metaY += 5.2;
    };

    printMeta('Issue Date', _fmtDate(formData.invoiceDate));
    printMeta('Due Date',   _fmtDate(formData.dueDate), C.dueColor);

    // ─────────────────────────────────────────────────
    // 4. DIVIDER
    // ─────────────────────────────────────────────────
    let y = 47;
    setDx(C.borderMid);
    doc.setLineWidth(0.25);
    doc.line(M, y, RX, y);

    // ─────────────────────────────────────────────────
    // 5. FROM / BILL TO COLUMNS
    // ─────────────────────────────────────────────────
    y += 7;

    // Column headers
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    setTx(C.accent);
    doc.text('FROM',    M,   y);
    doc.text('BILL TO', MID, y);

    y += 6;

    // FROM — Company name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    setTx(C.text);
    doc.text(TW.company.name, M, y);

    // FROM — Contact details
    const fromBaseY = y + 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setTx(C.textMuted);
    doc.text(TW.company.email,  M, fromBaseY);
    doc.text(TW.company.phone1, M, fromBaseY + 4.8);
    doc.text(TW.company.phone2, M, fromBaseY + 9.6);
    const fromEndY = fromBaseY + 14;

    // BILL TO — Client
    let billY = y; // align with FROM company name baseline
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    setTx(C.text);
    doc.text((formData.clientBiz || 'Client').trim() || '—', MID, billY);

    billY += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setTx(C.textMuted);

    const billFields = [
      formData.contactName?.trim(),
      formData.clientPhone?.trim(),
      formData.clientEmail?.trim(),
    ].filter(Boolean);

    billFields.forEach(f => {
      doc.text(f, MID, billY);
      billY += 4.8;
    });

    if (formData.clientAddress?.trim()) {
      const addrW     = MID - M - 6;
      const addrLines = doc.splitTextToSize(formData.clientAddress.trim(), addrW);
      doc.text(addrLines, MID, billY);
      billY += addrLines.length * 4.5;
    }

    y = Math.max(fromEndY, billY) + 7;

    // ─────────────────────────────────────────────────
    // 6. SERVICE TABLE
    // ─────────────────────────────────────────────────
    setDx(C.borderMid);
    doc.setLineWidth(0.25);
    doc.line(M, y, RX, y);
    y += 2;

    // Resolve plan
    const isDark  = theme === 'dark';
    const planKey = formData.selectedPlan || 'starter';
    const plan    = planKey === 'custom'
      ? TW.plans.custom
      : (TW.plans[planKey] || TW.plans.starter);

    const price = planKey === 'custom'
      ? (parseFloat(formData.customPrice) || 0)
      : plan.price;

    const tableStartY = y;

    _runAutoTable(doc, {
      startY: tableStartY,
      head:   [['SERVICE', 'DESCRIPTION', 'AMOUNT']],
      body:   [[
        plan.tier,
        plan.features.join('\n'),
        `$${price.toLocaleString('en-US')}/mo`,
      ]],
      theme:  'plain',
      margin: { left: M, right: M },
      styles: {
        overflow:    'linebreak',
        cellPadding: { top: 5, right: 4, bottom: 6, left: 4 },
        lineWidth:   0,
        font:        'helvetica',
        fontSize:    8.5,
        valign:      'top',
        textColor:   rgb(C.text),
        fillColor:   false,
      },
      headStyles: {
        fontSize:   7,
        fontStyle:  'bold',
        textColor:  rgb(C.accent),
        fillColor:  rgb(C.bg),
        lineWidth:  0,
        cellPadding: { top: 3, right: 4, bottom: 4, left: 4 },
      },
      bodyStyles: {
        fillColor:     rgb(C.surface),
        minCellHeight: 16,
      },
      alternateRowStyles: {
        fillColor: rgb(C.surface),
      },
      columnStyles: {
        0: { cellWidth: 42,     fontStyle: 'bold', textColor: rgb(C.text) },
        1: { cellWidth: 'auto',                    textColor: rgb(C.textMuted) },
        2: { cellWidth: 34,     halign: 'right', fontStyle: 'bold', textColor: rgb(C.accent) },
      },
    });

    y = (doc.lastAutoTable?.finalY ?? tableStartY + 30) + 4;

    // Line after table
    setDx(C.borderMid);
    doc.setLineWidth(0.25);
    doc.line(M, y, RX, y);
    y += 8;

    // ─────────────────────────────────────────────────
    // 7. TOTAL BLOCK
    // ─────────────────────────────────────────────────
    const totalLX = RX - 72;

    // Subtotal
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setTx(C.textMuted);
    doc.text('SUBTOTAL', totalLX, y);
    setTx(C.text);
    doc.text(`$${price.toLocaleString('en-US')}`, RX, y, { align: 'right' });

    y += 5;

    // Tax
    setTx(C.textMuted);
    doc.text('TAX', totalLX, y);
    doc.text('—', RX, y, { align: 'right' });

    y += 6;

    // Divider (right half)
    setDx(C.borderMid);
    doc.setLineWidth(0.4);
    doc.line(totalLX, y, RX, y);
    doc.setLineWidth(0.25);

    y += 6;

    // Total label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setTx(C.textMuted);
    doc.text('TOTAL DUE', totalLX, y);

    // Total amount (larger, accent colour)
    doc.setFontSize(15);
    setTx(C.total);
    doc.text(`$${price.toLocaleString('en-US')}/mo`, RX, y, { align: 'right' });

    y += 14;

    // ─────────────────────────────────────────────────
    // 8. PAYMENT TERMS
    // ─────────────────────────────────────────────────
    setDx(C.borderMid);
    doc.setLineWidth(0.25);
    doc.line(M, y, RX, y);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    setTx(C.accent);
    doc.text('PAYMENT TERMS', M, y);
    y += 5;

    TW.paymentTerms.forEach(line => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      setTx(C.text);
      doc.text(line, M, y);
      y += 5;
    });

    // ─────────────────────────────────────────────────
    // 9. NOTES (conditional)
    // ─────────────────────────────────────────────────
    const notesText = formData.notes?.trim() || '';
    if (notesText) {
      y += 4;
      setDx(C.borderMid);
      doc.setLineWidth(0.25);
      doc.line(M, y, RX, y);
      y += 6;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      setTx(C.accent);
      doc.text('NOTES', M, y);
      y += 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      setTx(C.textMuted);
      const noteLines = doc.splitTextToSize(notesText, CW);
      doc.text(noteLines, M, y);
      y += noteLines.length * 4.6 + 4;
    }

    // ─────────────────────────────────────────────────
    // 10. SIGNATURE (conditional)
    // ─────────────────────────────────────────────────
    const SIG_W = 65;
    const SIG_H = 20;
    const SIG_X = RX - SIG_W;
    const SIG_TOTAL_H = SIG_H + 14; // sig + line + labels

    if (sigDataURL) {
      // Safety: skip signature if it would crash into footer
      if (y + SIG_TOTAL_H < PH - 22) {
        y += 6;

        if (theme === 'light') {
          // Subtle tinted box behind dark strokes
          setFx('#F0F0F0');
          doc.rect(SIG_X - 3, y - 2, SIG_W + 6, SIG_H + 4, 'F');
        }

        try {
          doc.addImage(sigDataURL, 'PNG', SIG_X, y, SIG_W, SIG_H);
        } catch (e) {
          console.warn('Signature image failed to embed:', e.message);
        }

        y += SIG_H + 2;

        setDx(C.borderMid);
        doc.setLineWidth(0.4);
        doc.line(SIG_X, y, RX, y);

        y += 4;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        setTx(C.textMuted);
        doc.text('Authorized Signatory', SIG_X + SIG_W / 2, y, { align: 'center' });

        y += 4;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        setTx(C.accent);
        doc.text(TW.company.name, SIG_X + SIG_W / 2, y, { align: 'center' });
      }
    }

    // ─────────────────────────────────────────────────
    // 11. FOOTER
    // ─────────────────────────────────────────────────
    const FY = PH - 15; // footer baseline

    if (theme === 'dark') {
      setFx('#060606');
      doc.rect(0, PH - 18, PW, 18, 'F');
    }

    setDx(C.borderMid);
    doc.setLineWidth(0.25);
    doc.line(M, FY - 4, RX, FY - 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setTx(C.textMuted);
    doc.text(TW.company.email, M, FY);
    doc.text(`${TW.company.phone1}  ·  ${TW.company.phone2}`, RX, FY, { align: 'right' });

    // Centre tagline
    doc.setFontSize(6.5);
    setTx(C.textDim);
    doc.text(TW.company.tagline, PW / 2, FY, { align: 'center' });

    return doc;
  }

  return { preloadLogos, generate };
})();
