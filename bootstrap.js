const fs = require('fs');
const path = require('path');
const Module = require('module');

const sharedNodeModules = path.join(__dirname, '..', 'nexion_broadcast_backend', 'node_modules');

if (fs.existsSync(sharedNodeModules)) {
  process.env.NODE_PATH = [sharedNodeModules, process.env.NODE_PATH]
    .filter(Boolean)
    .join(path.delimiter);
  Module._initPaths();
}

require('./server');
