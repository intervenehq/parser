import fs from 'fs';
import os from 'os';
import path from 'path';

export const configFile = path.join(os.homedir(), '.interveneconfig');

export const getConfig = (): Record<string, string> => {
  const config = fs.existsSync(configFile)
    ? JSON.parse(fs.readFileSync(configFile, 'utf8'))
    : {};

  return {
    ...process.env,
    ...config,
  };
};
