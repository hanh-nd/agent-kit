import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerCoreTools } from './core.js';
import { registerAgentTools } from './agent.js';
import { registerIntegrationTools } from './integration.js';

const EXPECTED_NON_MEMORY_TOOLS = [
  'kit_save_handoff',
  'kit_trigger_agent',
  'kit_get_bitbucket_pr',
  'kit_jira_get_ticket',
  'kit_confluence_get_page',
];

async function buildClientWithTools(): Promise<Client> {
  const server = new McpServer({ name: 'test-kit', version: '0.0.0' });
  registerIntegrationTools(server);
  registerCoreTools(server);
  registerAgentTools(server);

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe('MCP tool registration smoke tests', () => {
  test('R1: all 5 non-memory tool names are registered', async () => {
    const client = await buildClientWithTools();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);

    for (const expected of EXPECTED_NON_MEMORY_TOOLS) {
      assert.ok(names.includes(expected), `expected tool "${expected}" to be registered, got: ${names.join(', ')}`);
    }
  });

  test('R2: each non-memory tool has a non-empty description and inputSchema (BC3)', async () => {
    const client = await buildClientWithTools();
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

    for (const name of EXPECTED_NON_MEMORY_TOOLS) {
      const tool = byName[name];
      assert.ok(tool, `tool "${name}" not found`);
      assert.ok(tool.description && tool.description.length > 0, `tool "${name}" must have a non-empty description`);
      assert.ok(tool.inputSchema, `tool "${name}" must have an inputSchema`);
    }
  });

  test('R3: kit_trigger_agent (readOnlyHint:false) has correct annotations (BC5)', async () => {
    const client = await buildClientWithTools();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'kit_trigger_agent');

    assert.ok(tool, 'kit_trigger_agent must be registered');
    assert.ok(tool.annotations, 'kit_trigger_agent must have annotations');
    assert.equal(tool.annotations.readOnlyHint, false, 'readOnlyHint must be false');
    assert.equal(tool.annotations.destructiveHint, true, 'destructiveHint must be true');
    assert.equal(tool.annotations.idempotentHint, false, 'idempotentHint must be false');
    assert.equal(tool.annotations.openWorldHint, true, 'openWorldHint must be true');
  });

  test('R4: kit_save_handoff (readOnlyHint:false) has correct annotations (BC5)', async () => {
    const client = await buildClientWithTools();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'kit_save_handoff');

    assert.ok(tool, 'kit_save_handoff must be registered');
    assert.ok(tool.annotations, 'kit_save_handoff must have annotations');
    assert.equal(tool.annotations.readOnlyHint, false, 'readOnlyHint must be false');
    assert.equal(tool.annotations.destructiveHint, false, 'destructiveHint must be false');
    assert.equal(tool.annotations.idempotentHint, true, 'idempotentHint must be true');
    assert.equal(tool.annotations.openWorldHint, false, 'openWorldHint must be false');
  });

  test('R5: kit_get_bitbucket_pr (readOnlyHint:true) has correct annotations (BC5)', async () => {
    const client = await buildClientWithTools();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'kit_get_bitbucket_pr');

    assert.ok(tool, 'kit_get_bitbucket_pr must be registered');
    assert.ok(tool.annotations, 'kit_get_bitbucket_pr must have annotations');
    assert.equal(tool.annotations.readOnlyHint, true, 'readOnlyHint must be true');
    assert.equal(tool.annotations.idempotentHint, true, 'idempotentHint must be true');
    assert.equal(tool.annotations.openWorldHint, true, 'openWorldHint must be true');
  });

  test('R6: kit_confluence_get_page (readOnlyHint:true) has correct annotations (BC1)', async () => {
    const client = await buildClientWithTools();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'kit_confluence_get_page');

    assert.ok(tool, 'kit_confluence_get_page must be registered');
    assert.ok(tool.annotations, 'kit_confluence_get_page must have annotations');
    assert.equal(tool.annotations.readOnlyHint, true, 'readOnlyHint must be true');
    assert.equal(tool.annotations.idempotentHint, true, 'idempotentHint must be true');
    assert.equal(tool.annotations.openWorldHint, true, 'openWorldHint must be true');
  });
});
