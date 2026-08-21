import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, Text, View } from 'react-native';

import { packTimelineLanes } from '@/lib/timeline-layout';
import {
  clampTimelineScale,
  minimumTimelineScale,
  timelineScrollOffset,
  timelineTickInterval,
  timelineTimeAtScroll,
  timelineWidth,
  timelineZoomPercent,
} from '@/lib/timeline-scale';
import { buildClipTimeline } from '@/lib/video-timeline';
import type { CaptionBlock, VideoClip, VisualLayer } from '@/types/project';

const LABEL_WIDTH = 82;
const RULER_HEIGHT = 28;
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
  onScrubStart: () => void;
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
  onAddVideos: () => void;
}) {
  const duration = Math.max(1, props.durationMs);
  const horizontalRef = useRef<ScrollView>(null);
  const [viewportWidth, setViewportWidth] = useState(360);
  const minimumScale = minimumTimelineScale(duration, Math.max(1, viewportWidth - LABEL_WIDTH));
  const [pixelsPerSecond, setPixelsPerSecond] = useState(() => Math.max(16, minimumScale));
  const effectiveScale = clampTimelineScale(pixelsPerSecond, minimumScale);
  const trackWidth = timelineWidth(duration, effectiveScale, Math.max(1, viewportWidth - LABEL_WIDTH));
  const zoomPercent = timelineZoomPercent(effectiveScale, minimumScale);
  const [zoomNotice, setZoomNotice] = useState<number>();
  const zoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubbingRef = useRef(false);
  const scrollXRef = useRef(0);
  const lastScrubMsRef = useRef(-1);
  const pinch = useRef({ distance: 0, scale: effectiveScale });
  const captionLayout = useMemo(() => packTimelineLanes(props.captions), [props.captions]);
  const captionRowHeight = captionLayout.laneCount * LANE_HEIGHT + 10;
  const totalRowsHeight = 46 + props.layers.reduce(
    (sum, layer) => sum + (layer.kind === 'captions' ? captionRowHeight : 46),
    0,
  );
  const clipPositions = useMemo(() => buildClipTimeline(props.clips), [props.clips]);
  const leadingPadding = Math.max(0, viewportWidth / 2 - LABEL_WIDTH);
  const trailingPadding = viewportWidth / 2;
  const scrollContentWidth = leadingPadding + LABEL_WIDTH + trackWidth + trailingPadding;

  useEffect(() => () => {
    if (zoomTimer.current) clearTimeout(zoomTimer.current);
    if (scrubEndTimer.current) clearTimeout(scrubEndTimer.current);
  }, []);

  useEffect(() => {
    if (scrubbingRef.current) return;
    const x = timelineScrollOffset(props.currentMs, duration, trackWidth);
    scrollXRef.current = x;
    horizontalRef.current?.scrollTo({ x, animated: false });
  }, [duration, props.currentMs, trackWidth, viewportWidth]);

  const seekFromScroll = (offset: number, force = false) => {
    const timeMs = timelineTimeAtScroll(offset, duration, trackWidth);
    if (!force && Math.abs(timeMs - lastScrubMsRef.current) < 32) return;
    lastScrubMsRef.current = timeMs;
    props.onSeek(timeMs);
  };

  const finishScrub = () => {
    if (scrubEndTimer.current) clearTimeout(scrubEndTimer.current);
    scrubbingRef.current = false;
    seekFromScroll(scrollXRef.current, true);
  };

  const updateZoom = (next: number) => {
    const clamped = clampTimelineScale(next, minimumScale);
    setPixelsPerSecond(clamped);
    setZoomNotice(timelineZoomPercent(clamped, minimumScale));
    if (zoomTimer.current) clearTimeout(zoomTimer.current);
    zoomTimer.current = setTimeout(() => setZoomNotice(undefined), 1_100);
  };

  return (
    <View
      onLayout={(event) => setViewportWidth(Math.max(1, event.nativeEvent.layout.width))}
      onStartShouldSetResponderCapture={(event) => event.nativeEvent.touches.length === 2}
      onMoveShouldSetResponderCapture={(event) => event.nativeEvent.touches.length === 2}
      onResponderGrant={(event) => {
        const [first, second] = event.nativeEvent.touches;
        pinch.current = { distance: touchDistance(first, second), scale: effectiveScale };
      }}
      onResponderMove={(event) => {
        const [first, second] = event.nativeEvent.touches;
        if (!first || !second || pinch.current.distance <= 0) return;
        updateZoom(pinch.current.scale * touchDistance(first, second) / pinch.current.distance);
      }}
      style={{ height: Math.min(330, totalRowsHeight + RULER_HEIGHT + 38), overflow: 'hidden', borderRadius: 15, borderWidth: 1, borderColor: '#252D36', backgroundColor: '#101419' }}>
      <View style={{ height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#1D242C' }}>
        <ZoomButton label="−" onPress={() => updateZoom(effectiveScale / 1.5)} />
        <Text style={{ minWidth: 118, color: '#D7DDE5', textAlign: 'center', fontSize: 11, fontWeight: '800' }}>TIMELINE {zoomPercent}%</Text>
        <ZoomButton label="+" onPress={() => updateZoom(effectiveScale * 1.5)} />
      </View>
      <ScrollView
        ref={horizontalRef}
        horizontal
        nestedScrollEnabled
        decelerationRate="fast"
        scrollEventThrottle={32}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ width: scrollContentWidth }}
        onScrollBeginDrag={() => {
          if (scrubEndTimer.current) clearTimeout(scrubEndTimer.current);
          scrubbingRef.current = true;
          props.onScrubStart();
        }}
        onScroll={(event) => {
          const x = clamp(event.nativeEvent.contentOffset.x, 0, trackWidth);
          scrollXRef.current = x;
          if (scrubbingRef.current) seekFromScroll(x);
        }}
        onScrollEndDrag={() => {
          if (scrubEndTimer.current) clearTimeout(scrubEndTimer.current);
          scrubEndTimer.current = setTimeout(finishScrub, 90);
        }}
        onMomentumScrollBegin={() => {
          if (scrubEndTimer.current) clearTimeout(scrubEndTimer.current);
          scrubbingRef.current = true;
        }}
        onMomentumScrollEnd={finishScrub}>
        <View style={{ width: LABEL_WIDTH + trackWidth, height: '100%', marginLeft: leadingPadding }}>
          <TimelineRuler durationMs={duration} trackWidth={trackWidth} pixelsPerSecond={effectiveScale} />
          <ScrollView style={{ marginTop: RULER_HEIGHT }} contentContainerStyle={{ paddingVertical: 1 }} nestedScrollEnabled>
            <TimelineRow label="VIDEO" labelColor="#DFFF35" selected={Boolean(props.selectedClipId)} trackWidth={trackWidth} height={46} onPressTrack={(x) => props.onSeek(x / trackWidth * duration)} controls={<Text style={{ color: '#6F7985', fontSize: 8 }}>{props.clips.length} CLIP{props.clips.length === 1 ? '' : 'S'}</Text>}>
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
                  selected={props.selectedLayerId === layer.id && !props.selectedClipId}
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
                    <TimedBlock key={caption.id} label={caption.text} startMs={caption.startMs} endMs={caption.endMs} durationMs={duration} trackWidth={trackWidth} lane={captionLayout.laneById.get(caption.id) ?? 0} color={NEON_CAPTION_COLORS[index % NEON_CAPTION_COLORS.length]} selected={props.selectedCaptionId === caption.id} onPress={() => props.onSelectCaption(caption)} onChangeStart={props.onTimingChangeStart} onChange={(startMs, endMs) => props.onCaptionTimingChange(caption.id, startMs, endMs)} onEnd={props.onTimingChangeEnd} />
                  )) : (
                    <TimedBlock label={layer.kind === 'text' ? layer.text : 'IMAGE'} startMs={layer.startMs} endMs={layer.endMs} durationMs={duration} trackWidth={trackWidth} lane={0} color={layer.kind === 'text' ? '#A855F7' : '#00B8FF'} selected={props.selectedLayerId === layer.id} onPress={() => { props.onSelectLayer(layer.id); props.onSeek(layer.startMs); }} onChangeStart={props.onTimingChangeStart} onChange={(startMs, endMs) => props.onLayerTimingChange(layer.id, startMs, endMs)} onEnd={props.onTimingChangeEnd} />
                  )}
                </TimelineRow>
              );
            })}
          </ScrollView>
        </View>
      </ScrollView>
      <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: 36, bottom: 0, width: 2, marginLeft: -1, backgroundColor: '#FF5267' }}>
        <View style={{ position: 'absolute', left: -7, top: 0, width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 11, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#FF5267' }} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Add videos to the end of the timeline" onPress={props.onAddVideos} style={{ position: 'absolute', right: 10, top: RULER_HEIGHT + 45, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 2, borderColor: '#11140C', backgroundColor: '#DFFF35' }}>
        <Text style={{ color: '#11140C', fontSize: 27, fontWeight: '700', lineHeight: 30 }}>+</Text>
      </Pressable>
      {zoomNotice == null ? null : <View pointerEvents="none" style={{ position: 'absolute', alignSelf: 'center', top: 72, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 14, backgroundColor: 'rgba(5,7,9,0.92)' }}><Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>{zoomNotice}%</Text></View>}
    </View>
  );
}

