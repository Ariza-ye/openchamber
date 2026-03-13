import type {FilesAPI} from '@/lib/api/types';
import {countLinesWithLimit, MAX_OPEN_FILE_LINES} from '@/lib/fileOpenLimits';
import type {TranslateFn} from '@/lib/i18n/messages';

export type ContextFileOpenFailureReason = 'too-large' | 'missing' | 'unreadable';

export type ContextFileOpenValidationResult =
  | { ok: true }
  | { ok: false; reason: ContextFileOpenFailureReason };

const classifyReadError = (error: unknown): ContextFileOpenFailureReason => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();

  if (
    normalized.includes('file not found')
    || normalized.includes('not found')
    || normalized.includes('enoent')
    || normalized.includes('no such file')
    || normalized.includes('does not exist')
  ) {
    return 'missing';
  }

  return 'unreadable';
};

const readFileContent = async (files: FilesAPI, path: string): Promise<string> => {
  if (files.readFile) {
    const result = await files.readFile(path);
    return result.content ?? '';
  }

  const response = await fetch(`/api/fs/read?path=${encodeURIComponent(path)}`);
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((errorPayload as { error?: string }).error || 'Failed to read file');
  }

  return response.text();
};

export const validateContextFileOpen = async (files: FilesAPI, path: string): Promise<ContextFileOpenValidationResult> => {
  try {
    const content = await readFileContent(files, path);
    const lineCount = countLinesWithLimit(content, MAX_OPEN_FILE_LINES);
    if (lineCount > MAX_OPEN_FILE_LINES) {
      return { ok: false, reason: 'too-large' };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, reason: classifyReadError(error) };
  }
};

export const getContextFileOpenFailureMessage = (reason: ContextFileOpenFailureReason, t?: TranslateFn): string => {
  if (reason === 'too-large') {
      const lines = MAX_OPEN_FILE_LINES.toLocaleString();
      return t
          ? t('File is too large to open (>{lines} lines)', {lines})
          : `File is too large to open (> ${lines} lines)`;
  }

  if (reason === 'missing') {
      return t ? t('File not found') : 'File not found';
  }

    return t ? t('Failed to open file') : 'Failed to open file';
};
