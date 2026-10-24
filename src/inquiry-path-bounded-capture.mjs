// A byte-capped, network-free helper for response clones of public page GETs.
// The canonical inquiry probe separately applies the same byte limit to its
// response body. An oversized clone is discarded, never reclassified as clean.
export const INQUIRY_CAPTURE_MAX_BYTES = 2_000_000;

export async function readBoundedResponseClone(response) {
  const reader = response?.body?.getReader?.();
  if (!reader) return null;
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks).toString('utf8');
      total += value.byteLength;
      if (total > INQUIRY_CAPTURE_MAX_BYTES) {
        void reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
}
