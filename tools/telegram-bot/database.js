const BASE = process.env.SUPABASE_URL || 'https://mfylkalarzuhivhmvzbm.supabase.co';
export async function database(path, method = 'GET', body, prefer = 'return=representation') {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error('El servicio de datos no está disponible. Inténtalo de nuevo en un momento.');
  const response = await fetch(`${BASE}/rest/v1/${path}`, {
    method, signal: AbortSignal.timeout(10_000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: prefer },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`No pude completar la comprobación de datos (${response.status}).`);
  const text = await response.text(); return text ? JSON.parse(text) : null;
}
