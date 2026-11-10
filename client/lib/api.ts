export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.error?.message ??
        body?.error ??
        `Request failed (${response.status}). Please try again.`,
    );
  }
  return response.json() as Promise<T>;
}
