import { NextRequest, NextResponse } from 'next/server';
import { withAppAuth } from '@/lib/apps/auth-middleware';

// The commit this build was made from. A release is built from `git archive`, which writes the commit over the
// placeholder below (`export-subst` in .gitattributes). A checkout keeps the placeholder; COLLAB_REVISION may name the commit there.
const REVISION = ['$Format:%H$', process.env.COLLAB_REVISION].find(value => /^[0-9a-f]{40}$/.test(value ?? '')) ?? null;
const REPOSITORY = 'Art-of-Technology/collab';
const UNKNOWN_MS = 60_000, KEPT = 1000;
// History does not change, so a yes or a no holds while this process runs. An unknown is asked again after a minute, and
// it never replaces a yes or a no: two requests for one commit can end differently.
const answers = new Map<string, boolean>(), unknownUntil = new Map<string, number>();
// Any valid token can ask about any commit ID, so each map keeps only its newest entries. One that was dropped is asked again.
function keep<Value>(map: Map<string, Value>, key: string, value: Value) {
  map.delete(key);
  if (map.size >= KEPT) map.delete(map.keys().next().value!);
  map.set(key, value);
}

/** Whether the running revision has `commit` in its history. Null when that cannot be told: GitHub does not know the commit, or does not answer. */
async function contains(revision: string, commit: string) {
  if (revision.startsWith(commit)) return true;
  const known = answers.get(commit);
  if (known !== undefined) {
    keep(answers, commit, known);
    return known;
  }
  if ((unknownUntil.get(commit) ?? 0) > Date.now()) return null;
  let answer: boolean | null = null;
  try {
    // shortcut: GitHub's public API without a token, 60 requests an hour per address. A commit GitHub knows costs one request,
    // one it does not know (not pushed, mistyped) one a minute for as long as it is asked about. Give it a token when agents ask about more.
    // Page 2 at one commit a page: the comparison without its list of changed files (16 KB instead of 2 MB).
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/compare/${commit}...${revision}?per_page=1&page=2`,
      { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const { status } = await response.json();
      if (['ahead', 'identical', 'behind', 'diverged'].includes(status)) answer = status === 'ahead' || status === 'identical';
    }
  } catch { /* unknown */ }
  answer = answers.get(commit) ?? answer;
  if (answer !== null) {
    keep(answers, commit, answer);
    unknownUntil.delete(commit);
  } else if (!answers.has(commit)) keep(unknownUntil, commit, Date.now() + UNKNOWN_MS);
  return answer;
}

// GET /api/apps/auth/live[?commit=SHA] - the revision this server runs, and whether a commit is in it.
export const GET = withAppAuth(
  async (request: NextRequest) => {
    const commit = new URL(request.url).searchParams.get('commit');
    if (commit !== null && !/^[0-9a-f]{7,40}$/.test(commit)) {
      return NextResponse.json({ error: 'invalid_request', error_description: 'commit is a commit ID: 7 to 40 lowercase hex characters.' }, { status: 400 });
    }
    return NextResponse.json({ revision: REVISION, ...(commit !== null && { commit, contains: REVISION ? await contains(REVISION, commit) : null }) },
      { headers: { 'Cache-Control': 'no-store' } });
  },
  // Which commit of a public repository is running is no secret; the token keeps strangers from spending the GitHub allowance.
  { requiredScopes: [] }
);
