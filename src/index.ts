#!/usr/bin/env node

import { Command } from 'commander';
import { registerSetupCommand } from './commands/setup-command.js';
import { registerAuthCommands } from './commands/auth-commands.js';
import { registerGmailCommands } from './commands/gmail-commands.js';
import { registerDriveCommands } from './commands/drive-commands.js';
import { registerSheetsCommands } from './commands/sheets-commands.js';

const program: Command = new Command();

program
    .name('gsuite')
    .description('Multi-account Google Workspace CLI — Gmail, Drive, Sheets')
    .version('0.1.0');

registerSetupCommand(program);
registerAuthCommands(program);
registerGmailCommands(program);
registerDriveCommands(program);
registerSheetsCommands(program);

program.parseAsync(process.argv).catch((err: unknown) => {
    if (err instanceof Error) {
        const gaxiosErr = err as Error & { response?: { status?: number; data?: { error?: { message?: string } } } };
        if (gaxiosErr.response) {
            console.error(`API Error (${gaxiosErr.response.status}): ${gaxiosErr.response.data?.error?.message ?? err.message}`);
        } else {
            console.error(`Error: ${err.message}`);
        }
    } else {
        console.error('Error:', err);
    }
    process.exit(1);
});
