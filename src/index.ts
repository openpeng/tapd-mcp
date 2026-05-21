#!/usr/bin/env node
/**
 * TAPD MCP Server - Model Context Protocol server for TAPD operations
 *
 * Supports: Stories, Tasks, Bugs, Iterations, Comments, Releases
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { TapdClient } from './tapd-client.js';

const API_TOKEN = process.env.TAPD_API_TOKEN;
const DEFAULT_WORKSPACE_ID = process.env.TAPD_WORKSPACE_ID;
const CURRENT_USER = process.env.TAPD_CURRENT_USER;
const API_USER = process.env.TAPD_API_USER;
const API_PASSWORD = process.env.TAPD_API_PASSWORD;
const ATTACHMENT_ENDPOINT = process.env.TAPD_ATTACHMENT_ENDPOINT;

const hasBasicAuth = Boolean(API_USER && API_PASSWORD);

if (!API_TOKEN && !hasBasicAuth) {
  console.error('Error: Set TAPD_API_TOKEN, or both TAPD_API_USER + TAPD_API_PASSWORD for Basic Auth');
  console.error('Get your token from: https://www.tapd.cn/tapd_api_token/token');
  process.exit(1);
}

const client = new TapdClient({
  apiToken: API_TOKEN || '',
  basicAuth: hasBasicAuth ? { username: API_USER!, password: API_PASSWORD! } : undefined,
  attachmentEndpoint: ATTACHMENT_ENDPOINT,
});

const tools: Tool[] = [
  // ==================== Story Tools ====================
  {
    name: 'tapd_get_story',
    description:
      'Get details of a specific story/requirement by ID or URL. ' +
      'By default returns only id/name/status to keep responses small; ' +
      'use the `fields` parameter to request more fields, or `fields="*"` for everything.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID (optional if URL provided or default set)' },
        story_id: { type: 'string', description: 'Story ID' },
        url: { type: 'string', description: 'TAPD story URL (alternative to workspace_id + story_id)' },
        fields: {
          type: 'string',
          description:
            'Comma-separated field list to return, e.g. "id,name,status,owner,priority,description,iteration_id,created". ' +
            'Default: "id,name,status". Use "*" to return all TAPD fields (~260, response will be very large).',
        },
      },
    },
  },
  {
    name: 'tapd_list_stories',
    description:
      'List stories in a workspace with optional filters. ' +
      'By default each story only contains id/name/status; pass `fields` to request more.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        iteration_id: { type: 'string', description: 'Filter by iteration ID' },
        status: { type: 'string', description: 'Filter by status (planning, developing, testing, resolved, closed)' },
        owner: { type: 'string', description: 'Filter by owner name' },
        creator: { type: 'string', description: 'Filter by creator name' },
        limit: { type: 'number', description: 'Max results (default 30)' },
        page: { type: 'number', description: 'Page number (default 1)' },
        fields: {
          type: 'string',
          description:
            'Comma-separated fields per item. Default: "id,name,status". Use "*" for all fields.',
        },
      },
      required: ['workspace_id'],
    },
  },
  {
    name: 'tapd_create_story',
    description: 'Create a new story/requirement',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        name: { type: 'string', description: 'Story title' },
        description: { type: 'string', description: 'Story description (supports HTML)' },
        owner: { type: 'string', description: 'Owner name(s), semicolon separated' },
        priority: { type: 'string', description: 'Priority (1-4, 1=highest)' },
        iteration_id: { type: 'string', description: 'Iteration ID' },
        parent_id: { type: 'string', description: 'Parent story ID' },
        begin: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        due: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
        category_id: { type: 'string', description: 'Category ID' },
        release_id: { type: 'string', description: 'Release ID' },
      },
      required: ['workspace_id', 'name'],
    },
  },
  {
    name: 'tapd_update_story',
    description: 'Update an existing story/requirement',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        story_id: { type: 'string', description: 'Story ID to update' },
        name: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New description' },
        owner: { type: 'string', description: 'New owner(s)' },
        status: { type: 'string', description: 'New status' },
        priority: { type: 'string', description: 'New priority' },
        iteration_id: { type: 'string', description: 'New iteration ID' },
        begin: { type: 'string', description: 'New start date' },
        due: { type: 'string', description: 'New due date' },
      },
      required: ['workspace_id', 'story_id'],
    },
  },

  // ==================== Task Tools ====================
  {
    name: 'tapd_get_task',
    description: 'Get details of a specific task',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        task_id: { type: 'string', description: 'Task ID' },
        url: { type: 'string', description: 'TAPD task URL' },
      },
    },
  },
  {
    name: 'tapd_list_tasks',
    description: 'List tasks, optionally filtered by story',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        story_id: { type: 'string', description: 'Filter by parent story ID' },
        iteration_id: { type: 'string', description: 'Filter by iteration ID' },
        status: { type: 'string', description: 'Filter by status (open, progressing, done)' },
        owner: { type: 'string', description: 'Filter by owner' },
        limit: { type: 'number', description: 'Max results' },
        page: { type: 'number', description: 'Page number' },
      },
      required: ['workspace_id'],
    },
  },
  {
    name: 'tapd_create_task',
    description: 'Create a new task under a story',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        name: { type: 'string', description: 'Task name' },
        story_id: { type: 'string', description: 'Parent story ID' },
        description: { type: 'string', description: 'Task description' },
        owner: { type: 'string', description: 'Task owner' },
        priority: { type: 'string', description: 'Priority' },
        iteration_id: { type: 'string', description: 'Iteration ID' },
        begin: { type: 'string', description: 'Start date' },
        due: { type: 'string', description: 'Due date' },
        effort: { type: 'string', description: 'Estimated effort (hours)' },
      },
      required: ['workspace_id', 'name'],
    },
  },
  {
    name: 'tapd_update_task',
    description:
      'Update a TAPD task. Supports status changes, work-hour tracking ' +
      '(effort=estimated hours, effort_completed=spent hours, remain=remaining hours, ' +
      'exceed=overrun hours, progress=completion %), reassignment, and date changes.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        task_id: { type: 'string', description: 'Task ID to update (required)' },
        name: { type: 'string', description: 'New task name' },
        description: { type: 'string', description: 'New description' },
        owner: { type: 'string', description: 'Reassign to a user (or semicolon-separated list)' },
        status: {
          type: 'string',
          description: 'Task status: open (未开始) | progressing (进行中) | done (已完成)',
        },
        priority: { type: 'string', description: 'Priority 1-4 (1=highest)' },
        begin: { type: 'string', description: 'Start date YYYY-MM-DD' },
        due: { type: 'string', description: 'Due date YYYY-MM-DD' },
        effort: {
          type: 'string',
          description: 'Estimated total work hours, e.g. "8" or "8.5"',
        },
        effort_completed: {
          type: 'string',
          description: 'Hours already spent, e.g. "3.5"',
        },
        remain: {
          type: 'string',
          description:
            'Hours remaining, e.g. "4.5". TAPD may auto-derive from effort - effort_completed; pass explicitly to override.',
        },
        exceed: {
          type: 'string',
          description: 'Hours exceeded beyond the original estimate, e.g. "1"',
        },
        progress: {
          type: 'string',
          description: 'Completion percentage 0-100, e.g. "50"',
        },
        iteration_id: { type: 'string', description: 'Move to a different iteration' },
        completed: {
          type: 'string',
          description:
            'Completion datetime, "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS". Pass to override TAPD\'s auto-fill of "now" when status flips to done.',
        },
      },
      required: ['workspace_id', 'task_id'],
    },
  },

  // ==================== Bug Tools ====================
  {
    name: 'tapd_get_bug',
    description: 'Get details of a specific bug',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        bug_id: { type: 'string', description: 'Bug ID' },
        url: { type: 'string', description: 'TAPD bug URL' },
      },
    },
  },
  {
    name: 'tapd_list_bugs',
    description: 'List bugs with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        iteration_id: { type: 'string', description: 'Filter by iteration' },
        status: { type: 'string', description: 'Filter by status (new, in_progress, resolved, verified, closed, rejected, reopened)' },
        severity: { type: 'string', description: 'Filter by severity' },
        current_owner: { type: 'string', description: 'Filter by current owner' },
        limit: { type: 'number', description: 'Max results' },
        page: { type: 'number', description: 'Page number' },
      },
      required: ['workspace_id'],
    },
  },
  {
    name: 'tapd_create_bug',
    description: 'Create a new bug report',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        title: { type: 'string', description: 'Bug title' },
        description: { type: 'string', description: 'Bug description' },
        current_owner: { type: 'string', description: 'Assignee' },
        severity: { type: 'string', description: 'Severity (fatal, serious, normal, prompt, advice)' },
        priority: { type: 'string', description: 'Priority' },
        iteration_id: { type: 'string', description: 'Iteration ID' },
        module: { type: 'string', description: 'Module name' },
        version_test: { type: 'string', description: 'Test version' },
        version_report: { type: 'string', description: 'Report version' },
        bugtype: { type: 'string', description: 'Bug type' },
      },
      required: ['workspace_id', 'title'],
    },
  },
  {
    name: 'tapd_update_bug',
    description: 'Update a bug',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        bug_id: { type: 'string', description: 'Bug ID' },
        title: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New description' },
        current_owner: { type: 'string', description: 'New owner' },
        status: { type: 'string', description: 'New status' },
        severity: { type: 'string', description: 'New severity' },
        priority: { type: 'string', description: 'New priority' },
      },
      required: ['workspace_id', 'bug_id'],
    },
  },

  // ==================== Iteration Tools ====================
  {
    name: 'tapd_get_iteration',
    description: 'Get details of a specific iteration',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        iteration_id: { type: 'string', description: 'Iteration ID' },
      },
      required: ['workspace_id', 'iteration_id'],
    },
  },
  {
    name: 'tapd_list_iterations',
    description: 'List iterations in a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        status: { type: 'string', description: 'Filter by status' },
        limit: { type: 'number', description: 'Max results' },
        page: { type: 'number', description: 'Page number' },
      },
      required: ['workspace_id'],
    },
  },
  {
    name: 'tapd_create_iteration',
    description: 'Create a new iteration/sprint',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        name: { type: 'string', description: 'Iteration name' },
        description: { type: 'string', description: 'Description' },
        startdate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        enddate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      },
      required: ['workspace_id', 'name'],
    },
  },
  {
    name: 'tapd_update_iteration',
    description: 'Update an iteration',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        iteration_id: { type: 'string', description: 'Iteration ID' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'New description' },
        startdate: { type: 'string', description: 'New start date' },
        enddate: { type: 'string', description: 'New end date' },
        status: { type: 'string', description: 'New status' },
      },
      required: ['workspace_id', 'iteration_id'],
    },
  },

  // ==================== Comment Tools ====================
  {
    name: 'tapd_list_comments',
    description: 'List comments on a story, task, or bug',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        entry_type: { type: 'string', enum: ['stories', 'tasks', 'bugs'], description: 'Type of item' },
        entry_id: { type: 'string', description: 'ID of the story/task/bug' },
        limit: { type: 'number', description: 'Max results' },
        page: { type: 'number', description: 'Page number' },
      },
      required: ['workspace_id', 'entry_type', 'entry_id'],
    },
  },
  {
    name: 'tapd_add_comment',
    description: 'Add a comment to a story, task, or bug',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        entry_type: { type: 'string', enum: ['stories', 'tasks', 'bugs'], description: 'Type of item' },
        entry_id: { type: 'string', description: 'ID of the story/task/bug' },
        description: { type: 'string', description: 'Comment content' },
      },
      required: ['workspace_id', 'entry_type', 'entry_id', 'description'],
    },
  },

  // ==================== Attachment Tools ====================
  {
    name: 'tapd_upload_attachment',
    description:
      'Upload a file or image to a TAPD story, task, or bug via /files/upload_attachment. ' +
      'Provide either `file_path` (a local path the MCP server can read) or `file_base64` ' +
      '(base64-encoded bytes; requires `filename`). ' +
      'By default the file is attached to the entity\'s "Attachments" section. ' +
      'Pass `custom_field` (e.g. "custom_field_one") to instead embed the file into a ' +
      'rich-text custom field (TAPD treats this as `<type>_custom_field` upload).',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        entity_type: {
          type: 'string',
          enum: ['stories', 'tasks', 'bugs'],
          description: 'Target entity type (mapped internally to TAPD `type` = story/task/bug)',
        },
        entity_id: { type: 'string', description: 'ID of the story/task/bug to attach to' },
        file_path: {
          type: 'string',
          description: 'Absolute or relative local path to the file. Mutually exclusive with file_base64.',
        },
        file_base64: {
          type: 'string',
          description: 'Base64-encoded file content (no data: prefix). Requires `filename`. Mutually exclusive with file_path.',
        },
        filename: {
          type: 'string',
          description: 'Override the upload filename. Required when using file_base64; optional when using file_path (defaults to the basename).',
        },
        description: { type: 'string', description: 'Optional attachment description' },
        content_type: {
          type: 'string',
          description: 'Optional MIME type (e.g. "image/png"). TAPD usually infers from the filename, so omit unless needed.',
        },
        custom_field: {
          type: 'string',
          description: 'Optional. English name of a rich-text custom field (e.g. "custom_field_one"). When set, the file is embedded into that custom field instead of the attachment list.',
        },
        owner: {
          type: 'string',
          description: 'Optional attachment creator (TAPD `owner` field). Defaults to the API token holder.',
        },
      },
      required: ['entity_type', 'entity_id'],
    },
  },

  // ==================== Timesheet Tools ====================
  {
    name: 'tapd_list_timesheets',
    description: 'List timesheets (work-log records) for a workspace, optionally filtered by entity (story/task/bug), owner, or date range.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        entity_type: {
          type: 'string',
          enum: ['stories', 'tasks', 'bugs'],
          description: 'Filter by entity type (plural form, e.g. "stories")',
        },
        entity_id: { type: 'string', description: 'Filter by specific story/task/bug ID' },
        owner: { type: 'string', description: 'Filter by owner (TAPD user id)' },
        spentdate: { type: 'string', description: 'Filter by exact date YYYY-MM-DD' },
        start_date: { type: 'string', description: 'Range start date YYYY-MM-DD (inclusive)' },
        end_date: { type: 'string', description: 'Range end date YYYY-MM-DD (inclusive)' },
        limit: { type: 'number', description: 'Max results (default 30)' },
        page: { type: 'number', description: 'Page number (default 1)' },
      },
      required: ['workspace_id'],
    },
  },
  {
    name: 'tapd_add_timesheet',
    description: 'Add a timesheet record (log work hours) to a story, task, or bug. ' +
      'IMPORTANT: `owner` must be a TAPD English user id (e.g. "xiaopeng_lei"), not a Chinese display name — the API rejects display names with "Save fail."',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        entity_type: {
          type: 'string',
          enum: ['stories', 'tasks', 'bugs'],
          description: 'Target entity type (plural, e.g. "tasks"). The server maps to singular form for the TAPD API.',
        },
        entity_id: { type: 'string', description: 'Story/task/bug ID to log time on' },
        timespent: { type: 'string', description: 'Hours spent, e.g. "2" or "1.5"' },
        spentdate: { type: 'string', description: 'Date of work YYYY-MM-DD, e.g. "2025-05-15"' },
        owner: { type: 'string', description: 'TAPD English user id of the person who did the work (e.g. "xiaopeng_lei"). Chinese display names are rejected by TAPD.' },
        memo: { type: 'string', description: 'Optional note / description for this time log' },
      },
      required: ['workspace_id', 'entity_type', 'entity_id', 'timespent', 'spentdate', 'owner'],
    },
  },
  {
    name: 'tapd_update_timesheet',
    description: 'Update an existing timesheet record. Requires timesheets::update permission on the API token.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        timesheet_id: { type: 'string', description: 'Timesheet record ID to update' },
        timespent: { type: 'string', description: 'New hours value' },
        spentdate: { type: 'string', description: 'New date YYYY-MM-DD' },
        owner: { type: 'string', description: 'New owner (TAPD user id)' },
        memo: { type: 'string', description: 'New memo / note' },
      },
      required: ['workspace_id', 'timesheet_id'],
    },
  },
  {
    name: 'tapd_delete_timesheet',
    description: 'Delete a timesheet record. Requires timesheets::delete permission on the API token.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        timesheet_id: { type: 'string', description: 'Timesheet record ID to delete' },
      },
      required: ['workspace_id', 'timesheet_id'],
    },
  },

  // ==================== Attachment List Tool ====================
  {
    name: 'tapd_list_attachments',
    description: 'List attachments on a story, task, or bug.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        entity_type: {
          type: 'string',
          enum: ['stories', 'tasks', 'bugs'],
          description: 'Entity type (plural)',
        },
        entity_id: { type: 'string', description: 'Story/task/bug ID' },
        limit: { type: 'number', description: 'Max results (default 30)' },
        page: { type: 'number', description: 'Page number (default 1)' },
      },
      required: ['workspace_id', 'entity_type', 'entity_id'],
    },
  },

  // ==================== Custom Fields Settings Tool ====================
  {
    name: 'tapd_get_custom_fields_settings',
    description: 'Get custom field schema / definitions for stories (or other entry types) in a workspace. Useful for discovering available custom field names and their types/options before reading or writing custom fields.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        entry_type: {
          type: 'string',
          description: 'Entry type to query custom fields for. Defaults to "story".',
        },
      },
      required: ['workspace_id'],
    },
  },

  // ==================== Release Tools ====================
  {
    name: 'tapd_list_releases',
    description: 'List releases in a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        status: { type: 'string', description: 'Filter by status' },
        limit: { type: 'number', description: 'Max results' },
        page: { type: 'number', description: 'Page number' },
      },
      required: ['workspace_id'],
    },
  },
  {
    name: 'tapd_create_release',
    description: 'Create a new release',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        name: { type: 'string', description: 'Release name' },
        description: { type: 'string', description: 'Description' },
        startdate: { type: 'string', description: 'Start date' },
        enddate: { type: 'string', description: 'End date' },
      },
      required: ['workspace_id', 'name'],
    },
  },
  {
    name: 'tapd_update_release',
    description: 'Update a release',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        release_id: { type: 'string', description: 'Release ID' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'New description' },
        startdate: { type: 'string', description: 'New start date' },
        enddate: { type: 'string', description: 'New end date' },
        status: { type: 'string', description: 'New status' },
      },
      required: ['workspace_id', 'release_id'],
    },
  },

  // ==================== Code Relation Tools ====================
  {
    name: 'tapd_get_story_commits',
    description: 'Get code commits associated with a story',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        story_id: { type: 'string', description: 'Story ID' },
        limit: { type: 'number', description: 'Max results' },
        page: { type: 'number', description: 'Page number' },
      },
      required: ['workspace_id', 'story_id'],
    },
  },

  // ==================== Utility Tools ====================
  {
    name: 'tapd_parse_url',
    description: 'Parse a TAPD URL to extract workspace ID, resource type, and resource ID',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'TAPD URL to parse' },
      },
      required: ['url'],
    },
  },
  {
    name: 'tapd_get_current_user',
    description:
      'Get the current TAPD user (the "me" identity behind the API token). ' +
      'Reads from the TAPD_CURRENT_USER env var as the source of truth. ' +
      'When workspace_id is provided (or TAPD_WORKSPACE_ID is set), enriches the result ' +
      'with name/email/role looked up via /users/get_users_by_workspace_id.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: {
          type: 'string',
          description: 'Optional workspace ID to enrich with member details. Falls back to TAPD_WORKSPACE_ID.',
        },
      },
    },
  },
];

function getWorkspaceId(args: Record<string, unknown>): string {
  const wsId = args.workspace_id as string | undefined;
  if (wsId) return wsId;
  if (DEFAULT_WORKSPACE_ID) return DEFAULT_WORKSPACE_ID;
  throw new Error('workspace_id is required (or set TAPD_WORKSPACE_ID env var)');
}

/**
 * Resolve the `fields` parameter for read tools.
 * - undefined / empty => default minimal set 'id,name,status' (or caller-provided default)
 * - '*' / 'all' => undefined (let TAPD return everything)
 * - otherwise => trimmed comma string
 *
 * Returns both the api-bound string and a Set of requested field names so callers
 * can decide whether to attach derived helpers (e.g. status_name).
 */
