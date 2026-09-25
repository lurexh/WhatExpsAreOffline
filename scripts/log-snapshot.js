const SUPA = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_KEY;
const WEAO = 'https://weao.xyz/api/status/exploits';
const RETENTION_DAYS = 30;

async function main(){
  if (!SUPA || !KEY) throw new Error('missing SUPABASE_URL or SUPABASE_SERVICE_KEY');

  const res = await fetch(WEAO, {
    headers: { 'User-Agent': 'WEAO-3PService', 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error('WEAO ' + res.status);
  const list = await res.json();

  const flagged = list.filter(e => e.possibleBanwave);
  const snapshot = {
    banwave_active: flagged.length > 0,
    flagged_count: flagged.length,
    executor_count: list.length,
    data: list
  };

  const ins = await fetch(SUPA + '/rest/v1/snapshots', {
    method: 'POST',
    headers: {
      'apikey': KEY,
      'Authorization': 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(snapshot)
  });
  if (!ins.ok) throw new Error('insert failed: ' + ins.status + ' ' + await ins.text());
  console.log('Logged snapshot: ' + list.length + ' executors, ' + flagged.length + ' flagged');

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const del = await fetch(SUPA + '/rest/v1/snapshots?taken_at=lt.' + encodeURIComponent(cutoff), {
    method: 'DELETE',
    headers: {
      'apikey': KEY,
      'Authorization': 'Bearer ' + KEY,
      'Prefer': 'return=minimal'
    }
  });
  if (del.ok) console.log('Pruned snapshots older than ' + cutoff);
  else console.warn('prune failed: ' + del.status);
}

main().catch(e => { console.error(e); process.exit(1) });
