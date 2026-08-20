import * as FileSystem from 'expo-file-system/legacy';

import CaptionMedia from '../../modules/caption-media/src/CaptionMediaModule';

const FALLBACK_EXTENSION = 'mp4';

export async function preserveImportedVideo(options: {
  projectId: string;
  sourceUri: string;
  fileName?: string | null;
}): Promise<{ videoUri: string; thumbnailUri?: string }> {
  if (!FileSystem.documentDirectory) {
    throw new Error('Permanent app storage is unavailable on this device.');
  }

  const projectDirectory = `${FileSystem.documentDirectory}projects/${options.projectId}/`;
  const extension = getSafeExtension(options.fileName);
  const destinationUri = `${projectDirectory}source.${extension}`;

  await FileSystem.makeDirectoryAsync(projectDirectory, { intermediates: true });
  await FileSystem.copyAsync({ from: options.sourceUri, to: destinationUri });

  const copied = await FileSystem.getInfoAsync(destinationUri);
  if (!copied.exists || copied.isDirectory || copied.size <= 0) {
    throw new Error('The selected video could not be copied into project storage.');
  }

  return {
    videoUri: destinationUri,
    thumbnailUri: await generateProjectThumbnail(options.projectId, destinationUri),
  };
}

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

async function generateProjectThumbnail(projectId: string, videoUri: string) {
  if (!FileSystem.documentDirectory) return undefined;
  const outputUri = `${FileSystem.documentDirectory}projects/${projectId}/first-frame.jpg`;
  try {
    await CaptionMedia.generateVideoThumbnail(videoUri, outputUri, 0);
    const generated = await FileSystem.getInfoAsync(outputUri);
    return generated.exists && !generated.isDirectory ? outputUri : undefined;
  } catch {
    // A missing thumbnail must never prevent the user from opening their video.
    return undefined;
  }
}

function getSafeExtension(fileName?: string | null) {
  const extension = fileName?.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
  return extension ?? FALLBACK_EXTENSION;
}
