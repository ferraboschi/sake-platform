// Sake Platform — Hybrid Search with Products (NEVER returns empty)
// DB → Cache → AI with progressive feedback

const ALLOWED_ORIGINS = [
  "https://sakeplatform.com",
  "https://www.sakeplatform.com",
  "http://localhost:3000",
];

const rateLimiter = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimiter.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function corsHeaders(origin: string) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function supabaseHeaders() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return { url, headers: { "apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json" } };
}

async function searchBreweriesDB(name: string): Promise<any[] | null> {
  const { url, headers } = supabaseHeaders();
  if (!url) return null;
  try {
    const t = encodeURIComponent(name.toLowerCase());
    const res = await fetch(url + "/rest/v1/breweries?or=(name_en.ilike.*" + t + "*,name_ja.ilike.*" + t + "*)&limit=20", { headers });
    if (!res.ok) return null;
    const rows = await res.json();
    if (rows.length > 0) return rows.map((r: any) => ({
      name_ja: r.name_ja || "", name_en: r.name_en || "", website: r.website || "",
      prefecture: r.prefecture || "", country: r.country || "", address: r.address || "",
      phone: r.phone || "", founded: r.founded || "", description: r.description_en || "",
      products_count: 0, products: [], exact_match: true
    }));
    return null;
  } catch (_e) { return null; }
}

async function getCachedResults(query: string): Promise<any[] | null> {
  const { url, headers } = supabaseHeaders();
  if (!url) return null;
  try {
    const res = await fetch(url + "/rest/v1/search_cache?query_normalized=eq." + encodeURIComponent(query) + "&expires_at=gt." + new Date().toISOString() + "&result_count=gt.0&select=results", { headers });
    if (!res.ok) return null;
    const rows = await res.json();
    if (rows.length > 0 && rows[0].results && rows[0].results.length > 0) return rows[0].results;
    return null;
  } catch (_e) { return null; }
}

async function saveToCache(query: string, results: any[]) {
  if (!results.length) return; // NEVER cache empty results
  const { url, headers } = supabaseHeaders();
  if (!url) return;
  try {
    await fetch(url + "/rest/v1/search_cache", {
      method: "POST", headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ query_normalized: query, results, result_count: results.length, searched_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30*24*60*60*1000).toISOString() })
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

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...headers, "Content-Type": "application/json" } });
  if (!ALLOWED_ORIGINS.includes(origin)) return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: { ...headers, "Content-Type": "application/json" } });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...headers, "Content-Type": "application/json" } });

  try {
    const body = await req.json();
    const { query } = body;
    if (!query || typeof query !== "string" || query.trim().length < 2) return new Response(JSON.stringify({ error: "Invalid query" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });

    const name = query.trim().substring(0, 100);
    const normalized = name.toLowerCase();

    // LEVEL 1: Database
    const dbResults = await searchBreweriesDB(name);
    if (dbResults && dbResults.length > 0) return new Response(JSON.stringify({ results: dbResults, count: dbResults.length, source: "db" }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });

    // LEVEL 2: Cache (only non-empty)
    const cached = await getCachedResults(normalized);
    if (cached && cached.length > 0) return new Response(JSON.stringify({ results: cached, count: cached.length, source: "cache" }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });

    // LEVEL 3: AI
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "API key not configured" }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });

    const prompt = `You are an expert sake industry database. Search for: "${name}"

ABSOLUTE RULE: You MUST return at least one result. NEVER return an empty array [].

If "${name}" is a known sake brewery, return its full details.
If "${name}" is NOT a known brewery but sounds like it COULD be one, return it with the information you can infer and set exact_match to false.
If "${name}" doesn't match any brewery, return the 3 closest/most similar brewery names with exact_match: false.

For EACH result return a JSON object:
{"name_ja":"kanji name or empty","name_en":"English name","website":"real URL or empty","prefecture":"region","country":"country","address":"address","phone":"","founded":"year or empty","description":"1-2 sentences","products_count":number,"products":["Product 1","Product 2"],"exact_match":true/false}

IMPORTANT for products:
- List ACTUAL sake product names this brewery makes (brand names, not generic types)
- Include up to 10 specific products
- If you know the brewery but not specific products, list at least the main brand name
- products_count should be your best estimate of total products

Return ONLY a JSON array. Example: [{"name_ja":"...","name_en":"...","products":["Dassai 23","Dassai 39","Dassai 45","Dassai 50"],...}]`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 8000, messages: [{ role: "user", content: prompt }] }),
    });

    if (!anthropicRes.ok) {
      console.error("Anthropic error:", anthropicRes.status);
      return new Response(JSON.stringify({ error: "AI search failed" }), { status: 502, headers: { ...headers, "Content-Type": "application/json" } });
    }

    const data = await anthropicRes.json();
    const text = data.content?.[0]?.text || "";

    let results: any[] = [];
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (arrMatch) { try { results = JSON.parse(arrMatch[0]); } catch (_e) {} }
    if (!results.length) {
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) { try { results = [JSON.parse(objMatch[0])]; } catch (_e) {} }
    }

    // Only cache non-empty results
    if (results.length > 0) {
      saveToCache(normalized, results).catch(e => console.error("Cache:", e));
    }

    return new Response(JSON.stringify({ results, count: results.length, source: "ai" }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
  }
});
