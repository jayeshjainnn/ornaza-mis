/**
 * views/leaves.js — Leave requests + HR approval queue
 */
Views.leaves = (function () {
  var _empMap = {};

  function render(container) {
    container.innerHTML =
      '<div class="page-header"><h2>Leaves</h2><div class="subtitle">Apply and track leave requests</div></div>' +
      '<div class="tabs">' +
        '<button class="tab-btn active" data-tab="mine">My Leaves</button>' +
        (Auth.canApproveLeaves() ? '<button class="tab-btn" data-tab="pending">Pending</button>' : '') +
      '</div>' +
      '<div id="leave-content"><div class="loading-full"><div class="spinner"></div></div></div>' +
      '<button class="fab" id="btn-apply-leave" title="Apply leave">＋</button>';

    _loadEmpMap().then(function () { _loadTab('mine'); });
    _bindTabs();
    document.getElementById('btn-apply-leave').addEventListener('click', _openApplyForm);
  }

  function _loadEmpMap() {
    return DB.getEmployees().then(function (rows) {
      rows.forEach(function (e) { _empMap[e.employeeId] = e; });
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

  function _loadTab(tab) {
    var el = document.getElementById('leave-content');
    el.innerHTML = '<div class="loading-full"><div class="spinner"></div></div>';

    if (tab === 'pending') {
      DB.getPendingLeaves().then(function (rows) {
        _renderPending(el, rows.filter(function (r) { return !r.isDeleted; }));
      });
    } else {
      var empId = Auth.getEmployeeId();
      DB.getLeaves().then(function (rows) {
        rows = rows.filter(function (r) {
          return !r.isDeleted && (Auth.isOwner() || Auth.isHR() || r.employeeId === empId);
        }).sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
        _renderMine(el, rows);
      });
    }
  }

  function _renderMine(el, rows) {
    if (rows.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>No leave records. Tap + to apply.</p></div>';
      return;
    }

    el.innerHTML = rows.map(function (r) {
      var emp = _empMap[r.employeeId] || {};
      var cls = r.status === 'Approved' ? 'badge-success' : r.status === 'Declined' ? 'badge-danger' : 'badge-warning';
      return '<div class="card mb-8">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
          '<div>' +
            '<div class="fw-600">' + _esc(r.type || 'Leave') + '</div>' +
            (emp.name ? '<div class="fs-12 text-muted mt-4">' + _esc(emp.name) + '</div>' : '') +
            '<div class="fs-12 text-muted mt-4">' + Fmt.date(r.fromDate) + ' → ' + Fmt.date(r.toDate) + '</div>' +
            (r.reason ? '<div class="fs-12 text-muted mt-4">' + _esc(r.reason) + '</div>' : '') +
          '</div>' +
          '<span class="badge ' + cls + '">' + (r.status || 'Pending') + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function _renderPending(el, rows) {
    if (rows.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>No pending leaves.</p></div>';
      return;
    }

    el.innerHTML = rows.map(function (r) {
      var emp = _empMap[r.employeeId] || {};
      return '<div class="queue-item" data-id="' + _esc(r.leaveId) + '">' +
        '<div class="list-info">' +
          '<div class="list-name">' + _esc(emp.name || r.employeeId) + '</div>' +
          '<div class="list-sub">' + _esc(r.type || 'Leave') + ' &nbsp;·&nbsp; ' + Fmt.date(r.fromDate) + ' → ' + Fmt.date(r.toDate) + '</div>' +
          (r.reason ? '<div class="list-sub mt-4">' + _esc(r.reason) + '</div>' : '') +
        '</div>' +
        '<div class="queue-actions">' +
          '<button class="btn btn-secondary btn-sm btn-approve">Approve</button>' +
          '<button class="btn btn-danger btn-sm btn-decline">Decline</button>' +
        '</div>' +
      '</div>';
    }).join('');

    el.querySelectorAll('[data-id]').forEach(function (card) {
      var id = card.dataset.id;
      card.querySelector('.btn-approve').addEventListener('click', function () { _decide(id, 'Approved', el); });
      card.querySelector('.btn-decline').addEventListener('click', function () { _decide(id, 'Declined', el); });
    });
  }

  function _decide(leaveId, decision, el) {
    Sync.decideLeave(leaveId, decision).then(function () {
      Toast.success(decision + '.');
      DB.getPendingLeaves().then(function (rows) {
        _renderPending(el, rows.filter(function (r) { return !r.isDeleted; }));
      });
    });
  }

  function _openApplyForm() {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.innerHTML =
      '<div class="modal-sheet">' +
        '<div class="modal-handle"></div>' +
        '<h3 class="modal-title">Apply for Leave</h3>' +
        '<div class="form-group"><label class="form-label">Leave Type</label>' +
          '<select id="lf-type" class="form-control"><option>Sick Leave</option><option>Casual Leave</option><option>Earned Leave</option><option>Other</option></select>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">From Date</label><input id="lf-from" type="date" class="form-control" value="' + Fmt.todayIST() + '"></div>' +
        '<div class="form-group"><label class="form-label">To Date</label><input id="lf-to" type="date" class="form-control" value="' + Fmt.todayIST() + '"></div>' +
        '<div class="form-group"><label class="form-label">Reason</label><textarea id="lf-reason" class="form-control" placeholder="Brief reason…"></textarea></div>' +
        '<div id="lf-error" class="form-error hidden" style="margin-bottom:12px"></div>' +
        '<button id="lf-save" class="btn btn-primary btn-block">Submit Request</button>' +
        '<button id="lf-cancel" class="btn btn-ghost btn-block mt-8">Cancel</button>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.querySelector('#lf-cancel').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#lf-save').addEventListener('click', function () {
      var from   = overlay.querySelector('#lf-from').value;
      var to     = overlay.querySelector('#lf-to').value;
      var type   = overlay.querySelector('#lf-type').value;
      var reason = overlay.querySelector('#lf-reason').value.trim();
      var errEl  = overlay.querySelector('#lf-error');

      if (!from || !to) { errEl.textContent = 'Select both dates.'; errEl.classList.remove('hidden'); return; }
      if (from > to)    { errEl.textContent = 'From date must be before To date.'; errEl.classList.remove('hidden'); return; }

      var now    = Sync.nowISO();
      var record = {
        leaveId:    Sync.uuid(),
        employeeId: Auth.getEmployeeId(),
        fromDate:   from,
        toDate:     to,
        type:       type,
        reason:     reason,
        status:     'Pending',
        decidedBy:  '',
        decidedAt:  '',
        createdAt:  now,
        updatedAt:  now,
        isDeleted:  false
      };

      var btn = overlay.querySelector('#lf-save');
      btn.disabled = true; btn.textContent = 'Submitting…';

      Sync.save('leaves', record).then(function () {
        Toast.success('Leave request submitted.');
        overlay.remove();
        _loadTab('mine');
      }).catch(function () {
        btn.disabled = false; btn.textContent = 'Submit Request';
        errEl.textContent = 'Submit failed.'; errEl.classList.remove('hidden');
      });
    });
  }

  function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  return { render: render };
})();
