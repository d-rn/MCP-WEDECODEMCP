#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import axios from 'axios';
import { glob } from 'glob';
import { z } from 'zod/v3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { globPathList, AppMainPackageNames } from '@/bin/wedecode/enum';
import { isWxAppid } from '@/utils/common';
import pkg from '../../package.json';

type JobStatus = 'running' | 'completed' | 'failed';

interface JobRecord {
  id: string;
  createdAt: string;
  inputPaths: string[];
  outputDir: string;
  options: {
    usePx: boolean;
    unpackOnly: boolean;
    wxid?: string;
  };
  status: JobStatus;
  totalFiles?: number;
  totalDirectories?: number;
  sampleFiles?: string[];
  logExcerpt?: string;
  error?: string;
}

interface DirectorySummary {
  outputDir: string;
  totalFiles: number;
  totalDirectories: number;
  sampleFiles: string[];
  topLevelEntries: string[];
  sampleTruncated: boolean;
}

interface ScanItemRecord {
  itemId: string;
  appid?: string;
  displayName: string;
  nickname?: string;
  username?: string;
  packagePath: string;
  source: 'wechat' | 'wxwork' | 'unknown';
  modifiedAt: string;
  size: number;
}

interface ScanRecord {
  id: string;
  createdAt: string;
  patterns: string[];
  resolveNames: boolean;
  items: ScanItemRecord[];
}

const DEFAULT_OUTPUT_ROOT = path.resolve(
  process.env.WEDECODE_MCP_OUTPUT_ROOT || path.join(os.tmpdir(), 'wedecode-mcp')
);
const MAX_LOG_CHARS = 24_000;
const DEFAULT_SAMPLE_LIMIT = 200;
const DEFAULT_TOP_LEVEL_LIMIT = 100;
const DEFAULT_READ_CHARS = 24_000;
const MAX_READ_CHARS = 200_000;
const DEFAULT_SCAN_LIMIT = 20;
const MAX_SCAN_LIMIT = 100;
const MINIAPP_INFO_API_URL = 'https://kainy.cn/api/weapp/info/';
const WXWORK_SCAN_PATTERNS = [
  'C:/Users/*/Documents/WXWork/*/Applets/Applet',
  'C:/Users/*/AppData/Roaming/Tencent/WXWork/Applet',
  'C:/Users/*/AppData/Roaming/Tencent/WXWork/radium/users'
];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DECOMPILATION_CLI_PATH = path.resolve(__dirname, '../decompilation-cli.js');

const jobs = new Map<string, JobRecord>();
const scans = new Map<string, ScanRecord>();

function createJobId(): string {
  return `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
}

function trimLog(log: string): string {
  return log.length > MAX_LOG_CHARS ? log.slice(-MAX_LOG_CHARS) : log;
}

function appendLog(existing: string, chunk: string): string {
  return trimLog(existing + chunk);
}

function ensureDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function toPosixPattern(pattern: string): string {
  return pattern.replace(/\\/g, '/');
}

function getDefaultScanPatterns(includeWxwork = true): string[] {
  return includeWxwork ? [...globPathList, ...WXWORK_SCAN_PATTERNS] : [...globPathList];
}

function normalizeForCompare(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const normalizedParent = normalizeForCompare(parentPath);
  const normalizedChild = normalizeForCompare(childPath);
  return (
    normalizedChild === normalizedParent ||
    normalizedChild.startsWith(`${normalizedParent}${path.sep}`)
  );
}

function resolveExistingInputPath(rawPath: string): string {
  const resolved = path.resolve(rawPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Input path does not exist: ${resolved}`);
  }
  return resolved;
}

function createItemId(packagePath: string): string {
  return crypto
    .createHash('sha1')
    .update(normalizeForCompare(packagePath))
    .digest('hex')
    .slice(0, 12);
}

