# MCP-WEDECODEMCP 安装部署说明

这份文档用于把当前项目打包发给别人时，指导对方完成安装、部署、接入 Cherry Studio，并完成一次最小可用验证。

本仓库基于 `wedecode` 项目改造，当前侧重点是 MCP Server、Cherry Studio 接入，以及本机微信小程序扫描与反编译工作流。

文档默认以 Windows 为主，因为当前本机微信/企业微信缓存扫描的使用场景主要集中在 Windows。  
如果对方已经有明确的 `wxapkg` 路径，`wedecode-mcp` 也可以按相同方式在其他系统上运行。

## 1. 项目用途

`MCP-WEDECODEMCP` 当前提供两类能力：

- 传统命令行/可视化反编译能力
- 基于 `STDIO` 的 MCP Server，供 Cherry Studio 等 MCP 客户端调用

本次给别人部署时，通常只需要关注 MCP 入口：

```text
dist/mcp/wedecode-mcp.js
```

该 MCP Server 当前提供这些工具：

- `scan_local_miniapps`
- `decompile_packages`
- `decompile_scanned_miniapp`
- `list_jobs`
- `list_output_files`
- `read_output_file`

## 2. 推荐分发方式

建议优先选择下面两种方式之一。

### 方式 A：预构建运行包

适合“让别人直接用”，不要求对方参与构建。

特点：

- 你本地先构建好 `dist/`
- 对方只需要安装运行时依赖
- 对方不需要安装 TypeScript/Vite 构建链再编译

### 方式 B：源码包

适合“让别人也能继续开发和改代码”。

特点：

- 发送完整源码
- 对方需要执行依赖安装和构建
- 更适合二次开发、调试和继续扩展

如果对方只是想在 Cherry Studio 里直接使用，推荐优先发“预构建运行包”。

## 3. 环境要求

建议告诉对方提前准备好下面环境。

### 必需环境

- `Node.js`
  - 建议 `Node.js 20 LTS`
  - `Node.js 18+` 一般也可运行，但本文按 `Node.js 20` 编写
- `npm`
  - 通常随 Node.js 一起安装

### 可选环境

- `Cherry Studio`
  - 如果对方要在图形界面里调用 MCP
- 本机微信或企业微信缓存
  - 如果对方希望直接扫描本机小程序

### 不需要的环境

- 不需要数据库
- 不需要额外后端服务
- 不需要公网服务
- 不需要打开 HTTP 端口

`wedecode-mcp` 是标准输入输出模式，不走本地 Web 服务端口。

## 4. 目录说明

部署时最重要的目录和文件如下：

```text
MCP-WEDECODEMCP/
├─ dist/
│  └─ mcp/
│     └─ wedecode-mcp.js
├─ decryption-tool/
├─ public/
├─ prompts/
│  └─ cherry-studio/
├─ MCP.md
├─ package.json
└─ docs/
   └─ INSTALL-DEPLOY.md
```

其中：

- `dist/mcp/wedecode-mcp.js` 是 Cherry Studio 直接启动的 MCP 入口
- `package.json` 用于安装依赖
- `prompts/cherry-studio/` 里放的是可直接粘贴到 Cherry Studio 的提示词模板
- `MCP.md` 是简版 MCP 说明
- 本文档是详细安装部署说明

## 5. 预构建运行包部署

这是最推荐的给别人使用方式。

### 5.1 你需要先准备什么

在你自己的机器上执行：

```powershell
npm install
npm run build
```

成功后，确认下面文件存在：

```text
dist/mcp/wedecode-mcp.js
```

### 5.2 你发给别人时，至少带上这些内容

建议打包这些文件和目录：

- `dist/`
- `decryption-tool/`
- `public/`
- `package.json`
- `pnpm-lock.yaml`
- `MCP.md`
- `docs/INSTALL-DEPLOY.md`
- `prompts/cherry-studio/`

如果只给别人“使用”，不需要把 `src/` 一并发过去。

### 5.3 对方机器上的安装步骤

1. 解压到一个固定目录，例如：

```text
D:\tools\MCP-WEDECODEMCP
```

2. 进入目录执行：

```powershell
cd D:\tools\MCP-WEDECODEMCP
npm install --omit=dev
```

说明：

