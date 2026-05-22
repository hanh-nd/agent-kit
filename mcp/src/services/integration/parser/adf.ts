/* eslint-disable @typescript-eslint/no-explicit-any */
export function adfToMarkdown(adf: Record<string, unknown> | null | undefined): string {
  if (!adf || typeof adf !== 'object') return 'No description';

  const content = adf.content;
  if (!content || !Array.isArray(content)) return 'No description';

  function renderNodes(nodes: any[], listDepth = 0, parentType?: string): string {
    let result = '';
    if (!nodes || !Array.isArray(nodes)) return result;

    for (const node of nodes) {
      switch (node.type) {
        case 'paragraph': {
          const text = renderNodes(node.content, listDepth, node.type);
          result += parentType === 'listItem' ? text : text + '\n\n';
          break;
        }
        case 'heading': {
          const level = node.attrs?.level || 1;
          result += '#'.repeat(level) + ' ' + renderNodes(node.content, listDepth, node.type) + '\n\n';
          break;
        }
        case 'text': {
          let text = node.text || '';
          if (node.marks) {
            for (const mark of node.marks) {
              switch (mark.type) {
                case 'strong':
                  text = `**${text}**`;
                  break;
                case 'em':
                  text = `*${text}*`;
                  break;
                case 'code':
                  text = `\`${text}\``;
                  break;
                case 'strike':
                  text = `~~${text}~~`;
                  break;
                case 'link':
                  text = `[${text}](${mark.attrs?.href})`;
                  break;
              }
            }
          }
          result += text;
          break;
        }
        case 'bulletList':
        case 'orderedList':
          result += renderNodes(node.content, listDepth + 1, node.type);
          if (listDepth === 0) result += '\n';
          break;
        case 'listItem': {
          const indent = '  '.repeat(Math.max(0, listDepth - 1));
          const bullet = parentType === 'orderedList' ? '1.' : '-';
          const text = renderNodes(node.content, listDepth, node.type).trim();
          result += `${indent}${bullet} ${text}\n`;
          break;
        }
        case 'blockquote':
          result += '> ' + renderNodes(node.content, listDepth, node.type).trim().replace(/\n/g, '\n> ') + '\n\n';
          break;
        case 'codeBlock':
          result += `\`\`\`${node.attrs?.language || ''}\n${renderNodes(node.content, listDepth, node.type).trim()}\n\`\`\`\n\n`;
          break;
        case 'rule':
          result += '---\n\n';
          break;
        case 'hardBreak':
          result += '\n';
          break;
        case 'table':
          result += renderTable(node.content);
          break;
        case 'mention':
          result += `@${node.attrs?.text || node.attrs?.displayName || 'user'}`;
          break;
        case 'emoji':
          result += node.attrs?.text || '';
          break;
        case 'inlineCard':
        case 'blockCard':
          result += `[${node.attrs?.url}](${node.attrs?.url})`;
          if (node.type === 'blockCard') result += '\n\n';
          break;
        case 'mediaSingle':
        case 'mediaInline':
        case 'media':
          result += '[media omitted]';
          break;
        default:
          if (node.content) {
            result += renderNodes(node.content, listDepth, node.type);
          }
          break;
      }
    }
    return result;
  }

  function renderTable(rows: any[]): string {
    if (!rows || !Array.isArray(rows)) return '';
    let result = '\n';
    let isFirstRow = true;

    for (const row of rows) {
      if (row.type !== 'tableRow') continue;
      const cells = row.content || [];
      const rendered = cells.map((c: any) => renderNodes(c.content).trim().replace(/\n+/g, ' ').replace(/\|/g, '\\|'));
      result += '| ' + rendered.join(' | ') + ' |\n';
      if (isFirstRow) {
        result += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
        isFirstRow = false;
      }
    }
    return result + '\n';
  }

  return renderNodes(content).trim() || 'No description';
}
