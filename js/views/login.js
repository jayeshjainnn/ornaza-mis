/**
 * views/login.js — Login screen
 */
Views.login = (function () {

  function render(container) {
    // Hide main layout, render full-screen login
    document.getElementById('topbar').style.display     = 'none';
    document.getElementById('bottom-nav').style.display = 'none';

    container.style.paddingBottom = '0';
    container.style.maxWidth      = 'none';
    container.style.padding       = '0';

    container.innerHTML =
      '<div id="login-screen">' +
        '<div class="login-logo">' +
          '<div class="brand-icon-lg"><span>OJ</span></div>' +
          '<h1>Ornaza Jewels</h1>' +
          '<p>Management Information System</p>' +
        '</div>' +
        '<div class="login-card">' +
          '<div class="form-group">' +
            '<label class="form-label">Username</label>' +
            '<input id="l-user" type="text" class="form-control" placeholder="Enter username" autocomplete="username" autocapitalize="none">' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">Password</label>' +
            '<input id="l-pass" type="password" class="form-control" placeholder="Enter password" autocomplete="current-password">' +
          '</div>' +
          '<div id="l-error" class="form-error hidden" style="margin-bottom:12px"></div>' +
          '<button id="l-btn" class="btn btn-primary btn-block btn-lg">Sign In</button>' +
          '<p style="text-align:center;font-size:11px;color:var(--color-text-light);margin-top:16px">Ornaza Jewels MIS v1.0</p>' +
        '</div>' +
      '</div>';

    _bindEvents();
  }

  function _bindEvents() {
    var btn   = document.getElementById('l-btn');
    var user  = document.getElementById('l-user');
    var pass  = document.getElementById('l-pass');
    var errEl = document.getElementById('l-error');

    function doLogin() {
      var u = user.value.trim();
      var p = pass.value;
      if (!u || !p) { _showErr(errEl, 'Enter username and password.'); return; }

      btn.disabled     = true;
      btn.textContent  = 'Signing in…';
      errEl.classList.add('hidden');

      Auth.login(u, p).then(function (res) {
        if (res.ok) {
          buildNav();
          buildTopbar();
          initSyncIndicator();
          Sync.init();
          window.location.hash = '#dashboard';
        } else {
          _showErr(errEl, res.error || 'Login failed. Check credentials.');
          btn.disabled    = false;
          btn.textContent = 'Sign In';
        }
      }).catch(function (err) {
        _showErr(errEl, 'Cannot reach server. Check your connection.');
        btn.disabled    = false;
        btn.textContent = 'Sign In';
      });
    }

    btn.addEventListener('click', doLogin);
    pass.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    user.focus();
  }

  function _showErr(el, msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function onEnter() {}
  function onLeave() {
    // Restore container styles
    var c = document.getElementById('main-content');
    c.style.paddingBottom = '';
    c.style.maxWidth      = '';
    c.style.padding       = '';
  }

  return { render: render, onEnter: onEnter, onLeave: onLeave };
})();
