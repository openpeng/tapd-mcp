/**
 * Before/after comparison.
 *
 * Runs the host pipeline (numeric-string coercion + Ajv v8 with the MCP SDK's
 * validator options) twice:
 *   - against the ORIGINAL schema (single scalar types) -> reproduces the bug
 *   - against the FIXED schema (union types)          -> shows it is gone
 *
 * The original schema is reconstructed by collapsing every union type back
 * to its first member, which is exactly what the pre-fix server advertised.
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

// --- host pipeline ----------------------------------------------------------
/**
 * The host's observed argument-mangling rule.
 *
 * Every observation from the live host is reproduced by this single rule:
 *   - a numeric string that is a safe integer becomes a NUMBER
 *     ("37748852" -> 37748852, "1137748852001393833" stays a string
 *      because it exceeds Number.MAX_SAFE_INTEGER)
 *   - everything else (strings, booleans, non-safe numbers) is untouched
 *
 * The host then validates the mangled value strictly against the tool's
 * advertised JSON Schema (Ajv v8), which is what produces
 * "/workspace_id: must be string" and "/limit: must be number".
 */
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
  if (valid) return { valid: true };
  return {
    valid: false,
    errorMessage: (validate.errors || [])
      .map((e) => `${e.instancePath}: ${e.message}`)
      .join('; '),
  };
}

/** Collapse union types back to the pre-fix single type. */
function collapseToOldSchema(schema) {
  const copy = structuredClone(schema);
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.type)) node.type = node.type[0];
    if (node.properties && typeof node.properties === 'object') {
      for (const p of Object.values(node.properties)) walk(p);
    }
    if (node.items && !Array.isArray(node.items)) walk(node.items);
    if (node.additionalProperties && typeof node.additionalProperties === 'object') {
      walk(node.additionalProperties);
    }
  };
  walk(copy);
  return copy;
}

// ---------------------------------------------------------------------------
const transport = new StdioClientTransport({
  command: 'node',
  args: [SERVER],
  env: { ...process.env, TAPD_WORKSPACE_ID: WORKSPACE },
  stderr: 'ignore',
});
const client = new Client({ name: 'before-after', version: '1.0.0' });
await client.connect(transport);
const { tools } = await client.listTools();

const cases = [
  ['tapd_get_current_user', { workspace_id: WORKSPACE }],
  ['tapd_get_current_user', { workspace_id: Number(WORKSPACE) }],
  ['tapd_get_story', { story_id: '37748852' }],
  ['tapd_get_story', { story_id: '1137748852001393833', fields: 123 }],
  ['tapd_get_story', { story_id: '1137748852001393833', download_images: true }],
  ['tapd_get_custom_fields_settings', { workspace_id: WORKSPACE, refresh: true }],
  ['tapd_get_custom_fields_settings', { workspace_id: WORKSPACE, refresh: 'true' }],
  ['tapd_apply_story_defaults', { workspace_id: WORKSPACE, story_id: '1137748852001393833', dry_run: true }],
  ['tapd_list_stories', { workspace_id: WORKSPACE, iteration_id: '1137748852001004376', limit: '3' }],
];

console.log('\n  tool / arguments                                   | BEFORE (old schema)                    | AFTER (fixed schema)');
console.log('  ' + '-'.repeat(118));

let beforeFail = 0;
let afterFail = 0;
for (const [toolName, args] of cases) {
  const fixed = tools.find((t) => t.name === toolName).inputSchema;
  const old = collapseToOldSchema(fixed);

  const b = hostValidate(old, args);
  const a = hostValidate(fixed, args);
  if (!b.valid) beforeFail++;
  if (!a.valid) afterFail++;

  const label = `${toolName} ${JSON.stringify(args)}`.slice(0, 48);
  const bText = b.valid ? 'accepted' : b.errorMessage;
  const aText = a.valid ? 'accepted' : a.errorMessage;
  console.log(
    `  ${label.padEnd(48)} | ${bText.slice(0, 32).padEnd(32)} | ${aText}`
  );
}

console.log(`\n  BEFORE: ${beforeFail}/${cases.length} calls rejected by the host validator`);
console.log(`  AFTER : ${afterFail}/${cases.length} calls rejected by the host validator`);

await client.close();
process.exit(afterFail === 0 && beforeFail > 0 ? 0 : 1);
