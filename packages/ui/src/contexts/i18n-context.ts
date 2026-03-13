import {createContext} from 'react';
import type {Locale, TranslateFn} from '@/lib/i18n/messages';

export type I18nContextValue = {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: TranslateFn;
};

export const I18nContext = createContext<I18nContextValue | undefined>(undefined);
