const modal = document.getElementById('emailModal');
const viewOriginalBtn = document.getElementById('viewOriginal');
const closeBtn = document.getElementsByClassName('close')[0];
const confirmDialog = document.getElementById('deleteConfirmDialog');
let rowToDelete = null;

viewOriginalBtn.onclick = function() {
    ensureAuthenticated(() => {
        modal.style.display = "block";
    }, "Please enter the passkey to compare and edit");
}

closeBtn.onclick = function() {
    modal.style.display = "none";
}

window.onclick = function(event) {
    if (event.target == modal) {
    modal.style.display = "none";
    }
    if (event.target == confirmDialog) {
    confirmDialog.classList.remove('active');
    }
}


document.querySelectorAll('th.sortable').forEach(header => {
    header.addEventListener('click', function() {
    const table = this.closest('table');
    const index = Array.from(this.parentNode.children).indexOf(this);
    const isAsc = this.classList.contains('sorted-asc');
    
    
    table.querySelectorAll('th').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
    });
    
    
    this.classList.add(isAsc ? 'sorted-desc' : 'sorted-asc');
    
    
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    rows.sort((a, b) => {
        const aValue = a.cells[index].textContent;
        const bValue = b.cells[index].textContent;
        
        if (isAsc) {
        return bValue.localeCompare(aValue);
        } else {
        return aValue.localeCompare(bValue);
        }
    });
    
    
    const tbody = table.querySelector('tbody');
    rows.forEach(row => tbody.appendChild(row));
    
    
    rows.forEach(row => {
        row.classList.add('highlight-row');
        setTimeout(() => row.classList.remove('highlight-row'), 1500);
    });
    });
});


function applyRowHighlight(row) {
    if (!row) return;
    
    row.classList.remove('highlight-row');
    
    void row.offsetWidth;
    
    row.classList.add('highlight-row');
    
    setTimeout(() => row.classList.remove('highlight-row'), 1500);
}

document.getElementById('addRow').addEventListener('click', function() {
    ensureAuthenticated(() => {
        const tbody = document.querySelector('tbody');
        const newRow = document.createElement('tr');
        newRow.setAttribute('data-priority', 'low');
        
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
        
        applyRowHighlight(newRow);

        initImpactSelector(newRow);
        
        applyActiveFilter();
    }, "Please enter the passkey to add a new row");
});

function checkEmptyTable() {
    const tbody = document.querySelector('tbody');
    if (tbody.children.length === 0) {
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
    
    document.getElementById('emptyAddRow').addEventListener('click', function() {
        document.getElementById('addRow').click();
    });
    }
}

document.querySelector('table').addEventListener('click', function(e) {
    ensureAuthenticated(() => {
        if (e.target.closest('.edit-btn')) {
            const row = e.target.closest('tr');
            const cells = row.getElementsByTagName('td');
            for (let i = 0; i < cells.length - 1; i++) {
                cells[i].contentEditable = true;
                cells[i].classList.add('editable');
            }
            row.querySelector('.edit-btn').style.display = 'none';
            row.querySelector('.save-btn').style.display = 'inline-flex';
        }

        if (e.target.closest('.save-btn')) {
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
            
            applyRowHighlight(row);
            
            const rowData = {
                service: cells[0].textContent,
                date: cells[1].textContent,
                startTime: cells[2].textContent,
                endTime: cells[3].textContent,
                comments: cells[4].textContent,
                impactPriority: row.querySelector('.impact-selector').getAttribute('data-value')
            };
            
            fetch('/save-changes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(rowData)
            });
        }

        if (e.target.closest('.delete-btn')) {
            const rowToDelete = e.target.closest('tr');
            confirmDialog.classList.add('active');
        }
    }, "Please enter the passkey to edit or delete data");
});

document.getElementById('cancelDelete').addEventListener('click', function() {
    confirmDialog.classList.remove('active');
    rowToDelete = null;
});

document.getElementById('confirmDelete').addEventListener('click', function() {
    if (rowToDelete) {
    rowToDelete.style.opacity = '0';
    rowToDelete.style.transform = 'translateX(20px)';
    setTimeout(() => {
        rowToDelete.remove();
        checkEmptyTable();
        
        const cells = rowToDelete.getElementsByTagName('td');
        const rowData = {
        service: cells[0].textContent,
        date: cells[1].textContent
        };
        
        fetch('/delete-row', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(rowData)
        });
        
        rowToDelete = null;
    }, 300);
    }
    confirmDialog.classList.remove('active');
});

