var CONFIG = {
  weaoEndpoints: [
    'https://weao.xyz/api/status/exploits',
    'https://weao.gg/api/status/exploits',
    'https://whatexpsare.online/api/status/exploits'
  ],
  sbExecutorEndpoint: 'https://scriptblox.com/api/executor/list',
  sbScriptFetch: 'https://scriptblox.com/api/script/fetch',
  sbScriptSearch: 'https://scriptblox.com/api/script/search?q=',
  sbScriptBySlug: 'https://scriptblox.com/api/script/',
  discordInvite: 'https://discord.gg/sJuVndjvJY',
  customProxy: 'https://weao-proxy.hallchristian112.workers.dev/?url='
};

var SEARCH_MAX_PAGES = 500;
var SEARCH_CONCURRENCY = 4;
var SEARCH_BATCH_DELAY = 120;
var RENDER_CAP = 300;
var FETCH_TIMEOUT_MS = 15000;

var SUPABASE_URL  = 'https://asxaocghenthlxisifgq.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzeGFvY2doZW50aGx4aXNpZmdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyOTk2MjcsImV4cCI6MjEwNTg3NTYyN30.pN9uiK3Dok4z7VposUy8zq7a7vmwGrJ03AV1IUVZfus';

var BANWAVE = { active: false, flagged: [], lastChecked: null, history: [] };
var ADMIN = { disabled: {}, announcements: [] };

function proxyUrls(url){
  var out = [];
  if (CONFIG.customProxy) out.push(CONFIG.customProxy + encodeURIComponent(url));
  out.push(url);
  out.push('https://corsproxy.io/?url=' + encodeURIComponent(url));
  out.push('https://api.allorigins.win/raw?url=' + encodeURIComponent(url));
  out.push('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url));
  return out;
}

async function doFetch(url){
  var list = proxyUrls(url), err;
  for (var i = 0; i < list.length; i++){
    try {
      var ctrl = new AbortController();
      var to = setTimeout(function(){ ctrl.abort() }, FETCH_TIMEOUT_MS);
      var r = await fetch(list[i], {headers:{Accept:'application/json'}, signal: ctrl.signal});
      clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var d = await r.json();
      if (d) return d;
    } catch(e){ err = e }
  }
  throw err || new Error('fetch failed');
}

async function fetchWeao(){
  for (var i = 0; i < CONFIG.weaoEndpoints.length; i++){
    var url = CONFIG.weaoEndpoints[i];
    try {
      var d = await doFetch(url);
      if (Array.isArray(d) && d.length) return d;
      if (d && Array.isArray(d.exploits) && d.exploits.length) return d.exploits;
      if (d && Array.isArray(d.data) && d.data.length) return d.data;
    } catch(e){ console.warn('[weao] failed:', url, '-', e.message) }
  }
  return [];
}

var $ = function(id){ return document.getElementById(id) };

function esc(s){
  if (s == null) s = '';
  return String(s).replace(/[&<>"']/g, function(c){
    if (c === '&') return '&amp;';
    if (c === '<') return '&lt;';
    if (c === '>') return '&gt;';
    if (c === '"') return '&quot;';
    return '&#39;';
  });
}

function slugify(s){
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

function absUrl(u){
  if (!u) return '';
  if (u.indexOf('http') === 0) return u;
  if (u.charAt(0) === '/') return 'https://scriptblox.com' + u;
  return u;
}

function hashColor(str){
  var h = 0; str = String(str || '?');
  for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  var p = ['#b8232a','#2d6e34','#a56d0f','#6b4a8a','#1f5c6e','#8a4a1f','#4a5c1f','#6e2d4a'];
  return p[Math.abs(h) % p.length];
}

function bucketOf(ex){
  var p = String(ex.platform || '').toLowerCase();
  var t = String(ex.extype || ex.kind || '').toLowerCase();
  if (p === 'ios' || t === 'iexecutor') return;
  if (t === 'wexternal' || t === 'external') return 'external';
  if (p === 'android' || t === 'aexecutor') return 'android';
  if (p === 'mac' || p === 'macos' || t === 'mexecutor') return 'mac';
  if (p === 'windows' && (t === 'wexecutor' || t === 'executor' || t === '')) return 'windows';
}

function statusOf(ex){
  if (ex.possibleBanwave) return {cls:'flagged', label:'Banwave Risk'};
  if (ex.updateStatus) return {cls:'online', label:'Online'};
  return {cls:'offline', label:'Offline'};
}

function banOf(ex){
  var reason = ex.detectionReason && ex.detectionReason.trim();
  if (ex.possibleBanwave) return {text: reason || 'Flagged for possible banwave activity.', flagged: true};
  if (reason) return {text: reason, flagged: false};
  if (ex.detected) return {text: 'No active bans. Previously seen in a past banwave.', flagged: false};
  return {text: 'No bans on record.', flagged: false};
}

function rank(ex){
  if (ex.possibleBanwave) return 2;
  if (ex.updateStatus) return 0;
  return 1;
}

function priceNum(ex){
  if (ex.free) return 0;
  if (ex.price && typeof ex.price.amount === 'number') return ex.price.amount;
  var m = String(ex.cost || '').match(/\$?\s*([\d.]+)/);
  return m ? parseFloat(m[1]) : 999999;
}

function verNum(v){ return String(v || '0').replace(/^v/i,'').trim() }

function md(s){
  if (!s) return '';
  var out = esc(s);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return out;
}

function normalizeWeao(ex){
  return {
    title: ex.title, slug: slugify(ex.title), version: ex.version,
    updatedDate: ex.updatedDate, updateStatus: !!ex.updateStatus,
    possibleBanwave: !!ex.possibleBanwave, detected: !!ex.detected,
    detectionReason: ex.detectionReason || '', hasIssues: !!ex.hasIssues,
    free: !!ex.free, cost: ex.cost || '',
    uncPercentage: ex.uncPercentage, suncPercentage: ex.suncPercentage,
    platform: ex.platform, extype: ex.extype, rbxversion: ex.rbxversion,
    index: typeof ex.index === 'number' ? ex.index : 999,
    websitelink: ex.websitelink, discordlink: ex.discordlink, purchaselink: ex.purchaselink,
    decompiler: !!ex.decompiler, multiInject: !!ex.multiInject, raknet: !!ex.raknet,
    keysystem: !!ex.keysystem, clientmods: !!ex.clientmods,
    uncStatus: !!ex.uncStatus, elementCertified: !!ex.elementCertified,
    logo: (ex.slug && ex.slug.logo) || '',
    owner: (ex.slug && ex.slug.owner) || '',
    description: (ex.slug && ex.slug.fullDescription) || '',
    screenshots: (ex.slug && ex.slug.screenshots) || [],
    logos: [], store: '', showcase: '', views: null, excerpt: '', thumbnail: '',
    unverified: false, _sources: ['weao'], _weaoId: ex._id || ''
  };
}

function buildFromSb(sb){
  return {
    title: sb.name || sb.slug, slug: slugify(sb.name || sb.slug),
    version: sb.version, updatedDate: sb.versionDate || sb.updatedAt,
    updateStatus: !!sb.updated, possibleBanwave: !!sb.possibleBanwave,
    detected: !!sb.detected, detectionReason: sb.detectionReason || '',
    hasIssues: !!sb.hasIssues, free: !!sb.free || sb.type === 'Free',
    cost: (sb.price && sb.price.note) || '',
    uncPercentage: null, suncPercentage: sb.sunc,
    platform: sb.platform,
    extype: sb.kind === 'external' ? 'wexternal'
         : sb.platformKey === 'macos' ? 'mexecutor'
         : sb.platformKey === 'android' ? 'aexecutor'
         : sb.platformKey === 'ios' ? 'iexecutor' : 'wexecutor',
    rbxversion: sb.rbxVersion, index: 999,
    websitelink: sb.website || '', discordlink: sb.discord || '', purchaselink: sb.store || '',
    decompiler: !!sb.decompiler, multiInject: !!sb.multiInject,
    raknet: !!sb.raknet, keysystem: !!sb.keySystem, clientmods: !!sb.clientMods,
    uncStatus: false, elementCertified: !!sb.elementCertified,
    logo: absUrl(sb.logo), owner: sb.owners || sb.developers || '',
    description: sb.description || sb.weaoDescription || '',
    screenshots: (sb.screenshots || []).map(absUrl),
    logos: (sb.logos || []).map(absUrl),
    thumbnail: absUrl(sb.thumbnail),
    store: sb.store || '', showcase: sb.showcase || '',
    views: sb.views || null, excerpt: sb.excerpt || '',
    unverified: !sb.weaoId, _sources: ['scriptblox'], _weaoId: sb.weaoId || ''
  };
}

function mergeSbInto(base, sb){
  var m = base;
  if (sb.logos && sb.logos.length){
    var nl = sb.logos.map(absUrl);
    for (var i = 0; i < nl.length; i++) if (m.logos.indexOf(nl[i]) === -1) m.logos.push(nl[i]);
  }
  if (sb.thumbnail) m.thumbnail = absUrl(sb.thumbnail);
  if (sb.store) m.store = sb.store;
  if (sb.showcase) m.showcase = sb.showcase;
  if (sb.views) m.views = sb.views;
  if (sb.excerpt) m.excerpt = sb.excerpt;
  if (sb.description) m.sbDescription = sb.description;
  if (sb.weaoDescription && !m.description) m.description = sb.weaoDescription;
  if (sb.price && sb.price.note && !m.cost) m.cost = sb.price.note;
  if (sb.website && !m.websitelink) m.websitelink = sb.website;
  if (sb.discord && !m.discordlink) m.discordlink = sb.discord;
  if (sb.store && !m.purchaselink) m.purchaselink = sb.store;
  if (sb.sunc != null && m.suncPercentage == null) m.suncPercentage = sb.sunc;
  if (sb.owners && !m.owner) m.owner = sb.owners;
  if (sb.images && sb.images.length && !m.screenshots.length) m.screenshots = sb.images.map(absUrl);
  if (sb.features && sb.features.length){
    for (var f = 0; f < sb.features.length; f++){
      var ft = sb.features[f];
      if (ft === 'decompiler') m.decompiler = true;
      if (ft === 'multi-inject') m.multiInject = true;
      if (ft === 'raknet') m.raknet = true;
      if (ft === 'key-system') m.keysystem = true;
      if (ft === 'client-mods') m.clientmods = true;
    }
  }
  if (sb.weaoId) m._weaoId = sb.weaoId;
  if (m._sources.indexOf('scriptblox') === -1) m._sources.push('scriptblox');
  if (sb.weaoId) m.unverified = false;
  return m;
}

function mergeExecutors(weaoList, sbList){
  weaoList = weaoList || []; sbList = sbList || [];
  var byId = {}, bySlug = {};
  var i, ex, key;
  for (i = 0; i < weaoList.length; i++){
    ex = weaoList[i];
    if (ex._id) byId[ex._id] = ex;
    key = slugify(ex.title);
    if (key && !bySlug[key]) bySlug[key] = ex;
  }
  var merged = [];
  var usedWeaoIds = {};
  for (i = 0; i < sbList.length; i++){
    var sb = sbList[i];
    var match = null;
    if (sb.weaoId && byId[sb.weaoId]){
      match = byId[sb.weaoId]; usedWeaoIds[sb.weaoId] = true;
    } else {
      key = slugify(sb.name || sb.slug);
      if (key && bySlug[key]){
        match = bySlug[key];
        if (match._id) usedWeaoIds[match._id] = true;
      }
    }
    merged.push(match ? mergeSbInto(normalizeWeao(match), sb) : buildFromSb(sb));
  }
  var haveSlugs = {};
  for (i = 0; i < merged.length; i++) haveSlugs[merged[i].slug] = true;
  for (i = 0; i < weaoList.length; i++){
    ex = weaoList[i];
    if (ex._id && usedWeaoIds[ex._id]) continue;
    key = slugify(ex.title);
    if (key && haveSlugs[key]) continue;
    if (key) haveSlugs[key] = true;
    merged.push(normalizeWeao(ex));
  }
  return merged;
}

var S = {
  page: 'cheats',
  view: 'list',
  cheats: { data: [], fav: new Set(loadFav()), filters: new Set(), q: '', sortKey: null, sortDir: 'asc', openSlug: null },
  scripts: {
    data: [], page: 1, loading: false, hasMore: true, q: '',
    filterVerified: false, filterHub: false, filterUniversal: false, filterKeyless: false,
    searchMode: false, searchToken: 0, seenIds: new Set(),
    progress: { current: 0, total: SEARCH_MAX_PAGES }, renderCap: RENDER_CAP,
    defaultLoaded: false, detail: null, game: null, gameScripts: null
  },
  compare: []
};

function loadFav(){ try { return JSON.parse(localStorage.getItem('weao_favorites') || '[]') } catch(e){ return [] } }
function saveFav(){ try { localStorage.setItem('weao_favorites', JSON.stringify(Array.from(S.cheats.fav))) } catch(e){} }
function loadCompare(){ try { return JSON.parse(localStorage.getItem('weao_compare') || '[]') } catch(e){ return [] } }
function saveCompare(){ try { localStorage.setItem('weao_compare', JSON.stringify(S.compare)) } catch(e){} }

var STAR = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
var LINK_ICON = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

function showToast(msg, ok){
  var t = $('toast');
  t.textContent = msg;
  t.style.background = ok === false ? 'var(--red)' : 'var(--ink)';
  t.classList.add('on');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function(){ t.classList.remove('on') }, 1800);
}

function copyText(txt, okMsg){
  if (navigator.clipboard && navigator.clipboard.writeText){
    return navigator.clipboard.writeText(txt).then(function(){ showToast(okMsg || 'Copied'); return true });
  }
  var ta = document.createElement('textarea');
  ta.value = txt; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); showToast(okMsg || 'Copied') } catch(e){ showToast('Copy failed', false) }
  document.body.removeChild(ta);
  return Promise.resolve(true);
}

