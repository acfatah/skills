import type { DbName } from "./ids.ts";
import { FILES, type Location, prepareFile } from "./location.ts";
import { migrate } from "./schema.ts";
import { LocalStore } from "./store/local.ts";
import type { Store } from "./store/types.ts";

export function dbFile(db: DbName): string {
  return db === "security" ? FILES.security : FILES.issues;
}

export async function openLocal(loc: Location, db: DbName): Promise<LocalStore> {
  const store = new LocalStore(prepareFile(loc, dbFile(db)));
  await migrate(store);
  return store;
}

// Picks the store for each database and runs one command against it.
export class Backend {
  constructor(readonly loc: Location) {}

  async run<T>(db: DbName, fn: (store: Store) => Promise<T>): Promise<T> {
    const store = await openLocal(this.loc, db);
    try {
      return await fn(store);
    } finally {
      await store.close();
    }
  }
}
