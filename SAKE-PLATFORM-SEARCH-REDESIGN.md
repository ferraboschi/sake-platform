# Sake Platform — Redesign della Ricerca

## Data: 18 Marzo 2026

## Problema Fondamentale

L'approccio attuale è SBAGLIATO. Stiamo usando Claude come un database — gli chiediamo "dimmi cosa sai" e lui risponde con dati inventati o incompleti. Non è quello che serve.

## Cosa Serve

Un **ricercatore** che va sul web, cerca nei siti reali, raccoglie dati reali, e mostra all'utente esattamente cosa sta facendo.

## Principi (dettati dall'utente)

1. **Non guardare la velocità** — il tempo di ricerca è un valore, non un difetto
2. **Non guardare i costi** — la qualità dei risultati è tutto
3. **Mostrare cosa succede** — l'utente deve vedere dove il sistema sta cercando, in quale sito è, cosa trova
4. **Mai risultati vuoti** — se non trova, chiede più informazioni per restringere la ricerca
5. **Pulsante "nessuna di queste"** — sempre visibile, porta a un flusso di narrowing down con domande extra
6. **Dati reali, non inventati** — i prodotti, i siti web, gli indirizzi devono venire da fonti verificabili

## Architettura Nuova: Agente Ricercatore Multi-Step

### Come funziona la ricerca

L'utente digita "koikawa". Il sistema:

**Step 1 — DB locale** (istantaneo)
- Cerca nel database Supabase (76+ sakagura pre-caricate)
- Se trova → mostra subito
- Se non trova → passa allo step 2
- UI: "Ricerca nel database Sake Platform... Non trovata"

**Step 2 — Ricerca web reale** (5-15 secondi)
Claude viene usato come AGENTE DI RICERCA, non come database. Il prompt è:
"Vai su questi siti e cerca 'koikawa':
1. japansake.or.jp — cerca nel registro JSS
2. sakenomy.jp — cerca nel database prodotti
3. sake-times.com — cerca negli articoli
4. Google — cerca 'koikawa 酒造 sake'
5. Wikipedia JA — cerca 'koikawa 酒造'
Riporta esattamente cosa hai trovato e da dove."

L'UI mostra IN TEMPO REALE:
- "Ricerca su japansake.or.jp..." → "Trovato: Koikawa Shuzo, Yamagata"
- "Ricerca su sakenomy.jp..." → "Trovati 8 prodotti"
- "Ricerca su sake-times.com..." → "Trovato articolo del 2023"
- "Verifica sito web koikawa.com..." → "✓ Sito verificato"

**Step 3 — Compilazione risultati**
I dati raccolti da FONTI REALI vengono aggregati e mostrati con le fonti citate.

**Step 4 — Se non trova nulla → Narrowing down**
"Non abbiamo trovato 'koikawa'. Aiutaci a cercare meglio:"
- Come si scrive in giapponese? [campo input]
- In quale prefettura si trova? [dropdown 47 prefetture]
- Ha un sito web? [campo input]
- [Cerca di nuovo] [Registra manualmente]

### Implementazione Tecnica

La Edge Function `sake-search` deve diventare un **orchestratore multi-step**:

1. Riceve la query
2. Cerca nel DB locale (Supabase)
3. Se non trova, usa Claude con tool_use per fare ricerche web reali
4. Usa l'API di Claude con tools: web_search, fetch_url per navigare i siti reali
5. Aggrega i risultati
6. Salva nel DB per la prossima volta
7. Restituisce al frontend con i dettagli di dove ha trovato cosa

OPPURE (alternativa più semplice ma efficace):
1. La Edge Function riceve la query
2. Fa fetch REALI dei siti JSS, Sakenomy, etc. direttamente da Deno
3. Parsa le risposte HTML per estrarre i dati
4. USA Claude SOLO per interpretare/arricchire i dati trovati
5. Restituisce al frontend con le fonti

### Fonti Web da Consultare (in ordine di priorità)

