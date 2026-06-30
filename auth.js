/**
 * auth.js — Session management for Ornaza MIS
 *
 * Token stored in localStorage (survives page reload, cleared on logout).
 * Session object cached in memory for in-page access.
 */

var Auth = (function () {
  var META_KEY_TOKEN = 'token';
  var META_KEY_USER  = 'currentUser';

  var _session = null; // { token, userId, role, employeeId, name }

  // ── Internal helpers ───────────────────────────────────────────────────────
  function _saveSession(token, user) {
    _session = { token: token, userId: user.userId, role: user.role,
                 employeeId: user.employeeId, name: user.name };
    localStorage.setItem('ornaza_token', token);
    localStorage.setItem('ornaza_user',  JSON.stringify(_session));
    // Mirror into IndexedDB meta so SW can read token for background sync
    DB.setMeta(META_KEY_TOKEN, token).catch(function () {});
  }

  function _clearSession() {
    _session = null;
    localStorage.removeItem('ornaza_token');
    localStorage.removeItem('ornaza_user');
    DB.deleteMeta(META_KEY_TOKEN).catch(function () {});
  }

  // ── Restore from localStorage on page load ─────────────────────────────────
  function restore() {
    var token = localStorage.getItem('ornaza_token');
    var raw   = localStorage.getItem('ornaza_user');
    if (token && raw) {
      try {
        _session = JSON.parse(raw);
        _session.token = token;
        return true;
      } catch (e) { /* ignore */ }
    }
    _session = null;
    return false;
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  function login(username, password) {
    return Api.login(username, password).then(function (res) {
      if (res.ok) {
        _saveSession(res.token, res.user);
      }
      return res;
    });
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  function logout() {
    var token = getToken();
    _clearSession();
    if (token) {
      // Fire-and-forget; don't block UI on server response
      Api.logout(token).catch(function () {});
    }
  }

  // ── Getters ────────────────────────────────────────────────────────────────
  function isLoggedIn()   { return !!_session; }
  function getSession()   { return _session; }
  function getToken()     { return _session ? _session.token : null; }
  function getRole()      { return _session ? _session.role : null; }
  function getEmployeeId(){ return _session ? _session.employeeId : null; }
  function getName()      { return _session ? _session.name : ''; }
  function getUserId()    { return _session ? _session.userId : null; }

  // ── Role checks ────────────────────────────────────────────────────────────
  function isOwner()    { return getRole() === Config.ROLES.OWNER; }
  function isHR()       { return getRole() === Config.ROLES.HR; }
  function isManager()  { return getRole() === Config.ROLES.MANAGER; }
  function isEmployee() { return getRole() === Config.ROLES.EMPLOYEE; }

  function canSeePayroll()    { return isOwner(); }
  function canManageStaff()   { return isOwner() || isHR(); }
  function canApproveLeaves() { return isOwner() || isHR(); }
  function canApproveAttend() { return isOwner() || isHR(); }
  function canRunPayroll()    { return isOwner(); }
  function canSeeAppraisals() { return isOwner() || isHR() || isManager(); }

  // ── Initials helper (for avatar) ───────────────────────────────────────────
  function getInitials() {
    var name = getName();
    if (!name) return '?';
    var parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  return {
    restore: restore,
    login:   login,
    logout:  logout,

    isLoggedIn:    isLoggedIn,
    getSession:    getSession,
    getToken:      getToken,
    getRole:       getRole,
    getEmployeeId: getEmployeeId,
    getName:       getName,
    getUserId:     getUserId,
    getInitials:   getInitials,

    isOwner:    isOwner,
    isHR:       isHR,
    isManager:  isManager,
    isEmployee: isEmployee,

    canSeePayroll:    canSeePayroll,
    canManageStaff:   canManageStaff,
    canApproveLeaves: canApproveLeaves,
    canApproveAttend: canApproveAttend,
    canRunPayroll:    canRunPayroll,
    canSeeAppraisals: canSeeAppraisals
  };
})();