function shortUrl(slug){
  return location.origin + location.pathname + '#' + slug;
}

function detectShortLink(){
  var hash = (location.hash || '').replace(/^#/, '');
  if (!hash) return null;
  if (hash.indexOf('/') !== -1) return null;
  if (hash.indexOf('?') !== -1) return null;
  if (hash.indexOf('=') !== -1) return null;
  var known = ['cheats', 'scripts', 'news'];
  if (known.indexOf(hash) !== -1) return null;
  return '#cheats/' + hash;
}

function logoHTML(ex){
  var initial = String(ex.title || '?').trim().charAt(0).toUpperCase();
  var candidates = [];
  if (ex.logos && ex.logos.length) candidates = candidates.concat(ex.logos);
  if (ex.logo) candidates.push(ex.logo);
  if (ex.thumbnail) candidates.push(ex.thumbnail);
  candidates = candidates.filter(function(u){ return u && u.length > 4 });
  if (!candidates.length) return '<div class="logo-cell"><span class="initial" style="background:'+hashColor(ex.title)+'">'+esc(initial)+'</span></div>';
  var bg = hashColor(ex.title);
  var chain = candidates.map(esc).join('|');
  return '<div class="logo-cell"><img src="'+esc(candidates[0])+'" alt="" loading="lazy" data-chain="'+chain+'" data-initial="'+esc(initial)+'" data-bg="'+bg+'" onerror="window.logoErr(this)"></div>';
}

window.logoErr = function(img){
  var chain = (img.getAttribute('data-chain') || '').split('|');
  var initial = img.getAttribute('data-initial') || '?';
  var bg = img.getAttribute('data-bg') || '#333';
  var tried = parseInt(img.getAttribute('data-tried') || '0', 10) + 1;
  if (tried < chain.length){ img.setAttribute('data-tried', String(tried)); img.setAttribute('src', chain[tried]); return }
  img.parentNode.innerHTML = '<span class="initial" style="background:'+bg+'">'+initial+'</span>';
};

function featHTML(ex){
  var list = [
    ['Decompiler', ex.decompiler],['Multi-Inject', ex.multiInject],['RakNet', ex.raknet],
    ['Key System', ex.keysystem],['Client Mod Bypass', ex.clientmods],
    ['UNC Support', ex.uncStatus],['Element Certified', ex.elementCertified]
  ].filter(function(p){ return p[1] === true });
  if (!list.length) return '';
  var out = '';
  for (var i = 0; i < list.length; i++) out += '<span class="feat">' + esc(list[i][0]) + '</span>';
  return '<div class="feats">' + out + '</div>';
}

function linkHTML(ex){
  var a = [];
  if (ex.websitelink) a.push('<a class="link-item" href="'+esc(ex.websitelink)+'" target="_blank" rel="noopener">Website</a>');
  if (ex.discordlink) a.push('<a class="link-item" href="'+esc(ex.discordlink)+'" target="_blank" rel="noopener">Discord</a>');
  if (ex.purchaselink) a.push('<a class="link-item" href="'+esc(ex.purchaselink)+'" target="_blank" rel="noopener">Purchase</a>');
  if (ex.store && ex.store !== ex.purchaselink) a.push('<a class="link-item" href="'+esc(ex.store)+'" target="_blank" rel="noopener">Store</a>');
  if (ex.showcase) a.push('<a class="link-item" href="'+esc(ex.showcase)+'" target="_blank" rel="noopener">Showcase</a>');
  if (!a.length) return '';
  return '<div class="links">' + a.join('') + '</div>';
}

function rowHTML(ex){
  var free = !!ex.free, st = statusOf(ex), ban = banOf(ex);
  var owner = ex.owner, sunc = ex.suncPercentage, unc = ex.uncPercentage;
  var slug = ex.slug, isFav = S.cheats.fav.has(slug);
  var isFlag = st.cls === 'flagged', isOpen = S.cheats.openSlug === slug;
  var inCompare = S.compare.indexOf(slug) !== -1;
  var views = ex.views, unverified = !!ex.unverified;

  var disabledReason = ADMIN.disabled[slug];
  var isDisabled = !!disabledReason;

  var priceHTML = free ? '<span class="free">Free</span>' : esc(ex.cost || '—');
  var rows = '';
  rows += '<tr><td class="k">Status</td><td class="v '+(st.cls==='online'?'ok':st.cls==='flagged'?'bad':'')+'">'+st.label+'</td></tr>';
  if (sunc != null) rows += '<tr><td class="k">sUNC</td><td class="v">'+sunc+'%</td></tr>';
  if (unc != null) rows += '<tr><td class="k">UNC</td><td class="v">'+unc+'%</td></tr>';
  rows += '<tr><td class="k">Price</td><td class="v">'+esc(ex.cost || (free ? 'Free' : '—'))+'</td></tr>';
  if (ex.updatedDate) rows += '<tr><td class="k">Updated</td><td class="v">'+esc(ex.updatedDate)+'</td></tr>';
  if (ex.rbxversion) rows += '<tr><td class="k">Build</td><td class="v mono-sm">'+esc(ex.rbxversion)+'</td></tr>';
  if (owner) rows += '<tr><td class="k">Dev</td><td class="v">'+esc(owner)+'</td></tr>';
  if (views) rows += '<tr><td class="k">Views</td><td class="v">'+views.toLocaleString()+'</td></tr>';
  if (ex._sources) rows += '<tr><td class="k">Source</td><td class="v mono-sm">'+esc(ex._sources.join(' + '))+'</td></tr>';

  var desc = ex.description || ex.sbDescription || ex.excerpt || '';
  var descHTML = desc && desc.trim() ? '<div class="desc">'+md(desc)+'</div>' : '<p class="desc desc-empty">No description yet.</p>';

  var cls = 'row';
  if (isFav) cls += ' pinned';
  if (isOpen) cls += ' open';
  if (isDisabled) cls += ' row-disabled';

  var nameHTML = esc(ex.title || 'Unknown');
  if (isDisabled) nameHTML += ' <span class="disabled-badge">disabled</span>';
  if (unverified) nameHTML += ' <span style="font-family:JetBrains Mono,monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-4);border:1px solid var(--rule-hi);padding:1px 5px;vertical-align:2px">unverified</span>';

  return '<div class="'+cls+'" data-slug="'+esc(slug)+'" data-free="'+free+'" data-updated="'+ex.updateStatus+'" data-flagged="'+isFlag+'" data-saved="'+isFav+'" data-disabled="'+isDisabled+'" data-name="'+esc(String(ex.title||'').toLowerCase())+'">'
    + '<div class="row-main">'
    + '<span class="star-cell '+(isFav?'on':'')+'" data-star="'+esc(slug)+'">'+STAR+'</span>'
    + logoHTML(ex)
    + '<div class="name-cell"><span class="name">'+nameHTML+'</span><span class="byline">'+(owner ? 'by '+esc(owner) : '&nbsp;')+'</span>'+(isDisabled ? '<span class="disabled-reason">⚠ '+esc(disabledReason)+'</span>' : '')+'</div>'
    + '<span class="status-cell '+st.cls+'"><span class="dot"></span>'+st.label+'</span>'
    + '<span class="version-cell">v'+esc(ex.version || '?')+'</span>'
    + '<span class="num-cell '+(sunc==null?'muted':'hi')+'">'+(sunc==null?'—':sunc+'%')+'</span>'
    + '<span class="num-cell '+(unc==null?'muted':'hi')+'">'+(unc==null?'—':unc+'%')+'</span>'
    + '<span class="num-cell '+(views==null?'muted':'')+'">'+(views==null?'—':views.toLocaleString())+'</span>'
    + '<span class="price-cell">'+priceHTML+'</span>'
    + '<span class="copy-cell" data-copy-link="'+esc(slug)+'" title="Copy short link">'+LINK_ICON+'</span>'
    + '<span class="chev-cell"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>'
    + '</div>'
    + '<div class="row-detail"><div class="detail-inner">'
    + '<div class="detail-left">'
    + (isDisabled ? '<div class="disabled-note"><strong>⚠ DISABLED BY STAFF</strong><br>'+esc(disabledReason)+'</div>' : '')
    + descHTML+'</div>'
    + '<div class="detail-right">'
    + '<table class="spec-table">'+rows+'</table>'
    + '<div class="bans '+(ban.flagged?'flagged':'')+'">'+esc(ban.text)+'</div>'
    + featHTML(ex)
    + '<button class="compare-btn '+(inCompare?'on':'')+'" data-compare="'+esc(slug)+'">'+(inCompare ? '✓ In comparison' : '+ Add to comparison')+'</button>'
    + '</div></div>'
    + linkHTML(ex)
    + '</div></div>';
}

function sorter(a, b){
  var fa = S.cheats.fav.has(a.slug) ? 0 : 1;
  var fb = S.cheats.fav.has(b.slug) ? 0 : 1;
  if (fa !== fb) return fa - fb;
  var d = S.cheats.sortDir === 'asc' ? 1 : -1;
  switch (S.cheats.sortKey){
    case 'name': return d * String(a.title||'').localeCompare(String(b.title||''));
    case 'status': return d * (rank(a) - rank(b));
    case 'version': return d * verNum(a.version).localeCompare(verNum(b.version), undefined, {numeric:true});
    case 'sunc': return d * ((a.suncPercentage == null ? -1 : a.suncPercentage) - (b.suncPercentage == null ? -1 : b.suncPercentage));
    case 'unc': return d * ((a.uncPercentage == null ? -1 : a.uncPercentage) - (b.uncPercentage == null ? -1 : b.uncPercentage));
    case 'views': return d * ((a.views || 0) - (b.views || 0));
    case 'price': return d * (priceNum(a) - priceNum(b));
  }
  var au = a.updateStatus ? 0 : 1, bu = b.updateStatus ? 0 : 1;
  if (au !== bu) return au - bu;
  var ai = typeof a.index === 'number' ? a.index : 999;
  var bi = typeof b.index === 'number' ? b.index : 999;
  if (ai !== bi) return ai - bi;
  return String(a.title||'').localeCompare(String(b.title||''));
}

function keep(ex){
  var n = String(ex.title || '').toLowerCase();
  if (S.cheats.q && n.indexOf(S.cheats.q) === -1) return false;
  var free = !!ex.free, updated = !!ex.updateStatus, flagged = !!ex.possibleBanwave;
  var saved = S.cheats.fav.has(ex.slug);
  var arr = []; S.cheats.filters.forEach(function(f){ arr.push(f) });
  for (var i = 0; i < arr.length; i++){
    var f = arr[i];
    if (f === 'free' && !free) return false;
    if (f === 'paid' && free) return false;
    if (f === 'updated' && !updated) return false;
    if (f === 'outdated' && updated) return false;
    if (f === 'flagged' && !flagged) return false;
    if (f === 'saved' && !saved) return false;
  }
  return true;
}

function statbarCheats(){
  var on = 0, off = 0, flag = 0;
  for (var i = 0; i < S.cheats.data.length; i++){
    var e = S.cheats.data[i];
    if (e.possibleBanwave) flag++;
    else if (e.updateStatus) on++;
    else off++;
  }
  $('statOnline').textContent = on; $('statOffline').textContent = off;
  $('statFlagged').textContent = flag; $('statSaved').textContent = S.cheats.fav.size;
}

function sortHeaders(){
  var hs = document.querySelectorAll('.col-head .sortable');
  for (var i = 0; i < hs.length; i++){
    var h = hs[i], k = h.getAttribute('data-sort'), on = S.cheats.sortKey === k;
    h.classList.toggle('active', on);
    var ar = h.querySelector('.arrow');
    if (!ar) continue;
    ar.textContent = !on ? '▲' : (S.cheats.sortDir === 'asc' ? '▲' : '▼');
  }
}

function wireRows(){
  var mains = document.querySelectorAll('.row-main');
  for (var i = 0; i < mains.length; i++){
    (function(main){
      main.addEventListener('click', function(e){
        if (e.target.closest('.star-cell') || e.target.closest('.copy-cell')) return;
        var row = main.closest('.row');
        if (row.getAttribute('data-disabled') === 'true') return;
        var slug = row.getAttribute('data-slug');
        var wasOpen = row.classList.contains('open');
        S.cheats.openSlug = wasOpen ? null : slug;
        var opens = document.querySelectorAll('.row.open');
        for (var j = 0; j < opens.length; j++) opens[j].classList.remove('open');
        if (S.cheats.openSlug){ row.classList.add('open'); updateHash(S.cheats.openSlug); }
        else { updateHash(null) }
      });
    })(mains[i]);
  }
  var stars = document.querySelectorAll('.star-cell');
  for (var k = 0; k < stars.length; k++){
    (function(star){
      star.addEventListener('click', function(e){
        e.stopPropagation();
        var slug = star.getAttribute('data-star');
        if (S.cheats.fav.has(slug)) S.cheats.fav.delete(slug);
        else S.cheats.fav.add(slug);
        saveFav(); renderCheats();
      });
    })(stars[k]);
  }
  var copys = document.querySelectorAll('.copy-cell');
  for (var m = 0; m < copys.length; m++){
    (function(c){
      c.addEventListener('click', function(e){
        e.stopPropagation();
        var slug = c.getAttribute('data-copy-link');
        copyText(shortUrl(slug), 'Short link copied');
        c.classList.add('copied');
        setTimeout(function(){ c.classList.remove('copied') }, 900);
      });
    })(copys[m]);
  }
  var cmps = document.querySelectorAll('.compare-btn');
  for (var n = 0; n < cmps.length; n++){
    (function(b){
      b.addEventListener('click', function(e){
        e.stopPropagation();
        toggleCompare(b.getAttribute('data-compare'));
      });
    })(cmps[n]);
  }
}

function toggleCompare(slug){
  var idx = S.compare.indexOf(slug);
  if (idx === -1){
    if (S.compare.length >= 4){ showToast('Max 4 to compare', false); return }
    S.compare.push(slug);
  } else { S.compare.splice(idx, 1); }
  saveCompare(); renderCompareTray(); renderCheats();
}

function renderCompareTray(){
  var tray = $('compareTray'), chips = $('compareChips');
  if (!S.compare.length){ tray.classList.remove('on'); return }
  tray.classList.add('on');
  var html = '';
  for (var i = 0; i < S.compare.length; i++){
    var s = S.compare[i], ex = null;
    for (var j = 0; j < S.cheats.data.length; j++){ if (S.cheats.data[j].slug === s){ ex = S.cheats.data[j]; break } }
    html += '<span class="compare-chip">'+esc(ex ? ex.title : s)+' <span class="x" data-rm="'+esc(s)+'">✕</span></span>';
  }
  chips.innerHTML = html;
  var rms = chips.querySelectorAll('.x');
  for (var k = 0; k < rms.length; k++){
    (function(x){ x.addEventListener('click', function(){ toggleCompare(x.getAttribute('data-rm')) }) })(rms[k]);
  }
}

function renderCheats(){
  var w = [], x = [], m = [], a = [];
  for (var i = 0; i < S.cheats.data.length; i++){
    var ex = S.cheats.data[i];
    if (!keep(ex)) continue;
    var b = bucketOf(ex);
    if (b === 'windows') w.push(ex);
    else if (b === 'external') x.push(ex);
    else if (b === 'mac') m.push(ex);
    else if (b === 'android') a.push(ex);
  }
  w.sort(sorter); x.sort(sorter); m.sort(sorter); a.sort(sorter);
  var pairs = [['windows',w], ['external',x], ['mac',m], ['android',a]];
  for (var j = 0; j < pairs.length; j++){
    var id = pairs[j][0], list = pairs[j][1];
    $('count-' + id).textContent = list.length;
    var grid = $('grid-' + id);
    if (!list.length){ grid.innerHTML = '<div class="empty">Nothing here.</div>'; continue }
    var html = '';
    for (var k = 0; k < list.length; k++) html += rowHTML(list[k]);
    grid.innerHTML = html;
  }
  statbarCheats(); sortHeaders(); wireRows();
}

function renderCompareView(){
  var ids = S.compare, execs = [];
  for (var i = 0; i < ids.length; i++){
    for (var j = 0; j < S.cheats.data.length; j++){
      if (S.cheats.data[j].slug === ids[i]){ execs.push(S.cheats.data[j]); break }
    }
  }
  if (!execs.length){ showToast('Nothing to compare', false); goCheats(); return }

  var table = '<div class="compare-view"><table class="compare-table"><thead><tr><th>Field</th>';
  for (var i = 0; i < execs.length; i++) table += '<th>'+esc(execs[i].title)+'</th>';
  table += '</tr></thead><tbody>';

  function row(label, fn){
    table += '<tr><td class="k">'+esc(label)+'</td>';
    for (var i = 0; i < execs.length; i++){
      var r = fn(execs[i]);
      table += '<td class="v '+(r.cls||'')+'">'+(r.html || esc(r.text != null ? r.text : '—'))+'</td>';
    }
    table += '</tr>';
  }

  row('Status', function(ex){ var s = statusOf(ex); return {text: s.label, cls: s.cls === 'online' ? 'good' : s.cls === 'flagged' ? 'bad' : 'muted'} });
  row('Version', function(ex){ return {text: ex.version || '—'} });
  row('sUNC', function(ex){ return {text: ex.suncPercentage == null ? '—' : ex.suncPercentage+'%', cls: ex.suncPercentage === 100 ? 'good' : ex.suncPercentage == null ? 'muted' : ''} });
  row('UNC', function(ex){ return {text: ex.uncPercentage == null ? '—' : ex.uncPercentage+'%', cls: ex.uncPercentage === 100 ? 'good' : ex.uncPercentage == null ? 'muted' : ''} });
  row('Price', function(ex){ return {text: ex.cost || (ex.free ? 'Free' : '—'), cls: ex.free ? 'good' : ''} });
  row('Updated', function(ex){ return {text: ex.updatedDate || '—'} });
  row('Views', function(ex){ return {text: ex.views ? ex.views.toLocaleString() : '—', cls: ex.views ? '' : 'muted'} });
  row('Developer', function(ex){ return {text: ex.owner || '—'} });
  row('Ban history', function(ex){ var b = banOf(ex); return {text: b.text, cls: b.flagged ? 'bad' : 'good'} });
  row('Decompiler', function(ex){ return {text: ex.decompiler ? 'Yes' : 'No', cls: ex.decompiler ? 'good' : 'muted'} });
  row('Multi-Inject', function(ex){ return {text: ex.multiInject ? 'Yes' : 'No', cls: ex.multiInject ? 'good' : 'muted'} });
  row('RakNet', function(ex){ return {text: ex.raknet ? 'Yes' : 'No', cls: ex.raknet ? 'good' : 'muted'} });
  row('Key System', function(ex){ return {text: ex.keysystem ? 'Yes' : 'No', cls: ex.keysystem ? 'bad' : 'good'} });
  row('Element Certified', function(ex){ return {text: ex.elementCertified ? 'Yes' : 'No', cls: ex.elementCertified ? 'good' : 'muted'} });
  row('Source', function(ex){ return {text: (ex._sources||[]).join(' + ') || '—'} });
  row('Links', function(ex){
    var a = [];
    if (ex.websitelink) a.push('<a href="'+esc(ex.websitelink)+'" target="_blank" rel="noopener" style="color:var(--red);border-bottom:1px dotted">site</a>');
    if (ex.discordlink) a.push('<a href="'+esc(ex.discordlink)+'" target="_blank" rel="noopener" style="color:var(--red);border-bottom:1px dotted">discord</a>');
    if (ex.purchaselink) a.push('<a href="'+esc(ex.purchaselink)+'" target="_blank" rel="noopener" style="color:var(--red);border-bottom:1px dotted">buy</a>');
    return {html: a.join(' · ') || '—'};
  });

  table += '</tbody></table></div>';
  $('pageCheats').innerHTML = table + '<div style="margin-top:24px"><button class="sbtn" id="backFromCompare">← Back to list</button></div>';
  $('backFromCompare').addEventListener('click', goCheats);
}

function goCheats(){ window.location.hash = '#cheats' }

function renderBreadcrumbs(parts){
  var el = $('breadcrumbs');
  if (!parts || !parts.length){ el.style.display = 'none'; return }
  var html = '';
  for (var i = 0; i < parts.length; i++){
    if (i > 0) html += '<span class="sep">›</span>';
    var p = parts[i];
    if (p.href) html += '<a href="'+esc(p.href)+'">'+esc(p.label)+'</a>';
    else html += '<span class="current">'+esc(p.label)+'</span>';
  }
  el.innerHTML = html;
  el.style.display = 'flex';
}

function renderScriptCard(sc){
  var img = absUrl(sc.image || (sc.game && sc.game.imageUrl) || '');
  var gameName = (sc.game && sc.game.name) || 'Unknown';
  var badges = '';
  if (sc.verified) badges += '<span class="script-badge verified">Verified</span>';
  if (sc.isHub) badges += '<span class="script-badge hub">Hub</span>';
  if (sc.isUniversal) badges += '<span class="script-badge">Universal</span>';
  if (sc.isPatched) badges += '<span class="script-badge patched">Patched</span>';
  var thumbInner = img && img.indexOf('no-script') === -1
    ? '<img src="'+esc(img)+'" alt="" loading="lazy" onerror="this.parentNode.innerHTML=\'<div class=&quot;placeholder&quot;>no preview</div>\'">'
    : '<div class="placeholder">no preview</div>';
  var lb = sc.leaderboard ? '<span><span class="k">Rank</span> <span class="v">#'+sc.leaderboard.rank+'</span></span>' : '';
  return '<div class="script-card" data-scid="'+esc(sc._id)+'">'
    + '<div class="script-thumb">'+thumbInner+'<div class="script-badges">'+badges+'</div></div>'
    + '<div class="script-body">'
    + '<div class="script-title">'+esc(sc.title||'Untitled')+'</div>'
    + '<div class="script-game">'+esc(gameName)+'</div>'
    + '<div class="script-meta">'
    + '<span><span class="k">Views</span> <span class="v">'+((sc.views||0).toLocaleString())+'</span></span>'
    + '<span><span class="k">Runs</span> <span class="v">'+((sc.executes||0).toLocaleString())+'</span></span>'
    + lb
    + '</div></div>'
    + '<div class="script-actions">'
    + '<button class="sbtn primary" data-copy="'+esc(sc._id)+'">Copy</button>'
    + '<button class="sbtn" data-view="'+esc(sc._id)+'">View Code</button>'
    + '</div></div>';
}

function renderScripts(){
  if (S.scripts.detail){ renderScriptDetail(); return }
  if (S.scripts.game){ renderGameView(); return }

  var grid = $('scriptsGrid'), list = S.scripts.data;
  if (S.scripts.q){
    var q = S.scripts.q;
    list = list.filter(function(sc){
      return String(sc.title||'').toLowerCase().indexOf(q) !== -1
        || String((sc.game && sc.game.name) || '').toLowerCase().indexOf(q) !== -1;
    });
  }
  if (S.scripts.filterVerified) list = list.filter(function(sc){ return sc.verified });
  if (S.scripts.filterHub) list = list.filter(function(sc){ return sc.isHub });
  if (S.scripts.filterUniversal) list = list.filter(function(sc){ return sc.isUniversal });
  if (S.scripts.filterKeyless) list = list.filter(function(sc){ return sc.keyless });

  $('scriptsControls').style.display = '';
  $('loadMore').style.display = S.scripts.hasMore ? 'block' : 'none';
  $('scriptDetailMount').innerHTML = '';

  if (!list.length){
    var msg = S.scripts.loading ? 'Searching…' : (S.scripts.searchMode ? 'No matches.' : 'No scripts loaded yet.');
    grid.innerHTML = '<div class="empty">'+msg+'</div>';
    return;
  }

  var total = list.length;
  var shown = list.slice(0, S.scripts.renderCap);
  var html = '';
  for (var i = 0; i < shown.length; i++) html += renderScriptCard(shown[i]);
  if (total > shown.length){
    var rem = total - shown.length;
    html += '<button class="show-more-inline" id="showMoreBtn">Show '+Math.min(RENDER_CAP, rem)+' more of '+rem.toLocaleString()+' remaining</button>';
  }
  grid.innerHTML = html;

  var cards = grid.querySelectorAll('.script-card');
  for (var c = 0; c < cards.length; c++){
    (function(card){
      card.addEventListener('click', function(e){
        if (e.target.closest('.sbtn')) return;
        var id = card.getAttribute('data-scid');
        window.location.hash = '#scripts/' + id;
      });
    })(cards[c]);
  }

  var copyBtns = grid.querySelectorAll('[data-copy]');
  for (var j = 0; j < copyBtns.length; j++){
    (function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var id = btn.getAttribute('data-copy');
        var sc = null;
        for (var x = 0; x < S.scripts.data.length; x++) if (S.scripts.data[x]._id === id){ sc = S.scripts.data[x]; break }
        if (!sc) return;
        copyText(sc.script || '', 'Script copied');
        btn.classList.add('copied'); btn.textContent = 'Copied';
        setTimeout(function(){ btn.classList.remove('copied'); btn.textContent = 'Copy' }, 1200);
      });
    })(copyBtns[j]);
  }

  var viewBtns = grid.querySelectorAll('[data-view]');
  for (var k = 0; k < viewBtns.length; k++){
    (function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var id = btn.getAttribute('data-view');
        var sc = null;
        for (var x = 0; x < S.scripts.data.length; x++) if (S.scripts.data[x]._id === id){ sc = S.scripts.data[x]; break }
        if (!sc) return;
        $('modalTitle').textContent = sc.title || 'Script';
        $('modalCode').textContent = sc.script || '(no code)';
        $('codeModal').classList.add('open');
      });
    })(viewBtns[k]);
  }

  var smb = $('showMoreBtn');
  if (smb) smb.addEventListener('click', function(){ S.scripts.renderCap += RENDER_CAP; renderScripts() });
}

