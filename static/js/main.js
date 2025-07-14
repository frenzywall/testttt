// Import Luxon library for DateTime operations
const { DateTime } = luxon || window.luxon;

const modal = document.getElementById('emailModal');
const viewOriginalBtn = document.getElementById('viewOriginal');
const closeBtn = document.querySelector('#emailModal .close');
const confirmDialog = document.getElementById('deleteConfirmDialog');
let rowToDelete = null;

viewOriginalBtn.onclick = function() {
    ensureAuthenticated(() => {
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


document.querySelectorAll('th.sortable').forEach(header => {
    header.addEventListener('click', function() {
    const table = this.closest('table');
    const index = Array.from(this.parentNode.children).indexOf(this);
    const isAsc = this.classList.contains('sorted-asc');
    
    
    table.querySelectorAll('th').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
    });
    
    
    this.classList.add(isAsc ? 'sorted-desc' : 'sorted-asc');
    
    
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    rows.sort((a, b) => {
        const aValue = a.cells[index].textContent;
        const bValue = b.cells[index].textContent;
        
        if (isAsc) {
        return bValue.localeCompare(aValue);
        } else {
        return aValue.localeCompare(bValue);
        }
    });
    
    
    const tbody = table.querySelector('tbody');
    rows.forEach(row => tbody.appendChild(row));
    
    
    rows.forEach(row => {
        row.classList.add('highlight-row');
        setTimeout(() => row.classList.remove('highlight-row'), 1500);
    });
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
                comments: cells[4].textContent,
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

document.querySelectorAll('th.sortable').forEach(header => {
    header.addEventListener('click', function() {
    const table = this.closest('table');
    const index = Array.from(this.parentNode.children).indexOf(this);
    const isAsc = this.classList.contains('sorted-asc');
    
    table.querySelectorAll('th').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
    });
    
    this.classList.add(isAsc ? 'sorted-desc' : 'sorted-asc');
    
    const rows = Array.from(table.querySelectorAll('tbody tr:not(.empty-state)'));
    rows.sort((a, b) => {
        if (index === 5) {
        const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
        const aPriority = a.getAttribute('data-priority');
        const bPriority = b.getAttribute('data-priority');
        
        if (isAsc) {
            return priorityOrder[bPriority] - priorityOrder[aPriority];
        } else {
            return priorityOrder[aPriority] - priorityOrder[bPriority];
        }
        } else {
        const aValue = a.cells[index].textContent;
        const bValue = b.cells[index].textContent;
        
        if (isAsc) {
            return bValue.localeCompare(aValue);
        } else {
            return aValue.localeCompare(bValue);
        }
        }
    });
    
    const tbody = table.querySelector('tbody');
    rows.forEach(row => tbody.appendChild(row));
    
    rows.forEach(row => applyRowHighlight(row));
    
    applyActiveFilter();
    });
});

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
        
        // Handle time ranges (e.g., "08:00-10:00")
        if (timeStr.includes('-')) {
            const [start, end] = timeStr.split('-');
            const convertedStart = convertTimezone(start.trim(), dateStr, fromTz, toTz);
            const convertedEnd = end.trim() ? convertTimezone(end.trim(), dateStr, fromTz, toTz) : "-";
            return `${convertedStart}-${convertedEnd}`;
        }

        // Parse the DateTime object using the 24-hour format
        const dt = DateTime.fromFormat(`${dateStr} ${timeStr}`, 'yyyy-MM-dd HH:mm', {
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

const infoModal = document.getElementById('infoModal');
const howItWorksBtn = document.getElementById('howItWorksBtn');

howItWorksBtn.onclick = function() {
    infoModal.style.display = "block";
}

window.onclick = function(event) {
    if (event.target == infoModal) {
    infoModal.style.display = "none";
    }
    if (event.target == modal) {
    modal.style.display = "none";
    }
}

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
    if (infoModal.style.display === "block") {
        infoModal.style.display = "none";
    }
    if (modal.style.display === "block") {
        modal.style.display = "none";
    }
    }
});

document.getElementById('downloadHtml').addEventListener('click', function() {
    const styleSheets = Array.from(document.styleSheets);
    let styles = '';
    styleSheets.forEach(sheet => {
    try {
        Array.from(sheet.cssRules).forEach(rule => {
        styles += rule.cssText;
        });
    } catch (e) {
        console.log('Could not read stylesheet:', e);
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
    headerTitle.contentEditable = false;
    headerTitle.classList.remove('editable');
    editHeaderBtn.style.display = 'flex';
    saveHeaderBtn.style.display = 'none';
    fetch('/save-title', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        title: headerTitle.textContent
    })
    });
});

headerTitle.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
    e.preventDefault();
    saveHeaderBtn.click();
    } else if (e.key === 'Escape') {
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
function syncAllDataToRedis() {
const tableRows = document.querySelectorAll('#changeTable tbody tr:not(.empty-state)');
const services = [];

// If there are no rows, don't proceed
if (tableRows.length === 0) {
    createNotification('info', 'No data to sync.');
    return false;
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

// Create the data object
const data = {
services: services,
date: services.length > 0 ? services[0].end_date : new Date().toISOString().split('T')[0],
header_title: headerTitle,
original_body: originalBody
};

// Show loading animation
const loadingEl = document.createElement('div');
loadingEl.className = 'sync-loading';
loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> syncing data...';
loadingEl.style = 'position:fixed; top:20px; right:20px; background:var(--primary-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
document.body.appendChild(loadingEl);

// Send to server
fetch('/sync-all-data', {
method: 'POST',
headers: {
    'Content-Type': 'application/json'
},
body: JSON.stringify(data)
})
.then(response => response.json())
.then(result => {
document.body.removeChild(loadingEl);
if (result.status === 'success') {
    const successEl = document.createElement('div');
    successEl.className = 'sync-success';
    successEl.innerHTML = '<i class="fas fa-check-circle"></i> Data synced successfully!';
    successEl.style = 'position:fixed; top:20px; right:20px; background:var(--success-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
    document.body.appendChild(successEl);
    setTimeout(() => {
        document.body.removeChild(successEl);
    }, 3000);
} else {
    alert('Error syncing data: ' + (result.message || 'Unknown error'));
}
})
.catch(error => {
document.body.removeChild(loadingEl);
console.error('Error:', error);
alert('Error syncing data. Please try again.');
});
}

// Add event listener for the sync button
document.addEventListener('DOMContentLoaded', function() {
const syncBtn = document.getElementById('syncData');
if (syncBtn) {
syncBtn.addEventListener('click', syncAllDataToRedis);
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

// Replace the syncAllDataToRedis function with this improved version
function syncAllDataToRedis() {
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

// Create the data object
const data = {
services: services,
date: services.length > 0 ? services[0].end_date : new Date().toISOString().split('T')[0],
header_title: headerTitle,
original_body: originalBody
};

// Show loading animation
const loadingEl = document.createElement('div');
loadingEl.className = 'sync-loading';
loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> fetching latest data from redis...';
loadingEl.style = 'position:fixed; top:20px; right:20px; background:var(--primary-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
document.body.appendChild(loadingEl);

// Disable any unsaved changes warnings
window.onbeforeunload = null;

// Send to server
fetch('/sync-all-data', {
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
    // Update the timestamp
    document.getElementById('dataTimestamp').value = result.timestamp;
    
    const successEl = document.createElement('div');
    successEl.className = 'sync-success';
    successEl.innerHTML = '<i class="fas fa-check-circle"></i> Data synced successfully!';
    successEl.style = 'position:fixed; top:20px; right:20px; background:var(--success-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
    document.body.appendChild(successEl);
    
    // Ask the user if they want to reload for a fresh state
    if (confirm('Data uploaded successfully! Reload page to ensure you have the latest data :)')) {
        // Force a complete refresh with no caching
        const reloadUrl = window.location.href.split('?')[0] + '?nocache=' + Date.now();
        window.location.replace(reloadUrl);
    } else {
        // Just remove the success message after a delay
        setTimeout(() => {
            document.body.removeChild(successEl);
        }, 3000);
    }
} else {
    alert('Error syncing data: ' + (result.message || 'Unknown error'));
}
})
.catch(error => {
document.body.removeChild(loadingEl);
console.error('Error:', error);
alert('Error syncing data. Please try again.');
});
}

// Add a function to periodically check for updates from other tabs
function setupUpdateChecker() {
const checkInterval = 10000; // Check every 10 seconds

function checkForUpdates() {
const currentTimestamp = document.getElementById('dataTimestamp').value;

fetch(`/check-updates?since=${currentTimestamp}&_=${Date.now()}`, {
    method: 'GET',
    cache: 'no-store'
})
.then(response => response.json())
.then(data => {
    if (data.updated) {
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
})
.catch(error => console.error('Error checking for updates:', error));
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
        
        // Handle dropdown item clicks
        document.getElementById('syncToRedis').addEventListener('click', function() {
            syncAllDataToRedis(false); // Regular sync without history
            const dropdownParent = syncDropdown.parentElement;
            if (dropdownParent) {
                dropdownParent.classList.remove('open');
            }
        });
        
        document.getElementById('syncToHistory').addEventListener('click', function() {
            syncAllDataToRedis(true); // Sync and save to history
            const dropdownParent = syncDropdown.parentElement;
            if (dropdownParent) {
                dropdownParent.classList.remove('open');
            }
        });
        
        document.getElementById('viewHistory').addEventListener('click', function() {
            openHistoryModal();
            const dropdownParent = syncDropdown.parentElement;
            if (dropdownParent) {
                dropdownParent.classList.remove('open');
            }
        });
    }
    
    // History modal
    const historyModal = document.getElementById('historyModal');
    const historyModalClose = historyModal.querySelector('.close');
    
    historyModalClose.addEventListener('click', function() {
        historyModal.style.display = "none";
    });
    
    window.addEventListener('click', function(event) {
        if (event.target === historyModal) {
            historyModal.style.display = "none";
        }
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && historyModal.style.display === "block") {
            historyModal.style.display = "none";
        }
    });
    
    // History search functionality
    const historySearch = document.getElementById('historySearch');
    const historyClearSearch = document.getElementById('historyClearSearch');
    
    historySearch.addEventListener('input', function() {
        filterHistoryItems(this.value);
    });
    
    historyClearSearch.addEventListener('click', function() {
        historySearch.value = '';
        filterHistoryItems('');
    });
});

// Enhanced version of syncAllDataToRedis to support history
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
    
    // Create the data object
    const data = {
        services: services,
        date: services.length > 0 ? services[0].end_date : new Date().toISOString().split('T')[0],
        header_title: headerTitle,
        original_body: originalBody
    };
    
    // Show loading animation
    const loadingEl = document.createElement('div');
    loadingEl.className = 'sync-loading';
    loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + 
                         (saveToHistory ? 'Syncing & saving to history...' : 'Syncing data...');
    loadingEl.style = 'position:fixed; top:20px; right:20px; background:var(--primary-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
    document.body.appendChild(loadingEl);
    
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
            // Update the timestamp
            document.getElementById('dataTimestamp').value = result.timestamp;
            
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
            alert('Error syncing data: ' + (result.message || 'Unknown error'));
        }
    })
    .catch(error => {
        document.body.removeChild(loadingEl);
        console.error('Error:', error);
        alert('Error syncing data. Please try again.');
    });
}

