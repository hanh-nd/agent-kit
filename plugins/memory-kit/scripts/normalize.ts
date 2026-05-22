const STRIP_TAGS = [
  'instructions',
  'available_resources',
  'function_calls',
  'function_results',
  'system-reminder',
  'local-command-stdout',
  'local-command-stderr',
  'command-name',
  'command-message',
  'command-args',
  'local-command-caveat',
  'environment_context',
  'skill'
];

export function normalizeTranscript(raw: string): string {
  let result = raw;
  for (const tag of STRIP_TAGS) {
    result = result.replace(new RegExp(`<${tag}>.*?<\\/${tag}>`, 'gs'), '');
  }
  return result.replace(/\n{3,}/g, '\n\n');
}
