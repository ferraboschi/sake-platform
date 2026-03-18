// Sake Platform — Configuration
const PROXY_URL = 'https://znetpzffrsqyeaezelyl.supabase.co/functions/v1/sake-search';

const state = {
  lang: localStorage.getItem('sp_lang')||'it',
  proxyUrl: PROXY_URL,
  apiKey: localStorage.getItem('sp_api_key')||'',
  user: JSON.parse(localStorage.getItem('sp_user')||'null'),
  brewery: JSON.parse(localStorage.getItem('sp_brewery')||'null'),
  files: JSON.parse(localStorage.getItem('sp_files')||'[]'),
  searching:false, foundData:null, candidates:[], currentPage:'search',
  debounceTimer:null, abortCtrl:null, lastQuery:''
};
