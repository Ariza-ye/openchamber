import React from 'react';
import { RiRestartLine, RiInformationLine } from '@remixicon/react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import type { ThemeMode } from '@/types/theme';
import { useUIStore } from '@/stores/useUIStore';
import { useMessageQueueStore } from '@/stores/messageQueueStore';
import { cn, getModifierLabel } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { NumberInput } from '@/components/ui/number-input';
import { Radio } from '@/components/ui/radio';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { isDesktopShell, isVSCodeRuntime, isWebRuntime } from '@/lib/desktop';
import { useDeviceInfo } from '@/lib/device';
import { usePwaDetection } from '@/hooks/usePwaDetection';
import { updateDesktopSettings } from '@/lib/persistence';
import {
    setDirectoryShowHidden,
    useDirectoryShowHidden,
} from '@/lib/directoryShowHidden';

interface Option<T extends string> {
    id: T;
    label: string;
    description?: string;
}

const THEME_MODE_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
    {
        value: 'system',
        label: 'System',
    },
    {
        value: 'light',
        label: 'Light',
    },
    {
        value: 'dark',
        label: 'Dark',
    },
];

const DIFF_LAYOUT_OPTIONS: Option<'dynamic' | 'inline' | 'side-by-side'>[] = [
    {
        id: 'dynamic',
        label: 'Dynamic',
        description: 'New inline, modified side-by-side.',
    },
    {
        id: 'inline',
        label: 'Always inline',
        description: 'Show as a single unified view.',
    },
    {
        id: 'side-by-side',
        label: 'Always side-by-side',
        description: 'Compare original and modified files.',
    },
];

const DIFF_VIEW_MODE_OPTIONS: Option<'single' | 'stacked'>[] = [
    {
        id: 'single',
        label: 'Single file',
        description: 'Show one file at a time.',
    },
    {
        id: 'stacked',
        label: 'All files',
        description: 'Stack all changed files together.',
    },
];

const MERMAID_RENDERING_OPTIONS: Option<'svg' | 'ascii'>[] = [
    {
        id: 'svg',
        label: 'SVG',
        description: '将图表渲染为可缩放图形。',
    },
    {
        id: 'ascii',
        label: 'ASCII',
        description: '将图表渲染为文本块。',
    },
];

const DEFAULT_PWA_INSTALL_NAME = 'OpenChamber - AI Coding Assistant';

type PwaInstallNameWindow = Window & {
    __OPENCHAMBER_SET_PWA_INSTALL_NAME__?: (value: string) => string;
    __OPENCHAMBER_UPDATE_PWA_MANIFEST__?: () => void;
};

const USER_MESSAGE_RENDERING_OPTIONS: Option<'markdown' | 'plain'>[] = [
    {
        id: 'markdown',
        label: 'Markdown',
        description: '使用 markdown 格式渲染用户文本。',
    },
    {
        id: 'plain',
        label: '纯文本',
        description: '渲染用户文本，保留空格和链接。',
    },
];

const CHAT_RENDER_MODE_OPTIONS: Option<'sorted' | 'live'>[] = [
    {
        id: 'sorted',
        label: '排序',
        description: '渲染已完成的助手消息，不进行实时流式传输。',
    },
    {
        id: 'live',
        label: '实时',
        description: '在助手文本和工具到达时进行流式传输。',
    },
];

const ACTIVITY_RENDER_MODE_OPTIONS: Option<'collapsed' | 'summary'>[] = [
    {
        id: 'collapsed',
        label: '折叠',
        description: '默认保持活动折叠。',
    },
    {
        id: 'summary',
        label: '展开',
        description: '默认展开活动。',
    },
];

const normalizeUserMessageRenderingMode = (mode: unknown): 'markdown' | 'plain' => {
    return mode === 'markdown' ? 'markdown' : 'plain';
};

export type VisibleSetting = 'theme' | 'pwaInstallName' | 'fontSize' | 'terminalFontSize' | 'spacing' | 'inputBarOffset' | 'mermaidRendering' | 'userMessageRendering' | 'chatRenderMode' | 'activityRenderMode' | 'stickyUserHeader' | 'diffLayout' | 'mobileStatusBar' | 'dotfiles' | 'reasoning' | 'showToolFileIcons' | 'expandedTools' | 'queueMode' | 'terminalQuickKeys' | 'persistDraft' | 'inputSpellcheck' | 'reportUsage';

interface OpenChamberVisualSettingsProps {
    /** Which settings to show. If undefined, shows all. */
    visibleSettings?: VisibleSetting[];
}

