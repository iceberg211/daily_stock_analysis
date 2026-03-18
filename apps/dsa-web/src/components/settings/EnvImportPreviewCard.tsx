import type React from 'react';
import { Button, Checkbox } from '../common';
import type { EnvPreviewSummary } from './envImportUtils';
import { formatBytes } from './envImportUtils';

interface EnvImportPreviewCardProps {
  summary: EnvPreviewSummary;
  backupBeforeImport: boolean;
  reloadAfterImport: boolean;
  onChangeBackupBeforeImport: (checked: boolean) => void;
  onChangeReloadAfterImport: (checked: boolean) => void;
  onClearPendingFile: () => void;
  disabled?: boolean;
}

export const EnvImportPreviewCard: React.FC<EnvImportPreviewCardProps> = ({
  summary,
  backupBeforeImport,
  reloadAfterImport,
  onChangeBackupBeforeImport,
  onChangeReloadAfterImport,
  onClearPendingFile,
  disabled = false,
}) => {
  return (
    <div className="mt-3 rounded-xl border border-[rgba(0,212,255,0.2)] bg-[rgba(0,212,255,0.06)] p-3">
      <p className="text-sm font-semibold text-foreground">待导入文件：{summary.file.name}</p>
      <p className="mt-1 text-xs text-muted-text">
        大小 {formatBytes(summary.byteSize)}，共 {summary.totalLines} 行，配置键 {summary.assignmentLines}，
        注释 {summary.commentLines}，空行 {summary.blankLines}
      </p>
      <p className="mt-2 text-xs text-muted-text">
        变更预览：新增 {summary.addedKeys.length}，修改 {summary.changedKeys.length}，
        删除 {summary.removedKeys.length}，不变 {summary.unchangedCount}
      </p>

      {summary.addedKeys.length ? (
        <p className="mt-2 text-xs text-success">
          新增键：{summary.addedKeys.slice(0, 8).join(', ')}
        </p>
      ) : null}
      {summary.changedKeys.length ? (
        <p className="mt-2 text-xs text-warning">
          修改键：{summary.changedKeys.slice(0, 8).join(', ')}
        </p>
      ) : null}
      {summary.removedKeys.length ? (
        <p className="mt-2 text-xs text-danger">
          删除键：{summary.removedKeys.slice(0, 8).join(', ')}
        </p>
      ) : null}
      {summary.duplicateKeys.length ? (
        <p className="mt-2 text-xs text-warning">
          检测到重复键：{summary.duplicateKeys.slice(0, 8).join(', ')}
        </p>
      ) : null}
      {summary.missingRecommendedKeys.length ? (
        <p className="mt-2 text-xs text-warning">
          文件未包含常见关键项：{summary.missingRecommendedKeys.slice(0, 8).join(', ')}
        </p>
      ) : null}
      {summary.changedSensitiveKeys.length ? (
        <p className="mt-2 text-xs text-danger">
          敏感键变更：{summary.changedSensitiveKeys.slice(0, 8).join(', ')}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Checkbox
          checked={backupBeforeImport}
          onChange={(event) => onChangeBackupBeforeImport(event.target.checked)}
          label="导入前自动导出当前 .env 备份"
          containerClassName="!gap-2"
        />
        <Checkbox
          checked={reloadAfterImport}
          onChange={(event) => onChangeReloadAfterImport(event.target.checked)}
          label="导入后立即重载运行时配置"
          containerClassName="!gap-2"
        />
        <Button
          type="button"
          variant="settings-secondary"
          size="sm"
          onClick={onClearPendingFile}
          disabled={disabled}
        >
          清除已选文件
        </Button>
      </div>
    </div>
  );
};
