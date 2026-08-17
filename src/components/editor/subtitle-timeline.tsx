import { useMemo, useRef } from 'react';
import { PanResponder, Pressable, ScrollView, Text, View } from 'react-native';

import type { CaptionBlock } from '@/types/project';

export function SubtitleTimeline(props: {
  captions: CaptionBlock[];
  selectedId?: string;
  currentMs: number;
  durationMs: number;
  onSelect: (caption: CaptionBlock) => void;
  onTimingChange: (captionId: string, startMs: number, endMs: number) => void;
  onTimingChangeEnd: () => void;
  onDelete: (caption: CaptionBlock) => void;
}) {
  if (props.captions.length === 0) {
    return (
      <View
        style={{
          minHeight: 88,
          justifyContent: 'center',
          alignItems: 'center',
          borderRadius: 16,
          backgroundColor: '#11151A',
        }}>
        <Text style={{ color: '#87919E', fontSize: 13 }}>Caption blocks will appear here.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 5 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
        {props.captions.map((caption) => (
          <TimelineCard
            key={caption.id}
            caption={caption}
            selected={caption.id === props.selectedId}
            active={props.currentMs >= caption.startMs && props.currentMs < caption.endMs}
            durationMs={props.durationMs}
            onSelect={props.onSelect}
            onTimingChange={props.onTimingChange}
            onTimingChangeEnd={props.onTimingChangeEnd}
            onDelete={props.onDelete}
          />
        ))}
      </ScrollView>
      <Text style={{ color: '#68727F', fontSize: 10, paddingLeft: 5 }}>
        Select a block, then drag its lime left/right grips to change its timing.
      </Text>
    </View>
  );
}

function TimelineCard(props: {
  caption: CaptionBlock;
  selected: boolean;
  active: boolean;
  durationMs: number;
  onSelect: (caption: CaptionBlock) => void;
  onTimingChange: (captionId: string, startMs: number, endMs: number) => void;
  onTimingChangeEnd: () => void;
  onDelete: (caption: CaptionBlock) => void;
}) {
  return (
    <Pressable
      onPress={() => props.onSelect(props.caption)}
      style={{
        width: 176,
        minHeight: 82,
        justifyContent: 'space-between',
        paddingHorizontal: props.selected ? 24 : 12,
        paddingVertical: 11,
        borderRadius: 13,
        backgroundColor: props.selected ? '#DFFF35' : props.active ? '#303A29' : '#242A32',
        borderWidth: 2,
        borderColor: props.selected ? '#DFFF35' : props.active ? '#8CA02A' : 'transparent',
      }}>
      <Text numberOfLines={2} style={{ color: props.selected ? '#12150B' : '#F7F8FA', fontSize: 13, lineHeight: 17, fontWeight: '800' }}>
        {props.caption.text}
      </Text>
      <Text style={{ color: props.selected ? '#34400D' : '#929CAA', fontSize: 10, fontVariant: ['tabular-nums'] }}>
        {formatTime(props.caption.startMs)} – {formatTime(props.caption.endMs)}
      </Text>

      {props.selected ? (
        <>
          <TimingHandle side="start" {...props} />
          <TimingHandle side="end" {...props} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete this subtitle block"
            hitSlop={8}
            onPress={() => props.onDelete(props.caption)}
            style={{
              position: 'absolute',
              top: 5,
              right: 20,
              width: 26,
              height: 26,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 13,
              backgroundColor: '#FF5267',
            }}>
            <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '900', lineHeight: 19 }}>×</Text>
          </Pressable>
        </>
      ) : null}
    </Pressable>
  );
}

function TimingHandle(props: {
  side: 'start' | 'end';
  caption: CaptionBlock;
  durationMs: number;
  onTimingChange: (captionId: string, startMs: number, endMs: number) => void;
  onTimingChangeEnd: () => void;
}) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const start = useRef({ startMs: 0, endMs: 100 });
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: () => {
          start.current = {
            startMs: propsRef.current.caption.startMs,
            endMs: propsRef.current.caption.endMs,
          };
        },
        onPanResponderMove: (_event, gesture) => {
          const current = propsRef.current;
          const deltaMs = Math.round(gesture.dx * 15);
          if (current.side === 'start') {
            current.onTimingChange(
              current.caption.id,
              clamp(start.current.startMs + deltaMs, 0, start.current.endMs - 100),
              start.current.endMs,
            );
          } else {
            current.onTimingChange(
              current.caption.id,
              start.current.startMs,
              clamp(start.current.endMs + deltaMs, start.current.startMs + 100, Math.max(start.current.startMs + 100, current.durationMs)),
            );
          }
        },
        onPanResponderRelease: () => propsRef.current.onTimingChangeEnd(),
        onPanResponderTerminate: () => propsRef.current.onTimingChangeEnd(),
      }),
    [],
  );

  return (
    <View
      {...responder.panHandlers}
      style={{
        position: 'absolute',
        top: -2,
        bottom: -2,
        width: 32,
        [props.side === 'start' ? 'left' : 'right']: -8,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <View
        pointerEvents="none"
        style={{
          width: 8,
          height: 52,
          borderRadius: 5,
          borderWidth: 2,
          borderColor: '#11140C',
          backgroundColor: '#DFFF35',
        }}
      />
    </View>
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatTime(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}
