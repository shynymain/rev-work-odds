const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function normalizeText(s = '') {
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\t\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normRaceId(raceId = '') {
  return String(raceId).replace(/[^0-9]/g, '');
}

function buildNetkeibaUrl(raceId) {
  const id = normRaceId(raceId);
  if (!id) return '';
  return `https://race.netkeiba.com/race/shutuba.html?race_id=${id}&rf=race_submenu`;
}

function cleanName(name = '') {
  return String(name)
    .replace(/^[0-9０-９]+\s*/, '')
    .replace(/[|｜\[\]()（）{}<>_＝=ー―－\-]+/g, ' ')
    .replace(/\b(牡|牝|セ|騙)\s*\d+\b/g, ' ')
    .replace(/\s+/g, '')
    .trim();
}

function calcPopularity(horses) {
  const odds = horses
    .map(h => Number(String(h.odds || '').replace(',', '.')))
    .filter(v => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  const rankMap = new Map();
  odds.forEach((v, idx) => { if (!rankMap.has(String(v))) rankMap.set(String(v), String(idx + 1)); });
  return horses.map(h => {
    const v = Number(String(h.odds || '').replace(',', '.'));
    return { ...h, popularity: Number.isFinite(v) && rankMap.has(String(v)) ? rankMap.get(String(v)) : (h.popularity || '') };
  });
}

function frameOf(no, headcount = 18) {
  const n = Number(no);
  const h = Number(headcount) || 18;
  if (!n) return '';
  if (h <= 8) return String(n);
  if (h === 9) return n <= 1 ? '1' : n <= 2 ? '2' : n <= 3 ? '3' : n <= 4 ? '4' : n <= 5 ? '5' : n <= 6 ? '6' : n <= 7 ? '7' : '8';
  if (h === 10) return n <= 1 ? '1' : n <= 2 ? '2' : n <= 3 ? '3' : n <= 4 ? '4' : n <= 5 ? '5' : n <= 6 ? '6' : n <= 7 ? '7' : '8';
  if (h === 11) return n <= 1 ? '1' : n <= 2 ? '2' : n <= 3 ? '3' : n <= 4 ? '4' : n <= 5 ? '5' : n <= 6 ? '6' : n <= 8 ? '7' : '8';
  if (h === 12) return n <= 1 ? '1' : n <= 2 ? '2' : n <= 3 ? '3' : n <= 4 ? '4' : n <= 6 ? '5' : n <= 8 ? '6' : n <= 10 ? '7' : '8';
  if (h === 13) return n <= 1 ? '1' : n <= 2 ? '2' : n <= 4 ? '3' : n <= 6 ? '4' : n <= 8 ? '5' : n <= 10 ? '6' : n <= 12 ? '7' : '8';
  if (h === 14) return n <= 1 ? '1' : n <= 2 ? '2' : n <= 4 ? '3' : n <= 6 ? '4' : n <= 8 ? '5' : n <= 10 ? '6' : n <= 12 ? '7' : '8';
  if (h === 15) return n <= 1 ? '1' : n <= 3 ? '2' : n <= 5 ? '3' : n <= 7 ? '4' : n <= 9 ? '5' : n <= 11 ? '6' : n <= 13 ? '7' : '8';
  if (h === 16) return n <= 2 ? '1' : n <= 4 ? '2' : n <= 6 ? '3' : n <= 8 ? '4' : n <= 10 ? '5' : n <= 12 ? '6' : n <= 14 ? '7' : '8';
  if (h === 17) return n <= 2 ? '1' : n <= 4 ? '2' : n <= 6 ? '3' : n <= 8 ? '4' : n <= 10 ? '5' : n <= 12 ? '6' : n <= 15 ? '7' : '8';
  return n <= 2 ? '1' : n <= 4 ? '2' : n <= 6 ? '3' : n <= 8 ? '4' : n <= 10 ? '5' : n <= 12 ? '6' : n <= 15 ? '7' : '8';
}

function parseNetkeibaOdds(html, headcount = 18) {
  const horses = [];
  const rowRe = /<tr[^>]*(?:HorseList|Shutuba_Table|HorseListRow|tr_\d+)[^>]*>[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRe) || html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const plain = normalizeText(row);
    const noMatch = row.match(/(?:Umaban|HorseNum|Waku|Num)[^>]*>\s*([0-9]{1,2})\s*</i) || plain.match(/^\s*([0-9]{1,2})\s+/);
    const nameMatch = row.match(/horse\/([0-9]+)[^>]*>\s*([^<]+)\s*</i) || row.match(/HorseName[^>]*>[\s\S]*?<a[^>]*>\s*([^<]+)\s*<\/a>/i) || row.match(/<a[^>]*title="([^"]+)"[^>]*>/i);
    const oddsMatch = row.match(/(?:Odds|Tanfuku|Popular)[^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*</i) || plain.match(/\b([0-9]{1,3}\.[0-9])\b/);
    const popMatch = row.match(/(?:Ninki|Popular)[^>]*>\s*([0-9]{1,2})\s*</i) || plain.match(/\b([0-9]{1,2})\s*人気\b/);
    const no = noMatch ? noMatch[1] : '';
    const name = nameMatch ? cleanName(nameMatch[1] || nameMatch[2]) : '';
    const odds = oddsMatch ? oddsMatch[1] : '';
    if (no && name) horses.push({ no, frame: frameOf(no, headcount), name, odds, popularity: popMatch ? popMatch[1] : '' });
  }
  const uniq = new Map();
  for (const h of horses) {
    const n = Number(h.no);
    if (n >= 1 && n <= 18 && !uniq.has(h.no)) uniq.set(h.no, h);
  }
  return calcPopularity([...uniq.values()].sort((a,b)=>Number(a.no)-Number(b.no)));
}

async function handle(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const u = new URL(req.url);
  if (u.pathname === '/' || u.pathname === '/api/health') return json({ ok: true, service: 'rev-work-odds', routes: ['/api/odds'] });
  if (u.pathname !== '/api/odds' && u.pathname !== '/api/fetchOdds') return json({ ok: false, error: 'not_found' }, 404);
  let body = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch {} }
  const raceId = body.raceId || u.searchParams.get('raceId') || '';
  const headcount = body.headcount || u.searchParams.get('headcount') || 18;
  const targetUrl = body.url || u.searchParams.get('url') || buildNetkeibaUrl(raceId);
  if (!targetUrl) return json({ ok: false, error: 'url_or_raceId_required', usage: { get: '/api/odds?raceId=2026050305020409', post: { raceId: '2026050305020409' } } }, 400);
  const res = await fetch(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0 Rev-VAN odds worker' } });
  const html = await res.text();
  const horses = parseNetkeibaOdds(html, headcount);
  return json({ ok: true, source: targetUrl, count: horses.length, horses });
}

export default { fetch: handle };