1. **japansake.or.jp/sakagura/en/?s=QUERY** — registro ufficiale JSS (1.400+ sakagura)
2. **sakenomy.jp** — database prodotti sake (1.300+ sakagura, prodotti con dettagli)
3. **sake-times.com** — articoli e profili sakagura
4. **sakebreweries.com** — database con profili e flavor profiles
5. **Google search: "QUERY 酒造 sake"** — per trovare il sito ufficiale
6. **Wikipedia JA: "QUERY酒造"** — per storia e anno di fondazione
7. **Wikipedia EN: "QUERY sake brewery"** — versione inglese
8. **Nominatim/OpenStreetMap** — per posizione geografica e indirizzo

### UX Frontend: Streaming di Messaggi

Il frontend deve mostrare una timeline LIVE che si aggiorna man mano:

```
⟳ Ricerca nel database Sake Platform...
  Consulto il database con 76 sakagura registrate...

✓ Database consultato
  Nessun risultato diretto per "koikawa"

⟳ Ricerca su japansake.or.jp...
  Consulto il registro Japan Sake Brewers Association...

✓ japansake.or.jp
  Trovata: Koikawa Shuzo (鯉川酒造) — Yamagata Prefecture

⟳ Ricerca su sakenomy.jp...
  Cerco prodotti nel catalogo...

✓ sakenomy.jp
  Trovati 12 prodotti per Koikawa Shuzo

⟳ Verifica sito web...
  Controllo koikawa.com...

✓ Sito verificato: koikawa.com

⟳ Raccolta informazioni aggiuntive...
  Wikipedia, geolocalizzazione...

✓ Ricerca completata
  1 sakagura trovata · 12 prodotti · sito verificato
```

Ogni riga appare una alla volta. L'utente vede esattamente cosa sta succedendo.

### Come Ottenere lo Streaming

Due approcci possibili:

**A) Server-Sent Events (SSE)**: La Edge Function usa SSE per mandare aggiornamenti progressivi al frontend. Ogni step manda un evento. Pro: vero streaming. Contro: più complesso.

**B) Polling con frontend simulato**: La Edge Function fa tutto il lavoro e restituisce alla fine, ma il frontend mostra messaggi progressivi basati sul tempo trascorso. Pro: semplice. Contro: i messaggi non riflettono il lavoro reale.

**C) Multi-fetch**: Il frontend fa più fetch sequenziali — prima al DB, poi al proxy JSS, poi al proxy Sakenomy, etc. Ogni fetch è uno step reale. Pro: ogni step è vero. Contro: richiede endpoint separati.

**Raccomandazione**: Approccio A (SSE) è il migliore per l'esperienza utente. L'Edge Function apre uno stream e manda eventi man mano che fa le ricerche. Il frontend li riceve e aggiorna la timeline in tempo reale.

## Stato Attuale

- **Completato**: FASE 0 (codice modulare), FASE 1 parziale (DB + cache + 76 sakagura seeded)
- **Da rifare**: La ricerca (core del prodotto)
- **Da fare**: Tutto il resto (FASI 2-6)

## Infrastruttura Attiva

- Frontend: sakeplatform.com (GitHub Pages, codice modulare in /js/, /css/)
- Backend: Supabase Edge Function `sake-search` (znetpzffrsqyeaezelyl)
- Database: Supabase PostgreSQL con tabelle breweries, products, search_cache, users, importer_links, files
- DB ha 76 sakagura pre-caricate (le principali)
- Git: github.com/ferraboschi/sake-platform, branch main
- Auth token git: da ~/.config/gh/hosts.yml
- Supabase secrets: ANTHROPIC_API_KEY configurata
- JWT verification: disattivata sulla Edge Function

## File del Progetto

```
/tmp/sake-platform/
├── index.html (178 righe — shell)
├── css/style.css (517 righe)
├── js/config.js (13 righe)
├── js/i18n.js (~280 righe — IT/EN/JA)
├── js/utils.js (65 righe)
├── js/search.js (~250 righe — DA RIFARE)
├── js/brewery.js (128 righe)
├── js/dashboard.js (96 righe)
├── supabase/functions/sake-search/index.ts (~186 righe — DA RIFARE)
├── SAKE-PLATFORM-PROJECT.md (piano fasi)
└── SAKE-PLATFORM-SEARCH-REDESIGN.md (questo file)
```
