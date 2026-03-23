import fs from 'node:fs';
import path from 'node:path';
import type { Database } from 'sql.js';

export function persistDatabaseToDisk(db: Database, dbPath: string): void {
  const data = db.export();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(data));
}
