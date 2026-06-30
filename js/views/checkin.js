/**
 * views/checkin.js — Attendance check-in (selfie + GPS) and check-out (GPS only)
 *
 * Morning flow: selfie → GPS → Submit → server evaluates geofence
 * Evening flow: GPS only → Submit → server calculates deduction if early
 */
Views.checkin = (function () {
  var _stream       = null;
  var _selfieB64    = null;
  var _gpsData      = null;
  var _gpsWatchId   = null;
  var _todayRec     = null;
  var _mode         = 'checkin'; // 'checkin' | 'checkout'

  function render(container) {
    var today = Fmt.todayIST();
    var empId = Auth.getEmployeeId();

    container.innerHTML = '<div class="loading-full"><div class="spinner"></div></div>';

    DB.getTodayAttendance(empId, today).then(function (recs) {
      _todayRec = recs.filter(function (r) { return !r.isDeleted; })[0] || null;

      if (_todayRec && _todayRec.checkOut) {
        // Already fully checked out
        _renderDone(container, _todayRec);
      } else if (_todayRec && _todayRec.checkIn) {
        // Checked in, not yet checked out
        _mode = 'checkout';
        _renderCheckout(container, _todayRec);
      } else {
        // Not yet checked in
        _mode = 'checkin';
        _renderCheckin(container);
      }
    });
  }

  // ── Check-in screen ────────────────────────────────────────────────────────
  function _renderCheckin(container) {
    _selfieB64 = null;
    _gpsData   = null;

    container.innerHTML =
      '<div class="page-header"><h2>Check In</h2><div class="subtitle">Office: 10:00 AM — 7:00 PM &nbsp;·&nbsp; 15 min grace</div></div>' +

      // Steps indicator
      '<div class="checkin-status-bar">' +
        '<div class="checkin-step active" id="step-selfie">1 · Selfie</div>' +
        '<div class="checkin-step" id="step-gps">2 · GPS</div>' +
        '<div class="checkin-step" id="step-submit">3 · Submit</div>' +
      '</div>' +

      // Camera
      '<div class="card">' +
        '<div class="card-title">Take Selfie</div>' +
        '<div class="camera-preview" id="cam-preview">' +
          '<div class="camera-overlay" id="cam-overlay">' +
            '<div class="camera-ring"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg></div>' +
            '<span>Tap to start camera</span>' +
          '</div>' +
          '<video id="cam-video" autoplay playsinline style="display:none;width:100%;height:100%;object-fit:cover"></video>' +
          '<canvas id="cam-canvas" style="display:none"></canvas>' +
          '<img id="cam-captured" style="display:none;width:100%;height:100%;object-fit:cover">' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button id="btn-start-cam" class="btn btn-secondary btn-block">Open Camera</button>' +
          '<button id="btn-capture" class="btn btn-primary btn-block" disabled>Capture</button>' +
          '<button id="btn-retake" class="btn btn-ghost" style="display:none">Retake</button>' +
        '</div>' +
      '</div>' +

      // GPS
      '<div class="card mt-12">' +
        '<div class="card-title">Confirm Location</div>' +
        '<div class="gps-info" id="gps-info">' +
          '<div class="gps-dot" id="gps-dot"></div>' +
          '<span id="gps-text">Tap below to get GPS</span>' +
        '</div>' +
        '<button id="btn-gps" class="btn btn-secondary btn-block">Get Location</button>' +
      '</div>' +

      '<button id="btn-checkin-submit" class="btn btn-primary btn-block btn-lg mt-16" disabled>Check In</button>' +
      '<div id="checkin-msg" class="form-error mt-8 hidden"></div>';

    _bindCheckinEvents();
  }

  function _bindCheckinEvents() {
    var startBtn   = document.getElementById('btn-start-cam');
    var captureBtn = document.getElementById('btn-capture');
    var retakeBtn  = document.getElementById('btn-retake');
    var gpsBtn     = document.getElementById('btn-gps');
    var submitBtn  = document.getElementById('btn-checkin-submit');

    // Camera overlay click
    document.getElementById('cam-overlay').addEventListener('click', _startCamera);
    startBtn.addEventListener('click', _startCamera);
    captureBtn.addEventListener('click', _capturePhoto);
    retakeBtn.addEventListener('click', _retakePhoto);
    gpsBtn.addEventListener('click', _getGPS);
    submitBtn.addEventListener('click', _submitCheckin);
  }

  function _startCamera() {
    if (_stream) return;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(function (stream) {
        _stream = stream;
        var video = document.getElementById('cam-video');
        var overlay = document.getElementById('cam-overlay');
        video.srcObject = stream;
        video.style.display = '';
        overlay.style.display = 'none';
        document.getElementById('btn-capture').disabled = false;
        document.getElementById('btn-start-cam').style.display = 'none';
      }).catch(function () {
        Toast.error('Camera access denied. Please allow camera permission.');
      });
  }

  function _capturePhoto() {
    var video  = document.getElementById('cam-video');
    var canvas = document.getElementById('cam-canvas');
    var img    = document.getElementById('cam-captured');

    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);
    _selfieB64 = canvas.toDataURL('image/jpeg', 0.7);

    // Stop stream
    _stopCamera();

    video.style.display = 'none';
    img.src             = _selfieB64;
    img.style.display   = '';

    document.getElementById('btn-capture').style.display = 'none';
    document.getElementById('btn-retake').style.display  = '';
    document.getElementById('step-selfie').className = 'checkin-step done';
    document.getElementById('step-gps').className    = 'checkin-step active';

    _checkSubmitReady();
  }

  function _retakePhoto() {
    var img  = document.getElementById('cam-captured');
    img.src  = ''; img.style.display = 'none';
    _selfieB64 = null;
    document.getElementById('cam-overlay').style.display = '';
    document.getElementById('btn-retake').style.display  = 'none';
    document.getElementById('btn-start-cam').style.display = '';
    document.getElementById('btn-capture').style.display = '';
    document.getElementById('btn-capture').disabled      = true;
    document.getElementById('step-selfie').className = 'checkin-step active';
    document.getElementById('btn-checkin-submit').disabled = true;
    _stream = null;
  }

  function _stopCamera() {
    if (_stream) {
      _stream.getTracks().forEach(function (t) { t.stop(); });
      _stream = null;
    }
  }

  function _getGPS() {
    var dot  = document.getElementById('gps-dot');
    var text = document.getElementById('gps-text');
    var btn  = document.getElementById('btn-gps');

    dot.className  = 'gps-dot acquiring';
    text.textContent = 'Acquiring GPS…';
    btn.disabled     = true;

    navigator.geolocation.getCurrentPosition(function (pos) {
      _gpsData = {
        latitude:  pos.coords.latitude,
        longitude: pos.coords.longitude,
        altitude:  pos.coords.altitude || null,
        accuracy:  pos.coords.accuracy
      };
      dot.className    = 'gps-dot got';
      text.textContent = 'Lat ' + _gpsData.latitude.toFixed(5) + ', Lng ' + _gpsData.longitude.toFixed(5) +
                          ' (±' + Math.round(_gpsData.accuracy) + 'm)';
      btn.disabled = false;
      document.getElementById('step-gps').className = 'checkin-step done';
      _checkSubmitReady();
    }, function (err) {
      dot.className    = 'gps-dot error';
      text.textContent = 'GPS failed: ' + (err.message || 'Unknown error');
      btn.disabled     = false;
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  function _checkSubmitReady() {
    var ready = !!_selfieB64 && !!_gpsData;
    document.getElementById('btn-checkin-submit').disabled = !ready;
    if (ready) document.getElementById('step-submit').className = 'checkin-step active';
  }

  function _submitCheckin() {
    var btn    = document.getElementById('btn-checkin-submit');
    var msgEl  = document.getElementById('checkin-msg');
    btn.disabled    = true;
    btn.textContent = 'Submitting…';
    msgEl.classList.add('hidden');

    var today  = Fmt.todayIST();
    var empId  = Auth.getEmployeeId();
    var recId  = Sync.uuid();
    var now    = Sync.nowISO();

    var record = {
      attendanceId:       recId,
      employeeId:         empId,
      date:               today,
      status:             'Present',
      checkIn:            now,
      latitude:           _gpsData.latitude,
      longitude:          _gpsData.longitude,
      altitude:           _gpsData.altitude || '',
      accuracy:           _gpsData.accuracy,
      selfie:             _selfieB64,  // sent to server → saved to Drive
      verificationStatus: 'Pending',   // server will change to Auto if in geofence
      isDeleted:          false,
      createdAt:          now,
      updatedAt:          now
    };

    Sync.checkIn(record).then(function () {
      _todayRec = record;
      Toast.success('Checked in! Server will verify location.');
      render(document.getElementById('main-content'));
    }).catch(function (err) {
      btn.disabled    = false;
      btn.textContent = 'Check In';
      msgEl.textContent = 'Error: ' + err;
      msgEl.classList.remove('hidden');
    });
  }

  // ── Checkout screen ────────────────────────────────────────────────────────
  function _renderCheckout(container, rec) {
    _gpsData = null;

    container.innerHTML =
      '<div class="page-header"><h2>Check Out</h2><div class="subtitle">Office closes 7:00 PM (grace till 6:45 PM)</div></div>' +

      '<div class="card">' +
        '<div class="card-title">Today\'s Check-in</div>' +
        '<div class="payroll-row"><span class="label">Time</span><span class="value fw-600">' + Fmt.time(rec.checkIn) + '</span></div>' +
        '<div class="payroll-row"><span class="label">Status</span><span class="value"><span class="badge ' + (rec.checkInStatus === 'Late' ? 'badge-warning' : 'badge-success') + '">' + (rec.checkInStatus || 'On Time') + '</span></span></div>' +
        '<div class="payroll-row"><span class="label">Verification</span><span class="value"><span class="badge ' + (rec.verificationStatus === 'Auto' ? 'badge-success' : 'badge-warning') + '">' + (rec.verificationStatus || 'Pending') + '</span></span></div>' +
      '</div>' +

      '<div class="card mt-12">' +
        '<div class="card-title">Confirm Location for Check-out</div>' +
        '<div class="gps-info" id="gps-info">' +
          '<div class="gps-dot" id="gps-dot"></div>' +
          '<span id="gps-text">Tap below to get GPS</span>' +
        '</div>' +
        '<button id="btn-gps" class="btn btn-secondary btn-block">Get Location</button>' +
      '</div>' +

      '<p class="text-muted fs-12 mt-8" style="text-align:center">Leaving before 6:45 PM triggers a 25% deduction (capped if already late check-in)</p>' +
      '<button id="btn-checkout-submit" class="btn btn-primary btn-block btn-lg mt-12" disabled>Check Out</button>';

    document.getElementById('btn-gps').addEventListener('click', _getGPS);
    document.getElementById('btn-checkout-submit').addEventListener('click', function () {
      _submitCheckout(rec);
    });
  }

  function _submitCheckout(checkinRec) {
    var btn = document.getElementById('btn-checkout-submit');
    btn.disabled    = true;
    btn.textContent = 'Submitting…';

    var now    = Sync.nowISO();
    var record = Object.assign({}, checkinRec, {
      checkOut:             now,
      checkOutLatitude:     _gpsData.latitude,
      checkOutLongitude:    _gpsData.longitude,
      checkOutAltitude:     _gpsData.altitude || '',
      checkOutAccuracy:     _gpsData.accuracy,
      updatedAt:            now
    });

    Sync.checkOut(record).then(function () {
      _todayRec = record;
      Toast.success('Checked out! Have a great evening.');
      render(document.getElementById('main-content'));
    }).catch(function () {
      btn.disabled    = false;
      btn.textContent = 'Check Out';
      Toast.error('Failed to submit. Will retry when online.');
    });
  }

  // ── Already done screen ────────────────────────────────────────────────────
  function _renderDone(container, rec) {
    container.innerHTML =
      '<div class="page-header"><h2>Attendance</h2><div class="subtitle">' + _formatDate(rec.date) + '</div></div>' +
      '<div class="card">' +
        '<div style="text-align:center;padding:20px 0">' +
          '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="1.5" style="margin:0 auto 12px"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>' +
          '<h3 style="color:var(--color-success)">Done for today!</h3>' +
          '<p class="mt-8">Checked in at <b>' + Fmt.time(rec.checkIn) + '</b>, checked out at <b>' + Fmt.time(rec.checkOut) + '</b></p>' +
        '</div>' +
        '<div class="divider"></div>' +
        '<div class="payroll-row"><span class="label">Check-in status</span><span class="value"><span class="badge ' + (rec.checkInStatus === 'Late' ? 'badge-warning' : 'badge-success') + '">' + (rec.checkInStatus || 'On Time') + '</span></span></div>' +
        '<div class="payroll-row"><span class="label">Check-out status</span><span class="value"><span class="badge ' + (rec.checkOutStatus === 'Early' ? 'badge-warning' : 'badge-success') + '">' + (rec.checkOutStatus || 'On Time') + '</span></span></div>' +
        (rec.lateDeductionAmount > 0
          ? '<div class="deduction-alert mt-12"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Salary deduction: ' + Fmt.inr(rec.lateDeductionAmount) + ' (25% of today\'s salary)</div>'
          : '<p class="text-success text-center mt-12 fs-13">No deduction today.</p>'
        ) +
        '<div class="payroll-row"><span class="label">Verification</span><span class="value"><span class="badge ' + (rec.verificationStatus === 'Auto' ? 'badge-success' : 'badge-warning') + '">' + (rec.verificationStatus || 'Pending') + '</span></span></div>' +
      '</div>';
  }

  function _formatDate(ymd) {
    var d = new Date(ymd + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function onLeave() {
    _stopCamera();
    if (_gpsWatchId) navigator.geolocation.clearWatch(_gpsWatchId);
    _stream = null; _selfieB64 = null; _gpsData = null;
  }

  return { render: render, onLeave: onLeave };
})();
