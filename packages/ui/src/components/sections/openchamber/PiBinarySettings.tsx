/**
 * Where this instance finds the pi executable.
 *
 * Pichamber runs pi as its only agent. An empty value means "find `pi` on
 * PATH"; a path is kept for installs where the desktop app cannot see the
 * shell's PATH.
 */
import * as React from 'react';

import {
  SettingsFieldRow,
  SettingsSection,
  SETTINGS_CONTROL_CLUSTER_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { loadDesktopSettings, updateDesktopSettings } from '@/lib/persistence';

export const PiBinarySettings: React.FC = () => {
  const { t } = useI18n();
  const [binary, setBinary] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    void loadDesktopSettings().then((settings) => {
      if (cancelled || !settings) return;
      setBinary(settings.piBinary ?? '');
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SettingsSection
      title={t('settings.agentBackend.binary')}
      info={t('settings.agentBackend.binaryHint')}
      settingsItem="general.pi-binary"
    >
      <SettingsFieldRow
        label={t('settings.agentBackend.binary')}
        controlClassName={SETTINGS_CONTROL_CLUSTER_CLASS}
        description={t('settings.agentBackend.binaryHint')}
        settingsItem="general.pi-binary.field"
      >
        <Input
          value={binary}
          placeholder="pi"
          aria-label={t('settings.agentBackend.binaryAria')}
          spellCheck={false}
          onChange={(event) => setBinary(event.target.value)}
          onBlur={() => void updateDesktopSettings({ piBinary: binary.trim() })}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.currentTarget.blur();
          }}
        />
      </SettingsFieldRow>
    </SettingsSection>
  );
};
