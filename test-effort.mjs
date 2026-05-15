/**
 * 工时字段端到端验证：updateTask 设置 effort / effort_completed / remain / progress 后 GET 回显
 */
import { TapdClient } from './dist/tapd-client.js';

const client = new TapdClient({ apiToken: '17a0225cbf7feb30512862681ad2ac0cec9676e8' });
const WS = '38519250';
const ITERATION_ID = '1138519250001004079';

function show(label, t) {
  console.log(`${label} effort=${t?.effort} completed=${t?.effort_completed} remain=${t?.remain} exceed=${t?.exceed} progress=${t?.progress}% status=${t?.status}`);
}

// 新建一个干净的 task 用于工时测试
console.log('1. 创建测试 task...');
const created = await client.createTask(WS, {
  name: '[工时字段测试] update_task with effort fields',
  iterationId: ITERATION_ID,
  effort: '8',
});
const taskId = created.id;
console.log(`   task_id=${taskId}`);
show('   初始:', created);

// 调用扩展后的 updateTask，设置完整工时
console.log('\n2. updateTask 设置工时字段...');
const updated = await client.updateTask(WS, taskId, {
  effort: '8',
  effortCompleted: '3.5',
  remain: '4.5',
  exceed: '0',
  progress: '44',
  status: 'progressing',
});
show('   返回:', updated);

// GET 回显验证
console.log('\n3. GET 验证持久化...');
const verified = await client.getTask(WS, taskId);
show('   读回:', verified);

const ok =
  verified?.effort === '8' &&
  verified?.effort_completed === '3.5' &&
  verified?.remain === '4.5' &&
  verified?.progress === '44' &&
  verified?.status === 'progressing';
console.log(`\n${ok ? '[PASS]' : '[FAIL]'} 工时字段写入${ok ? '成功' : '失败'}`);
