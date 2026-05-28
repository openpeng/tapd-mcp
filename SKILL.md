---
name: tapd
description: 用 TAPD MCP 工具操作 TAPD(腾讯敏捷研发平台)的需求/任务/缺陷/迭代/评论/发布/工时/附件/自定义字段。当用户要求查看、创建、修改 TAPD story/task/bug/iteration/release/comment/timesheet,或贴出 tapd.cn 链接要求处理时调用。覆盖 37 个 `tapd_*` 工具(含变更历史、成员名册、release 详情、自定义字段写入支持别名 fuzzy 匹配、env 驱动的 story 默认字段填充),并给出字段裁剪、状态枚举、URL 解析、工时填写、自定义字段解析、归属字段配置等关键约定。
---

# TAPD 操作说明

本 skill 对应 `tapd-mcp` 服务暴露的 **37 个**工具,覆盖 8 类资源:Story(需求)、Task(任务)、Bug、Iteration(迭代)、Release(发布)、Comment(评论)、Timesheet(工时记录)、Attachment(附件),外加自定义字段查询/写入(支持别名 fuzzy 匹配 + 缓存刷新)、env 驱动的 story 默认字段配置、URL 解析、变更历史、workspace 成员名册与代码关联。

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
        "TAPD_CURRENT_USER": "可选：你的 TAPD 用户名，与 TAPD 页面显示的一致，用于识别『我』",
        "TAPD_CACHE_DIR": "可选：字段 schema 缓存目录，缺省 ~/.tapd-mcp/cache",
        "TAPD_STORY_CONFIG": "可选：创建 story 后自动补归属字段的规则（JSON 字符串，结构见下方『创建 Story 后的归属字段补全』）"
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

## 工具速查表(共 37 个)

| 资源 | 读 | 写 |
|------|------|------|
| Story | `tapd_get_story`, `tapd_list_stories`, `tapd_get_story_commits`, `tapd_get_story_changes` | `tapd_create_story`, `tapd_update_story`, `tapd_set_story_custom_field`, `tapd_apply_story_defaults` |
| Task | `tapd_get_task`, `tapd_list_tasks` | `tapd_create_task`, `tapd_update_task` |
| Bug | `tapd_get_bug`, `tapd_list_bugs` | `tapd_create_bug`, `tapd_update_bug` |
| Iteration | `tapd_get_iteration`, `tapd_list_iterations` | `tapd_create_iteration`, `tapd_update_iteration` |
| Release | `tapd_get_release`, `tapd_list_releases` | `tapd_create_release`, `tapd_update_release` |
| Comment | `tapd_list_comments` | `tapd_add_comment` |
| Timesheet | `tapd_list_timesheets` | `tapd_add_timesheet`, `tapd_update_timesheet`, `tapd_delete_timesheet` |
| Attachment | `tapd_list_attachments` | `tapd_upload_attachment` |
| Custom Fields | `tapd_get_custom_fields_settings` | — |
| Config | `tapd_get_config` | — |
| Util | `tapd_parse_url`, `tapd_get_current_user`, `tapd_list_workspace_users` | — |

## 通用约定

### workspace_id

- 大多数工具都要 `workspace_id`。环境变量 `TAPD_WORKSPACE_ID` 存在时可省略，否则必填。
- 给 URL 时（仅 `tapd_get_story` / `tapd_get_task` / `tapd_get_bug` 支持 `url` 参数），可以不提供 `workspace_id`，会从 URL 解析。
- 不知道 wsid 又没默认值时，先 `tapd_parse_url` 把链接拆出来。

### 识别"我"是谁

- `tapd_get_current_user` 返回 API token 持有者的身份；依赖环境变量 `TAPD_CURRENT_USER`（值为 TAPD 用户名，与 TAPD 页面显示的一致，如 `xiaopeng_lei`）。
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

**创建 Story 后的归属字段补全（env 驱动）：**

很多 workspace 会强约束 story 必须填几个归属字段(需求类型 / 项目归属 / 成本归属之类的 cascade / select)。`tapd_create_story` 本身不接受这些字段,本 server 提供"**env 配置 + 一键补齐**"两步走,每个用户在自己机器的 MCP 配置里把规则写到 `TAPD_STORY_CONFIG` 环境变量,创建后调一次 `tapd_apply_story_defaults` 即可。

**1. 一次性配置:把规则贴到 MCP 的 env 里**

