// Rev607 odds Worker full replacement for Cloudflare Workers
// Endpoint: /api/odds
// Fixes: shutuba.html HTML fetched but horses=[] by adding robust fallback parser.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8'
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response('', { headers: CORS_HEADERS });
    try {
      const reqUrl = new URL(request.url);
      let body = {};
      if (request.method === 'POST') {
        try { body = await request.json(); } catch (_) { body = {}; }
      }
      const targetUrl = pickTargetUrl(reqUrl, body, 'shutuba.html');
      const raceId = pickRaceId(reqUrl, body, targetUrl);
      if (!targetUrl && !raceId) {
        return json({ ok:false, error:'url_or_raceId_required', usage:{ get:'/api/odds?raceId=2026050305020409', post:{ raceId:'2026050305020409' } } }, 400);
      }
      const source = targetUrl || `https://race.netkeiba.com/race/shutuba.html?race_id=${raceId}&rf=race_submenu`;
      const fetched = await fetchNetkeibaHtml(source);
      const horses = parseShutuba(fetched.html || '');
      return json({
        ok:true,
        source,
        count:horses.length,
        horses,
        diagnosis: oddsDiagnostics(fetched.html || '', horses, fetched)
      });
    } catch (e) {
      return json({ ok:false, source:'', count:0, horses:[], diagnosis:{rev606:true, rev607:true, error:String(e && e.message || e)} }, 200);
    }
  }
};

function json(obj, status=200){ return new Response(JSON.stringify(obj, null, 2), { status, headers:CORS_HEADERS }); }
function digits(v){ return String(v || '').replace(/\D/g, ''); }
function dec(v){ try { return decodeURIComponent(String(v || '')); } catch(e){ return String(v || ''); } }
function first(...vals){ for (const v of vals){ if (v !== undefined && v !== null && String(v).trim() !== '') return String(v); } return ''; }
function getParam(u,k){ return u.searchParams.get(k) || ''; }
function pickTargetUrl(u, body, page){
  const keys = ['targetUrl','url','sourceUrl','fetchUrl','netkeibaUrl','pageUrl'];
  for (const k of keys) {
    const v = dec(first(getParam(u,k), body && body[k]));
    if (/^https?:\/\//i.test(v)) return normalizePage(v, page);
  }
  const rid = pickRaceId(u, body, '');
  return rid ? `https://race.netkeiba.com/race/${page}?race_id=${rid}&rf=race_submenu` : '';
}
function normalizePage(url, page){ return String(url).replace(/\/(odds|result|shutuba)\.html/i, `/${page}`); }
function pickRaceId(u, body, targetUrl){
  const fromUrl = pickRaceIdFromText(targetUrl);
  if (fromUrl.length === 16) return fromUrl;
  const keys = ['race_id','netkeibaRaceId','raceId','race_id16','raceId16','netkeibaRaceId16','nkRaceId16','race_id_full','netkeibaRaceIdFull','fullRaceId','expectedRaceId','requestRaceId','forceRaceId','strictRaceId','nkRaceId'];
  for (const k of keys) { const d = digits(first(getParam(u,k), body && body[k])); if (d.length >= 16) return d.slice(0,16); }
  return fromUrl || '';
}
function pickRaceIdFromText(text){ const s=dec(text||''); const m=s.match(/race_id[=:%22'"&]+(\d{16})/i)||s.match(/race_id[=:%22'"&]+(\d{12,16})/i); return m?m[1]:''; }
async function fetchNetkeibaHtml(url){
  const res = await fetch(url, { headers:{ 'User-Agent':'Mozilla/5.0 Rev607Worker', 'Accept':'text/html,*/*' } });
  const buf = await res.arrayBuffer();
  let html = ''; let encodingUsed = 'utf-8';
  try { html = new TextDecoder('euc-jp').decode(buf); encodingUsed='euc-jp'; } catch(e){ html = new TextDecoder('utf-8').decode(buf); }
  if (!/馬名|オッズ|単勝|出馬|Horse|Odds/i.test(html)) { try { html = new TextDecoder('utf-8').decode(buf); encodingUsed='utf-8'; } catch(e){} }
  return { status:res.status, html, encodingUsed };
}
function strip(s){ return String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#039;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim(); }
function parseShutuba(html){
  const s = String(html || '');
  const rows = [];
  const seen = new Set();
  const trList = s.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trList) {
    if (!/\/horse\/\d+|HorseName|UmaName|馬名/i.test(tr)) continue;
    const plain = strip(tr);
    let name = '';
    const a = tr.match(/<a[^>]+href=["'][^"']*\/horse\/\d+[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (a) name = strip(a[1]);
    if (!name) {
      const nm = tr.match(/class=["'][^"']*(HorseName|UmaName|Horse_Name)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
      if (nm) name = strip(nm[2]);
    }
    name = name.replace(/^(地|外|父|母|\s)+/,'').trim();
    if (!name || name.length > 35) continue;

    let no = '';
    const noCell = tr.match(/<td[^>]+class=["'][^"']*(Umaban|HorseNum|Horse_Number|Num|Waku)[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
    if (noCell) no = (strip(noCell[2]).match(/\b([1-9]|1[0-8])\b/)||[''])[0];
    if (!no) {
      const before = plain.slice(0, Math.max(0, plain.indexOf(name)));
      const nums = before.match(/\b([1-9]|1[0-8])\b/g) || [];
      no = nums.length ? nums[nums.length-1] : '';
    }
    if (!no) continue;

    let odds = '';
    const oddsCells = [...tr.matchAll(/<td[^>]+class=["'][^"']*(Odds|Txt_R|Popular|Ninki|OddsPeople|Tan)[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi)];
    for (const oc of oddsCells) { const m = strip(oc[2]).match(/\b(\d{1,3}\.\d)\b/); if (m) { odds=m[1]; break; } }
    if (!odds) { const m = plain.match(/\b(\d{1,3}\.\d)\b/); if (m) odds=m[1]; }

    const key = String(Number(no));
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ no:Number(no), horseNo:Number(no), name, horseName:name, odds: odds || '', winOdds: odds || '' });
  }
  rows.sort((a,b)=>(a.no||0)-(b.no||0));
  return rows;
}
function oddsDiagnostics(html, horses, fetched){
  const s=String(html||'');
  return {
    rev606:true, rev607:true,
    htmlStatus:fetched.status,
    encodingUsed:fetched.encodingUsed,
    htmlChars:s.length,
    horseLinkCount:(s.match(/\/horse\/\d+/g)||[]).length,
    oddsLikeCount:(s.match(/>\s*\d{1,3}\.\d\s*</g)||[]).length,
    tableHints:{Shutuba_Table:/Shutuba_Table/i.test(s), RaceTable:/RaceTable|Race_Table/i.test(s), HorseName:/HorseName|UmaName|馬名/i.test(s)},
    parser:'rev606_full_replacement',
    parsedCount:horses.length
  };
}
