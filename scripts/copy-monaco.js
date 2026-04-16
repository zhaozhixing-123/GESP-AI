const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "node_modules", "monaco-editor", "min");
const dest = path.join(__dirname, "..", "public", "monaco-editor", "min");

if (fs.existsSync(dest)) {
  console.log("[copy-monaco] already exists, skipping");
  process.exit(0);
}

function copyDir(s, d) {
  fs.mkdirSync(d, { recursive: true });
  for (const entry of fs.readdirSync(s, { withFileTypes: true })) {
    const sp = path.join(s, entry.name);
    const dp = path.join(d, entry.name);
    if (entry.isDirectory()) copyDir(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}

copyDir(src, dest);
console.log("[copy-monaco] copied to public/monaco-editor/min");
