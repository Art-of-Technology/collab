// Only fixed names and codes are logged; error messages and arbitrary codes may contain secrets.
export function authErrorDiagnostics(error: unknown) {
  const value = typeof error === 'object' && error !== null ? error as Record<string, unknown> : {};
  const codes = [value.code, value.errorCode];
  const transientCode = codes.find((code): code is string => typeof code === 'string' && ['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(code));
  const code = transientCode || codes.find((item): item is string => typeof item === 'string' && ['TOKEN_ENCRYPTION_CONFIGURATION', 'P2002', 'P2003', 'P2025'].includes(item));
  const name = typeof value.name === 'string' && ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'PrismaClientKnownRequestError', 'PrismaClientInitializationError', 'PrismaClientUnknownRequestError'].includes(value.name) ? value.name : 'Error';
  return { code, name, transient: transientCode !== undefined };
}
