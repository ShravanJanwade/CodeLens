import { useState } from 'react';
import { ArrowRight, FileCode2 } from 'lucide-react';
import type { Repository } from './types';
import { EmptyState } from '../../components/ui';
export default function Dependencies({ repo, select }: { repo: Repository; select: (path: string) => void }) {
  const paths = [...new Set(repo.dependencyGraph.flatMap((e) => [e.sourcePath, e.targetPath]))].sort();
  const [chosen, setChosen] = useState('');
  const active = chosen || paths[0] || '';
  const imports = repo.dependencyGraph.filter((e) => e.sourcePath === active),
    usedBy = repo.dependencyGraph.filter((e) => e.targetPath === active);
  return (
    <section className="space-y-5">
      <div className="surface-panel">
        <span className="eyebrow">UNDERSTAND THE CONNECTIONS</span>
        <h2>Which files rely on each other?</h2>
        <p className="subtle-text">
          A dependency here means one source file imports another. Before changing a file, check “Used by” to
          find code that may need testing too.
        </p>
      </div>
      {paths.length ? (
        <>
          <label className="field-label">
            Explore a file
            <select className="input" value={active} onChange={(e) => setChosen(e.target.value)}>
              {paths.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <div className="dependency-focus">
            <FileCode2 size={20} />
            <strong>{active}</strong>
            <button className="text-link" onClick={() => select(active)}>
              Open code <ArrowRight size={14} />
            </button>
          </div>
          <div className="two-column equal-columns">
            {[
              ['Imports from', imports.map((e) => e.targetPath), 'Files this file uses.'],
              [
                'Used by',
                usedBy.map((e) => e.sourcePath),
                'Start with these files when checking the impact of a change.',
              ],
            ].map(([title, files, description]: any) => (
              <section className="surface-panel" key={title}>
                <h2>
                  {title} <span className="count-badge">{files.length}</span>
                </h2>
                <p className="subtle-text mb-4">{description}</p>
                {files.length ? (
                  files.map((p: string) => (
                    <button className="file-item" key={p} onClick={() => setChosen(p)}>
                      <FileCode2 size={15} />
                      <span>{p}</span>
                      <ArrowRight size={14} />
                    </button>
                  ))
                ) : (
                  <p className="subtle-text">No indexed connections in this direction.</p>
                )}
              </section>
            ))}
          </div>
          <p className="subtle-text">
            This map covers resolved relative imports. Package dependencies, aliases and dynamic imports may
            be missing; an empty list does not prove a file is unused.
          </p>
        </>
      ) : (
        <EmptyState
          title="No supported file connections found"
          description="You can still explore and ask about the code. This index does not resolve every language or import style."
        />
      )}
    </section>
  );
}
