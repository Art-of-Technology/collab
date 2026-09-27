# Feature detail read access

`getFeatureRequestById` requires a session subject and an existing current database user. It reads only feature workspace/project identifiers before authorizing the actual workspace through the shared owner-or-active-membership predicate. The payload query reapplies that predicate and the resolved feature references before loading feature data, votes or comments.

A project supplies the workspace when a legacy feature has no explicit workspace. Workspace-only features remain supported; an unscoped feature or inconsistent feature/project workspace is denied. An optional caller workspace ID or slug must match the actual authorized workspace and never grants access. Edit capability is calculated for that actual workspace, including callers that omit the hint. Denied/missing features return null; missing identity retains the existing error contract.

Consumers are the workspace and project detail pages, both metadata functions, and the client detail query. There is no public-sharing flag or anonymous detail caller in this scope. List and mutation actions are unchanged and are not certified by this repair. The page's separate membership-by-email check and ancestor layout behavior remain unchanged.

Focused action tests exercise unauthorized/deleted actors, inactive/foreign membership, owner and active access, project-derived/workspace-only scope, inconsistent/unscoped features, and forged or matching caller context. Tests use modeled Prisma predicates; they do not prove native transaction isolation or prevent revocation after the payload access check. Subsequent comments/votes are not in an atomic snapshot. Existing a59 browser/image receipts remain historical and do not accept a successor artifact.
