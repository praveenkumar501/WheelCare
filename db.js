const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const mysql = require('mysql2/promise');

const DB_PATH = path.join(__dirname, 'data', 'db.json');
const MYSQL_URL = process.env.MYSQL_URL || process.env.DATABASE_URL;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DBNAME = process.env.MONGODB_DBNAME || 'wheelcare';
const DOC_ID = 'wheelcare';

let cachedDB = null;
let backend = 'file'; // 'mysql' | 'mongo' | 'file'
let mysqlPool = null;
let mongoCollection = null;

function loadSeedFromDisk() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

async function connectMysql() {
  mysqlPool = mysql.createPool(MYSQL_URL);
  await mysqlPool.query(
    'CREATE TABLE IF NOT EXISTS wheelcare_state (id VARCHAR(20) PRIMARY KEY, data LONGTEXT)'
  );
  const [rows] = await mysqlPool.query('SELECT data FROM wheelcare_state WHERE id = ?', [DOC_ID]);
  if (rows.length) {
    cachedDB = JSON.parse(rows[0].data);
    console.log('Connected to MySQL — loaded existing data');
  } else {
    const seed = loadSeedFromDisk();
    await mysqlPool.query('INSERT INTO wheelcare_state (id, data) VALUES (?, ?)', [DOC_ID, JSON.stringify(seed)]);
    cachedDB = seed;
    console.log('Connected to MySQL — seeded initial data');
  }
  backend = 'mysql';
}

async function connectMongo() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  mongoCollection = client.db(MONGODB_DBNAME).collection('state');

  const existing = await mongoCollection.findOne({ _id: DOC_ID });
  if (existing) {
    const { _id, ...rest } = existing;
    cachedDB = rest;
    console.log('Connected to MongoDB — loaded existing data');
  } else {
    const seed = loadSeedFromDisk();
    await mongoCollection.insertOne({ _id: DOC_ID, ...seed });
    cachedDB = seed;
    console.log('Connected to MongoDB — seeded initial data');
  }
  backend = 'mongo';
}

async function connect() {
  if (MYSQL_URL) {
    try {
      return await connectMysql();
    } catch (err) {
      console.error('MySQL connection failed, falling back:', err.message);
    }
  }
  if (MONGODB_URI) {
    try {
      return await connectMongo();
    } catch (err) {
      console.error('MongoDB connection failed, falling back:', err.message);
    }
  }
  console.log(
    MYSQL_URL || MONGODB_URI
      ? 'Database connection failed — using local data/db.json (data will NOT survive a redeploy)'
      : 'No MYSQL_URL or MONGODB_URI set — using local data/db.json (data will NOT survive a redeploy)'
  );
  cachedDB = loadSeedFromDisk();
  backend = 'file';
}

const ready = connect();

function readDB() {
  return JSON.parse(JSON.stringify(cachedDB));
}

function writeDB(data) {
  cachedDB = data;
  if (backend === 'mysql') {
    mysqlPool.query('UPDATE wheelcare_state SET data = ? WHERE id = ?', [JSON.stringify(data), DOC_ID])
      .catch((err) => console.error('Failed to persist to MySQL:', err.message));
  } else if (backend === 'mongo') {
    mongoCollection.replaceOne({ _id: DOC_ID }, { _id: DOC_ID, ...data }, { upsert: true })
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
