/**
 * TAPD API Client - Handles all HTTP requests to TAPD Open API
 */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { readFieldsCache, writeFieldsCache, clearFieldsCache } from './fields-cache.js';
import { readConfig, getWorkspaceConfig, pickRuleValue } from './config-store.js';

export interface TapdConfig {
  apiToken: string;
  baseUrl?: string;
  /**
   * Optional Basic Auth credentials. When provided, takes precedence over
   * the Bearer token for all requests. Some legacy TAPD endpoints
   * (notably attachments) may reject Bearer auth and require Basic.
   */
  basicAuth?: { username: string; password: string };
  /**
   * Override the attachment upload endpoint path. Defaults to
   * `/files/upload_attachment` (the documented TAPD endpoint).
   */
  attachmentEndpoint?: string;
}

export interface Attachment {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  filename: string;
  filesize?: string;
  filetype?: string;
  download_url?: string;
  description?: string;
  owner?: string;
  created?: string;
  [key: string]: string | undefined;
}

export interface TapdResponse<T> {
  status: number;
  data: T[];
  info?: string;
}

export interface Story {
  id: string;
  name: string;
  description?: string;
  workspace_id: string;
  creator?: string;
  owner?: string;
  status?: string;
  priority?: string;
  iteration_id?: string;
  parent_id?: string;
  begin?: string;
  due?: string;
  created?: string;
  modified?: string;
  effort?: string;
  effort_completed?: string;
  category_id?: string;
  release_id?: string;
  custom_field_one?: string;
  custom_field_two?: string;
  custom_field_three?: string;
  [key: string]: string | undefined;
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  workspace_id: string;
  story_id?: string;
  creator?: string;
  owner?: string;
  status?: string;
  priority?: string;
  iteration_id?: string;
  begin?: string;
  due?: string;
  created?: string;
  modified?: string;
  effort?: string;
  effort_completed?: string;
  progress?: string;
  [key: string]: string | undefined;
}

export interface Bug {
  id: string;
  title: string;
  description?: string;
  workspace_id: string;
  creator?: string;
  current_owner?: string;
  status?: string;
  severity?: string;
  priority?: string;
  iteration_id?: string;
  module?: string;
  version_test?: string;
  version_report?: string;
  version_close?: string;
  version_fix?: string;
  created?: string;
  modified?: string;
  resolved?: string;
  closed?: string;
  bugtype?: string;
  de?: string;
  te?: string;
  [key: string]: string | undefined;
}

export interface Iteration {
  id: string;
  name: string;
  description?: string;
  workspace_id: string;
  startdate?: string;
  enddate?: string;
  status?: string;
  creator?: string;
  created?: string;
  modified?: string;
  [key: string]: string | undefined;
}

export interface Comment {
  id: string;
  author: string;
  entry_id: string;
  entry_type: string;
  description: string;
  created?: string;
  modified?: string;
  [key: string]: string | undefined;
}

export interface Release {
  id: string;
  name: string;
  description?: string;
  workspace_id: string;
  startdate?: string;
  enddate?: string;
  status?: string;
  creator?: string;
  created?: string;
  modified?: string;
  [key: string]: string | undefined;
}

export interface Timesheet {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  owner?: string;
  spentdate?: string;
  timespent?: string;
  memo?: string;
  created?: string;
  modified?: string;
  [key: string]: string | undefined;
}

export interface CustomFieldSetting {
  workspace_id?: string;
  entry_type?: string;
  field_name?: string;
  field_type?: string;
  field_label?: string;
  required?: string;
  options?: string;
  is_open?: string;
  [key: string]: string | undefined;
}

export interface StoryChange {
  id: string;
  story_id: string;
  workspace_id: string;
  author: string;
  field: string;
  old_value?: string;
  new_value?: string;
  created?: string;
  [key: string]: string | undefined;
}

export interface WorkspaceUser {
  user: string;
  name?: string;
  email?: string;
  role_id?: string;
  status?: string;
  user_group_id?: string;
  [key: string]: string | undefined;
}

const STATUS_MAP: Record<string, string> = {
  'planning': 'planning',
  'developing': 'developing',
  'testing': 'testing',
  'resolved': 'resolved',
  'closed': 'closed',
  'rejected': 'rejected',
};

const STORY_STATUS_MAP: Record<string, string> = {
  '1': '草稿',
  '2': '待评审',
  '3': '评审通过',
  '4': '开发中',
  '5': '测试中',
  '6': '已完成',
  '7': '已关闭',
  '8': '已拒绝',
  'planning': '待规划',
  'developing': '开发中',
  'testing': '测试中',
  'resolved': '已完成',
  'closed': '已关闭',
  'rejected': '已拒绝',
};

const TASK_STATUS_MAP: Record<string, string> = {
  'open': '未开始',
  'progressing': '进行中',
  'done': '已完成',
};

const BUG_STATUS_MAP: Record<string, string> = {
  'new': '新建',
  'in_progress': '接受/处理',
  'resolved': '已解决',
  'verified': '已验证',
  'closed': '已关闭',
  'rejected': '已拒绝',
  'reopened': '重新打开',
};

export class TapdClient {
  private apiToken: string;
  private baseUrl: string;
  private basicAuth?: { username: string; password: string };
  private attachmentEndpoint: string;

