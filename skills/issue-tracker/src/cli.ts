import { CliError, UsageError } from "./errors.ts";

export const VERSION = "2.0.0";

export const HELP = `issues ${VERSION}: issue tracking in SQLite

Usage: bun scripts/issues.js [--dir <path>] <verb> [options]

Global options:
  --dir <path>   Keep the issues files in <path> instead of <root>/.claude/
  --help         Show this help
  --version      Show the CLI version

Exit codes: 0 ok, 1 usage or validation, 2 offline, 3 location needs a decision.
`;

export async function main(argv: string[]): Promise<number> {
  const args = [...argv];
  if (args.length === 0 || args.includes("--help") || args[0] === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (args[0] === "--version") {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  throw new UsageError(`Unknown verb: ${args[0]}. Run --help.`);
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      if (err instanceof CliError) {
        process.stderr.write(`error: ${err.message}\n`);
        process.exit(err.exitCode);
      }
      process.stderr.write(`error: ${err?.stack ?? err}\n`);
      process.exit(1);
    },
  );
}