function detectMiniappSource(packagePath: string): 'wechat' | 'wxwork' | 'unknown' {
  const normalized = normalizeForCompare(packagePath);
  if (normalized.includes(`${path.sep}wxwork${path.sep}`)) {
    return 'wxwork';
  }
  if (
    normalized.includes(`${path.sep}xwechat${path.sep}`) ||
    normalized.includes(`${path.sep}wechat files${path.sep}`) ||
    normalized.includes(`${path.sep}weixin${path.sep}`)
  ) {
    return 'wechat';
  }
  return 'unknown';
}

function deriveAppIdFromPath(packagePath: string): string | undefined {
  const parts = path.normalize(packagePath).split(path.sep);
  return parts.find((part) => isWxAppid(part));
}

function fallbackMiniappName(packagePath: string, appid?: string): string {
  return appid || path.basename(path.dirname(packagePath));
}

async function lookupMiniappInfo(appid: string): Promise<{
  nickname?: string;
  username?: string;
}> {
  try {
    const response = await axios.post(
      MINIAPP_INFO_API_URL,
      { appid },
      {
        timeout: 3000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const data = response.data?.data;
    return {
      nickname: typeof data?.nickname === 'string' ? data.nickname : undefined,
      username: typeof data?.username === 'string' ? data.username : undefined
    };
  } catch {
    return {};
  }
}

async function enrichMiniappNames(
  items: ScanItemRecord[],
  resolveNames: boolean
): Promise<ScanItemRecord[]> {
  if (!resolveNames) {
    return items;
  }

  const cache = new Map<string, { nickname?: string; username?: string }>();

  await Promise.all(
    items.map(async (item) => {
      if (!item.appid) {
        return;
      }
      if (!cache.has(item.appid)) {
        cache.set(item.appid, await lookupMiniappInfo(item.appid));
      }
      const info = cache.get(item.appid) || {};
      item.nickname = info.nickname;
      item.username = info.username;
      item.displayName = info.nickname || info.username || item.displayName;
    })
  );

  return items;
}

function collectMainPackageCandidates(patterns: string[]): string[] {
  const packagePaths = new Set<string>();

  for (const pattern of patterns) {
    const normalizedPattern = toPosixPattern(pattern);
    for (const mainPackageName of AppMainPackageNames) {
      const matches = glob.globSync(`${normalizedPattern}/**/${mainPackageName}`, {
        absolute: true,
        dot: true,
        nocase: true,
        windowsPathsNoEscape: true
      });

      for (const match of matches) {
        packagePaths.add(path.resolve(match));
      }
    }
  }

  return Array.from(packagePaths);
}

async function createMiniappScan(options: {
  patterns?: string[];
  limit?: number;
  resolveNames?: boolean;
  includeWxwork?: boolean;
}): Promise<ScanRecord> {
  const limit = Math.min(options.limit || DEFAULT_SCAN_LIMIT, MAX_SCAN_LIMIT);
  const resolveNames = options.resolveNames !== false;
  const patterns = (options.patterns?.length ? options.patterns : getDefaultScanPatterns(options.includeWxwork !== false))
    .map((pattern) => pattern.trim())
    .filter(Boolean);

  const candidates = collectMainPackageCandidates(patterns);
  const grouped = new Map<string, ScanItemRecord>();

  for (const packagePath of candidates) {
    const stats = fs.statSync(packagePath);
    const appid = deriveAppIdFromPath(packagePath);
    const source = detectMiniappSource(packagePath);
    const groupKey = `${source}:${appid || normalizeForCompare(packagePath)}`;
    const record: ScanItemRecord = {
      itemId: createItemId(packagePath),
      appid,
      displayName: fallbackMiniappName(packagePath, appid),
      packagePath,
      source,
      modifiedAt: stats.mtime.toISOString(),
      size: stats.size
    };

    const existing = grouped.get(groupKey);
    if (!existing || new Date(record.modifiedAt).getTime() > new Date(existing.modifiedAt).getTime()) {
      grouped.set(groupKey, record);
    }
  }

  const items = Array.from(grouped.values())
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
    .slice(0, limit);

  await enrichMiniappNames(items, resolveNames);

  const scan: ScanRecord = {
    id: createJobId(),
    createdAt: new Date().toISOString(),
    patterns,
    resolveNames,
    items
  };

  scans.set(scan.id, scan);
  return scan;
}

function formatScanText(scan: ScanRecord): string {
  if (scan.items.length === 0) {
    return [
      `Scan: ${scan.id}`,
      'Found: 0',
      'No local mini program packages were found in the scanned locations.'
    ].join('\n');
  }

  const lines = [
    `Scan: ${scan.id}`,
    `Found: ${scan.items.length}`,
    'Use scan_id with index or item_id to choose one for decompilation.'
  ];

  scan.items.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.displayName} (${item.appid || 'unknown-appid'}) [${item.source}] item_id=${item.itemId} modified=${item.modifiedAt}`
    );
  });

  return lines.join('\n');
}

function getScannedItem(scanId: string, index?: number, itemId?: string): ScanItemRecord {
  const scan = scans.get(scanId);
  if (!scan) {
    throw new Error(`Unknown scan_id: ${scanId}`);
  }

  if (itemId) {
    const item = scan.items.find((candidate) => candidate.itemId === itemId);
    if (!item) {
      throw new Error(`Unknown item_id for scan ${scanId}: ${itemId}`);
    }
    return item;
  }

  if (typeof index === 'number') {
    const item = scan.items[index - 1];
    if (!item) {
      throw new Error(`Index out of range for scan ${scanId}: ${index}`);
    }
    return item;
  }

  throw new Error('Provide either index or item_id.');
}

function resolveOutputDirectory(rawOutputDir: string | undefined, jobId: string): string {
  const outputDir = rawOutputDir
    ? path.resolve(rawOutputDir)
    : path.join(DEFAULT_OUTPUT_ROOT, jobId);

  ensureDirectory(path.dirname(outputDir));

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    return outputDir;
  }

  const existingEntries = fs.readdirSync(outputDir);
  if (existingEntries.length > 0) {
    throw new Error(
      `Output directory must be empty. Choose a new directory or clean it first: ${outputDir}`
    );
  }

  return outputDir;
}

function summarizeDirectory(outputDir: string, sampleLimit = DEFAULT_SAMPLE_LIMIT): DirectorySummary {
  const sampleFiles: string[] = [];
  const topLevelEntries: string[] = [];
  let totalFiles = 0;
  let totalDirectories = 0;

  const stack = [outputDir];

  while (stack.length > 0) {
    const currentDir = stack.pop() as string;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(outputDir, fullPath) || '.';

      if (currentDir === outputDir && topLevelEntries.length < DEFAULT_TOP_LEVEL_LIMIT) {
        topLevelEntries.push(entry.isDirectory() ? `${relativePath}/` : relativePath);
      }

      if (entry.isDirectory()) {
        totalDirectories += 1;
        stack.push(fullPath);
        continue;
      }

      totalFiles += 1;
      if (sampleFiles.length < sampleLimit) {
        sampleFiles.push(relativePath);
      }
    }
  }

  return {
    outputDir,
    totalFiles,
    totalDirectories,
    sampleFiles,
    topLevelEntries,
    sampleTruncated: totalFiles > sampleFiles.length
  };
}

function resolveOutputRoot(jobId: string | undefined, outputDir: string | undefined): string {
  if (jobId) {
    const job = jobs.get(jobId);
    if (!job) {
      throw new Error(`Unknown job_id: ${jobId}`);
    }
    return job.outputDir;
  }

  if (!outputDir) {
    throw new Error('Provide either job_id or output_dir.');
  }

  const resolved = path.resolve(outputDir);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Output directory does not exist: ${resolved}`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`Output path is not a directory: ${resolved}`);
  }
  return resolved;
}

