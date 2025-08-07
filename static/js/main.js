// Import Luxon library for DateTime operations
const { DateTime } = luxon || window.luxon;

// Smart History Caching System
class SmartHistoryCache {
    constructor() {
        this.cache = new Map();
        this.searchCache = new Map();
        this.pageCache = new Map();
        this.failedSearchCache = new Map(); // Track failed searches
        this.lastSyncTimestamp = 0;
        this.cacheTTL = 5 * 60 * 1000; // 5 minutes
        this.maxCacheSize = 100; // Prevent memory leaks
    }
    
    // Cache key generators
    getPageKey(page, perPage) {
        return `page_${page}_${perPage}`;
    }
    
    getSearchKey(searchTerm) {
        return `search_${searchTerm.toLowerCase().trim()}`;
    }
    
    // Cache invalidation
    invalidateCache() {
        this.cache.clear();
        this.searchCache.clear();
        this.pageCache.clear();
        this.failedSearchCache.clear(); // Clear failed search cache too
    }
    
    // Check if a search term is known to return no results
    isFailedSearch(searchTerm) {
        const failed = this.failedSearchCache.get(searchTerm);
        if (failed && (Date.now() - failed.timestamp) < this.cacheTTL) {
            return true;
        }
        if (failed) {
            this.failedSearchCache.delete(searchTerm); // Remove expired entry
        }
        return false;
    }
    
    // Mark a search term as failed
    markFailedSearch(searchTerm) {
        this.failedSearchCache.set(searchTerm, {
            timestamp: Date.now()
        });
        
        // Limit failed search cache size
        if (this.failedSearchCache.size > this.maxCacheSize) {
            const firstKey = this.failedSearchCache.keys().next().value;
            this.failedSearchCache.delete(firstKey);
        }
    }
    
    // Check if cache is valid
    isCacheValid(timestamp) {
        return (Date.now() - timestamp) < this.cacheTTL;
    }
    
    // Get cached data
    getCachedData(key, cacheType = 'general') {
        const cache = cacheType === 'search' ? this.searchCache : 
                     cacheType === 'page' ? this.pageCache : this.cache;
        
        const cached = cache.get(key);
        if (cached && this.isCacheValid(cached.timestamp)) {
            return cached.data;
        }
        
        if (cached) {
            cache.delete(key); // Remove expired cache
        }
        return null;
    }
    
    // Set cached data with LRU eviction
    setCachedData(key, data, cacheType = 'general') {
        const cache = cacheType === 'search' ? this.searchCache : 
                     cacheType === 'page' ? this.pageCache : this.cache;
        
        // Implement LRU eviction to prevent memory leaks
        if (cache.size >= this.maxCacheSize) {
            // Remove oldest entry (first key in Map)
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
        }
        
        cache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    }
    
    // Update sync timestamp for invalidation
    updateSyncTimestamp() {
        this.lastSyncTimestamp = Date.now();
        this.invalidateCache();
    }
    
    // Clear failed search cache (called via update checker when new data is added)
    clearFailedSearchCache() {
        this.failedSearchCache.clear();
    }
    
    // Check if any prefix of the search term is known to return no results
    isFailedSearchPrefix(searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        
        // Check if any prefix of the search term is in failed cache
        for (let i = 1; i <= searchLower.length; i++) {
            const prefix = searchLower.substring(0, i);
            const failed = this.failedSearchCache.get(prefix);
            if (failed && (Date.now() - failed.timestamp) < this.cacheTTL) {
                return true; // Found a failed prefix
            }
        }
        return false;
    }
}

// Global cache instance
const historyCache = new SmartHistoryCache();
// Make it globally accessible for logout handlers
window.historyCache = historyCache;

const modal = document.getElementById('emailModal');
const viewOriginalBtn = document.getElementById('viewOriginal');
const closeBtn = document.querySelector('#emailModal .close');
const confirmDialog = document.getElementById('deleteConfirmDialog');
let rowToDelete = null;

// Function to update the parsed data table with current main table data
function updateParsedDataFromMainTable() {
    const mainTableRows = document.querySelectorAll('#changeTable tbody tr:not(.empty-state)');
    const parsedDataBody = document.getElementById('parsedDataBody');
    
    // Clear the parsed data table
    parsedDataBody.innerHTML = '';
    
    // Add current table data to parsed data table
    mainTableRows.forEach(row => {
        const cells = row.cells;
        if (cells.length < 6) return;
        
        const serviceName = cells[0].textContent;
        const date = cells[1].textContent;
        const startTime = cells[2].textContent;
        const endTime = cells[3].textContent;
        const comments = cells[5].textContent;
        
        const newRow = document.createElement('tr');
        newRow.setAttribute('data-service', serviceName);
        newRow.innerHTML = `
            <td>${serviceName}</td>
            <td>${date}</td>
            <td>${startTime} - ${endTime}</td>
            <td>${comments}</td>
        `;
        parsedDataBody.appendChild(newRow);
    });
}

viewOriginalBtn.onclick = function() {
    ensureAuthenticated(() => {
        // Update the parsed data table with current table data before showing modal
        updateParsedDataFromMainTable();
        modal.style.display = "block";
    }, "Please enter the passkey to compare and edit");
}

closeBtn.onclick = function() {
    modal.style.display = "none";
}

window.onclick = function(event) {
    if (event.target == modal) {
    modal.style.display = "none";
    }
    if (event.target == confirmDialog) {
    confirmDialog.classList.remove('active');
    }
}


// Helper function to convert time to minutes for sorting
function convertTimeToMinutes(timeStr) {
    if (!timeStr || timeStr === '-' || timeStr.trim() === '') {
        return -1; // Put empty times at the end
    }
    
    // Handle time ranges (e.g., "08:00-10:00")
    if (timeStr.includes('-')) {
        const [start] = timeStr.split('-');
        timeStr = start.trim();
    }
    
    // Extract time from format like "08:00 AM" or "08:00"
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        
        // Handle AM/PM
        if (timeStr.toLowerCase().includes('pm') && hours !== 12) {
            hours += 12;
        } else if (timeStr.toLowerCase().includes('am') && hours === 12) {
            hours = 0;
        }
        
        return hours * 60 + minutes;
    }
    
    return 0; // Default for invalid times
}

// Helper function to convert date string to comparable format
function convertDateToComparable(dateStr) {
    if (!dateStr || dateStr === '-' || dateStr.trim() === '') {
        return new Date(0); // Put empty dates at the end
    }
    
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? new Date(0) : date;
}

document.querySelectorAll('th.sortable').forEach(header => {
    header.addEventListener('click', function() {
        const table = this.closest('table');
        const index = Array.from(this.parentNode.children).indexOf(this);
        const isAsc = this.classList.contains('sorted-asc');
        
        // Clear all sort classes
        table.querySelectorAll('th').forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
        });
        
        // Add sort class to clicked header
        this.classList.add(isAsc ? 'sorted-desc' : 'sorted-asc');
        
        const rows = Array.from(table.querySelectorAll('tbody tr:not(.empty-state)'));
        rows.sort((a, b) => {
            let aValue = a.cells[index].textContent.trim();
            let bValue = b.cells[index].textContent.trim();
            
            // Special handling for different column types
            if (index === 6) { // Impact Priority column (0-indexed)
                const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
                const aPriority = a.getAttribute('data-priority') || 'low';
                const bPriority = b.getAttribute('data-priority') || 'low';
                
                if (isAsc) {
                    return priorityOrder[bPriority] - priorityOrder[aPriority];
                } else {
                    return priorityOrder[aPriority] - priorityOrder[bPriority];
                }
            } else if (index === 1 || index === 4) { // Date columns (DATE and END DATE)
                // Convert dates to comparable format
                const aDate = convertDateToComparable(aValue);
                const bDate = convertDateToComparable(bValue);
                
                if (isAsc) {
                    return bDate - aDate;
                } else {
                    return aDate - bDate;
                }
            } else if (index === 2 || index === 3) { // Time columns (START TIME and END TIME)
                // Handle time sorting (convert to minutes for comparison)
                const aMinutes = convertTimeToMinutes(aValue);
                const bMinutes = convertTimeToMinutes(bValue);
                
                if (isAsc) {
                    return bMinutes - aMinutes;
                } else {
                    return aMinutes - bMinutes;
                }
            } else {
                // Default string comparison for Services and Comments
                if (isAsc) {
                    return bValue.localeCompare(aValue);
                } else {
                    return aValue.localeCompare(bValue);
                }
            }
        });
        
        const tbody = table.querySelector('tbody');
        rows.forEach(row => tbody.appendChild(row));
        
        // Apply row highlighting
        rows.forEach(row => applyRowHighlight(row));
        
        // Reapply active filter
        applyActiveFilter();
    });
});


function applyRowHighlight(row) {
    if (!row) return;
    
    row.classList.remove('highlight-row');
    
    void row.offsetWidth;
    
    row.classList.add('highlight-row');
    
    setTimeout(() => row.classList.remove('highlight-row'), 1500);
}

document.getElementById('addRow').addEventListener('click', function() {
    ensureAuthenticated(() => {
        const tbody = document.querySelector('tbody');
        const newRow = document.createElement('tr');
        newRow.setAttribute('data-priority', 'low');
        newRow.setAttribute('data-new', 'true');                           // mark as new row
        
        const emptyState = tbody.querySelector('.empty-state');
        if (emptyState) {
        tbody.removeChild(emptyState);
        }
        
        newRow.innerHTML = `
        <td contenteditable="true" class="editable"></td>
        <td contenteditable="true" class="editable"></td>
        <td contenteditable="true" class="editable"></td>
        <td contenteditable="true" class="editable"></td>
        <td contenteditable="true" class="editable"></td>
        <td contenteditable="true" class="editable"></td>
        <td class="impact-cell">
            <div class="impact-selector" data-value="low">
            <div class="impact-selector-inner">
                <div class="impact-option impact-option-low selected" data-value="low">
                <span class="impact-dot"></span> Low
                </div>
                <div class="impact-option impact-option-medium" data-value="medium">
                <span class="impact-dot"></span> Medium
                </div>
                <div class="impact-option impact-option-high" data-value="high">
                <span class="impact-dot"></span> High
                </div>
            </div>
            </div>
        </td>
        <td class="action-cell">
            <button class="table-btn edit-btn" title="Edit" style="display: none;"><i class="fas fa-edit"></i></button>
            <button class="table-btn save-btn" title="Save" style="display: inline-flex;"><i class="fas fa-save"></i></button>
            <button class="table-btn delete-btn" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
        `;
        tbody.appendChild(newRow);
        
        // Smooth scroll to the new row
        newRow.scrollIntoView({ behavior: 'smooth', block: 'center' });

        applyRowHighlight(newRow);

        initImpactSelector(newRow);
        
        applyActiveFilter();

        // Show notification for row creation
        createNotification('success', 'Row added successfully!');

        // Re-apply overlays if not authenticated
        if (!isAuthenticated()) disableRestrictedFeatures();
    }, "Please enter the passkey to add a new row");
});

function checkEmptyTable() {
    const tbody = document.querySelector('tbody');
    if (tbody.children.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.classList.add('empty-state');
        emptyRow.innerHTML = `
            <td colspan="6">
            <div class="empty-state-icon"><i class="fas fa-inbox"></i></div>
            <div class="empty-state-text">No changes found</div>
            <button class="btn primary-btn" id="emptyAddRow">
                <i class="fas fa-plus"></i> Add Row
            </button>
            </td>
        `;
        tbody.appendChild(emptyRow);
        
        document.getElementById('emptyAddRow').addEventListener('click', function(e) {
            // Prevent the table's click delegation from firing
            e.stopPropagation();
            e.preventDefault();
            document.getElementById('addRow').click();
        });
    }
}

document.querySelector('table').addEventListener('click', function(e) {
    ensureAuthenticated(() => {
        if (e.target.closest('.edit-btn')) {
            const row = e.target.closest('tr');
            const cells = row.getElementsByTagName('td');
            
            // First check if timezone conversion is active and turn it off
            const convertToggleBtn = document.getElementById('convertToggleBtn');
            if (convertToggleBtn && convertToggleBtn.checked) {
                // Turn off timezone conversion before editing
                convertToggleBtn.checked = false;
                conversionEnabled = false;
                toggleTimezoneConversion();
            }
            
            // Store original values and make cells editable
            for (let i = 0; i < cells.length - 1; i++) {
                if (i === cells.length - 2) { // Skip the impact-cell
                    continue;
                }
                cells[i].dataset.original = cells[i].textContent;
                cells[i].contentEditable = true;
                cells[i].classList.add('editable');
            }
            
            // Store original HTML for the impact-cell
            const impactCell = row.querySelector('.impact-cell');
            impactCell.dataset.original = impactCell.innerHTML;

            row.querySelector('.edit-btn').style.display = 'none';
            row.querySelector('.save-btn').style.display = 'inline-flex';

            // Add keydown listener for Escape key
            row.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    // Revert changes
                    for (let i = 0; i < cells.length - 1; i++) {
                        if (i === cells.length - 2) { // Skip the impact-cell
                            continue;
                        }
                        cells[i].textContent = cells[i].dataset.original;
                        cells[i].contentEditable = false;
                        cells[i].classList.remove('editable');
                    }
                    
                    // Revert impact-cell HTML
                    impactCell.innerHTML = impactCell.dataset.original;
                    initImpactSelector(row); // Re-initialize the impact selector

                    row.querySelector('.save-btn').style.display = 'none';
                    row.querySelector('.edit-btn').style.display = 'inline-flex';

                    // Remove keydown listener
                    row.removeEventListener('keydown', arguments.callee);
                }
            });
            
            // Add touch listener for Escape key on mobile
            document.addEventListener('touchstart', function(e) {
                if (row.contains(e.target) || !row.querySelector('.save-btn[style*="display: inline-flex;"]')) {
                    return; // Prevent touch event if the touch is inside the row or the row is not in edit mode
                }
                
                // Simulate Escape key press
                const escapeEvent = new KeyboardEvent('keydown', {
                    key: 'Escape',
                    code: 'Escape',
                    keyCode: 27,
                    which: 27,
                    bubbles: true,
                    cancelable: true
                });
                row.dispatchEvent(escapeEvent);
            });
        }

        if (e.target.closest('.save-btn')) {
            const row = e.target.closest('tr');
            const cells = row.getElementsByTagName('td');
            
            const startTimeCell = cells[2];
            const endTimeCell = cells[3];
            
            startTimeCell.dataset.original = startTimeCell.textContent;
            endTimeCell.dataset.original = endTimeCell.textContent;

            for (let i = 0; i < cells.length - 1; i++) {
                cells[i].contentEditable = false;
                cells[i].classList.remove('editable');
            }
            row.querySelector('.save-btn').style.display = 'none';
            row.querySelector('.edit-btn').style.display = 'inline-flex';
            
            applyRowHighlight(row);
            
            const rowData = {
                service: cells[0].textContent,
                date: cells[1].textContent,
                startTime: cells[2].textContent,
                endTime: cells[3].textContent,
                endDate: cells[4].textContent,
                comments: cells[5].textContent,
                impactPriority: row.querySelector('.impact-selector').getAttribute('data-value')
            };

            // More reliable way to determine if this is a newly created row or an edited existing row
            const isNewRow = !row.hasAttribute('data-edited');
            
            // Mark the row as edited
            row.setAttribute('data-edited', 'true');

            // Show appropriate notification and handle scrolling
            const isNew = row.hasAttribute('data-new');                   // check new‑row flag
            row.removeAttribute('data-new');                               // clear flag
            
            if (isNew) {
                createNotification('success', 'Row creation successful!');
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                createNotification('success', 'Data updated successfully!');
            }
        }

        if (e.target.closest('.delete-btn')) {
            rowToDelete = e.target.closest('tr');
            
            // Show custom confirmation dialog
            createConfirmDialog({
                type: 'danger',
                icon: 'fa-trash',
                title: 'Delete Row',
                message: 'Are you sure you want to delete this row? This action cannot be undone.',
                confirmText: 'Delete',
                cancelText: 'Cancel'
            }).then(confirmed => {
                if (confirmed) {
                    // Proceed with deletion
                    if (rowToDelete) {
                        rowToDelete.style.opacity = '0';
                        rowToDelete.style.transform = 'translateX(20px)';
                        setTimeout(() => {
                            // Only mark as unsaved if the row is not empty
                            if (window.ChangeTracker) {
                                // Check if row is empty before marking as unsaved
                                const isEmpty = window.ChangeTracker.isEmptyRow(rowToDelete);
                                const isUnsavedNew = window.ChangeTracker.isUnsavedNewRow(rowToDelete);
                                
                                // Only mark as unsaved if the row had actual content
                                if (!isEmpty && !isUnsavedNew) {
                                    ChangeTracker.markUnsaved();
                                }
                            }
                            
                            rowToDelete.remove();
                            checkEmptyTable();
                            
                            // Reset counter if the table is now empty
                            const tableRows = document.querySelectorAll('#changeTable tbody tr:not(.empty-state)');
                            if (tableRows.length === 0 && window.ChangeTracker) {
                                ChangeTracker.resetCounter();
                            }
                            
                            rowToDelete = null;

                            // Show notification for row deletion
                            setTimeout(() => {
                                createNotification('success', 'Row deleted successfully!');
                            }, 300);
                        }, 300);
                    }
                } else {
                    // Deletion cancelled
                    rowToDelete = null;
                }
            });
        }
    }, "Please enter the passkey to edit or delete data");
});

