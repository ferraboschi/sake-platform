// Sake Platform — Research Agent Search with SSE Streaming

const MIN_CHARS=3;

function runDemo(name){
  document.getElementById('search-input').value=name;
  document.getElementById('demo-links').style.display='none';
  startSearch();
}

// ---- SEARCH HISTORY ----
function getHistory(){try{return JSON.parse(localStorage.getItem('sp_history')||'[]');}catch(e){return [];}}
function addToHistory(name){
  let h=getHistory().filter(x=>x.toLowerCase()!==name.toLowerCase());
  h.unshift(name);if(h.length>5)h=h.slice(0,5);
  localStorage.setItem('sp_history',JSON.stringify(h));renderHistory();
}
function removeFromHistory(name){
  let h=getHistory().filter(x=>x.toLowerCase()!==name.toLowerCase());
  localStorage.setItem('sp_history',JSON.stringify(h));renderHistory();
}
function renderHistory(){
  const container=document.getElementById('demo-links');
  const label=document.getElementById('demo-label');
  const h=getHistory();
  container.querySelectorAll('.demo-btn,.demo-item').forEach(b=>b.remove());
  if(!h.length){label.style.display='none';return;}
  label.style.display='flex';
  h.forEach(name=>{
    const wrap=document.createElement('span');
    wrap.className='demo-item';
    wrap.style.cssText='display:inline-flex;align-items:center;gap:0;background:var(--surface);border:1px solid var(--border);border-radius:20px;overflow:hidden;transition:0.2s ease';
    const btn=document.createElement('button');
    btn.style.cssText='background:none;border:none;padding:6px 4px 6px 14px;font:500 12px var(--font);color:var(--text2);cursor:pointer;letter-spacing:-0.1px';
    btn.textContent=name;
    btn.onclick=()=>runDemo(name);
    const del=document.createElement('button');
    del.style.cssText='background:none;border:none;padding:4px 10px 4px 4px;font-size:11px;color:var(--text3);cursor:pointer;line-height:1;opacity:0.5;transition:0.15s';
    del.textContent='✕';
    del.title='Remove';
    del.onmouseenter=()=>{del.style.opacity='1';del.style.color='var(--orange)'};
    del.onmouseleave=()=>{del.style.opacity='0.5';del.style.color='var(--text3)'};
    del.onclick=(e)=>{e.stopPropagation();removeFromHistory(name)};
    wrap.appendChild(btn);
    wrap.appendChild(del);
    container.appendChild(wrap);
  });
}

function onSearchKeydown(e){
  if(e.key==='Enter'){
    e.preventDefault();
    startSearch();
  }
}

