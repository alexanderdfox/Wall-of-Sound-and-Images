(function () {
  const btn = document.getElementById('nav-menu-btn');
  const menu = document.getElementById('nav-dropdown');
  if (!btn || !menu) return;

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
