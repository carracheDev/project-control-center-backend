import { BadRequestException, Injectable } from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

@Injectable()
export class FileStorageService {
  private readonly root = resolve(process.env.EVIDENCE_STORAGE_DIR ?? join(process.cwd(), 'storage', 'evidence'));

  async store(file: Express.Multer.File): Promise<{ filePath: string; originalFileName: string; mimeType: string; fileSize: number }> {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) throw new BadRequestException('Unsupported evidence file type');
    if (file.size > MAX_FILE_SIZE) throw new BadRequestException('Evidence file exceeds the 10 MB limit');
    const extension = this.extensionFor(file.mimetype, file.originalname);
    const relativePath = join('evidence', `${randomUUID()}${extension}`);
    const absolutePath = resolve(this.root, relativePath.replace(/^evidence[\\/]/, ''));
    if (!absolutePath.startsWith(`${this.root}${process.platform === 'win32' ? '\\' : '/'}`)) throw new BadRequestException('Invalid evidence storage path');
    await mkdir(this.root, { recursive: true });
    await writeFile(absolutePath, file.buffer, { flag: 'wx' });
    return { filePath: relativePath, originalFileName: file.originalname.replace(/[\\/\0]/g, '_').slice(0, 255), mimeType: file.mimetype, fileSize: file.size };
  }

  async remove(filePath?: string | null): Promise<void> {
    if (!filePath) return;
    const absolutePath = resolve(this.root, filePath.replace(/^evidence[\\/]/, ''));
    if (!absolutePath.startsWith(`${this.root}${process.platform === 'win32' ? '\\' : '/'}`)) return;
    await unlink(absolutePath).catch(() => undefined);
  }

  private extensionFor(mimeType: string, originalName: string): string {
    const known: Record<string, string> = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'text/plain': '.txt' };
    return known[mimeType] ?? originalName.toLowerCase().match(/\.[a-z0-9]{1,8}$/)?.[0] ?? '';
  }
}
