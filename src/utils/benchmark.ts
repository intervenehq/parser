import Logger from './logger';

export async function benchmark<T>(
  name: string,
  fn: () => Promise<T>,
  logger: Logger,
) {
  const start = Date.now();
  await logger.info(`Starting '${name}'`);

  const result = await fn();

  const end = Date.now();
  const duration = end - start;
  await logger.info(`Finished '${name}' in ${duration}ms`);

  return result;
}
