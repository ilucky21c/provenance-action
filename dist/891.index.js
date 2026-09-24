"use strict";
exports.id = 891;
exports.ids = [891];
exports.modules = {

/***/ 1044:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   MI: () => (/* binding */ noticeSigningPayload),
/* harmony export */   aK: () => (/* binding */ declarationSigningPayload)
/* harmony export */ });
/* unused harmony exports CanonicalError, CHALLENGE_DOMAIN, REVOCATION_DOMAIN, ATTESTATION_DOMAIN, ATTESTATION_WITHDRAWAL_DOMAIN, NOTICE_DOMAIN, challengePayload, revocationPayload, attestationSigningPayload, attestationWithdrawalPayload, canonicalJson, DECLARATION_SIGNING_DOMAIN */
/**
 * provenance-protocol — canonical form for signing declarations
 *
 * Spec 0.1 signed only "<provenance_id>:<public_key>", so a signature proved
 * key control but left the rest of the declaration unprotected: a constraint
 * could be deleted and the signature would still verify. Spec 0.2 signs the
 * whole declaration, which needs one canonical serialisation that every
 * implementation agrees on byte for byte.
 *
 * Canonicalisation applies to the PARSED value, not the file's bytes. Comments,
 * indentation, quoting style and key order therefore do not affect the
 * signature — a declaration can be reformatted without re-signing, which is
 * what anyone would expect.
 *
 * Rules:
 *   - JSON Canonicalization Scheme (JCS, RFC 8785): object keys sorted by
 *     UTF-16 code units, recursively — which is what Array.prototype.sort()
 *     does by default — and strings/numbers serialised as JSON.stringify does
 *   - no insignificant whitespace
 *   - `identity.signature` removed before signing (it cannot cover itself)
 *   - only JSON-representable values; anything else throws rather than being
 *     silently coerced into an ambiguous signature
 */

/** Thrown when a declaration contains something that cannot be canonicalised. */
class CanonicalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CanonicalError';
  }
}

const DOMAIN = 'provenance-declaration-v1';

/**
 * Every distinct thing an agent key signs gets its own prefix, so a signature
 * obtained for one purpose can never be presented as another.
 *
 * This is not theoretical. Spec 0.1 signed a challenge as "<id>:<nonce>" and a
 * revocation as "<id>:REVOKE" — the same payload with a chosen nonce. Any
 * publicly reachable endpoint that signs a caller-supplied nonce therefore
 * hands out valid revocation signatures for its own key, letting a stranger
 * revoke the agent. A key lifted into the nonce likewise reproduces the 0.1
 * declaration payload.
 *
 * The separated forms below cannot be confused with each other whatever the
 * caller supplies.
 */
const CHALLENGE_DOMAIN = 'provenance-challenge-v1';
const REVOCATION_DOMAIN = 'provenance-revocation-v1';

const ATTESTATION_DOMAIN = 'provenance-attestation-v1';
const ATTESTATION_WITHDRAWAL_DOMAIN = 'provenance-attestation-withdrawal-v1';
const NOTICE_DOMAIN = 'provenance-notice-v1';

/** Payload for proving live control of a key. Nonce must be single-use. */
function challengePayload(provenanceId, nonce) {
  if (typeof provenanceId !== 'string' || provenanceId.length === 0) {
    throw new CanonicalError('provenanceId is required');
  }
  if (typeof nonce !== 'string' || nonce.length === 0) {
    throw new CanonicalError('nonce is required');
  }
  return `${CHALLENGE_DOMAIN}:${provenanceId}:${nonce}`;
}

/** Payload for revoking a provenance id. Carries no caller-supplied input. */
function revocationPayload(provenanceId) {
  if (typeof provenanceId !== 'string' || provenanceId.length === 0) {
    throw new CanonicalError('provenanceId is required');
  }
  return `${REVOCATION_DOMAIN}:${provenanceId}`;
}

