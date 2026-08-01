/**
 * Confluence storage-format (XHTML) → markdown converter.
 *
 * Pure module: no I/O, no network, no MCP coupling. Three stages — a single forward
 * tokenizer pass, a tolerant tree builder, then a recursive renderer.
 */

/** Max tree depth before rendering emits a truncation marker. */
export const MAX_STORAGE_DEPTH = 100;

/** Visible truncation marker emitted at MAX_STORAGE_DEPTH. */
export const DEPTH_TRUNCATION_MARKER = '[content nested too deeply - truncated]';

type Token =
  | { kind: 'text'; value: string }
  | { kind: 'cdata'; value: string }
  | { kind: 'comment' }
  | { kind: 'open'; name: string; attrs: Record<string, string> }
  | { kind: 'selfclose'; name: string; attrs: Record<string, string> }
  | { kind: 'close'; name: string };

interface ElementNode {
  kind: 'element';
  name: string;
  attrs: Record<string, string>;
  children: Node[];
}

type Node = { kind: 'text'; value: string } | { kind: 'cdata'; value: string } | ElementNode;

const VOID_TAGS = new Set([
  'br',
  'hr',
  'img',
  'col',
  'input',
  'meta',
  'link',
  'ri:page',
  'ri:attachment',
  'ri:url',
  'ri:user',
  'ri:space',
  'ri:blog-post',
  'ac:emoticon',
]);

// XML predefined entities plus the common HTML named entities Confluence emits in real
// pages (arrows, dashes, smart quotes, symbols). Case-sensitive \u2014 HTML entity names are.
const NAMED_ENTITIES: Record<string, string> = {
  // XML predefined
  nbsp: '\u00A0',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  // dashes & punctuation
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  middot: '\u00B7',
  bull: '\u2022',
  dagger: '\u2020',
  Dagger: '\u2021',
  sect: '\u00A7',
  para: '\u00B6',
  // smart quotes
  lsquo: '\u2018',
  rsquo: '\u2019',
  sbquo: '\u201A',
  ldquo: '\u201C',
  rdquo: '\u201D',
  bdquo: '\u201E',
  laquo: '\u00AB',
  raquo: '\u00BB',
  prime: '\u2032',
  Prime: '\u2033',
  // arrows
  larr: '\u2190',
  rarr: '\u2192',
  uarr: '\u2191',
  darr: '\u2193',
  harr: '\u2194',
  // symbols & math
  copy: '\u00A9',
  reg: '\u00AE',
  trade: '\u2122',
  deg: '\u00B0',
  plusmn: '\u00B1',
  times: '\u00D7',
  divide: '\u00F7',
  micro: '\u00B5',
  frac12: '\u00BD',
  frac14: '\u00BC',
  frac34: '\u00BE',
  ne: '\u2260',
  le: '\u2264',
  ge: '\u2265',
  infin: '\u221E',
  // currency
  euro: '\u20AC',
  pound: '\u00A3',
  yen: '\u00A5',
  cent: '\u00A2',
};

const PANEL_MACROS = new Set(['info', 'note', 'warning', 'tip', 'panel']);
const PLACEHOLDER_MACROS = new Set(['toc', 'children', 'excerpt-include']);

const ATTRIBUTE_PATTERN = /([A-Za-z_:][-A-Za-z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function codePointOrLiteral(code: number, literal: string): string {
  if (!Number.isInteger(code) || code < 1 || code > 0x10ffff) return literal;
  try {
    return String.fromCodePoint(code);
  } catch {
    return literal;
  }
}

function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;

  return text.replace(/&(#[Xx][0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, (literal, body: string) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      return codePointOrLiteral(code, literal);
    }
    return NAMED_ENTITIES[body] ?? literal;
  });
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTRIBUTE_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE_PATTERN.exec(source)) !== null) {
    const raw = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[match[1].toLowerCase()] = decodeEntities(raw);
  }

  return attrs;
}

