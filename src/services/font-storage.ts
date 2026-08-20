import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Font from 'expo-font';

import type { FontChoice } from '@/lib/font-catalog';
import { getDatabase } from '@/services/database';

const FAVORITES_KEY = 'font-favorites';
const RECENT_KEY = 'font-recent';

const FONT_MIME_TYPES = [
  'font/ttf',
  'font/otf',
  'application/x-font-ttf',
  'application/x-font-opentype',
  'application/vnd.ms-opentype',
];

export async function loadFontLibrary() {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ font_json: string }>(
    'SELECT font_json FROM imported_fonts ORDER BY imported_at DESC',
  );
  const imported: FontChoice[] = [];
  for (const row of rows) {
    try {
      const choice = JSON.parse(row.font_json) as FontChoice;
      if (choice.font.source !== 'imported' || !choice.font.uri) continue;
      await Font.loadAsync({ [choice.font.family]: choice.font.uri });
      imported.push(choice);
    } catch (error) {
      console.error('Skipped an imported font that could not be loaded', error);
    }
  }
  return {
    imported,
    favorites: await readStringList(FAVORITES_KEY, ['bungee', 'monoton', 'rubik-glitch']),
    recent: await readStringList(RECENT_KEY, []),
  };
}

export async function saveImportedFont(choice: FontChoice) {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO imported_fonts (id, font_json, imported_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET font_json = excluded.font_json`,
    choice.font.id,
    JSON.stringify(choice),
    new Date().toISOString(),
  );
}

export async function importFontFromDevice(): Promise<FontChoice | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: FONT_MIME_TYPES,
    copyToCacheDirectory: false,
    multiple: false,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!FileSystem.documentDirectory) {
    throw new Error('Permanent app storage is unavailable on this device.');
  }

  const extension = asset.name.toLowerCase().endsWith('.otf') ? '.otf' : '.ttf';
  const family = `imported-${Date.now()}`;
  const directory = `${FileSystem.documentDirectory}fonts/`;
  const destinationUri = `${directory}${family}${extension}`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  try {
    await FileSystem.copyAsync({ from: asset.uri, to: destinationUri });
    await Font.loadAsync({ [family]: destinationUri });
    const name = asset.name.replace(/\.(ttf|otf)$/i, '');
    const choice: FontChoice = {
      font: {
        id: family,
        family,
        source: 'imported',
        uri: destinationUri,
        postScriptName: name,
      },
      name,
      mood: 'Your imported font',
      treatment: 'solid',
    };
    await saveImportedFont(choice);
    return choice;
  } catch (error) {
    await FileSystem.deleteAsync(destinationUri, { idempotent: true }).catch(() => undefined);
    throw error;
  }
}

export async function saveFontFavorites(ids: string[]) {
  await writeStringList(FAVORITES_KEY, ids);
}

export async function saveRecentFonts(ids: string[]) {
  await writeStringList(RECENT_KEY, ids.slice(0, 8));
}

async function readStringList(key: string, fallback: string[]) {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ value_json: string }>(
    'SELECT value_json FROM preferences WHERE key = ?',
    key,
  );
  if (!row) return fallback;
  try {
    const value: unknown = JSON.parse(row.value_json);
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : fallback;
  } catch {
    return fallback;
  }
}

async function writeStringList(key: string, value: string[]) {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO preferences (key, value_json) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`,
    key,
    JSON.stringify(value),
  );
}
