/**
 * TAPD API 调试脚本
 */

const API_TOKEN = '17a0225cbf7feb30512862681ad2ac0cec9676e8';
const WORKSPACE_ID = '38519250';
const ITERATION_ID = '1138519250001004079';

async function tapdRequest(endpoint, params) {
  const url = new URL(endpoint, 'https://api.tapd.cn');
  url.search = new URLSearchParams(params).toString();

  console.log(`\n[Request] ${url.toString()}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Accept': 'application/json',
    },
  });

  const text = await response.text();
  console.log(`[Status] ${response.status} ${response.statusText}`);

  try {
    const data = JSON.parse(text);
    return data;
  } catch {
    console.log(`[Raw Response] ${text.substring(0, 500)}`);
    return null;
  }
}

async function main() {
  console.log('=== TAPD API 调试 ===');
  console.log(`Workspace: ${WORKSPACE_ID}`);
  console.log(`Iteration: ${ITERATION_ID}`);

  // 1. 获取迭代信息
  console.log('\n--- 1. 获取迭代信息 ---');
  const iteration = await tapdRequest('/iterations', {
    workspace_id: WORKSPACE_ID,
    id: ITERATION_ID,
    limit: '1',
  });
  console.log(JSON.stringify(iteration, null, 2));

  // 2. 获取迭代下的 stories
  console.log('\n--- 2. 获取迭代下的 Stories ---');
  const stories = await tapdRequest('/stories', {
    workspace_id: WORKSPACE_ID,
    iteration_id: ITERATION_ID,
    limit: '10',
  });
  console.log(JSON.stringify(stories, null, 2));

  // 3. 获取迭代下的 tasks
  console.log('\n--- 3. 获取迭代下的 Tasks ---');
  const tasks = await tapdRequest('/tasks', {
    workspace_id: WORKSPACE_ID,
    iteration_id: ITERATION_ID,
    limit: '10',
  });
  console.log(JSON.stringify(tasks, null, 2));

  // 4. 获取迭代下的 bugs
  console.log('\n--- 4. 获取迭代下的 Bugs ---');
  const bugs = await tapdRequest('/bugs', {
    workspace_id: WORKSPACE_ID,
    iteration_id: ITERATION_ID,
    limit: '10',
  });
  console.log(JSON.stringify(bugs, null, 2));
}

main().catch(console.error);
