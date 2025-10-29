import { NextResponse } from "next/server";

const ISSUER = process.env.AS_ISSUER!;

export async function GET() {
  return NextResponse.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/api/oauth/authorize`,
    token_endpoint: `${ISSUER}/api/oauth/token`,
    revocation_endpoint: `${ISSUER}/api/oauth/revoke`,
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    response_types_supported: ["code"],
    token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
    dpop_signing_alg_values_supported: ["ES256", "EdDSA"],
  });
}
