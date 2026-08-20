import * as DocumentPicker from 'expo-document-picker';

import CaptionMedia from '../../modules/caption-media/src/CaptionMediaModule';
import { generateProjectThumbnail, storeProjectImage } from '@/services/project-media';
import { requireFreeSpace } from '@/services/storage-policy';

const MIN_IMPORT_HEADROOM_BYTES = 32 * 1024 * 1024;

export type LinkedVideo = {
  videoUri: string;
  thumbnailUri?: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  durationMs: number;
  width: number;
  height: number;
  rotation: number;
};

export async function pickLinkedVideo(projectId: string): Promise<LinkedVideo | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'video/*',
    copyToCacheDirectory: false,
    multiple: false,
  });
  if (result.canceled) return null;

  await requireFreeSpace(MIN_IMPORT_HEADROOM_BYTES, 'import a video');
  const asset = result.assets[0];
  try {
    await CaptionMedia.persistReadPermission(asset.uri);
  } catch {
    throw new Error('Android did not grant lasting access to this video. Select it from Files or Photos and try again.');
  }
  const info = await CaptionMedia.getMediaInfo(asset.uri);
  if (info.durationMs <= 0) throw new Error('The selected file is not a readable video.');

  return {
    videoUri: asset.uri,
    thumbnailUri: await generateProjectThumbnail(projectId, asset.uri),
    fileName: asset.name,
    mimeType: asset.mimeType,
    sizeBytes: asset.size,
    durationMs: info.durationMs,
    width: info.width,
    height: info.height,
    rotation: info.rotation,
  };
}

export async function pickAndStoreImage(projectId: string, imageId: string) {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'image/*',
    copyToCacheDirectory: false,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const uri = await storeProjectImage({
    projectId,
    imageId,
    sourceUri: asset.uri,
    fileName: asset.name,
  });
  return { uri, name: asset.name };
}