document.addEventListener('DOMContentLoaded', function() {
    checkEmptyTable();

    const rows = document.querySelectorAll('#changeTable tbody tr');
    rows.forEach(row => initImpactSelector(row));
    
    const allFilterBtn = document.querySelector('.filter-btn[data-filter="all"]');
    if (allFilterBtn) {
    allFilterBtn.classList.add('active');
    }

    document.querySelector('.filter-controls').addEventListener('click', function(e) {
    const filterBtn = e.target.closest('.filter-btn');
    if (filterBtn) {
        document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        });
        filterBtn.classList.add('active');
        
        applyActiveFilter();
    }
    });
});


function initImpactSelector(row) {
    if (!row) return;

    const impactOptions = row.querySelectorAll('.impact-option');
    const selector = row.querySelector('.impact-selector');
    const innerContainer = selector?.querySelector('.impact-selector-inner');
    
    if (!impactOptions.length || !selector || !innerContainer) return;
    
    impactOptions.forEach(option => {
    option.addEventListener('click', function() {
        const tr = this.closest('tr');
        if (!tr) return;
        
        const priority = this.getAttribute('data-value');
        
        impactOptions.forEach(opt => opt.classList.remove('selected'));
        this.classList.add('selected');
        
        selector.setAttribute('data-value', priority);
        tr.setAttribute('data-priority', priority);
        
        this.style.animation = 'none';
        setTimeout(() => {
        this.style.animation = 'impactPulse 0.8s ease-in-out';
        }, 100);
        
        applyActiveFilter();
    });
    });
}

function applyActiveFilter() {
    const activeFilter = document.querySelector('.filter-btn.active');
    const filterValue = activeFilter ? activeFilter.getAttribute('data-filter') : 'all';
    const rows = document.querySelectorAll('#changeTable tbody tr:not(.empty-state)');
    
    console.log('Applying filter:', filterValue);
    
    rows.forEach(row => {
    const priority = row.getAttribute('data-priority');
    if (filterValue === 'all' || priority === filterValue) {
        row.style.display = '';
    } else {
        row.style.display = 'none';
    }
    });
}

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
    
    rows.forEach(row => applyRowHighlight(row));
    
    applyActiveFilter();
    });
});

const tzToggle = document.getElementById('tzToggle');
const DateTime = luxon.DateTime;

function convertToIST(timeStr, dateStr) {
    try {
    if (timeStr === "-") {
        return "-";
    }
    
    if (timeStr.includes('-')) {
        const [start, end] = timeStr.split('-');
        return `${convertToIST(start.trim(), dateStr)}-${convertToIST(end.trim(), dateStr)}`;
    }

    const dt = DateTime.fromFormat(`${dateStr} ${timeStr}`, 'yyyy-MM-dd HH:mm', {
        zone: 'Europe/Stockholm'
    });
    
    const istTime = dt.setZone('Asia/Kolkata');
    return istTime.toFormat('hh:mm a');
    } catch (e) {
    console.error('Error converting time:', e);
    return 'Invalid time';
    }
}

tzToggle.addEventListener('change', function() {
    const timeColumns = document.querySelectorAll('.time-column');
    const tzLabel = document.getElementById('tzLabel');
    const warning = document.querySelector('.time-conversion-warning');
    
    if (this.checked) {
    timeColumns[0].innerHTML = 'Start Time<span class="time-zone">(IST)</span>';
    timeColumns[1].innerHTML = 'End Time<span class="time-zone">(IST)</span>';
    tzLabel.textContent = 'Showing times in IST';
    } else {
    timeColumns[0].innerHTML = 'Start Time<span class="time-zone">(Sweden)</span>';
    timeColumns[1].innerHTML = 'End Time<span class="time-zone">(Sweden)</span>';
    tzLabel.textContent = 'Show times in IST';
    }
    
    warning.style.display = this.checked ? 'flex' : 'none';

    const rows = document.querySelectorAll('#changeTable tbody tr');
    const dateCell = rows[0]?.querySelector('td:nth-child(2)');
    const date = dateCell?.textContent || '2025-02-15';

    rows.forEach(row => {
    const startTimeCell = row.querySelector('td:nth-child(3)');
    const endTimeCell = row.querySelector('td:nth-child(4)');
    
    if (startTimeCell && endTimeCell) {
        if (this.checked) {
        if (!startTimeCell.dataset.original) {
            startTimeCell.dataset.original = startTimeCell.textContent;
        }
        if (!endTimeCell.dataset.original) {
            endTimeCell.dataset.original = endTimeCell.textContent;
        }
        
        const startTimeConverted = convertToIST(startTimeCell.dataset.original, date);
        const endTimeConverted = convertToIST(endTimeCell.dataset.original, date);
        
        startTimeCell.textContent = startTimeConverted;
        endTimeCell.textContent = endTimeConverted;
        } else {
        if (startTimeCell.dataset.original) {
            startTimeCell.textContent = startTimeCell.dataset.original;
        }
        if (endTimeCell.dataset.original) {
            endTimeCell.textContent = endTimeCell.dataset.original;
        }
        }
    }
    });
});

