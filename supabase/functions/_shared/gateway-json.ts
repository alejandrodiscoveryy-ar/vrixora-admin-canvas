// Gateways accept JSON metadata, not uploaded files (those use Storage).
// Count the actual stream bytes: Content-Length can be absent or misleading.
const MAX_GATEWAY_BODY_BYTES = 64 * 1024;

export async function gatewayJson(request: Request) {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_GATEWAY_BODY_BYTES) {
          try { await reader.cancel(); } catch { /* Preserve the size error. */ }
          throw new Error("GATEWAY_REQUEST_TOO_LARGE");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
