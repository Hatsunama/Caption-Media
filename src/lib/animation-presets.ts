import type { CaptionAnimationId } from '@/types/project';

export type AnimationPreset = {
  id: CaptionAnimationId;
  name: string;
  icon: string;
  description: string;
  intensity: number;
  durationMs: number;
  accent: string;
};

export const ANIMATION_PRESETS: AnimationPreset[] = [
  { id: 'none', name: 'Classic', icon: 'Aa', description: 'Clean and steady', intensity: 0, durationMs: 1, accent: '#F7F8FA' },
  { id: 'active-word', name: 'Spotlight', icon: '●', description: 'Spoken word lights up', intensity: 0.12, durationMs: 160, accent: '#DFFF35' },
  { id: 'karaoke', name: 'Karaoke', icon: '▰', description: 'Color sweeps forward', intensity: 0.16, durationMs: 180, accent: '#FFC247' },
  { id: 'single-word', name: 'One Word', icon: 'ONE', description: 'One word at a time', intensity: 0.2, durationMs: 140, accent: '#67E8F9' },
  { id: 'pop', name: 'Bubble Pop', icon: 'POP', description: 'Words spring into view', intensity: 0.24, durationMs: 240, accent: '#FF70C8' },
  { id: 'bounce', name: 'Bounce', icon: '↟', description: 'Each word hops', intensity: 0.28, durationMs: 320, accent: '#7DFFB2' },
  { id: 'punch', name: 'Punch', icon: 'BAM', description: 'Hard word impact', intensity: 0.36, durationMs: 180, accent: '#FF5267' },
  { id: 'typewriter', name: 'Typewriter', icon: '⌨', description: 'Builds word by word', intensity: 0.16, durationMs: 120, accent: '#E2E8F0' },
  { id: 'slide-up', name: 'Lift Off', icon: '↑', description: 'Rises from below', intensity: 0.3, durationMs: 420, accent: '#A985F8' },
  { id: 'slide-left', name: 'Side Swipe', icon: '←', description: 'Rushes in sideways', intensity: 0.36, durationMs: 420, accent: '#46D5FF' },
  { id: 'zoom-in', name: 'Mega Zoom', icon: '◎', description: 'Zooms from tiny', intensity: 0.42, durationMs: 360, accent: '#FFE566' },
  { id: 'spin-in', name: 'Spin In', icon: '↻', description: 'Twists into place', intensity: 0.5, durationMs: 420, accent: '#FF8A5C' },
  { id: 'wave', name: 'Word Wave', icon: '〰', description: 'Words ripple independently', intensity: 0.28, durationMs: 620, accent: '#45F0D1' },
  { id: 'shake', name: 'Quake', icon: '≋', description: 'Rapid energetic shake', intensity: 0.32, durationMs: 260, accent: '#FF5D5D' },
  { id: 'glow-pulse', name: 'Neon Pulse', icon: '✦', description: 'Breathing neon glow', intensity: 0.3, durationMs: 720, accent: '#5CFFFA' },
  { id: 'elastic', name: 'Rubber Band', icon: '↔', description: 'Stretchy overshoot', intensity: 0.4, durationMs: 500, accent: '#DFFF35' },
  { id: 'flip', name: 'Card Flip', icon: '◩', description: '3D flip reveal', intensity: 0.42, durationMs: 420, accent: '#C4A7FF' },
  { id: 'stomp', name: 'Stomp', icon: '▼', description: 'Drops with heavy impact', intensity: 0.48, durationMs: 320, accent: '#FFB347' },
  { id: 'emoji-burst', name: 'Emoji Burst', icon: '💥', description: 'Reactions explode outward', intensity: 0.5, durationMs: 680, accent: '#FFDA57' },
  { id: 'emoji-orbit', name: 'Emoji Orbit', icon: '😍', description: 'Reactions circle the words', intensity: 0.44, durationMs: 1100, accent: '#FF70C8' },
  { id: 'emoji-rain', name: 'Emoji Rain', icon: '🔥', description: 'Reactions fall across screen', intensity: 0.52, durationMs: 900, accent: '#FF7A3D' },
];

export function findAnimationPreset(id: CaptionAnimationId) {
  return ANIMATION_PRESETS.find((preset) => preset.id === id) ?? ANIMATION_PRESETS[0];
}

export function reactionEmojis(text: string): string[] {
  const normalized = text.toLowerCase();
  if (/love|heart|beautiful|cute|kiss/.test(normalized)) return ['❤️', '😍', '💖', '✨', '🥰'];
  if (/laugh|funny|lol|haha|joke/.test(normalized)) return ['😂', '🤣', '😆', '💀', '✨'];
  if (/money|cash|dollar|paid|rich|price/.test(normalized)) return ['💸', '🤑', '💰', '🔥', '✨'];
  if (/wow|amazing|wild|crazy|shock|what/.test(normalized)) return ['🤯', '😱', '👀', '⚡', '✨'];
  if (/sad|cry|hurt|miss|sorry/.test(normalized)) return ['😢', '😭', '💔', '🥺', '💧'];
  if (/angry|mad|hate|rage|fight/.test(normalized)) return ['😡', '🤬', '💢', '🔥', '👊'];
  if (/win|best|great|yes|go|power|strong/.test(normalized)) return ['🔥', '🏆', '💪', '⚡', '🚀'];
  return ['✨', '🔥', '💥', '👏', '⚡'];
}
