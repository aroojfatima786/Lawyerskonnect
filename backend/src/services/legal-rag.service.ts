import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export type FaissSearchResult = {
  id: string;
  source: string;
  title: string;
  actName?: string;
  category?: string;
  content: string;
  sectionNumber?: string;
  summary?: string;
  score: number;
};

type ChunkMeta = {
  id: string;
  source: string;
  title: string;
  actName?: string;
  category?: string;
  content: string;
  sectionNumber?: string;
};

/**
 * Loads pre-built FAISS corpus only (offline index via npm run setup:legal-rag).
 * Runtime search uses precomputed embeddings + lexical seeding — no Python, no live embedding models.
 */
@Injectable()
export class LegalRagService implements OnModuleInit {
  private readonly logger = new Logger(LegalRagService.name);
  private readonly ragDir = join(process.cwd(), 'data', 'rag');
  private chunks: ChunkMeta[] = [];
  private embeddings: Float32Array | null = null;
  private embeddingDim = 0;
  private ready = false;
  private avgDocLen = 0;
  private docFreq = new Map<string, number>();
  private docTokens: string[][] = [];

  onModuleInit() {
    this.loadPrebuiltIndex();
  }

  isReady(): boolean {
    return this.ready;
  }

  /** Semantic search over offline FAISS-indexed Pakistan Code chunks. */
  searchSimilarDocs(query: string, topK = 5): FaissSearchResult[] {
    const q = String(query || '').trim();
    if (!q || !this.ready) return [];

    const bm25Scores = this.scoreBm25(q);
    const combined = this.hasEmbeddings()
      ? this.scoreWithPrebuiltEmbeddings(q, bm25Scores)
      : bm25Scores;

    combined.sort((a, b) => b.score - a.score);
    const top = combined.slice(0, Math.max(1, topK));
    const maxScore = top[0]?.score || 1;

    return top.map(({ index, score }) => {
      const chunk = this.chunks[index];
      return {
        id: chunk.id,
        source: chunk.source,
        title: chunk.title,
        actName: chunk.actName || chunk.title,
        category: chunk.category,
        content: chunk.content,
        sectionNumber: chunk.sectionNumber,
        summary: chunk.content.slice(0, 400),
        score: Math.round(Math.min(1, Math.max(0, score / maxScore)) * 10000) / 10000,
      };
    });
  }

  private hasEmbeddings(): boolean {
    return !!this.embeddings && this.embeddingDim > 0 && this.chunks.length > 0;
  }

  /** Build pseudo query vector from precomputed chunk embeddings (no runtime model). */
  private scoreWithPrebuiltEmbeddings(
    query: string,
    bm25Scores: Array<{ index: number; score: number }>,
  ): Array<{ index: number; score: number }> {
    if (!this.embeddings) return bm25Scores;

    const seeds = bm25Scores
      .filter((s) => s.score > 0)
      .slice(0, 25);
    if (seeds.length === 0) return bm25Scores;

    const qVec = new Float32Array(this.embeddingDim);
    let weightSum = 0;
    for (const { index, score } of seeds) {
      const w = score;
      weightSum += w;
      const off = index * this.embeddingDim;
      for (let d = 0; d < this.embeddingDim; d++) {
        qVec[d] += this.embeddings[off + d] * w;
      }
    }
    if (weightSum > 0) {
      for (let d = 0; d < this.embeddingDim; d++) qVec[d] /= weightSum;
    }

    const combined: Array<{ index: number; score: number }> = [];
    for (let i = 0; i < this.chunks.length; i++) {
      let dot = 0;
      const off = i * this.embeddingDim;
      for (let d = 0; d < this.embeddingDim; d++) {
        dot += qVec[d] * this.embeddings![off + d];
      }
      const bm25 = bm25Scores.find((s) => s.index === i)?.score || 0;
      combined.push({ index: i, score: dot * 0.75 + bm25 * 0.25 });
    }
    return combined;
  }

  private scoreBm25(query: string): Array<{ index: number; score: number }> {
    const queryTokens = this.tokenize(query);
    const k1 = 1.5;
    const b = 0.75;
    const n = this.chunks.length;
    const scored: Array<{ index: number; score: number }> = [];

    for (let i = 0; i < n; i++) {
      const doc = this.docTokens[i];
      const docLen = doc.length;
      let score = 0;
      const tfMap = new Map<string, number>();
      for (const t of doc) tfMap.set(t, (tfMap.get(t) || 0) + 1);

      for (const term of new Set(queryTokens)) {
        const tf = tfMap.get(term) || 0;
        if (!tf) continue;
        const df = this.docFreq.get(term) || 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        const denom = tf + k1 * (1 - b + b * (docLen / this.avgDocLen));
        score += idf * ((tf * (k1 + 1)) / denom);
      }

      const chunk = this.chunks[i];
      const blob = `${chunk.title} ${chunk.actName || ''} ${chunk.sectionNumber || ''} ${chunk.category || ''}`.toLowerCase();
      for (const term of queryTokens) {
        if (blob.includes(term)) score += 0.35;
      }
      scored.push({ index: i, score });
    }
    return scored;
  }

  private loadPrebuiltIndex() {
    const metaPath = join(this.ragDir, 'chunks_meta.json');
    const embPath = join(this.ragDir, 'embeddings.f32.bin');
    if (!existsSync(metaPath)) {
      this.logger.warn('Legal RAG index not found. Add laws to law-download/ and run: npm run setup:legal-rag');
      return;
    }
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as {
        chunks?: ChunkMeta[];
        embeddingDim?: number;
        sourceLabel?: string;
      };
      this.chunks = Array.isArray(meta.chunks) ? meta.chunks : [];
      if (this.chunks.length === 0) {
        this.logger.warn('Legal RAG chunks_meta.json has no chunks');
        return;
      }

      this.embeddingDim = Number(meta.embeddingDim || 384);
      if (existsSync(embPath)) {
        const buf = readFileSync(embPath);
        this.embeddings = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
        const expected = this.chunks.length * this.embeddingDim;
        if (this.embeddings.length !== expected) {
          this.logger.warn(`Embedding size mismatch; using lexical search only`);
          this.embeddings = null;
        }
      }

      this.docTokens = this.chunks.map((c) =>
        this.tokenize(`${c.title} ${c.actName || ''} ${c.content} ${c.sectionNumber || ''} ${c.category || ''}`),
      );
      this.avgDocLen = this.docTokens.reduce((sum, d) => sum + d.length, 0) / this.chunks.length;

      this.docFreq.clear();
      for (const tokens of this.docTokens) {
        for (const term of new Set(tokens)) {
          this.docFreq.set(term, (this.docFreq.get(term) || 0) + 1);
        }
      }

      this.ready = true;
      const label = meta.sourceLabel || 'Pakistan Code';
      const mode = this.embeddings ? 'FAISS+lexical' : 'lexical';
      this.logger.log(`Legal RAG loaded (${this.chunks.length} chunks, ${mode}, source=${label})`);
    } catch (err) {
      this.logger.warn(`Failed to load Legal RAG index: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private tokenize(text: string): string[] {
    return String(text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }
}
