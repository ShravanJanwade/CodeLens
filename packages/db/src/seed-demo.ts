// Entry point: pnpm --filter @codelens/db seed:demo
import { seedPipelineDemo } from './seed-pipeline';

seedPipelineDemo()
  .then((r) => {
    console.log('Demo workspace seeded');
    console.log(`  repository    ${r.repositoryId}`);
    console.log(`  indexed files ${r.files}`);
    console.log(`  import edges  ${r.edges}`);
    console.log(`  pipeline runs ${r.runs}`);
    console.log(`  environments  ${r.environments}`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
