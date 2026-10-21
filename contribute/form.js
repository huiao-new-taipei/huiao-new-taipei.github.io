/* Public intake: explicit submissions only; a receipt is never simulated. */
(() => {
  'use strict';
  const core = window.ContributionCore; if (!core) return;
  let apiUrl = '', activeKind = 'quote';
  const forms = [...document.querySelectorAll('form[data-kind]')], sessions = new Map();
  const legacyStorageKey = kind => 'record-contribution-draft-v1-' + kind;
  const querySubject = core.subjectId(new URLSearchParams(location.search).get('subject'));
  const defaultSubject = querySubject || core.subjectId(document.body.dataset.subjectId) || 'shen-pao-yang';
  const targetOf = form => core.subjectId(form.elements.namedItem('subjectId').value) || defaultSubject;
  const storageKey = form => core.draftStorageKey(form.dataset.kind,targetOf(form));
  const clearDraft = form => { localStorage.removeItem(storageKey(form)); if (targetOf(form) === 'shen-pao-yang') localStorage.removeItem(legacyStorageKey(form.dataset.kind)); };
  for (const form of forms) { const field = form.elements.namedItem('subjectId'); field.value = defaultSubject; for (const option of field.options) option.defaultSelected = option.value === defaultSubject; }
  const status = document.getElementById('connection-status');
  const node = (tag, text, className) => { const out = document.createElement(tag); if (text !== undefined) out.textContent = text; if (className) out.className = className; return out; };
  function readValues(form) {
    const values = {};
    for (const field of form.elements) if (field.name) values[field.name] = field.type === 'checkbox' ? field.checked : field.value;
    return values;
  }
  function resetOptionalDetails(form) {
    for (const details of form.querySelectorAll('.optional-details')) details.open = false;
  }
  function revealField(field) {
    for (let parent = field.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
    field.focus();
  }
  function updateCounts(form) {
    for (const count of form.querySelectorAll('[data-count]')) { const field = form.elements.namedItem(count.dataset.count); count.textContent = field.value.length + ' / ' + field.maxLength; }
    const unknown = form.elements.namedItem('dateUnknown'); if (unknown) form.elements.namedItem('sourceDate').disabled = unknown.checked;
    const contact = form.elements.namedItem('contactValue'); contact.maxLength = form.elements.namedItem('contactKind').value === 'email' ? 254 : 2048;
  }
  function setReady(form) {
    const session = sessions.get(form);
    for (const field of form.querySelectorAll('input,textarea,select,[data-action]')) field.disabled = session.busy;
    if (!session.busy) updateCounts(form);
    form.querySelector('[type=submit]').disabled = !apiUrl || session.busy || session.success || !globalThis.crypto?.randomUUID;
  }
  function changeKind(kind, focus = false) {
    activeKind = kind;
    for (const k of ['quote','game']) { const tab = document.getElementById('tab-' + k); tab.setAttribute('aria-selected', String(k === kind)); tab.tabIndex = k === kind ? 0 : -1; document.getElementById('panel-' + k).hidden = k !== kind; }
    if (focus) document.getElementById('tab-' + kind).focus();
    const query = new URL(location.href); query.searchParams.set('type', kind); query.searchParams.set('subject',targetOf(document.querySelector('form[data-kind="' + kind + '"]'))); history.replaceState(null, '', query.pathname + query.search);
  }
  for (const kind of ['quote','game']) {
    const tab = document.getElementById('tab-' + kind);
    tab.addEventListener('click', () => changeKind(kind));
    tab.addEventListener('keydown', event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); changeKind(event.key === 'Home' ? 'quote' : event.key === 'End' ? 'game' : activeKind === 'quote' ? 'game' : 'quote', true); } });
  }
  const initialKind = new URLSearchParams(location.search).get('type'); if (['quote','game'].includes(initialKind)) changeKind(initialKind);
  function clearErrors(form) {
    form.querySelector('.error-summary').hidden = true;
    for (const message of form.querySelectorAll('.field-error')) message.remove();
    for (const field of form.querySelectorAll('[aria-invalid]')) {
      field.removeAttribute('aria-invalid');
      const description = (field.getAttribute('aria-describedby') || '').split(' ').filter(id => id && !id.endsWith('-error'));
      if (description.length) field.setAttribute('aria-describedby', description.join(' ')); else field.removeAttribute('aria-describedby');
    }
  }
  function showErrors(form, errors) {
    clearErrors(form);
    const box = form.querySelector('.error-summary'); box.replaceChildren(node('h3','還有幾個地方需要補上。'));
    const list = node('ul'); let firstField = null;
    for (const [key, text] of Object.entries(errors)) {
      const field = form.elements.namedItem(key); if (!field) continue;
      firstField ||= field;
      // A folded optional section must never conceal a validation error.
      for (let parent = field.parentElement; parent && parent !== form; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
      if (!field.id) field.id = form.dataset.kind + '-' + key;
      const id = field.id + '-error', error = node('p', text, 'field-error'); error.id = id;
      (field.closest('.field') || field.closest('label') || field).after(error);
      field.setAttribute('aria-invalid','true'); field.setAttribute('aria-describedby', ((field.getAttribute('aria-describedby') || '') + ' ' + id).trim());
      const item = node('li'), link = node('a',text); link.href = '#' + field.id; link.addEventListener('click', event => { event.preventDefault(); revealField(field); }); item.append(link); list.append(item);
    }
    box.append(list); box.hidden = false;
    if (firstField) revealField(firstField); else box.focus();
  }
  function failure(form, heading, text) {
    const box = form.querySelector('.submission-status'); box.className = 'submission-status failure'; box.replaceChildren(node('h3',heading), node('p',text)); box.hidden = false; box.focus();
  }
  function receipt(form, result) {
    const box = form.querySelector('.submission-status'); box.className = 'submission-status';
    box.replaceChildren(node('h3',result.duplicate ? '這份內容已有收件紀錄。' : '已收件，謝謝你補上來源。'), node('p','接下來由審稿團隊人工核對。收件不代表通過，也不會立即加入網站或題庫。'), node('p','收件編號'), node('p',result.receiptId,'receipt-id'));
    box.append(node('p','投稿對象：' + core.SUBJECTS[targetOf(form)]));
    if (typeof result.createdAt === 'string' && !Number.isNaN(Date.parse(result.createdAt))) box.append(node('p','收件時間：' + new Date(result.createdAt).toLocaleString('zh-TW')));
    box.append(node('p',result.duplicate ? '重複送出不會覆寫先前的聯絡資料。請保存這個編號，本站沒有公開查稿頁。' : result.contactSaved ? '你提供的聯絡方式已私下交給審稿團隊，不會公開。請保存收件編號。' : '本次沒有保存私人聯絡方式。請保存收件編號。'));
    const copy = node('button','複製收件編號'); copy.type = 'button'; copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(result.receiptId); copy.textContent = '已複製'; } catch { copy.textContent = '請選取上方編號後複製'; } }); box.append(copy); box.hidden = false; box.focus();
  }
  for (const form of forms) {
    const kind = form.dataset.kind;
    const session = {busy:false,success:false,nonces:core.nonceTracker(() => crypto.randomUUID())}; sessions.set(form,session);
    resetOptionalDetails(form);
    const draftStatus = form.querySelector('.draft-status');
    try {
      let saved = JSON.parse(localStorage.getItem(storageKey(form)) || 'null');
      if (!saved && targetOf(form) === 'shen-pao-yang') saved = JSON.parse(localStorage.getItem(legacyStorageKey(kind)) || 'null');
      if (saved && saved.kind === kind && saved.fields && typeof saved.fields === 'object') {
        const savedSubject = core.subjectId(saved.fields.subjectId) || 'shen-pao-yang';
        if (savedSubject !== targetOf(form)) throw new Error('draft_target_mismatch');
        const fields = core.sanitizeDraft(kind,saved.fields);
        for (const [key,value] of Object.entries(fields)) { const field = form.elements.namedItem(key); if (field) { if (field.type === 'checkbox') field.checked = value === true; else field.value = value; } }
        draftStatus.textContent = '已恢復你手動保存的本機草稿；聯絡方式與同意勾選需重新填寫。';
      }
    } catch { draftStatus.textContent = '目前無法讀取本機草稿。你仍可填寫；內容不會自動保存。'; }
    updateCounts(form);
    const changed = () => {
      updateCounts(form);
      if (session.success) { session.success = false; session.nonces.reset(); form.querySelector('.submission-status').hidden = true; }
      setReady(form);
    };
    form.addEventListener('input',changed); form.addEventListener('change',changed);
    form.elements.namedItem('subjectId').addEventListener('change', () => { draftStatus.textContent = '投稿對象已改為' + core.SUBJECTS[targetOf(form)] + '，現有文字保留。送出前請確認內容與人物一致；草稿按人物分開保存。'; if (activeKind === kind) changeKind(kind); });
    form.addEventListener('reset', event => {
      if (session.busy) { event.preventDefault(); return; }
      queueMicrotask(() => { clearErrors(form); resetOptionalDetails(form); session.success = false; session.nonces.reset(); form.querySelector('.submission-status').hidden = true; setReady(form); });
    });
    form.querySelector('[data-action=save]').addEventListener('click', () => {
      try { localStorage.setItem(storageKey(form),JSON.stringify({kind,savedAt:new Date().toISOString(),fields:core.sanitizeDraft(kind,readValues(form))})); draftStatus.textContent = core.SUBJECTS[targetOf(form)] + '的草稿已存到這台瀏覽器。聯絡方式與同意勾選沒有保存；其他使用同一瀏覽器的人可能讀到內容。'; }
      catch { draftStatus.textContent = '無法保存草稿，可能是瀏覽器限制或空間不足。請先自行複製內容，離開後可能遺失。'; }
    });
    form.querySelector('[data-action=clear]').addEventListener('click', () => {
      try { clearDraft(form); draftStatus.textContent = '這個人物與類型的本機草稿已清除。表單目前內容保留；其他人物草稿與已送出的投稿不受影響。'; }
      catch { draftStatus.textContent = '瀏覽器無法清除草稿。請在瀏覽器的網站資料設定中移除本站資料。'; }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (session.busy || session.success) return;
      if (!apiUrl || !crypto.randomUUID) { failure(form,'目前尚未開放收件。','這次沒有傳送內容。你可以先保存本機草稿，待收件服務開放後再送出。'); return; }
      const values = readValues(form), result = core.validate(kind,values);
      const sourceDate = form.elements.namedItem('sourceDate');
      if (sourceDate && !sourceDate.disabled && sourceDate.validity.badInput) { result.errors.sourceDate = '日期尚未填寫完整；可以補上有效日期，或清空留待後續核對。'; result.ok = false; }
      if (!result.ok) { showErrors(form,result.errors); return; }
      clearErrors(form);
      const website = String(values.website || '').slice(0,300);
      const requestNonce = session.nonces.get(kind,result.payload,result.contact,website);
      const body = {action:'submit',requestNonce,kind,website,payload:result.payload}; if (result.contact) body.contact = result.contact;
      session.busy = true; setReady(form); form.setAttribute('aria-busy','true');
      const button = form.querySelector('[type=submit]'), buttonLabel = button.textContent; button.textContent = '正在送出，請稍候…';
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),20000);
      try {
        const response = await fetch(apiUrl,{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
        const raw = await response.text(); let data = null; if (raw.length < 16000) { try { data = JSON.parse(raw); } catch {} }
        if (![200,201].includes(response.status)) {
          if (response.status === 429) failure(form,'暫時收件較忙，請稍後再試。','表單內容保留。若內容沒有改動，重試會沿用同一個收件請求編號，避免重複建件。');
          else if (response.status === 400 || response.status === 422) failure(form,'收件服務未接受這次投稿。','請檢查內容、網址、欄位長度與同意勾選。若確認無誤仍無法送出，先保存草稿，稍後再試。');
          else failure(form,'暫時無法確認收件狀態。','服務回應異常，內容已保留；可能已收件。請在不修改內容的情況下重試，系統會沿用同一個請求編號。');
          return;
        }
        if (!data || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(data.receiptId || '') || typeof data.duplicate !== 'boolean' || typeof data.contactSaved !== 'boolean') {
          failure(form,'尚未取得可確認的收件回條。','內容已保留，可能已收件。請在不修改內容的情況下重試，不要把本頁當作已成功收件。'); return;
        }
        session.success = true; session.nonces.reset(); receipt(form,data);
        form.elements.namedItem('contactValue').value = ''; form.elements.namedItem('contactConsent').checked = false;
        try { clearDraft(form); draftStatus.textContent = '已收件，這個人物與類型的本機草稿已清除。若繼續修改，可再另存草稿。'; } catch { draftStatus.textContent = '已收件，但瀏覽器未能清除舊草稿。請自行清除本站資料。'; }
      } catch {
        failure(form,'連線中斷，尚無法確認是否收件。','表單內容保留，可能已收件。請在不修改內容的情況下再試，這次請求編號會沿用；私人聯絡方式不會存入草稿。');
      } finally {
        clearTimeout(timeout); session.busy = false; form.removeAttribute('aria-busy'); button.textContent = buttonLabel; setReady(form);
      }
    });
  }
  (async () => {
    try {
      const response = await fetch('/contribute/config.json?v=17',{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
      if (!response.ok) throw new Error('config');
      const raw = await response.text(); if (raw.length > 8000) throw new Error('config');
      const config = JSON.parse(raw), candidate = core.publicHttps(config.apiUrl);
      if (candidate) { const url = new URL(candidate); if (url.search || url.hash) throw new Error('config'); apiUrl = candidate; }
      status.classList.add(apiUrl ? 'online' : 'offline');
      status.textContent = apiUrl ? '收件服務已開放。只有按下「送出」才會傳送表單內容，之後由人工審核。' : '目前尚未開放收件。你可以先整理並保存本機草稿；此時不會傳送內容。';
      if (!globalThis.crypto?.randomUUID) { apiUrl = ''; status.className = 'connection-status offline'; status.textContent = '這個瀏覽器無法安全建立收件編號，尚不能送出。請使用更新版本的瀏覽器；你仍可保存草稿。'; }
    } catch { status.classList.add('offline'); status.textContent = '暫時無法確認收件服務，送出功能停用。你可以先保存本機草稿，再重新開啟此頁。'; }
    for (const form of forms) setReady(form);
  })();
})();