document.addEventListener('DOMContentLoaded', function() {
    checkEmptyTable();

    const rows = document.querySelectorAll('#changeTable tbody tr');
    rows.forEach(row => initImpactSelector(row));
    
    const allFilterBtn = document.querySelector('.filter-btn[data-filter="all"]');
    if (allFilterBtn) {
    allFilterBtn.classList.add('active');
    }

    document.querySelector('.filter-controls').addEventListener('click', function(e) {
    const filterBtn = e.target.closest('.filter-btn');
    if (filterBtn) {
        document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        });
        filterBtn.classList.add('active');
        
        applyActiveFilter();
    }
    });
});


function initImpactSelector(row) {
    if (!row) return;

    const impactOptions = row.querySelectorAll('.impact-option');
    const selector = row.querySelector('.impact-selector');
    const innerContainer = selector?.querySelector('.impact-selector-inner');
    
    if (!impactOptions.length || !selector || !innerContainer) return;
    
    impactOptions.forEach(option => {
    option.addEventListener('click', function() {
        const tr = this.closest('tr');
        if (!tr) return;
        
        const priority = this.getAttribute('data-value');
        
        impactOptions.forEach(opt => opt.classList.remove('selected'));
        this.classList.add('selected');
        
        selector.setAttribute('data-value', priority);
        tr.setAttribute('data-priority', priority);
        
        this.style.animation = 'none';
        setTimeout(() => {
        this.style.animation = 'impactPulse 0.8s ease-in-out';
        }, 100);
        
        applyActiveFilter();
    });
    });
}

function applyActiveFilter() {
    const activeFilter = document.querySelector('.filter-btn.active');
    const filterValue = activeFilter ? activeFilter.getAttribute('data-filter') : 'all';
    const rows = document.querySelectorAll('#changeTable tbody tr:not(.empty-state)');
    
    
    rows.forEach(row => {
    const priority = row.getAttribute('data-priority');
    if (filterValue === 'all' || priority === filterValue) {
        row.style.display = '';
    } else {
        row.style.display = 'none';
    }
    });
}



const tzControl = document.getElementById('tzControl');
const fromTzSelect = document.getElementById('fromTimezone');
const toTzSelect = document.getElementById('toTimezone');

// Fixed timezone conversion function
function convertTimezone(timeStr, dateStr, fromTz, toTz) {
    try {
        // Handle special cases
        if (!timeStr || timeStr === "-" || timeStr.trim() === "") {
            return "-";
        }

        // Handle time ranges (e.g., "08:00-10:00" or "08:00 - 10:00")
        if (timeStr.includes('-')) {
            const [start, end] = timeStr.split('-');
            const convertedStart = convertTimezone(start.trim(), dateStr, fromTz, toTz);
            const convertedEnd = end.trim() ? convertTimezone(end.trim(), dateStr, fromTz, toTz) : "-";
            return `${convertedStart} - ${convertedEnd}`;
        }

        // If only a time is provided, prepend the date
        let dateTimeStr = timeStr;
        if (/^\d{1,2}:\d{2}$/.test(timeStr.trim())) {
            // If dateStr is missing or invalid, use today
            let datePart = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())
                ? dateStr.trim()
                : new Date().toISOString().slice(0, 10);
            dateTimeStr = `${datePart} ${timeStr.trim()}`;
        } else {
            dateTimeStr = `${dateStr} ${timeStr}`;
        }

        // Parse the DateTime object using the 24-hour format
        const dt = DateTime.fromFormat(dateTimeStr, 'yyyy-MM-dd HH:mm', {
            zone: fromTz
        });

        if (!dt.isValid) {
            console.error('Invalid date/time:', timeStr, dateStr, dt.invalidReason, dt.invalidExplanation);
            return 'Invalid time';
        }

        // Convert to target timezone and format as 12-hour time with AM/PM
        const convertedTime = dt.setZone(toTz);
        return convertedTime.toFormat('hh:mm a');
    } catch (e) {
        console.error('Error converting time:', e, 'for time:', timeStr, 'date:', dateStr);
        return 'Invalid time';
    }
}

// Updated handler for timezone conversion to ensure proper values are passed
function handleTimezoneChange() {
    const fromTzSelect = document.getElementById('fromTimezone');
    const toTzSelect = document.getElementById('toTimezone');
    
    if (!fromTzSelect || !toTzSelect) return;
    
    const timeColumns = document.querySelectorAll('.time-column');
    const warning = document.querySelector('.time-conversion-warning');
    
    const fromTz = fromTzSelect.value;
    const toTz = toTzSelect.value;
    
    // Get user-friendly timezone names for display
    const fromTzLabel = fromTzSelect.options[fromTzSelect.selectedIndex].text;
    const toTzLabel = toTzSelect.options[toTzSelect.selectedIndex].text;
    
    if (fromTz !== toTz) {
        // Show converted timezone in column headers
        if (timeColumns[0]) timeColumns[0].innerHTML = `Start Time<span class="time-zone">(${toTzLabel})</span>`;
        if (timeColumns[1]) timeColumns[1].innerHTML = `End Time<span class="time-zone">(${toTzLabel})</span>`;
        if (warning) warning.style.display = 'flex';
    } else {
        // Show original timezone in column headers
        if (timeColumns[0]) timeColumns[0].innerHTML = `Start Time<span class="time-zone">(${fromTzLabel})</span>`;
        if (timeColumns[1]) timeColumns[1].innerHTML = `End Time<span class="time-zone">(${fromTzLabel})</span>`;
        if (warning) warning.style.display = 'none';
    }

    // Convert the times in each table row
    const rows = document.querySelectorAll('#changeTable tbody tr');
    
    // Get the date from the first row, or use fallback
    let dateStr;
    if (rows.length > 0) {
        const dateCell = rows[0].querySelector('td:nth-child(2)');
        dateStr = dateCell ? dateCell.textContent : '';
    }
    
    if (!dateStr) dateStr = '2023-01-01'; // Fallback date if none is found
    
    rows.forEach(row => {
        const startTimeCell = row.querySelector('td:nth-child(3)');
        const endTimeCell = row.querySelector('td:nth-child(4)');
        
        if (startTimeCell && endTimeCell) {
            if (fromTz !== toTz) {
                // Save original values if not already saved
                if (!startTimeCell.dataset.original) {
                    startTimeCell.dataset.original = startTimeCell.textContent;
                }
                if (!endTimeCell.dataset.original) {
                    endTimeCell.dataset.original = endTimeCell.textContent;
                }
                
                // Convert times
                const startTimeConverted = convertTimezone(startTimeCell.dataset.original, dateStr, fromTz, toTz);
                const endTimeConverted = convertTimezone(endTimeCell.dataset.original, dateStr, fromTz, toTz);
                
                startTimeCell.textContent = startTimeConverted;
                endTimeCell.textContent = endTimeConverted;
            } else {
                // Restore original times
                if (startTimeCell.dataset.original) {
                    startTimeCell.textContent = startTimeCell.dataset.original;
                }
                if (endTimeCell.dataset.original) {
                    endTimeCell.textContent = endTimeCell.dataset.original;
                }
            }
        }
    });
}

