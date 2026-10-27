import { z } from 'zod';

import { runtimeFetch } from '@/lib/runtime-fetch';

/**
 * pi's configuration as the Settings pages read it.
 *
 * The shapes mirror `packages/web/server/lib/pi-backend/routes.js`. Adding a
 * field to the server payload means adding it here too, or the page silently
 * loses it.
 */
const piModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  reasoning: z.boolean().optional(),
  contextWindow: z.number().optional(),
  maxTokens: z.number().optional(),
});

const piProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string().nullable(),
  api: z.string().nullable(),
  models: z.array(piModelSchema),
  credential: z.enum(['api', 'oauth']).nullable(),
});

const piMcpServerSchema = z.object({
  name: z.string(),
  type: z.enum(['local', 'remote']),
  url: z.string().optional(),
  command: z.array(z.string()),
  args: z.array(z.string()),
  environment: z.array(z.string()),
  enabled: z.boolean(),
  description: z.string().optional(),
});

const piCommandSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  path: z.string(),
});

const piSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  path: z.string(),
});

const piExtensionSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  directory: z.boolean(),
});

const piOverviewSchema = z.object({
  available: z.boolean(),
  binary: z.string(),
  version: z.string().nullable(),
  agentDir: z.string(),
  files: z.object({
    settings: z.string(),
    models: z.string(),
  }),
  settings: z.object({
    defaultProvider: z.string().nullable(),
    defaultModel: z.string().nullable(),
    defaultThinkingLevel: z.string().nullable(),
  }),
  providers: z.array(piProviderSchema),
  mcp: z.array(piMcpServerSchema),
  commands: z.array(piCommandSchema),
  skills: z.array(piSkillSchema),
  extensions: z.array(piExtensionSchema),
});

export type PiOverview = z.infer<typeof piOverviewSchema>;

export const fetchPiOverview = async (): Promise<PiOverview> => {
  const response = await runtimeFetch('/api/pi/overview', { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error('Could not read pi configuration');
  return piOverviewSchema.parse(await response.json());
};

const piInstructionsSchema = z.object({
  path: z.string(),
  text: z.string(),
});

export const fetchPiInstructions = async (): Promise<z.infer<typeof piInstructionsSchema>> => {
  const response = await runtimeFetch('/api/pi/instructions', { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error('Could not read pi instructions');
  return piInstructionsSchema.parse(await response.json());
};

export const savePiInstructions = async (text: string): Promise<void> => {
  const response = await runtimeFetch('/api/pi/instructions', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error('Could not save pi instructions');
};
