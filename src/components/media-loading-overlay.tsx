import { ActivityIndicator, Modal, Text, View } from 'react-native';

import type { MediaImportProgress } from '@/services/media-import';

export function MediaLoadingOverlay({ progress }: { progress?: MediaImportProgress }) {
  return (
    <Modal visible={Boolean(progress)} transparent animationType="fade">
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: 'rgba(0,0,0,0.72)' }}>
        <View style={{ width: '100%', maxWidth: 360, alignItems: 'center', gap: 14, padding: 24, borderRadius: 24, backgroundColor: '#171C22' }}>
          <ActivityIndicator size="large" color="#DFFF35" />
          <Text style={{ color: '#F7F8FA', fontSize: 20, fontWeight: '900', textAlign: 'center' }}>
            Loading your video{progress && progress.total > 1 ? 's' : ''}
          </Text>
          <Text style={{ color: '#A3ADB9', fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
            {progress?.detail ?? 'Preparing your editor'}
          </Text>
          <Text style={{ color: '#DFFF35', fontSize: 12, fontWeight: '800' }}>
            Keep Caption Studio open
          </Text>
        </View>
      </View>
    </Modal>
  );
}
