import { Command } from 'commander';
import { getDocs } from '../lib/google-client.js';
import { resolveAccount } from './account-resolver.js';
import type { docs_v1 } from 'googleapis';

function extractText(content: docs_v1.Schema$StructuralElement[] | undefined): string {
    if (!content) {
        return '(empty document)';
    }

    const parts: string[] = [];
    for (const element of content) {
        if (element.paragraph) {
            const paragraphElements = element.paragraph.elements;
            if (paragraphElements) {
                for (const pe of paragraphElements) {
                    if (pe.textRun?.content) {
                        parts.push(pe.textRun.content);
                    }
                }
            }
        }
        if (element.table) {
            const table = element.table;
            if (table.tableRows) {
                for (const row of table.tableRows) {
                    if (row.tableCells) {
                        for (const cell of row.tableCells) {
                            const cellText: string = extractText(cell.content);
                            if (cellText.trim()) {
                                parts.push(cellText);
                            }
                        }
                    }
                }
            }
        }
    }

    return parts.join('');
}

function getDocEndIndex(content: docs_v1.Schema$StructuralElement[] | undefined): number {
    if (!content || content.length === 0) {
        return 1;
    }
    const lastElement = content[content.length - 1];
    return (lastElement.endIndex ?? 2) - 1;
}

export function registerDocsCommands(program: Command): void {
    const docs: Command = program.command('docs').description('Google Docs operations');

    docs
        .command('create')
        .description('Create a new document')
        .requiredOption('-t, --title <title>', 'Document title')
        .option('-a, --account <email>', 'Account to use')
        .action(async (opts: { title: string; account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getDocs(email);

            const resp = await client.documents.create({
                requestBody: { title: opts.title },
            });

            const id: string = resp.data.documentId ?? '';
            const url: string = `https://docs.google.com/document/d/${id}/edit`;
            console.log(`Created document: ${opts.title}`);
            console.log(`  ID: ${id}`);
            console.log(`  URL: ${url}`);
        });

    docs
        .command('read')
        .argument('<documentId>', 'Document ID')
        .description('Read document content as plain text')
        .option('-a, --account <email>', 'Account to use')
        .action(async (documentId: string, opts: { account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getDocs(email);

            const resp = await client.documents.get({ documentId });

            console.log(`Title: ${resp.data.title}`);
            console.log('---');
            const text: string = extractText(resp.data.body?.content);
            console.log(text);
        });

    docs
        .command('append')
        .argument('<documentId>', 'Document ID')
        .description('Append text to end of document')
        .requiredOption('--text <text>', 'Text to append')
        .option('-a, --account <email>', 'Account to use')
        .action(async (documentId: string, opts: { text: string; account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getDocs(email);

            // Get current doc to find end index
            const doc = await client.documents.get({ documentId });
            const endIndex: number = getDocEndIndex(doc.data.body?.content);

            await client.documents.batchUpdate({
                documentId,
                requestBody: {
                    requests: [
                        {
                            insertText: {
                                location: { index: endIndex },
                                text: opts.text,
                            },
                        },
                    ],
                },
            });

            console.log(`Appended text to document ${documentId}`);
        });
}
