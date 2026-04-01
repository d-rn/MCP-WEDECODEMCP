# MCP-WEDECODEMCP

基于 [`wedecode`](https://github.com/biggerstar/wedecode) 项目改造的微信小程序反编译 MCP Server，重点面向 Cherry Studio 等 MCP 客户端的本机扫描、反编译和结构分析流程。

这个仓库保留了 `wedecode` 的核心反编译能力，并在此基础上补了一层适合 MCP 场景的封装，主要目标是让模型能够安全地：

- 扫描本机微信和企业微信缓存中的小程序包
- 由用户选择目标小程序后再执行反编译
- 安全读取反编译结果中的文件
- 在 Cherry Studio 中走稳定的两步分析流程

## 改造内容

相对原始 `wedecode`，这个仓库主要增加和收敛了这些能力：

- 新增 `STDIO` 模式的 MCP Server 入口
- 提供 `scan_local_miniapps`、`decompile_scanned_miniapp` 等面向 MCP 的工具
- 将反编译流程包进独立子进程，避免底层 `process.exit` 直接带崩 MCP 进程
- 增加输出目录和文件读取的安全约束
- 修复 VM / `jsdom` 运行时在部分小程序上的 DOM 绑定问题
- 补充 Cherry Studio 提示词模板和部署文档

## 工具列表

当前 MCP Server 提供这些工具：

- `scan_local_miniapps`
- `decompile_packages`
- `decompile_scanned_miniapp`
- `list_jobs`
- `list_output_files`
- `read_output_file`

## 快速开始

### 1. 克隆仓库

```powershell
git clone https://github.com/d-rn/MCP-WEDECODEMCP.git
cd MCP-WEDECODEMCP
```

### 2. 安装依赖

```powershell
npm install
```

### 3. 构建

```powershell
npm run build
```

### 4. 启动 MCP Server

```powershell
npm run mcp
```

或者直接运行构建产物：

```powershell
node dist\mcp\wedecode-mcp.js
```

## Cherry Studio 配置

在 Cherry Studio 中新增一个 `STDIO` 类型 MCP Server，核心配置可以直接用下面这份：

```json
{
  "mcpServers": {
    "wedecode": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": [
        "D:\\tools\\MCP-WEDECODEMCP\\dist\\mcp\\wedecode-mcp.js"
      ],
      "env": {
        "WEDECODE_MCP_OUTPUT_ROOT": "D:\\tools\\wedecode-output"
      }
    }
  }
}
```

如果 Cherry Studio 使用的是单个服务项格式，可以改用：

```json
{
  "name": "wedecode",
  "type": "stdio",
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": [
    "D:\\tools\\MCP-WEDECODEMCP\\dist\\mcp\\wedecode-mcp.js"
  ],
  "env": {
    "WEDECODE_MCP_OUTPUT_ROOT": "D:\\tools\\wedecode-output"
  }
}
```

## 推荐使用流程

如果用户没有直接给出本地 `wxapkg` 路径，推荐在 Cherry Studio 中走两步：

### 第一步：扫描本机小程序

```text
扫描我本机的微信小程序，列出前 10 个给我选。
```

### 第二步：用户选择目标

```text
分析第 3 个。
```

或者：

```text
分析 item_id=abc123def456 的那个小程序。
```

如果用户已经知道具体 `wxapkg` 路径，可以直接说：

```text
直接反编译这个 wxapkg，并读取 app.json 给我看：
C:\path\to\__APP__.wxapkg
```

## 提示词模板

仓库里已经放好了 Cherry Studio 可直接粘贴的提示词模板：

- [`prompts/cherry-studio/security-audit.md`](./prompts/cherry-studio/security-audit.md)
- [`prompts/cherry-studio/reverse-analysis.md`](./prompts/cherry-studio/reverse-analysis.md)

## 安装和打包文档

更详细的说明见：

- [`docs/INSTALL-DEPLOY.md`](./docs/INSTALL-DEPLOY.md)
- [`MCP.md`](./MCP.md)
- [`NOTICE.md`](./NOTICE.md)

## 原项目说明

本项目是基于 `wedecode` 改造而来，不是原项目官方仓库。

- 原项目：`wedecode`
- 原仓库：`https://github.com/biggerstar/wedecode`
- 当前仓库聚焦：MCP Server、Cherry Studio 接入、本机扫描和分析工作流

在继续分发、修改或二次发布时，请一并保留原项目来源说明和许可证信息。

## License

沿用原项目许可证：`GPL-3.0-or-later`。详见 [`LICENSE`](./LICENSE)。
