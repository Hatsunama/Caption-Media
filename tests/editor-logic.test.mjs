import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { spokenAnimationClock } from '../src/lib/animation-timing.ts';
import { reactionEmojis } from '../src/lib/animation-presets.ts';
import { groupWordsIntoCaptions } from '../src/lib/caption-grouping.ts';
import { alignWordsToSpeech } from '../src/lib/speech-alignment.ts';
import { packTimelineLanes } from '../src/lib/timeline-layout.ts';
import { PREPARING_AUDIO_CUES } from '../src/lib/transcription-progress.ts';
import { humanVideoName, isMachineVideoName } from '../src/lib/project-presentation.ts';

test('Caption Studio has an isolated Android identity', () => {
  const appConfig = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
  assert.equal(appConfig.expo.android.package, 'com.hatsunama.captionstudio');
  assert.doesNotMatch(JSON.stringify(appConfig), /cuecam/i);
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

test('preparing progress moves to 5%, then waits 20 seconds for 10%', () => {
  assert.deepEqual(PREPARING_AUDIO_CUES.map((cue) => cue.progress), [0.05, 0.1]);
  assert.equal(PREPARING_AUDIO_CUES[1].afterMs - PREPARING_AUDIO_CUES[0].afterMs, 20_000);
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
