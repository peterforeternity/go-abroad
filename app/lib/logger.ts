type LogLevel = "info" | "warn" | "error";
type LogFields = Record<string, unknown>;

const SENSITIVE_KEY = /(password|passcode|token|cookie|authorization|api[_-]?key|secret|private[_-]?key|session)/i;
const MAX_STRING_LENGTH = 240;

function redact(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…`
      : value;
  }
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redact(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

function write(level: LogLevel, event: string, fields: LogFields = {}): void {
  const entry = redact({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  }) as Record<string, unknown>;

  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logInfo(event: string, fields?: LogFields): void {
  write("info", event, fields);
}

export function logWarn(event: string, fields?: LogFields): void {
  write("warn", event, fields);
}

export function logError(event: string, fields?: LogFields): void {
  write("error", event, fields);
}

export function redactLogValue(value: unknown): unknown {
  return redact(value);
}
