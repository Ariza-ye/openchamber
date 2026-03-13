import React from 'react';
import {useUIStore} from '@/stores/useUIStore';
import {DEFAULT_LOCALE, type MessageKey, MESSAGES, normalizeLocale, type TranslateFn,} from '@/lib/i18n/messages';
import {I18nContext, type I18nContextValue} from './i18n-context';

const formatMessage = (template: string, vars?: Record<string, string | number>): string => {
    if (!vars) {
        return template;
    }

    return template.replace(/\{(\w+)\}/g, (match, key) => {
        const value = vars[key];
        if (value === undefined || value === null) {
            return match;
        }
        return String(value);
    });
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({children}) => {
    const locale = useUIStore((state) => state.locale);
    const setLocale = useUIStore((state) => state.setLocale);

    const normalizedLocale = React.useMemo(() => normalizeLocale(locale), [locale]);

    const t = React.useCallback<TranslateFn>(
        (key: MessageKey, vars) => {
            const table = MESSAGES[normalizedLocale] ?? MESSAGES[DEFAULT_LOCALE];
            const template = table[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
            return formatMessage(template, vars);
        },
        [normalizedLocale],
    );

    React.useEffect(() => {
        if (typeof document === 'undefined') {
            return;
        }
        document.documentElement.lang = normalizedLocale;
    }, [normalizedLocale]);

    const value = React.useMemo<I18nContextValue>(() => ({
        locale: normalizedLocale,
        setLocale,
        t,
    }), [normalizedLocale, setLocale, t]);

    return (
        <I18nContext.Provider value={value}>
            {children}
        </I18nContext.Provider>
    );
};
