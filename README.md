# TAPD MCP Server

MCP (Model Context Protocol) server for TAPD (Tencent Agile Product Development) - manage stories, tasks, bugs, iterations, comments, and releases through AI assistants.

[![npm version](https://badge.fury.io/js/tapd-mcp.svg)](https://www.npmjs.com/package/tapd-mcp)

## Features

- **Stories/Requirements**: Get, list, create, update stories
- **Tasks**: Get, list, create, update tasks (including status changes)
- **Bugs**: Get, list, create, update bugs
- **Iterations**: Get, list, create, update iterations/sprints
- **Comments**: List and add comments to stories/tasks/bugs
- **Releases**: List, create, update releases
- **Code Relations**: Get commits associated with stories
- **URL Parsing**: Parse TAPD URLs to extract workspace/resource info

## Quick Start

### Using npx (Recommended)

No installation required - just configure your AI tool to use:

```bash
npx tapd-mcp
```

### Global Installation

```bash
npm install -g tapd-mcp
tapd-mcp
```

### Local Installation

```bash
npm install tapd-mcp
npx tapd-mcp
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TAPD_API_TOKEN` | Yes | Your TAPD API token |
| `TAPD_WORKSPACE_ID` | No | Default workspace ID |
| `TAPD_CURRENT_USER` | No | Your TAPD user id (e.g. `xiaopeng_lei`). Used by `tapd_get_current_user` so AI assistants can identify "you". |

### Get Your API Token

1. Visit [TAPD API Token Management](https://www.tapd.cn/company/my_tokens)
2. Log in to TAPD
3. Create a new API token
4. Copy the token

## AI Tool Configuration

### Claude Code / Claude Desktop

Add to your MCP settings file:
- Claude Code: `~/.claude/settings.json` or project `.claude/settings.json`
- Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "tapd": {
      "command": "npx",
      "args": ["-y", "tapd-mcp"],
      "env": {
        "TAPD_API_TOKEN": "your_api_token_here",
        "TAPD_WORKSPACE_ID": "your_default_workspace_id",
        "TAPD_CURRENT_USER": "your_tapd_user_id"
      }
    }
  }
}
```

### Cursor

Add to your Cursor settings (`.cursor/mcp.json` in your project or global settings):

```json
{
  "mcpServers": {
    "tapd": {
      "command": "npx",
      "args": ["-y", "tapd-mcp"],
      "env": {
        "TAPD_API_TOKEN": "your_api_token_here",
        "TAPD_WORKSPACE_ID": "your_default_workspace_id",
        "TAPD_CURRENT_USER": "your_tapd_user_id"
      }
    }
  }
}
```

### Windsurf

Add to your Windsurf MCP configuration (`~/.windsurf/mcp.json`):

```json
{
  "mcpServers": {
    "tapd": {
      "command": "npx",
      "args": ["-y", "tapd-mcp"],
      "env": {
        "TAPD_API_TOKEN": "your_api_token_here",
        "TAPD_WORKSPACE_ID": "your_default_workspace_id",
        "TAPD_CURRENT_USER": "your_tapd_user_id"
      }
    }
  }
}
```

### Cline (VS Code Extension)

Add to your Cline MCP settings:

```json
{
  "mcpServers": {
    "tapd": {
      "command": "npx",
      "args": ["-y", "tapd-mcp"],
      "env": {
        "TAPD_API_TOKEN": "your_api_token_here",
        "TAPD_WORKSPACE_ID": "your_default_workspace_id",
        "TAPD_CURRENT_USER": "your_tapd_user_id"
      }
    }
  }
}
```

### Continue (VS Code / JetBrains Extension)

Add to your Continue config (`~/.continue/config.json`):

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "npx",
          "args": ["-y", "tapd-mcp"]
        },
        "env": {
          "TAPD_API_TOKEN": "your_api_token_here",
          "TAPD_WORKSPACE_ID": "your_default_workspace_id",
          "TAPD_CURRENT_USER": "your_tapd_user_id"
        }
      }
    ]
  }
}
```

### Zed Editor

Add to your Zed settings (`~/.config/zed/settings.json`):

```json
{
  "context_servers": {
    "tapd": {
      "command": {
        "path": "npx",
        "args": ["-y", "tapd-mcp"]
      },
      "env": {
        "TAPD_API_TOKEN": "your_api_token_here",
        "TAPD_WORKSPACE_ID": "your_default_workspace_id",
        "TAPD_CURRENT_USER": "your_tapd_user_id"
      }
    }
  }
}
```

### Using with Node.js directly (Alternative)

If you prefer not to use npx, you can install globally and use the binary path:

```json
{
  "mcpServers": {
    "tapd": {
      "command": "tapd-mcp",
      "env": {
        "TAPD_API_TOKEN": "your_api_token_here",
        "TAPD_WORKSPACE_ID": "your_default_workspace_id",
        "TAPD_CURRENT_USER": "your_tapd_user_id"
      }
    }
  }
}
```

## Available Tools

### Story Tools

| Tool | Description |
|------|-------------|
| `tapd_get_story` | Get story details by ID or URL |
| `tapd_list_stories` | List stories with filters |
| `tapd_create_story` | Create a new story |
| `tapd_update_story` | Update an existing story |

### Task Tools

| Tool | Description |
|------|-------------|
| `tapd_get_task` | Get task details |
| `tapd_list_tasks` | List tasks (can filter by story) |
| `tapd_create_task` | Create a task under a story |
| `tapd_update_task` | Update task (including status) |

### Bug Tools

| Tool | Description |
|------|-------------|
| `tapd_get_bug` | Get bug details |
| `tapd_list_bugs` | List bugs with filters |
| `tapd_create_bug` | Create a new bug |
| `tapd_update_bug` | Update a bug |

### Iteration Tools

| Tool | Description |
|------|-------------|
| `tapd_get_iteration` | Get iteration details |
| `tapd_list_iterations` | List iterations |
| `tapd_create_iteration` | Create a new iteration |
| `tapd_update_iteration` | Update an iteration |

### Comment Tools

| Tool | Description |
|------|-------------|
| `tapd_list_comments` | List comments on a story/task/bug |
| `tapd_add_comment` | Add a comment |

### Release Tools

| Tool | Description |
|------|-------------|
| `tapd_list_releases` | List releases |
| `tapd_create_release` | Create a new release |
| `tapd_update_release` | Update a release |

### Other Tools

| Tool | Description |
|------|-------------|
| `tapd_get_story_commits` | Get code commits linked to a story |
| `tapd_parse_url` | Parse a TAPD URL |
| `tapd_get_current_user` | Get the current user (the "me" identity behind the API token); requires `TAPD_CURRENT_USER` env var |

## Examples

### Get a story by URL

```
Use tapd_get_story with url: "https://www.tapd.cn/tapd_fe/12345/story/detail/112345678901234567"
```

### List stories in an iteration

```
Use tapd_list_stories with workspace_id: "12345", iteration_id: "112345678901234567"
```

### Create a task under a story

```
Use tapd_create_task with:
  workspace_id: "12345"
  name: "Implement login API"
  story_id: "112345678901234567"
  owner: "developer_name"
  effort: "8"
```

### Update task status

```
Use tapd_update_task with:
  workspace_id: "12345"
  task_id: "112345678901234568"
  status: "done"
  progress: "100"
```

### Add a comment to a story

```
Use tapd_add_comment with:
  workspace_id: "12345"
  entry_type: "stories"
  entry_id: "112345678901234567"
  description: "Code review completed, ready for testing"
```

## Status Values

### Story Status
- `planning` - 待规划
- `developing` - 开发中
- `testing` - 测试中
- `resolved` - 已完成
- `closed` - 已关闭
- `rejected` - 已拒绝

### Task Status
- `open` - 未开始
- `progressing` - 进行中
- `done` - 已完成

### Bug Status
- `new` - 新建
- `in_progress` - 接受/处理
- `resolved` - 已解决
- `verified` - 已验证
- `closed` - 已关闭
- `rejected` - 已拒绝
- `reopened` - 重新打开

## Development

```bash
# Clone the repository
git clone https://github.com/openpeng/tapd-mcp.git
cd tapd-mcp

# Install dependencies
npm install

# Build
npm run build

# Run locally
TAPD_API_TOKEN=your_token node dist/index.js
```

## API Reference

This MCP server uses the [TAPD Open Platform API](https://open.tapd.cn/).

## License

MIT
