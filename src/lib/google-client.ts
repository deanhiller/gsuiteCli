import { google, type gmail_v1, type drive_v3, type sheets_v4 } from 'googleapis';
import { loadClientCredentials } from '../config.js';
import { getToken } from './token-store.js';
import type { OAuth2Client } from 'google-auth-library';

export function getAuthClient(email: string): OAuth2Client {
    const tokenData = getToken(email);
    if (!tokenData) {
        console.error(`Error: Account '${email}' not logged in. Run 'gsuite auth login' first.`);
        process.exit(1);
    }

    const creds = loadClientCredentials();
    const oauth2Client = new google.auth.OAuth2(
        creds.client_id,
        creds.client_secret,
    );

    oauth2Client.setCredentials({
        refresh_token: tokenData.refresh_token,
    });

    return oauth2Client;
}

export function getGmail(email: string): gmail_v1.Gmail {
    return google.gmail({ version: 'v1', auth: getAuthClient(email) });
}

export function getDrive(email: string): drive_v3.Drive {
    return google.drive({ version: 'v3', auth: getAuthClient(email) });
}

export function getSheets(email: string): sheets_v4.Sheets {
    return google.sheets({ version: 'v4', auth: getAuthClient(email) });
}
