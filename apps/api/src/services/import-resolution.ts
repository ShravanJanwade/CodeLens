// Resolves an import specifier to a file in the indexed repository:
// relative paths, and the repository's own workspace packages by name.

import fs from 'node:fs';
import path from 'node:path';

const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', 'vendor']);

interface WorkspacePackage {
  dir: string;
  entries: string[];
}

function exportsEntry(exports: unknown): string | undefined {
  if (typeof exports === 'string') return exports;
  if (!exports || typeof exports !== 'object') return undefined;
  const root = (exports as Record<string, unknown>)['.'] ?? exports;
  if (typeof root === 'string') return root;
  if (root && typeof root === 'object')
    for (const condition of ['import', 'default', 'types', 'node', 'require']) {
      const value = (root as Record<string, unknown>)[condition];
      if (typeof value === 'string') return value;
    }
  return undefined;
}

/**
 * Packages declared inside the repository, by name, so a monorepo's
 * `@scope/package` imports resolve to its own files instead of vanishing
 * from the graph as if they were third-party.
 */
export function workspacePackages(root: string): Map<string, WorkspacePackage> {
  const packages = new Map<string, WorkspacePackage>();
  const visit = (directory: string, depth: number) => {
    if (depth > 4) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || IGNORED_DIRECTORIES.has(entry.name)) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full, depth + 1);
      else if (entry.name === 'package.json' && directory !== root) {
        try {
          const manifest = JSON.parse(fs.readFileSync(full, 'utf8')) as Record<string, unknown>;
          if (typeof manifest.name !== 'string') continue;
          const entries = [
            exportsEntry(manifest.exports),
            manifest.module,
            manifest.main,
            'src/index',
            'index',
          ]
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.replace(/^\.\//, ''));
          packages.set(manifest.name, {
            dir: path.relative(root, directory).split(path.sep).join('/'),
            entries,
          });
        } catch {
          // An unreadable manifest only costs this package its edges.
        }
      }
    }
  };
  visit(root, 0);
  return packages;
}

function withExtensions(base: string, knownPaths: Set<string>) {
  const stem = base.replace(/\.(?:[cm]?js|jsx)$/, '');
  const candidates = [
    base,
    ...['.ts', '.tsx', '.js', '.jsx', '.py', '.java'].map((extension) => `${base}${extension}`),
    ...['.ts', '.tsx', '.mts'].map((extension) => `${stem}${extension}`),
    ...['/index.ts', '/index.tsx', '/index.js', '/__init__.py'].map((suffix) => `${base}${suffix}`),
  ];
  return candidates.find((candidate) => knownPaths.has(candidate));
}

export function resolveLocalImport(
  sourcePath: string,
  specifier: string,
  knownPaths: Set<string>,
  packages: Map<string, WorkspacePackage> = new Map(),
) {
  if (specifier.startsWith('.')) {
    return withExtensions(
      path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), specifier)),
      knownPaths,
    );
  }
  const name = [...packages.keys()]
    .filter((candidate) => specifier === candidate || specifier.startsWith(`${candidate}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (!name) return undefined;
  const workspace = packages.get(name)!;
  const join = (relative: string) => path.posix.normalize(path.posix.join(workspace.dir, relative));
  if (specifier !== name) return withExtensions(join(specifier.slice(name.length + 1)), knownPaths);
  for (const entry of workspace.entries) {
    const target = withExtensions(join(entry), knownPaths);
    if (target) return target;
  }
  return undefined;
}
