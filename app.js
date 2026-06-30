/**
 * app.js — Router, shell, and app initialisation for Ornaza MIS
 *
 * Hash-based routing: #login | #dashboard | #checkin | #employees |
 *                     #attendance | #leaves | #payroll | #performance
 *
 * Boot sequence:
 *   1. Open IndexedDB
 *   2. Register Service Worker
 *   3. Restore auth session from localStorage
 *   4. Route to correct view
 *   5. Start sync engine
 */

// ── Toast helper ───────────────────────────────────────────────────────────────
var Toast = (function () {
  function show(message, type, durationMs) {
    var container = document.getElementById('toast-container');
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = message;
    container.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, durationMs || 3000);
  }
  return {
    success: function (m) { show(m, 'success'); },
    error:   function (m) { show(m, 'error', 4000); },
    info:    function (m) { show(m, 'info'); },
    show:    show
  };
})();

// ── View registry (declared in config.js so it exists before view files load) ──

// ── Router ─────────────────────────────────────────────────────────────────────
var Router = (function () {
  var _current = null;

  var PUBLIC_ROUTES = ['login'];

  function _routeForRole(role) {
    // Landing page per role
    return '#dashboard';
  }

  function navigate(hash) {
    if (!hash || hash === '#') hash = Auth.isLoggedIn() ? '#dashboard' : '#login';
    var route = hash.replace('#', '');
    var publicRoute = PUBLIC_ROUTES.indexOf(route) !== -1;

    if (!publicRoute && !Auth.isLoggedIn()) {
      window.location.hash = '#login';
      return;
    }
    if (route === 'login' && Auth.isLoggedIn()) {
      window.location.hash = '#dashboard';
      return;
    }

    // Leave current view
    if (_current && Views[_current] && Views[_current].onLeave) {
      Views[_current].onLeave();
    }

    _current = route;
    _updateNav(route);
    _toggleShell(!publicRoute);

    var view = Views[route];
    if (view && view.render) {
      view.render(document.getElementById('main-content'));
      if (view.onEnter) view.onEnter();
    } else {
      document.getElementById('main-content').innerHTML =
        '<div class="empty-state"><p>Page not found.</p></div>';
    }
  }

  function _toggleShell(show) {
    document.getElementById('topbar').style.display    = show ? '' : 'none';
    document.getElementById('bottom-nav').style.display = show ? '' : 'none';
    document.getElementById('main-content').style.paddingBottom = show ? '' : '16px';
  }

  function _updateNav(route) {
    document.querySelectorAll('.nav-item').forEach(function (el) {
      var navRoute = el.dataset.route;
      el.classList.toggle('active', navRoute === route);
    });
  }

  function current() { return _current; }

  return { navigate: navigate, current: current };
})();

// ── Nav builder ────────────────────────────────────────────────────────────────
function buildNav() {
  var nav = document.getElementById('bottom-nav');
  nav.innerHTML = '';

  var items = [
    { route: 'dashboard',   label: 'Home',       icon: homeIcon() },
    { route: 'checkin',     label: 'Attendance',  icon: clockIcon() },
    { route: 'leaves',      label: 'Leaves',      icon: calendarIcon() },
    { route: 'employees',   label: 'Team',        icon: usersIcon(),    roles: ['Owner','HR','Manager'] },
    { route: 'attendance',  label: 'Queue',       icon: checklistIcon(),roles: ['Owner','HR'] },
    { route: 'payroll',     label: 'Payroll',     icon: walletIcon(),   roles: ['Owner'] },
    { route: 'performance', label: 'Performance', icon: starIcon(),     roles: ['Owner','HR','Manager'] }
  ];

  var role = Auth.getRole();
  items.forEach(function (item) {
    if (item.roles && item.roles.indexOf(role) === -1) return;
    var btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.dataset.route = item.route;
    btn.innerHTML = item.icon + '<span>' + item.label + '</span>';
    btn.addEventListener('click', function () {
      window.location.hash = '#' + item.route;
    });
    nav.appendChild(btn);
  });
}

// ── Topbar ─────────────────────────────────────────────────────────────────────
function buildTopbar() {
  document.getElementById('topbar-brand').querySelector('.brand-name').textContent = 'Ornaza MIS';
  var avatarBtn = document.getElementById('avatar-btn');
  if (avatarBtn) {
    avatarBtn.textContent = Auth.getInitials();
    avatarBtn.onclick = function () {
      if (confirm('Logout from Ornaza MIS?')) {
        Auth.logout();
        Sync.stopPolling && Sync.stopPolling();
        window.location.hash = '#login';
      }
    };
  }
}

// ── Sync status indicator ──────────────────────────────────────────────────────
function initSyncIndicator() {
  Sync.onStatusChange(function (status) {
    var dot  = document.querySelector('.sync-dot');
    var text = document.querySelector('.sync-text');
    if (!dot) return;
    dot.className  = 'sync-dot';
    if (text) text.textContent = '';
    if (status === 'syncing') {
      dot.classList.add('syncing');
      if (text) text.textContent = 'Syncing…';
    } else if (status === 'offline') {
      dot.classList.add('offline');
      if (text) text.textContent = 'Offline';
    }
    // 'idle' / 'online' = green dot, no text
  });
}

// ── Service Worker registration ─────────────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(function (reg) {
        console.log('[SW] Registered, scope:', reg.scope);
      }).catch(function (err) {
        console.warn('[SW] Registration failed:', err);
      });
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  DB.open().then(function () {
    registerSW();
    var loggedIn = Auth.restore();

    if (loggedIn) {
      buildNav();
      buildTopbar();
      initSyncIndicator();
      Sync.init();
    }

    // Route on load
    var hash = window.location.hash || (loggedIn ? '#dashboard' : '#login');
    Router.navigate(hash);

    // Route on hash change
    window.addEventListener('hashchange', function () {
      Router.navigate(window.location.hash);
      // Rebuild nav/topbar after login
      if (Auth.isLoggedIn()) {
        buildNav();
        buildTopbar();
        initSyncIndicator();
      }
    });

  }).catch(function (err) {
    console.error('[Boot] IndexedDB open failed:', err);
    document.getElementById('main-content').innerHTML =
      '<div style="padding:40px;text-align:center;color:#e05252">' +
      '<p>Could not open local database.</p>' +
      '<p style="font-size:12px;margin-top:8px">' + err + '</p></div>';
  });
});

// ── Inline SVG icons ───────────────────────────────────────────────────────────
function homeIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
}
function clockIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
}
function calendarIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
}
function usersIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>';
}
function checklistIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>';
}
function walletIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><circle cx="17" cy="15" r="1" fill="currentColor"/></svg>';
}
function starIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
}

// ── Shared date/currency utilities ─────────────────────────────────────────────
var Fmt = {
  date: function (iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },
  time: function (iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  },
  inr: function (n) {
    if (n === undefined || n === null || n === '') return '—';
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0 });
  },
  month: function (yyyymm) {
    if (!yyyymm) return '—';
    var parts = yyyymm.split('-');
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
  },
  initials: function (name) {
    if (!name) return '?';
    var p = name.trim().split(' ');
    if (p.length === 1) return p[0][0].toUpperCase();
    return (p[0][0] + p[p.length-1][0]).toUpperCase();
  },
  todayIST: function () {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  },
  currentMonth: function () {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7); // YYYY-MM
  }
};
