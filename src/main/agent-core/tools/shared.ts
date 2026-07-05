import * as fs from 'fs';
import * as path from 'path';

export function resolveWorkspacePath(cwd: string, inputPath: string): string {
  const resolved = path.resolve(cwd, inputPath || '.');
  const root = path.resolve(cwd);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path escapes workspace: ${inputPath}`);
  }
  return resolved;
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function truncateText(text: string, maxChars = 60_000): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[truncated ${text.length - maxChars} chars]`;
}
