'use strict';

/**
 * app.js — bootstrap, navigation, install prompt
 */

// ── Tab metadata ─────────────────────────────────────────────────────────────
const TAB_META = {
  reviews:  { label: 'Study Reviews' },
  tasks:    { label: 'Tasks' },
  focus:    { label: 'Focus' },
  syllabus: { label: 'Syllabus' }
};

const DEFAULT_TAB = 'tasks';

// Tracks which modules have been initialised so we only call init() once
const initDone = { tasks: false, syllabus: false, reviews: false, focus: false };

// ── Navigation ───────────────────────────────────────────────────────────────
function switchTab(tabId) {
  // Hide all panes
  document.querySelectorAll('.tab-pane').forEach((el) =>
    el.classList.add('hidden')
  );
  // Deactivate all buttons
  document.querySelectorAll('.tab-btn').forEach((el) =>
    el.classList.remove('active')
  );

  const pane = document.getElementById(`tab-${tabId}`);
  const btn  = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);

  if (pane) pane.classList.remove('hidden');
  if (btn)  btn.classList.add('active');

  const title = TAB_META[tabId]?.label ?? tabId;
  document.getElementById('page-title').textContent = title;

  // Lazy-init feature modules on first visit
  if (tabId === 'tasks' && !initDone.tasks) {
    initDone.tasks = true;
    window.tasksModule?.init();
  }
  if (tabId === 'syllabus' && !initDone.syllabus) {
    initDone.syllabus = true;
    window.syllabusModule?.init();
  }
  if (tabId === 'reviews' && !initDone.reviews) {
    initDone.reviews = true;
    window.reviewsModule?.init();
  }
  if (tabId === 'focus' && !initDone.focus) {
    initDone.focus = true;
    window.focusModule?.init();
  }
}

// ── Notification Permissions ───────────────────────────────────────────────
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      alert('On iPhone, please add this app to your Home Screen first (Share → Add to Home Screen), then launch it from your Home Screen to allow notifications.');
    } else {
      alert('Notifications are not supported in this browser.');
    }
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      window.focusModule?.showToast('Notifications enabled! 🔔');
      return true;
    } else if (permission === 'denied') {
      alert('Notifications were blocked. You can enable them anytime in your device or browser settings.');
      return false;
    }
  } catch (err) {
    console.warn('[Notifications] Error requesting permission:', err);
  }
  return false;
}

// ── Foreground Check (iOS Fallback) ──────────────────────────────────────────
let lastMilestoneToastTime = 0;

async function checkDueNotificationsOnOpen() {
  // Always init reviews store in background if not done yet
  if (!initDone.reviews && window.reviewsModule) {
    await window.reviewsModule.init();
    initDone.reviews = true;
  }
  if (!initDone.focus && window.focusModule) {
    window.focusModule.init();
    initDone.focus = true;
  }

  const now = Date.now();

  // 1. Check for due / overdue Spaced-Repetition study reviews
  if (window.reviewsModule) {
    const dueItems = window.reviewsModule.getDueReminders();
    if (dueItems.length > 0) {
      const first = dueItems[0];
      const count = dueItems.length;

      // Exact spec format: "Review: [Subject] — [Chapter name] (Day X)"
      const title = count === 1
        ? `Review: ${first.subject} — ${first.chapterName} (Day ${first.day})`
        : `${count} Study Reviews Due: ${first.subject} (Day ${first.day}) + more`;
      const body = count === 1
        ? (first.type === 'overdue' ? `Overdue review for ${first.chapterName}` : `Today's scheduled spaced-repetition review`)
        : `You have ${count} chapter review milestones waiting today.`;

      // Surface via toast (with 5-minute cooldown to avoid spamming on rapid app-switching)
      if (now - lastMilestoneToastTime > 5 * 60 * 1000) {
        lastMilestoneToastTime = now;
        window.focusModule?.showToast(`📖 ${title}`);

        if ('Notification' in window && Notification.permission === 'granted') {
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then((reg) => {
              reg.showNotification(title, {
                body,
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-192.png',
                tag: 'study-review-due',
                renotify: true
              });
            });
          } else {
            new Notification(title, {
              body,
              icon: '/icons/icon-192.png'
            });
          }
        }
      }
    }
  }

  // 2. Check for Hourly Focus Nudge
  if (window.focusModule) {
    window.focusModule.checkHourlyFocusNudge();
  }
}

// ── Install overlay ───────────────────────────────────────────────────────────
function checkInstallPrompt() {
  const isStandalone =
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;

  const alreadyDismissed = localStorage.getItem('install-dismissed') === '1';

  if (!isStandalone && !alreadyDismissed) {
    document.getElementById('install-overlay').classList.remove('hidden');
  }
}

// ── Service Worker registration ───────────────────────────────────────────────
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register('sw.js')
    .catch((err) => console.warn('[SW] Registration failed:', err));
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    await db.init();
  } catch (err) {
    console.error('[DB] Could not open IndexedDB:', err);
  }

  // Wire tab bar
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Install overlay button listeners
  const notifyBtn = document.getElementById('install-notify-btn');
  if (notifyBtn) {
    notifyBtn.addEventListener('click', async () => {
      await requestNotificationPermission();
      localStorage.setItem('install-dismissed', '1');
      document.getElementById('install-overlay').classList.add('hidden');
    });
  }

  document.getElementById('install-dismiss').addEventListener('click', () => {
    localStorage.setItem('install-dismissed', '1');
    document.getElementById('install-overlay').classList.add('hidden');
  });

  // Manually close the install overlay if user navigates back in standalone
  window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
    if (e.matches) {
      document.getElementById('install-overlay').classList.add('hidden');
    }
  });

  registerSW();
  checkInstallPrompt();

  // Navigate to default tab (tasks); this triggers module init
  switchTab(DEFAULT_TAB);

  // Perform open-app due notification check
  setTimeout(checkDueNotificationsOnOpen, 1000);

  // Re-check whenever returning to foreground (iOS app switch)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkDueNotificationsOnOpen();
    }
  });
}

document.addEventListener('DOMContentLoaded', bootstrap);

