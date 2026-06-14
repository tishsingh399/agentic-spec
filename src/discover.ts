import { readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

/** A spec directory is any folder that directly contains an index.md. */
export async function isSpecDir(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, "index.md"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Expand input paths into concrete spec directories. A path that directly
 * contains index.md is a spec dir; otherwise we recurse into subdirectories and
 * collect every descendant that has one. This lets `validate specs` discover
 * nested categories (e.g. specs/ai/<component>) instead of silently skipping
 * them when the input is a parent directory.
 */
export async function expandSpecDirs(inputs: string[]): Promise<string[]> {
  const found = new Set<string>();
  async function walk(dir: string): Promise<void> {
    if (await isSpecDir(dir)) {
      found.add(resolve(dir));
      return; // a spec dir is a leaf; don't descend into it
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory() && e.name !== "node_modules") {
        await walk(join(dir, e.name));
      }
    }
  }
  for (const input of inputs) await walk(input);
  return [...found].sort();
}
