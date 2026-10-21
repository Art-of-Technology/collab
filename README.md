<a id="readme-top"></a>

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![Unlicense License][license-shield]][license-url]

<!-- PROJECT LOGO -->
<br />
<div align="center" >
  <a href="https://github.com/Art-of-Technology/collab" style="background-color: black; padding: 10px; display: inline-block;">
    <img src="public/logo-text.svg"  alt="Logo" width="128">
  </a>
  <h3 align="center">About Collab</h3>

  <p align="center">
    <strong>An internal communication and work-tracking platform for software teams, providing a simple and effective way to share updates, manage tasks, and collaborate in real time.
    </strong>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
For project, issue and Notes automation, select **Collab CLI** in the sidebar or open `/docs/cli` on your Collab server for the CLI guide and searchable command reference, or read the [CLI package guide](packages/cli/README.md). Existing `/docs` links serve the same documentation and installation links. The legacy `/{workspace}/apps/collab-cli` URL redirects to the guide after the existing session, workspace membership and published-app checks; the CLI's OAuth registration and credentials remain in use. Other apps retain their workspace entrypoints. The developer console's API reference remains at `/dev/docs`.

The public `/home` page leads with CLI installation and a terminal/shared-project showcase. Select any of the four read-only workflow examples to explore projects, issues, keyword search and bounded project context; the demo makes no CLI or API calls and does not start an agent. Motion can be paused and respects reduced-motion preferences. The secondary product preview uses labelled example data, and a FAQ explains that Coclaw is optional and not required by CLI users. Installation and command-reference links remain available; see [search availability requirements](docs/agent-search.md#semantic-readiness).
For the app-auth API's bounded project overview, see [Project context for agents](docs/agent-project-context.md).
For coordinating already-running agents and monitoring their work in the web inbox, see [Agent handoffs](docs/agent-handoffs.md).

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#overview">Overview</a>
      <ul>
        <li><a href="#screenshots">Screenshots</a></li>
        <li><a href="#key-features">Key Features</a></li>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li><a href="#installation">Installation</a></li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#api">API</a></li>
    <li><a href="#contributing">Contributing</a>
      <ul>
        <li><a href="#code-of-conduct">Code of Conduct</a></li>
        <li><a href="#top-contributors">Top Contributors</a></li>
      </ul>
    </li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
  </ol>
</details>

## Overview

Collab is designed to streamline internal communication and work tracking by offering a timeline-based feed for status updates, built-in task and board management, threaded discussions, and integrations with popular developer tools. With its intuitive interface, teams can quickly share progress, identify blockers and coordinate efforts without the complexity of traditional project management systems.

#### Screenshots

| ![Timeline](/public/screenshots/Screenshot-3.png) | ![Legacy dashboard](/public/screenshots/Screenshot-2.png) | ![Task](/public/screenshots/Screenshot-1.png) |
|:--:|:--:|:--:|
| [**Timeline**](/public/screenshots/Screenshot-3.png) | [**Legacy dashboard**](/public/screenshots/Screenshot-2.png) | [**Task**](/public/screenshots/Screenshot-1.png) |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

#### Key Features

- Real-time timeline for status updates, challenges, and ideas
- Kanban-style task boards with drag-and-drop support
- Milestones, epics, and story tracking for project planning
- Threaded comments, reactions, and notifications
- Feature requests with voting and prioritization
- AI-assisted content improvement and summarization
- Account sign-in via NextAuth.js (see [Usage](#usage))
- File uploads and customizable user avatars
- Workspace and team management with role-based access
- RESTful API for integration with external tools

#### Built With

- Next.js (App Router) and React
- TypeScript for static typing
- Prisma ORM with PostgreSQL
- Tailwind CSS for styling
- NextAuth.js for authentication
- React Query for data fetching and caching
- Zod for schema validation
- Tiptap editor for rich text content
- Radix UI and Headless UI components
- Cloudinary for media handling
- VSCode, Node.js, npm

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Art-of-Technology/collab.git
   cd collab
   ```
2. Install dependencies:
   ```bash
   npm ci --legacy-peer-deps
   ```
3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and configure the following environment variables:

   ### Required Variables

   #### Database Configuration
   ```bash
   DATABASE_URL="postgresql://username:password@localhost:5432/collab_db"
   ```

   #### Authentication (NextAuth.js)
   ```bash
   NEXTAUTH_URL="http://localhost:3000"  # Your app's URL
   NEXTAUTH_SECRET="your-super-secret-jwt-secret-here"  # Generate with: openssl rand -base64 32
   
   # Google OAuth (required for Google sign-in)
   GOOGLE_CLIENT_ID="your-google-client-id"
   GOOGLE_CLIENT_SECRET="your-google-client-secret"
   ```

   #### Media Storage (Cloudinary)
   ```bash
   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME="your-cloudinary-cloud-name"
   CLOUDINARY_API_KEY="your-cloudinary-api-key"
   CLOUDINARY_API_SECRET="your-cloudinary-api-secret"
   ```

   ### Optional Variables

   #### AI Features (OpenAI)
   ```bash
   OPENAPI_KEY="sk-your-openai-api-key-here"  # Required for AI text improvement and board generation
   ```

   #### Email Configuration (Resend)
   ```bash
   RESEND_API_KEY="re-your-server-only-api-key"
   EMAIL_FROM="Collab <collab@weezboo.com>"
   NEXT_PUBLIC_APP_URL="https://collab.weez.boo"
   ```
   Verify `weezboo.com` for sending in the same Resend account. Invitations use the shared transactional email sender and include the configured application’s acceptance link. SMTP settings are no longer used for invitations.

   Provider rejection, missing configuration, or unconfirmed delivery is reported as `emailSent: false`; the pending invitation and copyable link remain available. A provider message ID means accepted for delivery, not proof of inbox receipt. Requests time out after 10 seconds and are never automatically retried. Timeouts, interrupted or malformed successful responses, and missing message IDs leave delivery unconfirmed. Check the recipient inbox before manually resending: resending replaces the pending invitation and invalidates its previous link.

   #### App Store & OAuth (for third-party apps)
   ```bash
   APP_TOKENS_KEY="your-32-character-encryption-key-here"  # Generate with: openssl rand -hex 32
   ```

   For outbound webhook configuration, see [Webhooks](docs/apps/README.md#webhooks).

   #### Error Monitoring (Sentry - optional)
   ```bash
   SENTRY_DSN="https://your-sentry-dsn@sentry.io/project-id"
   ```

   #### Feature Flags
   ```bash
   NEXT_PUBLIC_FEATURE_APPS="true"  # Enable app store features
   NEXT_PUBLIC_APP_URL="https://your-app-domain.com"  # Public URL for invitation links
   ```

   ### Environment-Specific Variables
   ```bash
   NODE_ENV="development"  # or "production"
   CI="true"  # Set in CI/CD environments for build optimizations
   ```

   Before production setup, follow the [core-first execution boundary](docs/security/2026-09-23-hardening.md#core-first-execution-boundary)
   for agent chat availability, required initial settings and later execution approval.

   ### How to Obtain Credentials

   #### Google OAuth Setup
   1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
   2. Create a new project or select an existing one
   3. Enable the Google+ API
   4. Go to "Credentials" and create OAuth 2.0 Client IDs
   5. Add your domain to authorized origins and redirect URIs

   #### Cloudinary Setup
   1. Sign up at [Cloudinary](https://cloudinary.com/)
   2. Get your cloud name, API key, and API secret from your dashboard
   3. The cloud name should be public (prefixed with `NEXT_PUBLIC_`)

   #### OpenAI API Setup
   1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
   2. Sign in or create an account
   3. Create a new API key
   4. Copy the key (starts with `sk-`)

   #### Email Provider Setup
   See [Email Configuration (Resend)](#email-configuration-resend).

   #### Database Setup
   For development:
   ```bash
   # Using Docker
   docker run --name collab-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=collab_db -p 5432:5432 -d postgres:15
   
   # Or install PostgreSQL locally and create a database
   createdb collab_db
   ```
4. Generate the Prisma client:
   ```bash
   npx prisma generate
   ```
   Before starting the app, follow the [fresh database bootstrap guide](docs/database-bootstrap.md)
   for a new empty database. It also explains the migration-history limitations
   and why existing installations require their original migrations.
5. (Optional) Initialize a default workspace:
   ```bash
   npm run prisma:init-workspace
   ```
6. Start the development server:
   ```bash
   npm run dev
   ```

## Usage

- Open your browser and navigate to [http://localhost:3000](http://localhost:3000).
- Sign up or log in using Google.
  When native Maestro is enabled, open **Profile → Connect Maestro**, choose
  **Verify Google account**, complete the Google round trip with the same account,
  then choose **Connect Maestro**. Successful linking opens your Collab workspace
  immediately; revisiting the linking page also continues into Collab. **Sign in with Maestro** returns
  to your existing Collab account; Google remains available. For availability,
  configuration and linking safeguards, see the [native Maestro guide](docs/native-maestro-link.md).
  For gateway sign-in availability and sign-out behavior, see the
  [client session contract](docs/security/2026-09-23-hardening.md#gateway-client-session-and-logout).
- Create or join a workspace to start sharing updates.
  See the [session and workspace access contract](docs/security/2026-09-23-hardening.md#session-and-workspace-access)
  for identity and membership requirements.
  For pending invitations, see the [recipient access contract](docs/security/2026-09-23-hardening.md#pending-invitation-list-recipient-binding-27-september-2026).
  For invitation links, see the [preview and acceptance contract](docs/security/2026-09-23-hardening.md#invitation-token-preview-and-acceptance-27-september-2026).
  For permission visibility, toggles and role resets, see the
  [workspace permissions contract](docs/security/2026-09-23-hardening.md#scoped-permission-reads-and-resets).
  For custom-role names, grants and member assignments, see the
  [custom-role contract](docs/security/2026-09-23-hardening.md#custom-role-and-member-role-boundaries).
- Use the timeline to post status updates, tasks, and feature requests.
- Use the workspace [Project overview](#project-overview) to select a project.
- Customize your avatar with partial updates; see the
  [avatar update contract](docs/security/2026-09-23-hardening.md#avatar-updates-and-safe-responses).
- Organize work using boards, milestones, and stories.
  New issues, including related issues created with them, show **Reporter: you**.
  See the [issue list/create contract](docs/security/2026-09-23-hardening.md#issue-list-and-create-access)
  for access and reporter requirements.
  For view visibility, editing and issue positions, see the
  [view access contract](docs/security/2026-09-23-hardening.md#view-access-and-session-subjects).
  For project dashboard visibility, see the
  [summary access contract](docs/security/2026-09-23-hardening.md#project-summary-payload-access).
  For project lists, settings saves and Gantt visibility, see the
  [project route contract](docs/security/2026-09-23-hardening.md#project-collection-settings-and-gantt-routes).
  For status filter visibility, see the
  [project status access contract](docs/security/2026-09-23-hardening.md#project-status-reads-27-september-2026).
  For listing and creating project statuses, see the
  [statuses API access contract](docs/security/2026-09-23-hardening.md#project-statuses-api-access).
  For status reordering, see the
  [reorder access contract](docs/security/2026-09-23-hardening.md#project-status-reorder-access).
  For label visibility and editing, see the
  [label access contract](docs/security/2026-09-23-hardening.md#label-action-access-27-september-2026).
- Open **Project board** from a project dashboard; see the
  [Forge board guide](docs/forge-board.md) for views, connection requirements
  and the [issue actions guide](docs/forge-issue-actions.md) for editing and comments.
  The [Ready execution contract](docs/forge-ready-execution.md) covers reviewed
  runs and independent restore fencing; the worker remains off pending qualification.
- Open **Approved project memory** from Project Notes; see the
  [project memory guide](docs/forge-project-memory.md) for drafting, approval
  and connection requirements.

### Issue descriptions

Issue descriptions open in read mode, so following a link does not enter editing.
Markdown headings, lists, links, code blocks and tables from the CLI or API render
alongside existing rich HTML, including when an external update arrives. Content
is sanitized before rendering; mentions remain interactive. Saved preview cards
and plain-link previews appear as URL links in read mode. Images remain inline
without a click-to-open viewer, including in issue comments.

Choose **Edit description** to make changes. Changes autosave as rich-editor HTML;
**Done** becomes available once the current content is saved and returns to read
mode. Opening or previewing a description leaves its stored value unchanged.
Opening another issue starts in read mode.

While editing, use **History** in the description toolbar to preview a version, then choose
**Revert to this version** to restore it, including an empty description. History
includes web, CLI and legacy description updates, with Markdown and table support
in previews and restored content. It retrieves the latest 100 description updates,
so newer unrelated activity does not displace them.

On an issue page, **Back** and navigation after deletion retain an explicit view
context. Without one, they look up the project's currently accessible default
view, even when the workspace slug lookup returns no slug. If that view is
unavailable, they return to the project when its slug is known, otherwise to
**Views**. In an issue modal, **Back** closes the modal.

### Notes

The Notes rich-text editor preserves HTML tables with distinct headers and cells,
spacing and borders, and horizontal scrolling for wide tables. Links and cells
spanning multiple columns (`colspan`) are retained through editing, saving and
reloading. Markdown headings, lists, links, code and tables are rendered through
the same sanitized conversion used for issue descriptions. Loading or restoring
content into the editor does not save it automatically. Stored documents are not rewritten,
and content already saved as flattened text is not reconstructed.

`collab notes get` and the note update response return the full stored `content`
(Markdown or HTML), preserving line breaks, indentation, entities and tables for
read/edit/write round trips. Clients rendering HTML must sanitize it; list excerpts
remain plain text. Existing access checks and secret redaction still apply.

The [editor regression checks](tests/security/issue-description-markdown.test.cjs)
cover table structure and simulated save/reload. Browser layout and persisted
application save/reload remain unverified.

### Project overview

The sidebar **Projects** section can be collapsed with its chevron. When expanded,
it shows up to five accessible, non-archived projects in the current workspace,
most recently modified first. **Search projects** matches names and issue prefixes
across all accessible, non-archived projects before limiting the results to five.
The **Projects** label opens the full list, and **Create project** remains available
even when the section is collapsed.

Open `/{workspace}/dashboard`, choose a project and select **Show project**.
The GET selector uses `?project=<project-id>` and reloads only that project's
overview. A sole eligible project is selected automatically only when the
parameter is absent; submitting **Choose a project** leaves `?project=` empty
and loads no project payload. Multiple projects are never aggregated.

For a Forge-connected project, Issues shows counts for the loaded result, a
short issue preview and any partial-results warning. Projects without a Forge
binding show up to five readable Collab issues, most recently updated first,
with linked keys and titles; **Open project** opens the existing project overview
and views. Project memory previews revisions and links to the
[full memory lifecycle](docs/forge-project-memory.md). **Open issue board** and
**Review project memory** lead to the selected project's canonical pages.
**Reload overview** fetches the selected scope again. Denied, unavailable,
not-connected and successful empty reads have distinct messages; failed reads
never become an empty success or “All clear”. See the
[overview access contract](docs/security/2026-09-23-hardening.md#selected-project-overview-access)
for chooser and payload authorization.

When both Forge reads succeed, **Open an issue for Ready review** leads to the board's
existing issue editor. The overview provides navigation only, with no execution
totals or merge/deploy authority; the [Ready contract](docs/forge-ready-execution.md)
owns consent and runtime admission. The shared legacy dashboard API and
components remain available separately.

### Integration availability

GitHub repository authorization uses the current tab. After project access is
validated, authorization returns to the project's GitHub settings, where
cancellation and provider errors appear or successful authorization exposes
repository selection. No popup permission or manual popup closure is required.
See the [OAuth browser-state contract](docs/security/2026-09-23-hardening.md#github-oauth-browser-state)
for validation failures and return destinations.

For GitHub account and repository disconnect behavior, repository details and
configuration access, see the
[GitHub lifecycle access contract](docs/security/2026-09-23-hardening.md#github-repository-lifecycle-access).
For version and release list visibility and migration effects, see the
[version access contract](docs/github-version-access.md).
For GitHub metadata visibility on an issue, see the
[issue GitHub projection contract](docs/issue-github-access.md).
For settings-page access and webhook configuration display, see the
[GitHub settings contract](docs/security/2026-09-23-hardening.md#github-settings-page-access-and-webhook-display).

The legacy Slack `/api/slack/my-tasks` and `/api/slack/create-issue` commands
return HTTP 503 with an ephemeral unavailable message. Editable profile `slackId`
values are not verified identities; existing configuration, profile IDs and
issues are retained. For availability of Collab's existing task UI writes, see
the [legacy write contract](docs/forge-legacy-write-guard.md).
Forge-backed commands await verified workspace/channel/project binding.
Inventory command consumers before deploying this retirement.

For Notes visibility, sharing and template restrictions, see the
[Notes access contract](docs/security/2026-09-23-hardening.md#notes-access).
For issue visibility, edits and project moves, see the
[issue access and mutation contract](docs/security/2026-09-23-hardening.md#issue-access-and-mutations).

After the usual sign-in and page access checks, a missing feature request or one
denied by the [feature detail access contract](docs/security/feature-detail-read-access.md)
shows the 404 page. If an accessible feature belongs to another project in the
same workspace, you are redirected to the requested project's feature list.
A failure to load the feature data shows “Something went wrong”.

## API

Collab exposes a RESTful API under the `/api` namespace. Example endpoints:

- `/api/posts` – Read and create posts using a signed-in session; see the
  [post access contract](docs/security/2026-09-23-hardening.md#post-and-coclaw-disclosure-follow-up).
- GET `/api/tasks/boards/{boardId}/tasks` – List tasks in a board.
- GET `/api/users/me` – Fetch current user profile.

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! Thanks again!

1. Fork the repository.
2. Create a new branch: `git checkout -b feature/YourFeature`.
3. Install dependencies and ensure all tests and linters pass.
4. Commit your changes and push to your fork.
5. Open a pull request with a clear description of your changes.

#### Code of Conduct
This project adheres to the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

#### Top Contributors ✨

Thanks goes to these wonderful people:

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/erkandogan"><img src="https://avatars.githubusercontent.com/u/36661336?v=4?s=100" width="100px;" alt="Erkan DOGAN"/><br /><sub><b>Erkan DOGAN</b></sub></a><br /><a href="https://github.com/Art-of-Technology/collab/commits?author=erkandogan" title="Code">💻</a></td>
<td align="center" valign="top" width="14.28%"><a href="https://github.com/pinar-b"><img src="https://avatars.githubusercontent.com/u/208800934?v=4?s=100" width="100px;" alt="Pinar"/><br /><sub><b>Pinar</b></sub></a><br /><a href="https://github.com/Art-of-Technology/collab/commits?author=pinar-b" title="Code">💻</a></td><td align="center" valign="top" width="14.28%"><a href="https://github.com/redoh"><img src="https://avatars.githubusercontent.com/u/38852479?v=4?s=100" width="100px;" alt="Ferit"/><br /><sub><b>Ferit</b></sub></a><br /><a href="https://github.com/Art-of-Technology/collab/commits?author=redoh" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/ozngnr"><img src="https://avatars.githubusercontent.com/u/67223977?v=4?s=100" width="100px;" alt="Ozan Guner"/><br /><sub><b>Ozan Guner</b></sub></a><br /><a href="https://github.com/Art-of-Technology/collab/commits?author=ozngnr" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/erdenizko"><img src="https://avatars.githubusercontent.com/u/168836048?v=4?s=100" width="100px;" alt="Erdeniz Korkmaz"/><br /><sub><b>Erdeniz Korkmaz</b></sub></a><br /><a href="https://github.com/Art-of-Technology/collab/commits?author=erdenizko" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/eneszrn"><img src="https://avatars.githubusercontent.com/u/102959666?v=4?s=100" width="100px;" alt="eneszrn"/><br /><sub><b>eneszrn</b></sub></a><br /><a href="https://github.com/Art-of-Technology/collab/commits?author=eneszrn" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/denizguzeloglu"><img src="https://avatars.githubusercontent.com/u/214829628?v=4?s=100" width="100px;" alt="deniz"/><br /><sub><b>deniz</b></sub></a><br /><a href="https://github.com/Art-of-Technology/collab/commits?author=denizguzeloglu" title="Code">💻</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

## License

Distributed under the Apache License 2.0 - see the [LICENSE](./LICENSE.txt) file for details.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contact

[https://weezboo.com](https://weezboo.com)
[https://github.com/Art-of-Technology/collab](https://github.com/Art-of-Technology/collab)

<p align="right">(<a href="#readme-top">back to top</a>)</p>


<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[contact-email]: hello@weezboo.com
[security-email]: hello@weezboo.com
[documentation-url]: https://github.com/Art-of-Technology/collab/wiki
[contributors-shield]: https://img.shields.io/github/contributors/Art-of-Technology/collab.svg?style=for-the-badge
[contributors-url]: https://github.com/Art-of-Technology/collab/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/Art-of-Technology/collab.svg?style=for-the-badge
[forks-url]: https://github.com/Art-of-Technology/collab/network/members
[stars-shield]: https://img.shields.io/github/stars/Art-of-Technology/collab.svg?style=for-the-badge
[stars-url]: https://github.com/Art-of-Technology/collab/stargazers
[issues-shield]: https://img.shields.io/github/issues/Art-of-Technology/collab.svg?style=for-the-badge
[issues-url]: https://github.com/Art-of-Technology/collab/issues
[license-shield]: https://img.shields.io/github/license/Art-of-Technology/collab.svg?style=for-the-badge
[license-url]: https://github.com/Art-of-Technology/collab/blob/main/LICENSE.txt
