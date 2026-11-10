/**
 * Dumps the served tool schemas so the relaxation can be inspected directly.
 *
 * Usage: node schema-dump.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const t = new StdioClientTransport({
  command: 'node',
  args: ['F:/mycode/mcp-servers/tapd-mcp/dist/index.js'],
  env: { ...process.env, TAPD_WORKSPACE_ID: '37748852' },
  stderr: 'ignore',
});

const c = new Client({ name: 'schema-dump', version: '1.0.0' });
await c.connect(t);
const { tools } = await c.listTools();
const get = (n) => tools.find((x) => x.name === n);

console.log('tapd_get_story.workspace_id            :', JSON.stringify(get('tapd_get_story').inputSchema.properties.workspace_id.type));
console.log('tapd_get_story.story_id                :', JSON.stringify(get('tapd_get_story').inputSchema.properties.story_id.type));
console.log('tapd_get_story.download_images         :', JSON.stringify(get('tapd_get_story').inputSchema.properties.download_images.type));
console.log('tapd_list_stories.limit                :', JSON.stringify(get('tapd_list_stories').inputSchema.properties.limit.type));
console.log('tapd_apply_story_defaults.dry_run      :', JSON.stringify(get('tapd_apply_story_defaults').inputSchema.properties.dry_run.type));
console.log('tapd_get_custom_fields_settings.refresh:', JSON.stringify(get('tapd_get_custom_fields_settings').inputSchema.properties.refresh.type));

const withSingle = tools.filter((x) => {
  const p = x.inputSchema?.properties || {};
  return Object.values(p).some((v) =>
    ['string', 'number', 'boolean'].includes(v?.type)
  );
});
console.log('\ntools still exposing a single SCALAR type:', withSingle.length, withSingle.map((x) => x.name).join(','));
console.log(
  'tapd_apply_story_defaults.overrides.type:',
  JSON.stringify(get('tapd_apply_story_defaults').inputSchema.properties.overrides.type),
  '(object type - not a scalar, correctly left alone)'
);

await c.close();
