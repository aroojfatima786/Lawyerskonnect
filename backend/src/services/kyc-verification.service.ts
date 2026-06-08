import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createWorker, PSM } from 'tesseract.js';
import { StorageService } from './storage.service';

export type KycCheckResult = {
  enteredCnic: string;
  ocrExtractedCnic: string | null;
  ocrExtractedName: string | null;
  ocrRawText: string;
  ocrMatched: boolean;
  /** CNIC verified only when card OCR matches profile (face match alone is not enough). */
  ocrMatchMethod?: 'card_ocr';
  faceMatchScore: number;
  faceMatchPassed: boolean;
  reviewMode: 'auto_pass_pending_admin' | 'manual_review_required';
  checkedAt: Date;
};

/** Minimum SFace similarity (percent) — CNIC portrait vs live selfie must be same person. */
const SFACE_MIN_SCORE_PERCENT = 50;

@Injectable()
export class KycVerificationService implements OnModuleInit {
  private readonly logger = new Logger(KycVerificationService.name);

  constructor(private readonly storageService: StorageService) {}

  onModuleInit() {
    const sface = join(process.cwd(), 'models', 'face', 'face_recognition_sface_2021dec.onnx');
    if (!existsSync(sface)) {
      this.logger.warn(
        'KYC face models missing. Run in backend folder: npm run setup:kyc (see KYC_SETUP.md)',
      );
    } else {
      this.logger.log('KYC face match (SFace) models loaded');
    }
  }

  private resolveFaceScriptPath(): string {
    const candidates = [
      join(process.cwd(), 'scripts', 'kyc_face_match.py'),
      join(__dirname, '..', '..', 'scripts', 'kyc_face_match.py'),
    ];
    return candidates.find((p) => existsSync(p)) ?? candidates[0];
  }

  normalizeCnic(raw: string): string {
    return String(raw || '').replace(/\D/g, '');
  }

  formatCnicDigits(digits: string): string | null {
    const d = this.normalizeCnic(digits);
    if (d.length !== 13) return null;
    return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
  }

  private redactSensitiveOcr(text: string): string {
    const raw = String(text || '').slice(0, 1200);
    // Mask long numeric sequences to reduce CNIC/ID leakage in persisted review data.
    return raw.replace(/\d{5,}/g, (m) => `${m.slice(0, 2)}***${m.slice(-1)}`);
  }

  /** Collect CNIC numbers from OCR without using profile CNIC as a hint. */
  private collectCnicCandidatesFromText(text: string): Array<{ formatted: string; source: 'pattern' | 'window'; index: number }> {
    const seen = new Set<string>();
    const ordered: Array<{ formatted: string; source: 'pattern' | 'window'; index: number }> = [];
    const add = (digits: string, source: 'pattern' | 'window', index: number) => {
      const formatted = this.formatCnicDigits(digits);
      if (!formatted) return;
      const norm = this.normalizeCnic(formatted);
      if (!seen.has(norm)) {
        seen.add(norm);
        ordered.push({ formatted, source, index });
      }
    };

    const compact = text.replace(/\s+/g, ' ');
    const formattedPattern = /\b(\d{5})[\s-]?(\d{7})[\s-]?(\d)\b/g;
    for (const m of compact.matchAll(formattedPattern)) {
      if (m[1] && m[2] && m[3]) add(`${m[1]}${m[2]}${m[3]}`, 'pattern', m.index ?? 0);
    }

    const digitsOnly = text.replace(/\D/g, '');
    for (let i = 0; i <= digitsOnly.length - 13; i++) {
      add(digitsOnly.slice(i, i + 13), 'window', i);
    }

    return ordered;
  }

  private cnicDigitMatchScore(a: string, b: string): number {
    if (a.length !== 13 || b.length !== 13) return 0;
    let score = 0;
    for (let i = 0; i < 13; i += 1) {
      if (a[i] === b[i]) score += 1;
    }
    return score;
  }

