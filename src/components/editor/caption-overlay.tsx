import { useMemo, useRef } from 'react';
import {
  type GestureResponderEvent,
  PanResponder,
  type PanResponderGestureState,
  Pressable,
  Text,
  View,
} from 'react-native';

import { resolveCaptionStyle } from '@/lib/style-resolver';
import type { CaptionBlock, CaptionStyle, CaptionStylePatch, WordToken } from '@/types/project';

type TouchPoint = { pageX: number; pageY: number };
type CanvasMetrics = { width: number; height: number; pageX: number; pageY: number };

export function CaptionOverlay(props: {
  caption?: CaptionBlock;
  words: WordToken[];
  projectStyle: CaptionStyle;
  currentMs: number;
  interactive?: boolean;
  onInteractionStart?: () => void;
  onTransform?: (patch: CaptionStylePatch) => void;
  onTransformEnd?: () => void;
  onDelete?: () => void;
}) {
  const { caption } = props;
  const canvasRef = useRef<View>(null);
  const canvas = useRef<CanvasMetrics>({ width: 1, height: 1, pageX: 0, pageY: 0 });
  const style = caption ? resolveCaptionStyle(props.projectStyle, caption) : props.projectStyle;
  const styleRef = useRef(style);
  const propsRef = useRef(props);
  styleRef.current = style;
  propsRef.current = props;

  const gestureStart = useRef({
    position: { x: 0.5, y: 0.78 },
    box: { width: 0.86, height: 0.2 },
    fontSize: 48,
    rotation: 0,
    touches: [] as TouchPoint[],
    touchCount: 0,
  });

  const rebaseGesture = (touches: TouchPoint[]) => {
    const current = styleRef.current;
    gestureStart.current = {
      position: { ...current.position },
      box: { ...current.box },
      fontSize: current.fontSize,
      rotation: current.rotation,
      touches,
      touchCount: touches.length >= 2 ? 2 : 1,
    };
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => Boolean(propsRef.current.interactive),
        onMoveShouldSetPanResponder: () => Boolean(propsRef.current.interactive),
        onPanResponderGrant: (event) => {
          propsRef.current.onInteractionStart?.();
          rebaseGesture(readTouches(event));
        },
        onPanResponderMove: (event) => {
          const touches = readTouches(event);
          if (touches.length === 0) return;
          const touchCount = touches.length >= 2 ? 2 : 1;
          if (gestureStart.current.touchCount !== touchCount) {
            rebaseGesture(touches);
            return;
          }

          const start = gestureStart.current;
          const size = canvas.current;
          if (touchCount === 2 && start.touches.length >= 2) {
            const initialDistance = distance(start.touches[0], start.touches[1]);
            const nextDistance = distance(touches[0], touches[1]);
            const scale = initialDistance > 8 ? nextDistance / initialDistance : 1;
            const initialCenter = midpoint(start.touches[0], start.touches[1]);
            const nextCenter = midpoint(touches[0], touches[1]);
            const rotation =
              start.rotation +
              shortestAngleDelta(angle(start.touches[0], start.touches[1]), angle(touches[0], touches[1]));

            propsRef.current.onTransform?.({
              position: {
                x: clamp(start.position.x + (nextCenter.pageX - initialCenter.pageX) / size.width, 0.04, 0.96),
                y: clamp(start.position.y + (nextCenter.pageY - initialCenter.pageY) / size.height, 0.04, 0.96),
              },
              box: {
                width: clamp(start.box.width * scale, 0.16, 1.5),
                height: clamp(start.box.height * scale, 0.06, 1.1),
              },
              fontSize: clamp(start.fontSize * scale, 10, 240),
              rotation: normalizeDegrees(rotation),
            });
            return;
          }

          const initial = start.touches[0];
          propsRef.current.onTransform?.({
            position: {
              x: clamp(start.position.x + (touches[0].pageX - initial.pageX) / size.width, 0.04, 0.96),
              y: clamp(start.position.y + (touches[0].pageY - initial.pageY) / size.height, 0.04, 0.96),
            },
          });
        },
        onPanResponderRelease: () => propsRef.current.onTransformEnd?.(),
        onPanResponderTerminate: () => propsRef.current.onTransformEnd?.(),
      }),
    [],
  );

  if (!caption) return null;

  const captionWords = caption.wordIds
    .map((id) => props.words.find((word) => word.id === id))
    .filter((word): word is WordToken => Boolean(word));
  const renderedWords = captionWords.length > 0 ? captionWords : fallbackWords(caption);
  const backgroundAlpha = Math.round(style.background.opacity * 255).toString(16).padStart(2, '0');
  const transformed = (text: string) => {
    if (style.textTransform === 'uppercase') return text.toUpperCase();
    if (style.textTransform === 'lowercase') return text.toLowerCase();
    return text;
  };

  return (
    <View
      ref={canvasRef}
      pointerEvents="box-none"
      collapsable={false}
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        canvas.current = { ...canvas.current, width: Math.max(1, width), height: Math.max(1, height) };
        canvasRef.current?.measureInWindow((pageX, pageY) => {
          canvas.current = { ...canvas.current, pageX, pageY };
        });
      }}
      style={{ position: 'absolute', inset: 0 }}>
      <View
        {...panResponder.panHandlers}
        style={{
          position: 'absolute',
          left: `${(style.position.x - style.box.width / 2) * 100}%`,
          top: `${(style.position.y - style.box.height / 2) * 100}%`,
          width: `${style.box.width * 100}%`,
          height: `${style.box.height * 100}%`,
          minWidth: 52,
          minHeight: 34,
          alignItems: style.alignment === 'left' ? 'flex-start' : style.alignment === 'right' ? 'flex-end' : 'center',
          justifyContent: 'center',
          transform: [{ rotate: `${style.rotation}deg` }],
          borderWidth: props.interactive ? 2 : 0,
          borderColor: '#DFFF35',
          borderRadius: props.interactive ? 5 : 0,
        }}>
        <Text
          numberOfLines={style.maxLines}
          adjustsFontSizeToFit={false}
          style={{
            width: '100%',
            paddingHorizontal: style.background.paddingX,
            paddingVertical: style.background.paddingY,
            borderRadius: style.background.radius,
            overflow: 'hidden',
            backgroundColor: `${style.background.color}${backgroundAlpha}`,
            color: style.textColor,
            fontFamily: style.font.family,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            fontStyle: style.italic ? 'italic' : 'normal',
            lineHeight: style.fontSize * style.lineHeight,
            letterSpacing: style.letterSpacing,
            textAlign: style.alignment,
            textShadowColor: style.shadow.color,
            textShadowOffset: { width: style.shadow.offsetX, height: style.shadow.offsetY },
            textShadowRadius: Math.max(style.shadow.blur, style.stroke.width),
          }}>
          {renderedWords.map((word, index) => {
            const isActive = props.currentMs >= word.startMs && props.currentMs < word.endMs;
            const wordStyle = resolveCaptionStyle(props.projectStyle, caption, word);
            return (
              <Text
                key={word.id}
                style={{
                  color: isActive ? wordStyle.activeWordColor : wordStyle.textColor,
                  fontSize: isActive && style.animation.id === 'punch' ? wordStyle.fontSize * 1.15 : wordStyle.fontSize,
                }}>
                {index > 0 ? ' ' : ''}
                {transformed(word.text)}
              </Text>
            );
          })}
        </Text>

        {props.interactive ? (
          <>
            <ResizeBar axis="width" side={-1} styleRef={styleRef} canvas={canvas} onChange={props.onTransform} onEnd={props.onTransformEnd} />
            <ResizeBar axis="width" side={1} styleRef={styleRef} canvas={canvas} onChange={props.onTransform} onEnd={props.onTransformEnd} />
            <ResizeBar axis="height" side={-1} styleRef={styleRef} canvas={canvas} onChange={props.onTransform} onEnd={props.onTransformEnd} />
            <ResizeBar axis="height" side={1} styleRef={styleRef} canvas={canvas} onChange={props.onTransform} onEnd={props.onTransformEnd} />
            <RotateScaleHandle styleRef={styleRef} canvas={canvas} onChange={props.onTransform} onEnd={props.onTransformEnd} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete this subtitle"
              hitSlop={10}
              onPress={props.onDelete}
              style={{
                position: 'absolute',
                left: -20,
                top: -20,
                width: 40,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 20,
                borderWidth: 2,
                borderColor: '#11140C',
                backgroundColor: '#FF5267',
              }}>
              <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '900', lineHeight: 24 }}>×</Text>
            </Pressable>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                right: 8,
                bottom: -28,
                paddingHorizontal: 7,
                paddingVertical: 3,
                borderRadius: 8,
                backgroundColor: 'rgba(9,11,14,0.9)',
              }}>
              <Text style={{ color: '#DFFF35', fontSize: 9, fontWeight: '800' }}>
                {Math.round(style.box.width * 100)} × {Math.round(style.box.height * 100)} • {Math.round(style.rotation)}°
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

