import { useEffect, useMemo, useRef, useState } from 'react';
import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { AnimationBrowser } from '@/components/editor/animation-browser';
import { CaptionOverlay } from '@/components/editor/caption-overlay';
import { FontBrowser } from '@/components/editor/font-browser';
import { ImageLayerOverlay } from '@/components/editor/image-layer-overlay';
import { LayerTimeline } from '@/components/editor/layer-timeline';
import { ScopeSheet } from '@/components/editor/scope-sheet';
import { VideoTools } from '@/components/editor/video-tools';
import { VideoTransformOverlay } from '@/components/editor/video-transform-overlay';
import { findAnimationPreset } from '@/lib/animation-presets';
import { fontChoicePatch, type FontChoice } from '@/lib/font-catalog';
import { applyStylePatch, mergeStyle, resolveCaptionStyle, type StyleScope } from '@/lib/style-resolver';
import {
  buildClipTimeline,
  rippleDelete,
  rippleTimedContent,
  timelineEntryAt,
  totalClipDuration,
} from '@/lib/video-timeline';
import { getProject, saveProject } from '@/services/database';
import { pickAndStoreImage } from '@/services/media-import';
import { validateProjectSource } from '@/services/project-media';
import {
  transcribeVideoLocally,
  type TranscriptionProgress,
} from '@/services/transcription';
import {
  DEFAULT_CAPTION_STYLE,
  type CaptionAnimationId,
  type CaptionProject,
  type CaptionStylePatch,
  type ImageVisualLayer,
  type TextVisualLayer,
  type VideoClip,
} from '@/types/project';

const palette = {
  background: '#090B0E',
  surface: '#151A20',
  surfaceRaised: '#20262E',
  text: '#F7F8FA',
  muted: '#939EAB',
  accent: '#DFFF35',
  purple: '#A985F8',
};

type PendingStyleChange = {
  label: string;
  patch: CaptionStylePatch;
};

type EditorTool = 'captions' | 'fonts' | 'animate' | 'video';

export default function EditorScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const [initialProject, setInitialProject] = useState<CaptionProject>();
  const [loadError, setLoadError] = useState<string>();

  useEffect(() => {
    let active = true;
    void getProject(projectId)
      .then((stored) => {
        if (!active) return;
        if (!stored) throw new Error('This project no longer exists on this device.');
        setInitialProject(stored);
      })
      .catch((caught) => {
        if (active) setLoadError(caught instanceof Error ? caught.message : 'The project could not be opened.');
      });
    return () => { active = false; };
  }, [projectId]);

  if (loadError) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: palette.background }}><Text selectable style={{ color: '#FFBBC8', textAlign: 'center' }}>{loadError}</Text></View>;
  }
  if (!initialProject) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background }}><ActivityIndicator color={palette.accent} /></View>;
  }
  return <EditorWorkspace key={initialProject.id} initialProject={initialProject} />;
}

