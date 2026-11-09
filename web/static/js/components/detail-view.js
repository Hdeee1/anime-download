// Detail View Component

import { API } from '../api.js';
import { state } from '../state.js';
import { escapeHtml, formatBytes } from '../utils.js';
import { showToast } from '../services/toast.js';
import { AnimeThumbnailService } from '../services/thumbnail.js';

let catalogViewEl;
let detailViewEl;
let breadcrumbBarEl;
let breadcrumbTitleEl;
let detailAnimeTitleEl;
let heroBadgesEl;
let seasonTabsEl;
let selectAllCheckboxEl;
let selectedCountTextEl;
let btnDownloadSelectedEl;
let btnDownloadAllSeasonEl;
let episodesContainerEl;
let detailHeroPosterEl;

let onDownloadsEnqueuedCb = null;
let onJobCanceledCb = null;

/**
 * Initialize detail view component & attach event listeners
 * @param {object} options
 * @param {function(object): void} [options.onDownloadsEnqueued] - Called when batch download is enqueued
 * @param {function(string): void} [options.onJobCanceled] - Called when a job is canceled
 */
export function initDetailView({ onDownloadsEnqueued, onJobCanceled } = {}) {
  catalogViewEl = document.getElementById('catalogView');
  detailViewEl = document.getElementById('detailView');
  breadcrumbBarEl = document.getElementById('breadcrumbBar');
  breadcrumbTitleEl = document.getElementById('breadcrumbTitle');
  detailAnimeTitleEl = document.getElementById('detailAnimeTitle');
  heroBadgesEl = document.getElementById('heroBadges');
  seasonTabsEl = document.getElementById('seasonTabs');
  selectAllCheckboxEl = document.getElementById('selectAllCheckbox');
  selectedCountTextEl = document.getElementById('selectedCountText');
  btnDownloadSelectedEl = document.getElementById('btnDownloadSelected');
  btnDownloadAllSeasonEl = document.getElementById('btnDownloadAllSeason');
  episodesContainerEl = document.getElementById('episodesContainer');
  detailHeroPosterEl = document.getElementById('detailHeroPoster');

  onDownloadsEnqueuedCb = onDownloadsEnqueued;
  onJobCanceledCb = onJobCanceled;

  if (selectAllCheckboxEl) {
    selectAllCheckboxEl.addEventListener('change', (e) => {
      const seasonData = state.currentAnime?.seasons?.find(
        (s) => s.season === state.currentSeasonNumber
      );
      if (!seasonData) return;

      if (e.target.checked) {
        seasonData.episodes.forEach((ep) => {
          if (!ep.isDownloaded && !isEpisodeBusy(ep.number, seasonData.season)) {
            state.selectedEpisodeNumbers.add(ep.number);
          }
        });
      } else {
        state.selectedEpisodeNumbers.clear();
      }

      document.querySelectorAll('.ep-checkbox').forEach((cb) => {
        if (!cb.disabled) {
          cb.checked = e.target.checked;
        }
      });

      updateSelectedCount();
    });
  }

  if (btnDownloadSelectedEl) {
    btnDownloadSelectedEl.addEventListener('click', () => {
      const eps = Array.from(state.selectedEpisodeNumbers).sort((a, b) => a - b);
      triggerBatchDownload(eps);
    });
  }

  if (btnDownloadAllSeasonEl) {
    btnDownloadAllSeasonEl.addEventListener('click', () => {
      const seasonData = state.currentAnime?.seasons?.find(
        (s) => s.season === state.currentSeasonNumber
      );
      if (!seasonData) return;

      const epsToDownload = seasonData.episodes
        .filter((e) => !e.isDownloaded && !isEpisodeBusy(e.number, seasonData.season))
        .map((e) => e.number);

      if (epsToDownload.length === 0) {
        showToast('Semua episode dalam season ini sudah terunduh atau sedang aktif di antrean!', 'info');
        return;
      }

      triggerBatchDownload(epsToDownload);
    });
  }
}

/**
 * Open detail view for specified anime
 * @param {string} animeId
 * @param {boolean} [preserveSeason=false]
 */