function resolveChildPath(rootDir: string, relativePath: string): string {
  const fullPath = path.resolve(rootDir, relativePath);
  if (!isPathInside(rootDir, fullPath)) {
    throw new Error(`Path escapes the output directory: ${relativePath}`);
  }
  return fullPath;
}

function isProbablyBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8_192));
  let suspiciousBytes = 0;

  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }

    const isPrintable =
      byte === 9 ||
      byte === 10 ||
      byte === 13 ||
      (byte >= 32 && byte <= 126);

    if (!isPrintable) {
      suspiciousBytes += 1;
    }
  }

  return sample.length > 0 && suspiciousBytes / sample.length > 0.3;
}

async function runDecompilation(
  inputPaths: string[],
  outputDir: string,
  options: { usePx: boolean; unpackOnly: boolean; wxid?: string }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  let stdout = '';
  let stderr = '';

  const cliArgs = [DECOMPILATION_CLI_PATH, ...inputPaths, outputDir, ''];
  if (options.usePx) {
    cliArgs.push('--px');
  }
  if (options.unpackOnly) {
    cliArgs.push('--unpack-only');
  }
  if (options.wxid) {
    cliArgs.push('--wxid', options.wxid);
  }

  const child = spawn(process.execPath, cliArgs, {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      WEDECODE_CHILD_PROCESS: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout?.on('data', (chunk) => {
    stdout = appendLog(stdout, chunk.toString());
  });

  child.stderr?.on('data', (chunk) => {
    stderr = appendLog(stderr, chunk.toString());
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });

  return { stdout, stderr, exitCode };
}

function formatSummaryText(job: JobRecord, summary: DirectorySummary): string {
  const sample = summary.sampleFiles.slice(0, 20);
  const lines = [
    `Job: ${job.id}`,
    `Status: ${job.status}`,
    `Output: ${job.outputDir}`,
    `Inputs: ${job.inputPaths.join(', ')}`,
    `Files: ${summary.totalFiles}`,
    `Directories: ${summary.totalDirectories}`,
    `Top level: ${summary.topLevelEntries.slice(0, 20).join(', ') || '(empty)'}`
  ];

  if (sample.length > 0) {
    lines.push(`Sample files: ${sample.join(', ')}`);
  }

  if (job.logExcerpt) {
    lines.push(`Log excerpt:\n${job.logExcerpt}`);
  }

  return lines.join('\n');
}

async function executeDecompileRequest(args: {
  inputPaths: string[];
  outputDir?: string;
  usePx?: boolean;
  unpackOnly?: boolean;
  wxid?: string;
}) {
  ensureDirectory(DEFAULT_OUTPUT_ROOT);

  const resolvedInputs = args.inputPaths.map(resolveExistingInputPath);
  const jobId = createJobId();
  const resolvedOutputDir = resolveOutputDirectory(args.outputDir, jobId);
  const options = {
    usePx: Boolean(args.usePx),
    unpackOnly: Boolean(args.unpackOnly),
    wxid: args.wxid
  };

  const job: JobRecord = {
    id: jobId,
    createdAt: new Date().toISOString(),
    inputPaths: resolvedInputs,
    outputDir: resolvedOutputDir,
    options,
    status: 'running'
  };
  jobs.set(jobId, job);

  const result = await runDecompilation(resolvedInputs, resolvedOutputDir, options);
  const logExcerpt = trimLog([result.stdout, result.stderr].filter(Boolean).join('\n'));

  if (result.exitCode !== 0) {
    job.status = 'failed';
    job.logExcerpt = logExcerpt;
    job.error = `Decompilation failed with exit code ${result.exitCode}.`;

    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: [
            job.error,
            `Job: ${jobId}`,
            `Output: ${resolvedOutputDir}`,
            logExcerpt ? `Log excerpt:\n${logExcerpt}` : ''
          ]
            .filter(Boolean)
            .join('\n')
        }
      ]
    };
  }

  const summary = summarizeDirectory(resolvedOutputDir);
  job.status = 'completed';
  job.totalFiles = summary.totalFiles;
  job.totalDirectories = summary.totalDirectories;
  job.sampleFiles = summary.sampleFiles;
  job.logExcerpt = logExcerpt;

  return {
    content: [
      {
        type: 'text',
        text: formatSummaryText(job, summary)
      }
    ],
    structuredContent: {
      job_id: job.id,
      status: job.status,
      output_dir: job.outputDir,
      input_paths: job.inputPaths,
      total_files: summary.totalFiles,
      total_directories: summary.totalDirectories,
      top_level_entries: summary.topLevelEntries,
      sample_files: summary.sampleFiles,
      log_excerpt: job.logExcerpt || ''
    }
  };
}

