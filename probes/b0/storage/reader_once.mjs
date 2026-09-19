import { DatabaseSync } from 'node:sqlite';

const [dbPath] = process.argv.slice(2);
const db = new DatabaseSync(dbPath);
console.log(JSON.stringify(db.prepare('SELECT COUNT(*) AS count FROM events').get()));
db.close();