function TimelineRuler(props: { durationMs: number; trackWidth: number; pixelsPerSecond: number }) {
  const interval = timelineTickInterval(props.pixelsPerSecond);
  const tickCount = Math.ceil(props.durationMs / interval);
  return <View style={{ position: 'absolute', left: 0, top: 0, width: LABEL_WIDTH + props.trackWidth, height: RULER_HEIGHT, borderBottomWidth: 1, borderBottomColor: '#2B333D' }}><Text style={{ position: 'absolute', left: 8, top: 8, color: '#7D8794', fontSize: 8, fontWeight: '800' }}>TIME</Text>{Array.from({ length: tickCount + 1 }, (_, index) => { const timeMs = index * interval; const left = LABEL_WIDTH + timeMs / props.durationMs * props.trackWidth; return <View key={timeMs} style={{ position: 'absolute', left, top: 0, height: RULER_HEIGHT, borderLeftWidth: 1, borderLeftColor: '#64707D' }}><Text style={{ marginLeft: 4, marginTop: 5, color: '#AEB7C2', fontSize: 8, fontVariant: ['tabular-nums'] }}>{formatRulerTime(timeMs, interval)}</Text></View>; })}</View>;
}

function VideoClipBlock(props: { label: string; startMs: number; endMs: number; durationMs: number; trackWidth: number; selected: boolean; color: string; onPress: () => void; onTrim: (edge: 'start' | 'end', amountMs: number) => void }) {
  const [preview, setPreview] = useState({ startInsetMs: 0, endInsetMs: 0 });
  const clipDuration = Math.max(120, props.endMs - props.startMs);
  return <Pressable onPress={props.onPress} style={{ position: 'absolute', left: (props.startMs + preview.startInsetMs) / props.durationMs * props.trackWidth, width: Math.max(2, (clipDuration - preview.startInsetMs - preview.endInsetMs) / props.durationMs * props.trackWidth - 2), top: 3, bottom: 3, justifyContent: 'center', paddingHorizontal: 7, borderRadius: 6, borderWidth: props.selected ? 2 : 0, borderColor: '#DFFF35', backgroundColor: props.color }}><Text numberOfLines={1} style={{ color: '#F7F8FA', fontSize: 8, fontWeight: '800' }}>{props.label}</Text>{props.selected ? <><VideoTrimGrip side="start" trackWidth={props.trackWidth} timelineDurationMs={props.durationMs} maxTrimMs={clipDuration - preview.endInsetMs - 120} onPreview={(amount) => setPreview((current) => ({ ...current, startInsetMs: amount }))} onCommit={(amount) => { setPreview({ startInsetMs: 0, endInsetMs: 0 }); props.onTrim('start', amount); }} /><VideoTrimGrip side="end" trackWidth={props.trackWidth} timelineDurationMs={props.durationMs} maxTrimMs={clipDuration - preview.startInsetMs - 120} onPreview={(amount) => setPreview((current) => ({ ...current, endInsetMs: amount }))} onCommit={(amount) => { setPreview({ startInsetMs: 0, endInsetMs: 0 }); props.onTrim('end', amount); }} /></> : null}</Pressable>;
}

