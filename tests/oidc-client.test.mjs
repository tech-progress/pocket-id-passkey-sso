import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { validateCallback, validateIdToken } from '../scripts/oidc-test-client.mjs';

test('Callback validation rejects absent, incorrect, reused state and callback suffixes', () => {
    const callback = 'https://issuer.example/callback';
    const consumed = new Set();
    const valid = callback + '?code=test-only-code&state=test-only-state';
    assert.equal(validateCallback(valid, callback, 'test-only-state', consumed), 'test-only-code');
    assert.throws(() => validateCallback(valid, callback, 'test-only-state', consumed), /Reused/);
    for (const actual of [callback + '?code=test-only-code', callback + '?code=test-only-code&state=wrong', callback + '/suffix?code=test-only-code&state=test-only-state', 'https://other.example/callback?code=test-only-code&state=test-only-state']) {
        assert.throws(() => validateCallback(actual, callback, 'test-only-state', new Set()));
    }
});

test('Signed token validation rejects forged signature, issuer, audience, nonce and expiry', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test-key' }] };
    const expected = { issuer: 'https://issuer.example', audience: 'test-only-client', nonce: 'test-only-nonce' };
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url');
    const sign = changes => {
        const payload = Buffer.from(JSON.stringify({ iss: expected.issuer, aud: expected.audience, nonce: expected.nonce, sub: 'test-only-subject', exp: Math.floor(Date.now() / 1000) + 60, ...changes })).toString('base64url');
        const signature = crypto.sign('RSA-SHA256', Buffer.from(header + '.' + payload), privateKey).toString('base64url');
        return header + '.' + payload + '.' + signature;
    };
    assert.equal(validateIdToken(sign({}), jwks, expected).sub, 'test-only-subject');
    for (const changed of [{ iss: 'https://other.example' }, { aud: 'other-client' }, { nonce: 'wrong' }, { nonce: undefined }, { exp: 0 }]) {
        assert.throws(() => validateIdToken(sign(changed), jwks, expected));
    }
    const parts = sign({}).split('.');
    parts[2] = crypto.randomBytes(256).toString('base64url');
    assert.throws(() => validateIdToken(parts.join('.'), jwks, expected), /signature/);
});
