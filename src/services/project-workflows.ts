import { createCaptionProject, createVideoClip } from '@/lib/project-factory';
import type { TranscriptionModel } from '@/lib/model-catalog';
import { humanVideoName } from '@/lib/project-presentation';
import { deleteProjectRecord, getProject, listProjects, saveProject } from '@/services/database';
import { pickLinkedVideos, type MediaImportProgress } from '@/services/media-import';
import { deleteProjectFiles, deleteProjectOwnedFiles, ensureProjectThumbnail } from '@/services/project-media';
import { generateProjectCaptions } from '@/services/project-transcription';
import type { TranscriptionProgress } from '@/services/transcription';
import type { CaptionProject } from '@/types/project';

export async function importVideoProject(
  onProgress?: (progress: MediaImportProgress) => void,
): Promise<CaptionProject | null> {
  const importedAt = Date.now();
  const projectId = `project-${importedAt}`;
  const sources = await pickLinkedVideos(projectId, onProgress);
  if (!sources) return null;
  const projectName = humanVideoName(sources[0].displayName, importedAt);
  const project = createCaptionProject({
    id: projectId,
    name: projectName,
    sources,
  });
  onProgress?.({ stage: 'saving', completed: sources.length, total: sources.length, detail: 'Saving your draft' });
  await saveProject(project);
  return project;
}

export async function loadProjectForEditing(projectId: string) {
  return getProject(projectId);
}

export async function checkpointEditorProject(project: CaptionProject) {
  await saveProject(project);
}

export async function appendVideosToProject(
  project: CaptionProject,
  onProgress?: (progress: MediaImportProgress) => void,
) {
  const sources = await pickLinkedVideos(project.id, onProgress);
  if (!sources) return null;
  const next: CaptionProject = {
    ...project,
    updatedAt: new Date().toISOString(),
    sources: [...project.sources, ...sources],
    clips: [
      ...project.clips,
      ...sources.map((source, index) => createVideoClip(source, project.clips.length + index)),
    ],
  };
  onProgress?.({ stage: 'saving', completed: sources.length, total: sources.length, detail: 'Adding videos to the timeline' });
  await saveProject(next);
  return next;
}

export async function generateAndSaveProjectCaptions(
  project: CaptionProject,
  modelId: TranscriptionModel['id'],
  onProgress?: (progress: TranscriptionProgress) => void,
) {
  const generated = await generateProjectCaptions(project, modelId, onProgress, saveProject);
  await saveProject(generated);
  return generated;
}

export async function saveEditorDraft(project: CaptionProject) {
  const referencedSourceIds = new Set(project.clips.map((clip) => clip.sourceId));
  const sources = project.sources.filter((source) => referencedSourceIds.has(source.id));
  const removedThumbnailUris = project.sources
    .filter((source) => !referencedSourceIds.has(source.id))
    .map((source) => source.thumbnailUri)
    .filter((uri): uri is string => Boolean(uri));
  const sourceResults = Object.fromEntries(
    Object.entries(project.transcription.sourceResults).filter(([sourceId]) => referencedSourceIds.has(sourceId)),
  );
  const saved: CaptionProject = {
    ...project,
    updatedAt: new Date().toISOString(),
    lifecycle: { status: 'saved' },
    sources,
    transcription: { ...project.transcription, sourceResults },
  };
  await saveProject(saved);
  await deleteProjectOwnedFiles(project.id, removedThumbnailUris);
  return saved;
}

export async function discardEditorSession(initialProject: CaptionProject, currentProject: CaptionProject) {
  if (initialProject.lifecycle.status === 'draft') {
    await deleteProjectCompletely(initialProject.id);
    return;
  }
  await saveProject(initialProject);
  const initialUris = projectOwnedUris(initialProject);
  const discardedUris = projectOwnedUris(currentProject).filter((uri) => !initialUris.includes(uri));
  await deleteProjectOwnedFiles(initialProject.id, discardedUris);
}

export async function deleteProjectCompletely(projectId: string) {
  await deleteProjectRecord(projectId);
  try {
    await deleteProjectFiles(projectId);
  } catch (error) {
    console.warn('Caption Studio could not remove every local project asset', error);
  }
}

function projectOwnedUris(project: CaptionProject) {
  return [
    ...project.sources.map((source) => source.thumbnailUri),
    ...project.layers.map((layer) => layer.kind === 'image' ? layer.uri : undefined),
  ].filter((uri): uri is string => Boolean(uri));
}

export async function loadProjectLibrary() {
  const storedProjects = await listProjects();
  const preparedProjects: CaptionProject[] = [];
  for (const stored of storedProjects) {
    const name = humanVideoName(stored.name, stored.createdAt);
    const sources = [];
    for (const source of stored.sources) {
      const thumbnailUri = await ensureProjectThumbnail({
        projectId: stored.id,
        sourceId: source.id,
        videoUri: source.uri,
        thumbnailUri: source.thumbnailUri,
      });
      sources.push({ ...source, thumbnailUri });
    }
    if (name === stored.name && sources.every((source, index) => source.thumbnailUri === stored.sources[index].thumbnailUri)) {
      preparedProjects.push(stored);
      continue;
    }
    const prepared: CaptionProject = {
      ...stored,
      name,
      sources,
    };
    await saveProject(prepared);
    preparedProjects.push(prepared);
  }
  return preparedProjects;
}
