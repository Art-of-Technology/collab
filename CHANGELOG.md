# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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