function renderScriptDetail(){
  var sc = S.scripts.detail;
  if (!sc){ return }
  $('scriptsControls').style.display = 'none';
  $('loadMore').style.display = 'none';
  $('scriptsGrid').innerHTML = '';

  var img = absUrl(sc.image || (sc.game && sc.game.imageUrl) || '');
  var gameName = (sc.game && sc.game.name) || 'Unknown';
  var gameId = (sc.game && sc.game._id) || '';
  var tags = Array.isArray(sc.tags) ? sc.tags : [];
  var badges = '';
  if (sc.verified) badges += '<span class="script-badge verified">Verified</span>';
  if (sc.isHub) badges += '<span class="script-badge hub">Hub</span>';
  if (sc.isUniversal) badges += '<span class="script-badge">Universal</span>';
  if (sc.isPatched) badges += '<span class="script-badge patched">Patched</span>';

  var thumbHTML = img && img.indexOf('no-script') === -1
    ? '<div class="thumb"><img src="'+esc(img)+'" alt="" onerror="this.parentNode.style.display=\'none\'"></div>'
    : '';

  var gameLink = gameId
    ? '<a class="game-link" href="#games/'+esc(gameId)+'">▶ '+esc(gameName)+'</a>'
    : '<span class="game-link">▶ '+esc(gameName)+'</span>';

  var tagHTML = tags.length
    ? '<div class="badge-row">' + tags.map(function(t){ return '<span class="script-badge" style="background:var(--paper-3);color:var(--ink-2)">'+esc(t)+'</span>' }).join('') + '</div>'
    : '';

  var related = findRelated(sc);

  var html = ''
    + '<div class="script-detail">'
    + '<div class="script-detail-head">'
    + '<div>'
    + '<h2>'+esc(sc.title || 'Untitled')+'</h2>'
    + gameLink
    + '<div class="badge-row">'+badges+'</div>'
    + thumbHTML
    + '<div class="desc">'+esc(sc.description || 'No description available.')+'</div>'
    + '<div class="script-actions-full">'
    + '<button class="sbtn primary" id="detailCopy">Copy script</button>'
    + '<button class="sbtn" id="detailView">View code</button>'
    + '<button class="sbtn" id="detailShare">Copy link</button>'
    + '<a class="sbtn" href="https://scriptblox.com/script/'+esc(sc.slug||'')+'" target="_blank" rel="noopener" style="text-decoration:none;flex:0 0 auto">Open on ScriptBlox ↗</a>'
    + '</div>'
    + '</div>'
    + '<div class="meta">'
    + '<div class="row-m"><span class="k">Views</span><span class="v">'+((sc.views||0).toLocaleString())+'</span></div>'
    + '<div class="row-m"><span class="k">Executes</span><span class="v">'+((sc.executes||0).toLocaleString())+'</span></div>'
    + '<div class="row-m"><span class="k">Verified</span><span class="v">'+(sc.verified ? 'Yes' : 'No')+'</span></div>'
    + '<div class="row-m"><span class="k">Universal</span><span class="v">'+(sc.isUniversal ? 'Yes' : 'No')+'</span></div>'
    + '<div class="row-m"><span class="k">Key</span><span class="v">'+(sc.key ? 'Required' : 'None')+'</span></div>'
    + '<div class="row-m"><span class="k">Type</span><span class="v">'+esc(sc.scriptType || '—')+'</span></div>'
    + '<div class="row-m"><span class="k">Created</span><span class="v">'+esc((sc.createdAt||'').slice(0,10))+'</span></div>'
    + '</div>'
    + '</div>'
    + tagHTML
    + '</div>';

  if (related.length){
    html += '<div class="related"><h3>Related scripts · '+esc(gameName)+'</h3><div class="related-grid">';
    for (var i = 0; i < related.length; i++){
      var r = related[i];
      html += '<a class="related-item" href="#scripts/'+esc(r._id)+'">'
        + '<div style="min-width:0;flex:1"><div class="rt">'+esc(r.title)+'</div><div class="rm">'+((r.views||0).toLocaleString())+' views</div></div>'
        + '</a>';
    }
    html += '</div></div>';
  }

  $('scriptDetailMount').innerHTML = html;

  $('detailCopy').addEventListener('click', function(){ copyText(sc.script || '', 'Script copied') });
  $('detailView').addEventListener('click', function(){
    $('modalTitle').textContent = sc.title || 'Script';
    $('modalCode').textContent = sc.script || '(no code)';
    $('codeModal').classList.add('open');
  });
  $('detailShare').addEventListener('click', function(){ copyText(siteUrl('#scripts/' + sc._id), 'Link copied') });
}

