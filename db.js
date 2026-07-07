const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

function readDB() {
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  return JSON.parse(raw);
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function nextId(db, key, prefix) {
  let max = 0;
  for (const item of db[key]) {
    const n = parseInt(String(item.id).replace(prefix, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

module.exports = { readDB, writeDB, nextId, DB_PATH };