/**
 * Single forward pass with a monotonically advancing cursor. CDATA is recognised
 * before any tag scanning so `<` and `>` inside a CDATA payload are never markup.
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;
  let textStart = 0;

  const flushText = (end: number): void => {
    if (end > textStart) tokens.push({ kind: 'text', value: input.slice(textStart, end) });
  };

  while (cursor < input.length) {
    const lt = input.indexOf('<', cursor);
    if (lt === -1) break;

    if (input.startsWith('<![CDATA[', lt)) {
      const end = input.indexOf(']]>', lt + 9);
      if (end === -1) break;
      flushText(lt);
      tokens.push({ kind: 'cdata', value: input.slice(lt + 9, end) });
      cursor = end + 3;
      textStart = cursor;
      continue;
    }

    if (input.startsWith('<!--', lt)) {
      const end = input.indexOf('-->', lt + 4);
      if (end === -1) break;
      flushText(lt);
      tokens.push({ kind: 'comment' });
      cursor = end + 3;
      textStart = cursor;
      continue;
    }

    const gt = input.indexOf('>', lt + 1);
    if (gt === -1) break;

    const raw = input.slice(lt + 1, gt);
    if (!/^\/?[A-Za-z]/.test(raw)) {
      // A stray `<` — leave it in the text run and keep scanning past it.
      cursor = lt + 1;
      continue;
    }

    flushText(lt);
    if (raw[0] === '/') {
      tokens.push({ kind: 'close', name: raw.slice(1).trim().toLowerCase() });
    } else {
      const selfClosing = raw.endsWith('/');
      const inner = selfClosing ? raw.slice(0, -1) : raw;
      const nameEnd = inner.search(/[\s/]/);
      const name = (nameEnd === -1 ? inner : inner.slice(0, nameEnd)).toLowerCase();
      const attrs = parseAttributes(nameEnd === -1 ? '' : inner.slice(nameEnd));
      tokens.push({ kind: selfClosing ? 'selfclose' : 'open', name, attrs });
    }

    cursor = gt + 1;
    textStart = cursor;
  }

  flushText(input.length);
  return tokens;
}

interface Frame {
  name: string;
  children: Node[];
  suppressing: boolean;
}

/**
 * Tolerant tree builder. A non-matching close auto-closes intermediate elements up to
 * the nearest matching ancestor, or is discarded when no ancestor matches. Content
 * nested past MAX_STORAGE_DEPTH is replaced by a single visible truncation marker so
 * the renderer's recursion stays bounded.
 */
function buildTree(tokens: Token[]): Node[] {
  const root: Node[] = [];
  const stack: Frame[] = [];
  let suppressDepth = 0;

  const sink = (): Node[] => (stack.length > 0 ? stack[stack.length - 1].children : root);

  for (const token of tokens) {
    switch (token.kind) {
      case 'comment':
        break;

      case 'text':
      case 'cdata':
        if (suppressDepth === 0) sink().push(token);
        break;

      case 'open':
      case 'selfclose': {
        const overDepth = stack.length >= MAX_STORAGE_DEPTH;
        if (suppressDepth === 0 && overDepth) {
          sink().push({ kind: 'text', value: DEPTH_TRUNCATION_MARKER });
        }

        const suppressing = suppressDepth > 0 || overDepth;
        const isLeaf = token.kind === 'selfclose' || VOID_TAGS.has(token.name);

        if (suppressing) {
          if (!isLeaf) {
            stack.push({ name: token.name, children: [], suppressing: true });
            suppressDepth++;
          }
          break;
        }

        const element: ElementNode = { kind: 'element', name: token.name, attrs: token.attrs, children: [] };
        sink().push(element);
        if (!isLeaf) stack.push({ name: token.name, children: element.children, suppressing: false });
        break;
      }

      case 'close': {
        let target = -1;
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].name === token.name) {
            target = i;
            break;
          }
        }
        if (target === -1) break;

        while (stack.length > target) {
          const frame = stack.pop();
          if (frame?.suppressing) suppressDepth--;
        }
        break;
      }
    }
  }

  return root;
}

function isElement(node: Node, name?: string): node is ElementNode {
  return node.kind === 'element' && (name === undefined || node.name === name);
}

function findChild(element: ElementNode, name: string): ElementNode | undefined {
  return element.children.find((child): child is ElementNode => isElement(child, name));
}

/** Verbatim text of a subtree — no entity decoding, used for code and macro parameters. */
function rawText(nodes: Node[]): string {
  let result = '';
  for (const node of nodes) {
    if (node.kind === 'element') result += rawText(node.children);
    else result += node.value;
  }
  return result;
}

