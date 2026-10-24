import { ValidationError } from "./errors.ts";
import { PRIORITIES, RESOLUTIONS, STATUSES, TYPES } from "./schema.ts";

export type IssueType = (typeof TYPES)[number];
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Resolution = (typeof RESOLUTIONS)[number];

export interface Issue {
  id: number;
  client_id: string | null;
  title: string;
  type: IssueType | null;
  status: Status;
  priority: Priority | null;
  milestone: string | null;
  parent: number | null;
  github: string | null;
  resolution: Resolution | null;
  created: string;
  updated: string;
  closed: string | null;
  body: string;
  labels: string[];
}

export interface Note {
  id: number;
  client_id: string | null;
  issue_id: number;
  date: string;
  text: string;
}

export interface Milestone {
  name: string;
  goal: string | null;
  due: string | null;
  state: "open" | "closed";
  github: string | null;
}

export const OPEN_STATUSES: Status[] = ["triage", "open", "in-progress", "blocked"];
export const ACCEPTED_STATUSES: Status[] = ["open", "in-progress", "blocked"];

// The v1 lifecycle table. `closed` is reached only through `close`, and left
// only through `reopen`.
export const TRANSITIONS: Record<Status, Status[]> = {
  triage: ["open", "closed"],
  open: ["in-progress", "closed"],
  "in-progress": ["blocked", "closed", "open"],
  blocked: ["open", "in-progress"],
  closed: ["open"],
};

export function canMove(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to);
}

function oneOf<T extends string>(field: string, values: readonly T[], value: string): T {
  if (!(values as readonly string[]).includes(value)) {
    throw new ValidationError(`${field} must be one of ${values.join(", ")}; got "${value}".`);
  }
  return value as T;
}

export const checkType = (v: string) => oneOf("type", TYPES, v);
export const checkStatus = (v: string) => oneOf("status", STATUSES, v);
export const checkPriority = (v: string) => oneOf("priority", PRIORITIES, v);
export const checkResolution = (v: string) => oneOf("resolution", RESOLUTIONS, v);

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function checkDate(field: string, value: string): string {
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`${field} must be a YYYY-MM-DD date; got "${value}".`);
  }
  return value;
}

export function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((s) => s.trim()).filter(Boolean))];
}

// Dates come from the local clock. ISSUE_TRACKER_TODAY pins them for tests.
export function today(): string {
  const pinned = process.env.ISSUE_TRACKER_TODAY;
  if (pinned) return pinned;
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