// Open history modal and load history items
function openHistoryModal(viewOnly = false) {
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
        if (history.length === 0) {
            historyList.innerHTML = `
                <div class="empty-history">
                    <i class="fas fa-inbox"></i>
                    <p>No synced history items found</p>
                </div>
            `;
            return;
        }
        
        // Populate history items
        historyList.innerHTML = '';
        history.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.dataset.timestamp = item.timestamp;
            
            const serviceCount = item.data?.services?.length || 0;
            
            // NEW: Convert saved UTC date to local timezone using the system's tz.
            let formattedDate = 'Unknown date';
            if (item.date) {
                const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                formattedDate = DateTime.fromFormat(item.date, "yyyy-MM-dd HH:mm:ss", {zone: 'utc'})
                                        .setZone(localTz)
                                        .toFormat("yyyy-MM-dd, hh:mm a") + " (" + localTz + ")";            }
            
            historyItem.innerHTML = `
                <div class="history-item-header">
                    <div class="history-item-title">
                        <span class="history-item-badge"></span>
                        ${item.title || 'Change Weekend'}
                    </div>
                    <div class="history-item-date">${formattedDate}</div>
                </div>
                <div class="history-item-summary">
                    ${serviceCount} service${serviceCount !== 1 ? 's' : ''} included
                </div>
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
                loadHistoryItem(timestamp, viewOnly); // pass flag here
            });
        });
        
        // Add event listeners to delete buttons
        if (!viewOnly) {
            document.querySelectorAll('.history-item-btn.delete').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const timestamp = this.closest('.history-item').dataset.timestamp;
                    deleteHistoryItem(timestamp, this.closest('.history-item')); // This will use our new custom dialog
                });
            });
        } else {
            // hide delete buttons in view‐only mode
            document.querySelectorAll('.history-item-btn.delete').forEach(btn => btn.remove());
        }
        
        // Make whole item clickable to expand (future enhancement)
        document.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', function(e) {
                if (!e.target.closest('.history-item-btn')) {
                    // Future: toggle expanded view with more details
                }
            });
        });
    })
    .catch(error => {
        console.error('Error loading history:', error);
        historyList.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                <p>Error loading history. Please try again.</p>
            </div>
        `;
    });
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
                                    <p>No synced history items found</p>
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
                    alert('Error deleting history item: ' + (result.message || 'Unknown error'));
                }
            }, 1200); 
        })
        .catch(error => {
            document.body.removeChild(loadingEl);
            console.error('Error:', error);
            alert('Error deleting history item. Please try again.');
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
    // Handle dropdown item clicks
    document.getElementById('syncToRedis').addEventListener('click', function() {
        syncAllDataToRedis(false); // Regular sync without history
        if (dropdownParent) {
            dropdownParent.classList.remove('open');
        }
    });
    
    document.getElementById('syncToHistory').addEventListener('click', function() {
        syncAllDataToRedis(true); // Sync and save to history
        if (dropdownParent) {
            dropdownParent.classList.remove('open');
        }
    });
    
    document.getElementById('viewHistory').addEventListener('click', function() {
        openHistoryModal();
        if (dropdownParent) {
            dropdownParent.classList.remove('open');
        }
    });
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
function createNotification(type, message, persistent = false) {
  // Remove existing notifications of the same type
  const existingNotifications = document.querySelectorAll(`.notification.${type}:not(.persistent)`);
  existingNotifications.forEach(note => note.remove());
  
  // Create new notification
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  if (persistent) {
    notification.classList.add('persistent');
  }
  
  // Add appropriate icon based on type
  let icon = 'fa-info-circle';
  if (type === 'error') icon = 'fa-exclamation-circle';
  if (type === 'success') icon = 'fa-check-circle';
  
  notification.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
  document.body.appendChild(notification);
  
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
          // Close dialog with success
          dialogOverlay.classList.remove('active');
          setTimeout(() => {
            dialogOverlay.remove();
            createNotification('success', 'Authentication successful!');
            resolve(true);
          }, 500);
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
          createNotification('error', 'Error validating passkey. Please try again.');
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

// Update the resetForm event listener to require a passkey and use our custom dialog
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

// ...existing code...

// Add authentication helper functions and feature toggling
function isAuthenticated() {
    const authUntil = localStorage.getItem('authUntil');
    return authUntil && Date.now() < parseInt(authUntil);
}

function ensureAuthenticated(callback, customMessage = "Please enter the passkey to perform this action") {
    if (isAuthenticated()) {
        callback();
    } else {
        promptForPasskey(customMessage).then(valid => {
            if (valid) {
                const expiry = Date.now() + (10 * 60 * 1000); // 10 minutes expiry
                localStorage.setItem('authUntil', expiry);
                enableRestrictedFeatures();
                callback();
            }
        });
    }
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
    
    // Set up periodic check for auth expiration
    setInterval(() => {
        if (!isAuthenticated() && !document.querySelector('.auth-required-overlay')) {
            disableRestrictedFeatures();
        }
    }, 30000); // Check every 30 seconds
    
    // ...existing code...
});

// On page load, make header title clickable for view‐only history
document.addEventListener('DOMContentLoaded', function() {
    const headerTitle = document.getElementById('headerTitle');
    if (headerTitle) {
        headerTitle.style.cursor = 'pointer';
        headerTitle.addEventListener('click', function() {
            if (headerTitle.isContentEditable) return; // Prevent history modal if editing
            openHistoryModal(true);
        });
    }
    
    // ...existing code...
});

// --- Ensure overlays are applied immediately ---
disableRestrictedFeatures();

