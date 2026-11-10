/**
 * Host-pipeline simulation.
 *
 * Replays the desktop host's argument handling against the local tapd-mcp
 * tool schemas, using the same libraries and options the host uses:
 *
 *   1. Host coercion - a numeric string that is a safe integer is turned into
 *      a NUMBER before validation. (Verified against the live host:
 *      workspace_id "37748852" fails, workspace_id "1137748852001393833"
 *      passes because it exceeds Number.MAX_SAFE_INTEGER.)
 *   2. Ajv v8 with the MCP SDK's `AjvJsonSchemaValidator` options
 *      (strict:false, validateFormats:true, validateSchema:false,
 *      allErrors:true), reporting `${instancePath}: ${message}`.
 *
 * This is the exact chain that produced "/workspace_id: must be string" and
 * "/limit: must be number" in production.
 */
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER = 'F:/mycode/mcp-servers/tapd-mcp/dist/index.js';
const WORKSPACE = '37748852';

const ajv = new Ajv({
  strict: false,
  validateFormats: true,
  validateSchema: false,
  allErrors: true,
});
addFormats(ajv);

/** The host's observed argument-mangling rule. */
function hostCoerce(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      if (Number.isSafeInteger(parsed)) return parsed;
    }
  }
  return value;
}

function hostCoerceArgs(args, schema) {
  const props = schema?.properties;
  if (!props || typeof props !== 'object') return args;
  for (const [key, propSchema] of Object.entries(props)) {
    if (!(key in args)) continue;
    args[key] = hostCoerce(args[key]);
  }
  return args;
}

function hostValidate(schema, rawArgs) {
  const args = hostCoerceArgs(structuredClone(rawArgs), schema);
  const validate = ajv.compile(schema);
  const valid = validate(args);
  if (valid) return { valid: true, errorMessage: undefined };
  return {
    valid: false,
    errorMessage: (validate.errors || [])
      .map((e) => `${e.instancePath}: ${e.message}`)
      .join('; '),
  };
}

// ---------------------------------------------------------------------------
const transport = new StdioClientTransport({
  command: 'node',
  args: [SERVER],
  env: { ...process.env, TAPD_WORKSPACE_ID: WORKSPACE },
  stderr: 'ignore',
});
const client = new Client({ name: 'host-sim', version: '1.0.0' });
await client.connect(transport);
const { tools } = await client.listTools();

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` :: ${detail}` : ''}`);
}

function schemaFor(name) {
  return tools.find((t) => t.name === name)?.inputSchema;
}

console.log(`=== host pipeline simulation over ${tools.length} tools ===\n`);

const cases = [
  ['tapd_get_current_user', { workspace_id: WORKSPACE }, 'numeric string id'],
  ['tapd_get_current_user', { workspace_id: Number(WORKSPACE) }, 'numeric id'],
  ['tapd_get_story', { story_id: '1137748852001393833' }, 'long numeric string id'],
  ['tapd_get_story', { story_id: '37748852' }, 'short numeric string id'],
  ['tapd_get_story', { story_id: '1137748852001393833', fields: 123 }, 'number into string field'],
  ['tapd_get_story', { story_id: '1137748852001393833', fields: 'id,name' }, 'normal string field'],
  ['tapd_get_story', { story_id: '1137748852001393833', download_images: true }, 'boolean'],
  ['tapd_get_story', { story_id: '1137748852001393833', download_images: 'true' }, 'string boolean'],
  ['tapd_get_story', { story_id: '1137748852001393833', download_images: 1 }, 'numeric boolean'],
  ['tapd_get_custom_fields_settings', { workspace_id: WORKSPACE, refresh: true }, 'refresh boolean'],
  ['tapd_get_custom_fields_settings', { workspace_id: WORKSPACE, refresh: 'true' }, 'refresh string boolean'],
  ['tapd_get_custom_fields_settings', { workspace_id: WORKSPACE, refresh: 1 }, 'refresh numeric boolean'],
  ['tapd_get_custom_fields_settings', { workspace_id: WORKSPACE, refresh: false }, 'refresh false'],
  ['tapd_apply_story_defaults', { workspace_id: WORKSPACE, story_id: '1137748852001393833', dry_run: true }, 'dry_run boolean'],
  ['tapd_apply_story_defaults', { workspace_id: WORKSPACE, story_id: '1137748852001393833', dry_run: 'true' }, 'dry_run string boolean'],
  ['tapd_list_stories', { workspace_id: WORKSPACE, iteration_id: '1137748852001004376', limit: 3 }, 'limit number'],
  ['tapd_list_stories', { workspace_id: WORKSPACE, iteration_id: '1137748852001004376', limit: '3' }, 'limit string'],
  ['tapd_list_comments', { workspace_id: WORKSPACE, entry_type: 'stories', entry_id: '1137748852001393833' }, 'enum + id'],
  ['tapd_list_workspace_users', { workspace_id: WORKSPACE }, 'workspace users'],
];

for (const [toolName, args, label] of cases) {
  const schema = schemaFor(toolName);
  if (!schema) {
    check(`${toolName} (${label})`, false, 'tool not found');
    continue;
  }
  const res = hostValidate(schema, args);
  check(`${toolName} (${label})`, res.valid, res.valid ? 'accepted' : res.errorMessage);
}

// The required-argument check must still fire.
{
  const schema = schemaFor('tapd_list_comments');
  const res = hostValidate(schema, { entry_type: 'stories', entry_id: '1137748852001393833' });
  check(
    'required workspace_id still enforced by the host validator',
    !res.valid && /workspace_id/.test(res.errorMessage),
    res.errorMessage
  );
}

// Every tool's schema must compile with Ajv and accept an empty argument set
// for its optional properties (i.e. no schema is malformed by the widening).
{
  let compileErrors = [];
  for (const tool of tools) {
    try {
      ajv.compile(tool.inputSchema);
    } catch (e) {
      compileErrors.push(`${tool.name}: ${e.message}`);
    }
  }
  check(
    'every tool schema compiles cleanly with Ajv',
    compileErrors.length === 0,
    compileErrors.length ? compileErrors.join(' | ') : `${tools.length} schemas compiled`
  );
}

console.log(`\n=== ${failures === 0 ? 'ALL HOST-PIPELINE CHECKS PASSED' : failures + ' CHECK(S) FAILED'} ===`);
await client.close();
process.exit(failures === 0 ? 0 : 1);
