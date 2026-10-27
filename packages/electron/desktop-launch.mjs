import path from 'node:path';

export const PROJECT_OPEN_ARG = '--openchamber-project=';

/** Locate the pichamber desktop launcher. */
export const desktopLauncherPath = (dataDir) => path.join(dataDir, 'desktop', 'pichamber');
