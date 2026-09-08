import * as fs from 'fs/promises';
import * as path from 'path';

export const BACKUP_DIRNAME = '.designtokens-backup';

/** `…/<workspace>/.designtokens-backup/<stamp>` → workspace root. */
export function workspaceRootFromBackupDir(backupDir: string): string {
  return path.dirname(path.dirname(path.resolve(backupDir)));
}

export interface FileBackup {
  relativePath: string;
  contents: string;
}

export async function snapshotFiles(workspaceRoot: string, relativePaths: string[]): Promise<FileBackup[]> {
  const unique = [...new Set(relativePaths)];
  const backups: FileBackup[] = [];
  for (const relativePath of unique) {
    const contents = await fs.readFile(path.join(workspaceRoot, relativePath), 'utf8');
    backups.push({ relativePath, contents });
  }
  return backups;
}

export async function writeBackupBundle(
  workspaceRoot: string,
  backups: FileBackup[]
): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(workspaceRoot, BACKUP_DIRNAME, stamp);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
    createdAt: new Date().toISOString(),
    files: backups.map((b) => b.relativePath),
  }, null, 2));
  for (const backup of backups) {
    const dest = path.join(dir, 'files', backup.relativePath);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, backup.contents, 'utf8');
  }
  return dir;
}

export interface BackupListItem {
  dir: string;
  stamp: string;
  createdAt: string;
  files: string[];
}

export async function listBackupBundles(workspaceRoot: string): Promise<BackupListItem[]> {
  const root = path.join(workspaceRoot, BACKUP_DIRNAME);
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }
  const items: BackupListItem[] = [];
  for (const stamp of entries.sort().reverse()) {
    try {
      const dir = path.join(root, stamp);
      const raw = await fs.readFile(path.join(dir, 'manifest.json'), 'utf8');
      const manifest = JSON.parse(raw) as { createdAt?: string; files?: string[] };
      items.push({
        dir,
        stamp,
        createdAt: manifest.createdAt ?? stamp,
        files: manifest.files ?? [],
      });
    } catch {
      // skip incomplete bundles
    }
  }
  return items;
}

export async function restoreBackupBundle(workspaceRoot: string, backupDir: string): Promise<string[]> {
  const manifestRaw = await fs.readFile(path.join(backupDir, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestRaw) as { files: string[] };
  const restored: string[] = [];
  for (const relativePath of manifest.files) {
    const source = path.join(backupDir, 'files', relativePath);
    const dest = path.join(workspaceRoot, relativePath);
    const contents = await fs.readFile(source, 'utf8');
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, contents, 'utf8');
    restored.push(relativePath);
  }
  return restored;
}
