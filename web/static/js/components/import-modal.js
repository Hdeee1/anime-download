// Import Anime & Episode Modal Component

import { API } from '../api.js';
import { state } from '../state.js';
import { showToast } from '../services/toast.js';

let importModalEl;
let btnOpenImportModalEl;
let btnCloseImportModalEl;
let btnCancelImportEl;
let importFormEl;
let modeExistingEl;
let modeNewEl;
let sectionExistingAnimeEl;
let sectionNewAnimeEl;
let selectExistingAnimeEl;
let inputNewAnimeTitleEl;
let existingSeasonGroupEl;
let modalSelectSeasonEl;
let newSeasonNumGroupEl;
let inputSeasonNumberEl;
let inputSeasonTitleEl;
let dynamicEpisodeRowsEl;
let btnAddEpisodeRowEl;
let btnSubmitImportEl;

let onImportSuccessCb = null;

/**
 * Initialize import modal & attach event listeners
 * @param {object} options
 * @param {function(object, boolean): Promise<void>} options.onImportSuccess - Callback on success with result & isNewAnime flag
 */
export function initImportModal({ onImportSuccess } = {}) {
  importModalEl = document.getElementById('importModal');
  btnOpenImportModalEl = document.getElementById('btnOpenImportModal');
  btnCloseImportModalEl = document.getElementById('btnCloseImportModal');
  btnCancelImportEl = document.getElementById('btnCancelImport');
  importFormEl = document.getElementById('importForm');
  modeExistingEl = document.getElementById('modeExisting');
  modeNewEl = document.getElementById('modeNew');
  sectionExistingAnimeEl = document.getElementById('sectionExistingAnime');
  sectionNewAnimeEl = document.getElementById('sectionNewAnime');
  selectExistingAnimeEl = document.getElementById('selectExistingAnime');
  inputNewAnimeTitleEl = document.getElementById('inputNewAnimeTitle');
  existingSeasonGroupEl = document.getElementById('existingSeasonGroup');
  modalSelectSeasonEl = document.getElementById('selectSeason');
  newSeasonNumGroupEl = document.getElementById('newSeasonNumGroup');
  inputSeasonNumberEl = document.getElementById('inputSeasonNumber');
  inputSeasonTitleEl = document.getElementById('inputSeasonTitle');
  dynamicEpisodeRowsEl = document.getElementById('dynamicEpisodeRows');
  btnAddEpisodeRowEl = document.getElementById('btnAddEpisodeRow');
  btnSubmitImportEl = document.getElementById('btnSubmitImport');

  onImportSuccessCb = onImportSuccess;

  if (btnOpenImportModalEl) btnOpenImportModalEl.addEventListener('click', openImportModal);
  if (btnCloseImportModalEl) btnCloseImportModalEl.addEventListener('click', closeImportModal);
  if (btnCancelImportEl) btnCancelImportEl.addEventListener('click', closeImportModal);

  if (importModalEl) {
    importModalEl.addEventListener('click', (e) => {
      if (e.target === importModalEl) {
        closeImportModal();
      }
    });
  }

  if (modeExistingEl) modeExistingEl.addEventListener('change', handleModeChange);
  if (modeNewEl) modeNewEl.addEventListener('change', handleModeChange);

  if (selectExistingAnimeEl) {
    selectExistingAnimeEl.addEventListener('change', () => {
      if (selectExistingAnimeEl.value) {
        populateModalSeasons(selectExistingAnimeEl.value);
      }
    });
  }

  if (modalSelectSeasonEl) {
    modalSelectSeasonEl.addEventListener('change', async () => {
      let animeDetail =
        state.currentAnime && state.currentAnime.id === selectExistingAnimeEl?.value
          ? state.currentAnime
          : null;
      if (!animeDetail && selectExistingAnimeEl?.value) {
        try {
          animeDetail = await API.getAnimeDetail(selectExistingAnimeEl.value);
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
  }

  if (btnAddEpisodeRowEl) {
    btnAddEpisodeRowEl.addEventListener('click', () => {
      addEpisodeRow();
    });
  }

  if (importFormEl) {
    importFormEl.addEventListener('submit', handleFormSubmit);
  }
}

export function resetDynamicRows(startEpNum = 1) {
  if (!dynamicEpisodeRowsEl) return;
  dynamicEpisodeRowsEl.innerHTML = '';
  addEpisodeRow(startEpNum);
}

export function addEpisodeRow(epNum = null) {
  if (!dynamicEpisodeRowsEl) return null;
  if (epNum == null) {
    const rows = dynamicEpisodeRowsEl.querySelectorAll('.episode-input-row');
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
      const allRows = dynamicEpisodeRowsEl.querySelectorAll('.episode-input-row');
      if (allRows[allRows.length - 1] === row) {
        addEpisodeRow();
      }
    }
  });

  deleteBtn.addEventListener('click', () => {
    row.remove();
    const remainingRows = dynamicEpisodeRowsEl.querySelectorAll('.episode-input-row');
    if (remainingRows.length === 0) {
      addEpisodeRow(1);
    }
  });

  dynamicEpisodeRowsEl.appendChild(row);
  return row;
}

export async function populateModalSeasons(animeId) {
  if (!modalSelectSeasonEl) return;
  modalSelectSeasonEl.innerHTML = '';
  let animeDetail =
    state.currentAnime && state.currentAnime.id === animeId ? state.currentAnime : null;

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
      modalSelectSeasonEl.appendChild(opt);
    });
  }

  const optNew = document.createElement('option');
  optNew.value = '__new__';
  optNew.textContent = '+ Tambah Season Baru...';
  modalSelectSeasonEl.appendChild(optNew);

  if (state.currentAnime && state.currentAnime.id === animeId && state.currentSeasonNumber) {
    modalSelectSeasonEl.value = state.currentSeasonNumber;
  } else if (animeDetail && animeDetail.seasons && animeDetail.seasons.length > 0) {
    modalSelectSeasonEl.value = animeDetail.seasons[0].season;
  }

  handleSeasonChange(animeDetail, maxSeasonNum);
}