// ---- LIVE TIMELINE RENDERER ----
function renderLiveStep(ir, steps){
  ir.innerHTML=`<div class="progress-timeline">${steps.map(s=>{
    const icon = s.status==='found'?'✓' : s.status==='empty'?'—' : s.status==='searching'?'⟳' : '·';
    const cls = s.status==='found'?'done' : s.status==='searching'?'active' : s.status==='empty'?'done' : 'waiting';
    return `<div class="pt-step ${cls}">
      <div class="pt-icon">${icon}</div>
      <div>
        <div class="pt-label">${esc(s.label||'')}</div>
        <div class="pt-detail">${esc(s.detail||'')}</div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

// ---- MAIN SEARCH WITH SSE ----
async function startSearch(){
  const name=document.getElementById('search-input').value.trim();
  if(!name||name.length<MIN_CHARS)return;
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

  if(!state.proxyUrl){ir.innerHTML='<div class="progress-timeline"><div style="padding:12px;text-align:center;color:var(--text3)">Configurazione mancante</div></div>';return;}

  // Steps tracker — each step gets added as SSE events arrive
  const steps = [];
  let finalResults = null;

  try {
    const response = await fetch(state.proxyUrl, {
      method: 'POST',
      signal,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({query: name})
    });

    if(!response.ok){
      ir.innerHTML=`<div class="progress-timeline"><div style="padding:12px;text-align:center;color:var(--text3)">${esc(t('search_error'))}</div></div>`;
      state.searching=false;return;
    }

    // Check if response is SSE stream or JSON
    const contentType = response.headers.get('content-type') || '';

    if(contentType.includes('text/event-stream')){
      // ---- SSE MODE: Read stream and update UI in real time ----
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while(true){
        if(signal.aborted)break;
        const {done, value} = await reader.read();
        if(done)break;
        buffer += decoder.decode(value, {stream: true});

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete line in buffer

        let currentEvent = '';
        let currentData = '';

        for(const line of lines){
          if(line.startsWith('event: ')){
            currentEvent = line.substring(7).trim();
          } else if(line.startsWith('data: ')){
            currentData = line.substring(6).trim();
          } else if(line === ''){
            // End of event — process it
            if(currentEvent && currentData){
              try{
                const data = JSON.parse(currentData);
                handleSSEEvent(ir, steps, currentEvent, data);
                if(currentEvent === 'results'){
                  finalResults = data;
                }
              }catch(e){}
            }
            currentEvent = '';
            currentData = '';
          }
        }
      }
    } else {
      // ---- JSON MODE: Fallback for non-SSE responses ----
      const data = await response.json();
      finalResults = { results: data.results || [], source: data.source || 'unknown' };
    }

    state.searching=false;

    // Process final results
    if(finalResults && finalResults.results && finalResults.results.length > 0){
      const aiCandidates = finalResults.results;

      // Verify websites
      const verified = await verifyWebsites(aiCandidates, signal);
      if(signal.aborted)return;

      // Convert to candidates
      state.candidates = verified.map(c=>({
        company:{
          name_jp:c.name_ja||c.name_jp||'',
          name_en:c.name_en||'',
          website:c.website||'',
          prefecture:c.prefecture||'',
          address:c.address||'',
          phone:c.phone||'',
          founded:c.founded||'',
          history:c.description||'',
          country:c.country||'',
        },
        productCount:c.products_count||(c.products?c.products.length:0),
        products:c.products||[],
        sources:c.sources||[],
        _geo:c._geo||null,
        _products:[],
        _siteVerified:c._siteVerified||false,
        _exactMatch:c.exact_match!==false,
      }));

      // Always show the candidate list — user must choose
      showCandidateList(state.candidates);
    } else {
      // No results — show narrowing down form
      showNarrowingForm(ir, name);
    }

  } catch(e){
    if(e.name==='AbortError')return;
    state.searching=false;
    ir.innerHTML=`<div class="progress-timeline"><div style="padding:12px;text-align:center;color:var(--text3)">${esc(t('search_error'))}</div></div>`;
  }
}

// ---- HANDLE SSE EVENTS ----
function handleSSEEvent(ir, steps, event, data){
  if(event === 'step'){
    // Find existing step or add new one
    const existing = steps.find(s => s.id === data.id);
    if(existing){
      Object.assign(existing, data);
    } else {
      steps.push(data);
    }
    renderLiveStep(ir, steps);
  }
}

// ---- NARROWING DOWN FORM ----
function showNarrowingForm(ir, originalQuery){
  document.querySelector('.search-box').style.display='flex';
  ir.innerHTML=`<div class="progress-timeline" style="text-align:center;padding:24px">
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">${esc(t('not_found_title'))}</div>
    <div style="font-size:13px;color:var(--text3);margin-bottom:20px;line-height:1.6">${esc(t('not_found_help'))}</div>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:320px;margin:0 auto;text-align:left">
      <label style="font-size:12px;font-weight:600;color:var(--text2)">${esc(t('narrow_kanji'))}</label>
      <input type="text" id="narrow-kanji" placeholder="例: 鯉川酒造" style="height:40px;border:1px solid var(--border);border-radius:8px;padding:0 12px;font:400 14px var(--font);outline:none">
      <label style="font-size:12px;font-weight:600;color:var(--text2)">${esc(t('narrow_prefecture'))}</label>
      <input type="text" id="narrow-pref" placeholder="例: Yamagata" style="height:40px;border:1px solid var(--border);border-radius:8px;padding:0 12px;font:400 14px var(--font);outline:none">
      <label style="font-size:12px;font-weight:600;color:var(--text2)">${esc(t('narrow_website'))}</label>
      <input type="text" id="narrow-web" placeholder="例: koikawa.com" style="height:40px;border:1px solid var(--border);border-radius:8px;padding:0 12px;font:400 14px var(--font);outline:none">
      <button class="btn btn-primary" style="margin-top:8px" onclick="retryWithDetails('${esc(originalQuery)}')">${esc(t('narrow_retry'))}</button>
      <button class="btn btn-outline" onclick="resetSearch()">${esc(t('narrow_cancel'))}</button>
    </div>
  </div>`;
}

function retryWithDetails(originalQuery){
  const kanji = document.getElementById('narrow-kanji')?.value || '';
  const pref = document.getElementById('narrow-pref')?.value || '';
  const web = document.getElementById('narrow-web')?.value || '';
  // Build enhanced query
  let q = originalQuery;
  if(kanji) q = kanji;
  if(pref) q += ' ' + pref;
  document.getElementById('search-input').value = q;
  state.lastQuery = ''; // force new search
  startSearch();
}

// ---- CANDIDATE LIST (Step 2: Selection) ----
function showCandidateList(candidates){
  const ir=document.getElementById('inline-result');
  // Restore search box if hidden by brewery card view
  document.querySelector('.search-box').style.display='flex';
  const queryName=esc(state.lastQuery);

  // Build rich candidate cards
  const cards=candidates.map((c,i)=>{
    const co=c.company;
    const website=(co.website||'').replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/$/,'');
    const fav=website?`<img src="https://www.google.com/s2/favicons?domain=${website}&sz=64" onerror="this.outerHTML='🏯'">`:'🏯';
    const verified=c._siteVerified;
    const exactTag=c._exactMatch?'':`<span style="font-size:10px;color:var(--orange);font-weight:500;background:var(--orange-soft);padding:2px 8px;border-radius:8px;margin-left:8px">${t('suggested_tag')}</span>`;

    // Detail rows
    const details=[];
    if(co.prefecture||co.country) details.push(`<div style="font-size:12px;color:var(--text2)">📍 ${esc([co.prefecture,co.country].filter(Boolean).join(', '))}</div>`);
    if(co.address && co.address!==co.prefecture) details.push(`<div style="font-size:11px;color:var(--text3)">${esc(co.address)}</div>`);
    if(co.founded) details.push(`<div style="font-size:12px;color:var(--text2)">${esc(t('founded_label'))}: ${esc(co.founded)}</div>`);
    if(website){
      const siteColor=verified?'var(--green)':'var(--text3)';
      const siteIcon=verified?'✓ ':'';
      details.push(`<div style="font-size:12px;color:${siteColor};font-weight:500">${siteIcon}${esc(website)}</div>`);
    }
    if(c.productCount>0) details.push(`<div style="font-size:12px;color:var(--green);font-weight:500">${c.productCount} ${t('products_label')}</div>`);
    if(c.products&&c.products.length>0){
      const prodList=c.products.slice(0,4).map(p=>esc(p)).join(', ');
      const more=c.products.length>4?' + '+(c.products.length-4):'';
      details.push(`<div style="font-size:11px;color:var(--text3);font-style:italic">${prodList}${more}</div>`);
    }
    // Sources
    if(c.sources&&c.sources.length>0){
      details.push(`<div style="font-size:10px;color:var(--text3);margin-top:2px">${t('sources_label')}: ${c.sources.join(', ')}</div>`);
    }

    return `<div class="candidate-item" onclick="selectCandidate(${i})" style="align-items:flex-start;padding:18px 20px">
      <div class="candidate-logo" style="margin-top:2px">${fav}</div>
      <div class="candidate-info" style="gap:4px;display:flex;flex-direction:column">
        <div class="candidate-name">${esc(co.name_jp)}${co.name_en&&co.name_en!==co.name_jp?' · '+esc(co.name_en):''}${exactTag}</div>
        ${details.join('')}
      </div>
      <div class="candidate-arrow" style="margin-top:4px">→</div>
    </div>`;
  }).join('');

  ir.innerHTML=`<div class="candidate-list">
    <div class="candidate-list-title" style="padding:18px 20px 14px;font-size:14px">
      ${t('candidates_question').replace('{name}',queryName)}
    </div>
    ${cards}
    <div style="padding:16px 20px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
      <button class="btn btn-outline" style="font-size:12px" onclick="showNarrowingForm(document.getElementById('inline-result'),'${queryName}')">${esc(t('none_of_these'))}</button>
      <button class="btn btn-outline" style="font-size:12px;border-color:var(--green);color:var(--green)" onclick="startCreateFromScratch()">${esc(t('create_from_scratch'))}</button>
    </div>
  </div>`;
}

