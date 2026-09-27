// Demo only: the deadline stays fixed for the lifetime of this process.
import { createServer } from 'node:http';
const seconds = Number(process.env['DEMO_SECONDS'] ?? 60);
if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid DEMO_SECONDS');
const deadline = Date.now() + seconds * 1000;
createServer((request, response) => {
  if (request.url !== '/api/deadline') {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify({ secondsLeft: Math.max(0, (deadline - Date.now()) / 1000) }));
}).listen(4300, '127.0.0.1', () => console.log('Demo API: http://127.0.0.1:4300/api/deadline'));
