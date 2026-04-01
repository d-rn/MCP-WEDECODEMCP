# v0.1.0

首个可用版本，聚焦把 `wedecode` 的核心反编译能力整理成一个适合 MCP 使用和分发的独立仓库。

## Added

- 新增 `STDIO` 模式 MCP Server 入口
- 新增 `scan_local_miniapps`
- 新增 `decompile_scanned_miniapp`
- 新增 `decompile_packages`
- 新增 `list_jobs`
- 新增 `list_output_files`
- 新增 `read_output_file`
- 新增 Cherry Studio 提示词模板
- 新增安装、部署、分发文档
- 新增独立的仓库说明和来源声明
- 新增一键打包脚本

## Changed

- 将反编译流程包进子进程，避免底层 `process.exit` 直接带崩 MCP 进程
- 为输出目录和文件读取增加了更适合 MCP 场景的安全约束
- 调整项目元信息，使其作为独立仓库更容易直接分发和部署

## Fixed

- 修复 `jsdom` / VM 运行时在部分小程序上的 DOM 方法绑定问题
- 收口安装流程中与 `husky` 相关的无关脚本，避免运行包部署时出现额外阻塞

## Notes

- 本仓库基于 `wedecode` 项目改造，不是原项目官方仓库
- 许可证沿用原项目 `GPL-3.0-or-later`
- 建议在 Cherry Studio 中按“先扫描、再选择、再分析”的流程使用
