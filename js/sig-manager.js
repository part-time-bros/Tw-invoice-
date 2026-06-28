/* ─── TwinWaves Signature Manager ───────────────────
   Wraps signature_pad v5.x.
   - Light pen (#E0E0E0) on transparent canvas → dark PDF ✓
   - getInvertedDataURL() flips to dark strokes  → light PDF ✓
   ─────────────────────────────────────────────────── */

const SigManager = (() => {
  'use strict';

  const CANVAS_ID = 'sigCanvas';
  let _pad = null;

  /** Initialise (or re-init) the signature pad. */
  function init() {
    const canvas = document.getElementById(CANVAS_ID);
    if (!canvas) { console.warn('SigManager: canvas not found'); return; }
    if (!window.SignaturePad) { console.warn('SigManager: SignaturePad lib not loaded'); return; }

    // Create pad first (it sets up its own event listeners)
    _pad = new SignaturePad(canvas, {
      penColor:        'rgba(220, 220, 220, 0.92)',
      backgroundColor: 'rgba(0, 0, 0, 0)',      // transparent
      minWidth:        0.8,
      maxWidth:        2.4,
      throttle:        16,
    });

    // Apply correct pixel density
    _applyDPR(canvas);
  }

  /** Scale canvas to device pixel ratio for crisp rendering. */
  function _applyDPR(canvas) {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    if (w === 0 || h === 0) {
      // Layout not ready — retry next frame
      requestAnimationFrame(() => _applyDPR(canvas));
      return;
    }

    const data = _pad && !_pad.isEmpty() ? _pad.toData() : null;

    canvas.width  = w * ratio;
    canvas.height = h * ratio;
    canvas.getContext('2d').scale(ratio, ratio);

    if (_pad) {
      _pad.clear();
      if (data && data.length > 0) _pad.fromData(data);
    }
  }

  /** Clear the signature canvas. */
  function clear() {
    if (_pad) _pad.clear();
  }

  /** True if no signature has been drawn. */
  function isEmpty() {
    return !_pad || _pad.isEmpty();
  }

  /**
   * Returns PNG data URL with light strokes on transparent background.
   * Use for dark-theme PDF (strokes visible on dark page).
   */
  function getDataURL() {
    if (isEmpty()) return null;
    return _pad.toDataURL('image/png');
  }

  /**
   * Returns PNG data URL with INVERTED strokes on transparent background.
   * Use for light-theme PDF (turns light strokes to dark so they read on white).
   */
  function getInvertedDataURL() {
    if (isEmpty()) return null;

    const src = _pad.canvas;
    const tmp = document.createElement('canvas');
    tmp.width  = src.width;
    tmp.height = src.height;
    const ctx  = tmp.getContext('2d');
    ctx.drawImage(src, 0, 0);

    const imgData = ctx.getImageData(0, 0, tmp.width, tmp.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 10) {            // skip fully transparent pixels
        d[i]     = 255 - d[i];        // R
        d[i + 1] = 255 - d[i + 1];   // G
        d[i + 2] = 255 - d[i + 2];   // B
        // alpha unchanged
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return tmp.toDataURL('image/png');
  }

  /** Re-apply DPR on window resize (preserves existing signature data). */
  function resize() {
    const canvas = document.getElementById(CANVAS_ID);
    if (canvas && _pad) _applyDPR(canvas);
  }

  return { init, clear, isEmpty, getDataURL, getInvertedDataURL, resize };
})();