function findRelated(sc){
  var gameId = sc.game && sc.game._id;
  if (!gameId) return [];
  var out = [];
  for (var i = 0; i < S.scripts.data.length; i++){
    var x = S.scripts.data[i];
    if (x._id === sc._id) continue;
    if (x.game && x.game._id === gameId) out.push(x);
    if (out.length >= 6) break;
  }
  return out;
}

function renderGameView(){
  var g = S.scripts.game;
  if (!g){ return }
  $('scriptsControls').style.display = 'none';
  $('loadMore').style.display = 'none';
  $('scriptsGrid').innerHTML = '';

  var list = S.scripts.gameScripts || [];
  var html = '<div class="script-detail" style="padding:20px 24px;margin-bottom:24px">'
    + '<h2 style="font-size:1.4rem">'+esc(g.name)+'</h2>'
    + '<div class="script-game" style="margin-top:6px">'+list.length+' scripts</div>'
    + '</div>';

  if (!list.length){
    html += '<div class="empty">No scripts for this game yet.</div>';
  } else {
    html += '<div class="scripts-grid">';
    for (var i = 0; i < list.length; i++) html += renderScriptCard(list[i]);
    html += '</div>';
  }

  $('scriptDetailMount').innerHTML = html;

  var cards = $('scriptDetailMount').querySelectorAll('.script-card');
  for (var c = 0; c < cards.length; c++){
    (function(card){
      card.addEventListener('click', function(e){
        if (e.target.closest('.sbtn')) return;
        window.location.hash = '#scripts/' + card.getAttribute('data-scid');
      });
    })(cards[c]);
  }
  var copyBtns = $('scriptDetailMount').querySelectorAll('[data-copy]');
  for (var j = 0; j < copyBtns.length; j++){
    (function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var id = btn.getAttribute('data-copy');
        var sc = null;
        for (var x = 0; x < list.length; x++) if (list[x]._id === id){ sc = list[x]; break }
        if (sc) copyText(sc.script || '', 'Script copied');
      });
    })(copyBtns[j]);
  }
  var viewBtns = $('scriptDetailMount').querySelectorAll('[data-view]');
  for (var k = 0; k < viewBtns.length; k++){
    (function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var id = btn.getAttribute('data-view');
        var sc = null;
        for (var x = 0; x < list.length; x++) if (list[x]._id === id){ sc = list[x]; break }
        if (!sc) return;
        $('modalTitle').textContent = sc.title || 'Script';
        $('modalCode').textContent = sc.script || '(no code)';
        $('codeModal').classList.add('open');
      });
    })(viewBtns[k]);
  }
}

