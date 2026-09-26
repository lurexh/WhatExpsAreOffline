const fs = require('fs');
const path = require('path');

const SUPA = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_KEY;

const WEAO_URLS = [
  'https://weao.xyz/api/status/exploits',
  'https://weao.gg/api/status/exploits',
  'https://whatexpsare.online/api/status/exploits'
];
const SB_EXECUTORS = 'https://scriptblox.com/api/executor/list';
const RETENTION_DAYS = 30;
const SITE_URL = 'https://weaoffline.vercel.app';

function slugify(s){
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function absUrl(u){
  if (!u) return '';
  if (u.indexOf('http') === 0) return u;
  if (u.charAt(0) === '/') return 'https://scriptblox.com' + u;
  return u;
}

function escapeHtml(s){
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function fetchWeao(){
  for (const url of WEAO_URLS){
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'WEAO-3PService', 'Accept': 'application/json' }
      });
      if (!r.ok) continue;
      const d = await r.json();
      if (Array.isArray(d) && d.length) return d;
      if (d && Array.isArray(d.exploits) && d.exploits.length) return d.exploits;
    } catch(e){ /* try next */ }
  }
  return [];
}

async function fetchSnapshots(){
  try {
    const r = await fetch(SUPA + '/rest/v1/snapshots?select=taken_at,banwave_active,flagged_count,executor_count,data&order=taken_at.asc&limit=500', {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
    });
    if (!r.ok) return [];
    return r.json();
  } catch(e){ return []; }
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
    websitelink: ex.websitelink || '', discordlink: ex.discordlink || '',
    purchaselink: ex.purchaselink || '',
    decompiler: !!ex.decompiler, multiInject: !!ex.multiInject,
    raknet: !!ex.raknet, keysystem: !!ex.keysystem,
    clientmods: !!ex.clientmods, uncStatus: !!ex.uncStatus,
    elementCertified: !!ex.elementCertified,
    logo: (ex.slug && ex.slug.logo) || '',
    owner: (ex.slug && ex.slug.owner) || '',
    description: (ex.slug && ex.slug.fullDescription) || '',
    screenshots: (ex.slug && ex.slug.screenshots) || [],
    logos: [], store: '', showcase: '',
    views: null, excerpt: '', thumbnail: '',
    unverified: false, _sources: ['weao']
  };
}

function buildFromSb(sb){
  return {
    title: sb.name || sb.slug, slug: slugify(sb.name || sb.slug),
    version: sb.version, updatedDate: sb.versionDate || sb.updatedAt,
    updateStatus: !!sb.updated, possibleBanwave: !!sb.possibleBanwave,
    detected: !!sb.detected, detectionReason: sb.detectionReason || '',
    hasIssues: !!sb.hasIssues,
    free: !!sb.free || sb.type === 'Free',
    cost: (sb.price && sb.price.note) || '',
    uncPercentage: null, suncPercentage: sb.sunc,
    platform: sb.platform,
    extype: sb.kind === 'external' ? 'wexternal'
         : sb.platformKey === 'macos' ? 'mexecutor'
         : sb.platformKey === 'android' ? 'aexecutor'
         : sb.platformKey === 'ios' ? 'iexecutor'
         : 'wexecutor',
    rbxversion: sb.rbxVersion, index: 999,
    websitelink: sb.website || '', discordlink: sb.discord || '',
    purchaselink: sb.store || '',
    decompiler: !!sb.decompiler, multiInject: !!sb.multiInject,
    raknet: !!sb.raknet, keysystem: !!sb.keySystem,
    clientmods: !!sb.clientMods, uncStatus: false,
    elementCertified: !!sb.elementCertified,
    logo: absUrl(sb.logo), owner: sb.owners || sb.developers || '',
    description: sb.description || sb.weaoDescription || '',
    screenshots: (sb.screenshots || []).map(absUrl),
    logos: (sb.logos || []).map(absUrl),
    thumbnail: absUrl(sb.thumbnail),
    store: sb.store || '', showcase: sb.showcase || '',
    views: sb.views || null, excerpt: sb.excerpt || '',
    unverified: !sb.weaoId, _sources: ['scriptblox']
  };
}

function mergeSbInto(m, sb){
  if (sb.logos && sb.logos.length){
    const nl = sb.logos.map(absUrl);
    for (const l of nl) if (m.logos.indexOf(l) === -1) m.logos.push(l);
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
    for (const ft of sb.features){
      if (ft === 'decompiler') m.decompiler = true;
      else if (ft === 'multi-inject') m.multiInject = true;
      else if (ft === 'raknet') m.raknet = true;
      else if (ft === 'key-system') m.keysystem = true;
      else if (ft === 'client-mods') m.clientmods = true;
    }
  }

  if (m._sources.indexOf('scriptblox') === -1) m._sources.push('scriptblox');
  if (sb.weaoId) m.unverified = false;
  return m;
}

