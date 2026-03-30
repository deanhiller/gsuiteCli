import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Writable } from 'node:stream';
import { getDrive } from '../lib/google-client.js';
import { resolveAccount } from './account-resolver.js';

function guessMimeType(filePath: string): string {
    const ext: string = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.txt': 'text/plain',
        '.csv': 'text/csv',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.html': 'text/html',
        '.md': 'text/markdown',
        '.zip': 'application/zip',
    };
    return mimeTypes[ext] ?? 'application/octet-stream';
}

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

    drive
        .command('mkdir')
        .description('Create a folder in Drive')
        .requiredOption('-n, --name <name>', 'Folder name')
        .option('-p, --parent <folderId>', 'Parent folder ID')
        .option('-a, --account <email>', 'Account to use')
        .action(async (opts: { name: string; parent?: string; account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getDrive(email);

            const requestBody: { name: string; mimeType: string; parents?: string[] } = {
                name: opts.name,
                mimeType: 'application/vnd.google-apps.folder',
            };
            if (opts.parent) {
                requestBody.parents = [opts.parent];
            }

            const resp = await client.files.create({
                requestBody,
                fields: 'id, name, webViewLink',
            });

            console.log(`Created folder: ${opts.name}`);
            console.log(`  ID: ${resp.data.id}`);
            console.log(`  URL: ${resp.data.webViewLink}`);
        });

    drive
        .command('upload')
        .description('Upload a file to Drive')
        .requiredOption('-f, --file <path>', 'Local file path to upload')
        .option('-n, --name <name>', 'File name in Drive (defaults to local filename)')
        .option('-p, --parent <folderId>', 'Parent folder ID')
        .option('-a, --account <email>', 'Account to use')
        .action(async (opts: { file: string; name?: string; parent?: string; account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getDrive(email);

            const filePath: string = path.resolve(opts.file);
            if (!fs.existsSync(filePath)) {
                console.error(`Error: File not found: ${filePath}`);
                process.exit(1);
            }

            const fileName: string = opts.name ?? path.basename(filePath);
            const mimeType: string = guessMimeType(filePath);

            const requestBody: { name: string; parents?: string[] } = { name: fileName };
            if (opts.parent) {
                requestBody.parents = [opts.parent];
            }

            const resp = await client.files.create({
                requestBody,
                media: {
                    mimeType,
                    body: fs.createReadStream(filePath),
                },
                fields: 'id, name, webViewLink',
            });

            console.log(`Uploaded: ${fileName}`);
            console.log(`  ID: ${resp.data.id}`);
            console.log(`  URL: ${resp.data.webViewLink}`);
        });

    drive
        .command('download')
        .argument('<fileId>', 'File ID to download')
        .description('Download a file from Drive')
        .requiredOption('-o, --output <path>', 'Local output file path')
        .option('-a, --account <email>', 'Account to use')
        .action(async (fileId: string, opts: { output: string; account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getDrive(email);

            const outputPath: string = path.resolve(opts.output);

            const resp = await client.files.get(
                { fileId, alt: 'media' },
                { responseType: 'stream' },
            );

            const dest: fs.WriteStream = fs.createWriteStream(outputPath);
            await new Promise<void>((resolve, reject) => {
                (resp.data as unknown as NodeJS.ReadableStream)
                    .pipe(dest as unknown as Writable)
                    .on('finish', resolve)
                    .on('error', reject);
            });

            console.log(`Downloaded to ${outputPath}`);
        });
}
