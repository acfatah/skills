import type { Config } from "./config.ts";
import { git } from "./location.ts";

// D6: a project is keyed by its origin URL, without scheme, user, port, or
// .git, and with a lowercase host: github.com/acfatah/skills.
export function normalizeRemote(url: string): string {
  let u = url.trim();
  const scp = /^(?:[^@/]+@)?([^:/]+):(?!\/)(.+)$/.exec(u);
  let host: string;
  let path: string;
  if (scp && !/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) {
    host = scp[1]!;
    path = scp[2]!;
  } else {
    const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]*)(?::\d+)?(\/.*)?$/i.exec(u);
    if (!m) return u.replace(/\.git$/, "").replace(/\/+$/, "");
    host = m[1]!;
    path = m[2] ?? "";
  }
  path = path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/, "");
  return host ? `${host.toLowerCase()}/${path}` : path;
}

// The project key for a checkout or declared folder: its origin, else a
// slug from the user config's `dirs` map, else null (a local-only project).
export function projectKey(repoRoot: string | null, dir: string, config: Config): string | null {
  if (repoRoot) {
    const origin = git(["remote", "get-url", "origin"], repoRoot);
    if (origin.ok && origin.out) return normalizeRemote(origin.out);
  }
  for (const path of [dir, repoRoot]) {
    if (path && config.dirs?.[path]) return config.dirs[path]!;
  }
  return null;
}
