import { Command } from 'commander';
import * as fs from 'node:fs';
import * as child_process from 'node:child_process';
import open from 'open';
import { CREDENTIALS_PATH, ensureConfigDir, promptUser } from '../config.js';

const GCP_CONSOLE: string = 'https://console.cloud.google.com';

async function openIfConfirmed(urls: string[]): Promise<void> {
    const answer: string = await promptUser('Open in browser? (y/n): ');
    if (answer.toLowerCase().startsWith('y')) {
        for (const url of urls) {
            await open(url);
        }
    }
}

function runGcloud(args: string[]): string | null {
    try {
        const result = child_process.execFileSync('gcloud', args, {
            encoding: 'utf-8',
            timeout: 30000,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return result.trim();
    } catch {
        return null;
    }
}

function gcloudIsInstalled(): boolean {
    return runGcloud(['--version']) !== null;
}

function gcloudAuthLogin(email: string): boolean {
    try {
        child_process.execFileSync('gcloud', ['auth', 'login', email, '--brief'], {
            encoding: 'utf-8',
            timeout: 120000,
            stdio: 'inherit',
        });
        return true;
    } catch {
        return false;
    }
}

interface GcloudProject {
    projectId: string;
    name: string;
}

function gcloudListProjects(account: string): GcloudProject[] {
    const output = runGcloud([
        'projects', 'list',
        '--account', account,
        '--format', 'json(projectId,name)',
    ]);
    if (!output) {
        return [];
    }
    return JSON.parse(output) as GcloudProject[];
}

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
                console.log('');
            }

            console.log('=== gsuite setup ===\n');

            // Check for gcloud
            const hasGcloud: boolean = gcloudIsInstalled();
            if (!hasGcloud) {
                console.log('Note: gcloud CLI not found. Install it for a better experience:');
                console.log('  https://cloud.google.com/sdk/docs/install\n');
            }

            const gcpEmail: string = await promptUser(
                'What is your GCP account email? (your Google Cloud admin email, NOT your gsuite emails)\n> ',
            );
            if (!gcpEmail || !gcpEmail.includes('@')) {
                console.error('Error: A valid email address is required.');
                process.exit(1);
            }

            // Step 1: GCP Project — list existing or create new
            console.log('\nSTEP 1: GCP Project');
            console.log('-------------------');

            let projectId: string = '';

            if (hasGcloud) {
                console.log(`\nAuthenticating ${gcpEmail} with gcloud...`);
                const authOk: boolean = gcloudAuthLogin(gcpEmail);
                if (!authOk) {
                    console.error('Error: gcloud auth failed. Falling back to manual setup.');
                }

                if (authOk) {
                    console.log('\nFetching your GCP projects...\n');
                    const projects: GcloudProject[] = gcloudListProjects(gcpEmail);

                    if (projects.length > 0) {
                        console.log('Your existing projects:');
                        for (let i = 0; i < projects.length; i++) {
                            console.log(`  ${i + 1}. ${projects[i].projectId}  (${projects[i].name})`);
                        }
                        console.log(`  ${projects.length + 1}. Create a new project`);
                        console.log('');

                        const choice: string = await promptUser('Select a project (number): ');
                        const choiceNum: number = parseInt(choice, 10);

                        if (choiceNum >= 1 && choiceNum <= projects.length) {
                            projectId = projects[choiceNum - 1].projectId;
                            console.log(`Selected: ${projectId}`);
                        }
                    } else {
                        console.log('No existing projects found.');
                    }
                }
            }

            if (!projectId) {
                // Manual fallback or "create new" selected
                console.log('');
                console.log(`  Create a project: ${GCP_CONSOLE}/projectcreate?authuser=${gcpEmail}`);
                console.log('');
                await openIfConfirmed([`${GCP_CONSOLE}/projectcreate?authuser=${gcpEmail}`]);
                console.log('');
                projectId = await promptUser('Enter your GCP Project ID: ');
                if (!projectId) {
                    console.error('Error: A project ID is required.');
                    process.exit(1);
                }
            }

            // Step 2: Enable APIs
            const gmailApi: string = `${GCP_CONSOLE}/apis/library/gmail.googleapis.com?project=${projectId}&authuser=${gcpEmail}`;
            const driveApi: string = `${GCP_CONSOLE}/apis/library/drive.googleapis.com?project=${projectId}&authuser=${gcpEmail}`;
            const sheetsApi: string = `${GCP_CONSOLE}/apis/library/sheets.googleapis.com?project=${projectId}&authuser=${gcpEmail}`;

            console.log(`\nSTEP 2: Enable APIs for project "${projectId}"`);
            console.log('-------------------');
            console.log(`  1. Gmail API:   ${gmailApi}`);
            console.log(`  2. Drive API:   ${driveApi}`);
            console.log(`  3. Sheets API:  ${sheetsApi}`);
            console.log('');
            await openIfConfirmed([gmailApi, driveApi, sheetsApi]);
            await promptUser('\nPress Enter when all 3 APIs are enabled...');

            // Step 3: Create OAuth Client ID (before consent screen — need the client_id/secret first)
            const clientsUrl: string = `${GCP_CONSOLE}/auth/clients?project=${projectId}&authuser=${gcpEmail}`;

            console.log('\nSTEP 3: Create OAuth Client ID');
            console.log('------------------------------');
            console.log(`  ${clientsUrl}\n`);
            console.log('  - Click "+ Create Client" at the top');
            console.log('  - Application type: select "Desktop app" from the dropdown');
            console.log('  - Name: "Gsuite CLI"');
            console.log('  - Click "Create"');
            console.log('');
            console.log('  *** IMPORTANT: Do NOT close/leave that screen after clicking Create! ***');
            console.log('  *** The Client ID and Client Secret are shown only once.             ***');
            console.log('  *** Copy them both and paste them below.                             ***');
            console.log('');
            await openIfConfirmed([clientsUrl]);

            console.log('');
            const clientId: string = await promptUser('Client ID: ');
            const clientSecret: string = await promptUser('Client Secret: ');

            if (!clientId || !clientSecret) {
                console.error('Error: Both Client ID and Client Secret are required.');
                process.exit(1);
            }

            const creds = {
                gcp_email: gcpEmail,
                project_id: projectId,
                client_id: clientId,
                client_secret: clientSecret,
            };
            fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), { mode: 0o600 });
            console.log(`\nCredentials saved to ${CREDENTIALS_PATH}`);

            // Step 4a: Branding
            const brandingUrl: string = `${GCP_CONSOLE}/auth/branding?project=${projectId}&authuser=${gcpEmail}`;

            console.log('\nSTEP 4a: Branding');
            console.log('-----------------');
            console.log(`  ${brandingUrl}\n`);
            console.log(`  - App name: "gsuite-cli"`);
            console.log(`  - User support email: ${gcpEmail}`);
            console.log(`  - Developer contact: ${gcpEmail}`);
            console.log('');
            await openIfConfirmed([brandingUrl]);
            await promptUser('\nPress Enter when branding is configured...');

            // Step 4b: Audience
            const audienceUrl: string = `${GCP_CONSOLE}/auth/audience?project=${projectId}&authuser=${gcpEmail}`;

            console.log('\nSTEP 4b: Audience');
            console.log('-----------------');
            console.log(`  ${audienceUrl}\n`);
            console.log('  - Publishing status: leave as "Testing"');
            console.log('  - User Type: External');
            console.log('  - Test users: add ALL your email addresses (the ones you\'ll use with gsuite)');
            console.log('');
            await openIfConfirmed([audienceUrl]);
            await promptUser('\nPress Enter when audience is configured...');

            console.log('\nSetup complete! Now run "gsuite auth login" to log in your accounts.');
        });
}