var renderScriptTimer = null;
function scheduleRenderScripts(){
  if (renderScriptTimer) return;
  renderScriptTimer = setTimeout(function(){ renderScriptTimer = null; renderScripts() }, 250);
}

function showProgress(label){ $('scriptsProgress').classList.add('on'); $('progressLabel').innerHTML = esc(label); $('progressFill').style.width = '0%' }
function updateProgress(){
  var p = S.scripts.progress;
  var pct = Math.min(100, (p.current / p.total) * 100);
  $('progressFill').style.width = pct.toFixed(1) + '%';
  $('progressLabel').innerHTML = 'Loading page <span class="n">' + p.current + '</span> / ' + p.total + ' &nbsp;·&nbsp; <span class="n">' + S.scripts.data.length.toLocaleString() + '</span> scripts loaded';
}
function hideProgress(){ $('scriptsProgress').classList.remove('on') }

async function fetchSearchPage(q, page, token){
  try {
    var url = CONFIG.sbScriptSearch + encodeURIComponent(q) + '&page=' + page;
    var r = await doFetch(url);
    if (S.scripts.searchToken !== token) return null;
    return r && r.result ? r.result : null;
  } catch(e){ return null }
}

async function runSearch(query){
  var token = ++S.scripts.searchToken;
  S.scripts.searchMode = true; S.scripts.data = []; S.scripts.seenIds = new Set();
  S.scripts.loading = true; S.scripts.detail = null; S.scripts.game = null;
  S.scripts.progress.current = 0; S.scripts.progress.total = SEARCH_MAX_PAGES;
  S.scripts.renderCap = RENDER_CAP;

  $('scriptsGrid').innerHTML = ''; $('loadMore').style.display = 'none';
  showProgress('Searching "' + query + '"…'); updateProgress();

  var page = 1, emptyStreak = 0, noMore = false;
  while (page <= SEARCH_MAX_PAGES && !noMore && S.scripts.searchToken === token){
    var batch = [];
    for (var i = 0; i < SEARCH_CONCURRENCY && page + i <= SEARCH_MAX_PAGES; i++) batch.push(fetchSearchPage(query, page + i, token));
    var results = await Promise.all(batch);
    if (S.scripts.searchToken !== token) return;

    var added = 0;
    for (var j = 0; j < results.length; j++){
      var r = results[j]; if (!r) continue;
      var scripts = r.scripts || [];
      for (var s = 0; s < scripts.length; s++){
        var sc = scripts[s];
        if (S.scripts.seenIds.has(sc._id)) continue;
        S.scripts.seenIds.add(sc._id); S.scripts.data.push(sc); added++;
      }
      if (!r.nextPage) noMore = true;
    }
    page += SEARCH_CONCURRENCY;
    S.scripts.progress.current = Math.min(page - 1, SEARCH_MAX_PAGES);
    if (added === 0) emptyStreak++; else emptyStreak = 0;
    if (emptyStreak >= 3) noMore = true;
    updateProgress(); scheduleRenderScripts();
    if (!noMore && S.scripts.searchToken === token) await new Promise(function(res){ setTimeout(res, SEARCH_BATCH_DELAY) });
  }

  if (S.scripts.searchToken === token){
    S.scripts.loading = false; S.scripts.hasMore = false;
    hideProgress(); renderScripts();
  }
}

