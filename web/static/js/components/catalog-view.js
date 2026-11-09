// Catalog View Component

import { API } from '../api.js';
import { state } from '../state.js';
import { escapeHtml } from '../utils.js';
import { showToast } from '../services/toast.js';
import { AnimeThumbnailService } from '../services/thumbnail.js';

let catalogViewEl;
let detailViewEl;
let breadcrumbBarEl;
let animeGridEl;
let searchInputEl;
let btnReloadEl;
let onSelectAnimeCb = null;

/**
 * Initialize the catalog view component
 * @param {object} options
 * @param {function(string): void} options.onSelectAnime - Callback when an anime card is clicked
 */
export function initCatalogView({ onSelectAnime }) {
  catalogViewEl = document.getElementById('catalogView');
  detailViewEl = document.getElementById('detailView');
  breadcrumbBarEl = document.getElementById('breadcrumbBar');
  animeGridEl = document.getElementById('animeGrid');
  searchInputEl = document.getElementById('searchInput');
  btnReloadEl = document.getElementById('btnReload');
  onSelectAnimeCb = onSelectAnime;

  if (searchInputEl) {
    searchInputEl.addEventListener('input', () => {
      renderCatalog(state.animeList);
    });
  }

  if (btnReloadEl) {
    btnReloadEl.addEventListener('click', async () => {
      try {
        btnReloadEl.disabled = true;
        const res = await API.reloadCatalog();
        showToast(`${res.message} (${res.totalAnime} anime)`, 'success');
        await loadCatalog();
      } catch (err) {
        showToast('Gagal memuat ulang: ' + err.message, 'error');
      } finally {
        btnReloadEl.disabled = false;
      }
    });
  }
}

/**
 * Load initial or refreshed catalog from backend
 */
export async function loadCatalog() {
  if (!animeGridEl) return;
  try {
    animeGridEl.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Memuat katalog anime...</p>
      </div>
    `;
    state.animeList = await API.getAnimeList();
    renderCatalog(state.animeList);
  } catch (err) {
    animeGridEl.innerHTML = `
      <div class="loading-state">
        <p style="color: var(--accent-rose);">Gagal memuat katalog: ${escapeHtml(err.message)}</p>
      </div>
    `;
    showToast('Gagal memuat katalog: ' + err.message, 'error');
  }
}

/**
 * Render anime card grid with search query filtering
 * @param {Array<object>} list
 */
export function renderCatalog(list) {
  if (!animeGridEl) return;
  const query = (searchInputEl?.value || '').trim().toLowerCase();
  const filtered = (list || []).filter((item) =>
    item.title.toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    animeGridEl.innerHTML = `
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

  animeGridEl.innerHTML = '';
  filtered.forEach((anime) => {
    const card = document.createElement('div');
    card.className = 'anime-card';
    const progressPercent =
      anime.totalEpisodes > 0
        ? Math.round((anime.downloadedEpisodes / anime.totalEpisodes) * 100)
        : 0;

    card.innerHTML = `
      <div class="anime-card-poster">
        <img class="card-poster-img" alt="${escapeHtml(anime.title)}">
      </div>
      <div class="anime-card-content">
        <div>
          <div class="card-header">
            <h2 class="card-title" title="${escapeHtml(anime.title)}">${escapeHtml(anime.title)}</h2>
          </div>
          <div class="card-meta">
            <span class="badge badge-slate">${anime.totalSeasons} Season</span>
            <span class="badge badge-slate">${anime.totalEpisodes} Episode Total</span>
            <span class="badge ${progressPercent === 100 && anime.totalEpisodes > 0 ? 'badge-emerald' : 'badge-amber'}">
              ${anime.downloadedEpisodes} / ${anime.totalEpisodes} Terunduh
            </span>
          </div>
        </div>
        <div>
          <div class="card-progress-bar">
            <div class="card-progress-fill ${progressPercent === 100 && anime.totalEpisodes > 0 ? 'complete' : ''}" style="width: ${progressPercent}%;"></div>
          </div>
          <div class="card-footer">
            <span>Status Arsip</span>
            <span style="font-family: var(--font-mono); font-weight: 600;">${progressPercent}%</span>
          </div>
        </div>
      </div>
    `;

    const posterImg = card.querySelector('.card-poster-img');
    AnimeThumbnailService.bindImage(posterImg, anime.title);

    card.addEventListener('click', () => {
      if (onSelectAnimeCb) {
        onSelectAnimeCb(anime.id);
      }
    });
    animeGridEl.appendChild(card);
  });
}

/**
 * Switch view back to catalog
 */
export function showCatalogView() {
  if (detailViewEl) detailViewEl.classList.remove('active');
  if (catalogViewEl) catalogViewEl.classList.add('active');
  if (breadcrumbBarEl) breadcrumbBarEl.style.display = 'none';
  state.currentAnime = null;
  loadCatalog();
}
