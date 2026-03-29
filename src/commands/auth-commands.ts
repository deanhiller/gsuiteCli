import { Command } from 'commander';
import { doLoginAll, doLoginOne } from '../auth.js';
import { listAccounts, removeToken } from '../lib/token-store.js';

export function registerAuthCommands(program: Command): void {
    const auth: Command = program.command('auth').description('Manage Google account authentication');

    auth
        .command('login')
        .description('Log in to Google accounts (loops until you stop)')
        .option('--single', 'Log in to just one account')
        .action(async (opts: { single?: boolean }) => {
            if (opts.single) {
                await doLoginOne();
            } else {
                await doLoginAll();
            }
        });

    auth
        .command('list')
        .description('List all logged-in accounts')
        .action(() => {
            const accounts: string[] = listAccounts();
            if (accounts.length === 0) {
                console.log('No accounts logged in. Run "gsuite auth login" to add one.');
                return;
            }
            for (const account of accounts) {
                console.log(account);
            }
        });

    auth
        .command('logout')
        .argument('<email>', 'Email address to log out')
        .description('Remove a stored account')
        .action((email: string) => {
            const removed: boolean = removeToken(email);
            if (removed) {
                console.log(`Logged out ${email}`);
            } else {
                console.error(`Error: Account '${email}' not found.`);
                process.exit(1);
            }
        });
}
