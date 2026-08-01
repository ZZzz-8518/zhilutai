const os = require('node:os');
const path = require('node:path');

if (!process.env.JOB_FINDER_DATA_DIR) {
  process.env.JOB_FINDER_DATA_DIR = path.join(os.tmpdir(), 'jobfinder-tests', String(process.pid));
}
