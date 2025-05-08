/**
 * Core module - Basic initialization and shared utilities
 */

// Import Luxon library for DateTime operations
const { DateTime } = luxon || window.luxon;

// Global variables
let rowToDelete = null;

/**
 * Escapes HTML special characters to prevent XSS
 * @param {string} unsafe - The unsafe string to escape
 * @returns {string} - The escaped string
 */
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Escapes special characters in a string for use in a regular expression
 * @param {string} string - The string to escape
 * @returns {string} - The escaped string
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Shows a loading overlay
 */
function showLoading() {
  const overlay = document.querySelector('.loading-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
  }
}

/**
 * Hides the loading overlay
 */
function hideLoading() {
  document.querySelector('.loading-overlay').style.display = 'none';
}

/**
 * Shows an error message
 * @param {string} message - The error message to display
 */
function showError(message) {
  const toast = document.getElementById('errorToast');
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 5000);
}

/**
 * Applies a highlight animation to a table row
 * @param {HTMLElement} row - The row to highlight
 */
function applyRowHighlight(row) {
  if (!row) return;
  
  row.classList.remove('highlight-row');
  
  void row.offsetWidth; // Trigger reflow
  
  row.classList.add('highlight-row');
  
  setTimeout(() => row.classList.remove('highlight-row'), 1500);
}

// Export functions and variables for use in other modules
window.Core = {
  DateTime,
  rowToDelete,
  escapeHtml,
  escapeRegExp,
  showLoading,
  hideLoading,
  showError,
  applyRowHighlight
};