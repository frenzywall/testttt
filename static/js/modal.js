/**
 * Modal module - Handles modal dialogs and comparison view
 */

/**
 * Initializes modal functionality
 */
function initModal() {
    initUploadModal();
    initEmailComparisonView();
  }
  
  /**
   * Initializes the upload modal
   */
  function initUploadModal() {
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadModal = document.getElementById('uploadModal');
    const uploadZone = document.getElementById('uploadZone');
    const uploadPreview = document.getElementById('uploadPreview');
    const cancelUpload = document.getElementById('cancelUpload');
    const fileInput = document.getElementById('fileInput');
  
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => {
        Auth.ensureAuthenticated(() => {
          uploadModal.style.display = 'flex';
          uploadZone.style.display = 'flex';
        }, "Please enter the passkey to upload a file");
      });
    }
  
    if (cancelUpload) {
      cancelUpload.addEventListener('click', () => {
        uploadModal.style.display = 'none';
        uploadPreview.style.display = 'none';
        uploadZone.classList.remove('drag-over');
      });
    }
  
    if (uploadZone) {
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
    }
  
    if (fileInput) {
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
    }
  
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
  
    // New: update hidden input when AI processing checkbox toggles
    const useAiCheckbox = document.getElementById('useAiProcessing');
    if (useAiCheckbox) {
      useAiCheckbox.addEventListener('change', function() {
        document.getElementById('useAiInput').value = this.checked;
        if (this.checked) {
          Notification.createNotification('success', 'AI processing enabled');
        } else {
          Notification.createNotification('info', 'Standard processing selected');
        }
      });
    }
  }
  
  /**
   * Initializes the email comparison view
   */
  function initEmailComparisonView() {
    const toggleLayoutBtn = document.getElementById('toggleLayout');
    const highlightDataBtn = document.getElementById('highlightData');
    const searchBtn = document.getElementById('searchBtn');
    const emailSearch = document.getElementById('emailSearch');
    const searchResults = document.getElementById('searchResults');
    const emailBody = document.getElementById('emailBody');
    const parsedDataRows = document.querySelectorAll('#parsedDataBody tr');
    const editDataBtn = document.getElementById('editDataBtn');
    const saveDataBtn = document.getElementById('saveDataBtn');
    
    let isEditing = false;
    let isHighlighted = false;
  
    // Toggle between side-by-side and stacked layout
    if (toggleLayoutBtn) {
      toggleLayoutBtn.addEventListener('click', function() {
        Auth.ensureAuthenticated(() => {
          const modalContent = document.querySelector('.modal-content');
          modalContent.classList.toggle('layout-stacked');
        }, "Please enter the passkey to change comparison layout");
      });
    }
  
    // Highlight data in the email content
    if (highlightDataBtn) {
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
    }
  
    // Search functionality
    if (searchBtn && emailSearch) {
      searchBtn.addEventListener('click', performSearch);
      emailSearch.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          performSearch();
        }
      });
    }
  
    // Parsed data table hover effects
    const parsedDataTable = document.querySelector('.parsed-data-table');
    if (parsedDataTable) {
      parsedDataTable.addEventListener('mouseover', function(e) {
        const row = e.target.closest('tr');
        if (!row || !row.parentElement || row.parentElement.id !== 'parsedDataBody') return;
        // Don't interfere with edit mode delete buttons, etc.
        if (isEditing) return;
        const serviceName = row.getAttribute('data-service');
        highlightServiceInEmail(serviceName);
        row.classList.add('highlight-row');
      });
      
      parsedDataTable.addEventListener('mouseout', function(e) {
        const row = e.target.closest('tr');
        if (!row || !row.parentElement || row.parentElement.id !== 'parsedDataBody') return;
        if (!isHighlighted) resetEmailHighlights();
        row.classList.remove('highlight-row');
      });
    }
  
    // Edit data button
    if (editDataBtn) {
      editDataBtn.addEventListener('click', function() {
        Auth.ensureAuthenticated(() => {
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
    }
  
    // Save data button
    if (saveDataBtn) {
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
          Table.updateMainTableFromParsedData();
          
          // Use createNotification for success message
          Notification.createNotification('success', 'Changes saved locally!');
          
          // Show sync reminder notification after a short delay
          setTimeout(() => {
            Notification.createNotification('info', 'Remember to click "Sync" to update changes across devices');
          }, 3000);
        }, 1000);
      });
    }
  
    // When a row in the parsed data table is clicked in edit mode
    if (parsedDataTable) {
      parsedDataTable.addEventListener('click', function(e) {
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
    }
  
    /**
     * Highlights data in the email content
     */
    function highlightEmailContent() {
      if (!emailBody) return;
      
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
      emailContent = Core.escapeHtml(emailBody.textContent);
  
      // Highlight dates
      const datePattern = /\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/g;
      emailContent = emailContent.replace(datePattern, '<span class="highlight-date">$&</span>');
  
      // Highlight times
      const timePattern = /\b([0-1]?[0-9]|2[0-3])[:][0-5][0-9](\s*-\s*([0-1]?[0-9]|2[0-3])[:][0-5][0-9])?\b/g;
      emailContent = emailContent.replace(timePattern, '<span class="highlight-time">$&</span>');
  
      // Highlight service names
      services.forEach(service => {
        if (service.name.trim()) {
          const nameRegex = new RegExp('\\b' + Core.escapeRegExp(service.name.trim()) + '\\b', 'gi');
          emailContent = emailContent.replace(nameRegex, '<span class="highlight-service">$&</span>');
        }
      });
  
      emailBody.innerHTML = emailContent;
    }
  
    /**
     * Resets email highlights
     */
    function resetEmailHighlights() {
      if (emailBody) {
        emailBody.innerHTML = Core.escapeHtml(emailBody.textContent);
      }
    }
  
    /**
     * Highlights a specific service name in the email
     * @param {string} serviceName - The service name to highlight
     */
    function highlightServiceInEmail(serviceName) {
      if (!emailBody || !serviceName.trim()) return;
  
      let content = emailBody.textContent;
      const nameRegex = new RegExp('\\b' + Core.escapeRegExp(serviceName.trim()) + '\\b', 'gi');
  
      if (content.match(nameRegex)) {
        content = Core.escapeHtml(content);
        content = content.replace(nameRegex, '<span class="highlight-match">$&</span>');
        emailBody.innerHTML = content;
  
        // Scroll to the first match
        const firstMatch = emailBody.querySelector('.highlight-match');
        if (firstMatch) {
          firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  
    /**
     * Performs a search in the email content
     */
    function performSearch() {
      if (!emailBody || !emailSearch || !searchResults) return;
      
      const searchTerm = emailSearch.value.trim();
      if (!searchTerm) return;
  
      let content = emailBody.textContent;
      const regex = new RegExp(Core.escapeRegExp(searchTerm), 'gi');
      const matches = content.match(regex);
  
      if (matches && matches.length > 0) {
        searchResults.textContent = `${matches.length} matches found`;
  
        content = Core.escapeHtml(content);
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
  }
  
  /**
   * Initializes file upload functionality
   */
  function initializeFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const uploadForm = document.getElementById('uploadForm');
    const loadingOverlay = document.querySelector('.loading-overlay');
    
    if (fileInput && uploadForm) {
      fileInput.addEventListener('change', function(e) {
        if (this.files.length > 0) {
          const file = this.files[0];
          if (!file.name.toLowerCase().endsWith('.msg')) {
            Core.showError('Please upload a .MSG file');
            return;
          }
          Notification.createNotification('info', 'Your file is being processed, please wait...', true); // Use persistent notification
          
          // Show loading state
          if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
          } else {
            Core.showLoading(); // Fallback to the showLoading function if overlay doesn't exist
          }
          
          uploadForm.submit();
        }
      });
    }
  }
  
  // Export functions for use in other modules
  window.Modal = {
    initModal,
    initUploadModal,
    initEmailComparisonView,
    initializeFileUpload
  };