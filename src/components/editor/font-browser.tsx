import { useMemo, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Font from 'expo-font';
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { FontReference } from '@/types/project';

const BUILT_IN_FONTS: FontReference[] = [
  { id: 'system-sans', family: 'sans-serif', source: 'built-in' },
  { id: 'system-condensed', family: 'sans-serif-condensed', source: 'built-in' },
  { id: 'system-serif', family: 'serif', source: 'built-in' },
  { id: 'system-mono', family: 'monospace', source: 'built-in' },
];

const LABELS: Record<string, string> = {
  'system-sans': 'System Sans',
  'system-condensed': 'Condensed Bold',
  'system-serif': 'Editorial Serif',
  'system-mono': 'Creator Mono',
};

export function FontBrowser(props: {
  visible: boolean;
  previewText: string;
  onClose: () => void;
  onSelect: (font: FontReference) => void;
}) {
  const [search, setSearch] = useState('');
  const [imported, setImported] = useState<FontReference[]>([]);
  const [favorites, setFavorites] = useState<string[]>(['system-condensed']);
  const fonts = useMemo(
    () => [...imported, ...BUILT_IN_FONTS].filter((font) => displayName(font).toLowerCase().includes(search.toLowerCase())),
    [imported, search],
  );

  const importFont = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'font/ttf',
        'font/otf',
        'application/x-font-ttf',
        'application/x-font-opentype',
        'application/vnd.ms-opentype',
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    const extension = asset.name.toLowerCase().endsWith('.otf') ? '.otf' : '.ttf';
    const family = `imported-${Date.now()}`;
    const directory = new Directory(Paths.document, 'fonts');
    directory.create({ idempotent: true, intermediates: true });
    const destination = new File(directory, `${family}${extension}`);
    await new File(asset.uri).copy(destination, { overwrite: true });
    await Font.loadAsync({ [family]: destination.uri });
    const font: FontReference = {
      id: family,
      family,
      source: 'imported',
      uri: destination.uri,
      postScriptName: asset.name.replace(/\.(ttf|otf)$/i, ''),
    };
    setImported((current) => [font, ...current]);
  };

  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <View style={{ flex: 1, backgroundColor: '#0D1014', paddingTop: 20 }}>
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: '#F7F8FA', fontSize: 26, fontWeight: '800' }}>Fonts</Text>
              <Text style={{ color: '#919BA8', fontSize: 13 }}>Built-in and imported fonts, all in one place.</Text>
            </View>
            <Pressable onPress={props.onClose} hitSlop={12}>
              <Text style={{ color: '#DFFF35', fontSize: 16, fontWeight: '700' }}>Done</Text>
            </Pressable>
          </View>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search fonts"
            placeholderTextColor="#707A87"
            style={{
              height: 48,
              borderRadius: 14,
              paddingHorizontal: 15,
              color: '#F7F8FA',
              backgroundColor: '#1A1F26',
            }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['★ Favorites', 'Recently used', 'My fonts', 'Built-in'].map((label) => (
              <View key={label} style={{ paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: '#20262E' }}>
                <Text style={{ color: '#D4DAE1', fontSize: 12 }}>{label}</Text>
              </View>
            ))}
          </View>
          <Pressable
            onPress={importFont}
            style={{
              padding: 14,
              borderRadius: 15,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#DFFF35',
            }}>
            <Text style={{ color: '#11140C', fontWeight: '800' }}>Import .ttf or .otf</Text>
            <Text style={{ color: '#11140C', fontSize: 22 }}>＋</Text>
          </Pressable>
        </View>

        <FlatList
          contentInsetAdjustmentBehavior="automatic"
          data={fonts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 48 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => props.onSelect(item)}
              style={{
                minHeight: 84,
                justifyContent: 'center',
                gap: 6,
                paddingHorizontal: 16,
                borderRadius: 17,
                backgroundColor: '#191E25',
              }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#99A3B0', fontSize: 12 }}>{displayName(item)}</Text>
                <Pressable
                  hitSlop={12}
                  onPress={(event) => {
                    event.stopPropagation();
                    setFavorites((current) =>
                      current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
                    );
                  }}>
                  <Text style={{ color: favorites.includes(item.id) ? '#DFFF35' : '#66717E', fontSize: 20 }}>★</Text>
                </Pressable>
              </View>
              <Text numberOfLines={1} style={{ color: '#F7F8FA', fontFamily: item.family, fontSize: 24 }}>
                {props.previewText || 'Make every word count'}
              </Text>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

function displayName(font: FontReference) {
  return font.postScriptName || LABELS[font.id] || font.family;
}
