/**
 * api/check-and-notify.js
 *
 * Serverless cron route triggered every 15–30 minutes by Vercel Cron.
 * Reads 'push-subscription', 'focus-settings', and 'reviews' from Vercel Global Config,
 * evaluates due milestones and active hourly focus nudges, and dispatches real Web Push notifications.
 */

import { get } from '@vercel/global-config';
import webpush from 'web-push';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BL_oQjUZ1n0co9kjA8ubhQIQ0sDX04zvuBRULWawKZSb43pspFih7FLzfUlsjxF4jZp6co_DC6kK7VTA2_kGIRc';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'E1dNFbQqIWfkiAzokZ56uBselv3SYDobVCtlBkmc2gU';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:musa@personalstudy.app';

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (err) {
  console.warn('[VAPID] Config error:', err.message);
}

// Helper: Format Date object to YYYY-MM-DD
function toDateStr(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper: Check if an hour is within a startHour + duration window
function isHourInWindow(currentHour, startHour, durationHours) {
  const endHour = (startHour + durationHours) % 24;
  if (startHour < endHour) {
    return currentHour >= startHour && currentHour < endHour;
  } else {
    return currentHour >= startHour || currentHour < endHour;
  }
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const isManualTest = req.method === 'POST';
  const body = req.body || {};

  try {
    // ── 1. Retrieve Web Push Subscription ──────────────────────────────────
    let rawSub = null;
    try {
      rawSub = await get('push-subscription');
    } catch (err) {
      console.warn('[Global Config] Could not read "push-subscription":', err.message);
    }

    // Fallback to body if manual test call
    if (!rawSub && body.subscription) {
      rawSub = body.subscription;
    }

    if (!rawSub) {
      const msg = 'No push subscription found in Global Config under key "push-subscription". Musa needs to copy the subscription JSON from the app into the Vercel dashboard.';
      console.log(`[check-and-notify] ${msg}`);
      return res.status(200).json({ status: 'no_subscription', message: msg });
    }

    let subscription;
    try {
      subscription = typeof rawSub === 'string' ? JSON.parse(rawSub) : rawSub;
    } catch (err) {
      return res.status(400).json({ error: 'Invalid push-subscription JSON stored in Global Config', details: err.message });
    }

    if (!subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'Stored push-subscription is missing endpoint or keys' });
    }

    // ── 2. Read Focus Settings & Reviews from Global Config ───────────────
    let focusSettings = null;
    try {
      const rawFocus = await get('focus-settings');
      focusSettings = typeof rawFocus === 'string' ? JSON.parse(rawFocus) : rawFocus;
    } catch (err) {
      console.warn('[Global Config] Could not read "focus-settings":', err.message);
    }
    if (!focusSettings && body.focusSettings) {
      focusSettings = body.focusSettings;
    }

    let reviews = [];
    try {
      const rawReviews = await get('reviews');
      reviews = typeof rawReviews === 'string' ? JSON.parse(rawReviews) : (rawReviews || []);
    } catch (err) {
      console.warn('[Global Config] Could not read "reviews":', err.message);
    }
    if ((!reviews || reviews.length === 0) && body.reviews) {
      reviews = body.reviews;
    }

    // Compute user's local date/time (default to +05:30 IST, or timezone offset from focusSettings)
    const nowUtc = Date.now();
    // Default offset: +330 minutes (+05:30)
    const offsetMin = focusSettings && typeof focusSettings.timezoneOffset === 'number'
      ? focusSettings.timezoneOffset
      : 330;
    const localDate = new Date(nowUtc + offsetMin * 60 * 1000);
    const localHour = localDate.getUTCHours();
    const todayStr = toDateStr(localDate);

    const notificationsToSend = [];

    // ── 3. Evaluate Hourly Focus Nudge ────────────────────────────────────
    if (focusSettings && focusSettings.enabled !== false && focusSettings.focusText) {
      const startHour = typeof focusSettings.startHour === 'number' ? focusSettings.startHour : 8;
      const durationHours = typeof focusSettings.durationHours === 'number' ? focusSettings.durationHours : 12;
      const snoozedUntil = focusSettings.snoozedUntil || 0;
      const turnedOffDate = focusSettings.turnedOffDate || null;

      const inWindow = isHourInWindow(localHour, startHour, durationHours);
      const isSnoozed = snoozedUntil > nowUtc;
      const isTurnedOffToday = turnedOffDate === todayStr;

      if (inWindow && !isSnoozed && !isTurnedOffToday) {
        // Spec format: "Focus check: [main focus text]"
        notificationsToSend.push({
          type: 'focus',
          title: `Focus check: ${focusSettings.focusText.trim()}`,
          body: `What are you working on right now? Stay locked in on: "${focusSettings.focusText.trim()}".`,
          tag: `focus-check-${localHour}`,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          data: { type: 'focus', url: '/' }
        });
      }
    }

    // ── 4. Evaluate Spaced-Repetition Milestones ──────────────────────────
    if (Array.isArray(reviews)) {
      reviews.forEach((rev) => {
        if (!rev || !Array.isArray(rev.milestones)) return;

        rev.milestones.forEach((m) => {
          if (m.status !== 'done') {
            const isDueToday = m.dueDate === todayStr;
            const isOverdue = m.dueDate < todayStr || m.status === 'overdue';

            if (isDueToday || isOverdue) {
              // Spec format: "Review: [Subject] — [Chapter name] (Day X)"
              notificationsToSend.push({
                type: 'review',
                title: `Review: ${rev.subject} — ${rev.chapterName} (Day ${m.day})`,
                body: isOverdue
                  ? `Day ${m.day} review is overdue (was due ${m.dueDate}). Review now!`
                  : `Day ${m.day} spaced-repetition review is scheduled for today.`,
                tag: `review-${rev.id || rev.subject}-${m.day}`,
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-192.png',
                data: { type: 'review', subject: rev.subject, chapterName: rev.chapterName, day: m.day, url: '/' }
              });
            }
          }
        });
      });
    }

    // ── 5. Dispatch Web Push Notifications ────────────────────────────────
    const dispatchResults = [];
    for (const notif of notificationsToSend) {
      try {
        const payload = JSON.stringify({
          title: notif.title,
          body: notif.body,
          icon: notif.icon,
          badge: notif.badge,
          tag: notif.tag,
          data: notif.data
        });

        await webpush.sendNotification(subscription, payload);
        dispatchResults.push({ title: notif.title, status: 'sent' });
        console.log(`[WebPush] Sent push notification: "${notif.title}"`);
      } catch (err) {
        console.error(`[WebPush] Failed sending "${notif.title}":`, err.message);
        dispatchResults.push({ title: notif.title, status: 'failed', error: err.message });
      }
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      localTime: `${todayStr} ${localHour}:00 (UTC+${offsetMin / 60})`,
      notificationsEvaluated: notificationsToSend.length,
      dispatchResults: dispatchResults
    });
  } catch (err) {
    console.error('[check-and-notify] Fatal error:', err);
    return res.status(500).json({ error: err.message });
  }
}