async function loadScriptsPage(reset){
  if (S.scripts.loading) return;
  S.scripts.loading = true;
  var btn = $('loadMore'); btn.disabled = true; btn.textContent = reset ? 'Loading…' : 'Loading more…';

  if (reset){
    S.scripts.data = []; S.scripts.page = 1; S.scripts.hasMore = true;
    S.scripts.seenIds = new Set(); S.scripts.renderCap = RENDER_CAP;
    S.scripts.detail = null; S.scripts.game = null;
    var skels = '';
    for (var i = 0; i < 8; i++) skels += '<div class="skel-card"></div>';
    $('scriptsGrid').innerHTML = skels;
  }

  try {
    var url = CONFIG.sbScriptFetch;
    if (S.scripts.page > 1) url += '?page=' + S.scripts.page;
    var res = await doFetch(url);
    var scripts = (res && res.result && res.result.scripts) || [];
    for (var s = 0; s < scripts.length; s++){
      if (S.scripts.seenIds.has(scripts[s]._id)) continue;
      S.scripts.seenIds.add(scripts[s]._id); S.scripts.data.push(scripts[s]);
    }
    S.scripts.hasMore = !!(res && res.result && res.result.nextPage);
    S.scripts.page++;
    S.scripts.loading = false; btn.disabled = false;
    btn.textContent = S.scripts.hasMore ? 'Load more' : 'No more scripts';
    renderScripts();
  } catch(err){
    console.error(err);
    S.scripts.loading = false; btn.disabled = false; btn.textContent = 'Load more';
    $('errorBox').innerHTML = '<div class="error"><span class="lbl">Error</span>Couldn\'t load scripts — ' + esc(err.message || String(err)) + '.</div>';
  }
}

async function loadScriptById(id){
  for (var i = 0; i < S.scripts.data.length; i++){
    if (S.scripts.data[i]._id === id){ S.scripts.detail = S.scripts.data[i]; renderScriptDetail(); return }
  }
  $('scriptsGrid').innerHTML = '<div class="skel-card"></div>';
  try {
    var res = await doFetch(CONFIG.sbScriptBySlug + id);
    if (res && res.script){ S.scripts.detail = res.script; renderScriptDetail() }
    else { $('scriptsGrid').innerHTML = '<div class="empty">Script not found.</div>' }
  } catch(e){
    $('scriptsGrid').innerHTML = '<div class="empty">Couldn\'t load script.</div>';
  }
}

async function loadGameById(gameId){
  var game = null, list = [];
  for (var i = 0; i < S.scripts.data.length; i++){
    var sc = S.scripts.data[i];
    if (sc.game && sc.game._id === gameId){ if (!game) game = sc.game; list.push(sc); }
  }
  if (!game){ $('scriptsGrid').innerHTML = '<div class="empty">Game not found in loaded scripts.</div>'; return }
  list.sort(function(a, b){ return (b.views||0) - (a.views||0) });
  S.scripts.game = game; S.scripts.gameScripts = list; renderGameView();
}

var scriptSearchTimer = null;

function wireScriptsControls(){
  $('scriptSearch').addEventListener('input', function(e){
    S.scripts.q = e.target.value.trim().toLowerCase();
    clearTimeout(scriptSearchTimer);
    if (!S.scripts.q){
      S.scripts.searchToken++; S.scripts.searchMode = false; S.scripts.loading = false;
      S.scripts.data = []; S.scripts.page = 1; S.scripts.hasMore = true;
      S.scripts.seenIds = new Set(); S.scripts.renderCap = RENDER_CAP;
      S.scripts.detail = null; S.scripts.game = null;
      hideProgress(); $('loadMore').style.display = 'block';
      loadScriptsPage(true); return;
    }
    scriptSearchTimer = setTimeout(function(){ runSearch(S.scripts.q) }, 500);
  });
  $('scriptFilterVerified').addEventListener('click', function(){ S.scripts.filterVerified = !S.scripts.filterVerified; this.classList.toggle('on', S.scripts.filterVerified); renderScripts() });
  $('scriptFilterHub').addEventListener('click', function(){ S.scripts.filterHub = !S.scripts.filterHub; this.classList.toggle('on', S.scripts.filterHub); renderScripts() });
  $('scriptFilterUniversal').addEventListener('click', function(){ S.scripts.filterUniversal = !S.scripts.filterUniversal; this.classList.toggle('on', S.scripts.filterUniversal); renderScripts() });
  $('scriptFilterKeyless').addEventListener('click', function(){ S.scripts.filterKeyless = !S.scripts.filterKeyless; this.classList.toggle('on', S.scripts.filterKeyless); renderScripts() });
  $('loadMore').addEventListener('click', function(){ loadScriptsPage(false) });
  $('progressCancel').addEventListener('click', function(){
    S.scripts.searchToken++; S.scripts.loading = false; hideProgress();
    if (S.scripts.data.length) renderScripts();
    else $('scriptsGrid').innerHTML = '<div class="empty">Search cancelled.</div>';
  });
  $('modalClose').addEventListener('click', function(){ $('codeModal').classList.remove('open') });
  $('codeModal').addEventListener('click', function(e){ if (e.target === this) this.classList.remove('open') });
}

function wireCheatFilters(){
  var btns = document.querySelectorAll('#pageCheats .fbtn');
  for (var i = 0; i < btns.length; i++){
    (function(btn){
      btn.addEventListener('click', function(){
        var f = btn.getAttribute('data-filter');
        if (S.cheats.filters.has(f)){ S.cheats.filters.delete(f); btn.classList.remove('active') }
        else {
          var pairs = {free:'paid', paid:'free', updated:'outdated', outdated:'updated'};
          if (pairs[f]){
            S.cheats.filters.delete(pairs[f]);
            var other = document.querySelector('#pageCheats .fbtn[data-filter="'+pairs[f]+'"]');
            if (other) other.classList.remove('active');
          }
          S.cheats.filters.add(f); btn.classList.add('active');
        }
        renderCheats(); updateHash(null);
      });
    })(btns[i]);
  }
  $('searchInput').addEventListener('input', function(e){ S.cheats.q = e.target.value.trim().toLowerCase(); renderCheats() });
}

function wireCheatSorts(){
  var hs = document.querySelectorAll('.col-head .sortable');
  for (var i = 0; i < hs.length; i++){
    (function(h){
      h.addEventListener('click', function(){
        var k = h.getAttribute('data-sort');
        if (S.cheats.sortKey === k) S.cheats.sortDir = S.cheats.sortDir === 'asc' ? 'desc' : 'asc';
        else { S.cheats.sortKey = k; S.cheats.sortDir = (k === 'sunc' || k === 'unc' || k === 'views') ? 'desc' : 'asc' }
        renderCheats();
      });
    })(hs[i]);
  }
}

async function loadCheats(){
  var ids = ['windows','external','mac','android'];
  for (var i = 0; i < ids.length; i++){
    var s = ''; for (var j = 0; j < 3; j++) s += '<div class="skel"></div>';
    $('grid-' + ids[i]).innerHTML = s; $('count-' + ids[i]).textContent = '…';
  }
  var weaoList = [], sbList = [];
  try {
    var results = await Promise.all([
      fetchWeao(),
      doFetch(CONFIG.sbExecutorEndpoint).catch(function(e){ console.warn('[scriptblox] executors failed:', e.message); return null })
    ]);
    weaoList = results[0] || [];
    var sbRaw = results[1];
    if (Array.isArray(sbRaw)) sbList = sbRaw;
    else if (sbRaw && Array.isArray(sbRaw.executors)) sbList = sbRaw.executors;
    else if (sbRaw && Array.isArray(sbRaw.data)) sbList = sbRaw.data;
    console.log('[sources] weao:', weaoList.length, '| scriptblox:', sbList.length);
    if (!weaoList.length && !sbList.length) throw new Error('both sources returned no data');
    if (!weaoList.length) $('errorBox').innerHTML = '<div class="error warn"><span class="lbl">Degraded</span>WEAO unreachable — showing ScriptBlox data only.</div>';
    else if (!sbList.length) $('errorBox').innerHTML = '<div class="error warn"><span class="lbl">Degraded</span>ScriptBlox unreachable — showing WEAO data only.</div>';
    else $('errorBox').innerHTML = '';
    S.cheats.data = mergeExecutors(weaoList, sbList);
    console.log('[merge] total:', S.cheats.data.length);
    renderCheats();
  } catch(err){
    console.error('[loadCheats]', err);
    $('errorBox').innerHTML = '<div class="error"><span class="lbl">Error</span>Couldn\'t load executor data — ' + esc(err.message || String(err)) + '.</div>';
    for (var k = 0; k < ids.length; k++){
      $('grid-' + ids[k]).innerHTML = '<div class="empty">Data unavailable.</div>';
      $('count-' + ids[k]).textContent = '0';
    }
  }
}

