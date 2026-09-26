// A static server that behaves like GitHub Pages: serves a folder as-is, with the content types a
// PlayCanvas build needs. Used to check the Pages layout before turning Pages on.
// Usage: node serve-static.js <folder> [port]
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3]) || 5180;
const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ogg': 'audio/ogg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.wasm': 'application/wasm',
    '.glb': 'model/gltf-binary',
    '.bin': 'application/octet-stream',
    '.txt': 'text/plain; charset=utf-8'
};

http.createServer(function (req, res) {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url.endsWith('/')) url += 'index.html';
    const file = path.resolve(root, '.' + url);
    if (!file.startsWith(root)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
    }
    fs.readFile(file, function (err, data) {
        if (err) {
            console.log('404 ' + url);
            res.writeHead(404);
            res.end('not found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        res.end(data);
    });
}).listen(port, '127.0.0.1', function () {
    console.log('serving ' + root + ' on http://localhost:' + port);
});
