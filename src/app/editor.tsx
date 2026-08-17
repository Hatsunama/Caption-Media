import { useEffect, useMemo, useRef, useState } from 'react';
import { useEventListener } from 'expo';
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

import CaptionMedia from '../../modules/caption-media/src/CaptionMediaModule';
import { CaptionOverlay } from '@/components/editor/caption-overlay';
import { FontBrowser } from '@/components/editor/font-browser';
import { ScopeSheet } from '@/components/editor/scope-sheet';
import { SubtitleTimeline } from '@/components/editor/subtitle-timeline';
import { VideoTools } from '@/components/editor/video-tools';
import { VideoTransformOverlay } from '@/components/editor/video-transform-overlay';
import { applyStylePatch, type StyleScope } from '@/lib/style-resolver';
import { getProject, saveProject } from '@/services/database';
import {
  transcribeVideoLocally,
  type TranscriptionProgress,
} from '@/services/transcription';
import {
  DEFAULT_CAPTION_STYLE,
  type CaptionProject,
  type CaptionStylePatch,
  type FontReference,
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

type EditorTool = 'captions' | 'style' | 'fonts' | 'animate' | 'video';

export default function EditorScreen() {
  const params = useLocalSearchParams<{
    projectId: string;
    uri: string;
    name: string;
    durationMs?: string;
  }>();
  const { height, width } = useWindowDimensions();
  const [project, setProject] = useState<CaptionProject>(() => createProject(params));
  const projectRef = useRef(project);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);
  const [selectedCaptionId, setSelectedCaptionId] = useState<string>();
  const [currentMs, setCurrentMs] = useState(0);
  const [progress, setProgress] = useState<TranscriptionProgress>();
  const [error, setError] = useState<string>();
  const [fontBrowserOpen, setFontBrowserOpen] = useState(false);
  const [pendingChange, setPendingChange] = useState<PendingStyleChange>();
  const [editingText, setEditingText] = useState<string>();
  const [editingCaptionId, setEditingCaptionId] = useState<string>();
  const [activeTool, setActiveTool] = useState<EditorTool>('captions');

  const player = useVideoPlayer(params.uri, (instance) => {
    instance.timeUpdateEventInterval = 0.05;
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    setCurrentMs(currentTime * 1000);
  });

  useEffect(() => {
    let active = true;
    void getProject(params.projectId).then(async (stored) => {
      if (!active) return;
      if (stored) {
        setProject(stored);
        setSelectedCaptionId(stored.captions[0]?.id);
        return;
      }
      try {
        const info = await CaptionMedia.getMediaInfo(params.uri);
        if (!active) return;
        setProject((current) => {
          const displaySize = orientedSize(info.width, info.height, info.rotation);
          return {
            ...current,
            source: {
              ...current.source,
              durationMs: info.durationMs || current.source.durationMs,
              width: info.width,
              height: info.height,
              rotation: info.rotation,
            },
            canvas:
              current.canvas.preset === 'source'
                ? { ...current.canvas, aspectWidth: displaySize.width, aspectHeight: displaySize.height }
                : current.canvas,
          };
        });
      } catch {
        // The preview remains usable even if metadata is unavailable.
      }
    });
    return () => {
      active = false;
    };
  }, [params.projectId, params.uri]);

  const activeCaption = useMemo(
    () => project.captions.find((caption) => currentMs >= caption.startMs && currentMs < caption.endMs),
    [currentMs, project.captions],
  );
  const selectedCaption = project.captions.find((caption) => caption.id === selectedCaptionId);
  const displayCaption = player.playing ? activeCaption : selectedCaption ?? activeCaption;
  const previewHeight = Math.min(Math.max(280, height * 0.43), 500);
  const canvasSize = fitRect(
    Math.max(1, project.canvas.aspectWidth / project.canvas.aspectHeight),
    width - 24,
    previewHeight - 8,
  );

  const generateCaptions = async () => {
    setError(undefined);
    try {
      const result = await transcribeVideoLocally({
        projectId: project.id,
        videoUri: project.source.uri,
        modelId: 'fast',
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
      setProject(next);
      setSelectedCaptionId(next.captions[0]?.id);
      await saveProject(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Caption generation failed');
    } finally {
      setProgress(undefined);
    }
  };

  const chooseStyleScope = async (scope: StyleScope) => {
    if (!pendingChange) return;
    const next = applyStylePatch(
      project,
      selectedCaptionId ?? '',
      scope,
      pendingChange.patch,
    );
    setProject(next);
    setPendingChange(undefined);
    await saveProject(next);
  };

  const chooseFont = (font: FontReference) => {
    setFontBrowserOpen(false);
    setPendingChange({
      label: `Font: ${font.postScriptName || font.family}`,
      patch: { font },
    });
  };

  const beginEditCaption = () => {
    if (!selectedCaption) return;
    setEditingCaptionId(selectedCaption.id);
    setEditingText(selectedCaption.text);
  };

  const commitCaptionText = async () => {
    if (!editingCaptionId || editingText == null) return;
    const next: CaptionProject = {
      ...project,
      updatedAt: new Date().toISOString(),
      captions: project.captions.map((caption) =>
        caption.id === editingCaptionId ? { ...caption, text: editingText.trim() } : caption,
      ),
    };
    setProject(next);
    setEditingCaptionId(undefined);
    setEditingText(undefined);
    await saveProject(next);
  };

  const updateCaptionTransform = (patch: CaptionStylePatch) => {
    if (!selectedCaptionId) return;
    setProject((current) => {
      const next = applyStylePatch(current, selectedCaptionId, 'caption', patch);
      projectRef.current = next;
      return next;
    });
  };

  const persistProject = () => {
    void saveProject(projectRef.current);
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

  const deleteCaption = (captionId: string) => {
    const current = projectRef.current;
    const index = current.captions.findIndex((caption) => caption.id === captionId);
    if (index < 0) return;
    const captions = current.captions.filter((caption) => caption.id !== captionId);
    const next = {
      ...current,
      updatedAt: new Date().toISOString(),
      captions,
    };
    projectRef.current = next;
    setProject(next);
    setSelectedCaptionId(captions[Math.min(index, captions.length - 1)]?.id);
    void saveProject(next);
  };

  const confirmDeleteCaption = (captionId: string) => {
    Alert.alert('Delete this subtitle?', 'Only this caption block will be removed. The source video is unchanged.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCaption(captionId) },
    ]);
  };

  const setCanvasPreset = async (preset: CaptionProject['canvas']['preset']) => {
    const size = canvasPresetSize(preset, project);
    const next = {
      ...project,
      updatedAt: new Date().toISOString(),
      canvas: {
        ...project.canvas,
        preset,
        aspectWidth: size.width,
        aspectHeight: size.height,
      },
    };
    setProject(next);
    await saveProject(next);
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
          </View>
          {activeTool === 'video' ? (
            <VideoTransformOverlay
              transform={project.videoTransform}
              onChange={updateVideoTransform}
              onEnd={persistProject}
            />
          ) : null}
          <CaptionOverlay
            caption={displayCaption}
            words={project.transcription.words}
            projectStyle={project.projectStyle}
            currentMs={currentMs}
            interactive={activeTool !== 'video' && Boolean(selectedCaptionId) && displayCaption?.id === selectedCaptionId}
            onInteractionStart={() => player.pause()}
            onTransform={updateCaptionTransform}
            onTransformEnd={persistProject}
            onDelete={selectedCaptionId ? () => confirmDeleteCaption(selectedCaptionId) : undefined}
          />
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: palette.text, fontSize: 16, fontWeight: '700' }}>
              {project.name}
            </Text>
            <Text style={{ color: palette.muted, fontSize: 12 }}>
              {formatTime(currentMs)} / {formatTime(project.source.durationMs)}
            </Text>
          </View>
          {project.captions.length === 0 ? (
            <Pressable
              onPress={generateCaptions}
              style={{ paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999, backgroundColor: palette.accent }}>
              <Text style={{ color: '#10130A', fontWeight: '800' }}>Generate captions</Text>
            </Pressable>
          ) : (
            <Text style={{ color: palette.accent, fontSize: 12, fontWeight: '700' }}>
              {project.captions.length} CAPTIONS
            </Text>
          )}
        </View>

        <SubtitleTimeline
          captions={project.captions}
          selectedId={selectedCaptionId}
          currentMs={currentMs}
          durationMs={project.source.durationMs}
          onSelect={(caption) => {
            player.pause();
            setSelectedCaptionId(caption.id);
            player.currentTime = caption.startMs / 1000;
          }}
          onTimingChange={updateCaptionTiming}
          onTimingChangeEnd={persistProject}
          onDelete={(caption) => confirmDeleteCaption(caption.id)}
        />

        {activeTool === 'video' ? (
          <VideoTools
            project={project}
            onCanvasPreset={setCanvasPreset}
            onFit={(fit) => {
              updateVideoTransform({ fit });
              queueMicrotask(persistProject);
            }}
            onScale={(scale) => updateVideoTransform({ scale })}
            onRotation={(rotation) => updateVideoTransform({ rotation })}
            onReset={() => {
              updateVideoTransform({ fit: 'fit', position: { x: 0.5, y: 0.5 }, scale: 1, rotation: 0 });
              queueMicrotask(persistProject);
            }}
            onTransformEnd={persistProject}
          />
        ) : selectedCaption ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Action label="Edit text" onPress={beginEditCaption} />
            <Action label="Delete subtitle" danger onPress={() => confirmDeleteCaption(selectedCaption.id)} />
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
            <Action label="Reset box" onPress={() => setPendingChange({ label: 'Reset text box', patch: { box: { width: 0.86, height: 0.2 }, rotation: 0 } })} />
          </ScrollView>
        ) : (
          <View style={{ height: 46, justifyContent: 'center' }}>
            <Text style={{ color: palette.muted, fontSize: 13 }}>Select a caption block to edit it.</Text>
          </View>
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
          <ToolbarItem label="Style" active={activeTool === 'style'} onPress={() => { setActiveTool('style'); setPendingChange({ label: 'Bold subtitle style', patch: { fontWeight: '900', stroke: { width: 4 } } }); }} />
          <ToolbarItem label="Fonts" active={activeTool === 'fonts'} onPress={() => { setActiveTool('fonts'); setFontBrowserOpen(true); }} />
          <ToolbarItem label="Animate" active={activeTool === 'animate'} onPress={() => { setActiveTool('animate'); setPendingChange({ label: 'Punch animation', patch: { animation: { id: 'punch', intensity: 0.15 } } }); }} />
          <ToolbarItem label="Video" active={activeTool === 'video'} onPress={() => setActiveTool('video')} />
          <ToolbarItem label="Export" disabled />
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
        previewText={selectedCaption?.text ?? activeCaption?.text ?? 'Make every word count'}
        onClose={() => setFontBrowserOpen(false)}
        onSelect={chooseFont}
      />
      <EditCaptionModal
        visible={Boolean(editingCaptionId)}
        value={editingText ?? ''}
        onChange={setEditingText}
        onCancel={() => {
          setEditingCaptionId(undefined);
          setEditingText(undefined);
        }}
        onSave={commitCaptionText}
      />
      <ProgressOverlay progress={progress} />
    </View>
  );
}

function createProject(params: { projectId: string; uri: string; name: string; durationMs?: string }): CaptionProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: params.projectId,
    name: params.name,
    createdAt: now,
    updatedAt: now,
    source: {
      uri: params.uri,
      displayName: params.name,
      durationMs: Number(params.durationMs ?? 0),
    },
    transcription: {
      language: 'en',
      modelId: 'fast',
      words: [],
    },
    captions: [],
    projectStyle: DEFAULT_CAPTION_STYLE,
    canvas: {
      preset: 'source',
      aspectWidth: 9,
      aspectHeight: 16,
      backgroundColor: '#000000',
    },
    videoTransform: {
      fit: 'fit',
      position: { x: 0.5, y: 0.5 },
      scale: 1,
      rotation: 0,
    },
    videoEdits: [],
    export: {
      resolution: '1080p',
      format: 'mp4',
      burnCaptions: true,
    },
  };
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