  /** Best CNIC read from the card image text; uses entered CNIC only to disambiguate OCR candidates. */
  extractCardCnicFromText(text: string, enteredCnic?: string): string | null {
    const candidates = this.collectCnicCandidatesFromText(text);
    if (candidates.length === 0) return null;

    const ranked = [...candidates].sort((a, b) => {
      if (a.source !== b.source) return a.source === 'pattern' ? -1 : 1;
      return a.index - b.index;
    });

    const enteredNorm = enteredCnic ? this.normalizeCnic(enteredCnic) : '';
    if (enteredNorm.length === 13) {
      let best: (typeof ranked)[0] | null = null;
      let bestScore = -1;
      for (const candidate of ranked) {
        const score = this.cnicDigitMatchScore(enteredNorm, this.normalizeCnic(candidate.formatted));
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      if (best && bestScore >= 11) return best.formatted;
    }

    const patternHit = ranked.find((c) => c.source === 'pattern');
    if (patternHit) return patternHit.formatted;
    return ranked[0]?.formatted ?? null;
  }

  /** @deprecated Use extractCardCnicFromText — kept for tests/callers. */
  extractCnicFromText(text: string, enteredCnic?: string): string | null {
    return this.extractCardCnicFromText(text, enteredCnic);
  }

  extractNameFromText(text: string): string | null {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (/name/i.test(line)) {
        const cleaned = line.replace(/name\s*:?\s*/i, '').trim();
        if (cleaned.length >= 3) return cleaned.slice(0, 120);
      }
    }
  return null;
  }

