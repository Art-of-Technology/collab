import { initializeExecutionJournal } from '../src/lib/forge/execution-journal.mjs';

initializeExecutionJournal(process.argv[2]).then(authorityId => {
  console.log(JSON.stringify({ authorityId }));
}).catch(() => {
  console.error('Journal initialization refused; verify the independently mounted empty directory.');
  process.exitCode = 1;
});
