// Sake Platform — Utility Functions

function esc(s){if(!s)return'';const d=document.createElement('div');d.textContent=s;return d.innerHTML}

function showToast(msg){
  let toast=document.getElementById('sp-toast');
  if(!toast){
    toast=document.createElement('div');
    toast.id='sp-toast';
    toast.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--text);color:#fff;padding:10px 20px;border-radius:8px;font:500 13px var(--font);opacity:0;transition:all 0.3s ease;z-index:300;pointer-events:none;';
    document.body.appendChild(toast);
  }
  toast.textContent=msg;
  requestAnimationFrame(()=>{
    toast.style.opacity='1';
    toast.style.transform='translateX(-50%) translateY(0)';
    setTimeout(()=>{
      toast.style.opacity='0';
      toast.style.transform='translateX(-50%) translateY(20px)';
    },2500);
  });
}

function showPage(n){
  state.currentPage=n;
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('page-'+n)?.classList.add('active');
  document.querySelectorAll('.topbar-nav a').forEach(a=>a.classList.remove('active'));
  document.getElementById('nav-'+n)?.classList.add('active');
  document.getElementById('nav-landing').style.display=(state.user||state.brewery)?'inline-block':'none';
  document.getElementById('nav-register').style.display=state.brewery?'':'none';
  document.getElementById('nav-dashboard').style.display=(state.user&&state.brewery)?'':'none';
  // Show anchor menu on landing, nav on other pages
  const menu=document.getElementById('topbar-menu');
  const nav=document.getElementById('topbar-nav');
  if(n==='landing'){
    if(menu)menu.style.display='flex';
    if(nav)nav.style.display='none';
  } else {
    if(menu)menu.style.display='none';
    if(nav)nav.style.display='flex';
  }
  const u=document.getElementById('topbar-user');
  if(state.user){u.style.display='flex';document.getElementById('topbar-user-name').textContent=state.user.name;}
  else{u.style.display='none';}
}

function navTo(n){showPage(n);}

function scrollToSection(id){
  if(state.currentPage!=='landing'){showPage('landing');}
  setTimeout(()=>{
    const el=document.getElementById('section-'+id);
    if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
  },50);
}

function goHome(){showPage(state.user&&state.brewery?'dashboard':'landing');}

function switchLang(l){state.lang=l;localStorage.setItem('sp_lang',l);applyLang();}

function applyLang(){
  document.querySelectorAll('.lang-btn').forEach(b=>b.classList.toggle('active',b.dataset.lang===state.lang));
  const navLanding=document.getElementById('nav-landing');
  if(navLanding)navLanding.textContent=t('nav_landing');
  // Topbar anchor menu
  document.getElementById('menu-how').textContent=t('menu_how');
  document.getElementById('menu-breweries').textContent=t('menu_breweries');
  document.getElementById('menu-importers').textContent=t('menu_importers');
  document.getElementById('hero-kanji').textContent=t('hero_title');
  document.getElementById('hero-sub').textContent=t('hero_sub');
  document.getElementById('search-input').placeholder=t('search_placeholder');
  document.getElementById('search-go-btn').textContent=t('search_go');
  document.getElementById('search-hint').innerHTML=t('search_hint');
  document.getElementById('demo-label').textContent=t('demo_label');
  document.getElementById('nav-search').textContent=t('nav_search');
  document.getElementById('nav-register').textContent=t('nav_register');
  document.getElementById('nav-dashboard').textContent=t('nav_dashboard');
  document.getElementById('bc-search').textContent=t('bc_search');
  document.getElementById('bc-claim').textContent=t('bc_claim');
  document.getElementById('lbl-name').textContent=t('lbl_name');
  document.getElementById('lbl-email').textContent=t('lbl_email');
  document.getElementById('lbl-pass').textContent=t('lbl_pass');
  document.getElementById('btn-register').textContent=t('btn_register');
  document.getElementById('btn-enter-dash').textContent=t('btn_enter');
  document.getElementById('upload-title').textContent=t('upload_title');
  document.getElementById('upload-desc').textContent=t('upload_desc');
  document.getElementById('upload-formats').innerHTML=t('upload_formats');
  document.getElementById('btn-logout').textContent=t('logout');
  document.getElementById('dash-bc-search').textContent=t('bc_search');
}