document.getElementById('copyEmail').addEventListener('click', function() {
    const textToCopy = document.getElementById('emailBody').textContent;
    navigator.clipboard.writeText(textToCopy)
    .then(() => alert('Email content copied to clipboard!'));
});

document.getElementById('downloadText').addEventListener('click', function() {
    const text = document.getElementById('emailBody').textContent;
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'email_content.txt';
    a.click();
});

document.getElementById('toggleWordWrap').addEventListener('click', function() {
    const emailBody = document.getElementById('emailBody');
    emailBody.style.whiteSpace = 
    emailBody.style.whiteSpace === 'pre' ? 'pre-wrap' : 'pre';
});

let fontSize = 14;
document.getElementById('increaseFontSize').addEventListener('click', function() {
    fontSize = Math.min(fontSize + 2, 24);
    document.getElementById('emailBody').style.fontSize = `${fontSize}px`;
});

document.getElementById('decreaseFontSize').addEventListener('click', function() {
    fontSize = Math.max(fontSize - 2, 10);
    document.getElementById('emailBody').style.fontSize = `${fontSize}px`;
});

const infoModal = document.getElementById('infoModal');
const howItWorksBtn = document.getElementById('howItWorksBtn');

howItWorksBtn.onclick = function() {
    infoModal.style.display = "block";
}

window.onclick = function(event) {
    if (event.target == infoModal) {
    infoModal.style.display = "none";
    }
    if (event.target == modal) {
    modal.style.display = "none";
    }
}

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

document.getElementById('downloadHtml').addEventListener('click', function() {
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

const headerTitle = document.getElementById('headerTitle');
const editHeaderBtn = document.getElementById('editHeaderBtn');
const saveHeaderBtn = document.getElementById('saveHeaderBtn');

editHeaderBtn.addEventListener('click', function() {
    ensureAuthenticated(() => {
        headerTitle.contentEditable = true;
        headerTitle.classList.add('editable');
        headerTitle.focus();
        editHeaderBtn.style.display = 'none';
        saveHeaderBtn.style.display = 'flex';
    }, "Please enter the passkey to edit title");
});

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

function showLoading() {
    document.querySelector('.loading-overlay').style.display = 'flex';
}

function hideLoading() {
    document.querySelector('.loading-overlay').style.display = 'none';
}

function showError(message) {
    const toast = document.getElementById('errorToast');
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
    toast.style.display = 'none';
    }, 5000);
}

document.getElementById('fileInput').addEventListener('change', function(e) {
    if (this.files.length > 0) {
    const file = this.files[0];
    if (!file.name.toLowerCase().endswith('.msg')) {
        showError('Please upload a .MSG file');
        return;
    }
    
    showLoading();
    document.getElementById('uploadForm').submit();
    }
});

document.addEventListener('DOMContentLoaded', function() {
    initializeFileUpload();
    
    const rows = document.querySelectorAll('#changeTable tbody tr');
    if (rows) {
    rows.forEach(row => initImpactSelector(row));
    }
    
    const allFilterBtn = document.querySelector('.filter-btn[data-filter="all"]');
    if (allFilterBtn) {
    allFilterBtn.classList.add('active');
    }
    
    checkEmptyTable();
});

function initializeFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const uploadForm = document.getElementById('uploadForm');
    const loadingOverlay = document.querySelector('.loading-overlay');
    const errorToast = document.getElementById('errorToast');

    if (fileInput && uploadForm) {
    fileInput.addEventListener('change', function(e) {
        if (this.files.length > 0) {
        const file = this.files[0];
        if (!file.name.toLowerCase().endswith('.msg')) {
            showError('Please upload a .MSG file');
            return;
        }
        
        if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
        }
        
        uploadForm.submit();
        }
    });
    }
}
document.addEventListener('DOMContentLoaded', function() {
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadModal = document.getElementById('uploadModal');
    const uploadZone = document.getElementById('uploadZone');
    const uploadPreview = document.getElementById('uploadPreview');
    const cancelUpload = document.getElementById('cancelUpload');
    const fileInput = document.getElementById('fileInput');

    uploadBtn.addEventListener('click', () => {
        ensureAuthenticated(() => {
            uploadModal.style.display = 'flex';
            uploadZone.style.display = 'flex';
        }, "Please enter the passkey to upload a file");
    });

    cancelUpload.addEventListener('click', () => {
        uploadModal.style.display = 'none';
        uploadPreview.style.display = 'none';
        uploadZone.classList.remove('drag-over');
    });


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
                    document.getElementById('uploadForm').submit();
                }
            }, 100);
        }
    });

    uploadZone.addEventListener('click', () => {
        fileInput.click();
    });

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
                    document.getElementById('uploadForm').submit();
                }
            }, 100);
        }
    });
});

