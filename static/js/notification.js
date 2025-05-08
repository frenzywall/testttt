/**
 * Notification module - Handles notifications and confirmation dialogs
 */

/**
 * Creates a notification
 * @param {string} type - The type of notification ('success', 'error', 'info')
 * @param {string} message - The notification message
 * @param {boolean} persistent - Whether the notification should persist
 * @returns {HTMLElement} - The notification element
 */
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
  
  /**
   * Creates a confirmation dialog
   * @param {Object} options - The dialog options
   * @param {string} options.type - The type of dialog ('info', 'danger', 'primary')
   * @param {string} options.icon - The icon to display
   * @param {string} options.title - The dialog title
   * @param {string} options.message - The dialog message
   * @param {string} options.confirmText - The text for the confirm button
   * @param {string} options.cancelText - The text for the cancel button
   * @returns {Promise<boolean>} - A promise that resolves to whether the user confirmed
   */
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
  
  // Export functions for use in other modules
  window.Notification = {
    createNotification,
    createConfirmDialog
  };