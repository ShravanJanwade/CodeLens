import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, repositoryPath } from '../api';
import { Loading, ErrorState } from '../../components/ui';

export default function RevisionChanges({ run, recorded }: { run: any; recorded: boolean }) {
  const path = 'src/revision.ts';
  const query = useQuery({
    queryKey: ['revision-comparison', run.repositoryId, run.baseline, run.candidate, recorded],
    queryFn: async () =>
      Promise.all(
        [run.baseline, run.candidate].map(async (revision: string) => {
          if (recorded) {
            const source = run.sources?.find((file: any) => file.revision === revision && file.path === path);
            if (!source) throw new Error('This recorded report does not include its revision configuration.');
            return source.content as string;
          }
          const result = await api(
            `${repositoryPath(run.repositoryId)}/file?revision=${revision}&path=${encodeURIComponent(path)}`,
          );
          return result.data.content as string;
        }),
      ),
  });
  if (query.isLoading) return <Loading label="Comparing the indexed revision configurations…" />;
  if (query.isError) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const contents = query.data ?? [];
  return (
    <>
      <div className="notice">
        TaskForge versions share the application implementation. These actual committed configuration changes
        select the prepared behavior. Open the handler source to inspect how each setting is applied.
      </div>
      {contents[0] === contents[1] && (
        <div className="notice">The baseline and candidate configurations are identical.</div>
      )}
      <div className="two-column">
        {[run.baseline, run.candidate].map((revision: string, index: number) => (
          <section className="surface-panel" key={`${index}-${revision}`}>
            <span className="eyebrow">
              {index ? 'CANDIDATE' : 'BASELINE'} · {revision.slice(0, 10)}
            </span>
            <h2>{path}</h2>
            <pre className="evidence-json mt-4">{contents[index]}</pre>
            <Link
              className="text-link mt-4"
              to={
                recorded
                  ? `/recorded?tab=source&revision=${revision}&path=src%2Fapp.ts`
                  : `/repositories/${run.repositoryId}?tab=code&revision=${revision}&path=src%2Fapp.ts`
              }
            >
              Open this revision’s handler source
            </Link>
          </section>
        ))}
      </div>
    </>
  );
}
