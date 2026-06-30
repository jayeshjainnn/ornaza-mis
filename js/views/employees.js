/**
 * views/employees.js — Employee list + add/edit form
 * Salary fields (monthlySalary, bankName, accountNumber, ifscCode) only shown to Owner.
 */
Views.employees = (function () {
  var _employees = [];
  var _filtered  = [];

  function render(container) {
    container.innerHTML =
      '<div class="page-header">' +
        '<h2>Team</h2>' +
        '<div class="subtitle">Active employees</div>' +
      '</div>' +
      '<div class="search-bar">' +
        '<svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '<input id="emp-search" type="text" class="form-control" placeholder="Search by name or department…">' +
      '</div>' +
      '<div id="emp-list"><div class="loading-full"><div class="spinner"></div></div></div>' +
      (Auth.canManageStaff()
        ? '<button class="fab" id="btn-add-emp" title="Add employee">＋</button>'
        : '');

    _loadEmployees();

    var searchEl = document.getElementById('emp-search');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        _filterAndRender(searchEl.value.trim().toLowerCase());
      });
    }

    var addBtn = document.getElementById('btn-add-emp');
    if (addBtn) addBtn.addEventListener('click', function () { _openForm(null); });
  }

  function _loadEmployees() {
    DB.getEmployees().then(function (rows) {
      _employees = rows.filter(function (e) { return !e.isDeleted && e.status !== 'Inactive'; });
      _filtered  = _employees.slice();
      _renderList(_filtered);
    });
  }

  function _filterAndRender(q) {
    if (!q) { _filtered = _employees.slice(); }
    else {
      _filtered = _employees.filter(function (e) {
        return (e.name || '').toLowerCase().includes(q) ||
               (e.department || '').toLowerCase().includes(q) ||
               (e.designation || '').toLowerCase().includes(q);
      });
    }
    _renderList(_filtered);
  }

  function _renderList(rows) {
    var el = document.getElementById('emp-list');
    if (!el) return;
    if (rows.length === 0) {
      el.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><p>No employees found.</p></div>';
      return;
    }

    el.innerHTML = rows.map(function (e) {
      return '<div class="card list-item" style="padding:14px;cursor:pointer" data-id="' + _esc(e.employeeId) + '">' +
        '<div class="list-avatar">' + Fmt.initials(e.name) + '</div>' +
        '<div class="list-info">' +
          '<div class="list-name">' + _esc(e.name) + '</div>' +
          '<div class="list-sub">' + _esc(e.designation || '') + ' · ' + _esc(e.department || '') + '</div>' +
        '</div>' +
        '<div class="list-right">' +
          (Auth.isOwner() && e.monthlySalary
            ? '<div class="fw-600 fs-13">' + Fmt.inr(e.monthlySalary) + '</div>'
            : '') +
          '<span class="badge ' + (e.status === 'Active' ? 'badge-success' : 'badge-neutral') + '">' + (e.status || 'Active') + '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    el.querySelectorAll('[data-id]').forEach(function (card) {
      card.addEventListener('click', function () {
        var emp = _employees.find(function (e) { return e.employeeId === card.dataset.id; });
        if (emp) _openDetail(emp);
      });
    });
  }

  // ── Detail sheet ────────────────────────────────────────────────────────────
  function _openDetail(emp) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    var isOwner = Auth.isOwner();

    overlay.innerHTML =
      '<div class="modal-sheet">' +
        '<div class="modal-handle"></div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
          '<h3 class="modal-title" style="margin:0">' + _esc(emp.name) + '</h3>' +
          (Auth.canManageStaff() ? '<button class="btn btn-ghost btn-sm" id="btn-edit-emp">Edit</button>' : '') +
        '</div>' +

        _detailRow('Employee Code', emp.employeeCode) +
        _detailRow('Department',    emp.department) +
        _detailRow('Designation',   emp.designation) +
        _detailRow('Phone',         emp.phone) +
        _detailRow('Email',         emp.email) +
        _detailRow('Joining Date',  Fmt.date(emp.joiningDate)) +
        _detailRow('Status',        '<span class="badge ' + (emp.status === 'Active' ? 'badge-success' : 'badge-neutral') + '">' + (emp.status || 'Active') + '</span>') +

        (isOwner
          ? '<div class="divider"></div>' +
            '<div class="section-label">Salary & Bank</div>' +
            _detailRow('Monthly Salary', Fmt.inr(emp.monthlySalary)) +
            _detailRow('Bank',           emp.bankName) +
            _detailRow('Account No.',    emp.accountNumber) +
            _detailRow('IFSC',           emp.ifscCode)
          : '') +

        '<button class="btn btn-ghost btn-block mt-16" id="btn-close-detail">Close</button>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.querySelector('#btn-close-detail').addEventListener('click', function () { overlay.remove(); });
    var editBtn = overlay.querySelector('#btn-edit-emp');
    if (editBtn) editBtn.addEventListener('click', function () { overlay.remove(); _openForm(emp); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
  }

  function _detailRow(label, value) {
    return '<div class="payroll-row"><span class="label">' + label + '</span><span class="value">' + (value || '—') + '</span></div>';
  }

  // ── Add / Edit form ─────────────────────────────────────────────────────────
  function _openForm(emp) {
    var isEdit  = !!emp;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    var isOwner = Auth.isOwner();

    overlay.innerHTML =
      '<div class="modal-sheet">' +
        '<div class="modal-handle"></div>' +
        '<h3 class="modal-title">' + (isEdit ? 'Edit Employee' : 'Add Employee') + '</h3>' +

        '<div class="form-group"><label class="form-label">Full Name *</label><input id="ef-name" class="form-control" value="' + _val(emp, 'name') + '" placeholder="Employee name"></div>' +
        '<div class="form-group"><label class="form-label">Employee Code</label><input id="ef-code" class="form-control" value="' + _val(emp, 'employeeCode') + '" placeholder="e.g. OJ001"></div>' +
        '<div class="form-group"><label class="form-label">Department</label><input id="ef-dept" class="form-control" value="' + _val(emp, 'department') + '" placeholder="e.g. Sales"></div>' +
        '<div class="form-group"><label class="form-label">Designation</label><input id="ef-desig" class="form-control" value="' + _val(emp, 'designation') + '" placeholder="e.g. Sales Executive"></div>' +
        '<div class="form-group"><label class="form-label">Phone</label><input id="ef-phone" class="form-control" type="tel" value="' + _val(emp, 'phone') + '"></div>' +
        '<div class="form-group"><label class="form-label">Email</label><input id="ef-email" class="form-control" type="email" value="' + _val(emp, 'email') + '"></div>' +
        '<div class="form-group"><label class="form-label">Joining Date</label><input id="ef-join" class="form-control" type="date" value="' + _val(emp, 'joiningDate') + '"></div>' +
        '<div class="form-group"><label class="form-label">Status</label><select id="ef-status" class="form-control"><option value="Active"' + ((!emp || emp.status === 'Active') ? ' selected' : '') + '>Active</option><option value="Inactive"' + (emp && emp.status === 'Inactive' ? ' selected' : '') + '>Inactive</option></select></div>' +

        (isOwner
          ? '<div class="divider"></div>' +
            '<div class="section-label">Salary & Bank (Owner only)</div>' +
            '<div class="form-group"><label class="form-label">Monthly Salary (₹)</label><input id="ef-salary" class="form-control" type="number" value="' + _val(emp, 'monthlySalary') + '" placeholder="e.g. 15000"></div>' +
            '<div class="form-group"><label class="form-label">Bank Name</label><input id="ef-bank" class="form-control" value="' + _val(emp, 'bankName') + '"></div>' +
            '<div class="form-group"><label class="form-label">Account Number</label><input id="ef-acc" class="form-control" value="' + _val(emp, 'accountNumber') + '"></div>' +
            '<div class="form-group"><label class="form-label">IFSC Code</label><input id="ef-ifsc" class="form-control" value="' + _val(emp, 'ifscCode') + '"></div>'
          : '') +

        '<div id="ef-error" class="form-error hidden" style="margin-bottom:12px"></div>' +
        '<button id="ef-save" class="btn btn-primary btn-block">Save Employee</button>' +
        '<button id="ef-cancel" class="btn btn-ghost btn-block mt-8">Cancel</button>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.querySelector('#ef-cancel').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#ef-save').addEventListener('click', function () { _saveEmployee(emp, overlay); });
  }

  function _saveEmployee(existing, overlay) {
    var name  = overlay.querySelector('#ef-name').value.trim();
    var errEl = overlay.querySelector('#ef-error');
    if (!name) { errEl.textContent = 'Name is required.'; errEl.classList.remove('hidden'); return; }

    var now    = Sync.nowISO();
    var record = Object.assign({}, existing || {}, {
      employeeId:   (existing && existing.employeeId) || Sync.uuid(),
      employeeCode: overlay.querySelector('#ef-code').value.trim(),
      name:         name,
      department:   overlay.querySelector('#ef-dept').value.trim(),
      designation:  overlay.querySelector('#ef-desig').value.trim(),
      phone:        overlay.querySelector('#ef-phone').value.trim(),
      email:        overlay.querySelector('#ef-email').value.trim(),
      joiningDate:  overlay.querySelector('#ef-join').value || '',
      status:       overlay.querySelector('#ef-status').value,
      updatedAt:    now,
      isDeleted:    false
    });
    if (!record.createdAt) record.createdAt = now;

    if (Auth.isOwner()) {
      record.monthlySalary = overlay.querySelector('#ef-salary') ? Number(overlay.querySelector('#ef-salary').value) || 0 : (existing && existing.monthlySalary) || 0;
      record.bankName      = overlay.querySelector('#ef-bank')   ? overlay.querySelector('#ef-bank').value.trim()   : (existing && existing.bankName) || '';
      record.accountNumber = overlay.querySelector('#ef-acc')    ? overlay.querySelector('#ef-acc').value.trim()    : (existing && existing.accountNumber) || '';
      record.ifscCode      = overlay.querySelector('#ef-ifsc')   ? overlay.querySelector('#ef-ifsc').value.trim()   : (existing && existing.ifscCode) || '';
    }

    var saveBtn = overlay.querySelector('#ef-save');
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';

    Sync.save('employees', record).then(function () {
      Toast.success(existing ? 'Employee updated.' : 'Employee added.');
      overlay.remove();
      _loadEmployees();
    }).catch(function () {
      saveBtn.disabled = false; saveBtn.textContent = 'Save Employee';
      errEl.textContent = 'Save failed. Check connection.'; errEl.classList.remove('hidden');
    });
  }

  function _val(obj, key) { return obj && obj[key] ? _esc(String(obj[key])) : ''; }
  function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  return { render: render };
})();
