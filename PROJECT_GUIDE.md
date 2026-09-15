# Personal Study & Focus App — Complete Developer & Architecture Guide

Welcome to the **Personal Study & Focus App** codebase. This document is a comprehensive, self-contained architecture and technical reference designed so any developer or AI agent opening this repository cold can fully understand the system, its design decisions, data models, file responsibilities, and operational mechanics.

---

## 1. Executive Summary & Core Constraints

- **Platform Target:** Optimized specifically for iPhone PWA (Safari "Add to Home Screen" standalone mode) and modern mobile browsers.
- **Operating Cost:** Exactly $0 / Zero backend infrastructure.
- **Architecture:** 100% Client-side, offline-first Single Page Application (SPA).
  - Storage: IndexedDB (`studyapp-db` v2) for structured entities + `localStorage` for lightweight app state/preferences.
  - Offline Engine: Service Worker (`sw.js`) with cache-first shell caching.
- **Design Language:** Minimalist, Notion-inspired aesthetic.
  - Font: Inter (Google Fonts) with system fallbacks.
  - Palette: Calming off-white (`#F7F6F3`) in light mode, deep dark (`#111110`) in dark mode, and a signature Indigo/Lavender accent (`#5B6AF0`).
  - Tone: Clean whitespace, quiet borders (`#E3E2DE`), high scannability, zero noisy gamification, zero cartoonish badges.

---

## 2. File & Directory Structure

```
g:\IOS APP\
├── index.html              # Single-page app: Header, 4 tab panels, push setup modal, toast & overlay
├── manifest.json           # PWA manifest (standalone display, portrait orientation, theme colors)
├── sw.js                   # Service Worker: shell cache (v2), real push listener & window routing
├── package.json            # Node.js dependencies for Vercel functions (web-push, @vercel/global-config)
├── vercel.json             # Vercel Cron configuration (calls /api/check-and-notify every 15 mins)
├── .env.example            # Documentation of required VAPID & Global Config environment variables
├── PROJECT_GUIDE.md        # Complete developer & architecture specification (this file)
├── api/
│   ├── log-subscription.js # Serverless route: logs subscription to Vercel function logs
│   └── check-and-notify.js # Serverless cron: reads Global Config, checks due items & sends Web Push
├── css/
│   └── style.css           # Design tokens, tab transitions, micro-animations, empty states & dark mode
├── js/
│   ├── db.js               # IndexedDB asynchronous wrapper (CRUD for subjects, chapters, tasks, reviews)
│   ├── syllabus.js         # Feature A: Syllabus Tracker (subject groups, chapters, retention, revisions)
│   ├── tasks.js            # Feature B: Timer-Lock To-Do List, lock screen takeover & urgency pulse
│   ├── reviews.js          # Feature C: Spaced-Repetition Study Reminders (+1d, +3d, +7d, +14d milestones)
│   ├── focus.js            # Feature D: Hourly Focus Reminders, daytime window & Resume Today toggle
│   └── app.js              # App bootstrap, tab routing, VAPID Web Push subscription & modal UI
└── icons/
    ├── icon-192.png        # PWA launcher icon (192x192)
    └── icon-512.png        # PWA launcher icon (512x512)
```

---

## 3. Data Schemas & Storage Design

### A. IndexedDB Database: `studyapp-db` (Version 2)

