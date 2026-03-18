// Sake Platform — Brewery Functions

function showBreweryCard(data){
  const c=data.company,pc=data.productCount,geo=data._geo,sources=data.sources||[];
  const ir=document.getElementById('inline-result');
  const website=(c.website||'').replace(/^https?:\/\//,'').replace(/\/$/,'');
  const fav=website?`https://www.google.com/s2/favicons?domain=${website}&sz=128`:'';
  const logo=fav?`<img src="${fav}" onerror="this.parentElement.innerHTML='<div class=bc-logo-fallback>🏯</div>'">`:`<div class="bc-logo-fallback">🏯</div>`;
  const map=geo&&geo.lat?`<div class="bc-map"><iframe src="https://www.openstreetmap.org/export/embed.html?bbox=${geo.lng-0.006},${geo.lat-0.004},${geo.lng+0.006},${geo.lat+0.004}&layer=mapnik&marker=${geo.lat},${geo.lng}" width="100%" height="140" style="border:0" loading="lazy"></iframe></div>`:'';
  const hist=c.history?`<div class="bc-history">${esc(c.history)}</div>`:'';
  const info=[];
  if(c.country)info.push({l:t('country_label'),v:c.country});
  if(c.prefecture)info.push({l:t('prefecture_label'),v:c.prefecture});
  if(c.founded)info.push({l:t('founded_label'),v:c.founded});
  if(c.address)info.push({l:t('address_label'),v:c.address});
  if(c.phone)info.push({l:t('phone_label'),v:c.phone});
  const grid=info.length?`<div class="bc-info-grid">${info.map(i=>`<div class="bc-info-item"><div><div class="bc-info-label">${esc(i.l)}</div><div class="bc-info-value">${esc(i.v)}</div></div></div>`).join('')}</div>`:'';
  const prods=pc>0?`<div class="bc-products-badge"><div class="bc-products-number">${pc}</div><div><div class="bc-products-label">${esc(t('products_found'))}</div><div class="bc-products-sublabel">${esc(t('products_sublabel'))}</div></div></div>`:'';
  const srcHtml=(sources.length||website)?`<div class="bc-sources">${website?`<span class="bc-source-tag">${esc(website)}</span>`:''}${sources.map(s=>`<span class="bc-source-tag">${esc(s)}</span>`).join('')}</div>`:'';
  // Multilingual hint
  const langHint=`<div class="bc-lang-hint"><div class="bc-lang-hint-icon">🌐</div><div class="bc-lang-hint-text">${t('lang_hint')}</div></div>`;
  // Back to results button (if multiple candidates)
  const backBtn=state.candidates.length>1?`<button class="bc-retry" onclick="showCandidateList(state.candidates)" style="margin-right:auto">${esc(t('btn_back_results'))}</button>`:'';

  ir.innerHTML=`<div class="brewery-card">
    <div class="bc-header"><div class="bc-logo">${logo}</div><div class="bc-title"><div class="bc-name-jp">${esc(c.name_jp)}</div>${c.name_en?`<div class="bc-name-en">${esc(c.name_en)}</div>`:''}</div></div>
    <div class="bc-body">${website?`<a class="bc-website" href="https://${esc(website)}" target="_blank">🌐 ${esc(website)}</a>`:''}${grid}${hist}${prods}${langHint}</div>
    ${map}${srcHtml}
    <div class="bc-cta"><div class="bc-cta-text">${esc(t('found_confirm'))}</div><div class="bc-cta-actions">${backBtn}<button class="btn btn-primary btn-lg" onclick="confirmBrewery()">${esc(t('btn_confirm'))}</button><button class="bc-retry" onclick="resetSearch()">${esc(t('btn_not_me'))}</button></div></div>
  </div>`;
}

function confirmBrewery(){
  if(!state.foundData)return;
  state.brewery=state.foundData;
  localStorage.setItem('sp_brewery',JSON.stringify(state.foundData));
  setupClaimPage();
  showPage('register');
}

function setupClaimPage(){
  const c=state.brewery.company;
  const website=(c.website||'').replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/$/,'');
  const fav=website?`https://www.google.com/s2/favicons?domain=${website}&sz=64`:'';
  document.getElementById('claim-brewery').innerHTML=
    `<div class="claim-brewery-logo">${fav?`<img src="${fav}" onerror="this.outerHTML='🏯'">`:'🏯'}</div>
     <div><div class="claim-brewery-name">${esc(c.name_jp)}</div><div class="claim-brewery-site">${esc(website)}</div></div>`;

  document.getElementById('claim-title').textContent=t('claim_title');
  document.getElementById('claim-desc').textContent=t('claim_desc');
  document.getElementById('form-title').textContent=t('form_title');

  const dom=website||'sakagura.co.jp';
  document.getElementById('verif-methods').innerHTML=`
    <div class="verif-method recommended">
      <div class="verif-method-icon">✓</div>
      <div><div class="verif-method-title">${esc(t('verif_email_title'))}</div>
      <div class="verif-method-desc">${esc(t('verif_email_desc').replace(/\{domain\}/g,dom))}</div>
      <div class="verif-method-badge auto">${esc(t('verif_email_badge'))}</div></div>
    </div>
    <div class="verif-method">
      <div class="verif-method-icon">📄</div>
      <div><div class="verif-method-title">${esc(t('verif_doc_title'))}</div>
      <div class="verif-method-desc">${esc(t('verif_doc_desc'))}</div>
      <div class="verif-method-badge manual">${esc(t('verif_doc_badge'))}</div></div>
    </div>
    <div class="verif-method">
      <div class="verif-method-icon">📞</div>
      <div><div class="verif-method-title">${esc(t('verif_phone_title'))}</div>
      <div class="verif-method-desc">${esc(t('verif_phone_desc'))}</div>
      <div class="verif-method-badge manual">${esc(t('verif_phone_badge'))}</div></div>
    </div>
    <div class="verif-method">
      <div class="verif-method-icon">📱</div>
      <div><div class="verif-method-title">${esc(t('verif_social_title'))}</div>
      <div class="verif-method-desc">${esc(t('verif_social_desc'))}</div>
      <div class="verif-method-badge manual">${esc(t('verif_social_badge'))}</div></div>
    </div>`;

  document.getElementById('inp-email').placeholder='you@'+(website||'brewery.co.jp');
  document.getElementById('domain-match').textContent=t('domain_match_yes');
  document.getElementById('domain-no-match').textContent=t('domain_match_no').replace('{domain}',dom);
  const demoHint=document.getElementById('demo-email-hint');
  demoHint.textContent=t('demo_email_hint').replace('{domain}',dom);
  demoHint.style.display='block';
  demoHint.dataset.email='test@'+dom;
  document.getElementById('claim-form-section').style.display='';
  document.getElementById('email-sent').style.display='none';
}

