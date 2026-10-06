import assert from 'node:assert/strict';
import crypto from 'node:crypto';

export function validateCallback(actual, callback, expectedState, consumedStates) {
    const received = new URL(actual);
    const registered = new URL(callback);
    assert.equal(received.origin, registered.origin, 'Invalid callback origin');
    assert.equal(received.pathname, registered.pathname, 'Invalid callback path');
    assert.ok(!received.hash, 'Callback fragment is unsupported');
    assert.ok(expectedState && received.searchParams.get('state') === expectedState, 'Invalid callback state');
    assert.ok(!consumedStates.has(expectedState), 'Reused callback state');
    assert.ok(received.searchParams.get('code') && !received.searchParams.get('error'), 'Authorization did not produce a code');
    consumedStates.add(expectedState);
    return received.searchParams.get('code');
}

export function validateIdToken(token, jwks, expected) {
    const parts = token.split('.');
    assert.equal(parts.length, 3, 'Invalid signed token structure');
    const [encodedHeader, encodedPayload, signature] = parts;
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url'));
    const claims = JSON.parse(Buffer.from(encodedPayload, 'base64url'));
    assert.equal(header.alg, 'RS256', 'Unexpected signing algorithm');
    const signing = jwks.keys.find(key => key.kid === header.kid);
    assert.ok(signing, 'Unknown signing key');
    const key = crypto.createPublicKey({ key: signing, format: 'jwk' });
    assert.ok(crypto.verify('RSA-SHA256', Buffer.from(encodedHeader + '.' + encodedPayload), key, Buffer.from(signature, 'base64url')), 'Invalid token signature');
    assert.equal(claims.iss, expected.issuer, 'Invalid token issuer');
    assert.deepEqual(Array.isArray(claims.aud) ? claims.aud : [claims.aud], [expected.audience], 'Invalid token audience');
    assert.ok(expected.nonce && claims.nonce === expected.nonce, 'Invalid token nonce');
    assert.ok(claims.exp > Date.now() / 1000 && claims.sub, 'Expired token or missing subject');
    return claims;
}
