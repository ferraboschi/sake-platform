// Sake Platform — Search Functions (with escalation UX feedback)

const DEBOUNCE_MS=800, MIN_CHARS=3;

function runDemo(name){
  document.getElementById('search-input').value=name;
  document.getElementById('demo-links').style.display='none';
  clearTimeout(state.debounceTimer);
  startSearch();
}

// ---- SEARCH HISTORY ----
function getHistory(){
  try{return JSON.parse(localStorage.getItem('sp_history')||'[]');}catch(e){return [];}
}
function addToHistory(name){
  let h=getHistory().filter(x=>x.toLowerCase()!==name.toLowerCase());
  h.unshift(name);
  if(h.length>8)h=h.slice(0,8);
  localStorage.setItem('sp_history',JSON.stringify(h));
  renderHistory();
}
function renderHistory(){
  const container=document.getElementById('demo-links');
  const label=document.getElementById('demo-label');
  const h=getHistory();
  container.querySelectorAll('.demo-btn').forEach(b=>b.remove());
  if(!h.length){label.style.display='none';return;}
  label.style.display='flex';
  h.forEach(name=>{
    const btn=document.createElement('button');
    btn.className='demo-btn';
    btn.textContent=name;
    btn.onclick=()=>runDemo(name);
    container.appendChild(btn);
  });
}

function onSearchInput(){
  clearTimeout(state.debounceTimer);
  const val=document.getElementById('search-input').value.trim();
  if(!val && state.foundData){resetSearch();return;}
  if(val===state.lastQuery)return;
  if(val.length<MIN_CHARS)return;
  state.debounceTimer=setTimeout(()=>startSearch(),DEBOUNCE_MS);
}

