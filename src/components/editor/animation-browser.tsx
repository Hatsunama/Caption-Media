import { Pressable, ScrollView, Text, View } from 'react-native';

import { ANIMATION_PRESETS } from '@/lib/animation-presets';
import type { CaptionAnimationId } from '@/types/project';

export function AnimationBrowser(props: {
  selected: CaptionAnimationId;
  textLayerSelected?: boolean;
  scope: 'caption' | 'all';
  hasSelectedCaption: boolean;
  onScopeChange: (scope: 'caption' | 'all') => void;
  onSelect: (id: CaptionAnimationId) => void;
}) {
  return (
    <View style={{ gap: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: '#F7F8FA', fontSize: 13, fontWeight: '800' }}>21 real animation styles</Text>
        {props.textLayerSelected ? (
          <View style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, backgroundColor: '#A985F8' }}>
            <Text style={{ color: '#150D22', fontSize: 9, fontWeight: '900' }}>THIS TEXT LAYER</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', padding: 3, borderRadius: 10, backgroundColor: '#171C22' }}>
            <ScopeButton
              label="This caption"
              active={props.scope === 'caption'}
              disabled={!props.hasSelectedCaption}
              onPress={() => props.onScopeChange('caption')}
            />
            <ScopeButton label="All captions" active={props.scope === 'all'} onPress={() => props.onScopeChange('all')} />
          </View>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingRight: 18 }}>
        {ANIMATION_PRESETS.map((preset) => {
          const active = props.selected === preset.id;
          return (
            <Pressable
              key={preset.id}
              accessibilityRole="button"
              accessibilityLabel={`${preset.name}: ${preset.description}`}
              onPress={() => props.onSelect(preset.id)}
              style={{
                width: 116,
                minHeight: 92,
                padding: 10,
                gap: 4,
                borderRadius: 15,
                borderWidth: active ? 2 : 1,
                borderColor: active ? preset.accent : '#2A323C',
                backgroundColor: active ? '#232B31' : '#171C22',
              }}>
              <Text style={{ color: preset.accent, fontSize: 22, fontWeight: '900' }}>{preset.icon}</Text>
              <Text style={{ color: '#F7F8FA', fontSize: 12, fontWeight: '800' }}>{preset.name}</Text>
              <Text numberOfLines={2} style={{ color: '#939EAB', fontSize: 9, lineHeight: 12 }}>{preset.description}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ScopeButton(props: { label: string; active: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      disabled={props.disabled}
      onPress={props.onPress}
      style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, opacity: props.disabled ? 0.35 : 1, backgroundColor: props.active ? '#DFFF35' : 'transparent' }}>
      <Text style={{ color: props.active ? '#11140C' : '#AEB7C2', fontSize: 9, fontWeight: '800' }}>{props.label}</Text>
    </Pressable>
  );
}
