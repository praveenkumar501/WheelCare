const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const DB_PATH = path.join(__dirname, 'data', 'db.json');
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DBNAME = process.env.MONGODB_DBNAME || 'wheelcare';
const DOC_ID = 'wheelcare';

let cachedDB = null;
let collection = null;

function loadSeedFromDisk() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

async function connect() {
  if (!MONGODB_URI) {
    console.log('MONGODB_URI not set — using local data/db.json (data will NOT survive a redeploy)');
    cachedDB = loadSeedFromDisk();
    return;
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  collection = client.db(MONGODB_DBNAME).collection('state');

  const existing = await collection.findOne({ _id: DOC_ID });
  if (existing) {
    const { _id, ...rest } = existing;
    cachedDB = rest;
    console.log('Connected to MongoDB — loaded existing data');
  } else {
    const seed = loadSeedFromDisk();
    await collection.insertOne({ _id: DOC_ID, ...seed });
    cachedDB = seed;
    console.log('Connected to MongoDB — seeded initial data');
  }
}

const ready = connect().catch((err) => {
  console.error('MongoDB connection failed, falling back to local data/db.json:', err.message);
  collection = null;
  cachedDB = loadSeedFromDisk();
});

function readDB() {
  return JSON.parse(JSON.stringify(cachedDB));
}

function writeDB(data) {
  cachedDB = data;
  if (collection) {
    collection.replaceOne({ _id: DOC_ID }, { _id: DOC_ID, ...data }, { upsert: true })
      .catch((err) => console.error('Failed to persist to MongoDB:', err.message));
  } else {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Failed to persist to local data/db.json:', err.message);
    }
  }
}

function nextId(db, key, prefix) {
  let max = 0;
  for (const item of db[key]) {
    const n = parseInt(String(item.id).replace(prefix, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

module.exports = { readDB, writeDB, nextId, DB_PATH, ready: () => ready };
