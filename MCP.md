# MCP-WEDECODEMCP

This repository is a derivative project based on `wedecode`, focused on MCP usage and Cherry Studio integration.

This repository now includes a stdio MCP server entry at `dist/mcp/wedecode-mcp.js`.

## Build

```bash
pnpm install
pnpm build
```

## Run

```bash
pnpm mcp
```

Or use the binary after install:

```bash
wedecode-mcp
```

## Environment

- `WEDECODE_MCP_OUTPUT_ROOT`
  - Optional
  - Controls where job output directories are created when `output_dir` is not passed
  - Defaults to `<os tmp>/wedecode-mcp`

## Tools

- `scan_local_miniapps`
  - Scan local WeChat and WXWork cache directories
  - Returns a `scan_id` plus a list of candidate mini programs
- `decompile_packages`
  - Decompile one or more local `wxapkg` files or directories
- `decompile_scanned_miniapp`
  - Decompile one item from a previous `scan_local_miniapps` result
- `list_jobs`
  - List jobs created in the current MCP server session
- `list_output_files`
  - Inspect generated files for a job or output directory
- `read_output_file`
  - Read a generated file safely from a job or output directory

## Notes

- `decompile_packages` requires local filesystem paths
- If `output_dir` is provided, it must be empty
- The MCP server intentionally does not expose the existing HTTP workspace server or arbitrary command execution
- `scan_local_miniapps` uses best-effort name lookup; if name resolution fails, it falls back to `appid`

## Cherry Studio Flow

Recommended two-step flow in Cherry Studio:

1. Ask it to scan local mini programs:

```text
Scan local miniapps and list them for me.
```

2. Then choose one item from the returned list:

```text
Use scan_id xxx and analyze item 3.
```

or

```text
Use scan_id xxx and analyze item_id abc123def456.
```

## Example MCP Client Config

```json
{
  "mcpServers": {
    "wedecode": {
      "command": "node",
      "args": [
        "D:/tools/MCP-WEDECODEMCP/dist/mcp/wedecode-mcp.js"
      ],
      "env": {
        "WEDECODE_MCP_OUTPUT_ROOT": "D:/tools/wedecode-output"
      }
    }
  }
}
```
