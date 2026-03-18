// Sake Platform — Dashboard Functions

function enterDashboard(){
  if(!state.brewery||!state.user){showPage('search');return;}
  const c=state.brewery.company;
  document.getElementById('dash-name').innerHTML=esc(c.name_jp)+(state.user.domainMatch?` <span style="display:inline-flex;width:22px;height:22px;border-radius:50%;background:#16a34a;color:#fff;font-size:12px;align-items:center;justify-content:center">✓</span>`:'');
  document.getElementById('dash-bc-name')&&(document.getElementById('dash-bc-name').textContent=c.name_jp);
  const b=document.getElementById('dash-badge');
  if(state.user.domainMatch){b.className='dash-verified-badge verified';b.textContent=t('verified_owner');}
  else{b.className='dash-verified-badge pending';b.textContent=t('pending_verif');}
  renderUploaded();
  showPage('dashboard');
}

function handleFiles(files){
  for(const f of files){state.files.push({name:f.name,size:(f.size/1024).toFixed(0)+'KB',type:f.name.split('.').pop().toUpperCase(),status:'processing'});
    setTimeout(()=>{const e=state.files.find(e=>e.name===f.name&&e.status==='processing');if(e)e.status='done';localStorage.setItem('sp_files',JSON.stringify(state.files));renderUploaded();},2000+Math.random()*2000);}
  localStorage.setItem('sp_files',JSON.stringify(state.files));renderUploaded();
}

function renderUploaded(){
  const el=document.getElementById('uploaded-files');if(!state.files.length){el.innerHTML='';return;}
  const ic={PDF:'📕',XLSX:'📗',XLS:'📗',CSV:'📊',DOCX:'📘',DOC:'📘',JPG:'🖼',JPEG:'🖼',PNG:'🖼'};
  el.innerHTML=state.files.map(f=>`<div class="uploaded-file"><div class="uf-info"><div class="uf-icon">${ic[f.type]||'📄'}</div><div><div class="uf-name">${esc(f.name)}</div><div class="uf-meta">${esc(f.size)} · ${esc(f.type)}</div></div></div><div class="uf-status ${f.status}">${f.status==='done'?esc(t('upload_done')):esc(t('upload_processing'))}</div></div>`).join('');
}

function logout(){
  state.user=null;state.brewery=null;state.files=[];state.foundData=null;state.candidates=[];
  localStorage.removeItem('sp_user');localStorage.removeItem('sp_brewery');localStorage.removeItem('sp_files');
  resetSearch();showPage('search');
}

// ==================== SETTINGS ====================
function openSettings(){
  const overlay=document.getElementById('settings-overlay');
  const inp=document.getElementById('settings-api-input');
  inp.value=state.apiKey||'';
  inp.type='password';
  updateSettingsLang();
  updateApiStatus();
  overlay.classList.add('active');
  setTimeout(()=>inp.focus(),100);
}

function closeSettings(){
  document.getElementById('settings-overlay').classList.remove('active');
}

function toggleApiVis(){
  const inp=document.getElementById('settings-api-input');
  inp.type=inp.type==='password'?'text':'password';
}

function onApiKeyInput(){
  updateApiStatus();
}

function updateApiStatus(){
  const inp=document.getElementById('settings-api-input');
  const st=document.getElementById('settings-api-status');
  if(inp.value.trim()){
    st.className='settings-status ok';
    st.textContent=t('settings_status_custom');
  } else if(state.proxyUrl){
    st.className='settings-status ok';
    st.textContent=t('settings_status_ok');
  } else {
    st.className='settings-status empty';
    st.textContent=t('settings_status_empty');
  }
}

function saveApiKey(){
  const val=document.getElementById('settings-api-input').value.trim();
  state.apiKey=val;
  if(val){
    localStorage.setItem('sp_api_key',val);
  } else {
    localStorage.removeItem('sp_api_key');
  }
  closeSettings();
  // Brief toast notification
  showToast(t('settings_saved'));
}

function updateSettingsLang(){
  const el=id=>document.getElementById(id);
  el('settings-title').textContent=t('settings_title');
  el('settings-api-label').textContent=t('settings_api_label');
  el('settings-api-desc').textContent=t('settings_api_desc');
  el('settings-api-input').placeholder=t('settings_api_placeholder');
  el('settings-get-key').textContent=t('settings_get_key');
  el('settings-btn-cancel').textContent=t('settings_btn_cancel');
  el('settings-btn-save').textContent=t('settings_btn_save');
  updateApiStatus();
}
