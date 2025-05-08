/**
 * UI module - Handles UI interactions and elements
 */

// DOM elements
const modal = document.getElementById('emailModal');
const viewOriginalBtn = document.getElementById('viewOriginal');
const closeBtn = document.querySelector('#emailModal .close');
const confirmDialog = document.getElementById('deleteConfirmDialog');
const infoModal = document.getElementById('infoModal');
const howItWorksBtn = document.getElementById('howItWorksBtn');
const headerTitle = document.getElementById('headerTitle');
const editHeaderBtn = document.getElementById('editHeaderBtn');
const saveHeaderBtn = document.getElementById('saveHeaderBtn');

/**
 * Initializes UI event listeners
 */
function initUI() {
  // View original button
  if (viewOriginalBtn) {
    viewOriginalBtn.onclick = function() {
      Auth.ensureAuthenticated(() => {
        // repopulate parsed-data-viewer from current main table state
        const parsedBody = document.getElementById('parsedDataBody');
        parsedBody.innerHTML = '';
        document
          .querySelectorAll('#changeTable tbody tr:not(.empty-state)')
          .forEach(row => {
            const service = row.cells[0].textContent;
            const date    = row.cells[1].textContent;
            const start   = row.cells[2].textContent;
            const end     = row.cells[3].textContent;
            const comments= row.cells[5].textContent;
            const tr = document.createElement('tr');
            tr.setAttribute('data-service', service);
            tr.innerHTML = `
              <td>${service}</td>
              <td>${date}</td>
              <td>${start} - ${end}</td>
              <td>${comments}</td>
            `;
            parsedBody.appendChild(tr);
          });

        modal.style.display = "block";
      }, "Please enter the passkey to compare and edit");
    };
  }

  // Close button for email modal
  if (closeBtn) {
    closeBtn.onclick = function() {
      modal.style.display = "none";
    };
  }

  // Window click events for modals
  window.onclick = function(event) {
    if (event.target == modal) {
      modal.style.display = "none";
    }
    if (event.target == confirmDialog) {
      confirmDialog.classList.remove('active');
    }
    if (event.target == infoModal) {
      infoModal.style.display = "none";
    }
  };

  // How it works button
  if (howItWorksBtn) {
    howItWorksBtn.onclick = function() {
      infoModal.style.display = "block";
    };
  }

  // Escape key handler for modals
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

  // Header title editing
  if (editHeaderBtn) {
    editHeaderBtn.addEventListener('click', function() {
      Auth.ensureAuthenticated(() => {
        headerTitle.contentEditable = true;
        headerTitle.classList.add('editable');
        headerTitle.focus();
        editHeaderBtn.style.display = 'none';
        saveHeaderBtn.style.display = 'flex';
      }, "Please enter the passkey to edit title");
    });
  }

  if (saveHeaderBtn) {
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
  }

  if (headerTitle) {
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
  }

  // Theme toggle
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
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
  }

  // Reset form button
  const resetFormBtn = document.getElementById('resetForm');
  if (resetFormBtn) {
    resetFormBtn.addEventListener('click', function() {
      Auth.ensureAuthenticated(() => {
        Notification.createConfirmDialog({
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
            Notification.createNotification('error', 'Error resetting data. Please try again.');
          });
        });
      }, "Please enter the passkey to reset all data");
    });
  }

  // Email modal buttons
  initEmailModalButtons();

  // Make header title clickable for view-only history
  if (headerTitle) {
    headerTitle.style.cursor = 'pointer';
    headerTitle.addEventListener('click', function(e) {
      // If editing, move cursor to click position, do NOT open history
      if (headerTitle.isContentEditable) {
        // Move caret to click position
        const range = document.caretRangeFromPoint
          ? document.caretRangeFromPoint(e.clientX, e.clientY)
          : (function() {
              const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
              if (!pos) return null;
              const r = document.createRange();
              r.setStart(pos.offsetNode, pos.offset);
              r.collapse(true);
              return r;
            })();
        if (range) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
        e.stopPropagation();
        return;
      }
      // Not editing: open history modal (view-only)
      History.openHistoryModal(true);
    });
  }
}

/**
 * Updates the theme icon based on the current theme
 * @param {string} theme - The current theme ('dark' or 'light')
 */
function updateThemeIcon(theme) {
  const icon = document.querySelector('#themeToggle i');
  if (icon) {
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  }
}

/**
 * Initializes email modal buttons
 */
function initEmailModalButtons() {
  // Copy email button
  const copyEmailBtn = document.getElementById('copyEmail');
  if (copyEmailBtn) {
    copyEmailBtn.addEventListener('click', function() {
      const textToCopy = document.getElementById('emailBody').textContent;
      navigator.clipboard.writeText(textToCopy)
      .then(() => alert('Email content copied to clipboard!'));
    });
  }

  // Download text button
  const downloadTextBtn = document.getElementById('downloadText');
  if (downloadTextBtn) {
    downloadTextBtn.addEventListener('click', function() {
      const text = document.getElementById('emailBody').textContent;
      const blob = new Blob([text], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'email_content.txt';
      a.click();
    });
  }

  // Toggle word wrap button
  const toggleWordWrapBtn = document.getElementById('toggleWordWrap');
  if (toggleWordWrapBtn) {
    toggleWordWrapBtn.addEventListener('click', function() {
      const emailBody = document.getElementById('emailBody');
      emailBody.style.whiteSpace = 
      emailBody.style.whiteSpace === 'pre' ? 'pre-wrap' : 'pre';
    });
  }

  // Font size buttons
  let fontSize = 14;
  const increaseFontSizeBtn = document.getElementById('increaseFontSize');
  if (increaseFontSizeBtn) {
    increaseFontSizeBtn.addEventListener('click', function() {
      fontSize = Math.min(fontSize + 2, 24);
      document.getElementById('emailBody').style.fontSize = `${fontSize}px`;
    });
  }

  const decreaseFontSizeBtn = document.getElementById('decreaseFontSize');
  if (decreaseFontSizeBtn) {
    decreaseFontSizeBtn.addEventListener('click', function() {
      fontSize = Math.max(fontSize - 2, 10);
      document.getElementById('emailBody').style.fontSize = `${fontSize}px`;
    });
  }

  // Download HTML button
  const downloadHtmlBtn = document.getElementById('downloadHtml');
  if (downloadHtmlBtn) {
    downloadHtmlBtn.addEventListener('click', function() {
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
  }
}

// Export functions for use in other modules
window.UI = {
  initUI,
  updateThemeIcon
};