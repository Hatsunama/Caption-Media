export type CaptionTextChanges = Readonly<Record<string, string>>;

export function applyCaptionTextChanges<T extends { id: string; text: string }>(
  captions: T[],
  changes: CaptionTextChanges,
) {
  let changed = false;
  const next = captions.map((caption) => {
    if (!Object.prototype.hasOwnProperty.call(changes, caption.id)) return caption;
    const requested = changes[caption.id];
    if (typeof requested !== 'string') return caption;
    const text = requested.trim();
    if (!text || text === caption.text) return caption;
    changed = true;
    return { ...caption, text };
  });
  return changed ? next : captions;
}