在 AI 工具的 MCP 配置文件(Claude Code `~/.claude/settings.json` 等)给 `tapd` server 加一个 `TAPD_STORY_CONFIG` 环境变量,值是 JSON 字符串:

```json
{
  "mcpServers": {
    "tapd": {
      "command": "npx",
      "args": ["-y", "tapd-mcp"],
      "env": {
        "TAPD_API_TOKEN": "...",
        "TAPD_WORKSPACE_ID": "37748852",
        "TAPD_STORY_CONFIG": "{\"workspaces\":{\"37748852\":{\"story_defaults\":{\"需求类型\":\"业务需求\",\"成本归属\":\"科技研发中心/科技研发中心/所有项目平摊成本\"},\"story_field_rules\":{\"项目归属\":[{\"match\":\"题库\",\"value\":\"常规项目/题库\"},{\"match\":\"财经云|课程\",\"value\":\"常规项目/课程产品\"},{\"match\":\"acca|中级经济师|机考\",\"value\":\"常规项目/机考\"},{\"match\":\"cfa.*出海\",\"value\":\"常规项目/CFA出海\"},{\"match\":\"ep5|预测分|备考计划\",\"value\":\"战略项目/EP5\"}]}}}}"
      }
    }
  }
}
```

格式化看起来是这样(放在 env 里时压成一行 JSON 字符串):

```json
{
  "workspaces": {
    "37748852": {
      "story_defaults": {
        "需求类型": "业务需求",
        "成本归属": "科技研发中心/科技研发中心/所有项目平摊成本"
      },
      "story_field_rules": {
        "项目归属": [
          { "match": "题库",                  "value": "常规项目/题库" },
          { "match": "财经云|课程",           "value": "常规项目/课程产品" },
          { "match": "acca|中级经济师|机考",  "value": "常规项目/机考" },
          { "match": "cfa.*出海",             "value": "常规项目/CFA出海" },
          { "match": "ep5|预测分|备考计划",   "value": "战略项目/EP5" }
        ]
      }
    }
  }
}
```

语义：

- `story_defaults`：每条 story 都填的无条件默认值(field key 接受中文 label 或 API 名)。
- `story_field_rules`：按 `hint`(默认 `story.name`)做大小写不敏感正则匹配,**第一条命中赢**;不命中且没默认值时进 `skipped_no_match`。
- **简写**:只配一个 workspace 时,可以省掉 `workspaces` 一层,直接 `{ "story_defaults": {...}, "story_field_rules": {...} }`,所有 workspace 共用这套规则。
- 改完规则需要**重启 / 重连 MCP server** 才生效(env 只在启动时读)。
- 用 `tapd_get_config` 随时查看当前 env 解析出来的规则。

**2. 创建 story 后一键补齐**

```
tapd_create_story workspace_id="..." name="题库后台导出 csv" → 拿到 story_id
tapd_apply_story_defaults workspace_id="..." story_id="..."
# 或直接给 url：
tapd_apply_story_defaults url="https://www.tapd.cn/tapd_fe/.../story/detail/..."
```

`tapd_apply_story_defaults` 按下面优先级合成最终字段值,再依次写入：

- `overrides`(调用时显式传的 `{字段:值}`)→ 最高优先级
- `story_defaults`(无条件默认)
- `story_field_rules`(按 `hint` 正则匹配命中的第一条;`hint` 不传就回退 `story.name`)

返回 `{ plan, applied, failed, skipped_no_match, dry_run }`。其中:

- 想先看会写什么再决定是否写入,加 `dry_run=true`
- cascade 字段写入时若先写子级会 422,工具会**自动二轮重试**(parent → child)
- 规则没命中且没默认值的字段进 `skipped_no_match`,提示用户去 TAPD 网页端补齐

> **cascade 字段的值必须是完整路径,分隔符 `/`**(详见 [[tapd-cascade-field-format]])。配规则前最稳的探路办法是 `tapd_list_stories fields="id,custom_field_X" iteration_id="<近期迭代>" limit=10` 抄一个已有 story 的现成值,不要根据 schema 自己拼。


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

> **`owner` 必须传 TAPD 用户名**（与 TAPD 页面显示的一致，即 `TAPD_CURRENT_USER` 的值）。可先 `tapd_get_current_user` 拿到自己的用户名。
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

### 7. 自定义字段:查询与写入

**先查 schema** —— 在读写 story 自定义字段前,了解字段的 API 名、中文标签和类型:

```
tapd_get_custom_fields_settings workspace_id="..." entry_type="story"
tapd_get_custom_fields_settings workspace_id="..." refresh=true   # workspace admin 改过字段配置后强刷
```

