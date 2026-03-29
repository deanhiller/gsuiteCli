import { Command } from 'commander';
import * as fs from 'node:fs';
import open from 'open';
import { CONFIG_DIR, CREDENTIALS_PATH, ensureConfigDir, promptUser } from '../config.js';

const GCP_CONSOLE_URL: string = 'https://console.cloud.google.com';

export function registerSetupCommand(program: Command): void {
    program
        .command('setup')
        .description('Walk through GCP project + OAuth client setup (run once)')
        .action(async () => {
            ensureConfigDir();

            if (fs.existsSync(CREDENTIALS_PATH)) {
                console.log(`Existing credentials found at ${CREDENTIALS_PATH}`);
                const answer: string = await promptUser('Overwrite? (y/n): ');
                if (!answer.toLowerCase().startsWith('y')) {
                    console.log('Setup cancelled.');
                    return;
                }
            }

            console.log('=== gsuite setup ===\n');
            console.log('This will walk you through creating a GCP project and OAuth credentials.\n');

            // Step 1: Create or select GCP project
            console.log('STEP 1: Create a GCP Project');
            console.log('----------------------------');
            console.log(`Open: ${GCP_CONSOLE_URL}/projectcreate`);
            console.log('  - Name it something like "gsuite-cli"');
            console.log('  - Note the Project ID\n');
            await promptUser('Press Enter when your project is created...');

            // Step 2: Enable APIs
            console.log('\nSTEP 2: Enable APIs');
            console.log('-------------------');
            console.log('Enable these 3 APIs in your project:');
            console.log(`  1. Gmail API:   ${GCP_CONSOLE_URL}/apis/library/gmail.googleapis.com`);
            console.log(`  2. Drive API:   ${GCP_CONSOLE_URL}/apis/library/drive.googleapis.com`);
            console.log(`  3. Sheets API:  ${GCP_CONSOLE_URL}/apis/library/sheets.googleapis.com`);
            const openApis: string = await promptUser('\nOpen these links in browser? (y/n): ');
            if (openApis.toLowerCase().startsWith('y')) {
                await open(`${GCP_CONSOLE_URL}/apis/library/gmail.googleapis.com`);
                await open(`${GCP_CONSOLE_URL}/apis/library/drive.googleapis.com`);
                await open(`${GCP_CONSOLE_URL}/apis/library/sheets.googleapis.com`);
            }
            await promptUser('Press Enter when all 3 APIs are enabled...');

            // Step 3: OAuth consent screen
            console.log('\nSTEP 3: Configure OAuth Consent Screen');
            console.log('--------------------------------------');
            console.log(`Open: ${GCP_CONSOLE_URL}/apis/credentials/consent`);
            console.log('  - User Type: External');
            console.log('  - App name: "gsuite-cli" (or anything)');
            console.log('  - User support email: your email');
            console.log('  - Developer contact: your email');
            console.log('  - Scopes: skip (we request at login time)');
            console.log('  - Test users: add all your email addresses');
            console.log('  - Publishing status: leave as "Testing"');
            const openConsent: string = await promptUser('\nOpen consent screen page? (y/n): ');
            if (openConsent.toLowerCase().startsWith('y')) {
                await open(`${GCP_CONSOLE_URL}/apis/credentials/consent`);
            }
            await promptUser('Press Enter when consent screen is configured...');

            // Step 4: Create OAuth client ID
            console.log('\nSTEP 4: Create OAuth Client ID');
            console.log('------------------------------');
            console.log(`Open: ${GCP_CONSOLE_URL}/apis/credentials`);
            console.log('  - Click "+ CREATE CREDENTIALS" > "OAuth client ID"');
            console.log('  - Application type: "Desktop app"');
            console.log('  - Name: "gsuite-cli" (or anything)');
            console.log('  - Click "Create"');
            console.log('  - Copy the Client ID and Client Secret shown\n');
            const openCreds: string = await promptUser('Open credentials page? (y/n): ');
            if (openCreds.toLowerCase().startsWith('y')) {
                await open(`${GCP_CONSOLE_URL}/apis/credentials`);
            }

            console.log('');
            const clientId: string = await promptUser('Client ID: ');
            const clientSecret: string = await promptUser('Client Secret: ');

            if (!clientId || !clientSecret) {
                console.error('Error: Both Client ID and Client Secret are required.');
                process.exit(1);
            }

            const creds = { client_id: clientId, client_secret: clientSecret };
            fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), { mode: 0o600 });

            console.log(`\nCredentials saved to ${CREDENTIALS_PATH}`);
            console.log('\nSetup complete! Now run "gsuite auth login" to log in your accounts.');
        });
}