// Function to populate timezone dropdowns with common options
function populateTimezoneSelectors() {
    const fromTzSelect = document.getElementById('fromTimezone');
    const toTzSelect = document.getElementById('toTimezone');
    
    if (!fromTzSelect || !toTzSelect) return;
    
    const commonTimezones = [
        { value: 'Europe/Stockholm', label: 'Stockholm (CET/CEST)' },
        { value: 'Asia/Kolkata', label: 'India (IST)' },
        { value: 'UTC', label: 'UTC' },
        { value: 'America/New_York', label: 'New York (EST/EDT)' },
        { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
        { value: 'Europe/London', label: 'London (GMT/BST)' },
        { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
        { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
        { value: 'Asia/Dubai', label: 'Dubai (GST)' },
        { value: 'Asia/Singapore', label: 'Singapore (SGT)' }
    ];
    
    // Clear existing options
    fromTzSelect.innerHTML = '';
    toTzSelect.innerHTML = '';
    
    // Add new options
    commonTimezones.forEach(tz => {
        const fromOption = new Option(tz.label, tz.value);
        const toOption = new Option(tz.label, tz.value);
        
        fromTzSelect.add(fromOption);
        toTzSelect.add(toOption);
    });
    
    // Set default values - Sweden to IST to maintain backward compatibility
    fromTzSelect.value = 'Europe/Stockholm';
    toTzSelect.value = 'Asia/Kolkata';
}

// Global flag for conversion state remains unchanged
let conversionEnabled = false;

document.addEventListener('DOMContentLoaded', function() {
    // ...existing code...
    
    // Initialize timezone selectors
    populateTimezoneSelectors();
    
    // Replace the button click with a checkbox change event listener
    const convertToggleBtn = document.getElementById('convertToggleBtn');
    if (convertToggleBtn) {
        convertToggleBtn.addEventListener('change', () => {
            conversionEnabled = convertToggleBtn.checked;
            toggleTimezoneConversion();
        });
    }
    
    // ...existing code...
});

document.addEventListener('DOMContentLoaded', function() {
    // ...existing code...

    // Reset timezone conversion toggle when timezone selectors change
    const fromTzSelect = document.getElementById('fromTimezone');
    const toTzSelect   = document.getElementById('toTimezone');
    const convertToggleBtn = document.getElementById('convertToggleBtn');
    if (fromTzSelect && toTzSelect && convertToggleBtn) {
        [fromTzSelect, toTzSelect].forEach(select => {
            select.addEventListener('change', () => {
                if (convertToggleBtn.checked) {
                    convertToggleBtn.checked = false;
                    conversionEnabled = false;
                    toggleTimezoneConversion();
                }
            });
        });
    }

    // ...existing code...
});

// Existing toggleTimezoneConversion function remains unchanged
function toggleTimezoneConversion() {
    const fromTzSelect = document.getElementById('fromTimezone');
    const timeColumns = document.querySelectorAll('.time-column');
    if (conversionEnabled) {
        // Apply conversion using the existing handler
        handleTimezoneChange();
    } else {
        // Revert header labels to show the "From" timezone
        const fromTzLabel = fromTzSelect.options[fromTzSelect.selectedIndex].text;
        if (timeColumns[0]) {
            timeColumns[0].innerHTML = `Start Time<span class="time-zone">(${fromTzLabel})</span>`;
        }
        if (timeColumns[1]) {
            timeColumns[1].innerHTML = `End Time<span class="time-zone">(${fromTzLabel})</span>`;
        }
        // Restore original times from data attributes
        const rows = document.querySelectorAll('#changeTable tbody tr');
        rows.forEach(row => {
            const startTimeCell = row.querySelector('td:nth-child(3)');
            const endTimeCell = row.querySelector('td:nth-child(4)');
            if (startTimeCell && startTimeCell.dataset.original) {
                startTimeCell.textContent = startTimeCell.dataset.original;
            }
            if (endTimeCell && endTimeCell.dataset.original) {
                endTimeCell.textContent = endTimeCell.dataset.original;
            }
        });
    }
}

// Initialize timezone selectors and add event listeners
document.addEventListener('DOMContentLoaded', function() {
    // ...existing code...
    
    // Initialize timezone selectors
    populateTimezoneSelectors();
    
    // Remove automatic conversion on dropdown change:
    // const fromTzSelect = document.getElementById('fromTimezone');
    // const toTzSelect = document.getElementById('toTimezone');
    // if (fromTzSelect) { fromTzSelect.addEventListener('change', handleTimezoneChange); }
    // if (toTzSelect) { toTzSelect.addEventListener('change', handleTimezoneChange); }
    
    // Instead, add a manual conversion trigger via a toggle button:
    const convertToggleBtn = document.getElementById('convertToggleBtn');
    if (convertToggleBtn) {
        convertToggleBtn.addEventListener('click', handleTimezoneChange);
    }
    
    // ...existing code...
});

document.getElementById('copyEmail').addEventListener('click', function() {
    const textToCopy = document.getElementById('emailBody').textContent;
    navigator.clipboard.writeText(textToCopy)
    .then(() => alert('Email content copied to clipboard!'));
});

document.getElementById('downloadText').addEventListener('click', function() {
    const text = document.getElementById('emailBody').textContent;
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'email_content.txt';
    a.click();
});

document.getElementById('toggleWordWrap').addEventListener('click', function() {
    const emailBody = document.getElementById('emailBody');
    emailBody.style.whiteSpace = 
    emailBody.style.whiteSpace === 'pre' ? 'pre-wrap' : 'pre';
});

let fontSize = 14;
document.getElementById('increaseFontSize').addEventListener('click', function() {
    fontSize = Math.min(fontSize + 2, 24);
    document.getElementById('emailBody').style.fontSize = `${fontSize}px`;
});

document.getElementById('decreaseFontSize').addEventListener('click', function() {
    fontSize = Math.max(fontSize - 2, 10);
    document.getElementById('emailBody').style.fontSize = `${fontSize}px`;
});

// Removed How It Works modal and button handlers

document.getElementById('downloadHtml').addEventListener('click', function() {
    const styleSheets = Array.from(document.styleSheets);
    let styles = '';
    styleSheets.forEach(sheet => {
    try {
        Array.from(sheet.cssRules).forEach(rule => {
        styles += rule.cssText;
        });
    } catch (e) {
        // Could not read stylesheet
    }
    });

    let tableBody = '';
    document.querySelectorAll('#changeTable tbody tr:not(.empty-state):not([style*="display: none"])').forEach(row => {
    const cells = row.cells;
    const priority = row.getAttribute('data-priority');
    
    if (cells.length >= 6) {
        tableBody += `
        <tr>
        <td>${cells[0].textContent}</td>
        <td>${cells[1].textContent}</td>
        <td>${cells[2].textContent}</td>
        <td>${cells[3].textContent}</td>
        <td>${cells[4].textContent}</td>
        <td>${cells[5].textContent}</td>
        <td>
            <div class="priority-badge priority-badge-${priority}">
            <span class="filter-indicator filter-${priority}"></span>
            ${priority.charAt(0).toUpperCase() + priority.slice(1)}
            </div>
        </td>
        </tr>`;
    }
    });

    const tableHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Change Management Table</title>
<style>
${styles}
</style>
</head>
<body>
<div class="container">
<table id="changeTable">
    <thead>
        <tr>
            <th>
                Affected Service/Servers
                <span class="policy-icon">i</span>
                <span class="policy-tooltip">
                    Company Policy: This document is confidential and should only be shared with authorized personnel.
                    Changes must be approved through proper channels before implementation.
                </span>
            </th>
            <th>Date</th>
            <th>Start Time-IST</th>
            <th>End Time-IST</th>
            <th>End Date</th>
            <th>Comments</th>
            <th>Impact Priority</th>
        </tr>
    </thead>
    <tbody>
        ${tableBody}
    </tbody>
</table>
</div>
</body>
</html>`;

    const blob = new Blob([tableHtml], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'change_management.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

const headerTitle = document.getElementById('headerTitle');
const editHeaderBtn = document.getElementById('editHeaderBtn');
const saveHeaderBtn = document.getElementById('saveHeaderBtn');

editHeaderBtn.addEventListener('click', function() {
    ensureAuthenticated(() => {
        // Store the original title for change tracking
        if (window.ChangeTracker) {
            window.ChangeTracker.originalTitle = headerTitle.textContent.trim();
        }
        
        headerTitle.contentEditable = true;
        headerTitle.classList.add('editable');
        headerTitle.focus();
        // Move caret to end
        const range = document.createRange();
        range.selectNodeContents(headerTitle);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        editHeaderBtn.style.display = 'none';
        saveHeaderBtn.style.display = 'flex';
    }, "Please enter the passkey to edit title");
});

saveHeaderBtn.addEventListener('click', function() {
    // Get the new title after save
    const newTitle = headerTitle.textContent.trim();
    
    // Check if title has changed and update change tracker
    if (window.ChangeTracker && window.ChangeTracker.originalTitle !== undefined) {
        if (window.ChangeTracker.originalTitle !== newTitle) {
            window.ChangeTracker.markUnsaved();
        }
        // Clear the stored original title
        window.ChangeTracker.originalTitle = undefined;
    }
    
    headerTitle.contentEditable = false;
    headerTitle.classList.remove('editable');
    editHeaderBtn.style.display = 'flex';
    saveHeaderBtn.style.display = 'none';
});

headerTitle.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        saveHeaderBtn.click();
    } else if (e.key === 'Escape') {
        // Restore the original title on escape
        if (window.ChangeTracker && window.ChangeTracker.originalTitle !== undefined) {
            headerTitle.textContent = window.ChangeTracker.originalTitle;
            // Clear the stored original title since we're canceling
            window.ChangeTracker.originalTitle = undefined;
        }
        
        headerTitle.contentEditable = false;
        headerTitle.classList.remove('editable');
        editHeaderBtn.style.display = 'flex';
        saveHeaderBtn.style.display = 'none';
    }
});

function showLoading() {
    const overlay = document.querySelector('.loading-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
    }
}

function hideLoading() {
    document.querySelector('.loading-overlay').style.display = 'none';
}

function showError(message) {
    const toast = document.getElementById('errorToast');
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
    toast.style.display = 'none';
    }, 5000);
}



document.addEventListener('DOMContentLoaded', function() {
    initializeFileUpload();
    
    const rows = document.querySelectorAll('#changeTable tbody tr');
    if (rows) {
    rows.forEach(row => initImpactSelector(row));
    }
    
    const allFilterBtn = document.querySelector('.filter-btn[data-filter="all"]');
    if (allFilterBtn) {
    allFilterBtn.classList.add('active');
    }
    
    checkEmptyTable();
});

function initializeFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const uploadForm = document.getElementById('uploadForm');
    const loadingOverlay = document.querySelector('.loading-overlay');
    
    if (fileInput && uploadForm) {
        fileInput.addEventListener('change', function(e) {
            if (this.files.length > 0) {
                const file = this.files[0];
                if (!file.name.toLowerCase().endsWith('.msg')) {
                    showError('Please upload a .MSG file');
                    return;
                }
                createNotification('info', 'Your file is being processed, please wait...', true); // Use persistent notification
                
                // Show loading state
                if (loadingOverlay) {
                    loadingOverlay.style.display = 'flex';
                } else {
                    showLoading(); // Fallback to the showLoading function if overlay doesn't exist
                }
                
                uploadForm.submit();
            }
        });
    }
}
// New: update hidden input when AI processing checkbox toggles
const useAiCheckbox = document.getElementById('useAiProcessing');
if (useAiCheckbox) {
    useAiCheckbox.addEventListener('change', function() {
        document.getElementById('useAiInput').value = this.checked;
        if (this.checked) {
            createNotification('success', 'AI processing enabled');
        } else {
            createNotification('info', 'Standard processing selected');
        }
    });
}
document.addEventListener('DOMContentLoaded', function() {
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadModal = document.getElementById('uploadModal');
    const uploadZone = document.getElementById('uploadZone');
    const uploadPreview = document.getElementById('uploadPreview');
    const cancelUpload = document.getElementById('cancelUpload');
    const fileInput = document.getElementById('fileInput');

    uploadBtn.addEventListener('click', () => {
        ensureAuthenticated(() => {
            uploadModal.style.display = 'flex';
            uploadZone.style.display = 'flex';
        }, "Please enter the passkey to upload a file");
    });

    cancelUpload.addEventListener('click', () => {
        uploadModal.style.display = 'none';
        uploadPreview.style.display = 'none';
        uploadZone.classList.remove('drag-over');
    });


    uploadZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.classList.add('drag-over');
    });

    uploadZone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.classList.remove('drag-over');
    });

    uploadZone.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            
            if (!file.name.toLowerCase().endsWith('.msg')) {
                alert('Please upload a .MSG file');
                return;
            }
            
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            
            uploadPreview.style.display = 'flex';
            uploadPreview.querySelector('.file-name').textContent = file.name;
            
            const progressBar = uploadPreview.querySelector('.upload-progress-bar');
            let progress = 0;
            const interval = setInterval(() => {
                progress += 10;
                progressBar.style.width = `${progress}%`;
                if (progress >= 100) {
                    clearInterval(interval);
                    
                    // Set the value of the hidden input based on the toggle state
                    const useAiCheckbox = document.getElementById('useAiProcessing');
                    document.getElementById('useAiInput').value = useAiCheckbox.checked;
                    
                    document.getElementById('uploadForm').submit();
                }
            }, 100);
        }
    });

    uploadZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            if (!file.name.toLowerCase().endsWith('.msg')) {
                alert('Please upload a .MSG file');
                return;
            }

            uploadPreview.style.display = 'flex';
            uploadPreview.querySelector('.file-name').textContent = file.name;

            const progressBar = uploadPreview.querySelector('.upload-progress-bar');
            let progress = 0;
            const interval = setInterval(() => {
                progress += 10;
                progressBar.style.width = `${progress}%`;
                if (progress >= 100) {
                    clearInterval(interval);
                    
                    // Set the value of the hidden input based on the toggle state
                    const useAiCheckbox = document.getElementById('useAiProcessing');
                    document.getElementById('useAiInput').value = useAiCheckbox.checked;
                    
                    document.getElementById('uploadForm').submit();
                }
            }, 100);
        }
    });
    // Add event listener for clicks outside the modal
    window.addEventListener('click', function(event) {
        if (event.target == uploadModal) {
            uploadModal.style.display = 'none';
            uploadPreview.style.display = 'none';
            uploadZone.classList.remove('drag-over');
        }
    });

    // Add event listener for Escape key
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && uploadModal.style.display === 'flex') {
            uploadModal.style.display = 'none';
            uploadPreview.style.display = 'none';
            uploadZone.classList.remove('drag-over');
        }
    });

    // Add event listener for touches outside the modal for mobile devices
    window.addEventListener('touchstart', function(event) {
        if (event.target == uploadModal) {
            uploadModal.style.display = 'none';
            uploadPreview.style.display = 'none';
            uploadZone.classList.remove('drag-over');
        }
    });
});

document.addEventListener('DOMContentLoaded', function() {
    const themeToggle = document.getElementById('themeToggle');
    const icon = themeToggle.querySelector('i');
    
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
    
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    });
    
    function updateThemeIcon(theme) {
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
});

document.getElementById('resetForm').addEventListener('click', function() {
    if (confirm('Are you sure you want to reset the form? This will clear all data.')) {
        window.location.href = '/';
    }
});

document.addEventListener('DOMContentLoaded', function() {
// Existing initialization code...

// New email comparison functionality
const toggleLayoutBtn = document.getElementById('toggleLayout');
const highlightDataBtn = document.getElementById('highlightData');
const searchBtn = document.getElementById('searchBtn');
const emailSearch = document.getElementById('emailSearch');
const searchResults = document.getElementById('searchResults');
const emailBody = document.getElementById('emailBody');
const parsedDataRows = document.querySelectorAll('#parsedDataBody tr');

// New edit functionality
const editDataBtn = document.getElementById('editDataBtn');
const saveDataBtn = document.getElementById('saveDataBtn');
let isEditing = false;

// Toggle edit mode for the parsed data table
editDataBtn.addEventListener('click', function() {
ensureAuthenticated(() => {
isEditing = true;
editDataBtn.style.display = 'none';
saveDataBtn.style.display = 'inline-flex';

// Make all cells in the parsed data table editable
const cells = document.querySelectorAll('#parsedDataBody td');
cells.forEach(cell => {
cell.contentEditable = true;
cell.classList.add('editable');
});

// Add a new row button to the parsed data table
const parsedDataContainer = document.querySelector('.parsed-data-container');
if (!document.getElementById('addParsedRow')) {
const addRowBtn = document.createElement('button');
addRowBtn.id = 'addParsedRow';
addRowBtn.className = 'btn success-btn';
addRowBtn.innerHTML = '<i class="fas fa-plus"></i> Add Row';
addRowBtn.style.margin = '10px 0';

addRowBtn.addEventListener('click', function() {
const tbody = document.getElementById('parsedDataBody');
const newRow = document.createElement('tr');
newRow.setAttribute('data-service', '');
newRow.innerHTML = `
  <td contenteditable="true" class="editable"></td>
  <td contenteditable="true" class="editable"></td>
  <td contenteditable="true" class="editable"></td>
  <td contenteditable="true" class="editable"></td>
`;
tbody.appendChild(newRow);
});

parsedDataContainer.insertBefore(addRowBtn, parsedDataContainer.firstChild);
}
}, "Please enter the passkey to edit parsed data");
});

// Save changes from the parsed data table to the main table
saveDataBtn.addEventListener('click', function() {
    isEditing = false;
    editDataBtn.style.display = 'inline-flex';
    saveDataBtn.style.display = 'none';
    
    // Remove the editable state from all cells
    const cells = document.querySelectorAll('#parsedDataBody td');
    cells.forEach(cell => {
        cell.contentEditable = false;
        cell.classList.remove('editable');
    });
    
    // Remove the add row button
    const addRowBtn = document.getElementById('addParsedRow');
    if (addRowBtn) {
        addRowBtn.parentNode.removeChild(addRowBtn);
    }
    
    // Create loading indicator
    const loadingEl = document.createElement('div');
    loadingEl.className = 'sync-loading';
    loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving changes locally...';
    loadingEl.style = 'position:fixed; top:20px; right:20px; background:var(--primary-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
    document.body.appendChild(loadingEl);
    
    // Short timeout to show loading indicator
    setTimeout(() => {
        document.body.removeChild(loadingEl);
        
        // Update the main table with the edited data
        updateMainTableFromParsedData();
        
        // Use createNotification for success message
        createNotification('success', 'Changes saved locally!');
        
        // Show sync reminder notification after a short delay
        setTimeout(() => {
            createNotification('info', 'Remember to click "Sync" to update changes across devices');
        }, 3000);
    }, 1000);
});



// Function to update the main table with data from the parsed data table
function updateMainTableFromParsedData() {
const parsedRows = document.querySelectorAll('#parsedDataBody tr');
const mainTableBody = document.querySelector('#changeTable tbody');

// Clear the main table
mainTableBody.innerHTML = '';

// Add rows from the parsed data table to the main table
parsedRows.forEach(parsedRow => {
if (parsedRow.cells[0].textContent.trim() === '') return; // Skip empty rows

const serviceName = parsedRow.cells[0].textContent;
const date = parsedRow.cells[1].textContent;

// Parse time range (e.g., "09:00 - 11:00" to start and end times)
let startTime = '';
let endTime = '';
const timeRange = parsedRow.cells[2].textContent;

// First check if timeRange is just a hyphen
if (timeRange.trim() === '-') {
startTime = '-';
endTime = '-';
} else if (timeRange.includes('-')) {
const timeParts = timeRange.split('-');
startTime = timeParts[0].trim();
endTime = timeParts[1].trim();

// If start time is empty, use "-" instead of empty string
if (startTime === '') {
startTime = '-';
}

// If end time is empty but there was a hyphen, use "-" instead of empty string
if (endTime === '') {
endTime = '-';
}
} else if (timeRange.trim() === '') {
// If timeRange is empty, use hyphens for both
startTime = '-';
endTime = '-';
} else {
startTime = timeRange.trim();
// If only start time is provided, set end time to hyphen
endTime = '-';
}

const comments = parsedRow.cells[3].textContent;

// Get priority from the original row if available, otherwise default to low
const originalRow = Array.from(document.querySelectorAll('#changeTable tbody tr')).find(r => 
r.querySelector('td').textContent === serviceName
);
const priority = originalRow ? originalRow.getAttribute('data-priority') : 'low';

// Create a new row for the main table
const newRow = document.createElement('tr');
newRow.setAttribute('data-priority', priority);

newRow.innerHTML = `
<td>${serviceName}</td>
<td>${date}</td>
<td data-original="${startTime}">${startTime}</td>
<td data-original="${endTime}">${endTime}</td>
<td>${date}</td>
<td>${comments}</td>
<td class="impact-cell">
<div class="impact-selector" data-value="${priority}">
  <div class="impact-selector-inner">
    <div class="impact-option impact-option-low ${priority === 'low' ? 'selected' : ''}" data-value="low">
      <span class="impact-dot"></span> Low
    </div>
    <div class="impact-option impact-option-medium ${priority === 'medium' ? 'selected' : ''}" data-value="medium">
      <span class="impact-dot"></span> Medium
    </div>
    <div class="impact-option impact-option-high ${priority === 'high' ? 'selected' : ''}" data-value="high">
      <span class="impact-dot"></span> High
    </div>
  </div>
</div>
</td>
<td class="action-cell">
<button class="table-btn edit-btn" title="Edit"><i class="fas fa-edit"></i></button>
<button class="table-btn save-btn" style="display: none;" title="Save"><i class="fas fa-save"></i></button>
<button class="table-btn delete-btn" title="Delete"><i class="fas fa-trash"></i></button>
</td>
`;

mainTableBody.appendChild(newRow);
initImpactSelector(newRow);
});

// If timezone toggle is checked, convert times - FIX: Safely check if element exists
const tzToggle = document.getElementById('tzToggle');
if (tzToggle && tzToggle.checked) {
    tzToggle.dispatchEvent(new Event('change'));
} else {
    // Try convertToggleBtn as an alternative if that's what's actually in the DOM
    const convertToggleBtn = document.getElementById('convertToggleBtn');
    if (convertToggleBtn && convertToggleBtn.checked) {
        convertToggleBtn.dispatchEvent(new Event('change'));
    }
}

// Apply active filter
applyActiveFilter();

// Check if table is empty
checkEmptyTable();

// Re-apply overlays if not authenticated
if (!isAuthenticated()) disableRestrictedFeatures();
}

// When a row in the parsed data table is clicked in edit mode
document.querySelector('.parsed-data-table').addEventListener('click', function(e) {
if (!isEditing) return;

const cell = e.target.closest('td');
if (cell) {
// Add delete button if it doesn't exist
const row = cell.parentNode;
if (!row.querySelector('.delete-parsed-row')) {
const deleteBtn = document.createElement('button');
deleteBtn.className = 'delete-parsed-row';
deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
deleteBtn.style.position = 'absolute';
deleteBtn.style.right = '-25px';
deleteBtn.style.top = '50%';
deleteBtn.style.transform = 'translateY(-50%)';
deleteBtn.style.background = 'var(--danger-color)';
deleteBtn.style.color = 'white';
deleteBtn.style.border = 'none';
deleteBtn.style.borderRadius = '50%';
deleteBtn.style.width = '20px';
deleteBtn.style.height = '20px';
deleteBtn.style.display = 'flex';
deleteBtn.style.alignItems = 'center';
deleteBtn.style.justifyContent = 'center';
deleteBtn.style.cursor = 'pointer';

deleteBtn.addEventListener('click', function() {
  if (confirm('Delete this row?')) {
    row.remove();
  }
});

row.style.position = 'relative';
row.appendChild(deleteBtn);
}
}
});

let isHighlighted = false;

// Toggle between side-by-side and stacked layout
toggleLayoutBtn.addEventListener('click', function() {
ensureAuthenticated(() => {
const modalContent = document.querySelector('.modal-content');
modalContent.classList.toggle('layout-stacked');
}, "Please enter the passkey to change comparison layout");
});

// Highlight data in the email content
highlightDataBtn.addEventListener('click', function() {
isHighlighted = !isHighlighted;

if (isHighlighted) {
highlightDataBtn.classList.add('active');
highlightEmailContent();
} else {
highlightDataBtn.classList.remove('active');
resetEmailHighlights();
}
});

// Search functionality
searchBtn.addEventListener('click', performSearch);
emailSearch.addEventListener('keypress', function(e) {
if (e.key === 'Enter') {
performSearch();
}
});

// Add this event delegation after the definition of isHighlighted:
document.querySelector('.parsed-data-table').addEventListener('mouseover', function(e) {
    const row = e.target.closest('tr');
    if (!row || !row.parentElement || row.parentElement.id !== 'parsedDataBody') return;
    // Don't interfere with edit mode delete buttons, etc.
    if (isEditing) return;
    const serviceName = row.getAttribute('data-service');
    highlightServiceInEmail(serviceName);
    row.classList.add('highlight-row');
});
document.querySelector('.parsed-data-table').addEventListener('mouseout', function(e) {
    const row = e.target.closest('tr');
    if (!row || !row.parentElement || row.parentElement.id !== 'parsedDataBody') return;
    if (!isHighlighted) resetEmailHighlights();
    row.classList.remove('highlight-row');
});

function highlightEmailContent() {
let emailContent = emailBody.innerHTML;

// Extract data from table
const services = Array.from(parsedDataRows).map(row => {
return {
name: row.cells[0].textContent,
date: row.cells[1].textContent,
time: row.cells[2].textContent
};
});

// First, escape the content to prevent HTML injection
emailContent = escapeHtml(emailBody.textContent);

// Highlight dates
const datePattern = /\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/g;
emailContent = emailContent.replace(datePattern, '<span class="highlight-date">$&</span>');

// Highlight times
const timePattern = /\b([0-1]?[0-9]|2[0-3])[:][0-5][0-9](\s*-\s*([0-1]?[0-9]|2[0-3])[:][0-5][0-9])?\b/g;
emailContent = emailContent.replace(timePattern, '<span class="highlight-time">$&</span>');

// Highlight service names
services.forEach(service => {
if (service.name.trim()) {
const nameRegex = new RegExp('\\b' + escapeRegExp(service.name.trim()) + '\\b', 'gi');
emailContent = emailContent.replace(nameRegex, '<span class="highlight-service">$&</span>');
}
});

emailBody.innerHTML = emailContent;
}

function resetEmailHighlights() {
emailBody.innerHTML = escapeHtml(emailBody.textContent);
}

function highlightServiceInEmail(serviceName) {
if (!serviceName.trim()) return;

let content = emailBody.textContent;
const nameRegex = new RegExp('\\b' + escapeRegExp(serviceName.trim()) + '\\b', 'gi');

if (content.match(nameRegex)) {
content = escapeHtml(content);
content = content.replace(nameRegex, '<span class="highlight-match">$&</span>');
emailBody.innerHTML = content;

// Scroll to the first match
const firstMatch = emailBody.querySelector('.highlight-match');
if (firstMatch) {
firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
}
}

function performSearch() {
const searchTerm = emailSearch.value.trim();
if (!searchTerm) return;

let content = emailBody.textContent;
const regex = new RegExp(escapeRegExp(searchTerm), 'gi');
const matches = content.match(regex);

if (matches && matches.length > 0) {
searchResults.textContent = `${matches.length} matches found`;

content = escapeHtml(content);
content = content.replace(regex, '<span class="highlight-match">$&</span>');
emailBody.innerHTML = content;

// Scroll to the first match
const firstMatch = emailBody.querySelector('.highlight-match');
if (firstMatch) {
firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
} else {
searchResults.textContent = 'No matches found';
}
}

// Helper functions
function escapeHtml(unsafe) {
return unsafe
.replace(/&/g, "&amp;")
.replace(/</g, "&lt;")
.replace(/>/g, "&gt;")
.replace(/"/g, "&quot;")
.replace(/'/g, "&#039;");
}

function escapeRegExp(string) {
return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
});


document.getElementById('resetForm').addEventListener('click', function() {
if (confirm('Are you sure you want to reset the form? This will clear all data.')) {
fetch('/reset-data', {
method: 'POST',
headers: {
'Content-Type': 'application/json'
},
body: JSON.stringify({})
})
.then(response => response.json())
.then(data => {
window.location.href = '/';
})
.catch(error => {
console.error('Error:', error);
window.location.href = '/';
});
}
});

// Add this function to gather all data from the table and save it to Redis
function syncAllDataToRedis(saveToHistory = false) {
    const tableRows = document.querySelectorAll('#changeTable tbody tr:not(.empty-state)');
    const services = [];
    
    // If there are no rows, don't proceed
    if (tableRows.length === 0) {
        createNotification('info', 'No data to sync.');
        return;
    }
    
    // Gather data from all rows
    tableRows.forEach(row => {
        const cells = row.cells;
        if (cells.length < 7) return;
        
        const serviceName = cells[0].textContent;
        const date = cells[1].textContent;
        const startTime = cells[2].dataset.original || cells[2].textContent;
        const endTime = cells[3].dataset.original || cells[3].textContent;
        const endDate = cells[4].textContent;
        const comments = cells[5].textContent;
        const priority = row.getAttribute('data-priority') || 'low';
        
        services.push({
            name: serviceName,
            start_time: startTime,
            end_time: endTime,
            end_date: endDate || date,
            comments: comments,
            priority: priority
        });
    });
    
    // Get the current header title
    const headerTitle = document.getElementById('headerTitle').textContent;
    
    // Get the original email body if available
    const emailBody = document.getElementById('emailBody');
    const originalBody = emailBody ? emailBody.textContent : '';
    
    // Show loading animation
    const loadingEl = document.createElement('div');
    loadingEl.className = 'sync-loading';
    loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + 
                         (saveToHistory ? 'Syncing & saving to history...' : 'Syncing data...');
    loadingEl.style = 'position:fixed; top:20px; right:20px; background:var(--primary-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
    document.body.appendChild(loadingEl);

    // Fetch the current username and then sync
    fetch('/current-user', { credentials: 'same-origin' })
        .then(res => res.json())
        .then(user => {
            let username = user && user.logged_in ? user.username : 'Unknown';
            // Create the data object
            const data = {
                services: services,
                date: services.length > 0 ? services[0].end_date : new Date().toISOString().split('T')[0],
                header_title: headerTitle,
                original_body: originalBody,
                username: username
            };
            // Send to server
            const endpoint = saveToHistory ? '/sync-to-history' : '/sync-all-data';
            fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data),
                cache: 'no-store'
            })
            .then(response => response.json())
            .then(result => {
                document.body.removeChild(loadingEl);
                if (result.status === 'success') {
                    // Invalidate cache when data is synced (especially when saving to history)
                    if (saveToHistory) {
                        historyCache.updateSyncTimestamp();
                        // Clear failed search cache when new data is added
                        historyCache.failedSearchCache.clear();
                    }
                    
                    // Update the timestamp
                    document.getElementById('dataTimestamp').value = result.timestamp;
                    // Update the last-edited-by field in real time

                    
                    const successEl = document.createElement('div');
                    successEl.className = 'sync-success';
                    successEl.innerHTML = '<i class="fas fa-check-circle"></i> ' +
                                        (saveToHistory ? 'Data synced and saved to history!' : 'Data synced successfully!');
                    successEl.style = 'position:fixed; top:20px; right:20px; background:var(--success-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
                    document.body.appendChild(successEl);
                    
                    setTimeout(() => {
                        document.body.removeChild(successEl);
                    }, 3000);
                    
                } else {
                    createNotification('error', 'Error syncing data: ' + (result.message || 'Unknown error'));
                }
            })
            .catch(error => {
                document.body.removeChild(loadingEl);
                console.error('Error:', error);
                createNotification('error', 'Error syncing data. Please try again.');
            });
        })
        .catch(() => {
            document.body.removeChild(loadingEl);
            createNotification('error', 'Could not determine username. Please log in again.');
        });
}

// Add event listener for the sync button
document.addEventListener('DOMContentLoaded', function() {
const syncBtn = document.getElementById('syncData');
if (syncBtn) {
syncBtn.addEventListener('click', () => syncAllDataToRedis(false));
}

// Enhance the row save functionality to ensure data is saved to Redis
document.querySelector('table').addEventListener('click', function(e) {
if (e.target.closest('.save-btn')) {
    const row = e.target.closest('tr');
    const cells = row.getElementsByTagName('td');
    
    // Update original data attributes for time cells
    const startTimeCell = cells[2];
    const endTimeCell = cells[3];
    
    startTimeCell.dataset.original = startTimeCell.textContent;
    endTimeCell.dataset.original = endTimeCell.textContent;

    // Make cells not editable
    for (let i = 0; i < cells.length - 1; i++) {
        cells[i].contentEditable = false;
        cells[i].classList.remove('editable');
    }
    
    // Update UI
    row.querySelector('.save-btn').style.display = 'none';
    row.querySelector('.edit-btn').style.display = 'inline-flex';
    
    applyRowHighlight(row);
    
    // Get all data needed for saving
    const rowData = {
        service: cells[0].textContent,
        date: cells[1].textContent,
        startTime: cells[2].textContent,
        endTime: cells[3].textContent,
        endDate: cells[4].textContent,
        comments: cells[5].textContent,
        impactPriority: row.querySelector('.impact-selector').getAttribute('data-value')
    };
    

    }
    });

// Enhanced impact selector to save changes immediately

});


document.addEventListener('DOMContentLoaded', function() {
const resetFormBtn = document.getElementById('resetForm');

// Remove any existing event listeners by cloning and replacing the button
const newResetBtn = resetFormBtn.cloneNode(true);
resetFormBtn.parentNode.replaceChild(newResetBtn, resetFormBtn);

// Add a single event listener to the new button
newResetBtn.addEventListener('click', function(e) {
e.preventDefault();
e.stopPropagation();

if (confirm('Are you sure you want to reset the form? This will clear all data.')) {
    // Show loading indicator
    const loadingEl = document.createElement('div');
    loadingEl.className = 'sync-loading';
    loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting data...';
    loadingEl.style = 'position:fixed; top:20px; right:20px; background:var(--primary-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
    document.body.appendChild(loadingEl);
    
    fetch('/reset-data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
    })
    .then(response => response.json())
    .then(data => {
        // Force a complete refresh with no caching
        const reloadUrl = window.location.href.split('?')[0] + 
                        '?nocache=' + new Date().getTime();
        window.location.replace(reloadUrl);
    })
    .catch(error => {
        console.error('Error:', error);
        document.body.removeChild(loadingEl);
        alert('Error resetting data. Please try again.');
    });
}
});

// Removed getEventListeners block to avoid "ReferenceError: getEventListeners is not defined"
// const oldHandlers = getEventListeners || (el => ({}));
// const existingResetHandlers = oldHandlers(document.getElementById('resetForm')) || {};
// if (existingResetHandlers.click) {
//     existingResetHandlers.click.forEach(handler => {
//         if (handler !== newResetBtn.onclick) {
//             document.getElementById('resetForm').removeEventListener('click', handler);
//         }
//     });
// }
});

// ...existing code...


// Add a function to periodically check for updates from other tabs
function setupUpdateChecker() {
    const checkInterval = 10000; // Check every 10 seconds
    let failedChecks = 0;
    const maxFails = 3;

    function checkForUpdates() {
        const currentTimestamp = document.getElementById('dataTimestamp').value;

        fetch(`/check-updates?since=${currentTimestamp}&_=${Date.now()}`, {
            method: 'GET',
            cache: 'no-store'
        })
        .then(response => response.json())
        .then(data => {
            if (wasOffline) {
                showOfflineNotch(true); // Show back online message
                wasOffline = false;
            }
            failedChecks = 0; // Reset on success
            
            if (data.updated) {
                // Clear failed search cache when data is updated
                if (window.historyCache) {
                    window.historyCache.clearFailedSearchCache();
                }
                
                // Remove any existing notifications first
                const existingNotice = document.querySelector('.update-notice');
                if (existingNotice) {
                    existingNotice.remove();
                }
                
                // Create notification with a unique ID for the refresh link
                const updateNotice = document.createElement('div');
                updateNotice.className = 'update-notice';
                updateNotice.innerHTML = '<i class="fas fa-info-circle"></i> Data has been updated. <a href="#" id="refreshPageLink">Refresh</a> to see the latest changes.';
                updateNotice.style = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:var(--primary-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000; text-align:center;';
                document.body.appendChild(updateNotice);
                
                // Attach event listener AFTER the element is in the DOM
                const refreshLink = document.getElementById('refreshPageLink');
                if (refreshLink) {
                    refreshLink.addEventListener('click', function(e) {
                        e.preventDefault();
                        // Use more reliable refresh methods
                        window.location.href = window.location.href.split('?')[0] + '?nocache=' + Date.now();
                    });
                }
            }
            // Remove offline notch if present (let the back online message handle removal)
        })
        .catch(error => {
            console.error('Error checking for updates:', error);
            failedChecks++;
            if (failedChecks >= maxFails && !wasOffline) {
                showOfflineNotch(false);
                wasOffline = true;
            }
        });
    }

    // Run once immediately
    checkForUpdates();

    // Start periodic checking
    setInterval(checkForUpdates, checkInterval);
}

// Initialize update checker on page load
document.addEventListener('DOMContentLoaded', function() {
    // ...existing initialization code...

    // Only set up the update checker if there is existing data
    const dataTimestamp = document.getElementById('dataTimestamp');
    if (dataTimestamp && dataTimestamp.value !== '0') {
        setupUpdateChecker();
    }

    // Add this to prevent the "confirm form resubmission" dialog
    if (window.history.replaceState) {
        window.history.replaceState(null, null, window.location.href);
    }
});
// ...existing code...

// Make sure our page starts fresh by adding cache control meta tags

// Add history functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initialize dropdown menu behavior
    const syncDropdown = document.getElementById('syncDropdown');
    const dropdownMenu = document.querySelector('.dropdown-menu');
    
    if (syncDropdown) {
        syncDropdown.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            ensureAuthenticated(() => {
                syncDropdown.parentElement.classList.toggle('open');
            }, "Please enter the passkey to access sync functionality");
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            const syncDropdown = document.getElementById('syncDropdown');
            if (syncDropdown) {
                const dropdownParent = syncDropdown.parentElement;
                if (!dropdownParent.contains(e.target)) {
                    dropdownParent.classList.remove('open');
                }
            }
        });
        
        // Note: Dropdown item click handlers are now handled in setupDropdownActions function
        // to prevent duplicate event listeners
    }
    
    // History modal
    const historyModal = document.getElementById('historyModal');
    const historyModalClose = historyModal.querySelector('.close');
    
    // Function to clear search when modal closes
    function clearHistorySearch() {
        const historySearch = document.getElementById('historySearch');
        if (historySearch) {
            historySearch.value = '';
            currentHistorySearch = '';
        }
    }
    
    historyModalClose.addEventListener('click', function() {
        historyModal.style.display = "none";
        clearHistorySearch();
    });
    
    window.addEventListener('click', function(event) {
        if (event.target === historyModal) {
            historyModal.style.display = "none";
            clearHistorySearch();
        }
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && historyModal.style.display === "block") {
            historyModal.style.display = "none";
            clearHistorySearch();
        }
    });
    
    // History search functionality
    const historySearch = document.getElementById('historySearch');
    const historyClearSearch = document.getElementById('historyClearSearch');
    
    if (historySearch) {
        historySearch.addEventListener('input', function() {
            const searchTerm = this.value.trim();
            handleHistorySearch(searchTerm);
        });
        
        // Clear search functionality
        if (historyClearSearch) {
            historyClearSearch.addEventListener('click', function() {
                historySearch.value = '';
                currentHistorySearch = ''; // Reset search state
                openHistoryModal(currentViewOnly, '', 1);
            });
        }
    }
});



// Global variables for pagination state
let currentHistoryPage = 1;
let currentHistorySearch = '';
let historyPagination = null;
let currentViewOnly = false; // Track current view-only state

// Debounced search function
let searchTimeout;
const SEARCH_DELAY = 650; // Increased to 650ms as requested
const MIN_SEARCH_LENGTH = 1; // Allow single character searches

// --- Single result optimization state ---
let lastSingleResult = null;
let lastSingleResultSearch = '';
let lastSingleResultTime = 0;
const SINGLE_RESULT_TTL = 10000; // 10 seconds
// ... existing code ...

// Open history modal and load history items with caching
async function openHistoryModal(viewOnly = false, searchTerm = '', page = 1) {
    
        const historyModal = document.getElementById('historyModal');
        const historyList = document.getElementById('historyList');
        const paginationControls = document.getElementById('paginationControls');
        const resultsCounter = document.getElementById('resultsCounter');
        
        // Ensure modal elements exist
        if (!historyModal || !historyList) {
            console.error('History modal elements not found!');
            return;
        }
        
        // Show modal immediately to prevent race conditions
        historyModal.style.display = "block";
        
        // Update global state
        currentHistoryPage = page;
        currentHistorySearch = searchTerm;
        currentViewOnly = viewOnly; // Track view-only state
        
            // Determine cache key and type
    let cacheKey, cacheType;
    if (searchTerm) {
        cacheKey = historyCache.getSearchKey(searchTerm);
        cacheType = 'search';
    } else {
        cacheKey = historyCache.getPageKey(page, 10);
        cacheType = 'page';
    }
        
            // Check cache first
    const cachedData = historyCache.getCachedData(cacheKey, cacheType);
    if (cachedData) {
        displayHistoryData(cachedData, searchTerm, page, viewOnly);
        return;
    }
        
        // Show loading state
        const loadingMessage = searchTerm 
            ? `Searching history for "${searchTerm}"...`
            : 'Loading history...';
        historyList.innerHTML = `<div class="loading-history"><i class="fas fa-circle-notch fa-spin"></i> ${loadingMessage}</div>`;
        
                try {
            // Build URL with parameters
            const params = new URLSearchParams();
            if (searchTerm) {
                params.append('search', searchTerm);
            } else {
                params.append('page', page);
                params.append('per_page', 10);  // Changed to 10 for better UX
            }
            
            // Fetch history from server
            const response = await fetch(`/get-history?${params}`, {
                method: 'GET',
                cache: 'no-store'
            });
        
        if (response.status === 304) {
            // Not Modified - use existing cache
            const cachedData = historyCache.getCachedData(cacheKey, cacheType);
            if (cachedData) {
                displayHistoryData(cachedData, searchTerm, page, viewOnly);
                return;
            }
        }
        
        // Check for error status codes
        if (!response.ok) {
            let errorMessage = 'Error loading history. Please try again.';
            
            if (response.status === 429) {
                errorMessage = 'Too many requests. Please wait a moment and try again.';
                // Add visual indicator for rate limiting
                const searchInput = document.querySelector('#historySearch');
                if (searchInput) {
                    searchInput.style.borderColor = '#ff6b6b';
                    setTimeout(() => {
                        searchInput.style.borderColor = '';
                    }, 3000);
                }
            } else if (response.status === 401) {
                errorMessage = 'Authentication required. Please log in again.';
            } else if (response.status === 403) {
                errorMessage = 'Access denied. Please check your permissions.';
            } else if (response.status === 500) {
                errorMessage = 'Server error. Please try again later.';
            }
            
            historyList.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>${errorMessage}</p>
                </div>
            `;
            return;
        }
        
        const data = await response.json();
        
        // Cache the result
        historyCache.setCachedData(cacheKey, data, cacheType);
        
        // Disable or enable search based on is_empty (only when not searching)
        if (typeof data.is_empty !== 'undefined' && !searchTerm) {
            const historySearch = document.getElementById('historySearch');
            const searchBtn = document.getElementById('searchBtn');
            if (data.is_empty) {
                if (historySearch) historySearch.disabled = true;
                if (searchBtn) searchBtn.disabled = true;
                if (historySearch) historySearch.placeholder = 'No history to search...';
            } else {
                if (historySearch) historySearch.disabled = false;
                if (searchBtn) searchBtn.disabled = false;
                if (historySearch) historySearch.placeholder = 'Search history by title or date...';
            }
        }
        
        // Display data
        displayHistoryData(data, searchTerm, page, viewOnly);
        
    } catch (error) {
        console.error('Error loading history:', error);
        historyList.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                <p>Error loading history. Please try again.</p>
            </div>
        `;
    }
}

// Display history data (extracted from openHistoryModal for reuse)
function displayHistoryData(data, searchTerm, page, viewOnly) {
    
    const historyModal = document.getElementById('historyModal');
    const historyList = document.getElementById('historyList');
    const paginationControls = document.getElementById('paginationControls');
    const resultsCounter = document.getElementById('resultsCounter');
    
    // Ensure modal is shown
    if (historyModal) {
        historyModal.style.display = "block";
    }
    
    const history = data.items || data; // Handle both paginated and full list
    const pagination = data.pagination;
    
    if (history.length === 0) {
        historyList.innerHTML = `
            <div class="empty-history">
                <i class="fas fa-inbox"></i>
                <p>${searchTerm ? `No results found for '${searchTerm}'` : 'Your sync history will appear here once you start syncing...'}</p>
            </div>
        `;
        
        // Mark failed search for future early exits
        if (searchTerm) {
            historyCache.markFailedSearch(searchTerm);
        }
        
        // Update results counter for no results
        updateResultsCounter(0, null, searchTerm);
        
        // Hide pagination controls for search with no results
        if (paginationControls) {
            paginationControls.style.display = 'none';
        }
        return;
    }
    
    // Show/hide pagination controls
    if (paginationControls) {
        paginationControls.style.display = searchTerm ? 'none' : 'block';
    }
    
    // Update results counter
    updateResultsCounter(history.length, pagination, searchTerm);
    
    // Store pagination info
    historyPagination = pagination;
    
    // Populate history items
    populateHistoryItems(history, viewOnly);
    
    // Update pagination controls
    if (pagination && !searchTerm) {
        updatePaginationControls(pagination);
    }

    // Track single result optimization
    if (searchTerm && history.length === 1) {
        lastSingleResult = history[0];
        lastSingleResultSearch = searchTerm;
        lastSingleResultTime = Date.now();
        // console.log('[SingleResultOpt] Caching single result for search:', searchTerm);
    } else if (searchTerm && history.length !== 1) {
        lastSingleResult = null;
        lastSingleResultSearch = '';
        lastSingleResultTime = 0;
    }
}

// Populate history items
function populateHistoryItems(history, viewOnly) {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';
    
    history.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.dataset.timestamp = item.timestamp;
        
        const serviceCount = item.data?.services?.length || 0;
        
        // Convert saved UTC date to local timezone
        let formattedDate = 'Unknown date';
        let formattedTime = '';
        if (item.date) {
            const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const dt = DateTime.fromFormat(item.date, "yyyy-MM-dd HH:mm:ss", {zone: 'utc'}).setZone(localTz);
            formattedDate = dt.toFormat("yyyy-MM-dd");
            formattedTime = dt.toFormat("hh:mm a") + " (" + localTz + ")";
        }
        
        // Add match source info if available
        let matchSourceHtml = '';
        if (item._match_sources && item._match_sources.length > 0) {
            const matchSources = item._match_sources.join(', ');
            matchSourceHtml = `
                <div class="history-item-match-source" style="font-size:0.75em;color:white;margin-top:0.3rem;">
                    <i class="fas fa-search"></i> ${matchSources}
                </div>
            `;
        }
        
        historyItem.innerHTML = `
            <div class="history-item-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:1.2rem;">
                <div class="history-item-title" style="flex:1;min-width:0;">
                    <span class="history-item-badge"></span>
                    <span style="font-size:1.15em;font-weight:bold;">${item.title || 'Change Weekend'}</span>
                </div>
                <div class="history-item-date-time" style="display:flex;flex-direction:column;align-items:flex-end;min-width:120px;">
                    <span class="history-item-date" style="font-size:0.77em;color:#b0b8c9;">${formattedDate}</span>
                    <span class="history-item-time" style="font-size:0.77em;color:#b0b8c9;">${formattedTime}</span>
                </div>
            </div>
            <div class="history-item-summary">
                ${serviceCount} service${serviceCount !== 1 ? 's' : ''} included
            </div>
            ${matchSourceHtml}
            <div class="history-item-actions">
                <button class="history-item-btn load">
                    <i class="fas fa-cloud-download-alt"></i> Load
                </button>
                <button class="history-item-btn delete">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        `;
        
        historyList.appendChild(historyItem);
    });
    
    // Add event listeners to load buttons
    document.querySelectorAll('.history-item-btn.load').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const timestamp = this.closest('.history-item').dataset.timestamp;
            loadHistoryItem(timestamp, viewOnly);
        });
    });
    
    // Add event listeners to delete buttons
    if (!viewOnly) {
        document.querySelectorAll('.history-item-btn.delete').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const timestamp = this.closest('.history-item').dataset.timestamp;
                deleteHistoryItem(timestamp, this.closest('.history-item'));
            });
        });
    } else {
        // hide delete buttons in view‐only mode
        document.querySelectorAll('.history-item-btn.delete').forEach(btn => btn.remove());
    }
}

// Update results counter
function updateResultsCounter(itemCount, pagination, searchTerm) {
    const paginationControls = document.getElementById('paginationControls');
    if (paginationControls) {
        if (searchTerm) {
            if (itemCount === 0) {
                paginationControls.innerHTML = `<span class="pagination-info">0 results found</span>`;
            } else {
                paginationControls.innerHTML = `<span class="pagination-info">${itemCount} result${itemCount !== 1 ? 's' : ''} found</span>`;
            }
        } else if (pagination) {
            const start = (pagination.current_page - 1) * pagination.per_page + 1;
            const end = Math.min(start + itemCount - 1, pagination.total_items);
            paginationControls.innerHTML = `
                <button class="pagination-btn prev" ${!pagination.has_prev ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i>
                </button>
                <span class="pagination-info">Page ${pagination.current_page} of ${pagination.total_pages}</span>
                <button class="pagination-btn next" ${!pagination.has_next ? 'disabled' : ''}>
                    <i class="fas fa-chevron-right"></i>
                </button>
                <span class="pagination-results">Showing ${start}-${end} of ${pagination.total_items}</span>
            `;
            
            // Add event listeners for pagination buttons
            const prevBtn = paginationControls.querySelector('.pagination-btn.prev');
            const nextBtn = paginationControls.querySelector('.pagination-btn.next');
            
            if (prevBtn) {
                prevBtn.addEventListener('click', () => {
                    if (pagination.has_prev) {
                        openHistoryModal(currentViewOnly, currentHistorySearch, pagination.current_page - 1);
                    }
                });
            }
            
            if (nextBtn) {
                nextBtn.addEventListener('click', () => {
                    if (pagination.has_next) {
                        openHistoryModal(currentViewOnly, currentHistorySearch, pagination.current_page + 1);
                    }
                });
            }
        }
    }
}

// Update pagination controls
function updatePaginationControls(pagination) {
    // This function is now handled by updateResultsCounter to avoid duplication
    // The pagination controls are updated inline with the results counter
}



// Handle search with debouncing
function handleHistorySearch(searchTerm) {
    clearTimeout(searchTimeout);
    
    // Don't search if too short
    if (searchTerm.length < MIN_SEARCH_LENGTH) {
        if (searchTerm.length === 0) {
            // Clear search, return to paginated view with current view-only state
            currentHistorySearch = ''; // Reset search state
            openHistoryModal(currentViewOnly, '', 1);
        }
        // Clear single result tracking
        lastSingleResult = null;
        lastSingleResultSearch = '';
        lastSingleResultTime = 0;
        return;
    }

    // --- Single result optimization: If we have a single result and the new search is a prefix of the previous search ---
    if (lastSingleResult && lastSingleResultSearch && searchTerm.startsWith(lastSingleResultSearch)) {
        const now = Date.now();
        if (now - lastSingleResultTime < SINGLE_RESULT_TTL) {
            // Check if the single result still matches the new search term
            const title = lastSingleResult.title || '';
            const date = lastSingleResult.date || '';
            const searchLower = searchTerm.toLowerCase();
            if (title.toLowerCase().includes(searchLower) || date.toLowerCase().includes(searchLower)) {
                // Still the same single result, display it immediately without API call
                // console.log('[SingleResultOpt] Using cached single result for search:', searchTerm);
                const historyList = document.getElementById('historyList');
                if (historyList) {
                    // Update the single result tracking
                    lastSingleResultSearch = searchTerm;
                    // DO NOT update lastSingleResultTime here (fixed expiration)
                    populateHistoryItems([lastSingleResult], currentViewOnly);
                    updateResultsCounter(1, null, searchTerm);
                    // Hide pagination controls for single result
                    const paginationControls = document.getElementById('paginationControls');
                    if (paginationControls) {
                        paginationControls.style.display = 'none';
                    }
                }
                return;
            }
        } else {
            // TTL expired
            // console.log('[SingleResultOpt] TTL expired for single result cache. Falling back to normal search.');
            lastSingleResult = null;
            lastSingleResultSearch = '';
            lastSingleResultTime = 0;
        }
    }
    // ... existing code ...
    // Check if this search term or any of its prefixes are known to return no results
    if (historyCache.isFailedSearch(searchTerm) || historyCache.isFailedSearchPrefix(searchTerm)) {
        // Early exit - show no results immediately
        const historyList = document.getElementById('historyList');
        if (historyList) {
            historyList.innerHTML = `
                <div class="empty-history">
                    <i class="fas fa-inbox"></i>
                    <p>No results found for '${searchTerm}'</p>
                </div>
            `;
        }
        // Clear single result tracking
        lastSingleResult = null;
        lastSingleResultSearch = '';
        lastSingleResultTime = 0;
        return;
    }
    // ... existing code ...
    searchTimeout = setTimeout(() => {
        // Preserve the current view-only state during search
        currentHistorySearch = searchTerm; // Update search state
        openHistoryModal(currentViewOnly, searchTerm);
    }, SEARCH_DELAY);
}

// Add this new function to delete a history item
function deleteHistoryItem(timestamp, itemElement) {
    // Show custom confirmation dialog
    createConfirmDialog({
        type: 'danger',
        icon: 'fa-trash',
        title: 'Delete History Item',
        message: 'Are you sure you want to delete this history item? This action cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel'
    }).then(confirmed => {
        if (!confirmed) return;
        
        // Show loading state
        const loadingEl = document.createElement('div');
        loadingEl.className = 'delete-loading';
        loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting history item from redis...';
        loadingEl.style = 'position:fixed; top:20px; right:20px; background:var(--danger-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
        document.body.appendChild(loadingEl);
        
        // Send delete request
        fetch(`/delete-from-history/${timestamp}`, {
            method: 'DELETE',
            cache: 'no-store'
        })
        .then(response => response.json())
        .then(result => {
            // Add artificial delay of 1.5 seconds
            setTimeout(() => {
                document.body.removeChild(loadingEl);
                if (result.status === 'success') {
                    // Invalidate cache after successful deletion
                    historyCache.invalidateCache();
                    
                    // Remove the item from UI with animation
                    itemElement.style.opacity = '0';
                    itemElement.style.transform = 'translateX(20px)';
                    setTimeout(() => {
                        itemElement.remove();
                        
                        // Check if history is now empty
                        if (document.querySelectorAll('.history-item').length === 0) {
                            document.getElementById('historyList').innerHTML = `
                                <div class="empty-history">
                                    <i class="fas fa-inbox"></i>
                                    <p>Your sync history will appear here once you start syncing...</p>
                                </div>
                            `;
                        }
                        
                        // Show success notification
                        const successEl = document.createElement('div');
                        successEl.className = 'delete-success';
                        successEl.innerHTML = '<i class="fas fa-check-circle"></i> History item deleted';
                        successEl.style = 'position:fixed; top:20px; right:20px; background:var(--success-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
                        document.body.appendChild(successEl);
                        setTimeout(() => {
                            document.body.removeChild(successEl);
                        }, 3000);
                    }, 300);
                } else {
                    createNotification('error', 'Error deleting history item: ' + (result.message || 'Unknown error'));
                }
            }, 1200); 
        })
        .catch(error => {
            document.body.removeChild(loadingEl);
            console.error('Error:', error);
            createNotification('error', 'Error deleting history item. Please try again.');
        });
    });
}// Filter history items based on search input
function filterHistoryItems(searchTerm) {
    const items = document.querySelectorAll('.history-item');
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    items.forEach(item => {
        const title = item.querySelector('.history-item-title').textContent.toLowerCase();
        const date = item.querySelector('.history-item-date').textContent.toLowerCase();
        
        if (title.includes(lowerSearchTerm) || date.includes(lowerSearchTerm)) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
    
    // Check if we have any visible items
    const visibleItems = document.querySelectorAll('.history-item[style="display: none;"]');
    const emptyHistory = document.querySelector('.empty-history');
    
    if (visibleItems.length === items.length) {
        if (!emptyHistory) {
            const historyList = document.getElementById('historyList');
            historyList.innerHTML += `
                <div class="empty-history">
                    <i class="fas fa-search"></i>
                    <p>No results found for "${searchTerm}"</p>
                </div>
            `;
        }
    } else if (emptyHistory) {
        emptyHistory.remove();
    }
}

// Load a specific history item by timestamp
function loadHistoryItem(timestamp, viewOnly = false) {
    // Show custom confirmation dialog
    createConfirmDialog({
      type: 'primary',
      icon: 'fa-cloud-download-alt',
      title: 'Load History Item',
      message: viewOnly
        ? 'Load this previous version for viewing? (Current changes will be replaced in the table view, but not synced)'
        : 'Are you sure you want to load this version? Current unsaved changes will be lost.',
      confirmText: 'Load',
      cancelText: 'Cancel'
    }).then(confirmed => {
      if (!confirmed) return;
      
      // Clear any existing notifications before starting the loading process
      clearAllNotifications();
      
      // Show loading state
      const loadingEl = document.createElement('div');
      loadingEl.id = 'history-loading-indicator';
      loadingEl.className = 'sync-loading';
      loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading data from history...';
      loadingEl.style = 'position:fixed; top:20px; right:20px; background:var(--primary-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
      document.body.appendChild(loadingEl);
      
      // Close the history modal
      document.getElementById('historyModal').style.display = "none";
      
      // Function to safely remove loading element
      const removeLoadingElement = () => {
        const loadingElement = document.getElementById('history-loading-indicator');
        if (loadingElement && loadingElement.parentNode) {
          loadingElement.parentNode.removeChild(loadingElement);
        }
      };
      
      // Add a small delay to make loading feel more substantial
      setTimeout(() => {
        fetch(`/load-from-history/${timestamp}`, {
          method: 'GET',
          cache: 'no-store'
        })
        .then(response => response.json())
        .then(result => {
          removeLoadingElement();
          
          if (result.status === 'success') {
            // Clear all existing notifications before showing new ones
            clearAllNotifications();
            
            // Call the updateUIWithHistoryData function with the history data
            updateUIWithHistoryData(result.data);
            
            // Show success notification
            createNotification('success', 'History item loaded successfully!');
          } else {
            createNotification('error', 'Error loading data: ' + (result.message || 'Unknown error'));
          }
        })
        .catch(error => {
          removeLoadingElement();
          console.error('Error:', error);
          createNotification('error', 'Error loading data. Please try again.');
        });
      }, 450);
    });
  }
  
  // Implement the updateUIWithHistoryData function that was missing
  function updateUIWithHistoryData(data) {
    if (!data || !data.services) {
      console.error('Invalid history data format');
      return;
    }
    
    try {
      // Update header title
      if (data.header_title) {
        document.getElementById('headerTitle').textContent = data.header_title;
      }
      // Update original email body if available
      const emailBody = document.getElementById('emailBody');
      if (emailBody && data.original_body) {
        emailBody.textContent = data.original_body;
      }
      // Update 'Last edited by' field
      const lastEditedByDiv = document.querySelector('.last-edited-by b');
      if (lastEditedByDiv) {
        lastEditedByDiv.textContent = data.last_edited_by ? data.last_edited_by : 'None';
      }
      // Clear existing table data
      const tbody = document.querySelector('#changeTable tbody');
      if (tbody) {
        tbody.innerHTML = '';
      }
      // Add rows for each service
      if (data.services && Array.isArray(data.services)) {
        data.services.forEach(service => {
          const newRow = document.createElement('tr');
          newRow.setAttribute('data-priority', service.priority || 'low');
          newRow.innerHTML = `
            <td>${service.name || ''}</td>
            <td>${service.end_date || data.date || ''}</td>
            <td data-original="${service.start_time || ''}">${service.start_time || ''}</td>
            <td data-original="${service.end_time || ''}">${service.end_time || ''}</td>
            <td>${service.end_date || data.date || ''}</td>
            <td>${service.comments || ''}</td>
            <td class="impact-cell">
              <div class="impact-selector" data-value="${service.priority || 'low'}">
                <div class="impact-selector-inner">
                  <div class="impact-option impact-option-low ${(service.priority === 'low' || !service.priority) ? 'selected' : ''}" data-value="low">
                    <span class="impact-dot"></span> Low
                  </div>
                  <div class="impact-option impact-option-medium ${service.priority === 'medium' ? 'selected' : ''}" data-value="medium">
                    <span class="impact-dot"></span> Medium
                  </div>
                  <div class="impact-option impact-option-high ${service.priority === 'high' ? 'selected' : ''}" data-value="high">
                    <span class="impact-dot"></span> High
                  </div>
                </div>
              </div>
            </td>
            <td class="action-cell">
              <button class="table-btn edit-btn" title="Edit"><i class="fas fa-edit"></i></button>
              <button class="table-btn save-btn" style="display: none;" title="Save"><i class="fas fa-save"></i></button>
              <button class="table-btn delete-btn" title="Delete"><i class="fas fa-trash"></i></button>
            </td>
          `;
          tbody.appendChild(newRow);
        });
      } else {
        console.warn('data.services is not a valid array:', data.services);
      }
      // Initialize impact selectors and apply filters
      document.querySelectorAll('tr').forEach(row => {
        initImpactSelector(row);
      });
      applyActiveFilter();
      checkEmptyTable();
      // ALSO refresh your parsed‑data table so it matches this history snapshot
      const parsedBody = document.getElementById('parsedDataBody');
      if (parsedBody) {
          parsedBody.innerHTML = '';
          data.services.forEach(svc => {
              const tr = document.createElement('tr');
              tr.setAttribute('data-service', svc.name || '');
              tr.innerHTML = `
                  <td>${svc.name || ''}</td>
                  <td>${data.date || ''}</td>
                  <td>${svc.start_time || ''}${svc.end_time ? ' - ' + svc.end_time : ''}</td>
                  <td>${svc.comments || ''}</td>
              `;
              parsedBody.appendChild(tr);
          });
      }
      // Re-apply overlays if not authenticated
      if (!isAuthenticated()) disableRestrictedFeatures();
    } catch (error) {
      console.error('Error updating UI with history data:', error);
      createNotification('error', 'Failed to display history data');
    }
  }
function createConfirmDialog(options) {
    // Remove any existing confirm dialogs
    const existingDialogs = document.querySelectorAll('.custom-confirm-dialog');
    existingDialogs.forEach(dialog => dialog.remove());
    
    // Create the dialog container
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'custom-confirm-dialog';
    
    // Create dialog content with the provided options
    dialogOverlay.innerHTML = `
        <div class="custom-confirm-content ${options.type || 'info'}">
            <div class="custom-confirm-icon">
                <i class="fas ${options.icon || 'fa-question-circle'}"></i>
            </div>
            <h3>${options.title || 'Confirm'}</h3>
            <p>${options.message || 'Are you sure?'}</p>
            <div class="custom-confirm-actions">
                <button class="custom-confirm-cancel">${options.cancelText || 'Cancel'}</button>
                <button class="custom-confirm-ok ${options.type || 'info'}-btn">${options.confirmText || 'Confirm'}</button>
            </div>
        </div>
    `;
    
    // Add to DOM
    document.body.appendChild(dialogOverlay);
    
    // Add animation class after a short delay to trigger animation
    setTimeout(() => dialogOverlay.classList.add('active'), 10);
    
    // Setup event handlers
    const cancelBtn = dialogOverlay.querySelector('.custom-confirm-cancel');
    const confirmBtn = dialogOverlay.querySelector('.custom-confirm-ok');
    
    return new Promise((resolve) => {
        // Confirm action
        confirmBtn.addEventListener('click', () => {
            dialogOverlay.classList.remove('active');
            setTimeout(() => {
                dialogOverlay.remove();
                resolve(true);
            }, 300);
        });
        
        // Handle Enter key to confirm
        dialogOverlay.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            confirmBtn.click();
          }
        });
        // Focus the confirm button for accessibility
        setTimeout(() => confirmBtn.focus(), 100);

        // Cancel action
        cancelBtn.addEventListener('click', () => {
            dialogOverlay.classList.remove('active');
            setTimeout(() => {
                dialogOverlay.remove();
                resolve(false);
            }, 300);
        });
        
        // Close when clicking outside (optional)
        dialogOverlay.addEventListener('click', (e) => {
            if (e.target === dialogOverlay) {
                dialogOverlay.classList.remove('active');
                setTimeout(() => {
                    dialogOverlay.remove();
                    resolve(false);
                }, 300);
            }
        });
        
        // Close on escape key
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                dialogOverlay.classList.remove('active');
                setTimeout(() => {
                    dialogOverlay.remove();
                    resolve(false);
                }, 300);
                document.removeEventListener('keydown', escHandler);
            }
        });
    });
}

// ...existing code...

// Update the promptForPasskey function to always require a passkey

// Fix the sync dropdown behavior
document.addEventListener('DOMContentLoaded', function() {
    // Initialize dropdown menu behavior
    const syncDropdown = document.getElementById('syncDropdown');
    const dropdownMenu = document.querySelector('.dropdown-menu');
    
    if (syncDropdown) {
        // Remove any existing click listeners to prevent duplicates
        syncDropdown.replaceWith(syncDropdown.cloneNode(true));
        
        // Get the fresh reference to the cloned element
        const freshSyncDropdown = document.getElementById('syncDropdown');
        
        freshSyncDropdown.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            ensureAuthenticated(() => {
                // Toggle dropdown after successful authentication
                const dropdownParent = freshSyncDropdown.parentElement;
                dropdownParent.classList.toggle('open');
                
                // Setup dropdown item click handlers
                setupDropdownActions(dropdownParent);
            }, "Please enter the passkey to access sync functionality");
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            const syncDropdown = document.getElementById('syncDropdown');
            if (syncDropdown) {
                const dropdownParent = syncDropdown.parentElement;
                if (!dropdownParent.contains(e.target)) {
                    dropdownParent.classList.remove('open');
                }
            }
        });
    }
});

// This function sets up the dropdown item click handlers
function setupDropdownActions(dropdownParent) {
    // Define named functions for event handlers
    const syncToRedisHandler = function() {
        syncAllDataToRedis(false); // Regular sync without history
        if (dropdownParent) {
            dropdownParent.classList.remove('open');
        }
    };
    
    const syncToHistoryHandler = function() {
        syncAllDataToRedis(true); // Sync and save to history
        if (dropdownParent) {
            dropdownParent.classList.remove('open');
        }
    };
    
    const viewHistoryHandler = function() {
        openHistoryModal();
        if (dropdownParent) {
            dropdownParent.classList.remove('open');
        }
    };
    
    // Get button elements
    const syncToRedisBtn = document.getElementById('syncToRedis');
    const syncToHistoryBtn = document.getElementById('syncToHistory');
    const viewHistoryBtn = document.getElementById('viewHistory');
    
    // Only add event listeners if they don't already exist
    if (syncToRedisBtn && !syncToRedisBtn._hasSyncListener) {
        syncToRedisBtn.addEventListener('click', syncToRedisHandler);
        syncToRedisBtn._hasSyncListener = true;
    }
    
    if (syncToHistoryBtn && !syncToHistoryBtn._hasSyncListener) {
        syncToHistoryBtn.addEventListener('click', syncToHistoryHandler);
        syncToHistoryBtn._hasSyncListener = true;
    }
    
    if (viewHistoryBtn && !viewHistoryBtn._hasSyncListener) {
        viewHistoryBtn.addEventListener('click', viewHistoryHandler);
        viewHistoryBtn._hasSyncListener = true;
    }
}

// Add info icons to the dropdown items
document.addEventListener('DOMContentLoaded', function() {
    const syncToRedisItem = document.getElementById('syncToRedis');
    const syncToHistoryItem = document.getElementById('syncToHistory');
    const viewHistoryItem = document.getElementById('viewHistory');

    if (syncToRedisItem) {
        const infoIcon = document.createElement('i');
        infoIcon.className = 'fas fa-info-circle info-icon';
        infoIcon.title = 'Sync data to Redis';
        syncToRedisItem.appendChild(infoIcon);
        infoIcon.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }

    if (syncToHistoryItem) {
        const infoIcon = document.createElement('i');
        infoIcon.className = 'fas fa-info-circle info-icon';
        infoIcon.title = 'Sync data and save to history';
        syncToHistoryItem.appendChild(infoIcon);
        infoIcon.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }

    if (viewHistoryItem) {
        const infoIcon = document.createElement('i');
        infoIcon.className = 'fas fa-info-circle info-icon';
        infoIcon.title = 'View sync history';
        viewHistoryItem.appendChild(infoIcon);
        infoIcon.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }
});

// ...existing code...

// Add this function to create notifications
function createNotification(type, message, persistent = false, clickable = false, clickHandler = null) {
  // Remove existing notifications of the same type
  const existingNotifications = document.querySelectorAll(`.notification.${type}:not(.persistent)`);
  existingNotifications.forEach(note => note.remove());
  
  // Create new notification
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  if (persistent) {
    notification.classList.add('persistent');
  }
  if (clickable) {
    notification.classList.add('clickable');
    notification.style.cursor = 'pointer';
  }
  
  // Add appropriate icon based on type
  let icon = 'fa-info-circle';
  if (type === 'error') icon = 'fa-exclamation-circle';
  if (type === 'success') icon = 'fa-check-circle';
  if (type === 'warning') icon = 'fa-exclamation-triangle';
  
  notification.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
  document.body.appendChild(notification);
  
  // Add click handler if provided
  if (clickable && clickHandler) {
    notification.addEventListener('click', clickHandler);
  }
  
  // Animate in
  setTimeout(() => notification.classList.add('show'), 10);
  
  // Auto-dismiss after 3 seconds only for non-persistent notifications
  if (!persistent) {
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300); // Wait for animation to complete
    }, 3000);
  }
  
  return notification;
}

// Helper function to clear all notifications
function clearAllNotifications() {
  const existingNotifications = document.querySelectorAll('.notification');
  existingNotifications.forEach(note => note.remove());
}

// Update the resetForm event listener to use our custom dialog
document.addEventListener('DOMContentLoaded', function() {
  const resetFormBtn = document.getElementById('resetForm');
  if (resetFormBtn) {
    // Remove any existing event listeners
    resetFormBtn.replaceWith(resetFormBtn.cloneNode(true));
    const newResetBtn = document.getElementById('resetForm');
    
    // Add custom confirm dialog
    newResetBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // Show custom confirmation dialog
      createConfirmDialog({
        type: 'danger',
        icon: 'fa-trash',
        title: 'Reset Form',
        message: 'Are you sure you want to reset the form? This will clear all data and cannot be undone.',
        confirmText: 'Reset',
        cancelText: 'Cancel'
      }).then(confirmed => {
        if (!confirmed) return;
        
        // Show loading indicator
        const loadingEl = document.createElement('div');
        loadingEl.className = 'sync-loading';
        loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting data...';
        loadingEl.style = 'position:fixed; top:20px; right:20px; background:var(--danger-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
        document.body.appendChild(loadingEl);
        
        fetch('/reset-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        })
        .then(response => response.json())
        .then(data => {
          // Force a complete refresh with no caching
          const reloadUrl = window.location.href.split('?')[0] + 
                         '?nocache=' + new Date().getTime();
          window.location.replace(reloadUrl);
        })
        .catch(error => {
          console.error('Error:', error);
          document.body.removeChild(loadingEl);
          createNotification('error', 'Error resetting data. Please try again.');
        });
      });
    });
  }
});

// Update the promptForPasskey function to properly show error messages
function promptForPasskey(customMessage = "Please enter the passkey to access sync functionality") {
  return new Promise((resolve) => {
    // Create the dialog container
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'custom-confirm-dialog';
    
    // Create dialog content
    dialogOverlay.innerHTML = `
      <div class="custom-confirm-content">
        <div class="custom-confirm-icon">
          <i class="fas fa-key"></i>
        </div>
        <h3>Authentication Required</h3>
        <p>${customMessage}</p>
        <input type="password" id="passkey-input" class="passkey-input" placeholder="Enter passkey">
        <div class="custom-confirm-actions">
          <button class="custom-confirm-cancel">Cancel</button>
          <button class="custom-confirm-ok primary-btn">Submit</button>
        </div>
      </div>
    `;
    
    // Add to DOM
    document.body.appendChild(dialogOverlay);
    
    // Add animation class after a short delay to trigger animation
    setTimeout(() => dialogOverlay.classList.add('active'), 10);
    
    // Give focus to the input
    setTimeout(() => {
      const passkeyInput = document.getElementById('passkey-input');
      if (passkeyInput) passkeyInput.focus();
    }, 300);
    
    // Setup event handlers
    const cancelBtn = dialogOverlay.querySelector('.custom-confirm-cancel');
    const confirmBtn = dialogOverlay.querySelector('.custom-confirm-ok');
    const passkeyInput = dialogOverlay.querySelector('#passkey-input');
    
    // Handle Enter key in the input field
    passkeyInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmBtn.click();
      }
    });
    
    // Confirm action
    confirmBtn.addEventListener('click', () => {
      const passkey = passkeyInput.value.trim();
      
      // Validate the passkey with the server
      fetch('/validate-passkey', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ passkey: passkey })
      })
      .then(response => response.json())
      .then(data => {
        if (data.valid) {
          // Set the server-side reauth window
          fetch('/set-reauth', { method: 'POST', credentials: 'same-origin' })
            .then(() => {
              dialogOverlay.classList.remove('active');
              setTimeout(() => {
                dialogOverlay.remove();
                createNotification('success', 'Authentication successful!');
                resolve(true);
              }, 500);
            });
        } else {
          // Show error but keep dialog open
          const errorMessage = document.createElement('div');
          errorMessage.className = 'passkey-error';
          // Use the message from the server response, or a default if none provided
          errorMessage.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${data.message || 'Invalid passkey. Please try again.'}`;
          errorMessage.style.color = 'var(--danger-color)';
          errorMessage.style.marginTop = '-10px';
          errorMessage.style.marginBottom = '10px';
          errorMessage.style.fontSize = '0.85rem';

          // Remove any existing error messages
          const existingError = dialogOverlay.querySelector('.passkey-error');
          if (existingError) existingError.remove();
          
          // Insert error before the actions
          const actionsDiv = dialogOverlay.querySelector('.custom-confirm-actions');
          actionsDiv.parentNode.insertBefore(errorMessage, actionsDiv);
          
          // Shake the dialog
          dialogOverlay.querySelector('.custom-confirm-content').classList.add('shake');
          setTimeout(() => {
            dialogOverlay.querySelector('.custom-confirm-content').classList.remove('shake');
          }, 500);
          
          // Clear the input and focus it
          passkeyInput.value = '';
          passkeyInput.focus();
        }
      })
      .catch(error => {
        dialogOverlay.classList.remove('active');
        setTimeout(() => {
          dialogOverlay.remove();
          createNotification('error', 'Error validating passkey. Please try again later.');
          resolve(false);
        }, 300);
      });
    });
    
    // Cancel action
    cancelBtn.addEventListener('click', () => {
      dialogOverlay.classList.remove('active');
      setTimeout(() => {
        dialogOverlay.remove();
        resolve(false);
      }, 300);
    });
    
    // Close on escape key
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        dialogOverlay.classList.remove('active');
        setTimeout(() => {
          dialogOverlay.remove();
          resolve(false);
        }, 300);
        document.removeEventListener('keydown', escHandler);
      }
    });
  });
}

