import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { CaptionBlock } from '@/types/project';
import type { CaptionTextChanges } from '@/lib/caption-text-edits';

export function ScriptEditor(props: {
  visible: boolean;
  captions: CaptionBlock[];
  initialCaptionId?: string;
  onSelectCaption: (caption: CaptionBlock) => void;
  onCancel: () => void;
  onSave: (changes: CaptionTextChanges) => Promise<void>;
}) {
  const listRef = useRef<FlatList<CaptionBlock>>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingCaptionId, setEditingCaptionId] = useState<string>();
  const [selectedCaptionId, setSelectedCaptionId] = useState<string>();
  const [emptyCaptionId, setEmptyCaptionId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const wasVisibleRef = useRef(false);

  const orderedCaptions = useMemo(
    () => [...props.captions].sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs),
    [props.captions],
  );

  const initialIndex = useMemo(() => {
    const index = orderedCaptions.findIndex((caption) => caption.id === props.initialCaptionId);
    return index < 0 ? 0 : index;
  }, [orderedCaptions, props.initialCaptionId]);

  useEffect(() => {
    const opening = props.visible && !wasVisibleRef.current;
    wasVisibleRef.current = props.visible;
    if (!opening) return;
    setDrafts(Object.fromEntries(orderedCaptions.map((caption) => [caption.id, caption.text])));
    setSelectedCaptionId(orderedCaptions[initialIndex]?.id);
    setEditingCaptionId(undefined);
    setEmptyCaptionId(undefined);
    setSaving(false);
    const timer = setTimeout(() => {
      if (orderedCaptions.length) {
        listRef.current?.scrollToIndex({ index: initialIndex, animated: false, viewPosition: 0.35 });
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [initialIndex, orderedCaptions, props.visible]);

  const selectForEditing = (caption: CaptionBlock) => {
    setSelectedCaptionId(caption.id);
    setEditingCaptionId(caption.id);
    setEmptyCaptionId(undefined);
    props.onSelectCaption(caption);
  };

  const save = async () => {
    if (saving) return;
    const empty = orderedCaptions.find((caption) => !(drafts[caption.id] ?? '').trim());
    if (empty) {
      const index = orderedCaptions.findIndex((caption) => caption.id === empty.id);
      setEmptyCaptionId(empty.id);
      setSelectedCaptionId(empty.id);
      setEditingCaptionId(empty.id);
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.4 });
      return;
    }
    setSaving(true);
    try {
      await props.onSave(drafts);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={saving ? undefined : props.onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: '#0D1014' }}>
        <View
          style={{
            minHeight: 76,
            paddingHorizontal: 18,
            paddingTop: 18,
            paddingBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderBottomWidth: 1,
            borderBottomColor: '#252B33',
          }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel caption edits"
            disabled={saving}
            hitSlop={10}
            onPress={props.onCancel}
            style={{ minWidth: 60, minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: '#A7B0BC', fontSize: 15, fontWeight: '700' }}>Cancel</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: '#F7F8FA', fontSize: 19, fontWeight: '900' }}>Edit captions</Text>
            <Text style={{ color: '#7F8996', fontSize: 11 }}>{orderedCaptions.length} subtitle blocks</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save all caption edits"
            disabled={saving}
            hitSlop={10}
            onPress={() => { void save(); }}
            style={{ minWidth: 60, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
            <Text style={{ color: '#DFFF35', fontSize: 24, fontWeight: '900', opacity: saving ? 0.45 : 1 }}>✓</Text>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={orderedCaptions}
          keyExtractor={(caption) => caption.id}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 48, gap: 8 }}
          ListHeaderComponent={(
            <Text style={{ marginBottom: 6, color: '#8E98A5', fontSize: 12, lineHeight: 17 }}>
              Tap any line to edit it. The preview and timeline jump to that caption. The checkmark saves the whole script as one undoable change.
            </Text>
          )}
          ListEmptyComponent={(
            <View style={{ paddingVertical: 64, alignItems: 'center', gap: 8 }}>
              <Text style={{ color: '#F7F8FA', fontSize: 17, fontWeight: '800' }}>No captions yet</Text>
              <Text style={{ color: '#8E98A5', textAlign: 'center' }}>Generate captions before opening the script editor.</Text>
            </View>
          )}
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            listRef.current?.scrollToOffset({ offset: Math.max(0, index * averageItemLength), animated: false });
            setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.4 }), 80);
          }}
          renderItem={({ item, index }) => {
            const selected = item.id === selectedCaptionId;
            const editing = item.id === editingCaptionId;
            const invalid = item.id === emptyCaptionId;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit caption ${index + 1} at ${formatTimestamp(item.startMs)}`}
                onPress={() => selectForEditing(item)}
                style={{
                  minHeight: 72,
                  flexDirection: 'row',
                  gap: 12,
                  padding: 12,
                  borderRadius: 15,
                  borderWidth: 1.5,
                  borderColor: invalid ? '#FF6680' : selected ? '#DFFF35' : '#252C35',
                  backgroundColor: selected ? '#1F281C' : '#171C22',
                }}>
                <View style={{ width: 54, paddingTop: 3 }}>
                  <Text style={{ color: selected ? '#DFFF35' : '#7F8996', fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] }}>
                    {formatTimestamp(item.startMs)}
                  </Text>
                  <Text style={{ marginTop: 4, color: '#5E6874', fontSize: 9, fontVariant: ['tabular-nums'] }}>
                    {formatTimestamp(item.endMs)}
                  </Text>
                </View>
                <View style={{ flex: 1, justifyContent: 'center' }}>
                  {editing ? (
                    <TextInput
                      autoFocus
                      multiline
                      maxLength={500}
                      value={drafts[item.id] ?? ''}
                      onChangeText={(text) => {
                        setDrafts((current) => ({ ...current, [item.id]: text }));
                        if (text.trim()) setEmptyCaptionId(undefined);
                      }}
                      selectionColor="#DFFF35"
                      style={{
                        minHeight: 44,
                        padding: 0,
                        color: '#F7F8FA',
                        fontSize: 16,
                        lineHeight: 22,
                        fontWeight: '600',
                        textAlignVertical: 'center',
                      }}
                    />
                  ) : (
                    <Text style={{ color: '#F7F8FA', fontSize: 16, lineHeight: 22, fontWeight: '600' }}>
                      {drafts[item.id] ?? item.text}
                    </Text>
                  )}
                  {invalid ? <Text style={{ marginTop: 4, color: '#FF8FA2', fontSize: 11 }}>A subtitle cannot be empty. Delete its timeline block instead.</Text> : null}
                </View>
              </Pressable>
            );
          }}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

function formatTimestamp(ms: number) {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor(tenths / 10) % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths % 10}`;
}
