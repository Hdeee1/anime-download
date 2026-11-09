// Download Tray & Manager Component

import { API } from '../api.js';
import { state } from '../state.js';
import { escapeHtml, formatBytes } from '../utils.js';

let downloadTrayEl;
let trayHeaderEl;
let trayJobCountEl;
let emptyTrayMessageEl;
let trayJobsListEl;
let workerStatsEl;
let onCancelJobCb = null;

/**
 * Initialize download tray drawer & delegation listeners
 * @param {object} options
 * @param {function(string): Promise<void>} options.onCancelJob - Callback when cancel button is clicked
 */
export function initDownloadTray({ onCancelJob } = {}) {
  downloadTrayEl = document.getElementById('downloadTray');
  trayHeaderEl = document.getElementById('trayHeader');
  trayJobCountEl = document.getElementById('trayJobCount');
  emptyTrayMessageEl = document.getElementById('emptyTrayMessage');
  trayJobsListEl = document.getElementById('trayJobsList');
  workerStatsEl = document.getElementById('workerStats');
  onCancelJobCb = onCancelJob;

  if (trayHeaderEl) {
    trayHeaderEl.addEventListener('click', () => {
      state.trayCollapsed = !state.trayCollapsed;
      if (downloadTrayEl) {
        downloadTrayEl.classList.toggle('collapsed', state.trayCollapsed);
      }
    });
  }

  // Set initial tray state (collapsed)
  if (downloadTrayEl) {
    downloadTrayEl.classList.add('collapsed');
  }

  // Event Delegation for Tray Cancel buttons
  if (trayJobsListEl) {
    trayJobsListEl.addEventListener('click', async (e) => {
      const cancelBtn = e.target.closest('.btn-tray-cancel');
      if (cancelBtn && onCancelJobCb) {
        const jobId = cancelBtn.dataset.jobid;
        await onCancelJobCb(jobId);
      }
    });
  }
}

/**
 * Expand drawer tray to show active progress
 */
export function expandTray() {
  state.trayCollapsed = false;
  if (downloadTrayEl) {
    downloadTrayEl.classList.remove('collapsed');
  }
}

/**
 * Update top-right worker status badge in navbar
 * @param {number} active
 * @param {number} max
 */
export function updateWorkerDisplay(active, max) {
  if (!workerStatsEl) return;
  if (active > 0) {
    workerStatsEl.textContent = `${active} / ${max} Aktif`;
    workerStatsEl.parentElement.parentElement.style.borderColor = 'rgba(245, 158, 11, 0.4)';
  } else {
    workerStatsEl.textContent = `${max} / ${max} Idle`;
    workerStatsEl.parentElement.parentElement.style.borderColor = 'rgba(16, 185, 129, 0.2)';
  }
}

/**
 * Recalculate and refresh worker status indicator
 */
export function refreshWorkerStatus() {
  let activeCount = 0;
  state.activeJobs.forEach((j) => {
    if (j.status === 'DOWNLOADING') activeCount++;
  });
  updateWorkerDisplay(activeCount, 2);
}

/**
 * Re-render list of active and queued download jobs in the tray
 */
export function renderTray() {
  if (!trayJobsListEl || !trayJobCountEl || !emptyTrayMessageEl) return;
  const jobs = Array.from(state.activeJobs.values());
  trayJobCountEl.textContent = jobs.length;

  refreshWorkerStatus();

  if (jobs.length === 0) {
    emptyTrayMessageEl.style.display = 'block';
    trayJobsListEl.innerHTML = '';
    return;
  }

  emptyTrayMessageEl.style.display = 'none';
  trayJobsListEl.innerHTML = '';

  jobs.forEach((job) => {
    const card = document.createElement('div');
    card.className = 'tray-job-card';
    card.id = `tray-job-${job.jobId}`;

    const isDownloading = job.status === 'DOWNLOADING';
    const isQueued = job.status === 'QUEUED';
    const statusBadgeClass = isDownloading
      ? 'badge-amber'
      : isQueued
      ? 'badge-purple'
      : job.status === 'COMPLETED'
      ? 'badge-emerald'
      : 'badge-rose';

    const showCancelBtn = isDownloading || isQueued;

    card.innerHTML = `
      <div class="job-card-header">
        <div class="job-card-title" title="${escapeHtml(job.filename)}">
          <strong>${escapeHtml(job.animeTitle)}</strong> - S${String(job.season).padStart(2, '0')}E${String(job.episode).padStart(2, '0')}
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="badge ${statusBadgeClass}" id="tray-badge-${job.jobId}">${job.status}</span>
          ${
            showCancelBtn
              ? `<button class="btn btn-danger btn-sm btn-tray-cancel" style="padding: 2px 8px; font-size: 0.72rem;" data-jobid="${escapeHtml(job.jobId)}">Batal</button>`
              : ''
          }
        </div>
      </div>
      <div class="job-card-meta">
        <span id="tray-bytes-${job.jobId}">${formatBytes(job.downloadedBytes)} / ${formatBytes(job.totalBytes)}</span>
        <span id="tray-speed-${job.jobId}" style="color: var(--accent-cyan); font-weight: 600;">${escapeHtml(job.speed || '0 KB/s')}</span>
        <span id="tray-percent-${job.jobId}">${job.progress.toFixed(1)}%</span>
      </div>
      <div class="job-progress-bar">
        <div class="job-progress-fill" id="tray-bar-${job.jobId}" style="width: ${job.progress}%;"></div>
      </div>
    `;

    trayJobsListEl.appendChild(card);
  });
}

/**
 * Live update of single tray job card during SSE progress events
 * @param {object} data
 */
export function updateJobProgress(data) {
  const bar = document.getElementById(`tray-bar-${data.jobId}`);
  const percent = document.getElementById(`tray-percent-${data.jobId}`);
  const bytes = document.getElementById(`tray-bytes-${data.jobId}`);
  const speed = document.getElementById(`tray-speed-${data.jobId}`);
  if (bar) bar.style.width = `${data.progress}%`;
  if (percent) percent.textContent = `${data.progress.toFixed(1)}%`;
  if (bytes) bytes.textContent = `${formatBytes(data.downloadedBytes)} / ${formatBytes(data.totalBytes)}`;
  if (speed) speed.textContent = data.speed;
}

/**
 * Load initial downloads from backend
 */
export async function loadExistingDownloads() {
  try {
    const data = await API.getDownloads();
    updateWorkerDisplay(data.activeWorkers, data.maxWorkers);
    if (data.jobs && Array.isArray(data.jobs)) {
      state.activeJobs.clear();
      data.jobs.forEach((job) => {
        if (job.status === 'QUEUED' || job.status === 'DOWNLOADING') {
          state.activeJobs.set(job.jobId, job);
        }
      });
      renderTray();
    }
  } catch (err) {
    console.warn('Failed to load initial downloads:', err);
  }
}
