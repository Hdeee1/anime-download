// Main Frontend Application Logic
document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    animeList: [],
    currentAnime: null,
    currentSeasonNumber: null,
    selectedEpisodeNumbers: new Set(),
    activeJobs: new Map(), // jobId -> job
    trayCollapsed: true,
  };

  // Helper: Escape HTML to prevent injection and DOM breakage
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // DOM Elements
  const catalogView = document.getElementById('catalogView');
  const detailView = document.getElementById('detailView');
  const breadcrumbBar = document.getElementById('breadcrumbBar');
  const breadcrumbTitle = document.getElementById('breadcrumbTitle');
  const btnBackHome = document.getElementById('btnBackHome');
  const animeGrid = document.getElementById('animeGrid');
  const searchInput = document.getElementById('searchInput');
  const btnReload = document.getElementById('btnReload');
  const workerStats = document.getElementById('workerStats');

  // Detail View Elements
  const detailAnimeTitle = document.getElementById('detailAnimeTitle');
  const heroBadges = document.getElementById('heroBadges');
  const seasonTabs = document.getElementById('seasonTabs');
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const selectedCountText = document.getElementById('selectedCountText');
  const btnDownloadSelected = document.getElementById('btnDownloadSelected');
  const btnDownloadAllSeason = document.getElementById('btnDownloadAllSeason');
  const episodesContainer = document.getElementById('episodesContainer');

  // Download Tray Elements
  const downloadTray = document.getElementById('downloadTray');
  const trayHeader = document.getElementById('trayHeader');
  const trayJobCount = document.getElementById('trayJobCount');
  const emptyTrayMessage = document.getElementById('emptyTrayMessage');
  const trayJobsList = document.getElementById('trayJobsList');
  const toastContainer = document.getElementById('toastContainer');

  // Import Modal Elements
  const btnOpenImportModal = document.getElementById('btnOpenImportModal');
  const importModal = document.getElementById('importModal');
  const btnCloseImportModal = document.getElementById('btnCloseImportModal');
  const btnCancelImport = document.getElementById('btnCancelImport');
  const importForm = document.getElementById('importForm');
  const modeExisting = document.getElementById('modeExisting');
  const modeNew = document.getElementById('modeNew');
  const sectionExistingAnime = document.getElementById('sectionExistingAnime');
  const sectionNewAnime = document.getElementById('sectionNewAnime');
  const selectExistingAnime = document.getElementById('selectExistingAnime');
  const inputNewAnimeTitle = document.getElementById('inputNewAnimeTitle');
  const existingSeasonGroup = document.getElementById('existingSeasonGroup');
  const newSeasonNumGroup = document.getElementById('newSeasonNumGroup');
  const seasonTitleGroup = document.getElementById('seasonTitleGroup');
  const modalSelectSeason = document.getElementById('selectSeason');
  const inputSeasonNumber = document.getElementById('inputSeasonNumber');
  const inputSeasonTitle = document.getElementById('inputSeasonTitle');
  const dynamicEpisodeRows = document.getElementById('dynamicEpisodeRows');
  const btnAddEpisodeRow = document.getElementById('btnAddEpisodeRow');
  const btnSubmitImport = document.getElementById('btnSubmitImport');

  // Helper: Toast Notification
  function showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<div class="toast-content">${escapeHtml(message)}</div>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Helper: Format File Size
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Load Initial Anime Catalog
  async function loadCatalog() {
    try {
      animeGrid.innerHTML = `
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Memuat katalog anime...</p>
        </div>
      `;
      state.animeList = await API.getAnimeList();
      renderCatalog(state.animeList);
    } catch (err) {
      animeGrid.innerHTML = `
        <div class="loading-state">
          <p style="color: var(--accent-rose);">Gagal memuat katalog: ${escapeHtml(err.message)}</p>
        </div>
      `;
      showToast('Gagal memuat katalog: ' + err.message, 'error');
    }
  }

  // Load Existing Downloads from Backend (filtering only active jobs to prevent ghost state)
  async function loadExistingDownloads() {
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

  function updateWorkerDisplay(active, max) {
    if (active > 0) {
      workerStats.textContent = `${active} / ${max} Aktif`;
      workerStats.parentElement.parentElement.style.borderColor = 'rgba(245, 158, 11, 0.4)';
    } else {
      workerStats.textContent = `${max} / ${max} Idle`;
      workerStats.parentElement.parentElement.style.borderColor = 'rgba(16, 185, 129, 0.2)';
    }
  }

  function refreshWorkerStatus() {
    let activeCount = 0;
    state.activeJobs.forEach((j) => {
      if (j.status === 'DOWNLOADING') activeCount++;
    });
    updateWorkerDisplay(activeCount, 2);
  }

  // Render Catalog Grid
  function renderCatalog(list) {
    const query = (searchInput.value || '').trim().toLowerCase();
    const filtered = list.filter((item) =>
      item.title.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      animeGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
          <div class="empty-state-title">Anime Tidak Ditemukan</div>
          <div class="empty-state-desc">Tidak ada anime yang cocok dengan kata kunci "${escapeHtml(query)}".</div>
        </div>
      `;
      return;
    }

    animeGrid.innerHTML = '';
    filtered.forEach((anime) => {
      const card = document.createElement('div');
      card.className = 'anime-card';
      const progressPercent =
        anime.totalEpisodes > 0
          ? Math.round((anime.downloadedEpisodes / anime.totalEpisodes) * 100)
          : 0;

      card.innerHTML = `
        <div>
          <div class="card-header">
            <h2 class="card-title">${escapeHtml(anime.title)}</h2>
          </div>
          <div class="card-meta">
            <span class="badge badge-purple">${anime.totalSeasons} Season</span>
            <span class="badge badge-cyan">${anime.totalEpisodes} Episode Total</span>
            <span class="badge ${progressPercent === 100 && anime.totalEpisodes > 0 ? 'badge-emerald' : 'badge-amber'}">
              ${anime.downloadedEpisodes} / ${anime.totalEpisodes} Terunduh
            </span>
          </div>
        </div>
        <div>
          <div class="card-progress-bar">
            <div class="card-progress-fill" style="width: ${progressPercent}%;"></div>
          </div>
          <div class="card-footer">
            <span>Progress Unduhan</span>
            <span style="font-family: var(--font-mono); font-weight: 600;">${progressPercent}%</span>
          </div>
        </div>
      `;

      card.addEventListener('click', () => openAnimeDetail(anime.id));
      animeGrid.appendChild(card);
    });
  }

  // Open Anime Detail (preserveSeason to prevent resetting user tab/selection on background SSE updates)
  async function openAnimeDetail(animeId, preserveSeason = false) {
    try {
      const detail = await API.getAnimeDetail(animeId);
      state.currentAnime = detail;

      // Switch view
      catalogView.classList.remove('active');
      detailView.classList.add('active');
      breadcrumbBar.style.display = 'flex';
      breadcrumbTitle.textContent = detail.title;
      detailAnimeTitle.textContent = detail.title;

      // Calculate total episodes and downloaded
      let totalEps = 0;
      let totalDownloaded = 0;
      detail.seasons.forEach((s) => {
        totalEps += s.totalEpisodes;
        totalDownloaded += s.downloadedCount;
      });

      heroBadges.innerHTML = `
        <span class="badge badge-purple">${detail.seasons.length} Seasons</span>
        <span class="badge badge-cyan">${totalEps} Total Episode</span>
        <span class="badge ${totalDownloaded === totalEps && totalEps > 0 ? 'badge-emerald' : 'badge-amber'}">
          ${totalDownloaded} / ${totalEps} Terunduh di Komputer
        </span>
      `;

      // Render Season Tabs
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

  function renderSeasonTabs() {
    seasonTabs.innerHTML = '';
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
      seasonTabs.appendChild(tab);
    });
  }

  function selectSeason(seasonNumber, preserveSelection = false) {
    state.currentSeasonNumber = seasonNumber;
    if (!preserveSelection) {
      state.selectedEpisodeNumbers.clear();
    }
    updateSelectedCount();

    // Update tab styling
    document.querySelectorAll('.season-tab').forEach((tab) => {
      tab.classList.toggle('active', parseInt(tab.dataset.season) === seasonNumber);
    });

    const seasonData = state.currentAnime.seasons.find((s) => s.season === seasonNumber);
    renderSeasonEpisodes(seasonData);
  }

  // Render Episode List for Selected Season
  function renderSeasonEpisodes(seasonData) {
    if (!seasonData || seasonData.episodes.length === 0) {
      btnDownloadSelected.disabled = true;
      btnDownloadAllSeason.disabled = true;
      selectAllCheckbox.disabled = true;
      episodesContainer.innerHTML = `
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

    selectAllCheckbox.disabled = false;
    btnDownloadAllSeason.disabled = false;

    const list = document.createElement('div');
    list.className = 'episodes-list';

    seasonData.episodes.forEach((ep) => {
      const item = document.createElement('div');
      item.className = `episode-item ${ep.isDownloaded ? 'downloaded' : ''}`;
      item.id = `episode-row-${ep.number}`;

      // Check if this episode is currently active or queued
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
        // Fallback for not downloaded (or previously failed/canceled)
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

    episodesContainer.innerHTML = '';
    episodesContainer.appendChild(list);

    // Attach row events
    attachEpisodeListEvents(seasonData);
  }

  function attachEpisodeListEvents(seasonData) {
    // Checkbox toggles
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

    // Single Download buttons
    document.querySelectorAll('.btn-download-single').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const epNum = parseInt(btn.dataset.ep);
        await triggerBatchDownload([epNum]);
      });
    });

    // Cancel buttons
    document.querySelectorAll('.btn-cancel-job').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const jobId = btn.dataset.jobid;
        await cancelJob(jobId);
      });
    });
  }

  function isEpisodeBusy(epNum, seasonNum) {
    for (const [_, job] of state.activeJobs) {
      if (
        job.animeId === state.currentAnime.id &&
        job.season === seasonNum &&
        job.episode === epNum
      ) {
        if (job.status === 'DOWNLOADING' || job.status === 'QUEUED') return true;
      }
    }
    return false;
  }

  function updateSelectedCount() {
    const count = state.selectedEpisodeNumbers.size;
    selectedCountText.textContent = `${count} terpilih`;
    btnDownloadSelected.disabled = count === 0;

    const seasonData = state.currentAnime?.seasons?.find(
      (s) => s.season === state.currentSeasonNumber
    );
    if (!seasonData) return;

    const selectableCount = seasonData.episodes.filter(
      (e) => !e.isDownloaded && !isEpisodeBusy(e.number, seasonData.season)
    ).length;

    selectAllCheckbox.checked = selectableCount > 0 && count === selectableCount;
  }

  // Batch Download Trigger
  async function triggerBatchDownload(episodeNumbers) {
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

      // Expand tray to show progress
      state.trayCollapsed = false;
      downloadTray.classList.remove('collapsed');

      // Update state
      if (res.jobs && Array.isArray(res.jobs)) {
        res.jobs.forEach((j) => {
          state.activeJobs.set(j.jobId, j);
        });
        refreshWorkerStatus();
        renderTray();
      }

      // Clear selection
      state.selectedEpisodeNumbers.clear();
      updateSelectedCount();
      if (state.currentAnime) {
        const seasonData = state.currentAnime.seasons.find(
          (s) => s.season === state.currentSeasonNumber
        );
        renderSeasonEpisodes(seasonData);
      }
    } catch (err) {
      showToast('Gagal memulai unduhan: ' + err.message, 'error');
    }
  }

  async function cancelJob(jobId) {
    try {
      await API.cancelDownload(jobId);
      showToast('Unduhan dibatalkan.', 'info');
      state.activeJobs.delete(jobId);
      refreshWorkerStatus();
      renderTray();

      // Refresh current view without resetting tab
      if (state.currentAnime) {
        const seasonData = state.currentAnime.seasons.find(
          (s) => s.season === state.currentSeasonNumber
        );
        renderSeasonEpisodes(seasonData);
      }
    } catch (err) {
      showToast('Gagal membatalkan unduhan: ' + err.message, 'error');
    }
  }

  // Render Download Tray (Using clean event listeners, no inline onclick)
  function renderTray() {
    const jobs = Array.from(state.activeJobs.values());
    trayJobCount.textContent = jobs.length;

    refreshWorkerStatus();

    if (jobs.length === 0) {
      emptyTrayMessage.style.display = 'block';
      trayJobsList.innerHTML = '';
      return;
    }

    emptyTrayMessage.style.display = 'none';
    trayJobsList.innerHTML = '';

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

      trayJobsList.appendChild(card);
    });
  }

  // Event Delegation for Tray Cancel buttons
  trayJobsList.addEventListener('click', async (e) => {
    const cancelBtn = e.target.closest('.btn-tray-cancel');
    if (cancelBtn) {
      const jobId = cancelBtn.dataset.jobid;
      await cancelJob(jobId);
    }
  });

  // Realtime Server-Sent Events (SSE) Listener Setup
  function initSSE() {
    API.connectSSE({
      onOpen() {
        console.log('[App] SSE connected');
      },
      onError() {
        console.warn('[App] SSE dropped, retrying...');
      },
      enqueued(job) {
        state.activeJobs.set(job.jobId, job);
        refreshWorkerStatus();
        renderTray();
      },
      progress(data) {
        const job = state.activeJobs.get(data.jobId);
        if (job) {
          job.status = data.status || 'DOWNLOADING';
          job.progress = data.progress;
          job.downloadedBytes = data.downloadedBytes;
          job.totalBytes = data.totalBytes;
          job.speed = data.speed;

          refreshWorkerStatus();

          // Update tray elements dynamically
          const bar = document.getElementById(`tray-bar-${data.jobId}`);
          const percent = document.getElementById(`tray-percent-${data.jobId}`);
          const bytes = document.getElementById(`tray-bytes-${data.jobId}`);
          const speed = document.getElementById(`tray-speed-${data.jobId}`);
          const badge = document.getElementById(`tray-badge-${data.jobId}`);

          if (bar) bar.style.width = `${data.progress}%`;
          if (percent) percent.textContent = `${data.progress.toFixed(1)}%`;
          if (bytes) bytes.textContent = `${formatBytes(data.downloadedBytes)} / ${formatBytes(data.totalBytes)}`;
          if (speed) speed.textContent = data.speed;
          if (badge && badge.textContent !== 'DOWNLOADING') {
            badge.textContent = 'DOWNLOADING';
            badge.className = 'badge badge-amber';
          }
        }

        // Update episode row if visible in current view
        if (
          state.currentAnime &&
          state.currentAnime.id === data.animeId &&
          state.currentSeasonNumber === data.season
        ) {
          const rowBadge = document.getElementById(`ep-badge-${data.episode}`);
          const rowSpeed = document.getElementById(`ep-speed-${data.episode}`);
          if (rowBadge) {
            rowBadge.textContent = `Downloading (${data.progress.toFixed(0)}%)`;
            rowBadge.className = 'badge badge-amber';
          }
          if (rowSpeed) {
            rowSpeed.style.display = 'inline';
            rowSpeed.textContent = data.speed;
          }
        }
      },
      completed(data) {
        showToast(`Unduhan selesai: ${data.filename}!`, 'success', 5000);
        state.activeJobs.delete(data.jobId);
        refreshWorkerStatus();
        renderTray();

        // Refresh detail view preserving active tab and selections
        if (state.currentAnime && state.currentAnime.id === data.animeId) {
          openAnimeDetail(data.animeId, true);
        }
        // Only refresh catalog summaries if currently on catalog view
        if (catalogView.classList.contains('active')) {
          API.getAnimeList().then((list) => {
            state.animeList = list;
            renderCatalog(list);
          });
        }
      },
      failed(data) {
        showToast(`Gagal mengunduh Episode ${data.episode}: ${data.error}`, 'error', 6000);
        state.activeJobs.delete(data.jobId);
        refreshWorkerStatus();
        renderTray();
        if (state.currentAnime && state.currentAnime.id === data.animeId) {
          openAnimeDetail(state.currentAnime.id, true);
        }
      },
      canceled(data) {
        state.activeJobs.delete(data.jobId);
        refreshWorkerStatus();
        renderTray();
        if (state.currentAnime && state.currentAnime.id === data.animeId) {
          openAnimeDetail(state.currentAnime.id, true);
        }
      },
    });
  }

  // Navigation & Toolbar Event Listeners
  btnBackHome.addEventListener('click', () => {
    detailView.classList.remove('active');
    catalogView.classList.add('active');
    breadcrumbBar.style.display = 'none';
    state.currentAnime = null;
    loadCatalog();
  });

  searchInput.addEventListener('input', () => {
    renderCatalog(state.animeList);
  });

  btnReload.addEventListener('click', async () => {
    try {
      btnReload.disabled = true;
      const res = await API.reloadCatalog();
      showToast(`${res.message} (${res.totalAnime} anime)`, 'success');
      await loadCatalog();
    } catch (err) {
      showToast('Gagal memuat ulang: ' + err.message, 'error');
    } finally {
      btnReload.disabled = false;
    }
  });

  selectAllCheckbox.addEventListener('change', (e) => {
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

  btnDownloadSelected.addEventListener('click', () => {
    const eps = Array.from(state.selectedEpisodeNumbers).sort((a, b) => a - b);
    triggerBatchDownload(eps);
  });

  btnDownloadAllSeason.addEventListener('click', () => {
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

  // Tray Drawer Toggle
  trayHeader.addEventListener('click', () => {
    state.trayCollapsed = !state.trayCollapsed;
    downloadTray.classList.toggle('collapsed', state.trayCollapsed);
  });

  // Set initial tray state (collapsed)
  downloadTray.classList.add('collapsed');

  // ==========================================================================
  // Import / Add Anime & Episode Modal Logic
  // ==========================================================================

  function resetDynamicRows(startEpNum = 1) {
    dynamicEpisodeRows.innerHTML = '';
    addEpisodeRow(startEpNum);
  }

  function addEpisodeRow(epNum = null) {
    if (epNum == null) {
      const rows = dynamicEpisodeRows.querySelectorAll('.episode-input-row');
      if (rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        const lastEpInput = lastRow.querySelector('.row-ep-num');
        const lastNum = parseInt(lastEpInput.value) || 0;
        epNum = lastNum + 1;
      } else {
        epNum = 1;
      }
    }

    const row = document.createElement('div');
    row.className = 'episode-input-row';
    row.innerHTML = `
      <input type="number" class="form-input row-ep-num" min="1" value="${epNum}" placeholder="Ep" title="Nomor Episode (dapat diedit)">
      <input type="url" class="form-input row-ep-url" placeholder="https://.../video.mp4" title="Link Direct MP4">
      <button type="button" class="btn-delete-row" title="Hapus baris">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;

    const epUrlInput = row.querySelector('.row-ep-url');
    const deleteBtn = row.querySelector('.btn-delete-row');

    // Auto-spawn next empty row with incremented episode number when user fills URL on the last row
    epUrlInput.addEventListener('input', () => {
      if (epUrlInput.value.trim() !== '') {
        const allRows = dynamicEpisodeRows.querySelectorAll('.episode-input-row');
        if (allRows[allRows.length - 1] === row) {
          addEpisodeRow();
        }
      }
    });

    deleteBtn.addEventListener('click', () => {
      row.remove();
      const remainingRows = dynamicEpisodeRows.querySelectorAll('.episode-input-row');
      if (remainingRows.length === 0) {
        addEpisodeRow(1);
      }
    });

    dynamicEpisodeRows.appendChild(row);
    return row;
  }

  async function populateModalSeasons(animeId) {
    modalSelectSeason.innerHTML = '';
    let animeDetail = state.currentAnime && state.currentAnime.id === animeId ? state.currentAnime : null;

    if (!animeDetail) {
      try {
        animeDetail = await API.getAnimeDetail(animeId);
      } catch (err) {
        console.warn('Failed to load anime detail for modal:', err);
      }
    }

    let maxSeasonNum = 0;
    if (animeDetail && animeDetail.seasons && animeDetail.seasons.length > 0) {
      animeDetail.seasons.forEach((s) => {
        if (s.season > maxSeasonNum) maxSeasonNum = s.season;
        const opt = document.createElement('option');
        opt.value = s.season;
        opt.textContent = `${s.title} (${s.episodes.length} Episode)`;
        modalSelectSeason.appendChild(opt);
      });
    }

    const optNew = document.createElement('option');
    optNew.value = '__new__';
    optNew.textContent = '+ Tambah Season Baru...';
    modalSelectSeason.appendChild(optNew);

    if (state.currentAnime && state.currentAnime.id === animeId && state.currentSeasonNumber) {
      modalSelectSeason.value = state.currentSeasonNumber;
    } else if (animeDetail && animeDetail.seasons && animeDetail.seasons.length > 0) {
      modalSelectSeason.value = animeDetail.seasons[0].season;
    }

    handleSeasonChange(animeDetail, maxSeasonNum);
  }

  function handleSeasonChange(animeDetail, maxSeasonNum) {
    const isNewSeason = modalSelectSeason.value === '__new__';
    if (isNewSeason) {
      newSeasonNumGroup.style.display = 'block';
      inputSeasonNumber.value = maxSeasonNum + 1;
      inputSeasonTitle.value = `Season ${maxSeasonNum + 1}`;
      resetDynamicRows(1);
    } else {
      newSeasonNumGroup.style.display = 'none';
      const seasonNum = parseInt(modalSelectSeason.value);
      const s = animeDetail?.seasons?.find((x) => x.season === seasonNum);
      if (s) {
        inputSeasonTitle.value = s.title || '';
        let maxEp = 0;
        s.episodes.forEach((e) => {
          if (e.number > maxEp) maxEp = e.number;
        });
        resetDynamicRows(maxEp + 1);
      } else {
        resetDynamicRows(1);
      }
    }
  }

  function handleModeChange() {
    if (modeExisting.checked) {
      sectionExistingAnime.style.display = 'block';
      sectionNewAnime.style.display = 'none';
      existingSeasonGroup.style.display = 'block';
      if (selectExistingAnime.value) {
        populateModalSeasons(selectExistingAnime.value);
      }
    } else {
      sectionExistingAnime.style.display = 'none';
      sectionNewAnime.style.display = 'block';
      existingSeasonGroup.style.display = 'none';
      newSeasonNumGroup.style.display = 'block';
      inputSeasonNumber.value = 1;
      inputSeasonTitle.value = 'Season 1';
      resetDynamicRows(1);
    }
  }

  function openImportModal() {
    selectExistingAnime.innerHTML = '';
    if (state.animeList && state.animeList.length > 0) {
      state.animeList.forEach((a) => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.title;
        selectExistingAnime.appendChild(opt);
      });
      modeExisting.checked = true;
      if (state.currentAnime) {
        selectExistingAnime.value = state.currentAnime.id;
      }
    } else {
      modeNew.checked = true;
    }

    handleModeChange();
    importModal.style.display = 'flex';
  }

  function closeImportModal() {
    importModal.style.display = 'none';
    importForm.reset();
  }

  // Event Listeners for Modal
  btnOpenImportModal.addEventListener('click', openImportModal);
  btnCloseImportModal.addEventListener('click', closeImportModal);
  btnCancelImport.addEventListener('click', closeImportModal);

  importModal.addEventListener('click', (e) => {
    if (e.target === importModal) {
      closeImportModal();
    }
  });

  modeExisting.addEventListener('change', handleModeChange);
  modeNew.addEventListener('change', handleModeChange);

  selectExistingAnime.addEventListener('change', () => {
    if (selectExistingAnime.value) {
      populateModalSeasons(selectExistingAnime.value);
    }
  });

  modalSelectSeason.addEventListener('change', async () => {
    let animeDetail = state.currentAnime && state.currentAnime.id === selectExistingAnime.value ? state.currentAnime : null;
    if (!animeDetail && selectExistingAnime.value) {
      try {
        animeDetail = await API.getAnimeDetail(selectExistingAnime.value);
      } catch (err) {}
    }
    let maxSeasonNum = 0;
    if (animeDetail?.seasons) {
      animeDetail.seasons.forEach((s) => {
        if (s.season > maxSeasonNum) maxSeasonNum = s.season;
      });
    }
    handleSeasonChange(animeDetail, maxSeasonNum);
  });

  btnAddEpisodeRow.addEventListener('click', () => {
    addEpisodeRow();
  });

  importForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const isNewAnime = modeNew.checked;
    let animeId = '';
    let animeTitle = '';
    let seasonNumber = 1;
    let seasonTitle = '';

    if (isNewAnime) {
      animeTitle = inputNewAnimeTitle.value.trim();
      if (!animeTitle) {
        showToast('Judul anime baru wajib diisi!', 'error');
        inputNewAnimeTitle.focus();
        return;
      }
      seasonNumber = parseInt(inputSeasonNumber.value) || 1;
      seasonTitle = inputSeasonTitle.value.trim();
    } else {
      animeId = selectExistingAnime.value;
      if (!animeId) {
        showToast('Pilih anime terlebih dahulu!', 'error');
        return;
      }
      if (modalSelectSeason.value === '__new__') {
        seasonNumber = parseInt(inputSeasonNumber.value) || 1;
        seasonTitle = inputSeasonTitle.value.trim();
      } else {
        seasonNumber = parseInt(modalSelectSeason.value) || 1;
        seasonTitle = inputSeasonTitle.value.trim();
      }
    }

    const rows = dynamicEpisodeRows.querySelectorAll('.episode-input-row');
    const episodes = [];
    for (const r of rows) {
      const epNumInput = r.querySelector('.row-ep-num');
      const urlInput = r.querySelector('.row-ep-url');
      const epNum = parseInt(epNumInput.value);
      const url = urlInput.value.trim();

      if (url !== '') {
        if (!epNum || epNum < 1) {
          showToast('Nomor episode harus berupa angka > 0!', 'error');
          epNumInput.focus();
          return;
        }
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          showToast(`URL Episode ${epNum} tidak valid! Harus diawali http:// atau https://`, 'error');
          urlInput.focus();
          return;
        }
        episodes.push({ number: epNum, url });
      }
    }

    if (episodes.length === 0) {
      showToast('Masukkan minimal 1 URL episode!', 'error');
      return;
    }

    try {
      btnSubmitImport.disabled = true;
      btnSubmitImport.innerHTML = `
        <div class="spinner" style="width: 14px; height: 14px; margin: 0 6px 0 0; display: inline-block; vertical-align: middle; border-width: 2px;"></div>
        <span>Menyimpan...</span>
      `;

      const payload = {
        animeId,
        animeTitle,
        seasonNumber,
        seasonTitle,
        episodes,
      };

      const result = await API.importAnime(payload);
      showToast(`Berhasil menyimpan ${episodes.length} episode untuk "${result.title}"!`, 'success');

      closeImportModal();

      // Refresh catalog list
      state.animeList = await API.getAnimeList();
      renderCatalog(state.animeList);

      // If viewing detail of this anime or added new anime, navigate/refresh detail
      if (state.currentAnime && (state.currentAnime.id === result.id || isNewAnime)) {
        await openAnimeDetail(result.id, true);
      }
    } catch (err) {
      showToast(`Gagal menyimpan: ${err.message}`, 'error');
    } finally {
      btnSubmitImport.disabled = false;
      btnSubmitImport.innerHTML = `<span>Simpan ke Katalog</span>`;
    }
  });

  // Initialize
  loadCatalog();
  loadExistingDownloads();
  initSSE();
});
