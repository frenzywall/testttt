class AIStatusManager {
    constructor() {
        this.lastValidated = null;
        this.validationInterval = null;
        this.refreshInterval = null;
        this.hasInitialValidation = false;
        this.init();
    }

    init() {
        this.bindEvents();
        this.startValidationTimer();
        this.updateValidationDisplay();
    }

    bindEvents() {
        // AI Status button
        const aiStatusBtn = document.getElementById('aiStatusBtn');
        if (aiStatusBtn) {
            aiStatusBtn.addEventListener('click', () => this.showAIStatusModal());
        }

        // Modal close
        const modal = document.getElementById('aiStatusModal');
        if (modal) {
            const closeBtn = modal.querySelector('.close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.hideAIStatusModal());
            }

            // Close on outside click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideAIStatusModal();
                }
            });
        }

        // Refresh button
        const refreshStatusBtn = document.getElementById('refreshStatus');
        if (refreshStatusBtn) {
            refreshStatusBtn.addEventListener('click', () => this.refreshStatus());
        }
    }

    async loadAIStatus() {
        try {
            console.log('Loading AI status...'); // Debug log
            this.setCheckingStates();
            
            const response = await fetch('/ai-status');
            if (response.ok) {
                const data = await response.json();
                console.log('AI Status response:', data); // Debug log
                this.updateStatusDisplay(data);
                this.lastValidated = new Date();
                this.hasInitialValidation = true;
                this.updateValidationDisplay();
            } else {
                this.updateStatusDisplay({
                    model: 'Unknown',
                    apiKeyStatus: 'error',
                    connectionStatus: 'error',
                    error: 'Failed to load status'
                });
                this.lastValidated = new Date();
                this.updateValidationDisplay();
            }
        } catch (error) {
            console.error('Error loading AI status:', error);
            this.updateStatusDisplay({
                model: 'Unknown',
                apiKeyStatus: 'error',
                connectionStatus: 'error',
                error: 'Connection error'
            });
            this.lastValidated = new Date();
            this.updateValidationDisplay();
        }
    }

    setCheckingStates() {
        // Update API key status to checking
        const apiKeyStatus = document.getElementById('apiKeyStatus');
        if (apiKeyStatus) {
            apiKeyStatus.className = 'status-indicator checking';
            apiKeyStatus.innerHTML = '<div class="indicator-dot"></div><span>Checking...</span>';
        }

        // Update connection status to checking
        const connectionStatus = document.getElementById('connectionStatus');
        if (connectionStatus) {
            connectionStatus.className = 'status-indicator checking';
            connectionStatus.innerHTML = '<div class="indicator-dot"></div><span>Testing...</span>';
        }

        // Add checking state animation to status cards
        const statusCards = document.querySelectorAll('.status-card');
        statusCards.forEach(card => {
            card.classList.add('checking-state');
        });

        // Remove checking state after a delay
        setTimeout(() => {
            statusCards.forEach(card => {
                card.classList.remove('checking-state');
            });
        }, 2000);
    }

    updateStatusDisplay(data) {
        // Update model info
        const currentModel = document.getElementById('currentModel');
        if (currentModel) {
            let modelText = data.model || 'Unknown';
            if (data.modelAvailable === false) {
                modelText += ' ❌';
            } else if (data.modelAvailable === true) {
                modelText += ' ✅';
            }
            currentModel.textContent = modelText;
        }

        // Update API key status
        const apiKeyStatus = document.getElementById('apiKeyStatus');
        if (apiKeyStatus) {
            let status = data.apiKeyStatus || 'unknown';
            let statusText = this.getStatusText(status);
            
            if (!data.apiKeyConfigured) {
                status = 'error';
                statusText = 'Not Configured';
            }
            
            apiKeyStatus.className = `status-indicator ${status}`;
            apiKeyStatus.innerHTML = `<div class="indicator-dot"></div><span>${statusText}</span>`;
        }

        // Update connection status
        const connectionStatus = document.getElementById('connectionStatus');
        if (connectionStatus) {
            const status = data.connectionStatus || 'unknown';
            let statusText = this.getStatusText(status);
            
            // Show error details in tooltip or truncated
            if (status === 'error' && data.error) {
                const shortError = data.error.length > 30 ? data.error.substring(0, 30) + '...' : data.error;
                statusText = shortError;
            }
            
            connectionStatus.className = `status-indicator ${status}`;
            connectionStatus.innerHTML = `<div class="indicator-dot"></div><span>${statusText}</span>`;
            
            // Add full error as title for tooltip
            if (data.error) {
                connectionStatus.title = data.error;
            }
        }

        // Update performance metrics with actual data from backend
        if (data.performance) {
            console.log('Updating performance metrics:', data.performance); // Debug log
            this.updateElement('responseTime', data.performance.responseTime || '--');
            this.updateElement('successRate', data.performance.successRate || '--');
            this.updateElement('requestCount', data.performance.requestCount || '--');
            this.updateElement('lastRequest', data.performance.lastRequest || '--');
        } else {
            console.log('No performance data received'); // Debug log
            // Fallback to default values
            this.updateElement('responseTime', '--');
            this.updateElement('successRate', '--');
            this.updateElement('requestCount', '--');
            this.updateElement('lastRequest', '--');
        }
    }

    updateElement(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
            console.log(`Updated ${elementId} with value: ${value}`); // Debug log
        } else {
            console.warn(`Element with ID ${elementId} not found`); // Debug log
        }
    }

    getStatusText(status) {
        switch (status) {
            case 'connected':
                return 'Connected';
            case 'disconnected':
                return 'Disconnected';
            case 'error':
                return 'Error';
            case 'warning':
                return 'Warning';
            case 'checking':
                return 'Checking...';
            default:
                return 'Not Checked';
        }
    }

    showAIStatusModal() {
        const modal = document.getElementById('aiStatusModal');
        if (modal) {
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden';
            
            // Load initial status
            this.loadAIStatus();
            
            // Set up auto-refresh every 30 seconds
            this.refreshInterval = setInterval(() => {
                this.loadAIStatus();
            }, 30000);
        }
    }

    hideAIStatusModal() {
        const modal = document.getElementById('aiStatusModal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
            
            // Clear auto-refresh interval
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }
        }
    }

    async refreshStatus() {
        const refreshBtn = document.getElementById('refreshStatus');
        if (refreshBtn) {
            refreshBtn.classList.add('refreshing');
            refreshBtn.disabled = true;
        }

        await this.loadAIStatus();

        setTimeout(() => {
            if (refreshBtn) {
                refreshBtn.classList.remove('refreshing');
                refreshBtn.disabled = false;
            }
        }, 1000);
    }

    startValidationTimer() {
        // Update validation time display every 30 seconds
        this.validationInterval = setInterval(() => {
            this.updateValidationDisplay();
        }, 30000);
    }

    updateValidationDisplay() {
        const validationTimeElement = document.getElementById('validationTime');
        if (validationTimeElement) {
            if (this.lastValidated) {
                const timeAgo = this.getTimeAgo(this.lastValidated);
                validationTimeElement.textContent = timeAgo;
                validationTimeElement.style.color = 'var(--primary-color)';
            } else {
                validationTimeElement.textContent = 'Never';
                validationTimeElement.style.color = '#f59e0b';
            }
        }
    }

    getTimeAgo(date) {
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 30) {
            return 'just now';
        }
        if (diffInSeconds < 60) {
            return `${diffInSeconds} seconds ago`;
        }

        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) {
            return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''} ago`;
        }

        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) {
            return `${diffInHours} hour${diffInHours !== 1 ? 's' : ''} ago`;
        }

        const diffInDays = Math.floor(diffInHours / 24);
        return `${diffInDays} day${diffInDays !== 1 ? 's' : ''} ago`;
    }

    destroy() {
        if (this.validationInterval) {
            clearInterval(this.validationInterval);
        }
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }
}

// Initialize AI Status Manager
document.addEventListener('DOMContentLoaded', () => {
    window.aiStatusManager = new AIStatusManager();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.aiStatusManager) {
        window.aiStatusManager.destroy();
    }
});