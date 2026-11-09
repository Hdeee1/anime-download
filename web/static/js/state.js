// Central Application State

export const state = {
  animeList: [],
  currentAnime: null,
  currentSeasonNumber: null,
  selectedEpisodeNumbers: new Set(),
  activeJobs: new Map(), // jobId -> DownloadJob
  trayCollapsed: true,
};
