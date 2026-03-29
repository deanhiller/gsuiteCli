import { listAccounts } from '../lib/token-store.js';

export function resolveAccount(specified: string | undefined): string {
    if (specified) {
        return specified;
    }

    const accounts: string[] = listAccounts();

    if (accounts.length === 0) {
        console.error('Error: No accounts logged in. Run "gsuite auth login" first.');
        process.exit(1);
    }

    if (accounts.length === 1) {
        return accounts[0];
    }

    console.error('Error: Multiple accounts logged in. Specify one with --account <email>:');
    for (const account of accounts) {
        console.error(`  ${account}`);
    }
    process.exit(1);
}
