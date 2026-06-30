/**
 * api.js — CORS-safe HTTP client for Ornaza MIS
 *
 * Apps Script does not handle OPTIONS preflight, so we send
 * Content-Type: text/plain;charset=utf-8 which is a "simple request"
 * and never triggers a preflight. The server responds with
 * Content-Type: text/plain but with a JSON body — we parse it.
 */

var Api = (function () {

  /**
   * Post a JSON payload to the Apps Script Web App.
   * @param {object} payload
   * @returns {Promise<object>} parsed response
   */
  function post(payload) {
    var url = Config.API_URL;
    if (!url || url === 'YOUR_APPS_SCRIPT_WEB_APP_URL') {
      return Promise.reject(new Error('API_URL not configured in js/config.js'));
    }
    return fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body:    JSON.stringify(payload)
    }).then(function (res) {
      return res.text();
    }).then(function (text) {
      try { return JSON.parse(text); }
      catch (e) { return { ok: false, error: 'Invalid JSON from server: ' + text.slice(0, 200) }; }
    });
  }

  /**
   * Health check — GET the Web App URL.
   */
  function ping() {
    return fetch(Config.API_URL).then(function (r) { return r.json(); });
  }

  /**
   * Login
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{ok, token, user} | {ok:false, error}>}
   */
  function login(username, password) {
    return post({ action: 'login', username: username, password: password });
  }

  /**
   * Logout
   * @param {string} token
   */
  function logout(token) {
    return post({ action: 'logout', token: token });
  }

  /**
   * Sync: sends pending mutations + since cursors, receives deltas.
   * @param {string}   token
   * @param {object[]} changes   — outbox mutations
   * @param {object}   since     — { entity: isoString } cursors
   * @returns {Promise<{ok, deltas, conflicts, serverTime}>}
   */
  function sync(token, changes, since) {
    return post({
      action:  'sync',
      token:   token,
      changes: changes || [],
      since:   since   || {}
    });
  }

  return { post: post, ping: ping, login: login, logout: logout, sync: sync };
})();