const server = new McpServer({
  name: 'wedecode-mcp',
  version: pkg.version || '0.0.0'
});

server.registerTool(
  'scan_local_miniapps',
  {
    title: 'Scan local miniapps',
    description:
      'Scan local WeChat and WXWork cache locations, list installed mini program packages, and return a scan_id for later selection.',
    inputSchema: {
      patterns: z.array(z.string().min(1)).optional(),
      limit: z.number().int().min(1).max(MAX_SCAN_LIMIT).optional(),
      resolve_names: z.boolean().optional(),
      include_wxwork: z.boolean().optional()
    }
  },
  async ({ patterns, limit, resolve_names, include_wxwork }) => {
    try {
      const scan = await createMiniappScan({
        patterns,
        limit,
        resolveNames: resolve_names,
        includeWxwork: include_wxwork
      });

      return {
        content: [
          {
            type: 'text',
            text: formatScanText(scan)
          }
        ],
        structuredContent: {
          scan_id: scan.id,
          created_at: scan.createdAt,
          resolve_names: scan.resolveNames,
          patterns: scan.patterns,
          items: scan.items.map((item, index) => ({
            index: index + 1,
            item_id: item.itemId,
            display_name: item.displayName,
            appid: item.appid || null,
            nickname: item.nickname || null,
            username: item.username || null,
            source: item.source,
            package_path: item.packagePath,
            modified_at: item.modifiedAt,
            size: item.size
          }))
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: 'text', text: message }]
      };
    }
  }
);

