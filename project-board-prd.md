# Product Requirements Document (PRD)

## Goal

Redesign the current project/tasks/board architecture to support multi-project boards, improved project-level configuration, and cross-organisation board sharing.

---

## 1.0 Set Up Domain Models and Database Schema

- [ ] **1.1** Create `Project` entity with fields:
  - `id`, `orgId`, `name`, `description`, `createdAt`, `updatedAt`

- [ ] **1.2** Update `Board` entity:
  - Remove project-specific fields
  - Add view configuration support

- [ ] **1.3** Create `BoardProject` junction table to support many-to-many relationships between boards and projects

- [ ] **1.4** Create `BoardShare` entity:
  - Fields: `boardId`, `orgId`, `permissionLevel`, `status`
  - Enables cross-organisation sharing

- [ ] **1.5** Write database migrations for all above schema changes

---

## 2.0 Implement Project Management Functionality

- [ ] **2.1** Create API endpoints for project CRUD:
  - `POST`, `GET`, `PUT`, `DELETE` at `/api/projects`

- [ ] **2.2** Build `ProjectList` component with actions:
  - Create, edit, archive projects

- [ ] **2.3** Implement task management within projects

- [ ] **2.4** Add project-level permissions and validation logic

- [ ] **2.5** Create `ProjectSelector` component for use in board configuration

---

## 3.0 Build Board Configuration and Multi-Project Views

- [ ] **3.1** Update board creation flow:
  - Decouple from project creation

- [ ] **3.2** Build `BoardConfig` component with multi-project selector UI

- [ ] **3.3** Implement `BoardQueryService`:
  - Aggregates data from multiple projects

- [ ] **3.4** Create field mapping UI:
  - Allows selection of project fields to display

- [ ] **3.5** Add board filtering:
  - Filters by project, status, assignee, custom fields

- [ ] **3.6** Implement unified board rendering view using data from multiple projects

---

## 4.0 Create Board Sharing System

- [ ] **4.1** Build email invitation endpoint:
  - `POST /api/boards/:id/share`

- [ ] **4.2** Create `BoardShareModal`:
  - UI for email input and permission selection

- [ ] **4.3** Implement invitation acceptance flow and UI notifications

- [ ] **4.4** Add shared board UI indicators:
  - E.g., badges or colour schemes

- [ ] **4.5** Implement access revocation for board owners

- [ ] **4.6** Add "Shared Boards" section in navigation

