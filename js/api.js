// Shared API configuration for the frontend.
// Goal: avoid hardcoded hosts (127.0.0.1) and work in Docker/LAN setups.
(function () {
    const STORAGE_KEY = 'mineservergui_api_base_url';

    function normalizeBaseUrl(value) {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (!trimmed) return null;
        return trimmed.replace(/\/+$/, '');
    }

    function getApiBaseUrl() {
        // 1) Explicit override via global variable.
        const fromWindow = normalizeBaseUrl(window.MINESERVERGUI_API_BASE_URL);
        if (fromWindow) return fromWindow;

        // 2) Optional meta tag override.
        const meta = document.querySelector('meta[name="mineservergui-api-base"]');
        const fromMeta = normalizeBaseUrl(meta && meta.content);
        if (fromMeta) return fromMeta;

        // 3) Optional persisted override (useful when opening HTML directly from disk).
        const fromStorage = normalizeBaseUrl(localStorage.getItem(STORAGE_KEY));
        if (fromStorage) return fromStorage;

        // 4) Default: same-origin. If opened via file://, fall back to localhost.
        if (window.location.protocol === 'file:') return 'http://127.0.0.1:5000';
        return window.location.origin;
    }

    function buildApiUrl(path) {
        const baseUrl = getApiBaseUrl();
        const normalizedPath = typeof path === 'string' && path.startsWith('/') ? path : `/${path || ''}`;
        return `${baseUrl}${normalizedPath}`;
    }

    async function authenticatedFetch(pathOrUrl, options = {}) {
        const url = typeof pathOrUrl === 'string' && /^https?:\/\//i.test(pathOrUrl)
            ? pathOrUrl
            : buildApiUrl(pathOrUrl);

        return fetch(url, {
            ...options,
            credentials: 'include',
        });
    }

    window.MineServerGUI = window.MineServerGUI || {};
    window.MineServerGUI.getApiBaseUrl = getApiBaseUrl;
    window.MineServerGUI.buildApiUrl = buildApiUrl;
    window.MineServerGUI.authenticatedFetch = authenticatedFetch;
    window.MineServerGUI.setApiBaseUrl = (baseUrl) => {
        const normalized = normalizeBaseUrl(baseUrl);
        if (!normalized) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        localStorage.setItem(STORAGE_KEY, normalized);
        return normalized;
    };
})();