server.registerTool(
  'decompile_packages',
  {
    title: 'Decompile wxapkg packages',
    description:
      'Decompile one or more local wxapkg files or directories into a local output directory.',
    inputSchema: {
      input_paths: z.array(z.string().min(1)).min(1),
      output_dir: z.string().min(1).optional(),
      use_px: z.boolean().optional(),
      unpack_only: z.boolean().optional(),
      wxid: z.string().min(1).optional()
    }
  },
  async ({ input_paths, output_dir, use_px, unpack_only, wxid }) => {
    try {
      return await executeDecompileRequest({
        inputPaths: input_paths,
        outputDir: output_dir,
        usePx: use_px,
        unpackOnly: unpack_only,
        wxid
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: 'text', text: message }]
      };
    }
  }
);

server.registerTool(
  'decompile_scanned_miniapp',
  {
    title: 'Decompile scanned miniapp',
    description:
      'Pick one mini program from a previous scan_local_miniapps result by scan_id and index/item_id, then decompile it.',
    inputSchema: {
      scan_id: z.string().min(1),
      index: z.number().int().min(1).optional(),
      item_id: z.string().min(1).optional(),
      output_dir: z.string().min(1).optional(),
      use_px: z.boolean().optional(),
      unpack_only: z.boolean().optional(),
      wxid: z.string().min(1).optional()
    }
  },
  async ({ scan_id, index, item_id, output_dir, use_px, unpack_only, wxid }) => {
    try {
      const item = getScannedItem(scan_id, index, item_id);
      const result = await executeDecompileRequest({
        inputPaths: [item.packagePath],
        outputDir: output_dir,
        usePx: use_px,
        unpackOnly: unpack_only,
        wxid: wxid || item.appid
      });

      if (!result.isError && result.structuredContent) {
        result.structuredContent = {
          ...result.structuredContent,
          scan_id,
          selected_item: {
            item_id: item.itemId,
            display_name: item.displayName,
            appid: item.appid || null,
            package_path: item.packagePath,
            source: item.source
          }
        };
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: 'text', text: message }]
      };
    }
  }
);

