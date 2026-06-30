/**
 * views/payroll.js — Payroll (Owner only)
 * Run payroll for a month, review breakdown, mark as paid.
 */
Views.payroll = (function () {
  var _empMap = {};
  var _month  = Fmt.currentMonth();

  function render(container) {
    if (!Auth.canSeePayroll()) {
      container.innerHTML = '<div class="empty-state"><p>Payroll is visible to Owner only.</p></div>';
      return;
    }

    container.innerHTML =
      '<div class="page-header"><h2>Payroll</h2><div class="subtitle">Monthly salary management</div></div>' +

      // Month picker
      '<div class="card mb-12">' +
        '<div class="flex items-center gap-8">' +
          '<input id="pay-month" type="month" class="form-control" value="' + _month + '" style="flex:1">' +
          '<button id="btn-run-payroll" class="btn btn-primary">Run Payroll</button>' +
        '</div>' +
        '<p class="fs-12 text-muted mt-8">Run calculates attendance, deductions and advances for selected month.</p>' +
      '</div>' +

      '<div id="payroll-list"><div class="loading-full"><div class="spinner"></div></div></div>';

    DB.getEmployees().then(function (rows) {
      rows.forEach(function (e) { _empMap[e.employeeId] = e; });
      _loadPayroll(_month);
    });

    document.getElementById('pay-month').addEventListener('change', function () {
      _month = this.value;
      _loadPayroll(_month);
    });

    document.getElementById('btn-run-payroll').addEventListener('click', function () {
      if (!_month) return;
      if (!confirm('Run payroll for ' + Fmt.month(_month) + '? This will calculate all salaries from attendance.')) return;
      var btn = document.getElementById('btn-run-payroll');
      btn.disabled = true; btn.textContent = 'Running…';

      Sync.runPayroll(_month).then(function () {
        Toast.success('Payroll queued. Syncing…');
        setTimeout(function () {
          btn.disabled = false; btn.textContent = 'Run Payroll';
          _loadPayroll(_month);
        }, 3000);
      }).catch(function () {
        btn.disabled = false; btn.textContent = 'Run Payroll';
        Toast.error('Failed to run payroll.');
      });
    });
  }

  function _loadPayroll(month) {
    var el = document.getElementById('payroll-list');
    if (!el) return;
    el.innerHTML = '<div class="loading-full"><div class="spinner"></div></div>';

    DB.getPayrollByMonth(month).then(function (rows) {
      rows = rows.filter(function (r) { return !r.isDeleted; });
      if (rows.length === 0) {
        el.innerHTML =
          '<div class="empty-state"><p>No payroll records for ' + Fmt.month(month) + '.</p><p class="mt-8 fs-12">Run payroll above to generate records.</p></div>';
        return;
      }

      el.innerHTML = rows.map(function (r) {
        var emp    = _empMap[r.employeeId] || {};
        var isPaid = r.status === 'Paid';
        return '<div class="card mb-12" data-pid="' + _esc(r.payrollId) + '">' +
          // Header
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
            '<div>' +
              '<div class="fw-600">' + _esc(emp.name || r.employeeId) + '</div>' +
              '<div class="fs-12 text-muted">' + _esc(emp.designation || '') + '</div>' +
            '</div>' +
            '<span class="badge ' + (isPaid ? 'badge-success' : 'badge-warning') + '">' + (r.status || 'Draft') + '</span>' +
          '</div>' +

          // Breakdown
          '<div class="payroll-row"><span class="label">Days Present</span><span class="value">' + (r.presentDays || 0) + ' / ' + (r.totalDays || 0) + '</span></div>' +
          '<div class="payroll-row"><span class="label">Late Days</span><span class="value">' + (r.lateDays || 0) + '</span></div>' +
          '<div class="payroll-row"><span class="label">Gross Salary</span><span class="value addition">' + Fmt.inr(r.grossSalary) + '</span></div>' +
          (r.incentive    ? '<div class="payroll-row"><span class="label">Incentive</span><span class="value addition">+' + Fmt.inr(r.incentive) + '</span></div>' : '') +
          (r.overtime     ? '<div class="payroll-row"><span class="label">Overtime</span><span class="value addition">+' + Fmt.inr(r.overtime) + '</span></div>' : '') +
          (r.lateDeduction ? '<div class="payroll-row"><span class="label">Late Deduction</span><span class="value deduction">-' + Fmt.inr(r.lateDeduction) + '</span></div>' : '') +
          (r.manualDeduction ? '<div class="payroll-row"><span class="label">Manual Deduction</span><span class="value deduction">-' + Fmt.inr(r.manualDeduction) + '</span></div>' : '') +
          (r.advanceDeduction ? '<div class="payroll-row"><span class="label">Advance EMI</span><span class="value deduction">-' + Fmt.inr(r.advanceDeduction) + '</span></div>' : '') +
          '<div class="payroll-row total"><span class="label">Net Payable</span><span class="value">' + Fmt.inr(r.netPayable) + '</span></div>' +

          // Paid info
          (isPaid
            ? '<div class="divider"></div><div class="fs-12 text-muted">Paid via ' + _esc(r.paymentMode || '—') + ' on ' + Fmt.date(r.paidDate) + (r.utrId ? ' · UTR: ' + _esc(r.utrId) : '') + '</div>'
            : '<button class="btn btn-primary btn-block mt-12 btn-mark-paid">Mark as Paid</button>'
          ) +
        '</div>';
      }).join('');

      el.querySelectorAll('.btn-mark-paid').forEach(function (btn) {
        var card    = btn.closest('[data-pid]');
        var pid     = card.dataset.pid;
        var payRec  = rows.find(function (r) { return r.payrollId === pid; });
        btn.addEventListener('click', function () { _openMarkPaid(payRec); });
      });
    });
  }

  function _openMarkPaid(rec) {
    var emp     = _empMap[rec.employeeId] || {};
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.innerHTML =
      '<div class="modal-sheet">' +
        '<div class="modal-handle"></div>' +
        '<h3 class="modal-title">Mark as Paid — ' + _esc(emp.name) + '</h3>' +
        '<p class="fs-12 text-muted mb-12">Net payable: <b>' + Fmt.inr(rec.netPayable) + '</b></p>' +

        '<div class="form-group"><label class="form-label">Payment Mode</label><select id="pm-mode" class="form-control"><option>NEFT</option><option>UPI</option><option>Cash</option></select></div>' +
        '<div class="form-group"><label class="form-label">Paid Date</label><input id="pm-date" type="date" class="form-control" value="' + Fmt.todayIST() + '"></div>' +
        '<div class="form-group"><label class="form-label">UTR / Reference ID</label><input id="pm-utr" class="form-control" placeholder="Transaction ID (optional for Cash)"></div>' +
        '<div class="form-group"><label class="form-label">Remarks</label><input id="pm-remarks" class="form-control" placeholder="Optional remarks"></div>' +

        '<button id="pm-save" class="btn btn-primary btn-block">Confirm Payment</button>' +
        '<button id="pm-cancel" class="btn btn-ghost btn-block mt-8">Cancel</button>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.querySelector('#pm-cancel').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#pm-save').addEventListener('click', function () {
      var mode    = overlay.querySelector('#pm-mode').value;
      var date    = overlay.querySelector('#pm-date').value;
      var utr     = overlay.querySelector('#pm-utr').value.trim();
      var remarks = overlay.querySelector('#pm-remarks').value.trim();

      var updated = Object.assign({}, rec, {
        paymentMode: mode,
        paidDate:    date,
        utrId:       utr,
        remarks:     remarks,
        status:      'Paid',
        updatedAt:   Sync.nowISO()
      });

      var btn = overlay.querySelector('#pm-save');
      btn.disabled = true; btn.textContent = 'Saving…';

      Sync.markPaid(updated).then(function () {
        Toast.success('Payment recorded for ' + (emp.name || '') + '.');
        overlay.remove();
        _loadPayroll(_month);
      }).catch(function () {
        btn.disabled = false; btn.textContent = 'Confirm Payment';
        Toast.error('Failed. Will retry on next sync.');
      });
    });
  }

  function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  return { render: render };
})();