function mergeExecutors(weaoList, sbList){
  const byId = {};
  const bySlug = {};
  for (const ex of weaoList){
    if (ex._id) byId[ex._id] = ex;
    const k = slugify(ex.title);
    if (k && !bySlug[k]) bySlug[k] = ex;
  }

  const merged = [];
  const consumed = {};

  for (const sb of sbList){
    let match = null;
    if (sb.weaoId && byId[sb.weaoId]){
      match = byId[sb.weaoId];
      consumed[sb.weaoId] = true;
    } else {
      const k = slugify(sb.name || sb.slug);
      if (k && bySlug[k]){
        match = bySlug[k];
        if (match._id) consumed[match._id] = true;
      }
    }
    merged.push(match ? mergeSbInto(normalizeWeao(match), sb) : buildFromSb(sb));
  }

  const haveSlug = {};
  for (const m of merged) haveSlug[m.slug] = true;

  for (const w of weaoList){
    if (w._id && consumed[w._id]) continue;
    const k = slugify(w.title);
    if (k && haveSlug[k]) continue;
    if (k) haveSlug[k] = true;
    merged.push(normalizeWeao(w));
  }

  return merged;
}

function applyOverrides(list, overrides){
  for (const ex of list){
    const o = overrides[ex.slug];
    if (!o) continue;
    for (const key of Object.keys(o)){
      if (key === '_comment') continue;
      if (o[key] !== null && o[key] !== undefined) ex[key] = o[key];
    }
    ex.hasOverrides = true;
  }
  return list;
}

function publicShape(ex){
  const status = ex.possibleBanwave ? 'banwave-risk'
               : ex.updateStatus    ? 'online'
               :                      'offline';

  return {
    slug: ex.slug,
    title: ex.title,
    version: ex.version,
    updatedDate: ex.updatedDate || null,
    platform: ex.platform || null,
    type: ex.extype === 'wexternal' ? 'external'
        : ex.extype === 'mexecutor' ? 'mac'
        : ex.extype === 'aexecutor' ? 'android'
        : 'executor',
    status: status,
    banwaveRisk: !!ex.possibleBanwave,
    detected: !!ex.detected,
    detectionReason: ex.detectionReason || null,
    sunc: ex.suncPercentage ?? null,
    unc: ex.uncPercentage ?? null,
    pricing: {
      free: !!ex.free,
      cost: ex.cost || null
    },
    creator: ex.owner || null,
    description: ex.description || ex.sbDescription || ex.excerpt || null,
    features: [
      ex.decompiler  && 'decompiler',
      ex.multiInject && 'multi-inject',
      ex.raknet      && 'raknet',
      ex.keysystem   && 'key-system',
      ex.clientmods  && 'client-mods',
      ex.uncStatus   && 'unc',
      ex.elementCertified && 'element-certified'
    ].filter(Boolean),
    links: {
      website: ex.websitelink || null,
      discord: ex.discordlink || null,
      purchase: ex.purchaselink || null,
      store: ex.store || null,
      showcase: ex.showcase || null
    },
    logo: (ex.logos && ex.logos[0]) || ex.logo || ex.thumbnail || null,
    views: ex.views || null,
    sources: ex._sources || [],
    overrides: !!ex.hasOverrides
  };
}

function collectFlagged(data){
  if (!Array.isArray(data)) return [];
  const out = [];
  for (const ex of data){
    if (ex.possibleBanwave) out.push(ex.title || ex.slug || 'unknown');
  }
  return out;
}

function computeBanwaves(snapshots){
  const sessions = [];
  let current = null;

  for (const snap of snapshots){
    const active = !!snap.banwave_active;

    if (active && !current){
      current = {
        startedAt: snap.taken_at,
        endedAt: null,
        peakFlagged: snap.flagged_count || 0,
        flagged: collectFlagged(snap.data),
        durationMs: null
      };
    } else if (active && current){
      if ((snap.flagged_count || 0) > current.peakFlagged){
        current.peakFlagged = snap.flagged_count;
      }
      const names = collectFlagged(snap.data);
      for (const n of names){
        if (current.flagged.indexOf(n) === -1) current.flagged.push(n);
      }
    } else if (!active && current){
      current.endedAt = snap.taken_at;
      current.durationMs = new Date(snap.taken_at).getTime() - new Date(current.startedAt).getTime();
      sessions.push(current);
      current = null;
    }
  }

  if (current){
    current.durationMs = Date.now() - new Date(current.startedAt).getTime();
    sessions.push(current);
  }
  
  return sessions.reverse();
}

function buildStatus(list){
  let online = 0, offline = 0, banwaveRisk = 0;
  for (const ex of list){
    if (ex.banwaveRisk) banwaveRisk++;
    else if (ex.status === 'online') online++;
    else offline++;
  }
  return {
    updatedAt: new Date().toISOString(),
    banwaveActive: banwaveRisk > 0,
    banwaveRiskCount: banwaveRisk,
    onlineCount: online,
    offlineCount: offline,
    totalCount: list.length
  };
}

