'use strict';

/**
 * tasks.js — Feature B: Timer-Lock To-Do List
 *
 * Starting a task opens a full-screen lock screen with a countdown timer.
 * The timer is computed from `startedAt` + `estimatedMinutes` using Date.now(),
 * so it stays accurate even if the app is backgrounded or the screen sleeps.
 */

window.tasksModule = (() => {
  // ── State ──────────────────────────────────────────────────────────────────
  let tasks       = [];
  let activeTask  = null;   // The currently running task (status = 'active')
  let timerTick   = null;   // setInterval handle

  // ── Utility ────────────────────────────────────────────────────────────────
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtTime(date) {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ── Render task card ───────────────────────────────────────────────────────
  function renderCard(task) {
    const isDone   = task.status === 'done';
    const isActive = task.status === 'active';

    const durationBadge = task.estimatedMinutes
      ? `<span class="task-duration">${task.estimatedMinutes}m</span>`
      : '';

    const completedBadge = isDone && task.completedAt
      ? `<span class="task-completed-time">Done ${fmtTime(task.completedAt)}</span>`
      : '';

    const startBtn = !isDone
      ? `<button class="task-start-btn btn-primary" data-id="${task.id}">
           ${isActive ? 'Resume' : 'Start'}
         </button>`
      : '';

    return `
      <div class="task-card ${isDone ? 'task-done' : ''} ${isActive ? 'task-active' : ''}"
           data-task-id="${task.id}">
        <div class="task-card-main">
          <div class="task-info">
            <span class="task-title">${esc(task.title)}</span>
            <div class="task-meta">${durationBadge}${completedBadge}</div>
          </div>
          <div class="task-actions">
            ${startBtn}
            <button class="task-delete-btn btn-icon" data-id="${task.id}" title="Delete">✕</button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Render the full list ───────────────────────────────────────────────────
  function render() {
    const todoEl = document.getElementById('todo-list');
    const doneEl = document.getElementById('done-list');
    const doneAccordion = document.getElementById('done-accordion');
    const doneToggle    = document.getElementById('done-toggle');

    const todoTasks = tasks.filter((t) => t.status !== 'done');
    const doneTasks = tasks.filter((t) => t.status === 'done').reverse(); // newest first

    // ── To-do section ──────────────────────────────────────────────────────
    if (todoTasks.length === 0) {
      todoEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✓</div>
          <p class="empty-state-title">Nothing to do yet</p>
          <p class="empty-state-desc">Add a task above and tap Start to begin a focused session.</p>
        </div>
      `;
    } else {
      todoEl.innerHTML = todoTasks.map(renderCard).join('');
    }

    // ── Completed section ──────────────────────────────────────────────────
    if (doneTasks.length > 0) {
      doneAccordion.style.display = '';
      doneToggle.textContent = `Completed (${doneTasks.length})`;
      // Preserve open/closed state across re-renders
      if (doneEl.style.display !== 'none') {
        doneEl.innerHTML = doneTasks.map(renderCard).join('');
      }
    } else {
      doneAccordion.style.display = 'none';
    }

    wireTaskEvents();
  }

  // ── Wire task card events ──────────────────────────────────────────────────
  function wireTaskEvents() {
    document.querySelectorAll('.task-start-btn').forEach((btn) => {
      btn.addEventListener('click', () => startTask(Number(btn.dataset.id)));
    });
    document.querySelectorAll('.task-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteTask(Number(btn.dataset.id)));
    });
  }

  // ── Start a task / show lock screen ───────────────────────────────────────
  async function startTask(id) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    // If another task is somehow active, resume it
    if (activeTask && activeTask.id !== id) {
      showLockScreen(activeTask);
      return;
    }

    if (task.status !== 'active') {
      task.status    = 'active';
      task.startedAt = Date.now();
      activeTask     = task;
      await db.tasks.update(task);
    } else {
      activeTask = task;
    }

    showLockScreen(task);
    render();
  }

  // ── Lock screen ────────────────────────────────────────────────────────────
  function showLockScreen(task) {
    const screen = document.getElementById('lock-screen');
    document.getElementById('lock-task-title').textContent = task.title;

    const hasTimer    = Boolean(task.estimatedMinutes);
    const timerWrap   = document.getElementById('lock-timer-container');
    const timerDoneMsg = document.getElementById('lock-timer-done-msg');

    timerWrap.style.display    = hasTimer ? '' : 'none';
    timerDoneMsg.style.display = 'none';

    screen.classList.remove('hidden');
    document.body.classList.add('locked');

    // Stop any previous tick
    if (timerTick) { clearInterval(timerTick); timerTick = null; }

    if (hasTimer) {
      // Immediate update + repeat every 500 ms
      tickTimer(task);
      timerTick = setInterval(() => tickTimer(task), 500);
    }
  }

  function tickTimer(task) {
    const totalMs     = (task.estimatedMinutes ?? 0) * 60 * 1000;
    const elapsed     = Date.now() - task.startedAt;
    const remainingMs = Math.max(0, totalMs - elapsed);

    const totalSec = Math.ceil(remainingMs / 1000);
    const mins     = Math.floor(totalSec / 60);
    const secs     = totalSec % 60;
    const display  = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const timerEl = document.getElementById('lock-timer');
    if (timerEl) timerEl.textContent = display;

    if (remainingMs === 0) {
      clearInterval(timerTick);
      timerTick = null;
      const msg = document.getElementById('lock-timer-done-msg');
      if (msg) msg.style.display = '';
    }
  }

  function hideLockScreen() {
    document.getElementById('lock-screen').classList.add('hidden');
    document.body.classList.remove('locked');
    if (timerTick) { clearInterval(timerTick); timerTick = null; }
  }

  // ── Mark task done ─────────────────────────────────────────────────────────
  async function markDone() {
    if (!activeTask) return;
    activeTask.status      = 'done';
    activeTask.completedAt = Date.now();
    await db.tasks.update(activeTask);
    activeTask = null;
    hideLockScreen();
    render();
  }

  // ── Give up ────────────────────────────────────────────────────────────────
  async function giveUp() {
    if (!confirm('Leave this task? It will return to your to-do list.')) return;
    if (!activeTask) return;
    activeTask.status    = 'todo';
    activeTask.startedAt = null;
    await db.tasks.update(activeTask);
    activeTask = null;
    hideLockScreen();
    render();
  }

  // ── Add task ───────────────────────────────────────────────────────────────
  async function addTask(title, estimatedMinutes) {
    const data = {
      title,
      estimatedMinutes: estimatedMinutes || null,
      status:           'todo',
      startedAt:        null,
      completedAt:      null
    };
    const id = await db.tasks.add(data);
    data.id  = id;
    tasks.push(data);
    render();
  }

  // ── Delete task ────────────────────────────────────────────────────────────
  async function deleteTask(id) {
    if (activeTask?.id === id) { hideLockScreen(); activeTask = null; }
    await db.tasks.delete(id);
    tasks = tasks.filter((t) => t.id !== id);
    render();
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  async function init() {
    tasks = await db.tasks.getAll();

    // Recover any task that was active when the app was last closed
    activeTask = tasks.find((t) => t.status === 'active') ?? null;

    render();

    // ── Add-task form ────────────────────────────────────────────────────────
    const form          = document.getElementById('add-task-form');
    const titleInput    = document.getElementById('task-title-input');
    const durationInput = document.getElementById('task-duration-input');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = titleInput.value.trim();
      if (!title) return;
      const mins = parseInt(durationInput.value, 10) || null;
      await addTask(title, mins);
      titleInput.value    = '';
      durationInput.value = '';
      titleInput.focus();
    });

    // ── Completed accordion ──────────────────────────────────────────────────
    const doneToggle = document.getElementById('done-toggle');
    const doneList   = document.getElementById('done-list');

    doneToggle.addEventListener('click', () => {
      const isOpen = doneList.style.display !== 'none';
      doneList.style.display = isOpen ? 'none' : '';
      if (!isOpen) {
        // Populate when opening (we skipped render when closed)
        const doneTasks = tasks.filter((t) => t.status === 'done').reverse();
        doneList.innerHTML = doneTasks.map(renderCard).join('');
        wireTaskEvents();
      }
    });

    // ── Lock screen buttons ──────────────────────────────────────────────────
    document.getElementById('lock-done-btn').addEventListener('click', markDone);
    document.getElementById('lock-giveup-btn').addEventListener('click', giveUp);

    // ── Restore lock screen if app was reopened mid-session ──────────────────
    if (activeTask) showLockScreen(activeTask);
  }

  return { init };
})();
