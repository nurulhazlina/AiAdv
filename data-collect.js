// ═══════════════════════════════════════════════════════════════
//  AI Adventure LMS — Data Collection Utility  (data-collect.js)
//  Add ONE line to every HTML page, inside <head>:
//    <script src="data-collect.js"></script>
//
//  IMPORTANT: Set your Apps Script URL below before deploying.
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── 1. SET YOUR GOOGLE APPS SCRIPT WEB APP URL HERE ──────────
  //    After deploying Code.gs, paste the URL between the quotes.
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyAn2Hz3IL2_KTERqTfnKJIw940hhZnI6vNe5NyXPiREI9GZWBqxu3g9UsKVmskdFmQxA/exec';
  // ─────────────────────────────────────────────────────────────

  // ── Session ID: unique per browser session ───────────────────
  function getSid() {
    try {
      let sid = sessionStorage.getItem('ai_adv_sid');
      if (!sid) {
        sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        sessionStorage.setItem('ai_adv_sid', sid);
      }
      return sid;
    } catch (e) {
      return Math.random().toString(36).slice(2);
    }
  }

  // ── Geolocation via IP (silent, no permission needed) ────────
  let _geo = null;      // cached after first fetch
  let _geoPromise = null;

  function fetchGeo() {
    if (_geoPromise) return _geoPromise;
    _geoPromise = fetch('https://ipapi.co/json/', { mode: 'cors' })
      .then(r => r.json())
      .then(d => {
        _geo = {
          method  : 'ip',
          city    : d.city    || '',
          region  : d.region  || '',
          country : d.country_name || '',
          lat     : d.latitude  || '',
          lon     : d.longitude || ''
        };
        return _geo;
      })
      .catch(() => {
        _geo = { method: 'ip', city: '', region: '', country: '', lat: '', lon: '' };
        return _geo;
      });
    return _geoPromise;
  }

  // Kick off geo fetch immediately on page load (runs in background)
  fetchGeo();

  // Public getter — resolves instantly if already fetched
  window.AiAdv = window.AiAdv || {};
  window.AiAdv.getGeo = () => fetchGeo();

  // ── Page visit tracking ───────────────────────────────────────
  const PAGE_START = Date.now();
  const PAGE_NAME  = location.pathname.split('/').pop() || 'index.html';
  const REFERRER   = document.referrer
    ? document.referrer.split('/').pop()
    : (sessionStorage.getItem('ai_adv_prev_page') || '');

  // Log page entry to Access Log tab on unload
  window.addEventListener('beforeunload', () => {
    const durationSec = Math.round((Date.now() - PAGE_START) / 1000);
    const institution = window.AiAdv.getInstitution ? window.AiAdv.getInstitution() : '';
    const geo = _geo || {};

    const payload = {
      page         : 'access_log',
      timestamp    : new Date().toISOString(),
      sid          : getSid(),
      referrer     : REFERRER,
      duration_sec : durationSec,
      student      : { institution_name: institution },
      location     : geo
    };

    // Use sendBeacon for reliability on page unload
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(APPS_SCRIPT_URL, blob);
    }
    sessionStorage.setItem('ai_adv_prev_page', PAGE_NAME);
  });

  // ── Main submit function: send one complete row to Sheets ─────
  //
  //  Call this from your activity's submitJournal() function:
  //    AiAdv.submit('activity-1', getExportData());
  //
  window.AiAdv.submit = function (page, exportData) {
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') {
      console.warn('[AiAdv] Apps Script URL not set. Data not sent.');
      return Promise.resolve({ status: 'no-url' });
    }

    return fetchGeo().then(geo => {
      const payload = Object.assign({}, exportData, {
        page      : page,
        timestamp : new Date().toISOString(),
        sid       : getSid(),
        location  : geo
      });

      return fetch(APPS_SCRIPT_URL, {
        method  : 'POST',
        mode    : 'no-cors',   // Apps Script doesn't return CORS headers on POST
        headers : { 'Content-Type': 'application/json' },
        body    : JSON.stringify(payload)
      }).then(() => ({ status: 'ok' }))
        .catch(err => {
          console.error('[AiAdv] Submit failed:', err);
          return { status: 'error', message: err.message };
        });
    });
  };

  // ── Dropoff tracker: call at key milestones ───────────────────
  //
  //  Call this after each tier completes, e.g. in submitTier3():
  //    AiAdv.dropoff('activity-1', 'tier3', S.identity);
  //
  window.AiAdv.dropoff = function (activity, step, identity) {
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') return;

    fetchGeo().then(geo => {
      const payload = {
        page         : 'dropoff',
        timestamp    : new Date().toISOString(),
        sid          : getSid(),
        activity     : activity,
        step_reached : step,
        student      : identity || {},
        location     : geo
      };

      fetch(APPS_SCRIPT_URL, {
        method  : 'POST',
        mode    : 'no-cors',
        headers : { 'Content-Type': 'application/json' },
        body    : JSON.stringify(payload)
      }).catch(() => {});
    });
  };

  // ── Institution name helper ───────────────────────────────────
  //  Reads the institution_name field from the page (if present)
  window.AiAdv.getInstitution = function () {
    const el = document.getElementById('id-institution');
    return el ? el.value.trim() : (sessionStorage.getItem('ai_adv_institution') || '');
  };

  // Expose sid for other scripts
  window.AiAdv.sid = getSid();

})();