function VideoTrimGrip(props: { side: 'start' | 'end'; trackWidth: number; timelineDurationMs: number; maxTrimMs: number; onPreview: (amountMs: number) => void; onCommit: (amountMs: number) => void }) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const amountRef = useRef(0);
  const responder = useMemo(() => PanResponder.create({ onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true, onPanResponderGrant: () => { amountRef.current = 0; }, onPanResponderMove: (_event, gesture) => { const inwardPixels = propsRef.current.side === 'start' ? gesture.dx : -gesture.dx; const amount = clamp(inwardPixels / Math.max(1, propsRef.current.trackWidth) * propsRef.current.timelineDurationMs, 0, propsRef.current.maxTrimMs); amountRef.current = amount; propsRef.current.onPreview(amount); }, onPanResponderRelease: () => propsRef.current.onCommit(amountRef.current), onPanResponderTerminate: () => propsRef.current.onCommit(amountRef.current) }), []);
  return <View {...responder.panHandlers} style={{ position: 'absolute', [props.side === 'start' ? 'left' : 'right']: -9, top: -3, bottom: -3, width: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DFFF35' }}><View style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: '#172007' }} /></View>;
}

function TimelineRow(props: { label: string; labelColor: string; selected?: boolean; controls: React.ReactNode; children: React.ReactNode; onPressLabel?: () => void; onPressTrack?: (x: number) => void; trackWidth: number; height: number }) {
  return <View style={{ width: LABEL_WIDTH + props.trackWidth, height: props.height, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1D242C' }}><Pressable onPress={props.onPressLabel} style={{ width: LABEL_WIDTH, height: '100%', paddingHorizontal: 6, justifyContent: 'center', gap: 2, backgroundColor: props.selected ? '#252D22' : 'transparent' }}><Text numberOfLines={1} style={{ color: props.labelColor, fontSize: 8, fontWeight: '900' }}>{props.label}</Text>{props.controls}</Pressable><Pressable onPress={(event) => props.onPressTrack?.(event.nativeEvent.locationX)} style={{ width: props.trackWidth, height: props.height - 8, borderRadius: 7, backgroundColor: '#171D23' }}>{props.children}</Pressable></View>;
}

function TimedBlock(props: { label: string; startMs: number; endMs: number; durationMs: number; trackWidth: number; lane: number; color: string; selected: boolean; onPress: () => void; onChangeStart: () => void; onChange: (startMs: number, endMs: number) => void; onEnd: () => void }) {
  const width = Math.max(2, (props.endMs - props.startMs) / props.durationMs * props.trackWidth - 2);
  return <Pressable onPress={props.onPress} style={{ position: 'absolute', left: props.startMs / props.durationMs * props.trackWidth, width, top: props.lane * LANE_HEIGHT + 3, height: LANE_HEIGHT - 6, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 7, borderWidth: props.selected ? 2 : 1, borderColor: props.selected ? '#FFFFFF' : `${props.color}CC`, backgroundColor: `${props.color}B8`, shadowColor: props.color, shadowOpacity: props.selected ? 0.8 : 0.35, shadowRadius: 5 }}><Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 8, fontWeight: '900' }}>{props.label}</Text><TimingGrip side="start" {...props} /><TimingGrip side="end" {...props} /></Pressable>;
}

function TimingGrip(props: Parameters<typeof TimedBlock>[0] & { side: 'start' | 'end' }) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const start = useRef({ startMs: props.startMs, endMs: props.endMs });
  const responder = useMemo(() => PanResponder.create({ onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true, onPanResponderGrant: () => { propsRef.current.onPress(); propsRef.current.onChangeStart(); start.current = { startMs: propsRef.current.startMs, endMs: propsRef.current.endMs }; }, onPanResponderMove: (_event, gesture) => { const delta = gesture.dx / Math.max(1, propsRef.current.trackWidth) * propsRef.current.durationMs; if (propsRef.current.side === 'start') propsRef.current.onChange(clamp(start.current.startMs + delta, 0, start.current.endMs - 120), start.current.endMs); else propsRef.current.onChange(start.current.startMs, clamp(start.current.endMs + delta, start.current.startMs + 120, propsRef.current.durationMs)); }, onPanResponderRelease: () => propsRef.current.onEnd(), onPanResponderTerminate: () => propsRef.current.onEnd() }), []);
  return <View {...responder.panHandlers} style={{ position: 'absolute', [props.side === 'start' ? 'left' : 'right']: 0, top: 0, bottom: 0, width: 16, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: props.selected ? '#FFFFFF' : 'transparent' }}><View pointerEvents="none" style={{ width: props.selected ? 3 : 2, height: 16, borderRadius: 2, backgroundColor: props.selected ? '#151A20' : '#FFFFFFCC' }} /></View>;
}

