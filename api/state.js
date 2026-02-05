// Vercel Serverless Function: State Persistence for Moltbook Alpha Tracker
// Replaces the ngrok backend entirely - state persists across deployments via Vercel Blob

const BLOB_STORE_URL = process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : null;

// In-memory fallback + Edge Config / Blob storage
let cachedState = null;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, ngrok-skip-browser-warning, Accept');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // Try Vercel Blob first
      if (BLOB_STORE_URL) {
        try {
          const { list } = await import('@vercel/blob');
          const blobs = await list({ prefix: 'moltbook-state' });
          if (blobs.blobs.length > 0) {
            const latest = blobs.blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
            const resp = await fetch(latest.url);
            const data = await resp.json();
            cachedState = data;
            return res.status(200).json(data);
          }
        } catch (e) {
          console.log('Blob read failed, using cache:', e.message);
        }
      }
      
      // Fallback to memory cache
      if (cachedState) {
        return res.status(200).json(cachedState);
      }
      
      // No state found - return empty
      return res.status(200).json({
        coins: [],
        signals: {},
        experimentStart: new Date().toISOString(),
        avgReturnHistory: []
      });
    }

    if (req.method === 'POST') {
      const body = req.body;
      cachedState = body;

      // Try to persist to Vercel Blob
      if (BLOB_STORE_URL) {
        try {
          const { put } = await import('@vercel/blob');
          await put('moltbook-state/current.json', JSON.stringify(body), {
            access: 'public',
            addRandomSuffix: false
          });
        } catch (e) {
          console.log('Blob write failed:', e.message);
        }
      }

      return res.status(200).json({ ok: true, saved: true, timestamp: new Date().toISOString() });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('State API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