// ...existing code...

// Update the resetForm event listener to use our custom dialog
document.addEventListener('DOMContentLoaded', function() {
  const resetFormBtn = document.getElementById('resetForm');
  if (resetFormBtn) {
    // Remove any existing event listeners
    resetFormBtn.replaceWith(resetFormBtn.cloneNode(true));
    const newResetBtn = document.getElementById('resetForm');
    
    // Add passkey authentication before showing the confirm dialog
    newResetBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // First prompt for passkey authentication with a reset-specific message
      ensureAuthenticated(() => {
        createConfirmDialog({
          type: 'danger',
          icon: 'fa-trash',
          title: 'Reset Form',
          message: 'Are you sure you want to reset the form? This will clear all data and cannot be undone.',
          confirmText: 'Reset',
          cancelText: 'Cancel'
        }).then(confirmed => {
          if (!confirmed) return;
          
          // Show loading indicator
          const loadingEl = document.createElement('div');
          loadingEl.className = 'sync-loading';
          loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting data...';
          loadingEl.style = 'position:fixed; top:20px; right:20px; background:var(--danger-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
          document.body.appendChild(loadingEl);
          
          fetch('/reset-data', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
          })
          .then(response => response.json())
          .then(data => {
            // Force a complete refresh with no caching
            const reloadUrl = window.location.href.split('?')[0] + 
                           '?nocache=' + new Date().getTime();
            window.location.replace(reloadUrl);
          })
          .catch(error => {
            console.error('Error:', error);
            document.body.removeChild(loadingEl);
            createNotification('error', 'Error resetting data. Please try again.');
          });
        });
      }, "Please enter the passkey to reset all data");
    });
  }
});

