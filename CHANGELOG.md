# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
 

## [Unreleased]

### Added
- **Default Role Permissions System**: Comprehensive role permission management for workspace security
  - Introduced `role-permission-defaults.ts` to define and ensure default permissions for workspace roles
  - Automatic permission sync when member roles are updated
  - Enhanced permission validation for workspace operations
- GitHub Actions workflow to automatically add merged PR authors to `README.md` using the All Contributors specification
  - Creates a default `.all-contributorsrc` when missing
  - Regenerates the contributors list in `README.md` on merge

### Changed
- **Enhanced Permission Management**: Improved permission sync and cache control
  - Updated API routes to enforce dynamic revalidation for permissions endpoints
  - Enhanced workspace member role update process with permission synchronization
  - Improved cache control headers for permission-related API routes
- **Session Management**: Enhanced authentication state management
  - Session providers now support window focus updates to keep authentication state in sync
  - Improved session synchronization across browser tabs and windows
- Updated `README.md` to include Contributors anchors compatible with All Contributors
- Refreshed documentation for clarity and consistency: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`

### Technical
- Added comprehensive permission validation to workspace invitation acceptance
- Enhanced workspace member role management with automatic permission updates
- Improved session provider architecture for better state synchronization

### Removed
- Tracked `.all-contributorsrc` from the repository (now managed by the workflow)

## [0.2.4] - 2025-08-12

### Added
- **Pagination Component**: New reusable pagination component for navigating through large datasets
- **Leave Request Dashboard Integration**: Integrated leave requests dashboard into main workspace dashboard
- **Paginated Leave Requests**: Added pagination support for workspace leave request management with summary counts
- **NextAuth Session Provider**: Added new NextAuth session provider for improved authentication handling

## Changed
- **Enhanced Leave Management UI**: Improved leave management interface with better layout and user experience
  - Updated LeaveManagementClient to utilize paginated data and summary information
  - Enhanced LeaveRequestsManager with status filtering and pagination support
  - Added scrollable leave request list with gradient overlay to indicate more content
- **Dashboard Layout Improvements**: Updated dashboard page grid layout for improved responsiveness
- **Leave Request Form**: Enhanced leave request form with better validation and user experience
- **Calendar Component**: Updated calendar component with improved styling and functionality
- **Comment System Enhancements**: Improved comment and reply forms across tasks and unified components
- **Permission System Updates**: Enhanced workspace permission management and role handling
- **Session Management**: Improved session provider with better error handling and state management

## Fixed
- **Navigation Styling**: Removed unused navbar styles from globals.css
- **Leave Request Display**: Fixed layout issues in MyLeave component for better content organization
- **API Endpoint Improvements**: Enhanced various API endpoints for better error handling and data consistency

## Technical
- **Enhanced Leave Actions**: Extended leave management actions with new functions for paginated requests and summaries
- **Improved Query Hooks**: Added new React Query hooks for leave management with pagination support
- **Code Cleanup**: Removed unused HTML sanitizer and role permission defaults files
- **Provider Restructuring**: Reorganized authentication providers for better maintainability
- **Notification Service Updates**: Enhanced notification service with improved functionality

## [0.2.5] - 2025-08-12

### Added
- **Pagination Component**: New reusable pagination component for navigating through large datasets
- **Leave Request Dashboard Integration**: Integrated leave requests dashboard into main workspace dashboard
- **Paginated Leave Requests**: Added pagination support for workspace leave request management with summary counts
- **NextAuth Session Provider**: Added new NextAuth session provider for improved authentication handling

## Changed
- **Enhanced Leave Management UI**: Improved leave management interface with better layout and user experience
  - Updated LeaveManagementClient to utilize paginated data and summary information
  - Enhanced LeaveRequestsManager with status filtering and pagination support
  - Added scrollable leave request list with gradient overlay to indicate more content
- **Dashboard Layout Improvements**: Updated dashboard page grid layout for improved responsiveness
- **Leave Request Form**: Enhanced leave request form with better validation and user experience
- **Calendar Component**: Updated calendar component with improved styling and functionality
- **Comment System Enhancements**: Improved comment and reply forms across tasks and unified components
- **Permission System Updates**: Enhanced workspace permission management and role handling
- **Session Management**: Improved session provider with better error handling and state management

## Fixed
- **Navigation Styling**: Removed unused navbar styles from globals.css
- **Leave Request Display**: Fixed layout issues in MyLeave component for better content organization
- **API Endpoint Improvements**: Enhanced various API endpoints for better error handling and data consistency

## Technical
- **Enhanced Leave Actions**: Extended leave management actions with new functions for paginated requests and summaries
- **Improved Query Hooks**: Added new React Query hooks for leave management with pagination support
- **Code Cleanup**: Removed unused HTML sanitizer and role permission defaults files
- **Provider Restructuring**: Reorganized authentication providers for better maintainability
- **Notification Service Updates**: Enhanced notification service with improved functionality

## [0.2.4] - 2025-08-11

### Changed
- **Sidebar Navigation**: Removed Messages navigation item from the main sidebar
  - Streamlined navigation by removing the Messages link and related routing logic
  - Users can still access messages through other navigation paths

## [0.2.3] - 2025-08-11

### Fixed
- **Task Detail Display**: Improved task description rendering and state management
  - Removed unused initialDescriptionRef and related useEffect from TaskDetailContent to simplify state management
  - Updated MarkdownEditor to immediately render content changes and synchronize editor content with the content prop
  - Ensures accurate display of task descriptions in real-time

### Technical
- Refactored TaskDetailContent component to remove unnecessary state management complexity
- Enhanced MarkdownEditor component with better content synchronization using useEffect

## [0.2.2] - 2025-08-08

### Added
- **Comprehensive Notifications UI**: Complete notifications management system with advanced features
  - Client-side filtering and searching capabilities
  - Grouping options by date, user, or taskboard
  - Bulk actions for managing multiple notifications
  - Enhanced notification types with task details support
- **Notification Navigation**: Added "View All" link under the notifications dropdown
  - Users can now easily navigate to the full notifications page from the header 

### Technical
- Added NotificationsClient, NotificationsList, NotificationsSidebar, and VirtualNotificationsList components
- Updated Notification type in MentionContext to support task details
- Implemented client-side state management for notification filtering and grouping

## [0.2.1] - 2025-08-08

### Added
- **Leave Management UI Enhancement**: Fully enabled leave management interface
  - Removed feature flag restrictions from leave management dashboard
  - Always display leave balance and request functionality
  - Enabled leave request creation, editing, and cancellation for all users

### Changed  
- **Leave Balance Display**: Updated leave balance component to show minimum value of 0
  - Negative leave balances now display as 0 instead of negative values
  - Maintains accurate color coding based on actual balance values
  - Improved user experience by preventing confusion from negative displays

### Fixed
- **Leave Balance Negative Display**: Fixed issue where negative leave balances were shown to users

### Technical
- Removed `isFeatureEnabled` prop and related conditional logic from MyLeave component
- Added `getDisplayBalance` helper function to ensure non-negative balance display
- Simplified component structure by removing feature flag complexity

## [0.2.0] - 2025-08-07

### Added
- **Complete Leave Management System**: Full-featured leave request system with policies, approvals, and balance tracking
  - Leave request creation, editing, and cancellation capabilities
  - Leave policy management with customizable rules
  - Automated leave balance tracking and notifications
  - Leave request approval workflow with notifications
  - Integration with workspace permissions system
- **Task Mention System**: Implemented `#` trigger for task mentions with dropdown selection (#106)
- **Subtask Relations**: Added support for showing subtasks in task relations and Kanban cards (#101, #102)
- **Enhanced Task Filtering**: Improved search functionality to include issueKey/short codes in Kanban view (#109)
- **Task Help Request System**: Comprehensive help request workflow with approval/rejection capabilities
- **Label System**: Added label support for all board items with filtering capabilities
- **Enhanced Notifications**: Improved notification system across all models (#105)
- **Activity History**: Comprehensive activity tracking for all board item types
- **Image Support**: Added image paste and drop support to markdown editor

### Changed
- **Mobile Responsiveness**: Enhanced mobile support across multiple components
  - Tag selection dialog with search functionality (#103)
  - Feature request pages with optimized layout and spacing (#95)
  - Post layouts and button positioning for mobile devices
  - Landing page mobile optimization
- **Friendly URL Implementation**: Completed friendly URL system for better navigation (#92)
- **Board Management**: Enhanced board creation permissions and issue prefix requirements
- **Sticky Headers**: Made board headers and filter bars sticky while allowing content scrolling
- **Assignee & Reporter Support**: Enhanced assignee and reporter functionality across board items
- **Time Tracking**: Improved time tracking with session management and analytics

### Fixed
- **Markdown Preview Issues**: Fixed markdown preview and scroll issues in timeline
- **Profile Image Flicker**: Resolved profile image rate limiting and flicker issues
- **Board Selection**: Fixed board selection and context management issues
- **Create Task Issues**: Resolved task creation problems and validation errors
- **Mobile Layout Fixes**: Fixed various mobile responsiveness issues across components

### Technical
- **Database & API**: New API endpoints for leave management, task operations, and notifications
- **Permission System**: Enhanced workspace permission system with granular controls
- **Query Optimizations**: Improved database queries and caching strategies
- **Updated Dependencies**: Updated React, Next.js, TanStack Query, and Radix UI components 


## [0.1.0] - 2025-08-07

### Changed
- **Notes Page Navigation**: Completely redesigned the notes page with a new horizontal tab structure
  - Replaced nested vertical tabs with clean horizontal navigation
  - New tab organization: All, Private, Public | Team Notes
  - Added visual separator (|) between personal notes and team notes
  - Implemented underline-style active states instead of background colors
  - Improved responsive design for better mobile experience

### Added
- **Enhanced Notes Filtering**: New 4-category system for better note organization
  - **All**: View all your notes (both private and public)
  - **Private**: View only your private notes
  - **Public**: View only your public shared notes  
  - **Team Notes**: View public notes shared by team members
- **Visual Improvements**: Clean tab design with bottom border indicators
- **Better UX**: Simplified navigation without complex nested structures

### Technical
- Updated state management from nested tab structure to single horizontal tab system
- Refactored API filtering logic to support new 4-category system
- Improved TypeScript types for new tab structure
- Enhanced responsive design with better mobile support 
