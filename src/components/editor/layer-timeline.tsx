import { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, Text, View } from 'react-native';

import { packTimelineLanes } from '@/lib/timeline-layout';
import type { CaptionBlock, VideoClip, VisualLayer } from '@/types/project';

const LABEL_WIDTH = 82;
const LANE_HEIGHT = 32;
const NEON_CAPTION_COLORS = ['#FF2FA9', '#00B8FF', '#19D98B', '#A855F7', '#FF4D6D', '#00D9C8'];

export function LayerTimeline(props: {
  durationMs: number;
  clips: VideoClip[];
  layers: VisualLayer[];
  captions: CaptionBlock[];
  currentMs: number;
  selectedLayerId: string;
  selectedCaptionId?: string;
  selectedClipId?: string;
  onSeek: (timeMs: number) => void;
  onSelectLayer: (id: string) => void;
  onSelectCaption: (caption: CaptionBlock) => void;
  onSelectClip: (clipId: string, timelineStartMs: number) => void;
  onTrimClip: (clipId: string, edge: 'start' | 'end', amountMs: number) => void;
  onLayerTimingChange: (layerId: string, startMs: number, endMs: number) => void;
  onCaptionTimingChange: (captionId: string, startMs: number, endMs: number) => void;
  onTimingChangeStart: () => void;
  onTimingChangeEnd: () => void;
  onMoveLayer: (layerId: string, direction: -1 | 1) => void;
  onDeleteLayer: (layerId: string) => void;
}) {
  const duration = Math.max(1, props.durationMs);
  const trackWidth = clamp((duration / 1000) * 32, 360, 24000);
  const captionLayout = useMemo(() => packTimelineLanes(props.captions), [props.captions]);
  const captionRowHeight = captionLayout.laneCount * LANE_HEIGHT + 10;
  const totalRowsHeight = 46 + props.layers.reduce(
    (sum, layer) => sum + (layer.kind === 'captions' ? captionRowHeight : 46),
    0,
  );
  const clipPositions = useMemo(() => {
    let cursor = 0;
    return props.clips.map((clip) => {
      const startMs = cursor;
      cursor += Math.max(0, clip.sourceEndMs - clip.sourceStartMs);
      return { clip, startMs, endMs: cursor };
    });
  }, [props.clips]);

  return (
    <View style={{ height: Math.min(280, totalRowsHeight + 2), overflow: 'hidden', borderRadius: 15, borderWidth: 1, borderColor: '#252D36', backgroundColor: '#101419' }}>
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator contentContainerStyle={{ width: LABEL_WIDTH + trackWidth }}>
        <View style={{ width: LABEL_WIDTH + trackWidth, height: '100%' }}>
          <ScrollView contentContainerStyle={{ paddingVertical: 1 }} nestedScrollEnabled>
            <TimelineRow label="VIDEO" labelColor="#DFFF35" selected={Boolean(props.selectedClipId)} trackWidth={trackWidth} height={46} onPressTrack={(x) => props.onSeek(x / trackWidth * duration)} controls={<Text style={{ color: '#6F7985', fontSize: 8 }}>fixed</Text>}>
              {clipPositions.map(({ clip, startMs, endMs }, index) => (
                <VideoClipBlock key={clip.id} label={`CLIP ${index + 1}`} startMs={startMs} endMs={endMs} durationMs={duration} trackWidth={trackWidth} selected={props.selectedClipId === clip.id} color={index % 2 ? '#38404A' : '#46515D'} onPress={() => props.onSelectClip(clip.id, startMs)} onTrim={(edge, amountMs) => props.onTrimClip(clip.id, edge, amountMs)} />
              ))}
            </TimelineRow>

            {props.layers.map((layer, layerIndex) => {
              const isCaptions = layer.kind === 'captions';
              return (
                <TimelineRow
                  key={layer.id}
                  label={layer.name.toUpperCase()}
                  labelColor={isCaptions ? '#FF4FD8' : layer.kind === 'text' ? '#A985F8' : '#64E8FF'}
                  selected={props.selectedLayerId === layer.id}
                  onPressLabel={() => props.onSelectLayer(layer.id)}
                  onPressTrack={(x) => props.onSeek(x / trackWidth * duration)}
                  trackWidth={trackWidth}
                  height={isCaptions ? captionRowHeight : 46}
                  controls={<View style={{ gap: 2 }}>
                    {isCaptions && captionLayout.laneCount > 1 ? <Text style={{ color: '#19D98B', fontSize: 7, fontWeight: '800' }}>{captionLayout.laneCount} AUTO LANES</Text> : null}
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <TinyButton label="↑" disabled={layerIndex === 0} onPress={() => props.onMoveLayer(layer.id, -1)} />
                      <TinyButton label="↓" disabled={layerIndex === props.layers.length - 1} onPress={() => props.onMoveLayer(layer.id, 1)} />
                      {!isCaptions ? <TinyButton label="×" danger onPress={() => props.onDeleteLayer(layer.id)} /> : null}
                    </View>
                  </View>}>
                  {isCaptions ? props.captions.map((caption, index) => (
                    <TimedBlock
                      key={caption.id}
                      label={caption.text}
                      startMs={caption.startMs}
                      endMs={caption.endMs}
                      durationMs={duration}
                      trackWidth={trackWidth}
                      lane={captionLayout.laneById.get(caption.id) ?? 0}
                      color={NEON_CAPTION_COLORS[index % NEON_CAPTION_COLORS.length]}
                      selected={props.selectedCaptionId === caption.id}
                      onPress={() => props.onSelectCaption(caption)}
                      onChangeStart={props.onTimingChangeStart}
                      onChange={(startMs, endMs) => props.onCaptionTimingChange(caption.id, startMs, endMs)}
                      onEnd={props.onTimingChangeEnd}
                    />
                  )) : (
                    <TimedBlock
                      label={layer.kind === 'text' ? layer.text : 'IMAGE'}
                      startMs={layer.startMs}
                      endMs={layer.endMs}
                      durationMs={duration}
                      trackWidth={trackWidth}
                      lane={0}
                      color={layer.kind === 'text' ? '#A855F7' : '#00B8FF'}
                      selected={props.selectedLayerId === layer.id}
                      onPress={() => { props.onSelectLayer(layer.id); props.onSeek(layer.startMs); }}
                      onChangeStart={props.onTimingChangeStart}
                      onChange={(startMs, endMs) => props.onLayerTimingChange(layer.id, startMs, endMs)}
                      onEnd={props.onTimingChangeEnd}
                    />
                  )}
                </TimelineRow>
              );
            })}
          </ScrollView>
          <View pointerEvents="none" style={{ position: 'absolute', left: LABEL_WIDTH + currentX(props.currentMs, duration, trackWidth), top: 0, bottom: 0, width: 2, backgroundColor: '#FF5267' }} />
        </View>
      </ScrollView>
    </View>
  );
}

