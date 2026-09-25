const SUPA = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_KEY;
const WEAO = 'https://weao.xyz/api/status/exploits';

async function main(){
  if (!SUPA || !KEY) throw new Error('missing SUPABASE_URL or SUPABASE_SERVICE_KEY');

  const res = await fetch(WEAO, {
    headers: { 'User-Agent': 'WEAO-3PService', 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error('WEAO ' + res.status);
  const list = await res.json();

  const flagged = list.filter(e => e.possibleBanwave);
  const banwaveActive = flagged.length > 0;

  const snapshot = {
    banwave_active: banwaveActive,
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
}
main().catch(e => { console.error(e); process.exit(1) });
