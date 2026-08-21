import { groupTimelineWordsByClip } from '@/lib/caption-grouping';
import { anchorCaptionsToClips, mapSourceWordsToTimeline } from '@/lib/video-timeline';
import { transcribeVideoLocally, type TranscriptionProgress } from '@/services/transcription';
import type { CaptionProject, SourceTranscription, WordToken } from '@/types/project';

export async function generateProjectCaptions(
  project: CaptionProject,
  onProgress?: (progress: TranscriptionProgress) => void,
  onCheckpoint?: (project: CaptionProject) => Promise<void>,
) {
  const sourceIds = [...new Set(project.clips.map((clip) => clip.sourceId))];
  const sourceById = new Map(project.sources.map((source) => [source.id, source]));
  const sourceResults: Record<string, SourceTranscription> = { ...project.transcription.sourceResults };

  for (let index = 0; index < sourceIds.length; index += 1) {
    const sourceId = sourceIds[index];
    const source = sourceById.get(sourceId);
    if (!source) throw new Error('A timeline clip has lost its source video.');
    if (sourceResults[sourceId]?.modelId === 'fast') continue;
    const result = await transcribeVideoLocally({
      projectId: `${project.id}-${sourceId}`,
      videoUri: source.uri,
      modelId: 'fast',
      durationMs: source.durationMs,
      language: 'en',
      onProgress: (progress) => onProgress?.({
        ...progress,
        detail: sourceIds.length > 1
          ? `Video ${index + 1} of ${sourceIds.length} · ${progress.detail}`
          : progress.detail,
      }),
    });
    sourceResults[sourceId] = {
      language: result.language,
      modelId: 'fast',
      generatedAt: new Date().toISOString(),
      words: result.words,
    };
    if (onCheckpoint) {
      await onCheckpoint({
        ...project,
        updatedAt: new Date().toISOString(),
        transcription: { ...project.transcription, sourceResults: { ...sourceResults } },
      });
    }
  }

  const sourceWords: Record<string, WordToken[]> = {};
  for (const [sourceId, result] of Object.entries(sourceResults)) sourceWords[sourceId] = result.words;
  const words = mapSourceWordsToTimeline(project.clips, sourceWords);
  const grouped = groupTimelineWordsByClip(words, project.clips.map((clip) => clip.id));
  const captions = anchorCaptionsToClips(grouped, project.clips, words);
  const now = new Date().toISOString();
  return {
    ...project,
    updatedAt: now,
    transcription: {
      language: sourceResults[sourceIds[0]]?.language ?? 'en',
      modelId: 'fast',
      generatedAt: now,
      words,
      sourceResults,
    },
    captions,
  } satisfies CaptionProject;
}
