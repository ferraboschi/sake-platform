# Sake Platform — Piano di Progetto

## Decisioni Prese

- **Stack**: Supabase (DB + Auth + Storage + Edge Functions) + GitHub Pages (frontend statico)
- **Frontend**: Modulare, file separati HTML/CSS/JS, niente framework, niente build tools
- **Auth**: Email + password, sessione persistente 30 giorni, conferma email una tantum
- **Ruoli utente**: Produttore (sakagura) e Importatore
- **Spunta blu**: Opzionale, via verifica email dominio o documento manuale
- **Monetizzazione**: Free per ora
- **Multilingua**: IT/EN/JA su tutto, editing facile per i produttori
- **Campi custom**: I produttori possono aggiungere/rimuovere campi dai prodotti (JSONB)
- **Foto**: Drag & drop upload da parte dei produttori
- **Export**: Link pubblico, PDF (full + light), iframe embed
- **Knowledge base**: search_cache su Supabase, dati che crescono con l'uso (no RAG esterno)
- **Dominio**: sakeplatform.com (GitHub Pages)
- **Repo**: github.com/ferraboschi/sake-platform
- **Supabase project**: znetpzffrsqyeaezelyl (eu-central-1)
- **Edge Function proxy**: sake-search (già live)

---

## FASE 0 — Ristrutturazione Codice

**Obiettivo**: Migrare da file singolo (index.html ~1500 righe) a struttura modulare.

