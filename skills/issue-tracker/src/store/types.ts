export type SqlValue = string | number | bigint | null | Uint8Array;

export type Row = Record<string, unknown>;

export interface Stmt {
  sql: string;
  args?: SqlValue[];
}

// The only database surface the rest of the CLI sees. Both adapters return
// plain row objects with JS numbers for integers.
export interface Store {
  readonly kind: "local" | "turso";
  query<T = Row>(sql: string, args?: SqlValue[]): Promise<T[]>;
  exec(sql: string, args?: SqlValue[]): Promise<void>;
  // Runs every statement in one transaction and returns each one's rows.
  batch(stmts: Stmt[]): Promise<Row[][]>;
  close(): Promise<void>;
}
