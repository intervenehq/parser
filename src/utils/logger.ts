import type { Options as OraOptions } from 'ora';

export default interface Logger {
  log: (...args: any[]) => Promise<void> | void;
  info: (...args: any[]) => Promise<void> | void;
  warn: (...args: any[]) => Promise<void> | void;
  error: (...args: any[]) => Promise<void> | void;
  showLoader?: (options: OraOptions) => Promise<void> | void;
  hideLoader?: () => Promise<void> | void;
}
