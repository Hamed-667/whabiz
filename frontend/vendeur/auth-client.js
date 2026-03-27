(function () {
  function getToken() {
    return localStorage.getItem('vendeurToken') || '';
  }

  function clearSession() {
    localStorage.removeItem('vendeurToken');
    localStorage.removeItem('vendeurId');
    localStorage.removeItem('vendeurNom');
    localStorage.removeItem('vendeurBoutique');
  }

  async function authFetch(url, options) {
    var opts = options || {};
    var headers = new Headers(opts.headers || {});
    var token = getToken();

    if (token) {
      headers.set('Authorization', 'Bearer ' + token);
    }

    opts.headers = headers;

    var res = await fetch(url, opts);

    if ((res.status === 401 || res.status === 403) && window.location.pathname.indexOf('/vendeur') === 0) {
      clearSession();
      window.location.href = '/vendeur';
    }

    return res;
  }

  window.authFetch = authFetch;
  window.clearVendeurSession = clearSession;
})();
