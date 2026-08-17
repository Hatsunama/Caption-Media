import { useMemo, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Font from 'expo-font';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';

import { BUILT_IN_FONT_CHOICES, type FontChoice } from '@/lib/font-catalog';

type Filter = 'all' | 'favorites' | 'recent' | 'imported';

export function FontBrowser(props: {
  visible: boolean;
  previewText: string;
  onClose: () => void;
  onSelect: (choice: FontChoice) => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [imported, setImported] = useState<FontChoice[]>([]);
  const [favorites, setFavorites] = useState<string[]>(['bungee', 'monoton', 'rubik-glitch']);
  const [recent, setRecent] = useState<string[]>([]);
  const allFonts = useMemo(() => [...imported, ...BUILT_IN_FONT_CHOICES], [imported]);
  const fonts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allFonts.filter((choice) => {
      if (query && !`${choice.name} ${choice.mood}`.toLowerCase().includes(query)) return false;
      if (filter === 'favorites') return favorites.includes(choice.font.id);
      if (filter === 'recent') return recent.includes(choice.font.id);
      if (filter === 'imported') return choice.font.source === 'imported';
      return true;
    });
  }, [allFonts, favorites, filter, recent, search]);

  const selectFont = (choice: FontChoice) => {
    setRecent((current) => [choice.font.id, ...current.filter((id) => id !== choice.font.id)].slice(0, 8));
    props.onSelect(choice);
  };

  const importFont = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['font/ttf', 'font/otf', 'application/x-font-ttf', 'application/x-font-opentype', 'application/vnd.ms-opentype'],
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
    const name = asset.name.replace(/\.(ttf|otf)$/i, '');
    const choice: FontChoice = {
      font: { id: family, family, source: 'imported', uri: destination.uri, postScriptName: name },
      name,
      mood: 'Your imported font',
      treatment: 'solid',
    };
    setImported((current) => [choice, ...current]);
    setFilter('imported');
  };

  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <View style={{ flex: 1, backgroundColor: '#0D1014', paddingTop: 20 }}>
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#F7F8FA', fontSize: 26, fontWeight: '800' }}>All Fonts</Text>
              <Text style={{ color: '#919BA8', fontSize: 13 }}>32 varied free fonts, favorites, recent, and imports.</Text>
            </View>
            <Pressable onPress={props.onClose} hitSlop={12}>
              <Text style={{ color: '#DFFF35', fontSize: 16, fontWeight: '700' }}>Done</Text>
            </Pressable>
          </View>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name or mood"
            placeholderTextColor="#707A87"
            style={{ height: 48, borderRadius: 14, paddingHorizontal: 15, color: '#F7F8FA', backgroundColor: '#1A1F26' }}
          />
          <View style={{ flexDirection: 'row', gap: 7 }}>
            <FilterChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
            <FilterChip label="★ Favorites" active={filter === 'favorites'} onPress={() => setFilter('favorites')} />
            <FilterChip label="Recent" active={filter === 'recent'} onPress={() => setFilter('recent')} />
            <FilterChip label="My Fonts" active={filter === 'imported'} onPress={() => setFilter('imported')} />
          </View>
          <Pressable
            onPress={importFont}
            style={{ padding: 14, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#DFFF35' }}>
            <Text style={{ color: '#11140C', fontWeight: '800' }}>Import unlimited .ttf or .otf fonts</Text>
            <Text style={{ color: '#11140C', fontSize: 22 }}>＋</Text>
          </Pressable>
        </View>

        <FlatList
          contentInsetAdjustmentBehavior="automatic"
          data={fonts}
          keyExtractor={(item) => item.font.id}
          contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 48 }}
          ListEmptyComponent={<Text style={{ color: '#919BA8', textAlign: 'center', padding: 30 }}>No fonts match this view.</Text>}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => selectFont(item)}
              style={{ minHeight: 94, justifyContent: 'center', gap: 7, paddingHorizontal: 16, borderRadius: 17, backgroundColor: '#191E25' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, flexDirection: 'row', gap: 7, alignItems: 'center' }}>
                  <Text style={{ color: '#D5DBE2', fontSize: 12, fontWeight: '800' }}>{item.name}</Text>
                  <Text numberOfLines={1} style={{ flexShrink: 1, color: '#707B88', fontSize: 10 }}>{item.mood}</Text>
                  {item.treatment !== 'solid' ? (
                    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: '#34264A' }}>
                      <Text style={{ color: '#EBCBFF', fontSize: 8, fontWeight: '900' }}>2 COLOR</Text>
                    </View>
                  ) : null}
                </View>
                <Pressable
                  hitSlop={12}
                  onPress={(event) => {
                    event.stopPropagation();
                    setFavorites((current) => current.includes(item.font.id) ? current.filter((id) => id !== item.font.id) : [...current, item.font.id]);
                  }}>
                  <Text style={{ color: favorites.includes(item.font.id) ? '#DFFF35' : '#66717E', fontSize: 20 }}>★</Text>
                </Pressable>
              </View>
              <FontPreview choice={item} text={props.previewText || 'Make every word count'} />
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

function FontPreview(props: { choice: FontChoice; text: string }) {
  const primary = props.choice.colors?.primary ?? '#F7F8FA';
  const secondary = props.choice.colors?.secondary;
  return (
    <View style={{ minHeight: 36, justifyContent: 'center' }}>
      {secondary ? (
        <Text
          numberOfLines={1}
          style={{ position: 'absolute', left: 2, top: 4, right: -2, color: secondary, fontFamily: props.choice.font.family, fontSize: 25, fontWeight: '400' }}>
          {props.text}
        </Text>
      ) : null}
      <Text numberOfLines={1} style={{ color: primary, fontFamily: props.choice.font.family, fontSize: 25, fontWeight: '400' }}>
        {props.text}
      </Text>
    </View>
  );
}

function FilterChip(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999, backgroundColor: props.active ? '#354212' : '#20262E' }}>
      <Text style={{ color: props.active ? '#DFFF35' : '#D4DAE1', fontSize: 10, fontWeight: props.active ? '800' : '500' }}>{props.label}</Text>
    </Pressable>
  );
}