export async function openAnimeDetail(animeId, preserveSeason = false) {
  try {
    const detail = await API.getAnimeDetail(animeId);
    state.currentAnime = detail;

    if (catalogViewEl) catalogViewEl.classList.remove('active');
    if (detailViewEl) detailViewEl.classList.add('active');
    if (breadcrumbBarEl) breadcrumbBarEl.style.display = 'flex';
    if (breadcrumbTitleEl) breadcrumbTitleEl.textContent = detail.title;
    if (detailAnimeTitleEl) detailAnimeTitleEl.textContent = detail.title;

    if (detailHeroPosterEl) {
      AnimeThumbnailService.bindImage(detailHeroPosterEl, detail.title);
    }

    let totalEps = 0;
    let totalDownloaded = 0;
    detail.seasons.forEach((s) => {
      totalEps += s.totalEpisodes;
      totalDownloaded += s.downloadedCount;
    });

    if (heroBadgesEl) {
      heroBadgesEl.innerHTML = `
        <span class="badge badge-slate">${detail.seasons.length} Seasons</span>
        <span class="badge badge-slate">${totalEps} Total Episode</span>
        <span class="badge ${totalDownloaded === totalEps && totalEps > 0 ? 'badge-emerald' : 'badge-amber'}">
          ${totalDownloaded} / ${totalEps} Terunduh di Komputer
        </span>
      `;
    }

    renderSeasonTabs();

    let targetSeason = detail.seasons[0]?.season || 1;
    if (
      preserveSeason &&
      state.currentSeasonNumber &&
      detail.seasons.some((s) => s.season === state.currentSeasonNumber)
    ) {
      targetSeason = state.currentSeasonNumber;
    } else {
      const firstWithEps = detail.seasons.find((s) => s.totalEpisodes > 0);
      if (firstWithEps) targetSeason = firstWithEps.season;
      state.selectedEpisodeNumbers.clear();
    }

    selectSeason(targetSeason, preserveSeason);
  } catch (err) {
    showToast('Gagal memuat detail anime: ' + err.message, 'error');
  }
}

/**
 * Refresh current detail view (e.g. after SSE download completion)
 * @param {boolean} [preserveSeason=true]
 */
export async function refreshDetailView(preserveSeason = true) {
  if (state.currentAnime && state.currentAnime.id) {
    await openAnimeDetail(state.currentAnime.id, preserveSeason);
  }
}

/**
 * Render season buttons / tabs
 */
export function renderSeasonTabs() {
  if (!seasonTabsEl || !state.currentAnime) return;
  seasonTabsEl.innerHTML = '';
  state.currentAnime.seasons.forEach((s) => {
    const tab = document.createElement('button');
    tab.className = `season-tab ${s.season === state.currentSeasonNumber ? 'active' : ''}`;
    tab.dataset.season = s.season;
    tab.innerHTML = `
      <span>${escapeHtml(s.title)}</span>
      <span class="badge ${s.totalEpisodes > 0 ? 'badge-gray' : 'badge-amber'}" style="font-size: 0.7rem;">
        ${s.totalEpisodes > 0 ? `${s.downloadedCount}/${s.totalEpisodes}` : 'Coming Soon'}
      </span>
    `;
    tab.addEventListener('click', () => selectSeason(s.season, false));
    seasonTabsEl.appendChild(tab);
  });
}

/**
 * Select a season number and render its episodes
 * @param {number} seasonNumber
 * @param {boolean} [preserveSelection=false]
 */
export function selectSeason(seasonNumber, preserveSelection = false) {
  state.currentSeasonNumber = seasonNumber;
  if (!preserveSelection) {
    state.selectedEpisodeNumbers.clear();
  }
  updateSelectedCount();

  document.querySelectorAll('.season-tab').forEach((tab) => {
    tab.classList.toggle('active', parseInt(tab.dataset.season) === seasonNumber);
  });

  const seasonData = state.currentAnime?.seasons?.find((s) => s.season === seasonNumber);
  renderSeasonEpisodes(seasonData);
}

/**
 * Render episode list items for a season
 * @param {object} seasonData
 */
