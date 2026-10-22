(function (root) {
  'use strict';
  const list = value => Array.isArray(value) ? value : [];
  const safeURL = value => {
    try { const u = new URL(value); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : null; }
    catch { return null; }
  };
  function validLibrary(data) {
    return data?.subjectId === 'su-chiao-hui' && data?.version === 'su-quiz-v7' &&
      Array.isArray(data.quotes) && data.quotes.every(q => q && typeof q.id === 'string' &&
        typeof q.quote === 'string' && typeof q.speaker === 'string' && safeURL(q.sourceURL || q.url)) &&
      new Set(data.quotes.map(q => q.id)).size === data.quotes.length;
  }
  function filterQuotes(rows, filters = {}) {
    const term = String(filters.search || '').normalize('NFKC').toLocaleLowerCase();
    return list(rows).filter(q => (!filters.caseId || (q.caseId || q.eventId) === filters.caseId) &&
      (!filters.role || filters.role === 'all' || (filters.role === '本人' ? q.speaker === '蘇巧慧' : q.speaker !== '蘇巧慧')) &&
      (!term || [q.quote, q.title, q.caseLabel, q.context, q.speaker].join('\n').normalize('NFKC').toLocaleLowerCase().includes(term)));
  }
  function counts(rows) {
    const own = list(rows).filter(q => q.speaker === '蘇巧慧');
    return { total: rows.length, own: own.length, replies: rows.length - own.length,
      events: new Set(rows.map(q => q.eventId)).size, ownEvents: new Set(own.map(q => q.eventId)).size,
      quiz: own.filter(q => q.quizEligible === true && q.useInQuiz === true).length };
  }
  const core = { validLibrary, filterQuotes, counts, safeURL };
  if (typeof module === 'object' && module.exports) module.exports = core;
  if (!root?.document) return;
  const doc = root.document, $ = id => doc.getElementById(id);
  const container = $('curated-quote-list');
  if (!container) return;
  const node = (tag, value, cls) => { const el = doc.createElement(tag); if (value !== undefined) el.textContent = value; if (cls) el.className = cls; return el; };
  const link = (label, value) => { const url = safeURL(value); if (!url) return null; const a = node('a', label); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
  const state = { rows: [], limit: root.matchMedia('(max-width:700px)').matches ? 3 : 6, filters: {} };
  function render() {
    const rows = filterQuotes(state.rows, state.filters), shown = rows.slice(0, state.limit);
    container.replaceChildren();
    $('library-results').textContent = `符合 ${rows.length} 則 · 先看 ${shown.length} 則`;
    for (const q of shown) {
      const article = node('article', undefined, 'library-quote'); article.id = 'quote-' + q.id;
      const meta = node('div', undefined, 'library-meta');
      meta.append(node('span', q.caseLabel || q.topic || '政治攻防'), node('span', q.speaker === '蘇巧慧' ? '本人原話' : '競辦／相關單位回應', q.speaker === '蘇巧慧' ? 'library-own' : 'library-reply'));
      article.append(meta, node('h3', q.title || '公開發言'), node('blockquote', q.quote));
      article.append(node('p', `${q.speaker} · ${q.date || '日期待核'} · ${q.quoteKind || '爭議相關發言'}`, 'library-byline'));
      article.append(node('p', q.context || q.frontContext || '請連同來源閱讀。'));
      const sources = node('div', undefined, 'library-links');
      for (const [label, url] of [['查原文 ↗', q.sourceURL || q.url], [q.videoLabel || '來源影片（秒數未核）↗', q.videoUrl]]) {
        const a = link(label, url); if (a) sources.append(a);
      }
      article.append(sources);
      const detail = node('details', undefined, 'library-evidence'); detail.append(node('summary', '核對方式、補充來源與界線 ＋'));
      detail.append(node('p', q.sourceType || q.verificationLevel || '來源類型見原文'));
      if (q.dateLabel) detail.append(node('p', q.dateLabel));
      if (q.evidenceLocator) detail.append(node('p', q.evidenceLocator));
      if (q.audioVerified !== true) detail.append(node('p', '本句未完成原音逐秒核聽；沒有標示精準剪輯時間。'));
      if (q.inferenceLimit) detail.append(node('p', q.inferenceLimit));
      for (const [i, url] of list(q.additionalSourceURLs).entries()) { const a = link(`補充來源 ${i + 1} ↗`, url); if (a) detail.append(a); }
      article.append(detail);
      if (q.speaker === '蘇巧慧' && q.quizEligible === true && q.useInQuiz === true) container.append(article);
      else {
        const context = node('details', undefined, 'library-context-row');
        context.append(node('summary', `對照資料 · ${q.speaker} · ${q.title || q.caseLabel} ＋`), article);
        container.append(context);
      }
    }
    if (!rows.length) container.append(node('p', '目前篩選沒有符合的原話。', 'empty-note'));
    $('library-more').hidden = shown.length >= rows.length;
    $('library-less').hidden = state.limit <= (root.matchMedia('(max-width:700px)').matches ? 3 : 6);
  }
  async function init() {
    try {
      const response = await fetch('/data/quote-library-v7.json?v=7', { cache: 'no-cache' });
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json(); if (!validLibrary(data)) throw new Error('Invalid library');
      state.rows = data.quotes.slice().sort((a, b) => (a.editorialRank ?? 999) - (b.editorialRank ?? 999) || String(b.date).localeCompare(String(a.date)));
      const n = counts(state.rows);
      $('library-coverage').textContent = `${n.own} 則本人原話，來自 ${n.ownEvents} 個事件／文章；另收 ${n.replies} 則競辦／相關單位回應。這是有意挑選的選集，不代表全部言論比例。`;
      for (const el of doc.querySelectorAll('[data-library-total]')) el.textContent = n.quiz;
      for (const el of doc.querySelectorAll('[data-library-events]')) el.textContent = new Set(state.rows.filter(q => q.speaker === '蘇巧慧' && q.quizEligible && q.useInQuiz).map(q => q.eventId)).size;
      const select = $('library-case'), cases = new Map();
      for (const q of state.rows) if (!cases.has(q.caseId || q.eventId)) cases.set(q.caseId || q.eventId, q.caseLabel || q.topic || q.title);
      for (const [id, label] of cases) { const option = node('option', label); option.value = id; select.append(option); }
      const reset = () => { state.limit = root.matchMedia('(max-width:700px)').matches ? 3 : 6; render(); };
      select.addEventListener('change', () => { state.filters.caseId = select.value; reset(); });
      $('library-role').addEventListener('change', e => { state.filters.role = e.target.value; reset(); });
      $('library-search').addEventListener('input', e => { state.filters.search = e.target.value; reset(); });
      $('library-more').addEventListener('click', () => { state.limit += root.matchMedia('(max-width:700px)').matches ? 3 : 6; render(); });
      $('library-less').addEventListener('click', () => { reset(); $('library-results').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
      render();
    } catch {
      $('library-coverage').textContent = '新版語料暫時無法讀取，請重新整理。舊版原始資料仍保留在下方。';
      $('library-more').hidden = true; $('library-less').hidden = true;
    }
  }
  init();
})(typeof window === 'undefined' ? null : window);
