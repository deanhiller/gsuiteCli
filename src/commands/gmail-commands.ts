import { Command } from 'commander';
import { gmail_v1 } from 'googleapis';
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

async function resolveLabelId(client: gmail_v1.Gmail, labelName: string): Promise<string> {
    const resp = await client.users.labels.list({ userId: 'me' });
    const labels = resp.data.labels;
    if (!labels) {
        throw new Error('No labels found in account.');
    }
    const match = labels.find((l) => l.name?.toLowerCase() === labelName.toLowerCase());
    if (!match || !match.id) {
        throw new Error(`Label "${labelName}" not found. Use "gsuite gmail labels" to see available labels or "gsuite gmail label-create" to create one.`);
    }
    return match.id;
}

async function fetchAndPrintMessages(client: gmail_v1.Gmail, messageIds: Array<{ id?: string | null }>): Promise<void> {
    const details = await Promise.all(
        messageIds.map((msg) =>
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

            await fetchAndPrintMessages(client, messages);
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
        .command('read-batch')
        .argument('<messageIds...>', 'One or more message IDs to read')
        .description('Read multiple messages at once')
        .option('-a, --account <email>', 'Account to use')
        .action(async (messageIds: string[], opts: { account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getGmail(email);

            const results = await Promise.all(
                messageIds.map((id) =>
                    client.users.messages.get({
                        userId: 'me',
                        id,
                        format: 'full',
                    }),
                ),
            );

            for (const resp of results) {
                const headers: MessageHeader[] = resp.data.payload?.headers ?? [];
                console.log(`[${resp.data.id}]`);
                console.log(`From: ${getHeader(headers, 'From')}`);
                console.log(`To: ${getHeader(headers, 'To')}`);
                console.log(`Date: ${getHeader(headers, 'Date')}`);
                console.log(`Subject: ${getHeader(headers, 'Subject')}`);
                console.log('---');
                const body: string = extractBody(resp.data.payload);
                console.log(body);
                console.log('');
            }
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

    gmail
        .command('archive')
        .argument('<messageIds...>', 'One or more message IDs to archive')
        .description('Archive messages (remove from inbox)')
        .option('-a, --account <email>', 'Account to use')
        .action(async (messageIds: string[], opts: { account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getGmail(email);

            await Promise.all(
                messageIds.map((id) =>
                    client.users.messages.modify({
                        userId: 'me',
                        id,
                        requestBody: { removeLabelIds: ['INBOX'] },
                    }),
                ),
            );

            console.log(`Archived ${messageIds.length} message(s).`);
        });

    gmail
        .command('move')
        .argument('<messageIds...>', 'One or more message IDs to move')
        .description('Move messages from one label to another (up to 1000 per call)')
        .requiredOption('--from <labelName>', 'Source label name (e.g. INBOX, MyLabel)')
        .requiredOption('--to <labelName>', 'Target label name')
        .option('-a, --account <email>', 'Account to use')
        .action(async (messageIds: string[], opts: { from: string; to: string; account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getGmail(email);
            const fromLabelId: string = await resolveLabelId(client, opts.from);
            const toLabelId: string = await resolveLabelId(client, opts.to);

            const batchSize = 1000;
            for (let i = 0; i < messageIds.length; i += batchSize) {
                const batch = messageIds.slice(i, i + batchSize);
                await client.users.messages.batchModify({
                    userId: 'me',
                    requestBody: {
                        ids: batch,
                        addLabelIds: [toLabelId],
                        removeLabelIds: [fromLabelId],
                    },
                });
                console.log(`Moved batch ${Math.floor(i / batchSize) + 1}: ${batch.length} message(s) from "${opts.from}" to "${opts.to}".`);
            }

            console.log(`Done. Moved ${messageIds.length} message(s) total.`);
        });

    gmail
        .command('label-add')
        .argument('<messageId>', 'Message ID')
        .description('Add a label to a message')
        .requiredOption('--label <labelName>', 'Label name to add')
        .option('-a, --account <email>', 'Account to use')
        .action(async (messageId: string, opts: { label: string; account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getGmail(email);
            const labelId: string = await resolveLabelId(client, opts.label);

            await client.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: { addLabelIds: [labelId] },
            });

            console.log(`Added label "${opts.label}" to message ${messageId}.`);
        });

    gmail
        .command('label-remove')
        .argument('<messageId>', 'Message ID')
        .description('Remove a label from a message')
        .requiredOption('--label <labelName>', 'Label name to remove')
        .option('-a, --account <email>', 'Account to use')
        .action(async (messageId: string, opts: { label: string; account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getGmail(email);
            const labelId: string = await resolveLabelId(client, opts.label);

            await client.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: { removeLabelIds: [labelId] },
            });

            console.log(`Removed label "${opts.label}" from message ${messageId}.`);
        });

    gmail
        .command('label-create')
        .argument('<name>', 'Label name to create')
        .description('Create a new label')
        .option('-a, --account <email>', 'Account to use')
        .action(async (name: string, opts: { account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getGmail(email);

            const resp = await client.users.labels.create({
                userId: 'me',
                requestBody: {
                    name,
                    labelListVisibility: 'labelShow',
                    messageListVisibility: 'show',
                },
            });

            console.log(`Created label "${resp.data.name}" (ID: ${resp.data.id})`);
        });

    gmail
        .command('label-delete')
        .argument('<name>', 'Label name to delete')
        .description('Delete a label')
        .option('-a, --account <email>', 'Account to use')
        .action(async (name: string, opts: { account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getGmail(email);
            const labelId: string = await resolveLabelId(client, name);

            await client.users.labels.delete({
                userId: 'me',
                id: labelId,
            });

            console.log(`Deleted label "${name}".`);
        });

    gmail
        .command('count')
        .argument('<query>', 'Gmail search query (e.g. "label:MyLabel", "is:unread", "from:user@example.com")')
        .description('Get approximate message count for a search query')
        .option('-a, --account <email>', 'Account to use')
        .action(async (query: string, opts: { account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getGmail(email);

            const resp = await client.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: 1,
            });

            const estimate = resp.data.resultSizeEstimate ?? 0;
            console.log(`Approximate count: ${estimate}`);
        });

    gmail
        .command('search')
        .argument('<query>', 'Gmail search query (e.g. "from:user@example.com", "is:unread", "label:MyLabel")')
        .description('Search messages')
        .option('-a, --account <email>', 'Account to use')
        .option('-m, --max <number>', 'Max messages to show', '10')
        .action(async (query: string, opts: { account?: string; max: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getGmail(email);
            const maxResults: number = parseInt(opts.max, 10);

            const listResp = await client.users.messages.list({
                userId: 'me',
                maxResults,
                q: query,
            });

            const messages = listResp.data.messages;
            if (!messages || messages.length === 0) {
                console.log('No messages found.');
                return;
            }

            await fetchAndPrintMessages(client, messages);
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