function EditorWorkspace({ initialProject }: { initialProject: CaptionProject }) {
  const { height, width } = useWindowDimensions();
  const [project, setProject] = useState(initialProject);
  const projectRef = useRef(project);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);
  const [selectedCaptionId, setSelectedCaptionId] = useState<string>();
  const [selectedLayerId, setSelectedLayerId] = useState('captions');
  const [selectedClipId, setSelectedClipId] = useState<string>();
  const [currentMs, setCurrentMs] = useState(0);
  const [progress, setProgress] = useState<TranscriptionProgress>();
  const [error, setError] = useState<string>();
  const [fontBrowserOpen, setFontBrowserOpen] = useState(false);
  const [pendingChange, setPendingChange] = useState<PendingStyleChange>();
  const [editingText, setEditingText] = useState<string>();
  const [editingCaptionId, setEditingCaptionId] = useState<string>();
  const [editingLayerId, setEditingLayerId] = useState<string>();
  const [activeTool, setActiveTool] = useState<EditorTool>('captions');
  const [animationScope, setAnimationScope] = useState<StyleScope>('all');
  const undoStackRef = useRef<CaptionProject[]>([]);
  const redoStackRef = useRef<CaptionProject[]>([]);
  const interactionStartRef = useRef<CaptionProject | undefined>(undefined);
  const [historyVersion, setHistoryVersion] = useState(0);

  const persistProject = async (next: CaptionProject) => {
    try {
      await saveProject(next);
    } catch (caught) {
      setError(caught instanceof Error ? `Project could not be saved: ${caught.message}` : 'Project could not be saved.');
    }
  };

  const player = useVideoPlayer(initialProject.source.uri, (instance) => {
    instance.timeUpdateEventInterval = 0.05;
  });

  const clipTimeline = useMemo(() => buildClipTimeline(project.clips), [project.clips]);
  const timelineDurationMs = clipTimeline.at(-1)?.endMs ?? project.source.durationMs;
  const clipTimelineRef = useRef(clipTimeline);
  const activeClipIdRef = useRef(project.clips[0]?.id);
  useEffect(() => {
    clipTimelineRef.current = clipTimeline;
    if (!clipTimeline.some((entry) => entry.clip.id === activeClipIdRef.current)) {
      activeClipIdRef.current = clipTimeline[0]?.clip.id;
    }
  }, [clipTimeline]);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    const sourceMs = currentTime * 1000;
    const entries = clipTimelineRef.current;
    let index = entries.findIndex((entry) => entry.clip.id === activeClipIdRef.current);
    if (index < 0) index = entries.findIndex((entry) => sourceMs >= entry.clip.sourceStartMs && sourceMs < entry.clip.sourceEndMs);
    const entry = entries[Math.max(0, index)];
    if (!entry) {
      setCurrentMs(sourceMs);
      return;
    }
    if (player.playing && sourceMs >= entry.clip.sourceEndMs - 18) {
      const next = entries[index + 1];
      if (next) {
        activeClipIdRef.current = next.clip.id;
        player.currentTime = next.clip.sourceStartMs / 1000;
        setCurrentMs(next.startMs);
      } else {
        player.pause();
        setCurrentMs(entry.endMs);
      }
      return;
    }
    setCurrentMs(clamp(entry.startMs + sourceMs - entry.clip.sourceStartMs, entry.startMs, entry.endMs));
  });

  const seekTimeline = (timelineMs: number) => {
    const entry = timelineEntryAt(clipTimelineRef.current, timelineMs);
    if (!entry) return;
    activeClipIdRef.current = entry.clip.id;
    const sourceMs = entry.clip.sourceStartMs + clamp(timelineMs - entry.startMs, 0, entry.endMs - entry.startMs);
    player.currentTime = sourceMs / 1000;
    setCurrentMs(clamp(timelineMs, 0, timelineDurationMs));
  };

  useEffect(() => {
    let active = true;
    void validateProjectSource(initialProject.source.uri).catch((caught) => {
      if (!active) return;
      setError(
        caught instanceof Error
          ? `The source video is unavailable: ${caught.message}`
          : 'The source video is unavailable. Reconnect or reselect the original file.',
      );
    });
    return () => { active = false; };
  }, [initialProject.source.uri]);

  const activeCaption = useMemo(
    () => project.captions.find((caption) => currentMs >= caption.startMs && currentMs < caption.endMs),
    [currentMs, project.captions],
  );
  const selectedCaption = project.captions.find((caption) => caption.id === selectedCaptionId);
  const selectedLayer = project.layers.find((layer) => layer.id === selectedLayerId);
  const selectedTextLayer = selectedLayer?.kind === 'text' ? selectedLayer : undefined;
  const selectedImageLayer = selectedLayer?.kind === 'image' ? selectedLayer : undefined;
  const selectedAnimationId = selectedTextLayer
    ? selectedTextLayer.style.animation.id
    : selectedCaption
      ? resolveCaptionStyle(project.projectStyle, selectedCaption).animation.id
      : project.projectStyle.animation.id;
  const displayCaption = player.playing ? activeCaption : selectedCaption ?? activeCaption;
  const previewHeight = Math.min(Math.max(280, height * 0.43), 500);
  const canvasSize = fitRect(
    Math.max(1, project.canvas.aspectWidth / project.canvas.aspectHeight),
    width - 24,
    previewHeight - 8,
  );

  const pushUndo = (snapshot = projectRef.current) => {
    const stack = undoStackRef.current;
    if (stack.at(-1) !== snapshot) stack.push(snapshot);
    if (stack.length > 50) stack.shift();
    redoStackRef.current = [];
    setHistoryVersion((value) => value + 1);
  };

  const beginHistoryInteraction = () => {
    interactionStartRef.current ??= projectRef.current;
  };

  const finishHistoryInteraction = () => {
    const snapshot = interactionStartRef.current;
    interactionStartRef.current = undefined;
    if (snapshot && snapshot !== projectRef.current) pushUndo(snapshot);
    persistProject(projectRef.current);
  };

  const undo = () => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push(projectRef.current);
    interactionStartRef.current = undefined;
    projectRef.current = previous;
    setProject(previous);
    setSelectedCaptionId((id) => previous.captions.some((caption) => caption.id === id) ? id : previous.captions[0]?.id);
    setSelectedLayerId((id) => previous.layers.some((layer) => layer.id === id) ? id : 'captions');
    setHistoryVersion((value) => value + 1);
    persistProject(previous);
  };

  const redo = () => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(projectRef.current);
    interactionStartRef.current = undefined;
    projectRef.current = next;
    setProject(next);
    setSelectedCaptionId((id) => next.captions.some((caption) => caption.id === id) ? id : next.captions[0]?.id);
    setSelectedLayerId((id) => next.layers.some((layer) => layer.id === id) ? id : 'captions');
    setHistoryVersion((value) => value + 1);
    persistProject(next);
  };

  const generateCaptions = async () => {
    setError(undefined);
    try {
      const result = await transcribeVideoLocally({
        projectId: project.id,
        videoUri: project.source.uri,
        modelId: 'fast',
        durationMs: project.source.durationMs,
        language: 'en',
        onProgress: setProgress,
      });
      const now = new Date().toISOString();
      const next: CaptionProject = {
        ...project,
        updatedAt: now,
        transcription: {
          language: result.language,
          modelId: 'fast',
          generatedAt: now,
          words: result.words,
        },
        captions: result.captions,
      };
      pushUndo();
      setProject(next);
      setSelectedCaptionId(next.captions[0]?.id);
      await persistProject(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Caption generation failed');
    } finally {
      setProgress(undefined);
    }
  };

  const confirmRegenerateCaptions = () => {
    Alert.alert(
      'Generate captions again?',
      'This replaces the current caption text and timing. Your caption style and extra text or image layers stay unchanged.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate again',
          onPress: () => {
            void generateCaptions();
          },
        },
      ],
    );
  };

  const chooseStyleScope = async (scope: StyleScope) => {
    if (!pendingChange) return;
    pushUndo();
    const next = applyStylePatch(
      projectRef.current,
      selectedCaptionId ?? '',
      scope,
      pendingChange.patch,
    );
    projectRef.current = next;
    setProject(next);
    setPendingChange(undefined);
    await persistProject(next);
  };

  const chooseFont = (choice: FontChoice) => {
    setFontBrowserOpen(false);
    if (selectedTextLayer) {
      updateTextLayerStyle(selectedTextLayer.id, fontChoicePatch(choice), true);
      return;
    }
    setPendingChange({
      label: `Font: ${choice.name}`,
      patch: fontChoicePatch(choice),
    });
  };

  const chooseAnimation = (id: CaptionAnimationId) => {
    const preset = findAnimationPreset(id);
    if (selectedTextLayer) {
      updateTextLayerStyle(selectedTextLayer.id, {
        animation: { id, intensity: preset.intensity, durationMs: preset.durationMs },
      }, true);
      return;
    }
    const scope = animationScope === 'caption' && selectedCaptionId ? 'caption' : 'all';
    pushUndo();
    setProject((current) => {
      const next = applyStylePatch(current, selectedCaptionId ?? '', scope, {
        animation: { id, intensity: preset.intensity, durationMs: preset.durationMs },
      });
      projectRef.current = next;
      persistProject(next);
      return next;
    });
  };

  const beginEditCaption = () => {
    if (!selectedCaption) return;
    setEditingCaptionId(selectedCaption.id);
    setEditingText(selectedCaption.text);
  };

  const commitCaptionText = async () => {
    if (editingText == null) return;
    pushUndo();
    if (editingLayerId) {
      const next: CaptionProject = {
        ...projectRef.current,
        updatedAt: new Date().toISOString(),
        layers: projectRef.current.layers.map((layer) =>
          layer.id === editingLayerId && layer.kind === 'text'
            ? { ...layer, text: editingText.trim() || 'Text', name: (editingText.trim() || 'Text').slice(0, 18) }
            : layer,
        ),
      };
      projectRef.current = next;
      setProject(next);
      setEditingLayerId(undefined);
      setEditingText(undefined);
      await persistProject(next);
      return;
    }
    if (!editingCaptionId) return;
    const next: CaptionProject = {
      ...projectRef.current,
      updatedAt: new Date().toISOString(),
      captions: projectRef.current.captions.map((caption) =>
        caption.id === editingCaptionId ? { ...caption, text: editingText.trim() } : caption,
      ),
    };
    projectRef.current = next;
    setProject(next);
    setEditingCaptionId(undefined);
    setEditingText(undefined);
    await persistProject(next);
  };

  const updateTextLayerStyle = (layerId: string, patch: CaptionStylePatch, persist = false) => {
    if (persist) pushUndo();
    setProject((current) => {
      const next = {
        ...current,
        updatedAt: new Date().toISOString(),
        layers: current.layers.map((layer) =>
          layer.id === layerId && layer.kind === 'text'
            ? { ...layer, style: mergeStyle(layer.style, patch) }
            : layer,
        ),
      };
      projectRef.current = next;
      if (persist) persistProject(next);
      return next;
    });
  };

  const updateSharedCaptionTransform = (patch: CaptionStylePatch) => {
    if (!selectedCaptionId) return;
    setProject((current) => {
      const next = applyStylePatch(current, selectedCaptionId, 'all', patch);
      projectRef.current = next;
      return next;
    });
  };

  const updateVideoTransform = (patch: Partial<CaptionProject['videoTransform']>) => {
    setProject((current) => {
      const next = {
        ...current,
        updatedAt: new Date().toISOString(),
        videoTransform: { ...current.videoTransform, ...patch },
      };
      projectRef.current = next;
      return next;
    });
  };

  const updateCaptionTiming = (captionId: string, startMs: number, endMs: number) => {
    setProject((current) => {
      const next = {
        ...current,
        updatedAt: new Date().toISOString(),
        captions: current.captions.map((caption) =>
          caption.id === captionId ? { ...caption, startMs, endMs } : caption,
        ),
      };
      projectRef.current = next;
      return next;
    });
  };

  const updateLayerTiming = (layerId: string, startMs: number, endMs: number) => {
    setProject((current) => {
      const next = {
        ...current,
        updatedAt: new Date().toISOString(),
        layers: current.layers.map((layer) =>
          layer.id === layerId && layer.kind !== 'captions' ? { ...layer, startMs, endMs } : layer,
        ),
      };
      projectRef.current = next;
      return next;
    });
  };

  const updateImageLayer = (layerId: string, patch: Partial<ImageVisualLayer>) => {
    setProject((current) => {
      const next = {
        ...current,
        updatedAt: new Date().toISOString(),
        layers: current.layers.map((layer) =>
          layer.id === layerId && layer.kind === 'image' ? { ...layer, ...patch } : layer,
        ),
      };
      projectRef.current = next;
      return next;
    });
  };

  const addTextLayer = () => {
    pushUndo();
    const id = uniqueId('text');
    const duration = Math.max(500, timelineDurationMs);
    const startMs = clamp(currentMs, 0, Math.max(0, duration - 500));
    const layer: TextVisualLayer = {
      id,
      kind: 'text',
      name: 'New Text',
      visible: true,
      text: 'New text',
      startMs,
      endMs: Math.min(duration, startMs + 3000),
      style: mergeStyle(DEFAULT_CAPTION_STYLE, {
        position: { x: 0.5, y: 0.48 },
        box: { width: 0.72, height: 0.18 },
        animation: { id: 'none' },
      }),
    };
    setProject((current) => {
      const firstImage = current.layers.findIndex((item) => item.kind === 'image');
      const index = firstImage < 0 ? current.layers.length : firstImage;
      const layers = [...current.layers];
      layers.splice(index, 0, layer);
      const next = { ...current, updatedAt: new Date().toISOString(), layers };
      projectRef.current = next;
      persistProject(next);
      return next;
    });
    player.pause();
    setSelectedLayerId(id);
    setSelectedCaptionId(undefined);
    setEditingLayerId(id);
    setEditingText(layer.text);
  };

  const addImageLayer = async () => {
    const id = uniqueId('image');
    let stored;
    try {
      stored = await pickAndStoreImage(projectRef.current.id, id);
    } catch (caught) {
      Alert.alert('Could not add image', caught instanceof Error ? caught.message : 'The selected image could not be saved.');
      return;
    }
    if (!stored) return;
    pushUndo();
    const duration = Math.max(500, timelineDurationMs);
    const startMs = clamp(currentMs, 0, Math.max(0, duration - 500));
    const layer: ImageVisualLayer = {
      id,
      kind: 'image',
      name: stored.name.slice(0, 18) || 'Sticker',
      visible: true,
      uri: stored.uri,
      startMs,
      endMs: Math.min(duration, startMs + 3000),
      position: { x: 0.5, y: 0.5 },
      box: { width: 0.34, height: 0.24 },
      rotation: 0,
      opacity: 1,
    };
    setProject((current) => {
      const next = { ...current, updatedAt: new Date().toISOString(), layers: [...current.layers, layer] };
      projectRef.current = next;
      persistProject(next);
      return next;
    });
    player.pause();
    setSelectedLayerId(id);
    setSelectedCaptionId(undefined);
  };

  const moveLayer = (layerId: string, direction: -1 | 1) => {
    pushUndo();
    setProject((current) => {
      const index = current.layers.findIndex((layer) => layer.id === layerId);
      const destination = index + direction;
      if (index < 0 || destination < 0 || destination >= current.layers.length) return current;
      const layers = [...current.layers];
      [layers[index], layers[destination]] = [layers[destination], layers[index]];
      const next = { ...current, updatedAt: new Date().toISOString(), layers };
      projectRef.current = next;
      persistProject(next);
      return next;
    });
  };

  const deleteLayer = (layerId: string) => {
    if (layerId === 'captions') return;
    pushUndo();
    setProject((current) => {
      const next = { ...current, updatedAt: new Date().toISOString(), layers: current.layers.filter((layer) => layer.id !== layerId) };
      projectRef.current = next;
      persistProject(next);
      return next;
    });
    setSelectedLayerId('captions');
  };

  const splitClipAtPlayhead = () => {
    const entry = timelineEntryAt(clipTimeline, currentMs);
    if (!entry) return;
    const sourceSplitMs = entry.clip.sourceStartMs + currentMs - entry.startMs;
    if (sourceSplitMs - entry.clip.sourceStartMs < 120 || entry.clip.sourceEndMs - sourceSplitMs < 120) return;
    pushUndo();
    const left: VideoClip = { ...entry.clip, id: uniqueId('clip'), sourceEndMs: sourceSplitMs };
    const right: VideoClip = { ...entry.clip, id: uniqueId('clip'), sourceStartMs: sourceSplitMs };
    setProject((current) => {
      const index = current.clips.findIndex((clip) => clip.id === entry.clip.id);
      const clips = [...current.clips];
      clips.splice(index, 1, left, right);
      const next = { ...current, updatedAt: new Date().toISOString(), clips };
      projectRef.current = next;
      persistProject(next);
      return next;
    });
    activeClipIdRef.current = right.id;
    setSelectedClipId(right.id);
  };

  const deleteSelectedClip = () => {
    if (!selectedClipId || projectRef.current.clips.length <= 1) return;
    const entry = buildClipTimeline(projectRef.current.clips).find((item) => item.clip.id === selectedClipId);
    if (!entry) return;
    pushUndo();
    const next = rippleDelete(projectRef.current, entry.startMs, entry.endMs, selectedClipId);
    projectRef.current = next;
    setProject(next);
    setSelectedClipId(next.clips[0]?.id);
    activeClipIdRef.current = next.clips[0]?.id;
    persistProject(next);
    queueMicrotask(() => seekTimeline(Math.min(entry.startMs, Math.max(0, totalClipDuration(next.clips) - 1))));
  };

  const trimClipEdge = (clipId: string, edge: 'start' | 'end', amountMs: number) => {
    if (amountMs < 1) return;
    const current = projectRef.current;
    const entry = buildClipTimeline(current.clips).find((item) => item.clip.id === clipId);
    if (!entry) return;
    pushUndo();
    const safeAmount = clamp(amountMs, 0, Math.max(0, entry.endMs - entry.startMs - 120));
    const cutStartMs = edge === 'start' ? entry.startMs : entry.endMs - safeAmount;
    const cutEndMs = edge === 'start' ? entry.startMs + safeAmount : entry.endMs;
    const rippled = rippleTimedContent(current, cutStartMs, cutEndMs);
    const next: CaptionProject = {
      ...rippled,
      updatedAt: new Date().toISOString(),
      clips: current.clips.map((clip) =>
        clip.id === clipId
          ? edge === 'start'
            ? { ...clip, sourceStartMs: clip.sourceStartMs + safeAmount }
            : { ...clip, sourceEndMs: clip.sourceEndMs - safeAmount }
          : clip,
      ),
    };
    projectRef.current = next;
    setProject(next);
    persistProject(next);
    player.pause();
    queueMicrotask(() => seekTimeline(Math.min(cutStartMs, Math.max(0, totalClipDuration(next.clips) - 1))));
  };

  const deleteCaption = (captionId: string) => {
    const current = projectRef.current;
    const index = current.captions.findIndex((caption) => caption.id === captionId);
    if (index < 0) return;
    pushUndo();
    const captions = current.captions.filter((caption) => caption.id !== captionId);
    const next = {
      ...current,
      updatedAt: new Date().toISOString(),
      captions,
    };
    projectRef.current = next;
    setProject(next);
    setSelectedCaptionId(captions[Math.min(index, captions.length - 1)]?.id);
    persistProject(next);
  };

  const confirmDeleteCaption = (captionId: string) => {
    Alert.alert('Delete this subtitle?', 'Only this caption block will be removed. The source video is unchanged.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCaption(captionId) },
    ]);
  };

  const setCanvasPreset = async (preset: CaptionProject['canvas']['preset']) => {
    pushUndo();
    const size = canvasPresetSize(preset, projectRef.current);
    const next = {
      ...projectRef.current,
      updatedAt: new Date().toISOString(),
      canvas: {
        ...projectRef.current.canvas,
        preset,
        aspectWidth: size.width,
        aspectHeight: size.height,
      },
    };
    projectRef.current = next;
    setProject(next);
    await persistProject(next);
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ height: previewHeight, alignItems: 'center', justifyContent: 'center', paddingTop: 8 }}>
        <View
          style={{
            width: canvasSize.width,
            height: canvasSize.height,
            overflow: 'hidden',
            borderRadius: 20,
            backgroundColor: project.canvas.backgroundColor,
          }}>
          <View
            style={{
              position: 'absolute',
              inset: 0,
              transform: [
                { translateX: (project.videoTransform.position.x - 0.5) * canvasSize.width },
                { translateY: (project.videoTransform.position.y - 0.5) * canvasSize.height },
                { scale: project.videoTransform.scale },
                { rotate: `${project.videoTransform.rotation}deg` },
              ],
            }}>
            <VideoView
              style={{ flex: 1 }}
              player={player}
              nativeControls={false}
              contentFit={project.videoTransform.fit === 'fill' ? 'cover' : 'contain'}
              surfaceType="textureView"
            />
            {project.source.thumbnailUri && !player.playing && currentMs <= 50 ? (
              <Image
                pointerEvents="none"
                source={{ uri: project.source.thumbnailUri }}
                contentFit={project.videoTransform.fit === 'fill' ? 'cover' : 'contain'}
                style={{ position: 'absolute', inset: 0 }}
              />
            ) : null}
          </View>
          {activeTool === 'video' ? (
            <VideoTransformOverlay
              transform={project.videoTransform}
              onInteractionStart={beginHistoryInteraction}
              onChange={updateVideoTransform}
              onEnd={finishHistoryInteraction}
            />
          ) : null}
          {[...project.layers].reverse().map((layer) => {
            if (!layer.visible) return null;
            if (layer.kind === 'captions') {
              return (
                <CaptionOverlay
                  key={layer.id}
                  caption={displayCaption}
                  words={project.transcription.words}
                  projectStyle={project.projectStyle}
                  currentMs={currentMs}
                  interactive={activeTool !== 'video' && selectedLayerId === 'captions' && Boolean(selectedCaptionId) && displayCaption?.id === selectedCaptionId}
                  onInteractionStart={() => { player.pause(); beginHistoryInteraction(); }}
                  onTransform={updateSharedCaptionTransform}
                  onTransformEnd={finishHistoryInteraction}
                  onDelete={selectedCaptionId ? () => confirmDeleteCaption(selectedCaptionId) : undefined}
                />
              );
            }
            const visibleNow = currentMs >= layer.startMs && currentMs < layer.endMs;
            if (player.playing && !visibleNow) return null;
            if (!player.playing && !visibleNow && selectedLayerId !== layer.id) return null;
            if (layer.kind === 'text') {
              return (
                <CaptionOverlay
                  key={layer.id}
                  caption={{ id: layer.id, text: layer.text, startMs: layer.startMs, endMs: layer.endMs, wordIds: [] }}
                  words={[]}
                  projectStyle={layer.style}
                  currentMs={currentMs}
                  interactive={activeTool !== 'video' && selectedLayerId === layer.id}
                  onInteractionStart={() => { player.pause(); beginHistoryInteraction(); }}
                  onTransform={(patch) => updateTextLayerStyle(layer.id, patch)}
                  onTransformEnd={finishHistoryInteraction}
                  onDelete={() => deleteLayer(layer.id)}
                />
              );
            }
            return (
              <ImageLayerOverlay
                key={layer.id}
                layer={layer}
                interactive={activeTool !== 'video' && selectedLayerId === layer.id}
                onInteractionStart={() => { player.pause(); beginHistoryInteraction(); }}
                onChange={(patch) => updateImageLayer(layer.id, patch)}
                onEnd={finishHistoryInteraction}
                onDelete={() => deleteLayer(layer.id)}
              />
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={player.playing ? 'Pause video' : 'Play video'}
            onPress={() => {
              if (player.playing) {
                player.pause();
              } else {
                setSelectedCaptionId(undefined);
                player.play();
              }
            }}
            style={{
              position: 'absolute',
              right: 12,
              bottom: 12,
              width: 48,
              height: 48,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 24,
              backgroundColor: 'rgba(7,9,12,0.76)',
            }}>
            <Text style={{ color: '#FFF', fontSize: 20 }}>{player.playing ? 'Ⅱ' : '▶'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flex: 1, gap: 12, paddingHorizontal: 12, paddingTop: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
          <HistoryButton label="↶  Undo" disabled={undoStackRef.current.length === 0} version={historyVersion} onPress={undo} />
          <HistoryButton label="Redo  ↷" disabled={redoStackRef.current.length === 0} version={historyVersion} onPress={redo} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: palette.text, fontSize: 16, fontWeight: '700' }}>
              {project.name}
            </Text>
            <Text style={{ color: palette.muted, fontSize: 12 }}>
              {formatTime(currentMs)} / {formatTime(timelineDurationMs)}
            </Text>
          </View>
          {project.captions.length === 0 ? (
            <Pressable
              onPress={generateCaptions}
              style={{ paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999, backgroundColor: palette.accent }}>
              <Text style={{ color: '#10130A', fontWeight: '800' }}>Generate captions</Text>
            </Pressable>
          ) : (
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={{ color: palette.accent, fontSize: 12, fontWeight: '700' }}>
                {project.captions.length} CAPTIONS
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Generate captions again"
                onPress={confirmRegenerateCaptions}
                hitSlop={10}>
                <Text style={{ color: palette.text, fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' }}>
                  Generate again
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        <LayerTimeline
          durationMs={timelineDurationMs}
          clips={project.clips}
          layers={project.layers}
          captions={project.captions}
          selectedLayerId={selectedLayerId}
          selectedCaptionId={selectedCaptionId}
          selectedClipId={selectedClipId}
          currentMs={currentMs}
          onSeek={seekTimeline}
          onSelectLayer={(layerId) => {
            player.pause();
            setSelectedLayerId(layerId);
            if (layerId !== 'captions') setSelectedCaptionId(undefined);
          }}
          onSelectCaption={(caption) => {
            player.pause();
            setSelectedLayerId('captions');
            setSelectedCaptionId(caption.id);
            seekTimeline(caption.startMs);
          }}
          onSelectClip={(clipId, startMs) => {
            player.pause();
            setSelectedClipId(clipId);
            seekTimeline(startMs);
          }}
          onTrimClip={trimClipEdge}
          onLayerTimingChange={updateLayerTiming}
          onCaptionTimingChange={updateCaptionTiming}
          onTimingChangeStart={beginHistoryInteraction}
          onTimingChangeEnd={finishHistoryInteraction}
          onMoveLayer={moveLayer}
          onDeleteLayer={deleteLayer}
        />

        {activeTool === 'video' ? (
          <View style={{ gap: 8 }}>
            <VideoTools
              project={project}
              onCanvasPreset={setCanvasPreset}
              onFit={(fit) => {
                beginHistoryInteraction();
                updateVideoTransform({ fit });
                queueMicrotask(finishHistoryInteraction);
              }}
              onScale={(scale) => { beginHistoryInteraction(); updateVideoTransform({ scale }); }}
              onRotation={(rotation) => { beginHistoryInteraction(); updateVideoTransform({ rotation }); }}
              onReset={() => {
                beginHistoryInteraction();
                updateVideoTransform({ fit: 'fit', position: { x: 0.5, y: 0.5 }, scale: 1, rotation: 0 });
                queueMicrotask(finishHistoryInteraction);
              }}
              onTransformEnd={finishHistoryInteraction}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Action label="Split video at playhead" onPress={splitClipAtPlayhead} />
              <Action label="Delete selected clip + ripple" danger onPress={deleteSelectedClip} />
              <Action label="Add text layer" onPress={addTextLayer} />
              <Action label="Add sticker/image" onPress={() => void addImageLayer()} />
            </ScrollView>
          </View>
        ) : activeTool === 'animate' ? (
          <AnimationBrowser
            selected={selectedAnimationId}
            textLayerSelected={Boolean(selectedTextLayer)}
            scope={animationScope}
            hasSelectedCaption={Boolean(selectedCaptionId)}
            onScopeChange={setAnimationScope}
            onSelect={chooseAnimation}
          />
        ) : selectedTextLayer ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Action label="Edit text" onPress={() => { setEditingLayerId(selectedTextLayer.id); setEditingText(selectedTextLayer.text); }} />
            <Action label="Delete text layer" danger onPress={() => deleteLayer(selectedTextLayer.id)} />
            <Action label="Add text layer" onPress={addTextLayer} />
            <Action label="Add sticker/image" onPress={() => void addImageLayer()} />
          </ScrollView>
        ) : selectedImageLayer ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Action label="Delete sticker" danger onPress={() => deleteLayer(selectedImageLayer.id)} />
            <Action label="Add text layer" onPress={addTextLayer} />
            <Action label="Add sticker/image" onPress={() => void addImageLayer()} />
          </ScrollView>
        ) : selectedCaption ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Action label="Edit text" onPress={beginEditCaption} />
            <Action label="Delete subtitle" danger onPress={() => confirmDeleteCaption(selectedCaption.id)} />
            <Action label="Add text layer" onPress={addTextLayer} />
            <Action label="Add sticker/image" onPress={() => void addImageLayer()} />
            <Action
              label="White"
              color="#FFFFFF"
              onPress={() => setPendingChange({ label: 'Text color: white', patch: { textColor: '#FFFFFF' } })}
            />
            <Action
              label="Lime"
              color="#DFFF35"
              onPress={() => setPendingChange({ label: 'Text color: lime', patch: { textColor: '#DFFF35' } })}
            />
            <Action
              label="Active word"
              color="#FFC247"
              onPress={() => setPendingChange({ label: 'Active-word color: amber', patch: { activeWordColor: '#FFC247' } })}
            />
            <Action
              label="Uppercase"
              onPress={() => setPendingChange({ label: 'Uppercase captions', patch: { textTransform: 'uppercase' } })}
            />
            <Action
              label="Reset all caption boxes"
              onPress={() => {
                beginHistoryInteraction();
                updateSharedCaptionTransform({ position: { x: 0.5, y: 0.78 }, box: { width: 0.86, height: 0.2 }, fontSize: 48, rotation: 0 });
                queueMicrotask(finishHistoryInteraction);
              }}
            />
          </ScrollView>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Action label="Add text layer" onPress={addTextLayer} />
            <Action label="Add sticker/image" onPress={() => void addImageLayer()} />
          </ScrollView>
        )}

        {error ? (
          <View style={{ padding: 12, borderRadius: 13, backgroundColor: '#351D24' }}>
            <Text selectable style={{ color: '#FFBBC8', fontSize: 13 }}>{error}</Text>
          </View>
        ) : null}

        <View
          style={{
            marginTop: 'auto',
            flexDirection: 'row',
            gap: 6,
            paddingVertical: 10,
            paddingBottom: 14,
            borderTopWidth: 1,
            borderTopColor: '#20262D',
          }}>
          <ToolbarItem label="Captions" active={activeTool === 'captions'} onPress={() => setActiveTool('captions')} />
          <ToolbarItem label="Fonts" active={activeTool === 'fonts'} onPress={() => { setActiveTool('fonts'); setFontBrowserOpen(true); }} />
          <ToolbarItem label="Animate" active={activeTool === 'animate'} onPress={() => setActiveTool('animate')} />
          <ToolbarItem label="Video" active={activeTool === 'video'} onPress={() => setActiveTool('video')} />
        </View>
      </View>

      <ScopeSheet
        visible={Boolean(pendingChange)}
        changeLabel={pendingChange?.label ?? ''}
        hasSelectedCaption={Boolean(selectedCaptionId)}
        onChoose={chooseStyleScope}
        onClose={() => setPendingChange(undefined)}
      />
      <FontBrowser
        visible={fontBrowserOpen}
        previewText={selectedTextLayer?.text ?? selectedCaption?.text ?? activeCaption?.text ?? 'Make every word count'}
        onClose={() => setFontBrowserOpen(false)}
        onSelect={chooseFont}
      />
      <EditCaptionModal
        visible={Boolean(editingCaptionId || editingLayerId)}
        value={editingText ?? ''}
        onChange={setEditingText}
        onCancel={() => {
          setEditingCaptionId(undefined);
          setEditingLayerId(undefined);
          setEditingText(undefined);
        }}
        onSave={commitCaptionText}
      />
      <ProgressOverlay progress={progress} />
    </View>
  );
}

function Action(props: { label: string; color?: string; danger?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        minHeight: 42,
        paddingHorizontal: 13,
        flexDirection: 'row',
        gap: 7,
        alignItems: 'center',
        borderRadius: 13,
        borderWidth: props.danger ? 1 : 0,
        borderColor: props.danger ? '#7A2B38' : 'transparent',
        backgroundColor: props.danger ? '#351D24' : palette.surfaceRaised,
      }}>
      {props.color ? <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: props.color }} /> : null}
      <Text style={{ color: props.danger ? '#FFBBC8' : palette.text, fontSize: 12, fontWeight: '700' }}>{props.label}</Text>
    </Pressable>
  );
}

