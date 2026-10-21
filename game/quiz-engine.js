/* Shared homepage/standalone quiz. Timed round state is independent of the DOM. */
(() => {
  'use strict';
  const AUTO_DELAY = 1600;
  function quizProfile(options = {}, body = {}) {
    const speakers = {'shen-pao-yang':'沈伯洋','su-chiao-hui':'蘇巧慧'};
    const subjectId = Object.hasOwn(speakers,options.subjectId || body.subjectId) ? options.subjectId || body.subjectId : 'shen-pao-yang';
    const proposed = options.nominationDate ?? body.nominationDate ?? (subjectId === 'shen-pao-yang' ? '2026-05-13' : null);
    const nominationDate = typeof proposed === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(proposed) && Number.isFinite(Date.parse(proposed)) && new Date(proposed).toISOString().slice(0,10) === proposed ? proposed : null;
    return {subjectId,speaker:speakers[subjectId],pronoun:subjectId === 'su-chiao-hui' ? '她' : '他',nominationDate,seenKey:subjectId === 'shen-pao-yang' ? 'record-quiz-seen-v1' : 'record-quiz-seen-v1-' + subjectId};
  }
  function createRoundController(options = {}) {
    const schedule = options.schedule || setTimeout, cancel = options.cancel || clearTimeout;
    const onChange = options.onChange || (() => {}), delay = options.delay ?? AUTO_DELAY;
    let round = [], answers = [], index = 0, phase = 'empty', timer = null, generation = 0, automatic = true, held = false;
    const snapshot = () => {
      const correct = answers.filter(answer => answer.correct).length;
      return {round: [...round], answers: answers.map(answer => ({...answer})), index, phase, question: round[index] || null,
        correct, score: round.length ? Math.round(correct / round.length * 100) : null, automatic, held};
    };
    function invalidate() { generation++; if (timer !== null) cancel(timer); timer = null; }
    function emit(reason) { onChange(snapshot(), reason); }
    function arm() {
      invalidate(); if (phase !== 'feedback' || !automatic || held) return;
      const token = generation;
      timer = schedule(() => { if (token !== generation || phase !== 'feedback') return; next('auto'); }, delay);
    }
    function next(reason = 'manual') {
      if (phase !== 'feedback') return false;
      invalidate(); index++; held = false; phase = index < round.length ? 'asking' : 'results'; emit(reason); return true;
    }
    return {
      snapshot,
      start(rows) { invalidate(); round = [...rows]; answers = []; index = 0; held = false; phase = round.length ? 'asking' : 'empty'; emit('round'); },
      answer(choice) {
        if (phase !== 'asking' || typeof choice !== 'boolean') return false;
        // Every selected item is a sourced statement by the named person. No invented "No" fillers.
        const answer = {question: round[index], choice, answer: true, correct: choice === true};
        answers.push(answer); phase = 'feedback'; held = !automatic; emit('answer'); arm(); return true;
      },
      next,
      hold() { if (phase !== 'feedback') return; invalidate(); held = true; emit('hold'); },
      setAutomatic(value) { automatic = Boolean(value); held = !automatic; if (phase === 'feedback') arm(); emit('preference'); },
      destroy() { invalidate(); phase = 'empty'; round = []; answers = []; }
    };
  }

  // Allows focused Node tests of the actual timer/state logic, without a browser or DOM emulator.
  if (typeof module === 'object' && module.exports) module.exports = {createRoundController, AUTO_DELAY,quizProfile};
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = value => /^https?:\/\//i.test(String(value || '')) ? String(value) : null;
  const randomize = items => { const out = [...items]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };
  const mounted = new WeakMap();

  function mount(root = document, options = {}) {
    if (mounted.has(root)) return mounted.get(root);
    const $ = id => root.querySelector('#' + id), card = $('quiz-card'); if (!card) return null;
    const profile = quizProfile(options,document.body.dataset), seenKey = profile.seenKey, speaker = profile.speaker, pronoun = profile.pronoun;
    const play = card.closest('#play'), game = card.closest('.swipe-game');
    const text = (id, value) => { if ($(id)) $(id).textContent = value; };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const state = {quotes: Array.isArray(options.quotes) ? options.quotes : [], period: $('game-period')?.value || 'pre', seen: new Set(), drag: null, newCount: 0};
    if (!profile.nominationDate) { state.period = 'all'; if ($('game-period')) { $('game-period').value = 'all'; $('game-period').disabled = true; } }
    function mergeSeen(raw) {
      try { const stored = JSON.parse(raw ?? localStorage.getItem(seenKey) ?? '[]'); if (Array.isArray(stored)) for (const id of stored) if (typeof id === 'string') state.seen.add(id); } catch {}
    }
    mergeSeen();
    function remember(id) { mergeSeen(); state.seen.add(id); try { localStorage.setItem(seenKey, JSON.stringify([...state.seen].slice(-1200))); } catch {} }
    if (!card.parentElement.classList.contains('quiz-deck')) { const deck = document.createElement('div'); deck.className = 'quiz-deck'; card.before(deck); deck.append(card); }
    const deck = card.parentElement;
    card.setAttribute('aria-labelledby', 'quiz-question');
    card.setAttribute('aria-describedby', 'quiz-meta quiz-context quiz-swipe-help');
    const help = document.createElement('p'); help.id = 'quiz-swipe-help'; help.className = 'quiz-swipe-help';
    help.innerHTML = `<span>← 不是${pronoun}</span><span>拖曳卡片，或按方向鍵</span><span>是${pronoun} →</span>`; deck.after(help);
    const flash = document.createElement('div'); flash.className = 'quiz-answer-flash'; flash.hidden = true; flash.setAttribute('aria-hidden', 'true'); deck.append(flash);
    const dots = document.createElement('div'); dots.className = 'quiz-round-dots'; dots.setAttribute('aria-hidden', 'true'); game.querySelector('.quiz-progress').after(dots);
    const settings = document.createElement('div'); settings.className = 'quiz-autoplay-settings';
    settings.innerHTML = '<label><input id="quiz-auto-next" type="checkbox" checked> 自動換下一張</label><span>揭曉約 1.6 秒後換題，可隨時暫停</span>'; dots.after(settings);
    const autoInput = settings.querySelector('input');
    const results = document.createElement('section'); results.id = 'quiz-results'; results.className = 'quiz-results'; results.hidden = true; results.setAttribute('aria-label', '本輪逐題回顧');
    play.querySelector('.quiz-layout').after(results);
    $('quiz-no').innerHTML = `<span aria-hidden="true">×</span><b>不是${pronoun}</b><small>NO · ←</small>`;
    $('quiz-yes').innerHTML = `<span aria-hidden="true">✓</span><b>是${pronoun}</b><small>YES · →</small>`;
    $('quiz-no').setAttribute('aria-label', '不是' + speaker + '的原話，向左選'); $('quiz-yes').setAttribute('aria-label', '是' + speaker + '的原話，向右選');
    const pool = () => state.quotes.filter(q => q.quizEligible !== false).filter(q => { const date = String(q.eventDate || q.date).slice(0,10); return !profile.nominationDate || state.period === 'all' || (state.period === 'pre' ? date < profile.nominationDate : date >= profile.nominationDate); });
    const announce = message => { const live = $('announcement') || document.getElementById('announcement'); if (live) live.textContent = message; };
    function info() {
      const rows = pool(), seen = rows.filter(q => state.seen.has(q.id)).length, period = {pre:'正式提名前', post:'正式提名起', all:'所有時期'}[state.period];
      text('quiz-pool-count', rows.length); text('quiz-seen-count', seen + ' / ' + rows.length);
      text('game-period-note', `${period}：${rows.length} 段、${new Set(rows.map(q => q.eventId || q.id)).size} 個事件／文章。${profile.nominationDate ? '正式提名切點 ' + profile.nominationDate + '。' : '尚未設定可核對的正式提名切點，目前使用所有已收錄時期。'}`);
      const length = controller.snapshot().round.length;
      text('quiz-round-note', state.newCount ? `本輪 ${length} 題，${state.newCount} 題尚未看過。同一輪不重複事件；換時期會重開一輪。` : '本期都看過了？這輪換個順序，盡量避開上一輪。');
      text('quote-selection', `本範圍精選 ${rows.length} 段本人公開言論／文章，答案均為「是」；這是有意挑選的原話遊戲，不加入虛構的「否」題。媒體引述、官方逐字稿與書面文章逐題標示；最後可看本輪完整來源。`);
    }
    function clearDrag() { state.drag = null; card.classList.remove('is-dragging','is-left','is-right'); card.style.transform = ''; card.style.setProperty('--swipe-yes','0'); card.style.setProperty('--swipe-no','0'); }
    function sourceHTML(q) {
      const links = [], primary = safeUrl(q.url || q.sourceURL), video = safeUrl(q.videoUrl), full = safeUrl(q.fullVideoUrl || q.fullMeetingVideoUrl);
      if (primary) links.push(`<a href="${esc(primary)}" target="_blank" rel="noopener noreferrer">讀原文與上下文 ↗</a>`);
      if (video) links.push(`<a href="${esc(video)}" target="_blank" rel="noopener noreferrer">${esc(q.videoLabel || '看官方發言影片')} ↗</a>`);
      if (full && full !== video) links.push(`<a href="${esc(full)}" target="_blank" rel="noopener noreferrer">${esc(q.fullVideoLabel || '看完整會議影片')} ↗</a>`);
      const locator = q.evidenceLocator || q.timecode || '', limit = q.inferenceLimit || q.editorialLimit || q.cannotInfer || '';
      return `<blockquote>「${esc(q.quote)}」</blockquote><p>${esc(q.date)} · ${esc(q.medium === 'written' ? '書面文章' : '口語發言')} · ${esc(q.venue || '公開發言')}</p><p>${esc(q.context || '')}</p><p class="quiz-source-type">${esc(q.sourceType || '來源類型請見原始連結')}</p>${locator ? `<p class="quiz-locator"><b>影片／原文位置</b><br>${esc(locator)}</p>` : ''}<div class="quiz-source-actions">${links.join('')}</div>${limit ? `<p class="quiz-inference-limit"><b>證據範圍：</b>${esc(limit)}</p>` : ''}`;
    }
    function renderDots(s) { dots.innerHTML = s.round.map((_,i) => `<span class="${s.answers[i] ? s.answers[i].correct ? 'dot-correct' : 'dot-wrong' : s.index === i && s.phase !== 'results' ? 'dot-current' : ''}">${s.answers[i] ? s.answers[i].correct ? '✓' : '×' : i + 1}</span>`).join(''); }
    function updateHold(s) {
      autoInput.checked = s.automatic;
      const note = $('quiz-feedback').querySelector('.quiz-auto-note');
      if (note) note.textContent = s.held ? '已停在本題。看完原文，再按下一張。' : s.index === s.round.length - 1 ? '即將顯示本輪成績與逐題回顧。' : '即將換下一張，完整來源會留在本輪回顧。';
      $('quiz-feedback').classList.toggle('quiz-auto-held', s.held);
      if (s.held) { flash.hidden = true; card.classList.remove('quiz-answer-leave'); }
    }
    function renderReview(s) {
      const wrong = s.answers.length - s.correct;
      results.innerHTML = `<div class="quiz-review-heading"><div><p class="quiz-review-eyebrow">THE ROUND, IN CONTEXT</p><h3>你的選擇，回到每一段原話。</h3><p>答對 ${s.correct} 題${wrong ? ` · ${wrong} 題可以再看一次` : ' · 本輪全部答對'}。點開卡片，讀原文與上下文。</p></div><button type="button" class="quiz-review-restart">再玩一輪 ↻</button></div><div class="quiz-review-list">${s.answers.map((answer,i) => { const q = answer.question; return `<details class="quiz-review-item ${answer.correct ? 'review-correct' : 'review-wrong'}" data-question-id="${esc(q.id)}"><summary><span class="quiz-review-number">${String(i+1).padStart(2,'0')}</span><span class="quiz-review-main"><b>「${esc(q.quote)}」</b><small>你選「${answer.choice ? '是' : '否'}」 · 正解「是」 · ${esc(q.date)}</small></span><span class="quiz-review-badge">${answer.correct ? '✓ 答對' : '× 猜錯'}</span><span class="quiz-review-expand" aria-hidden="true">＋</span></summary><div class="quiz-review-content"><p class="quiz-review-answer">${q.medium === 'written' ? '這是' + esc(speaker) + '寫的。' : '這是' + esc(speaker) + '的公開發言。'}${answer.correct ? '你認出這段原話。' : '這段原話與你的第一印象不同。'}</p>${sourceHTML(q)}</div></details>`; }).join('')}</div>`;
      const contribute = document.createElement('p'); contribute.className = 'small-note';
      contribute.append(document.createTextNode('有更完整的原話來源，或發現需要更正的地方？ '));
      const contributeLink = document.createElement('a'); contributeLink.className = 'text-link'; contributeLink.href = '/contribute/?type=quote' + (profile.subjectId === 'shen-pao-yang' ? '' : '&subject=' + profile.subjectId); contributeLink.textContent = '補上來源，交由人工審核 ↗'; contribute.append(contributeLink); results.append(contribute);
      results.hidden = false; results.querySelector('.quiz-review-restart').addEventListener('click', () => drawRound(true));
    }
    function focusQuestion() { if (play.contains(document.activeElement)) card.focus({preventScroll:true}); }
    function render(s, reason) {
      if (reason === 'hold' || reason === 'preference') { updateHold(s); return; }
      const activeBefore = document.activeElement;
      const focusInChangingControls = $('quiz-controls').contains(activeBefore) || $('quiz-feedback').contains(activeBefore) || activeBefore === $('quiz-next');
      // Preserve a Tab/Enter player's landing point before disabled/hidden controls lose focus.
      // An unrelated field or link elsewhere on the page never has its focus taken here.
      if (focusInChangingControls) card.focus({preventScroll:true});
      clearDrag(); renderDots(s); autoInput.checked = s.automatic; card.dataset.phase = s.phase;
      $('quiz-no').disabled = $('quiz-yes').disabled = s.phase !== 'asking';
      text('quiz-score', s.round.length ? `答對 ${s.correct} / ${s.round.length} 題` : '—');
      if (s.phase === 'feedback') {
        const answer = s.answers.at(-1), q = answer.question;
        card.classList.add('is-answered', answer.choice ? 'answered-yes' : 'answered-no', 'quiz-answer-leave'); card.dataset.decision = answer.choice ? 'yes' : 'no';
        flash.hidden = false; flash.className = 'quiz-answer-flash ' + (answer.correct ? 'flash-correct' : 'flash-wrong');
        flash.innerHTML = `<span class="quiz-flash-symbol">${answer.correct ? '✓' : '×'}</span><strong>${answer.correct ? '答對了！' : '猜錯了，原文有答案。'}</strong><span>這${q.medium === 'written' ? '段，確實是' + pronoun + '寫的。' : '句，確實是' + pronoun + '說的。'}</span><small>目前答對 ${s.correct} / ${s.round.length} 題</small>`;
        const feedback = $('quiz-feedback'); feedback.hidden = false; feedback.classList.toggle('incorrect', !answer.correct);
        feedback.innerHTML = `<div class="quiz-feedback-topline"><span class="quiz-answer-pill ${answer.correct ? 'pill-correct' : 'pill-wrong'}">${answer.correct ? '✓ 答對' : '× 猜錯'}</span><strong>你選「${answer.choice ? '是' : '否'}」 · 答案是「是」</strong><button type="button" class="quiz-hold-button">停一下，看原文</button></div><p class="quiz-auto-note"></p><span class="quiz-auto-meter" aria-hidden="true"></span><details class="quiz-current-source"><summary>本題原話、影片與上下文</summary><div>${sourceHTML(q)}</div></details>`;
        const holdButton = feedback.querySelector('.quiz-hold-button');
        const openCurrentSource = () => { controller.hold(); const details = feedback.querySelector('details'); details.open = true; details.querySelector('summary').focus({preventScroll:true}); };
        // Open at pointerdown before focus or a pending auto transition can change the hit target.
        // Keep click for keyboard/assistive activation; assigning open=true twice is harmless.
        holdButton.addEventListener('pointerdown', event => { event.preventDefault(); event.stopPropagation(); openCurrentSource(); });
        holdButton.addEventListener('click', openCurrentSource);
        feedback.querySelector('details').addEventListener('toggle', event => { if (event.target.open) controller.hold(); });
        $('quiz-controls').hidden = true; $('quiz-next').hidden = false; text('quiz-next', s.index === s.round.length - 1 ? '看本輪成績與回顧 →' : '下一張原話 →');
        updateHold(s); announce(`${answer.correct ? '答對' : '猜錯'}。答案是「是」。目前答對 ${s.correct} 題。`); return;
      }
      flash.hidden = true; card.classList.remove('is-answered','answered-yes','answered-no','quiz-complete','quiz-answer-leave','quiz-question-enter'); card.dataset.decision = '';
      $('quiz-feedback').hidden = true; $('quiz-next').hidden = true; $('quiz-controls').hidden = s.phase !== 'asking';
      settings.hidden = s.phase === 'empty' || s.phase === 'results'; help.hidden = s.phase !== 'asking'; results.hidden = true;
      card.querySelector('.quiz-kind').textContent = s.phase === 'results' ? 'ROUND COMPLETE' : 'WHO SAID / WROTE IT?';
      if (s.phase === 'results') {
        card.setAttribute('aria-describedby','quiz-meta');
        const high = s.score >= 80, low = s.score <= 50;
        card.classList.add('quiz-complete'); card.dataset.questionId = ''; card.dataset.eventId = '';
        text('quiz-progress','本輪完成'); text('quiz-score',`${s.score} / 100 分`); text('quiz-meta',`答對 ${s.correct} / ${s.round.length} 題`); text('quiz-context','');
        $('quiz-question').innerHTML = `<span class="quiz-final-score" style="--quiz-score-angle:${s.score * 3.6}deg"><b>${s.score}</b><small>分 / 100</small></span><span class="quiz-final-message">${high ? '恭喜，你把原話認出來了！' : low ? '別被印象的洋流帶走，從答錯的幾題回頭看原文。' : '有幾句出乎意料？回頭看本輪原文。'}</span>`;
        card.querySelector('.quiz-foot').textContent = `本輪等權計分：答對題數 ÷ ${s.round.length} × 100，四捨五入。這是原話辨識得分。`;
        renderReview(s); announce(`本輪完成，${s.score} 分。答對 ${s.correct}／${s.round.length} 題。下方可逐題回顧來源。`); focusQuestion(); return;
      }
      if (s.phase === 'empty') {
        card.dataset.questionId = ''; text('quiz-progress','題庫尚未載入'); text('quiz-meta','SOURCE REQUIRED'); text('quiz-context',''); text('quiz-question','題庫暫時無法讀取。\n請重新整理後再試。'); card.querySelector('.quiz-foot').textContent = '每個答案都需要可追溯的來源。'; $('quiz-restart').hidden = true; info(); return;
      }
      const q = s.question; remember(q.id); card.dataset.questionId = q.id; card.dataset.eventId = q.eventId || q.id;
      card.setAttribute('aria-describedby','quiz-meta quiz-context quiz-swipe-help');
      text('quiz-progress',`${s.index + 1} / ${s.round.length} 題`); text('quiz-meta',`${q.date} · ${q.medium === 'written' ? '書面文章' : '口語發言'}`);
      text('quiz-context',q.frontContext || q.context || '先憑印象回答，最後可以逐題讀原文。');
      text('quiz-question',`「${q.quote}」\n這是${speaker}${q.medium === 'written' ? '寫的' : '說的'}嗎？`); card.querySelector('.quiz-foot').textContent = `左滑不是${pronoun} ／ 右滑是${pronoun} ／ 也可用方向鍵`;
      if (reason !== 'round') { card.classList.add('quiz-question-enter'); focusQuestion(); }
      $('quiz-restart').hidden = false; info();
      announce(`第 ${s.index+1}／${s.round.length} 題。${q.date}，${q.medium === 'written' ? '書面文章' : '口語發言'}。「${q.quote}」。這是${speaker}${q.medium === 'written' ? '寫的' : '說的'}嗎？`);
    }
    const controller = createRoundController({onChange:render, delay:AUTO_DELAY});
    function drawRound(focus = false) {
      mergeSeen(); const rows = pool(), previous = new Set(controller.snapshot().round.map(q => q.id));
      const prioritized = items => randomize(items).sort((a,b) => {
        const tier = q => Number.isFinite(Number(q.editorialRank)) ? Math.floor((Number(q.editorialRank)-1)/12) : Number.isFinite(Number(q.quizPriority)) ? -Math.floor(Number(q.quizPriority)/10) : 999;
        return tier(a)-tier(b);
      });
      const candidates = [...prioritized(rows.filter(q => !state.seen.has(q.id))), ...prioritized(rows.filter(q => state.seen.has(q.id) && !previous.has(q.id))), ...randomize(rows.filter(q => state.seen.has(q.id) && previous.has(q.id)))];
      const events = new Set(), chosen = [];
      for (const q of candidates) { const event = q.eventId || q.id; if (events.has(event)) continue; events.add(event); chosen.push(q); if (chosen.length === 6) break; }
      state.newCount = chosen.filter(q => !state.seen.has(q.id)).length; controller.start(randomize(chosen)); if (focus) card.focus({preventScroll:true});
    }
    $('quiz-no').addEventListener('click', () => controller.answer(false)); $('quiz-yes').addEventListener('click', () => controller.answer(true));
    $('quiz-next').addEventListener('click', () => controller.next()); $('quiz-restart').addEventListener('click', () => drawRound(true));
    autoInput.addEventListener('change', () => controller.setAutomatic(autoInput.checked));
    $('game-period')?.addEventListener('change', event => { state.period = event.target.value; drawRound(); });
    $('quiz-feedback').addEventListener('focusin', () => controller.hold()); $('quiz-feedback').addEventListener('pointerdown', () => controller.hold());
    card.addEventListener('keydown', event => { if (['ArrowLeft','ArrowRight','a','A','d','D'].includes(event.key)) { event.preventDefault(); if (!event.repeat) controller.answer(['ArrowRight','d','D'].includes(event.key)); } });
    card.addEventListener('pointerdown', event => {
      if (controller.snapshot().phase !== 'asking' || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || event.target.closest('a,button,input,select,details')) return;
      state.drag = {id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,lastAt:performance.now(),velocity:0,locked:false};
    });
    card.addEventListener('pointermove', event => {
      const d = state.drag; if (!d || d.id !== event.pointerId) return;
      const dx = event.clientX-d.x, dy = event.clientY-d.y;
      if (!d.locked) { if (Math.abs(dy)>10 && Math.abs(dy)>Math.abs(dx)*1.15) { clearDrag(); return; } if (Math.abs(dx)<9 || Math.abs(dx)<Math.abs(dy)*1.15) return; d.locked = true; card.classList.add('is-dragging'); try { card.setPointerCapture(event.pointerId); } catch {} }
      if (event.cancelable) event.preventDefault(); const now = performance.now(); d.velocity=(event.clientX-d.lastX)/Math.max(1,now-d.lastAt); d.lastX=event.clientX; d.lastAt=now;
      const threshold=Math.min(125,Math.max(68,card.offsetWidth*.22)),progress=Math.min(1,Math.abs(dx)/threshold);
      card.style.setProperty('--swipe-yes',String(dx>0?progress:0)); card.style.setProperty('--swipe-no',String(dx<0?progress:0)); card.classList.toggle('is-right',dx>0); card.classList.toggle('is-left',dx<0);
      if (!reduced.matches) card.style.transform=`translate(${Math.max(-240,Math.min(240,dx*.88))}px, ${Math.min(18,Math.abs(dx)*.035)}px) rotate(${Math.max(-13,Math.min(13,dx/19))}deg)`;
    },{passive:false});
    card.addEventListener('pointerup', event => {
      const d=state.drag; if (!d || d.id!==event.pointerId) return;
      const dx=event.clientX-d.x,threshold=Math.min(125,Math.max(68,card.offsetWidth*.22)),commit=d.locked && (Math.abs(dx)>=threshold || (Math.abs(dx)>42 && Math.abs(d.velocity)>.65 && Math.sign(d.velocity)===Math.sign(dx)));
      clearDrag(); if (card.hasPointerCapture(event.pointerId)) card.releasePointerCapture(event.pointerId); if (commit) controller.answer(dx>0);
    });
    card.addEventListener('pointercancel',clearDrag); card.addEventListener('lostpointercapture',()=>{if(state.drag)clearDrag();});
    window.addEventListener('blur',()=>{clearDrag();controller.hold();}); document.addEventListener('visibilitychange',()=>{if(document.hidden)controller.hold();});
    window.addEventListener('storage',event=>{if(event.key===seenKey){mergeSeen(event.newValue);info();}});
    const api={setQuotes(quotes){state.quotes=Array.isArray(quotes)?quotes:[];drawRound();},reset(){drawRound();}}; mounted.set(root,api); drawRound(); return api;
  }
  window.RecordsQuiz={mount};
  if(document.querySelector('[data-standalone-quiz]')) fetch('/data/quotes.json',{cache:'no-cache'}).then(response=>{if(!response.ok)throw new Error('quotes '+response.status);return response.json();}).then(data=>mount(document,{quotes:data.quotes})).catch(()=>mount(document,{quotes:[]}));
})();
