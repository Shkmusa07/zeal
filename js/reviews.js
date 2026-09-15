'use strict';

/**
 * reviews.js — Feature C: Spaced-Repetition Study Reminder
 *
 * Data model per chapter entry:
 * {
 *   id: number,
 *   subject: string,
 *   chapterName: string,
 *   dateStudied: string (YYYY-MM-DD),
 *   milestones: [
 *     { day: 1, dueDate: string, status: "pending"|"done"|"overdue", reviewedAt: number|null, reviewNote: string },
 *     { day: 3, dueDate: string, status: "pending"|"done"|"overdue", reviewedAt: number|null, reviewNote: string },
 *     { day: 7, dueDate: string, status: "pending"|"done"|"overdue", reviewedAt: number|null, reviewNote: string },
 *     { day: 14, dueDate: string, status: "pending"|"done"|"overdue", reviewedAt: number|null, reviewNote: string }
 *   ],
 *   notes: string
 * }
 */

const reviewsModule = (() => {
  let reviewsList = [];
  let currentFilter = 'all'; // 'all' | 'due'

  // Helper: Get YYYY-MM-DD string from Date object or timestamp
  function toDateStr(dateObj) {
    const d = new Date(dateObj);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Helper: Add N days to a YYYY-MM-DD string
  function addDays(dateStr, days) {
    const parts = dateStr.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    d.setDate(d.getDate() + days);
    return toDateStr(d);
  }

  // Helper: Get today's YYYY-MM-DD string
  function getTodayStr() {
    return toDateStr(new Date());
  }

  // Recalculate milestone statuses based on current date
  function evaluateMilestones(review) {
    const today = getTodayStr();
    let updated = false;

    review.milestones.forEach((m) => {
      if (m.status !== 'done') {
        const newStatus = m.dueDate < today ? 'overdue' : 'pending';
        if (m.status !== newStatus) {
          m.status = newStatus;
          updated = true;
        }
      }
    });

    return updated;
  }

  // Initialise module
  async function init() {
    try {
      reviewsList = await db.reviews.getAll();
      
      // Update any overdue statuses on boot
      reviewsList.forEach((rev) => {
        if (evaluateMilestones(rev)) {
          db.reviews.update(rev);
        }
      });

      // Set default date input to today
      const dateInput = document.getElementById('review-date-input');
      if (dateInput && !dateInput.value) {
        dateInput.value = getTodayStr();
      }

      // Populate subject select dropdown if syllabus subjects exist
      await populateSubjectOptions();

      // Attach event listeners
      bindEvents();

      // Render
      render();
    } catch (err) {
      console.error('[Reviews] Init failed:', err);
    }
  }

  async function populateSubjectOptions() {
    const datalistEl = document.getElementById('review-subjects-list');
    if (!datalistEl) return;

    try {
      const subjects = await db.subjects.getAll();
      datalistEl.innerHTML = '';
      subjects.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.name;
        datalistEl.appendChild(opt);
      });
    } catch (err) {
      console.warn('[Reviews] Could not load subjects for autocompletion:', err);
    }
  }

  function bindEvents() {
    // Form submit
    const form = document.getElementById('add-review-form');
    if (form && !form.dataset.bound) {
      form.dataset.bound = 'true';
      form.addEventListener('submit', handleAddReview);
    }

    // Filter toggles
    const filterAllBtn = document.getElementById('review-filter-all');
    const filterDueBtn = document.getElementById('review-filter-due');

    if (filterAllBtn && !filterAllBtn.dataset.bound) {
      filterAllBtn.dataset.bound = 'true';
      filterAllBtn.addEventListener('click', () => {
        currentFilter = 'all';
        filterAllBtn.classList.add('active');
        if (filterDueBtn) filterDueBtn.classList.remove('active');
        render();
      });
    }

    if (filterDueBtn && !filterDueBtn.dataset.bound) {
      filterDueBtn.dataset.bound = 'true';
      filterDueBtn.addEventListener('click', () => {
        currentFilter = 'due';
        filterDueBtn.classList.add('active');
        if (filterAllBtn) filterAllBtn.classList.remove('active');
        render();
      });
    }

    // Delegate actions on review list (milestone click, delete entry)
    const listContainer = document.getElementById('reviews-list');
    if (listContainer && !listContainer.dataset.bound) {
      listContainer.dataset.bound = 'true';
      listContainer.addEventListener('click', handleListClick);
    }

    // Modal events for marking milestone reviewed
    const modalSaveBtn = document.getElementById('milestone-modal-save');
    const modalUnmarkBtn = document.getElementById('milestone-modal-unmark');
    const modalCancelBtn = document.getElementById('milestone-modal-cancel');
    const modalOverlay = document.getElementById('milestone-modal');

    if (modalSaveBtn && !modalSaveBtn.dataset.bound) {
      modalSaveBtn.dataset.bound = 'true';
      modalSaveBtn.addEventListener('click', saveMilestoneReview);
    }

    if (modalUnmarkBtn && !modalUnmarkBtn.dataset.bound) {
      modalUnmarkBtn.dataset.bound = 'true';
      modalUnmarkBtn.addEventListener('click', unmarkMilestoneReview);
    }

    if (modalCancelBtn && !modalCancelBtn.dataset.bound) {
      modalCancelBtn.dataset.bound = 'true';
      modalCancelBtn.addEventListener('click', closeMilestoneModal);
    }

    if (modalOverlay && !modalOverlay.dataset.bound) {
      modalOverlay.dataset.bound = 'true';
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeMilestoneModal();
      });
    }
  }

  // Handle adding a new studied chapter entry
  async function handleAddReview(e) {
    e.preventDefault();

    const subjectInput = document.getElementById('review-subject-input');
    const chapterInput = document.getElementById('review-chapter-input');
    const dateInput    = document.getElementById('review-date-input');
    const notesInput   = document.getElementById('review-notes-input');

    const subject     = subjectInput?.value.trim() || 'General';
    const chapterName = chapterInput?.value.trim();
    const dateStudied = dateInput?.value || getTodayStr();
    const notes       = notesInput?.value.trim() || '';

    if (!chapterName) {
      chapterInput?.focus();
      return;
    }

    // Calculate 4 milestone due dates (+1, +3, +7, +14 days)
    const intervals = [1, 3, 7, 14];
    const today = getTodayStr();

    const milestones = intervals.map((day) => {
      const dueDate = addDays(dateStudied, day);
      const status = dueDate < today ? 'overdue' : 'pending';
      return {
        day,
        dueDate,
        status,
        reviewedAt: null,
        reviewNote: ''
      };
    });

    const newReview = {
      subject,
      chapterName,
      dateStudied,
      milestones,
      notes
    };

    try {
      const id = await db.reviews.add(newReview);
      newReview.id = id;
      reviewsList.unshift(newReview);

      // Reset form
      chapterInput.value = '';
      notesInput.value = '';
      dateInput.value = getTodayStr();

      render();
      
      // Update subject list dropdown in case a new subject was entered
      populateSubjectOptions();
    } catch (err) {
      console.error('[Reviews] Failed to add entry:', err);
    }
  }

  // Handle clicks in list (delete entry or milestone pill)
  async function handleListClick(e) {
    const deleteBtn = e.target.closest('.review-delete-btn');
    if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id, 10);
      if (confirm('Delete this study review log?')) {
        await db.reviews.delete(id);
        reviewsList = reviewsList.filter((r) => r.id !== id);
        render();
      }
      return;
    }

    const milestonePill = e.target.closest('.milestone-pill');
    if (milestonePill) {
      const reviewId = parseInt(milestonePill.dataset.reviewId, 10);
      const day = parseInt(milestonePill.dataset.day, 10);

      const review = reviewsList.find((r) => r.id === reviewId);
      if (!review) return;

      const milestone = review.milestones.find((m) => m.day === day);
      if (!milestone) return;

      // Open modal to mark reviewed (or edit review note if already done)
      openMilestoneModal(review, milestone);
    }
  }

  let activeModalState = null;

  function openMilestoneModal(review, milestone) {
    activeModalState = { review, milestone };

    const modal = document.getElementById('milestone-modal');
    const title = document.getElementById('milestone-modal-title');
    const sub   = document.getElementById('milestone-modal-sub');
    const input = document.getElementById('milestone-modal-note');
    const saveBtn = document.getElementById('milestone-modal-save');
    const unmarkBtn = document.getElementById('milestone-modal-unmark');

    if (!modal) return;

    if (title) title.textContent = `${review.subject}: ${review.chapterName}`;
    if (sub) {
      const statusText = milestone.status === 'done' ? 'Completed' : `Due: ${milestone.dueDate}`;
      sub.textContent = `Day ${milestone.day} Review (${statusText})`;
    }
    if (input) {
      input.value = milestone.reviewNote || '';
      setTimeout(() => input.focus(), 50);
    }

    if (saveBtn) {
      saveBtn.textContent = milestone.status === 'done' ? 'Save Note ✓' : 'Mark as Reviewed ✓';
    }

    if (unmarkBtn) {
      unmarkBtn.style.display = milestone.status === 'done' ? 'inline-block' : 'none';
    }

    modal.classList.remove('hidden');
  }

  function closeMilestoneModal() {
    const modal = document.getElementById('milestone-modal');
    if (modal) modal.classList.add('hidden');
    activeModalState = null;
  }

  async function saveMilestoneReview() {
    if (!activeModalState) return;

    const { review, milestone } = activeModalState;
    const noteInput = document.getElementById('milestone-modal-note');
    const reviewNote = noteInput?.value.trim() || '';

    milestone.status = 'done';
    milestone.reviewedAt = Date.now();
    milestone.reviewNote = reviewNote;

    try {
      await db.reviews.update(review);
      closeMilestoneModal();
      render();
    } catch (err) {
      console.error('[Reviews] Failed to save milestone review:', err);
    }
  }

  async function unmarkMilestoneReview() {
    if (!activeModalState) return;

    const { review, milestone } = activeModalState;
    const today = getTodayStr();

    milestone.status = milestone.dueDate < today ? 'overdue' : 'pending';
    milestone.reviewedAt = null;

    try {
      await db.reviews.update(review);
      closeMilestoneModal();
      render();
    } catch (err) {
      console.error('[Reviews] Failed to unmark milestone review:', err);
    }
  }

  // Render review list
  function render() {
    const container = document.getElementById('reviews-list');
    const emptyState = document.getElementById('reviews-empty-state');
    if (!container) return;

    // Refresh statuses relative to today
    reviewsList.forEach(evaluateMilestones);

    const today = getTodayStr();

    // Count how many milestones are due or overdue across all chapters
    let dueCount = 0;
    reviewsList.forEach((r) => {
      r.milestones.forEach((m) => {
        if (m.status === 'overdue' || (m.status === 'pending' && m.dueDate <= today)) {
          dueCount++;
        }
      });
    });

    // Update filter tab labels with counts
    const filterAllBtn = document.getElementById('review-filter-all');
    const filterDueBtn = document.getElementById('review-filter-due');
    if (filterAllBtn) filterAllBtn.textContent = `All Chapters (${reviewsList.length})`;
    if (filterDueBtn) filterDueBtn.textContent = dueCount > 0 ? `Due & Overdue (${dueCount})` : 'Due & Overdue';

    // Apply filter
    let displayList = reviewsList;

    if (currentFilter === 'due') {
      displayList = reviewsList.filter((r) =>
        r.milestones.some((m) => m.status === 'overdue' || (m.status === 'pending' && m.dueDate <= today))
      );
    }

    if (displayList.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // Sort by dateStudied descending
    displayList.sort((a, b) => b.dateStudied.localeCompare(a.dateStudied));

    let html = '';

    displayList.forEach((rev) => {
      html += `
        <div class="review-card" data-id="${rev.id}">
          <div class="review-card-header">
            <div>
              <span class="review-subject-tag">${escapeHtml(rev.subject)}</span>
              <h3 class="review-chapter-title">${escapeHtml(rev.chapterName)}</h3>
              <p class="review-date-meta">Studied: ${rev.dateStudied}</p>
            </div>
            <button class="review-delete-btn icon-btn" data-id="${rev.id}" title="Delete entry" aria-label="Delete entry">
              ✕
            </button>
          </div>

          ${rev.notes ? `<p class="review-notes">${escapeHtml(rev.notes)}</p>` : ''}

          <div class="milestones-timeline-title">Review Schedule:</div>
          <div class="milestones-grid">
      `;

      rev.milestones.forEach((m) => {
        let badgeClass = 'status-pending';
        let statusLabel = 'PENDING';

        if (m.status === 'done') {
          badgeClass = 'status-done';
          statusLabel = 'DONE ✓';
        } else if (m.status === 'overdue') {
          badgeClass = 'status-overdue';
          statusLabel = 'OVERDUE !';
        } else if (m.dueDate === today) {
          badgeClass = 'status-duetoday';
          statusLabel = 'DUE TODAY';
        }

        const titleAttr = m.reviewNote
          ? `Note: ${escapeHtml(m.reviewNote)} (Tap to edit)`
          : m.status === 'done'
            ? 'Reviewed (Tap to view/edit)'
            : `Tap to mark Day ${m.day} reviewed`;

        html += `
          <button 
            class="milestone-pill ${badgeClass}" 
            data-review-id="${rev.id}" 
            data-day="${m.day}"
            title="${titleAttr}"
            aria-label="Day ${m.day} review due ${m.dueDate}, status ${statusLabel}"
          >
            <span class="milestone-pill-day">Day ${m.day}</span>
            <span class="milestone-pill-date">${m.dueDate}</span>
            <span class="milestone-pill-status">${statusLabel}</span>
          </button>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Get due or overdue reminders for notification check per spec
  function getDueReminders() {
    const today = getTodayStr();
    const dueItems = [];

    reviewsList.forEach((rev) => {
      rev.milestones.forEach((m) => {
        if (m.status !== 'done') {
          const isDueToday = m.dueDate === today;
          const isOverdue = m.dueDate < today || m.status === 'overdue';

          if (isDueToday || isOverdue) {
            dueItems.push({
              subject: rev.subject,
              chapterName: rev.chapterName,
              day: m.day,
              dueDate: m.dueDate,
              type: isOverdue ? 'overdue' : 'due',
              // Push notification spec: "Review: [Subject] — [Chapter name] (Day X)"
              title: `Review: ${rev.subject} — ${rev.chapterName} (Day ${m.day})`,
              body: isOverdue
                ? `Day ${m.day} review is overdue (was due ${m.dueDate})`
                : `Day ${m.day} spaced-repetition review is scheduled for today`
            });
          }
        }
      });
    });

    return dueItems;
  }

  return {
    init,
    render,
    getDueReminders,
    getReviewsData: () => reviewsList
  };
})();

window.reviewsModule = reviewsModule;
