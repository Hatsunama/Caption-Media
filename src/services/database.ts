import * as SQLite from 'expo-sqlite';

import { DEFAULT_CAPTION_STYLE, type CaptionProject } from '@/types/project';

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;
const projectWriteQueues = new Map<string, Promise<void>>();

export async function getDatabase() {
  databasePromise ??= SQLite.openDatabaseAsync('caption-studio.db');
  const database = await databasePromise;
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      source_uri TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      project_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS projects_updated_at
      ON projects(updated_at DESC);
    CREATE TABLE IF NOT EXISTS imported_fonts (
      id TEXT PRIMARY KEY NOT NULL,
      font_json TEXT NOT NULL,
      imported_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS preferences (
      key TEXT PRIMARY KEY NOT NULL,
      value_json TEXT NOT NULL
    );
  `);
  return database;
}

export async function saveProject(project: CaptionProject) {
  const snapshot = JSON.stringify(project);
  const previous = projectWriteQueues.get(project.id) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    const database = await getDatabase();
    await database.runAsync(
      `INSERT INTO projects (id, name, source_uri, updated_at, project_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         source_uri = excluded.source_uri,
         updated_at = excluded.updated_at,
         project_json = excluded.project_json`,
      project.id,
      project.name,
      project.source.uri,
      project.updatedAt,
      snapshot,
    );
  });
  projectWriteQueues.set(project.id, operation);
  try {
    await operation;
  } finally {
    if (projectWriteQueues.get(project.id) === operation) projectWriteQueues.delete(project.id);
  }
}

export async function listProjects(): Promise<CaptionProject[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ project_json: string }>(
    'SELECT project_json FROM projects ORDER BY updated_at DESC',
  );
  const projects: CaptionProject[] = [];
  for (const row of rows) {
    try {
      projects.push(hydrateProject(parseProject(row.project_json)));
    } catch (error) {
      console.error('Skipped an unreadable Caption Studio project', error);
    }
  }
  return projects;
}

export async function getProject(projectId: string): Promise<CaptionProject | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ project_json: string }>(
    'SELECT project_json FROM projects WHERE id = ?',
    projectId,
  );
  if (!row) return null;
  return hydrateProject(parseProject(row.project_json));
}

function parseProject(value: string): CaptionProject {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object') throw new Error('Project data is not an object');
  const candidate = parsed as Partial<CaptionProject>;
  if (
    candidate.schemaVersion !== 1
    || typeof candidate.id !== 'string'
    || typeof candidate.name !== 'string'
    || !candidate.source
    || typeof candidate.source.uri !== 'string'
    || !Array.isArray(candidate.captions)
    || !candidate.transcription
  ) {
    throw new Error('Project data is incomplete or from an unsupported version');
  }
  return candidate as CaptionProject;
}

function hydrateProject(project: CaptionProject): CaptionProject {
  const hydratedProjectStyle = {
    ...DEFAULT_CAPTION_STYLE,
    ...project.projectStyle,
    position: { ...DEFAULT_CAPTION_STYLE.position, ...project.projectStyle?.position },
    box: { ...DEFAULT_CAPTION_STYLE.box, ...project.projectStyle?.box },
  };
  return {
    ...project,
    source: {
      ...project.source,
      storageMode: project.source.storageMode ?? (project.source.uri.startsWith('content:') ? 'linked' : 'copied'),
    },
    projectStyle: hydratedProjectStyle,
    layers: (project.layers ?? [{ id: 'captions', kind: 'captions', name: 'Captions', visible: true }]).map((layer) =>
      layer.kind === 'text'
        ? {
            ...layer,
            style: {
              ...DEFAULT_CAPTION_STYLE,
              ...layer.style,
              position: { ...DEFAULT_CAPTION_STYLE.position, ...layer.style?.position },
              box: { ...DEFAULT_CAPTION_STYLE.box, ...layer.style?.box },
            },
          }
        : layer,
    ),
    clips: project.clips?.length
      ? project.clips
      : [{ id: 'source-clip', sourceStartMs: 0, sourceEndMs: project.source.durationMs }],
    canvas: project.canvas ?? {
      preset: 'source',
      aspectWidth: project.source.width ?? 9,
      aspectHeight: project.source.height ?? 16,
      backgroundColor: '#000000',
    },
    videoTransform: project.videoTransform ?? {
      fit: 'fit',
      position: { x: 0.5, y: 0.5 },
      scale: 1,
      rotation: 0,
    },
  };
}
