---
name: tapd
description: 用 TAPD MCP 工具操作 TAPD（腾讯敏捷研发平台）的需求/任务/缺陷/迭代/评论/发布/工时/附件/自定义字段。当用户要求查看、创建、修改 TAPD story/task/bug/iteration/release/comment/timesheet，或贴出 tapd.cn 链接要求处理时调用。覆盖 31 个 `tapd_*` 工具，并给出字段裁剪、状态枚举、URL 解析、工时填写等关键约定。
---

# TAPD 操作说明

本 skill 对应 `tapd-mcp` 服务暴露的 **31 个**工具，覆盖 8 类资源：Story（需求）、Task（任务）、Bug、Iteration（迭代）、Release（发布）、Comment（评论）、Timesheet（工时记录）、Attachment（附件），外加自定义字段查询、URL 解析与代码关联。

## 前置检查：工具是否可用

调用任何 `tapd_*` 工具前，先确认 MCP server 已在当前会话注册：

- 当前工具列表里能看到 `tapd_get_story` 等 `tapd_*` 工具 → 已就绪，跳过本节
- 看不到任何 `tapd_*` 工具，但用户提了 TAPD 相关诉求 → 引导安装，**不要**自己 fetch TAPD API

### 引导用户安装

告诉用户在所用 AI 工具的 MCP 配置文件中加入下面这段（以 Claude Code `~/.claude/settings.json` 为例，Cursor / Windsurf / Cline 写法相同）：

```json
{
  "mcpServers": {
    "tapd": {
      "command": "npx",
      "args": ["-y", "tapd-mcp"],
      "env": {
        "TAPD_API_TOKEN": "在 https://www.tapd.cn/tapd_api_token/token 申请",
        "TAPD_WORKSPACE_ID": "可选：默认 workspace id",
        "TAPD_CURRENT_USER": "可选：你的 TAPD 用户 id，用于识别『我』"
      }
    }
  }
}
```

完成后重启 AI 工具或重连 MCP server 即可。

### 故障对照

- 工具调用报 `TAPD_API_TOKEN environment variable is required` → MCP 起来了但 token 没配
- 报 `Unknown tool: tapd_*` 或工具仍不可见 → 配置没生效，让用户重启 / 重连 MCP
- 报 `TAPD API error: 401 / 403` → token 失效或越权访问别的 workspace
- 报 `Invalid TAPD URL` → 链接格式不在 `parseUrl` 支持的三种之内，改用 `workspace_id` + `id`

## 何时使用

- 用户提供 `tapd.cn/tapd_fe/<wsid>/<type>/detail/<id>` 这类链接
- 用户提到 TAPD、需求/故事、迭代、bug、缺陷、任务认领、工时、评审、发布列车等
- 用户要求"查/列/建/改"上述资源；纯阅读优先 `get_*` / `list_*`，写操作前要先理解 ID

## 工具速查表（共 31 个）

| 资源 | 读 | 写 |
|------|------|------|
| Story | `tapd_get_story`, `tapd_list_stories`, `tapd_get_story_commits` | `tapd_create_story`, `tapd_update_story` |
| Task | `tapd_get_task`, `tapd_list_tasks` | `tapd_create_task`, `tapd_update_task` |
| Bug | `tapd_get_bug`, `tapd_list_bugs` | `tapd_create_bug`, `tapd_update_bug` |
| Iteration | `tapd_get_iteration`, `tapd_list_iterations` | `tapd_create_iteration`, `tapd_update_iteration` |
| Release | `tapd_list_releases` | `tapd_create_release`, `tapd_update_release` |
| Comment | `tapd_list_comments` | `tapd_add_comment` |
| Timesheet | `tapd_list_timesheets` | `tapd_add_timesheet`, `tapd_update_timesheet`, `tapd_delete_timesheet` |
| Attachment | `tapd_list_attachments` | `tapd_upload_attachment` |
| Custom Fields | `tapd_get_custom_fields_settings` | — |
| Util | `tapd_parse_url`, `tapd_get_current_user` | — |

## 通用约定

### workspace_id

- 大多数工具都要 `workspace_id`。环境变量 `TAPD_WORKSPACE_ID` 存在时可省略，否则必填。
- 给 URL 时（仅 `tapd_get_story` / `tapd_get_task` / `tapd_get_bug` 支持 `url` 参数），可以不提供 `workspace_id`，会从 URL 解析。
- 不知道 wsid 又没默认值时，先 `tapd_parse_url` 把链接拆出来。

### 识别"我"是谁

- `tapd_get_current_user` 返回 API token 持有者的身份；依赖环境变量 `TAPD_CURRENT_USER`（值为 TAPD 用户 ID，如 `xiaopeng_lei`）。
- 不传参就只回 env 值；传 `workspace_id`（或回退默认值）会去 `/users/get_users_by_workspace_id` 拉昵称、邮箱等附加信息。
- 用户问"我负责的"、"我创建的"、"分配给我"这类相对身份的问题时，先调一次此工具拿到自己的 user id，再当作 `owner` / `creator` / `current_owner` 过滤参数。

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

### 4.1 上传附件 / 截图