  private async recognizeWithWorker(
    buffer: Buffer,
    opts?: { digitsOnly?: boolean },
  ): Promise<string> {
    const worker = await createWorker('eng', undefined, { logger: () => undefined });
    try {
      if (opts?.digitsOnly) {
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789-',
          tessedit_pageseg_mode: PSM.SINGLE_LINE,
        });
      } else {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.AUTO,
        });
      }
      const { data } = await worker.recognize(buffer);
      return data.text || '';
    } finally {
      await worker.terminate();
    }
  }

  private resolveCnicCropScriptPath(): string {
    const candidates = [
      join(process.cwd(), 'scripts', 'kyc_cnic_crops.py'),
      join(__dirname, '..', '..', 'scripts', 'kyc_cnic_crops.py'),
    ];
    return candidates.find((p) => existsSync(p)) ?? candidates[0];
  }

  private async extractCnicCropBuffers(buffer: Buffer): Promise<Buffer[]> {
    const scriptPath = this.resolveCnicCropScriptPath();
    if (!existsSync(scriptPath)) return [];
    const imagePath = await this.writeTempImage(buffer, 'cnic-ocr');
    const pythonCmd = process.env.KYC_PYTHON_BIN || 'python';
    try {
      const output = await new Promise<string>((resolve, reject) => {
        const proc = spawn(pythonCmd, ['-u', scriptPath, imagePath], {
          windowsHide: true,
          env: { ...process.env, PYTHONUNBUFFERED: '1' },
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => {
          stdout += d.toString();
        });
        proc.stderr.on('data', (d) => {
          stderr += d.toString();
        });
        proc.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(stderr || `Python exited ${code}`));
            return;
          }
          resolve(stdout.trim());
        });
      });
      const jsonLine =
        output
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('{'))
          .pop() || output;
      const parsed = JSON.parse(jsonLine) as { crops_b64?: string[] };
      return (parsed.crops_b64 || [])
        .map((b64) => Buffer.from(b64, 'base64'))
        .filter((buf) => buf.length > 0);
    } catch (err) {
      this.logger.warn(`CNIC crop OCR prep failed: ${(err as Error).message}`);
      return [];
    }
  }

  async runOcr(
    imageUrl: string,
    enteredCnic?: string,
  ): Promise<{ rawText: string; extractedCnic: string | null; extractedName: string | null }> {
    const buffer = await this.storageService.getFileBuffer(imageUrl);
    const cropBuffers = await this.extractCnicCropBuffers(buffer);
    const ocrTargets = [buffer, ...cropBuffers];
    const textParts: string[] = [];

    for (const target of ocrTargets) {
      const [generalText, digitsText] = await Promise.all([
        this.recognizeWithWorker(target),
        this.recognizeWithWorker(target, { digitsOnly: true }),
      ]);
      if (digitsText.trim()) textParts.push(digitsText);
      if (generalText.trim()) textParts.push(generalText);
    }

    const rawText = textParts.join('\n');
    const extractedCnic = this.extractCardCnicFromText(rawText, enteredCnic);
    return {
      rawText,
      extractedCnic,
      extractedName: this.extractNameFromText(rawText),
    };
  }

  private async writeTempImage(buffer: Buffer, name: string): Promise<string> {
    const dir = join(tmpdir(), 'lawyerskonnect-kyc');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const path = join(dir, `${Date.now()}-${name}.jpg`);
    writeFileSync(path, buffer);
    return path;
  }

  async runFaceMatch(cnicFrontUrl: string, selfieUrl: string): Promise<{ score: number; passed: boolean }> {
    try {
      const [cnicBuf, selfieBuf] = await Promise.all([
        this.storageService.getFileBuffer(cnicFrontUrl),
        this.storageService.getFileBuffer(selfieUrl),
      ]);
      const cnicPath = await this.writeTempImage(cnicBuf, 'cnic-front');
      const selfiePath = await this.writeTempImage(selfieBuf, 'selfie');
      const scriptPath = this.resolveFaceScriptPath();
      if (!existsSync(scriptPath)) {
        this.logger.warn(`Face match script missing at ${scriptPath}`);
        return { score: 0, passed: false };
      }
      const pythonCmd = process.env.KYC_PYTHON_BIN || 'python';
      const output = await new Promise<string>((resolve, reject) => {
        const proc = spawn(pythonCmd, ['-u', scriptPath, cnicPath, selfiePath], {
          windowsHide: true,
          env: { ...process.env, PYTHONUNBUFFERED: '1' },
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => {
          stdout += d.toString();
        });
        proc.stderr.on('data', (d) => {
          stderr += d.toString();
        });
        proc.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(stderr || `Python exited ${code}`));
            return;
          }
          resolve(stdout.trim());
        });
      });
      const jsonLine =
        output
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('{'))
          .pop() || output;
      let parsed: {
        score?: number;
        passed?: boolean;
        error?: string;
        method?: string;
      };
      try {
        parsed = JSON.parse(jsonLine);
      } catch {
        throw new Error(
          `Invalid face script output (install: pip install -r scripts/requirements-kyc.txt): ${output.slice(0, 120)}`,
        );
      }
      const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
      if (parsed.error && !parsed.passed) {
        const dims =
          (parsed as { cnic_size?: number[]; selfie_size?: number[] }).cnic_size &&
          (parsed as { cnic_size?: number[]; selfie_size?: number[] }).selfie_size
            ? ` CNIC ${(parsed as { cnic_size: number[] }).cnic_size.join('x')} selfie ${(parsed as { selfie_size: number[] }).selfie_size.join('x')}`
            : '';
        this.logger.warn(
          `Face match (${parsed.method ?? 'unknown'}): ${parsed.error} — score ${score}%${dims}`,
        );
      }
      const method = String(parsed.method || '');
      const passed =
        method === 'sface' &&
        Boolean(parsed.passed) &&
        score >= SFACE_MIN_SCORE_PERCENT;
      if (!passed && method && method !== 'sface') {
        this.logger.warn(`Face match ignored non-SFace method "${method}" (score ${score}%)`);
      }
      if (passed) {
        this.logger.log(`Face match passed (SFace ${score}%)`);
      }
      return { score, passed };
    } catch (err) {
      this.logger.warn(`Face match failed: ${(err as Error).message}`);
      return { score: 0, passed: false };
    }
  }

  async verifyIdentity(input: {
    enteredCnic: string;
    cnicFrontUrl: string;
    selfieUrl: string;
  }): Promise<KycCheckResult> {
    const enteredNorm = this.normalizeCnic(input.enteredCnic);
    const ocr = await this.runOcr(input.cnicFrontUrl, input.enteredCnic);
    const cardCnic = ocr.extractedCnic ?? this.extractCardCnicFromText(ocr.rawText, input.enteredCnic);
    const extractedCnic = cardCnic;
    const cardNorm = cardCnic ? this.normalizeCnic(cardCnic) : '';

    const ocrMatched = Boolean(
      enteredNorm.length === 13 && cardNorm.length === 13 && cardNorm === enteredNorm,
    );
    const ocrMatchMethod: KycCheckResult['ocrMatchMethod'] = ocrMatched ? 'card_ocr' : undefined;

    if (cardCnic && !ocrMatched) {
      this.logger.warn(
        `CNIC mismatch: card OCR read ${cardCnic}, profile has ${input.enteredCnic}`,
      );
    } else if (!cardCnic) {
      this.logger.warn('CNIC OCR could not read a number from the card photo');
    }

    const face = await this.runFaceMatch(input.cnicFrontUrl, input.selfieUrl);
    const faceMatchPassed = face.passed && face.score >= SFACE_MIN_SCORE_PERCENT;

    const reviewMode =
      faceMatchPassed && ocrMatched ? 'auto_pass_pending_admin' : 'manual_review_required';

    return {
      enteredCnic: this.formatCnicDigits(enteredNorm) || input.enteredCnic,
      ocrExtractedCnic: extractedCnic,
      ocrExtractedName: ocr.extractedName,
      ocrRawText: this.redactSensitiveOcr(ocr.rawText),
      ocrMatched,
      ocrMatchMethod,
      faceMatchScore: Math.round(face.score * 100) / 100,
      faceMatchPassed,
      reviewMode,
      checkedAt: new Date(),
    };
  }
}
