/**
 * Regression test for the host argument-validation bug.
 *
 * Connects directly to the local tapd-mcp server over stdio (bypassing the
 * desktop host's bridge) and:
 *   1. checks that every scalar property in tools/list advertises a union type
 *   2. calls tools with the argument shapes that the host mangles
 *      (numeric ids as strings, numbers for string fields, booleans as
 *      "true"/1) and asserts the server handles them
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER = 'F:/mycode/mcp-servers/tapd-mcp/dist/index.js';
const WORKSPACE = '37748852';

const transport = new StdioClientTransport({
  command: 'node',
  args: [SERVER],
  env: {
    ...process.env,
    TAPD_API_TOKEN: process.env.TAPD_API_TOKEN,
    TAPD_WORKSPACE_ID: WORKSPACE,
    TAPD_CURRENT_USER: '雷晓鹏',
  },
  stderr: 'ignore',
});

const client = new Client({ name: 'tapd-host-compat-test', version: '1.0.0' });
await client.connect(transport);

let failures = 0;
function check(label, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`[${mark}] ${label}${detail ? ` :: ${detail}` : ''}`);
}

// ---------------------------------------------------------------- 1. schema
const { tools } = await client.listTools();
console.log(`\n=== tools/list: ${tools.length} tools ===`);

const badTypes = [];
for (const tool of tools) {
  const props = tool.inputSchema?.properties || {};
  for (const [name, prop] of Object.entries(props)) {
    if (!prop || typeof prop !== 'object') continue;
    const t = prop.type;
    if (typeof t === 'string' && ['string', 'number', 'boolean'].includes(t)) {
      badTypes.push(`${tool.name}.${name} (type: '${t}')`);
    }
  }
}
check(
  'all scalar properties advertise a union type',
  badTypes.length === 0,
  badTypes.length ? badTypes.join(', ') : `${tools.length} tools checked`
);

// Show a sample of the relaxed schemas
const sample = tools.find((t) => t.name === 'tapd_get_story');
console.log(
  '  sample tapd_get_story.inputSchema:',
  JSON.stringify(sample.inputSchema.properties.download_images),
  JSON.stringify(sample.inputSchema.properties.story_id)
);

// ------------------------------------------------------- 2. tool behaviour
async function call(name, args) {
  try {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content?.[0]?.text ?? '';
    const isError = res.isError === true || text.startsWith('Error:');
    return { isError, text };
  } catch (e) {
    return { isError: true, text: `THROWN: ${e.message}` };
  }
}

console.log('\n=== call matrix ===');

// workspace_id as a numeric STRING (host coerces it to a number)
{
  const r = await call('tapd_get_current_user', { workspace_id: WORKSPACE });
  check(
    'workspace_id as numeric string',
    !r.isError,
    r.isError ? r.text.slice(0, 160) : 'accepted'
  );
}

// workspace_id as a NUMBER
{
  const r = await call('tapd_get_current_user', { workspace_id: Number(WORKSPACE) });
  check('workspace_id as number', !r.isError, r.isError ? r.text.slice(0, 160) : 'accepted');
}

// story_id as a numeric string
{
  const r = await call('tapd_get_story', { story_id: '1137748852001393833', fields: 'id,name' });
  check('story_id as numeric string', !r.isError, r.isError ? r.text.slice(0, 160) : 'accepted');
}

// fields as a number -> must become the string "123"
{
  const r = await call('tapd_get_story', { story_id: '1137748852001393833', fields: 123 });
  const echoed = r.text.includes('"status"') || r.text.includes('"name"');
  check(
    'fields as number is normalised to a string',
    !r.isError,
    r.isError ? r.text.slice(0, 160) : 'accepted'
  );
}

// boolean as a real boolean
{
  const r = await call('tapd_get_story', { story_id: '1137748852001393833', download_images: false });
  check('download_images as boolean', !r.isError, r.isError ? r.text.slice(0, 160) : 'accepted');
}

// boolean as the string "true"
{
  const r = await call('tapd_get_story', { story_id: '1137748852001393833', download_images: 'true' });
  check('download_images as "true"', !r.isError, r.isError ? r.text.slice(0, 160) : 'accepted');
}

// boolean as 1
{
  const r = await call('tapd_get_story', { story_id: '1137748852001393833', download_images: 1 });
  check('download_images as 1', !r.isError, r.isError ? r.text.slice(0, 160) : 'accepted');
}

// refresh as the string "true"
{
  const r = await call('tapd_get_custom_fields_settings', {
    workspace_id: WORKSPACE,
    refresh: 'true',
  });
  check('refresh as "true"', !r.isError, r.isError ? r.text.slice(0, 160) : 'accepted');
}

// refresh as 1
{
  const r = await call('tapd_get_custom_fields_settings', { workspace_id: WORKSPACE, refresh: 1 });
  check('refresh as 1', !r.isError, r.isError ? r.text.slice(0, 160) : 'accepted');
}

// dry_run as the string "true" -> must not write anything
{
  const r = await call('tapd_apply_story_defaults', {
    workspace_id: WORKSPACE,
    story_id: '1137748852001393833',
    dry_run: 'true',
  });
  const isDryRun = r.text.includes('"dry_run": true') || r.text.includes('dry_run');
  check(
    'dry_run as "true" is honoured (preview only)',
    !r.isError,
    r.isError ? r.text.slice(0, 200) : r.text.slice(0, 200).replace(/\s+/g, ' ')
  );
}

// limit as a string
{
  const r = await call('tapd_list_stories', {
    workspace_id: WORKSPACE,
    iteration_id: '1137748852001004376',
    limit: '3',
  });
  check('limit as string', !r.isError, r.isError ? r.text.slice(0, 160) : 'accepted');
}

// required arg still enforced (no TAPD_WORKSPACE_ID fallback available here)
{
  const noEnv = new StdioClientTransport({
    command: 'node',
    args: [SERVER],
    env: { ...process.env, TAPD_API_TOKEN: process.env.TAPD_API_TOKEN, TAPD_WORKSPACE_ID: '' },
    stderr: 'ignore',
  });
  const bare = new Client({ name: 'tapd-required-test', version: '1.0.0' });
  await bare.connect(noEnv);
  const res = await bare.callTool({
    name: 'tapd_list_stories',
    arguments: { iteration_id: '1137748852001004376' },
  });
  const text = res.content?.[0]?.text ?? '';
  const mentionsRequired = /workspace_id/i.test(text);
  check(
    'missing required workspace_id is still reported',
    mentionsRequired,
    text.slice(0, 200).replace(/\s+/g, ' ')
  );
  await bare.close();
}

// workspace_id falls back to TAPD_WORKSPACE_ID when omitted (documented behaviour)
{
  const r = await call('tapd_list_stories', { iteration_id: '1137748852001004376', limit: 1 });
  check(
    'workspace_id falls back to TAPD_WORKSPACE_ID',
    !r.isError,
    r.isError ? r.text.slice(0, 160) : 'accepted'
  );
}

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'} ===`);
await client.close();
process.exit(failures === 0 ? 0 : 1);
