/* Optional prompt helper: fixed public copy only, never submission or form data. */
(() => {
  'use strict';
  const subjects = Object.freeze({
    'shen-pao-yang': {name:'沈伯洋',origin:'https://puwa.taipei'},
    'su-chiao-hui': {name:'蘇巧慧',origin:'https://huiao-new-taipei.github.io'}
  });
  const knownSubject = value => typeof value === 'string' && Object.prototype.hasOwnProperty.call(subjects,value);
  function prompt(kind,id) {
    const person=subjects[id], form=type => person.origin + '/contribute/?type=' + type + '&subject=' + id;
    if (kind === 'quote') return `請幫我整理${person.name}值得核對的本人原話，準備投稿到國會紀錄觀測。
先看原話檔案：${person.origin}/#statements。同一事件只整理一筆，避免重複；無法確認是否已收錄時請註明。
優先找本人完整文章、完整影片或官方逐字稿。請列出：逐字原句、發言／發表日期、場合與前後文、完整公開 HTTPS 來源；影片附起訖時間，不能確認就寫「待查」，不要猜。
分成表單欄位：原話（600 字內）、主要來源、日期、時間點／位置、前後文、補充。評論與推論另列，不得捏造、拼接，或把他人的引述當作已核實的本人原話。
可幫我填入：${form('quote')}，先停在草稿讓我確認。未獲我明確授權，不要勾選同意或送出。
聯絡方式可不填；若我提供，只填私人聯絡欄，勿放進原話、補充或公開署名。`;
    return `請幫我為${person.name}準備一份網頁遊戲投稿。先確認我的玩法與素材，不得替真實人物編造發言。
已有作品：整理名稱（100 字內）、簡介與操作（1200 字內）、免登入可讀的公開 GitHub 專案首頁；若有，再補試玩網址、完整 commit SHA、程式／素材授權與外部服務／資料處理說明。引用現實言論時，附完整來源、日期、影片時間點與前後文。
作品表單：${form('game')}
只有點子：不需要假造 repo，把玩法、操作、計分、裝置與來源整理為 4000 字內 prompt，填好點子表單：https://puwa.taipei/contribute/?type=idea&subject=${id}
先讓我確認草稿；未獲我明確授權，不要公開 repo、部署、勾選同意或送出。聯絡方式可不填；若我提供，只填私人聯絡欄，不要混入公開內容。
投稿先經人工審核，點子不保證製作，作品也不會自動上架。`;
  }
  function subjectFor(kind) {
    const idea = document.getElementById('idea-form');
    const id = kind === 'quote' ? 'quote-subjectId' : idea && !idea.hidden ? 'idea-subjectId' : 'game-subjectId';
    const select = document.getElementById(id);
    return select?.tagName === 'SELECT' && knownSubject(select.value) ? select.value : null;
  }
  for (const helper of document.querySelectorAll('.agent-helper[data-agent-kind]')) {
    const kind = helper.dataset.agentKind;
    if (!['quote','game'].includes(kind)) continue;
    const field = helper.querySelector('.agent-helper-prompt'), copy = helper.querySelector('[data-copy-agent-prompt]'), status = helper.querySelector('.agent-helper-status');
    if (!field || field.tagName !== 'TEXTAREA' || field.readOnly !== true || !copy || !status) continue;
    let copying = false;
    function update() {
      const id = subjectFor(kind), next = id ? prompt(kind,id) : '請先在上方選擇有效的投稿人物，再複製提示詞。';
      if (field.value !== next) { field.value = next; status.textContent = ''; }
      copy.disabled = !id || copying;
      return id !== null;
    }
    for (const id of kind === 'quote' ? ['quote-subjectId'] : ['game-subjectId','idea-subjectId']) {
      document.getElementById(id)?.addEventListener('change',update);
    }
    for (const id of kind === 'quote' ? ['quote-form'] : ['game-form','idea-form']) {
      document.getElementById(id)?.addEventListener('reset',() => queueMicrotask(update));
    }
    if (kind === 'game') for (const button of document.querySelectorAll('[data-game-mode]')) button.addEventListener('click',() => queueMicrotask(update));
    helper.addEventListener('toggle',update);
    copy.addEventListener('click',async event => {
      event.preventDefault();
      if (copying || !update()) return;
      const text = field.value;
      copying = true; copy.disabled = true; status.textContent = '';
      try {
        // Keep selection and this legacy compatibility command inside the direct
        // click, before any await. Never copy another element's selection.
        let copied = false;
        try {
          field.focus(); field.select(); field.setSelectionRange(0,text.length);
          if (field.selectionStart === 0 && field.selectionEnd === text.length && typeof document.execCommand === 'function') copied = document.execCommand('copy') === true;
        } catch {}
        if (!copied) {
          if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('clipboard_unavailable');
          await navigator.clipboard.writeText(text);
        }
        if (field.value === text) status.textContent = '已複製，可以貼給你的 Agent。';
      } catch {
        if (field.value === text) {
          try { field.focus(); field.select(); field.setSelectionRange(0,text.length); } catch {}
          status.textContent = '無法自動複製，請選取上方文字後複製，或使用 Ctrl+C／⌘C。';
        }
      } finally { copying = false; update(); }
    });
    update();
  }
})();
