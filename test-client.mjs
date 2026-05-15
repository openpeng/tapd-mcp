/**
 * 测试 MCP Server 的 TAPD Client
 */

import { TapdClient } from './dist/tapd-client.js';

const API_TOKEN = '17a0225cbf7feb30512862681ad2ac0cec9676e8';
const WORKSPACE_ID = '38519250';
const ITERATION_ID = '1138519250001004079';

async function main() {
  const client = new TapdClient({ apiToken: API_TOKEN });

  console.log('=== 测试 TAPD MCP Client ===\n');

  // 1. 获取迭代信息
  console.log('1. 获取迭代信息...');
  const iteration = await client.getIteration(WORKSPACE_ID, ITERATION_ID);
  console.log(`   迭代: ${iteration?.name} (${iteration?.status})`);
  console.log(`   时间: ${iteration?.startdate} ~ ${iteration?.enddate}\n`);

  // 2. 列出 Stories
  console.log('2. 列出迭代下的 Stories...');
  const stories = await client.listStories(WORKSPACE_ID, { iterationId: ITERATION_ID, limit: 5 });
  console.log(`   找到 ${stories.length} 个 Stories:`);
  for (const story of stories) {
    console.log(`   - [${story.id}] ${story.name} (${client.translateStoryStatus(story.status || '')})`);
  }
  console.log();

  // 3. 创建 Story
  console.log('3. 创建新 Story...');
  const newStory = await client.createStory(WORKSPACE_ID, {
    name: '[MCP Client 测试] 通过 TapdClient 创建',
    description: '这是通过 MCP Client 类创建的测试需求',
    iterationId: ITERATION_ID,
    priority: '3',
  });
  console.log(`   创建成功: [${newStory.id}] ${newStory.name}\n`);

  // 4. 更新 Story
  console.log('4. 更新 Story...');
  const updatedStory = await client.updateStory(WORKSPACE_ID, newStory.id, {
    name: '[MCP Client 测试] 已更新标题',
    priority: '2',
  });
  console.log(`   更新成功: ${updatedStory.name} (优先级: ${updatedStory.priority})\n`);

  // 5. 创建 Task
  console.log('5. 在 Story 下创建 Task...');
  const newTask = await client.createTask(WORKSPACE_ID, {
    name: '[MCP Client 测试] 子任务',
    storyId: newStory.id,
    iterationId: ITERATION_ID,
    effort: '2',
  });
  console.log(`   创建成功: [${newTask.id}] ${newTask.name}\n`);

  // 6. 获取 Story 下的 Tasks
  console.log('6. 获取 Story 下的 Tasks...');
  const tasks = await client.listTasks(WORKSPACE_ID, { storyId: newStory.id });
  console.log(`   找到 ${tasks.length} 个 Tasks:`);
  for (const task of tasks) {
    console.log(`   - [${task.id}] ${task.name} (${client.translateTaskStatus(task.status || '')})`);
  }
  console.log();

  // 7. 更新 Task 状态
  console.log('7. 更新 Task 状态为进行中...');
  const updatedTask = await client.updateTask(WORKSPACE_ID, newTask.id, {
    status: 'progressing',
    progress: '30',
  });
  console.log(`   更新成功: ${updatedTask.name} (${client.translateTaskStatus(updatedTask.status || '')}, 进度: ${updatedTask.progress}%)\n`);

  // 8. 添加评论
  console.log('8. 添加评论到 Story...');
  const comment = await client.addComment(WORKSPACE_ID, 'stories', newStory.id,
    '通过 MCP Client 添加的评论 - ' + new Date().toLocaleString('zh-CN'));
  console.log(`   评论成功: ${comment.description}\n`);

  // 9. 获取评论列表
  console.log('9. 获取 Story 评论列表...');
  const comments = await client.listComments(WORKSPACE_ID, 'stories', newStory.id);
  console.log(`   找到 ${comments.length} 条评论:`);
  for (const c of comments) {
    console.log(`   - [${c.author}] ${c.description}`);
  }
  console.log();

  // 10. URL 解析测试
  console.log('10. URL 解析测试...');
  const testUrls = [
    'https://www.tapd.cn/tapd_fe/38519250/story/detail/1138519250001375527',
    'https://www.tapd.cn/tapd_fe/38519250/bug/view/1138519250001114435',
    'https://www.tapd.cn/38519250/prong/tasks/view/1138519250001375528',
  ];
  for (const url of testUrls) {
    const parsed = client.parseUrl(url);
    if (parsed) {
      console.log(`   ${url}`);
      console.log(`   -> workspace: ${parsed.workspaceId}, type: ${parsed.resourceType}, id: ${parsed.resourceId}`);
    }
  }

  console.log('\n=== 所有测试完成 ===');
}

main().catch(console.error);
