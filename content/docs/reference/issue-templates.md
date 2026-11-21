# Issue templates

The sections and fields an issue of each type should have, so that every issue reads the same way to people and to agents.

## Read a template

```sh
collab templates list
collab templates get BUG
```

Over HTTP: `GET /api/apps/auth/issue-templates` and `GET /api/apps/auth/issue-templates/BUG`, with the scope `issues:read`.

Bug, Story, Epic, Milestone and Task have a template. A Sub-task has none.

## What a template contains

- `sections`: each with a `title`, whether it is `required`, and `guidance` on what to write.
- `requiredFields`: fields the issue must set, such as `priority` or `dueDate`.
- `body`: the sections as Markdown headings with the guidance in comments. Start your description from it.
- `version`, and `standard`, which says whether it is Collab's standard or the workspace's own.
- `enforced`: whether the workspace requires templates for agents.

## Write an issue from a template

1. Read the template for the issue's type.
2. Copy `body` into your description. Keep each section as a heading and write under it.
3. State every field in `requiredFields` on the command, for example `--priority high`.
4. Create the issue.

A section counts when the description has a heading with the section's title and something under it. A bold line is not a heading.

## When templates are required

The standard Story and Task templates require story points. System-generated seat requests are filed without an estimate. When an agent edits one under the standard Task template, the required sections still apply and points are optional. If the workspace has customized the Task template, its configured requirements apply to edits. Workspace admins can change the fields under **Required fields**.

A workspace can require templates for agents. An agent's create or update that misses something is then refused with `422 template_required`, and nothing is written:

```json
{
  "error": "template_required",
  "error_description": "Missing required sections: Environment. Missing required fields: priority. Write each section as a heading. Get the template with \"collab templates get BUG\".",
  "issue_type": "BUG",
  "missing_sections": ["Environment"],
  "missing_fields": ["priority"]
}
```

- The reply also carries `template_version` and `template`. Its `sections` and `requiredFields` describe what the server checked for this operation.
- Add what `missing_sections` and `missing_fields` list and send it again. The CLI prints the same lists as `missingSections` and `missingFields`.
- On a create, a required field counts only when you state it. A default does not count.
- An update is refused only when the issue had everything before the change and would not after it. Issues written before templates were required can still be edited.
- People in the web app are never refused. They see the template as a checklist.

## The standard bug template

Required sections:

- Summary
- Steps to reproduce
- Expected result
- Actual result
- Environment
- Severity and impact

Optional sections: Evidence and Workaround. Required field: `priority`.

## Change a template

1. In the sidebar, open the workspace menu and choose **Workspace settings**.
2. Open the **Settings** tab. Beside **Issue templates**, choose **Manage**.
3. Pick a type. Add or edit sections, and choose the **Required fields**.
4. Choose **Save**. **Reset to standard** brings Collab's standard back.
5. To hold agents to the templates, turn on **Require templates for agents**.

You need permission to manage the workspace's settings.

## Next

An outside system that files issues follows the same templates: see [Integrations](/docs/agents/integrations).
