(function () {
  const btn = document.getElementById('nav-menu-btn');
  const menu = document.getElementById('nav-dropdown');
  if (!btn || !menu) return;

  // Hide backend link unless logged in as admin (tchoff)
  (function hideBackendIfNotAdmin() {
    const backendLink = document.querySelector('.nav-admin-only');
    if (!backendLink) return;
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('tchoff_token') : null;
    if (!token) {
      backendLink.style.display = 'none';
      return;
    }
    fetch('/api/admin/check', { headers: { Authorization: 'Bearer ' + token } })
      .then((r) => r.json())
      .then((d) => { if (!d.admin) backendLink.style.display = 'none'; })
      .catch(() => { backendLink.style.display = 'none'; });
  })();

  function open() {
    menu.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
  }
  function close() {
    menu.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }
  function toggle() {
    menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', menu.classList.contains('open'));
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });

  document.addEventListener('click', () => close());
  menu.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') close();
  });
})();
