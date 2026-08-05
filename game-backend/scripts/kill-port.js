'use strict';

// Runs as `predev` before `npm run dev` (see package.json) — frees the
// backend's port if a previous, stale `node server.js`/`nodemon` instance
// is still holding it. This is exactly what caused the "CORS blocked" /
// "Failed to fetch" confusion earlier: an old dev server kept answering on
// the expected port with outdated behavior, while a NEW one either failed
// to bind (EADDRINUSE) or the browser was silently still talking to the old
// one. Killing anything on the port first means `npm run dev` always starts
// a genuinely fresh instance instead of layering on top of a leftover one.
const { execSync } = require('child_process');

const port = process.argv[2];
if (!port) process.exit(0);

try {
  const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
  const pids = new Set();
  output.split('\n').forEach((line) => {
    const match = line.trim().match(/LISTENING\s+(\d+)\s*$/);
    if (match) pids.add(match[1]);
  });

  pids.forEach((pid) => {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      console.log(`[predev] freed port ${port} (stopped leftover process ${pid})`);
    } catch (_) {
      // Already gone, or not killable (permissions) — either way, `dev` will
      // surface a clear EADDRINUSE error itself if the port is still stuck.
    }
  });
} catch (_) {
  // netstat/findstr find nothing → nothing listening on the port. Fine, no-op.
}
