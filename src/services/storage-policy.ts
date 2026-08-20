import * as FileSystem from 'expo-file-system/legacy';

export async function cleanupObsoletePickerCache() {
  if (!FileSystem.cacheDirectory) return;
  const directory = `${FileSystem.cacheDirectory}ImagePicker`;
  const info = await FileSystem.getInfoAsync(directory);
  if (info.exists) await FileSystem.deleteAsync(directory, { idempotent: true });
}

export async function requireFreeSpace(requiredBytes: number, action: string) {
  const available = await FileSystem.getFreeDiskStorageAsync();
  if (available >= requiredBytes) return;
  const missingMegabytes = Math.max(1, Math.ceil((requiredBytes - available) / (1024 * 1024)));
  throw new Error(`Not enough phone storage to ${action}. Free at least ${missingMegabytes} MB and try again.`);
}