// // ...existing code...

// // Add authentication helper functions and feature toggling
function isAuthenticated() {
    const localReauthUntil = localStorage.getItem('reauthUntil');
    const now = Date.now();
    if (localReauthUntil && now < parseInt(localReauthUntil)) {
        return true;
    }
    // Optionally, could ping the server here, but for UI overlays, just return false if local expired
    return false;
}

function ensureAuthenticated(callback, customMessage = "Please enter the passkey to perform this action") {
    const localReauthUntil = localStorage.getItem('reauthUntil');
    const now = Date.now();
    if (localReauthUntil && now < parseInt(localReauthUntil)) {
        enableRestrictedFeatures();
        callback();
        return;
    }
    
    // Otherwise, check with the server as before
    fetch('/current-user', { credentials: 'same-origin' })
        .then(res => res.json())
        .then(user => {
            if (user && user.logged_in) {
                fetch('/check-reauth', { method: 'GET', credentials: 'same-origin' })
                    .then(res => res.json())
                    .then(data => {
                        if (data.valid) {
                            // Optionally update local reauth window to match server
                            fetch('/set-reauth', { method: 'POST', credentials: 'same-origin' })
                                .then(res => res.json())
                                .then(setData => {
                                    if (setData.reauth_until) {
                                        localStorage.setItem('reauthUntil', new Date(setData.reauth_until).getTime());
                                    }
                                    enableRestrictedFeatures();
                                    callback();
                                });
                        } else {
                            promptForPasskey(customMessage).then(valid => {
                                if (valid) {
                                    fetch('/set-reauth', { method: 'POST', credentials: 'same-origin' })
                                        .then(res => res.json())
                                        .then(setData => {
                                            if (setData.reauth_until) {
                                                localStorage.setItem('reauthUntil', new Date(setData.reauth_until).getTime());
                                            }
                                            enableRestrictedFeatures();
                                            callback();
                                        });
                                }
                                // If passkey validation fails, do nothing - don't call callback
                            });
                        }
                    });
            } else {
                promptForPasskey(customMessage).then(valid => {
                    if (valid) {
                        fetch('/set-reauth', { method: 'POST', credentials: 'same-origin' })
                            .then(res => res.json())
                            .then(setData => {
                                if (setData.reauth_until) {
                                    localStorage.setItem('reauthUntil', new Date(setData.reauth_until).getTime());
                                }
                                enableRestrictedFeatures();
                                callback();
                            });
                    }
                    // If passkey validation fails, do nothing - don't call callback
                });
            }
        })
        .catch(() => {
            // If server is unreachable, we MUST still validate the passkey
            // We should NEVER grant access without proper validation
            promptForPasskey(customMessage).then(valid => {
                if (valid) {
                    // Only if passkey is actually valid, then we can try to reconnect
                    // and follow the normal authentication flow
                    
                    // Try to re-establish connection and set proper reauth
                    fetch('/set-reauth', { method: 'POST', credentials: 'same-origin' })
                        .then(res => res.json())
                        .then(setData => {
                            if (setData.reauth_until) {
                                localStorage.setItem('reauthUntil', new Date(setData.reauth_until).getTime());
                            }
                            enableRestrictedFeatures();
                            callback();
                        })
                        .catch(() => {
                            // If we're still offline but passkey was valid,
                            // we could set a very short temporary window as a fallback
                            // But this should be avoided if possible
                            console.warn('Still offline after valid passkey - consider UX implications');
                            
                            // Option 1: Don't grant access at all when offline
                            // (Most secure approach)
                            
                            // Option 2: Very short temporary access only if passkey was actually validated
                            // localStorage.setItem('reauthUntil', Date.now() + 2 * 60 * 1000); // 2 minutes max
                            // enableRestrictedFeatures();
                            // callback();
                        });
                }
                // If passkey validation fails, absolutely do nothing
                // No temporary access, no callback execution
            });
        });
}

