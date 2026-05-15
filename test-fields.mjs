/**
 * 实测 TAPD fields 参数行为
 */
const TOKEN = '17a0225cbf7feb30512862681ad2ac0cec9676e8';
const WS = '38519250';
const STORY_ID = '1138519250001364261';

async function get(qs) {
  const url = `https://api.tapd.cn/stories?${qs}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const j = await r.json();
  const story = j.data?.[0]?.Story;
  if (!story) return null;
  const keys = Object.keys(story);
  return { keyCount: keys.length, keys: keys.slice(0, 20), sample: { id: story.id, name: story.name, status: story.status } };
}

console.log('1. 不加 fields:');
console.log(JSON.stringify(await get(`workspace_id=${WS}&id=${STORY_ID}`), null, 2));

console.log('\n2. fields=id,name,status:');
console.log(JSON.stringify(await get(`workspace_id=${WS}&id=${STORY_ID}&fields=id,name,status`), null, 2));

console.log('\n3. fields=id,name,status,owner,priority:');
console.log(JSON.stringify(await get(`workspace_id=${WS}&id=${STORY_ID}&fields=id,name,status,owner,priority`), null, 2));
