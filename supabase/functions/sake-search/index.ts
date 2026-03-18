// Sake Platform — Anthropic API Proxy with Supabase Cache
// Supabase Edge Function (Deno)
// FASE 1: Cache results in search_cache table, save breweries to DB

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

// Supabase client helper (uses service role for DB writes)
function supabaseHeaders() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return { url, headers: { "apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json" } };
}

async function getCachedResults(query: string): Promise<any[] | null> {
  const { url, headers } = supabaseHeaders();
  if (!url) return null;
  try {
    const res = await fetch(
      url + "/rest/v1/search_cache?query_normalized=eq." + encodeURIComponent(query) + "&expires_at=gt." + new Date().toISOString() + "&select=results",
      { headers }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (rows.length > 0 && rows[0].results) return rows[0].results;
    return null;
  } catch (_e) { return null; }
}

async function saveToCache(query: string, results: any[]) {
  const { url, headers } = supabaseHeaders();
  if (!url) return;
  try {
    await fetch(url + "/rest/v1/search_cache", {
      method: "POST",
      headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({
        query_normalized: query,
        results: results,
        result_count: results.length,
        searched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
    });
    for (const r of results) {
      if (!r.name_en) continue;
      await fetch(url + "/rest/v1/breweries", {
        method: "POST",
        headers: { ...headers, "Prefer": "resolution=ignore-duplicates" },
        body: JSON.stringify({
          name_ja: r.name_ja || r.name_jp || "",
          name_en: r.name_en || "",
          website: r.website || "",
          prefecture: r.prefecture || "",
          country: r.country || "",
          address: r.address || "",
          phone: r.phone || "",
          founded: r.founded || "",
          description_en: r.description || "",
          source_data: r
        })
      });
    }
  } catch (_e) { /* non-critical */ }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403, headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429, headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { query } = body;
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Invalid query" }), {
        status: 400, headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const name = query.trim().substring(0, 100);
    const normalized = name.toLowerCase();

    // STEP 1: Check cache first
    const cached = await getCachedResults(normalized);
    if (cached && cached.length > 0) {
      return new Response(JSON.stringify({ results: cached, count: cached.length, cached: true }), {
        status: 200, headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // STEP 2: No cache hit — call Anthropic
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500, headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const prompt = `You are an expert sake industry database. I'm searching for "${name}".
CRITICAL: There may be MULTIPLE different breweries/producers with this name or very similar names.
For example, "otokoyama" has multiple distinct sakagura in different prefectures (Hokkaido, Yamagata, etc.).
"riso sake" could be an Italian producer AND "risosake" could be Japanese.
Your task: Find ALL distinct sake breweries or producers that match or closely match "${name}".
Search worldwide: Japan, Italy, USA, Europe, Asia, everywhere.
Also consider name variations: with/without spaces, different romanizations, different kanji.

For EACH brewery found, provide a JSON object with these fields:
- name_ja: Japanese name (kanji) if available, otherwise ""
- name_en: English/romanized name
- website: Official website URL (ONLY if you are confident it's correct)
- prefecture: Prefecture/region/state
- country: Country (e.g. "Japan", "Italy", "USA")
- founded: Year founded if known, otherwise ""
- phone: Phone if known, otherwise ""
- address: Address if known, otherwise ""
- description: Brief 1-2 sentence description
- products_count: Estimated number of sake products (number, or 0 if unknown)

Return a JSON array of ALL matching breweries. Example: [{...}, {...}, {...}]

CRITICAL RULES:
1. Return EVERY distinct brewery you know that matches "${name}" — not just one
2. Website URLs must be REAL existing domains. If you're not sure a URL is correct, set website to ""
3. Do NOT fabricate or guess website URLs — only include URLs you are confident exist
4. Distinguish each brewery clearly by location and website
5. Sort by relevance/prominence (most well-known first)
6. Include name variations: "${name}" with different spacing, "${name}酒造", "${name} sake" etc.`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic API error:", anthropicRes.status, errText);
      return new Response(JSON.stringify({ error: "AI search failed", status: anthropicRes.status }), {
        status: 502, headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const data = await anthropicRes.json();
    const text = data.content?.[0]?.text || "";

    let results: any[] = [];
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try { results = JSON.parse(arrMatch[0]); } catch (_e) { /* ignore */ }
    }
    if (!results.length) {
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try { results = [JSON.parse(objMatch[0])]; } catch (_e) { /* ignore */ }
      }
    }

    // STEP 3: Save to cache and breweries table (async, don't block response)
    saveToCache(normalized, results).catch(e => console.error("Cache save error:", e));

    return new Response(JSON.stringify({ results, count: results.length, cached: false }), {
      status: 200, headers: { ...headers, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