export function renderSeasonEpisodes(seasonData) {
  if (!episodesContainerEl) return;
  if (!seasonData || seasonData.episodes.length === 0) {
    if (btnDownloadSelectedEl) btnDownloadSelectedEl.disabled = true;
    if (btnDownloadAllSeasonEl) btnDownloadAllSeasonEl.disabled = true;
    if (selectAllCheckboxEl) selectAllCheckboxEl.disabled = true;
    episodesContainerEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
            <line x1="7" y1="2" x2="7" y2="22"></line>
            <line x1="17" y1="2" x2="17" y2="22"></line>
            <line x1="2" y1="12" x2="22" y2="12"></line>
          </svg>
        </div>
        <div class="empty-state-title">Belum Ada Episode Dirilis</div>
        <div class="empty-state-desc">Season ini masih berstatus kosong atau belum memiliki link download aktif.</div>
      </div>
    `;
    return;
  }

  if (selectAllCheckboxEl) selectAllCheckboxEl.disabled = false;
  if (btnDownloadAllSeasonEl) btnDownloadAllSeasonEl.disabled = false;

  const list = document.createElement('div');
  list.className = 'episodes-list';

  seasonData.episodes.forEach((ep) => {
    const item = document.createElement('div');
    item.className = `episode-item ${ep.isDownloaded ? 'downloaded' : ''}`;
    item.id = `episode-row-${ep.number}`;

    let activeJob = null;
    for (const [_, job] of state.activeJobs) {
      if (
        job.animeId === state.currentAnime.id &&
        job.season === seasonData.season &&
        job.episode === ep.number
      ) {
        activeJob = job;
        break;
      }
    }

    const isJobActive =
      activeJob && (activeJob.status === 'DOWNLOADING' || activeJob.status === 'QUEUED');
    const isCheckboxDisabled = ep.isDownloaded || isJobActive;

    let statusBadge = '';
    let actionButton = '';

    if (ep.isDownloaded) {
      statusBadge = `<span class="badge badge-emerald">Downloaded (${formatBytes(ep.fileSize)})</span>`;
      actionButton = `
        <button class="btn btn-secondary btn-sm" disabled style="opacity: 0.6;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Tersedia</span>
        </button>
      `;
    } else if (activeJob && activeJob.status === 'DOWNLOADING') {
      item.classList.add('downloading');
      statusBadge = `<span class="badge badge-amber" id="ep-badge-${ep.number}">Downloading (${activeJob.progress.toFixed(0)}%)</span>`;
      actionButton = `
        <button class="btn btn-danger btn-sm btn-cancel-job" data-jobid="${escapeHtml(activeJob.jobId)}">
          <span>Batal</span>
        </button>
      `;
    } else if (activeJob && activeJob.status === 'QUEUED') {
      statusBadge = `<span class="badge badge-purple" id="ep-badge-${ep.number}">Queued</span>`;
      actionButton = `
        <button class="btn btn-danger btn-sm btn-cancel-job" data-jobid="${escapeHtml(activeJob.jobId)}">
          <span>Batal</span>
        </button>
      `;
    } else {
      statusBadge = `<span class="badge badge-gray" id="ep-badge-${ep.number}">Belum Terunduh</span>`;
      actionButton = `
        <button class="btn btn-primary btn-sm btn-download-single" data-ep="${ep.number}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Unduh</span>
        </button>
      `;
    }

    item.innerHTML = `
      <div class="ep-left">
        <label class="custom-checkbox">
          <input type="checkbox" class="ep-checkbox" data-ep="${ep.number}" ${isCheckboxDisabled ? 'disabled' : ''} ${state.selectedEpisodeNumbers.has(ep.number) ? 'checked' : ''}>
          <span class="checkmark"></span>
        </label>
        <div class="ep-number">EP ${String(ep.number).padStart(2, '0')}</div>
        <div class="ep-info">
          <div class="ep-filename">${escapeHtml(ep.filename)}</div>
          <div class="ep-details">
            <span class="badge badge-gray">1080p Full HD</span>
            <span id="ep-speed-${ep.number}" style="display: ${activeJob && activeJob.status === 'DOWNLOADING' ? 'inline' : 'none'}; font-family: var(--font-mono); color: var(--accent-cyan);">${escapeHtml(activeJob ? activeJob.speed : '')}</span>
          </div>
        </div>
      </div>
      <div class="ep-right">
        <div id="ep-status-container-${ep.number}">
          ${statusBadge}
        </div>
        <div id="ep-action-container-${ep.number}">
          ${actionButton}
        </div>
      </div>
    `;

    list.appendChild(item);
  });

  episodesContainerEl.innerHTML = '';
  episodesContainerEl.appendChild(list);

  attachEpisodeListEvents(seasonData);
}

function attachEpisodeListEvents(seasonData) {
  document.querySelectorAll('.ep-checkbox').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const epNum = parseInt(e.target.dataset.ep);
      if (e.target.checked) {
        state.selectedEpisodeNumbers.add(epNum);
      } else {
        state.selectedEpisodeNumbers.delete(epNum);
      }
      updateSelectedCount();
    });
  });

  document.querySelectorAll('.btn-download-single').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const epNum = parseInt(btn.dataset.ep);
      await triggerBatchDownload([epNum]);
    });
  });

  document.querySelectorAll('.btn-cancel-job').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const jobId = btn.dataset.jobid;
      await cancelJob(jobId);
    });
  });
}

export function isEpisodeBusy(epNum, seasonNum) {
  for (const [_, job] of state.activeJobs) {
    if (
      job.animeId === state.currentAnime?.id &&
      job.season === seasonNum &&
      job.episode === epNum
    ) {
      if (job.status === 'DOWNLOADING' || job.status === 'QUEUED') return true;
    }
  }
  return false;
}

export function updateSelectedCount() {
  if (!selectedCountTextEl || !btnDownloadSelectedEl) return;
  const count = state.selectedEpisodeNumbers.size;
  selectedCountTextEl.textContent = `${count} terpilih`;
  btnDownloadSelectedEl.disabled = count === 0;

  const seasonData = state.currentAnime?.seasons?.find(
    (s) => s.season === state.currentSeasonNumber
  );
  if (!seasonData) return;

  const selectableCount = seasonData.episodes.filter(
    (e) => !e.isDownloaded && !isEpisodeBusy(e.number, seasonData.season)
  ).length;

  if (selectAllCheckboxEl) {
    selectAllCheckboxEl.checked = selectableCount > 0 && count === selectableCount;
  }
}

export async function triggerBatchDownload(episodeNumbers) {
  if (!state.currentAnime || !state.currentSeasonNumber || episodeNumbers.length === 0) return;

  try {
    showToast(`Mendaftarkan ${episodeNumbers.length} episode ke antrean...`, 'info');
    const res = await API.enqueueDownloads(
      state.currentAnime.id,
      state.currentSeasonNumber,
      episodeNumbers
    );

    if (res.enqueuedCount === 0) {
      showToast('Semua episode terpilih sudah berada di antrean atau sudah selesai diunduh.', 'info');
    } else {
      showToast(`Berhasil mendaftarkan ${res.enqueuedCount} episode!`, 'success');
    }

    if (res.jobs && Array.isArray(res.jobs)) {
      res.jobs.forEach((j) => {
        state.activeJobs.set(j.jobId, j);
      });
    }

    state.selectedEpisodeNumbers.clear();
    updateSelectedCount();

    if (state.currentAnime) {
      const seasonData = state.currentAnime.seasons.find(
        (s) => s.season === state.currentSeasonNumber
      );
      renderSeasonEpisodes(seasonData);
    }

    if (onDownloadsEnqueuedCb) {
      onDownloadsEnqueuedCb(res);
    }
  } catch (err) {
    showToast('Gagal memulai unduhan: ' + err.message, 'error');
  }
}

export async function cancelJob(jobId) {
  try {
    await API.cancelDownload(jobId);
    showToast('Unduhan dibatalkan.', 'info');
    state.activeJobs.delete(jobId);

    if (state.currentAnime) {
      const seasonData = state.currentAnime.seasons.find(
        (s) => s.season === state.currentSeasonNumber
      );
      renderSeasonEpisodes(seasonData);
    }

    if (onJobCanceledCb) {
      onJobCanceledCb(jobId);
    }
  } catch (err) {
    showToast('Gagal membatalkan unduhan: ' + err.message, 'error');
  }
}

/**
 * Live update of single episode row during SSE progress events
 * @param {object} data
 */
export function updateEpisodeProgress(data) {
  if (
    state.currentAnime &&
    state.currentAnime.id === data.animeId &&
    state.currentSeasonNumber === data.season
  ) {
    const epRow = document.getElementById(`episode-row-${data.episode}`);
    if (epRow) epRow.classList.add('downloading');

    const epBadge = document.getElementById(`ep-badge-${data.episode}`);
    if (epBadge) {
      epBadge.className = 'badge badge-amber';
      epBadge.textContent = `Downloading (${data.progress.toFixed(0)}%)`;
    }

    const epSpeed = document.getElementById(`ep-speed-${data.episode}`);
    if (epSpeed) {
      epSpeed.style.display = 'inline';
      epSpeed.textContent = data.speed;
    }
  }
}
