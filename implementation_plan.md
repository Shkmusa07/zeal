# Implementation Plan: Personal Study & Focus App (Part 2 of 2)

Complete the Personal Study & Focus PWA by solidifying **Feature C (Spaced-Repetition Study Reminder)**, **Feature D (Hourly Focus Reminder)**, the **Notification Engine & iOS Foreground Fallback System**, and finalizing **`PROJECT_GUIDE.md`** as a complete architectural specification.

## User Review Required

> [!NOTE]
> All four features (Syllabus Tracker, Timer-Lock To-Do, Spaced-Repetition Reviewer, Hourly Focus Reminder) run completely client-side in the browser / iOS Home Screen PWA without any backend servers ($0 cost).

> [!IMPORTANT]
> iOS Safari requires Web Push / Notifications to be added to the Home Screen first (iOS 16.4+) and permission granted in standalone mode. To guarantee reminders are never missed on iOS, we have built the open-app & foreground resume fallback checker (`checkDueNotificationsOnOpen()`), which immediately scans and surfaces all due/overdue review milestones and the hourly focus check whenever the app is opened or brought back to the foreground.

---

## Proposed Changes

### Component 1: Spaced-Repetition Study Reminder (`js/reviews.js` & `index.html`)

- **Data Model verification**: Ensure exact alignment with spec:
  ```json
  {
    "id": 1,
    "subject": "Physics",
    "chapterName": "Thermodynamics",
    "dateStudied": "2026-09-14",
    "milestones": [
      { "day": 1, "dueDate": "2026-09-15", "status": "pending", "reviewedAt": null, "reviewNote": "" },
      { "day": 3, "dueDate": "2026-09-17", "status": "pending", "reviewedAt": null, "reviewNote": "" },
      { "day": 7, "dueDate": "2026-09-21", "status": "pending", "reviewedAt": null, "reviewNote": "" },
      { "day": 14, "dueDate": "2026-09-28", "status": "pending", "reviewedAt": null, "reviewNote": "" }
    ],
    "notes": "string"
  }
  ```
- **Milestone Evaluation & Flagging**:
  - Milestones with `dueDate < today` and not done are marked `overdue` and styled with a distinct, prominent warning flag (red accent + subtle pulse).
  - Milestones with `dueDate === today` and not done are highlighted as `DUE TODAY`.
  - Tapping any pending or overdue milestone opens a reflection modal to record a reflection note (e.g. how well it was remembered) and mark it `done` with a timestamp.
  - Done milestones can also be tapped to review or update notes or unmark.
- **Notification text**: Format milestone reminders precisely per spec: `"Review: [Subject] — [Chapter name] (Day X)"`.
- **Filtering**: Segmented control allows switching between "All Chapters" and "Due & Overdue" with active count indicators.

### Component 2: Hourly Focus Reminder (`js/focus.js` & `index.html`)

- **Today's Main Focus**: Large, prominent Notion-style input field, autosaved in `localStorage`.
- **Daytime Window**:
  - Start time selectable (06:00 AM through 02:00 PM).
  - Duration adjustable from 8 up to 14 hours (default 12 hours, e.g., 8:00 AM – 10:00 PM for 14 hours).
  - Live status indicator showing active study window, current time, and next nudge.
- **Notification Text**: Exact spec format: `"Focus check: [main focus text]"`.
- **Snooze & Turn Off Controls**:
  - "Snooze 1 Hour" button (with option to cancel snooze).
  - "Turn Off Today" button (with reversible "Resume for Today" option so user isn't stuck if tapped by mistake).
  - Master on/off toggle.

### Component 3: Notification Engine & iOS Foreground Fallback (`sw.js` & `js/app.js`)

- **Service Worker (`sw.js`)**:
  - Bump cache version to `studyapp-v2`.
  - Ensure all scripts and styles are cached for 100% offline operation.
  - Implement `push` and `notificationclick` handlers to refocus or open the app on tap.
- **App Shell & Foreground Scanner (`js/app.js`)**:
  - `checkDueNotificationsOnOpen()` scans for any milestones that became due or overdue while the app was closed or backgrounded.
  - Checks if an hourly focus nudge is due.
  - Shows an in-app Notion-styled toast banner + system Notification (via `ServiceWorkerRegistration.showNotification`).
  - Implements intelligent cooldown/deduplication to avoid notification spam on quick app switching.
  - Install overlay prompt explains the Home Screen requirement on iOS before notification permission can be granted.

### Component 4: HTML Shell & CSS Polish (`index.html` & `css/style.css`)

- Remove duplicate `</body></html>` tags at end of `index.html`.
- Ensure dark mode consistency, safe area insets for iPhone notch / dynamic island (`env(safe-area-inset-top)` / `env(safe-area-inset-bottom)`).
- Ensure mobile touch targets meet Apple HIG (minimum 44x44 pt).

### Component 5: Project Guide (`PROJECT_GUIDE.md`)

- Complete overhaul of `PROJECT_GUIDE.md` to reflect the finished application with:
  1. Full feature overview (all 4 features).
  2. Complete data models as implemented.
  3. Notification architecture, Web Push, and iOS background limitation mitigation.
  4. Complete file and folder structure.
  5. Checklist marked 100% complete.
  6. Instructions for future developers and AI agents.

---

## Verification Plan

### Automated / Syntax Verification
- Syntax validation of all JavaScript files (`js/db.js`, `js/app.js`, `js/reviews.js`, `js/focus.js`, `js/syllabus.js`, `js/tasks.js`, `sw.js`).
- HTML validation check on `index.html`.

### Manual / Browser Verification
- Start local HTTP server on port 8080 and test via browser subagent:
  1. **Feature C (Study Reviews)**:
     - Log a new chapter ("Physics", "Thermodynamics", studied today or 3 days ago to test overdue calculation).
     - Verify 4 milestones (+1, +3, +7, +14 days) are created with correct dates and statuses.
     - Tap milestone -> enter note -> mark as reviewed -> verify status changes to DONE.
     - Toggle "Due & Overdue" filter.
  2. **Feature D (Focus Reminder)**:
     - Set "Today's main focus" text.
     - Adjust start time and duration (test 14 hours).
     - Click "Test Focus Notification" and verify toast banner and notification trigger.
     - Click "Snooze 1 Hour" and "Turn Off Today" and verify live status indicator updates.
  3. **Notification and Foreground Check**:
     - Verify `checkDueNotificationsOnOpen()` executes cleanly without errors.
