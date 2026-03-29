import { Command } from 'commander';
import { getDrive } from '../lib/google-client.js';
import { resolveAccount } from './account-resolver.js';

export function registerDriveCommands(program: Command): void {
    const drive: Command = program.command('drive').description('Google Drive operations');

    drive
        .command('list')
        .description('List files in Drive')
        .option('-a, --account <email>', 'Account to use')
        .option('-m, --max <number>', 'Max files to show', '20')
        .option('-q, --query <query>', 'Drive search query')
        .action(async (opts: { account?: string; max: string; query?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getDrive(email);
            const pageSize: number = parseInt(opts.max, 10);

            const resp = await client.files.list({
                pageSize,
                fields: 'files(id, name, mimeType, modifiedTime)',
                q: opts.query,
            });

            const files = resp.data.files;
            if (!files || files.length === 0) {
                console.log('No files found.');
                return;
            }

            for (const file of files) {
                const modified: string = file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : '';
                console.log(`[${file.id}] ${file.name}  (${file.mimeType})  ${modified}`);
            }
        });
}
