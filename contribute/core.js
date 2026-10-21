/* Shared validation for contribution forms. No network, storage, or secrets. */
(function (global) {
  'use strict';
  const SUBJECTS = Object.freeze({'shen-pao-yang':'沈伯洋','su-chiao-hui':'蘇巧慧'});
  const subjectId = value => typeof value === 'string' && Object.prototype.hasOwnProperty.call(SUBJECTS,value) ? value : null;
  function draftStorageKey(kind,subject) { if (!['quote','game'].includes(kind) || !subjectId(subject)) throw new Error('invalid_draft_target'); return 'record-contribution-draft-v2-' + kind + '-' + subject; }
  const LIMITS = Object.freeze({quote:600,sourceUrl:2048,locator:240,context:2000,note:1000,title:100,summary:1200,repoUrl:2048,commitSha:40,gameUrl:2048,screenshotUrl:2048,license:120,assetRights:1200,externalServices:1000,creditName:60,contactValue:2048});
  const forbidden = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ud800-\udfff]/u;
  const clean = value => typeof value === 'string' ? value.trim() : '';
  function publicHttps(value) {
    if (typeof value !== 'string' || value.length > 2048 || /\s/.test(value)) return null;
    try {
      const url = new URL(value), host = url.hostname.toLowerCase();
      if (url.protocol !== 'https:' || url.username || url.password || url.port || !host.includes('.') || !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) || /(?:^|\.)(localhost|local|internal|lan|home|test|invalid|example|onion|arpa)$/.test(host) || /^\d+(?:\.\d+)*$/.test(host) || host.includes(':')) return null;
      return url.href;
    } catch { return null; }
  }
  function repository(value) {
    const normalized = publicHttps(value); if (!normalized) return null;
    const url = new URL(normalized);
    if (url.hostname !== 'github.com' || url.search || url.hash || url.port) return null;
    const path = url.pathname.replace(/\/$/, '').replace(/\.git$/i, '');
    if (!/^\/[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?\/[a-z\d_.-]{1,100}$/i.test(path) || /\/(?:\.|\.\.)$/.test(path)) return null;
    return 'https://github.com' + path;
  }
  function cover(value) {
    const normalized = publicHttps(value);
    return normalized && /\.(png|jpe?g)$/i.test(new URL(normalized).pathname) ? normalized : null;
  }
  function calendarDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value && Number(value.slice(0,4)) >= 1900;
  }
  function validate(kind, values) {
    const errors = {}, payload = {};
    if (!['quote','game'].includes(kind)) return {ok:false,errors:{kind:'請選擇投稿類型。'}};
    const target = subjectId(values.subjectId === undefined ? 'shen-pao-yang' : values.subjectId);
    if (!target) errors.subjectId = '請選擇這份投稿主要關於的人物。'; else payload.subjectId = target;
    function text(key, label, required = true) {
      const value = clean(values[key]);
      if (required && !value) errors[key] = '請填寫' + label + '。';
      else if (value.length > LIMITS[key]) errors[key] = label + '最多 ' + LIMITS[key] + ' 字元。';
      else if (forbidden.test(value)) errors[key] = label + '含有無法收錄的控制字元。';
      if (value) payload[key] = value;
      return value;
    }
    function link(key, label, required = true, parser = publicHttps) {
      const value = text(key, label, required);
      if (value) { const normalized = parser(value); if (!normalized) errors[key] = label + '須為公開的 HTTPS 網址，不能含帳密。'; else payload[key] = normalized; }
    }
    if (kind === 'quote') {
      text('quote','原話'); link('sourceUrl','主要來源');
      const sourceDate = clean(values.sourceDate);
      payload.dateUnknown = values.dateUnknown === true || !sourceDate;
      if (payload.dateUnknown) payload.sourceDate = null;
      else if (!calendarDate(sourceDate)) errors.sourceDate = '日期若有填寫，請使用有效日期；不確定可留空。';
      else payload.sourceDate = sourceDate;
      text('locator','來源位置',false); text('context','前後文與背景',false); text('note','補充／收錄理由',false);
      for (const key of ['locator','context','note']) payload[key] ??= '';
    } else {
      text('title','遊戲名稱'); text('summary','遊戲簡介');
      link('repoUrl','公開 GitHub 原始碼',true,repository);
      if (errors.repoUrl && clean(values.repoUrl)) errors.repoUrl = '請填入 https://github.com/擁有者/專案 的公開儲存庫，不是分支或檔案網址。';
      const sha = clean(values.commitSha); if (sha && !/^[a-f\d]{40}$/i.test(sha)) errors.commitSha = '版本編號若有填寫，請貼上 40 個十六進位字元的完整 commit SHA。'; else payload.commitSha = sha.toLowerCase();
      link('gameUrl','第三方試玩網址',false);
      link('screenshotUrl','封面來源',false,cover);
      if (errors.screenshotUrl && clean(values.screenshotUrl)) errors.screenshotUrl = '封面須為公開 HTTPS 的 PNG 或 JPG 圖片網址（路徑以 .png、.jpg 或 .jpeg 結尾）。';
      text('license','程式授權',false); text('assetRights','素材授權與權利說明',false); text('externalServices','外部服務說明',false); text('note','其他補充',false);
      for (const key of ['gameUrl','screenshotUrl']) payload[key] ??= null;
      for (const key of ['license','assetRights','externalServices','note']) payload[key] ??= '';
      payload.rightsConfirmed = values.rightsConfirmed === true;
    }
    const name = clean(values.creditName);
    payload.creditName = '';
    payload.creditConsent = values.creditConsent === true;
    if (name) {
      if (name.length > 60 || forbidden.test(name) || /[\r\n\t@]|:\/\//i.test(name)) errors.creditName = '公開署名最多 60 字元，請勿放 Email、網址或控制字元。';
      else if (!payload.creditConsent) errors.creditConsent = '要附上署名，需同意公開顯示；也可以清空署名。';
      else payload.creditName = name;
    }
    const contactValue = clean(values.contactValue); let contact;
    if (contactValue) {
      if (values.contactConsent !== true) errors.contactConsent = '要留下聯絡方式，需同意審稿團隊私下保存；也可以清空此欄。';
      const contactKind = values.contactKind;
      if (contactKind === 'email') {
        if (contactValue.length > 254 || !/^[^\s@<>]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(contactValue) || forbidden.test(contactValue)) errors.contactValue = '請填寫有效的 Email（最多 254 字元）。';
        else contact = {kind:'email',value:contactValue,consent:true};
      } else if (contactKind === 'url') {
        const url = publicHttps(contactValue); if (!url) errors.contactValue = '聯絡網址須為公開 HTTPS 網址。'; else contact = {kind:'url',value:url,consent:true};
      } else errors.contactKind = '請選擇聯絡方式類型。';
    }
    if (values.reviewConsent !== true) errors.reviewConsent = '請先閱讀並同意投稿說明。';
    // Leave room for the server's canonical optional fields inside its 16 KiB limit.
    if (!Object.keys(errors).length && new TextEncoder().encode(JSON.stringify({kind,payload})).length > 16000) errors.note = '整份投稿篇幅過長，請縮短補充、背景或網址，總內容需小於 16 KB。';
    return {ok:Object.keys(errors).length === 0,errors,payload,contact};
  }
  const draftFields = {quote:['subjectId','quote','sourceUrl','sourceDate','dateUnknown','locator','context','note','creditName'],game:['subjectId','title','summary','repoUrl','commitSha','gameUrl','screenshotUrl','license','assetRights','externalServices','note','creditName']};
  function sanitizeDraft(kind, values) {
    const result = {};
    for (const key of draftFields[kind] || []) {
      if (key === 'subjectId') { if (subjectId(values[key])) result[key] = values[key]; }
      else if (key === 'dateUnknown') result[key] = values[key] === true;
      else if (typeof values[key] === 'string') result[key] = values[key].slice(0, LIMITS[key] || 10);
    }
    return result;
  }
  function nonceTracker(uuid) {
    let previous = '', nonce = '';
    return {
      get(kind, payload, contact, website = '') {
        const signature = JSON.stringify({kind,payload,contact:contact || null,website});
        if (signature !== previous) { nonce = uuid(); previous = signature; }
        return nonce;
      },
      reset() { previous = ''; nonce = ''; }
    };
  }
  function localCover(value) { return typeof value === 'string' && /^\/assets\/community\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\.(?:png|jpe?g)$/.test(value) ? value : null; }
  const api = {SUBJECTS,subjectId,draftStorageKey,LIMITS,publicHttps,repository,cover,calendarDate,validate,sanitizeDraft,nonceTracker,localCover};
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (global) global.ContributionCore = api;
})(typeof window === 'undefined' ? null : window);
