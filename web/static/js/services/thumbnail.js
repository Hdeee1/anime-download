// Thumbnail & Poster Service (AniList GraphQL with in-memory & localStorage caching)

export const AnimeThumbnailService = {
  cachePrefix: 'anime_poster_',
  inFlight: new Map(),

  getPosterUrl(title) {
    if (!title) return Promise.resolve(null);
    const cleanTitle = title.trim();
    const cacheKey = this.cachePrefix + cleanTitle.toLowerCase();
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      return Promise.resolve(cached);
    }

    if (this.inFlight.has(cleanTitle)) {
      return this.inFlight.get(cleanTitle);
    }

    const query = `
      query ($search: String) {
        Media (search: $search, type: ANIME) {
          coverImage {
            large
            medium
          }
        }
      }
    `;

    const promise = fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        variables: { search: cleanTitle },
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('AniList response not OK');
        return res.json();
      })
      .then((data) => {
        const cover =
          data?.data?.Media?.coverImage?.large || data?.data?.Media?.coverImage?.medium;
        if (cover) {
          try {
            localStorage.setItem(cacheKey, cover);
          } catch (e) {
            // Ignore potential localStorage quota errors
          }
          return cover;
        }
        return null;
      })
      .catch((err) => {
        console.warn('[ThumbnailService] Error fetching poster for', cleanTitle, err);
        return null;
      })
      .finally(() => {
        this.inFlight.delete(cleanTitle);
      });

    this.inFlight.set(cleanTitle, promise);
    return promise;
  },

  bindImage(imgElement, title) {
    if (!imgElement) return;
    imgElement.src = '/static/images/poster-placeholder.svg';
    imgElement.classList.remove('loaded');

    this.getPosterUrl(title).then((url) => {
      if (url) {
        const preload = new Image();
        preload.onload = () => {
          imgElement.src = url;
          imgElement.classList.add('loaded');
        };
        preload.onerror = () => {
          imgElement.src = '/static/images/poster-placeholder.svg';
          imgElement.classList.add('loaded');
        };
        preload.src = url;
      } else {
        imgElement.src = '/static/images/poster-placeholder.svg';
        imgElement.classList.add('loaded');
      }
    });
  },
};

export default AnimeThumbnailService;

