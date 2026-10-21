/* Shared catalogue rules. Only fixed site origins and explicit public fields survive. */
(function (global) {
  'use strict';
  const SUBJECTS = Object.freeze({'shen-pao-yang':'沈伯洋','su-chiao-hui':'蘇巧慧'});
  const CENTRAL_ORIGIN = 'https://puwa-taipei.github.io', SU_ORIGIN = 'https://huiao-new-taipei.github.io';
  const CATALOG_URL = CENTRAL_ORIGIN + '/data/game-catalog.json';
  const API_URL = 'https://wggebwlqsfxuwaocfpsf.supabase.co/functions/v1/intake-api';
  const origins = new Set([CENTRAL_ORIGIN,SU_ORIGIN]);
  const own = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);
  function subject(value) { return typeof value === 'string' && own(SUBJECTS,value) ? value : null; }
  function person(value) { return value === 'all' || value === null || value === undefined ? 'all' : subject(value); }
  function subjectIds(values,{legacy = false} = {}) {
    if (values === undefined) return legacy ? ['shen-pao-yang'] : null;
    if (!Array.isArray(values) || !values.length || values.length > 2 || values.some(value => !subject(value)) || new Set(values).size !== values.length) return null;
    return [...values];
  }
  function siteUrl(value,{cover = false} = {}) {
    if (typeof value !== 'string' || value.length > 2048) return null;
    try {
      const url = new URL(value);
      if (!origins.has(url.origin) || url.username || url.password || url.search || url.hash) return null;
      if (cover ? !/^\/assets\/[a-zA-Z0-9][a-zA-Z0-9/_-]*\.(?:png|jpe?g|webp)$/.test(url.pathname) : !/^\/game\/(?:quiz|red-notes)\/$/.test(url.pathname)) return null;
      // The red-note character/game remains the original Shen game on its original site.
      if (!cover && url.pathname === '/game/red-notes/' && url.origin !== CENTRAL_ORIGIN) return null;
      return url.href;
    } catch { return null; }
  }
  function string(value,max) { return typeof value === 'string' && value.trim() && value.length <= max ? value : null; }
  function builtin(value) {
    if (!value || typeof value !== 'object') return null;
    const ids = subjectIds(value.subjectIds), url = siteUrl(value.url), title = string(value.title,100), summary = string(value.summary,1200);
    if (!ids || !url || !title || !summary || !/^[a-z0-9-]{1,80}$/.test(value.id || '')) return null;
    if (new URL(url).origin === SU_ORIGIN && !ids.includes('su-chiao-hui')) return null;
    if (new URL(url).pathname === '/game/red-notes/' && !ids.includes('shen-pao-yang')) return null;
    return {id:value.id,subjectIds:ids,title,summary,url,coverUrl:siteUrl(value.coverUrl,{cover:true}),tags:Array.isArray(value.tags) ? value.tags.filter(tag => string(tag,30)).slice(0,4) : [],legacySubject:false};
  }
  function catalog(value) {
    if (!value || value.schemaVersion !== 1 || !Array.isArray(value.games) || value.games.length > 100) throw new Error('invalid_catalog');
    const games = value.games.map(builtin); if (games.some(game => !game)) throw new Error('invalid_catalog');
    if (new Set(games.map(game => game.id)).size !== games.length) throw new Error('invalid_catalog');
    return {games,snapshotAt:typeof value.snapshotAt === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value.snapshotAt) ? value.snapshotAt.slice(0,10) : '未標示'};
  }
  function filter(items,selected) { const id = person(selected); return id === null ? [] : id === 'all' ? [...items] : items.filter(item => item.subjectIds.includes(id)); }
  function localCover(value) { return typeof value === 'string' && /^\/assets\/community\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}\.(?:png|jpe?g)$/.test(value) ? CENTRAL_ORIGIN + value : null; }
  function publicHttps(value) {
    try { const url = new URL(value); const host = url.hostname.toLowerCase(); if (typeof value !== 'string' || value.length > 2048 || /\s/.test(value) || url.protocol !== 'https:' || url.username || url.password || url.port || !host.includes('.') || !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) || /^\d+(?:\.\d+)*$/.test(host) || /(?:^|\.)(localhost|local|internal|lan|home|test|invalid|example|onion|arpa)$/.test(host)) return null; return url.href; } catch { return null; }
  }
  function repository(value) {
    const url = publicHttps(value); if (!url) return null; const parsed = new URL(url);
    return parsed.hostname === 'github.com' && !parsed.search && !parsed.hash && /^\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/.test(parsed.pathname) && !parsed.pathname.endsWith('.git') && !/\/(\.|\.\.)$/.test(parsed.pathname) ? url : null;
  }
  function community(value) {
    if (!value || typeof value !== 'object' || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value.id || '')) return null;
    const ids = subjectIds(value.subjectIds,{legacy:true}), repoUrl = repository(value.repoUrl), title = string(value.title,100), summary = string(value.summary,1200);
    if (!ids || !repoUrl || !title || !summary || !/^[a-f\d]{40}$/i.test(value.commitSha || '') || !string(value.license,120) || !string(value.externalServices,1000)) return null;
    return {id:value.id,subjectIds:ids,title,summary,repoUrl,commitSha:value.commitSha.toLowerCase(),gameUrl:publicHttps(value.gameUrl),license:value.license,externalServices:value.externalServices,coverUrl:localCover(value.coverPath),creditName:string(value.creditName,60),publishedAt:typeof value.publishedAt === 'string' ? value.publishedAt.slice(0,64) : null,legacySubject:value.subjectIds === undefined};
  }
  function gamesUrl(api,selected,offset = 0) {
    const id = person(selected);
    if (api !== API_URL || !Number.isInteger(offset) || offset < 0 || offset > 1000 || id === null) throw new Error('invalid_request');
    const url = new URL(API_URL); url.searchParams.set('action','games'); url.searchParams.set('offset',String(offset)); url.searchParams.set('limit','24'); if (id !== 'all') url.searchParams.set('subjectId',id); return url.href;
  }
  function createPageStore(initial = 'all') {
    let selected = person(initial) || 'all', generation = 0, items = [];
    return {select(value) { const next = person(value); if (next === null) throw new Error('invalid_person'); selected = next; generation++; items = []; return generation; },ticket:() => generation,selected:() => selected,items:() => [...items],apply(ticket,rows) { if (ticket !== generation) return false; const known = new Set(items.map(item => item.id)); for (const row of rows) if (filter([row],selected).length && !known.has(row.id)) { items.push(row); known.add(row.id); } return true; }};
  }
  const api = {SUBJECTS,CENTRAL_ORIGIN,SU_ORIGIN,CATALOG_URL,API_URL,subject,person,subjectIds,siteUrl,catalog,builtin,filter,localCover,community,gamesUrl,createPageStore};
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (global) global.RecordsGameLibrary = api;
})(typeof window === 'undefined' ? null : window);