document.addEventListener('DOMContentLoaded', function() {
    const themeToggle = document.getElementById('themeToggle');
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
    
    function updateThemeIcon(theme) {
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
});

document.getElementById('resetForm').addEventListener('click', function() {
    if (confirm('Are you sure you want to reset the form? This will clear all data.')) {
        window.location.href = '/';
    }
});

document.addEventListener('DOMContentLoaded', function() {
// Existing initialization code...

// New email comparison functionality
const toggleLayoutBtn = document.getElementById('toggleLayout');
const highlightDataBtn = document.getElementById('highlightData');
const searchBtn = document.getElementById('searchBtn');
const emailSearch = document.getElementById('emailSearch');
const searchResults = document.getElementById('searchResults');
const emailBody = document.getElementById('emailBody');
const parsedDataRows = document.querySelectorAll('#parsedDataBody tr');

// New edit functionality
const editDataBtn = document.getElementById('editDataBtn');
const saveDataBtn = document.getElementById('saveDataBtn');
let isEditing = false;

// Toggle edit mode for the parsed data table
editDataBtn.addEventListener('click', function() {
ensureAuthenticated(() => {
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

// Save changes from the parsed data table to the main table
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
        updateMainTableFromParsedData();
        
        // Show success notification
        createNotification('success', 'Changes saved locally!');
        
        // Show sync reminder notification after a short delay
        setTimeout(() => {
            createNotification('info', 'Remember to click "Sync" to update changes across devices', 5000);
        }, 1000);
    }, 500);
});
// Function to update the main table with data from the parsed data table
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

// If timezone toggle is checked, convert times to IST
if (document.getElementById('tzToggle').checked) {
document.getElementById('tzToggle').dispatchEvent(new Event('change'));
}

// Apply active filter
applyActiveFilter();

// Check if table is empty
checkEmptyTable();
}
// When a row in the parsed data table is clicked in edit mode
document.querySelector('.parsed-data-table').addEventListener('click', function(e) {
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

let isHighlighted = false;

// Toggle between side-by-side and stacked layout
toggleLayoutBtn.addEventListener('click', function() {
ensureAuthenticated(() => {
const modalContent = document.querySelector('.modal-content');
modalContent.classList.toggle('layout-stacked');
}, "Please enter the passkey to change comparison layout");
});

// Highlight data in the email content
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

// Search functionality
searchBtn.addEventListener('click', performSearch);
emailSearch.addEventListener('keypress', function(e) {
if (e.key === 'Enter') {
performSearch();
}
});

// Row highlighting when hovering over parsed data
parsedDataRows.forEach(row => {
row.addEventListener('mouseenter', function() {
const serviceName = this.getAttribute('data-service');
highlightServiceInEmail(serviceName);
this.classList.add('highlight-row');
});

row.addEventListener('mouseleave', function() {
if (!isHighlighted) {
resetEmailHighlights();
}
this.classList.remove('highlight-row');
});
});

function highlightEmailContent() {
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
emailContent = escapeHtml(emailBody.textContent);

// Highlight dates
const datePattern = /\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/g;
emailContent = emailContent.replace(datePattern, '<span class="highlight-date">$&</span>');

// Highlight times
const timePattern = /\b([0-1]?[0-9]|2[0-3])[:][0-5][0-9](\s*-\s*([0-1]?[0-9]|2[0-3])[:][0-5][0-9])?\b/g;
emailContent = emailContent.replace(timePattern, '<span class="highlight-time">$&</span>');

// Highlight service names
services.forEach(service => {
if (service.name.trim()) {
const nameRegex = new RegExp('\\b' + escapeRegExp(service.name.trim()) + '\\b', 'gi');
emailContent = emailContent.replace(nameRegex, '<span class="highlight-service">$&</span>');
}
});

emailBody.innerHTML = emailContent;
}

function resetEmailHighlights() {
emailBody.innerHTML = escapeHtml(emailBody.textContent);
}

function highlightServiceInEmail(serviceName) {
if (!serviceName.trim()) return;

let content = emailBody.textContent;
const nameRegex = new RegExp('\\b' + escapeRegExp(serviceName.trim()) + '\\b', 'gi');

if (content.match(nameRegex)) {
content = escapeHtml(content);
content = content.replace(nameRegex, '<span class="highlight-match">$&</span>');
emailBody.innerHTML = content;

// Scroll to the first match
const firstMatch = emailBody.querySelector('.highlight-match');
if (firstMatch) {
firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
}
}

function performSearch() {
const searchTerm = emailSearch.value.trim();
if (!searchTerm) return;

let content = emailBody.textContent;
const regex = new RegExp(escapeRegExp(searchTerm), 'gi');
const matches = content.match(regex);

if (matches && matches.length > 0) {
searchResults.textContent = `${matches.length} matches found`;

content = escapeHtml(content);
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

// Helper functions
function escapeHtml(unsafe) {
return unsafe
.replace(/&/g, "&amp;")
.replace(/</g, "&lt;")
.replace(/>/g, "&gt;")
.replace(/"/g, "&quot;")
.replace(/'/g, "&#039;");
}

function escapeRegExp(string) {
return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
});

// ...existing code...

// Save changes from the parsed data table to the main table
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

// Collect data from the parsed table to send to the server
const parsedRows = document.querySelectorAll('#parsedDataBody tr');
const services = [];

parsedRows.forEach(row => {
if (row.cells[0].textContent.trim() === '') return; // Skip empty rows

const serviceName = row.cells[0].textContent;
const date = row.cells[1].textContent;

// Parse time range (e.g., "09:00 - 11:00" to start and end times)
let startTime = '';
let endTime = '';
const timeRange = row.cells[2].textContent;

if (timeRange.includes('-')) {
const timeParts = timeRange.split('-');
startTime = timeParts[0].trim();
endTime = timeParts[1].trim();
} else {
startTime = timeRange;
}

const comments = row.cells[3].textContent;

// Add this service to our array
services.push({
name: serviceName,
start_time: startTime,
end_time: endTime,
end_date: date,
comments: comments,
priority: 'low'  // Default priority
});
});

// Send data to server for persistence
// fetch('/save-parsed-data', {
// method: 'POST',
// headers: {
// 'Content-Type': 'application/json'
// },
// body: JSON.stringify({
// services: services,
// date: document.querySelector('#parsedDataBody tr td:nth-child(2)').textContent // Use the date from first row
// })
// })
// .then(response => response.json())
// .then(data => {
// if (data.status === 'success') {
// // Update the main table with the edited data
// updateMainTableFromParsedData();
// } else {
// alert('Error saving data: ' + (data.message || 'Unknown error'));
// }
// })
// .catch(error => {
// console.error('Error:', error);
// alert('Error saving data. Please try again.');
// });
 });

// ...existing code...

// Update the reset form handler to call the reset API
document.getElementById('resetForm').addEventListener('click', function() {
if (confirm('Are you sure you want to reset the form? This will clear all data.')) {
fetch('/reset-data', {
method: 'POST',
headers: {
'Content-Type': 'application/json'
},
body: JSON.stringify({})
})
.then(response => response.json())
.then(data => {
window.location.href = '/';
})
.catch(error => {
console.error('Error:', error);
window.location.href = '/';
});
}
});

// Add this function to gather all data from the table and save it to Redis
function syncAllDataToRedis() {
const tableRows = document.querySelectorAll('#changeTable tbody tr:not(.empty-state)');
const services = [];

// If there are no rows, don't proceed
if (tableRows.length === 0) {
alert('No data to sync.');
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
loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> syncing data...';
loadingEl.style = 'position:fixed; top:20px; right:20px; background:var(--primary-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
document.body.appendChild(loadingEl);

// Send to server
fetch('/sync-all-data', {
method: 'POST',
headers: {
    'Content-Type': 'application/json'
},
body: JSON.stringify(data)
})
.then(response => response.json())
.then(result => {
document.body.removeChild(loadingEl);
if (result.status === 'success') {
    const successEl = document.createElement('div');
    successEl.className = 'sync-success';
    successEl.innerHTML = '<i class="fas fa-check-circle"></i> Data synced successfully!';
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

// Add event listener for the sync button
document.addEventListener('DOMContentLoaded', function() {
const syncBtn = document.getElementById('syncData');
if (syncBtn) {
syncBtn.addEventListener('click', syncAllDataToRedis);
}

// Enhance the row save functionality to ensure data is saved to Redis
document.querySelector('table').addEventListener('click', function(e) {
if (e.target.closest('.save-btn')) {
    const row = e.target.closest('tr');
    const cells = row.getElementsByTagName('td');
    
    // Update original data attributes for time cells
    const startTimeCell = cells[2];
    const endTimeCell = cells[3];
    
    startTimeCell.dataset.original = startTimeCell.textContent;
    endTimeCell.dataset.original = endTimeCell.textContent;

    // Make cells not editable
    for (let i = 0; i < cells.length - 1; i++) {
        cells[i].contentEditable = false;
        cells[i].classList.remove('editable');
    }
    
    // Update UI
    row.querySelector('.save-btn').style.display = 'none';
    row.querySelector('.edit-btn').style.display = 'inline-flex';
    
    applyRowHighlight(row);
    
    // Get all data needed for saving
    const rowData = {
        service: cells[0].textContent,
        date: cells[1].textContent,
        startTime: cells[2].textContent,
        endTime: cells[3].textContent,
        endDate: cells[4].textContent,
        comments: cells[5].textContent,
        impactPriority: row.querySelector('.impact-selector').getAttribute('data-value')
    };
    
    // Send to server
    fetch('/save-changes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(rowData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.status !== 'success') {
            console.error('Error saving row:', data.message);
            alert('Error saving data. You may need to refresh the page and try again.');
        }
    })
    .catch(error => {
        console.error('Error saving row:', error);
        alert('Network error while saving. Please try again.');
    });
}
});

// Enhanced impact selector to save changes immediately

});


document.addEventListener('DOMContentLoaded', function() {
const resetFormBtn = document.getElementById('resetForm');

// Remove any existing event listeners by cloning and replacing the button
const newResetBtn = resetFormBtn.cloneNode(true);
resetFormBtn.parentNode.replaceChild(newResetBtn, resetFormBtn);

// Add a single event listener to the new button
newResetBtn.addEventListener('click', function(e) {
e.preventDefault();
e.stopPropagation();

if (confirm('Are you sure you want to reset the form? This will clear all data.')) {
    // Show loading indicator
    const loadingEl = document.createElement('div');
    loadingEl.className = 'sync-loading';
    loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting data...';
    loadingEl.style = 'position:fixed; top:20px; right:20px; background:var(--primary-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
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
        alert('Error resetting data. Please try again.');
    });
}
});

// Removed getEventListeners block to avoid "ReferenceError: getEventListeners is not defined"
// const oldHandlers = getEventListeners || (el => ({}));
// const existingResetHandlers = oldHandlers(document.getElementById('resetForm')) || {};
// if (existingResetHandlers.click) {
//     existingResetHandlers.click.forEach(handler => {
//         if (handler !== newResetBtn.onclick) {
//             document.getElementById('resetForm').removeEventListener('click', handler);
//         }
//     });
// }
});

// ...existing code...

// Replace the syncAllDataToRedis function with this improved version
function syncAllDataToRedis() {
const tableRows = document.querySelectorAll('#changeTable tbody tr:not(.empty-state)');
const services = [];

// If there are no rows, don't proceed
if (tableRows.length === 0) {
alert('No data to sync.');
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
loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> fetching latest data from redis...';
loadingEl.style = 'position:fixed; top:20px; right:20px; background:var(--primary-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
document.body.appendChild(loadingEl);

// Disable any unsaved changes warnings
window.onbeforeunload = null;

// Send to server
fetch('/sync-all-data', {
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
    successEl.innerHTML = '<i class="fas fa-check-circle"></i> Data synced successfully!';
    successEl.style = 'position:fixed; top:20px; right:20px; background:var(--success-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
    document.body.appendChild(successEl);
    
    // Ask the user if they want to reload for a fresh state
    if (confirm('Data uploaded successfully! Reload page to ensure you have the latest data :)')) {
        // Force a complete refresh with no caching
        const reloadUrl = window.location.href.split('?')[0] + '?nocache=' + new Date().getTime();
        window.location.replace(reloadUrl);
    } else {
        // Just remove the success message after a delay
        setTimeout(() => {
            document.body.removeChild(successEl);
        }, 3000);
    }
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

// Add a function to periodically check for updates from other tabs
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

// Initialize update checker on page load
document.addEventListener('DOMContentLoaded', function() {
// ...existing initialization code...

setupUpdateChecker();

// Add this to prevent the "confirm form resubmission" dialog
if (window.history.replaceState) {
window.history.replaceState(null, null, window.location.href);
}
});
// ...existing code...

// Make sure our page starts fresh by adding cache control meta tags

// Add history functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initialize dropdown menu behavior
    const syncDropdown = document.getElementById('syncDropdown');
    const dropdownMenu = document.querySelector('.dropdown-menu');
    
    if (syncDropdown) {
        syncDropdown.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            ensureAuthenticated(() => {
                syncDropdown.parentElement.classList.toggle('open');
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
        
        // Handle dropdown item clicks
        document.getElementById('syncToRedis').addEventListener('click', function() {
            syncAllDataToRedis(false); // Regular sync without history
            const dropdownParent = syncDropdown.parentElement;
            if (dropdownParent) {
                dropdownParent.classList.remove('open');
            }
        });
        
        document.getElementById('syncToHistory').addEventListener('click', function() {
            syncAllDataToRedis(true); // Sync and save to history
            const dropdownParent = syncDropdown.parentElement;
            if (dropdownParent) {
                dropdownParent.classList.remove('open');
            }
        });
        
        document.getElementById('viewHistory').addEventListener('click', function() {
            openHistoryModal();
            const dropdownParent = syncDropdown.parentElement;
            if (dropdownParent) {
                dropdownParent.classList.remove('open');
            }
        });
    }
    
    // History modal
    const historyModal = document.getElementById('historyModal');
    const historyModalClose = historyModal.querySelector('.close');
    
    historyModalClose.addEventListener('click', function() {
        historyModal.style.display = "none";
    });
    
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
    
    // History search functionality
    const historySearch = document.getElementById('historySearch');
    const historyClearSearch = document.getElementById('historyClearSearch');
    
    historySearch.addEventListener('input', function() {
        filterHistoryItems(this.value);
    });
    
    historyClearSearch.addEventListener('click', function() {
        historySearch.value = '';
        filterHistoryItems('');
    });
});

// Enhanced version of syncAllDataToRedis to support history
function syncAllDataToRedis(saveToHistory = false) {
    const tableRows = document.querySelectorAll('#changeTable tbody tr:not(.empty-state)');
    const services = [];
    
    // If there are no rows, don't proceed
    if (tableRows.length === 0) {
        alert('No data to sync.');
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

// Open history modal and load history items
function openHistoryModal() {
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
            
            // Count services for summary
            const serviceCount = item.data?.services?.length || 0;
            
            historyItem.innerHTML = `
                <div class="history-item-header">
                    <div class="history-item-title">
                        <span class="history-item-badge"></span>
                        ${item.title || 'Change Weekend'}
                    </div>
                    <div class="history-item-date">${item.date || 'Unknown date'}</div>
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
                loadHistoryItem(timestamp); // This will use our new custom dialog
            });
        });
        
        // Add event listeners to delete buttons
        document.querySelectorAll('.history-item-btn.delete').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const timestamp = this.closest('.history-item').dataset.timestamp;
                deleteHistoryItem(timestamp, this.closest('.history-item')); // This will use our new custom dialog
            });
        });
        
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

// Add this new function to delete a history item
function deleteHistoryItem(timestamp, itemElement) {
    // Show custom confirmation dialog
    createConfirmDialog({
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
}// Filter history items based on search input
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

// Load a specific history item by timestamp
function loadHistoryItem(timestamp) {
    // Show custom confirmation dialog
    createConfirmDialog({
        type: 'primary',
        icon: 'fa-cloud-download-alt',
        title: 'Load History Item',
        message: 'Are you sure you want to load this version? Current unsaved changes will be lost.',
        confirmText: 'Load',
        cancelText: 'Cancel'
    }).then(confirmed => {
        if (!confirmed) return;
        
        // Show loading state
        const loadingEl = document.createElement('div');
        loadingEl.className = 'sync-loading';
        loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading data from history...';
        loadingEl.style = 'position:fixed; top:20px; right:20px; background:var(--primary-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
        document.body.appendChild(loadingEl);
        
        // Close the history modal
        document.getElementById('historyModal').style.display = "none";
        
        // Fetch from server
        fetch(`/load-from-history/${timestamp}`, {
            method: 'GET',
            cache: 'no-store'
        })
        .then(response => response.json())
        .then(result => {
            document.body.removeChild(loadingEl);
            if (result.status === 'success') {
                // Force a complete refresh with no caching
                const reloadUrl = window.location.href.split('?')[0] + '?nocache=' + new Date().getTime();
                window.location.replace(reloadUrl);
            } else {
                alert('Error loading data: ' + (result.message || 'Unknown error'));
            }
        })
        .catch(error => {
            document.body.removeChild(loadingEl);
            console.error('Error:', error);
            alert('Error loading data. Please try again.');
        });
    });
}

// Add this function to create custom confirmation dialogs
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

// ...existing code...

// Update the promptForPasskey function to always require a passkey
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
                <input type="password" id="passkey-input" class="passkey-input" placeholder="Enter passkey">
                <div class="custom-confirm-actions">
                    <button class="custom-confirm-cancel">Cancel</button>
                    <button class="custom-confirm-ok primary-btn">Submit</button>
                </div>
            </div>
        `;
        
        // Add to DOM
        document.body.appendChild(dialogOverlay);
        
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
        
        // Handle Enter key in the input field
        passkeyInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmBtn.click();
            }
        });
        
        // Confirm action
        confirmBtn.addEventListener('click', () => {
            const passkey = passkeyInput.value.trim();
            dialogOverlay.classList.remove('active');
            
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
                    setTimeout(() => {
                        dialogOverlay.remove();
                        createNotification('success', 'Authentication successful!');
                        resolve(true);
                    }, 300);
                } else {
                    setTimeout(() => {
                        dialogOverlay.remove();
                        createNotification('error', 'Invalid passkey. Access denied.');
                        resolve(false);
                    }, 300);
                }
            })
            .catch(error => {
                setTimeout(() => {
                    dialogOverlay.remove();
                    createNotification('error', 'Error validating passkey. Please try again.');
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

// Fix the sync dropdown behavior
document.addEventListener('DOMContentLoaded', function() {
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
            
            ensureAuthenticated(() => {
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
});

// This function sets up the dropdown item click handlers
function setupDropdownActions(dropdownParent) {
    // Handle dropdown item clicks
    document.getElementById('syncToRedis').addEventListener('click', function() {
        syncAllDataToRedis(false); // Regular sync without history
        if (dropdownParent) {
            dropdownParent.classList.remove('open');
        }
    });
    
    document.getElementById('syncToHistory').addEventListener('click', function() {
        syncAllDataToRedis(true); // Sync and save to history
        if (dropdownParent) {
            dropdownParent.classList.remove('open');
        }
    });
    
    document.getElementById('viewHistory').addEventListener('click', function() {
        openHistoryModal();
        if (dropdownParent) {
            dropdownParent.classList.remove('open');
        }
    });
}

// Add info icons to the dropdown items
document.addEventListener('DOMContentLoaded', function() {
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
});

// ...existing code...

// Add this function to create notifications
function createNotification(type, message) {
  // Remove any existing notifications
  const existingNotifications = document.querySelectorAll('.notification');
  existingNotifications.forEach(note => note.remove());
  
  // Create new notification
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  
  // Add appropriate icon based on type
  let icon = 'fa-info-circle';
  if (type === 'error') icon = 'fa-exclamation-circle';
  if (type === 'success') icon = 'fa-check-circle';
  
  notification.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => notification.classList.add('show'), 10);
  
  // Auto-dismiss after 3 seconds
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300); // Wait for animation to complete
  }, 3000);
  
  return notification;
}

// Update the resetForm event listener to use our custom dialog
document.addEventListener('DOMContentLoaded', function() {
  const resetFormBtn = document.getElementById('resetForm');
  if (resetFormBtn) {
    // Remove any existing event listeners
    resetFormBtn.replaceWith(resetFormBtn.cloneNode(true));
    const newResetBtn = document.getElementById('resetForm');
    
    // Add custom confirm dialog
    newResetBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // Show custom confirmation dialog
      createConfirmDialog({
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
          createNotification('error', 'Error resetting data. Please try again.');
        });
      });
    });
  }
});

// Update the promptForPasskey function to properly show error messages
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
        <input type="password" id="passkey-input" class="passkey-input" placeholder="Enter passkey">
        <div class="custom-confirm-actions">
          <button class="custom-confirm-cancel">Cancel</button>
          <button class="custom-confirm-ok primary-btn">Submit</button>
        </div>
      </div>
    `;
    
    // Add to DOM
    document.body.appendChild(dialogOverlay);
    
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
    
    // Handle Enter key in the input field
    passkeyInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmBtn.click();
      }
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
            createNotification('success', 'Authentication successful!');
            resolve(true);
          }, 500);
        } else {
          // Show error but keep dialog open
          const errorMessage = document.createElement('div');
          errorMessage.className = 'passkey-error';
          errorMessage.innerHTML = '<i class="fas fa-exclamation-circle"></i> Invalid passkey. Please try again.';
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
          createNotification('error', 'Error validating passkey. Please try again.');
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

// ...existing code...

// Update the resetForm event listener to require a passkey and use our custom dialog
document.addEventListener('DOMContentLoaded', function() {
  const resetFormBtn = document.getElementById('resetForm');
  if (resetFormBtn) {
    // Remove any existing event listeners
    resetFormBtn.replaceWith(resetFormBtn.cloneNode(true));
    const newResetBtn = document.getElementById('resetForm');
    
    // Add passkey authentication before showing the confirm dialog
    newResetBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // First prompt for passkey authentication with a reset-specific message
      ensureAuthenticated(() => {
        createConfirmDialog({
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
            createNotification('error', 'Error resetting data. Please try again.');
          });
        });
      }, "Please enter the passkey to reset all data");
    });
  }
});

// ...existing code...

// Add authentication helper functions and feature toggling
function isAuthenticated() {
    const authUntil = localStorage.getItem('authUntil');
    return authUntil && Date.now() < parseInt(authUntil);
}

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

function disableRestrictedFeatures() {
    document.querySelectorAll('.impact-selector').forEach(el => {
        el.style.pointerEvents = 'none';
        el.style.opacity = '0.5';
    });
    document.querySelectorAll('.action-cell').forEach(el => {
        el.style.pointerEvents = 'none';
        el.style.opacity = '0.5';
    });
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.disabled = true;
    }
}

function enableRestrictedFeatures() {
    document.querySelectorAll('.impact-selector').forEach(el => {
        el.style.pointerEvents = '';
        el.style.opacity = '1';
    });
    document.querySelectorAll('.action-cell').forEach(el => {
        el.style.pointerEvents = '';
        el.style.opacity = '1';
    });
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.disabled = false;
    }
}

// On DOMContentLoaded, disable restricted features if not authenticated.
document.addEventListener('DOMContentLoaded', function() {
    if (!isAuthenticated()) {
        disableRestrictedFeatures();
    } else {
        enableRestrictedFeatures();
    }
    // ...existing code...
});
