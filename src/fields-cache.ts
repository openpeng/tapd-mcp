/**
 * On-disk cache for TAPD field schema (one file per workspace + entity_type).
 *
 * Layout: <cacheDir>/fields/<entity_type>/<workspace_id>.json
 *
 * cacheDir resolution: TAPD_CACHE_DIR env var → otherwise ~/.tapd-mcp/cache.
 *
 * The cache stores whatever the resolver feeds in (typically the parsed
 * /stories/get_fields_info payload) plus a fetched-at timestamp; reads return
 * null when the file is missing or unreadable so callers fall back to the API.
 */

import { mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface CachedFields<T = unknown> {
  workspace_id: string;
  entity_type: string;
  fetched_at: string;
  data: T;
}

export function getCacheDir(): string {
  const override = process.env.TAPD_CACHE_DIR;
  if (override && override.trim()) return override;
  return join(homedir(), '.tapd-mcp', 'cache');
}

function fileFor(workspaceId: string, entityType: string): string {
  return join(getCacheDir(), 'fields', entityType, `${workspaceId}.json`);
}

export async function readFieldsCache<T = unknown>(
  workspaceId: string,
  entityType = 'story'
): Promise<CachedFields<T> | null> {
  const file = fileFor(workspaceId, entityType);
  if (!existsSync(file)) return null;
  try {
    const text = await readFile(file, 'utf8');
    const parsed = JSON.parse(text) as CachedFields<T>;
    if (parsed && parsed.data) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function writeFieldsCache<T = unknown>(
  workspaceId: string,
  entityType: string,
  data: T
): Promise<string> {
  const file = fileFor(workspaceId, entityType);
  await mkdir(dirname(file), { recursive: true });
  const payload: CachedFields<T> = {
    workspace_id: workspaceId,
    entity_type: entityType,
    fetched_at: new Date().toISOString(),
    data,
  };
  await writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
  return file;
}

/**
 * Clear cache entries.
 *   - workspaceId + entityType: remove that single file
 *   - workspaceId only: remove all entity types for that workspace
 *   - neither: remove the entire <cacheDir>/fields tree
 *
 * Returns the list of paths removed.
 */
export async function clearFieldsCache(options?: {
  workspaceId?: string;
  entityType?: string;
}): Promise<string[]> {
  const root = join(getCacheDir(), 'fields');
  if (!existsSync(root)) return [];

  if (options?.workspaceId && options.entityType) {
    const file = fileFor(options.workspaceId, options.entityType);
    if (!existsSync(file)) return [];
    await rm(file);
    return [file];
  }

  if (options?.workspaceId) {
    const removed: string[] = [];
    const types = await readdir(root, { withFileTypes: true });
    for (const t of types) {
      if (!t.isDirectory()) continue;
      const file = join(root, t.name, `${options.workspaceId}.json`);
      if (existsSync(file)) {
        await rm(file);
        removed.push(file);
      }
    }
    return removed;
  }

  await rm(root, { recursive: true, force: true });
  return [root];
}
