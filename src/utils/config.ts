import fs from "fs";
import path from "path";
import os from "os";

export const configFile = path.join(os.homedir(), ".interveneconfig");

export const getConfig = (): Record<string, string> => {
  const config = fs.existsSync(configFile)
    ? JSON.parse(fs.readFileSync(configFile, "utf8"))
    : {};

  return {
    ...process.env,
    ...config,
  };
};