function disableRestrictedFeatures() {
    // Add a global overlay to all restricted elements
    document.querySelectorAll('.impact-selector, .action-cell').forEach(el => {
        // Prevent duplicate overlays
        if (el.querySelector('.auth-required-overlay')) return;
        // First, add an overlay div to capture all clicks before they reach the element
        const overlay = document.createElement('div');
        overlay.className = 'auth-required-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.1)';
        overlay.style.zIndex = '10';
        overlay.style.cursor = 'not-allowed';
        overlay.setAttribute('data-requires-auth', 'true');
        
        // If the element doesn't have position relative, add it
        if (window.getComputedStyle(el).position === 'static') {
            el.style.position = 'relative';
        }
        
        el.appendChild(overlay);
        el.classList.add('restricted-feature');
    });
    
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.disabled = true;
    }
}

function enableRestrictedFeatures() {
    // Remove all authentication overlays
    document.querySelectorAll('.auth-required-overlay').forEach(overlay => {
        overlay.remove();
    });
    
    // Remove the restricted-feature class
    document.querySelectorAll('.restricted-feature').forEach(el => {
        el.classList.remove('restricted-feature');
    });
    
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.disabled = false;
    }
}

// Add a global click listener for all auth-required elements
document.addEventListener('click', function(e) {
    const authOverlay = e.target.closest('.auth-required-overlay');
    
    if (authOverlay) {
        e.preventDefault();
        e.stopPropagation();
        
        // Get the correct authentication message based on the element
        let authMessage = "Please enter the passkey to perform this action";
        const parentEl = authOverlay.parentElement;
        
        if (parentEl.classList.contains('impact-selector')) {
            authMessage = "Please enter the passkey to change impact priority";
        } else if (parentEl.classList.contains('action-cell')) {
            authMessage = "Please enter the passkey to edit or delete data";
        }
        
        ensureAuthenticated(() => {
            // Once authenticated, enable features and trigger the click on the original element
            enableRestrictedFeatures();
        }, authMessage);
    }
}, true); // Use capture phase to intercept events before they reach their targets

