// Content script: inject overlay and listen for keyboard shortcut
(function () {
  if (window.__ENHANCED_SEARCH_INSTALLED__) return;
  window.__ENHANCED_SEARCH_INSTALLED__ = true;
  // Disable worker usage by default to avoid CSP / cross-origin errors on some sites.
  // If we reintroduce workers later, gate them behind this flag.
  window.__ES_DISABLE_WORKER = true;

  // Load persisted settings (worker opt-in, theme, exclude selectors) early
  function loadPersistentSettings() {
    try {
      chrome.storage.local.get(['worker','theme','excludeSelectors','excludeJson'], (s) => {
        const opts = s || {};
        // worker: user opt-in enables worker; default false -> keep disabled
        if (typeof opts.worker !== 'undefined') window.__ES_DISABLE_WORKER = !opts.worker;
        // apply theme class
        if (opts.theme === 'light') document.documentElement.classList.add('es-theme-light');
        else document.documentElement.classList.remove('es-theme-light');
      });
    } catch (e) {}
  }
  loadPersistentSettings();

  const injectOverlay = () => {
    if (document.getElementById('enhanced-search-overlay')) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('src/overlay.css');
    document.head.appendChild(link);

    const overlay = document.createElement('div');
    overlay.id = 'enhanced-search-overlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-label','Enhanced Search');
    overlay.innerHTML = `
      <div class="es-container" role="dialog" aria-label="Enhanced search" tabindex="-1">
        <div class="es-drag-handle" id="es-drag-handle" title="Drag to move the overlay">
          <!-- hand grip icon -->
          <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
            <path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M7 11V6a2 2 0 1 1 4 0v6m0-6v6M11 4.5V11m0 0v6c0 1.1.9 2 2 2h3.5c.9 0 1.6-.7 1.6-1.6V9.5c0-1.1-.9-2-2-2H16"/>
          </svg>
        </div>
        <button id="es-close-btn" class="es-close" title="Close enhanced search" aria-label="Close enhanced search">
          <svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M6 6L18 18M6 18L18 6"/></svg>
        </button>
        <div class="es-meta" style="margin-bottom:8px"><span id="es-counter">Result 0 of 0</span> <span id="es-active-filter" class="es-active-filter"></span>
          <div class="es-quick-actions" style="margin-left:8px;display:flex;gap:6px;align-items:center">
            <button id="es-clear-highlights" class="es-quick" title="Clear highlights">Clear</button>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <input id="es-go-to" class="es-go-to" placeholder="Go to #" style="width:55px;padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:#e6edf3" />
          <input id="es-input" class="es-input" placeholder="Search..." list="es-history" style="flex:1 1 auto" />
        </div>
        <datalist id="es-history"></datalist>
        <div id="es-options" class="es-options">
          <!-- moved advanced toggles into Advanced Settings panel; main bar simplified -->
          <button id="es-mode-toggle" class="es-mode-toggle" title="Toggle search mode: Whole words / Partial matches">Mode</button>
          <span class="es-sep" aria-hidden="true"></span>
          <button id="es-settings-toggle" class="es-settings-toggle" title="Settings"> Settings
            
          </button>
          
        </div>
        <div id="es-settings" class="es-settings" style="display:none; margin-top:6px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong style="font-size:13px;color:#cfdfe6">Advanced Settings</strong>
            <button id="es-advanced-toggle" title="Collapse/expand advanced settings" style="background:transparent;border:0;color:#9fb0ba">▾</button>
          </div>
          <div id="es-advanced-panel" style="margin-top:8px">
            <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
              <!-- Expose main checkboxes here (mirrors main bar) -->
              <label title="Toggle case-sensitive search (mirror)"><input type="checkbox" id="es-adv-case"> Aa</label>
              <label title="Toggle regex mode (mirror)"><input type="checkbox" id="es-adv-regex"> Regex </label>
              <label title="Include HTML element types in results (mirror)"><input type="checkbox" id="es-adv-html"> HTML</label>
            </div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:8px">
              <label title="Include heading elements"><input type="checkbox" id="es-filter-headings"> Headings</label>
              <label title="Include link elements"><input type="checkbox" id="es-filter-links"> Links</label>
              <label title="Include paragraph elements"><input type="checkbox" id="es-filter-paragraphs"> Paragraphs</label>
            </div>
            <div style="margin-top:8px;display:flex;gap:12px;align-items:center">
              <label title="Skip matches inside code/pre/style blocks"><input type="checkbox" id="es-skip-code"> Skip code blocks</label>
            </div>
            <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
              <label title="Reduce the search window width to 50%"><input type="checkbox" id="es-compact"> Compact (50%)</label>
              <button id="es-reset-pos" class="es-reset-pos" title="Reset overlay position">Reset position</button>
            </div>
          </div>
        </div>
        
        <div id="es-results" class="es-results"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = document.getElementById('es-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        overlay.style.display = 'none';
        input.blur();
      }
    });
    // load saved options into the overlay controls
    try { loadOptionsIntoOverlay(); } catch (e) {}

    // live search as you type (debounced)
    input.addEventListener('input', debounce((ev) => {
      performSearch(ev.target.value);
    }, 200));

    // Navigation buttons (previous/next)
    const results = overlay.querySelector('#es-results');
    results.setAttribute('role','list');
    results.addEventListener('click', (ev) => {
      const target = ev.target.closest('.es-result-item');
      if (target) {
        const idx = Number(target.dataset.index);
        jumpToMatch(idx);
      }
    });

    // keyboard navigation only: remove visual nav buttons from DOM (keyboard users only)
    const btnNext = overlay.querySelector('#es-next'); if (btnNext) btnNext.remove();
    const btnPrev = overlay.querySelector('#es-prev'); if (btnPrev) btnPrev.remove();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); nextMatch(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); prevMatch(); }
    });

    // populate history datalist
    populateHistoryDatalist();
    // Go-to input: jump to specific result number on Enter
    try {
      const goTo = overlay.querySelector('#es-go-to');
      if (goTo) {
        goTo.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            const v = parseInt(goTo.value, 10);
            const total = window.__es_total_matches__ || currentMatches.length;
            if (!isNaN(v) && v >= 1 && v <= total) jumpToMatch(v - 1);
          }
        });
      }
    } catch (e) {}

    // add titles/tooltips for controls to improve discoverability
    try {
      const tCase = document.getElementById('es-case'); if (tCase) tCase.title = 'Toggle case-sensitive search';
      const tRegex = document.getElementById('es-regex'); if (tRegex) tRegex.title = 'Toggle regular expression mode';
      const tHtml = document.getElementById('es-html-filter'); if (tHtml) tHtml.title = 'Include HTML element types in results';
      const settingsBtn = document.getElementById('es-settings-toggle'); if (settingsBtn) settingsBtn.title = 'Open settings';
      // export UI removed; quickExport handles JSON export
      const exportBtn = null;
      const exTxt = null;
      const exCsv = null;
      const exJson = null;
      // settings panel checkboxes
      const fh = document.getElementById('es-filter-headings'); if (fh) fh.title = 'Include headings in results';
      const fl = document.getElementById('es-filter-links'); if (fl) fl.title = 'Include links in results';
      const fp = document.getElementById('es-filter-paragraphs'); if (fp) fp.title = 'Include paragraphs in results';
    } catch (e) {}

    // make overlay draggable via drag handle
    try {
      const handle = document.getElementById('es-drag-handle');
      if (handle) {
        let isDown = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;
        // improved drag: attach temporary listeners on pointerdown and remove on pointerup
        handle.style.touchAction = 'none'; // ensure pointer events behave
        const onPointerMove = (e) => {
          try {
            e.preventDefault();
            if (!isDown) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            let newLeft = startLeft + dx;
            let newTop = startTop + dy;
            // snap-to-edge behavior within 18px of viewport edges
            const SNAP = 18;
            if (Math.abs(newLeft - 8) <= SNAP) newLeft = 8;
            if (Math.abs(newTop - 8) <= SNAP) newTop = 8;
            if (Math.abs((window.innerWidth - overlay.offsetWidth - 8) - newLeft) <= SNAP) newLeft = window.innerWidth - overlay.offsetWidth - 8;
            if (Math.abs((window.innerHeight - overlay.offsetHeight - 8) - newTop) <= SNAP) newTop = window.innerHeight - overlay.offsetHeight - 8;
            newLeft = Math.max(8, Math.min(window.innerWidth - 8 - overlay.offsetWidth, newLeft));
            newTop = Math.max(8, Math.min(window.innerHeight - 8 - overlay.offsetHeight, newTop));
            overlay.style.left = newLeft + 'px';
            overlay.style.top = newTop + 'px';
            overlay.style.transform = 'none';
            overlay.style.position = 'fixed';
          } catch (err) {}
        };

        const onPointerUp = (e) => {
          try {
            if (!isDown) return;
            isDown = false;
            try { handle.releasePointerCapture && handle.releasePointerCapture(e.pointerId); } catch (er) {}
            // persist location
            try { chrome.storage.local.set({ overlayLeft: parseInt(overlay.style.left,10), overlayTop: parseInt(overlay.style.top,10) }); } catch (err) {}
          } finally {
            window.removeEventListener('pointermove', onPointerMove, { passive: false });
            window.removeEventListener('pointerup', onPointerUp);
          }
        };

        handle.addEventListener('pointerdown', (e) => {
          try {
            e.preventDefault();
            isDown = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = overlay.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            handle.setPointerCapture && handle.setPointerCapture(e.pointerId);
            window.addEventListener('pointermove', onPointerMove, { passive: false });
            window.addEventListener('pointerup', onPointerUp);
          } catch (err) {}
        });
        // make the entire meta bar draggable too (but ignore clicks on interactive controls)
        try {
          const metaBar = overlay.querySelector('.es-meta');
          if (metaBar) {
            metaBar.addEventListener('pointerdown', (e) => {
              try {
                // don't start drag if the user targeted a control inside the meta bar
                const interactive = e.target.closest && e.target.closest('button,input,select,textarea,a,[role="button"]');
                if (interactive) return;
                e.preventDefault();
                isDown = true;
                startX = e.clientX;
                startY = e.clientY;
                const rect = overlay.getBoundingClientRect();
                startLeft = rect.left;
                startTop = rect.top;
                window.addEventListener('pointermove', onPointerMove, { passive: false });
                window.addEventListener('pointerup', onPointerUp);
              } catch (err) {}
            });
          }
        } catch (err) {}
      }
    } catch (e) {}

    // wire reset-position and compact mode
    try {
      const resetBtn = overlay.querySelector('#es-reset-pos');
      if (resetBtn) resetBtn.addEventListener('click', () => {
        try {
          overlay.style.left = '';
          overlay.style.top = '';
          overlay.style.transform = 'translateX(-50%)';
          overlay.style.position = '';
          chrome.storage.local.remove(['overlayLeft','overlayTop']);
        } catch (e) {}
      });
      const compact = overlay.querySelector('#es-compact');
      if (compact) {
        // restore saved compact state
        try { chrome.storage.local.get(['compactMode'], (s) => { if (s && s.compactMode) compact.checked = !!s.compactMode; overlayApplyCompact(!!(s && s.compactMode)); }); } catch (e) {}
        compact.addEventListener('change', () => { const v = !!compact.checked; try { chrome.storage.local.set({ compactMode: v }); } catch (e) {} overlayApplyCompact(v); });
      }
      // close button wiring
      try {
        const closeBtn = overlay.querySelector('#es-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', () => { try { overlay.style.display = 'none'; } catch (e) {} });
      } catch (e) {}
    } catch (e) {}

    // advanced panel toggle and quick actions wiring
    try {
      const advToggle = overlay.querySelector('#es-advanced-toggle');
      const advPanel = overlay.querySelector('#es-advanced-panel');
      if (advToggle && advPanel) {
        let open = true;
        advToggle.addEventListener('click', () => { open = !open; advPanel.style.display = open ? 'block' : 'none'; advToggle.textContent = open ? '▾' : '▸'; });
      }
      const clearBtn = overlay.querySelector('#es-clear-highlights');
      if (clearBtn) clearBtn.addEventListener('click', () => { clearHighlights(); currentMatches = []; updateResultsUI([]); });
      const quickExport = overlay.querySelector('#es-export-quick');
      if (quickExport) quickExport.addEventListener('click', () => exportResults('json'));
      // map new friendly excludes to storage fields used in scanning
      const skipCode = overlay.querySelector('#es-skip-code');
      if (skipCode) {
        // initialize skipCode from storage (default: true)
        try {
          chrome.storage.local.get(['excludeSelectors'], (s) => {
            try {
              const ex = s && s.excludeSelectors;
              if (typeof ex === 'undefined' || ex === null || ex === '') {
                // default to on
                skipCode.checked = true;
                chrome.storage.local.set({ excludeSelectors: 'pre,code,style' });
              } else {
                skipCode.checked = !!(ex && ex.indexOf('pre') >= 0);
              }
            } catch (e) {}
          });
        } catch (e) {}
        skipCode.addEventListener('change', () => { try { chrome.storage.local.set({ excludeSelectors: skipCode.checked ? 'pre,code,style' : '' }); performSearch(document.getElementById('es-input').value); } catch(e){} });
      }
      // 'Ignore headers' control removed (duplicates 'Headings' checkbox)
      // search mode toggle (Whole words / Partial matches)
      const modeBtn = overlay.querySelector('#es-mode-toggle');
      try { chrome.storage.local.get(['wholeMode'], (s)=> { const wholeMode = s && typeof s.wholeMode !== 'undefined' ? !!s.wholeMode : true; if (modeBtn) { modeBtn.classList.toggle('active', wholeMode); modeBtn.title = wholeMode ? 'Whole words mode' : 'Partial matches mode'; } }); } catch(e) {}
      if (modeBtn) modeBtn.addEventListener('click', () => { try { chrome.storage.local.get(['wholeMode'], (s)=> { const current = s && typeof s.wholeMode !== 'undefined' ? !!s.wholeMode : true; const next = !current; chrome.storage.local.set({ wholeMode: next }); modeBtn.classList.toggle('active', next); modeBtn.title = next ? 'Whole words mode' : 'Partial matches mode'; saveOptionsToStorage(); performSearch(document.getElementById('es-input').value); }); } catch(e){} });
    } catch (e) {}

    // persist toggles live and re-run search
    ['es-case','es-regex','es-html-filter','es-filter-headings','es-filter-links','es-filter-paragraphs','es-adv-case','es-adv-regex','es-adv-html'].forEach(id => {
      const el = overlay.querySelector('#'+id);
      if (el) el.addEventListener('change', () => {
        // mirror advanced toggles into main controls (if present) - omit 'whole' as it's controlled by mode toggle
        try {
          if (id === 'es-adv-case') { const main = overlay.querySelector('#es-case'); if (main) main.checked = el.checked; }
          if (id === 'es-adv-regex') { const main = overlay.querySelector('#es-regex'); if (main) main.checked = el.checked; }
          if (id === 'es-adv-html') { const main = overlay.querySelector('#es-html-filter'); if (main) main.checked = el.checked; }
        } catch (e) {}
        saveOptionsToStorage(); performSearch(document.getElementById('es-input').value);
      });
      // make larger hit area for accessibility
      if (el && el.parentElement) el.parentElement.style.padding = '6px 8px';
    });
    // load exclude selectors and json option
    const exInput = overlay.querySelector('#es-exclude-selectors');
    const exJsonInput = overlay.querySelector('#es-exclude-json');
    try { chrome.storage.local.get(['excludeSelectors','excludeJson'], (s) => { if (exInput) exInput.value = s.excludeSelectors || ''; if (exJsonInput) exJsonInput.checked = !!s.excludeJson; }); } catch (e) {}
    if (exInput) exInput.addEventListener('change', () => { chrome.storage.local.set({ excludeSelectors: exInput.value }); performSearch(document.getElementById('es-input').value); });
    if (exJsonInput) exJsonInput.addEventListener('change', () => { chrome.storage.local.set({ excludeJson: exJsonInput.checked }); performSearch(document.getElementById('es-input').value); });
    // settings toggle to show/hide exclusions
    const settingsToggle = overlay.querySelector('#es-settings-toggle');
    const settingsPanel = overlay.querySelector('#es-settings');
    if (settingsToggle && settingsPanel) settingsToggle.addEventListener('click', () => { settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none'; });
    
    // wire new export menu
    // export UI removed - exports still available via quickExport button (JSON)
    const exportToggle = null;
    const exportMenu = null;
    const exportTxt = null;
    const exportCsv = null;
    const exportJson = null;
  };

  // ensure UID counter exists
  if (!window.__es_uid_counter__) window.__es_uid_counter__ = 1;
  // active element tag filter (click a tag in results to filter)
  let activeTagFilter = null;

  // Experimental: try to create a blob worker when enabled in options
  async function getBlobWorker() {
    // Strict guard: do not create workers unless explicitly allowed by a runtime flag
    // This avoids CSP/SecurityError on pages that block extension worker scripts.
    if (window.__ES_DISABLE_WORKER) return null;
    if (!window.__ES_ALLOW_WORKER_CREATION__) return null;
    try {
      const workerUrl = chrome.runtime.getURL('src/worker.js');
      const res = await fetch(workerUrl);
      const code = await res.text();
      const blob = new Blob([code], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      try {
        return new Worker(blobUrl);
      } catch (we) {
        console.warn('Worker construction failed', we);
        URL.revokeObjectURL(blobUrl);
        return null;
      }
    } catch (e) {
      // fetch/creation failed; swallow to avoid noisy console errors on pages with strict CSP
      return null;
    }
  }

  const showOverlay = () => {
    injectOverlay();
    const overlay = document.getElementById('enhanced-search-overlay');
    overlay.style.display = 'block';
    // restore last position and compact mode if saved
    try {
      chrome.storage.local.get(['overlayLeft','overlayTop','compactMode'], (s) => {
        try {
          const left = s && s.overlayLeft;
          const top = s && s.overlayTop;
          if (typeof left === 'number' && typeof top === 'number') {
            overlay.style.left = left + 'px';
            overlay.style.top = top + 'px';
            overlay.style.transform = 'none';
            overlay.style.position = 'fixed';
          }
          try { if (s && s.compactMode) overlayApplyCompact(!!s.compactMode); } catch (e) {}
        } catch (e) {}
      });
    } catch (e) {}
    const input = document.getElementById('es-input');
    input.focus();
    // update counter UI immediately
    updatePositionCounter();
    // attach global key handler for navigation while overlay is open
    if (!window.__es_overlay_key_handler__) {
      window.__es_overlay_key_handler__ = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); nextMatch(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); prevMatch(); }
        if (e.key === 'Home') { e.preventDefault(); jumpToMatch(0); }
        if (e.key === 'End') { e.preventDefault(); jumpToMatch(currentMatches.length - 1); }
        if (e.key === 'Enter') { e.preventDefault(); nextMatch(); }
        if (e.key === 'Escape') { closeOverlay(); }
      };
      window.addEventListener('keydown', window.__es_overlay_key_handler__, true);
    }
    // apply theme from storage
    try { chrome.storage.local.get(['theme'], (s) => { if (s.theme === 'light') document.documentElement.classList.add('es-theme-light'); else document.documentElement.classList.remove('es-theme-light'); }); } catch (e) {}
    // trap focus inside overlay
    try { trapFocus(); } catch (e) {}
    // disable worker creation by default on pages where extension context may be invalidated
    window.__ES_ALLOW_WORKER_CREATION__ = false;
  };

  function closeOverlay() {
    const overlay = document.getElementById('enhanced-search-overlay');
    if (overlay) overlay.style.display = 'none';
    const input = document.getElementById('es-input');
    if (input) input.blur();
    if (window.__es_overlay_key_handler__) {
      window.removeEventListener('keydown', window.__es_overlay_key_handler__, true);
      window.__es_overlay_key_handler__ = null;
    }
  }

  // Intercept Ctrl+F / Command+F (capture phase) and override browser find
  window.addEventListener('keydown', (e) => {
    try {
      const key = (e.key || '').toLowerCase();
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? e.metaKey : e.ctrlKey;
      // match either 'f' key or physical KeyF
      if (ctrlKey && (key === 'f' || e.code === 'KeyF')) {
        // Prevent native find and stop propagation so pages cannot intercept and open their own find
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        showOverlay();
      }
    } catch (err) {
      // ignore errors from invalid extension context
    }
  }, true);

  // also listen for the command
  chrome.runtime.onMessage.addListener((req, sender, respond) => {
    try {
      if (req.action === 'ping') {
        // Respond to ping to indicate content script is ready
        respond({ ready: true });
      } else if (req.action === 'open-enhanced-search') {
        showOverlay();
        respond({ success: true });
      } else if (req.action === 'search-selection') {
        // Handle search selection logic here
        showOverlay();
        // Set the search input to the selected text
        const input = document.getElementById('es-input');
        if (input && req.text) {
          input.value = req.text;
          performSearch(req.text);
        }
        respond({ success: true });
      }
    } catch (e) {
      // Extension context invalidated; ignore
    }
    return true; // Keep the message channel open for async responses
  });

  // Current matches from search
  let currentMatches = [];
  let currentIndex = 0;
  // scan token to prevent overlapping/duplicate scans
  let currentScanToken = 0;

  function clearHighlights() {
    const spans = document.querySelectorAll('.es-highlight');
    spans.forEach((s) => {
      try {
        const parent = s.parentNode;
        parent.replaceChild(document.createTextNode(s.textContent), s);
        parent.normalize();
      } catch (e) {}
    });
  }

  function performSearch(query) {
    // bump scan token to cancel any in-flight scan
    currentScanToken++;
    const myScanToken = currentScanToken;
    // clear old highlights and reset counts/UI immediately to avoid stale/duplicated state
    clearHighlights();
    currentMatches = [];
    window.__es_total_matches__ = 0;
    window.__es_cap__ = 0;
    try { updateResultsUI([]); } catch (e) {}
    // normalize DOM text nodes to avoid split artifacts from previous highlights
    try { document.body.normalize(); } catch (e) {}
    if (!query) {
      updateResultsUI([]);
      return;
    }
    // read toggles from advanced controls (main controls were moved)
    const caseSensitive = (document.getElementById('es-adv-case') || document.getElementById('es-case'))?.checked || false;
    const modeBtnEl = document.getElementById('es-mode-toggle');
    const wholeWord = modeBtnEl ? modeBtnEl.classList.contains('active') : false;
    const isRegex = (document.getElementById('es-adv-regex') || document.getElementById('es-regex'))?.checked || false;

    let pattern;
    try {
      if (isRegex) {
        // allow user to input /pattern/flags or plain pattern
        let body = query;
        let userFlags = '';
        if (body.length >= 2 && body[0] === '/' && body.lastIndexOf('/') > 0) {
          const last = body.lastIndexOf('/');
          userFlags = body.slice(last + 1);
          body = body.slice(1, last);
        }
        let flags = (userFlags || '') + 'g';
        if (caseSensitive) flags = flags.replace(/i/g, '');
        flags = Array.from(new Set(flags.split(''))).join('');
        pattern = new RegExp(body, flags);
      } else {
        pattern = new RegExp(wholeWord ? `\\b${escapeRegExp(query)}\\b` : escapeRegExp(query), caseSensitive ? 'g' : 'gi');
      }
    } catch (e) {
      console.warn('Invalid regex', e);
      try { const counter = document.getElementById('es-counter'); if (counter) counter.textContent = 'Invalid regex'; } catch (err) {}
      return;
    }

    // collect matches per text node, excluding certain containers and invisible elements
    // For performance: limit scanning depth / skip extremely large text nodes
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    const nodeMatches = new Map();
    const excludedTagsBase = new Set(['SCRIPT','NOSCRIPT']);
    const optionalHtmlTags = new Set(['STYLE','PRE','CODE','TEXTAREA']);
    const htmlFilterElLocal = (document.getElementById('es-adv-html') || document.getElementById('es-html-filter'));
    const htmlFilterOn = htmlFilterElLocal ? !!htmlFilterElLocal.checked : true;
    // support multi-term: split query by commas or semicolons
    let termPatterns = [];
    if (isRegex) {
      // use user-provided regex pattern (already compiled above)
      termPatterns = [{ pattern: pattern, index: 0 }];
    } else {
      const termList = query.split(/[,;]+/).map(t => t.trim()).filter(Boolean);
      termPatterns = termList.map((t, idx) => {
        try {
          return { pattern: new RegExp(wholeWord ? `\\b${escapeRegExp(t)}\\b` : escapeRegExp(t), caseSensitive ? 'g' : 'gi'), index: idx };
        } catch (e) { return null; }
      }).filter(Boolean);
    }
    // chunked scanning: process N nodes per tick to avoid blocking
    const N = 200;
    let nodesProcessed = 0;
    // read options from DOM (immediate) to reflect current checkboxes/selectors
    let storageOptions = {};
    try {
      const exEl = document.getElementById('es-exclude-selectors');
      const exJsonEl = document.getElementById('es-exclude-json');
      storageOptions.excludeSelectors = exEl ? exEl.value : '';
      storageOptions.excludeJson = exJsonEl ? !!exJsonEl.checked : false;
    } catch (e) { storageOptions = {}; }

    let finished = false;
    const processChunk = () => {
      // abort if a new search has started
      if (myScanToken !== currentScanToken) return;
      let i = 0;
      for (; i < N; i++) {
        if (!walker.nextNode()) { finished = true; break; }
        const node = walker.currentNode;
        // skip nodes inside excluded containers or inside the overlay itself
        let parent = node.parentElement;
        let skip = false;
        // if node is inside the overlay, skip it (we only search the page)
        try { if (node.parentElement && node.parentElement.closest && node.parentElement.closest('#enhanced-search-overlay')) { skip = true; } } catch (e) {}
        while (parent) {
          const tag = parent.tagName;
          if (excludedTagsBase.has(tag)) { skip = true; break; }
          if (optionalHtmlTags.has(tag) && !htmlFilterOn) { skip = true; break; }
          try {
            const style = window.getComputedStyle(parent);
            if (style && (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0)) { skip = true; break; }
          } catch (e) {}
          parent = parent.parentElement;
        }
        if (skip) { nodesProcessed++; continue; }

        const text = node.nodeValue;
        if (!text || text.trim() === '') { nodesProcessed++; continue; }
        if (text.length > 20000) { nodesProcessed++; continue; }

        // run each term pattern separately to capture termIndex
        const matches = [];
        termPatterns.forEach(tp => {
          let m;
          while ((m = tp.pattern.exec(text)) !== null) {
            matches.push({ index: m.index, length: m[0].length, match: m[0], context: getContext(text, m.index), element: node.parentElement ? node.parentElement.tagName.toLowerCase() : '', termIndex: tp.index });
            if (!tp.pattern.global) break;
          }
        });

        // apply exclude selectors from options (read from DOM)
        let exclude = false;
        try {
          const exRaw = storageOptions || {};
          const excludeJson = exRaw && exRaw.excludeJson;
          if (exRaw) {
            const selectors = (exRaw.excludeSelectors || '').split(',').map(s => s.trim()).filter(Boolean);
            for (const sel of selectors) {
              try { if (node.parentElement && node.parentElement.closest && node.parentElement.closest(sel)) { exclude = true; break; } } catch (e) {}
            }
            // simple JSON-like detection: long node with many braces/quotes
            if (!exclude && excludeJson && text && (text.length > 200 && /\{.*\}|\"\w+\":/.test(text))) exclude = true;
          }
        } catch (e) {}
        if (exclude) { nodesProcessed++; continue; }
        const htmlFilterEl = document.getElementById('es-html-filter');
        // If HTML filter is unchecked, exclude matches that are inside text that looks like HTML markup
        try {
          if (htmlFilterEl && !htmlFilterEl.checked) {
            // if the text node contains HTML-like tags, skip
            if (/</.test(text) && />/.test(text) && /<\/?[a-zA-Z][^>]*>/.test(text)) { nodesProcessed++; continue; }
            // also skip if the nearest ancestor's text looks like HTML markup
            const anc = node.parentElement;
            try {
              if (anc && /<\/?[a-zA-Z][^>]*>/.test(anc.textContent || '')) { nodesProcessed++; continue; }
            } catch (e) {}
            // additionally detect CSS-like content (property: value; or rotate()/deg) and skip those when HTML filter is off
            try {
              if (/\b[a-z-]+\s*:\s*[^;]{0,120};?/.test(text) || /rotate\(|\bdeg\b/.test(text)) { nodesProcessed++; continue; }
            } catch (e) {}
          }
        } catch (e) {}
        // element type filters
        const fh = document.getElementById('es-filter-headings');
        const fl = document.getElementById('es-filter-links');
        const fp = document.getElementById('es-filter-paragraphs');
        const nodeTag = node.parentElement ? node.parentElement.tagName.toLowerCase() : '';
        const elementAllowed = (() => {
          if (!nodeTag) return true;
          if ((nodeTag === 'a' || nodeTag === 'area') && fl && !fl.checked) return false;
          if (/^h[1-6]$/.test(nodeTag) && fh && !fh.checked) return false;
          if (nodeTag === 'p' && fp && !fp.checked) return false;
          return true;
        })();
        if (!elementAllowed) { /* skip */ }
        else if (htmlFilterEl && !htmlFilterEl.checked) {
          // Filter out matches that look like HTML tags when HTML filter is off
          const filtered = matches.filter(m => !/^<\/?[a-zA-Z][^>]*>/.test(m.match));
          if (filtered.length) nodeMatches.set(node, filtered);
        } else {
          if (matches.length) nodeMatches.set(node, matches);
        }

        nodesProcessed++;
      }

      if (!finished) {
        if (myScanToken !== currentScanToken) return;
        if (window.requestIdleCallback) requestIdleCallback(processChunk, { timeout: 50 });
        else setTimeout(processChunk, 16);
        return;
      }

      // finished scanning, now process nodeMatches into highlights
      // abort if a newer scan started while we were finishing
      if (myScanToken !== currentScanToken) return;
      const highlights = [];
      const seen = new Set();
      nodeMatches.forEach((matches, textNode) => {
        matches.sort((a, b) => b.index - a.index);
        matches.forEach((m) => {
          try {
            // build a stable signature to avoid duplicate highlights: path + index + match
            const sigParts = [];
            let n = textNode.parentElement;
            while (n && n !== document.body && n.nodeType === 1) {
              let idx = 0;
              let sib = n;
              while (sib.previousElementSibling) { sib = sib.previousElementSibling; idx++; }
              sigParts.unshift(n.tagName.toLowerCase() + '[' + idx + ']');
              n = n.parentElement;
            }
            const sig = sigParts.join('>') + '|' + (m.index || 0) + '|' + (m.length || 0) + '|' + (m.match || '');
            if (seen.has(sig)) return; // skip duplicate
            seen.add(sig);

            const after = textNode.splitText(m.index + m.length);
            const middle = textNode.splitText(m.index);
            const span = document.createElement('span');
            span.className = 'es-highlight es-term-' + (m.termIndex || 0);
            span.textContent = middle.nodeValue;
            // assign stable id for mapping
            const uid = 'es' + (window.__es_uid_counter__++);
            span.dataset.esId = uid;
            middle.parentNode.replaceChild(span, middle);
            highlights.push({ id: uid, node: span, context: m.context, element: m.element, termIndex: m.termIndex || 0, match: m.match });
          } catch (e) {
            // ignore split errors
          }
        });
      });
      // cap results to first N to avoid huge lists
      const CAP = 2000;
      window.__es_total_matches__ = highlights.length;
      window.__es_cap__ = CAP;
      currentMatches = highlights.slice(0, CAP);
      currentIndex = 0;
      saveSearchHistory(query);
      populateHistoryDatalist();
      updateResultsUI(currentMatches);
    };
    // start scanning immediately
    try { processChunk(); } catch (e) { console.warn('scan failed', e); }
  }

  // Debounce helper
  function debounce(fn, wait) {
    let t = null;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function jumpToMatch(idx) {
    const match = currentMatches[idx];
    if (!match) return;
    // smooth scroll is now default
    try {
      if ('scrollIntoView' in match.node) {
        match.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        const rect = match.node.getBoundingClientRect();
        window.scrollTo({ top: window.scrollY + rect.top - (window.innerHeight / 2), behavior: 'smooth' });
      }
    } catch (e) {
      try {
        const rect = match.node.getBoundingClientRect();
        window.scrollTo(0, window.scrollY + rect.top - (window.innerHeight / 2));
      } catch (err) {}
    }
    // focus briefly to help keyboard users
    try { match.node.tabIndex = -1; match.node.focus({ preventScroll: true }); } catch (e) {}
    currentIndex = idx;
    updateResultsUI(currentMatches);
    try { setActiveHighlight(currentIndex); } catch (e) {}
    // ensure the result list scrolls to show the active item
    try { scrollResultIntoView(currentIndex); } catch (e) {}
    // update counter display
    try { updatePositionCounter(); } catch (e) {}
  }

  // Highlight only the active match on the page; dim others
  function setActiveHighlight(activeIndex) {
    try {
      if (!currentMatches || !currentMatches.length) return;
      currentMatches.forEach((m, i) => {
        try {
          if (!m || !m.node) return;
          if (i === activeIndex) {
            m.node.classList.add('es-current');
            m.node.classList.remove('es-dim');
          } else {
            m.node.classList.remove('es-current');
            m.node.classList.add('es-dim');
          }
        } catch (err) {}
      });
    } catch (e) {}
  }

  function scrollResultIntoView(idx) {
    const container = document.getElementById('es-results');
    if (!container) return;
    // find the result item with matching data-index
    const item = container.querySelector('[data-index="' + idx + '"]');
    if (!item) return;
    // scroll the container so the item is visible; prefer smooth behavior
    try {
      // If browser supports, this will scroll the nearest scrollable container
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      // fallback: compute offset
      const containerRect = container.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      const offset = itemRect.top - containerRect.top;
      container.scrollTop += offset - (container.clientHeight / 2);
    }
  }

  function updatePositionCounter() {
    try {
      const counter = document.getElementById('es-counter');
      if (!counter) return;
      const total = window.__es_total_matches__ || currentMatches.length;
      const pos = currentMatches && currentMatches.length ? (currentIndex + 1) : 0;
      if (total === 0) counter.textContent = '0 of 0';
      else counter.textContent = pos ? `Result ${pos} of ${total}` : `0 of ${total}`;
    } catch (e) {}
  }

  // New helper for reliable blob downloads
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none'; // Hide the element
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Export current matches as plain text
  function exportResults(format) {
    if (!currentMatches || !currentMatches.length) return;
    let blob;
    let filename;

    if (format === 'txt') {
      const lines = currentMatches.map((m, i) => `${i+1}. <${m.element}> ${m.context}`);
      blob = new Blob([lines.join('\n')], { type: 'text/plain' });
      filename = 'enhanced-search-results.txt';
    } else if (format === 'csv') {
      const rows = currentMatches.map((m, i) => `"${i+1}","${m.element}","${m.context.replace(/"/g,'""')}"`);
      blob = new Blob([rows.join('\n')], { type: 'text/csv' });
      filename = 'enhanced-search-results.csv';
    } else if (format === 'json') {
      const data = currentMatches.map((m, i) => ({ index: i+1, element: m.element, context: m.context }));
      blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      filename = 'enhanced-search-results.json';
    } else {
      return;
    }
    downloadBlob(blob, filename);
  }

  // Focus trap: keep focus inside overlay while open
  function trapFocus() {
    const overlay = document.getElementById('enhanced-search-overlay');
    if (!overlay) return;
    const focusableElements = overlay.querySelectorAll('input, button, [tabindex]:not([tabindex="-1"])');
    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  function nextMatch() {
    if (!currentMatches.length) return;
    currentIndex = (currentIndex + 1) % currentMatches.length;
    jumpToMatch(currentIndex);
  }

  function prevMatch() {
    if (!currentMatches.length) return;
    currentIndex = (currentIndex - 1 + currentMatches.length) % currentMatches.length;
    jumpToMatch(currentIndex);
  }

  function updateResultsUI(matches) {
    const res = document.getElementById('es-results');
    res.innerHTML = '';
    const counter = document.getElementById('es-counter');
    const activeFilter = document.getElementById('es-active-filter');
    
    // show what's displayed vs total
    const totalMatches = window.__es_total_matches__ || matches.length;
    const cap = window.__es_cap__ || matches.length;
    // If there are no matches to display, hide the counter (don't show '0 of X')
    if (!matches.length) {
      if (counter) counter.textContent = '';
      if (activeFilter) activeFilter.textContent = '';
      return;
    }
    // Show user-friendly counter. If there is a current index, show position
    const pos = currentMatches && currentMatches.length ? (currentIndex + 1) : 0;
    if (totalMatches > cap) {
      counter.textContent = pos ? `Result ${pos} of ${totalMatches}+` : `${matches.length} of ${totalMatches}+`;
    } else {
      counter.textContent = pos ? `Result ${pos} of ${totalMatches}` : `${matches.length} of ${totalMatches}`;
    }
    
    if (activeTagFilter) {
      activeFilter.textContent = ` [filtered by ${activeTagFilter}]`;
    } else {
      activeFilter.textContent = '';
    }

    // group by element type for cleaner UI
    const groups = {};
    matches.forEach((m, i) => {
      m.index = i;
      const el = m.element || 'text';
      if (!groups[el]) groups[el] = [];
      groups[el].push(m);
    });

    Object.keys(groups).forEach((element) => {
      const items = groups[element];
      const group = document.createElement('div');
      group.className = 'es-result-group';
      // order: badge, element+count, navigation (first/last), collapse toggle (right-aligned)
      group.innerHTML = `<span class="es-filter-badge" aria-hidden="true">🔎</span><strong>${element}</strong> <span class="es-count">(${items.length})</span> <button class="es-first-last" data-action="first" title="Jump to first">⏮</button> <button class="es-first-last" data-action="last" title="Jump to last">⏭</button> <button class="es-collapse-toggle" title="Collapse/expand results" aria-expanded="true">▾</button>`;
      group.title = `Filter results by <${element}> elements (click to toggle)`;
      group.setAttribute('role', 'button');
      group.setAttribute('tabindex', '0');
      group.addEventListener('click', () => setTagFilter(element === activeTagFilter ? null : element));
      // first/last buttons
      const flBtns = group.querySelectorAll('.es-first-last');
      flBtns.forEach(b => {
        b.addEventListener('click', (ev) => { ev.stopPropagation(); const act = b.dataset.action; const list = groups[element]; if (!list || !list.length) return; if (act === 'first') jumpToMatch(list[0].index); else jumpToMatch(list[list.length-1].index); });
      });
      // collapse toggle
      const collapseBtn = group.querySelector('.es-collapse-toggle');
      if (collapseBtn) {
        collapseBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const expanded = collapseBtn.getAttribute('aria-expanded') !== 'false';
          collapseBtn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
          collapseBtn.textContent = expanded ? '▸' : '▾';
          if (collapseBtn && group.nextElementSibling) {
            group.classList.toggle('collapsed');
            group.nextElementSibling.style.display = expanded ? 'none' : '';
          }
        });
      }
      group.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTagFilter(element === activeTagFilter ? null : element); } });
      res.appendChild(group);

      const container = document.createElement('div');
      container.className = 'es-group-items';
      items.forEach((match) => {
        const item = document.createElement('div');
        item.className = 'es-result-item';
        item.dataset.index = match.index;
        if (match.index === currentIndex) item.classList.add('es-active');
        const ctx = escapeHtml(match.context).replace(new RegExp(escapeRegExp(match.match || ''), 'gi'), '<mark>$&</mark>');
        item.innerHTML = `<div class="es-context">${ctx}</div>`;
        container.appendChild(item);
      });
      res.appendChild(container);
    });
  }

  function overlayApplyCompact(enabled) {
    try {
      const overlay = document.getElementById('enhanced-search-overlay');
      if (!overlay) return;
      const container = overlay.querySelector('.es-container');
      if (!container) return;
      if (enabled) {
        container.style.width = Math.max(200, Math.floor(container.offsetWidth / 2)) + 'px';
        container.style.maxWidth = '50vw';
      } else {
        container.style.width = '';
        container.style.maxWidth = '';
      }
    } catch (e) {}
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.replace(/[&<>\"'`]/g, function (m) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;', '`':'&#96;'}[m]);
    });
  }

  function getContext(text, idx) {
    // expand to nearest sentence boundaries for clearer preview
    try {
      const maxChars = 120;
      const startGuess = Math.max(0, idx - maxChars);
      const endGuess = Math.min(text.length, idx + maxChars);
      // find previous sentence boundary (.,!? or line break)
      const before = text.slice(startGuess, idx);
      let sIdx = before.search(/(?:[\.\!\?]\s+)[^\s]*$/);
      if (sIdx >= 0) sIdx = startGuess + sIdx + 2; else sIdx = Math.max(0, idx - 40);
      // find next sentence boundary after the match
      const after = text.slice(idx, endGuess);
      const m = after.match(/([\.\!\?])(\s|$)/);
      let eIdx = m ? (idx + m.index + 1) : Math.min(text.length, idx + 40);
      // final clamp
      sIdx = Math.max(0, sIdx);
      eIdx = Math.min(text.length, eIdx);
      return text.slice(sIdx, eIdx).trim();
    } catch (e) {
      const start = Math.max(0, idx - 20);
      const end = Math.min(text.length, idx + 20);
      return text.slice(start, end);
    }
  }

  /* --- history persistence --- */
  function loadSearchHistory() {
    try {
      const raw = localStorage.getItem('es_history');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveSearchHistory(q) {
    if (!q || !q.trim()) return;
    const hist = loadSearchHistory();
    if (hist.includes(q)) return;
    hist.unshift(q);
    if (hist.length > 20) hist.splice(20);
    try {
      localStorage.setItem('es_history', JSON.stringify(hist));
    } catch (e) {}
  }

  function populateHistoryDatalist() {
    const list = document.getElementById('es-history');
    if (!list) return;
    list.innerHTML = '';
    const hist = loadSearchHistory();
    hist.forEach((q) => {
      const option = document.createElement('option');
      option.value = q;
      list.appendChild(option);
    });
  }

  // Options persistence
  function saveOptionsToStorage() {
    try {
      const out = {
        case: !!document.getElementById('es-case').checked,
        // whole-mode is now derived from the mode button state
        whole: !!(document.getElementById('es-mode-toggle') && document.getElementById('es-mode-toggle').classList.contains('active')),
        regex: !!document.getElementById('es-regex').checked,
        html: !!document.getElementById('es-html-filter').checked,
        excludeSelectors: (document.getElementById('es-exclude-selectors') || {}).value || '',
        excludeJson: !!(document.getElementById('es-exclude-json') || {}).checked,
        filterHeadings: !!(document.getElementById('es-filter-headings') || {}).checked,
        filterLinks: !!(document.getElementById('es-filter-links') || {}).checked,
        filterParagraphs: !!(document.getElementById('es-filter-paragraphs') || {}).checked,
        // smoothScroll is now default, no longer a toggle
      };
      chrome.storage.local.set(out);
    } catch (e) {}
  }

  function loadOptionsIntoOverlay() {
    try {
      chrome.storage.local.get(['case','whole','regex','html','filterHeadings','filterLinks','filterParagraphs'], (s) => {
        const o = s || {};
        // main bar checkboxes removed; load into advanced mirrors instead
        const map = { 'es-adv-case':'case', 'es-adv-regex':'regex', 'es-adv-html':'html' };
        Object.keys(map).forEach(k => {
          const el = document.getElementById(k);
          if (el) el.checked = !!o[map[k]];
        });
        // element filters
        const fh = document.getElementById('es-filter-headings'); if (fh) fh.checked = !!o.filterHeadings;
        const fl = document.getElementById('es-filter-links'); if (fl) fl.checked = !!o.filterLinks;
        const fp = document.getElementById('es-filter-paragraphs'); if (fp) fp.checked = !!o.filterParagraphs;
      });
    } catch (e) {}
  }

  // set or clear tag filter
  function setTagFilter(tag) {
    activeTagFilter = tag || null;
    // update UI indicator
    const activeFilter = document.getElementById('es-active-filter');
    if (activeFilter) {
      activeFilter.textContent = activeTagFilter ? ` [filtered by ${activeTagFilter}]` : '';
    }
    // re-filter current matches
    if (activeTagFilter) {
      const filtered = currentMatches.filter(m => m.element === activeTagFilter);
      updateResultsUI(filtered);
    } else {
      updateResultsUI(currentMatches);
    }
  }

  // make sure background script calls work - use callback and swallow errors to avoid unhandled promise
  try {
    chrome.runtime.sendMessage({ action: 'content-script-ready' }, function (resp) {
      try {
        if (chrome.runtime && chrome.runtime.lastError) {
          // ignore: receiving end may not exist
        }
      } catch (e) {}
    });
  } catch (e) {
    // extension context might be invalidated; ignore
  }

})();