const MACHINE_NAME = /^(?:(?:vid|video|screenrecording|screen_recording|screen-recording)[-_ ]*)?[0-9][0-9_ .-]{3,}$/i;
const UUID_NAME = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const APP_GENERATED_NAME = /^(?:snapchat|pxl|mvimg|received|export|clip|movie)[-_ ]*[0-9][0-9_ .-]{5,}$/i;

export function humanVideoName(fileName: string | null | undefined, createdAt: string | number | Date) {
  const trimmed = fileName?.trim();
  const withoutExtension = trimmed?.replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  if (withoutExtension && !isMachineVideoName(withoutExtension)) {
    return withoutExtension.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'Untitled video';
  const datePart = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date);
  const timePart = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
  return `Video · ${datePart} · ${timePart}`;
}

export function isMachineVideoName(name: string) {
  const normalized = name.trim().replace(/\.[a-z0-9]{2,5}$/i, '');
  if (!normalized) return true;
  if (MACHINE_NAME.test(normalized) || UUID_NAME.test(normalized) || APP_GENERATED_NAME.test(normalized)) return true;
  const characters = normalized.replace(/[^a-z0-9]/gi, '');
  const digits = characters.replace(/\D/g, '').length;
  return characters.length >= 8 && digits / characters.length >= 0.7;
}