// On DOMContentLoaded, check authentication status and set up features
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication status
    if (!isAuthenticated()) {
        disableRestrictedFeatures();
    } else {
        enableRestrictedFeatures();
    }
    
    // ... SSE for logout and login updates ---
    if (window.EventSource) {
        try {
            const sse = new EventSource('/events');
            sse.addEventListener('logout', function(e) {
                // Clear local reauth cache on SSE logout
                localStorage.removeItem('reauthUntil');
                localStorage.removeItem('reauthUser');
                // Clear all local caches on logout
                if (window.historyCache) {
                    window.historyCache.invalidateCache();
                }
                // User is being logged out (session expired or admin kickout)
                showTopBarAnimation({
                    color: '#ef4444',
                    glow: true,
                    id: 'logout-activity-bar',
                    duration: 2.2,
                    gradient: 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)'
                });
                createNotification('warning', 'You have been logged out by an administrator');
                setTimeout(() => {
                    window.location.reload(); // Force reload to trigger backend session check
                }, 1000); // 1 second delay for user to see the notification
            });
            

            
            sse.addEventListener('login', function(e) {
                let data;
                try {
                    data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                } catch (err) {
                    data = e.data;
                }
                // --- removed debug logs ---
                if (data && data.username && data.last_login) {
                    // Find the user card/info for this username
                    document.querySelectorAll('.user-card').forEach(function(card) {
                        const nameEl = card.querySelector('.user-name');
                        if (nameEl && nameEl.textContent.trim() === data.username) {
                            const lastLoginEl = card.querySelector('.user-last-login b');
                            if (lastLoginEl) {
                                // Animate the refresh icon if present, or add one
                                let icon = lastLoginEl.parentElement.querySelector('.last-login-refresh');
                                if (!icon) {
                                    icon = document.createElement('i');
                                    icon.className = 'fas fa-sync-alt last-login-refresh';
                                    icon.style.marginLeft = '6px';
                                    lastLoginEl.parentElement.appendChild(icon);
                                }
                                // Robust animation
                                icon.style.display = 'inline-block';
                                icon.style.visibility = 'visible';
                                icon.style.transition = 'none';
                                icon.style.transform = 'none';
                                void icon.offsetWidth; // Force reflow
                                icon.style.transition = 'transform 1.5s cubic-bezier(0.4,2,0.6,1)';
                                icon.style.transform = 'rotate(360deg)';
                                setTimeout(() => {
                                    icon.style.transform = '';
                                }, 1500);
                                // Update the time
                                const d = new Date(data.last_login);
                                lastLoginEl.textContent = d.toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                            }
                        }
                    });
                    // Remove the manual refresh icon from the user management modal
                    document.querySelectorAll('.user-management-refresh').forEach(function(el) {
                        el.parentNode && el.parentNode.removeChild(el);
                    });
                    // Show top smooth, alive line effect
                    let bar = document.getElementById('user-login-activity-bar');
                    if (!bar) {
                        bar = document.createElement('div');
                        bar.id = 'user-login-activity-bar';
                        bar.style.position = 'fixed';
                        bar.style.top = '0';
                        bar.style.left = '50%';
                        bar.style.transform = 'translateX(-50%)';
                        bar.style.width = '0%';
                        bar.style.height = '4px';
                        bar.style.background = 'linear-gradient(90deg, #f8e1ff, #b6e0fe, #cafff3, #fff6b7, #f8e1ff 100%)';
                        bar.style.backgroundSize = '200% 200%';
                        bar.style.borderRadius = '0 0 16px 16px';
                        bar.style.zIndex = '9999';
                        bar.style.pointerEvents = 'none';
                        document.body.appendChild(bar);
                        // Add keyframes for smooth, alive effect
                        const styleSheet = document.createElement('style');
                        styleSheet.innerHTML = `@keyframes alive-bar-expand-contract {
                            0% { width: 0%; background-position: 0% 50%; opacity: 0.7; }
                            10% { width: 60%; background-position: 30% 50%; opacity: 0.85; }
                            50% { width: 100%; background-position: 100% 50%; opacity: 1; }
                            70% { width: 80%; background-position: 70% 50%; opacity: 0.85; }
                            90% { width: 40%; background-position: 30% 50%; opacity: 0.7; }
                            100% { width: 0%; background-position: 0% 50%; opacity: 0.5; }
                        }`;
                        document.head.appendChild(styleSheet);
                    }
                    bar.style.animation = 'none';
                    void bar.offsetWidth;
                    bar.style.animation = 'alive-bar-expand-contract 2.8s cubic-bezier(0.77,0,0.18,1)';
                }
            });
            
            // Add SSE event listener for history loaded notification
            sse.addEventListener('history-loaded', function(e) {
                let data;
                try {
                    data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                } catch (err) {
                    data = e.data;
                }
                
                if (data && data.timestamp && data.title) {
                    // Wait 3 seconds before showing the history notification
                    setTimeout(() => {
                        // Clear existing notifications before creating new ones
                        clearAllNotifications();
                        
                        // Wait for any existing notifications to complete their animations
                        setTimeout(() => {
                            // Create notification with separate refresh and dismiss buttons
                            const notification = createNotification(
                                'warning', 
                                `You are viewing a history item: <strong>${data.title}</strong>`, 
                                true // persistent
                            );
                            
                            // Add refresh button to the notification
                            const refreshBtn = document.createElement('button');
                            refreshBtn.className = 'notification-refresh-btn';
                            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
                            refreshBtn.title = 'Click here to refresh and view current latest data';
                            refreshBtn.addEventListener('click', function(e) {
                                e.stopPropagation();
                                window.location.reload();
                            });
                            
                            // Add dismiss button to the notification
                            const dismissBtn = document.createElement('button');
                            dismissBtn.className = 'notification-dismiss-btn';
                            dismissBtn.innerHTML = '<i class="fas fa-times"></i>';
                            dismissBtn.title = 'Dismiss this notification';
                            dismissBtn.addEventListener('click', function(e) {
                                e.stopPropagation();
                                notification.classList.remove('show');
                                setTimeout(() => notification.remove(), 300);
                            });
                            
                            notification.appendChild(refreshBtn);
                            notification.appendChild(dismissBtn);
                        }, 500); // Wait 500ms for any existing notifications to complete
                    }, 3000); // Wait 3 seconds before showing the history notification
                }
            });
        } catch (e) {
            // SSE not supported or failed
        }
    }
    // ...existing code...
});
// ... remove the global sse.addEventListener('login', ...) ...

