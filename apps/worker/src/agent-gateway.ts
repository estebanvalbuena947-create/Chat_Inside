import {
  getAgentInvocationEligibility,
  parseAgentInvocation,
  parseAgentOutput,
  type AgentInvocation,
  type AgentOutput,
  type AutomationMode
} from '@chat-zernio/domain';

export type AgentGatewayTransport = {
  request(input: AgentInvocation): Promise<unknown>;
};

export type AgentGatewayResult =
  | { kind: 'decision'; output: AgentOutput }
  | { kind: 'skipped'; reason: 'automation_not_auto' };

export async function requestAgentDecision(
  transport: AgentGatewayTransport,
  automationMode: AutomationMode,
  input: AgentInvocation
): Promise<AgentGatewayResult> {
  const eligibility = getAgentInvocationEligibility(automationMode);
  if (!eligibility.allowed) return { kind: 'skipped', reason: eligibility.reason };

  const request = parseAgentInvocation(input);
  const response = await transport.request(request);
  return { kind: 'decision', output: parseAgentOutput(response) };
}