function updateHash(sub){
  var base = '#cheats', parts = [];
  if (S.cheats.filters.size){
    var arr = []; S.cheats.filters.forEach(function(f){ arr.push(f) });
    parts.push(arr.join(','));
  }
  if (S.cheats.sortKey) parts.push('sort=' + S.cheats.sortKey + '-' + S.cheats.sortDir);
  var h = base;
  if (sub) h += '/' + sub;
  if (parts.length) h += '?' + parts.join('&');
  try { history.replaceState(null, '', h) } catch(e){}
}

function parseHash(){
  var h = (location.hash || '').replace(/^#/, '');
  if (!h) return { page: 'cheats', sub: null, params: {} };
  var qIdx = h.indexOf('?');
  var path = qIdx >= 0 ? h.slice(0, qIdx) : h;
  var query = qIdx >= 0 ? h.slice(qIdx + 1) : '';
  var segments = path.split('/').filter(Boolean);
  var page = segments[0] || 'cheats';
  var sub = segments[1] || null;
  var params = {};
  if (query){
    var kv = query.split('&');
    for (var i = 0; i < kv.length; i++){
      var eq = kv[i].indexOf('=');
      if (eq >= 0) params[kv[i].slice(0, eq)] = kv[i].slice(eq + 1);
      else params[kv[i]] = true;
    }
  }
  return { page: page, sub: sub, params: params };
}

function applyFiltersFromParams(params){
  S.cheats.filters = new Set();
  var chips = document.querySelectorAll('#pageCheats .fbtn');
  for (var i = 0; i < chips.length; i++) chips[i].classList.remove('active');
  if (params.free) { S.cheats.filters.add('free'); var b = document.querySelector('#pageCheats .fbtn[data-filter="free"]'); if (b) b.classList.add('active') }
  if (params.paid) { S.cheats.filters.add('paid'); var b = document.querySelector('#pageCheats .fbtn[data-filter="paid"]'); if (b) b.classList.add('active') }
  if (params.updated) { S.cheats.filters.add('updated'); var b = document.querySelector('#pageCheats .fbtn[data-filter="updated"]'); if (b) b.classList.add('active') }
  if (params.outdated) { S.cheats.filters.add('outdated'); var b = document.querySelector('#pageCheats .fbtn[data-filter="outdated"]'); if (b) b.classList.add('active') }
  if (params.flagged) { S.cheats.filters.add('flagged'); var b = document.querySelector('#pageCheats .fbtn[data-filter="flagged"]'); if (b) b.classList.add('active') }
  if (params.saved) { S.cheats.filters.add('saved'); var b = document.querySelector('#pageCheats .fbtn[data-filter="saved"]'); if (b) b.classList.add('active') }
  if (params.sort){
    var parts = params.sort.split('-');
    if (parts.length >= 2){ S.cheats.sortKey = parts[0]; S.cheats.sortDir = parts[parts.length - 1] }
  }
}

function route(){
  var r = parseHash();
  if (r.page === 'news'){
    switchTab('cheats', true);
    $('pageCheats').style.display = 'none';
    $('pageScripts').style.display = 'none';
    $('pageNews').style.display = '';
    renderNewsPage();
    renderBreadcrumbs([{label:'Home', href:'#cheats'}, {label:'News'}]);
    return;
  }
  $('pageNews').style.display = 'none';
  if (r.page === 'compare'){
    S.page = 'cheats'; S.view = 'compare';
    switchTab('cheats', true); renderCompareView();
    renderBreadcrumbs([{ label: 'Cheats', href: '#cheats' }, { label: 'Comparison' }]);
    return;
  }
  if (r.page === 'games' && r.sub){
    S.page = 'scripts'; S.view = 'game';
    switchTab('scripts', true);
    renderBreadcrumbs([{ label: 'Scripts', href: '#scripts' }, { label: 'Game' }]);
    loadGameById(decodeURIComponent(r.sub));
    return;
  }
  if (r.page === 'scripts' && r.sub){
    S.page = 'scripts'; S.view = 'script';
    switchTab('scripts', true); loadScriptById(r.sub);
    renderBreadcrumbs([{ label: 'Scripts', href: '#scripts' }, { label: 'Script' }]);
    return;
  }
  if (r.page === 'scripts'){
    S.page = 'scripts'; S.view = 'list';
    S.scripts.detail = null; S.scripts.game = null;
    switchTab('scripts', true);
    if (!S.scripts.defaultLoaded){ S.scripts.defaultLoaded = true; loadScriptsPage(true) }
    else renderScripts();
    renderBreadcrumbs(null);
    return;
  }
  S.page = 'cheats'; S.view = 'list';
  applyFiltersFromParams(r.params);
  switchTab('cheats', true);
  if (r.sub){
    S.cheats.openSlug = r.sub;
    renderCheats();
    setTimeout(function(){
      var row = document.querySelector('.row[data-slug="'+r.sub+'"]');
      if (row){ row.classList.add('open'); row.scrollIntoView({behavior:'smooth', block:'center'}) }
    }, 300);
  } else {
    S.cheats.openSlug = null; renderCheats();
  }
  renderBreadcrumbs(null);
}

function switchTab(name, silent){
  S.page = name;
  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === name);
  if (name === 'cheats'){
    $('pageCheats').style.display = '';
    $('pageScripts').style.display = 'none';
    $('pageNews').style.display = 'none';
    $('tagline').textContent = 'The worst roblox executor stat tracker.';
    $('sourceLine').innerHTML = 'Data via <a href="https://weao.gg" target="_blank" rel="noopener">weao.gg</a> &amp; <a href="https://scriptblox.com" target="_blank" rel="noopener">scriptblox.com</a>';
    $('credit').innerHTML = 'Data powered by <a href="https://weao.gg" target="_blank" rel="noopener">weao</a> &amp; <a href="https://scriptblox.com" target="_blank" rel="noopener">scriptblox</a>';
  } else if (name === 'scripts'){
    $('pageCheats').style.display = 'none';
    $('pageScripts').style.display = '';
    $('pageNews').style.display = 'none';
    $('tagline').textContent = 'The worst roblox script catalogue.';
    $('sourceLine').innerHTML = 'Data via <a href="https://scriptblox.com" target="_blank" rel="noopener">scriptblox.com</a>';
    $('credit').innerHTML = 'Powered by <a href="https://scriptblox.com" target="_blank" rel="noopener">scriptblox</a>';
  } else if (name === 'news'){
    $('pageCheats').style.display = 'none';
    $('pageScripts').style.display = 'none';
    $('pageNews').style.display = '';
    renderNewsPage();
    $('tagline').textContent = 'Site announcements.';
    $('sourceLine').innerHTML = '';
    $('credit').innerHTML = '';
  }
  if (!silent){ try { history.replaceState(null, '', '#' + name) } catch(e){} }
}

function wireTabs(){
  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++){
    (function(t){
      t.addEventListener('click', function(){ window.location.hash = '#' + t.getAttribute('data-tab') });
    })(tabs[i]);
  }
}

var cmdSel = 0, cmdItems = [];
function buildCmdIndex(){
  cmdItems = [];
  for (var i = 0; i < S.cheats.data.length; i++){
    var ex = S.cheats.data[i];
    cmdItems.push({ kind: 'executor', title: ex.title, sub: (bucketOf(ex) || 'executor') + ' · ' + (ex.version || ''), hash: '#cheats/' + ex.slug, color: hashColor(ex.title), initial: String(ex.title||'?').charAt(0).toUpperCase() });
  }
  for (var j = 0; j < S.scripts.data.length; j++){
    var sc = S.scripts.data[j];
    if (cmdItems.length > 4000) break;
    cmdItems.push({ kind: 'script', title: sc.title || 'Untitled', sub: (sc.game && sc.game.name) || '', hash: '#scripts/' + sc._id, color: hashColor(sc.title || '?'), initial: String(sc.title||'?').charAt(0).toUpperCase() });
  }
}

function fuzzyMatch(needle, hay){
  if (!needle) return true;
  needle = needle.toLowerCase(); hay = hay.toLowerCase();
  var ni = 0;
  for (var i = 0; i < hay.length && ni < needle.length; i++) if (hay[i] === needle[ni]) ni++;
  return ni === needle.length;
}

function renderCmdResults(q){
  var results = $('cmdResults');
  if (!cmdItems.length) buildCmdIndex();
  var filtered = [], max = 40;
  for (var i = 0; i < cmdItems.length && filtered.length < max; i++){
    var it = cmdItems[i];
    if (!q || fuzzyMatch(q, it.title) || fuzzyMatch(q, it.sub)) filtered.push(it);
  }
  if (!filtered.length){ results.innerHTML = '<div class="cmd-empty">No matches.</div>'; cmdSel = 0; return }
  if (cmdSel >= filtered.length) cmdSel = 0;
  var html = '';
  for (var j = 0; j < filtered.length; j++){
    var r = filtered[j];
    html += '<div class="cmd-result '+(j === cmdSel ? 'sel' : '')+'" data-idx="'+j+'">'
      + '<div class="icon" style="background:'+r.color+';color:#fff">'+esc(r.initial)+'</div>'
      + '<div class="info"><div class="title">'+esc(r.title)+'</div><div class="sub">'+esc(r.sub)+'</div></div>'
      + '<span class="kind">'+r.kind+'</span>'
      + '</div>';
  }
  results.innerHTML = html;
  cmdItems._filtered = filtered;
  var els = results.querySelectorAll('.cmd-result');
  for (var k = 0; k < els.length; k++){
    (function(el){
      el.addEventListener('click', function(){
        var idx = parseInt(el.getAttribute('data-idx'), 10);
        var item = cmdItems._filtered[idx];
        if (!item) return;
        closeCmd(); window.location.hash = item.hash;
      });
    })(els[k]);
  }
}

