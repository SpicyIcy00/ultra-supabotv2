/**
 * WHAT THE SERVER SAID, for a `fetch` that did not come back ok (W4.5).
 *
 * `services/pinsApi.ts errorMessage` does this for axios; the older screens
 * use `authenticatedFetch`, and every one of them threw a sentence of its own
 * instead — "Failed to fetch stores", "Failed to save". A person reading that
 * learns nothing they can act on, and the reason the route refused (a role
 * without the page, a store that is already gone, a column the import has not
 * filled) never reaches them.
 *
 * So: FastAPI's `detail` where there is one, its own words where `detail` is
 * a structure, and the status line where the body says nothing at all. Never
 * a wording invented here.
 */
export async function serverSaid(response: Response): Promise<string> {
  const status = `${response.status} ${response.statusText}`.trim();
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    try {
      const text = (await response.clone().text()).trim();
      return text || status;
    } catch {
      return status;
    }
  }
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (detail && typeof detail === 'object' && 'message' in detail) {
      return String((detail as { message: unknown }).message);
    }
    if (detail !== undefined && detail !== null) return JSON.stringify(detail);
  }
  if (typeof body === 'string' && body.trim()) return body;
  return status;
}
