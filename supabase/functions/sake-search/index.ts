// Sake Platform — Research Agent with SSE Streaming
// Searches REAL web sources and streams progress to frontend

const ALLOWED_ORIGINS = [
  "https://sakeplatform.com",
  "https://www.sakeplatform.com",
  "http://localhost:3000",
];

function corsHeaders(origin: string) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function sbH() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return { url, headers: { "apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json" } };
}

// ---- RESEARCH SOURCES ----

async function searchLocalDB(name: string): Promise<any[]> {
  const { url, headers } = sbH();
  if (!url) return [];
  try {
    const t = encodeURIComponent(name.toLowerCase());
    const res = await fetch(url + "/rest/v1/breweries?or=(name_en.ilike.*" + t + "*,name_ja.ilike.*" + t + "*)&limit=10", { headers });
    if (!res.ok) return [];
    return await res.json();
  } catch (_e) { return []; }
}

async function searchWikipediaJA(query: string): Promise<{found: boolean, data: any}> {
  try {
    const terms = [query + "酒造", query + " 酒造", query + " sake"];
    for (const term of terms) {
      const encoded = encodeURIComponent(term);
      const sr = await fetch(`https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&format=json&origin=*&srlimit=5`);
      if (!sr.ok) continue;
      const sd = await sr.json();
      const results = sd.query?.search || [];
      const article = results.find((r: any) =>
        r.snippet.includes("酒") || r.snippet.includes("醸造") || r.snippet.includes("蔵") || r.snippet.includes(query)
      ) || results[0];
      if (!article) continue;

      const er = await fetch(`https://ja.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(article.title)}&prop=extracts&exintro=1&explaintext=1&format=json&origin=*`);
      if (!er.ok) continue;
      const ed = await er.json();
      const page = Object.values(ed.query?.pages || {})[0] as any;
      if (!page || page.missing !== undefined) continue;

      let extract = (page.extract || "").substring(0, 500);
      const foundedMatch = extract.match(/(\d{4})年.*?(創業|設立|開業)/) || extract.match(/(創業|設立|開業).*?(\d{4})年/);

      return { found: true, data: { title: article.title, extract, founded: foundedMatch ? (foundedMatch[1].match(/\d{4}/)?.[0] || foundedMatch[2]) : "", source: "ja.wikipedia.org" }};
    }
  } catch (_e) {}
  return { found: false, data: null };
}

async function searchWikipediaEN(query: string): Promise<{found: boolean, data: any}> {
  try {
    const terms = [query + " sake brewery", query + " sake", query + " shuzo"];
    for (const term of terms) {
      const sr = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&format=json&origin=*&srlimit=5`);
      if (!sr.ok) continue;
      const sd = await sr.json();
      const results = sd.query?.search || [];
      const article = results.find((r: any) =>
        r.snippet.toLowerCase().includes("sake") || r.snippet.toLowerCase().includes("brew") || r.snippet.toLowerCase().includes("distill")
      ) || results[0];
      if (!article) continue;

      const er = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(article.title)}&prop=extracts&exintro=1&explaintext=1&format=json&origin=*`);
      if (!er.ok) continue;
      const ed = await er.json();
      const page = Object.values(ed.query?.pages || {})[0] as any;
      if (!page || page.missing !== undefined) continue;

      let extract = (page.extract || "").substring(0, 500);
      return { found: true, data: { title: article.title, extract, source: "en.wikipedia.org" }};
    }
  } catch (_e) {}
  return { found: false, data: null };
}