async function startSearch(){
  const name=document.getElementById('search-input').value.trim();
  if(!name||name.length<MIN_CHARS)return;
  if(name===state.lastQuery&&(state.foundData||state.candidates.length))return;
  if(state.abortCtrl){state.abortCtrl.abort();}
  state.lastQuery=name;
  addToHistory(name);
  state.abortCtrl=new AbortController();
  const signal=state.abortCtrl.signal;

  state.searching=true;state.foundData=null;state.candidates=[];
  const hero=document.getElementById('hero');
  const ir=document.getElementById('inline-result');
  hero.classList.add('has-results');
  document.getElementById('search-hint').style.display='none';
  document.getElementById('demo-links').style.display='none';
  ir.style.display='block';

  function aborted(){return signal.aborted;}

  function renderTimeline(steps){
    if(aborted())return;
    ir.innerHTML=`<div class="progress-timeline">${steps.map((s,i)=>`
      <div class="pt-step ${s.state}">
        <div class="pt-icon">${s.state==='done'?'✓':s.state==='active'?'⟳':(i+1)}</div>
        <div>
          <div class="pt-label">${esc(s.label)}</div>
          <div class="pt-detail">${esc(s.detail)}</div>
        </div>
      </div>`).join('')}</div>`;
  }

  if(state.proxyUrl||state.apiKey){
    // ---- ESCALATION UX: Show progressive search levels ----
    const steps=[
      {label:t('ps_db'),detail:t('ps_db_detail'),state:'active'},
      {label:t('ps_cache'),detail:t('ps_cache_detail'),state:'waiting'},
      {label:t('ps_ai'),detail:t('ps_ai_detail'),state:'waiting'},
    ];
    renderTimeline(steps);

    try{
    // Call the hybrid proxy — it returns source: "db"|"cache"|"ai"
    const proxyUrl=state.proxyUrl;
    if(!proxyUrl)return;

    const r=await fetch(proxyUrl,{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({query:name})});
    if(aborted())return;
    if(!r.ok){
      ir.innerHTML=`<div class="progress-timeline"><div style="padding:12px;text-align:center;color:var(--text3);font-size:14px">${esc(t('search_error'))}</div></div>`;
      state.searching=false;
      return;
    }
    const data=await r.json();
    const source=data.source||'ai';
    const aiCandidates=data.results||[];

    // Update timeline based on which level answered
    if(source==='db'){
      steps[0]={label:t('ps_db'),detail:t('ps_db_found').replace('{n}',aiCandidates.length),state:'done'};
      steps[1]={label:t('ps_cache'),detail:t('ps_skipped'),state:'done'};
      steps[2]={label:t('ps_ai'),detail:t('ps_skipped'),state:'done'};
    } else if(source==='cache'){
      steps[0]={label:t('ps_db'),detail:t('ps_db_none'),state:'done'};
      steps[1]={label:t('ps_cache'),detail:t('ps_cache_found').replace('{n}',aiCandidates.length),state:'done'};
      steps[2]={label:t('ps_ai'),detail:t('ps_skipped'),state:'done'};
    } else {
      steps[0]={label:t('ps_db'),detail:t('ps_db_none'),state:'done'};
      steps[1]={label:t('ps_cache'),detail:t('ps_cache_none'),state:'done'};
      steps[2]={label:t('ps_ai'),detail:t('ps_ai_found').replace('{n}',aiCandidates.length),state:'done'};
    }
    renderTimeline(steps);

    if(!aiCandidates.length){
      ir.innerHTML=`<div class="progress-timeline"><div style="padding:12px;text-align:center;color:var(--text3);font-size:14px">${esc(t('not_found'))}</div></div>`;
      state.searching=false;
      setTimeout(()=>{ir.style.display='none';hero.classList.remove('has-results');document.getElementById('search-hint').style.display='';document.getElementById('demo-links').style.display='flex';},4000);
      return;
    }

    // Verify websites + enrich with geo
    steps.push({label:t('ps_verify'),detail:t('ps_verify_detail'),state:'active'});
    renderTimeline(steps);

    const verified=await verifyWebsites(aiCandidates,signal);
    if(aborted())return;
    const verCount=verified.filter(c=>c._siteVerified).length;
    steps[steps.length-1]={label:t('ps_verify'),detail:t('ps_verified_sites').replace('{n}',verCount).replace('{total}',verified.length),state:'done'};

    steps.push({label:t('ps_enrich'),detail:t('ps_enrich_detail'),state:'active'});
    renderTimeline(steps);

    const enriched=await enrichWithGeo(verified,signal);
    if(aborted())return;
    steps[steps.length-1]={label:t('ps_enrich'),detail:t('ps_done'),state:'done'};
    renderTimeline(steps);
    state.searching=false;

    await new Promise(r=>setTimeout(r,400));
    if(aborted())return;

    // Convert to candidate format
    state.candidates=enriched.map(c=>({
      company:{
        name_jp:c.name_ja||c.name_jp||'',
        name_en:c.name_en||'',
        website:c.website||'',
        prefecture:c.prefecture||'',
        address:c.address||'',
        phone:c.phone||'',
        founded:c.founded||'',
        history:c.description||c.description_en||'',
        country:c.country||'',
      },
      productCount:c.products_count||c.product_count||0,
      sources:c.sources||[],
      _geo:c._geo||null,
      _products:[],
      _siteVerified:c._siteVerified||false,
    }));

    if(state.candidates.length===1){
      state.foundData=state.candidates[0];
      showBreweryCard(state.foundData);
    } else {
      showCandidateList(state.candidates);
    }

    }catch(e){if(e.name==='AbortError')return;state.searching=false;}

  } else {
    // ---- PATH B: No proxy → Nominatim + Wikipedia fallback ----
    const steps=[
      {label:t('ps_geo'),detail:t('ps_geo_detail'),state:'active'},
      {label:t('ps_wiki'),detail:t('ps_wiki_detail'),state:'waiting'},
      {label:t('ps_merge'),detail:t('ps_merge_detail'),state:'waiting'},
    ];
    renderTimeline(steps);

    try{
    const geoResults=await geocodeLookupMulti(name,signal);
    if(aborted())return;
    steps[0]={label:t('ps_geo'),detail:t('ps_found_geo').replace('{n}',geoResults.length),state:'done'};
    steps[1].state='active';
    renderTimeline(steps);

    const wiki=await wikiLookup(name,signal);
    if(aborted())return;
    steps[1]={label:t('ps_wiki'),detail:'✓',state:'done'};
    steps[2].state='active';
    renderTimeline(steps);

    await new Promise(r=>setTimeout(r,300));
    if(aborted())return;

    const candidates=[];
    for(const geo of geoResults){
      candidates.push({
        company:{
          name_jp:geo.displayName||name,name_en:'',website:'',
          prefecture:geo.prefecture||'',address:geo.address||'',
          phone:'',founded:candidates.length===0?(wiki?.founded||''):'',
          history:candidates.length===0?(wiki?.extract||''):'',
          country:geo.country||'',
        },
        productCount:0,sources:[],
        _geo:{lat:geo.lat,lng:geo.lng},_products:[],_siteVerified:false,
      });
    }
    if(!candidates.length&&wiki){
      candidates.push({
        company:{name_jp:wiki.name_jp||name,name_en:wiki.name_en||'',website:'',
          prefecture:'',address:'',phone:'',founded:wiki.founded||'',
          history:wiki.extract||'',country:''},
        productCount:0,sources:[],_geo:null,_products:[],_siteVerified:false,
      });
    }

    steps[2]={label:t('ps_merge'),detail:t('ps_done'),state:'done'};
    renderTimeline(steps);
    state.searching=false;

    await new Promise(r=>setTimeout(r,300));
    if(aborted())return;

    if(!candidates.length){
      ir.innerHTML=`<div class="progress-timeline"><div style="padding:12px;text-align:center;color:var(--text3);font-size:14px">${esc(t('not_found'))}</div></div>`;
      setTimeout(()=>{ir.style.display='none';hero.classList.remove('has-results');document.getElementById('search-hint').style.display='';document.getElementById('demo-links').style.display='flex';},4000);
      return;
    }

    state.candidates=candidates;
    if(candidates.length===1){
      state.foundData=candidates[0];
      showBreweryCard(state.foundData);
    } else {
      showCandidateList(candidates);
    }

    }catch(e){if(e.name==='AbortError')return;state.searching=false;}
  }
}

