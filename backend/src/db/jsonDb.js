import fs from "fs/promises";
import path from "path";

const baseDir = path.resolve("src/db/data");

async function ensureFile(fileName, defaultValue = []) {
  const fullPath = path.join(baseDir, fileName);
  try {
    await fs.access(fullPath);
  } catch {
    await fs.mkdir(baseDir, { recursive: true });
    await fs.writeFile(fullPath, JSON.stringify(defaultValue, null, 2), "utf-8");
  }
  return fullPath;
}

export async function readJson(fileName, defaultValue = []) {
  const fullPath = await ensureFile(fileName, defaultValue);
  const raw = await fs.readFile(fullPath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

export async function writeJson(fileName, data) {
  const fullPath = await ensureFile(fileName, []);
  await fs.writeFile(fullPath, JSON.stringify(data, null, 2), "utf-8");
}

export async function appendJson(fileName, item) {
  const data = await readJson(fileName, []);
  data.push(item);
  await writeJson(fileName, data);
  return item;
}
