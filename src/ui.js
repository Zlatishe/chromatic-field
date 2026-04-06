/**
 * ui.js — DOM UI layer.
 *
 * Manages:
 *  T6.1  Bottom bar: palette name, color count, swatches
 *  T6.2  Frosted-glass permission card with entrance animation
 *  T6.3  Loading sequence: LOADING HAND MODEL → SHOW YOUR HAND → fade
 *  T6.4  Touch swipe fallback on bar
 *  T6.5  Tap on COLORS: XX cycles color count
 *  T6.6  Bar expand + horizontal menu track + palette scrub cursor
 */

export class UI {
  constructor() {
    // Bottom bar elements
    this.bottomBar       = document.getElementById('bottom-bar');
    this.paletteName     = document.getElementById('palette-name');
    this.colorCount      = document.getElementById('color-count');
    this.swatchContainer = document.getElementById('color-swatches');

    // Cards
    this.permCard  = document.getElementById('permission-card');
    this.enableBtn = document.getElementById('enable-camera-btn');
    this.denyMsg   = document.getElementById('permission-denied-msg');
    this.webglError = document.getElementById('webgl-error-card');

    // Loading indicator (injected into the bar)
    this._loadingEl = null;

    // Menu track elements (injected into the bar when needed)
    this._trackEl  = null;
    this._cursorEl = null;

    // Guard: enable-camera button fires only once
    this._cameraListenerAttached = false;

    // Track current active swatch index
    this._activeSwatch = -1;
  }

  // ── Permission card ────────────────────────────────────────────

