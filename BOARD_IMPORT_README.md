# Board Import Functionality

This guide explains how to bulk import milestones, epics, stories, and tasks to boards using JSON files.

## Features

- ✅ **AI Board Generation**: Generate complete board structures using ChatGPT
- ✅ **Hierarchical Structure**: Milestone → Epic → Story → Task hierarchy
- ✅ **Automatic Issue Numbering**: Automatic ID generation with board prefix
- ✅ **Flexible Assignment**: User assignment via email address
- ✅ **Label Management**: Automatic label creation and assignment
- ✅ **Column Placement**: Place items in your desired columns
- ✅ **Validation**: Data validation before import
- ✅ **Sample File**: Sample JSON file to get started

## JSON Structure

### Basic Structure

```json
{
  "board": {
    "name": "Project Name",
    "description": "Project description (optional)",
    "issuePrefix": "PRJ" // Optional: PRJ-1, PRJ-2 numbering format
  },
  "columns": [ // Optional: Default columns will be created if not specified
    {"name": "Milestones", "order": 0, "color": "#8B5CF6"},
    {"name": "Epics", "order": 1, "color": "#3B82F6"},
    {"name": "Stories", "order": 2, "color": "#10B981"},
    {"name": "Backlog", "order": 3, "color": "#64748B"},
    {"name": "To Do", "order": 4, "color": "#6366F1"},
    {"name": "In Progress", "order": 5, "color": "#EC4899"},
    {"name": "Review", "order": 6, "color": "#F59E0B"},
    {"name": "Done", "order": 7, "color": "#059669"}
  ],
  "milestones": [
    {
      "title": "Milestone Title",
      "description": "Milestone description",
      "status": "planned", // planned, in-progress, completed
      "startDate": "2024-01-01", // YYYY-MM-DD format
      "dueDate": "2024-03-31",
      "color": "#8B5CF6",
      "columnName": "Milestones", // Which column it will be placed in
      "position": 0, // Order within the column
      "assigneeEmail": "lead@example.com", // Email of the assignee
      "labels": ["milestone", "v1.0"], // Labels
      "epics": [
        // Epics go here...
      ]
    }
  ]
}
```

### Epic Structure

```json
{
  "title": "Epic Title",
  "description": "Epic description",
  "status": "backlog", // backlog, planned, in-progress, completed
  "priority": "high", // low, medium, high, critical
  "startDate": "2024-01-01",
  "dueDate": "2024-01-31",
  "color": "#3B82F6",
  "columnName": "Epics",
  "position": 0,
  "assigneeEmail": "dev@example.com",
  "labels": ["auth", "security"],
  "stories": [
    // Stories go here...
  ]
}
```

### Story Structure

```json
{
  "title": "Story Title",
  "description": "Story description",
  "status": "backlog",
  "priority": "medium",
  "type": "user-story", // user-story, bug, feature, improvement
  "storyPoints": 8, // Scrum points
  "color": "#10B981",
  "columnName": "Stories",
  "position": 0,
  "assigneeEmail": "dev@example.com",
  "labels": ["frontend", "auth"],
  "tasks": [
    // Tasks go here...
  ]
}
```

### Task Structure

```json
{
  "title": "Task Title",
  "description": "Task description",
  "status": "todo",
  "priority": "high",
  "type": "task", // task, bug, feature, improvement
  "storyPoints": 3,
  "dueDate": "2024-01-15",
  "columnName": "To Do",
  "position": 0,
  "assigneeEmail": "backend-dev@example.com",
  "labels": ["backend", "api"]
}
```

## Usage Steps

### Method 1: AI Generation (Recommended)

#### 1. Open AI Generation Tab
- Click "Import from JSON" option from the board selector menu
- Select "Generate with AI" tab in the opened dialog

#### 2. Describe Your Project
- Enter a detailed project description in the text area
- Optionally select project type (Web Application, Mobile App, etc.)
- Optionally select team size (Solo, Small, Medium, etc.)

#### 3. Generate Structure
- Click "Generate Board Structure" button
- Wait for AI to create a comprehensive board structure
- Review the generated JSON in the "JSON Editor" tab

#### 4. Import Generated Board
- Check the preview to see milestones, epics, stories, and tasks counts
- Click "Import Board" button to create the board

### Method 2: Manual JSON Upload

#### 1. Download Sample JSON File
- Click "Import from JSON" option from the board selector menu
- Select "Upload File" tab
- Click "Download Sample File" button
- `board-import-sample.json` file will be downloaded

#### 2. Edit JSON File
- Open the downloaded sample file with a text editor
- Edit milestones, epics, stories and tasks according to your project structure
- Enter user email addresses correctly

#### 3. Upload and Import
- Upload your prepared JSON file
- Or switch to "JSON Editor" tab and paste the content manually
- Check validation errors
- View the number of items to be created in the preview section
- Click "Import Board" button

## Field Descriptions

### Required Fields
- `board.name`: Board name
- `milestones[].title`: Milestone title
- `epics[].title`: Epic title
- `stories[].title`: Story title
- `tasks[].title`: Task title

### Optional Fields
- `assigneeEmail`: User assignment (valid email address)
- `columnName`: Column assignment (existing column name)
- `labels`: Label list (automatically created)
- `color`: Color code (hex format)
- `position`: Order within column (starts from 0)

### Date Format
- All dates must be in `YYYY-MM-DD` format
- Example: `"2024-12-31"`

### Status Values

