import * as path from 'path';

export const HANDOFF_TYPES = [
  'brainstorm',
  'clarification',
  'plan',
  'ticket',
  'research',
  'scenario',
  'investigation',
] as const;

export type HandoffType = (typeof HANDOFF_TYPES)[number];

export type CanonicalHandoffType =
  | 'brainstorm'
  | 'clarification'
  | 'plan'
  | 'ticket'
  | 'research'
  | 'scenario'
  | 'investigation';

export interface SavedHandoffLocation {
  featureSlug: string;
  canonicalType: CanonicalHandoffType;
  filePath: string;
  relativePath: string;
}

const TICKET_ID_PATTERN = /\b[A-Z][A-Z0-9]+-\d+\b/;

function findTicketId(value: string): string | null {
  return value.match(TICKET_ID_PATTERN)?.[0].toLowerCase() ?? null;
}

export function sanitizeFeatureSlug(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function contentSlugCandidate(content: string): string {
  const heading = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find((line) => line.length > 0);

  return heading ?? content.replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function normalizeHandoffType(type: HandoffType): CanonicalHandoffType {
  if (!HANDOFF_TYPES.includes(type)) {
    throw new Error(`Unsupported handoff type: ${type}`);
  }
  return type;
}

export function deriveFeatureSlug(input: {
  requestedSlug: string;
  content: string;
  type: CanonicalHandoffType;
}): string {
  const requestedTicketSlug = findTicketId(input.requestedSlug);
  if (requestedTicketSlug) return requestedTicketSlug;

  const requestedSlug = sanitizeFeatureSlug(input.requestedSlug);
  if (requestedSlug) return requestedSlug;

  const contentTicketSlug = findTicketId(input.content);
  if (contentTicketSlug) return contentTicketSlug;

  return sanitizeFeatureSlug(contentSlugCandidate(input.content)) || 'untitled-handoff';
}

export function resolveHandoffPath(input: {
  workspaceRoot: string;
  type: HandoffType;
  slug: string;
  content: string;
}): SavedHandoffLocation {
  const canonicalType = normalizeHandoffType(input.type);
  const featureSlug = deriveFeatureSlug({
    requestedSlug: input.slug,
    content: input.content,
    type: canonicalType,
  });
  const relativePath = path.join('.agent-kit', 'handoffs', featureSlug, `${canonicalType}.md`);

  return {
    featureSlug,
    canonicalType,
    filePath: path.join(input.workspaceRoot, relativePath),
    relativePath,
  };
}
