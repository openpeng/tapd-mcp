---
name: tapd
description: 用 TAPD MCP 工具操作 TAPD（腾讯敏捷研发平台）的需求/任务/缺陷/迭代/评论/发布。当用户要求查看、创建、修改 TAPD story/task/bug/iteration/release/comment，或贴出 tapd.cn 链接要求处理时调用。覆盖 24 个 `tapd_*` 工具，并给出字段裁剪、状态枚举、URL 解析、工时填写等关键约定。
---

# TAPD 操作说明

本 skill 对应 `tapd-mcp` 服务暴露的 24 个工具，覆盖 6 类资源：Story（需求）、Task（任务）、Bug、Iteration（迭代）、Release（发布）、Comment（评论），外加 URL 解析与代码关联。

## 何时使用

- 用户提供 `tapd.cn/tapd_fe/<wsid>/<type>/detail/<id>` 这类链接
- 用户提到 TAPD、需求/故事、迭代、bug、缺陷、任务认领、工时、评审、发布列车等
- 用户要求"查/列/建/改"上述资源；纯阅读优先 `get_*` / `list_*`，写操作前要先理解 ID

## 工具速查表

| 资源 | 读 | 写 |
|------|------|------|
| Story | `tapd_get_story`, `tapd_list_stories`, `tapd_get_story_commits` | `tapd_create_story`, `tapd_update_story` |
| Task | `tapd_get_task`, `tapd_list_tasks` | `tapd_create_task`, `tapd_update_task` |
| Bug | `tapd_get_bug`, `tapd_list_bugs` | `tapd_create_bug`, `tapd_update_bug` |
| Iteration | `tapd_get_iteration`, `tapd_list_iterations` | `tapd_create_iteration`, `tapd_update_iteration` |
| Release | `tapd_list_releases` | `tapd_create_release`, `tapd_update_release` |
| Comment | `tapd_list_comments` | `tapd_add_comment` |
| Util | `tapd_parse_url` | — |

## 通用约定

### workspace_id

- 大多数工具都要 `workspace_id`。环境变量 `TAPD_WORKSPACE_ID` 存在时可省略，否则必填。
- 给 URL 时（仅 `tapd_get_story` / `tapd_get_task` / `tapd_get_bug` 支持 `url` 参数），可以不提供 `workspace_id`，会从 URL 解析。
- 不知道 wsid 又没默认值时，先 `tapd_parse_url` 把链接拆出来。

### fields 字段裁剪（仅 Story 的 get/list）

`tapd_get_story` 和 `tapd_list_stories` 支持 `fields` 参数：

- 不传 / 空 → 默认 `id,name,status`（响应小，只够列表展示）
- 传 `"id,name,status,owner,priority,description,iteration_id,created"` 等逗号串 → 按需返回
- 传 `"*"` 或 `"all"` → 返回全部字段（约 260 个，响应非常大，慎用）

```
tapd_list_stories workspace_id="12345" iteration_id="..." fields="id,name,status,owner,priority"
```

需要看完整描述时再单条 `tapd_get_story` + `fields="*"`，不要在 `list_stories` 上拉全字段。

### 状态枚举（写入用英文 key，读取时附带 `status_name` 中文）

`get_*` / `list_*` 返回会自动附带 `status_name` 字段（中文释义），更新时仍传英文 key：

- Story：`planning` 待规划 · `developing` 开发中 · `testing` 测试中 · `resolved` 已完成 · `closed` 已关闭 · `rejected` 已拒绝
- Task：`open` 未开始 · `progressing` 进行中 · `done` 已完成
- Bug：`new` 新建 · `in_progress` 接受/处理 · `resolved` 已解决 · `verified` 已验证 · `closed` 已关闭 · `rejected` 已拒绝 · `reopened` 重新打开
- Bug 严重程度：`fatal` · `serious` · `normal` · `prompt` · `advice`
- 优先级：`1`~`4`，`1=最高`

### URL 解析

支持的格式（`parseUrl` 内置正则）：

