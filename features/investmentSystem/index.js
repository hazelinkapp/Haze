// ============================================================
//  features/investmentSystem/index.js
//  Live prices · Buy · Sell · Portfolio · 2hr hold · 7% tax
// ============================================================

const { PriceCache, STOCK_LIST } = require("../../database/economy");
const logger = require("../../utils/logger");

const HOLD_MS  = 2 * 60 * 60 * 1000; // 2 hours
const TAX_PCT  = 7;

// ── Price fetching ────────────────────────────────────────────

async function fetchYahooPrice(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res  = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) throw new Error("No meta");
    const price  = meta.regularMarketPrice ?? meta.previousClose;
    const prev   = meta.previousClose ?? price;
    const change = price - prev;
    const pct    = prev > 0 ? (change / prev) * 100 : 0;
    return { price, change, changePct: pct };
  } catch (err) {
    logger.warn(`[Invest] Yahoo fetch failed for ${symbol}: ${err.message}`);
    return null;
  }
}

async function fetchCryptoPrice(symbol) {
  const idMap = { BTC: "bitcoin", DOGE: "dogecoin" };
  const id    = idMap[symbol];
  if (!id) return null;
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = await res.json();
    const item = data[id];
    return {
      price:     item.usd,
      change:    (item.usd * (item.usd_24h_change ?? 0)) / 100,
      changePct: item.usd_24h_change ?? 0,
    };
  } catch (err) {
    logger.warn(`[Invest] CoinGecko fetch failed for ${symbol}: ${err.message}`);
    return null;
  }
}

async function fetchMetalsPrice(symbol) {
  // Using exchangerate-api free tier for XAU/XAG
  try {
    const key = process.env.METALS_API_KEY ?? "";
    const cur  = symbol === "XAU" ? "XAU" : "XAG";
    const url  = `https://api.metalpriceapi.com/v1/latest?api_key=${key}&base=USD&currencies=${cur}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`Metals HTTP ${res.status}`);
    const data = await res.json();
    const rate = data?.rates?.[cur];
    if (!rate) throw new Error("No rate");
    // rate is how many XAU per 1 USD → invert for price per oz in USD
    const price = 1 / rate;
    return { price, change: 0, changePct: 0 };
  } catch {
    // Fallback hardcoded approximate values if API fails
    const fallback = { XAU: 2350, XAG: 28 };
    return { price: fallback[symbol] ?? 1, change: 0, changePct: 0 };
  }
}

// Simulated price movement for OQ and HZLK
const _simPrices = {};

function simulatedPrice(stock) {
  const prev = _simPrices[stock.symbol] ?? stock.basePrice;
  const move = (Math.random() * 2 - 1) * stock.volatility * prev;
  const price = Math.max(prev * 0.5, prev + move);
  _simPrices[stock.symbol] = price;
  const change    = price - prev;
  const changePct = (change / prev) * 100;
  return { price, change, changePct };
}

// ── Master price refresh (called every 60s) ───────────────────
async function refreshAllPrices() {
  for (const stock of STOCK_LIST) {
    let result = null;

    if (stock.simulated) {
      result = simulatedPrice(stock);
    } else if (stock.type === "crypto") {
      result = await fetchCryptoPrice(stock.symbol);
    } else if (stock.type === "commodity") {
      result = await fetchMetalsPrice(stock.symbol);
    } else {
      result = await fetchYahooPrice(stock.symbol);
    }

    if (result) {
      await PriceCache.findOneAndUpdate(
        { symbol: stock.symbol },
        { ...result, updatedAt: new Date() },
        { upsert: true, new: true }
      ).catch(() => null);
    }
  }
  logger.debug("[Invest] Prices refreshed.");
}

// ── Get all current prices ────────────────────────────────────
async function getAllPrices() {
  const cached = await PriceCache.find();
  const map    = {};
  cached.forEach(c => { map[c.symbol] = c; });

  return STOCK_LIST.map(s => {
    const c = map[s.symbol];
    return {
      symbol:    s.symbol,
      name:      s.name,
      type:      s.type,
      emoji:     s.emoji,
      price:     c?.price     ?? s.basePrice ?? 0,
      change:    c?.change    ?? 0,
      changePct: c?.changePct ?? 0,
      updatedAt: c?.updatedAt ?? null,
    };
  });
}

async function getPrice(symbol) {
  const prices = await getAllPrices();
  return prices.find(p => p.symbol === symbol) ?? null;
}

// ── Init (start price refresh loop) ──────────────────────────
function initInvestments() {
  refreshAllPrices(); // immediate first load
  setInterval(refreshAllPrices, 60_000); // refresh every 60s
  logger.info("[Invest] Investment system initialised. Prices refresh every 60s.");
}

module.exports = {
  initInvestments,
  getAllPrices,
  getPrice,
  refreshAllPrices,
  HOLD_MS,
  TAX_PCT,
  STOCK_LIST,
};
