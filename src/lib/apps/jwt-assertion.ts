import { JWTPayload, jwtVerify, importJWK } from 'jose';

interface ClientAssertionPayload extends JWTPayload {
  iss: string; // client_id (issuer)
  sub: string; // client_id (subject)  
  aud: string; // token endpoint URL (audience)
  jti: string; // unique identifier for the JWT
  exp: number; // expiration time
  iat: number; // issued at time
}

interface JWTValidationResult {
  valid: boolean;
  error?: string;
  payload?: ClientAssertionPayload;
}

/**
 * Validate JWT client assertion for private_key_jwt authentication
 */
export async function validateClientAssertion(
  assertion: string,
  clientId: string,
  jwksUri: string,
  tokenEndpoint: string
): Promise<JWTValidationResult> {
  try {
    // Fetch JWKS
    const jwksResponse = await fetch(jwksUri, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Collab-App-Platform/1.0'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!jwksResponse.ok) {
      return {
        valid: false,
        error: `Failed to fetch JWKS: ${jwksResponse.status}`
      };
    }

    const jwks = await jwksResponse.json();
    if (!jwks.keys || !Array.isArray(jwks.keys)) {
      return {
        valid: false,
        error: 'Invalid JWKS format'
      };
    }

    // Parse JWT header to get key ID
    let header: any;
    try {
      const headerB64 = assertion.split('.')[0];
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    } catch (error) {
      return {
        valid: false,
        error: 'Invalid JWT format'
      };
    }

    // Find the key in JWKS
    const jwk = jwks.keys.find((key: any) => key.kid === header.kid);
    if (!jwk) {
      return {
        valid: false,
        error: `Key with ID '${header.kid}' not found in JWKS`
      };
    }

    // Import the JWK
    let publicKey: any;
    try {
      publicKey = await importJWK(jwk);
    } catch (error) {
      return {
        valid: false,
        error: 'Failed to import JWK'
      };
    }

    // Verify the JWT
    let result: any;
    try {
      result = await jwtVerify(assertion, publicKey, {
        issuer: clientId,
        subject: clientId,
        audience: tokenEndpoint,
        clockTolerance: 30 // Allow 30 seconds clock skew
      });
    } catch (error) {
      return {
        valid: false,
        error: `JWT verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }

    const payload = result.payload as ClientAssertionPayload;

    // Additional validations
    if (!payload.jti) {
      return {
        valid: false,
        error: 'JWT ID (jti) is required'
      };
    }

    // Check expiration (should be short-lived, max 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp - payload.iat > 300) {
      return {
        valid: false,
        error: 'JWT assertion validity period too long (max 5 minutes)'
      };
    }

    return {
      valid: true,
      payload
    };

  } catch (error) {
    return {
      valid: false,
      error: `JWT assertion validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Generate a unique token endpoint URL for JWT audience validation
 */
export function getTokenEndpointUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/oauth/token`;
}

/**
 * Check if a JWT has been used before (replay protection)
 * This should be implemented with a cache/database to store used JTIs
 */
export async function isJWTReplayAttack(jti: string, exp: number): Promise<boolean> {
  // TODO: Implement JTI tracking in database or cache
  // For now, we'll just return false (no replay detection)
  // In production, you should store JTIs until their expiration
  return false;
}

export type { ClientAssertionPayload, JWTValidationResult };