async function searchJSS(query: string): Promise<{found: boolean, data: any[]}> {
  try {
    const res = await fetch(`https://japansake.or.jp/sakagura/en/?s=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "SakePlatform/2.0" }
    });
    if (!res.ok) return { found: false, data: [] };
    const html = await res.text();
    const matches = [...html.matchAll(/<h3 class="serif">([^<]+)<\/h3>/g)];
    const links = [...html.matchAll(/<a href="(https:\/\/japansake\.or\.jp\/sakagura\/en\/[^"]+)">/g)];
    if (matches.length > 0) {
      const breweries = matches.map((m, i) => ({
        name: m[1].trim(),
        url: links[i + 10]?.[1] || "", // skip navigation links
        source: "japansake.or.jp"
      })).filter(b => b.name.toLowerCase().includes(query.toLowerCase()) || query.toLowerCase().includes(b.name.toLowerCase().split(" ")[0]));
      return { found: breweries.length > 0, data: breweries };
    }
  } catch (_e) {}
  return { found: false, data: [] };
}

async function searchNominatim(query: string): Promise<{found: boolean, data: any}> {
  try {
    const q = query + " sake brewery";
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=3&accept-language=en`, {
      headers: { "User-Agent": "SakePlatform/2.0" }
    });
    if (!res.ok) return { found: false, data: null };
    const results = await res.json();
    if (results.length > 0) {
      const r = results[0];
      const addr = r.address || {};
      return { found: true, data: { lat: +r.lat, lng: +r.lon, address: r.display_name, prefecture: addr.province || addr.state || "", country: addr.country || "", source: "openstreetmap.org" }};
    }
  } catch (_e) {}
  return { found: false, data: null };
}

async function enrichWithClaude(query: string, webData: any): Promise<any[]> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return [];

  const context = JSON.stringify(webData, null, 2);
  const prompt = `I searched the web for the sake brewery "${query}" and found this data from real sources:

${context}

Based on this real data, compile a structured result. If the web data clearly identifies a brewery, use that information. If not, use your knowledge to identify the brewery and list its real products.

RULES:
- Only use REAL information — do not invent products, websites, or details
- If you recognize this brewery, add any additional facts you know
- List REAL sake products this brewery makes (actual brand names)
- If you cannot identify the brewery with confidence, set exact_match to false and suggest the closest known breweries

Return a JSON array:
[{"name_ja":"","name_en":"","website":"","prefecture":"","country":"","address":"","phone":"","founded":"","description":"","products_count":0,"products":[],"exact_match":true,"sources":[]}]`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch (_e) {} }
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) { try { return [JSON.parse(objMatch[0])]; } catch (_e) {} }
  } catch (_e) {}
  return [];
}

async function saveResults(query: string, results: any[]) {
  if (!results.length) return;
  const { url, headers } = sbH();
  if (!url) return;
  try {
    await fetch(url + "/rest/v1/search_cache", {
      method: "POST", headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ query_normalized: query.toLowerCase(), results, result_count: results.length, searched_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30*24*60*60*1000).toISOString() })
    });
    for (const r of results) {
      if (!r.name_en) continue;
      await fetch(url + "/rest/v1/breweries", {
        method: "POST", headers: { ...headers, "Prefer": "resolution=ignore-duplicates" },
        body: JSON.stringify({ name_ja: r.name_ja||"", name_en: r.name_en||"", website: r.website||"", prefecture: r.prefecture||"", country: r.country||"", address: r.address||"", phone: r.phone||"", founded: r.founded||"", description_en: r.description||"", source_data: r })
      });
    }
  } catch (_e) {}
}

