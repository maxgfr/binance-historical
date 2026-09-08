import { promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { hostname } from 'node:os';
import { DownloadError } from './config';

/** Recovery itself is exclusive so two resumptions cannot delete each other's lock. */
export async function acquireExportLock(
  path: string,
  resume: boolean,
): Promise<FileHandle> {
  const acquire = async () => {
    const file = await fs.open(path, 'wx');
    try {
      await file.writeFile(
        JSON.stringify({
          pid: process.pid,
          hostname: hostname(),
          createdAt: new Date().toISOString(),
        }),
      );
      await file.sync();
      return file;
    } catch (error) {
      await file.close();
      await fs.rm(path, { force: true });
      throw error;
    }
  };
  const locked = () =>
    new DownloadError(
      `Export is locked: ${path}. Resume can recover a dead local writer; otherwise verify the owner before removing the lock.`,
      'EXPORT_LOCKED',
    );
  try {
    return await acquire();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  if (!resume) throw locked();
  let recovery: FileHandle;
  try {
    recovery = await fs.open(`${path}.recovery`, 'wx');
  } catch {
    throw locked();
  }
  try {
    let owner: { pid: number; hostname: string };
    try {
      owner = JSON.parse(await fs.readFile(path, 'utf8'));
    } catch {
      throw locked();
    }
    if (
      !Number.isSafeInteger(owner.pid) ||
      owner.pid <= 0 ||
      owner.hostname !== hostname()
    )
      throw locked();
    try {
      process.kill(owner.pid, 0);
      throw locked();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw locked();
    }
    await fs.unlink(path);
    try {
      return await acquire();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw locked();
      throw error;
    }
  } finally {
    await recovery.close();
    await fs.rm(`${path}.recovery`, { force: true });
  }
}