function canonicalValue(value, path = '$') {
  if (value === null) return 'null';

  const type = typeof value;

  if (type === 'string') return JSON.stringify(value);
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'number') {
    if (!Number.isFinite(value)) {
      throw new CanonicalError(`${path}: non-finite numbers cannot be signed`);
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item, i) => canonicalValue(item, `${path}[${i}]`)).join(',')}]`;
  }

  if (type === 'object') {
    // A YAML parser may produce Dates, Maps, Buffers and so on. Signing those
    // would depend on whichever serialisation happened to be used, so refuse.
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new CanonicalError(
        `${path}: only plain objects can be signed (got ${value.constructor?.name ?? 'unknown type'}) — quote the value as a string`
      );
    }
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    const parts = keys.map(
      (k) => `${JSON.stringify(k)}:${canonicalValue(value[k], `${path}.${k}`)}`
    );
    return `{${parts.join(',')}}`;
  }

  throw new CanonicalError(`${path}: values of type ${type} cannot be signed`);
}

/**
 * The exact string a spec-0.2 declaration signature is computed over.
 *
 * Domain-separated so a declaration signature can never be replayed as a
 * signature over some other kind of message.
 *
 * @param {object} declaration  Parsed declaration (its identity.signature is ignored)
 * @returns {string}
 */
function declarationSigningPayload(declaration) {
  if (declaration === null || typeof declaration !== 'object' || Array.isArray(declaration)) {
    throw new CanonicalError('Declaration must be a parsed object');
  }

  const { identity, ...rest } = declaration;
  const covered = { ...rest };

  if (identity !== undefined) {
    if (identity === null || typeof identity !== 'object' || Array.isArray(identity)) {
      throw new CanonicalError('$.identity must be an object when present');
    }
    // public_key and algorithm ARE covered; only the signature is excluded.
    const { signature: _excluded, ...identityRest } = identity;
    covered.identity = identityRest;
  }

  return `${DOMAIN}:${canonicalValue(covered)}`;
}

/**
 * The exact string an attestation signature is computed over: the canonical
 * form of the whole attestation with its own `signature` removed.
 *
 * Its own prefix means an attestation signature can never be passed off as a
 * declaration, a challenge or a revocation signed by the same key — an issuer
 * is usually also an agent with a declaration of its own.
 *
 * @param {object} attestation
 * @returns {string}
 */
function attestationSigningPayload(attestation) {
  if (attestation === null || typeof attestation !== 'object' || Array.isArray(attestation)) {
    throw new CanonicalError('Attestation must be a parsed object');
  }
  const { signature: _excluded, ...covered } = attestation;
  return `${ATTESTATION_DOMAIN}:${canonicalValue(covered)}`;
}

/**
 * Payload an issuer signs to withdraw one of its own attestations before it
 * expires. Carries nothing but the two identifiers.
 */
function attestationWithdrawalPayload(issuerId, attestationId) {
  if (typeof issuerId !== 'string' || issuerId.length === 0) {
    throw new CanonicalError('issuerId is required');
  }
  if (typeof attestationId !== 'string' || attestationId.length === 0) {
    throw new CanonicalError('attestationId is required');
  }
  // Canonical JSON rather than a colon-joined string: identifiers contain
  // colons, and "a:b" + "c" must not sign the same bytes as "a" + "b:c".
  return `${ATTESTATION_WITHDRAWAL_DOMAIN}:${canonicalValue({ attestation_id: attestationId, issuer: issuerId })}`;
}

/**
 * The exact string a notice signature is computed over: the canonical form of
 * the whole notice with its own `signature` removed.
 *
 * A notice is what an agent's operator says about the agent, signed with the
 * agent's own key — the counterpart of an attestation, which a third party
 * signs. Its own prefix keeps it from being passed off as either.
 *
 * @param {object} notice
 * @returns {string}
 */
function noticeSigningPayload(notice) {
  if (notice === null || typeof notice !== 'object' || Array.isArray(notice)) {
    throw new CanonicalError('Notice must be a parsed object');
  }
  const { signature: _excluded, ...covered } = notice;
  return `${NOTICE_DOMAIN}:${canonicalValue(covered)}`;
}

/**
 * Canonical JSON (JCS, RFC 8785) of any plain value: keys sorted by UTF-16 code
 * units at every depth, no insignificant whitespace. The building block the signing payloads use,
 * exported for protocols layered on this one that need the same guarantee.
 *
 * @param {unknown} value
 * @returns {string}
 */
function canonicalJson(value) {
  return canonicalValue(value);
}




/***/ }),

/***/ 4891:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   signNotice: () => (/* binding */ signNotice)
/* harmony export */ });
/* unused harmony exports generateProvenanceKeyPair, signChallenge, signRevocation, signAgentChallenge, signAgentRevocation, signDeclaration, signForProvenance, signAttestation, signAttestationWithdrawal */
/* harmony import */ var crypto__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(6982);
/* harmony import */ var _canonical_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(1044);
/**
 * provenance-protocol — Key generation and signing utilities
 *
 * Agent operators use this to:
 *   1. Generate an Ed25519 keypair once (setup)
 *   2. Put the public key in PROVENANCE.yml under identity.public_key
 *   3. Keep the private key in their environment (never committed, never shared)
 *   4. Sign their declaration, and challenges from receiving systems at runtime
 *
 * Attesters (anyone issuing statements about other agents) use it to sign
 * attestations and withdrawals.
 *
 * Usage (one-time setup):
 *   import { generateProvenanceKeyPair } from 'provenance-protocol/keygen';
 *   const { publicKey, privateKey } = generateProvenanceKeyPair();
 *   // Add publicKey to your PROVENANCE.yml:
 *   //   identity:
 *   //     public_key: "<publicKey>"
 *   // Store privateKey as an environment variable: PROVENANCE_PRIVATE_KEY=<privateKey>
 *
 * Usage (runtime — proving key control to a caller):
 *   import { signAgentChallenge } from 'provenance-protocol/keygen';
 *   const signature = signAgentChallenge(process.env.PROVENANCE_PRIVATE_KEY, provenanceId, nonce);
 *
 * Note: This module uses Node.js built-in crypto. It is Node-only (not browser).
 * The verification side (verify.js) uses Web Crypto and works everywhere.
 */




/**
 * Generate a new Ed25519 keypair for use with Provenance identity.
 *
 * Run this once during agent setup. Add the public key to PROVENANCE.yml.
 * Store the private key securely as an environment variable.
 *
 * @returns {{ publicKey: string, privateKey: string }}
 *   publicKey  — base64-encoded SPKI DER. Goes in PROVENANCE.yml identity.public_key
 *   privateKey — base64-encoded PKCS8 DER. Store as PROVENANCE_PRIVATE_KEY env var
 *
 * Example:
 *   const { publicKey, privateKey } = generateProvenanceKeyPair();
 *   console.log('Add to PROVENANCE.yml:');
 *   console.log('identity:');
 *   console.log(`  public_key: "${publicKey}"`);
 *   console.log('\nStore as environment variable:');
 *   console.log(`PROVENANCE_PRIVATE_KEY=${privateKey}`);
 */
function generateProvenanceKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });

  return {
    publicKey: Buffer.from(publicKey).toString('base64'),
    privateKey: Buffer.from(privateKey).toString('base64'),
  };
}

/**
 * Sign a challenge from a receiving system — LEGACY, spec 0.1 form.
 *
 * Signs "<provenanceId>:<nonce>", which is indistinguishable from a revocation
 * when the nonce is "REVOKE". NEVER expose an endpoint that calls this with a
 * caller-supplied nonce: a stranger can use it to revoke your key. Use
 * `signAgentChallenge` instead.
 *
 * Call this when a receiving system sends you a nonce to prove your identity.
 * The signed message is always `${provenanceId}:${nonce}` — this binds the
 * signature to your specific identity and prevents replay attacks.
 *
 * @param {string} privateKeyBase64  Your PROVENANCE_PRIVATE_KEY (base64 PKCS8 DER)
 * @param {string} provenanceId     Your provenance ID, e.g. "provenance:github:alice/agent"
 * @param {string} nonce            The nonce sent by the receiving system
 * @returns {string}                Base64-encoded signature to return to the receiver
 *
 * Example:
 *   app.post('/prove-identity', (req, res) => {
 *     const { provenanceId, nonce } = req.body;
 *     const signature = signChallenge(
 *       process.env.PROVENANCE_PRIVATE_KEY,
 *       provenanceId,
 *       nonce
 *     );
 *     res.json({ signature });
 *   });
 */
function signChallenge(privateKeyBase64, provenanceId, nonce) {
  const keyBuffer = Buffer.from(privateKeyBase64, 'base64');
  const privateKey = createPrivateKey({ key: keyBuffer, format: 'der', type: 'pkcs8' });
  const message = Buffer.from(`${provenanceId}:${nonce}`, 'utf8');
  return sign(null, message, privateKey).toString('base64');
}

/**
 * Sign a revocation request — LEGACY, spec 0.1 payload "<provenanceId>:REVOKE".
 *
 * Kept for services that still accept it. Prefer `signAgentRevocation`: the
 * legacy form is the same shape as a legacy challenge, so any endpoint signing
 * challenges in that form also hands out revocations.
 *
 * @param {string} privateKeyBase64  Your current PROVENANCE_PRIVATE_KEY
 * @param {string} provenanceId     Your agent's Provenance ID
 * @returns {string}                Base64 signature, for whichever registry or
 *                                  attester you publish revocations to
 */
function signRevocation(privateKeyBase64, provenanceId) {
  return signChallenge(privateKeyBase64, provenanceId, 'REVOKE');
}

function _sign(privateKeyBase64, message) {
  const privateKey = (0,crypto__WEBPACK_IMPORTED_MODULE_0__.createPrivateKey)({
    key: Buffer.from(privateKeyBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  return (0,crypto__WEBPACK_IMPORTED_MODULE_0__.sign)(null, Buffer.from(message, 'utf8'), privateKey).toString('base64');
}

/**
 * Prove live control of a key against a nonce — domain-separated form.
 *
 * Use this for any endpoint a stranger can call. The legacy `signChallenge`
 * signs "<provenanceId>:<nonce>", which is the same shape as a revocation with
 * nonce "REVOKE" — so exposing that publicly lets a caller obtain a valid
 * revocation signature for your own key and revoke you. This form cannot be
 * confused with a revocation or a declaration whatever nonce is supplied.
 *
 * @param {string} privateKeyBase64
 * @param {string} provenanceId
 * @param {string} nonce            Single-use and unpredictable
 * @returns {string}                Base64 signature
 */
function signAgentChallenge(privateKeyBase64, provenanceId, nonce) {
  return _sign(privateKeyBase64, challengePayload(provenanceId, nonce));
}

/**
 * Revoke a provenance id — domain-separated form.
 *
 * Takes no caller-supplied input, so it cannot be produced by a challenge
 * endpoint however it is called.
 *
 * @param {string} privateKeyBase64
 * @param {string} provenanceId
 * @returns {string}                Base64 signature
 */
function signAgentRevocation(privateKeyBase64, provenanceId) {
  return _sign(privateKeyBase64, revocationPayload(provenanceId));
}

/**
 * Sign a whole declaration — spec 0.2.
 *
 * Covers every field, so deleting a constraint or adding a capability breaks
 * the signature. `signForProvenance` (spec 0.1) covers only the identity and
 * key, which leaves the rest of the declaration unprotected; prefer this.
 *
 * Signs the canonical form of the PARSED declaration, so reformatting the file
 * does not invalidate the signature.
 *
 * @param {string} privateKeyBase64  Base64 PKCS8 DER private key
 * @param {object} declaration       Parsed declaration; identity.signature is ignored
 * @returns {string}                 Base64 signature — put it in identity.signature
 */
function signDeclaration(privateKeyBase64, declaration) {
  const keyBuffer = Buffer.from(privateKeyBase64, 'base64');
  const privateKey = createPrivateKey({ key: keyBuffer, format: 'der', type: 'pkcs8' });
  const message = Buffer.from(declarationSigningPayload(declaration), 'utf8');
  return sign(null, message, privateKey).toString('base64');
}

/**
 * Sign your PROVENANCE.yml identity claim — LEGACY, spec 0.1.
 *
 * Covers only the identity and key, not the rest of the declaration. Use
 * `signDeclaration` for new declarations.
 *
 * Call this once after generating your keypair to produce the `identity.signature`
 * value that goes into PROVENANCE.yml. The signature proves you control the private
 * key that matches the public key in the file.
 *
 * The signed message is `${provenanceId}:${publicKeyBase64}` — this binds the key
 * pair to your specific Provenance ID, preventing key reuse across identities.
 *
 * @param {string} privateKeyBase64  Your PROVENANCE_PRIVATE_KEY (base64 PKCS8 DER)
 * @param {string} provenanceId     Your agent's Provenance ID, e.g. "provenance:github:alice/agent"
 * @param {string} publicKeyBase64  The public key you're registering (base64 SPKI DER)
 * @returns {string}                Base64-encoded signature — put this in identity.signature
 *
 * Example (one-time setup):
 *   import { generateProvenanceKeyPair, signForProvenance } from 'provenance-protocol/keygen';
 *   const { publicKey, privateKey } = generateProvenanceKeyPair();
 *   const id = 'provenance:github:your-org/your-agent';
 *   const signature = signForProvenance(privateKey, id, publicKey);
 *   console.log('Add to PROVENANCE.yml:');
 *   console.log('identity:');
 *   console.log(`  public_key: "${publicKey}"`);
 *   console.log(`  signature: "${signature}"`);
 */
function signForProvenance(privateKeyBase64, provenanceId, publicKeyBase64) {
  const keyBuffer = Buffer.from(privateKeyBase64, 'base64');
  const privateKey = createPrivateKey({ key: keyBuffer, format: 'der', type: 'pkcs8' });
  const message = Buffer.from(`${provenanceId}:${publicKeyBase64}`, 'utf8');
  return sign(null, message, privateKey).toString('base64');
}

/**
 * Sign an attestation — a statement you, as issuer, make about another agent.
 *
 * Covers every field except `signature`. Set `issuer.key_fingerprint` to the
 * fingerprint of the key you sign with (`keyFingerprint` in ./verify.js), or
 * no verifier will accept it.
 *
 * @param {string} privateKeyBase64  Issuer's base64 PKCS8 DER private key
 * @param {object} attestation       Attestation; any existing signature is ignored
 * @returns {string}                 Base64 signature — put it in `signature`
 */
function signAttestation(privateKeyBase64, attestation) {
  return _sign(privateKeyBase64, attestationSigningPayload(attestation));
}

/**
 * Withdraw an attestation you issued, before its validity window ends.
 * Publish the result at the attestation's `status_url`.
 *
 * @param {string} privateKeyBase64
 * @param {string} issuerId        Your provenance id, as in issuer.provenance_id
 * @param {string} attestationId   The attestation's id
 * @returns {string}               Base64 signature
 */
function signAttestationWithdrawal(privateKeyBase64, issuerId, attestationId) {
  return _sign(privateKeyBase64, attestationWithdrawalPayload(issuerId, attestationId));
}

/**
 * Sign a notice — a statement the operator makes about its own agent: a
 * declaration published, a release shipped, a key rotated, an incident.
 *
 * Signed with the agent's own key, except `key-rotation`, which is signed
 * with the OLD key so that the new key arrives vouched for by the one a
 * watcher already trusts.
 *
 * @param {string} privateKeyBase64
 * @param {object} notice   Any existing signature is ignored
 * @returns {string}        Base64 signature — put it in `signature`
 */
function signNotice(privateKeyBase64, notice) {
  return _sign(privateKeyBase64, (0,_canonical_js__WEBPACK_IMPORTED_MODULE_1__/* .noticeSigningPayload */ .MI)(notice));
}


/***/ })

};
;
//# sourceMappingURL=891.index.js.map