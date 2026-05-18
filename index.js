// Rev610 odds Worker full replacement
// Adds: shutuba.html probe, odds/index.html fallback, HTML snippet diagnostics.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8'
};
export default { async fetch(request) {
  if (request.method === 'OPTIONS') return new Response('', { headers:CORS_HEADERS });
  try {
    const u = new URL(request.url); let body={};
    if (request.method === 'POST') { try { body = await request.json(); } catch(_){} }
    const firstUrl = pickTargetUrl(u, body, 'shutuba.html');
    const raceId = pickRaceId(u, body, firstUrl);
    if (!firstUrl && !raceId) return json({ok:false,error:'url_or_raceId_required',usage:{get:'/api/odds?raceId=2026050305020409',post:{raceId:'2026050305020409'}}},400);
    const candidates = buildCandidates(firstUrl, raceId);
    const attempts=[]; let best={horses:[], source:candidates[0]||'', fetched:{html:'',status:0,encodingUsed:''}};
    for (const source of candidates) {
      const fetched = await fetchHtml(source);
      const horses = parseAnyHorseOdds(fetched.html || '');
      attempts.push(attemptDiag(source, fetched, horses));
      if (horses.length > best.horses.length) best={horses, source, fetched};
      if (horses.length >= 8) break;
    }
    return json({ ok:true, source:best.source, count:best.horses.length, horses:best.horses,
      diagnosis:{rev606:true,rev607:true,rev608:true,rev609:true,rev610:true, selectedSource:best.source, attempts, parser:'html_probe_odds_index_fallback'} });
  } catch(e) { return json({ok:false,source:'',count:0,horses:[],diagnosis:{rev610:true,error:String(e&&e.message||e)}}); }
}};
function json(o,s=200){return new Response(JSON.stringify(o,null,2),{status:s,headers:CORS_HEADERS});}
function dec(v){try{return decodeURIComponent(String(v||''));}catch(_){return String(v||'');}}
function digits(v){return String(v||'').replace(/\D/g,'');}
function first(...a){for(const v of a){if(v!=null&&String(v).trim()!=='')return String(v)}return ''}
function gp(u,k){return u.searchParams.get(k)||''}
function normalizePage(url,page){return String(url).replace(/\/race\/(shutuba|result|odds)\.html/i,`/race/${page}`);}
function pickRaceIdFromText(t){const s=dec(t||'');let m=s.match(/race_id[=:%22'"&]+(\d{16})/i)||s.match(/RaceId[=:%22'"&]+(\d{16})/i); if(m)return m[1]; m=s.match(/race_id[=:%22'"&]+(\d{12,16})/i); return m?m[1]:'';}
function pickRaceId(u,b,target){const from=pickRaceIdFromText(target); if(from.length===16)return from; const keys=['race_id','netkeibaRaceId','raceId','race_id16','raceId16','netkeibaRaceId16','nkRaceId16','race_id_full','netkeibaRaceIdFull','fullRaceId','expectedRaceId','requestRaceId','forceRaceId','strictRaceId','nkRaceId']; for(const k of keys){const d=digits(first(gp(u,k),b&&b[k])); if(d.length>=16)return d.slice(0,16)} return from||'';}
function pickTargetUrl(u,b,page){for(const k of ['targetUrl','url','sourceUrl','fetchUrl','netkeibaUrl','pageUrl']){const v=dec(first(gp(u,k),b&&b[k])); if(/^https?:\/\//i.test(v))return normalizePage(v,page)} const rid=pickRaceId(u,b,''); return rid?`https://race.netkeiba.com/race/${page}?race_id=${rid}&rf=race_submenu`:'';}
function buildCandidates(firstUrl,raceId){const out=[]; const add=x=>{if(x&&!out.includes(x))out.push(x)}; add(firstUrl); if(raceId){add(`https://race.netkeiba.com/race/shutuba.html?race_id=${raceId}&rf=race_submenu`); add(`https://race.netkeiba.com/odds/index.html?race_id=${raceId}`); add(`https://race.netkeiba.com/odds/index.html?race_id=${raceId}&type=b1`); add(`https://race.netkeiba.com/odds/index.html?race_id=${raceId}&type=win`);} return out;}
async function fetchHtml(url){const res=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Rev610','Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','Accept-Language':'ja,en-US;q=0.9,en;q=0.8','Referer':'https://race.netkeiba.com/'}}); const buf=await res.arrayBuffer(); let html='',encodingUsed='utf-8'; try{html=new TextDecoder('euc-jp').decode(buf); encodingUsed='euc-jp'}catch(_){html=new TextDecoder('utf-8').decode(buf)} if(!/[ぁ-んァ-ン一-龥]/.test(html)){try{html=new TextDecoder('utf-8').decode(buf);encodingUsed='utf-8'}catch(_){}} return {status:res.status,html,encodingUsed};}
function strip(s){return String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#039;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();}
function parseAnyHorseOdds(html){const rows=[]; const seen=new Set(); const add=(no,name,odds)=>{no=Number(no); name=String(name||'').trim(); if(!(no>=1&&no<=18)||!name||name.length>36||seen.has(no))return; seen.add(no); rows.push({no,horseNo:no,name,horseName:name,odds:odds||'',winOdds:odds||''});};
  const h=String(html||'');
  // JSON-like fallback
  for(const m of h.matchAll(/(?:umaban|horse_number|horseNo|馬番)["']?\s*[:=]\s*["']?(\d{1,2})["']?[\s\S]{0,600}?(?:horse_name|HorseName|name|馬名)["']?\s*[:=]\s*["']([^"'<>]{2,30})["'][\s\S]{0,400}?(?:odds|win_odds|単勝)["']?\s*[:=]\s*["']?(\d{1,3}\.\d)?/gi)){ add(m[1], cleanupName(m[2]), m[3]||''); }
  // HTML row fallback
  const trs=h.match(/<tr[\s\S]*?<\/tr>/gi)||[];
  for(const tr of trs){const plain=strip(tr); if(!/(HorseName|UmaName|HorseInfo|Shutuba|Odds|単勝|馬名|馬番|\/horse\/)/i.test(tr+plain))continue; let name='';
    const a=tr.match(/<a[^>]+(?:href=["'][^"']*\/horse\/\d+[^"']*["'][^>]*|class=["'][^"']*(?:HorseName|UmaName)[^"']*["'][^>]*)>([\s\S]*?)<\/a>/i); if(a)name=strip(a[1]);
    if(!name){const nm=tr.match(/class=["'][^"']*(HorseName|UmaName|Horse_Name|HorseInfo)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i); if(nm)name=strip(nm[2]);}
    if(!name){const cells=[...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x=>strip(x[1])).filter(Boolean); name=cells.find(c=>/[ァ-ヶー一-龥]{2,}/.test(c)&&!/^(牡|牝|セ|父|母|単勝|馬番|斤量|騎手|人気|\d+)$/.test(c))||'';}
    name=cleanupName(name); if(!name)continue;
    let no=''; const before=plain.slice(0, Math.max(0, plain.indexOf(name))); const nums=before.match(/\b([1-9]|1[0-8])\b/g)||[]; if(nums.length)no=nums[nums.length-1];
    if(!no){const m=plain.match(/^\s*(?:[1-8]\s+)?([1-9]|1[0-8])\b/); if(m)no=m[1];}
    let odds=''; const om=plain.match(/\b(\d{1,3}\.\d)\b/); if(om)odds=om[1]; add(no,name,odds);
  }
  rows.sort((a,b)=>a.no-b.no); return rows;}
function cleanupName(s){return String(s||'').replace(/^(地|外|父|母|市|抽|\s)+/,'').replace(/\s+/g,'').replace(/\(.+?\)/g,'').trim();}
function around(s,pat){const i=s.search(pat); if(i<0)return ''; return strip(s.slice(Math.max(0,i-300),i+900)).slice(0,1000);}
function attemptDiag(source,fetched,horses){const h=fetched.html||''; return {source,status:fetched.status,encodingUsed:fetched.encodingUsed,htmlChars:h.length,count:horses.length,horseLinkCount:(h.match(/\/horse\/\d+/g)||[]).length,oddsLikeCount:(h.match(/\b\d{1,3}\.\d\b/g)||[]).length,tableHints:{Shutuba_Table:/Shutuba_Table/.test(h),RaceTable:/RaceTable/.test(h),HorseName:/HorseName|UmaName|HorseInfo/.test(h),NextData:/__NEXT_DATA__|Nuxt|window\.__/.test(h)},sampleHorseName:around(h,/HorseName|UmaName|HorseInfo|馬名/),sampleOdds:around(h,/単勝|odds|Odds|オッズ/i)};}
