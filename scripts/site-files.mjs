import fs from 'node:fs/promises';
import path from 'node:path';

export const publicDirectories = ['about', 'areas', 'assets', 'blog', 'booking', 'contact', 'cookies', 'gallery', 'gdpr', 'images', 'industries', 'privacy', 'quote', 'services', 'terms'];
export async function pageFiles(root = process.cwd()) {
  const files = [path.join(root, 'index.html')];
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.name === 'index.html') files.push(file);
    }
  }
  for (const dir of publicDirectories.filter(x => !['assets', 'images'].includes(x))) await walk(path.join(root, dir));
  return files;
}
