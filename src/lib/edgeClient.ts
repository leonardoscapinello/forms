const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export async function invokeEdge<T = any>(
  functionName: string,
  body: unknown,
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${PUBLISHABLE_KEY}`,
        ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
      },
      body: isFormData ? body : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.error || payload?.message || `Edge function failed (${response.status})`;
      return { data: payload, error: new Error(message) };
    }
    return { data: payload as T, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Network request failed') };
  }
}
