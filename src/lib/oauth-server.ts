import * as http from 'node:http';
import * as url from 'node:url';

export function waitForAuthCode(port: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const server: http.Server = http.createServer((req, res) => {
            if (!req.url) {
                res.writeHead(400);
                res.end('Bad request');
                return;
            }

            const parsed: url.URL = new url.URL(req.url, `http://localhost:${port}`);
            const code: string | null = parsed.searchParams.get('code');
            const error: string | null = parsed.searchParams.get('error');

            if (error) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html><body><h1>Authorization failed</h1><p>You can close this tab.</p></body></html>');
                server.close();
                reject(new Error(`OAuth error: ${error}`));
                return;
            }

            if (code) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html><body><h1>Login successful!</h1><p>You can close this tab.</p></body></html>');
                server.close();
                resolve(code);
                return;
            }

            res.writeHead(404);
            res.end('Not found');
        });

        server.listen(port, () => {
            // Server is ready
        });

        server.on('error', (err: Error) => {
            reject(new Error(`Failed to start OAuth callback server on port ${port}: ${err.message}`));
        });
    });
}