  constructor(config: TapdConfig) {
    this.apiToken = config.apiToken;
    this.baseUrl = config.baseUrl || 'https://api.tapd.cn';
    this.basicAuth = config.basicAuth;
    this.attachmentEndpoint = config.attachmentEndpoint || '/files/upload_attachment';
  }

  private buildAuthHeader(): string {
    if (this.basicAuth) {
      const raw = `${this.basicAuth.username}:${this.basicAuth.password}`;
      return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
    }
    return `Bearer ${this.apiToken}`;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    params?: Record<string, string | number | undefined>,
    options?: { keepEmpty?: string[] }
  ): Promise<TapdResponse<T>> {
    const url = new URL(endpoint, this.baseUrl);

    const keepEmpty = new Set(options?.keepEmpty || []);
    const filteredParams: Record<string, string> = {};
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        if (value === '' && !keepEmpty.has(key)) continue;
        filteredParams[key] = String(value);
      }
    }

    const headers: Record<string, string> = {
      'Authorization': this.buildAuthHeader(),
      'Accept': 'application/json',
      'User-Agent': 'TAPD-MCP-Server/1.0',
    };

    let response: Response;

    if (method === 'GET') {
      url.search = new URLSearchParams(filteredParams).toString();
      response = await fetch(url.toString(), { method, headers });
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      response = await fetch(url.toString(), {
        method,
        headers,
        body: new URLSearchParams(filteredParams).toString(),
      });
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`TAPD API error [${endpoint}]: HTTP ${response.status} ${response.statusText} - ${text}`);
    }

    const data = await response.json();

    if (data.status !== 1) {
      const info = data.info || data.message || 'Unknown error';
      throw new Error(`TAPD API error [${endpoint}]: ${info}`);
    }

    // Normalize response: POST returns {data: {Story: ...}}, GET returns {data: [{Story: ...}]}
    // Convert single object to array format for consistency
    if (data.data && !Array.isArray(data.data)) {
      data.data = [data.data];
    }

    return data;
  }

  // ==================== Story APIs ====================

  async getStory(workspaceId: string, storyId: string, fields?: string): Promise<Story | null> {
    const response = await this.request<{ Story: Story }>('GET', '/stories', {
      workspace_id: workspaceId,
      id: storyId,
      limit: 1,
      fields,
    });

    if (response.data && response.data.length > 0) {
      return response.data[0].Story;
    }
    return null;
  }

  async listStories(
    workspaceId: string,
    options?: {
      iterationId?: string;
      status?: string;
      owner?: string;
      creator?: string;
      limit?: number;
      page?: number;
      fields?: string;
    }
  ): Promise<Story[]> {
    const response = await this.request<{ Story: Story }>('GET', '/stories', {
      workspace_id: workspaceId,
      iteration_id: options?.iterationId,
      status: options?.status,
      owner: options?.owner,
      creator: options?.creator,
      limit: options?.limit || 30,
      page: options?.page || 1,
      fields: options?.fields,
    });

    return response.data?.map(item => item.Story) || [];
  }

  async createStory(
    workspaceId: string,
    data: {
      name: string;
      description?: string;
      owner?: string;
      priority?: string;
      iterationId?: string;
      parentId?: string;
      begin?: string;
      due?: string;
      categoryId?: string;
      releaseId?: string;
    }
  ): Promise<Story> {
    const response = await this.request<{ Story: Story }>('POST', '/stories', {
      workspace_id: workspaceId,
      name: data.name,
      description: data.description,
      owner: data.owner,
      priority: data.priority,
      iteration_id: data.iterationId,
      parent_id: data.parentId,
      begin: data.begin,
      due: data.due,
      category_id: data.categoryId,
      release_id: data.releaseId,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('Failed to create story: no data returned');
    }

    return response.data[0].Story;
  }

  async updateStory(
    workspaceId: string,
    storyId: string,
    data: {
      name?: string;
      description?: string;
      owner?: string;
      status?: string;
      priority?: string;
      iterationId?: string;
      begin?: string;
      due?: string;
      categoryId?: string;
      releaseId?: string;
    }
  ): Promise<Story> {
    const response = await this.request<{ Story: Story }>('POST', '/stories', {
      workspace_id: workspaceId,
      id: storyId,
      name: data.name,
      description: data.description,
      owner: data.owner,
      status: data.status,
      priority: data.priority,
      iteration_id: data.iterationId,
      begin: data.begin,
      due: data.due,
      category_id: data.categoryId,
      release_id: data.releaseId,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('Failed to update story: no data returned');
    }

    return response.data[0].Story;
  }

  /**
   * Look up a custom-field definition by user-facing label or by API name.
   * `query` matches against (in order): the API name itself (e.g. "custom_field_one"),
   * then the Chinese/English label, then the legacy `field_name` key. Match is
   * case-insensitive, whitespace-trimmed, and both English+Chinese punctuation
   * are normalised so users can type "提测时间" or "提测 时间" or "TestDate".
   *
   * Two data sources are tried, in order:
   *   1. /stories/get_fields_info — covers ALL story fields (system + custom)
   *      with localized labels. This is the canonical source for workspaces that
   *      use TAPD's "field config" UI. Returns 403 in some workspaces; falls
   *      back to source 2.
   *   2. /stories/custom_fields_settings — older endpoint; only returns custom
   *      fields and may be empty in workspaces that store labels under (1).
   *
   * Returns null when no field matches; otherwise the raw setting plus the
   * resolved API name (the property you POST to /stories with).
   */
  async resolveStoryCustomField(
    workspaceId: string,
    query: string,
    entryType = 'story'
  ): Promise<
    | (CustomFieldSetting & { api_name: string })
    | null
  > {
    const norm = (s?: string) => (s || '').replace(/\s+/g, '').toLowerCase();
    const target = norm(query);

    try {
      const info = await this.getStoryFieldsInfo(workspaceId);
      for (const [apiName, def] of Object.entries(info)) {
        const label = (def as any).label || '';
        if (norm(apiName) === target || norm(label) === target) {
          return {
            api_name: apiName,
            field_name: apiName,
            field_label: label,
            field_type: (def as any).html_type,
          } as CustomFieldSetting & { api_name: string };
        }
      }
    } catch {
      // fall through to legacy endpoint
    }

    const settings = await this.getCustomFieldsSettings(workspaceId, entryType);
    for (const f of settings) {
      const apiName =
        (f as any).custom_field ||
        f.field_name ||
        (f as any).name ||
        '';
      const label = f.field_label || (f as any).label || (f as any).cn_name || '';
      const enName = (f as any).en_name || (f as any).english_name || '';

      if (
        norm(apiName) === target ||
        norm(label) === target ||
        norm(enName) === target ||
        norm(f.field_name) === target
      ) {
        return { ...f, api_name: apiName };
      }
    }
    return null;
  }

  /**
   * Fetch the workspace's full story field schema via /stories/get_fields_info.
   * Returns a map { api_name -> { label, html_type, options, readonly } }.
   *
   * Caches the result on disk per workspace (see src/fields-cache.ts) — the
   * schema rarely changes, and skipping the network on every resolve speeds
   * up repeated `tapd_set_story_*` calls noticeably. Pass `forceRefresh: true`
   * after a workspace admin edits the field config.
   *
   * Throws (rather than returning {}) on permission errors so callers can fall
   * back to the legacy custom_fields_settings endpoint.
   */
  async getStoryFieldsInfo(
    workspaceId: string,
    options?: { forceRefresh?: boolean }
  ): Promise<Record<string, { label?: string; html_type?: string; options?: any; readonly?: number }>> {
    if (!options?.forceRefresh) {
      const cached = await readFieldsCache<
        Record<string, { label?: string; html_type?: string; options?: any; readonly?: number }>
      >(workspaceId, 'story');
      if (cached?.data) return cached.data;
    }

    const url = new URL('/stories/get_fields_info', this.baseUrl);
    url.search = new URLSearchParams({ workspace_id: workspaceId }).toString();
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: this.buildAuthHeader(),
        Accept: 'application/json',
        'User-Agent': 'TAPD-MCP-Server/1.0',
      },
    });
    if (!res.ok) {
      throw new Error(`get_fields_info HTTP ${res.status} ${res.statusText}`);
    }
    const j: any = await res.json();
    if (j.status !== 1) {
      throw new Error(`get_fields_info status=${j.status} info=${j.info || 'unknown'}`);
    }
    const data = j.data || {};
    try {
      await writeFieldsCache(workspaceId, 'story', data);
    } catch {
      // cache write failure is non-fatal; the network result is still returned
    }
    return data;
  }

  /**
   * Set a custom field on a story by user-facing field name OR by API name.
   *
   * `field` accepts either:
   *   - a label (e.g. "提测时间", "TestDate") — resolved via /stories/custom_fields_settings
   *   - an API name (e.g. "custom_field_one") — used directly
   *
   * Returns the updated story plus the resolved field metadata so the caller
   * can confirm what was written.
   */
  async setStoryCustomField(
    workspaceId: string,
    storyId: string,
    field: string,
    value: string,
    options?: { refresh?: boolean }
  ): Promise<{
    story: Story;
    field: { api_name: string; label?: string; type?: string };
    previous?: string;
  }> {
    if (options?.refresh) {
      await clearFieldsCache({ workspaceId, entityType: 'story' });
    }

    const candidates = field
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (candidates.length === 0) {
      throw new Error('field is required');
    }

    let apiName = '';
    let label: string | undefined;
    let type: string | undefined;
    let lastTried = '';

    for (const cand of candidates) {
      lastTried = cand;
      if (/^custom_field(?:_[a-z]+|_\d+)?$/i.test(cand)) {
        apiName = cand;
        break;
      }
      const resolved = await this.resolveStoryCustomField(workspaceId, cand);
      if (resolved) {
        apiName = resolved.api_name;
        label = resolved.field_label || (resolved as any).label;
        type = resolved.field_type;
        break;
      }
    }

    if (!apiName) {
      let availableLines = '';
      try {
        const info = await this.getStoryFieldsInfo(workspaceId);
        availableLines = Object.entries(info)
          .filter(([, v]) => !(v as any).readonly)
          .map(([k, v]) => {
            const l = (v as any).label || '(no label)';
            const t = (v as any).html_type || '?';
            return `  ${k} | ${t} | ${l}`;
          })
          .join('\n');
      } catch {
        const settings = await this.getCustomFieldsSettings(workspaceId, 'story');
        availableLines = settings
          .map(f => {
            const a = (f as any).custom_field || f.field_name || (f as any).name || '?';
            const l = f.field_label || (f as any).label || '(no label)';
            const t = f.field_type || '?';
            return `  ${a} | ${t} | ${l}`;
          })
          .join('\n');
      }
      throw new Error(
        `None of the field candidates [${candidates.join(', ')}] matched in workspace ${workspaceId} ` +
        `(last tried: "${lastTried}").\n\n` +
        `Writable fields in this workspace (api_name | type | label):\n` +
        (availableLines || '  (no fields defined)') +
        `\n\nNext step: pick the field that matches the user's intent, confirm with the user if ambiguous, ` +
        `then retry tapd_set_story_custom_field with its api_name. ` +
        `Save the resolved alias -> api_name mapping to project memory so future sessions skip this step.`
      );
    }

    const before = await this.getStory(workspaceId, storyId, `id,name,${apiName}`);
    if (!before) throw new Error(`Story ${storyId} not found`);
    const previous = before[apiName];

    const response = await this.request<{ Story: Story }>(
      'POST',
      '/stories',
      {
        workspace_id: workspaceId,
        id: storyId,
        [apiName]: value,
      },
      { keepEmpty: [apiName] }
    );
    if (!response.data || response.data.length === 0) {
      throw new Error(`Failed to set ${apiName}: no data returned`);
    }
    return {
      story: response.data[0].Story,
      field: { api_name: apiName, label, type },
      previous,
    };
  }

  /**
   * Apply the per-workspace story defaults from `~/.tapd-mcp/config.json`.
   *
   * Pipeline:
   *   1. Read config -> workspaces.<wsid>.{ story_defaults, story_field_rules }
   *   2. Resolve `story_field_rules` against `hint` (or the story's name) and
   *      merge with `story_defaults` (defaults win for overlapping keys).
   *   3. Apply caller `overrides` last (always win).
   *   4. Two-pass write so cascade fields don't fail when written before
   *      their parent.
   */
  async applyStoryDefaults(
    workspaceId: string,
    storyId: string,
    options?: { hint?: string; overrides?: Record<string, string>; dryRun?: boolean }
  ): Promise<{
    plan: Array<{ field: string; value: string; source: 'default' | 'rule' | 'override' }>;
    applied: Array<{ field: string; api_name: string; value: string; previous?: string }>;
    failed: Array<{ field: string; value: string; error: string }>;
    skipped_no_match: string[];
    dry_run: boolean;
  }> {
    const config = readConfig();
    const ws = getWorkspaceConfig(config, workspaceId);

    let hint = options?.hint;
    if (!hint && ws.story_field_rules && Object.keys(ws.story_field_rules).length > 0) {
      const story = await this.getStory(workspaceId, storyId, 'id,name');
      hint = story?.name || '';
    }

    const plan: Array<{ field: string; value: string; source: 'default' | 'rule' | 'override' }> = [];
    const skippedNoMatch: string[] = [];

    for (const [field, value] of Object.entries(ws.story_defaults || {})) {
      plan.push({ field, value, source: 'default' });
    }

    for (const [field, rules] of Object.entries(ws.story_field_rules || {})) {
      if (plan.some(p => p.field === field)) continue;
      const matched = pickRuleValue(rules, hint || '');
      if (matched === undefined) {
        skippedNoMatch.push(field);
        continue;
      }
      plan.push({ field, value: matched, source: 'rule' });
    }

    for (const [field, value] of Object.entries(options?.overrides || {})) {
      const existing = plan.find(p => p.field === field);
      if (existing) {
        existing.value = value;
        existing.source = 'override';
      } else {
        plan.push({ field, value, source: 'override' });
      }
    }

    if (options?.dryRun) {
      return { plan, applied: [], failed: [], skipped_no_match: skippedNoMatch, dry_run: true };
    }

    const applied: Array<{ field: string; api_name: string; value: string; previous?: string }> = [];
    const failed: Array<{ field: string; value: string; error: string }> = [];

    let pending = [...plan];
    for (let pass = 0; pass < 2 && pending.length > 0; pass++) {
      const nextRound: typeof pending = [];
      for (const item of pending) {
        try {
          const result = await this.setStoryCustomField(
            workspaceId,
            storyId,
            item.field,
            item.value
          );
          applied.push({
            field: item.field,
            api_name: result.field.api_name,
            value: item.value,
            previous: result.previous,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (pass === 0 && /cascade field/i.test(msg)) {
            nextRound.push(item);
          } else {
            failed.push({ field: item.field, value: item.value, error: msg });
          }
        }
      }
      pending = nextRound;
    }

    for (const item of pending) {
      failed.push({ field: item.field, value: item.value, error: 'Cascade dependency unresolved after retry' });
    }

    return {
      plan,
      applied,
      failed,
      skipped_no_match: skippedNoMatch,
      dry_run: false,
    };
  }

  async getStoryChanges(
    workspaceId: string,
    storyId: string,
    options?: { limit?: number; page?: number }
  ): Promise<StoryChange[]> {
    const response = await this.request<{ WorkitemChange: StoryChange }>('GET', '/story_changes', {
      workspace_id: workspaceId,
      story_id: storyId,
      limit: options?.limit || 20,
      page: options?.page || 1,
    });

    return response.data?.map(item => item.WorkitemChange) || [];
  }

  // ==================== Task APIs ====================

  async getTask(workspaceId: string, taskId: string): Promise<Task | null> {
    const response = await this.request<{ Task: Task }>('GET', '/tasks', {
      workspace_id: workspaceId,
      id: taskId,
      limit: 1,
    });

    if (response.data && response.data.length > 0) {
      return response.data[0].Task;
    }
    return null;
  }

  async listTasks(
    workspaceId: string,
    options?: {
      storyId?: string;
      iterationId?: string;
      status?: string;
      owner?: string;
      creator?: string;
      limit?: number;
      page?: number;
      fields?: string;
    }
  ): Promise<Task[]> {
    const response = await this.request<{ Task: Task }>('GET', '/tasks', {
      workspace_id: workspaceId,
      story_id: options?.storyId,
      iteration_id: options?.iterationId,
      status: options?.status,
      owner: options?.owner,
      creator: options?.creator,
      limit: options?.limit || 30,
      page: options?.page || 1,
      fields: options?.fields,
    });

    return response.data?.map(item => item.Task) || [];
  }

  async createTask(
    workspaceId: string,
    data: {
      name: string;
      storyId?: string;
      description?: string;
      owner?: string;
      priority?: string;
      iterationId?: string;
      begin?: string;
      due?: string;
      effort?: string;
    }
  ): Promise<Task> {
    const response = await this.request<{ Task: Task }>('POST', '/tasks', {
      workspace_id: workspaceId,
      name: data.name,
      story_id: data.storyId,
      description: data.description,
      owner: data.owner,
      priority: data.priority,
      iteration_id: data.iterationId,
      begin: data.begin,
      due: data.due,
      effort: data.effort,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('Failed to create task: no data returned');
    }

    return response.data[0].Task;
  }

  async updateTask(
    workspaceId: string,
    taskId: string,
    data: {
      name?: string;
      description?: string;
      owner?: string;
      status?: string;
      priority?: string;
      begin?: string;
      due?: string;
      effort?: string;
      effortCompleted?: string;
      remain?: string;
      exceed?: string;
      progress?: string;
      iterationId?: string;
      completed?: string;
    }
  ): Promise<Task> {
    const response = await this.request<{ Task: Task }>('POST', '/tasks', {
      workspace_id: workspaceId,
      id: taskId,
      name: data.name,
      description: data.description,
      owner: data.owner,
      status: data.status,
      priority: data.priority,
      begin: data.begin,
      due: data.due,
      effort: data.effort,
      effort_completed: data.effortCompleted,
      remain: data.remain,
      exceed: data.exceed,
      progress: data.progress,
      iteration_id: data.iterationId,
      completed: data.completed,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('Failed to update task: no data returned');
    }

    return response.data[0].Task;
  }

  // ==================== Bug APIs ====================

  async getBug(workspaceId: string, bugId: string): Promise<Bug | null> {
    const response = await this.request<{ Bug: Bug }>('GET', '/bugs', {
      workspace_id: workspaceId,
      id: bugId,
      limit: 1,
    });

    if (response.data && response.data.length > 0) {
      return response.data[0].Bug;
    }
    return null;
  }

  async listBugs(
    workspaceId: string,
    options?: {
      iterationId?: string;
      status?: string;
      severity?: string;
      currentOwner?: string;
      creator?: string;
      limit?: number;
      page?: number;
      fields?: string;
    }
  ): Promise<Bug[]> {
    const response = await this.request<{ Bug: Bug }>('GET', '/bugs', {
      workspace_id: workspaceId,
      iteration_id: options?.iterationId,
      status: options?.status,
      severity: options?.severity,
      current_owner: options?.currentOwner,
      creator: options?.creator,
      limit: options?.limit || 30,
      page: options?.page || 1,
      fields: options?.fields,
    });

    return response.data?.map(item => item.Bug) || [];
  }

  async createBug(
    workspaceId: string,
    data: {
      title: string;
      description?: string;
      currentOwner?: string;
      severity?: string;
      priority?: string;
      iterationId?: string;
      module?: string;
      versionTest?: string;
      versionReport?: string;
      bugtype?: string;
    }
  ): Promise<Bug> {
    const response = await this.request<{ Bug: Bug }>('POST', '/bugs', {
      workspace_id: workspaceId,
      title: data.title,
      description: data.description,
      current_owner: data.currentOwner,
      severity: data.severity,
      priority: data.priority,
      iteration_id: data.iterationId,
      module: data.module,
      version_test: data.versionTest,
      version_report: data.versionReport,
      bugtype: data.bugtype,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('Failed to create bug: no data returned');
    }

    return response.data[0].Bug;
  }

  async updateBug(
    workspaceId: string,
    bugId: string,
    data: {
      title?: string;
      description?: string;
      currentOwner?: string;
      status?: string;
      severity?: string;
      priority?: string;
      iterationId?: string;
      module?: string;
      versionFix?: string;
    }
  ): Promise<Bug> {
    const response = await this.request<{ Bug: Bug }>('POST', '/bugs', {
      workspace_id: workspaceId,
      id: bugId,
      title: data.title,
      description: data.description,
      current_owner: data.currentOwner,
      status: data.status,
      severity: data.severity,
      priority: data.priority,
      iteration_id: data.iterationId,
      module: data.module,
      version_fix: data.versionFix,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('Failed to update bug: no data returned');
    }

    return response.data[0].Bug;
  }

  // ==================== Iteration APIs ====================

  async getIteration(workspaceId: string, iterationId: string): Promise<Iteration | null> {
    const response = await this.request<{ Iteration: Iteration }>('GET', '/iterations', {
      workspace_id: workspaceId,
      id: iterationId,
      limit: 1,
    });

    if (response.data && response.data.length > 0) {
      return response.data[0].Iteration;
    }
    return null;
  }

  async listIterations(
    workspaceId: string,
    options?: {
      status?: string;
      limit?: number;
      page?: number;
    }
  ): Promise<Iteration[]> {
    const response = await this.request<{ Iteration: Iteration }>('GET', '/iterations', {
      workspace_id: workspaceId,
      status: options?.status,
      limit: options?.limit || 30,
      page: options?.page || 1,
    });

    return response.data?.map(item => item.Iteration) || [];
  }

  async createIteration(
    workspaceId: string,
    data: {
      name: string;
      description?: string;
      startdate?: string;
      enddate?: string;
    }
  ): Promise<Iteration> {
    const response = await this.request<{ Iteration: Iteration }>('POST', '/iterations', {
      workspace_id: workspaceId,
      name: data.name,
      description: data.description,
      startdate: data.startdate,
      enddate: data.enddate,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('Failed to create iteration: no data returned');
    }

    return response.data[0].Iteration;
  }

  async updateIteration(
    workspaceId: string,
    iterationId: string,
    data: {
      name?: string;
      description?: string;
      startdate?: string;
      enddate?: string;
      status?: string;
    }
  ): Promise<Iteration> {
    const response = await this.request<{ Iteration: Iteration }>('POST', '/iterations', {
      workspace_id: workspaceId,
      id: iterationId,
      name: data.name,
      description: data.description,
      startdate: data.startdate,
      enddate: data.enddate,
      status: data.status,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('Failed to update iteration: no data returned');
    }

    return response.data[0].Iteration;
  }

  // ==================== Comment APIs ====================

  async listComments(
    workspaceId: string,
    entryType: 'stories' | 'tasks' | 'bugs',
    entryId: string,
    options?: { limit?: number; page?: number }
  ): Promise<Comment[]> {
    const response = await this.request<{ Comment: Comment }>('GET', '/comments', {
      workspace_id: workspaceId,
      entry_type: entryType,
      entry_id: entryId,
      limit: options?.limit || 30,
      page: options?.page || 1,
    });

    return response.data?.map(item => item.Comment) || [];
  }

  async addComment(
    workspaceId: string,
    entryType: 'stories' | 'tasks' | 'bugs',
    entryId: string,
    description: string
  ): Promise<Comment> {
    const response = await this.request<{ Comment: Comment }>('POST', '/comments', {
      workspace_id: workspaceId,
      entry_type: entryType,
      entry_id: entryId,
      description: description,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('Failed to add comment: no data returned');
    }

    return response.data[0].Comment;
  }

  // ==================== Release APIs ====================

  async getRelease(workspaceId: string, releaseId: string): Promise<Release | null> {
    const response = await this.request<{ Release: Release }>('GET', '/releases', {
      workspace_id: workspaceId,
      id: releaseId,
      limit: 1,
    });

    if (response.data && response.data.length > 0) {
      return response.data[0].Release;
    }
    return null;
  }

  async listReleases(
    workspaceId: string,
    options?: {
      status?: string;
      limit?: number;
      page?: number;
    }
  ): Promise<Release[]> {
    const response = await this.request<{ Release: Release }>('GET', '/releases', {
      workspace_id: workspaceId,
      status: options?.status,
      limit: options?.limit || 30,
      page: options?.page || 1,
    });

    return response.data?.map(item => item.Release) || [];
  }

  async createRelease(
    workspaceId: string,
    data: {
      name: string;
      description?: string;
      startdate?: string;
      enddate?: string;
    }
  ): Promise<Release> {
    const response = await this.request<{ Release: Release }>('POST', '/releases', {
      workspace_id: workspaceId,
      name: data.name,
      description: data.description,
      startdate: data.startdate,
      enddate: data.enddate,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('Failed to create release: no data returned');
    }

    return response.data[0].Release;
  }

  async updateRelease(
    workspaceId: string,
    releaseId: string,
    data: {
      name?: string;
      description?: string;
      startdate?: string;
      enddate?: string;
      status?: string;
    }
  ): Promise<Release> {
    const response = await this.request<{ Release: Release }>('POST', '/releases', {
      workspace_id: workspaceId,
      id: releaseId,
      name: data.name,
      description: data.description,
      startdate: data.startdate,
      enddate: data.enddate,
      status: data.status,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('Failed to update release: no data returned');
    }

    return response.data[0].Release;
  }

  // ==================== Story-Code Relation APIs ====================

  async getStoryCodeCommits(
    workspaceId: string,
    storyId: string,
    options?: { limit?: number; page?: number }
  ): Promise<Array<{ commit_id: string; message: string; author: string; created: string }>> {
    try {
      const response = await this.request<{ StoryCodeCommit: { commit_id: string; message: string; author: string; created: string } }>(
        'GET',
        '/story_code_commits',
        {
          workspace_id: workspaceId,
          story_id: storyId,
          limit: options?.limit || 30,
          page: options?.page || 1,
        }
      );

      return response.data?.map(item => item.StoryCodeCommit) || [];
    } catch {
      return [];
    }
  }

  // ==================== User APIs ====================

  async getWorkspaceUsers(workspaceId: string): Promise<WorkspaceUser[]> {
    const response = await this.request<{ UserWorkspace: WorkspaceUser } | { User: WorkspaceUser }>(
      'GET',
      '/users/get_users_by_workspace_id',
      { workspace_id: workspaceId }
    );

    return (response.data || []).map((item: any) => {
      const u = item.UserWorkspace || item.User || item;
      return u as WorkspaceUser;
    });
  }

  // ==================== Attachment APIs ====================

  async uploadAttachment(
    workspaceId: string,
    entityType: 'stories' | 'tasks' | 'bugs',
    entityId: string,
    source: { filePath?: string; data?: Buffer | Uint8Array; filename?: string },
    options?: { description?: string; contentType?: string; customField?: string; owner?: string }
  ): Promise<Attachment> {
    let buffer: Buffer | Uint8Array;
    let name: string;

    if (source.filePath) {
      buffer = await readFile(source.filePath);
      name = source.filename || basename(source.filePath);
    } else if (source.data) {
      buffer = source.data;
      name = source.filename || 'upload.bin';
    } else {
      throw new Error('uploadAttachment requires either filePath or data');
    }

    const blob = new Blob([new Uint8Array(buffer)], options?.contentType ? { type: options.contentType } : undefined);

    // Map plural entity_type ('stories'/'tasks'/'bugs') to TAPD's singular `type`
    // ('story'/'task'/'bug'). When customField is provided, the type becomes
    // '<base>_custom_field' to attach into a rich-text custom field.
    const baseType = entityType.endsWith('s') ? entityType.slice(0, -1) : entityType;
    const tapdType = options?.customField ? `${baseType}_custom_field` : baseType;

    const form = new FormData();
    form.append('workspace_id', workspaceId);
    form.append('type', tapdType);
    form.append('entry_id', entityId);
    form.append('file', blob, name);
    if (options?.customField) form.append('custom_field', options.customField);
    if (options?.owner) form.append('owner', options.owner);
    if (options?.description) form.append('description', options.description);

    const endpoint = new URL(this.attachmentEndpoint, this.baseUrl).toString();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': this.buildAuthHeader(),
        'Accept': 'application/json',
        'User-Agent': 'TAPD-MCP-Server/1.0',
      },
      body: form,
    });

    const rawBody = await response.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      // body may be empty (TAPD returns empty body on success) or HTML on error
    }

    if (!response.ok) {
      const apiInfo = parsed?.info || parsed?.msg;
      const apiStatus = parsed?.status;
      const detail = apiInfo
        ? `info="${apiInfo}"${apiStatus !== undefined ? ` status=${apiStatus}` : ''}`
        : rawBody.slice(0, 500);
      throw new Error(
        `TAPD attachment upload failed: HTTP ${response.status} ${response.statusText} ` +
        `endpoint=${endpoint} type=${tapdType} entry_id=${entityId} :: ${detail}`
      );
    }

    // TAPD's POST /files/upload_attachment returns HTTP 200. The response
    // shape varies: when type=story_custom_field is used or when the call hits
    // an empty/legacy code path, the body may be empty; on a normal main-body
    // attach it returns {status:1, data:{Attachment:{...}}}. Prefer the inline
    // Attachment if present, otherwise fall back to GET /attachments.
    if (parsed && parsed.status !== 1 && parsed.status !== undefined) {
      throw new Error(
        `TAPD attachment upload rejected: status=${parsed.status} info="${parsed.info || 'Unknown error'}" ` +
        `endpoint=${endpoint} type=${tapdType} entry_id=${entityId}`
      );
    }

    if (parsed?.status === 1 && parsed.data) {
      const payload = Array.isArray(parsed.data) ? parsed.data[0] : parsed.data;
      const direct = payload?.Attachment || payload;
      if (direct && direct.id) {
        return direct as Attachment;
      }
    }

    try {
      const list = await this.request<{ Attachment: Attachment }>('GET', '/attachments', {
        workspace_id: workspaceId,
        entry_id: entityId,
        limit: 50,
      });
      const items = (list.data || []).map(it => it.Attachment).filter(Boolean);
      const matched = items
        .filter(a => a && (a.filename === name))
        .sort((a, b) => (b.created || '').localeCompare(a.created || ''));
      if (matched.length > 0) return matched[0];
      // fallback: newest by created if filename match fails (e.g. server-side rename)
      const newest = items.sort((a, b) => (b.created || '').localeCompare(a.created || ''))[0];
      if (newest) return newest;
    } catch {
      // GET fallback failed; fall through to synthesised result
    }

    return {
      id: '',
      workspace_id: workspaceId,
      entity_type: entityType,
      entity_id: entityId,
      filename: name,
    } as Attachment;
  }

  // ==================== Timesheet APIs ====================

  /**
   * TAPD timesheet API expects singular entity_type ("task"/"story"/"bug"),
   * but our MCP tool surface uses plural ("tasks"/"stories"/"bugs") for
   * consistency with comments/attachments. Normalize here.
   */
  private toSingularEntityType(entityType?: string): string | undefined {
    if (!entityType) return entityType;
    return entityType.endsWith('s') ? entityType.slice(0, -1) : entityType;
  }

  async listTimesheets(
    workspaceId: string,
    options?: {
      entityType?: string;
      entityId?: string;
      owner?: string;
      spentdate?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      page?: number;
    }
  ): Promise<Timesheet[]> {
    const params: Record<string, string | number | undefined> = {
      workspace_id: workspaceId,
      entity_type: this.toSingularEntityType(options?.entityType),
      entity_id: options?.entityId,
      owner: options?.owner,
      limit: options?.limit || 30,
      page: options?.page || 1,
    };
    if (options?.startDate || options?.endDate) {
      // TAPD supports spentdate[_gte]/[_lte] for range queries
      if (options.startDate) params['spentdate[_gte]'] = options.startDate;
      if (options.endDate) params['spentdate[_lte]'] = options.endDate;
    } else if (options?.spentdate) {
      params.spentdate = options.spentdate;
    }
    const response = await this.request<{ Timesheet: Timesheet }>('GET', '/timesheets', params);
    return (response.data || []).map(item => item.Timesheet);
  }

  async addTimesheet(
    workspaceId: string,
    data: {
      entityType: string;
      entityId: string;
      timespent: string;
      spentdate: string;
      owner?: string;
      memo?: string;
    }
  ): Promise<Timesheet> {
    const response = await this.request<{ Timesheet: Timesheet }>('POST', '/timesheets', {
      workspace_id: workspaceId,
      entity_type: this.toSingularEntityType(data.entityType),
      entity_id: data.entityId,
      timespent: data.timespent,
      spentdate: data.spentdate,
      owner: data.owner,
      memo: data.memo,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('Failed to add timesheet: no data returned');
    }
    return response.data[0].Timesheet;
  }

  async updateTimesheet(
    workspaceId: string,
    timesheetId: string,
    data: {
      timespent?: string;
      spentdate?: string;
      owner?: string;
      memo?: string;
    }
  ): Promise<Timesheet> {
    const response = await this.request<{ Timesheet: Timesheet }>('POST', '/timesheets/update', {
      workspace_id: workspaceId,
      id: timesheetId,
      timespent: data.timespent,
      spentdate: data.spentdate,
      owner: data.owner,
      memo: data.memo,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('Failed to update timesheet: no data returned');
    }
    return response.data[0].Timesheet;
  }

  async deleteTimesheet(workspaceId: string, timesheetId: string): Promise<boolean> {
    await this.request('POST', '/timesheets/delete', {
      workspace_id: workspaceId,
      id: timesheetId,
    });
    return true;
  }

  // ==================== Attachment List API ====================

  async listAttachments(
    workspaceId: string,
    entityType: 'stories' | 'tasks' | 'bugs',
    entityId: string,
    options?: { limit?: number; page?: number }
  ): Promise<Attachment[]> {
    // TAPD /attachments uses singular type for filter
    const tapdType = entityType.endsWith('s') ? entityType.slice(0, -1) : entityType;
    const response = await this.request<{ Attachment: Attachment }>('GET', '/attachments', {
      workspace_id: workspaceId,
      entry_type: tapdType,
      entry_id: entityId,
      limit: options?.limit || 30,
      page: options?.page || 1,
    });
    return (response.data || []).map(item => item.Attachment).filter(Boolean);
  }

  // ==================== Custom Fields Settings API ====================

  async getCustomFieldsSettings(
    workspaceId: string,
    entryType = 'story',
    options?: { refresh?: boolean }
  ): Promise<CustomFieldSetting[]> {
    if (options?.refresh) {
      await clearFieldsCache({ workspaceId, entityType: entryType });
    }
    const response = await this.request<{ CustomFieldSetting: CustomFieldSetting }>(
      'GET',
      '/stories/custom_fields_settings',
      { workspace_id: workspaceId, entry_type: entryType }
    );
    return (response.data || []).map(item => item.CustomFieldSetting).filter(Boolean);
  }

  // ==================== Utility Methods ====================

  translateStoryStatus(status: string): string {
    return STORY_STATUS_MAP[status] || status;
  }

  translateTaskStatus(status: string): string {
    return TASK_STATUS_MAP[status] || status;
  }

  translateBugStatus(status: string): string {
    return BUG_STATUS_MAP[status] || status;
  }

  parseUrl(url: string): { workspaceId: string; resourceType: string; resourceId: string } | null {
    const patterns = [
      /tapd\.cn\/tapd_fe\/(\d+)\/(\w+)\/detail\/(\d+)/i,
      /tapd\.cn\/tapd_fe\/(\d+)\/(\w+)\/view\/(\d+)/i,
      /tapd\.cn\/(\d+)\/prong\/(\w+)\/view\/(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        let resourceType = match[2].toLowerCase();
        if (resourceType === 'stories') resourceType = 'story';
        if (resourceType === 'requirements') resourceType = 'requirement';
        if (resourceType === 'bugs') resourceType = 'bug';
        if (resourceType === 'tasks') resourceType = 'task';

        return {
          workspaceId: match[1],
          resourceType,
          resourceId: match[3],
        };
      }
    }

    return null;
  }
}
