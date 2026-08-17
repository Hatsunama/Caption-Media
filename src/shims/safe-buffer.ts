/**
 * whisper.rn imports safe-buffer for its optional base64-audio API. Caption
 * Studio passes file URIs, but this small browser-native fallback keeps that
 * optional path functional without bringing Node's `buffer` module to Hermes.
 */
export const Buffer = {
  from(value: string, encoding?: string): Uint8Array {
    if (encoding !== 'base64') {
      return new TextEncoder().encode(value);
    }

    const decoded = globalThis.atob(value);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index);
    }
    return bytes;
  },
};
