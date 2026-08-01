import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildAtlassianContext, registerIntegrationTools } from './integration.js';

// Both products' tokens are present so J1 can prove they share an email but not a token.
process.env.ATLASSIAN_CLOUD_ID = 'cloud-a';
process.env.ATLASSIAN_USER_EMAIL = 'dev@acme.test';
process.env.JIRA_API_TOKEN = 'token-123';
process.env.CONFLUENCE_API_TOKEN = 'confluence-token';

async function buildClient(): Promise<Client> {
  const server = new McpServer({ name: 'test-kit', version: '0.0.0' });
  registerIntegrationTools(server);

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe('kit_jira_get_ticket regression after the buildAtlassianContext refactor (BC21)', () => {
  test('J1: jira and confluence share the cloud id and email but not the token', () => {
    const jira = buildAtlassianContext('jira');
    const confluence = buildAtlassianContext('confluence');

    const decode = (auth: string): string => Buffer.from(auth.replace('Basic ', ''), 'base64').toString('utf8');

    assert.equal(jira.cloudId, 'cloud-a');
    assert.equal(confluence.cloudId, 'cloud-a', 'both products must use the same ATLASSIAN_CLOUD_ID');

    assert.equal(decode(jira.auth), 'dev@acme.test:token-123');
    assert.equal(decode(confluence.auth), 'dev@acme.test:confluence-token');
    assert.notEqual(jira.auth, confluence.auth, 'a per-app scoped token must never cross products');
  });

  test('J2: an invalid ticket ID still returns the pre-existing format message', async () => {
    const client = await buildClient();
    const result = await client.callTool({ name: 'kit_jira_get_ticket', arguments: { ticketId: 'not-a-ticket' } });
    const content = result.content as Array<{ type: string; text: string }>;

    assert.equal(content[0].text, '❌ Invalid ticket ID format: not-a-ticket\n\nExpected format: PROJ-123');
  });
});
