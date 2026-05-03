// Connect screen for the Placet desktop shell.
//
// Persists the user's chosen base URL via tauri-plugin-store and then
// navigates the webview to that origin. The rest of the app is the
// regular Placet web frontend served by the user's backend.

const { load } = window.__TAURI__.store;

const form = document.getElementById('connect-form');
const input = document.getElementById('base-url');
const apiInput = document.getElementById('api-url');
const advanced = document.querySelector('details.advanced');
const button = document.getElementById('submit');
const errorEl = document.getElementById('error');

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = '';
}

function normalize(rawUrl) {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('URL must start with http:// or https://');
  }
  // Throws if invalid.
  // eslint-disable-next-line no-new
  new URL(trimmed);
  return trimmed;
}

async function probe(baseUrl) {
  // Lightweight reachability check. We don't require a specific
  // endpoint to exist — any 2xx/3xx/4xx response proves the host is up.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(`${baseUrl}/api/auth/me`, {
      method: 'GET',
      credentials: 'include',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  let baseUrl;
  let apiUrl = null;
  try {
    baseUrl = normalize(input.value);
    if (apiInput && apiInput.value.trim() !== '') {
      apiUrl = normalize(apiInput.value);
    }
  } catch (err) {
    showError(err.message);
    return;
  }

  button.disabled = true;
  button.textContent = 'Connecting…';

  try {
    try {
      await probe(apiUrl ?? baseUrl);
    } catch (err) {
      showError(`Could not reach ${apiUrl ?? baseUrl}. Check the URL and try again.`);
      return;
    }

    const store = await load('placet.json', { autoSave: true });
    await store.set('baseUrl', baseUrl);
    if (apiUrl) {
      await store.set('apiUrl', apiUrl);
    } else {
      await store.delete('apiUrl');
    }
    await store.save();

    window.location.replace(baseUrl);
  } finally {
    button.disabled = false;
    button.textContent = 'Connect';
  }
});

// Pre-fill if a URL was already saved (e.g. user invoked "Switch server").
(async () => {
  try {
    const store = await load('placet.json', { autoSave: true });
    const existing = await store.get('baseUrl');
    if (typeof existing === 'string') input.value = existing;
    const existingApi = await store.get('apiUrl');
    if (typeof existingApi === 'string' && existingApi !== '') {
      apiInput.value = existingApi;
      if (advanced) advanced.open = true;
    }
  } catch {
    /* first run — nothing to load */
  }
})();