function startCreateFromScratch(){
  // TODO: implement create-from-scratch flow (FASE 2)
  const ir=document.getElementById('inline-result');
  ir.innerHTML=`<div class="progress-timeline" style="text-align:center;padding:32px">
    <div style="font-size:40px;margin-bottom:12px">🏯</div>
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">${esc(t('create_scratch_title'))}</div>
    <div style="font-size:13px;color:var(--text3);line-height:1.6">${esc(t('create_scratch_desc'))}</div>
  </div>`;
}

async function selectCandidate(idx){
  if(!state.candidates[idx])return;
  state.foundData=state.candidates[idx];
  // Geocode if no coordinates yet
  if(!state.foundData._geo){
    const co=state.foundData.company;
    const q=[co.name_jp,co.prefecture,co.country].filter(Boolean).join(' ');
    if(q){
      try{
        const r=await fetch('https://nominatim.openstreetmap.org/search?q='+encodeURIComponent(q)+'&format=json&addressdetails=1&limit=1&accept-language=en',{headers:{'User-Agent':'SakePlatform/2.0'}});
        if(r.ok){
          const res=await r.json();
          if(res.length){
            state.foundData._geo={lat:+res[0].lat,lng:+res[0].lon};
            if(!co.address&&res[0].display_name) co.address=res[0].display_name;
          }
        }
      }catch(e){}
    }
  }
  showBreweryCard(state.foundData);
}

function resetSearch(){
  if(state.abortCtrl){state.abortCtrl.abort();}
  clearTimeout(state.debounceTimer);
  state.searching=false;state.foundData=null;state.candidates=[];state.lastQuery='';
  const ir=document.getElementById('inline-result');
  ir.style.display='none';ir.innerHTML='';
  document.getElementById('hero').classList.remove('has-results');
  document.querySelector('.search-box').style.display='flex';
  document.getElementById('search-hint').style.display='';document.getElementById('demo-links').style.display='flex';
  document.getElementById('search-input').value='';
  document.getElementById('search-input').focus();
}

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
      c._siteVerified=verified;return c;
    }catch(e){c._siteVerified=false;return c;}
  });
  return Promise.all(checks);
}