// document.addEventListener('visibilitychange', function() {
//     if (document.visibilityState === 'visible') {
//         fetch('/current-user', { credentials: 'same-origin' })
//             .then(res => res.json())
//             .then(data => {
//                 if (!data.logged_in) {
//                     window.location.href = '/login';
//                 }
//             })
//             .catch(() => {
//                 // On error, force redirect to login as a fallback
//                 window.location.href = '/login';
//             });
//     }
// });

function showTopBarAnimation({color, glow, id, duration, gradient}) {
    // Remove any existing bar with this id
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    const bar = document.createElement('div');
    bar.id = id;
    bar.style.position = 'fixed';
    bar.style.top = '0';
    bar.style.left = '50%';
    bar.style.transform = 'translateX(-50%)';
    bar.style.width = '0%';
    bar.style.height = '6px';
    bar.style.zIndex = '99999';
    bar.style.pointerEvents = 'none';
    bar.style.borderRadius = '0 0 16px 16px';
    bar.style.background = gradient || color;
    if (glow) {
        bar.style.boxShadow = '0 0 16px 4px ' + color + 'cc, 0 0 32px 8px ' + color + 'aa';
    }
    document.body.appendChild(bar);
    // Add keyframes for smooth, alive effect
    const styleSheet = document.createElement('style');
    styleSheet.innerHTML = `@keyframes top-bar-expand-contract-${id} {
        0% { width: 0%; opacity: 0.7; }
        10% { width: 60%; opacity: 0.85; }
        50% { width: 100%; opacity: 1; }
        70% { width: 80%; opacity: 0.85; }
        90% { width: 40%; opacity: 0.7; }
        100% { width: 0%; opacity: 0.5; }
    }`;
    document.head.appendChild(styleSheet);
    bar.style.animation = `top-bar-expand-contract-${id} ${duration || 2.2}s cubic-bezier(.4,2,.6,1)`;
    setTimeout(() => { bar.remove(); styleSheet.remove(); }, (duration || 2.2) * 1000);
}

// ... existing code ...
if (window.sseSource) window.sseSource.close();
window.sseSource = new EventSource('/events');
window.sseSource.addEventListener('logout', function(e) {
    // Clear local reauth cache on SSE logout
    localStorage.removeItem('reauthUntil');
    localStorage.removeItem('reauthUser');
    // Clear all local caches on logout
    if (window.historyCache) {
        window.historyCache.invalidateCache();
    }
    // User is being logged out (session expired or admin kickout)
    showTopBarAnimation({
        color: '#ef4444',
        glow: true,
        id: 'logout-bar',
        duration: 4.6,
        gradient: 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)'
    });
    setTimeout(function() { window.location.href = '/login'; }, 1200);
});
window.sseSource.addEventListener('user-logout', function(e) {
    // Admin sees when any user is logged out
    const data = JSON.parse(e.data || '{}');
    showTopBarAnimation({
        color: '#ef4444',
        glow: true,
        id: 'logout-bar',
        duration: 4.6,
        gradient: 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)'
    });
    // Optionally, show a notification to the admin
    if (window.createNotification) {
        createNotification(`User <b>${data.username}</b> was logged out by <b>${data.by}</b>.`, 'info', 3500);
    }
});
// ... existing code ...

document.addEventListener('DOMContentLoaded', function() {
    const headerTitle = document.getElementById('headerTitle');
    if (headerTitle) {
        headerTitle.style.cursor = 'pointer';
        headerTitle.addEventListener('click', function() {
            if (headerTitle.isContentEditable) {
                headerTitle.focus();
                return;
            }
            openHistoryModal(true);
        });
    }
    // ...existing code...
});
// ... existing code ...

// Add a function to show a custom notch notification at the top center
// Add a function to show a custom notch notification at the top center
let wasOffline = false; // Track if we were offline

function showOfflineNotch(backOnline = false) {
    // Remove any existing notch
    const existing = document.getElementById('offline-notch');
    if (existing) existing.remove();
    
    // Create the notch container
    const notch = document.createElement('div');
    notch.id = 'offline-notch';
    notch.className = 'offline-notch';
    
    // Create WiFi icon using SVG
    const wifiIcon = document.createElement('div');
    wifiIcon.className = 'offline-notch-wifi';
    
    if (backOnline) {
        // Full WiFi icon when back online - using Unicode symbol
        wifiIcon.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 9C4.5 5.5 7.75 4 12 4C16.25 4 19.5 5.5 23 9" stroke="rgba(255,255,255,0.9)" stroke-width="2" stroke-linecap="round"/>
                <path d="M5 13C7.5 10.5 9.75 9.5 12 9.5C14.25 9.5 16.5 10.5 19 13" stroke="rgba(255,255,255,0.9)" stroke-width="2" stroke-linecap="round"/>
                <path d="M8.5 16.5C10 15 11 14.5 12 14.5C13 14.5 14 15 15.5 16.5" stroke="rgba(255,255,255,0.9)" stroke-width="2" stroke-linecap="round"/>
                <circle cx="12" cy="19" r="1.5" fill="rgba(255,255,255,0.9)"/>
            </svg>
        `;
        // Explicitly remove any animation
        wifiIcon.style.animation = 'none';
    } else {
        // Weak WiFi icon when offline
        wifiIcon.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 9C4.5 5.5 7.75 4 12 4C16.25 4 19.5 5.5 23 9" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round"/>
                <path d="M5 13C7.5 10.5 9.75 9.5 12 9.5C14.25 9.5 16.5 10.5 19 13" stroke="rgba(255,255,255,0.4)" stroke-width="2" stroke-linecap="round"/>
                <path d="M8.5 16.5C10 15 11 14.5 12 14.5C13 14.5 14 15 15.5 16.5" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round"/>
                <circle cx="12" cy="19" r="1.5" fill="rgba(255,255,255,0.6)"/>
            </svg>
        `;
        wifiIcon.classList.add('offline-notch-wifi-pulse');
    }
    
    // Remove inline <style> and use CSS classes for keyframes/animations
    
    // Create text content
    const textSpan = document.createElement('span');
    textSpan.className = 'offline-notch-text';
    if (backOnline) {
        textSpan.textContent = 'Back online!';
    } else {
        textSpan.innerHTML = `
            Lost connection. Retrying<span class="dots">
                <span class="offline-notch-dot" style="animation-delay:0s;">.</span><span class="offline-notch-dot" style="animation-delay:0.2s;">.</span><span class="offline-notch-dot" style="animation-delay:0.4s;">.</span>
            </span>
        `;
    }
    
    // Assemble the notch
    notch.appendChild(wifiIcon);
    notch.appendChild(textSpan);
    document.body.appendChild(notch);
    
    // Animate in
    requestAnimationFrame(() => {
        if (backOnline) {
            notch.classList.add('offline-notch-slide-in');
        } else {
            notch.classList.add('offline-notch-bounce');
        }
    });
    
    // Only auto-hide if backOnline, otherwise keep visible
    if (backOnline) {
        setTimeout(() => {
            notch.classList.remove('offline-notch-slide-in');
            notch.classList.add('offline-notch-slide-up');
            setTimeout(() => {
                if (notch.parentNode) {
                    notch.parentNode.removeChild(notch);
                }
            }, 500);
        }, 4000);
    }
}

// Function to hide the notch manually
function hideOfflineNotch() {
    const notch = document.getElementById('offline-notch');
    if (notch) {
        notch.classList.add('offline-notch-slide-up');
        setTimeout(() => {
            if (notch.parentNode) {
                notch.parentNode.removeChild(notch);
            }
        }, 500);
    }
}
// ... existing code ...

// Periodically check if reauth is expired and update overlays accordingly
setInterval(function() {
    if (isAuthenticated()) {
        enableRestrictedFeatures();
    } else {
        disableRestrictedFeatures();
    }
}, 2000);



// ... existing code ...
// Example usage:
// showOfflineNotch() - shows offline notification
// showOfflineNotch(true) - shows back online notification

document.addEventListener('DOMContentLoaded', function() {
    fetch('/check-reauth', { credentials: 'same-origin' })
        .then(res => {
            if (!res.ok) throw new Error('Not authenticated');
            return res.json();
        })
        .then(data => {
            if (!data.valid) {
                localStorage.removeItem('reauthUntil');
            }
        })
        .catch(() => {
            // If the server is unreachable or session is invalid, clear local reauth
            localStorage.removeItem('reauthUntil');
        });
    // ...existing code...
});