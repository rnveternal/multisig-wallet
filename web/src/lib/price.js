// Uses CoinGecko's free public endpoint (api.coingecko.com/api/v3) — no API
// key required, but it IS rate-limited (roughly ~10-30 req/min shared across
// everyone on the free tier). Good enough for a personal/small-team dashboard,
// not for heavy traffic. If you hit rate limits, get a free demo API key at
// https://www.coingecko.com/en/api/pricing and add it via VITE_COINGECKO_KEY.

const BASE = "https://api.coingecko.com/api/v3";
const KEY = import.meta.env.VITE_COINGECKO_KEY || "";

function withKey(url) {
  if (!KEY) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}x_cg_demo_api_key=${KEY}`;
}

// range: "1" | "7" | "30" (days)
export async function fetchPriceChart(geckoId, days = "7") {
  const url = withKey(`${BASE}/coins/${geckoId}/market_chart?vs_currency=usd&days=${days}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko error ${res.status}`);
  const json = await res.json();
  // json.prices = [[timestampMs, price], ...]
  return json.prices || [];
}

export async function fetchSimplePrice(geckoIds) {
  const ids = [...new Set(geckoIds)].join(",");
  if (!ids) return {};
  const url = withKey(`${BASE}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko error ${res.status}`);
  return res.json(); // { ethereum: { usd: 3000, usd_24h_change: 1.2 }, ... }
}
