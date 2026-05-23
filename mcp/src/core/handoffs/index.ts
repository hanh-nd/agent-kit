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

type HandoffType = (typeof HANDOFF_TYPES)[number];

type CanonicalHandoffType =
  | 'brainstorm'
  | 'clarification'
  | 'plan'
  | 'ticket'
  | 'research'
  | 'scenario'
  | 'investigation';

export interface SavedHandoffFolderLocation {
  featureSlug: string;
  canonicalType: CanonicalHandoffType;
  folderPath: string;
  relativePath: string;
}

const TICKET_ID_PATTERN = /\b[A-Z][A-Z0-9]+-\d+\b/;

function findTicketId(value: string): string | null {
  return value.match(TICKET_ID_PATTERN)?.[0].toLowerCase() ?? null;
}

function sanitizeFeatureSlug(value: string): string {
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

function normalizeHandoffType(type: HandoffType): CanonicalHandoffType {
  if (!HANDOFF_TYPES.includes(type)) {
    throw new Error(`Unsupported handoff type: ${type}`);
  }
  return type;
}

function deriveFeatureSlug(input: { requestedSlug: string; content: string; type: CanonicalHandoffType }): string {
  const requestedTicketSlug = findTicketId(input.requestedSlug);
  if (requestedTicketSlug) return requestedTicketSlug;

  const requestedSlug = sanitizeFeatureSlug(input.requestedSlug);
  if (requestedSlug) return requestedSlug;

  const contentTicketSlug = findTicketId(input.content);
  if (contentTicketSlug) return contentTicketSlug;

  return sanitizeFeatureSlug(contentSlugCandidate(input.content)) || 'untitled-handoff';
}

export function resolveHandoffFolder(input: {
  workspaceRoot: string;
  type: HandoffType;
  slug: string;
  primaryContent: string;
}): SavedHandoffFolderLocation {
  const canonicalType = normalizeHandoffType(input.type);
  const featureSlug = deriveFeatureSlug({
    requestedSlug: input.slug,
    content: input.primaryContent,
    type: canonicalType,
  });
  const relativePath = path.join('.agent-kit', 'handoffs', featureSlug, canonicalType);

  return {
    featureSlug,
    canonicalType,
    folderPath: path.join(input.workspaceRoot, relativePath),
    relativePath,
  };
}

export function validateHandoffFilename(name: string): string {
  const normalized = name.trim().replace(/^["']|["']$/g, '');
  if (!/^[A-Za-z0-9_-]+\.md$/.test(normalized)) {
    throw new Error(`Unsafe handoff filename: ${name}`);
  }
  return normalized;
}