function macroParameters(element: ElementNode): Record<string, string> {
  const params: Record<string, string> = {};
  for (const child of element.children) {
    if (!isElement(child, 'ac:parameter')) continue;
    const key = child.attrs['ac:name'];
    if (key) params[key] = rawText(child.children).trim();
  }
  return params;
}

function collectRows(nodes: Node[]): ElementNode[] {
  const rows: ElementNode[] = [];
  for (const node of nodes) {
    if (!isElement(node)) continue;
    if (node.name === 'tr') rows.push(node);
    else if (node.name === 'thead' || node.name === 'tbody' || node.name === 'tfoot') {
      rows.push(...collectRows(node.children));
    }
  }
  return rows;
}

function renderTable(nodes: Node[]): string {
  const rows = collectRows(nodes);
  if (rows.length === 0) return '';

  let result = '\n';
  let isFirstRow = true;

  for (const row of rows) {
    const cells = row.children.filter(
      (child): child is ElementNode => isElement(child, 'th') || isElement(child, 'td'),
    );
    const rendered = cells.map((cell) => renderNodes(cell.children).trim().replace(/\n+/g, ' ').replace(/\|/g, '\\|'));
    result += '| ' + rendered.join(' | ') + ' |\n';
    if (isFirstRow) {
      result += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
      isFirstRow = false;
    }
  }

  return result + '\n';
}

function renderMacro(element: ElementNode, listDepth: number): string {
  const name = element.attrs['ac:name'] || '';
  const params = macroParameters(element);
  const richBody = findChild(element, 'ac:rich-text-body');

  if (name === 'code') {
    const plainBody = findChild(element, 'ac:plain-text-body');
    const code = plainBody ? rawText(plainBody.children) : rawText(element.children);
    return `\`\`\`${params.language || ''}\n${code.replace(/^\n+|\n+$/g, '')}\n\`\`\`\n\n`;
  }

  if (PANEL_MACROS.has(name)) {
    const body = richBody ? renderNodes(richBody.children, listDepth, name).trim() : '';
    const block = `**${name.toUpperCase()}**${body ? `\n${body}` : ''}`;
    return '> ' + block.replace(/\n/g, '\n> ') + '\n\n';
  }

  if (name === 'expand') {
    const body = richBody ? renderNodes(richBody.children, listDepth, name).trim() : '';
    return `**${params.title || 'Details'}**\n\n${body ? `${body}\n\n` : ''}`;
  }

  if (name === 'jira') {
    return params.key ? `\`${params.key}\`` : '[macro: jira]';
  }

  if (PLACEHOLDER_MACROS.has(name)) return `[macro: ${name}]`;

  return `[macro: ${name || 'unknown'}]`;
}

function renderLink(element: ElementNode, listDepth: number): string {
  const bodyElement = findChild(element, 'ac:plain-text-link-body') ?? findChild(element, 'ac:link-body');
  const bodyText = bodyElement ? renderNodes(bodyElement.children, listDepth, element.name).trim() : '';

  const page = findChild(element, 'ri:page');
  if (page) return `[[${bodyText || page.attrs['ri:content-title'] || 'page'}]]`;

  const attachment = findChild(element, 'ri:attachment');
  if (attachment) return `[attachment: ${attachment.attrs['ri:filename'] || 'unknown'}]`;

  const externalUrl = findChild(element, 'ri:url');
  if (externalUrl) {
    const href = externalUrl.attrs['ri:value'] || '';
    return `[${bodyText || href}](${href})`;
  }

  if (findChild(element, 'ri:user')) return '@user';

  return bodyText;
}

function renderTaskList(element: ElementNode, listDepth: number): string {
  let result = '';
  for (const task of element.children) {
    if (!isElement(task, 'ac:task')) continue;
    const status = findChild(task, 'ac:task-status');
    const body = findChild(task, 'ac:task-body');
    const marker = rawText(status?.children ?? []).trim() === 'complete' ? '[x]' : '[ ]';
    const text = body ? renderNodes(body.children, listDepth, 'ac:task').trim() : '';
    result += `- ${marker} ${text}\n`;
  }
  return result ? result + '\n' : '';
}