function TinyButton(props: { label: string; danger?: boolean; disabled?: boolean; onPress: () => void }) { return <Pressable disabled={props.disabled} onPress={props.onPress} hitSlop={5} style={{ opacity: props.disabled ? 0.25 : 1 }}><Text style={{ color: props.danger ? '#FF7C8D' : '#9FAAB6', fontSize: 11, fontWeight: '900' }}>{props.label}</Text></Pressable>; }
function ZoomButton(props: { label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityLabel={props.label === '+' ? 'Zoom timeline in' : 'Zoom timeline out'} onPress={props.onPress} style={{ width: 42, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#242B34' }}><Text style={{ color: '#DFFF35', fontSize: 20, fontWeight: '900' }}>{props.label}</Text></Pressable>; }
function formatRulerTime(ms: number, intervalMs: number) { const minutes = Math.floor(ms / 60_000); const seconds = (ms % 60_000) / 1000; return intervalMs < 1000 ? `${minutes}:${seconds.toFixed(intervalMs < 500 ? 2 : 1).padStart(4, '0')}` : `${minutes}:${Math.floor(seconds).toString().padStart(2, '0')}`; }
function touchDistance(first?: { pageX: number; pageY: number }, second?: { pageX: number; pageY: number }) { if (!first || !second) return 0; return Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY); }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
