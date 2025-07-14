const style = document.createElement('style');
style.innerHTML = `
.fade-in {
    animation: fadeInMsg 0.5s ease;
}
`;
document.head.appendChild(style);

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
        // AI Status button with dropdown
        const aiStatusBtn = document.getElementById('aiStatusBtn');
        const aiStatusDropdown = document.getElementById('aiStatusDropdown');
        
        if (aiStatusBtn) {
            aiStatusBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                ensureAuthenticated(() => {
                    this.toggleDropdown();
                }, "Please enter the passkey to access AI status");
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (aiStatusDropdown && !aiStatusDropdown.contains(e.target) && !aiStatusBtn.contains(e.target)) {
                this.hideDropdown();
            }
        });

        // View Stats button
        const viewStatsBtn = document.getElementById('viewStatsBtn');
        if (viewStatsBtn) {
            viewStatsBtn.addEventListener('click', () => {
                this.hideDropdown();
                ensureAuthenticated(() => {
                    this.showAIStatusModal();
                }, "Please enter the passkey to view AI statistics");
            });
        }

        // Ask AI button (placeholder for future implementation)
        const askAiBtn = document.getElementById('askAiBtn');
        if (askAiBtn) {
            askAiBtn.addEventListener('click', () => {
                this.hideDropdown();
                ensureAuthenticated(() => {
                    this.showAskAiPlaceholder();
                }, "Please enter the passkey to access AI features");
            });
        }

        // Modal close
        const modal = document.getElementById('aiStatusModal');
        if (modal) {
            const closeBtn = modal.querySelector('.close') || document.getElementById('closeAiStatusModal');
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

        // Clear Stats button
        const clearStatsBtn = document.getElementById('clearStatsBtn');
        if (clearStatsBtn) {
            clearStatsBtn.addEventListener('click', () => this.clearStats());
        }
    }

    async loadAIStatus() {
        try {
            this.setCheckingStates();
            
            const response = await fetch('/ai-status');
            if (response.ok) {
                const data = await response.json();
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
            this.updateElement('responseTime', data.performance.responseTime || '--');
            this.updateElement('successRate', data.performance.successRate || '--');
            this.updateElement('requestCount', data.performance.requestCount || '--');
            this.updateElement('lastRequest', data.performance.lastRequest || '--');
        } else {
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
        } else {
            console.warn(`Element with ID ${elementId} not found`);
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
        // Close any open modal first
        const openModal = document.querySelector('.modal[style*="display: block"]');
        if (openModal) {
            if (openModal.id === 'aiStatusModal') {
                openModal.style.display = 'none';
            } else {
                openModal.remove();
            }
        }
        const modal = document.getElementById('aiStatusModal');
        if (modal) {
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden';
            
            // Load initial status only when modal is opened
            this.loadAIStatus();
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

    toggleDropdown() {
        const dropdown = document.getElementById('aiStatusDropdown');
        if (dropdown) {
            dropdown.classList.toggle('show');
        }
    }

    hideDropdown() {
        const dropdown = document.getElementById('aiStatusDropdown');
        if (dropdown) {
            dropdown.classList.remove('show');
        }
    }

    showAskAiPlaceholder() {
        this.showAskAiModal();
    }

    showAskAiModal() {
        // Close any open modal first
        const openModal = document.querySelector('.modal[style*="display: block"]');
        if (openModal) {
            if (openModal.id === 'aiStatusModal') {
                openModal.style.display = 'none';
            } else {
                openModal.remove();
            }
        }
        // Create the AI chat modal
        const modal = document.createElement('div');
        modal.id = 'askAiModal';
        modal.className = 'modal';
        modal.style.display = 'block';
        
        modal.innerHTML = `
            <div class="modal-content ai-chat-modal">
                <div class="modal-header">
                    <h2><i class="fas fa-robot"></i> Ask AI Assistant</h2>
                    <span class="close" id="closeAskAiModal">&times;</span>
                </div>
                <div class="chat-container">
                    <div class="chat-messages" id="chatMessages">
                        <div class="message ai-message">
                            <div class="message-content default-ai-message">
                                <i class="fas fa-robot"></i>
                                <p>Hello! I can help you understand this page. Ask me anything about the change management data, services, or any other information you see here.</p>
                            </div>
                        </div>
                    </div>
                    <div class="chat-input-container">
                        <div class="chat-input-wrapper">
                            <input type="text" id="chatInput" placeholder="Ask me about this page..." maxlength="500">
                            <button id="sendMessage" class="send-btn">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                        <div class="chat-suggestions">
                            <button class="suggestion-btn" data-question="What services are affected?">What services are affected?</button>
                            <button class="suggestion-btn" data-question="What is the maintenance schedule?">What is the maintenance schedule?</button>
                            <button class="suggestion-btn" data-question="Which services have high priority?">Which services have high priority?</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add event listeners
        this.setupAskAiEventListeners();
        
        // Focus on input
        setTimeout(() => {
            const chatInput = document.getElementById('chatInput');
            if (chatInput) chatInput.focus();
        }, 100);
    }

    setupAskAiEventListeners() {
        const modal = document.getElementById('askAiModal');
        const closeBtn = document.getElementById('closeAskAiModal');
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendMessage');
        const suggestionBtns = document.querySelectorAll('.suggestion-btn');
        const suggestionsContainer = document.querySelector('.chat-suggestions');
        let suggestionsHidden = false;
        
        // Helper to hide suggestions with animation
        function hideSuggestions() {
            if (suggestionsContainer && !suggestionsHidden) {
                suggestionsHidden = true;
                suggestionsContainer.classList.add('hide-suggestions');
                setTimeout(() => {
                    suggestionsContainer.style.display = 'none';
                }, 350); // Match CSS animation duration
            }
        }
        
        // Close modal
        closeBtn.addEventListener('click', () => {
            modal.remove();
        });
        
        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        // Close on escape
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape' && modal.style.display === 'block') {
                modal.remove();
                document.removeEventListener('keydown', escHandler);
            }
        });
        
        // Send message on Enter
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                hideSuggestions();
                this.sendMessage();
            }
        });
        
        // Send button click
        sendBtn.addEventListener('click', () => {
            hideSuggestions();
            this.sendMessage();
        });
        
        // Suggestion buttons
        suggestionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const question = btn.getAttribute('data-question');
                chatInput.value = question;
                hideSuggestions();
                this.sendMessage();
            });
        });
    }

    async sendMessage() {
        const chatInput = document.getElementById('chatInput');
        const chatMessages = document.getElementById('chatMessages');
        const message = chatInput.value.trim();
        
        if (!message) return;
        
        // Add user message
        const userMessage = document.createElement('div');
        userMessage.className = 'message user-message';
        userMessage.innerHTML = `
            <div class="message-content">
                <i class="fas fa-user"></i>
                <p>${this.escapeHtml(message)}</p>
            </div>
        `;
        chatMessages.appendChild(userMessage);
        
        // Clear input
        chatInput.value = '';
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Show typing indicator
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'message ai-message typing';
        typingIndicator.innerHTML = `
            <div class="message-content">
                <i class="fas fa-robot"></i>
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        chatMessages.appendChild(typingIndicator);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        try {
            // Get page context
            const pageContext = this.getPageContext();
            
            // Send to AI
            const response = await fetch('/ask-ai', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    question: message,
                    context: pageContext
                })
            });
            
            const result = await response.json();
            
            // Remove typing indicator
            typingIndicator.remove();
            
            // Add AI response
            const aiMessage = document.createElement('div');
            aiMessage.className = 'message ai-message fade-in';
            
            // Convert markdown to HTML
            const markdownResponse = result.response || 'Sorry, I could not process your request.';
            const htmlResponse = marked.parse(markdownResponse);
            
            aiMessage.innerHTML = `
                <div class="message-content ai-bubble">
                    <i class="fas fa-robot"></i>
                    <div class="ai-response-content">${htmlResponse}</div>
                </div>
            `;
            chatMessages.appendChild(aiMessage);
            
            // Optionally, add a divider or timestamp between message groups
            // Example: Uncomment below to add a timestamp
            // const timestamp = document.createElement('div');
            // timestamp.className = 'chat-timestamp';
            // timestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            // chatMessages.appendChild(timestamp);
            
            // Add fade-in effect for new messages
            setTimeout(() => {
                aiMessage.classList.remove('fade-in');
            }, 600);

        } catch (error) {
            console.error('Error sending message:', error);
            
            // Remove typing indicator
            typingIndicator.remove();
            
            // Add error message
            const errorMessage = document.createElement('div');
            errorMessage.className = 'message ai-message error';
            errorMessage.innerHTML = `
                <div class="message-content">
                    <i class="fas fa-robot"></i>
                    <p>Sorry, I encountered an error while processing your request. Please try again.</p>
                </div>
            `;
            chatMessages.appendChild(errorMessage);
        }
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    getPageContext() {
        const context = {
            pageTitle: document.title,
            headerTitle: document.getElementById('headerTitle')?.textContent || '',
            services: [],
            date: '',
            originalEmail: ''
        };
        
        // Get services data
        const tableRows = document.querySelectorAll('#changeTable tbody tr:not(.empty-state)');
        tableRows.forEach(row => {
            const cells = row.cells;
            if (cells.length >= 6) {
                context.services.push({
                    name: cells[0].textContent,
                    date: cells[1].textContent,
                    startTime: cells[2].textContent,
                    endTime: cells[3].textContent,
                    endDate: cells[4].textContent,
                    comments: cells[5].textContent,
                    priority: row.getAttribute('data-priority') || 'low'
                });
            }
        });
        
        // Get date
        if (context.services.length > 0) {
            context.date = context.services[0].date;
        }
        
        // Get original email content
        const emailBody = document.getElementById('emailBody');
        if (emailBody) {
            context.originalEmail = emailBody.textContent;
        }
        
        return context;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async clearStats() {
        const clearBtn = document.getElementById('clearStatsBtn');
        if (!clearBtn) return;

        // Show custom confirmation dialog
        const confirmed = await this.showCustomConfirmDialog({
            type: 'danger',
            icon: 'fa-trash',
            title: 'Clear AI Statistics',
            message: 'Are you sure you want to clear all AI performance statistics? This action cannot be undone.',
            confirmText: 'Clear Stats',
            cancelText: 'Cancel'
        });

        if (!confirmed) return;

        try {
            // Add clearing state
            clearBtn.classList.add('clearing');
            clearBtn.disabled = true;

            // Call the backend to clear stats
            const response = await fetch('/clear-ai-stats', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.status === 'success') {
                // Show success notification
                this.showNotification('success', 'AI statistics cleared successfully!');
                
                // Refresh the stats display
                await this.loadAIStatus();
            } else {
                // Show error notification
                this.showNotification('error', result.message || 'Failed to clear statistics');
            }
        } catch (error) {
            console.error('Error clearing stats:', error);
            this.showNotification('error', 'Error clearing statistics. Please try again.');
        } finally {
            // Remove clearing state
            clearBtn.classList.remove('clearing');
            clearBtn.disabled = false;
        }
    }

    showCustomConfirmDialog(options) {
        return createConfirmDialog(options);
    }

    showNotification(type, message) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        let icon = 'fa-info-circle';
        if (type === 'error') icon = 'fa-exclamation-circle';
        if (type === 'success') icon = 'fa-check-circle';
        
        notification.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
        notification.style.cssText = 'position:fixed; top:20px; right:20px; background:var(--primary-color); color:white; padding:10px 15px; border-radius:4px; z-index:10000;';
        
        if (type === 'error') {
            notification.style.background = 'var(--danger-color)';
        } else if (type === 'success') {
            notification.style.background = 'var(--success-color)';
        }
        
        document.body.appendChild(notification);
        
        // Remove notification after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
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
document.addEventListener('DOMContentLoaded', function() {
    window.aiStatusManager = new AIStatusManager();
    const closeAiStatusModalBtn = document.getElementById('closeAiStatusModal');
    if (closeAiStatusModalBtn) {
        closeAiStatusModalBtn.addEventListener('click', function() {
            const modal = document.getElementById('aiStatusModal');
            if (modal) {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        });
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.aiStatusManager) {
        window.aiStatusManager.destroy();
    }
});

// At the top or after DOMContentLoaded
fetch('/ai-chat-enabled')
  .then(res => res.json())
  .then(cfg => {
    if (!cfg.enabled) {
      const aiFloatContainer = document.querySelector('.ai-float-container');
      if (aiFloatContainer) aiFloatContainer.style.display = 'none';
    } else {
      const aiFloatContainer = document.querySelector('.ai-float-container');
      if (aiFloatContainer) aiFloatContainer.style.display = '';
    }
  })
  .catch(() => {
    // On error, default to visible
    const aiFloatContainer = document.querySelector('.ai-float-container');
    if (aiFloatContainer) aiFloatContainer.style.display = '';
  });