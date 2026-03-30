import { Command } from 'commander';
import { doLogin } from '../auth.js';
import { listAccounts, removeToken } from '../lib/token-store.js';
import { promptUser } from '../config.js';

export function registerAuthCommands(program: Command): void {
    const auth: Command = program.command('auth').description('Manage Google account authentication');

    auth
        .command('login')
        .description('Log in to a Google account (run again to add more)')
        .action(async () => {
            await doLogin();
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
        .argument('[email]', 'Email address to log out (prompts if not provided)')
        .description('Remove a stored account')
        .action(async (email?: string) => {
            const accounts: string[] = listAccounts();

            if (accounts.length === 0) {
                console.log('No accounts logged in.');
                return;
            }

            let target: string = email ?? '';

            if (!target) {
                if (accounts.length === 1) {
                    target = accounts[0];
                } else {
                    console.log('Logged-in accounts:');
                    for (let i = 0; i < accounts.length; i++) {
                        console.log(`  ${i + 1}. ${accounts[i]}`);
                    }
                    console.log('');
                    const choice: string = await promptUser('Which account to log out? (number): ');
                    const choiceNum: number = parseInt(choice, 10);
                    if (choiceNum >= 1 && choiceNum <= accounts.length) {
                        target = accounts[choiceNum - 1];
                    } else {
                        console.error('Invalid selection.');
                        process.exit(1);
                    }
                }
            }

            const removed: boolean = removeToken(target);
            if (removed) {
                console.log(`Logged out ${target}`);
            } else {
                console.error(`Error: Account '${target}' not found.`);
                process.exit(1);
            }
        });
}
