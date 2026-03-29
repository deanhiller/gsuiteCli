import { google } from 'googleapis';
import open from 'open';
import { loadClientCredentials, SCOPES, OAUTH_REDIRECT_URI, promptUser } from './config.js';
import { setToken, listAccounts } from './lib/token-store.js';
import { waitForAuthCode } from './lib/oauth-server.js';

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

export async function doLoginOne(): Promise<string> {
    const creds = loadClientCredentials();

    const oauth2Client = new google.auth.OAuth2(
        creds.client_id,
        creds.client_secret,
        OAUTH_REDIRECT_URI,
    );

    const authUrl: string = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
    });

    const port: number = 3000;
    const codePromise: Promise<string> = waitForAuthCode(port);

    console.log('Opening browser for Google login...');
    await open(authUrl);

    const code: string = await codePromise;

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
    return email;
}

export async function doLoginAll(): Promise<void> {
    const existing: string[] = listAccounts();
    if (existing.length > 0) {
        console.log('Already logged-in accounts:');
        for (const account of existing) {
            console.log(`  ${account}`);
        }
        console.log('');
    }

    let addMore: boolean = true;
    let count: number = 0;

    while (addMore) {
        count++;
        console.log(`--- Login #${count} ---`);
        await doLoginOne();

        const accounts: string[] = listAccounts();
        console.log(`\nCurrently logged in (${accounts.length} account(s)):`);
        for (const account of accounts) {
            console.log(`  ${account}`);
        }

        const answer: string = await promptUser('\nAdd another account? (y/n): ');
        addMore = answer.toLowerCase().startsWith('y');
    }

    const finalAccounts: string[] = listAccounts();
    console.log(`\nDone! ${finalAccounts.length} account(s) ready.`);
}
