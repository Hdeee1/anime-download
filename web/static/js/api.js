// API Client Module (Native ES Module)

export const API = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${res.status}`);
    }
    const json = await res.json();
    return json.data;
  },

  async post(url, body = {}) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${res.status}`);
    }
    const json = await res.json();
    return json.data;
  },

  async delete(url) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${res.status}`);
    }
    const json = await res.json();
    return json.data;
  },

  // Anime Endpoints
  async getAnimeList() {
    return this.get('/api/anime');
  },

  async getAnimeDetail(animeId) {
    return this.get(`/api/anime/${animeId}`);
  },

  async reloadCatalog() {
    return this.post('/api/anime/reload');
  },

  async importAnime(payload) {
    return this.post('/api/anime', payload);
  },

  // Download Endpoints
  async enqueueDownloads(animeId, seasonNumber, episodeNumbers) {
    return this.post('/api/downloads', {
      animeId,
      seasonNumber,
      episodeNumbers,
    });
  },

  async getDownloads() {
    return this.get('/api/downloads');
  },

  async cancelDownload(jobId) {
    return this.delete(`/api/downloads/${jobId}`);
  },

  // Server-Sent Events (SSE) Listener
  connectSSE(eventCallbacks = {}) {
    const eventSource = new EventSource('/api/downloads/events');

    eventSource.onopen = () => {
      console.log('[SSE] Connected to download event stream');
      if (eventCallbacks.onOpen) eventCallbacks.onOpen();
    };

    eventSource.onerror = (err) => {
      console.warn('[SSE] Connection error/reconnecting...', err);
      if (eventCallbacks.onError) eventCallbacks.onError(err);
    };

    // Standard events
    ['progress', 'completed', 'failed', 'canceled', 'enqueued'].forEach((evtType) => {
      eventSource.addEventListener(evtType, (e) => {
        try {
          const data = JSON.parse(e.data);
          if (eventCallbacks[evtType]) {
            eventCallbacks[evtType](data);
          }
        } catch (err) {
          console.error('[SSE] Failed to parse event data:', e.data, err);
        }
      });
    });

    return eventSource;
  },
};

export default API;
