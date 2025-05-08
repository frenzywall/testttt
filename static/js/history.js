/**
 * History module - Handles history functionality
 */

/**
 * Initializes history functionality
 */
function initHistory() {
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
        
        Auth.ensureAuthenticated(() => {
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
  
    // History modal
    const historyModal = document.getElementById('historyModal');
    const historyModalClose = historyModal?.querySelector('.close');
    
    if (historyModalClose) {
      historyModalClose.addEventListener('click', function() {
        historyModal.style.display = "none";
      });
    }
    
    if (historyModal) {
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
    }
    
    // History search functionality
    const historySearch = document.getElementById('historySearch');
    const historyClearSearch = document.getElementById('historyClearSearch');
    
    if (historySearch) {
      historySearch.addEventListener('input', function() {
        filterHistoryItems(this.value);
      });
    }
    
    if (historyClearSearch) {
      historyClearSearch.addEventListener('click', function() {
        historySearch.value = '';
        filterHistoryItems('');
      });
    }
  
    // Add info icons to the dropdown items
    addInfoIconsToDropdown();
  
    // Setup update checker
    setupUpdateChecker();
  }
  
  /**
   * Sets up dropdown actions
   * @param {HTMLElement} dropdownParent - The dropdown parent element
   */
  function setupDropdownActions(dropdownParent) {
    // Handle dropdown item clicks
    const syncToRedis = document.getElementById('syncToRedis');
    if (syncToRedis) {
      syncToRedis.addEventListener('click', function() {
        syncAllDataToRedis(false); // Regular sync without history
        if (dropdownParent) {
          dropdownParent.classList.remove('open');
        }
      });
    }
    
    const syncToHistory = document.getElementById('syncToHistory');
    if (syncToHistory) {
      syncToHistory.addEventListener('click', function() {
        syncAllDataToRedis(true); // Sync and save to history
        if (dropdownParent) {
          dropdownParent.classList.remove('open');
        }
      });
    }
    
    const viewHistory = document.getElementById('viewHistory');
    if (viewHistory) {
      viewHistory.addEventListener('click', function() {
        openHistoryModal();
        if (dropdownParent) {
          dropdownParent.classList.remove('open');
        }
      });
    }
  }
  
  /**
   * Adds info icons to dropdown items
   */
  function addInfoIconsToDropdown() {
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
  }
  
  /**
   * Syncs all data to Redis
   * @param {boolean} saveToHistory - Whether to save to history
   */
  function syncAllDataToRedis(saveToHistory = false) {
    const tableRows = document.querySelectorAll('#changeTable tbody tr:not(.empty-state)');
    const services = [];
    
    // If there are no rows, don't proceed
    if (tableRows.length === 0) {
      Notification.createNotification('info', 'No data to sync.');
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
  
  /**
   * Opens the history modal
   * @param {boolean} viewOnly - Whether to open in view-only mode
   */
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
        
        // Convert saved UTC date to local timezone using the system's tz.
        let formattedDate = 'Unknown date';
        if (item.date) {
          const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          formattedDate = Core.DateTime.fromFormat(item.date, "yyyy-MM-dd HH:mm:ss", {zone: 'utc'})
                                .setZone(localTz)
                                .toFormat("yyyy-MM-dd, hh:mm a") + " (" + localTz + ")";            
        }
        
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
  
  /**
   * Deletes a history item
   * @param {string} timestamp - The timestamp of the history item
   * @param {HTMLElement} itemElement - The history item element
   */
  function deleteHistoryItem(timestamp, itemElement) {
    // Show custom confirmation dialog
    Notification.createConfirmDialog({
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
  }
  
  /**
   * Filters history items based on search input
   * @param {string} searchTerm - The search term
   */
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
  
  /**
   * Loads a history item
   * @param {string} timestamp - The timestamp of the history item
   * @param {boolean} viewOnly - Whether to load in view-only mode
   */
  function loadHistoryItem(timestamp, viewOnly = false) {
    // Show custom confirmation dialog
    Notification.createConfirmDialog({
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
            Notification.createNotification('success', 'History item loaded successfully!');
          } else {
            Notification.createNotification('error', 'Error loading data: ' + (result.message || 'Unknown error'));
          }
        })
        .catch(error => {
          removeLoadingElement();
          console.error('Error:', error);
          Notification.createNotification('error', 'Error loading data. Please try again.');
        });
      }, 450);
    });
  }
  
  /**
   * Updates the UI with history data
   * @param {Object} data - The history data
   */
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
        Table.initImpactSelector(row);
      });
      
      Table.applyActiveFilter();
      Table.checkEmptyTable();
  
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
      if (!Auth.isAuthenticated()) Auth.disableRestrictedFeatures();
  
    } catch (error) {
      console.error('Error updating UI with history data:', error);
      Notification.createNotification('error', 'Failed to display history data');
    }
  }
  
  /**
   * Sets up the update checker
   */
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
  
  // Export functions for use in other modules
  window.History = {
    initHistory,
    setupDropdownActions,
    addInfoIconsToDropdown,
    syncAllDataToRedis,
    openHistoryModal,
    deleteHistoryItem,
    filterHistoryItems,
    loadHistoryItem,
    updateUIWithHistoryData,
    setupUpdateChecker
  };