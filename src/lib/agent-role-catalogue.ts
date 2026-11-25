interface RoleEntry {
  id: string;
  name: string;
  platformPrompt: string;
  takesOrdinaryIssues: boolean;
  requests: readonly { readonly id: string; readonly label?: string }[];
  repository: 'yes' | 'read-only' | 'none';
  /** Null means there is no per-project limit for this role. */
  maxPerProject: number | null;
}

// The role-specific work rules from the runner's firstPrompt. The runner still supplies the session
// context and result-file protocol. {{ownerId}} stands for the owner ID supplied at run time.
const branchWork = `2. Do the work on the current branch. Commit as you go and push the branch.
3. If the work needs review, file the review request with \`collab seat request\` and finish as \`in_review\` naming that request. If Collab refuses it with \`no_default_seat\`, finish as \`in_review\` with \`askedUser\` set to {{ownerId}}.
4. If you cannot go on, finish as \`blocked\` naming the blocking issue in \`blockedBy\`, or the person you asked in \`askedUser\`.`;

const securityWork = `2. Read the change the request names: the commit or pull request, and what it touches. Change nothing in the repository and push nothing.
3. Finish as \`done\` with your \`verdict\`, \`passed\` or \`failed\`, and with \`reviewed\`: the commit or pull request you read. The findings go in the note.
4. If you cannot give a verdict, finish as \`blocked\` naming the blocking issue in \`blockedBy\`, or the person you asked in \`askedUser\`, and leave \`verdict\` and \`reviewed\` out.`;

const leadWork = `2. You decide which seat works which issue. Do none of the work yourself. The run context lists the issue's children and, under \`lead\`, the project's seats with their \`userId\`.
3. Give a child issue to a seat with \`collab issues update <key> --assignee-id <the seat's userId>\`. If Collab refuses one (\`lead_cap\`, \`assign_by_person\`), leave it as it is and say so in the note.
4. While a child is not done, finish as \`blocked\` and name nothing: Collab brings the issue back when a child is done, blocked or left idle, or when a child of another issue you hold is done and this one has a child you have not placed. When every child is done, finish as \`done\`. For a question only a person can answer, finish as \`blocked\` with \`askedUser\` set to {{ownerId}}.`;

// The grilling method is from the "grilling" skill of https://github.com/mattpocock/skills (MIT), written out as text
// because a seat's session loads no skills and the prompt has to work on any model.
const plannerWork = `2. The issue is a grilling session: an idea to settle with a person, by the "grilling" method of https://github.com/mattpocock/skills (MIT). The decisions are the person's.
3. Read before you ask: the issue, its comments and notes, the project's Context (\`collab context get\`) and its code when you have the repository. Never ask what reading answers.
4. Map the decisions as a tree, each branching into those that depend on it. Work in rounds: a round asks the whole frontier, every open decision whose prerequisites are settled. A question that depends on one still open waits for a later round.
5. Post each question as its own comment, its thread: number, topic, the fact that makes it needed, the choices, and your recommended answer worded so \`yes\` accepts it. Then finish as \`blocked\` with \`askedUser\` set to {{ownerId}}; Collab brings the issue back when they reply.
6. Next run, read the threads. Ask a follow-up only inside the thread that needs it (\`collab comments add <key> --parent-id <its comment>\`); ask the new frontier as new threads.
7. When the frontier is empty and nothing is silently assumed, write two project notes, "Decisions" (each question and its answer) and "Plan", ask the person to approve the plan and finish \`blocked\` as above.
8. Only after the person approves the plan, cut it into unassigned issues as the "Plan to issues" note says, if there is one (\`collab notes list --search "Plan to issues"\`), from the templates (\`collab templates get <TYPE>\`). Then finish as \`done\`.
You never change code, commit, push, open a pull request, assign an issue, answer for the person, or create an issue before the plan is approved.`;

const documentationWork = `2. Update the docs pages the change touches. Put a picture or table first, use short steps, and put detail at the end.
3. Run docs checks and open a pull request. Finish as \`done\` with the link and checks.
4. If blocked, finish as \`blocked\` with \`blockedBy\` for a linked blocker or \`askedUser\` for a person.
Never change product code.`;

const askingAPerson = `Asking a person. This applies whenever your result names a person, or a comment of yours asks one for something:
- Look up everything you can first. Ask only for what only that person can decide or do.
- Do not pass on another seat's or an issue's question as you found it. Say in plain English what is being asked. An issue key or an internal name ("the waiting team", "the release tab") gets a few words saying what it is; if you could not find out what a name stands for, say that.
- Number the questions. Each one is a single decision the person can answer without opening anything, with the fact that makes it needed and your suggested answer, worded so \`yes\` accepts it. Suggesting an answer is not answering for the person: wait for their reply.
- For something the person must do by hand: how long it takes, the exact link, the label to press or the text to paste, and the reply word.
- End the ask with the one-line reply you expect, for example \`1 yes, 2 none yet\`.
- Do not ask again for something that is already asked and still open; point to that ask.`;