server.registerTool(
  'list_jobs',
  {
    title: 'List decompilation jobs',
    description: 'List jobs created in the current Wedecode MCP server session.',
    inputSchema: {}
  },
  async () => {
    const allJobs = Array.from(jobs.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((job) => ({
        job_id: job.id,
        status: job.status,
        created_at: job.createdAt,
        output_dir: job.outputDir,
        input_paths: job.inputPaths,
        total_files: job.totalFiles ?? null,
        total_directories: job.totalDirectories ?? null,
        error: job.error ?? null
      }));

    return {
      content: [
        {
          type: 'text',
          text: allJobs.length
            ? JSON.stringify(allJobs, null, 2)
            : 'No jobs recorded in this server session.'
        }
      ],
      structuredContent: {
        jobs: allJobs
      }
    };
  }
);

server.registerTool(
  'list_output_files',
  {
    title: 'List output files',
    description: 'List generated files for a previous decompilation job or an explicit output directory.',
    inputSchema: {
      job_id: z.string().min(1).optional(),
      output_dir: z.string().min(1).optional(),
      sample_limit: z.number().int().min(1).max(1000).optional()
    }
  },
  async ({ job_id, output_dir, sample_limit }) => {
    try {
      const rootDir = resolveOutputRoot(job_id, output_dir);
      const summary = summarizeDirectory(rootDir, sample_limit || DEFAULT_SAMPLE_LIMIT);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(summary, null, 2)
          }
        ],
        structuredContent: {
          output_dir: summary.outputDir,
          total_files: summary.totalFiles,
          total_directories: summary.totalDirectories,
          top_level_entries: summary.topLevelEntries,
          sample_files: summary.sampleFiles,
          sample_truncated: summary.sampleTruncated
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: 'text', text: message }]
      };
    }
  }
);

server.registerTool(
  'read_output_file',
  {
    title: 'Read output file',
    description:
      'Read a generated file from a previous decompilation job or an explicit output directory.',
    inputSchema: {
      job_id: z.string().min(1).optional(),
      output_dir: z.string().min(1).optional(),
      relative_path: z.string().min(1),
      max_chars: z.number().int().min(1).max(MAX_READ_CHARS).optional()
    }
  },
  async ({ job_id, output_dir, relative_path, max_chars }) => {
    try {
      const rootDir = resolveOutputRoot(job_id, output_dir);
      const fullPath = resolveChildPath(rootDir, relative_path);

      if (!fs.existsSync(fullPath)) {
        throw new Error(`File does not exist: ${fullPath}`);
      }

      const stats = fs.statSync(fullPath);
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${fullPath}`);
      }

      const limit = max_chars || DEFAULT_READ_CHARS;
      const buffer = fs.readFileSync(fullPath);
      const binary = isProbablyBinary(buffer);

      if (binary) {
        const truncatedBuffer = buffer.subarray(0, limit);
        const base64 = truncatedBuffer.toString('base64');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  output_dir: rootDir,
                  relative_path,
                  full_path: fullPath,
                  size: stats.size,
                  is_binary: true,
                  truncated: truncatedBuffer.length < buffer.length,
                  encoding: 'base64',
                  content: base64
                },
                null,
                2
              )
            }
          ],
          structuredContent: {
            output_dir: rootDir,
            relative_path,
            full_path: fullPath,
            size: stats.size,
            is_binary: true,
            truncated: truncatedBuffer.length < buffer.length,
            encoding: 'base64',
            content: base64
          }
        };
      }

      const text = buffer.toString('utf8');
      const truncatedText = text.length > limit ? text.slice(0, limit) : text;

      return {
        content: [
          {
            type: 'text',
            text: truncatedText
          }
        ],
        structuredContent: {
          output_dir: rootDir,
          relative_path,
          full_path: fullPath,
          size: stats.size,
          is_binary: false,
          truncated: truncatedText.length < text.length,
          encoding: 'utf8',
          content: truncatedText
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: 'text', text: message }]
      };
    }
  }
);

async function main(): Promise<void> {
  ensureDirectory(DEFAULT_OUTPUT_ROOT);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`Wedecode MCP ready. Output root: ${DEFAULT_OUTPUT_ROOT}`);
}

main().catch((error) => {
  console.error('Wedecode MCP failed to start:', error);
  process.exit(1);
});

process.stdin.on('close', () => {
  void server.close();
});
