import { Command } from 'commander';
import { getGmail } from '../lib/google-client.js';
import { resolveAccount } from './account-resolver.js';

interface MessageHeader {
    name?: string | null;
    value?: string | null;
}

function getHeader(headers: MessageHeader[], name: string): string {
    const header = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
    return header?.value ?? '';
}

export function registerGmailCommands(program: Command): void {
    const gmail: Command = program.command('gmail').description('Gmail operations');

    gmail
        .command('list')
        .description('List inbox messages')
        .option('-a, --account <email>', 'Account to use')
        .option('-m, --max <number>', 'Max messages to show', '10')
        .action(async (opts: { account?: string; max: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getGmail(email);
            const maxResults: number = parseInt(opts.max, 10);

            const listResp = await client.users.messages.list({
                userId: 'me',
                maxResults,
                labelIds: ['INBOX'],
            });

            const messages = listResp.data.messages;
            if (!messages || messages.length === 0) {
                console.log('No messages in inbox.');
                return;
            }

            const details = await Promise.all(
                messages.map((msg) =>
                    client.users.messages.get({
                        userId: 'me',
                        id: msg.id!,
                        format: 'METADATA',
                        metadataHeaders: ['Subject', 'From', 'Date'],
                    }),
                ),
            );

            for (const detail of details) {
                const headers: MessageHeader[] = detail.data.payload?.headers ?? [];
                const subject: string = getHeader(headers, 'Subject') || '(no subject)';
                const from: string = getHeader(headers, 'From');
                const date: string = getHeader(headers, 'Date');
                const id: string = detail.data.id ?? '';
                console.log(`[${id}] ${date}`);
                console.log(`  From: ${from}`);
                console.log(`  Subject: ${subject}`);
                console.log('');
            }
        });

    gmail
        .command('read')
        .argument('<messageId>', 'Message ID to read')
        .description('Read a specific message')
        .option('-a, --account <email>', 'Account to use')
        .action(async (messageId: string, opts: { account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getGmail(email);

            const resp = await client.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full',
            });

            const headers: MessageHeader[] = resp.data.payload?.headers ?? [];
            console.log(`From: ${getHeader(headers, 'From')}`);
            console.log(`To: ${getHeader(headers, 'To')}`);
            console.log(`Date: ${getHeader(headers, 'Date')}`);
            console.log(`Subject: ${getHeader(headers, 'Subject')}`);
            console.log('---');

            const body: string = extractBody(resp.data.payload);
            console.log(body);
        });

    gmail
        .command('send')
        .description('Send an email')
        .requiredOption('--to <address>', 'Recipient email')
        .requiredOption('--subject <subject>', 'Email subject')
        .requiredOption('--body <body>', 'Email body text')
        .option('-a, --account <email>', 'Account to use')
        .action(async (opts: { to: string; subject: string; body: string; account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getGmail(email);

            const rawMessage: string = [
                `From: ${email}`,
                `To: ${opts.to}`,
                `Subject: ${opts.subject}`,
                'Content-Type: text/plain; charset=utf-8',
                '',
                opts.body,
            ].join('\r\n');

            const encoded: string = Buffer.from(rawMessage).toString('base64url');

            const resp = await client.users.messages.send({
                userId: 'me',
                requestBody: { raw: encoded },
            });

            console.log(`Message sent (ID: ${resp.data.id})`);
        });

    gmail
        .command('labels')
        .description('List labels')
        .option('-a, --account <email>', 'Account to use')
        .action(async (opts: { account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getGmail(email);

            const resp = await client.users.labels.list({ userId: 'me' });
            const labels = resp.data.labels;
            if (!labels || labels.length === 0) {
                console.log('No labels found.');
                return;
            }
            for (const label of labels) {
                console.log(label.name ?? label.id);
            }
        });
}

interface PayloadPart {
    mimeType?: string | null;
    body?: { data?: string | null } | null;
    parts?: PayloadPart[] | null;
}

function extractBody(payload: PayloadPart | undefined | null): string {
    if (!payload) {
        return '(empty)';
    }

    // Direct body on payload
    if (payload.body?.data) {
        return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    }

    // Multipart: look for text/plain first, then text/html
    if (payload.parts) {
        const textPart = payload.parts.find((p) => p.mimeType === 'text/plain');
        if (textPart?.body?.data) {
            return Buffer.from(textPart.body.data, 'base64url').toString('utf-8');
        }
        const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html');
        if (htmlPart?.body?.data) {
            return Buffer.from(htmlPart.body.data, 'base64url').toString('utf-8');
        }
        // Recurse into nested parts
        for (const part of payload.parts) {
            const result: string = extractBody(part);
            if (result !== '(empty)') {
                return result;
            }
        }
    }

    return '(empty)';
}
