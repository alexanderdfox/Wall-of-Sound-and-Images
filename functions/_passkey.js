// Passkey (WebAuthn) helpers for Tchoff
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

/**
 * Get RP ID from request host (strip port, use parent domain for subdomains)
 */
export function getRpId(host) {
  if (!host) return 'localhost';
  const h = host.split(':')[0].toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') return 'localhost';
  return h;
}

export function getOrigin(url) {
  try {
    const u = new URL(url);
    return u.origin;
  } catch {
    return 'https://localhost';
  }
}

/**
 * Generate registration options for adding a passkey (user must be logged in)
 */
export async function createRegistrationOptions(rpId, userName, userID, excludeCredentials = []) {
  return generateRegistrationOptions({
    rpName: 'Tchoff',
    rpID: rpId,
    userName,
    userID: new TextEncoder().encode(userID),
    attestationType: 'none',
    excludeCredentials: excludeCredentials.map((c) => ({ id: c })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
      authenticatorAttachment: 'platform',
    },
  });
}

/**
 * Generate authentication options for signing in with passkey
 */
export async function createAuthenticationOptions(rpId, allowCredentials = []) {
  return generateAuthenticationOptions({
    rpID: rpId,
    allowCredentials: allowCredentials.length > 0 ? allowCredentials.map((id) => ({ id })) : undefined,
    userVerification: 'preferred',
  });
}

/**
 * Verify registration response and return credential to store
 */
export async function verifyRegistration(response, expectedChallenge, origin, rpId) {
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
  });
  if (!result.verified || !result.registrationInfo) return null;
  const cred = result.registrationInfo.credential;
  return {
    credentialID: cred.id,
    publicKey: cred.publicKey,
    counter: cred.counter,
  };
}

/**
 * Verify authentication response
 * credential: { id, publicKey: Uint8Array, counter }
 */
export async function verifyAuthentication(response, expectedChallenge, origin, rpId, credential) {
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
    credential: {
      id: credential.id,
      publicKey: typeof credential.publicKey === 'string'
        ? Uint8Array.from(atob(credential.publicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
        : credential.publicKey instanceof Uint8Array
          ? credential.publicKey
          : new Uint8Array(credential.publicKey),
      counter: credential.counter,
    },
  });
  if (!result.verified) return null;
  return result.authenticationInfo;
}
