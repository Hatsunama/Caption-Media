import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { spokenAnimationClock } from '../src/lib/animation-timing.ts';
import { reactionEmojis } from '../src/lib/animation-presets.ts';
import { groupWordsIntoCaptions } from '../src/lib/caption-grouping.ts';
import { alignWordsToSpeech } from '../src/lib/speech-alignment.ts';
import { packTimelineLanes } from '../src/lib/timeline-layout.ts';
import { minimumTimelineScale, timelineTickInterval, timelineWidth } from '../src/lib/timeline-scale.ts';
import { PREPARING_AUDIO_CUES } from '../src/lib/transcription-progress.ts';
import { humanVideoName, isMachineVideoName } from '../src/lib/project-presentation.ts';
import { buildClipTimeline, clipPlaybackVolume, mapSourceWordsToTimeline } from '../src/lib/video-timeline.ts';

test('Caption Studio has an isolated Android identity', () => {
  const appConfig = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
  assert.equal(appConfig.expo.android.package, 'com.hatsunama.captionstudio');
  assert.doesNotMatch(JSON.stringify(appConfig), /cuecam/i);
});

test('video acquisition links the selected source without a hidden picker copy', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const appConfig = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
  const mediaStorage = readFileSync(new URL('../src/services/media-import.ts', import.meta.url), 'utf8');
  assert.equal(packageJson.dependencies['expo-image-picker'], undefined);
  assert.equal(packageJson.dependencies['expo-media-library'], undefined);
  assert.doesNotMatch(JSON.stringify(appConfig.expo.plugins), /image-picker|media-library/);
  assert.match(mediaStorage, /type: 'video\/\*'[\s\S]*copyToCacheDirectory: false/);
  assert.match(mediaStorage, /multiple: true/);
  assert.match(mediaStorage, /persistReadPermission\(asset\.uri\)/);
});

