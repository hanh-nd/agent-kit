import type { MemoryChunk, MemoryConfig, SourceType } from './types.js';
import { sha256Hex } from '../../utils/hash.js';

function computeChunkId(content: string): string {
  return sha256Hex(content).slice(0, 16);
}

function cleanContentForEmbedding(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

const HEADING_RE = /^(#{1,6}) (.+)$/;
const SENTENCE_END_RE = /([.!?。！？])\s+(?![0-9])/g;
const URL_RE = /https?:\/\/\S+/g;

function splitAtParagraph(text: string, maxLen: number): string[] {
  const paragraphs = text.split(/\n\n+/);
  const parts: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length <= maxLen) {
      current = candidate;
    } else {
      if (current) parts.push(current);
      current = para.length <= maxLen ? para : splitAtLine(para, maxLen).join('\n\n');
    }
  }

  if (current) parts.push(current);
  return parts.filter(Boolean);
}

function splitAtLine(text: string, maxLen: number): string[] {
  const lines = text.split('\n');
  const parts: string[] = [];
  let current = '';

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maxLen) {
      current = candidate;
    } else {
      if (current) parts.push(current);
      current = line.length <= maxLen ? line : splitAtSentence(line, maxLen).join(' ');
    }
  }

  if (current) parts.push(current);
  return parts.filter(Boolean);
}

function splitAtSentence(text: string, maxLen: number): string[] {
  const sanitized = text.replace(URL_RE, '[URL]');
  const sentences: string[] = [];
  let lastIndex = 0;

  for (const match of sanitized.matchAll(SENTENCE_END_RE)) {
    const end = (match.index ?? 0) + match[0].length;
    sentences.push(text.slice(lastIndex, end).trim());
    lastIndex = end;
  }

  if (lastIndex < text.length) {
    sentences.push(text.slice(lastIndex).trim());
  }

  if (sentences.length === 0) return [text.slice(0, maxLen)];

  const parts: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxLen) {
      current = candidate;
    } else {
      if (current) parts.push(current);
      current = sentence.slice(0, maxLen);
    }
  }

  if (current) parts.push(current);
  return parts.filter(Boolean);
}

function splitSection(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const byPara = splitAtParagraph(text, maxLen);
  if (byPara.every((p) => p.length <= maxLen)) return byPara;
  return byPara.flatMap((p) => (p.length <= maxLen ? [p] : splitAtLine(p, maxLen)));
}

export function chunkMarkdown(
  text: string,
  source: string,
  config: Pick<MemoryConfig, 'chunkSize' | 'overlapLines'>,
  meta: { sourceType: SourceType; fileMtimeAt: number },
): MemoryChunk[] {
  if (!text || !text.trim()) return [];

  const { chunkSize, overlapLines } = config;
  const lines = text.split('\n');

  // Group lines into sections by heading
  interface Section {
    heading: string;
    headingLevel: number;
    lines: { text: string; lineNum: number }[];
  }

  const sections: Section[] = [];
  let current: Section = { heading: '', headingLevel: 0, lines: [] };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      if (current.lines.length > 0) sections.push(current);
      current = {
        heading: headingMatch[2].trim(),
        headingLevel: headingMatch[1].length,
        lines: [{ text: line, lineNum: i + 1 }],
      };
    } else {
      current.lines.push({ text: line, lineNum: i + 1 });
    }
  }
  if (current.lines.length > 0) sections.push(current);

  const chunks: MemoryChunk[] = [];
  let prevOverlapLines: string[] = [];

  for (const section of sections) {
    const sectionText = section.lines.map((l) => l.text).join('\n');
    if (!sectionText.trim()) continue;

    const fullText = prevOverlapLines.length > 0 ? `${prevOverlapLines.join('\n')}\n${sectionText}` : sectionText;

    const parts = splitSection(fullText, chunkSize);

    for (let pi = 0; pi < parts.length; pi++) {
      const part = parts[pi];
      if (!part.trim()) continue;

      const partLines = part.split('\n');
      const firstLine = section.lines[0]?.lineNum ?? 1;
      const lastLine = section.lines[section.lines.length - 1]?.lineNum ?? firstLine;

      const content = cleanContentForEmbedding(part);
      chunks.push({
        id: computeChunkId(content),
        source,
        sourceType: meta.sourceType,
        heading: section.heading,
        headingLevel: section.headingLevel,
        content,
        lineStart: firstLine,
        lineEnd: lastLine,
        fileMtimeAt: meta.fileMtimeAt,
      });

      // Update overlap for next iteration (last N lines of this chunk)
      if (pi === parts.length - 1) {
        prevOverlapLines = partLines.slice(-overlapLines);
      }
    }
  }

  return chunks;
}
