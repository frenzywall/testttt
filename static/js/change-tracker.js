/**
 * Change Tracker - Tracks unsaved changes and provides sync status indicators
 */

// State management
const ChangeTracker = {
    // Track whether there are unsaved changes
    hasUnsavedChanges: false,
    
    // Track whether a sync operation is in progress
    isSyncing: false,
    
    // Status element references
    statusIndicator: null,
    statusText: null,
    
    // Track the number of detected changes
    changeCount: 0,
    
    // Initialize the change tracker
    init: function() {
        this.createStatusIndicator();
        this.attachEventListeners();
        this.checkInitialState();
    },
    
    // Create the status indicator UI
    createStatusIndicator: function() {
        // Create container
        const indicator = document.createElement('div');
        indicator.className = 'git-status-indicator';
        indicator.innerHTML = `
            <div class="git-status-icon">
                <i class="fas fa-code-branch"></i>
            </div>
            <div class="git-status-stages">
                <div class="git-stage git-stage-local active">
                    <i class="fas fa-desktop"></i>
                    <span>Local</span>
                </div>
                <div class="git-stage-arrow">→</div>
                <div class="git-stage git-stage-staged">
                    <i class="fas fa-box"></i>
                    <span>Staged</span>
                </div>
                <div class="git-stage-arrow">→</div>
                <div class="git-stage git-stage-synced">
                    <i class="fas fa-cloud"></i>
                    <span>Synced</span>
                </div>
            </div>
            <div class="git-change-count">0</div>
        `;
        
        // Add to the page - insert it inside the filter controls container
        const filterControls = document.querySelector('.filter-controls');
        if (filterControls) {
            // Add the indicator as a direct child of filter controls
            filterControls.appendChild(indicator);
            
            // Make filter controls a flex container if it's not already
            if (window.getComputedStyle(filterControls).display !== 'flex') {
                filterControls.style.display = 'flex';
                filterControls.style.flexWrap = 'wrap';
                filterControls.style.alignItems = 'center';
            }
            
            // Add margin to separate it from filter buttons
            indicator.style.marginLeft = 'auto'; // This will push it to the right
        } else {
            // Fallback - add to the header
            const headerContainer = document.querySelector('.header');
            if (headerContainer) {
                headerContainer.appendChild(indicator);
            }
        }
        
        // Save references
        this.statusIndicator = indicator;
        this.statusText = indicator.querySelector('.git-change-count');
        
        // Initialize with no changes
        this.updateStatus('no-changes');
    },
    
    // Update the status indicator
    updateStatus: function(status) {
        if (!this.statusIndicator) return;
        
        // Reset all stages
        this.statusIndicator.querySelectorAll('.git-stage').forEach(stage => {
            stage.classList.remove('active', 'complete', 'processing');
        });
        
        // Update based on status
        switch (status) {
            case 'no-changes':
                this.statusIndicator.classList.remove('has-changes', 'syncing', 'synced');
                this.statusIndicator.querySelector('.git-stage-local').classList.add('active');
                this.changeCount = 0;
                this.statusText.textContent = '0';
                this.statusText.setAttribute('title', 'No changes');
                this.hasUnsavedChanges = false;
                break;
                
            case 'unsaved':
                this.statusIndicator.classList.add('has-changes');
                this.statusIndicator.classList.remove('syncing', 'synced');
                this.statusIndicator.querySelector('.git-stage-local').classList.add('active');
                this.statusIndicator.querySelector('.git-stage-staged').classList.add('active');
                this.changeCount++;
                this.statusText.textContent = this.changeCount.toString();
                this.statusText.setAttribute('title', `${this.changeCount} change(s) ready to sync`);
                this.hasUnsavedChanges = true;
                break;
                
            case 'syncing':
                this.statusIndicator.classList.add('syncing');
                this.statusIndicator.classList.remove('synced');
                this.statusIndicator.querySelector('.git-stage-local').classList.add('complete');
                this.statusIndicator.querySelector('.git-stage-staged').classList.add('complete');
                this.statusIndicator.querySelector('.git-stage-synced').classList.add('processing');
                this.statusText.setAttribute('title', 'Syncing changes...');
                this.isSyncing = true;
                break;
                
            case 'synced':
                this.statusIndicator.classList.remove('has-changes', 'syncing');
                this.statusIndicator.classList.add('synced');
                this.statusIndicator.querySelector('.git-stage-local').classList.add('complete');
                this.statusIndicator.querySelector('.git-stage-staged').classList.add('complete');
                this.statusIndicator.querySelector('.git-stage-synced').classList.add('complete');
                this.changeCount = 0;
                this.statusText.textContent = '✓';
                this.statusText.setAttribute('title', 'All changes synced');
                this.hasUnsavedChanges = false;
                this.isSyncing = false;
                
                // Auto-revert to "no changes" after 5 seconds
                setTimeout(() => {
                    this.updateStatus('no-changes');
                }, 5000);
                break;
        }
    },
    
    // Mark that changes need to be synced
    markUnsaved: function() {
        this.updateStatus('unsaved');
        this.addBeforeUnloadWarning();
    },
    
    // Mark that changes are being synced
    markSyncing: function() {
        this.updateStatus('syncing');
    },
    
    // Mark that changes have been synced
    markSynced: function() {
        this.updateStatus('synced');
        this.removeBeforeUnloadWarning();
    },
    
    // Reset the counter to zero (for when table is empty)
    resetCounter: function() {
        this.changeCount = 0;
        this.updateStatus('no-changes');
        this.removeBeforeUnloadWarning();
    },
    
    // Add warning before page unload if there are unsaved changes
    addBeforeUnloadWarning: function() {
        window.onbeforeunload = function() {
            return 'You have unsaved changes. Are you sure you want to leave?';
        };
    },
    
    // Remove warning before page unload
    removeBeforeUnloadWarning: function() {
        window.onbeforeunload = null;
    },
    
    // Check the DOM for any indicators of unsaved content
    checkInitialState: function() {
        // If there are any editable cells currently active, mark as unsaved
        if (document.querySelector('td.editable')) {
            this.markUnsaved();
        }
    },
    
    // Helper function to check if a row is empty
    isEmptyRow: function(row) {
        if (!row) return false;
        
        // Get only the content cells (first 6 cells - exclude impact priority and actions)
        // Assuming structure: service, date, start time, end time, end date, comments, impact, actions
        const contentCells = Array.from(row.cells).slice(0, 6);

        return contentCells.every(cell => {
            const content = cell.textContent.trim();
            // Consider various forms of empty content
            return content === '' || 
                   content === '-' || 
                   content === '–' || // en dash
                   content === 'N/A' ||
                   content === 'n/a';
        });
    },
    
    // Helper function to check if a row is newly added and unsaved
    isUnsavedNewRow: function(row) {
        if (!row) return false;
        
        // Newly added rows have their save button visible
        const saveBtn = row.querySelector('.save-btn');
        const isSaveBtnVisible = saveBtn && 
            window.getComputedStyle(saveBtn).display !== 'none';
        
        // Check both if save button is visible and the row is empty
        const result = isSaveBtnVisible && this.isEmptyRow(row);
        
        return result;
    },
    
    // Store original values before editing
    storeOriginalValues: function(row) {
        if (!row) return;
        
        row.originalValues = Array.from(row.cells).map(cell => cell.textContent.trim());
    },
    
    // Compare original and current values
    hasRowChanged: function(row) {
        if (!row || !row.originalValues) return true; // If no original values, consider it changed
        
        const currentValues = Array.from(row.cells).map(cell => cell.textContent.trim());
        
        return !row.originalValues.every((originalValue, index) => originalValue === currentValues[index]);
    },
    
    // Attach event listeners to detect changes
    attachEventListeners: function() {
        // Listen for edit and save to the header title
        const editHeaderBtn = document.getElementById('editHeaderBtn');
        const saveHeaderBtn = document.getElementById('saveHeaderBtn');
        let originalTitle = '';

        if (editHeaderBtn) {
            editHeaderBtn.addEventListener('click', () => {
                // Store the original title when edit begins
                originalTitle = document.querySelector('.header-title').textContent.trim();
            });
        }

        if (saveHeaderBtn) {
            saveHeaderBtn.addEventListener('click', () => {
                // Compare with the new title after save
                const newTitle = document.querySelector('.header-title').textContent.trim();
                
                // Compare the titles and only mark as unsaved if changed
                if (originalTitle !== newTitle) {
                    this.markUnsaved();
                }
            });
        }

        // Listen for save buttons in the table rows
        document.addEventListener('click', event => {
            const saveBtn = event.target.closest('.save-btn');
            if (saveBtn) {
                const row = saveBtn.closest('tr');
                
                // Only mark as unsaved if the row has actually changed
                if (this.hasRowChanged(row)) {
                    this.markUnsaved();
                }
                
                // Clear original values after save
                row.originalValues = null;
            }
        });
        
        // Listen for edit buttons in the table rows
        document.addEventListener('click', event => {
            const editBtn = event.target.closest('.edit-btn');
            if (editBtn) {
                const row = editBtn.closest('tr');
                this.storeOriginalValues(row);
            }
        });
        
        // Listen for impact priority changes
        document.addEventListener('click', event => {
            const impactOption = event.target.closest('.impact-option');
            if (impactOption && !impactOption.classList.contains('selected')) {
                this.markUnsaved();
            }
        });
        
        // Listen for row addition - but DON'T increase counter immediately
        // REMOVED the addRowBtn event listener that immediately marks as unsaved
        
        // Listen for row deletion - Only track changes after confirmation
        document.addEventListener('click', event => {
            const deleteBtn = event.target.closest('.delete-btn');
            if (deleteBtn) {
                // Store a reference to the row being deleted
                this.rowToDelete = deleteBtn.closest('tr');
            }
        });
        
        // Listen for delete confirmation buttons
        document.addEventListener('click', event => {
            // Look for confirmation button in delete confirmation dialog
            const confirmDeleteBtn = event.target.closest('.confirm-delete-btn, .delete-confirm-btn');
            if (confirmDeleteBtn && this.rowToDelete) {
                
                // Only mark as unsaved if:
                // 1. The row is not empty
                // 2. The row is not a newly added, unsaved row
                const isEmpty = this.isEmptyRow(this.rowToDelete);
                const isUnsaved = this.isUnsavedNewRow(this.rowToDelete);
                
                if (!isEmpty && !isUnsaved) {
                    this.markUnsaved();
                } else if (isEmpty) {
                    this.decrementCount();   // decrement when an empty row is removed
                }
                
                // Clear the reference after handling
                this.rowToDelete = null;
            }
        });
        
        // Hook into the sync function to update status during sync
        this.hookSyncFunction();
    },
    
    // Hook into the existing syncAllDataToRedis function
    hookSyncFunction: function() {
        // Wait for the document to be fully loaded
        if (typeof syncAllDataToRedis !== 'function') {
            setTimeout(() => this.hookSyncFunction(), 500);
            return;
        }

        // Store the original function
        const originalSyncFunction = window.syncAllDataToRedis;
        
        // Replace with our wrapped version
        window.syncAllDataToRedis = (saveToHistory) => {
            // Update status to syncing
            this.markSyncing();
            
            // Call the original function and capture its result
            try {
                // Look for the sync success element being added to the DOM
                const observer = new MutationObserver((mutations) => {
                    for (const mutation of mutations) {
                        if (mutation.addedNodes.length) {
                            for (const node of mutation.addedNodes) {
                                if (node.nodeType === Node.ELEMENT_NODE && 
                                    (node.classList.contains('sync-success') || 
                                     node.innerHTML.includes('Data synced successfully'))) {
                                    this.markSynced();
                                    observer.disconnect();
                                }
                            }
                        }
                    }
                });
                
                // Start observing the document body
                observer.observe(document.body, { childList: true, subtree: true });
                
                // Execute the original sync function
                const result = originalSyncFunction(saveToHistory);
                
                // If the sync function returns a promise, handle that
                if (result && typeof result.then === 'function') {
                    return result.then(data => {
                        this.markSynced();
                        return data;
                    }).catch(error => {
                        this.markUnsaved(); // Revert to unsaved on error
                        throw error;
                    });
                }
                
                return result;
            } catch (error) {
                this.markUnsaved(); // Revert to unsaved on error
                throw error;
            }
        };
    },

    // decrement counter helper
    decrementCount: function() {
        if (this.changeCount > 0) {
            this.changeCount--;
            this.statusText.textContent = this.changeCount.toString();
            this.statusText.setAttribute('title', `${this.changeCount} change(s) ready to sync`);
            if (this.changeCount === 0) {
                this.updateStatus('no-changes');
            }
        }
    }
};

// Initialize the change tracker when the document is ready
document.addEventListener('DOMContentLoaded', function() {
    ChangeTracker.init();
});

// Export the ChangeTracker for use in other scripts
window.ChangeTracker = ChangeTracker;
