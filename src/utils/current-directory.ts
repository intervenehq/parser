import path from 'path';
import { fileURLToPath } from 'url';

export const getCurrentDirectory = () =>
  path.dirname(fileURLToPath(import.meta.url));
