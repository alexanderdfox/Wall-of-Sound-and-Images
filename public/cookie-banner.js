// cookie--banner.js
// Multi-state US privacy notice (opt-out model). Not legal advice.
(function () {
  const STORAGE_KEY = 'us_privacy_prefs';
  const PRIVACY_POLICY_URL = '/privacy.html'; // change if needed

  function getPrefs() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function setPrefs(prefs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...prefs,
      updatedAt: new Date().toISOString(),
    }));
  }

  /** Global Privacy Control — required/honored in CA, CO, CT, TX, MT, DE, OR, NJ, NH, NE, MN, MD, etc. */
  function hasGPC() {
    return typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true;
  }

  function applyTrackingPreference(optOut) {
    // Wire these to your real analytics / ads / pixels.
    // When optOut is true: do not load sale/share/targeted-ad tags.
    window.__US_PRIVACY__ = {
      saleOrShareOptOut: !!optOut,
      targetedAdsOptOut: !!optOut,
      gpc: hasGPC(),
    };

    if (optOut) {
      // Example: document.dispatchEvent(new CustomEvent('privacy:opt-out'));
      // Disable GA4 ads, Meta Pixel, etc. here
    } else {
      // Example: document.dispatchEvent(new CustomEvent('privacy:opt-in-sale-share'));
    }
  }

  // Honor GPC on every page load (even if banner was already dismissed)
  if (hasGPC()) {
    setPrefs({ saleShareOptOut: true, source: 'gpc' });
    applyTrackingPreference(true);
  } else {
    const existing = getPrefs();
    if (existing) {
      applyTrackingPreference(!!existing.saleShareOptOut);
    }
  }

  // Don't show banner again if user already chose, or GPC is on
  if (getPrefs() || hasGPC()) return;

  const style = document.createElement('style');
  style.textContent = `
    #us-privacy-banner {
      position: fixed; bottom: 20px; right: 20px; width: min(360px, calc(100vw - 40px));
      background: #fff; color: #111; border: 1px solid #ccc; padding: 18px 20px;
      box-shadow: 0 4px 16px rgba(0,0,0,.15); z-index: 9999;
      font-family: system-ui, -apple-system, sans-serif; font-size: 14px;
      border-radius: 10px; line-height: 1.45;
    }
    #us-privacy-banner p { margin: 0 0 12px 0; }
    #us-privacy-banner a { color: #0b57d0; text-decoration: underline; }
    .us-privacy-btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .us-privacy-btn {
      flex: 1 1 auto; min-width: 120px; padding: 9px 12px; cursor: pointer;
      border: none; border-radius: 6px; font-size: 13px; font-weight: 600;
    }
    .us-privacy-optout { background: #111; color: #fff; }
    .us-privacy-ok { background: #eee; color: #111; }
    .us-privacy-small { font-size: 12px; color: #555; margin-top: 10px; }
  `;
  document.head.appendChild(style);

  const banner = document.createElement('div');
  banner.id = 'us-privacy-banner';
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
    <p class="us-privacy-small">
      See our <a href="${PRIVACY_POLICY_URL}">Privacy Policy</a> for details and how to exercise access, deletion, and other rights.
    </p>
    <div class="us-privacy-btns">
      <button type="button" class="us-privacy-btn us-privacy-optout" id="us-privacy-optout">
        Do Not Sell or Share
      </button>
      <button type="button" class="us-privacy-btn us-privacy-ok" id="us-privacy-ok">
        OK
      </button>
    </div>
  `;

  function dismiss() {
    banner.remove();
  }

  document.body.appendChild(banner);

  document.getElementById('us-privacy-optout').onclick = () => {
    setPrefs({ saleShareOptOut: true, source: 'banner' });
    applyTrackingPreference(true);
    dismiss();
  };

  document.getElementById('us-privacy-ok').onclick = () => {
    // OK = acknowledge notice; does NOT mean opt-in to sale/share under US opt-out laws
    setPrefs({ saleShareOptOut: false, source: 'banner' });
    applyTrackingPreference(false);
    dismiss();
  };
})();
