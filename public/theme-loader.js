(function() {
  'use strict';

  const STORAGE_THEMES = 'tchoff_themes';
  const STORAGE_ACTIVE = 'tchoff_active_theme';
  const API = '/api';

  var _themesCache = null;
  var _activeCache = null;

  function getToken() {
    try { return localStorage.getItem('tchoff_token'); } catch (_) { return null; }
  }

  function hexToRgba(hex, alpha) {
    const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!m) return 'rgba(34, 197, 94, 0.15)';
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function apply(colors) {
    const root = document.documentElement;
    Object.entries(colors || {}).forEach(([k, v]) => {
      if (v) root.style.setProperty('--' + k, v);
    });
    if (colors.accent) root.style.setProperty('--accent-muted', hexToRgba(colors.accent, 0.15));
  }

  function getSavedThemes() {
    if (_themesCache !== null) return _themesCache;
    try {
      const raw = localStorage.getItem(STORAGE_THEMES);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }

  function setSavedThemes(themes) {
    try { localStorage.setItem(STORAGE_THEMES, JSON.stringify(themes)); } catch (_) {}
  }

  function saveTheme(theme) {
    const themes = getSavedThemes().filter(function(t) { return t.name !== theme.name; });
    themes.push({ name: theme.name, colors: theme.colors || {} });
    if (_themesCache !== null) _themesCache = themes;
    setSavedThemes(themes);
  }

  function deleteTheme(name) {
    const themes = getSavedThemes().filter(function(t) { return t.name !== name; });
    if (_themesCache !== null) _themesCache = themes;
    setSavedThemes(themes);
    const active = getActive();
    if (active && active.name === name) clearActive();
  }

  function setActive(theme) {
    try {
      localStorage.setItem(STORAGE_ACTIVE, JSON.stringify({ name: theme.name, colors: theme.colors || {} }));
      _activeCache = theme;
      apply(theme.colors);
    } catch (_) {}
  }

  function getActive() {
    if (_activeCache !== null) return _activeCache;
    try {
      const raw = localStorage.getItem(STORAGE_ACTIVE);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function clearActive() {
    try {
      localStorage.removeItem(STORAGE_ACTIVE);
      _activeCache = null;
      ['bg','bg-card','border','text','text-muted','text-dim','accent','accent-hover','accent-muted','danger'].forEach(function(k) {
        document.documentElement.style.removeProperty('--' + k);
      });
    } catch (_) {}
  }

  async function syncFromServer() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(API + '/themes', { headers: { Authorization: 'Bearer ' + token } });
      const data = res.ok ? await res.json() : null;
      if (data) {
        _themesCache = data.themes || [];
        _activeCache = data.active || null;
        if (_activeCache && _activeCache.colors && Object.keys(_activeCache.colors).length) {
          apply(_activeCache.colors);
        }
      }
    } catch (_) {}
  }

  async function saveThemeToServer(theme, setAsActive) {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(API + '/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ name: theme.name, colors: theme.colors || {}, active: setAsActive !== false })
      });
      if (res.ok) await res.json().catch(function() {});
    } catch (_) {}
    saveTheme(theme);
    if (setAsActive !== false) setActive(theme);
    else apply(theme.colors);
  }

  async function deleteThemeFromServer(name) {
    const token = getToken();
    if (!token) return;
    try {
      await fetch(API + '/themes/' + encodeURIComponent(name), {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token }
      });
      deleteTheme(name);
    } catch (_) {}
  }

  async function setActiveOnServer(theme) {
    const token = getToken();
    if (!token) return;
    try {
      await fetch(API + '/themes/active', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ name: theme.name })
      });
      setActive(theme);
    } catch (_) {}
  }

  var active = getActive();
  if (active && active.colors && Object.keys(active.colors).length) apply(active.colors);

  if (getToken()) {
    syncFromServer();
  }

  window.ThemeLoader = {
    apply,
    getSavedThemes,
    saveTheme,
    deleteTheme,
    setActive,
    getActive,
    clearActive,
    syncFromServer,
    saveThemeToServer,
    deleteThemeFromServer,
    setActiveOnServer,
    hasToken: function() { return !!getToken(); }
  };
})();