function checkDomainMatch(){
  const c=state.brewery?.company;if(!c)return;
  const website=(c.website||'').replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0].toLowerCase();
  const emailDomain=(document.getElementById('inp-email').value.split('@')[1]||'').toLowerCase();
  const matchEl=document.getElementById('domain-match');
  const noMatchEl=document.getElementById('domain-no-match');
  if(!emailDomain||!emailDomain.includes('.')){matchEl.style.display='none';noMatchEl.style.display='none';return;}
  if(website&&emailDomain===website){matchEl.style.display='block';noMatchEl.style.display='none';}
  else{matchEl.style.display='none';noMatchEl.style.display='block';}
}

function fillDemoEmail(){
  const hint=document.getElementById('demo-email-hint');
  const email=hint.dataset.email||'test@example.co.jp';
  document.getElementById('inp-email').value=email;
  document.getElementById('inp-name').value='Test User';
  document.getElementById('inp-pass').value='demo1234';
  hint.style.display='none';
  checkDomainMatch();
}

function register(){
  const name=document.getElementById('inp-name').value.trim();
  const email=document.getElementById('inp-email').value.trim();
  const pass=document.getElementById('inp-pass').value.trim();
  if(!name||!email||!pass)return;
  const c=state.brewery.company;
  const website=(c.website||'').replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0].toLowerCase();
  const d=(email.split('@')[1]||'').toLowerCase();
  const dm=d&&website&&d===website;
  state.user={name,email,domainMatch:dm};
  localStorage.setItem('sp_user',JSON.stringify(state.user));
  document.getElementById('claim-form-section').style.display='none';
  document.getElementById('claim-verification-section').style.display='none';
  document.getElementById('email-sent').style.display='';
  document.getElementById('email-sent-title').textContent=t('email_sent_title');
  document.getElementById('email-sent-desc').textContent=t('email_sent_desc').replace('{email}',email);
}
