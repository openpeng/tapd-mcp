/**
 * 模拟 MCP handler 行为，验证 tapd_get_story 的 fields 过滤
 */
import { TapdClient } from './dist/tapd-client.js';

const client = new TapdClient({ apiToken: '17a0225cbf7feb30512862681ad2ac0cec9676e8' });
const WS = '38519250';
const STORY_ID = '1138519250001364261';

function resolveFields(input, def = 'id,name,status') {
  const raw = input?.trim?.();
  if (raw === '*' || raw === 'all') return { fields: undefined, requested: new Set(), isAll: true };
  const fields = raw && raw.length > 0 ? raw : def;
  return { fields, requested: new Set(fields.split(',').map(s => s.trim())), isAll: false };
}

async function callGetStory(fieldsArg) {
  const { fields, requested, isAll } = resolveFields(fieldsArg);
  const story = await client.getStory(WS, STORY_ID, fields);
  if (story && (isAll || requested.has('status'))) {
    return { ...story, status_name: client.translateStoryStatus(story.status || '') };
  }
  return story;
}

async function show(label, fieldsArg) {
  const r = await callGetStory(fieldsArg);
  const keys = Object.keys(r || {});
  console.log(`\n[${label}] fields=${JSON.stringify(fieldsArg)}`);
  console.log(`  字段数: ${keys.length}`);
  console.log(`  字段: ${keys.join(', ')}`);
  if (r) {
    console.log(`  样本: id=${r.id}  name=${r.name?.slice(0, 30)}...  status=${r.status}  status_name=${r.status_name ?? '(未附加)'}`);
  }
}

await show('A. 默认（不传 fields）', undefined);
await show('B. 指定字段', 'id,name,priority,owner,iteration_id');
await show('C. 通配 *', '*');
await show('D. 不含 status', 'id,name,priority');