- 这里用 `--omit=dev`，因为对方只是运行 `dist`，不需要开发依赖
- 如果对方后续要重新构建，再执行一次完整的 `npm install`

### 5.4 本地启动验证

执行：

```powershell
node dist\mcp\wedecode-mcp.js
```

如果看到类似“ready”的启动输出，并且进程保持运行，说明 MCP Server 本体可用。

## 6. 源码包部署

如果对方需要自己构建，按这个方式部署。

### 6.1 你发给别人时建议带上

- `src/`
- `dist/`
- `decryption-tool/`
- `public/`
- `prompts/`
- `docs/`
- `package.json`
- `pnpm-lock.yaml`
- `vite.config.ts`
- `tsconfig.json`
- `tsconfig.cli.json`
- `README.md`
- `MCP.md`

### 6.2 对方机器上的安装步骤

```powershell
cd D:\tools\MCP-WEDECODEMCP
npm install
npm run build
```

构建完成后，MCP 入口仍然是：

```text
dist/mcp/wedecode-mcp.js
```

### 6.3 构建后验证

```powershell
node dist\mcp\wedecode-mcp.js
```

如果能正常启动，说明源码部署完成。

## 7. Cherry Studio 接入方式

### 7.1 需要填写的核心信息

在 Cherry Studio 中添加一个 `STDIO` 类型的 MCP Server。

推荐填写：

- `Name`: `wedecode`
- `Type`: `STDIO`
- `Command`: `C:\Program Files\nodejs\node.exe`
- `Arguments`: `D:\tools\MCP-WEDECODEMCP\dist\mcp\wedecode-mcp.js`

建议增加环境变量：

- `WEDECODE_MCP_OUTPUT_ROOT=D:\tools\wedecode-output`

这个目录用于保存反编译结果。建议给一个固定、独立、可写的目录。

### 7.2 示例配置

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

### 7.3 配置注意事项

- `Command` 尽量使用 `node.exe` 的绝对路径，不要只写 `node`
- `Arguments` 尽量使用 `wedecode-mcp.js` 的绝对路径
- 输出目录不要指向系统敏感目录
- 如果手动指定 `output_dir`，该目录最好为空目录

## 8. Cherry Studio 里的推荐用法

如果对方没有明确的 `wxapkg` 路径，推荐按“两步走”：

### 第一步：先扫描本机小程序

让用户在 Cherry Studio 中输入：

```text
扫描我本机的微信小程序，列出前 10 个给我选。
```

### 第二步：用户选择后再分析

例如：

```text
分析第 3 个。
```

或者：

```text
分析 item_id=abc123def456 的那个小程序。
```

如果对方已经知道具体 `wxapkg` 路径，可以直接输入：

```text
直接反编译这个 wxapkg，并读取 app.json 给我看：
C:\path\to\__APP__.wxapkg
```

## 9. 可直接复用的提示词文件

仓库里已经准备了 Cherry Studio 可直接粘贴的提示词模板：

- `prompts/cherry-studio/security-audit.md`
- `prompts/cherry-studio/reverse-analysis.md`

推荐做法：

1. 在 Cherry Studio 里新建一个助手
2. 把对应模板粘贴到系统提示词
3. 启用 `wedecode` MCP
4. 直接开始扫描和分析

## 10. 最小可用验证流程

建议让对方在部署后按下面流程验证一次。

### 验证目标

确认这些能力都正常：

- MCP Server 能启动
- Cherry Studio 能连接到 MCP
- 能扫描本机小程序，或能直接读取本地 `wxapkg`
- 能完成一次反编译
- 能读取产物中的 `app.json`

### 验证步骤

1. 启动 Cherry Studio 并启用 `wedecode`
2. 发送：

```text
扫描我本机的微信小程序，列出前 5 个。
```

3. 选择一个目标后发送：

```text
分析第 1 个，并读取 app.json。
```

4. 如果能看到反编译结果和 `app.json` 内容，说明链路正常

### 如果对方没有本机缓存

可以改为直接验证本地包路径：

```text
调用 wedecode 反编译这个 wxapkg，并读取 app.json：
C:\path\to\__APP__.wxapkg
```

## 11. 你如何打包给别人

下面给出几种常见打包方式。

如果你直接使用本仓库，优先推荐用内置脚本：

```powershell
npm run package:runtime
npm run package:source
npm run package:all
```

