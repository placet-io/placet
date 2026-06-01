// Connect screen for the Placet desktop shell.
//
// Persists the user's chosen base URL via tauri-plugin-store and then
// navigates the webview to that origin. The rest of the app is the
// regular Placet web frontend served by the user's backend.

const { invoke } = window.__TAURI__.core;
const { load } = window.__TAURI__.store;

const form = document.getElementById('connect-form');
const input = document.getElementById('base-url');
const apiInput = document.getElementById('api-url');
const advanced = document.querySelector('details.advanced');
const button = document.getElementById('submit');
const errorEl = document.getElementById('error');
const subtitle = document.querySelector('.subtitle');
const savedServer = document.getElementById('saved-server');
const savedServerUrl = document.getElementById('saved-server-url');
const retrySaved = document.getElementById('retry-saved');
const changeServer = document.getElementById('change-server');

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = '';
}

function setBusy(isBusy, label = 'Connect') {
  button.disabled = isBusy;
  button.textContent = isBusy ? label : 'Connect';
  if (retrySaved) retrySaved.disabled = isBusy;
}

function showSavedServer(baseUrl, state = 'checking') {
  if (!savedServer || !savedServerUrl) return;
  savedServer.dataset.state = state;
  savedServer.hidden = false;
  savedServerUrl.textContent = baseUrl;
}

function hideSavedServer() {
  if (savedServer) savedServer.hidden = true;
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

async function validate(baseUrl, apiUrl) {
  return invoke('validate_server_url', { baseUrl, apiUrl });
}

async function saveAndOpen(baseUrl, apiUrl) {
  const store = await load('placet.json', { autoSave: true });
  await store.set('baseUrl', baseUrl);
  if (apiUrl) {
    await store.set('apiUrl', apiUrl);
  } else {
    await store.delete('apiUrl');
  }
  await store.save();

  window.location.replace(baseUrl);
}

async function connectTo(baseUrl, apiUrl, { saved = false } = {}) {
  setBusy(true, saved ? 'Checking…' : 'Connecting…');
  clearError();

  try {
    const result = await validate(baseUrl, apiUrl || null);
    if (saved) showSavedServer(result.base_url, 'connected');
    await saveAndOpen(result.base_url, result.api_url || null);
  } catch (err) {
    if (saved) {
      showSavedServer(baseUrl, 'error');
      if (subtitle)
        subtitle.textContent =
          'The saved Placet server could not be opened. Choose a different host or update the URL below.';
    }
    showError(err instanceof Error ? err.message : String(err));
  } finally {
    setBusy(false);
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

  hideSavedServer();
  await connectTo(baseUrl, apiUrl);
});

retrySaved?.addEventListener('click', async () => {
  clearError();
  const baseUrl = input.value.trim();
  const apiUrl = apiInput?.value.trim() || null;
  if (baseUrl) await connectTo(baseUrl, apiUrl, { saved: true });
});

changeServer?.addEventListener('click', () => {
  hideSavedServer();
  clearError();
  input.focus();
  input.select();
});

// Pre-fill and validate a saved URL before opening it.
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

    if (typeof existing === 'string' && existing.trim() !== '') {
      showSavedServer(existing, 'checking');
      await connectTo(existing, typeof existingApi === 'string' ? existingApi : null, {
        saved: true,
      });
    }
  } catch {
    /* first run — nothing to load */
  }
})();
