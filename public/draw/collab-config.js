(function () {
  function getParam(name) {
    try {
      return new URL(window.location.href).searchParams.get(name);
    } catch {
      return null;
    }
  }
  const fromParam = getParam('socketServer');
  const fromStorage = (function () {
    try {
      return localStorage.getItem('TCHOFF_COLLAB_SOCKET_URL');
    } catch {
      return null;
    }
  })();
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  const fallback = isLocal ? 'http://127.0.0.1:3001' : window.location.origin;
  window.TCHOFF_COLLAB_CONFIG = {
    socketServer: fromParam || fromStorage || fallback,
    room: getParam('room') || 'default',
  };
})();