function HistoryButton(props: { label: string; disabled: boolean; version: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label.replace(/[↶↷]/g, '').trim()}
      disabled={props.disabled}
      onPress={props.onPress}
      style={{ minWidth: 108, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: props.disabled ? '#29313A' : '#6A42A8', backgroundColor: props.disabled ? '#171C22' : '#2B1C42', opacity: props.disabled ? 0.45 : 1 }}>
      <Text style={{ color: props.disabled ? '#76818D' : '#DDBEFF', fontSize: 13, fontWeight: '900' }}>{props.label}</Text>
    </Pressable>
  );
}

function ToolbarItem(props: { label: string; active?: boolean; disabled?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      disabled={props.disabled}
      onPress={props.onPress}
      style={{ flex: 1, alignItems: 'center', gap: 4, opacity: props.disabled ? 0.35 : 1 }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: props.active ? palette.accent : 'transparent' }} />
      <Text style={{ color: props.active ? palette.accent : palette.text, fontSize: 10, fontWeight: '600' }}>{props.label}</Text>
    </Pressable>
  );
}

function ProgressOverlay(props: { progress?: TranscriptionProgress }) {
  if (!props.progress) return null;
  const percent = Math.round(props.progress.progress * 100);
  return (
    <Modal visible transparent animationType="fade">
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 26, backgroundColor: 'rgba(0,0,0,0.82)' }}>
        <View style={{ width: '100%', maxWidth: 380, gap: 16, padding: 22, borderRadius: 24, backgroundColor: '#171C22' }}>
          <ActivityIndicator color={palette.accent} size="large" />
          <Text style={{ color: palette.text, textAlign: 'center', fontSize: 20, fontWeight: '800' }}>
            {stageTitle(props.progress.stage)}
          </Text>
          <Text style={{ color: palette.muted, textAlign: 'center', fontSize: 14 }}>{props.progress.detail}</Text>
          <View style={{ height: 8, overflow: 'hidden', borderRadius: 4, backgroundColor: '#303640' }}>
            <View style={{ width: `${percent}%`, height: '100%', backgroundColor: palette.accent }} />
          </View>
          <Text style={{ color: palette.text, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{percent}%</Text>
          <Text style={{ color: '#6F7985', textAlign: 'center', fontSize: 11 }}>
            Keep the app open during this first device milestone.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function EditCaptionModal(props: {
  visible: boolean;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onCancel}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.72)' }}>
        <View style={{ gap: 14, padding: 20, borderRadius: 22, backgroundColor: '#181D24' }}>
          <Text style={{ color: palette.text, fontSize: 20, fontWeight: '800' }}>Edit subtitle</Text>
          <TextInput
            autoFocus
            multiline
            value={props.value}
            onChangeText={props.onChange}
            style={{ minHeight: 110, padding: 14, borderRadius: 14, color: palette.text, backgroundColor: '#252C35', textAlignVertical: 'top' }}
          />
          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            <Pressable onPress={props.onCancel} style={{ padding: 12 }}>
              <Text style={{ color: palette.muted }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={props.onSave} style={{ paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, backgroundColor: palette.accent }}>
              <Text style={{ color: '#11140C', fontWeight: '800' }}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function stageTitle(stage: TranscriptionProgress['stage']) {
  switch (stage) {
    case 'preparing-audio': return 'Preparing audio';
    case 'downloading-model': return 'Getting offline model';
    case 'detecting-speech': return 'Finding speech';
    case 'transcribing': return 'Generating captions';
    case 'grouping': return 'Building timeline';
  }
}

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function orientedSize(width: number, height: number, rotation: number) {
  return Math.abs(rotation) % 180 === 90
    ? { width: Math.max(1, height), height: Math.max(1, width) }
    : { width: Math.max(1, width), height: Math.max(1, height) };
}

function canvasPresetSize(preset: CaptionProject['canvas']['preset'], project: CaptionProject) {
  if (preset === '9:16') return { width: 9, height: 16 };
  if (preset === '16:9') return { width: 16, height: 9 };
  if (preset === '1:1') return { width: 1, height: 1 };
  if (preset === '4:5') return { width: 4, height: 5 };
  return orientedSize(project.source.width ?? 9, project.source.height ?? 16, project.source.rotation ?? 0);
}

function fitRect(aspect: number, maxWidth: number, maxHeight: number) {
  let width = maxWidth;
  let height = width / aspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }
  return { width, height };
}

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
