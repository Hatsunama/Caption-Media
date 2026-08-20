import { createCaptionProject } from '@/lib/project-factory';
import { humanVideoName } from '@/lib/project-presentation';
import { listProjects, saveProject } from '@/services/database';
import { pickLinkedVideo } from '@/services/media-import';
import { ensureProjectThumbnail } from '@/services/project-media';
import type { CaptionProject } from '@/types/project';

export async function importVideoProject(): Promise<CaptionProject | null> {
  const importedAt = Date.now();
  const projectId = `project-${importedAt}`;
  const linked = await pickLinkedVideo(projectId);
  if (!linked) return null;
  const projectName = humanVideoName(linked.fileName, importedAt);
  const project = createCaptionProject({
    id: projectId,
    name: projectName,
    source: {
      uri: linked.videoUri,
      storageMode: 'linked',
      thumbnailUri: linked.thumbnailUri,
      sizeBytes: linked.sizeBytes,
      mimeType: linked.mimeType,
      durationMs: linked.durationMs,
      width: linked.width,
      height: linked.height,
      rotation: linked.rotation,
    },
  });
  await saveProject(project);
  return project;
}

export async function loadProjectLibrary() {
  const storedProjects = await listProjects();
  const preparedProjects: CaptionProject[] = [];
  for (const stored of storedProjects) {
    const name = humanVideoName(stored.name, stored.createdAt);
    const thumbnailUri = await ensureProjectThumbnail({
      projectId: stored.id,
      videoUri: stored.source.uri,
      thumbnailUri: stored.source.thumbnailUri,
    });
    if (name === stored.name && thumbnailUri === stored.source.thumbnailUri) {
      preparedProjects.push(stored);
      continue;
    }
    const prepared: CaptionProject = {
      ...stored,
      name,
      source: { ...stored.source, displayName: name, thumbnailUri },
    };
    await saveProject(prepared);
    preparedProjects.push(prepared);
  }
  return preparedProjects;
}
