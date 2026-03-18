import type React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '../SettingsPage';

const {
  load,
  clearToast,
  setActiveCategory,
  save,
  resetDraft,
  setDraftValue,
  applyPartialUpdate,
  refreshAfterExternalSave,
  refreshStatus,
  exportEnv,
  importEnv,
  useAuthMock,
  useSystemConfigMock,
} = vi.hoisted(() => ({
  load: vi.fn(),
  clearToast: vi.fn(),
  setActiveCategory: vi.fn(),
  save: vi.fn(),
  resetDraft: vi.fn(),
  setDraftValue: vi.fn(),
  applyPartialUpdate: vi.fn(),
  refreshAfterExternalSave: vi.fn(),
  refreshStatus: vi.fn(),
  exportEnv: vi.fn(),
  importEnv: vi.fn(),
  useAuthMock: vi.fn(),
  useSystemConfigMock: vi.fn(),
}));

vi.mock('../../hooks', () => ({
  useAuth: () => useAuthMock(),
  useSystemConfig: () => useSystemConfigMock(),
}));

vi.mock('../../api/systemConfig', () => ({
  systemConfigApi: {
    exportEnv: () => exportEnv(),
    importEnv: (file: File, reloadNow: boolean) => importEnv(file, reloadNow),
  },
}));

