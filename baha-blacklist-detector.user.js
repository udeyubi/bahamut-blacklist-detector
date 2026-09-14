// ==UserScript==
// @name         巴哈黑名單偵測
// @namespace    http://tampermonkey.net/
// @version      1.0.6
// @author       udeyubi
// @description  偵測將你加入黑名單的使用者，並可隱藏內容或自動反黑。
// @match        https://forum.gamer.com.tw/C.php*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      avatar1.gamer.com.tw
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEYS = {
    settings: 'baha_blacklist_settings_v1',
    cache: 'baha_blk_cache_v2',
  };

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    hideBlockedContent: true,
    autoBlockBack: true,
    cacheHours: 24,
    requestInterval: 1500,
    debug: false,
  });

  const SETTING_OPTIONS = Object.freeze({
    cacheHours: [12, 24, 72, 168],
    requestInterval: [1500, 2000, 3000, 5000],
  });

  const safeJsonParse = (value, fallback) => {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  };

  const allowedNumber = (value, choices, fallback) => {
    const number = Number(value);
    return choices.includes(number) ? number : fallback;
  };

  const settingsStore = {
    load() {
      const saved = safeJsonParse(localStorage.getItem(STORAGE_KEYS.settings), {});
      return {
        ...DEFAULT_SETTINGS,
        ...saved,
        cacheHours: allowedNumber(saved.cacheHours, SETTING_OPTIONS.cacheHours, DEFAULT_SETTINGS.cacheHours),
        requestInterval: allowedNumber(saved.requestInterval, SETTING_OPTIONS.requestInterval, DEFAULT_SETTINGS.requestInterval),
      };
    },
    save(settings) {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    },
  };

  let settings = settingsStore.load();
  const cache = safeJsonParse(localStorage.getItem(STORAGE_KEYS.cache), {});
  const saveCache = () => localStorage.setItem(STORAGE_KEYS.cache, JSON.stringify(cache));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const log = (...args) => settings.debug && console.debug('[巴哈黑名單偵測]', ...args);
  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  const uidFromHref = (href) => {
    const match = (href || '').match(/home\.gamer\.com\.tw\/(\w+)/);
    return match && match[1] !== 'profile' ? match[1] : null;
  };

  const replyAvatarHref = document.querySelector('.c-reply__editor .reply-avatar')?.href || '';
  const bahaBlkCurrentUid = uidFromHref(replyAvatarHref);
  const isLoggedIn = Boolean(bahaBlkCurrentUid) && !/\/login\.php(?:[?#]|$)/i.test(replyAvatarHref);

  function fetchShop(uid) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://avatar1.gamer.com.tw/shop.php?reciver=${encodeURIComponent(uid)}&settype=2`,
        timeout: 15000,
        onload: (response) => resolve({
          html: response.responseText || '',
          finalUrl: response.finalUrl || '',
        }),
        onerror: () => resolve(null),
        ontimeout: () => resolve(null),
      });
    });
  }

  async function checkUser(uid) {
    const response = await fetchShop(uid);
    if (!response) return 'unknown';

    const { html, finalUrl } = response;
    if (/user\.gamer\.com\.tw\/login\.php/i.test(finalUrl)
      || /<form[^>]+action=["'][^"']*\/login\.php/i.test(html)) {
      log('登入狀態已失效，略過偵測', uid);
      return 'unknown';
    }

    const match = html.match(/class=["']AR-myar6["'][^>]*>\s*帳號：([A-Za-z0-9_]+)/);
    const status = match && match[1].toLowerCase() !== uid.toLowerCase() ? 'blocked' : 'ok';
    cache[uid] = { s: status, t: Date.now() };
    saveCache();
    return status;
  }

  function collectTargets(root = document) {
    const targets = new Map();
    const add = (uid, element) => {
      if (!uid || uid === bahaBlkCurrentUid || !element || element.dataset.blkScanned) return;
      if (!targets.has(uid)) targets.set(uid, new Set());
      targets.get(uid).add(element);
    };

    root.querySelectorAll('.c-section').forEach((section) => {
      const uidElement = section.querySelector('.c-post__header__author a.userid');
      const uid = uidElement?.textContent.trim();
      add(uid, uidElement);
      add(uid, section.querySelector('.c-post__header__author a.username'));
      add(uid, section.querySelector('.c-user__avatar'));
    });

    root.querySelectorAll('a.reply-content__user').forEach((element) => {
      add(uidFromHref(element.href), element);
    });
    return targets;
  }

  function mark(elements, status) {
    if (status !== 'blocked') return;

    addBlockedBadge(elements);
    if (!settings.hideBlockedContent) return;

    const removed = new Set();
    elements.forEach((element) => {
      const container = element?.closest('.c-reply__item') || element?.closest('.c-section');
      if (container && !removed.has(container)) {
        container.remove();
        removed.add(container);
      }
    });
    log('已隱藏內容', removed.size);
  }

  function addBlockedBadge(elements) {
    const anchors = new Set();

    elements.forEach((element) => {
      if (!element) return;
      const section = element.closest('.c-section');
      const anchor = section?.querySelector('.c-post__header__author a.userid')
        || element.closest('.c-reply__item')?.querySelector('a.reply-content__user')
        || (element.matches('a.userid, a.reply-content__user') ? element : null);
      if (anchor) anchors.add(anchor);
    });

    anchors.forEach((anchor) => {
      if (anchor.parentElement?.querySelector(':scope > .blk-detected-badge')) return;
      const badge = document.createElement('span');
      badge.className = 'blk-detected-badge';
      badge.textContent = '已偵測到將你黑單';
      badge.title = '此使用者已將你加入黑名單';
      anchor.insertAdjacentElement('afterend', badge);
    });
  }

  async function blockBack(uid) {
    if (!settings.autoBlockBack || !bahaBlkCurrentUid || typeof pageWindow.GamerCard?.friendAdd !== 'function') return;
    const style = document.createElement('style');
    style.textContent = 'dialog.dialogify { display: none !important; }';
    document.head.appendChild(style);
    pageWindow.GamerCard.friendAdd(bahaBlkCurrentUid, uid, 2);
    log('已自動反黑', uid);
    setTimeout(() => {
      document.querySelectorAll('dialog.dialogify[open]').forEach((dialog) => {
        dialog.close();
        dialog.remove();
      });
      style.remove();
    }, 1500);
  }

  const pending = new Map();
  let queueRunning = false;

  function enqueue(targets) {
    if (!settings.enabled || !isLoggedIn) return;
    const cacheTtl = settings.cacheHours * 60 * 60 * 1000;

    targets.forEach((elements, uid) => {
      const cached = cache[uid];
      if (cached && Date.now() - cached.t < cacheTtl) {
        mark(elements, cached.s);
        elements.forEach((element) => (element.dataset.blkScanned = '1'));
        return;
      }

      const entry = pending.get(uid) || { uid, elements: new Set() };
      elements.forEach((element) => {
        entry.elements.add(element);
        element.dataset.blkScanned = 'pending';
      });
      pending.set(uid, entry);
    });

    if (!queueRunning && pending.size) void runQueue();
  }

  async function runQueue() {
    queueRunning = true;
    while (pending.size && settings.enabled && isLoggedIn) {
      const [uid, entry] = pending.entries().next().value;
      const status = await checkUser(uid);
      log('偵測完成', uid, status);
      if (status === 'blocked') await blockBack(uid);
      mark(entry.elements, status);
      entry.elements.forEach((element) => {
        if (element?.isConnected) element.dataset.blkScanned = '1';
      });
      pending.delete(uid);
      await sleep(settings.requestInterval);
    }
    queueRunning = false;
  }

  function injectStyles() {
    if (document.getElementById('blk-settings-style')) return;
    const style = document.createElement('style');
    style.id = 'blk-settings-style';
    style.textContent = `
      .blk-modal-backdrop { position: fixed; inset: 0; z-index: 100000; display: grid; place-items: center; padding: 16px; background: rgba(0,0,0,.55); }
      .blk-modal { width: min(440px, 100%); overflow: hidden; border-radius: 10px; background: #fff; color: #333; box-shadow: 0 16px 48px rgba(0,0,0,.35); font-size: 14px; }
      .blk-modal__header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #ddd; }
      .blk-modal__header h2 { margin: 0; font-size: 19px; }
      .blk-modal__close { border: 0; background: transparent; color: #777; font-size: 24px; cursor: pointer; }
      .blk-modal__body { display: grid; gap: 14px; padding: 18px 20px; }
      .blk-modal__dependent { display: grid; gap: 14px; min-width: 0; margin: 0; padding: 0; border: 0; transition: opacity .15s ease; }
      .blk-modal__dependent:disabled { opacity: .42; }
      .blk-modal__dependent:disabled label { cursor: not-allowed; }
      .blk-modal__check { display: flex; gap: 9px; align-items: center; cursor: pointer; }
      .blk-modal__field { display: grid; grid-template-columns: 1fr 130px; gap: 12px; align-items: center; }
      .blk-modal select { box-sizing: border-box; width: 100%; padding: 7px 9px; border: 1px solid #bbb; border-radius: 5px; background: #fff; color: #333; }
      .blk-modal__note { margin: 0; color: #777; font-size: 12px; line-height: 1.55; }
      .blk-modal__warning { padding: 10px 12px; border: 1px solid #d99a36; border-radius: 6px; background: #fff8e7; color: #8a5700; line-height: 1.5; }
      .blk-modal__footer { display: flex; justify-content: space-between; gap: 10px; padding: 14px 20px; border-top: 1px solid #ddd; }
      .blk-modal button { padding: 7px 13px; border: 1px solid #bbb; border-radius: 5px; cursor: pointer; }
      .blk-modal__save { border-color: #117e96 !important; background: #117e96; color: #fff; }
      .blk-detected-badge { display: inline-flex; align-items: center; margin-left: 7px; padding: 2px 7px; border: 1px solid #d94848; border-radius: 999px; background: #fff0f0; color: #c52f2f; font-size: 11px; font-weight: 600; line-height: 1.4; vertical-align: middle; white-space: nowrap; }
      @media (prefers-color-scheme: dark) { .blk-modal { background: #252525; color: #eee; } .blk-modal__header, .blk-modal__footer { border-color: #444; } .blk-modal select { background: #171717; color: #eee; border-color: #666; } }
      @media (prefers-color-scheme: dark) { .blk-modal__warning { border-color: #8a6428; background: #3e3420; color: #ffd88f; } }
      @media (prefers-color-scheme: dark) { .blk-detected-badge { border-color: #d65a5a; background: #492424; color: #ffaaaa; } }
    `;
    document.head.appendChild(style);
  }

  function openSettings() {
    document.querySelector('.blk-modal-backdrop')?.remove();
    injectStyles();
    const backdrop = document.createElement('div');
    backdrop.className = 'blk-modal-backdrop';
    backdrop.innerHTML = `
      <form class="blk-modal" aria-labelledby="blk-modal-title">
        <div class="blk-modal__header"><h2 id="blk-modal-title">黑名單處理</h2><button type="button" class="blk-modal__close" aria-label="關閉">&times;</button></div>
        <div class="blk-modal__body">
          ${isLoggedIn ? '' : '<div class="blk-modal__warning">目前尚未登入巴哈姆特，黑名單偵測不會執行，也不會發送偵測請求。</div>'}
          <label class="blk-modal__check"><input name="enabled" type="checkbox">啟用偵測誰黑名單我</label>
          <fieldset class="blk-modal__dependent">
            <label class="blk-modal__check"><input name="hideBlockedContent" type="checkbox">隱藏對方的文章與留言</label>
            <label class="blk-modal__check"><input name="autoBlockBack" type="checkbox">偵測到有人黑單我時自動反向黑單</label>
            <label class="blk-modal__field"><span>快取時間</span><select name="cacheHours"><option value="12">12 小時</option><option value="24">1 天（建議）</option><option value="72">3 天</option><option value="168">7 天</option></select></label>
            <label class="blk-modal__field"><span>請求間隔</span><select name="requestInterval"><option value="1500">1.5 秒（建議）</option><option value="2000">2 秒</option><option value="3000">3 秒</option><option value="5000">5 秒</option></select></label>
            <label class="blk-modal__check"><input name="debug" type="checkbox">在 Console 顯示除錯訊息</label>
          </fieldset>
          <p class="blk-modal__note">設定只儲存在目前瀏覽器的 localStorage。變更偵測或隱藏設定後，重新整理頁面即可完整套用。</p>
        </div>
        <div class="blk-modal__footer"><button type="button" data-action="clear-cache">清除偵測快取</button><button type="submit" class="blk-modal__save">儲存設定</button></div>
      </form>`;
    document.body.appendChild(backdrop);

    const form = backdrop.querySelector('form');
    Object.entries(settings).forEach(([key, value]) => {
      const input = form.elements.namedItem(key);
      if (!input) return;
      if (input.type === 'checkbox') input.checked = value;
      else input.value = value;
    });

    const enabledInput = form.elements.namedItem('enabled');
    const dependentSettings = form.querySelector('.blk-modal__dependent');
    const syncDependentSettings = () => {
      dependentSettings.disabled = !enabledInput.checked;
    };
    enabledInput.addEventListener('change', syncDependentSettings);
    syncDependentSettings();

    const close = () => backdrop.remove();
    backdrop.querySelector('.blk-modal__close').addEventListener('click', close);
    backdrop.addEventListener('click', (event) => event.target === backdrop && close());
    backdrop.querySelector('[data-action="clear-cache"]').addEventListener('click', () => {
      Object.keys(cache).forEach((key) => delete cache[key]);
      saveCache();
      alert('偵測快取已清除。');
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      settings = {
        enabled: form.elements.enabled.checked,
        hideBlockedContent: form.elements.hideBlockedContent.checked,
        autoBlockBack: form.elements.autoBlockBack.checked,
        cacheHours: allowedNumber(form.elements.cacheHours.value, SETTING_OPTIONS.cacheHours, DEFAULT_SETTINGS.cacheHours),
        requestInterval: allowedNumber(form.elements.requestInterval.value, SETTING_OPTIONS.requestInterval, DEFAULT_SETTINGS.requestInterval),
        debug: form.elements.debug.checked,
      };
      settingsStore.save(settings);
      close();
      alert('黑名單處理設定已儲存，重新整理後會完整套用。');
    });
  }

  function installMenuItem() {
    const list = document.querySelector('#BH-menu-path .BH-menu-forumA-right.dropList > dl');
    if (!list || list.querySelector('[data-blk-settings]')) return;
    const item = document.createElement('dd');
    const link = document.createElement('a');
    link.href = 'javascript:void(0)';
    link.dataset.blkSettings = '1';
    link.textContent = isLoggedIn ? ' 黑名單處理' : ' 黑名單處理（未登入）';
    link.addEventListener('click', (event) => {
      event.preventDefault();
      openSettings();
    });
    item.appendChild(link);
    list.appendChild(item);
  }

  injectStyles();
  installMenuItem();
  enqueue(collectTargets());

  new MutationObserver((mutations) => {
    installMenuItem();
    const hasNewContent = mutations.some((mutation) =>
      [...mutation.addedNodes].some(
        (node) => node.nodeType === 1 && (node.matches?.('.c-reply__item, .c-section') || node.querySelector?.('.c-reply__item, .c-section')),
      ),
    );
    if (hasNewContent) enqueue(collectTargets());
  }).observe(document.body, { childList: true, subtree: true });
})();
