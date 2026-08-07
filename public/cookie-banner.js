// privacy-banner.js
// Unified privacy / cookie consent banner.
// Detects region and applies:
//   • EU / EEA / UK  → GDPR + ePrivacy opt-in model
//   • US             → multi-state opt-out model + GPC
//   • elsewhere      → falls back to the stricter (EU) model
// Not legal advice. Adapt URLs, categories, and tracking hooks to your site.
(function () {
  const STORAGE_KEY = 'privacy_prefs_v1';
  const PRIVACY_POLICY_URL = '/privacy.html';   // change if needed
  const COOKIE_POLICY_URL  = '/cookies.html';   // optional

  // ------------------------------------------------------------------
  // Region detection
  // ------------------------------------------------------------------
  const EU_COUNTRIES = new Set([
    // EU
    'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE',
    'IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
    // EEA
    'IS','LI','NO',
    // UK (still commonly treated under similar rules)
    'GB','UK',
  ]);

  /**
   * Returns 'eu' | 'us' | 'other'
   * Uses a free geo-IP endpoint. On failure or timeout → 'eu' (stricter).
   */
  function detectRegion() {
    return new Promise((resolve) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
        resolve('eu'); // fail closed
      }, 2500);

      // Lightweight free endpoint (no API key required for basic country)
      fetch('https://ipapi.co/json/', {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data) => {
          clearTimeout(timeout);
          const code = (data.country_code || data.country || '').toUpperCase();
          if (EU_COUNTRIES.has(code)) resolve('eu');
          else if (code === 'US') resolve('us');
          else resolve('other');
        })
        .catch(() => {
          clearTimeout(timeout);
          resolve('eu'); // network error / blocked → stricter default
        });
    });
  }

  // ------------------------------------------------------------------
  // Shared storage helpers
  // ------------------------------------------------------------------
  function getPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setPrefs(prefs) {
    const toStore = {
      ...prefs,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    return toStore;
  }

  // ------------------------------------------------------------------
  // Global Privacy Control (US)
  // ------------------------------------------------------------------
  function hasGPC() {
    return typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true;
  }

  // ------------------------------------------------------------------
  // Apply preferences to tracking (wire your real tags here)
  // ------------------------------------------------------------------
  function applyPrefs(prefs) {
    // Normalise shape so both models can be read the same way
    const eu = prefs.model === 'eu';
    const saleShareOptOut = eu
      ? !(prefs.marketing || prefs.analytics) // rough mapping
      : !!prefs.saleShareOptOut;

    window.__PRIVACY__ = {
      model: prefs.model || 'eu',
      // EU-style
      necessary: true,
      analytics: !!prefs.analytics,
      marketing: !!prefs.marketing,
      preferences: !!prefs.preferences,
      // US-style
      saleShareOptOut,
      targetedAdsOptOut: saleShareOptOut,
      gpc: hasGPC(),
      updatedAt: prefs.updatedAt,
      source: prefs.source,
    };

    // ---------- Example integration points ----------
    // Replace these with your real analytics / ad / pixel code.

    // Google Consent Mode v2 style example:
    // if (typeof gtag === 'function') {
    //   gtag('consent', 'update', {
    //     analytics_storage:  prefs.analytics  ? 'granted' : 'denied',
    //     ad_storage:         prefs.marketing  ? 'granted' : 'denied',
    //     ad_user_data:       prefs.marketing  ? 'granted' : 'denied',
    //     ad_personalization: prefs.marketing  ? 'granted' : 'denied',
    //     functionality_storage: prefs.preferences ? 'granted' : 'denied',
    //     personalization_storage: prefs.preferences ? 'granted' : 'denied',
    //   });
    // }

    if (prefs.analytics) {
      // load analytics
    }
    if (prefs.marketing) {
      // load marketing / ads
    }
    if (prefs.saleShareOptOut) {
      // US: suppress sale/share/targeted-ad tags
    }
  }

  // ------------------------------------------------------------------
  // Styles (shared + model-specific)
  // ------------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById('privacy-banner-styles')) return;
    const style = document.createElement('style');
    style.id = 'privacy-banner-styles';
    style.textContent = `
      #privacy-banner {
        position: fixed;
        z-index: 99999;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #111;
        background: #fff;
        box-sizing: border-box;
      }
      #privacy-banner * { box-sizing: border-box; }
      #privacy-banner a { color: #0b57d0; text-decoration: underline; }
      #privacy-banner p { margin: 0 0 10px 0; }
      #privacy-banner h2 { margin: 0 0 8px 0; font-size: 16px; font-weight: 700; }

      /* EU – full-width bottom bar */
      #privacy-banner.eu {
        bottom: 0; left: 0; right: 0;
        border-top: 1px solid #ddd;
        box-shadow: 0 -4px 20px rgba(0,0,0,.12);
      }
      #privacy-banner.eu .privacy-inner {
        max-width: 1100px;
        margin: 0 auto;
        padding: 20px 24px 24px;
      }

      /* US – compact bottom-right card */
      #privacy-banner.us {
        bottom: 20px; right: 20px;
        width: min(380px, calc(100vw - 40px));
        border: 1px solid #ccc;
        border-radius: 10px;
        box-shadow: 0 4px 16px rgba(0,0,0,.15);
        padding: 18px 20px;
      }

      .privacy-btns {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }
      .privacy-btn {
        flex: 1 1 auto;
        min-width: 110px;
        padding: 10px 14px;
        cursor: pointer;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        border: 1px solid transparent;
      }
      .privacy-btn-primary {
        background: #111;
        color: #fff;
      }
      .privacy-btn-secondary {
        background: #fff;
        color: #111;
        border-color: #ccc;
      }
      .privacy-btn-tertiary {
        background: #f5f5f5;
        color: #111;
        border-color: #ddd;
      }
      .privacy-small { font-size: 12px; color: #555; margin-top: 8px; }

      /* EU customize panel */
      #privacy-customize-panel {
        display: none;
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid #eee;
      }
      #privacy-customize-panel.open { display: block; }
      .privacy-cat {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 12px;
      }
      .privacy-cat label { flex: 1; cursor: pointer; }
      .privacy-cat strong { display: block; margin-bottom: 2px; }
      .privacy-cat span { font-size: 13px; color: #555; }
      .privacy-cat input[type="checkbox"] {
        width: 18px; height: 18px; margin-top: 2px; accent-color: #111;
      }
      .privacy-cat input[type="checkbox"]:disabled {
        opacity: 0.55; cursor: not-allowed;
      }

      @media (max-width: 600px) {
        .privacy-btns { flex-direction: column; }
        .privacy-btn { width: 100%; }
        #privacy-banner.us {
          left: 12px; right: 12px; width: auto; bottom: 12px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ------------------------------------------------------------------
  // EU banner (opt-in)
  // ------------------------------------------------------------------
  function showEuBanner() {
    injectStyles();

    const banner = document.createElement('div');
    banner.id = 'privacy-banner';
    banner.className = 'eu';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-modal', 'true');
    banner.setAttribute('aria-label', 'Cookie consent');

    banner.innerHTML = `
      <div class="privacy-inner">
        <h2>We value your privacy</h2>
        <p>
          We use cookies and similar technologies to run this site, measure performance,
          and (with your consent) personalise content and ads. You can accept all,
          reject non-essential cookies, or choose which categories to allow.
        </p>
        <p class="privacy-small">
          See our
          <a href="${PRIVACY_POLICY_URL}" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
          ${COOKIE_POLICY_URL !== PRIVACY_POLICY_URL
            ? ` and <a href="${COOKIE_POLICY_URL}" target="_blank" rel="noopener noreferrer">Cookie Policy</a>`
            : ''}
          for details. You can change your mind at any time.
        </p>

        <div class="privacy-btns">
          <button type="button" class="privacy-btn privacy-btn-primary" id="privacy-accept">
            Accept all
          </button>
          <button type="button" class="privacy-btn privacy-btn-secondary" id="privacy-reject">
            Reject non-essential
          </button>
          <button type="button" class="privacy-btn privacy-btn-tertiary" id="privacy-customize-btn">
            Customize
          </button>
        </div>

        <div id="privacy-customize-panel">
          <div class="privacy-cat">
            <input type="checkbox" id="cat-necessary" checked disabled>
            <label for="cat-necessary">
              <strong>Necessary</strong>
              <span>Required for the website to function. Always active.</span>
            </label>
          </div>
          <div class="privacy-cat">
            <input type="checkbox" id="cat-analytics">
            <label for="cat-analytics">
              <strong>Analytics</strong>
              <span>Help us understand how visitors use the site.</span>
            </label>
          </div>
          <div class="privacy-cat">
            <input type="checkbox" id="cat-preferences">
            <label for="cat-preferences">
              <strong>Preferences</strong>
              <span>Remember choices such as language or region.</span>
            </label>
          </div>
          <div class="privacy-cat">
            <input type="checkbox" id="cat-marketing">
            <label for="cat-marketing">
              <strong>Marketing</strong>
              <span>Used for relevant ads and measuring their effectiveness.</span>
            </label>
          </div>
          <div class="privacy-btns">
            <button type="button" class="privacy-btn privacy-btn-primary" id="privacy-save">
              Save choices
            </button>
          </div>
        </div>
      </div>
    `;

    function dismiss() { banner.remove(); }

    function save(prefs, source) {
      const stored = setPrefs({
        model: 'eu',
        necessary: true,
        analytics: !!prefs.analytics,
        preferences: !!prefs.preferences,
        marketing: !!prefs.marketing,
        source,
      });
      applyPrefs(stored);
      dismiss();
    }

    document.body.appendChild(banner);

    document.getElementById('privacy-accept').onclick = () =>
      save({ analytics: true, preferences: true, marketing: true }, 'banner-accept-all');

    document.getElementById('privacy-reject').onclick = () =>
      save({ analytics: false, preferences: false, marketing: false }, 'banner-reject');

    const panel = document.getElementById('privacy-customize-panel');
    document.getElementById('privacy-customize-btn').onclick = () =>
      panel.classList.toggle('open');

    document.getElementById('privacy-save').onclick = () =>
      save({
        analytics: document.getElementById('cat-analytics').checked,
        preferences: document.getElementById('cat-preferences').checked,
        marketing: document.getElementById('cat-marketing').checked,
      }, 'banner-customize');
  }

  // ------------------------------------------------------------------
  // US banner (opt-out + GPC)
  // ------------------------------------------------------------------
  function showUsBanner() {
    injectStyles();

    const banner = document.createElement('div');
    banner.id = 'privacy-banner';
    banner.className = 'us';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Privacy choices');

    banner.innerHTML = `
      <p><strong>Your privacy choices</strong></p>
      <p>
        We use cookies and similar technologies for site function and to understand traffic.
        Some tools may involve “sale,” “sharing,” or targeted advertising under state privacy laws
        (including CCPA/CPRA, TDPSA, and other state acts).
      </p>
      <p>
        You can opt out of sale, sharing, and targeted advertising. We also honor the
        <a href="https://globalprivacycontrol.org/" target="_blank" rel="noopener noreferrer">Global Privacy Control (GPC)</a>
        signal when your browser sends it.
      </p>
      <p class="privacy-small">
        See our <a href="${PRIVACY_POLICY_URL}">Privacy Policy</a> for details and how to exercise access, deletion, and other rights.
      </p>
      <div class="privacy-btns">
        <button type="button" class="privacy-btn privacy-btn-primary" id="privacy-optout">
          Do Not Sell or Share
        </button>
        <button type="button" class="privacy-btn privacy-btn-secondary" id="privacy-ok">
          OK
        </button>
      </div>
    `;

    function dismiss() { banner.remove(); }

    document.body.appendChild(banner);

    document.getElementById('privacy-optout').onclick = () => {
      const stored = setPrefs({
        model: 'us',
        saleShareOptOut: true,
        analytics: false,
        marketing: false,
        preferences: false,
        source: 'banner',
      });
      applyPrefs(stored);
      dismiss();
    };

    document.getElementById('privacy-ok').onclick = () => {
      // OK = acknowledge notice; does NOT equal opt-in to sale/share
      const stored = setPrefs({
        model: 'us',
        saleShareOptOut: false,
        analytics: true,
        marketing: true,
        preferences: true,
        source: 'banner',
      });
      applyPrefs(stored);
      dismiss();
    };
  }

  // ------------------------------------------------------------------
  // Bootstrap
  // ------------------------------------------------------------------
  async function init() {
    // 1. Honor GPC immediately (US signal, but safe to respect everywhere)
    if (hasGPC()) {
      const stored = setPrefs({
        model: 'us',
        saleShareOptOut: true,
        analytics: false,
        marketing: false,
        preferences: false,
        source: 'gpc',
      });
      applyPrefs(stored);
      return; // no banner needed
    }

    // 2. Already has a saved choice?
    const existing = getPrefs();
    if (existing) {
      applyPrefs(existing);
      return; // no banner
    }

    // 3. Detect region and show the matching banner
    //    While waiting, keep non-essential tracking off (fail closed)
    applyPrefs({
      model: 'eu',
      necessary: true,
      analytics: false,
      marketing: false,
      preferences: false,
      source: 'pending',
    });

    const region = await detectRegion();

    if (region === 'us') {
      showUsBanner();
    } else {
      // EU + "other" → stricter opt-in model
      showEuBanner();
    }
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

