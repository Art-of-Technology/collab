export const AGENT_REQUESTS_FIELD = 'Agent requests';

export function showAgentRequests(fields: unknown, override?: string | string[] | null) {
  const value = Array.isArray(override) ? override[0] : override;
  if (value === '1') return true;
  if (value === '0') return false;
  return Array.isArray(fields) && fields.includes(AGENT_REQUESTS_FIELD);
}