// ---- MAIN HANDLER WITH SSE ----

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
  if (!ALLOWED_ORIGINS.includes(origin)) return new Response("Origin not allowed", { status: 403, headers: cors });

  try {
    const body = await req.json();
    const { query } = body;
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Invalid query" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const name = query.trim().substring(0, 100);

    // SSE Stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function send(event: string, data: any) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        }

        const webData: any = { query: name };

        // STEP 1: Local DB
        send("step", { id: "db", status: "searching", label: "Database Sake Platform", detail: "Ricerca nel database locale..." });
        const dbResults = await searchLocalDB(name);
        if (dbResults.length > 0) {
          send("step", { id: "db", status: "found", label: "Database Sake Platform", detail: `Trovate ${dbResults.length} sakagura nel database`, count: dbResults.length });
          const results = dbResults.map(r => ({ name_ja: r.name_ja||"", name_en: r.name_en||"", website: r.website||"", prefecture: r.prefecture||"", country: r.country||"", address: r.address||"", phone: r.phone||"", founded: r.founded||"", description: r.description_en||"", products_count: 0, products: [], exact_match: true, sources: ["database"] }));
          send("results", { results, source: "db" });
          send("done", {});
          controller.close();
          return;
        }
        send("step", { id: "db", status: "empty", label: "Database Sake Platform", detail: "Non trovata nel database locale" });

        // STEP 2: Wikipedia JA
        send("step", { id: "wiki_ja", status: "searching", label: "Wikipedia 日本語", detail: `Ricerca "${name}酒造" su Wikipedia giapponese...` });
        const wikiJA = await searchWikipediaJA(name);
        if (wikiJA.found) {
          send("step", { id: "wiki_ja", status: "found", label: "Wikipedia 日本語", detail: `Trovato: ${wikiJA.data.title}` });
          webData.wikipedia_ja = wikiJA.data;
        } else {
          send("step", { id: "wiki_ja", status: "empty", label: "Wikipedia 日本語", detail: "Nessun risultato diretto" });
        }

        // STEP 3: Wikipedia EN
        send("step", { id: "wiki_en", status: "searching", label: "Wikipedia English", detail: `Searching "${name} sake brewery"...` });
        const wikiEN = await searchWikipediaEN(name);
        if (wikiEN.found) {
          send("step", { id: "wiki_en", status: "found", label: "Wikipedia English", detail: `Found: ${wikiEN.data.title}` });
          webData.wikipedia_en = wikiEN.data;
        } else {
          send("step", { id: "wiki_en", status: "empty", label: "Wikipedia English", detail: "No direct results" });
        }

        // STEP 4: JSS Registry
        send("step", { id: "jss", status: "searching", label: "japansake.or.jp", detail: "Consulto il registro Japan Sake Brewers Association..." });
        const jss = await searchJSS(name);
        if (jss.found) {
          send("step", { id: "jss", status: "found", label: "japansake.or.jp", detail: `Trovate ${jss.data.length} sakagura nel registro JSS` });
          webData.jss = jss.data;
        } else {
          send("step", { id: "jss", status: "empty", label: "japansake.or.jp", detail: "Non trovata nel registro JSS" });
        }

        // STEP 5: Geolocation
        send("step", { id: "geo", status: "searching", label: "OpenStreetMap", detail: "Ricerca posizione geografica..." });
        const geo = await searchNominatim(name);
        if (geo.found) {
          send("step", { id: "geo", status: "found", label: "OpenStreetMap", detail: `Posizione: ${geo.data.prefecture}, ${geo.data.country}` });
          webData.geo = geo.data;
        } else {
          send("step", { id: "geo", status: "empty", label: "OpenStreetMap", detail: "Posizione non trovata" });
        }

        // STEP 6: Claude enrichment
        send("step", { id: "ai", status: "searching", label: "Analisi AI", detail: "Analisi e arricchimento dati raccolti..." });
        const results = await enrichWithClaude(name, webData);

        // Add sources to results
        for (const r of results) {
          r.sources = [];
          if (webData.wikipedia_ja) r.sources.push("ja.wikipedia.org");
          if (webData.wikipedia_en) r.sources.push("en.wikipedia.org");
          if (webData.jss) r.sources.push("japansake.or.jp");
          if (webData.geo) r.sources.push("openstreetmap.org");
        }

        if (results.length > 0) {
          const totalProducts = results.reduce((s: number, r: any) => s + (r.products?.length || 0), 0);
          send("step", { id: "ai", status: "found", label: "Analisi AI", detail: `${results.length} sakagura identificate, ${totalProducts} prodotti trovati` });

          // Save for next time
          saveResults(name, results).catch(() => {});
        } else {
          send("step", { id: "ai", status: "empty", label: "Analisi AI", detail: "Nessun risultato conclusivo" });
        }

        send("results", { results, source: "research" });
        send("done", {});
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        ...cors,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
