import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
import { promises as fs } from 'fs';
import { join } from 'path';
import { v2 as cloudinary } from 'cloudinary';

interface UploadOptions {
  subFolder: string;
  resourceType?: 'image' | 'raw' | 'auto';
}

interface UploadedFileData {
  url: string;
  filename: string;
  secureUrl?: string;
  cloudinaryPublicId?: string;
}

@Injectable()
export class StorageService {
  private readonly isProd = process.env.NODE_ENV === 'production';
  private readonly uploadBaseDir = join(process.cwd(), 'uploads');

  private hasCloudinaryConfig(): boolean {
    return Boolean(
      process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET,
    );
  }

  private ensureCloudinaryConfiguredForUpload() {
    if (!this.hasCloudinaryConfig()) {
      if (this.isProd) {
        throw new HttpException(
          'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      return false;
    }

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    return true;
  }

  async uploadDocument(file: Express.Multer.File, options: UploadOptions): Promise<UploadedFileData> {
    if (!file?.buffer) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    const folderRoot = (process.env.CLOUDINARY_FOLDER || 'lawyerskonnect').trim();
    const cloudinaryReady = this.ensureCloudinaryConfiguredForUpload();

    if (cloudinaryReady) {
      const folder = `${folderRoot}/${options.subFolder}`.replace(/\/+/g, '/');
      const result = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: options.resourceType || 'auto',
            use_filename: true,
            unique_filename: true,
            overwrite: false,
          },
          (error, uploadResult) => {
            if (error) reject(error);
            else resolve(uploadResult);
          },
        );
        stream.end(file.buffer);
      });

      return {
        url: result.secure_url,
        filename: result.public_id,
        secureUrl: result.secure_url,
        cloudinaryPublicId: result.public_id,
      };
    }

    const localDir = join(this.uploadBaseDir, options.subFolder);
    if (!existsSync(localDir)) {
      mkdirSync(localDir, { recursive: true });
    }

    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${(file.originalname || 'file').replace(/\s+/g, '_')}`;
    const fullPath = join(localDir, safeName);
    await fs.writeFile(fullPath, file.buffer);

    const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const url = `${baseUrl.replace(/\/$/, '')}/uploads/${options.subFolder}/${safeName}`;

    return {
      url,
      filename: safeName,
    };
  }

  resolveLocalPath(fileUrl: string): string | null {
    if (!fileUrl?.includes('/uploads/')) return null;
    const relative = fileUrl.split('/uploads/')[1];
    if (!relative) return null;
    return join(this.uploadBaseDir, relative);
  }

  /** Force JPEG for Cloudinary so OpenCV/Tesseract read reliably. */
  private normalizeFetchUrl(fileUrl: string): string {
    if (!fileUrl?.includes('res.cloudinary.com') || !fileUrl.includes('/upload/')) {
      return fileUrl;
    }
    if (/\/upload\/[^/]*f_/.test(fileUrl)) {
      return fileUrl;
    }
    return fileUrl.replace('/upload/', '/upload/f_jpg,q_auto:good/');
  }

  private assertImageBuffer(buffer: Buffer, label: string): void {
    if (!buffer?.length || buffer.length < 800) {
      throw new HttpException(
        `${label} image is missing or too small (${buffer?.length ?? 0} bytes). Re-upload a clear JPG/PNG.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const head = buffer.subarray(0, 12);
    const isJpeg = head[0] === 0xff && head[1] === 0xd8;
    const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    const isWebp = head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46;
    if (!isJpeg && !isPng && !isWebp) {
      const preview = buffer.subarray(0, 40).toString('utf8').replace(/\s+/g, ' ');
      if (preview.toLowerCase().includes('<!doctype') || preview.toLowerCase().includes('<html')) {
        throw new HttpException(
          `${label} URL returned HTML instead of an image. Re-upload the document.`,
          HttpStatus.BAD_GATEWAY,
        );
      }
      throw new HttpException(
        `${label} is not a supported image format. Use JPG or PNG.`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async getFileBuffer(fileUrl: string): Promise<Buffer> {
    const localPath = this.resolveLocalPath(fileUrl);
    if (localPath && existsSync(localPath)) {
      const buffer = await fs.readFile(localPath);
      this.assertImageBuffer(buffer, 'Document');
      return buffer;
    }
    const fetchUrl = this.normalizeFetchUrl(fileUrl);
    const res = await fetch(fetchUrl);
    if (!res.ok) {
      throw new HttpException('Could not fetch document for verification', HttpStatus.BAD_GATEWAY);
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    this.assertImageBuffer(buffer, 'Document');
    return buffer;
  }

  async deleteStoredFile(fileUrl?: string, cloudinaryPublicId?: string): Promise<void> {
    if (cloudinaryPublicId && this.hasCloudinaryConfig()) {
      try {
        this.ensureCloudinaryConfiguredForUpload();
        try {
          await cloudinary.uploader.destroy(cloudinaryPublicId, { resource_type: 'image' });
        } catch {
          await cloudinary.uploader.destroy(cloudinaryPublicId, { resource_type: 'raw' });
        }
        return;
      } catch {
        // fall through to local cleanup attempt
      }
    }

    if (!fileUrl) return;
    if (!fileUrl.includes('/uploads/')) return;

    const relative = fileUrl.split('/uploads/')[1];
    if (!relative) return;
    const fullPath = join(this.uploadBaseDir, relative);
    try {
      await fs.unlink(fullPath);
    } catch {
      // Ignore missing files for backward compatibility.
    }
  }
}
