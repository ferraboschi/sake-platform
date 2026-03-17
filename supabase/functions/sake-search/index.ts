// Sake Platform — Anthropic API Proxy
// Supabase Edge Function (Deno)
// Protects API key server-side, adds CORS + rate limiting

const ALLOWED_ORIGINS = [
  "https://sakeplatform.com",
  "https://www.sakeplatform.com",
  "http://localhost:3000", // dev
];

// Simple in-memory rate limiter (per IP, resets on cold start)
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;       // max requests
const RATE_WINDOW = 60_000;  // per 60 seconds

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

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const headers = corsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  // Only POST allowed
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // Check origin
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // Rate limit by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again in a minute." }), {
      status: 429,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // Get API key from Supabase secrets
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key not configured" }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { query } = body;

    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Invalid query" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const name = query.trim().substring(0, 100); // Cap at 100 chars

    // Build the same prompt used in the frontend
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

    // Call Anthropic API
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
        status: 502,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const data = await anthropicRes.json();
    const text = data.content?.[0]?.text || "";

    // Extract JSON array from response
    let results = [];
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

    return new Response(JSON.stringify({ results, count: results.length }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