function ResizeBar(props: {
  axis: 'width' | 'height';
  side: -1 | 1;
  styleRef: React.RefObject<CaptionStyle>;
  canvas: React.RefObject<CanvasMetrics>;
  onChange?: (patch: CaptionStylePatch) => void;
  onEnd?: () => void;
}) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const start = useRef({
    box: { width: 0.86, height: 0.2 },
    position: { x: 0.5, y: 0.78 },
    rotation: 0,
  });
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: () => {
          const style = propsRef.current.styleRef.current;
          start.current = {
            box: { ...style.box },
            position: { ...style.position },
            rotation: style.rotation,
          };
        },
        onPanResponderMove: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
          const current = propsRef.current;
          const size = current.canvas.current;
          const radians = (start.current.rotation * Math.PI) / 180;
          const horizontal = current.axis === 'width';
          const axisX = horizontal ? Math.cos(radians) : -Math.sin(radians);
          const axisY = horizontal ? Math.sin(radians) : Math.cos(radians);
          const localDelta = gesture.dx * axisX + gesture.dy * axisY;
          const denominator = horizontal ? size.width : size.height;
          const minimum = horizontal ? 0.16 : 0.06;
          const maximum = horizontal ? 1.5 : 1.1;
          const original = horizontal ? start.current.box.width : start.current.box.height;
          const nextDimension = clamp(original + (localDelta * current.side) / denominator, minimum, maximum);
          const appliedHandleDelta = ((nextDimension - original) * denominator) / current.side;
          const centerPixelDelta = appliedHandleDelta / 2;
          const position = {
            x: clamp(start.current.position.x + (centerPixelDelta * axisX) / size.width, 0.04, 0.96),
            y: clamp(start.current.position.y + (centerPixelDelta * axisY) / size.height, 0.04, 0.96),
          };

          current.onChange?.(
            horizontal
              ? { box: { width: nextDimension }, position }
              : { box: { height: nextDimension }, position },
          );
        },
        onPanResponderRelease: () => propsRef.current.onEnd?.(),
        onPanResponderTerminate: () => propsRef.current.onEnd?.(),
      }),
    [],
  );

  const vertical = props.axis === 'width';
  return (
    <View
      {...responder.panHandlers}
      style={{
        position: 'absolute',
        ...(vertical
          ? { width: 34, height: 78, top: '50%', marginTop: -39, [props.side < 0 ? 'left' : 'right']: -18 }
          : { width: 78, height: 34, left: '50%', marginLeft: -39, [props.side < 0 ? 'top' : 'bottom']: -18 }),
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <View
        pointerEvents="none"
        style={{
          width: vertical ? 7 : 44,
          height: vertical ? 44 : 7,
          borderRadius: 7,
          backgroundColor: '#DFFF35',
          borderWidth: 2,
          borderColor: '#11140C',
        }}
      />
    </View>
  );
}

function RotateScaleHandle(props: {
  styleRef: React.RefObject<CaptionStyle>;
  canvas: React.RefObject<CanvasMetrics>;
  onChange?: (patch: CaptionStylePatch) => void;
  onEnd?: () => void;
}) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const start = useRef({
    distance: 1,
    angle: 0,
    box: { width: 0.86, height: 0.2 },
    fontSize: 48,
    rotation: 0,
  });
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: (event) => {
          const style = propsRef.current.styleRef.current;
          const size = propsRef.current.canvas.current;
          const point = firstTouch(event);
          const center = {
            pageX: size.pageX + style.position.x * size.width,
            pageY: size.pageY + style.position.y * size.height,
          };
          start.current = {
            distance: Math.max(8, distance(center, point)),
            angle: angle(center, point),
            box: { ...style.box },
            fontSize: style.fontSize,
            rotation: style.rotation,
          };
        },
        onPanResponderMove: (event) => {
          const style = propsRef.current.styleRef.current;
          const size = propsRef.current.canvas.current;
          const point = firstTouch(event);
          const center = {
            pageX: size.pageX + style.position.x * size.width,
            pageY: size.pageY + style.position.y * size.height,
          };
          const nextDistance = distance(center, point);
          const scale = nextDistance / start.current.distance;
          propsRef.current.onChange?.({
            box: {
              width: clamp(start.current.box.width * scale, 0.16, 1.5),
              height: clamp(start.current.box.height * scale, 0.06, 1.1),
            },
            fontSize: clamp(start.current.fontSize * scale, 10, 240),
            rotation: normalizeDegrees(
              start.current.rotation + shortestAngleDelta(start.current.angle, angle(center, point)),
            ),
          });
        },
        onPanResponderRelease: () => propsRef.current.onEnd?.(),
        onPanResponderTerminate: () => propsRef.current.onEnd?.(),
      }),
    [],
  );

  return (
    <View
      {...responder.panHandlers}
      style={{
        position: 'absolute',
        right: -23,
        bottom: -23,
        width: 46,
        height: 46,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 23,
        borderWidth: 2,
        borderColor: '#11140C',
        backgroundColor: '#DFFF35',
      }}>
      <Text pointerEvents="none" style={{ color: '#11140C', fontSize: 19, fontWeight: '900' }}>↻</Text>
    </View>
  );
}

