# Sake Platform — Piano di Progetto

## Decisioni Prese

- **Stack**: Supabase (DB + Auth + Storage + Edge Functions) + GitHub Pages (frontend statico)
- **Frontend**: Modulare, file separati HTML/CSS/JS, niente framework, niente build tools
- **Auth**: Email + password, sessione persistente 30 giorni, conferma email una tantum
- **Ruoli utente**: Produttore (sakagura) e Importatore
- **Spunta blu**: Opzionale, via verifica email dominio o documento manuale ("scrivici")
- **Monetizzazione**: Free per ora
- **Multilingua**: IT/EN/JA su tutto, selettore lingua con bandiere sempre a portata di mano
- **Campi custom**: I produttori possono aggiungere/rimuovere campi dai prodotti (JSONB)
- **Foto**: Drag & drop upload da parte dei produttori
- **Export**: Link pubblico, PDF (full + light), iframe embed
- **Knowledge base**: search_cache su Supabase, dati che crescono con l'uso
- **Dominio**: sakeplatform.com (GitHub Pages)
- **Repo**: github.com/ferraboschi/sake-platform
- **Supabase project**: znetpzffrsqyeaezelyl (eu-central-1)
- **Edge Function**: sake-search (live, SSE streaming, ricerca web reale)

---

## Flusso Utente Principale (4 step)

### Step 1 — Ricerca (STESSA PAGINA della home)
L'utente inserisce il nome della sakagura. NELLA STESSA PAGINA, sotto al campo di ricerca, la ricerca parte e mostra in tempo reale cosa sta succedendo: dove sta cercando, in quale sito, cosa trova. Deve impiegare il tempo necessario e mostrare che sta cercando e raccogliendo dati. La qualita dei risultati e prioritaria, non la velocita.

### Step 2 — Selezione (STESSA PAGINA)
Mostra le opzioni trovate con dati sufficienti per essere sicuri (nome JA/EN, prefettura, indirizzo, sito web, anno fondazione, numero prodotti). Chiede: "E una di queste la sakagura NOME che stavi cercando?" Con pulsante "Nessuna di queste" (narrowing down) e pulsante "CREA DA ZERO" (creazione manuale).

### Step 3 — Pagina Dettaglio Sakagura (NUOVA PAGINA, URL propria)
Se il cliente seleziona una sakagura, si apre una PAGINA DEDICATA con URL propria che include la prefettura (es. sakeplatform.com/#/brewery/yamagata/koikawa). File JS separato. Contiene:
- Dettagli completi: nome JA/EN, indirizzo, telefono, sito web verificato, anno fondazione
- Mappa con posizione
- Testo descrittivo con le fonti citate
- Selettore lingua con bandiere IT/EN/JA sempre visibile in alto
- Numero di prodotti collegati alla sakagura
- Pulsante "Claim questa sakagura" con spiegazione dei due metodi:
  1. Verifica email: usa email con stesso dominio del sito (verifica automatica)
  2. Contattaci: scrivi a verify@sakeplatform.com con documento

### Step 4 — Richiesta scheda tecnica (dopo il claim)
Dopo il claim si chiede di caricare la scheda tecnica attuale (PDF, Excel, foto). Il sistema la elabora e popola i campi prodotto.

---

## FASE 0 — Ristrutturazione Codice (COMPLETATA)

Codice modulare in /js/, /css/. 8 file separati.

---

## FASE 1 — Database + Ricerca Agente (PARZIALMENTE COMPLETATA)

Completato: tabelle Supabase, 76 sakagura pre-caricate, Edge Function SSE, frontend SSE consumer, narrowing down.
Da completare: piu dettagli nella ricerca, pagina risultato separata (FASE 1.5).

---

## FASE 1.5 — Pagina Dettaglio Sakagura (NUOVA)

Obiettivo: Creare la pagina dedicata per ogni sakagura con URL propria.

Cosa fare:
- Nuovo file js/brewery-page.js
- URL pattern: sakeplatform.com/#/brewery/{prefecture}/{slug}
- Header con nome JA/EN, logo/favicon, badge verificato
- Selettore lingua con bandiere IT/EN/JA sempre visibile in alto
- Info grid: prefettura, paese, indirizzo, telefono, sito web verificato, anno fondazione
- Mappa OpenStreetMap embedded
- Descrizione con fonti citate
- Numero prodotti collegati
- Pulsante "Claim questa sakagura" con spiegazione claim
- La pagina deve poter essere condivisa (URL stabile) e funzionare senza login

---

## FASE 2 — Autenticazione, Claim e Registrazione

Flusso claim aggiornato:
1. Dalla pagina dettaglio sakagura -> clicca "Claim questa sakagura"
2. Form registrazione con email dominio (auto) OPPURE "scrivici"
3. Nome, email, password
4. Se email ha dominio del sito -> spunta blu automatica
5. Se no -> account attivo senza spunta, messaggio "contattaci"

Pulsante "CREA DA ZERO" (nuovo):
- Dalla pagina risultati, se nessuna opzione corrisponde
- Schermata creazione manuale: nome, prefettura, paese, sito web, descrizione
- Dopo creazione -> stessa pagina dettaglio, stessa logica claim

Flusso importatore: invariato.

---

## FASE 2.5 — Upload Scheda Tecnica (NUOVA)

Subito dopo il claim, chiedere al produttore la scheda tecnica attuale.
- Drag & drop per PDF, Excel, Word, foto
- Claude estrae i dati automaticamente
- Propone di popolare i campi prodotto
- Il produttore conferma/modifica

---

## FASE 3 — Dashboard Produttore (invariata)
## FASE 4 — Dashboard Importatore (invariata)
## FASE 5 — Profilo Pubblico e Export (pagina pubblica gia in FASE 1.5, qui si aggiungono PDF e iframe)
## FASE 6 — Inviti e Team (invariata)

---

## Note Tecniche

Struttura file frontend:
- index.html (shell + router)
- css/style.css
- js/config.js, i18n.js, router.js, auth.js
- js/search.js (ricerca SSE, timeline live, narrowing down)
- js/brewery-page.js (NUOVO - pagina dettaglio sakagura)
- js/brewery.js, dashboard.js, export.js, utils.js
- supabase/functions/sake-search/index.ts (SSE, NO template literals)

Supabase: znetpzffrsqyeaezelyl, eu-central-1
Git: ferraboschi/sake-platform, main branch
Edge Function: ZERO backtick, solo concatenazione stringhe
Priorita: qualita risultati > velocita
