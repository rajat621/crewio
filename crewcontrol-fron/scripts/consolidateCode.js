const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const outFile = path.join(rootDir, 'crewcontrol-fron-all-files.txt');

const textExtensions = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.scss', '.md', '.txt', '.yml', '.yaml', '.svg', '.env', '.lock', '.jsonc'
]);

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext) return textExtensions.has(ext);
  // include files without extension commonly textual
  const base = path.basename(filePath).toLowerCase();
  return ['license', 'readme', '.gitignore'].includes(base);
}

function walk(dir, results = []) {
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of list) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      walk(full, results);
    } else if (ent.isFile()) {
      if (isTextFile(full)) results.push(full);
    }
  }
  return results;
}

try {
  const files = walk(rootDir);
  files.sort();

  let out = '';
  for (const file of files) {
    const rel = path.relative(rootDir, file).replace(/\\/g, '/');
    out += `--- PATH: ${rel}\n`;
    out += `--- START OF FILE\n`;
    try {
      const content = fs.readFileSync(file, 'utf8');
      out += content;
    } catch (err) {
      out += `[ERROR READING FILE: ${String(err)}]`;
    }
    out += `\n--- END OF FILE\n\n`;
  }

  fs.writeFileSync(outFile, out, 'utf8');
  console.log('Wrote consolidated file:', outFile);
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
