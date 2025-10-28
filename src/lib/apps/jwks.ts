import { z } from 'zod';

// JWKS (JSON Web Key Set) validation utilities
// Based on RFC 7517 and RFC 7518

// Supported key types for OAuth client authentication
const SupportedKeyTypes = ['RSA', 'EC', 'OKP'] as const;
const SupportedAlgorithms = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'EdDSA'] as const;

// JWK (JSON Web Key) schema
const JWKSchema = z.object({
  kty: z.enum(SupportedKeyTypes, {
    errorMap: () => ({ message: 'Key type must be RSA, EC, or OKP' })
  }),
  use: z.enum(['sig', 'enc']).optional(),
  key_ops: z.array(z.string()).optional(),
  alg: z.enum(SupportedAlgorithms, {
    errorMap: () => ({ message: 'Algorithm must be one of the supported signing algorithms' })
  }).optional(),
  kid: z.string().min(1, 'Key ID (kid) is required'),
  
  // RSA key parameters
  n: z.string().optional(), // modulus
  e: z.string().optional(), // exponent
  
  // EC key parameters  
  crv: z.string().optional(), // curve
  x: z.string().optional(),   // x coordinate
  y: z.string().optional(),   // y coordinate
  
  // OKP key parameters (Ed25519/Ed448)
  // x: already defined above for EC
  
  // Additional fields
  x5c: z.array(z.string()).optional(), // X.509 certificate chain
  x5t: z.string().optional(),          // X.509 thumbprint
  'x5t#S256': z.string().optional()    // X.509 thumbprint (SHA-256)
}).refine((key) => {
  // Validate key-specific parameters
  if (key.kty === 'RSA') {
    return key.n && key.e; // RSA keys must have modulus and exponent
  }
  if (key.kty === 'EC') {
    return key.crv && key.x && key.y; // EC keys must have curve and coordinates
  }
  if (key.kty === 'OKP') {
    return key.crv && key.x; // OKP keys must have curve and x coordinate
  }
  return false;
}, {
  message: 'Invalid key parameters for the specified key type'
});

// JWKS (JSON Web Key Set) schema
const JWKSSchema = z.object({
  keys: z.array(JWKSchema).min(1, 'At least one key is required in the key set')
});

interface JWKSValidationResult {
  valid: boolean;
  error?: string;
  keyCount?: number;
  supportedKeys?: number;
  warnings?: string[];
}

/**
 * Fetch and validate JWKS from a URI
 */
export async function validateJWKS(jwksUri: string): Promise<JWKSValidationResult> {
  try {
    // Validate URI format
    const url = new URL(jwksUri);
    if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
      return {
        valid: false,
        error: 'JWKS URI must use HTTPS in production'
      };
    }

    // Fetch JWKS
    const response = await fetch(jwksUri, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Collab-App-Platform/1.0'
      },
      signal: AbortSignal.timeout(10000) // 10 seconds timeout
    });

    if (!response.ok) {
      return {
        valid: false,
        error: `Failed to fetch JWKS: ${response.status} ${response.statusText}`
      };
    }

    // Parse JSON
    let jwksData: unknown;
    try {
      jwksData = await response.json();
    } catch (error) {
      return {
        valid: false,
        error: 'Invalid JSON in JWKS response'
      };
    }

    // Validate JWKS structure
    const parseResult = JWKSSchema.safeParse(jwksData);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map(issue => 
        `${issue.path.join('.')}: ${issue.message}`
      ).join(', ');
      return {
        valid: false,
        error: `JWKS validation failed: ${issues}`
      };
    }

    const jwks = parseResult.data;
    const warnings: string[] = [];
    let supportedKeys = 0;

    // Additional validation for each key
    for (const key of jwks.keys) {
      // Check for signing use
      if (key.use && key.use !== 'sig') {
        warnings.push(`Key ${key.kid}: use should be 'sig' for OAuth client authentication`);
        continue;
      }

      // Check key operations
      if (key.key_ops && !key.key_ops.includes('sign')) {
        warnings.push(`Key ${key.kid}: key_ops should include 'sign' for OAuth client authentication`);
        continue;
      }

      // Validate RSA key size (minimum 2048 bits)
      if (key.kty === 'RSA' && key.n) {
        try {
          const modulus = Buffer.from(key.n, 'base64url');
          const keySize = modulus.length * 8;
          if (keySize < 2048) {
            warnings.push(`Key ${key.kid}: RSA key size (${keySize} bits) is below recommended minimum of 2048 bits`);
            continue;
          }
        } catch (error) {
          warnings.push(`Key ${key.kid}: Invalid RSA modulus encoding`);
          continue;
        }
      }

      // Validate EC curves
      if (key.kty === 'EC' && key.crv) {
        const supportedCurves = ['P-256', 'P-384', 'P-521'];
        if (!supportedCurves.includes(key.crv)) {
          warnings.push(`Key ${key.kid}: EC curve '${key.crv}' may not be supported`);
          continue;
        }
      }

      // Validate OKP curves
      if (key.kty === 'OKP' && key.crv) {
        const supportedCurves = ['Ed25519', 'Ed448'];
        if (!supportedCurves.includes(key.crv)) {
          warnings.push(`Key ${key.kid}: OKP curve '${key.crv}' may not be supported`);
          continue;
        }
      }

      supportedKeys++;
    }

    if (supportedKeys === 0) {
      return {
        valid: false,
        error: 'No valid signing keys found in JWKS',
        keyCount: jwks.keys.length,
        supportedKeys: 0,
        warnings
      };
    }

    return {
      valid: true,
      keyCount: jwks.keys.length,
      supportedKeys,
      warnings: warnings.length > 0 ? warnings : undefined
    };

  } catch (error) {
    return {
      valid: false,
      error: `JWKS validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Validate a single JWK for OAuth client authentication
 */
export function validateJWK(jwk: unknown): { valid: boolean; error?: string } {
  const parseResult = JWKSchema.safeParse(jwk);
  if (!parseResult.success) {
    const issues = parseResult.error.issues.map(issue => 
      `${issue.path.join('.')}: ${issue.message}`
    ).join(', ');
    return {
      valid: false,
      error: `JWK validation failed: ${issues}`
    };
  }

  return { valid: true };
}

/**
 * Extract key IDs from JWKS for display purposes
 */
export async function getJWKSKeyIds(jwksUri: string): Promise<string[]> {
  try {
    const response = await fetch(jwksUri, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Collab-App-Platform/1.0'
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return [];
    }

    const jwks = await response.json();
    if (jwks.keys && Array.isArray(jwks.keys)) {
      return jwks.keys
        .filter((key: any) => key.kid)
        .map((key: any) => key.kid);
    }

    return [];
  } catch (error) {
    console.error('Error fetching JWKS key IDs:', error);
    return [];
  }
}

/**
 * Check if JWKS URI is reachable
 */
export async function isJWKSReachable(jwksUri: string): Promise<boolean> {
  try {
    const response = await fetch(jwksUri, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

export type { JWKSValidationResult };