vi.mock('../../components/settings', () => ({
  AuthSettingsCard: () => <div>认证与登录保护</div>,
  ChangePasswordCard: () => <div>修改密码</div>,
  IntelligentImport: ({ onMerged }: { onMerged: (value: string) => void }) => (
    <button type="button" onClick={() => onMerged('SZ000001,SZ000002')}>
      merge stock list
    </button>
  ),
  LLMChannelEditor: ({
    onSaved,
  }: {
    onSaved: (items: Array<{ key: string; value: string }>) => void;
  }) => (
    <button
      type="button"
      onClick={() => onSaved([{ key: 'LLM_CHANNELS', value: 'primary,backup' }])}
    >
      save llm channels
    </button>
  ),
  SettingsAlert: ({ title, message }: { title: string; message: string }) => (
    <div>
      {title}:{message}
    </div>
  ),
  SettingsCategoryNav: ({
    categories,
    activeCategory,
    onSelect,
  }: {
    categories: Array<{ category: string; title: string }>;
    activeCategory: string;
    onSelect: (value: string) => void;
  }) => (
    <nav>
      {categories.map((category) => (
        <button
          key={category.category}
          type="button"
          aria-pressed={activeCategory === category.category}
          onClick={() => onSelect(category.category)}
        >
          {category.title}
        </button>
      ))}
    </nav>
  ),
  SettingsField: ({ item }: { item: { key: string } }) => <div>{item.key}</div>,
  SettingsLoading: () => <div>loading</div>,
  SettingsSectionCard: ({
    title,
    description,
    children,
  }: {
    title: string;
    description?: string;
    children: React.ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
    </section>
  ),
}));

const baseCategories = [
  { category: 'system', title: 'System', description: '系统设置', displayOrder: 1, fields: [] },
  { category: 'base', title: 'Base', description: '基础配置', displayOrder: 2, fields: [] },
  { category: 'ai_model', title: 'AI', description: '模型配置', displayOrder: 3, fields: [] },
];

type ConfigState = {
  categories: Array<{ category: string; title: string; description: string; displayOrder: number; fields: [] }>;
  itemsByCategory: Record<string, Array<Record<string, unknown>>>;
  serverItems: Array<Record<string, unknown>>;
  issueByKey: Record<string, unknown[]>;
  activeCategory: string;
  setActiveCategory: typeof setActiveCategory;
  hasDirty: boolean;
  dirtyCount: number;
  toast: null;
  clearToast: typeof clearToast;
  isLoading: boolean;
  isSaving: boolean;
  loadError: null;
  saveError: null;
  retryAction: null;
  load: typeof load;
  retry: ReturnType<typeof vi.fn>;
  save: typeof save;
  resetDraft: typeof resetDraft;
  setDraftValue: typeof setDraftValue;
  applyPartialUpdate: typeof applyPartialUpdate;
  refreshAfterExternalSave: typeof refreshAfterExternalSave;
  configVersion: string;
  maskToken: string;
};

type ConfigOverride = Partial<ConfigState>;

function buildSystemConfigState(overrides: ConfigOverride = {}) {
  const itemsByCategory = {
    system: [
      {
        key: 'ADMIN_AUTH_ENABLED',
        value: 'true',
        rawValueExists: true,
        isMasked: false,
        schema: {
          key: 'ADMIN_AUTH_ENABLED',
          category: 'system',
          dataType: 'boolean',
          uiControl: 'switch',
          isSensitive: false,
          isRequired: false,
          isEditable: true,
          options: [],
          validation: {},
          displayOrder: 1,
        },
      },
    ],
    base: [
      {
        key: 'STOCK_LIST',
        value: 'SH600000',
        rawValueExists: true,
        isMasked: false,
        schema: {
          key: 'STOCK_LIST',
          category: 'base',
          dataType: 'string',
          uiControl: 'textarea',
          isSensitive: false,
          isRequired: false,
          isEditable: true,
          options: [],
          validation: {},
          displayOrder: 1,
        },
      },
    ],
    ai_model: [
      {
        key: 'LLM_CHANNELS',
        value: 'primary',
        rawValueExists: true,
        isMasked: false,
        schema: {
          key: 'LLM_CHANNELS',
          category: 'ai_model',
          dataType: 'string',
          uiControl: 'textarea',
          isSensitive: false,
          isRequired: false,
          isEditable: true,
          options: [],
          validation: {},
          displayOrder: 1,
        },
      },
    ],
  } as Record<string, Array<Record<string, unknown>>>;
  const serverItems = Object.values(itemsByCategory).flat();

  return {
    categories: baseCategories,
    itemsByCategory,
    serverItems,
    issueByKey: {},
    activeCategory: 'system',
    setActiveCategory,
    hasDirty: false,
    dirtyCount: 0,
    toast: null,
    clearToast,
    isLoading: false,
    isSaving: false,
    loadError: null,
    saveError: null,
    retryAction: null,
    load,
    retry: vi.fn(),
    save,
    resetDraft,
    setDraftValue,
    applyPartialUpdate,
    refreshAfterExternalSave,
    configVersion: 'v1',
    maskToken: '******',
    ...overrides,
  };
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exportEnv.mockResolvedValue({
      blob: new Blob(['STOCK_LIST=600519'], { type: 'text/plain' }),
      filename: '.env',
    });
    importEnv.mockResolvedValue({
      success: true,
      configVersion: 'v2',
      reloadTriggered: true,
      importedLineCount: 1,
      importedByteSize: 17,
      warnings: [],
    });
    Object.defineProperty(window, 'confirm', {
      writable: true,
      value: vi.fn(() => true),
    });
    Object.defineProperty(window.URL, 'createObjectURL', {
      writable: true,
      value: vi.fn(() => 'blob:test-url'),
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      writable: true,
      value: vi.fn(() => undefined),
    });
    useAuthMock.mockReturnValue({
      authEnabled: true,
      passwordChangeable: true,
      refreshStatus,
    });
    useSystemConfigMock.mockReturnValue(buildSystemConfigState());
  });

  it('renders category navigation and auth settings modules', async () => {
    render(<SettingsPage />);

    expect(await screen.findByRole('heading', { name: '系统设置' })).toBeInTheDocument();
    expect(screen.getByText('认证与登录保护')).toBeInTheDocument();
    expect(screen.getByText('修改密码')).toBeInTheDocument();
    expect(load).toHaveBeenCalled();
  });

  it('resets local drafts from the page header button', () => {
    useSystemConfigMock.mockReturnValue(buildSystemConfigState({ hasDirty: true, dirtyCount: 2 }));

    render(<SettingsPage />);

    // Clear the initial load call from useEffect
    vi.clearAllMocks();

    fireEvent.click(screen.getByRole('button', { name: '重置' }));

    // Reset should call resetDraft and NOT call load
    expect(resetDraft).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();
  });

  it('reset button semantic: discards local changes without network request', () => {
    // Simulate user has unsaved drafts
    const dirtyState = buildSystemConfigState({
      hasDirty: true,
      dirtyCount: 2,
    });

    useSystemConfigMock.mockReturnValue(dirtyState);

    render(<SettingsPage />);

    // Clear initial useEffect load call
    vi.clearAllMocks();

    // Click reset button
    fireEvent.click(screen.getByRole('button', { name: '重置' }));

    // Verify semantic: reset should only discard local changes
    // It should NOT trigger a network load
    expect(resetDraft).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('refreshes server state after intelligent import merges stock list', async () => {
    useSystemConfigMock.mockReturnValue(buildSystemConfigState({ activeCategory: 'base' }));

    render(<SettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'merge stock list' }));

    expect(refreshAfterExternalSave).toHaveBeenCalledWith(['STOCK_LIST']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('refreshes server state after llm channel editor saves', async () => {
    useSystemConfigMock.mockReturnValue(buildSystemConfigState({ activeCategory: 'ai_model' }));

    render(<SettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'save llm channels' }));

    expect(refreshAfterExternalSave).toHaveBeenCalledWith(['LLM_CHANNELS']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('exports env file from header action button', async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: '导出 .env' }));

    await waitFor(() => {
      expect(exportEnv).toHaveBeenCalledTimes(1);
    });
  });

  it('imports env file and reloads config', async () => {
    const { container } = render(<SettingsPage />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const file = new File(['STOCK_LIST=300750\n'], 'backup.env', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText('待导入文件：backup.env');

    fireEvent.click(screen.getByRole('button', { name: '导入已选文件' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认导入' }));

    await waitFor(() => {
      expect(importEnv).toHaveBeenCalledTimes(1);
    });
    expect(importEnv).toHaveBeenCalledWith(file, true);
    expect(exportEnv).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