Managed in [`js/db.js`](file:///g:/IOS%20APP/js/db.js). All database calls return native Promises.

#### 1. Store: `subjects`
Holds top-level syllabus subjects.
- `id` (integer, auto-increment primary key)
- `name` (string): Subject title (e.g. "Physics", "Organic Chemistry")
- `createdAt` (timestamp): Epoch timestamp in milliseconds

#### 2. Store: `chapters`
Holds individual syllabus chapters associated with a subject. Indexed by `subjectId`.
- `id` (integer, auto-increment primary key)
- `subjectId` (integer): Foreign key to `subjects.id`
- `chapterName` (string): Title of chapter or module
- `complete` (boolean): Whether fully mastered/completed
- `percentComplete` (integer, 0–100): Self-assessed syllabus progress
- `retention` (string): `"low"` | `"medium"` | `"high"`
- `revisionsDone` (integer, >= 0): Count of revision cycles completed
- `revisionsNeeded` (integer, >= 1): Target revision cycles
- `remarks` (string): User notes or weak areas

#### 3. Store: `tasks`
Holds to-do items for the timer-lock workflow.
- `id` (integer, auto-increment primary key)
- `title` (string): Name of task/focus session
- `estimatedMinutes` (integer): Planned duration (5–180 mins)
- `status` (string): `"todo"` | `"active"` | `"done"`
- `startedAt` (timestamp | null): Epoch timestamp when timer started
- `completedAt` (timestamp | null): Epoch timestamp when marked done

#### 4. Store: `reviews` (Feature C: Spaced Repetition)
Stores chapters logged for spaced repetition review cycles.
- `id` (integer, auto-increment primary key)
- `subject` (string): Name of subject (autocompleted from syllabus or custom)
- `chapterName` (string): Name of chapter studied
- `dateStudied` (string, `YYYY-MM-DD`): Base study date
- `milestones` (array of 4 objects):
  - `day` (integer): 1, 3, 7, or 14
  - `dueDate` (string, `YYYY-MM-DD`): Calculated as `dateStudied + day days`
  - `status` (string): `"pending"` | `"done"` | `"overdue"`
  - `reviewedAt` (string | null): Timestamp or date string when completed
  - `reviewNote` (string): Optional reflection note recorded during review
- `notes` (string): Optional notes captured at time of initial study

### B. LocalStorage Keys

- `studyapp_focus_settings`: Serialized JSON object for Feature D (Hourly Focus Reminder):
  ```json
  {
    "focusText": "Finish 20 physics problems",
    "startHour": 8,
    "durationHours": 12,
    "enabled": true,
    "snoozedUntil": 0,
    "turnedOffDate": null,
    "lastNudgeHour": 15,
    "timezoneOffset": 330
  }
  ```
- `studyapp_notifications_enabled`: `"true"` | `"false"`
- `install-dismissed`: `"1"` (persisted once the user dismisses the install prompt)

### C. Vercel Global Config Store Keys (Read-Only from App Code)

Stored in Vercel's Edge/Global Config store and read by `/api/check-and-notify`:
- `push-subscription`: JSON string of the Web Push subscription object (`{ endpoint, keys: { p256dh, auth } }`). Pasted manually once by Musa via the Vercel dashboard.
- `focus-settings`: JSON string of the active focus window and main focus text.
- `reviews`: JSON string of the array of review objects with their milestone schedules.

---

## 4. Feature E: Real Web Push & Serverless Cron Architecture

```mermaid
flowchart TD
    subgraph Client Device [iPhone Standalone PWA]
        A[User taps 'Allow Notifications'] --> B[PushManager.subscribe with VAPID Key]
        B --> C[POST /api/log-subscription]
        B --> D[Open Push Setup Modal with 1-Click Copy Buttons]
        D -->|Musa copies JSON| E[Vercel Dashboard: Paste into Global Config]
    end

    subgraph Vercel Cloud [Zero Infrastructure Backend]
        F[Vercel Cron: every 15 min] --> G[/api/check-and-notify]
        G --> H[Read Global Config: push-subscription, focus-settings, reviews]
        H --> I{Check Focus Window & Review Milestones}
        I -->|Item Due| J[web-push sendNotification]
    end

    J -->|Apple Push Notification service| K[iOS Lock Screen & Notification Center]
    K -->|User Taps| L[sw.js 'push' & 'notificationclick' focus app]
```

### 1. VAPID Key Pair Setup
- **Public Key:** `BL_oQjUZ1n0co9kjA8ubhQIQ0sDX04zvuBRULWawKZSb43pspFih7FLzfUlsjxF4jZp6co_DC6kK7VTA2_kGIRc`
- **Private Key:** `E1dNFbQqIWfkiAzokZ56uBselv3SYDobVCtlBkmc2gU`
- Configured as environment variables on Vercel:
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT`: `mailto:musa@personalstudy.app`

### 2. The Two API Routes
1. **[`api/log-subscription.js`](file:///g:/IOS%20APP/api/log-subscription.js):**
   - Receives the subscription payload from the client upon permission grant.
   - Logs the formatted JSON to Vercel Function logs for easy copying into Global Config.
2. **[`api/check-and-notify.js`](file:///g:/IOS%20APP/api/check-and-notify.js):**
   - Scheduled by Vercel Cron (`vercel.json`) every 15 minutes.
   - Reads `push-subscription`, `focus-settings`, and `reviews` from Global Config via `@vercel/global-config`.
   - Evaluates whether the current local time falls inside the daytime window, whether focus reminders are snoozed or paused, and whether any review milestones are due today or overdue.
   - Dispatches real Web Push notifications directly to APNs (Apple Push Notification service) using `web-push`.

### 3. Global Config Read-Only Workflow
Because Global Config is designed for infrequent writes, the client does not directly write to the store. Instead:
1. In the app, tap the **🔔** icon in the header (or tap "Allow notifications").
2. The app generates the subscription and displays the **Web Push Setup Modal**.
3. Tap **"Copy JSON"** next to `push-subscription` (and optionally `focus-settings` and `reviews`).
4. In the Vercel Dashboard ➔ Storage ➔ Global Config, paste the value under the key `push-subscription`.
5. Re-running is only needed if the app is re-installed or Safari site data is cleared.

---

## 5. Bug Fixes (Part 3)

### Bug Fix 1: "Turn Off Today" / "Resume Today" Toggle
- **Problem:** In earlier builds, tapping "Turn Off Today" paused nudges, but had no intuitive or immediate way to resume them for the rest of the day.
- **Solution:** 
  - Tapping "Turn Off Today" immediately toggles the button into **"▶ Resume Today"**.
  - Tapping "Resume Today" clears `turnedOffDate`, resets `lastNudgeHour = -1`, immediately re-renders the UI, runs `checkHourlyFocusNudge()`, and resumes hourly nudges if currently within the active daytime window.
  - The snooze button is properly disabled while paused and re-enabled upon resuming.

### Bug Fix 2: Reviews Milestones Notifications
- **Problem:** Spaced-repetition review milestones only appeared visually on the screen and never triggered notifications outside the app.
- **Solution:**
  - Integrated into `/api/check-and-notify.js`: the cron runner evaluates all pending milestones against today's date (`milestone.dueDate <= todayStr && milestone.status !== 'done'`).
  - Dispatches Web Push with the exact spec format:
    `Review: [Subject] — [Chapter name] (Day X)`
  - Retains the client foreground check fallback in `js/app.js` with an anti-spam cooldown.

---

## 6. Visual Polish & Minimalist Motion

- **Tab Transitions:** Smooth, subtle fade-in and vertical slide (`tabFadeIn`, 180ms, `cubic-bezier(0.16, 1, 0.3, 1)`) when switching between tabs.
- **Micro-interactions:** Restrained tactile `:active` state (`transform: scale(0.98)`, 80ms) on all buttons, chips, and cards.
- **Milestone Feedback:**
  - Marking a milestone done applies a soft green glow (`box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.2)`).
  - Overdue milestones display a quiet, slow amber pulse (`subtleOverduePulse`).
- **Timer Urgency:** In the last 10 seconds of a focus countdown, `#lock-timer` activates an `urgency-pulse` animation (subtle amber color shift and 1.02 scale oscillation).
- **Minimalist Empty States:** Replaced all placeholder text with clean, static monochrome SVG icons (book, check-circle, list lines) and quiet typography.
- **Strict Aesthetic Restraint:** Zero confetti, zero loud badges, zero gamification, zero sound effects.