  /**
   * Show permission card with entrance animation.
   * Uses a double-rAF to ensure the transition triggers after display:block.
   */
  showPermissionCard() {
    this.permCard.classList.remove('hidden', 'card-hide');
    // Force reflow then add visible class to play entrance animation
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.permCard.classList.add('card-show');
    }));
  }

  hidePermissionCard() {
    this.permCard.classList.remove('card-show');
    this.permCard.classList.add('card-hide');
    setTimeout(() => this.permCard.classList.add('hidden'), 450);
  }

  showDenyMessage() {
    this.denyMsg.classList.remove('hidden');
  }

  showWebGLError() {
    this.webglError.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.webglError.classList.add('card-show');
    }));
  }

  // ── Loading indicator ──────────────────────────────────────────

  /**
   * T6.3 — Show/update the loading text in the bar.
   * Hides the normal bar content so text isn't obscured.
   */
  showLoading(text = 'LOADING HAND MODEL...') {
    // Dim the normal bar content
    this.paletteName.classList.add('bar-content-dim');
    this.colorCount.classList.add('bar-content-dim');
    this.swatchContainer.classList.add('bar-content-dim');

    if (!this._loadingEl) {
      this._loadingEl = document.createElement('span');
      this._loadingEl.className = 'loading-indicator';
      this.bottomBar.appendChild(this._loadingEl);
    }
    this._loadingEl.textContent = text;
    this._loadingEl.classList.remove('loading-fade');
    this._loadingEl.classList.add('loading-blink');
  }

  /**
   * Transition loading text to a new message (no blink → static).
   * Used for SHOW YOUR HAND state (hand model loaded, waiting).
   */
  updateLoading(text) {
    if (!this._loadingEl) { this.showLoading(text); return; }
    this._loadingEl.classList.remove('loading-blink');
    // Brief flash-off then update text
    this._loadingEl.style.opacity = '0.4';
    setTimeout(() => {
      if (this._loadingEl) {
        this._loadingEl.textContent = text;
        this._loadingEl.style.opacity = '';
      }
    }, 150);
  }

  /** Fade out and remove loading indicator; restore normal bar content. */
  hideLoading() {
    if (!this._loadingEl) return;
    this._loadingEl.classList.remove('loading-blink');
    this._loadingEl.classList.add('loading-fade');

    // Restore bar content
    this.paletteName.classList.remove('bar-content-dim');
    this.colorCount.classList.remove('bar-content-dim');
    this.swatchContainer.classList.remove('bar-content-dim');

    setTimeout(() => {
      this._loadingEl?.remove();
      this._loadingEl = null;
    }, 500);
  }

  // ── Bottom bar content ──────────────────────────────────────────

  /**
   * T6.1 — Refresh palette name, count label, and color swatches.
   * @param {{ name:string, colors:{[n]:Array} }} palette
   * @param {3|4|5} count
   */
  updatePalette(palette, count) {
    // Animate palette name change
    this.paletteName.classList.add('name-flash');
    setTimeout(() => this.paletteName.classList.remove('name-flash'), 300);
    this.paletteName.textContent = palette.name;

    this.colorCount.textContent = `COLORS: ${String(count).padStart(2, '0')}`;

    const colors = palette.colors[count];
    this.swatchContainer.innerHTML = '';
    this._activeSwatch = -1;
    colors.forEach(c => {
      const el  = document.createElement('span');
      el.className = 'swatch';
      const r = Math.round(c.r * 255);
      const g = Math.round(c.g * 255);
      const b = Math.round(c.b * 255);
      el.style.background = `rgb(${r},${g},${b})`;
      this.swatchContainer.appendChild(el);
    });
  }

  /** Highlight nth swatch (used during MENU scrub). */
  highlightSwatch(index) {
    if (index === this._activeSwatch) return;
    this._activeSwatch = index;
    const swatches = this.swatchContainer.querySelectorAll('.swatch');
    swatches.forEach((el, i) => el.classList.toggle('active', i === index));
  }

  clearSwatchHighlight() {
    this._activeSwatch = -1;
    this.swatchContainer.querySelectorAll('.swatch').forEach(el =>
      el.classList.remove('active'));
  }

  // ── Bar expand / menu track (T6.6) ─────────────────────────────

  expandBar() {
    this.bottomBar.classList.add('expanded');
  }

  collapseBar() {
    this.bottomBar.classList.remove('expanded');
    this._removeTrack();
  }

  /**
   * Show the horizontal palette-scrub track inside the expanded bar.
   * Creates tick marks for each palette and a moveable cursor.
   * @param {number} numPalettes
   * @param {number} currentIndex
   */
  showMenuTrack(numPalettes, currentIndex = 0) {
    this._removeTrack(); // clean up any previous

    // Track rail
    this._trackEl = document.createElement('div');
    this._trackEl.className = 'bar-track';

    // Tick marks at each palette position
    for (let i = 0; i < numPalettes; i++) {
      const tick = document.createElement('span');
      tick.className = 'bar-tick';
      tick.style.left = `${(i / (numPalettes - 1)) * 100}%`;
      this._trackEl.appendChild(tick);
    }

    // Cursor
    this._cursorEl = document.createElement('span');
    this._cursorEl.className = 'bar-cursor';
    this._trackEl.appendChild(this._cursorEl);

    this.bottomBar.appendChild(this._trackEl);

    // Trigger entrance
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this._trackEl?.classList.add('bar-track-show');
    }));

    this.updateMenuCursor(currentIndex / Math.max(numPalettes - 1, 1));
  }

  /**
   * Move the scrub cursor to a normalised x position [0, 1].
   * @param {number} normalizedX
   */
  updateMenuCursor(normalizedX) {
    if (!this._cursorEl) return;
    const pct = Math.max(0, Math.min(1, normalizedX)) * 100;
    this._cursorEl.style.left = `${pct}%`;
  }

  _removeTrack() {
    this._trackEl?.remove();
    this._trackEl  = null;
    this._cursorEl = null;
  }

  // ── Touch fallback (T6.4 / T6.5) ──────────────────────────────

  /** Register swipe callbacks for the bottom bar. */
  onBarSwipe(onLeft, onRight) {
    let startX = null;
    this.bottomBar.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
    }, { passive: true });
    this.bottomBar.addEventListener('touchend', e => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) dx < 0 ? onLeft() : onRight();
      startX = null;
    }, { passive: true });
  }

  /** Register tap callback for the color-count label. */
  onColorCountTap(fn) {
    this.colorCount.addEventListener('click', fn);
  }

  /** Register the enable-camera button handler (fires at most once). */
  onEnableCamera(fn) {
    if (this._cameraListenerAttached) return;
    this._cameraListenerAttached = true;
    this.enableBtn.addEventListener('click', fn, { once: true });
  }
}
