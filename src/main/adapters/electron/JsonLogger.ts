import type { LogFields, Logger } from '@core/ports/Logger';

const SENSITIVE_KEYS = new Set(['token', 'cookie', 'authorization', 'set-cookie', 'csrf']);

function sanitize(fields?: LogFields): LogFields | undefined {
  if (!fields) return undefined;
  const result: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : value;
  }
  return result;
}

export class JsonLogger implements Logger {
  private write(level: string, event: string, fields?: LogFields): void {
    const payload = {
      time: new Date().toISOString(),
      level,
      event,
      ...sanitize(fields),
    };
    const line = `${JSON.stringify(payload)}\n`;
    if (level === 'error') process.stderr.write(line);
    else process.stdout.write(line);
  }

  debug(event: string, fields?: LogFields): void {
    if (process.env.NODE_ENV !== 'production') this.write('debug', event, fields);
  }

  info(event: string, fields?: LogFields): void {
    this.write('info', event, fields);
  }

  warn(event: string, fields?: LogFields): void {
    this.write('warn', event, fields);
  }

  error(event: string, fields?: LogFields): void {
    this.write('error', event, fields);
  }
}
