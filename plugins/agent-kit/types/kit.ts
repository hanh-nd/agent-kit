import type { AgentKitSettings } from './security.js';

export interface InitHookInput {
  session_id?: string | number;
}

export type DefaultSettings = Required<AgentKitSettings>;
