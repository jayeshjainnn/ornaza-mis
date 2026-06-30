/**
 * views/attendance.js — HR Attendance approval queue + history
 * HR / Owner see all; Employee sees own only.
 */
Views.attendance = (function () {
  var _empMap = {};

  function render(container) {
    var role = Auth.getRole();

    container.innerHTML =
      '<div class="page-header"><h2>Attendance</h2><div class="subtitle">' +
      (Auth.canApproveAttend() ? 'Review & approve records' : 'Your attendance history') +
      '</div></div>' +
      '<div class="tabs">' +
        (Auth.canApproveAttend() ? '<button class="tab-btn active" data-tab="queue">Pending</button>' : '') +
        '<button class="tab-btn' + (Auth.canApproveAttend() ? '' : ' active') + '" data-tab="history">History</button>' +
      '</div>' +
      '<div id="att-content"><div class="loading-full"><div class="spinner"></div></div></div>';

    _bindTabs();
    _loadEmpMap().then(function () {
      _loadTab(Auth.canApproveAttend() ? 'queue' : 'history');
    });
  }

  function _bindTabs() {
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        _loadTab(btn.dataset.tab);
      });
    });
  }

  function _loadEmpMap() {
    return DB.getEmployees().then(function (rows) {
      rows.forEach(function (e) { _empMap[e.employeeId] = e; });
    });
  }

  function _loadTab(tab) {
    var el = document.getElementById('att-content');
    el.innerHTML = '<div class="loading-full"><div class="spinner"></div></div>';

    if (tab === 'queue') {
      DB.getPendingAttendance().then(function (rows) {
        rows = rows.filter(function (r) { return !r.isDeleted; });
        _renderQueue(el, rows);
      });
    } else {
      var empId = Auth.getEmployeeId();
      var role  = Auth.getRole();
      Promise.resolve(
        (role === 'Owner' || role === 'HR')
          ? DB.getAll('attendance')
          : DB.getAttendanceByEmployee(empId)
      ).then(function (rows) {
        rows = rows.filter(function (r) { return !r.isDeleted; })
                   .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        _renderHistory(el, rows);
      });
    }
  }

  function _renderQueue(el, rows) {
    if (rows.length === 0) {
      el.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg><p>No pending records.</p></div>';
      return;
    }

    el.innerHTML = rows.map(function (r) {
      var emp = _empMap[r.employeeId] || {};
      return '<div class="queue-item" data-id="' + _esc(r.attendanceId) + '" data-date="' + _esc(r.date) + '">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          (r.selfieUrl ? '<img src="' + _esc(r.selfieUrl) + '" class="selfie-thumb">' : '<div class="list-avatar">' + Fmt.initials(emp.name) + '</div>') +
          '<div class="list-info">' +
            '<div class="list-name">' + _esc(emp.name || r.employeeId) + '</div>' +
            '<div class="list-sub">' + Fmt.date(r.date) + ' &nbsp;·&nbsp; In: ' + Fmt.time(r.checkIn) + '</div>' +
            '<div class="list-sub">' +
              '<span class="badge ' + (r.checkInStatus === 'Late' ? 'badge-warning' : 'badge-success') + '">' + (r.checkInStatus || 'On Time') + '</span>' +
              ' &nbsp;Distance: ' + (r.distanceMeters !== undefined ? r.distanceMeters + 'm' : '—') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="queue-actions">' +
          '<button class="btn btn-secondary btn-sm btn-approve">Approve</button>' +
          '<button class="btn btn-danger btn-sm btn-decline">Decline</button>' +
        '</div>' +
      '</div>';
    }).join('');

    el.querySelectorAll('[data-id]').forEach(function (card) {
      var id      = card.dataset.id;
      var dateStr = card.dataset.date;
      card.querySelector('.btn-approve').addEventListener('click', function () { _decide(id, dateStr, 'Approved', el); });
      card.querySelector('.btn-decline').addEventListener('click', function () { _promptDecline(id, dateStr, el); });
    });
  }

  function _decide(id, dateStr, decision, el) {
    Sync.decideAttendance(id, dateStr, decision, '').then(function () {
      Toast.success(decision === 'Approved' ? 'Approved.' : 'Declined.');
      // Refresh queue
      DB.getPendingAttendance().then(function (rows) {
        rows = rows.filter(function (r) { return !r.isDeleted; });
        _renderQueue(el, rows);
      });
    });
  }

  function _promptDecline(id, dateStr, el) {
    var reason = prompt('Reason for declining (required):');
    if (reason === null) return; // cancelled
    if (!reason.trim()) { Toast.error('Reason required to decline.'); return; }
    Sync.decideAttendance(id, dateStr, 'Declined', reason).then(function () {
      Toast.info('Declined with reason.');
      DB.getPendingAttendance().then(function (rows) {
        rows = rows.filter(function (r) { return !r.isDeleted; });
        _renderQueue(el, rows);
      });
    });
  }

  function _renderHistory(el, rows) {
    if (rows.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>No attendance records.</p></div>';
      return;
    }

    el.innerHTML = rows.slice(0, 60).map(function (r) {
      var emp = _empMap[r.employeeId] || {};
      var statusCls = r.verificationStatus === 'Auto' || r.verificationStatus === 'Approved' ? 'badge-success' :
                      r.verificationStatus === 'Pending' ? 'badge-warning' :
                      r.verificationStatus === 'Declined' ? 'badge-danger' : 'badge-neutral';
      return '<div class="list-item">' +
        '<div class="list-avatar">' + Fmt.initials(emp.name || Auth.getName()) + '</div>' +
        '<div class="list-info">' +
          (emp.name ? '<div class="list-name">' + _esc(emp.name) + '</div>' : '') +
          '<div class="list-sub">' + Fmt.date(r.date) + '</div>' +
          '<div class="list-sub">In: ' + Fmt.time(r.checkIn) + (r.checkOut ? ' &nbsp;Out: ' + Fmt.time(r.checkOut) : '') + '</div>' +
        '</div>' +
        '<div class="list-right">' +
          '<span class="badge ' + statusCls + '">' + (r.verificationStatus || '—') + '</span>' +
          (r.lateDeductionAmount > 0 ? '<div class="text-danger fs-12 mt-4">-' + Fmt.inr(r.lateDeductionAmount) + '</div>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  return { render: render };
})();
