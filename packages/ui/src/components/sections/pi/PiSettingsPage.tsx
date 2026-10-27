/**
 * The OpenCode category's pages, answered from pi.
 *
 * When this instance runs pi the four slots beside it read pi's own files
 * instead of OpenCode's config: providers from `models.json`, instructions from
 * `AGENTS.md`, commands from `prompts/`, MCP from `mcp.json`, plugins from
 * `extensions/`. The pages are read-only apart from the instructions file.
 * pi owns these files and reloads them itself, and a write from here would have
 * to re-implement pi's own validation.
 */
import * as React from 'react';

import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  SettingsSection,
  SettingsStackedField,
  SETTINGS_HELPER_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n';
import { fetchPiInstructions, fetchPiOverview, savePiInstructions, type PiOverview } from '@/lib/pi/api';

export type PiSection = 'providers' | 'behavior' | 'commands' | 'mcp' | 'extensions';

const usePiOverview = () => {
  const [overview, setOverview] = React.useState<PiOverview | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void fetchPiOverview()
      .then((value) => {
        if (!cancelled) setOverview(value);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { overview, failed };
};

const Loading: React.FC = () => (
  <div className="space-y-2 py-2">
    <Skeleton className="h-4 w-40" />
    <Skeleton className="h-4 w-72" />
  </div>
);

/** One quiet row: a name, and whatever says what it is. */
const PiRow: React.FC<{ title: string; detail?: string }> = ({ title, detail }) => (
  <div className="flex flex-col gap-0.5 py-1.5">
    <span className="typography-settings-field-label text-foreground">{title}</span>
    {detail ? <span className={SETTINGS_HELPER_CLASS}>{detail}</span> : null}
  </div>
);

const ProvidersSection: React.FC<{ overview: PiOverview }> = ({ overview }) => {
  const { t } = useI18n();
  return (
    <SettingsSection title={t('settings.page.providers.title')} divider={false}>
      {overview.providers.length === 0 ? (
        <p className={SETTINGS_HELPER_CLASS}>{t('settings.pi.empty')}</p>
      ) : (
        overview.providers.map((provider) => (
          <PiRow
            key={provider.id}
            title={provider.id}
            detail={[provider.api, provider.baseUrl, String(provider.models.length)].filter(Boolean).join(' · ')}
          />
        ))
      )}
      <p className={`${SETTINGS_HELPER_CLASS} pt-1`}>{t('settings.pi.providers.hint')}</p>
    </SettingsSection>
  );
};

const CommandsSection: React.FC<{ overview: PiOverview }> = ({ overview }) => {
  const { t } = useI18n();
  return (
    <SettingsSection title={t('settings.page.commands.title')} divider={false}>
      {overview.commands.length === 0 ? (
        <p className={SETTINGS_HELPER_CLASS}>{t('settings.pi.empty')}</p>
      ) : (
        overview.commands.map((command) => (
          <PiRow key={command.path} title={`/${command.name}`} detail={command.description} />
        ))
      )}
      <p className={`${SETTINGS_HELPER_CLASS} pt-1`}>{t('settings.pi.commands.hint')}</p>
    </SettingsSection>
  );
};

const McpSection: React.FC<{ overview: PiOverview }> = ({ overview }) => {
  const { t } = useI18n();
  return (
    <SettingsSection title={t('settings.page.mcp.title')} divider={false}>
      {overview.mcp.length === 0 ? (
        <p className={SETTINGS_HELPER_CLASS}>{t('settings.pi.empty')}</p>
      ) : (
        overview.mcp.map((server) => (
          <PiRow
            key={server.name}
            title={server.name}
            detail={server.type === 'remote' ? server.url : [...server.command, ...server.args].join(' ')}
          />
        ))
      )}
      <p className={`${SETTINGS_HELPER_CLASS} pt-1`}>{t('settings.pi.mcp.hint')}</p>
    </SettingsSection>
  );
};

const ExtensionsSection: React.FC<{ overview: PiOverview }> = ({ overview }) => {
  const { t } = useI18n();
  return (
    <SettingsSection title={t('settings.page.plugins.title')} divider={false}>
      {overview.extensions.length === 0 ? (
        <p className={SETTINGS_HELPER_CLASS}>{t('settings.pi.empty')}</p>
      ) : (
        overview.extensions.map((extension) => (
          <PiRow key={extension.path} title={extension.name} detail={extension.path} />
        ))
      )}
      <p className={`${SETTINGS_HELPER_CLASS} pt-1`}>{t('settings.pi.extensions.hint')}</p>
    </SettingsSection>
  );
};

/** pi's instructions file: the same idea as OpenCode's Behavior page. */
const BehaviorSection: React.FC = () => {
  const { t } = useI18n();
  const [text, setText] = React.useState('');
  const [path, setPath] = React.useState('');
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void fetchPiInstructions()
      .then((value) => {
        if (cancelled) return;
        setText(value.text);
        setPath(value.path);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const commit = React.useCallback(() => {
    void savePiInstructions(text).catch(() => setFailed(true));
  }, [text]);

  if (failed) return <p className={SETTINGS_HELPER_CLASS}>{t('settings.pi.loadFailed')}</p>;
  if (!loaded) return <Loading />;

  return (
    <SettingsSection title={t('settings.page.behavior.title')} divider={false}>
      <SettingsStackedField label={t('settings.pi.behavior.field')} description={path}>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          rows={16}
          spellCheck={false}
          aria-label={t('settings.pi.behavior.field')}
          placeholder={t('settings.pi.behavior.placeholder')}
        />
      </SettingsStackedField>
      <p className={`${SETTINGS_HELPER_CLASS} pt-1`}>{t('settings.pi.behavior.hint')}</p>
    </SettingsSection>
  );
};

/** One pi page: the shared Settings shell over the section pi answers. */
export const PiSettingsPage: React.FC<{ section: PiSection }> = ({ section }) => {
  const { t } = useI18n();
  const { overview, failed } = usePiOverview();

  const title = {
    providers: t('settings.page.providers.title'),
    behavior: t('settings.page.behavior.title'),
    commands: t('settings.page.commands.title'),
    mcp: t('settings.page.mcp.title'),
    extensions: t('settings.page.plugins.title'),
  }[section];

  const body = () => {
    if (section === 'behavior') return <BehaviorSection />;
    if (failed) return <p className={SETTINGS_HELPER_CLASS}>{t('settings.pi.loadFailed')}</p>;
    if (!overview) return <Loading />;
    if (!overview.available) {
      return <p className={SETTINGS_HELPER_CLASS}>{t('settings.pi.unavailable', { binary: overview.binary })}</p>;
    }
    if (section === 'providers') return <ProvidersSection overview={overview} />;
    if (section === 'commands') return <CommandsSection overview={overview} />;
    if (section === 'mcp') return <McpSection overview={overview} />;
    return <ExtensionsSection overview={overview} />;
  };

  return (
    <SettingsPageLayout title={title} showSaveStatus={false}>
      {body()}
    </SettingsPageLayout>
  );
};
