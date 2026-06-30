/**
 * db.js — IndexedDB wrapper for Ornaza MIS
 *
 * Stores:
 *   employees   — keyPath: employeeId
 *   attendance  — keyPath: attendanceId,  index: [employeeId, date]
 *   leaves      — keyPath: leaveId,       index: [employeeId, status]
 *   payroll     — keyPath: payrollId,     index: [employeeId, month]
 *   advances    — keyPath: advanceId,     index: employeeId
 *   appraisals  — keyPath: appraisalId,   index: employeeId
 *   jobOpenings — keyPath: openingId,     index: status
 *   candidates  — keyPath: candidateId,   index: openingId
 *   settings    — keyPath: key
 *   outbox      — keyPath: id (auto), holds pending mutations for sync
 *   meta        — keyPath: key, holds token / apiUrl / sync cursors
 */

var DB = (function () {
  var _db = null;

  // ── Open / upgrade ─────────────────────────────────────────────────────────
  function open() {
    return new Promise(function (resolve, reject) {
      if (_db) { resolve(_db); return; }

      var req = indexedDB.open(Config.IDB_NAME, Config.IDB_VERSION);

      req.onupgradeneeded = function (event) {
        var db = event.target.result;

        function makeStore(name, keyPath, indexes) {
          var store;
          if (!db.objectStoreNames.contains(name)) {
            store = db.createObjectStore(name, { keyPath: keyPath });
          } else {
            store = event.target.transaction.objectStore(name);
          }
          (indexes || []).forEach(function (idx) {
            if (!store.indexNames.contains(idx.name)) {
              store.createIndex(idx.name, idx.keyPath, { unique: false });
            }
          });
          return store;
        }

        makeStore('employees',   'employeeId',  [
          { name: 'by_status',   keyPath: 'status' }
        ]);
        makeStore('attendance',  'attendanceId', [
          { name: 'by_employee', keyPath: 'employeeId' },
          { name: 'by_date',     keyPath: 'date' },
          { name: 'by_status',   keyPath: 'verificationStatus' }
        ]);
        makeStore('leaves',      'leaveId',      [
          { name: 'by_employee', keyPath: 'employeeId' },
          { name: 'by_status',   keyPath: 'status' }
        ]);
        makeStore('payroll',     'payrollId',    [
          { name: 'by_employee', keyPath: 'employeeId' },
          { name: 'by_month',    keyPath: 'month' },
          { name: 'by_status',   keyPath: 'status' }
        ]);
        makeStore('advances',    'advanceId',    [
          { name: 'by_employee', keyPath: 'employeeId' }
        ]);
        makeStore('appraisals',  'appraisalId',  [
          { name: 'by_employee', keyPath: 'employeeId' }
        ]);
        makeStore('jobOpenings', 'openingId',    [
          { name: 'by_status',   keyPath: 'status' }
        ]);
        makeStore('candidates',  'candidateId',  [
          { name: 'by_opening',  keyPath: 'openingId' }
        ]);
        makeStore('settings',    'key',          []);
        makeStore('outbox',      'id',           []);
        makeStore('meta',        'key',          []);

        // Auto-increment outbox id
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
        }
      };

      req.onsuccess = function (e) {
        _db = e.target.result;

        // Persist apiUrl into meta for SW background sync
        _setMeta('apiUrl', Config.API_URL).catch(function () {});

        resolve(_db);
      };

      req.onerror = function (e) {
        reject(e.target.error);
      };
    });
  }

  // ── Generic helpers ────────────────────────────────────────────────────────
  function tx(storeName, mode) {
    return _db.transaction(storeName, mode).objectStore(storeName);
  }

  function _req(idbRequest) {
    return new Promise(function (resolve, reject) {
      idbRequest.onsuccess = function () { resolve(idbRequest.result); };
      idbRequest.onerror   = function () { reject(idbRequest.error); };
    });
  }

  function getAll(storeName) {
    return _req(tx(storeName, 'readonly').getAll());
  }

  function getById(storeName, id) {
    return _req(tx(storeName, 'readonly').get(id));
  }

  function put(storeName, record) {
    return _req(tx(storeName, 'readwrite').put(record));
  }

  function putMany(storeName, records) {
    return new Promise(function (resolve, reject) {
      var store = _db.transaction(storeName, 'readwrite').objectStore(storeName);
      var count = records.length;
      if (count === 0) { resolve(); return; }
      var done = 0;
      records.forEach(function (r) {
        var req = store.put(r);
        req.onsuccess = function () { if (++done === count) resolve(); };
        req.onerror   = function () { reject(req.error); };
      });
    });
  }

  function deleteRecord(storeName, id) {
    return _req(tx(storeName, 'readwrite').delete(id));
  }

  function clearStore(storeName) {
    return _req(tx(storeName, 'readwrite').clear());
  }

  function getByIndex(storeName, indexName, value) {
    return _req(tx(storeName, 'readonly').index(indexName).getAll(value));
  }

  // ── Meta store helpers ─────────────────────────────────────────────────────
  function getMeta(key) {
    return _req(tx('meta', 'readonly').get(key)).then(function (r) {
      return r ? r.value : null;
    });
  }

  function _setMeta(key, value) {
    return _req(tx('meta', 'readwrite').put({ key: key, value: value }));
  }

  function setMeta(key, value) { return _setMeta(key, value); }

  function deleteMeta(key) {
    return _req(tx('meta', 'readwrite').delete(key));
  }

  // ── Outbox ─────────────────────────────────────────────────────────────────
  /**
   * Adds a mutation to the outbox for later sync.
   * @param {object} mutation — the change payload (entity, operation, record, etc.)
   */
  function addToOutbox(mutation) {
    return _req(tx('outbox', 'readwrite').add({
      mutation:  mutation,
      createdAt: new Date().toISOString()
    }));
  }

  function getAllOutbox() {
    return _req(tx('outbox', 'readonly').getAll());
  }

  function clearOutboxById(ids) {
    return new Promise(function (resolve, reject) {
      var store = _db.transaction('outbox', 'readwrite').objectStore('outbox');
      var count = ids.length;
      if (count === 0) { resolve(); return; }
      var done = 0;
      ids.forEach(function (id) {
        var req = store.delete(id);
        req.onsuccess = function () { if (++done === count) resolve(); };
        req.onerror   = function () { reject(req.error); };
      });
    });
  }

  // ── Domain helpers ─────────────────────────────────────────────────────────
  function getEmployees() { return getAll('employees'); }
  function getEmployee(id) { return getById('employees', id); }
  function saveEmployee(emp) { return put('employees', emp); }
  function saveEmployees(list) { return putMany('employees', list); }

  function getAttendanceByEmployee(empId) { return getByIndex('attendance', 'by_employee', empId); }
  function getTodayAttendance(empId, dateStr) {
    // filter client-side (IndexedDB doesn't support compound queries easily)
    return getByIndex('attendance', 'by_employee', empId).then(function (rows) {
      return rows.filter(function (r) { return r.date === dateStr && !r.isDeleted; });
    });
  }
  function getPendingAttendance() { return getByIndex('attendance', 'by_status', 'Pending'); }
  function saveAttendanceRecord(rec) { return put('attendance', rec); }
  function saveAttendanceRecords(list) { return putMany('attendance', list); }

  function getLeaves() { return getAll('leaves'); }
  function getPendingLeaves() { return getByIndex('leaves', 'by_status', 'Pending'); }
  function saveLeave(rec) { return put('leaves', rec); }
  function saveLeaves(list) { return putMany('leaves', list); }

  function getPayroll() { return getAll('payroll'); }
  function getPayrollByMonth(month) { return getByIndex('payroll', 'by_month', month); }
  function savePayrollRecord(rec) { return put('payroll', rec); }
  function savePayrollRecords(list) { return putMany('payroll', list); }

  function getAdvances() { return getAll('advances'); }
  function saveAdvances(list) { return putMany('advances', list); }

  function getAppraisals() { return getAll('appraisals'); }
  function saveAppraisals(list) { return putMany('appraisals', list); }

  function getJobOpenings() { return getAll('jobOpenings'); }
  function saveJobOpenings(list) { return putMany('jobOpenings', list); }

  function getCandidates() { return getAll('candidates'); }
  function saveCandidates(list) { return putMany('candidates', list); }

  function getSetting(key) {
    return getById('settings', key).then(function (r) { return r ? r.value : null; });
  }
  function saveSetting(key, value) { return put('settings', { key: key, value: value }); }
  function saveSettings(list) {
    // list is array of {key, value} objects from server
    return putMany('settings', list.map(function (s) { return { key: s.key, value: s.value }; }));
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    open: open,

    // Meta
    getMeta: getMeta,
    setMeta: setMeta,
    deleteMeta: deleteMeta,

    // Outbox
    addToOutbox: addToOutbox,
    getAllOutbox: getAllOutbox,
    clearOutboxById: clearOutboxById,

    // Employees
    getEmployees: getEmployees,
    getEmployee: getEmployee,
    saveEmployee: saveEmployee,
    saveEmployees: saveEmployees,

    // Attendance
    getAttendanceByEmployee: getAttendanceByEmployee,
    getTodayAttendance: getTodayAttendance,
    getPendingAttendance: getPendingAttendance,
    saveAttendanceRecord: saveAttendanceRecord,
    saveAttendanceRecords: saveAttendanceRecords,

    // Leaves
    getLeaves: getLeaves,
    getPendingLeaves: getPendingLeaves,
    saveLeave: saveLeave,
    saveLeaves: saveLeaves,

    // Payroll
    getPayroll: getPayroll,
    getPayrollByMonth: getPayrollByMonth,
    savePayrollRecord: savePayrollRecord,
    savePayrollRecords: savePayrollRecords,

    // Advances
    getAdvances: getAdvances,
    saveAdvances: saveAdvances,

    // Appraisals
    getAppraisals: getAppraisals,
    saveAppraisals: saveAppraisals,

    // Job openings & Candidates
    getJobOpenings: getJobOpenings,
    saveJobOpenings: saveJobOpenings,
    getCandidates: getCandidates,
    saveCandidates: saveCandidates,

    // Settings
    getSetting: getSetting,
    saveSetting: saveSetting,
    saveSettings: saveSettings,

    // Raw
    put: put,
    putMany: putMany,
    getAll: getAll,
    getById: getById,
    deleteRecord: deleteRecord,
    clearStore: clearStore
  };
})();
