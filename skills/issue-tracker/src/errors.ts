// Every error the CLI reports on purpose. The exit code tells Claude what
// to do next: 1 fix the command, 2 wait until online, 3 ask the user where.

// Ends a message with a period unless it already ends a sentence, so
// messages can be joined without "?." or "..".
export function sentence(message: string): string {
  return /[.?!]$/.test(message.trim()) ? message.trim() : `${message.trim()}.`;
}

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UsageError extends CliError {}

export class ValidationError extends CliError {}

export class Offline extends CliError {
  constructor(message = "Turso is unreachable") {
    super(message, 2);
  }
}

export class AuthError extends CliError {
  constructor(message: string) {
    super(
      `${message}. Check the token; if it leaked, revoke it with ` +
        "`turso db tokens invalidate <db>` and issue a new one.",
    );
  }
}

export class LocationError extends CliError {
  constructor(message: string) {
    super(message, 3);
  }
}
