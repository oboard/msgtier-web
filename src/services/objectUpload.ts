/** Upload raw file bytes and retain actionable server errors for the chat UI. */
export async function uploadObject(
  file: Blob,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await fetcher('/api/object', { method: 'POST', body: file });
  if (!response.ok) {
    const text = await response.text();
    let detail = text;
    try {
      const error: unknown = JSON.parse(text);
      if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        detail = error.message;
      }
    } catch {
      // Framework/proxy errors such as HTTP 413 may be plain text, not JSON.
    }
    throw new Error(`HTTP ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ''}`);
  }

  const result: unknown = await response.json();
  if (!result || typeof result !== 'object' || !('id' in result) ||
      typeof result.id !== 'string' || !result.id.trim()) {
    throw new Error('Upload response did not contain a valid object ID');
  }
  return result.id;
}
