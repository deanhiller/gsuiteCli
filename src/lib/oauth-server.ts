import * as http from 'node:http';
import * as url from 'node:url';
import * as net from 'node:net';

export interface OAuthCallbackServer {
    port: number;
    codePromise: Promise<string>;
}

export function startCallbackServer(): Promise<OAuthCallbackServer> {
    return new Promise((resolveStart, rejectStart) => {
        let resolveCode: (code: string) => void;
        let rejectCode: (err: Error) => void;
        let listenPort: number = 0;

        const codePromise: Promise<string> = new Promise((res, rej) => {
            resolveCode = res;
            rejectCode = rej;
        });

        const server: http.Server = http.createServer((req, res) => {
            if (!req.url) {
                res.writeHead(400);
                res.end('Bad request');
                return;
            }

            const parsed: url.URL = new url.URL(req.url, `http://localhost:${listenPort}`);
            const code: string | null = parsed.searchParams.get('code');
            const error: string | null = parsed.searchParams.get('error');

            if (error) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html><body><h1>Authorization failed</h1><p>You can close this tab.</p></body></html>');
                server.close();
                rejectCode(new Error(`OAuth error: ${error}`));
                return;
            }

            if (code) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html><body><h1>Login successful!</h1><p>You can close this tab.</p></body></html>');
                server.close();
                resolveCode(code);
                return;
            }

            res.writeHead(404);
            res.end('Not found');
        });

        server.listen(0, () => {
            listenPort = (server.address() as net.AddressInfo).port;
            resolveStart({ port: listenPort, codePromise });
        });

        server.on('error', (err: Error) => {
            rejectStart(new Error(`Failed to start OAuth callback server: ${err.message}`));
        });
    });
}
