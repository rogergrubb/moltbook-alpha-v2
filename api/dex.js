// Vercel Serverless Function: DexScreener Proxy with caching
// Avoids CORS issues and provides server-side caching

const cache = new Map();
const CACHE_TTL = 60000; // 1 minute cache

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { endpoint, q } = req.query;
  
  const validEndpoints = {
    'search': `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q || '')}`,
    'profiles': 'https://api.dexscreener.com/token-profiles/latest/v1',
    'boosts': 'https://api.dexscreener.com/token-boosts/top/v1',
    'tokens': `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(q || '')}`
  };

  const url = validEndpoints[endpoint];
  if (!url) {
    return res.status(400).json({ error: 'Invalid endpoint. Use: search, profiles, boosts, tokens' });
  }

  const cacheKey = `${endpoint}:${q || ''}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cached.data);
  }

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      return res.status(response.status).json({ error: `DexScreener returned ${response.status}` });
    }
    
    const data = await response.json();
    cache.set(cacheKey, { data, time: Date.now() });
    
    // Clean old cache entries
    if (cache.size > 200) {
      const now = Date.now();
      for (const [key, val] of cache) {
        if (now - val.time > CACHE_TTL * 5) cache.delete(key);
      }
    }
    
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
