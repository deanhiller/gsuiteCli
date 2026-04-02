import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as readline from 'node:readline';

export const CONFIG_DIR: string = path.join(os.homedir(), '.config', 'gsuite');
export const TOKENS_PATH: string = path.join(CONFIG_DIR, 'tokens.json');
export const CREDENTIALS_PATH: string = path.join(CONFIG_DIR, 'client_credentials.json');

export const SCOPES: string[] = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar',
    'openid',
    'email',
];


export interface ClientCredentials {
    gcp_email: string;
    project_id: string;
    client_id: string;
    client_secret: string;
}

export function loadClientCredentials(): ClientCredentials {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.error(`Error: Client credentials not found at ${CREDENTIALS_PATH}`);
        console.error('Run "gsuite setup" first to configure your GCP OAuth credentials.');
        process.exit(1);
    }

    const raw: string = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
    const creds: ClientCredentials = JSON.parse(raw) as ClientCredentials;

    if (!creds.client_id || !creds.client_secret) {
        console.error('Error: client_credentials.json must have client_id and client_secret fields.');
        process.exit(1);
    }

    return creds;
}

export function ensureConfigDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
}

export function promptUser(question: string): Promise<string> {
    const rl: readline.Interface = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(question, (answer: string) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}
