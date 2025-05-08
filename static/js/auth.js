/**
 * Auth module - Handles authentication functionality
 */

/**
 * Initializes authentication functionality
 */
function initAuth() {
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
}

/**
 * Checks if the user is authenticated
 * @returns {boolean} - Whether the user is authenticated
 */
function isAuthenticated() {
  const authUntil = localStorage.getItem('authUntil');
  return authUntil && Date.now() < parseInt(authUntil);
}

/**
 * Ensures the user is authenticated before executing a callback
 * @param {Function} callback - The callback to execute if authenticated
 * @param {string} customMessage - A custom message to display in the authentication prompt
 */
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

/**
 * Prompts the user for a passkey
 * @param {string} customMessage - A custom message to display in the prompt
 * @returns {Promise<boolean>} - A promise that resolves to whether the passkey is valid
 */
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
        <form id="passkey-form" onsubmit="return false;">
          <input type="password" id="passkey-input" class="passkey-input" placeholder="Enter passkey">
        </form>
        <div class="custom-confirm-actions">
          <button class="custom-confirm-cancel">Cancel</button>
          <button type="submit" form="passkey-form" class="custom-confirm-ok primary-btn">Submit</button>
        </div>
      </div>
    `;
    
    // Add to DOM
    document.body.appendChild(dialogOverlay);
    
    // Add click outside listener
    dialogOverlay.addEventListener('click', (e) => {
      if (e.target === dialogOverlay) {
        dialogOverlay.classList.remove('active');
        setTimeout(() => {
          dialogOverlay.remove();
          resolve(false);
        }, 300);
      }
    });

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
    
    // Handle form submission
    const passkeyForm = dialogOverlay.querySelector('#passkey-form');
    passkeyForm.addEventListener('submit', function(e) {
      e.preventDefault();
      confirmBtn.click();
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
            Notification.createNotification('success', 'Authentication successful!');
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
          Notification.createNotification('error', 'Error validating passkey. Please try again.');
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

/**
 * Disables restricted features
 */
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

/**
 * Enables restricted features
 */
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

// Export functions for use in other modules
window.Auth = {
  initAuth,
  isAuthenticated,
  ensureAuthenticated,
  promptForPasskey,
  disableRestrictedFeatures,
  enableRestrictedFeatures
};