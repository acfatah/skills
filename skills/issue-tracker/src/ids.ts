import { UsageError } from "./errors.ts";

export type DbName = "issues" | "security";

export type IdRef =
  | { db: DbName; id: number; pid?: undefined }
  | { db: DbName; pid: number; id?: undefined };

// Accepts 7, 0007, S7, S0007, and provisional P1 or SP1.
export function parseId(text: string): IdRef {
  const m = /^(S)?(P)?0*(\d+)$/i.exec(text.trim());
  if (!m || Number(m[3]) === 0) {
    throw new UsageError(`Not an issue id: ${text}. Use 7, 0007, S0007, or P1.`);
  }
  const db: DbName = m[1] ? "security" : "issues";
  return m[2] ? { db, pid: Number(m[3]) } : { db, id: Number(m[3]) };
}

export function parseRealId(text: string): { db: DbName; id: number } {
  const ref = parseId(text);
  if (ref.id === undefined) {
    throw new UsageError(
      `${text} is a provisional id; it gets a real id once Turso is reachable. Run flush first.`,
    );
  }
  return { db: ref.db, id: ref.id };
}

export function formatId(db: DbName, id: number): string {
  return `${db === "security" ? "S" : ""}${String(id).padStart(4, "0")}`;
}

export function formatPid(db: DbName, pid: number): string {
  return `${db === "security" ? "S" : ""}P${pid}`;
}