function openCmd(){ $('cmdPalette').classList.add('on'); $('cmdInput').value = ''; cmdSel = 0; buildCmdIndex(); renderCmdResults(''); setTimeout(function(){ $('cmdInput').focus() }, 50) }
function closeCmd(){ $('cmdPalette').classList.remove('on') }

function wireCmd(){
  $('cmdBtn').addEventListener('click', openCmd);
  $('cmdPalette').addEventListener('click', function(e){ if (e.target === this) closeCmd() });
  $('cmdInput').addEventListener('input', function(e){ cmdSel = 0; renderCmdResults(e.target.value) });
  document.addEventListener('keydown', function(e){
    if ((e.ctrlKey || e.metaKey) && e.key === 'k'){ e.preventDefault(); openCmd(); return }
    if (!$('cmdPalette').classList.contains('on')) return;
    if (e.key === 'Escape'){ e.preventDefault(); closeCmd(); return }
    if (e.key === 'ArrowDown'){ e.preventDefault(); cmdSel++; renderCmdResults($('cmdInput').value); return }
    if (e.key === 'ArrowUp'){ e.preventDefault(); cmdSel = Math.max(0, cmdSel - 1); renderCmdResults($('cmdInput').value); return }
    if (e.key === 'Enter'){
      e.preventDefault();
      var item = cmdItems._filtered && cmdItems._filtered[cmdSel];
      if (item){ closeCmd(); window.location.hash = item.hash }
    }
  });
}

function wireShare(){
  $('shareBtn').addEventListener('click', function(){ copyText(location.href, 'Link copied') });
}

function wireCompareTray(){
  $('compareGo').addEventListener('click', function(){
    if (S.compare.length < 2){ showToast('Add at least 2 executors', false); return }
    window.location.hash = '#compare/' + S.compare.join(',');
  });
  $('compareClear').addEventListener('click', function(){ S.compare = []; saveCompare(); renderCompareTray(); renderCheats() });
}

function wireKeys(){
  document.addEventListener('keydown', function(e){
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') return;
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
    if (e.key === '/' && !typing){
      e.preventDefault();
      var inp = S.page === 'cheats' ? $('searchInput') : $('scriptSearch');
      if (inp){ inp.focus(); inp.select() }
    }
    if (e.key === 'Escape'){
      if (typing) e.target.blur();
      $('codeModal').classList.remove('open');
    }
  });
}

function supabaseHeaders(){
  return { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON, Accept: 'application/json' };
}

async function loadDisabled(){
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/disabled_executors?select=slug,reason,disabled_at', { headers: supabaseHeaders() });
    if (!r.ok) return;
    var rows = await r.json();
    ADMIN.disabled = {};
    for (var i = 0; i < rows.length; i++) ADMIN.disabled[rows[i].slug] = rows[i].reason;
    if (S.cheats.data.length) renderCheats();
  } catch(e){ console.warn('[disabled]', e) }
}

async function loadAnnouncements(){
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/announcements?select=*&active=eq.true&order=created_at.desc', { headers: supabaseHeaders() });
    if (!r.ok) return;
    ADMIN.announcements = await r.json();
    renderAnnouncements();
    if (S.page === 'news') renderNewsPage();
  } catch(e){ console.warn('[announcements]', e) }
}

async function loadAdminData(){
  await Promise.all([loadDisabled(), loadAnnouncements()]);
}

var sbLive = null;
try {
  if (window.supabase && window.supabase.createClient){
    sbLive = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 5 } }
    });
  }
} catch(e){ console.warn('[realtime init]', e) }

function subscribeRealtime(){
  if (!sbLive) return;
  sbLive
    .channel('whatweao-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'disabled_executors' }, function(){ loadDisabled(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, function(){ loadAnnouncements(); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'snapshots' }, function(){ loadBanwaveState(); })
    .subscribe();
}

function renderAnnouncements(){
  var mount = $('annBanners');
  if (!mount) return;
  if (!ADMIN.announcements.length){ mount.innerHTML = ''; $('newsTab').style.display = 'none'; return }

  $('newsTab').style.display = '';

  var dismissedRaw = localStorage.getItem('weao_dismissed_ann') || '';
  var dismissed = dismissedRaw ? dismissedRaw.split(',') : [];

  var html = '';
  for (var i = 0; i < ADMIN.announcements.length; i++){
    var a = ADMIN.announcements[i];
    if (dismissed.indexOf(String(a.id)) !== -1) continue;
    var icons = { info: 'i', warn: '!', critical: '!!' };
    var icon = icons[a.level] || 'i';
    html += '<div class="ann-banner '+esc(a.level)+'" data-ann-id="'+a.id+'">'
      + '<div class="ann-icon">'+esc(icon)+'</div>'
      + '<div class="ann-content">'
      +   '<div class="ann-title">'+esc(a.title)+'</div>'
      +   (a.body ? '<div class="ann-body">'+esc(a.body)+'</div>' : '')
      +   '<div class="ann-meta">'+esc((a.created_at||'').slice(0,10))+' · click to expand</div>'
      + '</div>'
      + '<div class="ann-dismiss" data-dismiss="'+a.id+'">✕</div>'
      + '</div>';
  }
  mount.innerHTML = html;

  mount.querySelectorAll('.ann-banner').forEach(function(b){
    b.addEventListener('click', function(e){
      if (e.target.closest('.ann-dismiss')) return;
      b.classList.toggle('expanded');
    });
  });
  mount.querySelectorAll('.ann-dismiss').forEach(function(x){
    x.addEventListener('click', function(e){
      e.stopPropagation();
      var id = x.getAttribute('data-dismiss');
      var cur = localStorage.getItem('weao_dismissed_ann') || '';
      var arr = cur ? cur.split(',') : [];
      if (arr.indexOf(id) === -1) arr.push(id);
      localStorage.setItem('weao_dismissed_ann', arr.join(','));
      var banner = x.closest('.ann-banner');
      banner.style.transition = 'opacity .2s, transform .2s';
      banner.style.opacity = '0';
      banner.style.transform = 'translateY(-8px)';
      setTimeout(function(){ banner.remove() }, 200);
    });
  });
}

function renderNewsPage(){
  var body = $('newsBody');
  if (!body) return;
  if (!ADMIN.announcements.length){
    body.innerHTML = '<div class="empty">No announcements right now.</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < ADMIN.announcements.length; i++){
    var a = ADMIN.announcements[i];
    var lvl = a.level === 'critical' ? 'critical' : (a.level === 'warn' ? 'warn' : 'info');
    html += '<div class="ann-card '+lvl+'">'
      + '<h3><span class="lvl">'+esc(lvl)+'</span>'+esc(a.title)+'</h3>'
      + (a.body ? '<div class="body">'+esc(a.body)+'</div>' : '')
      + '<div class="date">'+esc((a.created_at||'').slice(0,10))+'</div>'
      + '</div>';
  }
  body.innerHTML = html;
}

async function loadBanwaveState(){
  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/snapshots?select=taken_at,banwave_active,flagged_count,data&order=taken_at.desc&limit=200', { headers: supabaseHeaders() });
    if (!r.ok) return;
    var rows = await r.json();
    if (!rows.length) return;
    var latest = rows[0];
    BANWAVE.active = latest.banwave_active;
    BANWAVE.lastChecked = latest.taken_at;
    BANWAVE.flagged = [];
    if (Array.isArray(latest.data)){
      for (var i = 0; i < latest.data.length; i++) if (latest.data[i].possibleBanwave) BANWAVE.flagged.push(latest.data[i].title);
    }
    BANWAVE.history = [];
    var prev = null;
    for (var j = rows.length - 1; j >= 0; j--){
      var cur = rows[j];
      if (prev === null || cur.banwave_active !== prev){
        BANWAVE.history.push({ at: cur.taken_at, active: cur.banwave_active, count: cur.flagged_count });
        prev = cur.banwave_active;
      }
    }
    renderBanwaveBanner();
  } catch(e){ console.warn('[banwave]', e) }
}

function renderBanwaveBanner(){
  var mount = $('banwaveBanner');
  if (!mount) return;
  if (BANWAVE.lastChecked === null){ mount.style.display = 'none'; return }
  mount.style.display = '';
  if (BANWAVE.active){
    var names = BANWAVE.flagged.slice(0, 3).join(', ');
    var more = BANWAVE.flagged.length > 3 ? ' +' + (BANWAVE.flagged.length - 3) + ' more' : '';
    mount.className = 'banwave-banner warn';
    mount.innerHTML = '<span class="bw-dot"></span><strong>BANWAVE ACTIVE</strong> — Flagged: ' + names + more + '. Do not inject right now.';
  } else {
    var lastActive = null;
    for (var i = 0; i < BANWAVE.history.length; i++){
      if (BANWAVE.history[i].active){ lastActive = BANWAVE.history[i]; break }
    }
    var days = '—';
    if (lastActive){
      var diff = Date.now() - new Date(lastActive.at).getTime();
      days = Math.floor(diff / 86400000);
    }
    mount.className = 'banwave-banner safe';
    mount.innerHTML = '<span class="bw-dot"></span><strong>No banwave</strong> — last one was ' + (lastActive ? days + ' days ago' : 'never since tracking began') + '.';
  }
}

(function boot(){
  $('discordHero').href = CONFIG.discordInvite;
  $('discordFooter').href = CONFIG.discordInvite;
  var d = new Date();
  var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  $('dateline').textContent = mo[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  S.compare = loadCompare();
  wireTabs(); wireCheatFilters(); wireCheatSorts(); wireScriptsControls();
  wireCmd(); wireShare(); wireCompareTray(); wireKeys();
  window.addEventListener('hashchange', route);
  renderCompareTray();
  var shortLink = detectShortLink();
  if (shortLink){ try { history.replaceState(null, '', shortLink) } catch(e){} }
  route();
  loadCheats().then(function(){ renderCompareTray() });
  loadBanwaveState();
  loadAdminData();
  subscribeRealtime();
})();
