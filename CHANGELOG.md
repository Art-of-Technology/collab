# Changelog

## [Unreleased]

## [CLB-102] - Notion Editor Improvements - 2025-08-17

### Added
- Click outside functionality to close color palette
- '+' button to open slash editor
- Dynamic placeholder text for slash commands that shows selected command type
- Drag and drop functionality with drag handle support
- Notion-style contenteditable title with backspace navigation
- Manual CSS placeholder system for all empty lines and block types

### Changed
- Updated color palette border from green to gray for better UI consistency
- Fixed ESLint warnings for React hooks and accessibility
- Improved code organization in notion-editor.tsx
- Translated Turkish comments to English
- Removed unused state variables and functions
- Improved color palette feature and its positioning inside slash editor
- Moved action buttons to header bar alongside back navigation
- Improved drag handle and plus button styling
- Converted note modal to full-screen page with working editor
- Upgraded Tiptap editor to v3.0.0 with performance improvements

### Fixed
- Fixed heading placeholder font sizes in editor
- Fixed drag handle and plus button positioning
- Fixed placeholder positioning in quotes, bullet lists and numbered lists
- Fixed slash editor's heading features
- Fixed NotionEditor placeholder visibility
- Fixed duplicate variable declarations
- Fixed color palette outline colour
- Fixed duplicate success toast messages when editing notes
- Preserved cursor position when applying slash commands
- Fixed note edit form content loading issues