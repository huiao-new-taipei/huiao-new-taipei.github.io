/* Public, source-backed observation. No private API, cookies or identifiers. */
(function(global){
  'use strict';
  const roles={primary:'主提案',joint:'共同提案',cosign:'連署'};
  const colors=['#513d59','#ba6b50','#9ca889','#c4a1ad','#8b9cb0','#c7b376','#7b8c83','#c69e7f','#8c739d','#a9b7bb','#9d917e','#c4b9ca'];
  const list=x=>Array.isArray(x)?x:[];
  const topic=(row,axis='targetTopic')=>String((axis==='mainTopic'?list(row.topics)[0]:null)||row[axis]||row.classification?.[axis]||'待核對分類');
  function distribution(rows,field='mainTopic'){
    const counts=new Map();for(const row of rows){const key=String(row[field]||row.comparisonTopic||'unclassified');counts.set(key,(counts.get(key)||0)+1);}
    return [...counts].map(([id,count])=>({id,count,share:rows.length?count/rows.length:0}));
  }
  function overlap(left,right){if(!left.length||!right.length)return null;const a=distribution(left),b=distribution(right);if([...a,...b].some(x=>x.id==='unclassified'))return null;const q=new Map(b.map(x=>[x.id,x.share]));return 100*a.reduce((n,x)=>n+Math.min(x.share,q.get(x.id)||0),0);}
  function filterBills(rows,filter={}){
    const needle=String(filter.search||'').normalize('NFKC').toLocaleLowerCase();
    return rows.filter(row=>(!filter.role||filter.role==='all'||row.role===filter.role)&&(!filter.topic||topic(row,filter.axis)===filter.topic)&&(!filter.committee||(list(row.committees).length?list(row.committees):['流程未載委員會名稱']).includes(filter.committee))&&(!needle||[row.id,row.title,row.reason,row.text,topic(row,'targetTopic'),topic(row,'purposeTopic'),...list(row.committees),...list(row.topics)].join('\n').normalize('NFKC').toLocaleLowerCase().includes(needle)));
  }
  function splitDate(rows,cut){const before=[],after=[],unknown=[];for(const row of rows){const d=new Date(String(row.date)+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date||'')||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==row.date){unknown.push(row);continue;}(row.date<cut?before:after).push(row);}return{before,after,unknown};}
  function safeURL(value){try{const u=new URL(String(value)),h=u.hostname.toLowerCase();return u.protocol==='https:'&&!u.username&&!u.password&&!/(^|\.)localhost$|\.local$|\.internal$/.test(h)&&!/^\d+(\.\d+){3}$|^\[/.test(h)&&h.includes('.')?u.href:null;}catch{return null;}}
  const validCases=data=>data?.subjectId==='su-chiao-hui'&&data?.version==='su-accountability-v3'&&Array.isArray(data.cases)&&data.cases.every(x=>typeof x.id==='string'&&typeof x.title==='string'&&x.record&&typeof x.record.summary==='string'&&typeof x.assessment==='string');
  const core={distribution,overlap,filterBills,splitDate,topic,safeURL,validCases};if(typeof module==='object'&&module.exports)module.exports=core;if(global)global.ObservationCore=core;
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id),fmt=n=>Number.isFinite(n)?n.toLocaleString('zh-TW'):'—';
  const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  const link=(text,url)=>{const a=node('a',text),safe=safeURL(url);if(safe){a.href=safe;a.target='_blank';a.rel='noopener noreferrer';}return a;};
  const state={bills:[],role:'primary',axis:'targetTopic',topic:'',committee:'',search:'',page:1,pageSize:6,categories:[],policies:[],analysis:null};
  const name=id=>state.categories.find(x=>x.id===id)?.name||(id==='unclassified'?'待核對分類':id);
  const color=id=>{const i=state.categories.findIndex(x=>x.id===id);return colors[(i<0?11:i)%colors.length];};
  async function json(url){const r=await fetch(url,{credentials:'omit',cache:'no-cache',referrerPolicy:'no-referrer'});if(!r.ok)throw new Error();return r.json();}
  function announce(text){$('announcement').textContent=text;}
  function counts(rows,getLabels){const m=new Map();for(const row of rows)for(const label of new Set(getLabels(row)))if(label)m.set(label,(m.get(label)||0)+1);return [...m].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh-TW'));}
  function bars(id,entries,total,onClick){
    const box=$(id);box.replaceChildren();if(!entries.length){box.append(node('p','尚無此範圍的可核對資料。','empty-note'));return;}
    for(const [label,count]of entries){const row=node('button',undefined,'obs-bar');row.type='button';row.append(node('span',label));const track=node('div',undefined,'obs-track'),fill=node('div',undefined,'obs-fill');fill.style.width=(total?100*count/total:0)+'%';track.append(fill);const value=node('strong',fmt(count));value.append(node('small',total?(100*count/total).toFixed(1)+'%':'—'));row.append(track,value);row.addEventListener('click',()=>onClick?.(label));box.append(row);}
  }
  function flowRows(bill){return list(bill.flow||bill.progress||bill.stages||bill.流程);}
  function flowText(event){if(typeof event==='string')return event;return [event.date,event.日期,event['院會/委員會'],event.stage,event.status,event.狀態,event.title,event.name,event.description,event.進度,event.內容,event.議案狀態].map(x=>Array.isArray(x)?x.join('、'):x).filter(x=>typeof x==='string').join(' · ')||JSON.stringify(event);}
  function renderScope(){
    const rows=state.bills.filter(b=>state.role==='all'||b.role===state.role);$('scope-summary').textContent=`目前範圍：${roles[state.role]||'全部角色'} ${fmt(rows.length)} 件`;
    bars('topic-bars',counts(rows,b=>[topic(b,state.axis)]),rows.length,label=>{state.topic=label;$('bill-topic').value=label;state.page=1;renderBills();$('explorer').scrollIntoView({behavior:'smooth'});});
    bars('committee-bars',counts(rows,b=>list(b.committees).length?b.committees:['流程未載委員會名稱']),rows.length,label=>{state.committee=label;$('bill-committee').value=label;state.page=1;renderBills();$('explorer').scrollIntoView({behavior:'smooth'});});
    const hasFlows=rows.some(b=>flowRows(b).length),returned=rows.filter(b=>flowRows(b).some(e=>/退回/.test(flowText(e)))),events=returned.reduce((n,b)=>n+flowRows(b).filter(e=>/退回/.test(flowText(e))).length,0),box=$('procedure-summary');box.replaceChildren();
    for(const [value,label]of [[hasFlows?returned.length:null,'已收錄退回的案件'],[hasFlows?events:null,'已收錄退回流程列']]){const c=node('div');c.append(node('strong',fmt(value)),node('span',label));box.append(c);}
    const status=$('status-summary');status.replaceChildren();for(const [label,count]of counts(rows,b=>[b.status||'進度未載']))status.append(node('span',`${label} ${count}`,'status-chip'));
  }
  function selectOptions(id,values,selected){const input=$(id),initial=input.options[0].textContent;input.replaceChildren(node('option',initial));input.options[0].value='';for(const value of values){const option=node('option',value);option.value=value;input.append(option);}input.value=selected;}
  function populate(){selectOptions('bill-topic',counts(state.bills,b=>[topic(b,state.axis)]).map(x=>x[0]),state.topic);selectOptions('bill-committee',counts(state.bills,b=>list(b.committees).length?b.committees:['流程未載委員會名稱']).map(x=>x[0]),state.committee);}
  function renderBills(){
    const rows=filterBills(state.bills,state),pages=Math.max(1,Math.ceil(rows.length/state.pageSize));state.page=Math.min(state.page,pages);$('bill-result-count').textContent=`${roles[state.role]||'全部角色'} · 共 ${fmt(rows.length)} 件`;$('page-status').textContent=`${state.page} / ${pages}`;$('prev-page').disabled=state.page<=1;$('next-page').disabled=state.page>=pages;
    const box=$('bill-list');box.replaceChildren();for(const b of rows.slice((state.page-1)*state.pageSize,state.page*state.pageSize)){
      const d=node('details',undefined,'bill-detail'),s=node('summary');s.append(node('time',b.date||'日期未載'),node('strong',b.title||b.id));d.append(s);const body=node('div',undefined,'bill-body');body.append(node('p',`${roles[b.role]||b.role} · ${b.id} · ${b.status||'進度未載'}`,'bill-meta'));body.append(node('p',`制度領域：${topic(b,'targetTopic')} ／ 修法目的：${topic(b,'purposeTopic')}`));body.append(node('p',`委員會：${list(b.committees).join('、')||'流程未載委員會名稱'}`));if(b.reason)body.append(node('pre',String(b.reason)));
      const flows=flowRows(b);if(flows.length){const ol=node('ol');for(const event of flows)ol.append(node('li',flowText(event)));body.append(ol);}else body.append(node('p','本案尚無可呈現的細部流程；不能據此判定未審議。','small-note'));
      const url=b.url||b.sourceUrl||b.officialUrl;if(safeURL(url))body.append(link('查看官方議案原始紀錄 ↗',url));d.append(body);box.append(d);
    }if(!rows.length)box.append(node('p','沒有符合目前篩選的案件。','empty-note'));
  }
  function donut(rows,label){
    const box=node('div',undefined,'distribution');box.append(node('h4',label),node('small',`${fmt(rows.length)} 份文件，各自等權`));const chart=node('div',undefined,'obs-donut'),dist=distribution(rows);chart.setAttribute('role','img');chart.setAttribute('aria-label',label+'：'+dist.map(x=>name(x.id)+' '+(100*x.share).toFixed(1)+'%').join('、'));
    let end=0;const parts=dist.map(x=>{const start=end;end+=100*x.share;return `${color(x.id)} ${start}% ${end}%`;});if(parts.length)chart.style.background=`conic-gradient(${parts.join(',')})`;const center=node('strong',fmt(rows.length));center.append(node('small','份文件'));chart.append(center);box.append(chart);const legend=node('ul',undefined,'donut-legend');for(const x of dist.sort((a,b)=>b.count-a.count)){const li=node('li'),dot=node('i');dot.style.background=color(x.id);li.append(dot,node('span',name(x.id)),node('b',`${x.count} · ${(100*x.share).toFixed(1)}%`));legend.append(li);}box.append(legend);return box;
  }
  function comparison(id,left,right,leftLabel,rightLabel){const box=$(id);box.replaceChildren();const score=overlap(left,right);if(score===null){box.append(node('p','其中一側尚無足夠的已分類文件，暫不計算同步率。','empty-note'));return;}const middle=node('div',undefined,'similarity');middle.append(node('span','已收錄文件的主題重疊'),node('strong',score.toFixed(1)),node('small','% · 越高代表主題分布越接近\n不是誠信或政績分數'));box.append(donut(left,leftLabel),middle,donut(right,rightLabel));}
  function renderComparisons(){if(!state.analysis||!state.categories.length){for(const id of ['time-compare','policy-compare'])$(id).replaceChildren(node('p','比較所需的資料或分類定義暫時無法載入；缺漏不當作零。','empty-note'));return;}const primary=state.bills.filter(b=>b.role==='primary'),cut=splitDate(primary,'2025-11-26');comparison('time-compare',cut.before,cut.after,'正式提名前','正式提名日起');if(cut.unknown.length)$('time-compare').append(node('p',`${cut.unknown.length} 案日期不明，未放入前後比較。`,'small-note'));comparison('policy-compare',primary,state.policies,'第11屆主提案','官網政見套案頁');const box=$('policy-sources');box.replaceChildren();for(const p of state.policies){const row=node('article',undefined,'policy-source');row.append(node('span','候選人承諾 · 未驗證執行','promise-label'),link(p.title,p.url),node('small',`主分類：${name(p.mainTopic)} · ${p.date?'原頁日期：'+p.date:'原頁發布日期未確認'}`));if(p.summary)row.append(node('p','候選人政見頁主張：'+p.summary));row.append(node('p','執行、預算與權責證據：尚未獨立查核。','small-note'));box.append(row);}}

  function renderQuotes(data,curation){const rows=list(data.quotes),box=$('quote-list');box.replaceChildren();$('quote-coverage').textContent=`舊版 ${rows.length} 則保留原句、日期與來源，移至進階檔案。它們不再自動作為精選或遊戲題目。`;for(const q of rows){const c=node('article',undefined,'source-quote');c.append(node('h3',q.title||'本人公開發言'),node('blockquote',q.quote),node('p',curation?.contextOverrides?.[q.id]||q.context||'請連同來源的完整前後文閱讀。'));c.append(node('small',`${q.date||'日期尚待核對'} · ${q.sourceType||q.verificationLevel||'來源類型待標示'}`));if(q.locator||q.evidenceLocator)c.append(node('small',q.locator||q.evidenceLocator));const url=q.url||q.sourceUrl;if(safeURL(url))c.append(link('回原始來源核對 ↗',url));if(safeURL(q.videoUrl)&&q.videoUrl!==url)c.append(link('完整影片 ↗',q.videoUrl));box.append(c);}if(!rows.length)box.append(node('p','可逐字歸屬的本人原話仍在核對，沒有把其他人的話填入題庫。','empty-note'));}
  function renderAccountability(data){
    const box=$('accountability-list');box.replaceChildren();
    if(!validCases(data)){$('case-coverage').textContent='案例資料尚未通過人物與資料格式核對。';box.append(node('p','案例暫時無法讀取，缺漏不當作沒有爭議。','empty-note'));return;}
    const intro=data.intro||{};$('image-label').textContent=intro.imageLabel||'水獺媽媽';$('image-summary').textContent=intro.imageSummary||'';
    $('image-source').replaceChildren();if(safeURL(intro.imageSource?.url))$('image-source').append(link(intro.imageSource.label||'查看形象自述來源 ↗',intro.imageSource.url));
    if(intro.historyNote){const history=node('p',intro.historyNote,'image-history');if(safeURL(intro.historySource?.url))history.append(document.createTextNode(' '),link(intro.historySource.label||'查看較早紀錄 ↗',intro.historySource.url));$('image-source').append(history);}
    $('case-coverage').textContent=`${data.cases.length} 個有來源的對照案例 · 核對更新 ${data.asOf||'日期待補'}`;
    const hasFeatured=data.cases.some(c=>c.featured===true);
    for(const [index,c] of data.cases.entries()){
      const article=node('article',undefined,'accountability-card');article.id='case-'+c.id;
      const header=node('div',undefined,'case-header');header.append(node('span',c.kicker||'公開言行對照','case-kicker'),node('time',c.date||'日期見來源'));article.append(header,node('h3',c.title));
      if(c.question)article.append(node('p',c.question,'case-question'));
      if(c.quote?.text){const q=node('figure',undefined,'case-quote');q.append(node('blockquote',c.quote.text));const caption=node('figcaption',`${c.quote.speaker||'蘇巧慧'} · ${c.quote.date||c.date||'日期見來源'} · ${c.quote.sourceType||'來源見下方'}`);if(safeURL(c.quote.url))caption.append(document.createTextNode(' · '),link('看出處 ↗',c.quote.url));q.append(caption);article.append(q);}
      const facts=node('div',undefined,'case-facts');
      if(c.criticism?.text){const criticism=node('div');criticism.append(node('h4','爭議焦點'),node('p',c.criticism.text));if(c.criticism.by)criticism.append(node('small','提出者：'+c.criticism.by));if(safeURL(c.criticism.url))criticism.append(link(c.criticism.by==='本站編輯提問'?'核對這段原文 ↗':'查看具名批評 ↗',c.criticism.url));facts.append(criticism);}
      const record=node('div');record.append(node('h4','紀錄顯示'),node('p',c.record.summary));facts.append(record);article.append(facts);
      if(c.response?.text){const response=node('div',undefined,'case-response');response.append(node('h4','本人／相關單位回應'),node('p',c.response.text));if(safeURL(c.response.url))response.append(link('查看回應／相關來源 ↗',c.response.url));article.append(response);}
      const assessment=node('div',undefined,'case-assessment');assessment.append(node('span','編輯評析／仍應追問'),node('p',c.assessment));article.append(assessment);
      const detail=node('details',undefined,'case-evidence');detail.append(node('summary','展開證據、來源與仍待釐清之處 ＋'));
      for(const item of list(c.record.items)){const row=node('div',undefined,'case-evidence-item');if(item.label)row.append(node('h4',item.label));if(item.text)row.append(node('p',item.text));if(safeURL(item.url))row.append(link('看原始文件／報導 ↗',item.url));detail.append(row);}
      if(c.quote?.text&&c.quote.audioVerified!==true)detail.append(node('p','影片句內時間尚未完成核聽；文字引文依本案標示的來源，不宣稱已核驗剪輯。','small-note'));
      if(c.quote?.locator)detail.append(node('p',c.quote.locator,'small-note'));
      if(list(c.unknowns).length){detail.append(node('h4','仍待釐清'));const ul=node('ul');for(const unknown of c.unknowns)ul.append(node('li',unknown));detail.append(ul);}
      const sources=node('div',undefined,'case-source-links');for(const source of list(c.sources))if(safeURL(source.url))sources.append(link(source.label||'查看來源 ↗',source.url));detail.append(sources);article.append(detail);
      if(hasFeatured?c.featured===true:index<3)box.append(article);else{let more=$('accountability-more');if(!more){more=node('details',undefined,'accountability-more');more.id='accountability-more';more.append(node('summary','更多爭議與公共資源查核 ＋'));box.append(more);}more.append(article);}
    }
    if(!data.cases.length)box.append(node('p','案例證據正在整理，尚未填入未核實指控。','empty-note'));
  }
  function bind(){
    for(const id of ['scope-role','bill-role'])$(id).addEventListener('change',e=>{state.role=e.target.value;$('scope-role').value=state.role;$('bill-role').value=state.role;state.page=1;renderScope();renderBills();announce('已切換'+(roles[state.role]||'全部角色'));});
    $('topic-axis').addEventListener('change',e=>{state.axis=e.target.value;state.topic='';state.page=1;populate();renderScope();renderBills();});
    for(const [id,key]of [['bill-topic','topic'],['bill-committee','committee']])$(id).addEventListener('change',e=>{state[key]=e.target.value;state.page=1;renderBills();});
    let timer;$('bill-search').addEventListener('input',e=>{clearTimeout(timer);timer=setTimeout(()=>{state.search=e.target.value;state.page=1;renderBills();},180);});
    for(const [id,delta]of [['prev-page',-1],['next-page',1]])$(id).addEventListener('click',()=>{state.page+=delta;renderBills();$('explorer').scrollIntoView({behavior:'smooth'});});
  }
  async function init(){bind();const results=await Promise.allSettled([json('/data/analysis.json'),json('/data/policy.json'),json('/data/comparison-codebook.json'),json('/data/quotes.json'),json('/data/curation.json'),json('/data/accountability.json')]);
    if(results[0].status==='fulfilled'){
      const d=results[0].value;state.analysis=d;state.bills=list(d.bills).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));const t=d.totals||{},m=d.meta||{};
      $('asof').textContent='觀測截止 '+(m.end||'尚待核對');$('elapsed-days').textContent=fmt(m.elapsedDays)+' 天';for(const id of ['primary-head','primary-count'])$(id).textContent=fmt(t.primary);const cards=$('role-cards');for(const role of ['primary','joint','cosign']){const c=node('div',undefined,'summary-card');c.append(node('span',roles[role]),node('strong',fmt(t[role])));cards.append(c);}
      $('role-note').textContent=`${fmt(t.primary)} 主提案＋${fmt(t.joint)} 共同提案＋${fmt(t.cosign)} 連署＝${fmt(t.unique)} 件去重參與合計。`;$('coverage-note').textContent=m.coverageNote||'';$('data-method-note').textContent=[m.unit,m.coverageNote,'本人發言選集不等於全部質詢；未取得全文的段落不當作零。'].filter(Boolean).join(' ');populate();renderScope();renderBills();
    }else $('load-error').hidden=false;
    if(results[1].status==='fulfilled')state.policies=list(results[1].value.policies||results[1].value.bundles||results[1].value.items);
    if(results[2].status==='fulfilled')state.categories=list(results[2].value.categories);
    if(results[3].status==='fulfilled')renderQuotes(results[3].value,results[4].status==='fulfilled'?results[4].value:null);else renderQuotes({quotes:[]});renderAccountability(results[5].status==='fulfilled'?results[5].value:null);renderComparisons();
  }init();
})(typeof window==='undefined'?null:window);