默认会把 zip 输出到 `release/` 目录。

### 11.1 打预构建运行包

先确保你本地已经构建完成：

```powershell
npm install
npm run build
```

然后在项目根目录执行：

```powershell
Compress-Archive `
  -Path dist, decryption-tool, public, package.json, pnpm-lock.yaml, MCP.md, docs, prompts `
  -DestinationPath MCP-WEDECODEMCP-runtime.zip `
  -Force
```

这个压缩包适合直接发给只需要“使用”的人。

### 11.2 打源码包

```powershell
Compress-Archive `
  -Path src, dist, decryption-tool, public, package.json, pnpm-lock.yaml, vite.config.ts, tsconfig.json, tsconfig.cli.json, README.md, MCP.md, docs, prompts `
  -DestinationPath MCP-WEDECODEMCP-source.zip `
  -Force
```

这个压缩包适合发给需要继续开发的人。

### 11.3 是否建议把 `node_modules` 一起打包

通常不建议。

原因：

- 体积会非常大
- 不同机器、不同 Node 版本下可复用性差
- 容易把无关缓存和本地环境状态一起带过去

只有在严格的离线环境，并且双方系统环境非常接近时，才考虑一起打包。

## 12. 常见问题

### 12.1 Cherry Studio 里看不到工具

排查顺序：

1. 确认 `Command` 是 `node.exe` 的绝对路径
2. 确认 `Arguments` 指向的是 `dist/mcp/wedecode-mcp.js`
3. 确认本地可直接执行：

```powershell
node dist\mcp\wedecode-mcp.js
```

4. 确认 Cherry Studio 已启用该 MCP Server

### 12.2 提示找不到模块或依赖

对方需要在项目目录重新执行：

```powershell
npm install --omit=dev
```

如果对方拿到的是源码包，而不是预构建运行包，则执行：

```powershell
npm install
npm run build
```

### 12.3 扫描不到本机小程序

常见原因：

- 对方机器上没有安装微信或企业微信
- 安装了，但没有真正打开过目标小程序
- 微信缓存路径和默认扫描模式不一致

这时可以绕过扫描，直接让用户给出明确的 `wxapkg` 路径，再调用 `decompile_packages`。

### 12.4 反编译输出失败

排查点：

- `output_dir` 是否为空目录
- 输出目录是否有写权限
- 输入的是否是真实 `wxapkg` 或包含 `wxapkg` 的目录
- 包是否损坏或缺少主包/分包

### 12.5 为什么会看到很多默认模板文件

通常说明：

- 分包没有一起提供
- 依赖文件不完整
- 主包和分包没有放在同一轮解包范围内

建议把同一小程序的相关包尽量一起提供给工具处理。

## 13. 升级方式

如果你后续更新了项目，建议按这个顺序通知对方升级：

1. 替换项目目录
2. 在新目录执行依赖安装
3. 如果是源码包，再执行一次构建
4. Cherry Studio 中检查脚本路径是否仍然正确

预构建运行包升级：

```powershell
npm install --omit=dev
```

源码包升级：

```powershell
npm install
npm run build
```

## 14. 卸载方式

如果对方不再使用：

1. 在 Cherry Studio 中删除对应 MCP Server 配置
2. 删除项目目录
3. 删除 `WEDECODE_MCP_OUTPUT_ROOT` 指向的输出目录

## 15. 安全与使用边界

请只在合法、合规、获得授权的前提下使用该工具。

建议明确告知对方：

- 仅用于小程序代码审计、研究、学习、授权测试等合法用途
- 不要用于未授权的攻击、窃取、绕过和非法传播

## 16. 给接收方的最短说明

如果你只想在发包时附一段最短说明，可以直接复制下面这段：

```text
1. 安装 Node.js 20 LTS。
2. 解压项目到本地目录。
3. 在项目目录执行 npm install --omit=dev。
4. 在 Cherry Studio 里新增一个 STDIO MCP：
   Command = C:\Program Files\nodejs\node.exe
   Arguments = D:\tools\wedecode-main\dist\mcp\wedecode-mcp.js
   Env = WEDECODE_MCP_OUTPUT_ROOT=D:\tools\wedecode-output
5. 保存后在聊天里输入：扫描我本机的微信小程序，列出来给我选。
```
