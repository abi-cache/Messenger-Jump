// MessengerJump - Content Script v1.1.0
// Injects a date search panel into Facebook Messenger
// Privacy: this extension only reads date separator text. It never reads,
// stores, or transmits message content of any kind.

(function () {
  'use strict';

  if (document.getElementById('fbds-container')) return;

  let panelVisible = false;
  let searchResults = [];
  let currentResultIndex = -1;
  let isAutoScrolling = false;

let btnEnabled = true; // controls whether the floating calendar button is visible

  function setButtonVisible(enabled) {
    btnEnabled = enabled;
    const btn = document.getElementById('fbds-toggle-btn');
    if (!btn) return;
    btn.style.display = enabled ? '' : 'none';
    if (!enabled && panelVisible) setPanel(false);
  }
  // Auto-scroll state
  let scrollMutationObserver = null;
  let scrollContainer = null;       // cached once per search
  let scrollAttempts = 0;
  let noNewContentCount = 0;
  let lastScrollHeight = -1;
  let pendingScrollTimer = null;
  const MAX_SCROLL_ATTEMPTS = 80;   // safety cap (~2–3 mins of loading)
  const MAX_NO_CHANGE = 5;          // stop if height unchanged 5 checks in a row
  const BASE_INTERVAL = 900;        // ms base between scroll steps
  const JITTER = 300;               // ±ms random jitter (anti-bot-detection)

  // ── Create the floating panel ─────────────────────────────────────────────
  function createPanel() {
    const container = document.createElement('div');
    container.id = 'fbds-container';
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-label', 'Search messages by date');
    container.innerHTML = `
      <div id="fbds-panel">
        <div id="fbds-header">
          <div id="fbds-logo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="16" r="2"/></svg>
          </div>
          <span id="fbds-title">Date Search</span>
          <button id="fbds-close" aria-label="Close date search" title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div id="fbds-body">
          <div class="fbds-section">
            <label class="fbds-label" for="fbds-mode-single">Search mode</label>
            <div id="fbds-mode-tabs">
              <button class="fbds-tab active" data-mode="single" id="fbds-mode-single">Exact date</button>
              <button class="fbds-tab" data-mode="range">Date range</button>
            </div>
          </div>

          <div class="fbds-section" id="fbds-single-section">
            <label class="fbds-label" for="fbds-date-single">Jump to date</label>
            <input type="date" id="fbds-date-single" class="fbds-input" />
          </div>

          <div class="fbds-section" id="fbds-range-section" style="display:none;">
            <label class="fbds-label" for="fbds-date-from">From</label>
            <input type="date" id="fbds-date-from" class="fbds-input" />
            <label class="fbds-label" style="margin-top:8px;" for="fbds-date-to">To</label>
            <input type="date" id="fbds-date-to" class="fbds-input" />
          </div>

          <button id="fbds-search-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Search messages
          </button>

          <button id="fbds-stop-btn" style="display:none;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            Stop loading
          </button>

          <div id="fbds-status"></div>

          <div id="fbds-results" style="display:none;">
            <div id="fbds-results-header">
              <span id="fbds-results-count"></span>
              <div id="fbds-nav-btns">
                <button class="fbds-nav-btn" id="fbds-prev" title="Previous result" aria-label="Previous result">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15,18 9,12 15,6"/></svg>
                </button>
                <span id="fbds-nav-pos">0 / 0</span>
                <button class="fbds-nav-btn" id="fbds-next" title="Next result" aria-label="Next result">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9,6 15,12 9,18"/></svg>
                </button>
              </div>
            </div>
            <div id="fbds-result-list"></div>
          </div>

          <div id="fbds-tip">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Open a Messenger conversation first, then search.
          </div>
        </div>
      </div>

      <button id="fbds-toggle-btn" title="FB Date Search" aria-label="Open Facebook message date search">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="16" r="2"/></svg>
      </button>
    `;
    document.body.appendChild(container);
    return container;
  }

  // ── Wire up events ────────────────────────────────────────────────────────
  function bindEvents() {
    document.getElementById('fbds-toggle-btn').addEventListener('click', togglePanel);
    document.getElementById('fbds-close').addEventListener('click', () => setPanel(false));
    document.getElementById('fbds-search-btn').addEventListener('click', runSearch);
    document.getElementById('fbds-stop-btn').addEventListener('click', stopAutoScroll);
    document.getElementById('fbds-prev').addEventListener('click', () => navigateResult(-1));
    document.getElementById('fbds-next').addEventListener('click', () => navigateResult(1));

    document.querySelectorAll('.fbds-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.fbds-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const mode = tab.dataset.mode;
        document.getElementById('fbds-single-section').style.display = mode === 'single' ? '' : 'none';
        document.getElementById('fbds-range-section').style.display  = mode === 'range'  ? '' : 'none';
      });
    });

    ['fbds-date-single', 'fbds-date-from', 'fbds-date-to'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') runSearch();
      });
    });

    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        togglePanel();
      }
    });
  }

  function togglePanel() { setPanel(!panelVisible); }

  function setPanel(visible) {
    panelVisible = visible;
    const panel = document.getElementById('fbds-panel');
    const btn   = document.getElementById('fbds-toggle-btn');
    if (visible) {
      panel.classList.add('fbds-visible');
      btn.classList.add('fbds-active');
      setTimeout(() => {
        const mode = document.querySelector('.fbds-tab.active')?.dataset.mode;
        const input = mode === 'single'
          ? document.getElementById('fbds-date-single')
          : document.getElementById('fbds-date-from');
        input?.focus();
      }, 150);
    } else {
      panel.classList.remove('fbds-visible');
      btn.classList.remove('fbds-active');
      clearHighlights();
      stopAutoScroll();
    }
  }

  // ── Parsing helpers ───────────────────────────────────────────────────────

  function parseInputDate(str) {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function tryParseRaw(str) {
    if (!str || str.length > 80) return null;
    str = str.trim();

    const now = new Date();
    const thisYear = now.getFullYear();

    // "Sun 10:25 PM" — day-of-week only (within last 7 days)
    const dowMatch = str.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+\d{1,2}:\d{2}\s*(AM|PM)$/i);
    if (dowMatch) {
      const days = ['sun','mon','tue','wed','thu','fri','sat'];
      const targetDay = days.indexOf(dowMatch[1].toLowerCase());
      const d = new Date(now);
      const diff = (d.getDay() - targetDay + 7) % 7 || 7;
      d.setDate(d.getDate() - diff);
      d.setHours(0, 0, 0, 0);
      return d;
    }

    // Relative
    if (/^yesterday/i.test(str)) {
      const d = new Date(now); d.setDate(d.getDate() - 1); d.setHours(0,0,0,0); return d;
    }
    if (/^today/i.test(str)) {
      const d = new Date(now); d.setHours(0,0,0,0); return d;
    }

    // "January 5, 2023" or "Jan 5, 2023"
    const longDate = str.match(/^([A-Za-z]+ \d{1,2},?\s*\d{4})/);
    if (longDate) {
      const d = new Date(longDate[1]);
      if (!isNaN(d)) return d;
    }

    // "5 January 2023" or "5 Jan 2023" (EU/PH locale)
    const euDate = str.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (euDate) {
      const d = new Date(`${euDate[2]} ${euDate[1]}, ${euDate[3]}`);
      if (!isNaN(d)) return d;
    }

    // "January 5 at 3:00 PM" (no year)
    const noYear = str.match(/^([A-Za-z]+ \d{1,2})\s+at\s+\d{1,2}:\d{2}\s*(AM|PM)/i);
    if (noYear) {
      const d = new Date(`${noYear[1]}, ${thisYear}`);
      if (!isNaN(d)) return d;
    }

    // "5 Jan at 3:00 PM" (EU no-year)
    const euNoYear = str.match(/^(\d{1,2})\s+([A-Za-z]+)\s+at\s+\d{1,2}:\d{2}/i);
    if (euNoYear) {
      const d = new Date(`${euNoYear[2]} ${euNoYear[1]}, ${thisYear}`);
      if (!isNaN(d)) return d;
    }

    // "5/18/2026"
    const slashDate = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slashDate) {
      const d = new Date(+slashDate[3], +slashDate[1]-1, +slashDate[2]);
      if (!isNaN(d)) return d;
    }

    // ISO "2026-05-18"
    const iso = str.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) {
      const d = new Date(iso[1] + 'T00:00:00');
      if (!isNaN(d)) return d;
    }

    return null;
  }

  // ── Find timestamp separator elements ─────────────────────────────────────
  function findTimestampElements() {
    const results = [];
    const seen = new WeakSet();

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const t = node.textContent.trim();
          if (t.length < 3 || t.length > 60) return NodeFilter.FILTER_REJECT;
          if (node.parentElement?.closest('#fbds-container')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      const date = tryParseRaw(text);
      if (!date) continue;

      let anchor = node.parentElement;
      while (anchor && anchor !== document.body) {
        const tag = anchor.tagName;
        const display = getComputedStyle(anchor).display;
        if (['DIV','SECTION','HEADER','SPAN'].includes(tag) &&
            (display === 'block' || display === 'flex' || display === 'inline-flex')) break;
        anchor = anchor.parentElement;
      }
      if (!anchor || seen.has(anchor)) continue;

      const rect = anchor.getBoundingClientRect();
      if (rect.height > 60 || rect.height === 0) continue;
      if ((anchor.innerText || '').trim().length > 60) continue;

      seen.add(anchor);
      results.push({ el: anchor, date, raw: text });
    }

    // Also check aria-label / title attributes (tooltip-style timestamps)
    document.querySelectorAll('[aria-label],[title],[data-tooltip-content]').forEach(el => {
      if (el.closest('#fbds-container') || seen.has(el)) return;
      const raw = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-tooltip-content') || '';
      const date = tryParseRaw(raw.trim());
      if (!date) return;
      seen.add(el);
      results.push({ el, date, raw });
    });

    results.sort((a, b) => {
      const ra = a.el.getBoundingClientRect();
      const rb = b.el.getBoundingClientRect();
      return (ra.top + window.scrollY) - (rb.top + window.scrollY);
    });

    return results;
  }

  // Returns the earliest date currently visible in the conversation, or null
  function getEarliestLoadedDate() {
    const timestamps = findTimestampElements();
    if (timestamps.length === 0) return null;
    return timestamps.reduce((min, t) => t.date < min ? t.date : min, timestamps[0].date);
  }

  // ── Find the scrollable message container (cached) ─────────────────────────
  function findMessageContainer() {
    // Walk up from a known message element for better targeting
    const msgArea = document.querySelector('[role="main"]');
    if (msgArea) {
      // Find the deepest scrollable child
      const all = msgArea.querySelectorAll('*');
      let best = null, bestScore = 0;
      for (const el of all) {
        if (el.closest('#fbds-container')) continue;
        const oy = getComputedStyle(el).overflowY;
        if (oy !== 'auto' && oy !== 'scroll') continue;
        if (el.scrollHeight <= el.clientHeight + 10) continue;
        if (el.scrollHeight > bestScore) { bestScore = el.scrollHeight; best = el; }
      }
      if (best) return best;
    }
    // Fallback: broadest scrollable div
    let best = null, bestScore = 0;
    for (const el of document.querySelectorAll('div')) {
      if (el.closest('#fbds-container')) continue;
      const oy = getComputedStyle(el).overflowY;
      if (oy !== 'auto' && oy !== 'scroll') continue;
      if (el.scrollHeight <= el.clientHeight + 10) continue;
      if (el.scrollHeight > bestScore) { bestScore = el.scrollHeight; best = el; }
    }
    return best;
  }

  // ── Auto-scroll logic (MutationObserver-driven) ───────────────────────────
  function stopAutoScroll() {
    isAutoScrolling = false;
    scrollAttempts = 0;
    noNewContentCount = 0;
    lastScrollHeight = -1;

    if (pendingScrollTimer) { clearTimeout(pendingScrollTimer); pendingScrollTimer = null; }
    if (scrollMutationObserver) { scrollMutationObserver.disconnect(); scrollMutationObserver = null; }

    document.getElementById('fbds-stop-btn').style.display = 'none';
    document.getElementById('fbds-search-btn').style.display = '';
    scrollContainer = null;
  }

  function autoScrollAndSearch(fromDate, toDate) {
    isAutoScrolling = true;
    scrollAttempts = 0;
    noNewContentCount = 0;
    lastScrollHeight = -1;

    document.getElementById('fbds-search-btn').style.display = 'none';
    document.getElementById('fbds-stop-btn').style.display = '';

    scrollContainer = findMessageContainer();
    if (!scrollContainer) {
      setStatus('Could not find message list. Make sure a conversation is open.', 'error');
      stopAutoScroll();
      return;
    }

    setStatus('⏳ Loading older messages… (0)', 'searching');

    // Use MutationObserver to detect when new messages are added
    // then immediately check if target date is loaded
    scrollMutationObserver = new MutationObserver(() => {
      if (!isAutoScrolling) return;
      const found = findTimestampElements().filter(({ date }) => date >= fromDate && date < toDate);
      if (found.length > 0) {
        stopAutoScroll();
        finishSearch(fromDate, toDate);
      }
    });
    scrollMutationObserver.observe(scrollContainer, { childList: true, subtree: true });

    scheduleScrollStep(fromDate, toDate);
  }

  function scheduleScrollStep(fromDate, toDate) {
    if (!isAutoScrolling) return;

    // Random jitter to avoid mechanical scroll pattern
    const delay = BASE_INTERVAL + (Math.random() * JITTER * 2 - JITTER);
    pendingScrollTimer = setTimeout(() => doScrollStep(fromDate, toDate), delay);
  }

  function doScrollStep(fromDate, toDate) {
    if (!isAutoScrolling) return;

    scrollAttempts++;

    // Hard cap — stop after MAX_SCROLL_ATTEMPTS
    if (scrollAttempts >= MAX_SCROLL_ATTEMPTS) {
      stopAutoScroll();
      setStatus(
        `Loaded ${scrollAttempts} batches of messages — date not found. ` +
        `It may be too far back or not in this conversation.`,
        'warning'
      );
      return;
    }

    // Early exit: if oldest loaded date is already earlier than target, it's not here
    const earliest = getEarliestLoadedDate();
    if (earliest && earliest < fromDate) {
      stopAutoScroll();
      // One final check in case timing was off
      const found = findTimestampElements().filter(({ date }) => date >= fromDate && date < toDate);
      if (found.length > 0) { finishSearch(fromDate, toDate); return; }
      setStatus(`No messages found for that date. All older messages have been checked.`, 'warning');
      return;
    }

    const currentHeight = scrollContainer.scrollHeight;
    if (currentHeight === lastScrollHeight) {
      noNewContentCount++;
      if (noNewContentCount >= MAX_NO_CHANGE) {
        stopAutoScroll();
        const found = findTimestampElements().filter(({ date }) => date >= fromDate && date < toDate);
        if (found.length > 0) { finishSearch(fromDate, toDate); return; }
        setStatus(
          `No more messages to load — date not found. ` +
          `Try a more recent date or check you have the right conversation.`,
          'warning'
        );
        return;
      }
    } else {
      noNewContentCount = 0;
      lastScrollHeight = currentHeight;
    }

    // Scroll to top to trigger Facebook lazy-loading older messages
    scrollContainer.scrollTop = 0;
    setStatus(`⏳ Loading older messages… (${scrollAttempts})`, 'searching');

    scheduleScrollStep(fromDate, toDate);
  }

  // ── Core search logic ─────────────────────────────────────────────────────
  function runSearch() {
    if (isAutoScrolling) return;
    clearHighlights();
    setStatus('', 'searching');

    const activeMode = document.querySelector('.fbds-tab.active')?.dataset.mode || 'single';
    let fromDate, toDate;

    if (activeMode === 'single') {
      const val = document.getElementById('fbds-date-single').value;
      if (!val) { setStatus('Please pick a date.', 'error'); return; }
      fromDate = parseInputDate(val);
      toDate   = new Date(fromDate); toDate.setDate(toDate.getDate() + 1);
    } else {
      const f = document.getElementById('fbds-date-from').value;
      const t = document.getElementById('fbds-date-to').value;
      if (!f || !t) { setStatus('Please fill in both dates.', 'error'); return; }
      fromDate = parseInputDate(f);
      toDate   = parseInputDate(t);
      toDate.setDate(toDate.getDate() + 1);
      if (fromDate > toDate) { setStatus('Start date must be before end date.', 'error'); return; }
    }

    const timestamps = findTimestampElements();

    if (timestamps.length === 0) {
      setStatus('No date markers found. Make sure a conversation is open with messages visible.', 'error');
      return;
    }

    const immediate = timestamps.filter(({ date }) => date >= fromDate && date < toDate);
    if (immediate.length > 0) {
      finishSearch(fromDate, toDate);
    } else {
      setStatus('Date not yet loaded — auto-scrolling to find older messages…', 'searching');
      autoScrollAndSearch(fromDate, toDate);
    }
  }

  function finishSearch(fromDate, toDate) {
    const timestamps = findTimestampElements();
    searchResults = timestamps.filter(({ date }) => date >= fromDate && date < toDate);

    if (searchResults.length === 0) {
      setStatus('No messages found for that date.', 'warning');
      document.getElementById('fbds-results').style.display = 'none';
      return;
    }

    currentResultIndex = 0;
    renderResults();
    highlightResults();
    scrollToResult(0);
    setStatus('', '');
  }

  // ── Result rendering ──────────────────────────────────────────────────────
  function renderResults() {
    const container = document.getElementById('fbds-results');
    const countEl   = document.getElementById('fbds-results-count');
    const listEl    = document.getElementById('fbds-result-list');

    container.style.display = '';
    countEl.textContent = `${searchResults.length} match${searchResults.length !== 1 ? 'es' : ''} found`;
    updateNavPos();

    listEl.innerHTML = '';
    searchResults.slice(0, 20).forEach((r, i) => {
      const item = document.createElement('button');
      item.className = 'fbds-result-item' + (i === 0 ? ' fbds-result-active' : '');
      item.textContent = formatDate(r.date);
      item.addEventListener('click', () => {
        currentResultIndex = i;
        scrollToResult(i);
        updateActiveResult();
      });
      listEl.appendChild(item);
    });
    if (searchResults.length > 20) {
      const more = document.createElement('div');
      more.className = 'fbds-more';
      more.textContent = `+${searchResults.length - 20} more`;
      listEl.appendChild(more);
    }
  }

  function formatDate(d) {
    return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  }

  function highlightResults() {
    searchResults.forEach(({ el }) => el.classList.add('fbds-highlight'));
  }

  function clearHighlights() {
    document.querySelectorAll('.fbds-highlight, .fbds-highlight-active').forEach(el => {
      el.classList.remove('fbds-highlight', 'fbds-highlight-active');
    });
    searchResults = [];
    currentResultIndex = -1;
    document.getElementById('fbds-results').style.display = 'none';
    document.getElementById('fbds-status').textContent = '';
    document.getElementById('fbds-status').className = '';
  }

  function scrollToResult(index) {
    if (index < 0 || index >= searchResults.length) return;
    const el = searchResults[index].el;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('fbds-highlight-active');
    setTimeout(() => el.classList.remove('fbds-highlight-active'), 1800);
  }

  function navigateResult(dir) {
    if (searchResults.length === 0) return;
    currentResultIndex = (currentResultIndex + dir + searchResults.length) % searchResults.length;
    scrollToResult(currentResultIndex);
    updateActiveResult();
  }

  function updateActiveResult() {
    document.querySelectorAll('.fbds-result-item').forEach((el, i) => {
      el.classList.toggle('fbds-result-active', i === currentResultIndex);
    });
    updateNavPos();
  }

  function updateNavPos() {
    document.getElementById('fbds-nav-pos').textContent =
      `${currentResultIndex + 1} / ${searchResults.length}`;
  }

  function setStatus(msg, type) {
    const el = document.getElementById('fbds-status');
    el.textContent = msg;
    el.className = type ? `fbds-status-${type}` : '';
  }

  // ── Re-inject panel if Facebook's SPA removes it ──────────────────────────
  function watchForPanelRemoval() {
    const bodyObserver = new MutationObserver(() => {
      if (!document.getElementById('fbds-container')) {
        createPanel();
        bindEvents();
      }
    });
    bodyObserver.observe(document.body, { childList: true });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    createPanel();
    bindEvents();
    watchForPanelRemoval();

// Read saved enabled state and apply to button
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get({ messengerJumpEnabled: true }, ({ messengerJumpEnabled }) => {
        setButtonVisible(messengerJumpEnabled);
      });
    }

    // Listen for popup toggle messages
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'MESSENGERJUMP_SET_ENABLED') {
          setButtonVisible(msg.enabled);
        }
      });
    }
    
    // Watch for Facebook SPA navigation — clear state on conversation change
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        clearHighlights();
        stopAutoScroll();
        setStatus('', '');
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
