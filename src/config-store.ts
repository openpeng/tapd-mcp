/**
 * Read-only story config sourced from the TAPD_STORY_CONFIG env var.
 *
 * The env var holds a JSON document with this shape:
 *
 *   {
 *     "workspaces": {
 *       "<wsid>": {
 *         "story_defaults": {
 *           "<field-label-or-api-name>": "<value>"
 *         },
 *         "story_field_rules": {
 *           "<field-label-or-api-name>": [
 *             { "match": "题库",                "value": "常规项目/题库" },
 *             { "match": "课程|财经云",         "value": "常规项目/课程产品" }
 *           ]
 *         }
 *       }
 *     }
 *   }
 *
 * As a convenience, callers may also pass the inner WorkspaceConfig directly
 * (i.e. just `{ "story_defaults": ..., "story_field_rules": ... }`); it will
 * be applied to every workspace when a per-workspace section is missing.
 *
 * `match` is a case-insensitive regex tested against the caller-supplied
 * `hint` (or, when absent, the story's `name`). First match wins.
 */

export interface FieldRule {
  match: string;
  value: string;
}

export interface WorkspaceConfig {
  story_defaults?: Record<string, string>;
  story_field_rules?: Record<string, FieldRule[]>;
}

export interface TapdUserConfig {
  workspaces?: Record<string, WorkspaceConfig>;
  story_defaults?: Record<string, string>;
  story_field_rules?: Record<string, FieldRule[]>;
}

const ENV_VAR = 'TAPD_STORY_CONFIG';

export function getConfigSource(): { env: string; raw: string | undefined } {
  return { env: ENV_VAR, raw: process.env[ENV_VAR] };
}

export function readConfig(): TapdUserConfig {
  const raw = process.env[ENV_VAR];
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as TapdUserConfig;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getWorkspaceConfig(
  config: TapdUserConfig,
  workspaceId: string
): WorkspaceConfig {
  const ws = config.workspaces?.[workspaceId];
  if (ws) return ws;
  if (config.story_defaults || config.story_field_rules) {
    return {
      story_defaults: config.story_defaults,
      story_field_rules: config.story_field_rules,
    };
  }
  return {};
}

/**
 * Pick the first matching value from a list of rules.
 * `match` is treated as a case-insensitive regex. Falls back to literal
 * substring match if the regex fails to compile.
 */
export function pickRuleValue(rules: FieldRule[] | undefined, hint: string): string | undefined {
  if (!rules || !hint) return undefined;
  for (const rule of rules) {
    let matched = false;
    try {
      matched = new RegExp(rule.match, 'i').test(hint);
    } catch {
      matched = hint.toLowerCase().includes(rule.match.toLowerCase());
    }
    if (matched) return rule.value;
  }
  return undefined;
}
