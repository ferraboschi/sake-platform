// Sake Platform — Search with LIVE progressive feedback

const DEBOUNCE_MS=800, MIN_CHARS=3;

function runDemo(name){
  document.getElementById('search-input').value=name;
  document.getElementById('demo-links').style.display='none';
  clearTimeout(state.debounceTimer);
  startSearch();
}

// ---- SEARCH HISTORY ----
function getHistory(){try{return JSON.parse(localStorage.getItem('sp_history')||'[]');}catch(e){return [];}}
function addToHistory(name){
  let h=getHistory().filter(x=>x.toLowerCase()!==name.toLowerCase());
  h.unshift(name);if(h.length>8)h=h.slice(0,8);
  localStorage.setItem('sp_history',JSON.stringify(h));renderHistory();
}
function renderHistory(){
  const container=document.getElementById('demo-links');
  const label=document.getElementById('demo-label');
  const h=getHistory();
  container.querySelectorAll('.demo-btn').forEach(b=>b.remove());
  if(!h.length){label.style.display='none';return;}
  label.style.display='flex';
  h.forEach(name=>{const btn=document.createElement('button');btn.className='demo-btn';btn.textContent=name;btn.onclick=()=>runDemo(name);container.appendChild(btn);});
}

function onSearchInput(){
  clearTimeout(state.debounceTimer);
  const val=document.getElementById('search-input').value.trim();
  if(!val && state.foundData){resetSearch();return;}
  if(val===state.lastQuery)return;
  if(val.length<MIN_CHARS)return;
  state.debounceTimer=setTimeout(()=>startSearch(),DEBOUNCE_MS);
}

// ---- LIVE PROGRESS RENDERER ----
function renderLiveTimeline(ir, steps){
  ir.innerHTML=`<div class="progress-timeline">${steps.map((s,i)=>`
    <div class="pt-step ${s.state}">
      <div class="pt-icon">${s.state==='done'?'✓':s.state==='active'?'⟳':(i+1)}</div>
      <div>
        <div class="pt-label">${esc(s.label)}</div>
        <div class="pt-detail">${s.html||esc(s.detail)}</div>
      </div>
    </div>`).join('')}</div>`;
}

