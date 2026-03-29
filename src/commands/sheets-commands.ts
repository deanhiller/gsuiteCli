import { Command } from 'commander';
import { getSheets } from '../lib/google-client.js';
import { resolveAccount } from './account-resolver.js';

export function registerSheetsCommands(program: Command): void {
    const sheets: Command = program.command('sheets').description('Google Sheets operations');

    sheets
        .command('create')
        .description('Create a new spreadsheet')
        .requiredOption('-t, --title <title>', 'Spreadsheet title')
        .option('-a, --account <email>', 'Account to use')
        .action(async (opts: { title: string; account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getSheets(email);

            const resp = await client.spreadsheets.create({
                requestBody: {
                    properties: { title: opts.title },
                },
            });

            const id: string = resp.data.spreadsheetId ?? '';
            const url: string = resp.data.spreadsheetUrl ?? '';
            console.log(`Created spreadsheet: ${opts.title}`);
            console.log(`  ID: ${id}`);
            console.log(`  URL: ${url}`);
        });

    sheets
        .command('read')
        .argument('<spreadsheetId>', 'Spreadsheet ID')
        .description('Read values from a spreadsheet')
        .option('-r, --range <range>', 'Cell range (e.g. Sheet1!A1:D10)', 'Sheet1')
        .option('-a, --account <email>', 'Account to use')
        .action(async (spreadsheetId: string, opts: { range: string; account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getSheets(email);

            const resp = await client.spreadsheets.values.get({
                spreadsheetId,
                range: opts.range,
            });

            const rows = resp.data.values;
            if (!rows || rows.length === 0) {
                console.log('No data found.');
                return;
            }

            for (const row of rows) {
                console.log((row as string[]).join('\t'));
            }
        });

    sheets
        .command('write')
        .argument('<spreadsheetId>', 'Spreadsheet ID')
        .description('Write values to a spreadsheet')
        .requiredOption('-r, --range <range>', 'Cell range (e.g. Sheet1!A1)')
        .requiredOption('-v, --values <json>', 'Values as JSON array of arrays (e.g. \'[["a","b"],["c","d"]]\')')
        .option('-a, --account <email>', 'Account to use')
        .action(async (spreadsheetId: string, opts: { range: string; values: string; account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getSheets(email);

            const values: string[][] = JSON.parse(opts.values) as string[][];

            const resp = await client.spreadsheets.values.update({
                spreadsheetId,
                range: opts.range,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values },
            });

            console.log(`Updated ${resp.data.updatedCells} cells in range ${resp.data.updatedRange}`);
        });
}
