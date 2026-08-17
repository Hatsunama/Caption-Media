import * as FileSystem from 'expo-file-system/legacy';

const FALLBACK_EXTENSION = 'mp4';

export async function preserveImportedVideo(options: {
  projectId: string;
  sourceUri: string;
  fileName?: string | null;
}): Promise<string> {
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

  return destinationUri;
}

function getSafeExtension(fileName?: string | null) {
  const extension = fileName?.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
  return extension ?? FALLBACK_EXTENSION;
}
