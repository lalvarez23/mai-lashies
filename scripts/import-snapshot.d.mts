import type { Client } from 'pg';
export function assertEmptyDatabase(
  client: Client,
  options?: { allowMissingTables?: boolean },
): Promise<void>;
export function importSnapshot(
  connectionString: string,
  input: string,
): Promise<Record<string, number>>;
