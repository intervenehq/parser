import fs from 'fs';
import os from 'os';
import path from 'path';

export const configFile = path.join(os.homedir(), '.interveneconfig');

export const getConfig = () => {
  const config = fs.existsSync(configFile)
    ? JSON.parse(fs.readFileSync(configFile, 'utf8'))
    : {};

  return {
    ...process.env,
    ...config,
  } as {
    OPENAI_API_KEY?: string;
    VECTOR_STORE?: string;
    PINECONE_INDEX?: string;
    PINECONE_ENVIRONMENT?: string;
    PINECONE_API_KEY?: string;
  } & { [key: string]: string };
};
