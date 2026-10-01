import {
  agentInvocationSchema,
  agentOutputSchema,
  type AgentInvocation,
  type AgentOutput,
  type AutomationMode
} from '@chat-zernio/contracts';

export type { AgentInvocation, AgentOutput, AutomationMode };

export function parseAgentInvocation(value: unknown): AgentInvocation {
  return agentInvocationSchema.parse(value);
}

export function parseAgentOutput(value: unknown): AgentOutput {
  return agentOutputSchema.parse(value);
}
