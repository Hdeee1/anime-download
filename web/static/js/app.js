// Main Frontend Application Orchestrator (Native ES Module)

import { API } from './api.js';
import { state } from './state.js';
import { showToast } from './services/toast.js';
import {
  initCatalogView,
  loadCatalog,
  renderCatalog,
  showCatalogView,
} from './components/catalog-view.js';
import {
  initDetailView,
  openAnimeDetail,
  refreshDetailView,
  updateEpisodeProgress,
  cancelJob,
} from './components/detail-view.js';
import {
  initDownloadTray,
  loadExistingDownloads,
  renderTray,
  refreshWorkerStatus,
  updateJobProgress,
  expandTray,
} from './components/download-tray.js';
import { initImportModal } from './components/import-modal.js';

// Setup Server-Sent Events (SSE) Listener
function initSSE() {
  API.connectSSE({
    onOpen() {
      refreshWorkerStatus();
    },
    onError() {
      // Browser EventSource automatically handles reconnection
    },
    enqueued(job) {
      state.activeJobs.set(job.jobId, job);
      renderTray();
    },
    progress(data) {
      const existing = state.activeJobs.get(data.jobId);
      if (existing) {
        existing.progress = data.progress;
        existing.downloadedBytes = data.downloadedBytes;
        existing.totalBytes = data.totalBytes;
        existing.speed = data.speed;
      } else {
        state.activeJobs.set(data.jobId, data);
      }

      // Live update Tray Card & Episode Row without rebuilding DOM
      updateJobProgress(data);
      updateEpisodeProgress(data);
    },
    completed(data) {
      showToast(`Selesai mengunduh: ${data.filename}`, 'success');
      state.activeJobs.delete(data.jobId);
      refreshWorkerStatus();
      renderTray();

      if (state.currentAnime && state.currentAnime.id === data.animeId) {
        openAnimeDetail(data.animeId, true);
      }

      const catalogView = document.getElementById('catalogView');
      if (catalogView && catalogView.classList.contains('active')) {
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

// Application Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Components
  initCatalogView({
    onSelectAnime: (animeId) => openAnimeDetail(animeId),
  });

  initDetailView({
    onDownloadsEnqueued: () => {
      expandTray();
      renderTray();
    },
    onJobCanceled: () => {
      renderTray();
    },
  });

  initDownloadTray({
    onCancelJob: async (jobId) => {
      await cancelJob(jobId);
      renderTray();
    },
  });

  initImportModal({
    onImportSuccess: async (result, isNewAnime) => {
      state.animeList = await API.getAnimeList();
      renderCatalog(state.animeList);

      if (state.currentAnime && (state.currentAnime.id === result.id || isNewAnime)) {
        await openAnimeDetail(result.id, true);
      }
    },
  });

  // 2. Global Navigation Listeners
  const navLogo = document.getElementById('navLogo');
  if (navLogo) {
    navLogo.addEventListener('click', () => {
      const detailView = document.getElementById('detailView');
      if (detailView && detailView.classList.contains('active')) {
        showCatalogView();
      }
    });
  }

  const btnBackHome = document.getElementById('btnBackHome');
  if (btnBackHome) {
    btnBackHome.addEventListener('click', () => {
      showCatalogView();
    });
  }

  // 3. Initial Data Load & SSE Subscription
  loadCatalog();
  loadExistingDownloads();
  initSSE();
});