function resolveFields(
  args: Record<string, unknown>,
  defaultFields = 'id,name,status'
): { fields: string | undefined; requested: Set<string>; isAll: boolean } {
  const raw = (args.fields as string | undefined)?.trim();
  if (raw === '*' || raw === 'all') {
    return { fields: undefined, requested: new Set(), isAll: true };
  }
  const fields = raw && raw.length > 0 ? raw : defaultFields;
  const requested = new Set(fields.split(',').map(f => f.trim()).filter(Boolean));
  return { fields, requested, isAll: false };
}

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    // Story handlers
    case 'tapd_get_story': {
      const { fields, requested, isAll } = resolveFields(args);
      const attachStatusName = (s: any) =>
        s && (isAll || requested.has('status'))
          ? { ...s, status_name: client.translateStoryStatus(s.status || '') }
          : s;
      if (args.url) {
        const parsed = client.parseUrl(args.url as string);
        if (!parsed) throw new Error('Invalid TAPD URL');
        const story = await client.getStory(parsed.workspaceId, parsed.resourceId, fields);
        return attachStatusName(story);
      }
      const wsId = getWorkspaceId(args);
      const story = await client.getStory(wsId, args.story_id as string, fields);
      return attachStatusName(story);
    }

    case 'tapd_list_stories': {
      const { fields, requested, isAll } = resolveFields(args);
      const stories = await client.listStories(getWorkspaceId(args), {
        iterationId: args.iteration_id as string,
        status: args.status as string,
        owner: args.owner as string,
        creator: args.creator as string,
        limit: args.limit as number,
        page: args.page as number,
        fields,
      });
      const showStatus = isAll || requested.has('status');
      return stories.map(s =>
        showStatus ? { ...s, status_name: client.translateStoryStatus(s.status || '') } : s
      );
    }

    case 'tapd_create_story': {
      return await client.createStory(getWorkspaceId(args), {
        name: args.name as string,
        description: args.description as string,
        owner: args.owner as string,
        priority: args.priority as string,
        iterationId: args.iteration_id as string,
        parentId: args.parent_id as string,
        begin: args.begin as string,
        due: args.due as string,
        categoryId: args.category_id as string,
        releaseId: args.release_id as string,
      });
    }

    case 'tapd_update_story': {
      return await client.updateStory(getWorkspaceId(args), args.story_id as string, {
        name: args.name as string,
        description: args.description as string,
        owner: args.owner as string,
        status: args.status as string,
        priority: args.priority as string,
        iterationId: args.iteration_id as string,
        begin: args.begin as string,
        due: args.due as string,
      });
    }

    // Task handlers
    case 'tapd_get_task': {
      if (args.url) {
        const parsed = client.parseUrl(args.url as string);
        if (!parsed) throw new Error('Invalid TAPD URL');
        const task = await client.getTask(parsed.workspaceId, parsed.resourceId);
        return task ? { ...task, status_name: client.translateTaskStatus(task.status || '') } : null;
      }
      const wsId = getWorkspaceId(args);
      const task = await client.getTask(wsId, args.task_id as string);
      return task ? { ...task, status_name: client.translateTaskStatus(task.status || '') } : null;
    }

    case 'tapd_list_tasks': {
      const tasks = await client.listTasks(getWorkspaceId(args), {
        storyId: args.story_id as string,
        iterationId: args.iteration_id as string,
        status: args.status as string,
        owner: args.owner as string,
        limit: args.limit as number,
        page: args.page as number,
      });
      return tasks.map(t => ({ ...t, status_name: client.translateTaskStatus(t.status || '') }));
    }

    case 'tapd_create_task': {
      return await client.createTask(getWorkspaceId(args), {
        name: args.name as string,
        storyId: args.story_id as string,
        description: args.description as string,
        owner: args.owner as string,
        priority: args.priority as string,
        iterationId: args.iteration_id as string,
        begin: args.begin as string,
        due: args.due as string,
        effort: args.effort as string,
      });
    }

    case 'tapd_update_task': {
      return await client.updateTask(getWorkspaceId(args), args.task_id as string, {
        name: args.name as string,
        description: args.description as string,
        owner: args.owner as string,
        status: args.status as string,
        priority: args.priority as string,
        begin: args.begin as string,
        due: args.due as string,
        effort: args.effort as string,
        effortCompleted: args.effort_completed as string,
        remain: args.remain as string,
        exceed: args.exceed as string,
        progress: args.progress as string,
        iterationId: args.iteration_id as string,
        completed: args.completed as string,
      });
    }

    // Bug handlers
    case 'tapd_get_bug': {
      if (args.url) {
        const parsed = client.parseUrl(args.url as string);
        if (!parsed) throw new Error('Invalid TAPD URL');
        const bug = await client.getBug(parsed.workspaceId, parsed.resourceId);
        return bug ? { ...bug, status_name: client.translateBugStatus(bug.status || '') } : null;
      }
      const wsId = getWorkspaceId(args);
      const bug = await client.getBug(wsId, args.bug_id as string);
      return bug ? { ...bug, status_name: client.translateBugStatus(bug.status || '') } : null;
    }

    case 'tapd_list_bugs': {
      const bugs = await client.listBugs(getWorkspaceId(args), {
        iterationId: args.iteration_id as string,
        status: args.status as string,
        severity: args.severity as string,
        currentOwner: args.current_owner as string,
        limit: args.limit as number,
        page: args.page as number,
      });
      return bugs.map(b => ({ ...b, status_name: client.translateBugStatus(b.status || '') }));
    }

    case 'tapd_create_bug': {
      return await client.createBug(getWorkspaceId(args), {
        title: args.title as string,
        description: args.description as string,
        currentOwner: args.current_owner as string,
        severity: args.severity as string,
        priority: args.priority as string,
        iterationId: args.iteration_id as string,
        module: args.module as string,
        versionTest: args.version_test as string,
        versionReport: args.version_report as string,
        bugtype: args.bugtype as string,
      });
    }

    case 'tapd_update_bug': {
      return await client.updateBug(getWorkspaceId(args), args.bug_id as string, {
        title: args.title as string,
        description: args.description as string,
        currentOwner: args.current_owner as string,
        status: args.status as string,
        severity: args.severity as string,
        priority: args.priority as string,
      });
    }

    // Iteration handlers
    case 'tapd_get_iteration': {
      return await client.getIteration(getWorkspaceId(args), args.iteration_id as string);
    }

    case 'tapd_list_iterations': {
      return await client.listIterations(getWorkspaceId(args), {
        status: args.status as string,
        limit: args.limit as number,
        page: args.page as number,
      });
    }

    case 'tapd_create_iteration': {
      return await client.createIteration(getWorkspaceId(args), {
        name: args.name as string,
        description: args.description as string,
        startdate: args.startdate as string,
        enddate: args.enddate as string,
      });
    }

    case 'tapd_update_iteration': {
      return await client.updateIteration(getWorkspaceId(args), args.iteration_id as string, {
        name: args.name as string,
        description: args.description as string,
        startdate: args.startdate as string,
        enddate: args.enddate as string,
        status: args.status as string,
      });
    }

    // Comment handlers
    case 'tapd_list_comments': {
      return await client.listComments(
        getWorkspaceId(args),
        args.entry_type as 'stories' | 'tasks' | 'bugs',
        args.entry_id as string,
        { limit: args.limit as number, page: args.page as number }
      );
    }

    case 'tapd_add_comment': {
      return await client.addComment(
        getWorkspaceId(args),
        args.entry_type as 'stories' | 'tasks' | 'bugs',
        args.entry_id as string,
        args.description as string
      );
    }

    // Timesheet handlers
    case 'tapd_list_timesheets': {
      return await client.listTimesheets(getWorkspaceId(args), {
        entityType: args.entity_type as string,
        entityId: args.entity_id as string,
        owner: args.owner as string,
        spentdate: args.spentdate as string,
        startDate: args.start_date as string,
        endDate: args.end_date as string,
        limit: args.limit as number,
        page: args.page as number,
      });
    }

    case 'tapd_add_timesheet': {
      return await client.addTimesheet(getWorkspaceId(args), {
        entityType: args.entity_type as string,
        entityId: args.entity_id as string,
        timespent: args.timespent as string,
        spentdate: args.spentdate as string,
        owner: args.owner as string,
        memo: args.memo as string,
      });
    }

    case 'tapd_update_timesheet': {
      return await client.updateTimesheet(
        getWorkspaceId(args),
        args.timesheet_id as string,
        {
          timespent: args.timespent as string,
          spentdate: args.spentdate as string,
          owner: args.owner as string,
          memo: args.memo as string,
        }
      );
    }

    case 'tapd_delete_timesheet': {
      return await client.deleteTimesheet(
        getWorkspaceId(args),
        args.timesheet_id as string
      );
    }

    // Attachment handlers
    case 'tapd_list_attachments': {
      return await client.listAttachments(
        getWorkspaceId(args),
        args.entity_type as 'stories' | 'tasks' | 'bugs',
        args.entity_id as string,
        { limit: args.limit as number, page: args.page as number }
      );
    }

    case 'tapd_upload_attachment': {
      const filePath = args.file_path as string | undefined;
      const fileBase64 = args.file_base64 as string | undefined;
      const filename = args.filename as string | undefined;

      if (!filePath && !fileBase64) {
        throw new Error('Either file_path or file_base64 is required');
      }
      if (filePath && fileBase64) {
        throw new Error('Provide only one of file_path or file_base64, not both');
      }
      if (fileBase64 && !filename) {
        throw new Error('filename is required when uploading via file_base64');
      }

      const source = filePath
        ? { filePath, filename }
        : { data: Buffer.from(fileBase64 as string, 'base64'), filename };

      return await client.uploadAttachment(
        getWorkspaceId(args),
        args.entity_type as 'stories' | 'tasks' | 'bugs',
        args.entity_id as string,
        source,
        {
          description: args.description as string,
          contentType: args.content_type as string,
          customField: args.custom_field as string,
          owner: args.owner as string,
        }
      );
    }

    // Custom fields settings handler
    case 'tapd_get_custom_fields_settings': {
      return await client.getCustomFieldsSettings(
        getWorkspaceId(args),
        (args.entry_type as string) || 'story'
      );
    }

    // Release handlers
    case 'tapd_list_releases': {
      return await client.listReleases(getWorkspaceId(args), {
        status: args.status as string,
        limit: args.limit as number,
        page: args.page as number,
      });
    }

    case 'tapd_create_release': {
      return await client.createRelease(getWorkspaceId(args), {
        name: args.name as string,
        description: args.description as string,
        startdate: args.startdate as string,
        enddate: args.enddate as string,
      });
    }

    case 'tapd_update_release': {
      return await client.updateRelease(getWorkspaceId(args), args.release_id as string, {
        name: args.name as string,
        description: args.description as string,
        startdate: args.startdate as string,
        enddate: args.enddate as string,
        status: args.status as string,
      });
    }

    // Code relation handlers
    case 'tapd_get_story_commits': {
      return await client.getStoryCodeCommits(
        getWorkspaceId(args),
        args.story_id as string,
        { limit: args.limit as number, page: args.page as number }
      );
    }

    // Utility handlers
    case 'tapd_parse_url': {
      const parsed = client.parseUrl(args.url as string);
      if (!parsed) throw new Error('Invalid TAPD URL format');
      return parsed;
    }

    case 'tapd_get_current_user': {
      if (!CURRENT_USER) {
        throw new Error(
          'TAPD_CURRENT_USER env var is not set. ' +
          'Set it to your TAPD user id (e.g. "xiaopeng_lei") in the MCP server config so I can identify "you".'
        );
      }
      const base: Record<string, unknown> = { user: CURRENT_USER, source: 'env' };
      const wsId = (args.workspace_id as string) || DEFAULT_WORKSPACE_ID;
      if (wsId) {
        try {
          const members = await client.getWorkspaceUsers(wsId);
          const match = members.find(
            m => m.user === CURRENT_USER || m.name === CURRENT_USER || (m as any).nick === CURRENT_USER
          );
          if (match) {
            return { ...base, workspace_id: wsId, matched_in_workspace: true, ...match };
          }
          return { ...base, workspace_id: wsId, matched_in_workspace: false };
        } catch (e) {
          base.enrich_error = e instanceof Error ? e.message : String(e);
        }
      }
      return base;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function main() {
  const server = new Server(
    {
      name: 'tapd-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await handleToolCall(
        request.params.name,
        (request.params.arguments || {}) as Record<string, unknown>
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${message}`,
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('TAPD MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