返回结果包含 `field_name`(API 字段名,如 `custom_field_one`、`custom_field_96`)、`field_label`(中文标签,如 `提测时间`)、`field_type`(`dateinput` / `text` / `enum` 等)、`options`(枚举选项)。

> **注意:** 不同 workspace 的字段配置可能落在两个不同的接口里。`get_custom_fields_settings` 在某些 workspace 会返回空数组;`tapd_set_story_custom_field` 内部还会回退去查 `/stories/get_fields_info` 拿到完整 schema,所以**写入工具能解析的字段比 `get_custom_fields_settings` 多**。

**按字段名/标签写入(推荐)** —— `tapd_set_story_custom_field` 接受中文标签或 API 名,自动解析后写值,并把旧值带回:

```
tapd_set_story_custom_field workspace_id="..." story_id="..." field="提测时间" value="2026-05-28"
tapd_set_story_custom_field workspace_id="..." story_id="..." field="custom_field_96" value="2026-05-28"
```

返回 `{ story, field: { api_name, label, type }, previous }`,便于人工核对。匹配规则:先按 API 名精确匹配,再按 label 去空白/小写匹配,命中后用 API 名调 `/stories/update`。

**别名 fuzzy 匹配** —— `field` 支持逗号分隔的备选列表,**第一条解析成功的赢**。不同 workspace 同一概念的 label 经常拼写不一致(提测时间 / 提测日期 / TestDate),用别名一次写好可以避免"换个 workspace 就报字段不存在"的坑:

```
tapd_set_story_custom_field workspace_id="..." story_id="..." field="提测时间,提测日期,TestDate" value="2026-05-28"
```

按顺序试探,首条命中即用。全都解析不到才会抛错,错误信息里会列出 workspace 里所有可写字段供人工排查。

**字段 schema 过期时强刷** —— TAPD 后台改了字段(新增、改 label、改选项)后,本地缓存会指向旧 label;写入会报"字段不存在"。给 `refresh=true` 让 `tapd_set_story_custom_field` 在解析前清掉这个 workspace 的 schema 缓存:

```
tapd_set_story_custom_field workspace_id="..." story_id="..." field="新加的字段" value="..." refresh=true
```

`tapd_get_custom_fields_settings` 也支持 `refresh=true`,同源同效。

**字段解析失败时的工作流(模糊匹配兜底)** —— 用户说"把提测日期写成 X",但 workspace 里实际叫"提测时间"、`Test_Date`、或者干脆用了一个 `custom_field_NN`,你猜不准。这种时候 `tapd_set_story_custom_field` 会抛错并把**当前 workspace 所有可写字段列出来**,格式是每行一条 `api_name | type | label`。看到这个列表后:

1. **扫一遍列表**,按 label 找语义最接近的字段;label 雷同时再看 type(日期类应是 `dateinput`、单选是 `radio`/`select`、多选/级联是 `cascade_checkbox` 等)。
2. **不确定就问用户**,把 2~3 个最像的候选连同 api_name 一起列出来让用户挑;**绝不要瞎猜**写错字段。
3. 用确认后的 api_name 重试 `tapd_set_story_custom_field`。
4. **写入项目记忆**,把"用户口语 / 别名 → api_name"的映射沉淀下来,下一次就能直接走别名 fuzzy 命中。模板:

```markdown
---
name: tapd-field-aliases-<wsid>
description: workspace <wsid> 自定义字段别名映射,供 tapd_set_story_custom_field 的 fuzzy field 用
metadata:
  type: reference
---

workspace `<wsid>` 字段映射(优先用左侧任一别名做 fuzzy 匹配):

- 提测时间 / 提测日期 / TestDate → `custom_field_96` (dateinput)
- 测试时间 / 测试完成时间       → `custom_field_97` (dateinput)
- 需求类型                       → `custom_field_10` (select)
- 项目归属                       → `custom_field_12` (cascade_checkbox)
- 成本归属                       → `custom_field_9`  (cascade_checkbox)

**How to apply:** 调 `tapd_set_story_custom_field` 时,把别名串起来传给 `field`,例如 `field="提测时间,提测日期,TestDate"`,首条命中即用,新 workspace 第一次写错时按 §7 工作流补齐到这里。
```

写过的 workspace 直接按记忆里的别名串调用,不要再触发完整字段列表的错误返回。