export function handleSeasonChange(animeDetail, maxSeasonNum) {
  if (!modalSelectSeasonEl) return;
  const isNewSeason = modalSelectSeasonEl.value === '__new__';
  if (isNewSeason) {
    if (newSeasonNumGroupEl) newSeasonNumGroupEl.style.display = 'block';
    if (inputSeasonNumberEl) inputSeasonNumberEl.value = maxSeasonNum + 1;
    if (inputSeasonTitleEl) inputSeasonTitleEl.value = `Season ${maxSeasonNum + 1}`;
    resetDynamicRows(1);
  } else {
    if (newSeasonNumGroupEl) newSeasonNumGroupEl.style.display = 'none';
    const seasonNum = parseInt(modalSelectSeasonEl.value);
    const s = animeDetail?.seasons?.find((x) => x.season === seasonNum);
    if (s) {
      if (inputSeasonTitleEl) inputSeasonTitleEl.value = s.title || '';
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

export function handleModeChange() {
  if (!modeExistingEl) return;
  if (modeExistingEl.checked) {
    if (sectionExistingAnimeEl) sectionExistingAnimeEl.style.display = 'block';
    if (sectionNewAnimeEl) sectionNewAnimeEl.style.display = 'none';
    if (existingSeasonGroupEl) existingSeasonGroupEl.style.display = 'block';
    if (selectExistingAnimeEl?.value) {
      populateModalSeasons(selectExistingAnimeEl.value);
    }
  } else {
    if (sectionExistingAnimeEl) sectionExistingAnimeEl.style.display = 'none';
    if (sectionNewAnimeEl) sectionNewAnimeEl.style.display = 'block';
    if (existingSeasonGroupEl) existingSeasonGroupEl.style.display = 'none';
    if (newSeasonNumGroupEl) newSeasonNumGroupEl.style.display = 'block';
    if (inputSeasonNumberEl) inputSeasonNumberEl.value = 1;
    if (inputSeasonTitleEl) inputSeasonTitleEl.value = 'Season 1';
    resetDynamicRows(1);
  }
}

export function openImportModal() {
  if (!selectExistingAnimeEl || !importModalEl || !modeExistingEl || !modeNewEl) return;
  selectExistingAnimeEl.innerHTML = '';
  if (state.animeList && state.animeList.length > 0) {
    state.animeList.forEach((a) => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.title;
      selectExistingAnimeEl.appendChild(opt);
    });
    modeExistingEl.checked = true;
    if (state.currentAnime) {
      selectExistingAnimeEl.value = state.currentAnime.id;
    }
  } else {
    modeNewEl.checked = true;
  }

  handleModeChange();
  importModalEl.style.display = 'flex';
}

export function closeImportModal() {
  if (importModalEl) importModalEl.style.display = 'none';
  if (importFormEl) importFormEl.reset();
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const isNewAnime = modeNewEl?.checked;
  let animeId = '';
  let animeTitle = '';
  let seasonNumber = 1;
  let seasonTitle = '';

  if (isNewAnime) {
    animeTitle = inputNewAnimeTitleEl?.value.trim() || '';
    if (!animeTitle) {
      showToast('Judul anime baru wajib diisi!', 'error');
      inputNewAnimeTitleEl?.focus();
      return;
    }
    seasonNumber = parseInt(inputSeasonNumberEl?.value) || 1;
    seasonTitle = inputSeasonTitleEl?.value.trim() || '';
  } else {
    animeId = selectExistingAnimeEl?.value || '';
    if (!animeId) {
      showToast('Pilih anime terlebih dahulu!', 'error');
      return;
    }
    if (modalSelectSeasonEl?.value === '__new__') {
      seasonNumber = parseInt(inputSeasonNumberEl?.value) || 1;
      seasonTitle = inputSeasonTitleEl?.value.trim() || '';
    } else {
      seasonNumber = parseInt(modalSelectSeasonEl?.value) || 1;
      seasonTitle = inputSeasonTitleEl?.value.trim() || '';
    }
  }

  const rows = dynamicEpisodeRowsEl?.querySelectorAll('.episode-input-row') || [];
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
    if (btnSubmitImportEl) {
      btnSubmitImportEl.disabled = true;
      btnSubmitImportEl.innerHTML = `
        <div class="spinner" style="width: 14px; height: 14px; margin: 0 6px 0 0; display: inline-block; vertical-align: middle; border-width: 2px;"></div>
        <span>Menyimpan...</span>
      `;
    }

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

    if (onImportSuccessCb) {
      await onImportSuccessCb(result, isNewAnime);
    }
  } catch (err) {
    showToast(`Gagal menyimpan: ${err.message}`, 'error');
  } finally {
    if (btnSubmitImportEl) {
      btnSubmitImportEl.disabled = false;
      btnSubmitImportEl.innerHTML = `<span>Simpan ke Katalog</span>`;
    }
  }
}
