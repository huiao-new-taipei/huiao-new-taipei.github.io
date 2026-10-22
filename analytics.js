/* Route-bounded GA bootstrap. Deploy only after BOTH streams have Enhanced Measurement OFF.
   send_page_view:false alone does not disable dashboard-configured search/history/form tracking.
   A real ID must be supplied on this classic script's data-measurement-id attribute. */
(function (global) {
  'use strict';
  const VERSION = 'v34', STATE_KEY = '__recordsAnalyticsV34';
  const PUWA = 'puwa.taipei', SU = 'huiao-new-taipei.github.io';
  const HOSTS = new Set([PUWA,SU]);
  const ROUTES = Object.freeze({
    '/game/': '紀錄遊樂場',
    '/game/quiz/': '原話辨識挑戰｜紀錄遊樂場',
    '/game/red-notes/': '紅紙鈔掉面具｜紀錄遊樂場',
    '/game/dialogue/': '原話接招室｜紀錄遊樂場',
    '/game/share/': '遊戲分享｜紀錄遊樂場'
  });
  const SU_ROUTES = new Set(['/game/','/game/quiz/']);
  function measurementId(value) {
    if (typeof value !== 'string') return null;
    const id = value.trim();
    return /^G-[A-Z0-9]{10}$/.test(id) && !/^G-(?:0{10}|X{10})$/.test(id) ? id : null;
  }
  function referrerOrigin(value) {
    if (typeof value !== 'string' || !value || value.length > 4096 || /[\u0000-\u0020\u007f]/.test(value)) return '';
    try {
      const url = new URL(value);
      return ['http:','https:'].includes(url.protocol) && !url.username && !url.password && url.hostname ? url.origin : '';
    } catch { return ''; }
  }
  function route(hostname,pathname) {
    if (!HOSTS.has(hostname) || typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.length > 1000) return null;
    let path = pathname.replace(/\/index\.html$/,'/');
    if (!path.endsWith('/')) path += '/';
    if (path === '/') return {path:'/',title:hostname === PUWA ? '沈伯洋｜人物觀測' : '蘇巧慧｜人物觀測'};
    if (Object.prototype.hasOwnProperty.call(ROUTES,path) && (hostname === PUWA || SU_ROUTES.has(path))) return {path,title:ROUTES[path]};
    // Collapse quote IDs, layout choices and reported scores into one fixed report route.
    if (hostname === PUWA && (/^\/q\/24[0-9a-z][0-6][sq]\/$/.test(path) || /^\/game\/quiz\/cards\/v(?:18|24)\/[a-z0-9-]{1,160}-[0-6]-6-(?:score|quote)\.html\/$/.test(path))) return {path:'/game/quiz/share/',title:'原話挑戰分享｜紀錄遊樂場'};
    return null;
  }
  function pageContext(location,referrer) {
    // Read only these Location fields, never href/search/hash or a dynamic DOM page title.
    if (!location || location.protocol !== 'https:' || !HOSTS.has(location.hostname) || location.port !== '') return null;
    const mapped = route(location.hostname,location.pathname); if (!mapped) return null;
    return {page_location:'https://' + location.hostname + mapped.path,page_title:mapped.title,page_referrer:referrerOrigin(referrer)};
  }
  function privatePreference(window,navigator) {
    return navigator?.globalPrivacyControl === true || navigator?.doNotTrack === '1' || navigator?.msDoNotTrack === '1' || window?.doNotTrack === '1';
  }
  function install(environment) {
    const window = environment?.window, document = environment?.document || window?.document, navigator = environment?.navigator || window?.navigator || {};
    if (!window || !document || !document.currentScript || !document.head) return {configured:false,reason:'missing_environment'};
    const page = pageContext(window.location,document.referrer); if (!page) return {configured:false,reason:'excluded_route'};
    if (privatePreference(window,navigator)) return {configured:false,reason:'privacy_preference'};
    const id = measurementId(document.currentScript.getAttribute('data-measurement-id')); if (!id) return {configured:false,reason:'missing_valid_id'};
    if (window['ga-disable-' + id] === true) return {configured:false,reason:'explicit_opt_out'};
    if (window[STATE_KEY]) return {configured:false,reason:'already_configured'};
    // Do not mix this bounded stream with a pre-existing tag/dataLayer destination.
    if (typeof window.gtag === 'function' || (window.dataLayer !== undefined && (!Array.isArray(window.dataLayer) || window.dataLayer.length)) || document.querySelector?.('script[src^="https://www.googletagmanager.com/gtag/js"]')) return {configured:false,reason:'existing_tag'};
    const script = document.createElement('script');
    script.async = true; script.referrerPolicy = 'origin'; script.id = 'records-ga-v34';
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    window.dataLayer = window.dataLayer || [];
    const gtag = function () { window.dataLayer.push(arguments); }; window.gtag = gtag;
    // Ordinary first-party analytics cookies only; no ad consent or cross-domain linking.
    gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    gtag('set',{...page});
    gtag('js',new Date());
    gtag('config',id,{
      send_page_view:false,
      allow_google_signals:false,
      allow_ad_personalization_signals:false,
      cookie_flags:'SameSite=Lax;Secure',
      linker:{domains:[],accept_incoming:false,decorate_forms:false},
      ...page
    });
    gtag('event','page_view',{send_to:id,...page});
    window[STATE_KEY] = {version:VERSION};
    try { document.head.append(script); return {configured:true,path:new URL(page.page_location).pathname}; }
    catch { return {configured:false,reason:'script_insertion_failed'}; }
  }
  const api = {VERSION,measurementId,referrerOrigin,route,pageContext,privatePreference,install};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (global) install({window:global});
})(typeof window === 'undefined' ? null : window);
