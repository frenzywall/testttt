# Technical Reference Guide
## Change Management Notice Application

## Table of Contents
1. [Code Architecture](#code-architecture)
2. [Core Components](#core-components)
3. [JavaScript API Reference](#javascript-api-reference)
4. [Python API Reference](#python-api-reference)
5. [CSS Structure](#css-structure)
6. [Data Flow](#data-flow)
7. [Authentication Implementation](#authentication-implementation)
8. [Extension Points](#extension-points)

---

## Code Architecture

### Frontend Architecture

The frontend follows a modular, event-driven architecture with these key components:

1. **UI Layer**: HTML templates with dynamic content rendering
2. **Interaction Layer**: Event handlers and UI state management
3. **Data Layer**: AJAX requests to backend API endpoints
4. **Utility Layer**: Helper functions for common operations

The JavaScript codebase is split into:
- **main.js**: Core application functionality
- **change-tracker.js**: Change tracking and sync status management

### Backend Architecture

The backend uses a Flask application architecture with:
1. **Route Handlers**: API endpoints and view functions
2. **Service Layer**: Business logic for data processing
3. **Data Layer**: Redis storage interface
4. **Utility Services**: Email parsing, AI processing

### Communication Flow

1. User actions in the browser trigger JavaScript events
2. Event handlers make AJAX calls to backend endpoints
3. Backend processes requests and returns JSON responses
4. Frontend updates the UI based on response data

---

## Core Components

### Change Tracker

The Change Tracker is a key component that monitors modifications to the data and manages the sync state:

```javascript
ChangeTracker = {
    statusIndicator: null,      // DOM element for status
    statusText: null,           // DOM element for status text
    changeCount: 0,             // Counter for unsaved changes
    hasUnsavedChanges: false,   // Flag for unsaved changes
    isSyncing: false,           // Flag for sync in progress
    rowToDelete: null,          // Reference to row being deleted

    // Main initialization function
    init: function() {
        this.createStatusIndicator();
        this.attachEventListeners();
        this.checkInitialState();
    },

    // Update status based on state
    updateStatus: function(status) {
        // Implementation handles different states: no-changes, unsaved, syncing, synced
    },

    // Mark changes as needing sync
    markUnsaved: function() {
        this.updateStatus('unsaved');
        this.addBeforeUnloadWarning();
    },

    // Mark changes as being synced
    markSyncing: function() {
        this.updateStatus('syncing');
    },

    // Mark changes as synced
    markSynced: function() {
        this.updateStatus('synced');
        this.removeBeforeUnloadWarning();
    }
    
    // Additional utility methods
}
```

### Impact Priority Selector

The Impact Priority Selector is a UI component that allows users to set the priority level for each change:

```javascript
function initImpactSelector(row) {
    const selector = row.querySelector('.impact-selector');
    if (!selector) return;
    
    const options = selector.querySelectorAll('.impact-option');
    
    options.forEach(option => {
        option.addEventListener('click', function() {
            if (this.classList.contains('selected')) return;
            
            // Update selection state
            options.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            
            // Update row priority attribute
            const priority = this.getAttribute('data-value');
            row.setAttribute('data-priority', priority);
            selector.setAttribute('data-value', priority);
            
            // Update styling and notify change tracker
            applyRowHighlight(row);
            if (window.ChangeTracker) {
                ChangeTracker.markUnsaved();
            }
        });
    });
}
```

### Timezone Conversion

The timezone conversion system converts times between different timezones:

```javascript
function convertTimezone(timeStr, dateStr, fromTz, toTz) {
    if (!timeStr || !fromTz || !toTz) return timeStr;
    
    try {
        // Parse time with Luxon
        const dt = DateTime.fromFormat(`${dateStr} ${timeStr}`, "yyyy-MM-dd HH:mm", {
            zone: fromTz
        });
        
        if (!dt.isValid) return timeStr;
        
        // Convert to target timezone
        const converted = dt.setZone(toTz);
        return converted.toFormat("HH:mm");
    } catch (error) {
        console.error('Timezone conversion error:', error);
        return timeStr;
    }
}
```

### History Management

The history management system maintains a record of prior data states and provides functionality to view, load, and delete history entries:

```javascript
// Open history modal and load history items
function openHistoryModal() {
    const historyModal = document.getElementById('historyModal');
    const historyList = document.getElementById('historyList');
    
    // Show loading state
    historyList.innerHTML = '<div class="loading-history"><i class="fas fa-circle-notch fa-spin"></i> Loading history...</div>';
    historyModal.style.display = "block";
    
    // Fetch history from server
    fetch('/get-history', {
        method: 'GET',
        cache: 'no-store'
    })
    .then(response => response.json())
    .then(history => {
        // Process and display history entries
    })
    .catch(error => {
        // Handle errors
    });
}
```

---

## JavaScript API Reference

### Core Functions

#### Data Management

| Function | Description | Parameters | Returns |
|----------|-------------|------------|---------|
| `syncAllDataToRedis(saveToHistory)` | Syncs table data to Redis | saveToHistory (boolean): Whether to save in history | Promise |
| `updateMainTableFromParsedData()` | Updates main table from parsed data | None | void |
| `updateUIWithHistoryData(data)` | Updates UI with history data | data (object): History data object | void |
| `loadHistoryItem(timestamp)` | Loads specific history item | timestamp (number): Timestamp of history item | void |
| `deleteHistoryItem(timestamp, itemElement)` | Deletes specific history item | timestamp (number), itemElement (DOM element) | void |

#### UI Management

| Function | Description | Parameters | Returns |
|----------|-------------|------------|---------|
| `initImpactSelector(row)` | Initializes impact selector for a row | row (DOM element): Table row | void |
| `createNotification(type, message, persistent)` | Creates notification toast | type (string), message (string), persistent (boolean) | DOM element |
| `createConfirmDialog(options)` | Creates confirmation dialog | options (object) | Promise<boolean> |
| `applyRowHighlight(row)` | Applies highlighting to row based on priority | row (DOM element) | void |
| `checkEmptyTable()` | Checks if table is empty and adds placeholder | None | void |

#### Authentication

| Function | Description | Parameters | Returns |
|----------|-------------|------------|---------|
| `isAuthenticated()` | Checks if user is authenticated | None | boolean |
| `ensureAuthenticated(callback, customMessage)` | Ensures user is authenticated before action | callback (function), customMessage (string) | void |
| `promptForPasskey(message)` | Prompts user for passkey | message (string) | Promise<boolean> |
| `enableRestrictedFeatures()` | Enables restricted features after auth | None | void |
| `disableRestrictedFeatures()` | Disables restricted features | None | void |

#### Timezone Handling

| Function | Description | Parameters | Returns |
|----------|-------------|------------|---------|
| `convertTimezone(timeStr, dateStr, fromTz, toTz)` | Converts time between timezones | timeStr, dateStr, fromTz, toTz | string |
| `handleTimezoneChange()` | Handles timezone selection change | None | void |
| `populateTimezoneSelectors()` | Populates timezone dropdowns | None | void |
| `toggleTimezoneConversion()` | Toggles timezone conversion on/off | None | void |

### Event Handlers

| Event Source | Event | Handler Function | Description |
|--------------|-------|-----------------|-------------|
| Add Row Button | click | `document.getElementById('addRow').addEventListener` | Adds a new row to the table |
| Edit Button | click | `document.querySelector('.edit-btn').addEventListener` | Makes row cells editable |
| Save Button | click | `document.querySelector('.save-btn').addEventListener` | Saves edited row and disables editing |
| Delete Button | click | `document.querySelector('.delete-btn').addEventListener` | Shows confirmation and deletes row |
| Theme Toggle | click | `themeToggle.addEventListener` | Toggles between light/dark themes |
| Timezone Toggle | change | `convertToggleBtn.addEventListener` | Toggles timezone conversion |
| History Search | input | `historySearch.addEventListener` | Filters history items based on search |

### ChangeTracker Object API

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `init()` | Initializes the change tracker | None | void |
| `createStatusIndicator()` | Creates the status indicator UI | None | void |
| `updateStatus(status)` | Updates the status display | status (string): no-changes, unsaved, syncing, synced | void |
| `markUnsaved()` | Marks changes as unsaved | None | void |
| `markSyncing()` | Marks changes as syncing | None | void |
| `markSynced()` | Marks changes as synced | None | void |
| `resetCounter()` | Resets the change counter | None | void |
| `addBeforeUnloadWarning()` | Adds navigation warning | None | void |
| `removeBeforeUnloadWarning()` | Removes navigation warning | None | void |
| `isEmptyRow(row)` | Checks if row is empty | row (DOM element) | boolean |

---

## Python API Reference

### Flask Route Handlers

| Route | Method | Function | Description |
|-------|--------|----------|-------------|
| `/` | GET | `index()` | Renders the main application page |
| `/sync-all-data` | POST | `sync_all_data()` | Saves data to Redis |
| `/sync-to-history` | POST | `sync_to_history()` | Saves data to Redis and history |
| `/get-history` | GET | `get_history()` | Retrieves history entries |
| `/load-from-history/<timestamp>` | GET | `load_from_history(timestamp)` | Loads specific history entry |
| `/delete-from-history/<timestamp>` | DELETE | `delete_from_history(timestamp)` | Deletes specific history entry |
| `/save-title` | POST | `save_title()` | Updates the header title |
| `/reset-data` | POST | `reset_data()` | Clears all data |

### Data Management Functions

| Function | Description | Parameters | Returns |
|----------|-------------|------------|---------|
| `save_to_history(data)` | Saves current data to history | data (dict) | boolean |
| `get_stored_history()` | Retrieves history from Redis | None | List |
| `store_data(data)` | Stores data in Redis | data (dict) | boolean |
| `get_data()` | Retrieves data from Redis | None | dict |

### Email Processing Functions

| Function | Description | Parameters | Returns |
|----------|-------------|------------|---------|
| `parse_email(file, use_ai)` | Parses email file | file (FileStorage), use_ai (boolean) | dict |
| `extract_services(text)` | Extracts services from text | text (string) | List |
| `extract_dates(text)` | Extracts dates from text | text (string) | List |
| `extract_times(text)` | Extracts times from text | text (string) | List |
| `determine_impact(text, service)` | Determines impact level | text (string), service (string) | string |

---

## CSS Structure

The CSS is organized into several key sections:

### Base Styles

- Typography settings
- Color variables
- Reset styles
- Basic layout

### Component Styles

- Table styles
- Form elements
- Buttons
- Modal windows
- Notifications
- Status indicators

### UI Elements

- Impact selectors
- Timezone selectors
- History items
- Navigation header
- File upload elements

### Theme Support

- Light theme variables
- Dark theme variables
- Theme-specific overrides

### Responsive Design

- Mobile breakpoints
- Tablet breakpoints
- Print styles

### Animation

- Transition effects
- Loading spinners
- Pulse animations
- Notification animations

### Key CSS Variables

```css
:root {
    /* Color System */
    --primary-color: #3b82f6;
    --primary-color-rgb: 59, 130, 246;
    --surface-color: #ffffff;
    --text-color: #333333;
    --secondary-color: #64748b;
    --glass-border: rgba(255, 255, 255, 0.08);
    --glass-border-rgb: 255, 255, 255;
    --glass-card: rgba(255, 255, 255, 0.03);
    --glass-card-border: rgba(255, 255, 255, 0.05);
    
    /* Status Colors */
    --success-color: #16a34a;
    --success-color-rgb: 22, 163, 74;
    --warning-color: #f59e0b;
    --warning-color-rgb: 245, 158, 11;
    --danger-color: #ef4444;
    --danger-color-rgb: 239, 68, 68;
    
    /* UI Elements */
    --border-radius: 8px;
    --box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

[data-theme="dark"] {
    --surface-color: #1e293b;
    --text-color: #f1f5f9;
    --secondary-color: #94a3b8;
    --glass-border: rgba(255, 255, 255, 0.08);
    --glass-card: rgba(30, 41, 59, 0.4);
    --glass-card-border: rgba(255, 255, 255, 0.03);
}
```

---

## Data Flow

### Upload Process

1. User uploads .MSG file
2. File is sent to server via form submit
3. Server parses the file using email_parser.py or ai_processor.py
4. Extracted data is rendered with the template
5. Data is displayed in the main table

### Edit Process

1. User clicks Edit button on row
2. Row becomes editable (contenteditable=true)
3. User modifies cells
4. User clicks Save button
5. ChangeTracker marks changes as unsaved
6. Changes remain local until sync

### Sync Process

1. User clicks Sync button
2. Frontend collects all table data
3. Data is sent to /sync-all-data or /sync-to-history endpoint
4. Backend stores data in Redis
5. If saving to history, a history entry is created
6. Frontend updates change tracker to "synced" state

### History Load Process

1. User opens history modal
2. Frontend fetches history data from /get-history
3. History items are displayed in modal
4. User clicks Load on a history item
5. Frontend fetches specific history data
6. UI is updated with the historical data

---

## Authentication Implementation

The application implements a simple passkey-based authentication system:

### Authentication Flow

1. User attempts to access a restricted feature
2. `ensureAuthenticated()` is called
3. Function checks if user is already authenticated via `isAuthenticated()`
4. If not authenticated, `promptForPasskey()` is called
5. User enters the passkey in a prompt dialog
6. If correct, a timestamp is saved in localStorage
7. The timestamp gives 10 minutes of access

### Authentication Check

```javascript
function isAuthenticated() {
    const authUntil = localStorage.getItem('authUntil');
    return authUntil && Date.now() < parseInt(authUntil);
}
```

### Authentication Prompt

```javascript
function promptForPasskey(message = "Please enter the passkey to perform this action") {
    return new Promise((resolve) => {
        const passkey = prompt(message);
        if (passkey === "your-secret-passkey") { // Replace with actual validation
            resolve(true);
        } else {
            alert("Incorrect passkey. Access denied.");
            resolve(false);
        }
    });
}
```

### Feature Protection

Restricted features are protected with overlay elements that intercept clicks:

```javascript
function disableRestrictedFeatures() {
    document.querySelectorAll('.impact-selector, .action-cell').forEach(el => {
        const overlay = document.createElement('div');
        overlay.className = 'auth-required-overlay';
        // Add overlay styles and attributes
        el.appendChild(overlay);
        el.classList.add('restricted-feature');
    });
    
    // Disable file upload
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.disabled = true;
    }
}
```

### Security Considerations

- This is a simple security implementation, not suitable for highly sensitive data
- Passkey is checked client-side, which is not secure against determined attackers
- No user management or role-based access control
- Authentication timeout is managed client-side and could be manipulated

---

## Extension Points

The application is designed with several extension points for future development:

### Adding New Service Types

To add new service types with specific handling:

1. Update the service definitions in `ai_processor.py` and `email_parser.py`:

```python
"NewService": {
    "aliases": ["newservice", "new service", "alternate name"],
    "default_impact": "Default impact description for this service",
    "impact_indicators": ["unavailable", "upgrade", "maintenance", "impact"]
}
```

### Adding New UI Components

To add new UI components:

1. Add HTML structure to `result.html`
2. Add corresponding styles to `main.css`
3. Add JavaScript event handlers in `main.js`

### Extending the History System

To extend history functionality:

1. Modify `save_to_history()` in `app.py`
2. Enhance history UI rendering in `main.js`
3. Update history modal in `result.html`

### Adding New API Endpoints

To add new API endpoints:

1. Add new route handler to `app.py`
2. Implement required backend logic
3. Add corresponding frontend AJAX call in `main.js`

### Implementing Advanced Authentication

To implement more secure authentication:

1. Replace the passkey system with a proper authentication backend
2. Implement session management on the server
3. Add user accounts and permissions
4. Update the `isAuthenticated()` and related functions

### Adding Mobile Support

To enhance mobile support:

1. Add responsive breakpoints to `main.css`
2. Implement touch-friendly UI alternatives
3. Optimize table layout for small screens
4. Add mobile-specific gesture handlers

---

## Debugging and Logging

### Frontend Debugging

The frontend has several debugging and logging hooks:

```javascript
// To debug change tracking
ChangeTracker.logEnabled = true;  // Enable change tracker verbose logging

// To monitor UI interactions
document.addEventListener('click', function(e) {
    console.debug('Element clicked:', e.target);
});

// To trace data flows
const originalSyncFunction = window.syncAllDataToRedis;
window.syncAllDataToRedis = (...args) => {
    console.debug('syncAllDataToRedis called with args:', args);
    return originalSyncFunction(...args);
};
```

### Backend Logging

The backend uses Python's logging module:

```python
import logging

# Configure logger
logger = logging.getLogger('change_management')
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

# Usage
logger.debug('Detailed information')
logger.info('Confirmation of expected events')
logger.warning('Something unexpected happened')
logger.error('More serious problem')
logger.critical('Critical error affecting program execution')
```

---

*This technical reference is intended for developers working with or extending the Change Management Notice Application.*