---

## 7. Completed Feature Checklist

- [x] **App Shell & Navigation:** 4-tab bottom navigation (Reviews, Tasks, Focus, Syllabus), header with notification settings, and smooth tab switching.
- [x] **Safari Install Prompt:** First-launch overlay with step-by-step PWA install instructions and notification permission opt-in.
- [x] **Feature A — Syllabus Tracker:** Subject cards, chapter table, retention selectors (Low/Medium/High), revision counters (+/-), % progress sliders, search/filters, SVG empty state.
- [x] **Feature B — Timer-Lock To-Do List:** Task list with estimated duration, full-screen lock screen takeover (`#lock-screen`) with countdown timer, "Mark Done" / "Give Up" commitment controls, 10-second urgency pulse, and completed task accordion.
- [x] **Feature C — Spaced-Repetition Study Reminder:** Log studied chapter with automatic +1d, +3d, +7d, +14d milestone generation, status badges (`pending`, `done`, `overdue`, `duetoday`), reflection note modal, and unmark capability.
- [x] **Feature D — Hourly Focus Reminder:** Daily focus text configuration, daytime window selector (8–14 hrs, 6 AM–2 PM), hourly nudge interval, "Snooze 1 Hour", "Turn Off Today" / "▶ Resume Today" immediate toggle, and test nudge button.
- [x] **Feature E — Real Web Push Notifications:** VAPID key architecture, client push subscription, `/api/log-subscription`, `/api/check-and-notify` serverless cron, and Vercel Global Config read-only manual workflow.
- [x] **Bug Fix 1:** "Turn Off Today" toggles into "Resume Today" and restores nudges immediately if within the active daytime window.
- [x] **Bug Fix 2:** Spaced-repetition milestones trigger real Web Push notifications when due or overdue.
- [x] **Visual Polish:** Micro-animations (tabFadeIn, button :active scale, soft done glow, overdue pulse, countdown last 10s pulse), and clean SVG empty states.

---

## 8. Running & Testing Locally

1. **Launch Static Server:**
   ```bash
   python -m http.server 8080
   ```
2. **Access App:** Open `http://localhost:8080/` in Safari or Chrome.
3. **Local Testing Checklist:**
   - **Web Push Setup Modal:** Tap the 🔔 icon in the header. Verify that the modal opens with copy buttons for `push-subscription`, `focus-settings`, and `reviews`.
   - **Resume Today Toggle:** In the Focus tab, tap "Turn Off Today" ➔ confirm status changes to paused and button changes to "▶ Resume Today". Tap "▶ Resume Today" ➔ confirm button reverts to "⏸ Turn Off Today" and nudges resume.
   - **Lock Screen Urgency:** Start a 1-minute task or wait for the countdown to hit the final 10 seconds ➔ verify the subtle amber urgency pulse.
   - **Empty States:** Navigate to empty lists (Reviews, Tasks, Syllabus) to confirm clean SVG illustrations render with no broken icons.