function readTouches(event: GestureResponderEvent): TouchPoint[] {
  return event.nativeEvent.touches.map((touch) => ({ pageX: touch.pageX, pageY: touch.pageY }));
}

function firstTouch(event: GestureResponderEvent): TouchPoint {
  const touch = event.nativeEvent.touches[0] ?? event.nativeEvent.changedTouches[0];
  return { pageX: touch?.pageX ?? event.nativeEvent.pageX, pageY: touch?.pageY ?? event.nativeEvent.pageY };
}

function midpoint(a: TouchPoint, b: TouchPoint): TouchPoint {
  return { pageX: (a.pageX + b.pageX) / 2, pageY: (a.pageY + b.pageY) / 2 };
}

function distance(a: TouchPoint, b: TouchPoint) {
  return Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY);
}

function angle(a: TouchPoint, b: TouchPoint) {
  return (Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX) * 180) / Math.PI;
}

function shortestAngleDelta(from: number, to: number) {
  return normalizeDegrees(to - from);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeDegrees(value: number) {
  let result = value % 360;
  if (result > 180) result -= 360;
  if (result < -180) result += 360;
  return result;
}

function fallbackWords(caption: CaptionBlock): WordToken[] {
  const parts = caption.text.split(/\s+/).filter(Boolean);
  const duration = Math.max(1, caption.endMs - caption.startMs);
  return parts.map((text, index) => ({
    id: `${caption.id}-fallback-${index}`,
    text,
    startMs: caption.startMs + (duration * index) / parts.length,
    endMs: caption.startMs + (duration * (index + 1)) / parts.length,
  }));
}
