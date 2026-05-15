/**
 * TAPD API 完整调试脚本 - 测试 CRUD 操作
 */

const API_TOKEN = '17a0225cbf7feb30512862681ad2ac0cec9676e8';
const WORKSPACE_ID = '38519250';
const ITERATION_ID = '1138519250001004079';

async function tapdRequest(method, endpoint, params) {
  const url = new URL(endpoint, 'https://api.tapd.cn');

  const headers = {
    'Authorization': `Bearer ${API_TOKEN}`,
    'Accept': 'application/json',
  };

  let response;
  if (method === 'GET') {
    url.search = new URLSearchParams(params).toString();
    console.log(`\n[${method}] ${url.toString()}`);
    response = await fetch(url.toString(), { method, headers });
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    console.log(`\n[${method}] ${url.toString()}`);
    console.log(`[Body] ${new URLSearchParams(params).toString()}`);
    response = await fetch(url.toString(), {
      method,
      headers,
      body: new URLSearchParams(params).toString(),
    });
  }

  const text = await response.text();
  console.log(`[Status] ${response.status} ${response.statusText}`);

  try {
    const data = JSON.parse(text);
    return data;
  } catch {
    console.log(`[Raw Response] ${text.substring(0, 1000)}`);
    return null;
  }
}

async function main() {
  console.log('=== TAPD API 完整调试 ===');
  console.log(`Workspace: ${WORKSPACE_ID}`);
  console.log(`Iteration: ${ITERATION_ID}`);

  // 1. 创建一个测试 Story
  console.log('\n\n========== 1. 创建 Story ==========');
  const createStoryResult = await tapdRequest('POST', '/stories', {
    workspace_id: WORKSPACE_ID,
    name: '[MCP测试] 自动化创建的需求',
    description: '这是通过 TAPD MCP Server 自动创建的测试需求',
    iteration_id: ITERATION_ID,
    priority: '3',
  });
  console.log(JSON.stringify(createStoryResult, null, 2));

  let storyId = null;
  if (createStoryResult?.status === 1 && createStoryResult?.data?.[0]?.Story?.id) {
    storyId = createStoryResult.data[0].Story.id;
    console.log(`\n[SUCCESS] Created Story ID: ${storyId}`);
  } else {
    console.log('\n[FAILED] Could not create story');
    // 尝试获取已有的 story 来测试其他功能
    const existingStories = await tapdRequest('GET', '/stories', {
      workspace_id: WORKSPACE_ID,
      iteration_id: ITERATION_ID,
      limit: '1',
    });
    if (existingStories?.data?.[0]?.Story?.id) {
      storyId = existingStories.data[0].Story.id;
      console.log(`[FALLBACK] Using existing Story ID: ${storyId}`);
    }
  }

  if (!storyId) {
    console.log('\n[ERROR] No story available for testing');
    return;
  }

  // 2. 获取 Story 详情
  console.log('\n\n========== 2. 获取 Story 详情 ==========');
  const storyDetail = await tapdRequest('GET', '/stories', {
    workspace_id: WORKSPACE_ID,
    id: storyId,
  });
  if (storyDetail?.data?.[0]?.Story) {
    const s = storyDetail.data[0].Story;
    console.log(`\nStory 详情:`);
    console.log(`  ID: ${s.id}`);
    console.log(`  名称: ${s.name}`);
    console.log(`  状态: ${s.status}`);
    console.log(`  优先级: ${s.priority}`);
    console.log(`  创建人: ${s.creator}`);
    console.log(`  处理人: ${s.owner}`);
  }

  // 3. 更新 Story
  console.log('\n\n========== 3. 更新 Story ==========');
  const updateStoryResult = await tapdRequest('POST', '/stories', {
    workspace_id: WORKSPACE_ID,
    id: storyId,
    name: '[MCP测试] 已更新的需求标题',
    priority: '2',
  });
  console.log(JSON.stringify(updateStoryResult, null, 2));

  // 4. 在 Story 下创建 Task
  console.log('\n\n========== 4. 创建 Task ==========');
  const createTaskResult = await tapdRequest('POST', '/tasks', {
    workspace_id: WORKSPACE_ID,
    name: '[MCP测试] 子任务1 - 开发',
    story_id: storyId,
    iteration_id: ITERATION_ID,
    description: '这是自动创建的子任务',
    effort: '4',
  });
  console.log(JSON.stringify(createTaskResult, null, 2));

  let taskId = null;
  if (createTaskResult?.status === 1 && createTaskResult?.data?.[0]?.Task?.id) {
    taskId = createTaskResult.data[0].Task.id;
    console.log(`\n[SUCCESS] Created Task ID: ${taskId}`);
  }

  // 5. 获取 Story 下的 Tasks
  console.log('\n\n========== 5. 获取 Story 下的 Tasks ==========');
  const storyTasks = await tapdRequest('GET', '/tasks', {
    workspace_id: WORKSPACE_ID,
    story_id: storyId,
    limit: '10',
  });
  console.log(JSON.stringify(storyTasks, null, 2));

  // 6. 更新 Task 状态
  if (taskId) {
    console.log('\n\n========== 6. 更新 Task 状态 ==========');
    const updateTaskResult = await tapdRequest('POST', '/tasks', {
      workspace_id: WORKSPACE_ID,
      id: taskId,
      status: 'progressing',
      progress: '50',
    });
    console.log(JSON.stringify(updateTaskResult, null, 2));
  }

  // 7. 添加评论
  console.log('\n\n========== 7. 添加评论到 Story ==========');
  const addCommentResult = await tapdRequest('POST', '/comments', {
    workspace_id: WORKSPACE_ID,
    entry_type: 'stories',
    entry_id: storyId,
    description: '这是通过 MCP Server 自动添加的评论 - ' + new Date().toISOString(),
  });
  console.log(JSON.stringify(addCommentResult, null, 2));

  // 8. 获取评论列表
  console.log('\n\n========== 8. 获取 Story 评论列表 ==========');
  const comments = await tapdRequest('GET', '/comments', {
    workspace_id: WORKSPACE_ID,
    entry_type: 'stories',
    entry_id: storyId,
    limit: '10',
  });
  console.log(JSON.stringify(comments, null, 2));

  // 9. 创建 Bug
  console.log('\n\n========== 9. 创建 Bug ==========');
  const createBugResult = await tapdRequest('POST', '/bugs', {
    workspace_id: WORKSPACE_ID,
    title: '[MCP测试] 自动创建的缺陷',
    description: '这是通过 TAPD MCP Server 自动创建的测试缺陷',
    iteration_id: ITERATION_ID,
    severity: 'normal',
    priority: '3',
  });
  console.log(JSON.stringify(createBugResult, null, 2));

  console.log('\n\n========== 测试完成 ==========');
}

main().catch(console.error);
