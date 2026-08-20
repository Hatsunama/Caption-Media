import * as FileSystem from 'expo-file-system/legacy';

import CaptionMedia from '../../modules/caption-media/src/CaptionMediaModule';

export async function ensureProjectThumbnail(options: {
  projectId: string;
  videoUri: string;
  thumbnailUri?: string;
}): Promise<string | undefined> {
  if (options.thumbnailUri) {
    const existing = await FileSystem.getInfoAsync(options.thumbnailUri);
    if (existing.exists && !existing.isDirectory) return options.thumbnailUri;
  }
  return generateProjectThumbnail(options.projectId, options.videoUri);
}

export async function generateProjectThumbnail(projectId: string, videoUri: string) {
  if (!FileSystem.documentDirectory) return undefined;
  const outputUri = `${FileSystem.documentDirectory}projects/${projectId}/first-frame.jpg`;
  try {
    await CaptionMedia.generateVideoThumbnail(videoUri, outputUri, 0);
    const generated = await FileSystem.getInfoAsync(outputUri);
    return generated.exists && !generated.isDirectory ? outputUri : undefined;
  } catch {
    return undefined;
  }
}

export async function validateProjectSource(videoUri: string) {
  const info = await CaptionMedia.getMediaInfo(videoUri);
  if (info.durationMs <= 0) throw new Error('The source is not a readable video.');
}

export async function storeProjectImage(options: {
  projectId: string;
  imageId: string;
  sourceUri: string;
  fileName: string;
}) {
  if (!FileSystem.documentDirectory) throw new Error('Permanent app storage is unavailable on this device.');
  const extension = options.fileName.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase() ?? 'jpg';
  const directory = `${FileSystem.documentDirectory}projects/${options.projectId}/overlays/`;
  const destinationUri = `${directory}${options.imageId}.${extension}`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  await FileSystem.copyAsync({ from: options.sourceUri, to: destinationUri });
  const stored = await FileSystem.getInfoAsync(destinationUri);
  if (!stored.exists || stored.isDirectory || stored.size <= 0) {
    throw new Error('The selected image could not be saved in this project.');
  }
  return destinationUri;
}
