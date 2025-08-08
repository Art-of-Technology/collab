# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
 

## [0.2.2] - 2025-01-27

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

## [0.2.1] - 2025-01-27

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
