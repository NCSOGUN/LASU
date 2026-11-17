import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AppError } from '../../middleware/error.js';
import type { AgentImage } from '../../ai/agents.js';

export interface AttachmentStorage {
  uploadObject(input: { key: string; body: Buffer | Uint8Array; contentType: string }): Promise<string>;
  deleteObject(key: string): Promise<void>;
}

export interface ProcessedAttachments {
  keys: string[];
  images: AgentImage[];
}

const MAX_IMAGE_HEIGHT = 1500;

export async function processAttachments(
  files: Express.Multer.File[],
  symptomId: string,
  storage: AttachmentStorage,
): Promise<ProcessedAttachments> {
  const keys: string[] = [];
  const images: AgentImage[] = [];

  try {
    for (const file of files) {
      const isPdf = file.mimetype === 'application/pdf';
      if (!isPdf && !file.mimetype.startsWith('image/')) {
        throw new AppError(
          400,
          'Only image and PDF attachments are supported',
          'invalid_attachment',
        );
      }

      let body: Buffer = file.buffer;
      let extension = 'pdf';
      let contentType = 'application/pdf';

      if (!isPdf) {
        try {
          body = await sharp(file.buffer)
            .rotate()
            .resize({ height: MAX_IMAGE_HEIGHT, withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer();
        } catch {
          throw new AppError(400, 'Attachment image could not be processed', 'invalid_attachment');
        }
        extension = 'webp';
        contentType = 'image/webp';
      }

      const key = `symptom/${symptomId}/${randomUUID()}.${extension}`;
      await storage.uploadObject({ key, body, contentType });
      keys.push(key);
      images.push({ mimeType: contentType, base64: body.toString('base64') });
    }
  } catch (error) {
    await Promise.allSettled(keys.map((key) => storage.deleteObject(key)));
    throw error;
  }

  return { keys, images };
}
