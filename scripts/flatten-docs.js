const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const browserDir = path.join(projectRoot, 'docs', 'browser');
const docsDir = path.join(projectRoot, 'docs');

if (!fs.existsSync(browserDir)) {
  console.error('Nothing to flatten: docs/browser not found. Did you run `ng build`?');
  process.exit(0);
}

// Move every generated file from docs/browser to docs root so GitHub Pages can serve them.
for (const entry of fs.readdirSync(browserDir)) {
  const from = path.join(browserDir, entry);
  const to = path.join(docsDir, entry);
  fs.renameSync(from, to);
}

fs.rmSync(browserDir, { recursive: true, force: true });

// Add a SPA fallback so GitHub Pages serves the app for deep links.
const indexPath = path.join(docsDir, 'index.html');
const notFoundPath = path.join(docsDir, '404.html');
if (fs.existsSync(indexPath)) {
  fs.copyFileSync(indexPath, notFoundPath);
}
