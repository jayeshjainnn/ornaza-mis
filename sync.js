/**
 * sync.js — Offline-first sync engine for Ornaza MIS
 *
 * Flow:
 *   1. Any write first goes to IndexedDB (instant, works offline).
 *   2. Mutation is also queued in the outbox store.
 *   3. When online: flush outbox → pull deltas from server → update IDB.
 *   4. Service Worker handles background sync via 'outbox-sync' tag.
 *   5. Client polls every SYNC_INTERVAL_MS when tab is visible and online.
 */

var Sync = (function () {
  var _syncing    = false;
  var _online     = navigator.onLine;
  var _timer      = null;
  var _onStatusCb = null; // callback for UI sync indicator

  // ── Public: set status callback ────────────────────────────────────────────
  function onStatusChange(cb) { _onStatusCb = cb; }

  function _notifyStatus(status) { // 'online' | 'offline' | 'syncing' | 'idle'
    if (_onStatusCb) _onStatusCb(status);
  }

  // ── Online / offline detection ─────────────────────────────────────────────
  window.addEventListener('online', function () {
    _online = true;
    document.getElementById('offline-banner').classList.remove('visible');
    document.body.classList.remove('offline');
    _notifyStatus('online');
    // Slight delay to let network stabilise
    setTimeout(flush, Config.OUTBOX_RETRY_MS);
  });

  window.addEventListener('offline', function () {
    _online = false;
    document.getElementById('offline-banner').classList.add('visible');
    document.body.classList.add('offline');
    _notifyStatus('offline');
  });

  // ── UUID v4 (client-generated primary keys) ────────────────────────────────
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function nowISO() { return new Date().toISOString(); }

  // ── Flush outbox → server ──────────────────────────────────────────────────
  function flush() {
    if (!_online || _syncing || !Auth.isLoggedIn()) return Promise.resolve();
    _syncing = true;
    _notifyStatus('syncing');

    return DB.getAllOutbox().then(function (outboxItems) {
      // Read sync cursors
      return DB.getMeta('syncSince').then(function (sinceRaw) {
        var since = sinceRaw ? JSON.parse(sinceRaw) : {};
        var mutations = outboxItems.map(function (i) { return i.mutation; });

        return Api.sync(Auth.getToken(), mutations, since).then(function (res) {
          if (!res.ok) {
            // Auth expired — force logout
            if (res.error && res.error.indexOf('401') !== -1) {
              Auth.logout();
              window.location.hash = '#login';
            }
            throw new Error(res.error || 'Sync failed');
          }

          // Clear successfully sent outbox items
          if (outboxItems.length > 0) {
            var ids = outboxItems.map(function (i) { return i.id; });
            return DB.clearOutboxById(ids).then(function () {
              return applyDeltas(res.deltas, res.serverTime, since);
            });
          }
          return applyDeltas(res.deltas, res.serverTime, since);

        });
      });
    }).then(function () {
      _syncing = false;
      _notifyStatus('idle');
    }).catch(function (err) {
      _syncing = false;
      _notifyStatus(_online ? 'idle' : 'offline');
      console.warn('[Sync] flush error:', err);
    });
  }

  // ── Apply server deltas to IndexedDB ───────────────────────────────────────
  function applyDeltas(deltas, serverTime, since) {
    if (!deltas) return Promise.resolve();

    var tasks = [];

    if (deltas.employees    && deltas.employees.length)    tasks.push(DB.saveEmployees(deltas.employees));
    if (deltas.attendance   && deltas.attendance.length)   tasks.push(DB.saveAttendanceRecords(deltas.attendance));
    if (deltas.leaves       && deltas.leaves.length)       tasks.push(DB.saveLeaves(deltas.leaves));
    if (deltas.payroll      && deltas.payroll.length)      tasks.push(DB.savePayrollRecords(deltas.payroll));
    if (deltas.advances     && deltas.advances.length)     tasks.push(DB.saveAdvances(deltas.advances));
    if (deltas.appraisals   && deltas.appraisals.length)   tasks.push(DB.saveAppraisals(deltas.appraisals));
    if (deltas.jobOpenings  && deltas.jobOpenings.length)  tasks.push(DB.saveJobOpenings(deltas.jobOpenings));
    if (deltas.candidates   && deltas.candidates.length)   tasks.push(DB.saveCandidates(deltas.candidates));
    if (deltas.settings     && deltas.settings.length)     tasks.push(DB.saveSettings(deltas.settings));

    return Promise.all(tasks).then(function () {
      // Advance the since cursor to server's current time
      if (serverTime) {
        var newSince = {};
        var entities = ['employees','attendance','leaves','payroll','advances','appraisals','jobOpenings','candidates','settings'];
        entities.forEach(function (e) { newSince[e] = serverTime; });
        return DB.setMeta('syncSince', JSON.stringify(newSince));
      }
    });
  }

  // ── Write helpers: IDB first, then outbox ──────────────────────────────────
  /**
   * Queues a mutation. Saves optimistically to IDB, adds to outbox,
   * then triggers a flush if online.
   *
   * @param {string} entity        — 'employees', 'attendance', etc.
   * @param {string} operation     — 'upsert', 'checkin', 'checkout', etc.
   * @param {object} record        — the full record
   * @param {string} [storeName]   — IDB store to write to (defaults to entity)
   * @returns {Promise<object>}    — the record
   */
  function mutate(entity, operation, record, storeName) {
    var store = storeName || entity;
    var now   = nowISO();

    // Ensure record has an updatedAt
    if (!record.updatedAt) record.updatedAt = now;
    if (!record.createdAt) record.createdAt = now;

    var mutation = {
      entity:    entity,
      operation: operation,
      record:    record,
      clientTs:  now
    };

    return DB.put(store, record).then(function () {
      return DB.addToOutbox(mutation);
    }).then(function () {
      if (_online) {
        // Register background sync (SW) + immediate flush
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          navigator.serviceWorker.ready.then(function (sw) {
            sw.sync.register('outbox-sync').catch(function () {});
          });
        }
        flush(); // also flush immediately
      }
      return record;
    });
  }

  /**
   * Convenience: upsert any entity record.
   */
  function save(entity, record, storeName) {
    return mutate(entity, 'upsert', record, storeName);
  }

  /**
   * Check-in: includes selfie base64.
   */
  function checkIn(record) {
    return mutate('attendance', 'checkin', record, 'attendance');
  }

  /**
   * Check-out: GPS only.
   */
  function checkOut(record) {
    return mutate('attendance', 'checkout', record, 'attendance');
  }

  /**
   * Approve / decline attendance (HR action).
   */
  function decideAttendance(attendanceId, dateStr, decision, declineReason) {
    var mutation = {
      entity:       'attendance',
      operation:    decision === 'Approved' ? 'approve_attendance' : 'decline_attendance',
      attendanceId: attendanceId,
      dateStr:      dateStr,
      decision:     decision,
      declineReason: declineReason || '',
      clientTs:     nowISO()
    };
    return DB.addToOutbox(mutation).then(function () {
      if (_online) flush();
    });
  }

  /**
   * Approve / decline leave.
   */
  function decideLeave(leaveId, decision) {
    var mutation = {
      entity:    'leaves',
      operation: decision === 'Approved' ? 'approve_leave' : 'decline_leave',
      leaveId:   leaveId,
      decision:  decision,
      clientTs:  nowISO()
    };
    return DB.addToOutbox(mutation).then(function () {
      if (_online) flush();
    });
  }

  /**
   * Run payroll for a given month (Owner only).
   */
  function runPayroll(month) {
    var mutation = {
      entity:    'payroll',
      operation: 'run_payroll',
      month:     month,
      clientTs:  nowISO()
    };
    return DB.addToOutbox(mutation).then(function () {
      if (_online) return flush();
    });
  }

  /**
   * Mark payroll as paid (Owner only).
   */
  function markPaid(payrollRecord) {
    var mutation = {
      entity:    'payroll',
      operation: 'mark_paid',
      record:    payrollRecord,
      clientTs:  nowISO()
    };
    return DB.addToOutbox(mutation).then(function () {
      if (_online) return flush();
    });
  }

  // ── Auto-poll ──────────────────────────────────────────────────────────────
  function startPolling() {
    if (_timer) return;
    _timer = setInterval(function () {
      if (document.visibilityState === 'visible') flush();
    }, Config.SYNC_INTERVAL_MS);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && _online) flush();
    });
  }

  function stopPolling() {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    if (!_online) {
      document.getElementById('offline-banner').classList.add('visible');
      document.body.classList.add('offline');
      _notifyStatus('offline');
    }
    startPolling();
    // Initial sync after 1s (let page render first)
    setTimeout(flush, 1000);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function isOnline() { return _online; }
  function isSyncing() { return _syncing; }

  return {
    init:    init,
    flush:   flush,
    isOnline: isOnline,
    isSyncing: isSyncing,
    onStatusChange: onStatusChange,

    // Write operations
    save:             save,
    mutate:           mutate,
    checkIn:          checkIn,
    checkOut:         checkOut,
    decideAttendance: decideAttendance,
    decideLeave:      decideLeave,
    runPayroll:       runPayroll,
    markPaid:         markPaid,

    // Utilities
    uuid:   uuid,
    nowISO: nowISO
  };
})();
