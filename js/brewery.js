// Sake Platform — Brewery Card & Claim Functions

function showBreweryCard(data){
  const c=data.company, pc=data.productCount||0, geo=data._geo, sources=data.sources||[];
  const products=data.products||[];
  const ir=document.getElementById('inline-result');
  const website=(c.website||'').replace(/^https?:\/\//,'').replace(/\/$/,'');
  const fav=website?'https://www.google.com/s2/favicons?domain='+website+'&sz=128':'';
  const logo=fav?'<img src="'+fav+'" onerror="this.parentElement.innerHTML=\'<div class=bc-logo-fallback>🏯</div>\'">' : '<div class="bc-logo-fallback">🏯</div>';

  // Map section
  const map=geo&&geo.lat?'<div class="bc-map"><iframe src="https://www.openstreetmap.org/export/embed.html?bbox='+(geo.lng-0.008)+','+(geo.lat-0.006)+','+(geo.lng+0.008)+','+(geo.lat+0.006)+'&layer=mapnik&marker='+geo.lat+','+geo.lng+'" width="100%" height="180" style="border:0;border-radius:0" loading="lazy"></iframe></div>':'';

  // Info grid
  const info=[];
  if(c.country) info.push({l:t('country_label'),v:c.country,icon:'🌍'});
  if(c.prefecture) info.push({l:t('prefecture_label'),v:c.prefecture,icon:'📍'});
  if(c.founded) info.push({l:t('founded_label'),v:c.founded,icon:'📅'});
  if(c.address) info.push({l:t('address_label'),v:c.address,icon:'🏠'});
  if(c.phone) info.push({l:t('phone_label'),v:c.phone,icon:'📞'});
  const grid=info.length?'<div class="bc-info-grid">'+info.map(function(i){
    return '<div class="bc-info-item"><div><div class="bc-info-label">'+esc(i.icon)+' '+esc(i.l)+'</div><div class="bc-info-value">'+esc(i.v)+'</div></div></div>';
  }).join('')+'</div>':'';

  // Description with language indicator
  const descLang=state.lang==='ja'?'🇯🇵':state.lang==='en'?'🇬🇧':'🇮🇹';
  const hist=c.history?'<div class="bc-history"><div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span style="font-size:14px">'+descLang+'</span><span style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:600;letter-spacing:0.5px">'+t('description_label')+'</span></div>'+esc(c.history)+'</div>':'';

  // Products section
  let prodsHtml='';
  if(pc>0||products.length>0){
    const count=pc||products.length;
    let prodListHtml='';
    if(products.length>0){
      prodListHtml='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">'+products.slice(0,8).map(function(p){
        return '<span style="font-size:11px;background:var(--bg2);border:1px solid var(--border);padding:3px 10px;border-radius:12px;color:var(--text2)">'+esc(p)+'</span>';
      }).join('')+(products.length>8?'<span style="font-size:11px;color:var(--text3);padding:3px 6px">+'+(products.length-8)+' '+t('more_label')+'</span>':'')+'</div>';
    }
    prodsHtml='<div class="bc-products-badge"><div class="bc-products-number">'+count+'</div><div><div class="bc-products-label">'+esc(t('products_found'))+'</div><div class="bc-products-sublabel">'+esc(t('products_sublabel'))+'</div></div></div>'+prodListHtml;
  }

  // Sources section
  const srcTags=[];
  if(website) srcTags.push('<span class="bc-source-tag">'+esc(website)+'</span>');
  sources.forEach(function(s){ srcTags.push('<span class="bc-source-tag">'+esc(s)+'</span>'); });
  const srcHtml=srcTags.length?'<div class="bc-sources"><span style="font-size:10px;font-weight:600;color:var(--text3)">'+t('sources_label')+':</span> '+srcTags.join(' ')+'</div>':'';

  // Language switcher hint
  const langHint='<div class="bc-lang-hint"><div class="bc-lang-hint-icon">🌐</div><div class="bc-lang-hint-text">'+t('lang_hint')+'</div></div>';

  // Back to results button
  const backBtn=state.candidates.length>1?'<button class="bc-retry" onclick="showCandidateList(state.candidates)" style="margin-right:auto">'+esc(t('btn_back_results'))+'</button>':'';

  // Verified badge
  const verifiedBadge=data._siteVerified&&website?'<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--green);font-weight:600;background:var(--green-soft);padding:2px 8px;border-radius:10px;margin-left:8px">✓ '+t('verified_label')+'</span>':'';

  ir.innerHTML='<div class="brewery-card">'+
    '<div class="bc-header"><div class="bc-logo">'+logo+'</div><div class="bc-title"><div class="bc-name-jp">'+esc(c.name_jp)+verifiedBadge+'</div>'+(c.name_en?'<div class="bc-name-en">'+esc(c.name_en)+'</div>':'')+'</div></div>'+
    '<div class="bc-body">'+(website?'<a class="bc-website" href="https://'+esc(website)+'" target="_blank" rel="noopener">🌐 '+esc(website)+'</a>':'')+grid+hist+prodsHtml+langHint+'</div>'+
    map+srcHtml+
    '<div class="bc-cta">'+
      '<div class="bc-cta-text">'+esc(t('found_confirm'))+'</div>'+
      '<div class="bc-cta-actions">'+backBtn+
        '<button class="btn btn-primary btn-lg" onclick="confirmBrewery()">'+esc(t('btn_confirm'))+'</button>'+
        '<button class="bc-retry" onclick="notMyBrewery()">'+esc(t('btn_not_me'))+'</button>'+
      '</div>'+
    '</div>'+
  '</div>';
}

function notMyBrewery(){
  // If there are other candidates, go back to the list
  if(state.candidates.length>1){
    showCandidateList(state.candidates);
    return;
  }
  // Otherwise show narrowing form
  const ir=document.getElementById('inline-result');
  showNarrowingForm(ir, state.lastQuery);
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
  const fav=website?'https://www.google.com/s2/favicons?domain='+website+'&sz=64':'';
  document.getElementById('claim-brewery').innerHTML=
    '<div class="claim-brewery-logo">'+(fav?'<img src="'+fav+'" onerror="this.outerHTML=\'🏯\'">':'🏯')+'</div>'+
    '<div><div class="claim-brewery-name">'+esc(c.name_jp)+'</div><div class="claim-brewery-site">'+esc(website)+'</div></div>';

  document.getElementById('claim-title').textContent=t('claim_title');
  document.getElementById('claim-desc').textContent=t('claim_desc');
  document.getElementById('form-title').textContent=t('form_title');

  const dom=website||'sakagura.co.jp';
  document.getElementById('verif-methods').innerHTML=
    '<div class="verif-method recommended">'+
      '<div class="verif-method-icon">✓</div>'+
      '<div><div class="verif-method-title">'+esc(t('verif_email_title'))+'</div>'+
      '<div class="verif-method-desc">'+esc(t('verif_email_desc').replace(/\{domain\}/g,dom))+'</div>'+
      '<div class="verif-method-badge auto">'+esc(t('verif_email_badge'))+'</div></div>'+
    '</div>'+
    '<div class="verif-method">'+
      '<div class="verif-method-icon">📄</div>'+
      '<div><div class="verif-method-title">'+esc(t('verif_doc_title'))+'</div>'+
      '<div class="verif-method-desc">'+esc(t('verif_doc_desc'))+'</div>'+
      '<div class="verif-method-badge manual">'+esc(t('verif_doc_badge'))+'</div></div>'+
    '</div>';

  document.getElementById('inp-email').placeholder='you@'+(website||'brewery.co.jp');
  document.getElementById('domain-match').textContent=t('domain_match_yes');
  document.getElementById('domain-no-match').textContent=t('domain_match_no').replace('{domain}',dom);
  var demoHint=document.getElementById('demo-email-hint');
  demoHint.textContent=t('demo_email_hint').replace('{domain}',dom);
  demoHint.style.display='block';
  demoHint.dataset.email='test@'+dom;
  document.getElementById('claim-form-section').style.display='';
  document.getElementById('email-sent').style.display='none';
}

function checkDomainMatch(){
  var c=state.brewery?.company;if(!c)return;
  var website=(c.website||'').replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0].toLowerCase();
  var emailDomain=(document.getElementById('inp-email').value.split('@')[1]||'').toLowerCase();
  var matchEl=document.getElementById('domain-match');
  var noMatchEl=document.getElementById('domain-no-match');
  if(!emailDomain||!emailDomain.includes('.')){matchEl.style.display='none';noMatchEl.style.display='none';return;}
  if(website&&emailDomain===website){matchEl.style.display='block';noMatchEl.style.display='none';}
  else{matchEl.style.display='none';noMatchEl.style.display='block';}
}

function fillDemoEmail(){
  var hint=document.getElementById('demo-email-hint');
  var email=hint.dataset.email||'test@example.co.jp';
  document.getElementById('inp-email').value=email;
  document.getElementById('inp-name').value='Test User';
  document.getElementById('inp-pass').value='demo1234';
  hint.style.display='none';
  checkDomainMatch();
}

function register(){
  var name=document.getElementById('inp-name').value.trim();
  var email=document.getElementById('inp-email').value.trim();
  var pass=document.getElementById('inp-pass').value.trim();
  if(!name||!email||!pass)return;
  var c=state.brewery.company;
  var website=(c.website||'').replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0].toLowerCase();
  var d=(email.split('@')[1]||'').toLowerCase();
  var dm=d&&website&&d===website;
  state.user={name:name,email:email,domainMatch:dm};
  localStorage.setItem('sp_user',JSON.stringify(state.user));
  document.getElementById('claim-form-section').style.display='none';
  document.getElementById('claim-verification-section').style.display='none';
  document.getElementById('email-sent').style.display='';
  document.getElementById('email-sent-title').textContent=t('email_sent_title');
  document.getElementById('email-sent-desc').textContent=t('email_sent_desc').replace('{email}',email);
}
