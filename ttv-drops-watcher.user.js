// ==UserScript==
// @name         TTV Drops Watcher - Random Top Channel Switcher
// @namespace    https://github.com/hyleon-dev/TTVDropsWatcher
// @version      0.1.2
// @description  Watch a random top-10 channel of the current Twitch category. Switch to a new one if the channel goes offline or changes game.
// @author       hyLeon
// @match        https://www.twitch.tv/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @connect      id.twitch.tv
// @connect      api.twitch.tv
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------

  const CONFIG = {
    topN: 10,
    pollIntervalMs: 30000,
    firstCheckDelayMs: 8000,
  };

  const STATE_KEY = 'ttv_watcher_state';
  const CREDS_KEY = 'ttv_watcher_creds';
  const TOKEN_KEY = 'ttv_watcher_token';

  const RESERVED_PATHS = [
    'directory', 'subscriptions', 'wallet', 'drops', 'settings',
    'inventory', 'friends', 'p', 'turbo', 'downloads', 'jobs',
    'store', 'prime', 'wsg', 'videos', 'creatorcamp',
  ];

  let pollTimer = null;

  // ---------------------------------------------------------------------
  // Storage helpers
  // ---------------------------------------------------------------------

  function loadState() {
    return GM_getValue(STATE_KEY, null);
  }

  function saveState(state) {
    GM_setValue(STATE_KEY, state);
  }

  function loadCreds() {
    return GM_getValue(CREDS_KEY, null);
  }

  // ---------------------------------------------------------------------
  // Twitch Helix API
  //
  // We use the official Helix API with an app access token (client
  // credentials grant). This needs a free Twitch developer app (client id
  // + client secret). See the menu command to set it up. We do not use
  // any private/undocumented Twitch endpoints, so this should stay stable.
  // ---------------------------------------------------------------------

  function gmRequest(opts) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        ...opts,
        onload: resolve,
        onerror: () => reject(new Error('network error: ' + opts.url)),
        ontimeout: () => reject(new Error('timeout: ' + opts.url)),
      });
    });
  }

  async function getAccessToken(forceRefresh) {
    const cached = GM_getValue(TOKEN_KEY, null);
    if (!forceRefresh && cached && cached.expiresAt > Date.now() + 60000) {
      return cached.accessToken;
    }

    const creds = loadCreds();
    if (!creds || !creds.clientId || !creds.clientSecret) {
      throw new Error('missing Twitch API credentials, set them via the Tampermonkey menu');
    }

    const url = 'https://id.twitch.tv/oauth2/token'
      + '?client_id=' + encodeURIComponent(creds.clientId)
      + '&client_secret=' + encodeURIComponent(creds.clientSecret)
      + '&grant_type=client_credentials';

    const res = await gmRequest({ method: 'POST', url });
    if (res.status < 200 || res.status >= 300) {
      throw new Error('could not get access token, status ' + res.status);
    }

    const data = JSON.parse(res.responseText);
    const token = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    GM_setValue(TOKEN_KEY, token);
    return token.accessToken;
  }

  async function helixRequest(path, params, isRetry) {
    const creds = loadCreds();
    const token = await getAccessToken(false);
    const url = 'https://api.twitch.tv/helix/' + path + '?' + params.toString();

    const res = await gmRequest({
      method: 'GET',
      url,
      headers: {
        'Client-Id': creds.clientId,
        'Authorization': 'Bearer ' + token,
      },
    });

    if (res.status === 401 && !isRetry) {
      await getAccessToken(true);
      return helixRequest(path, params, true);
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Error('Helix error ' + res.status + ': ' + res.responseText);
    }
    return JSON.parse(res.responseText);
  }

  async function findGame(name) {
    const params = new URLSearchParams({ name });
    const data = await helixRequest('games', params);
    return data.data[0] || null;
  }

  // Helix returns streams sorted by viewer count, descending, by default.
  async function getTopStreams(gameId, count) {
    const params = new URLSearchParams();
    params.append('game_id', gameId);
    params.append('first', String(count));
    const data = await helixRequest('streams', params);
    return data.data;
  }

  async function getStreamByLogin(login) {
    const params = new URLSearchParams({ user_login: login });
    const data = await helixRequest('streams', params);
    return data.data[0] || null;
  }

  // ---------------------------------------------------------------------
  // Page detection
  // ---------------------------------------------------------------------

  function isDirectoryCategoryPage() {
    return /^\/directory\/(category|game)\/[^/]+\/?$/.test(location.pathname);
  }

  function isChannelPage() {
    const seg = location.pathname.split('/').filter(Boolean);
    if (seg.length !== 1) return false;
    return !RESERVED_PATHS.includes(seg[0].toLowerCase());
  }

  function currentChannelLogin() {
    const seg = location.pathname.split('/').filter(Boolean);
    return (seg[0] || '').toLowerCase();
  }

  // Twitch sets the tab title to "<Category> - Twitch" on directory pages.
  // If that fails, fall back to a humanized version of the URL slug.
  function detectCategoryName() {
    const title = document.title || '';
    const m = title.match(/^(.*?)\s+-\s+Twitch$/);
    if (m && m[1] && m[1].trim().toLowerCase() !== 'twitch') {
      return m[1].trim();
    }
    const seg = location.pathname.split('/').filter(Boolean);
    const slug = decodeURIComponent(seg[seg.length - 1] || '');
    return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // ---------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------

  GM_addStyle(`
    #ttv-watcher-btn {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 9999;
      padding: 10px 16px;
      background: #9147ff;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
    #ttv-watcher-btn:hover { background: #772ce8; }
    #ttv-watcher-hud {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 9999;
      background: #18181b;
      color: #efeff1;
      border: 1px solid #9147ff;
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      max-width: 280px;
    }
    #ttv-watcher-hud-stop {
      background: #3a3a3d;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      cursor: pointer;
    }
    #ttv-watcher-hud-stop:hover { background: #53535f; }
  `);

  function injectButton() {
    if (document.getElementById('ttv-watcher-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'ttv-watcher-btn';
    btn.textContent = '🎲 Random Top ' + CONFIG.topN;
    btn.addEventListener('click', onStartClick);
    document.body.appendChild(btn);
  }

  function removeButton() {
    const btn = document.getElementById('ttv-watcher-btn');
    if (btn) btn.remove();
  }

  function showHud(state) {
    removeHud();
    const hud = document.createElement('div');
    hud.id = 'ttv-watcher-hud';
    hud.innerHTML =
      '<div id="ttv-watcher-hud-text">Watcher aktiv: ' + escapeHtml(state.gameName) + '</div>'
      + '<button id="ttv-watcher-hud-stop">Stop</button>';
    document.body.appendChild(hud);
    document.getElementById('ttv-watcher-hud-stop').addEventListener('click', stopWatcher);
  }

  function removeHud() {
    const hud = document.getElementById('ttv-watcher-hud');
    if (hud) hud.remove();
  }

  function setHudStatus(text) {
    const el = document.getElementById('ttv-watcher-hud-text');
    if (el) el.textContent = text;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ---------------------------------------------------------------------
  // Watcher logic
  // ---------------------------------------------------------------------

  function stopWatcher() {
    saveState({ active: false });
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    removeHud();
  }

  async function onStartClick() {
    try {
      requireCreds();
    } catch (e) {
      alert(e.message);
      return;
    }

    const detected = detectCategoryName();
    const confirmed = window.prompt('Kategorie erkannt. Bei Bedarf korrigieren:', detected);
    if (!confirmed) return;

    injectButton(); // keep button, show a temporary status via title
    const original = document.getElementById('ttv-watcher-btn');
    if (original) original.textContent = 'Suche Kanaele ...';

    try {
      const game = await findGame(confirmed);
      if (!game) {
        alert('Kategorie nicht gefunden: ' + confirmed);
        return;
      }
      const streams = await getTopStreams(game.id, CONFIG.topN);
      if (!streams.length) {
        alert('Keine Live-Kanaele in dieser Kategorie gefunden.');
        return;
      }
      const pick = streams[Math.floor(Math.random() * streams.length)];
      const state = {
        active: true,
        gameId: game.id,
        gameName: game.name,
        tried: [pick.user_login],
        currentChannel: pick.user_login,
        pool: null, // filled again once the channel page has loaded
      };
      saveState(state);
      location.href = 'https://www.twitch.tv/' + pick.user_login;
    } catch (e) {
      alert('Fehler: ' + e.message);
      if (original) original.textContent = '🎲 Random Top ' + CONFIG.topN;
    }
  }

  function requireCreds() {
    const creds = loadCreds();
    if (!creds || !creds.clientId || !creds.clientSecret) {
      throw new Error(
        'Bitte zuerst Twitch API Zugangsdaten setzen: Tampermonkey Menue -> '
        + '"TTV Watcher: API Zugangsdaten setzen".'
      );
    }
  }

  function startPolling(state) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => checkAndMaybeSwitch(state), CONFIG.pollIntervalMs);
    setTimeout(() => checkAndMaybeSwitch(state), CONFIG.firstCheckDelayMs);
  }

  async function checkAndMaybeSwitch(state) {
    const fresh = loadState();
    if (!fresh || !fresh.active) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      return;
    }

    try {
      const stream = await getStreamByLogin(state.currentChannel);
      const offline = !stream;
      const wrongGame = stream && stream.game_id !== state.gameId;

      if (offline || wrongGame) {
        setHudStatus(offline ? 'Kanal offline. Waehle neuen Kanal ...' : 'Kategorie gewechselt. Waehle neuen Kanal ...');
        await switchToNextChannel(state);
      }
    } catch (e) {
      console.warn('[TTV Watcher] check failed:', e);
    }
  }

  // Fetch the current top-N of the category and drop every login already
  // tried this cycle (this includes the channel we are watching right now).
  // Runs right after a new channel page has loaded, so the next switch has
  // an up to date, already-filtered pool ready and can not re-pick it.
  async function refreshPool(state) {
    let candidates;
    try {
      candidates = await getTopStreams(state.gameId, CONFIG.topN);
    } catch (e) {
      console.warn('[TTV Watcher] pool refresh failed:', e);
      return;
    }

    const fresh = loadState();
    if (!fresh || !fresh.active || fresh.currentChannel !== state.currentChannel) return;

    let pool = candidates
      .map((c) => c.user_login)
      .filter((login) => !fresh.tried.includes(login));

    fresh.pool = pool;
    saveState(fresh);
  }

  async function switchToNextChannel(state) {
    let pool = Array.isArray(state.pool) ? state.pool : null;

    if (!pool || !pool.length) {
      let candidates;
      try {
        candidates = await getTopStreams(state.gameId, CONFIG.topN);
      } catch (e) {
        setHudStatus('Fehler bei der Suche, versuche es spaeter erneut.');
        return;
      }
      pool = candidates.map((c) => c.user_login).filter((login) => !state.tried.includes(login));
      if (!pool.length) {
        state.tried = [];
        pool = candidates.map((c) => c.user_login);
      }
    }

    if (!pool.length) {
      setHudStatus('Keine weiteren Kanaele in dieser Kategorie gefunden.');
      return;
    }

    const pick = pool[Math.floor(Math.random() * pool.length)];
    state.tried.push(pick);
    state.currentChannel = pick;
    state.pool = null; // filled again once the new channel page has loaded
    saveState(state);
    location.href = 'https://www.twitch.tv/' + pick;
  }

  // ---------------------------------------------------------------------
  // Menu commands
  // ---------------------------------------------------------------------

  GM_registerMenuCommand('TTV Watcher: API Zugangsdaten setzen', () => {
    const creds = loadCreds() || {};
    const clientId = window.prompt('Twitch Client ID:', creds.clientId || '');
    if (clientId === null) return;
    const clientSecret = window.prompt('Twitch Client Secret:', creds.clientSecret || '');
    if (clientSecret === null) return;
    GM_setValue(CREDS_KEY, { clientId: clientId.trim(), clientSecret: clientSecret.trim() });
    GM_setValue(TOKEN_KEY, null);
    alert('Zugangsdaten gespeichert.');
  });

  GM_registerMenuCommand('TTV Watcher: Stoppen', () => {
    stopWatcher();
    alert('TTV Watcher gestoppt.');
  });

  // ---------------------------------------------------------------------
  // Route change handling (Twitch is a single page app)
  // ---------------------------------------------------------------------

  (function hookHistory() {
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    function fire() { window.dispatchEvent(new Event('ttv-locationchange')); }
    history.pushState = function (...args) { origPush.apply(this, args); fire(); };
    history.replaceState = function (...args) { origReplace.apply(this, args); fire(); };
    window.addEventListener('popstate', fire);
  })();

  function init() {
    if (isDirectoryCategoryPage()) {
      injectButton();
    } else {
      removeButton();
    }

    const state = loadState();
    if (state && state.active && isChannelPage()) {
      state.currentChannel = currentChannelLogin();
      saveState(state);
      showHud(state);
      startPolling(state);
      refreshPool(state);
    } else {
      removeHud();
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }
  }

  window.addEventListener('ttv-locationchange', init);
  init();
})();
