import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const tooling = process.env.POCKET_PLAYWRIGHT_MODULE || path.resolve('evidence/browser-tooling/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(tooling));
const work = process.env.POCKET_BROWSER_WORK;
const origin = process.env.APP_URL;
const project = process.env.POCKET_BROWSER_PROJECT;
assert.equal(origin, 'https://localhost:18428');
const compose = ['compose', '-p', project, '-f', path.resolve('compose.yaml')];
const docker = (args, options = {}) => execFileSync('docker', args, { timeout: 150000, stdio: ['pipe', 'pipe', 'pipe'], ...options });
const server = https.createServer({ key: fs.readFileSync(path.join(work, 'key.pem')), cert: fs.readFileSync(path.join(work, 'cert.pem')) }, (request, response) => {
    if (request.url.startsWith('/relying-party/callback')) {
        response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
        response.end('Disposable relying-party callback');
        return;
    }
    const upstream = http.request({ hostname: '127.0.0.1', port: 18427, path: request.url, method: request.method, headers: request.headers }, (result) => {
        response.writeHead(result.statusCode, result.headers);
        result.pipe(response);
    });
    upstream.on('error', () => { response.writeHead(502); response.end(); });
    request.pipe(upstream);
});
await new Promise((resolve) => server.listen(18428, '127.0.0.1', resolve));
let browser;
try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.POCKET_CHROMIUM || chromium.executablePath(), args: ['--no-sandbox'] });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const client = await context.newCDPSession(page);
    await client.send('WebAuthn.enable');
    const authenticator = () => client.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'usb', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    const first = (await authenticator()).authenticatorId;
    const outsider = await browser.newContext({ ignoreHTTPSErrors: true });
    for (const route of ['/setup', '/api/signup/setup', '/api/users', '/.well-known/openid-configuration']) {
        assert.equal((await outsider.request.get(origin + route)).status(), 403, 'Outsider crossed cold owner boundary');
    }
    await outsider.close();
    await page.goto(origin + '/_operator');
    await page.getByLabel('Operator token').fill(process.env.GATE_ADMIN_TOKEN);
    const operatorResponse = page.waitForResponse((response) => response.url() === origin + '/_operator/session');
    await page.getByRole('button', { name: 'Open 15-minute setup session' }).click();
    const operatorSession = await operatorResponse;
    assert.equal(operatorSession.request().headers().origin, origin, 'Browser operator form must preserve its same-origin Origin');
    assert.equal(operatorSession.status(), 303, 'Browser operator form must establish a session');
    await page.waitForLoadState('domcontentloaded');
    const cookies = await context.cookies(origin);
    assert.ok(cookies.some((cookie) => cookie.name === '__Host-pocket-gate' && cookie.secure && cookie.httpOnly && cookie.sameSite === 'Strict'));
    await page.goto(origin + '/setup');
    await page.getByLabel('First name').fill('Disposable');
    await page.getByLabel('Last name').fill('Owner');
    await page.getByLabel('Username').fill('disposable-owner');
    await page.getByLabel('Email').fill('owner@example.test');
    await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
    await page.waitForURL(origin + '/signup/add-passkey');

    async function nativePasskey(kind) {
        const result = await page.evaluate(async (operation) => {
            const response = await fetch(`/api/webauthn/${operation}/start`);
            if (!response.ok) return { start: response.status };
            const options = await response.json();
            const credential = operation === 'register'
                ? await navigator.credentials.create({ publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options) })
                : await navigator.credentials.get({ publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options) });
            const finished = await fetch(`/api/webauthn/${operation}/finish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credential.toJSON()) });
            return { start: response.status, finish: finished.status };
        }, kind);
        assert.equal(result.start, 200, 'WebAuthn start failed');
        assert.equal(result.finish, 200, 'WebAuthn finish failed');
    }

    await nativePasskey('register');
    await client.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: first, enabled: false });
    const second = (await authenticator()).authenticatorId;
    await nativePasskey('register');
    const credentials = await client.send('WebAuthn.getCredentials', { authenticatorId: second });
    assert.equal(credentials.credentials.length, 1, 'Second authenticator must hold a separately generated credential');
    const activated = await context.request.post(origin + '/_operator/activate', { headers: { Origin: origin } });
    assert.equal(activated.status(), 200, 'Enrolled owner could not activate gate');
    docker([...compose, 'up', '-d', '--force-recreate', '--wait', '--wait-timeout', '120'], { env: { ...process.env, GATE_FORCE_LOCK: 'false' } });
    await page.goto(origin + '/login');
    await context.request.post(origin + '/api/webauthn/logout');
    await nativePasskey('login');
    console.log('PASS: HTTPS Secure operator cookie, real owner setup, two native browser registrations, first-authenticator-unavailable login. Virtual authenticators are not hardware custody evidence.');

    const callback = origin + '/relying-party/callback';
    const created = await context.request.post(origin + '/api/oidc/clients', { data: { name: 'Disposable PKCE relying party', isPublic: true, pkceEnabled: true, callbackURLs: [callback], logoutCallbackURLs: [], requiresReauthentication: false, skipConsent: false } });
    assert.equal(created.status(), 201, 'Actual registered client creation failed');
    const registered = await created.json();
    const discovery = await (await context.request.get(origin + '/.well-known/openid-configuration')).json();
    assert.equal(discovery.issuer, origin);
    const jwks = await (await context.request.get(discovery.jwks_uri)).json();

    async function authorize() {
        const verifier = crypto.randomBytes(32).toString('base64url');
        const state = crypto.randomBytes(24).toString('hex');
        const nonce = crypto.randomBytes(24).toString('hex');
        const query = new URLSearchParams({ client_id: registered.id, response_type: 'code', redirect_uri: callback, scope: 'openid profile email', state, nonce, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
        await page.goto(discovery.authorization_endpoint + '?' + query);
        if (!page.url().startsWith(callback)) {
            await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        }
        await page.waitForURL((url) => url.href.startsWith(callback));
        const redirect = new URL(page.url());
        assert.equal(redirect.searchParams.get('state'), state, 'Relying-party state mismatch');
        assert.ok(redirect.searchParams.get('code'), 'Authorization code missing');
        return { verifier, nonce, code: redirect.searchParams.get('code') };
    }

    async function exchange(grant, verifier = grant.verifier) {
        return context.request.post(discovery.token_endpoint, { form: { grant_type: 'authorization_code', client_id: registered.id, redirect_uri: callback, code: grant.code, code_verifier: verifier } });
    }

    async function successfulGrant() {
        const grant = await authorize();
        const response = await exchange(grant);
        assert.equal(response.status(), 200, 'PKCE token exchange failed');
        const tokens = await response.json();
        const [encodedHeader, encodedPayload, signature] = tokens.id_token.split('.');
        const header = JSON.parse(Buffer.from(encodedHeader, 'base64url'));
        const claims = JSON.parse(Buffer.from(encodedPayload, 'base64url'));
        const signing = jwks.keys.find((key) => key.kid === header.kid);
        assert.ok(signing, 'No matching signing key');
        assert.equal(header.alg, 'RS256');
        const key = crypto.createPublicKey({ key: signing, format: 'jwk' });
        assert.ok(crypto.verify('RSA-SHA256', Buffer.from(encodedHeader + '.' + encodedPayload), key, Buffer.from(signature, 'base64url')), 'Invalid ID-token signature');
        assert.equal(claims.iss, origin);
        assert.deepEqual(Array.isArray(claims.aud) ? claims.aud : [claims.aud], [registered.id], 'Unexpected token audience');
        assert.equal(claims.nonce, grant.nonce);
        assert.ok(claims.exp > Date.now() / 1000 && claims.sub);
        assert.ok((await exchange(grant)).status() >= 400, 'Reused code accepted');
        return claims.sub;
    }

    const subject = await successfulGrant();
    const badGrant = await authorize();
    assert.ok((await exchange(badGrant, crypto.randomBytes(32).toString('base64url'))).status() >= 400, 'Wrong PKCE verifier accepted');
    const invalidCallback = new URL(discovery.authorization_endpoint);
    invalidCallback.search = new URLSearchParams({ client_id: registered.id, redirect_uri: origin + '/unregistered-callback', response_type: 'code', scope: 'openid' });
    await page.goto(invalidCallback.href);
    assert.ok(!page.url().includes('/unregistered-callback'), 'Unregistered callback was followed');
    console.log('PASS: actual S256 authorization code, signature/issuer/audience/nonce/state checks, invalid verifier, unregistered callback and replay denial.');

    docker([...compose, 'stop']);
    const container = docker([...compose, 'ps', '-aq', 'pocket-id']).toString().trim();
    docker(['cp', container + ':/app/data/.', path.join(work, 'backup')]);
    docker([...compose, 'down', '--volumes']);
    docker([...compose, 'create'], { env: { ...process.env, GATE_FORCE_LOCK: 'false' } });
    const restored = docker([...compose, 'ps', '-aq', 'pocket-id']).toString().trim();
    docker(['cp', path.join(work, 'backup') + '/.', restored + ':/app/data']);
    docker([...compose, 'start']);
    for (let attempt = 0; attempt < 60; attempt++) {
        try { if ((await context.request.get(origin + '/healthz')).status() === 200) break; } catch {}
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await context.clearCookies();
    await page.goto(origin + '/login');
    await nativePasskey('login');
    assert.equal(await successfulGrant(), subject, 'Restored enrolled identity changed');
    console.log('PASS: enrolled full-volume fresh restore with original origin/encryption key, second-authenticator login and signed PKCE grant after recovery.');
} catch (error) {
    console.error('BLOCKED: HTTPS browser gate failed:', error.name, String(error.message).replace(/https?:\/\/[^\s]+/g, '[URL REDACTED]').slice(0, 250));
    process.exitCode = 1;
} finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
}