// Show list of candidates
function showCandidateList(candidates){
  const ir=document.getElementById('inline-result');
  const title=t('candidates_title').replace('{n}',candidates.length);
  ir.innerHTML=`<div class="candidate-list">
    <div class="candidate-list-title">${esc(title)}</div>
    ${candidates.map((c,i)=>{
      const co=c.company;
      const website=(co.website||'').replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/$/,'');
      const fav=website?`<img src="https://www.google.com/s2/favicons?domain=${website}&sz=64" onerror="this.outerHTML='🏯'">`:'🏯';
      const loc=[co.prefecture,co.country].filter(Boolean).join(', ');
      const verified=c._siteVerified;
      const siteTag=website?(verified
        ?`<span style="color:var(--green);font-size:11px;font-weight:600">✓ ${esc(website)}</span>`
        :`<span style="color:var(--text3);font-size:11px">${esc(website)}</span>`):'';
      const locTag=loc?`<span style="font-size:11px;color:var(--text3)">${esc(loc)}</span>`:'';
      const meta=[siteTag,locTag].filter(Boolean).join(' · ');
      return `<div class="candidate-item" onclick="selectCandidate(${i})">
        <div class="candidate-logo">${fav}</div>
        <div class="candidate-info">
          <div class="candidate-name">${esc(co.name_jp)}${co.name_en&&co.name_en!==co.name_jp?' · '+esc(co.name_en):''}</div>
          <div class="candidate-meta">${meta||esc(co.address||'')}</div>
        </div>
        <div class="candidate-arrow">→</div>
      </div>`;
    }).join('')}
  </div>`;
}

function selectCandidate(idx){
  if(!state.candidates[idx])return;
  state.foundData=state.candidates[idx];
  showBreweryCard(state.foundData);
}

function resetSearch(){
  if(state.abortCtrl){state.abortCtrl.abort();}
  clearTimeout(state.debounceTimer);
  state.searching=false;state.foundData=null;state.candidates=[];state.lastQuery='';
  const ir=document.getElementById('inline-result');
  ir.style.display='none';ir.innerHTML='';
  document.getElementById('hero').classList.remove('has-results');
  document.getElementById('search-hint').style.display='';document.getElementById('demo-links').style.display='flex';
  document.getElementById('search-input').value='';
  document.getElementById('search-input').focus();
}

// ==================== WEB APIS ====================

