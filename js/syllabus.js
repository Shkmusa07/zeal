'use strict';

/**
 * syllabus.js — Feature A: Notion-Style Syllabus Tracker
 *
 * Architecture: module pattern, all state in memory + mirrored to IndexedDB.
 * DOM is re-rendered per subject on any change (fine at this data scale).
 */

window.syllabusModule = (() => {
  // ── State ──────────────────────────────────────────────────────────────────
  let subjects  = []; // { id, name, createdAt }
  let chapters  = []; // { id, subjectId, chapterName, complete, percentComplete, retention, revisionsDone, revisionsNeeded, remarks }

  // Per-subject filter/sort state
  // filterState[subjectId] = { incompleteOnly, lowRetentionOnly, sort }
  const filterState = {};

  const RETENTION = ['Low', 'Medium', 'High'];

  // ── Utility ────────────────────────────────────────────────────────────────
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getChapter(id) {
    return chapters.find((c) => c.id === id);
  }

  function subjectChapters(subjectId, filters = {}) {
    let list = chapters.filter((c) => c.subjectId === subjectId);
    if (filters.incompleteOnly)   list = list.filter((c) => !c.complete);
    if (filters.lowRetentionOnly) list = list.filter((c) => c.retention === 'Low' || !c.retention);
    if (filters.sort === 'pct-asc')  list.sort((a, b) => (a.percentComplete ?? 0) - (b.percentComplete ?? 0));
    if (filters.sort === 'pct-desc') list.sort((a, b) => (b.percentComplete ?? 0) - (a.percentComplete ?? 0));
    if (filters.sort === 'ret-asc')  list.sort((a, b) => RETENTION.indexOf(a.retention) - RETENTION.indexOf(b.retention));
    return list;
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  function retentionBorderClass(retention) {
    if (retention === 'Low')    return 'ret-low';
    if (retention === 'Medium') return 'ret-medium';
    if (retention === 'High')   return 'ret-high';
    return '';
  }

  function renderChapterRow(ch) {
    const retBtns = RETENTION.map((level) => `
      <button class="retention-btn ${ch.retention === level ? 'active' : ''}"
              data-chapter="${ch.id}" data-level="${level}">${level}</button>
    `).join('');

    return `
      <div class="chapter-row ${ch.complete ? 'complete' : ''} ${retentionBorderClass(ch.retention)}"
           data-chapter-id="${ch.id}">

        <div class="chapter-row-top">
          <label class="checkbox-label" title="Mark complete">
            <input type="checkbox" class="chapter-check"
                   data-chapter="${ch.id}" ${ch.complete ? 'checked' : ''}>
            <span class="checkbox-custom"></span>
          </label>

          <span class="chapter-name-text"
                contenteditable="true"
                data-chapter="${ch.id}"
                data-field="chapterName"
                spellcheck="false"
                role="textbox"
                aria-label="Chapter name">${esc(ch.chapterName)}</span>

          <button class="btn-icon btn-delete-chapter"
                  data-id="${ch.id}" title="Delete chapter">✕</button>
        </div>

        <div class="chapter-row-fields">

          <div class="field-group field-percent">
            <span class="field-label">Completion</span>
            <div class="slider-row">
              <input type="range" class="chapter-slider"
                     min="0" max="100"
                     value="${ch.percentComplete ?? 0}"
                     data-chapter="${ch.id}" data-field="percentComplete"
                     aria-label="Completion percentage">
              <span class="slider-value">${ch.percentComplete ?? 0}%</span>
            </div>
          </div>

          <div class="field-group field-retention">
            <span class="field-label">Retention</span>
            <div class="retention-group">${retBtns}</div>
          </div>

          <div class="field-group field-revisions">
            <span class="field-label">Revisions</span>
            <div class="revision-row">
              <span class="revision-label">Done</span>
              <div class="counter-group">
                <button class="counter-btn" data-chapter="${ch.id}" data-field="revisionsDone" data-delta="-1">−</button>
                <span class="counter-val">${ch.revisionsDone ?? 0}</span>
                <button class="counter-btn" data-chapter="${ch.id}" data-field="revisionsDone" data-delta="1">+</button>
              </div>
              <span class="revision-label">Needed</span>
              <div class="counter-group">
                <button class="counter-btn" data-chapter="${ch.id}" data-field="revisionsNeeded" data-delta="-1">−</button>
                <span class="counter-val">${ch.revisionsNeeded ?? 0}</span>
                <button class="counter-btn" data-chapter="${ch.id}" data-field="revisionsNeeded" data-delta="1">+</button>
              </div>
            </div>
          </div>

          <div class="field-group field-remarks">
            <span class="field-label">Remarks</span>
            <input type="text" class="remarks-input"
                   placeholder="Notes, weak areas, key formulas…"
                   value="${esc(ch.remarks)}"
                   data-chapter="${ch.id}" data-field="remarks"
                   aria-label="Remarks">
          </div>

        </div>
      </div>
    `;
  }

  function renderSubjectCard(subject) {
    const fs        = filterState[subject.id] ?? {};
    const filtered  = subjectChapters(subject.id, fs);
    const allChaps  = chapters.filter((c) => c.subjectId === subject.id);
    const done      = allChaps.filter((c) => c.complete).length;
    const total     = allChaps.length;
    const avgPct    = total > 0
      ? Math.round(allChaps.reduce((s, c) => s + (c.percentComplete ?? 0), 0) / total)
      : 0;

    const chapsHtml = filtered.length > 0
      ? filtered.map(renderChapterRow).join('')
      : `<p class="no-chapters">${allChaps.length === 0 ? 'No chapters yet.' : 'No chapters match the current filters.'}</p>`;

    return `
      <div class="subject-card" data-subject-id="${subject.id}">

        <div class="subject-header">
          <button class="subject-toggle" aria-expanded="true" title="Collapse">
            <span class="subject-chevron">▾</span>
          </button>
          <div class="subject-info">
            <h2 class="subject-name">${esc(subject.name)}</h2>
            <span class="subject-meta">${done}/${total} done · ${avgPct}% avg</span>
          </div>
          <button class="btn-icon btn-delete-subject" data-id="${subject.id}" title="Delete subject">✕</button>
        </div>

        <div class="subject-body">

          <div class="subject-filters">
            <button class="filter-btn ${fs.incompleteOnly ? 'active' : ''}"
                    data-filter="incompleteOnly" data-subject="${subject.id}">
              Incomplete only
            </button>
            <button class="filter-btn ${fs.lowRetentionOnly ? 'active' : ''}"
                    data-filter="lowRetentionOnly" data-subject="${subject.id}">
              Low retention
            </button>
            <select class="sort-select" data-subject="${subject.id}" aria-label="Sort chapters">
              <option value=""          ${!fs.sort            ? 'selected' : ''}>Sort by…</option>
              <option value="pct-asc"  ${fs.sort === 'pct-asc'  ? 'selected' : ''}>% Complete ↑</option>
              <option value="pct-desc" ${fs.sort === 'pct-desc' ? 'selected' : ''}>% Complete ↓</option>
              <option value="ret-asc"  ${fs.sort === 'ret-asc'  ? 'selected' : ''}>Retention ↑</option>
            </select>
          </div>

          <div class="chapters-list">${chapsHtml}</div>

          <button class="btn-add-chapter" data-subject="${subject.id}">+ Add chapter</button>

        </div>
      </div>
    `;
  }

  // ── Full render ────────────────────────────────────────────────────────────
  function render() {
    const container = document.getElementById('syllabus-subjects');
    if (!container) return;

    if (subjects.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg class="empty-state-svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
          <p class="empty-state-title">No subjects yet</p>
          <p class="empty-state-desc">Add a subject above to start tracking your syllabus.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = subjects.map(renderSubjectCard).join('');
    wireSubjectEvents(container);
  }

  // ── Re-render a single subject card (avoids full re-render) ───────────────
  function rerenderSubject(subjectId) {
    const existing = document.querySelector(`.subject-card[data-subject-id="${subjectId}"]`);
    const subject  = subjects.find((s) => s.id === subjectId);
    if (!existing || !subject) { render(); return; }

    const next = document.createElement('div');
    next.innerHTML = renderSubjectCard(subject);
    const newCard = next.firstElementChild;
    existing.replaceWith(newCard);
    wireSubjectEvents(newCard);
  }

  // ── Event wiring ───────────────────────────────────────────────────────────
  function wireSubjectEvents(root) {
    // Collapse/expand
    root.querySelectorAll('.subject-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const card    = btn.closest('.subject-card');
        const body    = card.querySelector('.subject-body');
        const chevron = btn.querySelector('.subject-chevron');
        const open    = body.style.display !== 'none';
        body.style.display = open ? 'none' : '';
        chevron.textContent = open ? '▸' : '▾';
        btn.setAttribute('aria-expanded', String(!open));
      });
    });

    // Delete subject
    root.querySelectorAll('.btn-delete-subject').forEach((btn) => {
      btn.addEventListener('click', () => deleteSubject(Number(btn.dataset.id)));
    });

    // Filter toggles
    root.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sid = Number(btn.dataset.subject);
        const key = btn.dataset.filter;
        filterState[sid] = filterState[sid] ?? {};
        filterState[sid][key] = !filterState[sid][key];
        rerenderSubject(sid);
      });
    });

    // Sort select
    root.querySelectorAll('.sort-select').forEach((sel) => {
      sel.addEventListener('change', () => {
        const sid = Number(sel.dataset.subject);
        filterState[sid] = filterState[sid] ?? {};
        filterState[sid].sort = sel.value;
        rerenderSubject(sid);
      });
    });

    // Add chapter
    root.querySelectorAll('.btn-add-chapter').forEach((btn) => {
      btn.addEventListener('click', () => addChapter(Number(btn.dataset.subject)));
    });

    // Chapter checkboxes
    root.querySelectorAll('.chapter-check').forEach((input) => {
      input.addEventListener('change', async () => {
        const ch = getChapter(Number(input.dataset.chapter));
        if (!ch) return;
        ch.complete = input.checked;
        await db.chapters.update(ch);
        // Toggle visual without full re-render
        const row = input.closest('.chapter-row');
        row.classList.toggle('complete', ch.complete);
        const nameEl = row.querySelector('.chapter-name-text');
        nameEl && (nameEl.style.textDecoration = ch.complete ? 'line-through' : '');
        updateSubjectMeta(ch.subjectId);
      });
    });

    // Sliders
    root.querySelectorAll('.chapter-slider').forEach((slider) => {
      const valEl = slider.parentElement.querySelector('.slider-value');
      slider.addEventListener('input', () => {
        if (valEl) valEl.textContent = slider.value + '%';
      });
      slider.addEventListener('change', async () => {
        const ch = getChapter(Number(slider.dataset.chapter));
        if (!ch) return;
        ch.percentComplete = Number(slider.value);
        await db.chapters.update(ch);
        updateSubjectMeta(ch.subjectId);
      });
    });

    // Retention buttons
    root.querySelectorAll('.retention-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ch = getChapter(Number(btn.dataset.chapter));
        if (!ch) return;
        ch.retention = btn.dataset.level;
        await db.chapters.update(ch);
        // Update button group visually
        btn.closest('.retention-group').querySelectorAll('.retention-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.level === ch.retention);
        });
        // Update left-border color class on row
        const row = btn.closest('.chapter-row');
        row.classList.remove('ret-low', 'ret-medium', 'ret-high');
        row.classList.add(retentionBorderClass(ch.retention));
      });
    });

    // Counter buttons
    root.querySelectorAll('.counter-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ch = getChapter(Number(btn.dataset.chapter));
        if (!ch) return;
        const field = btn.dataset.field;
        const delta = Number(btn.dataset.delta);
        ch[field] = Math.max(0, (ch[field] ?? 0) + delta);
        await db.chapters.update(ch);
        // Update display
        const val = btn.parentElement.querySelector('.counter-val');
        if (val) val.textContent = ch[field];
      });
    });

    // Chapter name (contenteditable)
    root.querySelectorAll('[data-field="chapterName"]').forEach((el) => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      });
      el.addEventListener('blur', async () => {
        const ch = getChapter(Number(el.dataset.chapter));
        if (!ch) return;
        const newName = el.textContent.trim();
        if (newName === ch.chapterName) return;
        ch.chapterName = newName;
        await db.chapters.update(ch);
      });
    });

    // Remarks
    root.querySelectorAll('.remarks-input').forEach((input) => {
      input.addEventListener('blur', async () => {
        const ch = getChapter(Number(input.dataset.chapter));
        if (!ch) return;
        ch.remarks = input.value;
        await db.chapters.update(ch);
      });
    });

    // Delete chapter
    root.querySelectorAll('.btn-delete-chapter').forEach((btn) => {
      btn.addEventListener('click', () => deleteChapter(Number(btn.dataset.id)));
    });
  }

  // ── Update subject meta line without full re-render ────────────────────────
  function updateSubjectMeta(subjectId) {
    const card = document.querySelector(`.subject-card[data-subject-id="${subjectId}"]`);
    if (!card) return;
    const allChaps = chapters.filter((c) => c.subjectId === subjectId);
    const done  = allChaps.filter((c) => c.complete).length;
    const total = allChaps.length;
    const avg   = total > 0
      ? Math.round(allChaps.reduce((s, c) => s + (c.percentComplete ?? 0), 0) / total)
      : 0;
    const meta = card.querySelector('.subject-meta');
    if (meta) meta.textContent = `${done}/${total} done · ${avg}% avg`;
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────
  async function addSubject() {
    const input = document.getElementById('new-subject-input');
    const name  = (input?.value ?? '').trim();
    if (!name) { input?.focus(); return; }

    const id = await db.subjects.add(name);
    subjects.push({ id, name, createdAt: Date.now() });
    input.value = '';
    render();
  }

  async function deleteSubject(id) {
    if (!confirm('Delete this subject and all its chapters?')) return;
    // Remove all chapters for this subject first
    const toDelete = chapters.filter((c) => c.subjectId === id);
    await Promise.all(toDelete.map((c) => db.chapters.delete(c.id)));
    chapters  = chapters.filter((c) => c.subjectId !== id);
    await db.subjects.delete(id);
    subjects  = subjects.filter((s) => s.id !== id);
    render();
  }

  async function addChapter(subjectId) {
    const data = {
      subjectId,
      chapterName:      'New Chapter',
      complete:         false,
      percentComplete:  0,
      retention:        'Low',
      revisionsDone:    0,
      revisionsNeeded:  0,
      remarks:          ''
    };
    const id = await db.chapters.add(data);
    data.id  = id;
    chapters.push(data);
    rerenderSubject(subjectId);
  }

  async function deleteChapter(id) {
    const ch = getChapter(id);
    if (!ch) return;
    await db.chapters.delete(id);
    chapters = chapters.filter((c) => c.id !== id);
    rerenderSubject(ch.subjectId);
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  async function init() {
    [subjects, chapters] = await Promise.all([
      db.subjects.getAll(),
      db.chapters.getAll()
    ]);

    render();

    // Add subject form
    const addBtn   = document.getElementById('add-subject-btn');
    const addInput = document.getElementById('new-subject-input');

    addBtn?.addEventListener('click', addSubject);
    addInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addSubject();
    });
  }

  return { init };
})();
