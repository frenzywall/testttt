/**
 * Table module - Handles table operations and interactions
 */

/**
 * Initializes table functionality
 */
function initTable() {
    initSortableColumns();
    initAddRowButton();
    initTableRowActions();
    initFilterControls();
    checkEmptyTable();
    // bind impact-selector click handlers on initial rows
    document.querySelectorAll('#changeTable tbody tr:not(.empty-state)').forEach(initImpactSelector);
  }
  
  /**
   * Initializes sortable columns in the table
   */
  function initSortableColumns() {
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
        
        rows.forEach(row => Core.applyRowHighlight(row));
        
        applyActiveFilter();
      });
    });
  }
  
  /**
   * Initializes the Add Row button
   */
  function initAddRowButton() {
    const addRowBtn = document.getElementById('addRow');
    if (addRowBtn) {
      addRowBtn.addEventListener('click', function() {
        Auth.ensureAuthenticated(() => {
          const tbody = document.querySelector('tbody');
          const newRow = document.createElement('tr');
          newRow.setAttribute('data-priority', 'low');
          newRow.setAttribute('data-new', 'true'); // mark as new row
          
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
  
          Core.applyRowHighlight(newRow);
  
          initImpactSelector(newRow);
          
          applyActiveFilter();
  
          // Show notification for row creation
          Notification.createNotification('success', 'Row added successfully!');
  
          // Re-apply overlays if not authenticated
          if (!Auth.isAuthenticated()) Auth.disableRestrictedFeatures();
        }, "Please enter the passkey to add a new row");
      });
    }
  }
  
  /**
   * Checks if the table is empty and adds an empty state if needed
   */
  function checkEmptyTable() {
    const tbody = document.querySelector('tbody');
    if (tbody && tbody.children.length === 0) {
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
  
  /**
   * Initializes table row actions (edit, save, delete)
   */
  function initTableRowActions() {
    const table = document.querySelector('table');
    if (table) {
      table.addEventListener('click', function(e) {
        Auth.ensureAuthenticated(() => {
          // Edit button clicked
          if (e.target.closest('.edit-btn')) {
            handleEditButtonClick(e);
          }
  
          // Save button clicked
          if (e.target.closest('.save-btn')) {
            handleSaveButtonClick(e);
          }
  
          // Delete button clicked
          if (e.target.closest('.delete-btn')) {
            handleDeleteButtonClick(e);
          }
        }, "Please enter the passkey to edit or delete data");
      });
    }
  }
  
  /**
   * Handles edit button click
   * @param {Event} e - The click event
   */
  function handleEditButtonClick(e) {
    const row = e.target.closest('tr');
    const cells = row.getElementsByTagName('td');
    
    // First check if timezone conversion is active and turn it off
    const convertToggleBtn = document.getElementById('convertToggleBtn');
    if (convertToggleBtn && convertToggleBtn.checked) {
      // Turn off timezone conversion before editing
      convertToggleBtn.checked = false;
      // Update the global variable in both window and Timezone module
      window.conversionEnabled = false;
      Timezone.conversionEnabled = false;
      // Call the function to revert the table
      Timezone.toggleTimezoneConversion();
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
  
    // Focus the first editable cell and move caret to end
    for (let i = 0; i < cells.length - 1; i++) {
      if (i === cells.length - 2) continue; // skip impact-cell
      cells[i].focus();
      // Move caret to end
      const range = document.createRange();
      range.selectNodeContents(cells[i]);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      break;
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
  
  /**
   * Handles save button click
   * @param {Event} e - The click event
   */
  function handleSaveButtonClick(e) {
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
    
    Core.applyRowHighlight(row);
    
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
    const isNew = row.hasAttribute('data-new'); // check new‑row flag
    row.removeAttribute('data-new'); // clear flag
    
    if (isNew) {
      Notification.createNotification('success', 'Row creation successful!');
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      Notification.createNotification('success', 'Data updated successfully!');
    }
  }
  
  /**
   * Handles delete button click
   * @param {Event} e - The click event
   */
  function handleDeleteButtonClick(e) {
    Core.rowToDelete = e.target.closest('tr');
    
    // Show custom confirmation dialog
    Notification.createConfirmDialog({
      type: 'danger',
      icon: 'fa-trash',
      title: 'Delete Row',
      message: 'Are you sure you want to delete this row? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    }).then(confirmed => {
      if (confirmed) {
        // Proceed with deletion
        if (Core.rowToDelete) {
          Core.rowToDelete.style.opacity = '0';
          Core.rowToDelete.style.transform = 'translateX(20px)';
          setTimeout(() => {
            // Only mark as unsaved if the row is not empty
            if (window.ChangeTracker) {
              // Check if row is empty before marking as unsaved
              const isEmpty = window.ChangeTracker.isEmptyRow(Core.rowToDelete);
              const isUnsavedNew = window.ChangeTracker.isUnsavedNewRow(Core.rowToDelete);
              
              // Only mark as unsaved if the row had actual content
              if (!isEmpty && !isUnsavedNew) {
                ChangeTracker.markUnsaved();
              }
            }
            
            Core.rowToDelete.remove();
            checkEmptyTable();
            
            // Reset counter if the table is now empty
            const tableRows = document.querySelectorAll('#changeTable tbody tr:not(.empty-state)');
            if (tableRows.length === 0 && window.ChangeTracker) {
              ChangeTracker.resetCounter();
            }
            
            Core.rowToDelete = null;
  
            // Show notification for row deletion
            setTimeout(() => {
              Notification.createNotification('success', 'Row deleted successfully!');
            }, 300);
          }, 300);
        }
      } else {
        // Deletion cancelled
        Core.rowToDelete = null;
      }
    });
  }
  
  /**
   * Initializes filter controls
   */
  function initFilterControls() {
    const allFilterBtn = document.querySelector('.filter-btn[data-filter="all"]');
    if (allFilterBtn) {
      allFilterBtn.classList.add('active');
    }
  
    const filterControls = document.querySelector('.filter-controls');
    if (filterControls) {
      filterControls.addEventListener('click', function(e) {
        const filterBtn = e.target.closest('.filter-btn');
        if (filterBtn) {
          document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
          });
          filterBtn.classList.add('active');
          
          applyActiveFilter();
        }
      });
    }
  }
  
  /**
   * Initializes impact selectors for a row
   * @param {HTMLElement} row - The table row
   */
  function initImpactSelector(row) {
    if (!row) {
        return;
    }

    const impactOptions = row.querySelectorAll('.impact-option');
    const selector = row.querySelector('.impact-selector');
    const innerContainer = selector?.querySelector('.impact-selector-inner');

    if (!impactOptions.length || !selector || !innerContainer) {
        return;
    }

    // Remove any existing click event listeners to prevent duplicates
    impactOptions.forEach(option => {
        const newOption = option.cloneNode(true);
        option.parentNode.replaceChild(newOption, option);
    });

    // Get fresh references after cloning
    const freshOptions = row.querySelectorAll('.impact-option');

    freshOptions.forEach(option => {
        option.addEventListener('click', function(event) {
            event.stopPropagation(); // Prevent event bubbling

            const tr = this.closest('tr');
            if (!tr) {
                return;
            }

            const priority = this.getAttribute('data-value');

            // Update the UI - remove selected class from all options
            tr.querySelectorAll('.impact-option').forEach(opt => {
                opt.classList.remove('selected');
            });

            // Add selected class to the clicked option
            this.classList.add('selected');

            // Update the data attributes
            selector.setAttribute('data-value', priority);
            tr.setAttribute('data-priority', priority);

            // Add animation effect
            this.style.animation = 'none';
            setTimeout(() => {
                this.style.animation = 'impactPulse 0.8s ease-in-out';
            }, 100);

            // Apply active filter
            applyActiveFilter();
        });
    });
}
  
  /**
   * Applies the active filter to the table rows
   */
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
  
  /**
   * Updates the main table with data from the parsed data table
   */
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
  
    // If timezone toggle is checked, convert times
    const convertToggleBtn = document.getElementById('convertToggleBtn');
    if (convertToggleBtn && convertToggleBtn.checked) {
      convertToggleBtn.dispatchEvent(new Event('change'));
    }
  
    // Apply active filter
    applyActiveFilter();
  
    // Check if table is empty
    checkEmptyTable();
  
    // Re-apply overlays if not authenticated
    if (!Auth.isAuthenticated()) Auth.disableRestrictedFeatures();
  }
  
  // Export functions for use in other modules
  window.Table = {
    initTable,
    initSortableColumns,
    initAddRowButton,
    checkEmptyTable,
    initTableRowActions,
    initImpactSelector,
    applyActiveFilter,
    updateMainTableFromParsedData
  };