function writeOgShell(ex, dirPath){
  const statusLabel = ex.status === 'online' ? 'Online'
                    : ex.status === 'banwave-risk' ? 'Banwave Risk'
                    : 'Offline';

  const titleBits = [`${ex.title} v${ex.version}`, statusLabel];
  if (ex.sunc != null) titleBits.push(`${ex.sunc}% sUNC`);
  const title = titleBits.join(' — ');

  let desc = ex.description || '';
  if (!desc){
    const bits = [];
    if (ex.creator) bits.push(`by ${ex.creator}`);
    if (ex.pricing.free) bits.push('Free');
    else if (ex.pricing.cost) bits.push(ex.pricing.cost);
    if (ex.type === 'external') bits.push('External');
    desc = bits.join(' · ') || 'Roblox executor status';
  }
  desc = desc.replace(/\s+/g, ' ').trim().slice(0, 200);

  const img = ex.logo || `${SITE_URL}/og-default.png`;
  const url = `${SITE_URL}/${ex.slug}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)} — WhatExpsAreOffline</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:image" content="${escapeHtml(img)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="WhatExpsAreOffline">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(desc)}">
<meta name="twitter:image" content="${escapeHtml(img)}">
<script>location.replace('/#${escapeHtml(ex.slug)}');</script>
</head>
<body></body>
</html>`;

  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(path.join(dirPath, 'index.html'), html);
}

async function main(){
  if (!SUPA || !KEY) throw new Error('missing SUPABASE_URL or SUPABASE_SERVICE_KEY');

  // overrides
  let overrides = {};
  const overridePath = path.join(process.cwd(), 'data', 'overrides.json');
  if (fs.existsSync(overridePath)){
    try { overrides = JSON.parse(fs.readFileSync(overridePath, 'utf8')); }
    catch(e){ console.warn('overrides.json parse failed, ignoring:', e.message); }
  }

  // sources
  const [weaoList, sbRaw] = await Promise.all([
    fetchWeao(),
    fetch(SB_EXECUTORS).then(r => r.ok ? r.json() : null).catch(() => null)
  ]);

  let sbList = [];
  if (Array.isArray(sbRaw)) sbList = sbRaw;
  else if (sbRaw && Array.isArray(sbRaw.executors)) sbList = sbRaw.executors;
  else if (sbRaw && Array.isArray(sbRaw.data)) sbList = sbRaw.data;

  console.log(`sources: weao=${weaoList.length} scriptblox=${sbList.length}`);

  const merged = applyOverrides(mergeExecutors(weaoList, sbList), overrides);
  console.log(`merged: ${merged.length} executors`);

  const apiDir = path.join(process.cwd(), 'public', 'api');
  const execDir = path.join(apiDir, 'executors');
  fs.mkdirSync(execDir, { recursive: true });

  const publicList = merged.map(publicShape);

  const bundle = {
    updatedAt: new Date().toISOString(),
    version: 1,
    sources: ['weao.gg', 'scriptblox.com'],
    count: publicList.length,
    executors: publicList
  };
  fs.writeFileSync(path.join(apiDir, 'executors.json'), JSON.stringify(bundle, null, 2));

  for (const ex of publicList){
    fs.writeFileSync(path.join(execDir, ex.slug + '.json'), JSON.stringify(ex, null, 2));
  }

  fs.writeFileSync(path.join(apiDir, 'meta.json'), JSON.stringify({
    updatedAt: bundle.updatedAt,
    count: publicList.length,
    version: 1
  }, null, 2));

  fs.writeFileSync(path.join(apiDir, 'status.json'), JSON.stringify(buildStatus(publicList), null, 2));

  const snapshots = await fetchSnapshots();
  const banwaves = computeBanwaves(snapshots);
  fs.writeFileSync(path.join(apiDir, 'banwaves.json'), JSON.stringify({
    updatedAt: new Date().toISOString(),
    count: banwaves.length,
    sessions: banwaves
  }, null, 2));

  console.log(`api: executors.json + ${publicList.length} per-executor + meta + status + ${banwaves.length} banwaves`);

  let ogCount = 0;
  for (const ex of publicList){
    writeOgShell(ex, path.join(process.cwd(), 'public', ex.slug));
    ogCount++;
  }
  console.log(`og: wrote ${ogCount} shells`);

  const flagged = merged.filter(e => e.possibleBanwave);
  const snapshot = {
    banwave_active: flagged.length > 0,
    flagged_count: flagged.length,
    executor_count: merged.length,
    data: merged
  };
  const ins = await fetch(SUPA + '/rest/v1/snapshots', {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(snapshot)
  });
  if (!ins.ok) throw new Error('snapshot insert failed: ' + ins.status);
  console.log(`snapshot: ${merged.length} execs, ${flagged.length} flagged`);

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400 * 1000).toISOString();
  const del = await fetch(SUPA + '/rest/v1/snapshots?taken_at=lt.' + encodeURIComponent(cutoff), {
    method: 'DELETE',
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Prefer: 'return=minimal' }
  });
  if (del.ok) console.log(`pruned snapshots older than ${cutoff}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
