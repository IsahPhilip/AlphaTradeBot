'use strict';

const fs = require('fs');
const path = require('path');

const stamp = new Date().toISOString().replace(/[.:]/g, '-');
const outputDir = path.join(process.cwd(), 'logs', 'backups');

fs.mkdirSync(outputDir, { recursive: true });

const payload = {
  createdAt: new Date().toISOString(),
  message: 'Backup placeholder. Replace with real DB dump for production.'
};

const outputPath = path.join(outputDir, `backup-${stamp}.json`);
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

console.log(`Backup written to ${outputPath}`);