#### Milestone Status
- `planned`: Planned
- `in-progress`: In Progress
- `completed`: Completed

#### Epic/Story Status
- `backlog`: Backlog
- `planned`: Planned
- `in-progress`: In Progress
- `completed`: Completed

#### Priority Values
- `low`: Low
- `medium`: Medium
- `high`: High
- `critical`: Critical

#### Story/Task Types
- `user-story`: User Story
- `bug`: Bug
- `feature`: Feature
- `improvement`: Improvement
- `task`: Task

## Important Notes

### 1. Email Validation
- Email addresses specified in the `assigneeEmail` field must be registered in the system
- Invalid emails are ignored (no assignment is made)

### 2. Column Names
- Column names specified in the `columnName` field must match the columns defined in the JSON
- **Recommended column placement**:
  - Milestones → "Milestones" column
  - Epics → "Epics" column  
  - Stories → "Stories" column
  - Tasks → "To Do" column
- If not specified, items will be added to appropriate default columns

### 3. Labels
- Labels specified in the `labels` array are automatically created
- Existing labels are reused

### 4. Issue Keys
- If `issuePrefix` is specified on the board, all items are automatically numbered
- Example: `PRJ-1`, `PRJ-2`, `PRJ-3`...

### 5. Position
- If `position` is not specified, it is assigned according to creation order
- Using the same position number may cause conflicts

## AI Generation Setup

To use the AI board generation feature, you need to configure OpenAI API access:

### Environment Variables

Add the following to your `.env` file:

```env
OPENAPI_KEY=sk-your-openai-api-key-here
```

### Getting OpenAI API Key

1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Create a new API key
4. Copy the key and add it to your environment variables

### AI Generation Tips

- **Be Specific**: Provide detailed project descriptions for better results
- **Include Context**: Mention technologies, team roles, timeline expectations
- **Use Examples**: "Create a mobile e-commerce app with user auth, product catalog, shopping cart, and admin dashboard"
- **Specify Requirements**: Mention specific features, integrations, or constraints
- **No Limits**: AI will create as many milestones, epics, stories, and tasks as necessary
- **Structured Output**: Generated boards will have organized columns (Milestones → Epics → Stories → Tasks)
- **Review Output**: Always review the generated JSON before importing

### Example Prompts

**E-commerce Project:**
```
I want to create a comprehensive e-commerce platform with user authentication, product catalog with categories and search, shopping cart functionality, secure payment integration (Stripe), order management system, customer support chat, admin dashboard for inventory management, analytics reporting, and mobile responsive design. The project should support multiple payment methods and have SEO optimization.
```

**Mobile App Project:**
```
Develop a social fitness mobile app with user registration and profiles, workout tracking with custom routines, progress photos and statistics, social features like following friends and sharing workouts, in-app challenges and leaderboards, nutrition tracking, push notifications for reminders, offline mode capability, and integration with wearable devices.
```

## Example Usage Scenarios

### 1. Simple Project Structure
```json
{
  "board": {
    "name": "Website Redesign",
    "issuePrefix": "WEB"
  },
  "milestones": [
    {
      "title": "v1.0 Launch",
      "dueDate": "2024-06-30",
      "epics": [
        {
          "title": "Homepage Design",
          "stories": [
            {
              "title": "Header Component",
              "tasks": [
                {
                  "title": "Code navigation menu",
                  "assigneeEmail": "dev@company.com"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### 2. Agile Sprint Structure
```json
{
  "board": {
    "name": "Sprint 1",
    "issuePrefix": "SP1"
  },
  "columns": [
    {"name": "Backlog", "order": 0, "color": "#64748B"},
    {"name": "Sprint Ready", "order": 1, "color": "#6366F1"},
    {"name": "In Progress", "order": 2, "color": "#EC4899"},
    {"name": "Review", "order": 3, "color": "#F59E0B"},
    {"name": "Done", "order": 4, "color": "#10B981"}
  ],
  "milestones": [
    {
      "title": "Sprint 1 - 2 Weeks",
      "startDate": "2024-01-01",
      "dueDate": "2024-01-15",
      "epics": [
        {
          "title": "User Authentication",
          "priority": "high",
          "stories": [
            {
              "title": "User Login",
              "type": "user-story",
              "storyPoints": 5,
              "columnName": "Sprint Ready",
              "tasks": [
                {
                  "title": "Create API endpoint",
                  "priority": "high",
                  "storyPoints": 3,
                  "assigneeEmail": "backend@company.com",
                  "labels": ["backend", "api"]
                },
                {
                  "title": "Frontend form",
                  "priority": "medium",
                  "storyPoints": 2,
                  "assigneeEmail": "frontend@company.com",
                  "labels": ["frontend", "ui"]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## Troubleshooting

### Common Errors

1. **"Board name is required"**
   - Check the `board.name` field

2. **"At least one milestone is required"**
   - Make sure the `milestones` array is not empty

3. **"Invalid JSON format"**
   - Check JSON syntax with a JSON validator
   - Check comma, quote mark and parenthesis usage

4. **"Column not found"**
   - Make sure the column name specified in the `columnName` field is defined in the `columns` array

### Tips

- Download and examine the sample file before writing your JSON file
- Test in small chunks for large projects
- Validate user emails beforehand
- Always preview before importing

## Support

For questions about this functionality:
- Use the sample JSON file as a reference
- Pay attention to validation messages before import
- Check detailed error messages in case of errors 