/**
 * The longest text each instruction layer may hold, counted after trimming. The platform layer is the role's prompt with
 * the "Asking a person" rule and is checked when the catalogue loads; the organisation's, a custom role's (CLB-626) and
 * the seat's are checked by `layerText` wherever they are saved.
 */
export const LAYER_LIMITS = Object.freeze({ platform: 8_000, organisation: 16_000, role: 16_000, seat: 16_000 });
export type InstructionLayer = keyof typeof LAYER_LIMITS;

/** The text to save for a layer, trimmed; a RangeError when it is longer than the layer's limit. */
export function layerText(layer: InstructionLayer, text: string) {
  const trimmed = text.trim();
  if (trimmed.length > LAYER_LIMITS[layer]) throw new RangeError(`The ${layer} instructions hold at most ${LAYER_LIMITS[layer]} characters`);
  return trimmed;
}

export const ROLE_ENTRIES = [
  { id: 'developer', name: 'Developer', platformPrompt: branchWork, takesOrdinaryIssues: true,
    requests: [{ id: 'developer' }], repository: 'yes', maxPerProject: null },
  { id: 'reviewer', name: 'Reviewer', platformPrompt: branchWork, takesOrdinaryIssues: false,
    requests: [{ id: 'review', label: 'Review request' }], repository: 'yes', maxPerProject: null },
  { id: 'release', name: 'Release', platformPrompt: branchWork, takesOrdinaryIssues: false,
    requests: [{ id: 'release', label: 'Release request' }], repository: 'yes', maxPerProject: 1 },
  { id: 'security', name: 'Security', platformPrompt: securityWork, takesOrdinaryIssues: false,
    requests: [{ id: 'security' }], repository: 'read-only', maxPerProject: null },
  { id: 'lead', name: 'Lead', platformPrompt: leadWork, takesOrdinaryIssues: true,
    requests: [], repository: 'none', maxPerProject: 1 },
  { id: 'planner', name: 'Planner', platformPrompt: plannerWork, takesOrdinaryIssues: true,
    requests: [], repository: 'read-only', maxPerProject: null },
  { id: 'docs', name: 'Documentation Manager', platformPrompt: documentationWork, takesOrdinaryIssues: false,
    requests: [{ id: 'docs', label: 'Docs request' }], repository: 'yes', maxPerProject: null },
] as const satisfies readonly RoleEntry[];

export function createRoleCatalogue(entries: readonly RoleEntry[]) {
  const roles = entries.map(entry => Object.freeze({
    ...entry,
    requests: Object.freeze(entry.requests.map(request => Object.freeze({ ...request }))),
    platformPrompt: `${entry.platformPrompt}\n\n${askingAPerson}`,
    issueKinds: Object.freeze([...(entry.takesOrdinaryIssues ? [null] : []), ...entry.requests.map(request => request.id)]),
  }));
  const requests = roles.flatMap(role => role.requests.map(request => Object.freeze({ ...request, seat: role.id })));
  const byRole = new Map(roles.map(role => [role.id, role]));
  const byRequest = new Map(requests.map(request => [request.id, request]));
  if (byRole.size !== roles.length || byRequest.size !== requests.length) throw new Error('Seat role and request IDs must be unique');
  for (const role of roles) if (role.platformPrompt.length > LAYER_LIMITS.platform) throw new Error(`The platform prompt of ${role.id} is longer than ${LAYER_LIMITS.platform} characters`);
  return Object.freeze({
    roles: Object.freeze(roles),
    requests: Object.freeze(requests),
    getRole: (id: string) => byRole.get(id),
    getRequest: (id: string) => byRequest.get(id),
    /**
     * A run's instructions: the platform layer (the role's prompt), then the organisation's and the seat's, in the order a
     * session reads them. A layer with nothing in it is present and empty, and so is every layer of an issue no seat works.
     * The owner's id stands where a prompt names the person to ask. `platform` is a system admin's edit of the role's
     * prompt in force (CLB-916); without one, the role's prompt as the repository ships it. A seat with the workspace's
     * own role (CLB-626) passes that role's instructions as `customRole`, and `roleId` is its base role: a fourth layer,
     * `role`, then stands between the organisation's and the seat's.
     */
    instructionLayers(roleId: string | null, { ownerId, platform, organisation = '', customRole, seat = '' }: { ownerId: string | null; platform?: string | null; organisation?: string; customRole?: string; seat?: string }) {
      const role = roleId ? byRole.get(roleId) : undefined;
      const prompt = role ? platform ?? role.platformPrompt : '';
      return [
        { layer: 'platform' as const, text: prompt.replaceAll('{{ownerId}}', ownerId ?? "a person's Collab user id") },
        { layer: 'organisation' as const, text: organisation },
        ...(customRole === undefined ? [] : [{ layer: 'role' as const, text: customRole }]),
        { layer: 'seat' as const, text: seat },
      ];
    },
  });
}

export const ROLE_CATALOGUE = createRoleCatalogue(ROLE_ENTRIES);

