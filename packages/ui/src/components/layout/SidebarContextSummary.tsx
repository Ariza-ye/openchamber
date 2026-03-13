import React from 'react';
import {useSessionStore} from '@/stores/useSessionStore';
import {useDirectoryStore} from '@/stores/useDirectoryStore';
import {cn} from '@/lib/utils';
import {useI18n} from '@/contexts/useI18n';

interface SidebarContextSummaryProps {
    className?: string;
}

const formatSessionTitle = (title: string | null | undefined, fallback: string) => {
    if (!title) {
        return fallback;
    }
    const trimmed = title.trim();
    return trimmed.length > 0 ? trimmed : fallback;
};

const formatDirectoryPath = (path?: string) => {
    if (!path || path.length === 0) {
        return '/';
    }
    return path;
};

export const SidebarContextSummary: React.FC<SidebarContextSummaryProps> = ({ className }) => {
    const {t} = useI18n();
    const currentSessionId = useSessionStore((state) => state.currentSessionId);
    const sessions = useSessionStore((state) => state.sessions);
    const { currentDirectory } = useDirectoryStore();
    const untitledSessionLabel = t('Untitled Session');

    const activeSessionTitle = React.useMemo(() => {
        if (!currentSessionId) {
            return t('No active session');
        }
        const session = sessions.find((item) => item.id === currentSessionId);
        return session ? formatSessionTitle(session.title, untitledSessionLabel) : t('No active session');
    }, [currentSessionId, sessions, t, untitledSessionLabel]);

    const directoryFull = React.useMemo(() => {
        return formatDirectoryPath(currentDirectory);
    }, [currentDirectory]);

    const directoryDisplay = React.useMemo(() => {
        if (!directoryFull || directoryFull === '/') {
            return directoryFull;
        }
        const segments = directoryFull.split('/').filter(Boolean);
        return segments.length ? segments[segments.length - 1] : directoryFull;
    }, [directoryFull]);

    return (
        <div className={cn('hidden min-h-[48px] flex-col justify-center gap-0.5 border-b bg-sidebar/60 px-3 py-2 backdrop-blur md:flex md:pb-2', className)}>
            <span className="typography-meta text-muted-foreground">{t('Session')}</span>
            <span className="typography-ui-label font-semibold text-foreground truncate" title={activeSessionTitle}>
                {activeSessionTitle}
            </span>
            <span className="typography-meta text-muted-foreground truncate" title={directoryFull}>
                {directoryDisplay}
            </span>
        </div>
    );
};
