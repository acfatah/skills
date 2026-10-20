// @bun
// src/errors.ts
class CliError extends Error {
  exitCode;
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
    this.name = new.target.name;
  }
}

class UsageError extends CliError {
}

// src/cli.ts
var VERSION = "2.0.0";
var HELP = `issues ${VERSION}: issue tracking in SQLite

Usage: bun scripts/issues.js [--dir <path>] <verb> [options]

Global options:
  --dir <path>   Keep the issues files in <path> instead of <root>/.claude/
  --help         Show this help
  --version      Show the CLI version

Exit codes: 0 ok, 1 usage or validation, 2 offline, 3 location needs a decision.
`;
async function main(argv) {
  const args = [...argv];
  if (args.length === 0 || args.includes("--help") || args[0] === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (args[0] === "--version") {
    process.stdout.write(`${VERSION}
`);
    return 0;
  }
  throw new UsageError(`Unknown verb: ${args[0]}. Run --help.`);
}
if (import.meta.main) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => {
    if (err instanceof CliError) {
      process.stderr.write(`error: ${err.message}
`);
      process.exit(err.exitCode);
    }
    process.stderr.write(`error: ${err?.stack ?? err}
`);
    process.exit(1);
  });
}
export {
  HELP,
  VERSION,
  main
};
