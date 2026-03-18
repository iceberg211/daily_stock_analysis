import type React from 'react';
import { useMemo, useRef, useState } from 'react';
import { getParsedApiError, type ParsedApiError } from '../../api/error';
import { systemConfigApi } from '../../api/systemConfig';
import type { SystemConfigItem } from '../../types/systemConfig';
import { ApiErrorAlert, Button, ConfirmDialog } from '../common';
import { EnvImportPreviewCard } from './EnvImportPreviewCard';
import { SettingsAlert } from './SettingsAlert';
import {
  MAX_ENV_IMPORT_BYTES,
  buildCurrentEnvValueMap,
  buildEnvPreview,
  buildImportConfirmMessage,
  formatBytes,
  type EnvPreviewSummary,
} from './envImportUtils';

interface SettingsHeaderActionsCardProps {
  hasDirty: boolean;
  dirtyCount: number;
  isLoading: boolean;
  isSaving: boolean;
  saveError: ParsedApiError | null;
  retryAction: 'load' | 'save' | null;
  onRetry: () => unknown;
  onResetDraft: () => void;
  onSaveDraft: () => unknown;
  onReloadAfterImport: () => Promise<void>;
  serverItems: SystemConfigItem[];
}

export const SettingsHeaderActionsCard: React.FC<SettingsHeaderActionsCardProps> = ({
  hasDirty,
  dirtyCount,
  isLoading,
  isSaving,
  saveError,
  retryAction,
  onRetry,
  onResetDraft,
  onSaveDraft,
  onReloadAfterImport,
  serverItems,
}) => {
  const envInputRef = useRef<HTMLInputElement | null>(null);
  const [isExportingEnv, setIsExportingEnv] = useState(false);
  const [isImportingEnv, setIsImportingEnv] = useState(false);
  const [backupBeforeImport, setBackupBeforeImport] = useState(true);
  const [reloadAfterImport, setReloadAfterImport] = useState(true);
  const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);
  const [pendingImportSummary, setPendingImportSummary] = useState<EnvPreviewSummary | null>(null);
  const [envActionSuccess, setEnvActionSuccess] = useState<string>('');
  const [envActionError, setEnvActionError] = useState<ParsedApiError | null>(null);

  const currentEnvValueMap = useMemo(() => {
    return buildCurrentEnvValueMap(serverItems);
  }, [serverItems]);

  const clearEnvActionState = () => {
    setEnvActionSuccess('');
    setEnvActionError(null);
  };

  const downloadBlobFile = (blob: Blob, filename: string) => {
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  };

  const handleExportEnv = async () => {
    setIsExportingEnv(true);
    clearEnvActionState();

    try {
      const { blob, filename } = await systemConfigApi.exportEnv();
      const safeName = filename || '.env';
      downloadBlobFile(blob, safeName);
      setEnvActionSuccess(`已导出配置文件：${safeName}（${formatBytes(blob.size)}）`);
    } catch (error: unknown) {
      setEnvActionError(getParsedApiError(error));
    } finally {
      setIsExportingEnv(false);
    }
  };

  const handleSelectEnvFile = () => {
    if (isImportingEnv || isSaving || isLoading) {
      return;
    }
    envInputRef.current?.click();
  };

  const handleImportEnv: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const selectedFile = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!selectedFile) {
      return;
    }

    clearEnvActionState();
    if (selectedFile.size > MAX_ENV_IMPORT_BYTES) {
      setPendingImportSummary(null);
      setEnvActionError({
        title: '导入文件过大',
        message: `文件大小为 ${formatBytes(selectedFile.size)}，超过限制 ${formatBytes(MAX_ENV_IMPORT_BYTES)}。`,
        rawMessage: 'env file too large',
        category: 'http_error',
        status: 400,
      });
      return;
    }

    try {
      const content = await selectedFile.text();
      const summary = buildEnvPreview(selectedFile, content, currentEnvValueMap);
      setPendingImportSummary(summary);
      setIsImportConfirmOpen(true);
    } catch (error: unknown) {
      setPendingImportSummary(null);
      setEnvActionError(getParsedApiError(error));
    }
  };

  const handleRequestImport = () => {
    if (!pendingImportSummary) {
      return;
    }
    setIsImportConfirmOpen(true);
  };

  const handleConfirmImport = async () => {
    if (!pendingImportSummary) {
      return;
    }

    setIsImportConfirmOpen(false);
    setIsImportingEnv(true);
    let backupFilename = '';

    try {
      if (backupBeforeImport) {
        const backup = await systemConfigApi.exportEnv();
        backupFilename = backup.filename || '.env.backup';
        downloadBlobFile(backup.blob, backupFilename);
      }

      const result = await systemConfigApi.importEnv(pendingImportSummary.file, reloadAfterImport);
      await onReloadAfterImport();

      const warningText = result.warnings?.length
        ? `；警告：${result.warnings.join('；')}`
        : '';
      const backupText = backupFilename ? `；已自动备份：${backupFilename}` : '';
      const reloadText = reloadAfterImport ? '已触发运行时重载' : '未触发运行时重载';
      setEnvActionSuccess(
        `已导入配置文件（${result.importedLineCount} 行，${formatBytes(result.importedByteSize)}，${reloadText}）${backupText}${warningText}`
      );
      setPendingImportSummary(null);
    } catch (error: unknown) {
      setEnvActionError(getParsedApiError(error));
    } finally {
      setIsImportingEnv(false);
    }
  };

  return (
    <div className="mb-5 rounded-xl bg-card/50 px-5 py-5 shadow-soft-card-strong">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">系统设置</h1>
          <p className="text-xs leading-6 text-muted-text">
            统一管理模型、数据源、通知、安全认证与导入能力。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="settings-secondary"
            onClick={() => void handleExportEnv()}
            disabled={isLoading || isSaving || isExportingEnv || isImportingEnv}
            isLoading={isExportingEnv}
            loadingText="导出中..."
          >
            导出 .env
          </Button>
          <Button
            type="button"
            variant="settings-secondary"
            onClick={handleSelectEnvFile}
            disabled={isLoading || isSaving || isImportingEnv || isExportingEnv}
          >
            选择 .env
          </Button>
          <Button
            type="button"
            variant="settings-secondary"
            onClick={handleRequestImport}
            disabled={isLoading || isSaving || isImportingEnv || isExportingEnv || !pendingImportSummary}
            isLoading={isImportingEnv}
            loadingText="导入中..."
          >
            导入已选文件
          </Button>
          <Button
            type="button"
            variant="settings-secondary"
            onClick={onResetDraft}
            disabled={isLoading || isSaving}
          >
            重置
          </Button>
          <Button
            type="button"
            variant="settings-primary"
            onClick={() => void onSaveDraft()}
            disabled={!hasDirty || isSaving || isLoading}
            isLoading={isSaving}
            loadingText="保存中..."
          >
            {isSaving ? '保存中...' : `保存配置${dirtyCount ? ` (${dirtyCount})` : ''}`}
          </Button>
        </div>
      </div>

      <input
        ref={envInputRef}
        type="file"
        accept=".env,text/plain"
        className="hidden"
        onChange={handleImportEnv}
      />

      {saveError ? (
        <ApiErrorAlert
          className="mt-3"
          error={saveError}
          actionLabel={retryAction === 'save' ? '重试保存' : undefined}
          onAction={retryAction === 'save' ? () => void onRetry() : undefined}
        />
      ) : null}
      {envActionError ? <ApiErrorAlert className="mt-3" error={envActionError} /> : null}
      {envActionSuccess ? (
        <div className="mt-3">
          <SettingsAlert title="配置文件操作成功" message={envActionSuccess} variant="success" />
        </div>
      ) : null}
      {pendingImportSummary ? (
        <EnvImportPreviewCard
          summary={pendingImportSummary}
          backupBeforeImport={backupBeforeImport}
          reloadAfterImport={reloadAfterImport}
          onChangeBackupBeforeImport={setBackupBeforeImport}
          onChangeReloadAfterImport={setReloadAfterImport}
          onClearPendingFile={() => setPendingImportSummary(null)}
          disabled={isImportingEnv}
        />
      ) : null}

      <ConfirmDialog
        isOpen={isImportConfirmOpen && Boolean(pendingImportSummary)}
        title="确认导入 .env"
        message={pendingImportSummary ? buildImportConfirmMessage(pendingImportSummary, backupBeforeImport, reloadAfterImport) : ''}
        confirmText="确认导入"
        cancelText="取消"
        isDanger
        onConfirm={() => void handleConfirmImport()}
        onCancel={() => setIsImportConfirmOpen(false)}
      />
    </div>
  );
};