**Cosa fare**:
- Creare struttura cartelle: `/css/`, `/js/`, root `index.html`
- Separare: `css/style.css`, `js/config.js`, `js/i18n.js`, `js/router.js`, `js/auth.js`, `js/search.js`, `js/brewery.js`, `js/dashboard.js`, `js/utils.js`
- `index.html` diventa shell leggera (~50 righe) che carica i moduli e gestisce il routing tra le pagine (SPA con hash routing: #search, #brewery, #register, #dashboard)
- Ogni file JS < 300 righe
- Verificare che tutto funziona identicamente al sito attuale
- Push su GitHub Pages, test live

**Criterio di completamento**: il sito su sakeplatform.com funziona esattamente come prima ma con codice modulare.

---

## FASE 1 — Database Supabase + Cache Ricerche

**Obiettivo**: Creare le tabelle su Supabase e far sì che le ricerche vengano salvate e riutilizzate.

**Tabelle da creare**:

```sql
-- Sakagura trovate e confermate
breweries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ja TEXT,
  name_en TEXT NOT NULL,
  website TEXT,
  prefecture TEXT,
  country TEXT,
  address TEXT,
  phone TEXT,
  founded TEXT,
  description_it TEXT,
  description_en TEXT,
  description_ja TEXT,
  logo_url TEXT,
  claimed_by UUID REFERENCES users(id),
  verified BOOLEAN DEFAULT FALSE,
  source_data JSONB,  -- dati grezzi dalle fonti
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
)

-- Prodotti (sake) legati alle sakagura
products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id UUID REFERENCES breweries(id) ON DELETE CASCADE,
  name_ja TEXT,
  name_en TEXT NOT NULL,
  type TEXT,  -- junmai, daiginjo, etc.
  rice TEXT,
  polishing_ratio TEXT,
  alcohol TEXT,
  volume TEXT,
  description_it TEXT,
  description_en TEXT,
  description_ja TEXT,
  image_url TEXT,
  extra_fields JSONB DEFAULT '{}',  -- campi custom del produttore
  sources JSONB DEFAULT '[]',  -- da dove abbiamo trovato questo prodotto
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
)

-- Cache delle ricerche AI (knowledge base)
search_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_normalized TEXT NOT NULL UNIQUE,  -- lowercase, trimmed
  results JSONB NOT NULL,
  result_count INTEGER,
  searched_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days')
)

-- Utenti
users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  name TEXT,
  role TEXT CHECK (role IN ('producer', 'importer')) NOT NULL,
  brewery_id UUID REFERENCES breweries(id),
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
)

-- Relazione importatore <-> sakagura
importer_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  importer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  brewery_id UUID REFERENCES breweries(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('pending', 'active', 'rejected')) DEFAULT 'pending',
  invited_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(importer_id, brewery_id)
)

-- File caricati (schede tecniche, foto)
files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id UUID REFERENCES breweries(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id),
  file_name TEXT NOT NULL,
  file_type TEXT,  -- pdf, xlsx, jpg, png
  storage_path TEXT NOT NULL,  -- path in Supabase Storage
  processed_data JSONB,  -- dati estratti dal file
  created_at TIMESTAMPTZ DEFAULT now()
)
```

**Logica di ricerca con cache**:
1. Utente cerca "otokoyama"
2. Normalizza query → "otokoyama"
3. Cerca in `search_cache` dove `query_normalized = 'otokoyama'` AND `expires_at > now()`
4. Se trovato → restituisci risultati dal cache (0 costi API)
5. Se non trovato → chiama Edge Function → salva risultati in `search_cache` + crea/aggiorna righe in `breweries`
6. La prossima ricerca per "otokoyama" è istantanea

**Aggiornare Edge Function** per:
- Controllare cache prima di chiamare Claude
- Salvare risultati nel DB dopo ogni ricerca
- Arricchire il prompt con dati esistenti dal DB

**Criterio di completamento**: le ricerche vengono salvate su Supabase, la seconda ricerca per lo stesso nome è istantanea, i dati delle sakagura persistono nel DB.

---

## FASE 2 — Autenticazione e Registrazione

**Obiettivo**: Login con email + password, ruoli produttore/importatore, claim sakagura.

**Cosa fare**:
- Setup Supabase Auth (email + password)
- Pagina di registrazione: scelta ruolo (Produttore / Importatore), nome, email, password
- Conferma email (una volta sola via link Supabase)
- Login con email + password, opzione "ricordami" (sessione 30 giorni)
- Flusso claim sakagura per produttore:
  - Cerca sakagura → seleziona → "Questa è la mia sakagura" → registrazione
  - Se email ha dominio del sito sakagura → spunta blu automatica
  - Altrimenti → account attivo ma senza spunta, messaggio "Per la spunta blu invia documento a verify@sakeplatform.com"
- Flusso importatore:
  - Registrazione come importatore (nome azienda, paese, email, password)
  - Nessuna spunta blu necessaria
  - Dopo login vede la ricerca sakagura + "Segui questa sakagura"

**Configurare email transazionale**:
- Setup Resend (o Supabase built-in) per email di conferma
- DNS records per sakeplatform.com (SPF, DKIM)

**Criterio di completamento**: un utente può registrarsi, fare login, fare logout, tornare con la sessione attiva. Il claim funziona con verifica email dominio.

---

## FASE 3 — Dashboard Produttore

**Obiettivo**: Il produttore gestisce la sua sakagura, i prodotti, le schede tecniche.

**Cosa fare**:
- Dashboard con sidebar: Profilo, Prodotti, File, Importatori
- **Profilo sakagura**: modifica nome, descrizione (IT/EN/JA), indirizzo, telefono, sito web. Upload logo via drag & drop.
- **Prodotti**: lista prodotti trovati automaticamente + possibilità di aggiungere manualmente. Per ogni prodotto: editing multilingua, upload foto drag & drop, campi custom (aggiungi/rimuovi). Il multilingua deve essere semplice: tabs IT/EN/JA con textarea, si vede subito cosa è compilato e cosa no.
- **File**: upload schede tecniche (PDF, Excel, foto). Il sistema estrae i dati automaticamente (via Claude) e propone di popolare i campi prodotto. Il produttore conferma/modifica.
- **Importatori**: lista di importatori che seguono la sakagura, possibilità di invitare un importatore via email.

**Storage Supabase**: bucket `brewery-assets` per logo e foto prodotti, bucket `tech-sheets` per i file caricati.

**Criterio di completamento**: il produttore può editare il profilo, gestire prodotti con multilingua, caricare foto e schede tecniche.

---

## FASE 4 — Dashboard Importatore

**Obiettivo**: L'importatore segue sakagura, vede prodotti e schede tecniche.

**Cosa fare**:
- Dashboard importatore: Sakagura Seguite, Cerca Sakagura, Profilo
- **Sakagura seguite**: lista delle sakagura che seguo con stato (pending/attivo). Per ogni sakagura attiva: vedo i prodotti, le schede tecniche, posso scaricare PDF.
- **Cerca e segui**: stessa ricerca della home, ma con bottone "Segui questa sakagura" → richiesta inviata al produttore.
- **Invita produttore**: se la sakagura non è ancora claimata, l'importatore può inserire email del produttore → il sistema manda un invito.
- **Notifiche**: quando un produttore aggiorna un prodotto o carica una nuova scheda, l'importatore vede la notifica.

**Criterio di completamento**: l'importatore può seguire sakagura, vedere prodotti aggiornati, scaricare schede.

---

## FASE 5 — Profilo Pubblico e Export

**Obiettivo**: Ogni sakagura ha una pagina pubblica condivisibile con export PDF e iframe.

**Cosa fare**:
- **URL pubblico**: `sakeplatform.com/#/brewery/{id}` — pagina bella, responsive, con logo, info, prodotti, foto. Nessun login richiesto.
- **PDF Full**: scheda tecnica completa, tutti i campi, multilingua, foto. Formato A4, professionale.
- **PDF Light**: versione commerciale, una pagina, foto grande, nome sake, tipo, food pairing, flavor profile. Bella da stampare e inoltrare.
- **Iframe embed**: `<iframe src="sakeplatform.com/embed/{id}">` — widget leggero che mostra i prodotti della sakagura. Funziona su qualsiasi sito.
- **Scelta lingua**: il link pubblico e il PDF possono essere generati nella lingua scelta (IT/EN/JA).

**Criterio di completamento**: ogni sakagura ha un link pubblico funzionante, PDF scaricabili, iframe embedabile.

---

## FASE 6 — Inviti e Team

**Obiettivo**: Il produttore può invitare colleghi nella sua azienda.

**Cosa fare**:
- Invito via email: il produttore inserisce email del collega → il collega riceve un link → si registra come produttore collegato alla stessa sakagura.
- Ruoli interni: owner (chi ha fatto il claim) e member (colleghi invitati).
- Il member può editare prodotti e caricare file ma non può eliminare la sakagura o trasferire ownership.

**Criterio di completamento**: più persone della stessa sakagura possono accedere e collaborare.

---

## Note Tecniche Trasversali

**Struttura file frontend**:
```
/
├── index.html          (shell + router, ~50 righe)
├── css/
│   └── style.css       (tutto lo stile)
├── js/
│   ├── config.js       (costanti, URL Supabase, versione)
│   ├── i18n.js         (traduzioni IT/EN/JA)
│   ├── router.js       (SPA hash routing)
│   ├── auth.js         (login, registrazione, sessione)
│   ├── search.js       (ricerca, cache, candidati)
│   ├── brewery.js      (profilo sakagura, prodotti)
│   ├── dashboard.js    (dashboard produttore/importatore)
│   ├── export.js       (PDF, link, iframe)
│   └── utils.js        (helper condivisi, esc, toast, etc.)
├── supabase/
│   └── functions/
│       └── sake-search/
│           └── index.ts (Edge Function proxy — già live)
└── SAKE-PLATFORM-PROJECT.md (questo file)
```

**Supabase Project**:
- Project ref: `znetpzffrsqyeaezelyl`
- Region: eu-central-1
- Edge Function: `sake-search` (live)
- URL: `https://znetpzffrsqyeaezelyl.supabase.co`

**Git**:
- Repo: `github.com/ferraboschi/sake-platform`
- Branch: `main`
- Deploy: GitHub Pages automatico su push
- Auth token: da `~/.config/gh/hosts.yml`
- Commit con: `-c user.name="ferraboschi" -c user.email="lorenzo@ef-ti.com"`

**Convenzioni**:
- Ogni fase viene committata separatamente con messaggio chiaro
- Ogni fase deve funzionare indipendentemente (il sito non si rompe mai)
- I dati vecchi in localStorage vengono migrati al DB dove possibile
- Le Edge Functions gestiscono la logica server-side (no secrets nel frontend)