test('provider URIs stay in persistence and never cross the navigation URL', () => {
  const projectsScreen = readFileSync(new URL('../src/app/index.tsx', import.meta.url), 'utf8');
  const editorScreen = readFileSync(new URL('../src/app/editor.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(projectsScreen, /params:\s*\{[^}]*uri:/);
  assert.doesNotMatch(editorScreen, /CaptionMedia|expo-document-picker|expo-image-picker/);
  assert.match(projectsScreen, /params: \{ projectId: project\.id \}/);
});

test('caption trim grips remain available on both edges without covering adjacent blocks', () => {
  const timeline = readFileSync(new URL('../src/components/editor/layer-timeline.tsx', import.meta.url), 'utf8');
  assert.match(timeline, /<TimingGrip side="start" \{\.\.\.props\} \/>/);
  assert.match(timeline, /<TimingGrip side="end" \{\.\.\.props\} \/>/);
  const grip = timeline.slice(timeline.indexOf('function TimingGrip'));
  assert.match(grip, /\[props\.side === 'start' \? 'left' : 'right'\]: 0/);
  assert.doesNotMatch(grip, /\[props\.side === 'start' \? 'left' : 'right'\]: -/);
});

test('downloaded transcription models are pinned by SHA-256', () => {
  const modelCatalog = readFileSync(new URL('../src/lib/model-catalog.ts', import.meta.url), 'utf8');
  const transcription = readFileSync(new URL('../src/services/transcription.ts', import.meta.url), 'utf8');
  assert.equal((modelCatalog.match(/sha256:/g) ?? []).length, 4);
  assert.match(transcription, /CaptionMedia\.sha256/);
  assert.match(transcription, /\.download/);
});

test('production builds cannot use the debug signing config', () => {
  const appConfig = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
  const patchScript = readFileSync(new URL('../scripts/patch-react-native-gradle.js', import.meta.url), 'utf8');
  const signingScript = readFileSync(new URL('../scripts/sign-android-release.js', import.meta.url), 'utf8');
  assert.match(patchScript, /hasCaptionStudioReleaseSigning/);
  assert.match(patchScript, /signingConfig signingConfigs\.release/);
  assert.match(signingScript, /CAPTION_STUDIO_RELEASE_STORE_FILE/);
  assert.match(signingScript, /migration \? \['--lineage'/);
  assert.deepEqual(appConfig.expo.android.blockedPermissions.sort(), [
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.WRITE_EXTERNAL_STORAGE',
  ]);
});

test('clip timeline has no dead space between source segments', () => {
  const timeline = buildClipTimeline([
    clip({ id: 'one', sourceStartMs: 5_000, sourceEndMs: 8_000 }),
    clip({ id: 'two', sourceStartMs: 20_000, sourceEndMs: 22_500 }),
  ]);
  assert.deepEqual(timeline.map(({ startMs, endMs }) => [startMs, endMs]), [[0, 3_000], [3_000, 5_500]]);
});

test('numeric camera filenames become human-readable project names', () => {
  assert.equal(isMachineVideoName('6306.mp4'), true);
  assert.equal(isMachineVideoName('VID_20260820_055214.mp4'), true);
  assert.equal(isMachineVideoName('Snapchat-1207096082.mp4'), true);
  assert.match(humanVideoName('6306.mp4', '2026-08-20T05:52:14-04:00'), /^Video · /);
  assert.equal(humanVideoName('Birthday at the beach.mp4', '2026-08-20T05:52:14-04:00'), 'Birthday at the beach');
});

test('leading and interior silence never produce caption words', () => {
  const words = [
    { id: 'hallucinated-opening', text: 'hello', startMs: 0, endMs: 400 },
    { id: 'spoken-one', text: 'actual', startMs: 10_100, endMs: 10_500 },
    { id: 'hallucinated-gap', text: 'ghost', startMs: 12_000, endMs: 12_300 },
    { id: 'spoken-two', text: 'speech', startMs: 15_100, endMs: 15_600 },
  ];
  const aligned = alignWordsToSpeech(words, [{ t0: 1_000, t1: 1_100 }, { t0: 1_500, t1: 1_600 }]);
  assert.deepEqual(aligned.map((word) => word.text), ['actual', 'speech']);
  assert.equal(aligned[0].startMs, 10_100);
});

test('VAD centiseconds preserve four seconds of leading silence', () => {
  const words = [
    { id: 'early', text: 'hallucination', startMs: 100, endMs: 500 },
    { id: 'spoken', text: 'testing', startMs: 4_120, endMs: 4_650 },
  ];
  const [spoken] = alignWordsToSpeech(words, [{ t0: 400, t1: 900 }]);
  assert.equal(spoken.text, 'testing');
  assert.equal(spoken.startMs, 4_120);
  assert.ok(spoken.startMs >= 4_000);
});

test('end-to-end captions share a lane and real overlaps get another lane', () => {
  const layout = packTimelineLanes([
    { id: 'a', startMs: 0, endMs: 1000 },
    { id: 'b', startMs: 1000, endMs: 2000 },
    { id: 'overlap', startMs: 900, endMs: 1200 },
  ]);
  assert.equal(layout.laneById.get('a'), 0);
  assert.equal(layout.laneById.get('b'), 0);
  assert.equal(layout.laneById.get('overlap'), 1);
  assert.equal(layout.laneCount, 2);
});

test('generated caption blocks remain chronological and never overlap', () => {
  const captions = groupWordsIntoCaptions([
    { id: 'w1', text: 'first', startMs: 4_000, endMs: 4_400 },
    { id: 'w2', text: 'caption', startMs: 4_450, endMs: 4_900 },
    { id: 'w3', text: 'second', startMs: 5_700, endMs: 6_100 },
    { id: 'w4', text: 'caption', startMs: 6_150, endMs: 6_600 },
  ]);
  assert.equal(captions.length, 2);
  assert.ok(captions[0].endMs <= captions[1].startMs);
  assert.equal(captions[0].startMs, 4_000);
});

test('preparing progress advances one percent every 22 seconds from 5% through 10%', () => {
  assert.deepEqual(PREPARING_AUDIO_CUES.map((cue) => cue.progress), [0.05, 0.06, 0.07, 0.08, 0.09, 0.1]);
  assert.deepEqual(PREPARING_AUDIO_CUES.slice(1).map((cue, index) => cue.afterMs - PREPARING_AUDIO_CUES[index].afterMs), [22_000, 22_000, 22_000, 22_000, 22_000]);
});

test('multi-source words are projected into the speed-aware ripple timeline', () => {
  const words = mapSourceWordsToTimeline([
    clip({ id: 'a', sourceId: 'first', sourceStartMs: 1_000, sourceEndMs: 3_000, playbackRate: 2 }),
    clip({ id: 'b', sourceId: 'second', sourceStartMs: 0, sourceEndMs: 2_000 }),
  ], {
    first: [{ id: 'one', text: 'fast', startMs: 1_500, endMs: 2_000 }],
    second: [{ id: 'two', text: 'next', startMs: 500, endMs: 1_000 }],
  });
  assert.deepEqual(words.map((word) => [word.text, word.startMs, word.endMs]), [
    ['fast', 250, 500],
    ['next', 1_500, 2_000],
  ]);
});

test('timeline zoom reaches a whole-project view and exposes fractional ruler ticks', () => {
  const minimum = minimumTimelineScale(10 * 60_000, 300);
  assert.equal(minimum, 0.5);
  assert.equal(timelineWidth(10 * 60_000, minimum, 300), 300);
  assert.equal(timelineTickInterval(240), 250);
});

test('clip audio fades are resolved by timeline position', () => {
  const fading = clip({ sourceEndMs: 4_000, volume: 0.8, fadeInMs: 1_000, fadeOutMs: 1_000 });
  assert.equal(clipPlaybackVolume(fading, 0), 0);
  assert.equal(clipPlaybackVolume(fading, 500), 0.4);
  assert.equal(clipPlaybackVolume(fading, 2_000), 0.8);
  assert.equal(clipPlaybackVolume(fading, 4_000), 0);
});

test('editor back navigation is an explicit save-or-discard transaction', () => {
  const editor = readFileSync(new URL('../src/app/editor.tsx', import.meta.url), 'utf8');
  assert.match(editor, /addListener\('beforeRemove'/);
  assert.match(editor, /saveEditorDraft\(projectRef\.current\)/);
  assert.match(editor, /discardEditorSession\(initialProject, projectRef\.current\)/);
});

test('screens delegate project mutations to domain and workflow layers', () => {
  const editor = readFileSync(new URL('../src/app/editor.tsx', import.meta.url), 'utf8');
  const projects = readFileSync(new URL('../src/app/index.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(editor, /updatedAt:\s*new Date/);
  assert.doesNotMatch(editor, /DocumentPicker|CaptionMedia|SQLite|FileSystem|services\/database/);
  assert.doesNotMatch(projects, /DocumentPicker|CaptionMedia|SQLite|FileSystem|services\/database/);
  assert.match(editor, /from '@\/lib\/project-editor'/);
  assert.match(projects, /deleteProjectCompletely/);
});

test('timeline follows playback, renders a ruler, and offers an append-video control', () => {
  const timeline = readFileSync(new URL('../src/components/editor/layer-timeline.tsx', import.meta.url), 'utf8');
  assert.match(timeline, /if \(!props\.isPlaying\) return/);
  assert.match(timeline, /playhead - viewportWidth \/ 2/);
  assert.match(timeline, /TimelineRuler/);
  assert.match(timeline, /onAddVideos/);
});

test('animation progress follows the active spoken word', () => {
  const first = spokenAnimationClock({ currentMs: 1_100, captionStartMs: 1_000, captionEndMs: 3_000, animationDurationMs: 300, activeWord: { startMs: 1_000, endMs: 1_400 } });
  const secondStart = spokenAnimationClock({ currentMs: 2_000, captionStartMs: 1_000, captionEndMs: 3_000, animationDurationMs: 300, activeWord: { startMs: 2_000, endMs: 2_500 } });
  assert.equal(first.wordProgress, 0.25);
  assert.equal(secondStart.wordProgress, 0);
  assert.equal(secondStart.entryProgress, 0);
});

test('emoji reactions change with the spoken word', () => {
  assert.deepEqual(reactionEmojis('money'), ['💸', '🤑', '💰', '🪙']);
  assert.deepEqual(reactionEmojis('camera'), ['🎥', '📸', '🎬', '📱']);
  assert.notDeepEqual(reactionEmojis('money'), reactionEmojis('sad'));
});

function clip(overrides = {}) {
  return {
    id: 'clip',
    sourceId: 'source',
    sourceStartMs: 0,
    sourceEndMs: 1_000,
    playbackRate: 1,
    volume: 1,
    muted: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...overrides,
  };
}