function renderNodes(nodes: Node[], listDepth = 0, parentType?: string): string {
  let result = '';

  for (const node of nodes) {
    if (node.kind === 'cdata') {
      result += node.value;
      continue;
    }
    if (node.kind === 'text') {
      result += decodeEntities(node.value);
      continue;
    }

    const children = node.children;

    switch (node.name) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        result += '#'.repeat(Number(node.name[1])) + ' ' + renderNodes(children, listDepth, node.name).trim() + '\n\n';
        break;

      case 'p': {
        const text = renderNodes(children, listDepth, node.name);
        result += parentType === 'li' ? text + '\n' : text + '\n\n';
        break;
      }

      case 'strong':
      case 'b':
        result += `**${renderNodes(children, listDepth, node.name)}**`;
        break;

      case 'em':
      case 'i':
        result += `*${renderNodes(children, listDepth, node.name)}*`;
        break;

      case 'code':
        result += `\`${renderNodes(children, listDepth, node.name)}\``;
        break;

      case 's':
      case 'strike':
      case 'del':
        result += `~~${renderNodes(children, listDepth, node.name)}~~`;
        break;

      case 'sup':
        result += `^${renderNodes(children, listDepth, node.name)}^`;
        break;

      case 'sub':
        result += `~${renderNodes(children, listDepth, node.name)}~`;
        break;

      case 'pre':
        result += `\`\`\`\n${renderNodes(children, listDepth, node.name).trim()}\n\`\`\`\n\n`;
        break;

      case 'blockquote':
        result += '> ' + renderNodes(children, listDepth, node.name).trim().replace(/\n/g, '\n> ') + '\n\n';
        break;

      case 'hr':
        result += '---\n\n';
        break;

      case 'br':
        result += '\n';
        break;

      case 'a': {
        const text = renderNodes(children, listDepth, node.name);
        const href = node.attrs.href ?? '';
        result += href ? `[${text}](${href})` : text;
        break;
      }

      case 'ul':
      case 'ol': {
        const inner = renderNodes(children, listDepth + 1, node.name);
        if (parentType === 'li') {
          if (result.length > 0 && !result.endsWith('\n')) result += '\n';
          result += inner;
        } else {
          result += inner;
          if (listDepth === 0) result += '\n';
        }
        break;
      }

      case 'li': {
        const indent = '  '.repeat(Math.max(0, listDepth - 1));
        const bullet = parentType === 'ol' ? '1.' : '-';
        result += `${indent}${bullet} ${renderNodes(children, listDepth, 'li').trim()}\n`;
        break;
      }

      case 'table':
        result += renderTable(children);
        break;

      case 'ac:structured-macro':
        result += renderMacro(node, listDepth);
        break;

      case 'ac:link':
        result += renderLink(node, listDepth);
        break;

      case 'ac:image': {
        const attachment = findChild(node, 'ri:attachment');
        const externalUrl = findChild(node, 'ri:url');
        const label = attachment?.attrs['ri:filename'] ?? externalUrl?.attrs['ri:value'] ?? 'unknown';
        const marker = `[image: ${label}]`;
        if (parentType === 'p') {
          // Inline within a paragraph — the paragraph provides its own block separation.
          result += marker;
        } else {
          // Block-level image (a direct child of a block container): give it its own line.
          if (result.length > 0 && !result.endsWith('\n')) result += '\n';
          result += `${marker}\n\n`;
        }
        break;
      }

      case 'ac:task-list':
        result += renderTaskList(node, listDepth);
        break;

      case 'ac:emoticon':
        result += `:${node.attrs['ac:name'] || 'emoticon'}:`;
        break;

      default:
        result += renderNodes(children, listDepth, node.name);
        break;
    }
  }

  return result;
}

/** Tag-stripping fallback used only if the pipeline itself faults. */
function extractPlainText(xhtml: string): string {
  return decodeEntities(xhtml.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert Confluence storage-format XHTML into markdown.
 *
 * Never throws for any string input, including malformed XHTML, unbalanced tags, stray
 * CDATA, and the empty string. Returns '' for input with no content — the caller decides
 * how to present emptiness.
 */
export function storageToMarkdown(xhtml: string | null | undefined): string {
  if (typeof xhtml !== 'string' || xhtml.length === 0) return '';

  try {
    return renderNodes(buildTree(tokenize(xhtml))).trim();
  } catch {
    return extractPlainText(xhtml);
  }
}
