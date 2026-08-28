'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = process.env.MOM_AI_DATA_DIR || path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'valkyrie-ai-author');
fs.mkdirSync(dataDir, { recursive: true });
module.exports = { dataDir };
