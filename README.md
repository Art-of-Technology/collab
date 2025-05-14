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
    <img src="https://teams.weezboo.com/_next/image?url=%2Flogo-v2.png&w=128&q=75"  alt="Logo" width="128">
  </a>
  <h3 align="center">About Collab</h3>

  <p align="center">
    <strong>An internal communication and work-tracking platform for software teams, providing a simple and effective way to share updates, manage tasks, and collaborate in real time.
    </strong>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
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

<div style="display: flex; gap: 20px; justify-content: start; align-items: flex-start;">
  <div style="display: flex; flex-direction: column; align-items: center;">
    <a href="/public/screenshots/Screenshot-3.png" target="_blank">
      <img src="/public/screenshots/Screenshot-3.png" alt="Timeline" style="width: 150px; border-radius: 8px;" />
    </a>
    <span style="margin-top: 8px; font-size: 14px;">Timeline</span>
  </div>
  <div style="display: flex; flex-direction: column; align-items: center;">
    <a href="/public/screenshots/Screenshot-2.png" target="_blank">
      <img src="/public/screenshots/Screenshot-2.png" alt="Dashboard" style="width: 150px; border-radius: 8px;" />
    </a>
    <span style="margin-top: 8px; font-size: 14px;">Dashboard</span>
  </div>
  <div style="display: flex; flex-direction: column; align-items: center;">
    <a href="/public/screenshots/Screenshot-1.png" target="_blank">
      <img src="/public/screenshots/Screenshot-1.png" alt="Task" style="width: 150px; border-radius: 8px;" />
    </a>
    <span style="margin-top: 8px; font-size: 14px;">Task</span>
  </div>
</div>



<p align="right">(<a href="#readme-top">back to top</a>)</p>

#### Key Features

- Real-time timeline for status updates, challenges, and ideas
- Kanban-style task boards with drag-and-drop support
- Milestones, epics, and story tracking for project planning
- Threaded comments, reactions, and notifications
- Feature requests with voting and prioritization
- AI-assisted content improvement and summarization
- OAuth authentication (Google, Email) via NextAuth.js
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
   git clone https://github.com/your-org/collab.git
   cd collab
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   ```bash
   cp .env .env.local
   # Edit .env.local and add:
   # DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OPENAI_KEY
   ```
4. Generate Prisma client and run migrations:
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```
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
- Sign up or log in using Google or email.
- Create or join a workspace to start sharing updates.
- Use the timeline to post status updates, tasks, and feature requests.
- Organize work using boards, milestones, and stories.

## API

Collab exposes a RESTful API under the `/api` namespace. Example endpoints:

- GET `/api/posts` – Retrieve all posts.
- POST `/api/posts` – Create a new post.
  ```bash
  curl -X POST http://localhost:3000/api/posts \
    -H "Content-Type: application/json" \
    -d '{"title":"Project Update","content":"Completed user authentication."}'
  ```
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

<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="http://www.scrivt.com"><img src="https://avatars.githubusercontent.com/u/36661336?v=4?s=100" width="100px;" alt="Erkan DOGAN"/><br /><sub><b>Erkan DOGAN</b></sub></a><br /><a href="https://github.com/Art-of-Technology/collab/commits?author=erkandogan" title="Code">💻</a> <a href="https://github.com/Art-of-Technology/collab/commits?author=redoh" title="Documentation">📖</a> <a href="#design-erkandogan" title="Design">🎨</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/redoh"><img src="https://avatars.githubusercontent.com/u/38852479?v=4?s=100" width="100px;" alt="Neo"/><br /><sub><b>Neo</b></sub></a><br /><a href="https://github.com/Art-of-Technology/collab/commits?author=redoh" title="Code">💻</a> <a href="https://github.com/Art-of-Technology/collab/commits?author=redoh" title="Documentation">📖</a> <a href="#design-redoh" title="Design">🎨</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/utku-weezboo"><img src="https://avatars.githubusercontent.com/u/173268231?v=4?s=100" width="100px;" alt="utku-weezboo"/><br /><sub><b>utku-weezboo</b></sub></a><br /><a href="https://github.com/Art-of-Technology/collab/commits?author=utku-weezboo" title="Code">💻</a> <a href="https://github.com/Art-of-Technology/collab/commits?author=utku-weezboo" title="Documentation">📖</a> <a href="#design-utku-weezboo" title="Design">🎨</a></td>
    </tr>
  </tbody>
</table>

## License

Distributed under the Apache License 2.0 - see the [LICENSE](./LICENSE.txt) file for details.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contact

[contact-email]

[https://github.com/Art-of-Technology/collab](https://github.com/Art-of-Technology/collab)

<p align="right">(<a href="#readme-top">back to top</a>)</p>


<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[contact-email]: utku@weezboo.com
[security-email]: utku@weezboo.com
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