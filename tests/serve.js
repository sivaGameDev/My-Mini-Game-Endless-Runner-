// Tiny static server for the HUD preview (serves this workspace on localhost only).
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
const port = Number(process.env.PORT) || 5178;

http.createServer(function (req, res) {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.resolve(root, '.' + (url === '/' ? '/tests/preview.html' : url));
    if (!file.startsWith(root)) {
        res.writeHead(403);
        res.end();
        return;
    }
    fs.readFile(file, function (err, data) {
        if (err) {
            res.writeHead(404);
            res.end('not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
    });
}).listen(port, '127.0.0.1', function () {
    console.log('HUD preview on http://localhost:' + port);
});
