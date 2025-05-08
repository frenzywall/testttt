/**
 * Main module - Entry point for the application
 * 
 * This file initializes all modules and sets up the application.
 * It imports functionality from the following modules:
 * - core.js: Basic utilities and shared functions
 * - ui.js: UI interactions and elements
 * - table.js: Table operations and interactions
 * - timezone.js: Timezone conversion functionality
 * - modal.js: Modal dialogs and comparison view
 * - history.js: History functionality
 * - auth.js: Authentication functionality
 * - notification.js: Notifications and confirmation dialogs
 */

// Initialize all modules when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize UI
    UI.initUI();
    
    // Initialize table
    Table.initTable();
    
    // Initialize timezone functionality
    Timezone.initTimezone();
    
    // Initialize modal functionality
    Modal.initModal();
    Modal.initializeFileUpload();
    
    // Initialize history functionality
    History.initHistory();
    
    // Initialize authentication
    Auth.initAuth();
    
    // Add cache control to prevent form resubmission
    if (window.history.replaceState) {
      window.history.replaceState(null, null, window.location.href);
    }
    
    // Apply overlays if not authenticated
    if (!Auth.isAuthenticated()) {
      Auth.disableRestrictedFeatures();
    }
  });