> **典型字段 ID(仅本 workspace 参考):** 提测时间 → `custom_field_96`(dateinput)、测试时间 → `custom_field_97`、按时提测 → `custom_field_three`、测试重点 → `test_focus`、需求类型 → `custom_field_10`(select)、项目归属 → `custom_field_12`(cascade_checkbox)、成本归属 → `custom_field_9`(cascade_checkbox)。换 workspace 必须重新解析,不要硬编码。

**级联字段(cascade_checkbox)的格式坑:**

- TAPD cascade 写入用 **`/`** 作为层级分隔符(不是 `|`),且必须给**完整路径**:
  - 项目归属:`常规项目/题库` / `战略项目/EP5` / `常规项目/课程产品` / `常规项目/机考` / `常规项目/CFA出海`
  - 成本归属:`科技研发中心/科技研发中心/所有项目平摊成本`(三级路径都不能省)
- 路径错了 TAPD 只会回 `The value of cascade field [custom_field_X] is not exist!`,不会告诉你正确格式。**最稳的探路办法是 `tapd_list_stories fields="id,custom_field_X" iteration_id="<近期迭代>"` 抄一个已有 story 的现成值**。
- 创建/更新 story 时若两个 cascade 字段相互依赖(同一张表单),**先写父级、再写子级**;TAPD 422 报"父字段不存在"时通常是这个原因。

### 8. 字段 schema 缓存

`tapd_get_custom_fields_settings` 与 `tapd_set_story_custom_field` 首次解析字段时会拉一次 `/stories/get_fields_info`(约 400ms),结果落盘到 `~/.tapd-mcp/cache/fields/<entity_type>/<workspace_id>.json`(可用环境变量 `TAPD_CACHE_DIR` 改写到任意目录),命中后约 1~2ms。

**缓存过期(workspace admin 改了字段)时清理**:不再有独立工具,直接在两个使用方上加 `refresh=true`(见 §7 例子)。要批量清整个目录,直接 `rm -rf ~/.tapd-mcp/cache/fields`,服务下次调用会自动重建。

### 9. 关联代码提交

`tapd_get_story_commits` 拉取 story 关联的 git 提交(依赖 TAPD 仓库托管侧已对接)。无关联时返回空数组而不是报错。

### 10. 变更历史(Story Changes)

`tapd_get_story_changes` 拉某条 story 的字段修改历史(谁、什么时候、改了哪个字段、旧值 → 新值),底层 `/story_changes`。审计、复盘"这条需求是什么时候被改成 closed 的"等场景用:

```
tapd_get_story_changes workspace_id="..." story_id="..." limit=20
```

返回字段含 `author` / `field` / `old_value` / `new_value` / `created`。无变更或没权限时返回空数组,不报错。Task / Bug 的变更历史 TAPD 也有,但当前 MCP 未暴露,有需要再加。

### 11. workspace 成员名册

`tapd_list_workspace_users` 列 workspace 全员,返回每个人的 `user`(TAPD 用户名,与 TAPD 页面显示的一致,也是 owner / current_owner / timesheet owner 字段的合法值)、`name`(中文名)、`email`、`role_id` 等:

```
tapd_list_workspace_users workspace_id="..."
```

什么时候用:

- 用户给了中文姓名要分配 owner / current_owner / timesheet owner,需要反查 TAPD 用户名(传中文姓名会被 `Save fail.` 拒绝)
- `tapd_get_current_user` 返回 `matched_in_workspace: false` 时,可以列出来人工核对
- 想知道哪些人在这个 workspace 里、谁是 admin

不要在每次写操作前都拉一遍,缓存到上下文里复用。返回数组通常几十到几百行,不分页。

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
- **字段 schema 缓存可能过期**:在 TAPD 后台调整了自定义字段(新增、改 label、改选项)后,`tapd_set_story_custom_field` 还会按旧 label 解析,加 `refresh=true` 再写入即可(见 §7)。
- **写空字符串清字段**：`tapd_update_story` 会自动剔除空串字段；如果想把某个自定义字段恢复成空，用 `tapd_set_story_custom_field value=""`，它内部已显式放行空串。

## 一句话决策

- "看一眼" → `get_*` 默认字段
- "列一下" → `list_*`，必要时给 `iteration_id` / `owner` / `status` 缩小范围
- "完整展开" → `get_story` + `fields="*"`，单条用
- "写入" → 先核对 ID，状态用英文 key，工时用字符串
- "拿到的是链接" → 三个 `get_*` 直接接 `url`，否则先 `tapd_parse_url`