function VideoClipBlock(props: {
  label: string; startMs: number; endMs: number; durationMs: number; trackWidth: number;
  selected: boolean; color: string; onPress: () => void;
  onTrim: (edge: 'start' | 'end', amountMs: number) => void;
}) {
  const [preview, setPreview] = useState({ startInsetMs: 0, endInsetMs: 0 });
  const clipDuration = Math.max(120, props.endMs - props.startMs);
  return (
    <Pressable onPress={props.onPress} style={{ position: 'absolute', left: (props.startMs + preview.startInsetMs) / props.durationMs * props.trackWidth, width: Math.max(2, (clipDuration - preview.startInsetMs - preview.endInsetMs) / props.durationMs * props.trackWidth - 2), top: 3, bottom: 3, justifyContent: 'center', paddingHorizontal: 7, borderRadius: 6, borderWidth: props.selected ? 2 : 0, borderColor: '#DFFF35', backgroundColor: props.color }}>
      <Text numberOfLines={1} style={{ color: '#F7F8FA', fontSize: 8, fontWeight: '800' }}>{props.label}</Text>
      {props.selected ? <>
        <VideoTrimGrip side="start" trackWidth={props.trackWidth} timelineDurationMs={props.durationMs} maxTrimMs={clipDuration - preview.endInsetMs - 120} onPreview={(amount) => setPreview((current) => ({ ...current, startInsetMs: amount }))} onCommit={(amount) => { setPreview({ startInsetMs: 0, endInsetMs: 0 }); props.onTrim('start', amount); }} />
        <VideoTrimGrip side="end" trackWidth={props.trackWidth} timelineDurationMs={props.durationMs} maxTrimMs={clipDuration - preview.startInsetMs - 120} onPreview={(amount) => setPreview((current) => ({ ...current, endInsetMs: amount }))} onCommit={(amount) => { setPreview({ startInsetMs: 0, endInsetMs: 0 }); props.onTrim('end', amount); }} />
      </> : null}
    </Pressable>
  );
}

