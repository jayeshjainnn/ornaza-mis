/**
 * views/dashboard.js — Home dashboard
 * Shows: greeting, today's attendance status, summary stats, quick actions.
 */
Views.dashboard = (function () {

  function render(container) {
    var today   = Fmt.todayIST();
    var role    = Auth.getRole();
    var empId   = Auth.getEmployeeId();
    var name    = Auth.getName().split(' ')[0];

    container.innerHTML =
      '<div class="page-header">' +
        '<h2>Hello, ' + _esc(name) + '</h2>' +
        '<div class="subtitle">' + _greet() + ' &nbsp;·&nbsp; ' + _formatDate(today) + '</div>' +
      '</div>' +
      '<div class="stat-grid" id="dash-stats"><div class="loading-full"><div class="spinner"></div></div></div>' +
      '<div class="card" id="dash-today"><div class="card-title">Today\'s Status</div><div class="loading-full"><div class="spinner sm"></div></div></div>' +
      (Auth.canApproveAttend() ? '<div class="card" id="dash-queue"><div class="card-title">Pending Approvals</div><div class="loading-full"><div class="spinner sm"></div></div></div>' : '') +
      '<div class="card" id="dash-quick"><div class="card-title">Quick Actions</div><div id="dash-actions"></div></div>';

    _loadStats(today, role, empId);
    _loadTodayStatus(today, empId);
    if (Auth.canApproveAttend()) _loadQueue();
    _renderQuickActions();
  }

  function _greet() {
    var h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function _formatDate(ymd) {
    var d = new Date(ymd + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function _loadStats(today, role, empId) {
    var statsEl = document.getElementById('dash-stats');

    Promise.all([
      DB.getEmployees(),
      DB.getAttendanceByEmployee(empId)
    ]).then(function (results) {
      var employees  = results[0].filter(function (e) { return !e.isDeleted && e.status === 'Active'; });
      var myAttend   = results[1].filter(function (a) { return !a.isDeleted; });

      var todayRec = myAttend.filter(function (a) { return a.date === today; })[0];
      var thisMonth = Fmt.currentMonth();
      var monthRecs = myAttend.filter(function (a) { return a.date && a.date.startsWith(thisMonth) && !a.isDeleted; });
      var presentDays = monthRecs.filter(function (a) { return a.verificationStatus !== 'Declined'; }).length;

      var html = '';

      if (role === 'Owner' || role === 'HR') {
        html +=
          '<div class="stat-card primary">' +
            '<div class="stat-label">Active Staff</div>' +
            '<div class="stat-value">' + employees.length + '</div>' +
            '<div class="stat-sub">Total employees</div>' +
          '</div>';
      }

      html +=
        '<div class="stat-card">' +
          '<div class="stat-label">This Month</div>' +
          '<div class="stat-value">' + presentDays + '</div>' +
          '<div class="stat-sub">Days present</div>' +
        '</div>';

      if (todayRec) {
        html +=
          '<div class="stat-card tertiary">' +
            '<div class="stat-label">Checked In</div>' +
            '<div class="stat-value">' + Fmt.time(todayRec.checkIn) + '</div>' +
            '<div class="stat-sub">' + (todayRec.checkInStatus || 'On time') + '</div>' +
          '</div>';
      } else {
        html +=
          '<div class="stat-card">' +
            '<div class="stat-label">Today</div>' +
            '<div class="stat-value">—</div>' +
            '<div class="stat-sub">Not checked in</div>' +
          '</div>';
      }

      // If no owner stats yet, fill the grid
      if (role !== 'Owner' && role !== 'HR') {
        html = '<div class="stat-card">' +
            '<div class="stat-label">This Month</div>' +
            '<div class="stat-value">' + presentDays + '</div>' +
            '<div class="stat-sub">Days present</div>' +
          '</div>' +
          (todayRec
            ? '<div class="stat-card tertiary"><div class="stat-label">Checked In</div><div class="stat-value">' + Fmt.time(todayRec.checkIn) + '</div><div class="stat-sub">' + (todayRec.checkInStatus || 'On time') + '</div></div>'
            : '<div class="stat-card"><div class="stat-label">Today</div><div class="stat-value">—</div><div class="stat-sub">Not checked in</div></div>'
          );
      }

      statsEl.innerHTML = html;
    }).catch(function () {
      statsEl.innerHTML = '<div class="stat-card"><div class="stat-label">Stats</div><div class="stat-value text-muted">—</div></div>';
    });
  }

  function _loadTodayStatus(today, empId) {
    var el = document.getElementById('dash-today');
    if (!el) return;

    DB.getTodayAttendance(empId, today).then(function (recs) {
      var rec = recs[0];
      if (!rec) {
        el.innerHTML =
          '<div class="card-title">Today\'s Status</div>' +
          '<div style="text-align:center;padding:16px 0">' +
            '<span class="badge badge-neutral">Not Checked In</span>' +
            '<p style="margin-top:10px;font-size:13px">Tap <b>Attendance</b> below to check in.</p>' +
          '</div>';
        return;
      }

      var statusClass = rec.verificationStatus === 'Auto' ? 'badge-success' :
                        rec.verificationStatus === 'Pending' ? 'badge-warning' :
                        rec.verificationStatus === 'Declined' ? 'badge-danger' : 'badge-info';

      el.innerHTML =
        '<div class="card-title">Today\'s Status</div>' +
        '<div class="payroll-row">' +
          '<span class="label">Check-in</span>' +
          '<span class="value">' + (Fmt.time(rec.checkIn) || '—') + '</span>' +
        '</div>' +
        '<div class="payroll-row">' +
          '<span class="label">Status</span>' +
          '<span class="value">' + _badge(rec.checkInStatus, rec.checkInStatus === 'Late' ? 'badge-warning' : 'badge-success') + '</span>' +
        '</div>' +
        (rec.checkOut
          ? '<div class="payroll-row"><span class="label">Check-out</span><span class="value">' + Fmt.time(rec.checkOut) + '</span></div>'
          : '') +
        (rec.lateDeductionAmount > 0
          ? '<div class="deduction-alert"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>25% salary deduction — ' + Fmt.inr(rec.lateDeductionAmount) + '</div>'
          : '') +
        '<div class="payroll-row"><span class="label">Verification</span><span class="value"><span class="badge ' + statusClass + '">' + (rec.verificationStatus || '—') + '</span></span></div>';
    });
  }

  function _loadQueue() {
    var el = document.getElementById('dash-queue');
    if (!el) return;

    DB.getPendingAttendance().then(function (rows) {
      rows = rows.filter(function (r) { return !r.isDeleted; });
      el.innerHTML =
        '<div class="card-title">Pending Approvals</div>' +
        (rows.length === 0
          ? '<p class="text-muted" style="font-size:13px">No pending attendance.</p>'
          : '<p style="font-size:13px">' + rows.length + ' attendance record(s) awaiting review. <a href="#attendance">View all →</a></p>'
        );
    });
  }

  function _renderQuickActions() {
    var el = document.getElementById('dash-actions');
    if (!el) return;
    var btns = [
      { label: 'Mark Attendance', hash: '#checkin', style: 'btn-primary' }
    ];
    if (Auth.canApproveLeaves()) {
      btns.push({ label: 'Review Queue', hash: '#attendance', style: 'btn-secondary' });
    }
    if (Auth.canManageStaff()) {
      btns.push({ label: 'Manage Team', hash: '#employees', style: 'btn-ghost' });
    }
    if (Auth.canRunPayroll()) {
      btns.push({ label: 'Payroll', hash: '#payroll', style: 'btn-ghost' });
    }
    el.innerHTML = btns.map(function (b) {
      return '<a href="' + b.hash + '" class="btn ' + b.style + ' btn-block mb-8">' + b.label + '</a>';
    }).join('');
  }

  function _badge(text, cls) {
    return '<span class="badge ' + (cls || 'badge-neutral') + '">' + _esc(text || '—') + '</span>';
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { render: render };
})();
