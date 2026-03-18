import type { SystemConfigItem } from '../../types/systemConfig';

export const MAX_ENV_IMPORT_BYTES = 512 * 1024;
const ENV_ASSIGNMENT_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/;
const SENSITIVE_KEY_PATTERN = /(?:API_KEY|PASSWORD|TOKEN|SECRET|PRIVATE_KEY|ACCESS_KEY)/;
const RECOMMENDED_ENV_KEYS = [
  'STOCK_LIST',
  'AIHUBMIX_KEY',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
];

export type EnvPreviewSummary = {
  file: File;
  byteSize: number;
  totalLines: number;
  assignmentLines: number;
  commentLines: number;
  blankLines: number;
  importedKeyCount: number;
  unchangedCount: number;
  addedKeys: string[];
  changedKeys: string[];
  removedKeys: string[];
  changedSensitiveKeys: string[];
  duplicateKeys: string[];
  missingRecommendedKeys: string[];
};

type EnvParsedResult = {
  valueMap: Record<string, string>;
  duplicateKeys: string[];
  assignmentLines: number;
  commentLines: number;
  blankLines: number;
};

export function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function parseEnvContent(text: string): EnvParsedResult {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let assignmentLines = 0;
  let commentLines = 0;
  let blankLines = 0;
  const seenKeys = new Set<string>();
  const duplicateKeys = new Set<string>();
  const valueMap: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      blankLines += 1;
      continue;
    }

    if (trimmed.startsWith('#')) {
      commentLines += 1;
      continue;
    }

    const matched = trimmed.match(ENV_ASSIGNMENT_PATTERN);
    if (matched?.[1]) {
      assignmentLines += 1;
      const key = matched[1].toUpperCase();
      valueMap[key] = trimmed.slice(trimmed.indexOf('=') + 1);
      if (seenKeys.has(key)) {
        duplicateKeys.add(key);
      } else {
        seenKeys.add(key);
      }
    }
  }

  return {
    valueMap,
    duplicateKeys: [...duplicateKeys].sort(),
    assignmentLines,
    commentLines,
    blankLines,
  };
}

export function buildCurrentEnvValueMap(serverItems: SystemConfigItem[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of serverItems) {
    if (!item.rawValueExists) {
      continue;
    }
    map[item.key.toUpperCase()] = item.value;
  }
  return map;
}

export function buildEnvPreview(file: File, text: string, currentMap: Record<string, string>): EnvPreviewSummary {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const parsed = parseEnvContent(text);
  const importedKeys = Object.keys(parsed.valueMap).sort();
  const currentKeys = Object.keys(currentMap).sort();

  const addedKeys = importedKeys.filter((key) => !(key in currentMap));
  const changedKeys = importedKeys.filter((key) => key in currentMap && currentMap[key] !== parsed.valueMap[key]);
  const removedKeys = currentKeys.filter((key) => !(key in parsed.valueMap));
  const unchangedCount = Math.max(importedKeys.length - addedKeys.length - changedKeys.length, 0);
  const missingRecommendedKeys = RECOMMENDED_ENV_KEYS.filter((key) => !(key in parsed.valueMap));
  const changedSensitiveKeys = changedKeys.filter((key) => SENSITIVE_KEY_PATTERN.test(key));

  return {
    file,
    byteSize: file.size,
    totalLines: lines.length,
    assignmentLines: parsed.assignmentLines,
    commentLines: parsed.commentLines,
    blankLines: parsed.blankLines,
    importedKeyCount: importedKeys.length,
    unchangedCount,
    addedKeys,
    changedKeys,
    removedKeys,
    changedSensitiveKeys,
    duplicateKeys: parsed.duplicateKeys,
    missingRecommendedKeys,
  };
}

export function buildImportConfirmMessage(
  summary: EnvPreviewSummary,
  backupBeforeImport: boolean,
  reloadAfterImport: boolean
): string {
  const segments = [
    `文件：${summary.file.name}`,
    `大小：${formatBytes(summary.byteSize)}`,
    `总行数：${summary.totalLines}`,
    `配置键：${summary.assignmentLines}`,
    `导入键数：${summary.importedKeyCount}`,
    `新增：${summary.addedKeys.length}`,
    `修改：${summary.changedKeys.length}`,
    `删除：${summary.removedKeys.length}`,
  ];

  if (summary.duplicateKeys.length) {
    segments.push(`重复键：${summary.duplicateKeys.slice(0, 5).join(', ')}`);
  }
  if (summary.missingRecommendedKeys.length) {
    segments.push(`缺少常见键：${summary.missingRecommendedKeys.slice(0, 5).join(', ')}`);
  }
  if (summary.changedSensitiveKeys.length) {
    segments.push(`涉及敏感键变更：${summary.changedSensitiveKeys.slice(0, 5).join(', ')}`);
  }
  if (backupBeforeImport) {
    segments.push('将先自动导出当前配置备份，再覆盖导入');
  }
  if (!reloadAfterImport) {
    segments.push('导入后不会立即重载运行时配置');
  }

  return `将覆盖当前 .env 配置。${segments.join('；')}。请确认继续。`;
}