// ---- WEBSITE VERIFICATION ----
async function verifyWebsites(candidates,signal){
  const checks=candidates.map(async(c)=>{
    if(!c.website){c._siteVerified=false;return c;}
    const domain=c.website.replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
    if(!domain||domain.length<4){c._siteVerified=false;c.website='';return c;}
    try{
      const verified=await new Promise((resolve)=>{
        const img=new Image();
        const timer=setTimeout(()=>{img.src='';resolve(false);},4000);
        img.onload=()=>{clearTimeout(timer);resolve(true);};
        img.onerror=()=>{clearTimeout(timer);resolve(false);};
        img.src=`https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
      });
      c._siteVerified=verified;
      return c;
    }catch(e){c._siteVerified=false;return c;}
  });
  return Promise.all(checks);
}

// ---- GEOCODE ENRICHMENT ----
async function enrichWithGeo(candidates,signal){
  for(let i=0;i<candidates.length;i++){
    if(signal.aborted)return candidates;
    const c=candidates[i];
    const q=[c.name_ja||c.name_jp,c.prefecture,c.country].filter(Boolean).join(' ');
    if(!q)continue;
    try{
      if(i>0)await new Promise(r=>setTimeout(r,300));
      const r=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=1&accept-language=${state.lang==='ja'?'ja':'en'}`,{headers:{'User-Agent':'SakePlatform/2.0'},signal});
      if(!r.ok)continue;
      const res=await r.json();
      if(res.length){
        c._geo={lat:+res[0].lat,lng:+res[0].lon};
        if(!c.address&&res[0].display_name)c.address=res[0].display_name;
        if(!c.prefecture){const a=res[0].address||{};c.prefecture=a.province||a.state||'';}
        if(!c.country){const a=res[0].address||{};c.country=a.country||'';}
      }
    }catch(e){if(e.name==='AbortError')throw e;}
  }
  return candidates;
}

// ---- FALLBACK APIs (Path B) ----
async function geocodeLookupMulti(name,signal){
  const results=[];const seen=new Set();
  try{
    const queries=[name+' sake brewery',name+' 酒造',name+' sakagura',name];
    for(const q of queries){
      if(results.length>=6)break;
      const r=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5&accept-language=${state.lang==='ja'?'ja':'en'}`,{headers:{'User-Agent':'SakePlatform/2.0'},signal});
      if(!r.ok)continue;
      const res=await r.json();
      for(const item of res){
        const key=Math.round(+item.lat*100)+','+Math.round(+item.lon*100);
        if(seen.has(key))continue;seen.add(key);
        const a=item.address||{};
        results.push({displayName:item.name||'',address:item.display_name||'',lat:+item.lat,lng:+item.lon,prefecture:a.province||a.state||'',country:a.country||'',countryCode:a.country_code||''});
      }
    }
  }catch(e){if(e.name==='AbortError')throw e;}
  return results;
}

async function wikiLookup(name,signal){
  try{
    const jaTerms=[name+'酒造',name+' 酒造',name];
    for(const term of jaTerms){
      const sr=await fetch(`https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&format=json&origin=*&srlimit=3`,{signal});
      if(!sr.ok)continue;const sd=await sr.json();const results=sd.query?.search||[];
      const article=results.find(r=>r.snippet.includes('酒')||r.snippet.includes('醸造')||r.snippet.includes('蔵'))||results[0];
      if(!article)continue;
      const er=await fetch(`https://ja.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(article.title)}&prop=extracts&exintro=1&explaintext=1&format=json&origin=*`,{signal});
      if(!er.ok)continue;const ed=await er.json();const pages=ed.query?.pages||{};const page=Object.values(pages)[0];
      if(!page||page.missing!==undefined)continue;
      let extract=(page.extract||'').substring(0,400);
      if(extract.length===400)extract=extract.substring(0,extract.lastIndexOf('。')+1)||extract+'…';
      const fm=extract.match(/(\d{4})年.*?(創業|設立|開業)/)||extract.match(/(創業|設立|開業).*?(\d{4})年/);
      return{extract,founded:fm?(fm[1].match(/\d{4}/)?.[0]||fm[2]):'',name_jp:article.title};
    }
    const enTerms=[name+' sake brewery',name+' sake',name];
    for(const term of enTerms){
      const enr=await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&format=json&origin=*&srlimit=3`,{signal});
      if(!enr.ok)continue;const end=await enr.json();const enR=end.query?.search||[];
      const enA=enR.find(r=>r.snippet.toLowerCase().includes('sake')||r.snippet.toLowerCase().includes('brew'))||enR[0];
      if(!enA)continue;
      const er2=await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(enA.title)}&prop=extracts&exintro=1&explaintext=1&format=json&origin=*`,{signal});
      if(!er2.ok)continue;const ed2=await er2.json();const p2=Object.values(ed2.query?.pages||{})[0];
      if(!p2||p2.missing===undefined)continue;
      let ext=(p2.extract||'').substring(0,400);
      if(ext.length===400)ext=ext.substring(0,ext.lastIndexOf('.')+1)||ext+'…';
      return{extract:ext,name_en:enA.title};
    }
  }catch(e){if(e.name==='AbortError')throw e;}
  return null;
}
