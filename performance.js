/**
 * views/performance.js — Appraisals + Recruitment pipeline
 * Visible to Owner, HR, Manager.
 */
Views.performance = (function () {
  var _empMap    = {};
  var _openings  = [];

  function render(container) {
    if (!Auth.canSeeAppraisals()) {
      container.innerHTML = '<div class="empty-state"><p>Performance is not available for your role.</p></div>';
      return;
    }

    container.innerHTML =
      '<div class="page-header"><h2>Performance</h2><div class="subtitle">Appraisals & Recruitment</div></div>' +
      '<div class="tabs">' +
        '<button class="tab-btn active" data-tab="appraisals">Appraisals</button>' +
        '<button class="tab-btn" data-tab="recruitment">Recruitment</button>' +
      '</div>' +
      '<div id="perf-content"><div class="loading-full"><div class="spinner"></div></div></div>' +
      (Auth.canManageStaff() ? '<button class="fab" id="btn-perf-add">＋</button>' : '');

    _loadEmpMap().then(function () { _loadTab('appraisals'); });
    _bindTabs();

    var fab = document.getElementById('btn-perf-add');
    if (fab) fab.addEventListener('click', function () {
      var active = document.querySelector('.tab-btn.active');
      if (active && active.dataset.tab === 'recruitment') _openJobForm(null);
      else _openAppraisalForm(null);
    });
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
    var el = document.getElementById('perf-content');
    el.innerHTML = '<div class="loading-full"><div class="spinner"></div></div>';
    if (tab === 'appraisals') _renderAppraisals(el);
    else _renderRecruitment(el);
  }

  // ── Appraisals ─────────────────────────────────────────────────────────────
  function _renderAppraisals(el) {
    DB.getAppraisals().then(function (rows) {
      rows = rows.filter(function (r) { return !r.isDeleted; })
                 .sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });

      if (rows.length === 0) {
        el.innerHTML = '<div class="empty-state"><p>No appraisals yet. Tap + to add one.</p></div>';
        return;
      }

      el.innerHTML = rows.map(function (r) {
        var emp = _empMap[r.employeeId] || {};
        return '<div class="card mb-8">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
            '<div>' +
              '<div class="fw-600">' + _esc(emp.name || r.employeeId) + '</div>' +
              '<div class="fs-12 text-muted">' + _esc(r.period || '') + '</div>' +
            '</div>' +
            '<span class="badge badge-primary">' + _stars(r.finalRating || r.managerRating || 0) + '</span>' +
          '</div>' +
          (r.goals ? '<p class="fs-12 mt-8">' + _esc(r.goals) + '</p>' : '') +
          (r.comments ? '<p class="fs-12 text-muted mt-4">' + _esc(r.comments) + '</p>' : '') +
          '<div class="flex gap-8 mt-8">' +
            '<div class="fs-12">Self: <b>' + (r.selfRating || '—') + '</b></div>' +
            '<div class="fs-12">Manager: <b>' + (r.managerRating || '—') + '</b></div>' +
            '<div class="fs-12">Final: <b>' + (r.finalRating || '—') + '</b></div>' +
          '</div>' +
          '<div class="fs-12 text-muted mt-4">Status: ' + _esc(r.status || 'Draft') + '</div>' +
        '</div>';
      }).join('');
    });
  }

  function _stars(n) {
    var s = ''; for (var i = 0; i < 5; i++) s += (i < n ? '★' : '☆');
    return s;
  }

  function _openAppraisalForm(existing) {
    var employees = Object.values(_empMap);
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.innerHTML =
      '<div class="modal-sheet">' +
        '<div class="modal-handle"></div>' +
        '<h3 class="modal-title">New Appraisal</h3>' +
        '<div class="form-group"><label class="form-label">Employee</label>' +
          '<select id="ap-emp" class="form-control">' + employees.map(function (e) { return '<option value="' + e.employeeId + '">' + _esc(e.name) + '</option>'; }).join('') + '</select>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Period (e.g. Q1 2026)</label><input id="ap-period" class="form-control" placeholder="Q1 2026"></div>' +
        '<div class="form-group"><label class="form-label">Self Rating (1–5)</label><input id="ap-self" type="number" min="1" max="5" class="form-control"></div>' +
        '<div class="form-group"><label class="form-label">Manager Rating (1–5)</label><input id="ap-mgr" type="number" min="1" max="5" class="form-control"></div>' +
        '<div class="form-group"><label class="form-label">Final Rating (1–5)</label><input id="ap-final" type="number" min="1" max="5" class="form-control"></div>' +
        '<div class="form-group"><label class="form-label">Goals / Notes</label><textarea id="ap-goals" class="form-control" placeholder="Goals and targets…"></textarea></div>' +
        '<div class="form-group"><label class="form-label">Comments</label><textarea id="ap-comments" class="form-control" placeholder="Review comments…"></textarea></div>' +
        '<button id="ap-save" class="btn btn-primary btn-block">Save Appraisal</button>' +
        '<button id="ap-cancel" class="btn btn-ghost btn-block mt-8">Cancel</button>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.querySelector('#ap-cancel').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#ap-save').addEventListener('click', function () {
      var now = Sync.nowISO();
      var rec = {
        appraisalId:  Sync.uuid(),
        employeeId:   overlay.querySelector('#ap-emp').value,
        period:       overlay.querySelector('#ap-period').value.trim(),
        selfRating:   Number(overlay.querySelector('#ap-self').value) || '',
        managerRating:Number(overlay.querySelector('#ap-mgr').value) || '',
        finalRating:  Number(overlay.querySelector('#ap-final').value) || '',
        goals:        overlay.querySelector('#ap-goals').value.trim(),
        comments:     overlay.querySelector('#ap-comments').value.trim(),
        status:       'Draft',
        reviewedBy:   Auth.getUserId(),
        reviewedAt:   now,
        createdAt:    now,
        updatedAt:    now,
        isDeleted:    false
      };
      Sync.save('appraisals', rec).then(function () {
        Toast.success('Appraisal saved.'); overlay.remove(); _loadTab('appraisals');
      });
    });
  }

  // ── Recruitment ────────────────────────────────────────────────────────────
  function _renderRecruitment(el) {
    Promise.all([DB.getJobOpenings(), DB.getCandidates()]).then(function (results) {
      _openings      = results[0].filter(function (o) { return !o.isDeleted; });
      var candidates = results[1].filter(function (c) { return !c.isDeleted; });

      if (_openings.length === 0) {
        el.innerHTML = '<div class="empty-state"><p>No job openings. Tap + to create one.</p></div>';
        return;
      }

      var candByOpening = {};
      candidates.forEach(function (c) {
        if (!candByOpening[c.openingId]) candByOpening[c.openingId] = [];
        candByOpening[c.openingId].push(c);
      });

      el.innerHTML = _openings.map(function (o) {
        var cands = candByOpening[o.openingId] || [];
        var statusCls = o.status === 'Open' ? 'badge-success' : o.status === 'Closed' ? 'badge-danger' : 'badge-neutral';
        return '<div class="card mb-12" data-oid="' + _esc(o.openingId) + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">' +
            '<div><div class="fw-600">' + _esc(o.title) + '</div><div class="fs-12 text-muted">' + _esc(o.department || '') + ' &nbsp;·&nbsp; ' + (o.openingsCount || 1) + ' opening(s)</div></div>' +
            '<span class="badge ' + statusCls + '">' + (o.status || 'Open') + '</span>' +
          '</div>' +
          (o.description ? '<p class="fs-12 text-muted mb-8">' + _esc(o.description) + '</p>' : '') +
          '<div class="section-label mt-8">Candidates (' + cands.length + ')</div>' +
          (cands.length === 0
            ? '<p class="fs-12 text-muted">No candidates yet.</p>'
            : cands.map(function (c) {
                return '<div class="list-item" style="padding:8px 0">' +
                  '<div class="list-info">' +
                    '<div class="list-name">' + _esc(c.name) + '</div>' +
                    '<div class="list-sub">' + _esc(c.currentStage || 'Applied') + '</div>' +
                  '</div>' +
                  '<span class="badge badge-info">' + _esc(c.currentStage || 'Applied') + '</span>' +
                '</div>';
              }).join('')
          ) +
          '<button class="btn btn-ghost btn-sm mt-8 btn-add-cand">+ Add Candidate</button>' +
        '</div>';
      }).join('');

      el.querySelectorAll('.btn-add-cand').forEach(function (btn) {
        var oid = btn.closest('[data-oid]').dataset.oid;
        btn.addEventListener('click', function () { _openCandidateForm(oid); });
      });
    });
  }

  function _openJobForm() {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.innerHTML =
      '<div class="modal-sheet">' +
        '<div class="modal-handle"></div>' +
        '<h3 class="modal-title">New Job Opening</h3>' +
        '<div class="form-group"><label class="form-label">Job Title *</label><input id="jf-title" class="form-control" placeholder="e.g. Sales Executive"></div>' +
        '<div class="form-group"><label class="form-label">Department</label><input id="jf-dept" class="form-control" placeholder="e.g. Sales"></div>' +
        '<div class="form-group"><label class="form-label">No. of Openings</label><input id="jf-count" type="number" min="1" value="1" class="form-control"></div>' +
        '<div class="form-group"><label class="form-label">Description</label><textarea id="jf-desc" class="form-control" placeholder="Role description…"></textarea></div>' +
        '<button id="jf-save" class="btn btn-primary btn-block">Create Opening</button>' +
        '<button id="jf-cancel" class="btn btn-ghost btn-block mt-8">Cancel</button>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.querySelector('#jf-cancel').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#jf-save').addEventListener('click', function () {
      var title = overlay.querySelector('#jf-title').value.trim();
      if (!title) { Toast.error('Title required.'); return; }
      var now = Sync.nowISO();
      var rec = {
        openingId:     Sync.uuid(),
        title:         title,
        department:    overlay.querySelector('#jf-dept').value.trim(),
        openingsCount: Number(overlay.querySelector('#jf-count').value) || 1,
        description:   overlay.querySelector('#jf-desc').value.trim(),
        status:        'Open',
        createdAt:     now,
        updatedAt:     now,
        isDeleted:     false
      };
      Sync.save('jobOpenings', rec, 'jobOpenings').then(function () {
        Toast.success('Opening created.'); overlay.remove(); _loadTab('recruitment');
      });
    });
  }

  function _openCandidateForm(openingId) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    var STAGES = ['Applied','Shortlisted','Interview','Offer','Hired','Rejected'];
    overlay.innerHTML =
      '<div class="modal-sheet">' +
        '<div class="modal-handle"></div>' +
        '<h3 class="modal-title">Add Candidate</h3>' +
        '<div class="form-group"><label class="form-label">Full Name *</label><input id="cf-name" class="form-control"></div>' +
        '<div class="form-group"><label class="form-label">Phone</label><input id="cf-phone" class="form-control" type="tel"></div>' +
        '<div class="form-group"><label class="form-label">Email</label><input id="cf-email" class="form-control" type="email"></div>' +
        '<div class="form-group"><label class="form-label">Current Stage</label><select id="cf-stage" class="form-control">' + STAGES.map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select></div>' +
        '<div class="form-group"><label class="form-label">Notes</label><textarea id="cf-notes" class="form-control" placeholder="Interview notes, resume link, etc."></textarea></div>' +
        '<button id="cf-save" class="btn btn-primary btn-block">Save Candidate</button>' +
        '<button id="cf-cancel" class="btn btn-ghost btn-block mt-8">Cancel</button>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.querySelector('#cf-cancel').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#cf-save').addEventListener('click', function () {
      var name = overlay.querySelector('#cf-name').value.trim();
      if (!name) { Toast.error('Name required.'); return; }
      var now = Sync.nowISO();
      var rec = {
        candidateId:  Sync.uuid(),
        openingId:    openingId,
        name:         name,
        phone:        overlay.querySelector('#cf-phone').value.trim(),
        email:        overlay.querySelector('#cf-email').value.trim(),
        appliedDate:  Fmt.todayIST(),
        currentStage: overlay.querySelector('#cf-stage').value,
        notes:        overlay.querySelector('#cf-notes').value.trim(),
        resumeUrl:    '',
        updatedAt:    now,
        isDeleted:    false
      };
      Sync.save('candidates', rec, 'candidates').then(function () {
        Toast.success('Candidate added.'); overlay.remove(); _loadTab('recruitment');
      });
    });
  }

  function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  return { render: render };
})();
