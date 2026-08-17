import * as SQLite from 'expo-sqlite';

import { DEFAULT_CAPTION_STYLE, type CaptionProject } from '@/types/project';

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

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
  `);
  return database;
}

export async function saveProject(project: CaptionProject) {
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
    JSON.stringify(project),
  );
}

export async function listProjects(): Promise<CaptionProject[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ project_json: string }>(
    'SELECT project_json FROM projects ORDER BY updated_at DESC',
  );
  return rows.map((row) => hydrateProject(JSON.parse(row.project_json) as CaptionProject));
}

export async function getProject(projectId: string): Promise<CaptionProject | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ project_json: string }>(
    'SELECT project_json FROM projects WHERE id = ?',
    projectId,
  );
  return row ? hydrateProject(JSON.parse(row.project_json) as CaptionProject) : null;
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
