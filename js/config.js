/**
 * config.js — Central configuration for Ornaza MIS PWA
 *
 * IMPORTANT: After deploying the Apps Script Web App, paste the Web App URL below.
 * Example: 'https://script.google.com/macros/s/AKfycby.../exec'
 */

var Config = {
  // ── PASTE YOUR APPS SCRIPT WEB APP URL HERE ──────────────────────────────
  API_URL: 'YOUR_APPS_SCRIPT_WEB_APP_URL',

  // App metadata
  APP_NAME:    'Ornaza Jewels MIS',
  APP_VERSION: '1.0.0',

  // DB
  IDB_NAME:    'ornaza-mis',
  IDB_VERSION: 1,

  // Sync
  SYNC_INTERVAL_MS: 30000,   // auto-sync every 30 seconds when online
  OUTBOX_RETRY_MS:  5000,    // retry outbox flush 5s after coming online

  // Roles
  ROLES: {
    OWNER:    'Owner',
    HR:       'HR',
    MANAGER:  'Manager',
    EMPLOYEE: 'Employee'
  },

  // Fields hidden from non-Owner roles (matched server-side too)
  SALARY_FIELDS: ['monthlySalary', 'bankName', 'accountNumber', 'ifscCode']
};