`tapd_upload_attachment` 用 multipart 把本地文件挂到 story / task / bug，`entity_type` 同样取复数 `stories` / `tasks` / `bugs`。两种喂法二选一：

- 给本地路径（最常见，AI 能直接读到的文件）：

```
tapd_upload_attachment workspace_id="..." entity_type="bugs" entity_id="..." file_path="C:/screenshots/login_crash.png" description="iOS Safari 闪退现场"
```

- 给 base64 内容（适合 AI 把内存里的图直接扔上去），此时 `filename` 必填：

```
tapd_upload_attachment entity_type="stories" entity_id="..." file_base64="iVBORw0KGgo..." filename="design.png" content_type="image/png"
```

`file_path` 与 `file_base64` 互斥；`content_type` 一般可省略，TAPD 会按扩展名识别。返回值含附件 `id` / `download_url`，需要展示给用户时回贴这两个字段即可。

### 5. 创建 Story / Bug

Story 必填 `name`；Bug 必填 `title`。`description` 支持 HTML。`owner` 多人用分号分隔。

```
tapd_create_bug workspace_id="..." title="登录页 iOS Safari 闪退" severity="serious" current_owner="lisi" version_report="3.2.0" module="auth"
```

### 6. 工时记录（Timesheet）

TAPD 工时通过 `timespent`（小时数，字符串形式）+ `spentdate`（YYYY-MM-DD）+ `entity_type`/`entity_id` 四元组定位一条记录。

**查询指定日期的工时：**

```
tapd_list_timesheets workspace_id="..." entity_type="tasks" entity_id="..." spentdate="2025-05-15"
```

**按日期范围查询：**

```
tapd_list_timesheets workspace_id="..." owner="xiaopeng_lei" start_date="2025-05-01" end_date="2025-05-31"
```

**新增工时记录：**

```
tapd_add_timesheet workspace_id="..." entity_type="tasks" entity_id="..." timespent="2" spentdate="2025-05-15" owner="xiaopeng_lei" memo="完成接口设计"
```

> **`owner` 必须传 TAPD 英文 user id**（如 `xiaopeng_lei`），传中文姓名 TAPD 会以 `Save fail.` 拒绝。可先 `tapd_get_current_user` 拿到自己的 user id。
>
> **`memo` 避免传中文**：TAPD `/timesheets` 接口对 memo 的中文支持不稳，会被截断。需要中文备注请到 TAPD 网页端再补。
>
> **写入前先检查目标 task 的 `effort`/`remain`**：要写 N 小时但 task `remain` 不足，TAPD 会以模糊的 `Save fail.` 拒绝。先 `tapd_update_task` 把 `effort` 调大再写工时，或显式给 `exceed`。

**更新 / 删除工时**（需要 API token 拥有 `timesheets::update` / `timesheets::delete` 权限，否则返回 403）：

```
tapd_update_timesheet workspace_id="..." timesheet_id="..." timespent="3" spentdate="2025-05-15"
tapd_delete_timesheet workspace_id="..." timesheet_id="..."
```

> **注意：** TAPD 平台上的工时权限独立于普通读写权限。若 update/delete 报 `403`，请到 TAPD 个人 API Token 管理页为该 token 开启 `timesheets::update` / `timesheets::delete` 权限。

### 7. 查询自定义字段

在读写 story 自定义字段前，先查 schema 了解字段名、类型和选项：

```
tapd_get_custom_fields_settings workspace_id="..." entry_type="story"
```

返回结果包含 `field_name`（API 字段名，如 `custom_field_one`）、`field_label`（中文标签）、`field_type`（文本/下拉等）、`options`（枚举选项）。

### 8. 关联代码提交

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
- `effort` / `effort_completed` / `timespent` 必须是字符串形式的数字（`"8"` / `"8.5"`），别传 number。
- URL 解析失败会抛 `Invalid TAPD URL`，遇到非标准链接（短链、复制时被截断）改用显式 `workspace_id` + `id`。
- 未配置 `TAPD_API_TOKEN` 时 server 起不来；token 可在 `https://www.tapd.cn/tapd_api_token/token` 获取。
- **中文路径上传附件**：`tapd_upload_attachment` 的 `file_path` 传中文路径时，MCP server 内部用 Node.js `fs.readFile` 读取，**没有问题**。但如果你用 Bash `curl -F file=@路径` 手动测试，Windows 下 `curl` 默认 locale 为 ANSI，**中文路径会读到空文件，导致 TAPD 静默接受 0 字节附件**。此时应把文件复制到 ASCII 路径，或改用 `tapd_upload_attachment` MCP 工具本身。
- `tapd_update_timesheet` / `tapd_delete_timesheet` 需要 API token 额外勾选 `timesheets::update` / `timesheets::delete` 权限；缺失时返回 403，需登录 TAPD 管理页补权限。

## 一句话决策

- "看一眼" → `get_*` 默认字段
- "列一下" → `list_*`，必要时给 `iteration_id` / `owner` / `status` 缩小范围
- "完整展开" → `get_story` + `fields="*"`，单条用
- "写入" → 先核对 ID，状态用英文 key，工时用字符串
- "拿到的是链接" → 三个 `get_*` 直接接 `url`，否则先 `tapd_parse_url`
