import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { validateCallback, validateIdToken } from './oidc-test-client.mjs';

const tooling = process.env.POCKET_PLAYWRIGHT_MODULE || path.resolve('evidence/browser-tooling/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(tooling));
const work = process.env.POCKET_BROWSER_WORK;
const origin = process.env.APP_URL;
const project = process.env.POCKET_BROWSER_PROJECT;
assert.equal(origin, 'https://localhost:18428');
let compose = ['compose', '-p', project, '-f', path.resolve('compose.yaml')];
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

    async function nativePasskey(kind, target = page) {
        const result = await target.evaluate(async (operation) => {
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
    await context.request.post(origin + '/api/webauthn/logout');
    await nativePasskey('login');
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
    const owner = await (await context.request.get(origin + '/api/users/me')).json();
    assert.equal(owner.isAdmin, true, 'Owner login must have real administration rights');
    const anonymous = await browser.newContext({ ignoreHTTPSErrors: true });
    assert.equal((await anonymous.request.get(origin + '/api/users')).status(), 401, 'Unlocked gate is not an app login');
    assert.equal((await anonymous.request.get(origin + '/api/signup/setup')).status(), 403, 'Activated initial setup must remain blocked');
    await anonymous.close();
    console.log('PASS: HTTPS Secure operator cookie, real owner setup, two native browser registrations, first-authenticator-unavailable login. Virtual authenticators are not hardware custody evidence.');

    const invitation = await context.request.post(origin + '/api/signup-tokens', { data: { ttl: '1h', usageLimit: 1, userGroupIds: [] } });
    assert.equal(invitation.status(), 201, 'Native owner invitation creation failed');
    const invited = await invitation.json();
    const memberContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const memberPage = await memberContext.newPage();
    await memberPage.goto(origin + '/login');
    const memberClient = await memberContext.newCDPSession(memberPage);
    await memberClient.send('WebAuthn.enable');
    await memberClient.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'usb', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    const signedUp = await memberContext.request.post(origin + '/api/signup', { data: { token: invited.token, username: 'disposable-member', firstName: 'Disposable', lastName: 'Member', email: 'member@example.test' } });
    assert.equal(signedUp.status(), 201, 'Native invitation signup failed');
    await nativePasskey('register', memberPage);
    await memberContext.request.post(origin + '/api/webauthn/logout');
    await nativePasskey('login', memberPage);
    const member = await memberContext.request.get(origin + '/api/users/me');
    assert.equal(member.status(), 200, 'Non-admin must be positively authenticated');
    const memberIdentity = await member.json();
    assert.equal(memberIdentity.isAdmin, false, 'Invitation produced unexpected administrator');
    assert.notEqual(memberIdentity.id, owner.id);
    const reusedInvitation = await memberContext.request.post(origin + '/api/signup', { data: { token: invited.token, username: 'unexpected-member', firstName: 'Unexpected', lastName: 'Member', email: 'unexpected@example.test' } });
    assert.equal(reusedInvitation.status(), 401, 'Used one-use invitation must receive native signup rejection');
    assert.equal((await reusedInvitation.json()).code, 'token_invalid_or_expired');
    const createdGroup = await context.request.post(origin + '/api/user-groups', { data: { name: 'protected-test-group', friendlyName: 'Protected test group' } });
    assert.equal(createdGroup.status(), 201);
    const protectedGroup = await createdGroup.json();
    const administrationSnapshot = async () => {
        const result = {};
        for (const route of ['/api/users', '/api/user-groups', '/api/oidc/clients', '/api/application-configuration/all', '/api/signup-tokens']) {
            const response = await context.request.get(origin + route);
            assert.equal(response.status(), 200, 'Owner must read protected state');
            result[route] = await response.json();
        }
        return result;
    };
    const protectedBefore = await administrationSnapshot();
    for (const route of ['/api/users', '/api/user-groups', '/api/oidc/clients', '/api/application-configuration/all', '/api/signup-tokens']) {
        assert.equal((await memberContext.request.get(origin + route)).status(), 403, 'Authenticated non-admin crossed native administration boundary');
    }
    assert.equal((await memberContext.request.post(origin + '/api/signup-tokens', { data: { ttl: '1h', usageLimit: 1, userGroupIds: [] } })).status(), 403);
    assert.equal((await memberContext.request.post(origin + '/api/oidc/clients', { data: {} })).status(), 403);
    const memberPayload = { ...memberIdentity, lastName: memberIdentity.lastName ?? '', isAdmin: true, userGroupIds: [] };
    const deniedMutations = [
        ['post', '/api/users', { username: 'unexpected-admin', firstName: 'Unexpected', lastName: 'Admin', isAdmin: true }],
        ['put', '/api/users/' + memberIdentity.id, memberPayload],
        ['delete', '/api/users/' + owner.id, undefined],
        ['post', '/api/user-groups', { name: 'unexpected-group', friendlyName: 'Unexpected group' }],
        ['put', '/api/user-groups/' + protectedGroup.id, { name: 'renamed-group', friendlyName: 'Renamed group' }],
        ['delete', '/api/user-groups/' + protectedGroup.id, undefined],
        ['put', '/api/application-configuration', Object.fromEntries(protectedBefore['/api/application-configuration/all'].map(entry => [entry.key, entry.value]))],
        ['post', '/api/users/' + owner.id + '/one-time-access-token', { ttl: '1h' }],
    ];
    for (const [method, route, data] of deniedMutations) {
        assert.equal((await memberContext.request[method](origin + route, data === undefined ? {} : { data })).status(), 403, 'Authenticated non-admin administration mutation must be denied');
    }
    const selfPromotion = await memberContext.request.put(origin + '/api/users/me', { data: memberPayload });
    assert.equal(selfPromotion.status(), 200, 'Native self-profile update should remain supported');
    assert.equal((await selfPromotion.json()).isAdmin, false, 'Self-profile update must ignore administrator escalation');
    assert.equal((await (await memberContext.request.get(origin + '/api/users/me')).json()).isAdmin, false);
    const protectedAfter = await administrationSnapshot();
    assert.deepEqual(protectedAfter['/api/user-groups'], protectedBefore['/api/user-groups']);
    assert.deepEqual(protectedAfter['/api/oidc/clients'], protectedBefore['/api/oidc/clients']);
    assert.deepEqual(protectedAfter['/api/application-configuration/all'], protectedBefore['/api/application-configuration/all']);
    const userRoleState = snapshot => snapshot['/api/users'].data.map(user => ({ id: user.id, isAdmin: user.isAdmin, disabled: user.disabled })).sort((left, right) => left.id.localeCompare(right.id));
    assert.deepEqual(userRoleState(protectedAfter), userRoleState(protectedBefore), 'Denied administration must preserve user/role state');
    console.log('PASS: native one-use invitation, independently enrolled non-admin login and positive native admin-route denials.');

    const callback = origin + '/relying-party/callback';
    const created = await context.request.post(origin + '/api/oidc/clients', { data: { name: 'Disposable PKCE relying party', isPublic: true, pkceEnabled: true, callbackURLs: [callback], logoutCallbackURLs: [], requiresReauthentication: false, skipConsent: false } });
    assert.equal(created.status(), 201, 'Actual registered client creation failed');
    const registered = await created.json();
    const discovery = await (await context.request.get(origin + '/.well-known/openid-configuration')).json();
    assert.equal(discovery.issuer, origin);
    const jwks = await (await context.request.get(discovery.jwks_uri)).json();
    const consumedStates = new Set();
    const isCallback = value => {
        const received = new URL(value);
        const target = new URL(callback);
        return received.origin === target.origin && received.pathname === target.pathname;
    };

    async function authorize(target = page) {
        const verifier = crypto.randomBytes(32).toString('base64url');
        const state = crypto.randomBytes(24).toString('hex');
        const nonce = crypto.randomBytes(24).toString('hex');
        const query = new URLSearchParams({ client_id: registered.id, response_type: 'code', redirect_uri: callback, scope: 'openid profile email', state, nonce, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
        await target.goto(discovery.authorization_endpoint + '?' + query);
        if (!isCallback(target.url())) {
            await target.getByRole('button', { name: 'Sign in', exact: true }).click();
        }
        await target.waitForURL(url => isCallback(url.href));
        return { verifier, nonce, code: validateCallback(target.url(), callback, state, consumedStates) };
    }

    async function exchange(grant, verifier = grant.verifier, agent = context) {
        return agent.request.post(discovery.token_endpoint, { form: { grant_type: 'authorization_code', client_id: registered.id, redirect_uri: callback, code: grant.code, code_verifier: verifier } });
    }

    async function successfulGrant(target = page, agent = context) {
        const grant = await authorize(target);
        const response = await exchange(grant, grant.verifier, agent);
        assert.equal(response.status(), 200, 'PKCE token exchange failed');
        const tokens = await response.json();
        const claims = validateIdToken(tokens.id_token, jwks, { issuer: origin, audience: registered.id, nonce: grant.nonce });
        const replay = await exchange(grant, grant.verifier, agent);
        assert.equal(replay.status(), 400, 'Code replay must reach native OAuth rejection');
        assert.equal((await replay.json()).error, 'invalid_grant');
        return claims.sub;
    }

    const subject = await successfulGrant();
    assert.equal(await successfulGrant(memberPage, memberContext), memberIdentity.id, 'Native non-admin OIDC grant must identify the enrolled member');
    const badGrant = await authorize();
    const invalidVerifier = await exchange(badGrant, crypto.randomBytes(32).toString('base64url'));
    assert.equal(invalidVerifier.status(), 400, 'Wrong verifier must reach native OAuth rejection');
    assert.equal((await invalidVerifier.json()).error, 'invalid_grant');
    const invalidCallback = new URL(discovery.authorization_endpoint);
    invalidCallback.search = new URLSearchParams({ client_id: registered.id, redirect_uri: origin + '/unregistered-callback', response_type: 'code', scope: 'openid', state: crypto.randomBytes(24).toString('hex'), nonce: crypto.randomBytes(24).toString('hex'), code_challenge: crypto.createHash('sha256').update(crypto.randomBytes(32).toString('base64url')).digest('base64url'), code_challenge_method: 'S256' });
    const rejectedCallback = await context.request.get(invalidCallback.href, { maxRedirects: 0 });
    assert.equal(rejectedCallback.status(), 302, 'Wrong callback must produce native authorization error redirect');
    const errorLocation = new URL(rejectedCallback.headers().location, origin);
    assert.equal(errorLocation.origin, origin);
    assert.equal(errorLocation.pathname, '/interaction/error');
    assert.match(errorLocation.searchParams.get('error'), /redirect|callback/i);
    assert.ok(!errorLocation.searchParams.has('code'), 'Invalid callback must not receive an authorization code');
    console.log('PASS: actual S256 authorization code, signature/issuer/audience/nonce/state checks, invalid verifier, unregistered callback and replay denial.');

    docker([...compose, 'restart']);
    let readyAfterRestart = false;
    for (let attempt = 0; attempt < 60; attempt++) {
        try { if ((await context.request.get(origin + '/healthz')).status() === 200) { readyAfterRestart = true; break; } } catch {}
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.ok(readyAfterRestart, 'Enrolled service did not recover after restart');
    await context.clearCookies();
    await page.goto(origin + '/login');
    await nativePasskey('login');
    assert.equal(await successfulGrant(), subject, 'Restarted enrolled identity changed');
    await memberContext.clearCookies();
    await memberPage.goto(origin + '/login');
    await nativePasskey('login', memberPage);
    assert.equal(await successfulGrant(memberPage, memberContext), memberIdentity.id);
    assert.equal((await memberContext.request.get(origin + '/api/users')).status(), 403);
    docker([...compose, 'stop']);
    const container = docker([...compose, 'ps', '-aq', 'pocket-id']).toString().trim();
    const originalVolume = JSON.parse(docker(['inspect', container]))[0].Mounts.find(mount => mount.Destination === '/app/data').Name;
    docker(['cp', container + ':/app/data/.', path.join(work, 'backup')]);
    const fileHashes = directory => Object.fromEntries(fs.readdirSync(directory, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => {
        const filename = path.join(entry.parentPath, entry.name);
        return [path.relative(directory, filename), crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex')];
    }).sort(([left], [right]) => left.localeCompare(right)));
    const beforeHashes = fileHashes(path.join(work, 'backup'));
    assert.ok(beforeHashes['pocket-id.db'] && beforeHashes['gateway-state.json']);
    docker([...compose, 'down', '--volumes']);
    compose = ['compose', '-p', project + '-restore', '-f', path.resolve('compose.yaml')];
    docker([...compose, 'create'], { env: { ...process.env, GATE_FORCE_LOCK: 'false' } });
    const restored = docker([...compose, 'ps', '-aq', 'pocket-id']).toString().trim();
    const restoreVolume = JSON.parse(docker(['inspect', restored]))[0].Mounts.find(mount => mount.Destination === '/app/data').Name;
    assert.notEqual(restoreVolume, originalVolume, 'Cold restore must use a distinct volume name');
    const originalCreatedAt = JSON.parse(docker(['volume', 'inspect', restoreVolume]))[0].CreatedAt;
    assert.equal(JSON.parse(docker(['inspect', restored]))[0].State.Running, false, 'Restore target must not auto-start');
    docker(['cp', restored + ':/app/data/.', path.join(work, 'empty')]);
    assert.deepEqual(fileHashes(path.join(work, 'empty')), {}, 'Independent restore target must be empty');
    docker(['cp', path.join(work, 'backup') + '/.', restored + ':/app/data']);
    docker(['cp', restored + ':/app/data/.', path.join(work, 'restored-bytes')]);
    assert.deepEqual(fileHashes(path.join(work, 'restored-bytes')), beforeHashes, 'All cold archive bytes must match before starting restored issuer');
    assert.ok(originalVolume && restoreVolume && originalCreatedAt);
    docker([...compose, 'start']);
    let readyAfterRestore = false;
    for (let attempt = 0; attempt < 60; attempt++) {
        try { if ((await context.request.get(origin + '/healthz')).status() === 200) { readyAfterRestore = true; break; } } catch {}
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.ok(readyAfterRestore, 'Restored issuer never became ready');
    await context.clearCookies();
    await page.goto(origin + '/login');
    await nativePasskey('login');
    assert.equal(await successfulGrant(), subject, 'Restored enrolled identity changed');
    await memberContext.clearCookies();
    await memberPage.goto(origin + '/login');
    await nativePasskey('login', memberPage);
    const restoredMember = await memberContext.request.get(origin + '/api/users/me');
    assert.equal(restoredMember.status(), 200);
    assert.equal((await restoredMember.json()).id, memberIdentity.id);
    assert.equal((await memberContext.request.get(origin + '/api/users')).status(), 403);
    assert.equal(await successfulGrant(memberPage, memberContext), memberIdentity.id);
    await memberContext.close();
    console.log('PASS: enrolled full-volume fresh restore with original origin/encryption key, second-authenticator login and signed PKCE grant after recovery.');
    await client.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: first });
    await client.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: second });
    docker([...compose, 'up', '-d', '--force-recreate', '--wait', '--wait-timeout', '120'], { env: { ...process.env, GATE_FORCE_LOCK: 'true' } });
    await context.clearCookies();
    assert.equal((await context.request.get(origin + '/api/users/me')).status(), 403, 'Lost-authenticator drill must be operator locked');
    await page.goto(origin + '/_operator');
    await page.getByLabel('Operator token').fill(process.env.GATE_ADMIN_TOKEN);
    await page.getByRole('button', { name: 'Open 15-minute setup session' }).click();
    await page.waitForLoadState('domcontentloaded');
    const oneTimeOutput = docker([...compose, 'exec', '-T', '--user', '1000', '-e', 'DB_CONNECTION_STRING=/app/data/pocket-id.db', '-e', 'FRANCIS_HOST=embedded', 'pocket-id', '/app/pocket-id', 'one-time-access-token', 'disposable-owner']).toString();
    const oneTimeURL = oneTimeOutput.match(/https:\/\/[^\s]+\/lc\/[^\s]+/)?.[0];
    assert.ok(oneTimeURL && oneTimeURL.startsWith(origin + '/lc/'), 'Supported native CLI did not return a same-origin recovery link');
    await page.goto(oneTimeURL);
    await page.waitForURL(origin + '/settings/account');
    const recoveredOwner = await context.request.get(origin + '/api/users/me');
    assert.equal(recoveredOwner.status(), 200);
    assert.equal((await recoveredOwner.json()).id, owner.id, 'Native one-time recovery must preserve original owner');
    const previousCredentials = await (await context.request.get(origin + '/api/users/' + owner.id + '/webauthn-credentials')).json();
    const replacementFirst = (await authenticator()).authenticatorId;
    await nativePasskey('register');
    await client.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: replacementFirst, enabled: false });
    await authenticator();
    await nativePasskey('register');
    for (const credential of previousCredentials) {
        assert.equal((await context.request.delete(origin + '/api/users/' + owner.id + '/webauthn-credentials/' + credential.id)).status(), 204, 'Lost passkey revocation failed');
    }
    assert.equal((await (await context.request.get(origin + '/api/users/' + owner.id + '/webauthn-credentials')).json()).length, 2);
    assert.equal((await context.request.post(origin + '/_operator/activate', { headers: { Origin: origin } })).status(), 200);
    await context.request.post(origin + '/api/webauthn/logout');
    const replayExchange = page.waitForResponse(response => response.url().startsWith(origin + '/api/one-time-access-token/') && response.request().method() === 'POST');
    await page.goto(oneTimeURL);
    const consumedLink = await replayExchange;
    assert.equal(consumedLink.status(), 401, 'Consumed recovery link must reach native token rejection');
    assert.equal((await context.request.get(origin + '/api/users/me')).status(), 401, 'Consumed recovery link created another app session');
    await page.goto(origin + '/login');
    await nativePasskey('login');
    assert.equal(await successfulGrant(), subject, 'Recovered original owner OIDC subject changed');
    console.log('PASS: operator-locked loss of both authenticators, native one-time CLI recovery, two replacement enrollments, lost-key revocation and consumed-link denial.');
} catch (error) {
    console.error('BLOCKED: HTTPS browser gate failed:', error.name, String(error.message).replace(/https?:\/\/[^\s]+/g, '[URL REDACTED]').slice(0, 250));
    process.exitCode = 1;
} finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
}
