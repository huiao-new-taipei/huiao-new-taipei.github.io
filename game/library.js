/* One shared catalogue and one public community API, mirrored by both observation sites. */
(() => {
  'use strict';
  const C = window.RecordsGameLibrary, select = document.getElementById('library-person'); if (!C || !select) return;
  const $ = id => document.getElementById(id), node = (tag,text,cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  const initial = C.person(new URLSearchParams(location.search).get('person')) || 'all', store = C.createPageStore(initial);
  select.value = initial;
  let builtins = [], api = '', nextOffset = 0, hasMore = false, loading = false, controller = null, communityPhase = 'loading', catalogPhase = 'loading';
  function labels(ids) { return ids.map(id => C.SUBJECTS[id]).join('／'); }
  function external(text,url,cls) { const link = node('a',text,cls); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer'; return link; }
  function cover(item,cls) {
    const box = node('div',undefined,cls);
    if (item.coverUrl) { const img = node('img'); img.src = item.coverUrl; img.alt = item.title + ' 遊戲封面'; img.width = 1200; img.height = 630; img.loading = 'lazy'; img.addEventListener('error', () => { img.remove(); box.classList.add('library-cover-placeholder'); box.append(node('span',item.title)); },{once:true}); box.append(img); }
    else { box.classList.add('library-cover-placeholder'); box.append(node('small','THE RECORD / GAME'),node('span',item.title)); }
    return box;
  }
  function counts() {
    const visible = C.filter(builtins,store.selected()).length, loaded = store.items().length;
    $('library-count').textContent = `內建${catalogPhase === 'ok' ? ' ' + visible + ' 款' : catalogPhase === 'loading' ? '確認中' : '尚未確認'} · 社群${communityPhase === 'ok' || communityPhase === 'partial' ? '已載入 ' + loaded + ' 款' : communityPhase === 'loading' ? '確認中' : '尚未確認'}`;
  }
  function renderBuiltins() {
    const list = $('builtin-games'), visible = C.filter(builtins,store.selected()); list.replaceChildren();
    for (const item of visible) {
      const link = node('a',undefined,'arcade-game-card'); link.href = item.url;
      const art = cover(item,'arcade-cover'); art.append(node('span','PLAY NOW','arcade-live'));
      const copy = node('div',undefined,'arcade-card-copy'), tags = node('div',undefined,'arcade-card-tags'); tags.append(node('span',labels(item.subjectIds))); for (const tag of item.tags) tags.append(node('span',tag));
      const row = node('div',undefined,'arcade-play-row'); row.append(node('span','前往原站遊玩'),node('b','↗')); row.lastChild.setAttribute('aria-hidden','true');
      copy.append(tags,node('h3',item.title),node('p',item.summary),row); link.append(art,copy); list.append(link);
    }
    $('builtin-empty').hidden = visible.length !== 0;
    $('builtin-empty').textContent = catalogPhase === 'loading' ? '正在確認共用遊戲目錄…' : catalogPhase !== 'ok' ? '目前無法確認內建遊戲資料。' : store.selected() === 'all' ? '目前沒有可確認的內建遊戲資料。' : `目前沒有 ${C.SUBJECTS[store.selected()]} 的內建遊戲；下方仍可查看經發布的社群投稿。`;
    counts();
  }
  function renderCommunity() {
    const list = $('community-game-list'); list.replaceChildren();
    for (const item of store.items()) {
      const article = node('article',undefined,'community-card'), copy = node('div',undefined,'community-copy'); article.append(cover(item,'community-cover'));
      copy.append(node('p','審稿後收錄 · ' + labels(item.subjectIds),'community-tag'),node('h3',item.title),node('p',item.summary,'community-description'));
      if (item.legacySubject) copy.append(node('p','舊版人物標籤未提供，按原站沈伯洋資料顯示。','community-credit'));
      if (item.creditName) copy.append(node('p','作者署名：' + item.creditName,'community-credit'));
      const meta = node('dl');
      for (const [label,value,url] of [['公開原始碼',item.repoUrl.replace('https://github.com/',''),item.repoUrl],['收錄版本',item.commitSha,item.repoUrl + '/tree/' + item.commitSha],['程式授權',item.license,null]]) { const row = node('div'), dd = node('dd'); row.append(node('dt',label),dd); dd.append(url ? external(value + (label === '公開原始碼' ? ' ↗' : ''),url) : node('span',value)); meta.append(row); }
      copy.append(meta,node('p','外部服務與資料處理：' + item.externalServices,'community-description'));
      if (item.gameUrl) copy.append(external('第三方試玩 ↗',item.gameUrl,'community-play')); else copy.append(node('p','未提供線上試玩，執行方式請見公開原始碼。','community-no-demo'));
      article.append(copy); list.append(article);
    }
    counts();
  }
  async function json(url,limit,signal) {
    const response = await fetch(url,{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal}); if (!response.ok) throw new Error('unavailable');
    const raw = await response.text(); if (raw.length > limit) throw new Error('oversize'); return JSON.parse(raw);
  }
  async function loadCatalog() {
    let result = null, offline = false;
    const preview = ['127.0.0.1','localhost'].includes(location.hostname) && new URLSearchParams(location.search).get('catalog') === 'local';
    if (!preview) { const cancel = new AbortController(), timer = setTimeout(() => cancel.abort(),6000); try { result = C.catalog(await json(C.CATALOG_URL,150000,cancel.signal)); } catch {} finally { clearTimeout(timer); } }
    if (!result) { offline = true; try { result = C.catalog(await json('/data/game-catalog.json?v=17',150000)); } catch {} }
    if (result) { catalogPhase = 'ok'; builtins = result.games; $('catalog-status').textContent = offline ? `目前顯示本站離線備份（快照 ${result.snapshotAt}），尚未確認中央目錄最新狀態。` : `兩站共用中央遊戲目錄 · 目錄快照 ${result.snapshotAt}。人物觀測原始資料仍由各站分別維護。`; $('catalog-status').classList.toggle('library-offline',offline); }
    else { catalogPhase = 'unavailable'; $('catalog-status').textContent = '中央目錄與本站備份暫時無法讀取，不能確認目前的內建遊戲。'; }
    renderBuiltins();
  }
  async function loadPage() {
    if (loading || !api) return;
    const ticket = store.ticket(), selected = store.selected(), offset = nextOffset;
    loading = true; communityPhase = 'loading'; $('community-more').disabled = true; $('community-status').textContent = '正在確認這個人物範圍的已發布投稿…'; counts();
    controller = new AbortController(); const activeController = controller, timer = setTimeout(() => activeController.abort(),10000);
    try {
      const result = await json(C.gamesUrl(api,selected,offset),250000,activeController.signal);
      if (ticket !== store.ticket()) return;
      if (!Array.isArray(result.items) || result.items.length > 24 || typeof result.hasMore !== 'boolean') throw new Error('invalid');
      const rows = result.items.map(C.community); if (rows.some(row => !row)) throw new Error('invalid');
      if (!store.apply(ticket,rows)) return;
      hasMore = result.hasMore;
      if (hasMore && (!Number.isInteger(result.nextOffset) || result.nextOffset <= offset || result.nextOffset > 1000)) throw new Error('invalid');
      if (hasMore) nextOffset = result.nextOffset;
      communityPhase = 'ok'; renderCommunity();
      const count = store.items().length;
      $('community-status').textContent = count ? `已載入 ${count} 款符合人物範圍的已發布投稿${hasMore ? '，可繼續載入下一批' : ''}。試玩會前往第三方網站。` : hasMore ? '這一批尚無符合的卡片，仍有下一批可讀；目前不推定總數為零。' : '這個人物範圍目前沒有已發布的投稿遊戲。';
      $('community-more').hidden = !hasMore; $('community-more').textContent = '再看更多投稿遊戲';
    } catch {
      if (ticket !== store.ticket()) return;
      communityPhase = store.items().length ? 'partial' : 'unavailable';
      $('community-status').textContent = store.items().length ? '目前保留已載入的投稿；下一批暫時無法確認，請稍後重試。' : '目前無法確認這個人物的社群清單，不能以零款推定。內建遊戲仍可遊玩。';
      $('community-more').hidden = false; $('community-more').textContent = '重新讀取'; renderCommunity();
    } finally {
      clearTimeout(timer);
      if (ticket === store.ticket()) { loading = false; $('community-more').disabled = false; counts(); }
    }
  }
  function choose(value) {
    if (!C.person(value)) return;
    controller?.abort(); loading = false; store.select(value); nextOffset = 0; hasMore = false; communityPhase = 'loading'; $('community-more').hidden = true;
    const url = new URL(location.href); url.searchParams.set('person',value); history.replaceState(null,'',url.pathname + url.search);
    for (const link of document.querySelectorAll('[data-contribute-game]')) link.href = '/contribute/?type=game' + (value === 'all' ? '' : '&subject=' + encodeURIComponent(value));
    renderBuiltins(); renderCommunity();
    if (api) loadPage();
  }
  select.addEventListener('change',() => choose(select.value)); $('community-more').addEventListener('click',loadPage);
  choose(initial); loadCatalog();
  (async () => {
    try {
      const config = await json('/contribute/config.json?v=17',8000);
      if (config.apiUrl !== C.API_URL) throw new Error('not_configured'); api = C.API_URL; await loadPage();
    } catch { communityPhase = 'unavailable'; $('community-status').textContent = '社群收件與清單目前尚未連線，沒有載入投稿，也不顯示假造資料。'; counts(); }
  })();
})();
