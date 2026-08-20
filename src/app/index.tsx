import { useCallback, useState } from 'react';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';

import { humanVideoName } from '@/lib/project-presentation';
import { listProjects, saveProject } from '@/services/database';
import { ensureProjectThumbnail, preserveImportedVideo } from '@/services/media-storage';
import type { CaptionProject } from '@/types/project';

const palette = {
  background: '#090B0E',
  surface: '#14181E',
  surfaceRaised: '#1B2028',
  text: '#F7F8FA',
  muted: '#9DA7B5',
  accent: '#DFFF35',
  border: '#282F39',
};

export default function ProjectsScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<CaptionProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const storedProjects = await listProjects();
      const preparedProjects: CaptionProject[] = [];
      for (const stored of storedProjects) {
        const name = humanVideoName(stored.name, stored.createdAt);
        const thumbnailUri = await ensureProjectThumbnail({
          projectId: stored.id,
          videoUri: stored.source.uri,
          thumbnailUri: stored.source.thumbnailUri,
        });
        if (name === stored.name && thumbnailUri === stored.source.thumbnailUri) {
          preparedProjects.push(stored);
          continue;
        }
        const prepared: CaptionProject = {
          ...stored,
          name,
          source: { ...stored.source, displayName: name, thumbnailUri },
        };
        await saveProject(prepared);
        preparedProjects.push(prepared);
      }
      setProjects(preparedProjects);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const importVideo = async () => {
    setImporting(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      const importedAt = Date.now();
      const projectId = `project-${importedAt}`;
      const preserved = await preserveImportedVideo({
        projectId,
        sourceUri: asset.uri,
        fileName: asset.fileName,
      });
      const projectName = humanVideoName(asset.fileName, importedAt);
      router.push({
        pathname: '/editor',
        params: {
          uri: preserved.videoUri,
          thumbnailUri: preserved.thumbnailUri ?? '',
          name: projectName,
          durationMs: String(asset.duration ?? 0),
          projectId,
        },
      });
    } catch (error) {
      Alert.alert(
        'Could not import video',
        error instanceof Error ? error.message : 'The selected video could not be copied.',
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 48 }}
      data={projects}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={{ gap: 18 }}>
          <View style={{ gap: 6 }}>
            <Text selectable style={{ color: palette.text, fontSize: 30, fontWeight: '800' }}>
              Captions first.
            </Text>
            <Text selectable style={{ color: palette.muted, fontSize: 16, lineHeight: 23 }}>
              Import a video, generate captions locally, then style every word without credits,
              quotas, or a watermark.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Import a video"
            disabled={importing}
            onPress={importVideo}
            style={({ pressed }) => ({
              minHeight: 142,
              borderRadius: 24,
              padding: 20,
              justifyContent: 'space-between',
              backgroundColor: pressed ? '#CDEB2B' : palette.accent,
            })}>
            <Text style={{ color: '#11140C', fontSize: 16, fontWeight: '700' }}>
              NEW PROJECT
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <Text style={{ color: '#11140C', fontSize: 28, lineHeight: 32, fontWeight: '900' }}>
                Import video{`\n`}→ Generate captions
              </Text>
              {importing ? <ActivityIndicator color="#11140C" /> : <Text style={{ fontSize: 36 }}>＋</Text>}
            </View>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {['Offline after model download', 'No watermark', 'Unlimited styles'].map((label) => (
              <View
                key={label}
                style={{
                  flex: 1,
                  minHeight: 74,
                  justifyContent: 'center',
                  borderRadius: 16,
                  padding: 12,
                  backgroundColor: palette.surface,
                  borderWidth: 1,
                  borderColor: palette.border,
                }}>
                <Text style={{ color: palette.text, fontSize: 12, lineHeight: 16, fontWeight: '600' }}>
                  {label}
                </Text>
              </View>
            ))}
          </View>

          <Text selectable style={{ color: palette.text, fontSize: 19, fontWeight: '700', marginTop: 6 }}>
            Projects
          </Text>
        </View>
      }
      ListEmptyComponent={
        <View
          style={{
            minHeight: 150,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderRadius: 20,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: palette.border,
          }}>
          {loading ? (
            <ActivityIndicator color={palette.accent} />
          ) : (
            <>
              <Text style={{ color: palette.text, fontSize: 17, fontWeight: '700' }}>No projects yet</Text>
              <Text style={{ color: palette.muted, fontSize: 14 }}>Your first import will appear here.</Text>
            </>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/editor',
              params: {
                projectId: item.id,
                uri: item.source.uri,
                name: item.name,
                durationMs: String(item.source.durationMs),
              },
            })
          }
          style={{
            flexDirection: 'row',
            gap: 14,
            padding: 12,
            borderRadius: 18,
            backgroundColor: palette.surfaceRaised,
          }}>
          {item.source.thumbnailUri ? (
            <Image
              source={{ uri: item.source.thumbnailUri }}
              style={{ width: 74, height: 74, borderRadius: 12, backgroundColor: '#050607' }}
              contentFit="cover"
              transition={160}
            />
          ) : (
            <View style={{ width: 74, height: 74, borderRadius: 12, backgroundColor: '#050607', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '800' }}>VIDEO</Text>
            </View>
          )}
          <View style={{ flex: 1, justifyContent: 'center', gap: 5 }}>
            <Text numberOfLines={1} style={{ color: palette.text, fontSize: 16, fontWeight: '700' }}>
              {item.name}
            </Text>
            <Text style={{ color: palette.muted, fontSize: 13 }}>
              {item.captions.length} subtitles · {formatDuration(item.source.durationMs)}
            </Text>
          </View>
        </Pressable>
      )}
    />
  );
}

function formatDuration(durationMs: number) {
  const seconds = Math.round(durationMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