export const OpenChamberVisualSettings: React.FC<OpenChamberVisualSettingsProps> = ({ visibleSettings }) => {
    const { isMobile } = useDeviceInfo();
    const { browserTab } = usePwaDetection();
    const directoryShowHidden = useDirectoryShowHidden();
    const showReasoningTraces = useUIStore(state => state.showReasoningTraces);
    const setShowReasoningTraces = useUIStore(state => state.setShowReasoningTraces);

    const mermaidRenderingMode = useUIStore(state => state.mermaidRenderingMode);
    const setMermaidRenderingMode = useUIStore(state => state.setMermaidRenderingMode);
    const userMessageRenderingMode = useUIStore(state => state.userMessageRenderingMode);
    const setUserMessageRenderingMode = useUIStore(state => state.setUserMessageRenderingMode);
    const stickyUserHeader = useUIStore(state => state.stickyUserHeader);
    const setStickyUserHeader = useUIStore(state => state.setStickyUserHeader);
    const chatRenderMode = useUIStore(state => state.chatRenderMode);
    const setChatRenderMode = useUIStore(state => state.setChatRenderMode);
    const activityRenderMode = useUIStore(state => state.activityRenderMode);
    const setActivityRenderMode = useUIStore(state => state.setActivityRenderMode);
    const fontSize = useUIStore(state => state.fontSize);
    const setFontSize = useUIStore(state => state.setFontSize);
    const terminalFontSize = useUIStore(state => state.terminalFontSize);
    const setTerminalFontSize = useUIStore(state => state.setTerminalFontSize);
    const padding = useUIStore(state => state.padding);
    const setPadding = useUIStore(state => state.setPadding);
    const inputBarOffset = useUIStore(state => state.inputBarOffset);
    const setInputBarOffset = useUIStore(state => state.setInputBarOffset);
    const diffLayoutPreference = useUIStore(state => state.diffLayoutPreference);
    const setDiffLayoutPreference = useUIStore(state => state.setDiffLayoutPreference);
    const diffViewMode = useUIStore(state => state.diffViewMode);
    const setDiffViewMode = useUIStore(state => state.setDiffViewMode);
    const showTerminalQuickKeysOnDesktop = useUIStore(state => state.showTerminalQuickKeysOnDesktop);
    const setShowTerminalQuickKeysOnDesktop = useUIStore(state => state.setShowTerminalQuickKeysOnDesktop);
    const queueModeEnabled = useMessageQueueStore(state => state.queueModeEnabled);
    const setQueueMode = useMessageQueueStore(state => state.setQueueMode);
    const persistChatDraft = useUIStore(state => state.persistChatDraft);
    const setPersistChatDraft = useUIStore(state => state.setPersistChatDraft);
    const inputSpellcheckEnabled = useUIStore(state => state.inputSpellcheckEnabled);
    const setInputSpellcheckEnabled = useUIStore(state => state.setInputSpellcheckEnabled);
    const showToolFileIcons = useUIStore(state => state.showToolFileIcons);
    const setShowToolFileIcons = useUIStore(state => state.setShowToolFileIcons);
    const showExpandedBashTools = useUIStore(state => state.showExpandedBashTools);
    const setShowExpandedBashTools = useUIStore(state => state.setShowExpandedBashTools);
    const showExpandedEditTools = useUIStore(state => state.showExpandedEditTools);
    const setShowExpandedEditTools = useUIStore(state => state.setShowExpandedEditTools);
    const showMobileSessionStatusBar = useUIStore(state => state.showMobileSessionStatusBar);
    const setShowMobileSessionStatusBar = useUIStore(state => state.setShowMobileSessionStatusBar);
    const isSettingsDialogOpen = useUIStore(state => state.isSettingsDialogOpen);
    const {
        themeMode,
        setThemeMode,
        availableThemes,
        customThemesLoading,
        reloadCustomThemes,
        lightThemeId,
        darkThemeId,
        setLightThemePreference,
        setDarkThemePreference,
    } = useThemeSystem();

    const [themesReloading, setThemesReloading] = React.useState(false);
    const [chatRenderPreviewTick, setChatRenderPreviewTick] = React.useState(0);
    const reportUsage = useUIStore(state => state.reportUsage);
    const setReportUsage = useUIStore(state => state.setReportUsage);

    // Sync reportUsage changes to server settings
    const handleReportUsageChange = React.useCallback((enabled: boolean) => {
        setReportUsage(enabled);
        void updateDesktopSettings({ reportUsage: enabled });
    }, [setReportUsage]);

    const shouldAnimateChatPreview = isSettingsDialogOpen
        && (visibleSettings ? visibleSettings.includes('chatRenderMode') : true);

    React.useEffect(() => {
        if (!shouldAnimateChatPreview) {
            return;
        }

        // Use requestAnimationFrame for smoother animation without setInterval overhead
        let rafId: number | null = null;
        let lastTime = Date.now();
        
        const tick = () => {
            const now = Date.now();
            // Update every ~420ms
            if (now - lastTime >= 420) {
                setChatRenderPreviewTick((prev) => (prev + 1) % 24);
                lastTime = now;
            }
            rafId = requestAnimationFrame(tick);
        };
        
        // Only run when visible
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
            rafId = requestAnimationFrame(tick);
        }
        
        const onVisibility = () => {
            if (document.visibilityState === 'visible' && rafId === null) {
                rafId = requestAnimationFrame(tick);
            } else if (document.visibilityState !== 'visible' && rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        };
        
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
        };
    }, [shouldAnimateChatPreview]);

    const handleUserMessageRenderingModeChange = React.useCallback((mode: 'markdown' | 'plain') => {
        setUserMessageRenderingMode(mode);
        void updateDesktopSettings({ userMessageRenderingMode: mode });
    }, [setUserMessageRenderingMode]);

    const handleStickyUserHeaderChange = React.useCallback((enabled: boolean) => {
        setStickyUserHeader(enabled);
        void updateDesktopSettings({ stickyUserHeader: enabled });
    }, [setStickyUserHeader]);

    const handleInputSpellcheckChange = React.useCallback((enabled: boolean) => {
        setInputSpellcheckEnabled(enabled);
        void updateDesktopSettings({ inputSpellcheckEnabled: enabled });
    }, [setInputSpellcheckEnabled]);

    const handleChatRenderModeChange = React.useCallback((mode: 'sorted' | 'live') => {
        setChatRenderMode(mode);
        void updateDesktopSettings({ chatRenderMode: mode });
    }, [setChatRenderMode]);

    const handleActivityRenderModeChange = React.useCallback((mode: 'collapsed' | 'summary') => {
        setActivityRenderMode(mode);
        void updateDesktopSettings({ activityRenderMode: mode });
    }, [setActivityRenderMode]);

    const handleMermaidRenderingModeChange = React.useCallback((mode: 'svg' | 'ascii') => {
        setMermaidRenderingMode(mode);
        void updateDesktopSettings({ mermaidRenderingMode: mode });
    }, [setMermaidRenderingMode]);

    const handleShowToolFileIconsChange = React.useCallback((enabled: boolean) => {
        setShowToolFileIcons(enabled);
        void updateDesktopSettings({ showToolFileIcons: enabled });
    }, [setShowToolFileIcons]);

    const handleShowExpandedBashToolsChange = React.useCallback((enabled: boolean) => {
        setShowExpandedBashTools(enabled);
        void updateDesktopSettings({ showExpandedBashTools: enabled });
    }, [setShowExpandedBashTools]);

    const handleShowExpandedEditToolsChange = React.useCallback((enabled: boolean) => {
        setShowExpandedEditTools(enabled);
        void updateDesktopSettings({ showExpandedEditTools: enabled });
    }, [setShowExpandedEditTools]);

    const lightThemes = React.useMemo(
        () => availableThemes
            .filter((theme) => theme.metadata.variant === 'light')
            .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)),
        [availableThemes],
    );

    const darkThemes = React.useMemo(
        () => availableThemes
            .filter((theme) => theme.metadata.variant === 'dark')
            .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)),
        [availableThemes],
    );

    const selectedLightTheme = React.useMemo(
        () => lightThemes.find((theme) => theme.metadata.id === lightThemeId) ?? lightThemes[0],
        [lightThemes, lightThemeId],
    );

    const selectedDarkTheme = React.useMemo(
        () => darkThemes.find((theme) => theme.metadata.id === darkThemeId) ?? darkThemes[0],
        [darkThemes, darkThemeId],
    );

    const formatThemeLabel = React.useCallback((themeName: string, variant: 'light' | 'dark') => {
        const suffix = variant === 'dark' ? ' Dark' : ' Light';
        return themeName.endsWith(suffix) ? themeName.slice(0, -suffix.length) : themeName;
    }, []);

    const shouldShow = (setting: VisibleSetting): boolean => {
        if (!visibleSettings) return true;
        return visibleSettings.includes(setting);
    };

    const isVSCode = isVSCodeRuntime();
    const hasAppearanceSettings = (shouldShow('theme') || shouldShow('pwaInstallName')) && !isVSCode;
    const hasLayoutSettings = shouldShow('fontSize') || shouldShow('terminalFontSize') || shouldShow('spacing') || shouldShow('inputBarOffset');
    const hasNavigationSettings = shouldShow('terminalQuickKeys') && !isMobile;
    const hasBehaviorSettings = shouldShow('mermaidRendering')
        || shouldShow('userMessageRendering')
        || shouldShow('chatRenderMode')
        || (shouldShow('activityRenderMode') && chatRenderMode === 'sorted')
        || shouldShow('stickyUserHeader')
        || shouldShow('diffLayout')
        || (shouldShow('mobileStatusBar') && isMobile)
        || shouldShow('dotfiles')
        || shouldShow('reasoning')
        || shouldShow('queueMode')
        || shouldShow('persistDraft')
        || shouldShow('showToolFileIcons')
        || shouldShow('expandedTools')
        || (!isMobile && shouldShow('inputSpellcheck'));

    const showPwaInstallNameSetting = shouldShow('pwaInstallName') && isWebRuntime() && browserTab && !isDesktopShell() && !isVSCode;
    const [pwaInstallName, setPwaInstallName] = React.useState('');

    const applyPwaInstallName = React.useCallback(async (value: string) => {
        if (typeof window === 'undefined') {
            return;
        }

        const win = window as PwaInstallNameWindow;
        const normalized = value.trim().replace(/\s+/g, ' ').slice(0, 64);
        const persistedValue = normalized;

        await updateDesktopSettings({ pwaAppName: persistedValue });

        if (typeof win.__OPENCHAMBER_SET_PWA_INSTALL_NAME__ === 'function') {
            const resolved = win.__OPENCHAMBER_SET_PWA_INSTALL_NAME__(persistedValue);
            setPwaInstallName(resolved);
            return;
        }

        setPwaInstallName(persistedValue || DEFAULT_PWA_INSTALL_NAME);
        win.__OPENCHAMBER_UPDATE_PWA_MANIFEST__?.();
    }, []);

    React.useEffect(() => {
        if (typeof window === 'undefined' || !showPwaInstallNameSetting) {
            return;
        }

        let cancelled = false;

        const loadPwaInstallName = async () => {
            try {
                const response = await fetch('/api/config/settings', {
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                    cache: 'no-store',
                });

                if (!response.ok) {
                    if (!cancelled) {
                        setPwaInstallName(DEFAULT_PWA_INSTALL_NAME);
                    }
                    return;
                }

                const settings = await response.json().catch(() => ({}));
                const raw = typeof settings?.pwaAppName === 'string' ? settings.pwaAppName : '';
                const normalized = raw.trim().replace(/\s+/g, ' ').slice(0, 64);

                if (!cancelled) {
                    setPwaInstallName(normalized || DEFAULT_PWA_INSTALL_NAME);
                }
            } catch {
                if (!cancelled) {
                    setPwaInstallName(DEFAULT_PWA_INSTALL_NAME);
                }
            }
        };

        void loadPwaInstallName();

        return () => {
            cancelled = true;
        };
    }, [showPwaInstallNameSetting]);

    return (
        <div className="space-y-8">

                {/* --- Appearance & Themes --- */}
                {hasAppearanceSettings && (
                    <div className="mb-8 space-y-3">
                        <section className="px-2 pb-2 pt-0 space-y-0.5">

                            <div className="pb-1.5">
                                <div className="flex min-w-0 flex-col gap-1.5">
                                    <span className="typography-ui-header font-medium text-foreground">颜色模式</span>
                                    <div className="flex flex-wrap items-center gap-1">
                                        {THEME_MODE_OPTIONS.map((option) => (
                                            <Button
                                                key={option.value}
                                                variant="outline"
                                                size="xs"
                                                className={cn(
                                                    '!font-normal',
                                                    themeMode === option.value
                                                        ? 'border-[var(--primary-base)] text-[var(--primary-base)] bg-[var(--primary-base)]/10 hover:text-[var(--primary-base)]'
                                                        : 'text-foreground'
                                                )}
                                                onClick={() => setThemeMode(option.value)}
                                            >
                                                {option.label}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-2 grid grid-cols-1 gap-2 py-1.5 md:grid-cols-[14rem_auto] md:gap-x-8 md:gap-y-2">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="typography-ui-label text-foreground shrink-0">浅色主题</span>
                                    <Select value={selectedLightTheme?.metadata.id ?? ''} onValueChange={setLightThemePreference}>
                                        <SelectTrigger aria-label="选择浅色主题" className="w-fit">
                                            <SelectValue placeholder="选择主题" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {lightThemes.map((theme) => (
                                                <SelectItem key={theme.metadata.id} value={theme.metadata.id}>
                                                    {formatThemeLabel(theme.metadata.name, 'light')}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="typography-ui-label text-foreground shrink-0">深色主题</span>
                                    <Select value={selectedDarkTheme?.metadata.id ?? ''} onValueChange={setDarkThemePreference}>
                                        <SelectTrigger aria-label="选择深色主题" className="w-fit">
                                            <SelectValue placeholder="选择主题" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {darkThemes.map((theme) => (
                                                <SelectItem key={theme.metadata.id} value={theme.metadata.id}>
                                                    {formatThemeLabel(theme.metadata.name, 'dark')}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 py-1.5">
                                <button
                                    type="button"
                                    disabled={customThemesLoading || themesReloading}
                                    onClick={() => {
                                        const startedAt = Date.now();
                                        setThemesReloading(true);
                                        void reloadCustomThemes().finally(() => {
                                            const elapsed = Date.now() - startedAt;
                                            if (elapsed < 500) {
                                                window.setTimeout(() => {
                                                    setThemesReloading(false);
                                                }, 500 - elapsed);
                                                return;
                                            }
                                            setThemesReloading(false);
                                        });
                                    }}
                                    className="inline-flex items-center typography-ui-label font-normal text-foreground underline decoration-[1px] underline-offset-2 hover:text-foreground/80 disabled:cursor-not-allowed disabled:text-muted-foreground/60"
                                >
                                    {themesReloading ? '重新加载主题...' : '重新加载主题'}
                                </button>
                                <Tooltip delayDuration={700}>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            className="flex items-center justify-center rounded-md p-1 text-muted-foreground/70 hover:text-foreground"
                                            aria-label="主题导入信息"
                                        >
                                            <RiInformationLine className="h-3.5 w-3.5" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent sideOffset={8}>
                                        Import custom themes from ~/.config/openchamber/themes/
                                    </TooltipContent>
                                </Tooltip>
                            </div>

                            {showPwaInstallNameSetting && (
                                <div className="py-1.5 space-y-1.5">
                                    <div className="flex min-w-0 flex-col">
                                        <span className="typography-ui-label text-foreground">安装应用名称</span>
                                        <span className="typography-meta text-muted-foreground">用于 PWA 安装过程。</span>
                                    </div>
                                    <div className="flex w-full max-w-[28rem] items-center gap-2">
                                        <Input
                                            value={pwaInstallName}
                                            onChange={(event) => {
                                                setPwaInstallName(event.target.value);
                                            }}
                                            onBlur={() => {
                                                void applyPwaInstallName(pwaInstallName);
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    void applyPwaInstallName(pwaInstallName);
                                                }
                                            }}
                                            className="h-7"
                                            maxLength={64}
                                            aria-label="PWA 安装应用名称"
                                        />
                                        <Button size="sm"
                                            type="button"
                                            variant="ghost"
                                            onClick={() => {
                                                setPwaInstallName(DEFAULT_PWA_INSTALL_NAME);
                                                void applyPwaInstallName('');
                                            }}
                                            className="h-7 w-7 px-0 text-muted-foreground hover:text-foreground"
                                            aria-label="重置安装应用名称"
                                            title="Reset"
                                        >
                                            <RiRestartLine className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>
                )}

                {/* --- UI Scaling & Layout --- */}
                {hasLayoutSettings && (
                    <div className="mb-8 space-y-3">
                        <section className="p-2 space-y-0.5">
                            <h4 className="typography-ui-header font-medium text-foreground">间距与布局</h4>
                            <div className="pl-2">

                            {shouldShow('fontSize') && !isMobile && (
                                <div className="flex items-center gap-8 py-1">
                                    <div className="flex min-w-0 flex-col w-56 shrink-0">
                                        <span className="typography-ui-label text-foreground">界面字体大小</span>
                                    </div>
                                    <div className="flex items-center gap-2 w-fit">
                                        <NumberInput
                                            value={fontSize}
                                            onValueChange={setFontSize}
                                            min={50}
                                            max={200}
                                            step={5}
                                            aria-label="字体大小百分比"
                                            className="w-16"
                                        />
                                        <Button size="sm"
                                            type="button"
                                            variant="ghost"
                                            onClick={() => setFontSize(100)}
                                            disabled={fontSize === 100}
                                            className="h-7 w-7 px-0 text-muted-foreground hover:text-foreground"
                                            aria-label="重置字体大小"
                                            title="Reset"
                                        >
                                            <RiRestartLine className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {shouldShow('terminalFontSize') && (
                                <div className={cn("py-1", isMobile ? "flex flex-col gap-3" : "flex items-center gap-8")}>
                                    <div className={cn("flex min-w-0 flex-col", isMobile ? "w-full" : "w-56 shrink-0")}>
                                        <span className="typography-ui-label text-foreground">终端字体大小</span>
                                    </div>
                                    <div className={cn("flex items-center gap-2", isMobile ? "w-full" : "w-fit")}>
                                        <NumberInput
                                            value={terminalFontSize}
                                            onValueChange={setTerminalFontSize}
                                            min={9}
                                            max={52}
                                            step={1}
                                            className="w-16"
                                        />
                                        <Button size="sm"
                                            type="button"
                                            variant="ghost"
                                            onClick={() => setTerminalFontSize(13)}
                                            disabled={terminalFontSize === 13}
                                            className="h-7 w-7 px-0 text-muted-foreground hover:text-foreground"
                                            aria-label="重置终端字体大小"
                                            title="Reset"
                                        >
                                            <RiRestartLine className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {shouldShow('spacing') && (
                                <div className={cn("py-1", isMobile ? "flex flex-col gap-3" : "flex items-center gap-8")}>
                                    <div className={cn("flex min-w-0 flex-col", isMobile ? "w-full" : "w-56 shrink-0")}>
                                        <span className="typography-ui-label text-foreground">间距密度</span>
                                    </div>
                                    <div className={cn("flex items-center gap-2", isMobile ? "w-full" : "w-fit")}>
                                        <NumberInput
                                            value={padding}
                                            onValueChange={setPadding}
                                            min={50}
                                            max={200}
                                            step={5}
                                            className="w-16"
                                        />
                                        <Button size="sm"
                                            type="button"
                                            variant="ghost"
                                            onClick={() => setPadding(100)}
                                            disabled={padding === 100}
                                            className="h-7 w-7 px-0 text-muted-foreground hover:text-foreground"
                                            aria-label="重置间距"
                                            title="Reset"
                                        >
                                            <RiRestartLine className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {shouldShow('inputBarOffset') && (
                                <div className={cn("py-1", isMobile ? "flex flex-col gap-3" : "flex items-center gap-8")}>
                                    <div className={cn("flex min-w-0 flex-col", isMobile ? "w-full" : "w-56 shrink-0")}>
                                        <div className="flex items-center gap-1.5">
                                            <span className="typography-ui-label text-foreground">输入栏偏移</span>
                                            <Tooltip delayDuration={1000}>
                                                <TooltipTrigger asChild>
                                                    <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                                                </TooltipTrigger>
                                                <TooltipContent sideOffset={8} className="max-w-xs">
                                                    Raise input bar to avoid OS-level screen obstructions like home bars.
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>
                                    </div>
                                    <div className={cn("flex items-center gap-2", isMobile ? "w-full" : "w-fit")}>
                                        <NumberInput
                                            value={inputBarOffset}
                                            onValueChange={setInputBarOffset}
                                            min={0}
                                            max={100}
                                            step={5}
                                            className="w-16"
                                        />
                                        <Button size="sm"
                                            type="button"
                                            variant="ghost"
                                            onClick={() => setInputBarOffset(0)}
                                            disabled={inputBarOffset === 0}
                                            className="h-7 w-7 px-0 text-muted-foreground hover:text-foreground"
                                            aria-label="重置输入栏偏移"
                                            title="Reset"
                                        >
                                            <RiRestartLine className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            </div>

                        </section>
                    </div>
                )}

                {/* --- Navigation --- */}
                {hasNavigationSettings && (
                    <div className="space-y-3">
                        <section className="px-2 pb-2 pt-0">
                            <h4 className="typography-ui-header font-medium text-foreground">导航</h4>
                            {shouldShow('terminalQuickKeys') && !isMobile && (
                                <div
                                    className="group flex cursor-pointer items-center gap-2 py-1.5"
                                    role="button"
                                    tabIndex={0}
                                    aria-pressed={showTerminalQuickKeysOnDesktop}
                                    onClick={() => setShowTerminalQuickKeysOnDesktop(!showTerminalQuickKeysOnDesktop)}
                                    onKeyDown={(event) => {
                                        if (event.key === ' ' || event.key === 'Enter') {
                                            event.preventDefault();
                                            setShowTerminalQuickKeysOnDesktop(!showTerminalQuickKeysOnDesktop);
                                        }
                                    }}
                                >
                                    <Checkbox
                                        checked={showTerminalQuickKeysOnDesktop}
                                        onChange={setShowTerminalQuickKeysOnDesktop}
                                        ariaLabel="终端快捷键"
                                    />
                                    <div className="flex min-w-0 items-center gap-1.5">
                                        <span className="typography-ui-label text-foreground">终端快捷键</span>
                                        <Tooltip delayDuration={1000}>
                                            <TooltipTrigger asChild>
                                                <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent sideOffset={8} className="max-w-xs">
                                                Show Esc, Ctrl, Arrows in terminal view
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>
                )}

                {hasBehaviorSettings && (
                    <div className="space-y-3">



                            {(shouldShow('userMessageRendering') || shouldShow('mermaidRendering') || shouldShow('chatRenderMode') || (shouldShow('activityRenderMode') && chatRenderMode === 'sorted') || (shouldShow('diffLayout') && !isVSCode)) && (
                                <div className="grid grid-cols-1 gap-y-2 md:grid-cols-[minmax(0,16rem)_minmax(0,16rem)] md:justify-start md:gap-x-2">
                                    {shouldShow('chatRenderMode') && (
                                        <section className="p-2 md:col-span-2">
                                            <h4 className="typography-ui-header font-medium text-foreground">聊天渲染模式</h4>
                                            <div role="radiogroup" aria-label="聊天渲染模式" className="mt-1 grid w-full max-w-[26rem] grid-cols-1 gap-3 sm:grid-cols-2">
                                                {CHAT_RENDER_MODE_OPTIONS.map((option) => {
                                                    const selected = chatRenderMode === option.id;
                                                    const previewPhase = chatRenderPreviewTick % 12;
                                                    return (
                                                        <button
                                                            key={option.id}
                                                            type="button"
                                                            onClick={() => handleChatRenderModeChange(option.id)}
                                                            aria-pressed={selected}
                                                            className={cn(
                                                                'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                                                                selected
                                                                    ? 'border-primary bg-primary/5'
                                                                    : 'border-border hover:border-border/80 hover:bg-muted/50'
                                                            )}
                                                        >
                                                            <span className={cn('typography-ui-label', selected ? 'text-foreground' : 'text-muted-foreground')}>
                                                                {option.label}
                                                            </span>
                                                            <div className="mt-2 w-full rounded-md border border-border/60 bg-muted/30 p-2">
                                                                {option.id === 'live' ? (
                                                                    <div className="space-y-1.5">
                                                                        {[0, 1, 2].map((index) => {
                                                                            const rowStart = index * 3 + 1;
                                                                            const rowProgressPhase = previewPhase - rowStart + 1;
                                                                            const rowProgress = rowProgressPhase <= 0
                                                                                ? 0
                                                                                : rowProgressPhase === 1
                                                                                    ? 42
                                                                                    : rowProgressPhase === 2
                                                                                        ? 68
                                                                                        : 92;
                                                                            const visible = rowProgress > 0;
                                                                            return (
                                                                                <div
                                                                                    key={index}
                                                                                    className={cn(
                                                                                        'flex items-center gap-1.5 transition-all duration-300 motion-reduce:transition-none',
                                                                                        visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
                                                                                    )}
                                                                                >
                                                                                    <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/55" />
                                                                                    <span
                                                                                        className="h-1.5 rounded bg-muted-foreground/30 transition-all duration-300 motion-reduce:transition-none"
                                                                                        style={{ width: `${rowProgress}%` }}
                                                                                    />
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                ) : (
                                                                    <div className="space-y-1.5">
                                                                        {[0, 1, 2].map((index) => {
                                                                            const visible = previewPhase >= (index + 1) * 3;
                                                                            return (
                                                                                <div
                                                                                    key={index}
                                                                                    className={cn(
                                                                                        'flex items-center gap-1.5 transition-all duration-300 motion-reduce:transition-none',
                                                                                        visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
                                                                                    )}
                                                                                >
                                                                                    <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/55" />
                                                                                    <span
                                                                                        className="h-1.5 rounded bg-muted-foreground/30"
                                                                                        style={{ width: '92%' }}
                                                                                    />
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    )}

                                    {shouldShow('activityRenderMode') && chatRenderMode === 'sorted' && (
                                        <section className="p-2 md:col-span-2">
                                            <h4 className="typography-ui-header font-medium text-foreground">活动默认</h4>
                                            <div role="radiogroup" aria-label="活动默认模式" className="mt-0.5 space-y-0">
                                                {ACTIVITY_RENDER_MODE_OPTIONS.map((option) => {
                                                    const selected = activityRenderMode === option.id;
                                                    return (
                                                        <div
                                                            key={option.id}
                                                            role="button"
                                                            tabIndex={0}
                                                            aria-pressed={selected}
                                                            onClick={() => handleActivityRenderModeChange(option.id)}
                                                            onKeyDown={(event) => {
                                                                if (event.key === ' ' || event.key === 'Enter') {
                                                                    event.preventDefault();
                                                                    handleActivityRenderModeChange(option.id);
                                                                }
                                                            }}
                                                            className="flex w-full items-center gap-2 py-0 text-left"
                                                        >
                                                            <Radio
                                                                checked={selected}
                                                                onChange={() => handleActivityRenderModeChange(option.id)}
                                                                ariaLabel={`Activity default mode: ${option.label}`}
                                                            />
                                                            <span className={cn('typography-ui-label font-normal', selected ? 'text-foreground' : 'text-foreground/50')}>
                                                                {option.label}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    )}

                                    {shouldShow('expandedTools') && (
                                        <section className="p-2 md:col-span-2 space-y-0.5">
                                            <div className="typography-ui-header font-medium text-foreground py-1.5">默认显示打开的工具：</div>

                                            <div
                                                className="group flex cursor-pointer items-center gap-2 py-0.5"
                                                role="button"
                                                tabIndex={0}
                                                aria-pressed={showExpandedBashTools}
                                                onClick={() => handleShowExpandedBashToolsChange(!showExpandedBashTools)}
                                                onKeyDown={(event) => {
                                                    if (event.key === ' ' || event.key === 'Enter') {
                                                        event.preventDefault();
                                                        handleShowExpandedBashToolsChange(!showExpandedBashTools);
                                                    }
                                                }}
                                            >
                                                <Checkbox
                                                    checked={showExpandedBashTools}
                                                    onChange={handleShowExpandedBashToolsChange}
                                                    ariaLabel="显示展开的 bash 工具"
                                                />
                                                <span className="typography-ui-label text-foreground">Bash</span>
                                            </div>

                                            <div
                                                className="group flex cursor-pointer items-center gap-2 py-0.5"
                                                role="button"
                                                tabIndex={0}
                                                aria-pressed={showExpandedEditTools}
                                                onClick={() => handleShowExpandedEditToolsChange(!showExpandedEditTools)}
                                                onKeyDown={(event) => {
                                                    if (event.key === ' ' || event.key === 'Enter') {
                                                        event.preventDefault();
                                                        handleShowExpandedEditToolsChange(!showExpandedEditTools);
                                                    }
                                                }}
                                            >
                                                <Checkbox
                                                    checked={showExpandedEditTools}
                                                    onChange={handleShowExpandedEditToolsChange}
                                                    ariaLabel="显示展开的编辑工具"
                                                />
                                                <span className="typography-ui-label text-foreground">编辑工具</span>
                                            </div>
                                        </section>
                                    )}

                                    {shouldShow('userMessageRendering') && (
                                        <section className="p-2">
                                            <h4 className="typography-ui-header font-medium text-foreground">用户消息渲染</h4>
                                            <div role="radiogroup" aria-label="用户消息渲染模式" className="mt-0.5 space-y-0">
                                                {USER_MESSAGE_RENDERING_OPTIONS.map((option) => {
                                                    const selected = normalizeUserMessageRenderingMode(userMessageRenderingMode) === option.id;
                                                    return (
                                                        <div
                                                            key={option.id}
                                                            role="button"
                                                            tabIndex={0}
                                                            aria-pressed={selected}
                                                            onClick={() => handleUserMessageRenderingModeChange(option.id)}
                                                            onKeyDown={(event) => {
                                                                if (event.key === ' ' || event.key === 'Enter') {
                                                                    event.preventDefault();
                                                                    handleUserMessageRenderingModeChange(option.id);
                                                                }
                                                            }}
                                                            className="flex w-full items-center gap-2 py-0 text-left"
                                                        >
                                                            <Radio
                                                                checked={selected}
                                                                onChange={() => handleUserMessageRenderingModeChange(option.id)}
                                                                ariaLabel={`User message rendering: ${option.label}`}
                                                            />
                                                            <span className={cn('typography-ui-label font-normal', selected ? 'text-foreground' : 'text-foreground/50')}>
                                                                {option.label}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    )}

                                    {shouldShow('mermaidRendering') && (
                                        <section className="p-2">
                                            <h4 className="typography-ui-header font-medium text-foreground">Mermaid 渲染</h4>
                                            <div role="radiogroup" aria-label="Mermaid 渲染模式" className="mt-0.5 space-y-0">
                                                {MERMAID_RENDERING_OPTIONS.map((option) => {
                                                    const selected = mermaidRenderingMode === option.id;
                                                    return (
                                                        <div
                                                            key={option.id}
                                                            role="button"
                                                            tabIndex={0}
                                                            aria-pressed={selected}
                                                            onClick={() => handleMermaidRenderingModeChange(option.id)}
                                                            onKeyDown={(event) => {
                                                                if (event.key === ' ' || event.key === 'Enter') {
                                                                    event.preventDefault();
                                                                    handleMermaidRenderingModeChange(option.id);
                                                                }
                                                            }}
                                                            className="flex w-full items-center gap-2 py-0 text-left"
                                                        >
                                                            <Radio
                                                                checked={selected}
                                                                onChange={() => handleMermaidRenderingModeChange(option.id)}
                                                                ariaLabel={`Mermaid rendering: ${option.label}`}
                                                            />
                                                            <span className={cn('typography-ui-label font-normal', selected ? 'text-foreground' : 'text-foreground/50')}>
                                                                {option.label}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    )}

                                    {shouldShow('diffLayout') && !isVSCode && (
                                        <section className="p-2">
                                            <h4 className="typography-ui-header font-medium text-foreground">差异布局</h4>
                                            <div role="radiogroup" aria-label="差异布局" className="mt-0.5 space-y-0">
                                                {DIFF_LAYOUT_OPTIONS.map((option) => {
                                                    const selected = diffLayoutPreference === option.id;
                                                    return (
                                                        <div
                                                            key={option.id}
                                                            role="button"
                                                            tabIndex={0}
                                                            aria-pressed={selected}
                                                            onClick={() => setDiffLayoutPreference(option.id)}
                                                            onKeyDown={(event) => {
                                                                if (event.key === ' ' || event.key === 'Enter') {
                                                                    event.preventDefault();
                                                                    setDiffLayoutPreference(option.id);
                                                                }
                                                            }}
                                                            className="flex w-full items-center gap-2 py-0 text-left"
                                                        >
                                                            <Radio
                                                                checked={selected}
                                                                onChange={() => setDiffLayoutPreference(option.id)}
                                                                ariaLabel={`Diff layout: ${option.label}`}
                                                            />
                                                            <span className={cn('typography-ui-label font-normal', selected ? 'text-foreground' : 'text-foreground/50')}>
                                                                {option.label}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    )}

                                    {shouldShow('diffLayout') && !isVSCode && (
                                        <section className="p-2">
                                            <h4 className="typography-ui-header font-medium text-foreground">差异视图模式</h4>
                                            <div role="radiogroup" aria-label="差异视图模式" className="mt-0.5 space-y-0">
                                                {DIFF_VIEW_MODE_OPTIONS.map((option) => {
                                                    const selected = diffViewMode === option.id;
                                                    return (
                                                        <div
                                                            key={option.id}
                                                            role="button"
                                                            tabIndex={0}
                                                            aria-pressed={selected}
                                                            onClick={() => setDiffViewMode(option.id)}
                                                            onKeyDown={(event) => {
                                                                if (event.key === ' ' || event.key === 'Enter') {
                                                                    event.preventDefault();
                                                                    setDiffViewMode(option.id);
                                                                }
                                                            }}
                                                            className="flex w-full items-center gap-2 py-0 text-left"
                                                        >
                                                            <Radio
                                                                checked={selected}
                                                                onChange={() => setDiffViewMode(option.id)}
                                                                ariaLabel={`Diff view mode: ${option.label}`}
                                                            />
                                                            <span className={cn('typography-ui-label font-normal', selected ? 'text-foreground' : 'text-foreground/50')}>
                                                                {option.label}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    )}
                                </div>
                            )}

                            {(shouldShow('stickyUserHeader') || (shouldShow('mobileStatusBar') && isMobile) || shouldShow('dotfiles') || shouldShow('queueMode') || shouldShow('persistDraft') || shouldShow('showToolFileIcons') || (!isMobile && shouldShow('inputSpellcheck')) || shouldShow('reasoning')) && (
                                <section className="p-2 space-y-0.5">
                                    {shouldShow('reasoning') && (
                                        <div
                                            className="group flex cursor-pointer items-center gap-2 py-0.5"
                                            role="button"
                                            tabIndex={0}
                                            aria-pressed={showReasoningTraces}
                                            onClick={() => setShowReasoningTraces(!showReasoningTraces)}
                                            onKeyDown={(event) => {
                                                if (event.key === ' ' || event.key === 'Enter') {
                                                    event.preventDefault();
                                                    setShowReasoningTraces(!showReasoningTraces);
                                                }
                                            }}
                                        >
                                            <Checkbox
                                                checked={showReasoningTraces}
                                                onChange={setShowReasoningTraces}
                                                ariaLabel="显示推理轨迹"
                                            />
                                            <span className="typography-ui-label text-foreground">显示推理轨迹</span>
                                        </div>
                                    )}

                                    {shouldShow('stickyUserHeader') && (
                                        <div
                                            className="group flex cursor-pointer items-center gap-2 py-0.5"
                                            role="button"
                                            tabIndex={0}
                                            aria-pressed={stickyUserHeader}
                                            onClick={() => handleStickyUserHeaderChange(!stickyUserHeader)}
                                            onKeyDown={(event) => {
                                                if (event.key === ' ' || event.key === 'Enter') {
                                                    event.preventDefault();
                                                    handleStickyUserHeaderChange(!stickyUserHeader);
                                                }
                                            }}
                                        >
                                            <Checkbox
                                                checked={stickyUserHeader}
                                                onChange={handleStickyUserHeaderChange}
                                                ariaLabel="固定用户标题"
                                            />
                                            <span className="typography-ui-label text-foreground">固定用户标题</span>
                                        </div>
                                    )}

                                    {shouldShow('showToolFileIcons') && (
                                        <div
                                            className="group flex cursor-pointer items-center gap-2 py-0.5"
                                            role="button"
                                            tabIndex={0}
                                            aria-pressed={showToolFileIcons}
                                            onClick={() => handleShowToolFileIconsChange(!showToolFileIcons)}
                                            onKeyDown={(event) => {
                                                if (event.key === ' ' || event.key === 'Enter') {
                                                    event.preventDefault();
                                                    handleShowToolFileIconsChange(!showToolFileIcons);
                                                }
                                            }}
                                        >
                                            <Checkbox
                                                checked={showToolFileIcons}
                                                onChange={handleShowToolFileIconsChange}
                                                ariaLabel="显示工具文件图标"
                                            />
                                            <span className="typography-ui-label text-foreground">显示工具文件图标</span>
                                        </div>
                                    )}

                                    {shouldShow('mobileStatusBar') && isMobile && (
                                        <div
                                            className="group flex cursor-pointer items-center gap-2 py-0.5"
                                            role="button"
                                            tabIndex={0}
                                            aria-pressed={showMobileSessionStatusBar}
                                            onClick={() => setShowMobileSessionStatusBar(!showMobileSessionStatusBar)}
                                            onKeyDown={(event) => {
                                                if (event.key === ' ' || event.key === 'Enter') {
                                                    event.preventDefault();
                                                    setShowMobileSessionStatusBar(!showMobileSessionStatusBar);
                                                }
                                            }}
                                        >
                                            <Checkbox
                                                checked={showMobileSessionStatusBar}
                                                onChange={setShowMobileSessionStatusBar}
                                                ariaLabel="显示移动状态栏"
                                            />
                                            <span className="typography-ui-label text-foreground">显示移动状态栏</span>
                                        </div>
                                    )}

                                    {shouldShow('dotfiles') && !isVSCodeRuntime() && (
                                        <div
                                            className="group flex cursor-pointer items-center gap-2 py-0.5"
                                            role="button"
                                            tabIndex={0}
                                            aria-pressed={directoryShowHidden}
                                            onClick={() => setDirectoryShowHidden(!directoryShowHidden)}
                                            onKeyDown={(event) => {
                                                if (event.key === ' ' || event.key === 'Enter') {
                                                    event.preventDefault();
                                                    setDirectoryShowHidden(!directoryShowHidden);
                                                }
                                            }}
                                        >
                                            <Checkbox
                                                checked={directoryShowHidden}
                                                onChange={setDirectoryShowHidden}
                                                ariaLabel="显示点文件"
                                            />
                                            <span className="typography-ui-label text-foreground">显示点文件</span>
                                        </div>
                                    )}

                                    {shouldShow('queueMode') && (
                                        <div
                                            className="group flex cursor-pointer items-center gap-2 py-0.5"
                                            role="button"
                                            tabIndex={0}
                                            aria-pressed={queueModeEnabled}
                                            onClick={() => setQueueMode(!queueModeEnabled)}
                                            onKeyDown={(event) => {
                                                if (event.key === ' ' || event.key === 'Enter') {
                                                    event.preventDefault();
                                                    setQueueMode(!queueModeEnabled);
                                                }
                                            }}
                                        >
                                            <Checkbox
                                                checked={queueModeEnabled}
                                                onChange={setQueueMode}
                                                ariaLabel="默认排队消息"
                                            />
                                            <div className="flex min-w-0 items-center gap-1.5">
                                                <span className="typography-ui-label text-foreground">默认排队消息</span>
                                                <Tooltip delayDuration={1000}>
                                                    <TooltipTrigger asChild>
                                                        <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                                                    </TooltipTrigger>
                                                    <TooltipContent sideOffset={8} className="max-w-xs">
                                                        When enabled, Enter queues messages. Use {getModifierLabel()}+Enter to send.
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                        </div>
                                    )}

                                    {shouldShow('persistDraft') && (
                                        <div
                                            className="group flex cursor-pointer items-center gap-2 py-0.5"
                                            role="button"
                                            tabIndex={0}
                                            aria-pressed={persistChatDraft}
                                            onClick={() => setPersistChatDraft(!persistChatDraft)}
                                            onKeyDown={(event) => {
                                                if (event.key === ' ' || event.key === 'Enter') {
                                                    event.preventDefault();
                                                    setPersistChatDraft(!persistChatDraft);
                                                }
                                            }}
                                        >
                                            <Checkbox
                                                checked={persistChatDraft}
                                                onChange={setPersistChatDraft}
                                                ariaLabel="保留草稿消息"
                                            />
                                            <span className="typography-ui-label text-foreground">保留草稿消息</span>
                                        </div>
                                    )}

                                    {!isMobile && shouldShow('inputSpellcheck') && (
                                        <div
                                            className="group flex cursor-pointer items-center gap-2 py-1.5"
                                            role="button"
                                            tabIndex={0}
                                            aria-pressed={inputSpellcheckEnabled}
                                            onClick={() => handleInputSpellcheckChange(!inputSpellcheckEnabled)}
                                            onKeyDown={(event) => {
                                                if (event.key === ' ' || event.key === 'Enter') {
                                                    event.preventDefault();
                                                    handleInputSpellcheckChange(!inputSpellcheckEnabled);
                                                }
                                            }}
                                        >
                                            <Checkbox
                                                checked={inputSpellcheckEnabled}
                                                onChange={handleInputSpellcheckChange}
                                                ariaLabel="在文本输入中启用拼写检查"
                                            />
                                            <span className="typography-ui-label text-foreground">在文本输入中启用拼写检查</span>
                                        </div>
                                    )}

                                </section>
                            )}

                    </div>
                )}

                {/* --- Privacy & Data --- */}
                {shouldShow('reportUsage') && (
                    <div className="space-y-3">
                        <section className="px-2 pb-2 pt-0">
                            <h4 className="typography-ui-header font-medium text-foreground mb-2">隐私</h4>
                            <div className="flex items-start gap-2 py-1.5">
                                <Checkbox
                                    checked={reportUsage}
                                    onChange={handleReportUsageChange}
                                    ariaLabel="发送匿名使用报告"
                                />
                                <div className="flex min-w-0 flex-col gap-0.5">
                                    <div
                                        className="group flex cursor-pointer"
                                        role="button"
                                        tabIndex={0}
                                        aria-pressed={reportUsage}
                                        onClick={() => handleReportUsageChange(!reportUsage)}
                                        onKeyDown={(event) => {
                                            if (event.key === ' ' || event.key === 'Enter') {
                                                event.preventDefault();
                                                handleReportUsageChange(!reportUsage);
                                            }
                                        }}
                                    >
                                        <span className="typography-ui-label text-foreground">发送匿名使用报告</span>
                                    </div>
                                    <span className="typography-meta text-muted-foreground pointer-events-none">
                                        Helps us understand which app versions are actively used so we can prioritize improvements. Only app version, platform, and runtime are collected - no personal data or code.
                                    </span>
                                </div>
                            </div>
                        </section>
                    </div>
                )}

            </div>
    );
};