- `tapd.cn/tapd_fe/<wsid>/story/detail/<id>`
- `tapd.cn/tapd_fe/<wsid>/<type>/view/<id>`
- `tapd.cn/<wsid>/prong/<type>/view/<id>`

`tapd_parse_url` 返回 `{ workspaceId, resourceType, resourceId }`，其中 `resourceType` 已规整为单数（`story` / `bug` / `task` / `requirement`）。

## 高频流程

### 1. 看一个迭代里的工作量

```
1. tapd_list_iterations workspace_id="..." status="open"      # 找当前迭代 id
2. tapd_list_stories workspace_id="..." iteration_id="..."    # 默认轻量
3. tapd_list_tasks workspace_id="..." iteration_id="..."      # 任务清单
4. tapd_list_bugs workspace_id="..." iteration_id="..."       # 缺陷清单
```

### 2. 从 URL 跳到详情

直接给 `url`，不用先解析：

```
tapd_get_story url="https://www.tapd.cn/tapd_fe/12345/story/detail/112345678901234567" fields="*"
```

### 3. 创建任务并落工时

```
tapd_create_task workspace_id="..." name="登录接口实现" story_id="..." owner="zhangsan" effort="8"
```

完成时更新工时（关键字段语义）：

- `effort`：估算总工时
- `effort_completed`：已花工时
- `remain`：剩余工时（TAPD 可能自动 = effort − completed，必要时显式覆盖）
- `exceed`：超出工时
- `progress`：完成百分比 `0`~`100`

```
tapd_update_task workspace_id="..." task_id="..." status="done" effort_completed="9" remain="0" exceed="1" progress="100"
```

### 4. 评论挂到需求/任务/缺陷

`entry_type` 取 `stories` / `tasks` / `bugs`（注意是复数），`entry_id` 是对应的资源 id：

```
tapd_add_comment workspace_id="..." entry_type="stories" entry_id="..." description="代码评审通过，已合并到 dev"
```

### 5. 创建 Story / Bug

Story 必填 `name`；Bug 必填 `title`。`description` 支持 HTML。`owner` 多人用分号分隔。

```
tapd_create_bug workspace_id="..." title="登录页 iOS Safari 闪退" severity="serious" current_owner="lisi" version_report="3.2.0" module="auth"
```

### 6. 关联代码提交

`tapd_get_story_commits` 拉取 story 关联的 git 提交（依赖 TAPD 仓库托管侧已对接）。无关联时返回空数组而不是报错。

## 写操作的安全准则

- 改之前先 `get_*` 一次确认对象存在并对照现状，避免误更新。
- 状态值大小写敏感，按上面英文 key 传，传中文会被 TAPD 拒绝。
- 批量更新没有原子事务，逐条 `update_*` 调用；失败要把已成功的部分汇报给用户。
- 删除类操作 MCP 未暴露——TAPD 也通常不允许 API 删 story/bug，需要"关闭"用 `update_*` + `status=closed/rejected`。
- 创建 / 更新前若用户只给了模糊描述（"把上次那个 bug 关掉"），先列出候选让用户确认 ID，不要猜。

## 常见坑

- `tapd_list_stories` 的 `status` 过滤只接受英文 key，传中文不会报错但筛不到东西。
- `fields="*"` 会塞回 ~260 列，连续在循环里拉容易把上下文撑爆——只在单条详情里用。
- `effort` / `effort_completed` 必须是字符串形式的数字（`"8"` / `"8.5"`），别传 number。
- URL 解析失败会抛 `Invalid TAPD URL`，遇到非标准链接（短链、复制时被截断）改用显式 `workspace_id` + `id`。
- 未配置 `TAPD_API_TOKEN` 时 server 起不来；token 可在 `https://www.tapd.cn/tapd_api_token/token` 获取。

## 一句话决策

- "看一眼" → `get_*` 默认字段
- "列一下" → `list_*`，必要时给 `iteration_id` / `owner` / `status` 缩小范围
- "完整展开" → `get_story` + `fields="*"`，单条用
- "写入" → 先核对 ID，状态用英文 key，工时用字符串
- "拿到的是链接" → 三个 `get_*` 直接接 `url`，否则先 `tapd_parse_url`
