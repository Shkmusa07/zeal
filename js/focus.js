'use strict';

/**
 * focus.js — Feature D: Hourly Focus Reminder
 *
 * Single daily focus reminder with configurable daytime window, hourly nudges,
 * snooze (+1h), and turn off for today controls.
 */

const focusModule = (() => {
  const STORAGE_KEY = 'studyapp_focus_settings';

  let settings = {
    focusText: '',
    startHour: 8,          // 8 AM (0-23)
    durationHours: 12,     // Default 12 hours (max 14)
    enabled: true,
    snoozedUntil: 0,       // timestamp ms
    turnedOffDate: null,   // YYYY-MM-DD
    lastNudgeHour: -1
  };

  let checkTimer = null;

  function toDateStr(dateObj) {
    const d = new Date(dateObj);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        settings = { ...settings, ...JSON.parse(raw) };
      }
    } catch (err) {
      console.warn('[Focus] Failed to load settings:', err);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (err) {
      console.warn('[Focus] Failed to save settings:', err);
    }
  }

  function init() {
    loadSettings();
    bindEvents();
    renderUI();

    // Start background interval check (every 60 seconds)
    if (checkTimer) clearInterval(checkTimer);
    checkTimer = setInterval(checkHourlyFocusNudge, 60000);

    // Initial nudge check
    checkHourlyFocusNudge();
  }

  function bindEvents() {
    const textInput = document.getElementById('focus-text-input');
    const startSelect = document.getElementById('focus-start-select');
    const durationSelect = document.getElementById('focus-duration-select');
    const enabledToggle = document.getElementById('focus-enabled-toggle');
    const snoozeBtn = document.getElementById('focus-snooze-btn');
    const turnOffBtn = document.getElementById('focus-turnoff-btn');
    const testNotifyBtn = document.getElementById('focus-test-notify-btn');

    if (textInput && !textInput.dataset.bound) {
      textInput.dataset.bound = 'true';
      textInput.addEventListener('input', (e) => {
        settings.focusText = e.target.value;
        saveSettings();
        updateStatusText();
      });
    }

    if (startSelect && !startSelect.dataset.bound) {
      startSelect.dataset.bound = 'true';
      startSelect.addEventListener('change', (e) => {
        settings.startHour = parseInt(e.target.value, 10);
        saveSettings();
        updateStatusText();
      });
    }

    if (durationSelect && !durationSelect.dataset.bound) {
      durationSelect.dataset.bound = 'true';
      durationSelect.addEventListener('change', (e) => {
        settings.durationHours = parseInt(e.target.value, 10);
        saveSettings();
        updateStatusText();
      });
    }

    if (enabledToggle && !enabledToggle.dataset.bound) {
      enabledToggle.dataset.bound = 'true';
      enabledToggle.addEventListener('change', (e) => {
        settings.enabled = e.target.checked;
        saveSettings();
        renderUI();
      });
    }

    if (snoozeBtn && !snoozeBtn.dataset.bound) {
      snoozeBtn.dataset.bound = 'true';
      snoozeBtn.addEventListener('click', () => {
        const now = Date.now();
        if (settings.snoozedUntil > now) {
          // Cancel snooze
          settings.snoozedUntil = 0;
          saveSettings();
          renderUI();
          showToast('Focus reminders resumed ▶');
        } else {
          // Snooze 1 hour
          settings.snoozedUntil = now + 60 * 60 * 1000;
          saveSettings();
          renderUI();
          showToast('Snoozed focus reminders for 1 hour 💤');
        }
      });
    }

    if (turnOffBtn && !turnOffBtn.dataset.bound) {
      turnOffBtn.dataset.bound = 'true';
      turnOffBtn.addEventListener('click', () => {
        const todayStr = toDateStr(new Date());
        if (settings.turnedOffDate === todayStr) {
          // Resume for today
          settings.turnedOffDate = null;
          saveSettings();
          renderUI();
          showToast('Focus reminders resumed for today ▶');
        } else {
          // Turn off for rest of today
          settings.turnedOffDate = todayStr;
          saveSettings();
          renderUI();
          showToast('Focus reminders paused for the rest of today ⏸');
        }
      });
    }

    if (testNotifyBtn && !testNotifyBtn.dataset.bound) {
      testNotifyBtn.dataset.bound = 'true';
      testNotifyBtn.addEventListener('click', () => {
        fireFocusNotification(true);
      });
    }
  }

  function renderUI() {
    const textInput = document.getElementById('focus-text-input');
    const startSelect = document.getElementById('focus-start-select');
    const durationSelect = document.getElementById('focus-duration-select');
    const enabledToggle = document.getElementById('focus-enabled-toggle');

    if (textInput) textInput.value = settings.focusText || '';
    if (startSelect) startSelect.value = settings.startHour;
    if (durationSelect) durationSelect.value = settings.durationHours;
    if (enabledToggle) enabledToggle.checked = settings.enabled;

    updateStatusText();
  }

  function formatHour(h) {
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${hour12}:00 ${ampm}`;
  }

  function updateStatusText() {
    const statusBox = document.getElementById('focus-status-box');
    const snoozeBtn = document.getElementById('focus-snooze-btn');
    const turnOffBtn = document.getElementById('focus-turnoff-btn');
    if (!statusBox) return;

    const todayStr = toDateStr(new Date());
    const now = Date.now();
    const currentHour = new Date().getHours();
    const endHour = (settings.startHour + settings.durationHours) % 24;
    const windowText = `${formatHour(settings.startHour)} – ${formatHour(endHour)} (${settings.durationHours}h)`;

    // Reset button labels
    if (snoozeBtn) {
      snoozeBtn.textContent = '💤 Snooze 1 Hour';
      snoozeBtn.disabled = !settings.enabled;
    }
    if (turnOffBtn) {
      turnOffBtn.textContent = '⏸ Turn Off Today';
      turnOffBtn.disabled = !settings.enabled;
    }

    if (!settings.enabled) {
      statusBox.innerHTML = '<span class="status-muted">Hourly focus reminders disabled</span>';
      return;
    }

    if (settings.turnedOffDate === todayStr) {
      statusBox.innerHTML = `<span class="status-warn">Paused for the rest of today ⏸ (${windowText})</span>`;
      if (turnOffBtn) {
        turnOffBtn.textContent = '▶ Resume for Today';
        turnOffBtn.disabled = false;
      }
      if (snoozeBtn) snoozeBtn.disabled = true;
      return;
    }

    if (settings.snoozedUntil > now) {
      const minsLeft = Math.ceil((settings.snoozedUntil - now) / 60000);
      statusBox.innerHTML = `<span class="status-info">Snoozed for next ${minsLeft} min 💤</span>`;
      if (snoozeBtn) {
        snoozeBtn.textContent = 'Cancel Snooze ✕';
        snoozeBtn.disabled = false;
      }
      return;
    }

    // Check if within daytime window
    const inWindow = isHourInWindow(currentHour, settings.startHour, settings.durationHours);

    if (inWindow) {
      statusBox.innerHTML = `
        <span class="status-active">
          ● Active window: ${windowText} — Hourly nudges active
        </span>
      `;
    } else {
      statusBox.innerHTML = `
        <span class="status-muted">
          Outside daytime window (${windowText}) — Will resume at ${formatHour(settings.startHour)}
        </span>
      `;
    }
  }

  function isHourInWindow(currentHour, startHour, durationHours) {
    const endHour = (startHour + durationHours) % 24;
    if (startHour < endHour) {
      return currentHour >= startHour && currentHour < endHour;
    } else {
      // Crosses midnight
      return currentHour >= startHour || currentHour < endHour;
    }
  }

  function checkHourlyFocusNudge() {
    loadSettings();

    if (!settings.enabled) return;
    if (!settings.focusText.trim()) return;

    const todayStr = toDateStr(new Date());
    if (settings.turnedOffDate === todayStr) return;

    const now = Date.now();
    if (settings.snoozedUntil > now) return;

    const d = new Date();
    const currentHour = d.getHours();

    if (!isHourInWindow(currentHour, settings.startHour, settings.durationHours)) {
      return;
    }

    // Fire nudge if not already nudged for this hour
    if (settings.lastNudgeHour !== currentHour) {
      settings.lastNudgeHour = currentHour;
      saveSettings();
      fireFocusNotification(false);
    }
  }

  function fireFocusNotification(isTest = false) {
    const focusText = settings.focusText.trim() || 'What is your single main focus right now?';
    // Notification spec: "Focus check: [main focus text]"
    const title = isTest ? `Test Focus Check 🔔: ${focusText}` : `Focus check: ${focusText}`;
    const body = `Main focus for today: "${focusText}"`;

    // In-app toast
    showToast(title);

    // System Notification if permitted
    if ('Notification' in window && Notification.permission === 'granted') {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, {
            body: body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: 'focus-hourly-check',
            renotify: true
          });
        });
      } else {
        new Notification(title, {
          body: body,
          icon: '/icons/icon-192.png'
        });
      }
    }
  }

  function showToast(message) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.className = 'toast-banner hidden';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.remove('hidden');

    setTimeout(() => {
      toast.classList.add('hidden');
    }, 4000);
  }

  return {
    init,
    renderUI,
    checkHourlyFocusNudge,
    getSettings: () => settings,
    fireFocusNotification,
    showToast
  };
})();

window.focusModule = focusModule;
