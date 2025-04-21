# Change Management Notice Application
## Complete User & Developer Documentation

## Table of Contents
1. [Introduction](#introduction)
2. [System Overview](#system-overview)
3. [Getting Started](#getting-started)
4. [User Interface](#user-interface)
5. [Core Functionality](#core-functionality)
6. [Data Management](#data-management)
7. [Authentication System](#authentication-system)
8. [Advanced Features](#advanced-features)
9. [API Reference](#api-reference)
10. [Troubleshooting](#troubleshooting)
11. [Developer Guide](#developer-guide)

---

## Introduction

The Change Management Notice application is a web-based tool designed to help teams manage and communicate scheduled maintenance windows and service changes. The application provides features for parsing email notifications, organizing change data in a structured format, enabling timezone conversions, and offering various viewing and filtering options.

### Purpose

This application solves several key challenges in change management:
- Converting unstructured email notifications into structured data
- Providing clear visibility of all scheduled changes
- Supporting timezone conversion for global teams
- Prioritizing changes by impact level
- Maintaining a historical record of all changes

### Target Users

- IT Operations teams
- Change Management personnel
- Support staff
- Service managers
- Global teams working across multiple timezones

---

## System Overview

### Architecture

The application is built using a Python backend with Flask framework and a JavaScript frontend. Data is stored in Redis for persistence. The system uses a stateless architecture where the frontend communicates with the backend via RESTful API calls.

### Technology Stack

**Backend:**
- Python with Flask web framework
- Redis for data storage
- Email parsing libraries for MSG file processing

**Frontend:**
- HTML5, CSS3, and JavaScript
- Luxon library for datetime operations
- Font Awesome for icons

### File Structure

```
/workspaces/testttt/
├── app.py               # Main Flask application
├── email_parser.py      # Email parsing functionality
├── ai_processor.py      # AI-based text extraction
├── static/
│   ├── css/
│   │   ├── main.css           # Main stylesheet
│   │   └── change-tracker.css # Change tracking styles
│   └── js/
│       ├── main.js            # Main application logic
│       └── change-tracker.js  # Change tracking functionality
└── templates/
    └── result.html      # Main application template
```

---

## Getting Started

### Installation Requirements

1. Python 3.7+
2. Redis server
3. Web browser (Chrome, Firefox, Edge recommended)
4. Required Python packages (install via `pip install -r requirements.txt`):
   - Flask
   - redis
   - extract-msg (for parsing Outlook .msg files)

### First-Time Setup

1. Start the Redis server
2. Run the Flask application: `python app.py`
3. Access the application via web browser at `http://localhost:5000`

---

## User Interface

### Navigation Header

The application header contains:
- Application title/logo
- Theme toggle (dark/light mode)
- Upload MSG button
- Download HTML button
- Compare & Edit button
- Add Row button
- Reset button
- Sync dropdown menu

### Timezone Control Panel

The timezone control panel allows users to:
- Select source timezone (default: Sweden)
- Select target timezone (default: IST)
- Toggle timezone conversion
- View timezone conversion warnings

### Filtering System

The filtering controls allow filtering by impact priority:
- All changes (default)
- High priority
- Medium priority
- Low priority

### Main Data Table

The main table displays all change records with columns for:
- Service/Server name
- Date
- Start Time
- End Time
- End Date
- Comments
- Impact Priority
- Actions (Edit, Save, Delete)

### Impact Priority Indicators

Each change record includes an impact priority indicator:
- Low (green): Minimal service impact
- Medium (yellow): Partial service disruption
- High (red): Complete service unavailability

### Modal Windows

The application includes several modal windows:
1. **Email Comparison Modal**: Shows original email alongside extracted data
2. **Upload Modal**: Handles MSG file uploads with AI processing option
3. **Info Modal**: Provides help and documentation
4. **History Modal**: Displays the sync history
5. **Delete Confirmation**: Confirms before deleting records

---

## Core Functionality

### Email Parsing

The application can parse Outlook MSG files to extract:
- Service/server names
- Maintenance dates and times
- Impact details
- Notes and comments

#### Standard vs. AI Processing

When uploading a file, users can choose between:
- **Standard Processing**: Uses pattern matching and rule-based extraction
- **AI Processing**: Uses advanced text analysis for better extraction

### Timezone Conversion

The application supports conversion between multiple timezones:
1. Select source timezone (where the maintenance is scheduled)
2. Select target timezone (where users are located)
3. Toggle the conversion on/off
4. View converted times with clear labeling

#### Supported Timezone Formats

- Times must be in 24-hour format (HH:MM)
- Date format: YYYY-MM-DD
- Time ranges can be expressed as "09:00-11:00"

### Data Management

#### Adding Data

New data can be added by:
1. Uploading an MSG file
2. Clicking the "Add Row" button
3. Manually adding entries to the parsed data table

#### Editing Data

To edit data:
1. Click the edit button on a row
2. Modify the cells directly
3. Click save to confirm changes

#### Deleting Data

To delete data:
1. Click the delete button on a row
2. Confirm deletion in the confirmation dialog

### Sorting and Filtering

The table data can be:
- **Sorted** by clicking any column header
- **Filtered** by using the priority filter buttons

### Exporting Data

The application supports exporting to HTML format:
1. Click "Download HTML" button
2. Optionally filter data before downloading
3. The HTML file contains all visible records with styling

---

## Data Management

### Data Persistence

All data is stored in Redis:
- Change records are stored as JSON
- History items are stored as a separate collection
- Data is retained across application restarts

### Data Syncing

The Sync dropdown provides three options:
1. **Sync to Redis**: Save current data to Redis
2. **Sync to History**: Save current data and create history entry
3. **View History**: Open the history modal

### Change Tracking

The change tracker system:
- Monitors all changes to the table data
- Tracks unsaved changes with visual indicators
- Warns when navigating away with unsaved changes
- Shows sync status (local, staged, synced)

#### Change States

The change tracker shows different states:
- **No changes**: All changes are saved
- **Unsaved changes**: Changes need to be synced
- **Syncing**: Data is being synchronized
- **Synced**: All changes are saved to Redis

### History System

The history system maintains a record of prior versions:
1. Up to 20 history entries are saved
2. Each history entry includes full data snapshot and timestamp
3. History entries can be loaded or deleted
4. Duplicate entries within 60 seconds are consolidated

---

## Authentication System

### Access Control

The application implements a simple passkey-based authentication:
1. Restricted features require authentication
2. Authentication persists for 10 minutes
3. Authentication is session-based (not persistent across browser restarts)

### Protected Features

The following features require authentication:
- Editing the header title
- Adding, editing, or deleting rows
- Changing impact priority
- Uploading MSG files
- Accessing the sync functionality
- Viewing email comparison
- Changing layout in comparison view

### Authentication Process

1. When accessing a restricted feature, authentication prompt appears
2. User enters the passkey
3. If valid, user gains access for 10 minutes
4. If invalid, access is denied

---

## Advanced Features

### Email Comparison View

The email comparison view provides:
- Side-by-side view of original email and parsed data
- Text highlighting to identify extracted data
- Search functionality to find text in the email
- Font size adjustment
- Layout toggle (side-by-side vs. stacked)
- Word wrap toggle

### Data Highlighting

When viewing the original email, the "Highlight Data" button will:
- Highlight service names in blue
- Highlight dates in green
- Highlight times in orange

### AI Processing

When enabled, AI processing will:
- Analyze email content semantically
- Identify services not explicitly listed
- Detect impact levels based on context
- Extract start and end times even with unusual formats

### Theme Toggle

The application supports two visual themes:
- Light mode: Bright background with dark text
- Dark mode: Dark background with light text
- Theme preference is saved in browser localStorage

---

## API Reference

### Endpoints

#### GET Endpoints

- `/`: Main application page
- `/get-history`: Retrieve sync history records
- `/load-from-history/<timestamp>`: Load data from specific history entry

#### POST Endpoints

- `/sync-all-data`: Save current data to Redis
- `/sync-to-history`: Save current data and create history entry
- `/save-title`: Update the header title
- `/reset-data`: Clear all data and reset application state

#### DELETE Endpoints

- `/delete-from-history/<timestamp>`: Delete specific history entry

### Request/Response Formats

All API endpoints use JSON for both request and response:

**Example Request:**
```json
{
  "services": [
    {
      "name": "GitLab",
      "start_time": "09:00",
      "end_time": "11:00",
      "end_date": "2023-10-15",
      "comments": "Regular maintenance",
      "priority": "medium"
    }
  ],
  "date": "2023-10-15",
  "header_title": "Weekend Change Window",
  "original_body": "Original email content..."
}
```

**Example Response:**
```json
{
  "status": "success",
  "timestamp": 1697400000,
  "message": "Data synced successfully"
}
```

---

## Troubleshooting

### Common Issues

#### Upload Issues

- **Problem**: MSG file upload fails
  **Solution**: Ensure file is a valid Outlook MSG file and under size limit (10MB)

- **Problem**: Parsed data is incorrect
  **Solution**: Try toggling AI processing or manually edit the data

#### Timezone Conversion Issues

- **Problem**: Times not converting correctly
  **Solution**: Ensure times are in 24-hour format (HH:MM)

- **Problem**: Time conversion warning appears
  **Solution**: Check that both timezones are correctly selected

#### Sync Issues

- **Problem**: Changes not saving
  **Solution**: Check Redis connection and ensure proper authentication

- **Problem**: History not updating
  **Solution**: Verify Redis has write permissions and sufficient memory

### Error Messages

- **"Error syncing data"**: Problem connecting to Redis or invalid data format
- **"Please enter the passkey"**: Authentication required for this action
- **"No data to sync"**: Table is empty, nothing to save
- **"Please upload a .MSG file"**: Incorrect file format selected

---

## Developer Guide

### Adding New Features

When adding new features:
1. Follow the existing pattern separation (HTML in templates, JS in static/js)
2. Use the authentication system for restricted features
3. Update the change tracker for any data modifications
4. Add appropriate documentation

### Code Structure Overview

#### Frontend Architecture

The frontend code is organized into two main JavaScript files:
- `main.js`: Core application logic, UI interactions, AJAX requests
- `change-tracker.js`: Change tracking system

Key JavaScript objects and functions:
- Event handlers for table interactions
- Timezone conversion functions
- Modal management
- History system
- Authentication handlers

#### Backend Architecture

The backend is built on Flask with these key components:
- Route handlers for API endpoints
- Email parsing functionality
- Redis data storage
- History management

### Extending the Application

To add new functionality:
1. For new UI elements, modify `result.html`
2. For new styles, add to `main.css`
3. For new behavior, extend `main.js`
4. For backend changes, modify `app.py`

### Modifying Existing Features

When modifying existing features:
1. Understand the change tracking system
2. Test authentication restrictions
3. Ensure timezone conversions are maintained
4. Update documentation

---

## Appendix

### Keyboard Shortcuts

- `Esc`: Close active modal
- `Enter`: Save edits when editing fields

### Security Considerations

- This application uses a simple passkey system, not suitable for highly sensitive data
- No user account system or granular permissions
- Data is stored in plaintext in Redis

### Future Enhancements

Planned future enhancements:
- User account system
- Role-based access control
- Email notifications for changes
- Calendar integration
- Mobile app version

---

*This documentation is current as of the latest application update. For questions or support, please contact the development team.*