function VideoTrimGrip(props: { side: 'start' | 'end'; trackWidth: number; timelineDurationMs: number; maxTrimMs: number; onPreview: (amountMs: number) => void; onCommit: (amountMs: number) => void }) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const amountRef = useRef(0);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { amountRef.current = 0; },
    onPanResponderMove: (_event, gesture) => {
      const inwardPixels = propsRef.current.side === 'start' ? gesture.dx : -gesture.dx;
      const amount = clamp(inwardPixels / Math.max(1, propsRef.current.trackWidth) * propsRef.current.timelineDurationMs, 0, propsRef.current.maxTrimMs);
      amountRef.current = amount;
      propsRef.current.onPreview(amount);
    },
    onPanResponderRelease: () => propsRef.current.onCommit(amountRef.current),
    onPanResponderTerminate: () => propsRef.current.onCommit(amountRef.current),
  }), []);
  return <View {...responder.panHandlers} style={{ position: 'absolute', [props.side === 'start' ? 'left' : 'right']: -9, top: -3, bottom: -3, width: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DFFF35' }}><View style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: '#172007' }} /></View>;
}

function TimelineRow(props: { label: string; labelColor: string; selected?: boolean; controls: React.ReactNode; children: React.ReactNode; onPressLabel?: () => void; onPressTrack?: (x: number) => void; trackWidth: number; height: number }) {
  return (
    <View style={{ width: LABEL_WIDTH + props.trackWidth, height: props.height, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1D242C' }}>
      <Pressable onPress={props.onPressLabel} style={{ width: LABEL_WIDTH, height: '100%', paddingHorizontal: 6, justifyContent: 'center', gap: 2, backgroundColor: props.selected ? '#252D22' : 'transparent' }}>
        <Text numberOfLines={1} style={{ color: props.labelColor, fontSize: 8, fontWeight: '900' }}>{props.label}</Text>
        {props.controls}
      </Pressable>
      <Pressable onPress={(event) => props.onPressTrack?.(event.nativeEvent.locationX)} style={{ width: props.trackWidth, height: props.height - 8, borderRadius: 7, backgroundColor: '#171D23' }}>
        {props.children}
      </Pressable>
    </View>
  );
}

function TimedBlock(props: { label: string; startMs: number; endMs: number; durationMs: number; trackWidth: number; lane: number; color: string; selected: boolean; onPress: () => void; onChangeStart: () => void; onChange: (startMs: number, endMs: number) => void; onEnd: () => void }) {
  const width = Math.max(2, (props.endMs - props.startMs) / props.durationMs * props.trackWidth - 2);
  return (
    <Pressable onPress={props.onPress} style={{ position: 'absolute', left: props.startMs / props.durationMs * props.trackWidth, width, top: props.lane * LANE_HEIGHT + 3, height: LANE_HEIGHT - 6, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 7, borderWidth: props.selected ? 2 : 1, borderColor: props.selected ? '#FFFFFF' : `${props.color}CC`, backgroundColor: `${props.color}B8`, shadowColor: props.color, shadowOpacity: props.selected ? 0.8 : 0.35, shadowRadius: 5 }}>
      <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 8, fontWeight: '900' }}>{props.label}</Text>
      <TimingGrip side="start" {...props} />
      <TimingGrip side="end" {...props} />
    </Pressable>
  );
}

function TimingGrip(props: Parameters<typeof TimedBlock>[0] & { side: 'start' | 'end' }) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const start = useRef({ startMs: props.startMs, endMs: props.endMs });
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      propsRef.current.onPress();
      propsRef.current.onChangeStart();
      start.current = { startMs: propsRef.current.startMs, endMs: propsRef.current.endMs };
    },
    onPanResponderMove: (_event, gesture) => {
      const delta = gesture.dx / Math.max(1, propsRef.current.trackWidth) * propsRef.current.durationMs;
      if (propsRef.current.side === 'start') propsRef.current.onChange(clamp(start.current.startMs + delta, 0, start.current.endMs - 120), start.current.endMs);
      else propsRef.current.onChange(start.current.startMs, clamp(start.current.endMs + delta, start.current.startMs + 120, propsRef.current.durationMs));
    },
    onPanResponderRelease: () => propsRef.current.onEnd(),
    onPanResponderTerminate: () => propsRef.current.onEnd(),
  }), []);
  return <View {...responder.panHandlers} style={{ position: 'absolute', [props.side === 'start' ? 'left' : 'right']: 0, top: 0, bottom: 0, width: 16, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: props.selected ? '#FFFFFF' : 'transparent' }}><View pointerEvents="none" style={{ width: props.selected ? 3 : 2, height: 16, borderRadius: 2, backgroundColor: props.selected ? '#151A20' : '#FFFFFFCC' }} /></View>;
}

function TinyButton(props: { label: string; danger?: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable disabled={props.disabled} onPress={props.onPress} hitSlop={5} style={{ opacity: props.disabled ? 0.25 : 1 }}><Text style={{ color: props.danger ? '#FF7C8D' : '#9FAAB6', fontSize: 11, fontWeight: '900' }}>{props.label}</Text></Pressable>;
}

function currentX(currentMs: number, durationMs: number, width: number) { return clamp(currentMs / Math.max(1, durationMs), 0, 1) * width; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
