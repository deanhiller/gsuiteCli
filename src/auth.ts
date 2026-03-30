import { google } from 'googleapis';
import open from 'open';
import { loadClientCredentials, SCOPES } from './config.js';
import { setToken, listAccounts } from './lib/token-store.js';
import { startCallbackServer } from './lib/oauth-server.js';

interface IdTokenPayload {
    email?: string;
    sub?: string;
}

function decodeIdTokenEmail(idToken: string): string | undefined {
    const parts: string[] = idToken.split('.');
    if (parts.length < 2) {
        return undefined;
    }
    const payload: string = Buffer.from(parts[1], 'base64url').toString('utf-8');
    const decoded: IdTokenPayload = JSON.parse(payload) as IdTokenPayload;
    return decoded.email;
}

export async function doLogin(): Promise<string> {
    const creds = loadClientCredentials();
    const existing: string[] = listAccounts();

    if (existing.length > 0) {
        console.log('Already logged-in accounts:');
        for (const account of existing) {
            console.log(`  ${account}`);
        }
        console.log('');
    }

    const { port, codePromise } = await startCallbackServer();
    const redirectUri: string = `http://localhost:${port}/oauth2callback`;

    const oauth2Client = new google.auth.OAuth2(
        creds.client_id,
        creds.client_secret,
        redirectUri,
    );

    const authUrl: string = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
    });

    console.log('Opening browser for Google login...');
    console.log('Select the account you want to add.\n');
    await open(authUrl);

    const code: string = await codePromise;
    console.log('Browser callback received, exchanging token...');

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
        console.error('Error: No refresh token received. Try revoking app access at https://myaccount.google.com/permissions and login again.');
        process.exit(1);
    }

    let email: string | undefined;
    if (tokens.id_token) {
        email = decodeIdTokenEmail(tokens.id_token);
    }

    if (!email) {
        oauth2Client.setCredentials(tokens);
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        const profile = await gmail.users.getProfile({ userId: 'me' });
        email = profile.data.emailAddress ?? undefined;
    }

    if (!email) {
        console.error('Error: Could not determine email address from login.');
        process.exit(1);
    }

    setToken(email, {
        refresh_token: tokens.refresh_token,
        scope: tokens.scope ?? SCOPES.join(' '),
        token_type: tokens.token_type ?? 'Bearer',
    });

    console.log(`Logged in as ${email}`);

    const allAccounts: string[] = listAccounts();
    console.log(`\n${allAccounts.length} account(s) now logged in:`);
    for (const account of allAccounts) {
        console.log(`  ${account}`);
    }

    return email;
}
