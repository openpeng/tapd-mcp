/**
 * Regression tests for private / self-hosted TAPD deployments.
 *
 * Covers:
 *   - API requests honour TAPD_API_BASE_URL instead of the hard-coded
 *     https://api.tapd.cn default.
 *   - parseUrl matches custom domains as well as public tapd.cn.
 *   - Relative image download URLs are joined onto TAPD_WEB_BASE_URL.
 *
 * Requires `npm run build` first (tests run against ./dist).
 * Run with: node test-private-deployment.mjs
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { TapdClient } from './dist/tapd-client.js';

let pass = 0;
let fail = 0;

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}  ->  ${String(detail).slice(0, 160)}`);
  }
}

// ---------------------------------------------------------------- unit: parseUrl
console.log('\n--- parseUrl: custom domain + public tapd.cn ---');
const client = new TapdClient({ apiToken: 'unit-test-token' });

const cases = [
  ['https://www.tapd.ourtour.com/tapd_fe/12345/story/detail/112233445566', 'story', '112233445566'],
  ['https://www.tapd.ourtour.com/tapd_fe/12345/bug/view/998877', 'bug', '998877'],
  ['https://www.tapd.ourtour.com/tapd_fe/12345/requirement/view/777', 'requirement', '777'],
  ['https://www.tapd.ourtour.com/12345/prong/task/view/5566', 'task', '5566'],
  ['https://www.tapd.cn/tapd_fe/12345/story/detail/112233445566', 'story', '112233445566'],
  ['https://www.tapd.cn/tapd_fe/12345/bug/view/998877', 'bug', '998877'],
];

for (const [url, type, id] of cases) {
  const r = client.parseUrl(url);
  check(
    `parseUrl ${type} ${id} <- ${new URL(url).host}`,
    r && r.workspaceId === '12345' && r.resourceType === type && r.resourceId === id,
    JSON.stringify(r),
  );
}

// ------------------------------------------------- integration: baseUrl routing
console.log('\n--- API requests honour TAPD_API_BASE_URL ---');

const hits = [];
const WEB = 'http://127.0.0.1:8899';
const PORT = 8899;

const server = http.createServer((req, res) => {
  hits.push({ path: req.url, auth: req.headers.authorization });
  res.setHeader('Content-Type', 'application/json');
  if (req.url.startsWith('/files/get_image')) {
    // Private deployments commonly return a root-relative download URL.
    res.end(JSON.stringify({
      status: 1,
      data: [{ Attachment: { type: 'tfl_image', value: '/tfl/captures/x.png', workspace_id: 12345, filename: 'x.png', download_url: '/tfl/captures/x.png' } }],
    }));
    return;
  }
  if (req.url.startsWith('/tfl/captures/')) {
    res.setHeader('Content-Type', 'image/png');
    res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    return;
  }
  res.end(JSON.stringify({ status: 1, data: [{ Story: { id: '112233445566', name: 'priv story' } }] }));
});

function startServer(env) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ['dist/index.js'], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    const pending = new Map();
    let id = 0;
    p.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let m;
        try { m = JSON.parse(line); } catch { continue; }
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      }
    });
    const call = (method, params) => new Promise((r) => {
      const mid = ++id;
      pending.set(mid, r);
      p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: mid, method, params }) + '\n');
    });
    const text = (r) => {
      const t = r?.result?.content?.[0]?.text;
      try { return JSON.parse(t); } catch { return t ?? r; }
    };
    resolve({
      call,
      tool: async (name, args) => text(await call('tools/call', { name, arguments: args })),
      kill: () => p.kill(),
    });
  });
}

server.listen(PORT, '127.0.0.1', async () => {
  const mcp = await startServer({
    TAPD_API_TOKEN: 'test-token',
    TAPD_API_BASE_URL: WEB,
    TAPD_WEB_BASE_URL: WEB,
    TAPD_WORKSPACE_ID: '12345',
  });

  await mcp.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  mcp.call('notifications/initialized', {});

  const story = await mcp.tool('tapd_get_story', { workspace_id: '12345', story_id: '112233445566' });
  check('tapd_get_story routed to configured host', hits.length === 1 && hits[0].path.startsWith('/stories?'), JSON.stringify(hits));
  check('bearer token forwarded', hits[0]?.auth === 'Bearer test-token', hits[0]?.auth);
  check('story returned', story.id === '112233445566', JSON.stringify(story));

  hits.length = 0;
  const img = await mcp.tool('tapd_get_image', { workspace_id: '12345', image_path: 'https://www.tapd.ourtour.com/tfl/captures/x.png' });
  check('tapd_get_image routed to configured host', hits.some((h) => h.path.startsWith('/files/get_image')), JSON.stringify(hits));
  check('relative download_url joined onto TAPD_WEB_BASE_URL', img.source === `${WEB}/tfl/captures/x.png`, JSON.stringify(img));

  mcp.kill();
  server.close();
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
});