// AI search progress messages (rotate every 2s while waiting)
function getAIProgressMessages(){
  return [
    t('ai_msg_1'),t('ai_msg_2'),t('ai_msg_3'),t('ai_msg_4'),
    t('ai_msg_5'),t('ai_msg_6'),t('ai_msg_7'),t('ai_msg_8'),
  ];
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

  if(!state.proxyUrl&&!state.apiKey){
    ir.innerHTML=`<div class="progress-timeline"><div style="padding:12px;text-align:center;color:var(--text3);font-size:14px">${esc(t('search_error'))}</div></div>`;
    state.searching=false;return;
  }

  // ---- STEP 1: Show "searching database" immediately ----
  const steps=[
    {label:t('ps_db'),detail:t('ps_db_detail'),state:'active'},
    {label:t('ps_cache'),detail:t('ps_cache_detail'),state:'waiting'},
    {label:t('ps_ai'),detail:t('ps_ai_detail'),state:'waiting'},
  ];
  renderLiveTimeline(ir,steps);

  // ---- LAUNCH FETCH + LIVE PROGRESS IN PARALLEL ----
  let fetchDone=false;
  let fetchResult=null;
  let aiMsgIdx=0;
  const aiMsgs=getAIProgressMessages();

  // Timer that updates the UI every 2 seconds while fetch is pending
  const progressTimer=setInterval(()=>{
    if(fetchDone||aborted()){clearInterval(progressTimer);return;}
    // After 1.5s: mark DB as done (no results), start cache
    if(!steps[0].locked&&steps[0].state==='active'){
      steps[0]={label:t('ps_db'),detail:t('ps_db_none'),state:'done',locked:true};
      steps[1]={label:t('ps_cache'),detail:t('ps_cache_detail'),state:'active'};
      renderLiveTimeline(ir,steps);
      return;
    }
    // After 3s: mark cache as done, start AI
    if(!steps[1].locked&&steps[1].state==='active'){
      steps[1]={label:t('ps_cache'),detail:t('ps_cache_none'),state:'done',locked:true};
      steps[2]={label:t('ps_ai'),detail:aiMsgs[0]||t('ps_ai_detail'),state:'active'};
      renderLiveTimeline(ir,steps);
      aiMsgIdx=1;
      return;
    }
    // Every 2s after: rotate AI progress messages
    if(steps[2].state==='active'&&aiMsgIdx<aiMsgs.length){
      steps[2].detail=aiMsgs[aiMsgIdx];
      renderLiveTimeline(ir,steps);
      aiMsgIdx++;
    }
  },2000);

  try{
    const r=await fetch(state.proxyUrl,{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({query:name})});
    fetchDone=true;clearInterval(progressTimer);
    if(aborted())return;
    if(!r.ok){
      ir.innerHTML=`<div class="progress-timeline"><div style="padding:12px;text-align:center;color:var(--text3);font-size:14px">${esc(t('search_error'))}</div></div>`;
      state.searching=false;return;
    }
    const data=await r.json();
    const source=data.source||'ai';
    const aiCandidates=data.results||[];

    // ---- UPDATE TIMELINE BASED ON ACTUAL SOURCE ----
    if(source==='db'){
      steps[0]={label:t('ps_db'),detail:t('ps_db_found').replace('{n}',aiCandidates.length),state:'done'};
      steps[1]={label:t('ps_cache'),detail:'—',state:'done'};
      steps[2]={label:t('ps_ai'),detail:'—',state:'done'};
    } else if(source==='cache'){
      steps[0]={label:t('ps_db'),detail:t('ps_db_none'),state:'done'};
      steps[1]={label:t('ps_cache'),detail:t('ps_cache_found').replace('{n}',aiCandidates.length),state:'done'};
      steps[2]={label:t('ps_ai'),detail:'—',state:'done'};
    } else {
      steps[0]={label:t('ps_db'),detail:t('ps_db_none'),state:'done'};
      steps[1]={label:t('ps_cache'),detail:t('ps_cache_none'),state:'done'};
      steps[2]={label:t('ps_ai'),detail:t('ps_ai_found').replace('{n}',aiCandidates.length),state:'done'};
    }

    // Show products count if available
    const totalProducts=aiCandidates.reduce((sum,c)=>{
      const pc=c.products_count||c.product_count||(c.products?c.products.length:0);
      return sum+pc;
    },0);
    if(totalProducts>0){
      steps.push({label:t('ps_products'),detail:t('ps_products_found').replace('{n}',totalProducts),state:'done'});
    }

    renderLiveTimeline(ir,steps);

    if(!aiCandidates.length){
      ir.innerHTML=`<div class="progress-timeline"><div style="padding:12px;text-align:center;color:var(--text3);font-size:14px">${esc(t('not_found'))}</div></div>`;
      state.searching=false;
      setTimeout(()=>{ir.style.display='none';hero.classList.remove('has-results');document.getElementById('search-hint').style.display='';document.getElementById('demo-links').style.display='flex';},4000);
      return;
    }

    // ---- VERIFY WEBSITES ----
    steps.push({label:t('ps_verify'),detail:t('ps_verify_detail'),state:'active'});
    renderLiveTimeline(ir,steps);

    const verified=await verifyWebsites(aiCandidates,signal);
    if(aborted())return;
    const verCount=verified.filter(c=>c._siteVerified).length;
    steps[steps.length-1]={label:t('ps_verify'),detail:t('ps_verified_sites').replace('{n}',verCount).replace('{total}',verified.length),state:'done'};

    // ---- ENRICH WITH GEO ----
    steps.push({label:t('ps_enrich'),detail:t('ps_enrich_detail'),state:'active'});
    renderLiveTimeline(ir,steps);

    const enriched=await enrichWithGeo(verified,signal);
    if(aborted())return;
    steps[steps.length-1]={label:t('ps_enrich'),detail:t('ps_done'),state:'done'};
    renderLiveTimeline(ir,steps);
    state.searching=false;

    await new Promise(r=>setTimeout(r,400));
    if(aborted())return;

    // ---- CONVERT TO CANDIDATES ----
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
      productCount:c.products_count||c.product_count||(c.products?c.products.length:0),
      products:c.products||[],
      sources:c.sources||[],
      _geo:c._geo||null,
      _products:[],
      _siteVerified:c._siteVerified||false,
      _exactMatch:c.exact_match!==false,
    }));

    if(state.candidates.length===1){
      state.foundData=state.candidates[0];
      showBreweryCard(state.foundData);
    } else {
      showCandidateList(state.candidates);
    }
  }catch(e){
    fetchDone=true;clearInterval(progressTimer);
    if(e.name==='AbortError')return;
    state.searching=false;
  }
}

// ---- CANDIDATE LIST ----
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
      const prodTag=c.productCount?`<span style="font-size:11px;color:var(--green);font-weight:500">${c.productCount} prodotti</span>`:'';
      const exactTag=c._exactMatch?'':`<span style="font-size:10px;color:var(--orange);font-weight:500;background:var(--orange-soft);padding:1px 6px;border-radius:8px">suggerito</span>`;
      const meta=[siteTag,locTag,prodTag,exactTag].filter(Boolean).join(' · ');
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
      c._siteVerified=verified;return c;
    }catch(e){c._siteVerified=false;return c;}
  });
  return Promise.all(checks);
}

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
