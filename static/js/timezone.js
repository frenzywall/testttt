/**
 * Timezone module - Handles timezone conversion functionality
 */

// Global flag for conversion state
let conversionEnabled = false;

/**
 * Initializes timezone functionality
 */
function initTimezone() {
  // Initialize timezone selectors
  populateTimezoneSelectors();
  
  // Add event listeners
  const convertToggleBtn = document.getElementById('convertToggleBtn');
  if (convertToggleBtn) {
    convertToggleBtn.addEventListener('change', () => {
      conversionEnabled = convertToggleBtn.checked;
      toggleTimezoneConversion();
    });
  }

  // Reset timezone conversion toggle when timezone selectors change
  const fromTzSelect = document.getElementById('fromTimezone');
  const toTzSelect = document.getElementById('toTimezone');
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
}

/**
 * Populates timezone selectors with common options
 */
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

/**
 * Toggles timezone conversion on/off
 */
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

/**
 * Handles timezone change and updates the UI
 */
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

/**
 * Converts a time from one timezone to another
 * @param {string} timeStr - The time string to convert
 * @param {string} dateStr - The date string
 * @param {string} fromTz - The source timezone
 * @param {string} toTz - The target timezone
 * @returns {string} - The converted time string
 */
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
    const dt = Core.DateTime.fromFormat(`${dateStr} ${timeStr}`, 'yyyy-MM-dd HH:mm', {
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

// Export functions and variables for use in other modules
window.Timezone = {
  conversionEnabled,
  initTimezone,
  populateTimezoneSelectors,
  toggleTimezoneConversion,
  handleTimezoneChange,
  convertTimezone,
  // Add setter for conversionEnabled to ensure it's properly updated
  set conversionEnabled(value) {
    conversionEnabled = value;
  },
  get conversionEnabled() {
    return conversionEnabled;
  }
};