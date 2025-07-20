class DashboardApp {
    constructor() {
        this.ws = null;
        this.connectionStatus = 'disconnected';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5; // don't try forever
        this.data = {
            events: [],
            sessions: [],
            stats: {
                totalActive: 0,
                totalToday: 0,
                pagesVisited: {},
                connectedDashboards: 0
            }
        };
        
        this.init();
    }

    init() {
        console.log('🚀 Starting up the dashboard...');
        this.setupEventListeners();
        this.setupFocusTracking(); // track if user switches tabs
        this.setupHeartbeat(); // keep connection alive
        this.connectWebSocket();
        this.loadInitialData();
    }

    setupEventListeners() {
        // Filter panel controls
        document.getElementById('filterToggleBtn').addEventListener('click', () => {
            this.toggleFilterPanel();
        });

        document.getElementById('applyFilterBtn').addEventListener('click', () => {
            this.applyFilters();
        });

        document.getElementById('clearFilterBtn').addEventListener('click', () => {
            this.clearFilters();
        });

        // Action buttons
        document.getElementById('clearEventsBtn').addEventListener('click', () => {
            this.clearEvents();
        });

        document.getElementById('refreshSessionsBtn').addEventListener('click', () => {
            this.refreshSessions();
        });

        // Chart time range selector
        document.getElementById('chartTimeRange').addEventListener('change', (e) => {
            this.updateChart(parseInt(e.target.value));
        });

        // Modal controls
        document.getElementById('closeModalBtn').addEventListener('click', () => {
            this.closeModal();
        });

        // Click outside modal to close it
        document.getElementById('sessionModal').addEventListener('click', (e) => {
            if (e.target.id === 'sessionModal') {
                this.closeModal();
            }
        });
    }

    setupFocusTracking() {
        // Track when user focuses/blurs the dashboard - helps with better real-time updates
        window.addEventListener('focus', () => {
            console.log('📱 Dashboard focused');
            this.notifyFocusChange(true);
            // Refresh data when user comes back to the tab
            this.loadInitialData();
        });

        window.addEventListener('blur', () => {
            console.log('📱 Dashboard blurred');
            this.notifyFocusChange(false);
        });

        // Also track page visibility API (more reliable than focus/blur)
        document.addEventListener('visibilitychange', () => {
            const isVisible = !document.hidden;
            console.log('👁️ Visibility changed:', isVisible);
            this.notifyFocusChange(isVisible);
        });
    }

    setupHeartbeat() {
        // Send a heartbeat every 30 seconds to keep connection alive
        setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.sendHeartbeat();
            }
        }, 30000);
    }

    // WebSocket Connection Management
    connectWebSocket() {
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}`;
            
            console.log('🔌 Connecting to WebSocket:', wsUrl);
            
            this.ws = new WebSocket(wsUrl);
            this.updateConnectionStatus('connecting');

            this.ws.onopen = () => {
                console.log(' WebSocket connected successfully');
                this.updateConnectionStatus('connected');
                this.reconnectAttempts = 0;
            };

            this.ws.onmessage = (event) => {
                this.handleWebSocketMessage(event);
            };

            this.ws.onclose = () => {
                console.log(' WebSocket connection closed');
                this.updateConnectionStatus('disconnected');
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error(' WebSocket error:', error);
                this.updateConnectionStatus('disconnected');
            };

        } catch (error) {
            console.error(' Failed to create WebSocket connection:', error);
            this.updateConnectionStatus('disconnected');
        }
    }

    handleWebSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            console.log(' Received WebSocket message:', data);

            switch (data.type) {
                case 'connection_established':
                    this.handleConnectionEstablished(data.data);
                    break;
                
                case 'visitor_update':
                    this.handleVisitorUpdate(data.data);
                    break;
                
                case 'new_event':
                    this.handleNewEvent(data.data);
                    break;
                
                case 'user_connected':
                    this.handleUserConnected(data.data);
                    break;
                
                case 'user_disconnected':
                    this.handleUserDisconnected(data.data);
                    break;
                
                case 'session_activity':
                    this.handleSessionActivity(data.data);
                    break;
                
                case 'alert':
                    this.showAlert(data.data);
                    break;
                
                case 'detailed_stats_response':
                    this.handleDetailedStatsResponse(data.data);
                    break;
                
                case 'filtered_data_response':
                    this.handleFilteredDataResponse(data.data);
                    break;
                
                case 'chart_data_response':
                    this.handleChartDataResponse(data.data);
                    break;
                
                case 'session_details_response':
                    this.handleSessionDetailsResponse(data.data);
                    break;
                
                case 'stats_update':
                    this.handleStatsUpdate(data.data);
                    break;
                
                case 'heartbeat_response':
                    this.handleHeartbeatResponse(data.data);
                    break;
                
                case 'subscription_confirmed':
                    this.handleSubscriptionConfirmed(data.data);
                    break;
                
                case 'dashboard_action_broadcast':
                    this.handleDashboardActionBroadcast(data.data);
                    break;
                
                case 'error':
                    this.handleWebSocketError(data.data);
                    break;
                
                default:
                    console.warn(' Unknown WebSocket message type:', data.type);
            }
        } catch (error) {
            console.error(' Error parsing WebSocket message:', error);
        }
    }

    handleConnectionEstablished(data) {
        console.log('🎉 Connection established:', data);
        this.data.stats.connectedDashboards = data.totalDashboards;
        
        if (data.initialData) {
            this.updateDashboardData(data.initialData);
        }
        
        this.updateUI();
    }

    handleVisitorUpdate(data) {
        console.log('👤 Visitor update:', data);
        
        if (data.event) {
            this.data.events.unshift(data.event);
            // Keep only last 100 events in memory
            if (this.data.events.length > 100) {
                this.data.events = this.data.events.slice(0, 100);
            }
        }
        
        if (data.stats) {
            this.data.stats = { ...this.data.stats, ...data.stats };
        }
        
        if (data.activeSessions) {
            this.data.sessions = data.activeSessions;
        }
        
        this.updateUI();
        this.playNotificationSound();
    }

    handleUserConnected(data) {
        console.log('👥 User connected:', data);
        this.data.stats.connectedDashboards = data.totalDashboards;
        this.updateDashboardCount();
        this.showAlert({
            level: 'info',
            message: 'New dashboard connected',
            details: data
        });
    }

    handleUserDisconnected(data) {
        console.log('👤 User disconnected:', data);
        this.data.stats.connectedDashboards = data.totalDashboards;
        this.updateDashboardCount();
    }

    handleSessionActivity(data) {
        console.log(' Session activity:', data);
        // Update specific session in the list
        const sessionIndex = this.data.sessions.findIndex(s => s.sessionId === data.sessionId);
        if (sessionIndex !== -1) {
            this.data.sessions[sessionIndex] = { ...this.data.sessions[sessionIndex], ...data };
        } else {
            this.data.sessions.push(data);
        }
        this.updateSessionsList();
    }

    handleDetailedStatsResponse(data) {
        console.log(' Detailed stats response:', data);
        // Handle filtered results
        if (data.events) {
            this.updateVisitorFeed(data.events);
        }
    }

    handleNewEvent(data) {
        console.log(' New event received:', data);
        
        if (data.event) {
            // Add new event to the beginning of the array
            this.data.events.unshift(data.event);
            
            // Keep only last 100 events in memory
            if (this.data.events.length > 100) {
                this.data.events = this.data.events.slice(0, 100);
            }
            
            // Update the visitor feed
            this.updateVisitorFeed();
            
            // Show notification
            this.showNotification(`New ${data.event.type} event from ${data.event.country}`, 'info');
            
            // Play sound
            this.playNotificationSound();
        }
    }

    handleFilteredDataResponse(data) {
        console.log('🔍 Filtered data response:', data);
        
        if (data.events) {
            this.updateVisitorFeed(data.events);
        }
        
        if (data.sessions) {
            this.data.sessions = data.sessions;
            this.updateSessionsList();
        }
        
        if (data.summary) {
            this.data.stats = { ...this.data.stats, ...data.summary };
            this.updateStatsCards();
        }
        
        this.showNotification('Filtered data updated', 'success');
    }

    handleChartDataResponse(data) {
        console.log(' Chart data response:', data);
        
        if (data.chartData) {
            this.renderChart(data.chartData);
        }
    }

    handleSessionDetailsResponse(data) {
        console.log(' Session details response:', data);
        
        if (data.sessionDetails) {
            this.showSessionDetailsModal(data.sessionDetails);
        }
    }

    handleStatsUpdate(data) {
        console.log(' Stats update:', data);
        
        if (data.stats) {
            this.data.stats = { ...this.data.stats, ...data.stats };
            this.updateStatsCards();
        }
    }

    handleHeartbeatResponse(data) {
        // Silent heartbeat response
        this.lastHeartbeat = new Date(data.timestamp);
    }

    handleSubscriptionConfirmed(data) {
        console.log(' Subscription confirmed:', data);
        this.showNotification('Event subscription active', 'success');
    }

    handleDashboardActionBroadcast(data) {
        console.log(' Dashboard action from another dashboard:', data);
        
        // Show notification for actions from other dashboards
        if (data.action) {
            this.showNotification(
                `Another dashboard: ${data.action}`, 
                'info', 
                { autoHide: true, duration: 3000 }
            );
        }
    }

    handleWebSocketError(data) {
        console.error(' WebSocket error:', data);
        this.showAlert({
            level: 'error',
            message: data.message || 'WebSocket error occurred',
            details: data
        });
    }

    // Connection Management
    updateConnectionStatus(status) {
        this.connectionStatus = status;
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        statusIndicator.className = `status-indicator ${status}`;
        
        switch (status) {
            case 'connected':
                statusText.textContent = 'Connected';
                break;
            case 'connecting':
                statusText.textContent = 'Connecting...';
                break;
            case 'disconnected':
                statusText.textContent = 'Disconnected';
                break;
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff
            
            console.log(` Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`);
            
            setTimeout(() => {
                this.connectWebSocket();
            }, delay);
        } else {
            console.error(' Max reconnection attempts reached');
            this.showAlert({
                level: 'warning',
                message: 'Connection lost. Please refresh the page.',
                details: { attempts: this.reconnectAttempts }
            });
        }
    }

    // WebSocket Communication Methods
    sendWebSocketMessage(type, data = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = {
                type,
                ...data,
                timestamp: new Date().toISOString()
            };
            
            this.ws.send(JSON.stringify(message));
            console.log(' Sent WebSocket message:', message);
        } else {
            console.warn(' WebSocket not connected, message not sent:', { type, data });
        }
    }

    requestFilteredData(filters) {
        const requestId = `filter_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        this.sendWebSocketMessage('request_filtered_data', {
            filters,
            requestId
        });
        
        return requestId;
    }

    requestChartData(chartType, timeRange, filters = {}) {
        const requestId = `chart_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        this.sendWebSocketMessage('request_chart_data', {
            chartType,
            timeRange,
            filters,
            requestId
        });
        
        return requestId;
    }

    requestSessionDetails(sessionId) {
        const requestId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        this.sendWebSocketMessage('request_session_details', {
            sessionId,
            requestId
        });
        
        return requestId;
    }

    sendHeartbeat() {
        this.sendWebSocketMessage('heartbeat');
    }

    subscribeToEvents(eventTypes = ['all'], filters = {}) {
        this.sendWebSocketMessage('subscribe_to_events', {
            eventTypes,
            filters
        });
    }

    trackDashboardAction(action, details = {}) {
        this.sendWebSocketMessage('track_dashboard_action', {
            action,
            details
        });
    }

    notifyFocusChange(focused) {
        this.sendWebSocketMessage('dashboard_focus_change', {
            focused
        });
    }

    // Data Loading
    async loadInitialData() {
        try {
            // Load initial data from REST API
            const [summaryResponse, sessionsResponse] = await Promise.all([
                fetch('/api/analytics/summary'),
                fetch('/api/analytics/sessions')
            ]);

            const summary = await summaryResponse.json();
            const sessions = await sessionsResponse.json();

            this.updateDashboardData(summary);
            this.data.sessions = sessions.sessions || [];
            this.updateUI();
            
        } catch (error) {
            console.error(' Error loading initial data:', error);
        }
    }

    // UI Update Methods
    updateDashboardData(data) {
        this.data.stats = { ...this.data.stats, ...data };
        if (data.recentEvents) {
            this.data.events = data.recentEvents;
        }
    }

    updateUI() {
        this.updateStatsCards();
        this.updateVisitorFeed();
        this.updateSessionsList();
        this.updatePageViews();
        this.updateChart();
    }

    updateStatsCards() {
        document.getElementById('activeVisitors').textContent = this.data.stats.totalActive || 0;
        document.getElementById('totalToday').textContent = this.data.stats.totalToday || 0;
        document.getElementById('connectedDashboards').textContent = this.data.stats.connectedDashboards || 0;
        document.getElementById('activeSessions').textContent = this.data.sessions.length || 0;
    }

    updateDashboardCount() {
        document.getElementById('connectedDashboards').textContent = this.data.stats.connectedDashboards || 0;
    }

    updateVisitorFeed(events = null) {
        const feed = document.getElementById('visitorFeed');
        const eventsToShow = events || this.data.events.slice(0, 20);
        
        if (eventsToShow.length === 0) {
            feed.innerHTML = `
                <div class="no-data">
                    <i class="fas fa-hourglass-half"></i>
                    <p>Waiting for visitor events...</p>
                </div>
            `;
            return;
        }

        feed.innerHTML = eventsToShow.map(event => `
            <div class="visitor-event">
                <div class="event-icon ${event.type}">
                    <i class="fas fa-${this.getEventIcon(event.type)}"></i>
                </div>
                <div class="event-details">
                    <h4>${this.formatEventTitle(event)}</h4>
                    <div class="event-meta">
                        <span><i class="fas fa-clock"></i> ${this.formatTime(event.timestamp)}</span>
                        <span><i class="fas fa-globe"></i> ${event.country || 'Unknown'}</span>
                        <span><i class="fas fa-user"></i> ${event.sessionId.substring(0, 8)}...</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    updateSessionsList() {
        const sessionsList = document.getElementById('sessionsList');
        
        if (this.data.sessions.length === 0) {
            sessionsList.innerHTML = `
                <div class="no-data">
                    <i class="fas fa-user-clock"></i>
                    <p>No active sessions</p>
                </div>
            `;
            return;
        }

        sessionsList.innerHTML = this.data.sessions.map(session => `
            <div class="session-item" onclick="dashboard.showSessionDetails('${session.sessionId}')">
                <div class="session-header">
                    <span class="session-id">${session.sessionId.substring(0, 12)}...</span>
                    <span class="session-duration">${this.formatDuration(session.duration)}</span>
                </div>
                <div class="session-info">
                    <span><i class="fas fa-map-marker-alt"></i> ${session.currentPage}</span>
                    <span><i class="fas fa-globe"></i> ${session.country}</span>
                </div>
                <div class="session-journey">
                    <div class="journey-path">
                        ${session.journey.map((page, index) => `
                            <span class="journey-page">${page}</span>
                            ${index < session.journey.length - 1 ? '<span class="journey-arrow">→</span>' : ''}
                        `).join('')}
                    </div>
                </div>
            </div>
        `).join('');
    }

    updatePageViews() {
        const pageViews = document.getElementById('pageViews');
        const pages = this.data.stats.pagesVisited || {};
        const pageEntries = Object.entries(pages).sort((a, b) => b[1] - a[1]);
        
        if (pageEntries.length === 0) {
            pageViews.innerHTML = `
                <div class="no-data">
                    <i class="fas fa-chart-bar"></i>
                    <p>No page views data</p>
                </div>
            `;
            return;
        }

        pageViews.innerHTML = pageEntries.map(([page, count]) => `
            <div class="page-item">
                <span class="page-name">${page}</span>
                <span class="page-count">${count}</span>
            </div>
        `).join('');
    }

    async updateChart(minutes = 10) {
        try {
            // Try WebSocket first for real-time updates
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const requestId = this.requestChartData('visitors', minutes);
                console.log('📈 Requested chart data via WebSocket:', requestId);
                return; // Wait for WebSocket response
            }
            
            // Fallback to REST API
            const response = await fetch(`/api/analytics/chart-data?minutes=${minutes}`);
            const chartData = await response.json();
            
            this.renderChart(chartData);
            
        } catch (error) {
            console.error(' Error updating chart:', error);
        }
    }

    renderChart(chartData) {
        // Simple chart implementation (will enhance in later phases)
        const canvas = document.getElementById('chartCanvas');
        const ctx = canvas.getContext('2d');
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw simple line chart
        this.drawSimpleChart(ctx, chartData, canvas.width, canvas.height);
    }

    drawSimpleChart(ctx, data, width, height) {
        if (!data || data.length === 0) return;
        
        const padding = 40;
        const chartWidth = width - 2 * padding;
        const chartHeight = height - 2 * padding;
        
        // Find max value for scaling
        const maxVisitors = Math.max(...data.map(d => d.visitors), 1);
        
        // Draw background
        ctx.fillStyle = '#f7fafc';
        ctx.fillRect(0, 0, width, height);
        
        // Draw grid lines
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        
        // Horizontal grid lines
        for (let i = 0; i <= 5; i++) {
            const y = padding + (chartHeight / 5) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
        }
        
        // Draw data line
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 3;
        ctx.beginPath();
        
        data.forEach((point, index) => {
            const x = padding + (chartWidth / (data.length - 1)) * index;
            const y = padding + chartHeight - (point.visitors / maxVisitors) * chartHeight;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Draw data points
        ctx.fillStyle = '#667eea';
        data.forEach((point, index) => {
            const x = padding + (chartWidth / (data.length - 1)) * index;
            const y = padding + chartHeight - (point.visitors / maxVisitors) * chartHeight;
            
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
        });
    }

    // Utility Methods
    getEventIcon(type) {
        switch (type) {
            case 'pageview': return 'eye';
            case 'click': return 'mouse-pointer';
            case 'session_end': return 'sign-out-alt';
            default: return 'circle';
        }
    }

    formatEventTitle(event) {
        switch (event.type) {
            case 'pageview':
                return `Page View: ${event.page}`;
            case 'click':
                return `Click Event on ${event.page}`;
            case 'session_end':
                return `Session Ended`;
            default:
                return `${event.type} on ${event.page}`;
        }
    }

    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString();
    }

    formatDuration(seconds) {
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    }

    // Event Handlers
    toggleFilterPanel() {
        const panel = document.getElementById('filterPanel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        
        if (panel.style.display === 'block') {
            this.populateFilterOptions();
        }
    }

    populateFilterOptions() {
        // Populate country filter
        const countries = [...new Set(this.data.events.map(e => e.country).filter(Boolean))];
        const countrySelect = document.getElementById('countryFilter');
        countrySelect.innerHTML = '<option value="">All Countries</option>' +
            countries.map(country => `<option value="${country}">${country}</option>`).join('');
        
        // Populate page filter
        const pages = [...new Set(this.data.events.map(e => e.page).filter(Boolean))];
        const pageSelect = document.getElementById('pageFilter');
        pageSelect.innerHTML = '<option value="">All Pages</option>' +
            pages.map(page => `<option value="${page}">${page}</option>`).join('');
    }

    applyFilters() {
        const country = document.getElementById('countryFilter').value;
        const page = document.getElementById('pageFilter').value;
        
        const filters = {};
        if (country) filters.country = country;
        if (page) filters.page = page;
        
        // Use new WebSocket method for real-time filtering
        const requestId = this.requestFilteredData(filters);
        
        // Track this action
        this.trackDashboardAction('apply_filters', { filters, requestId });
        
        // Show loading state
        this.showNotification('Applying filters...', 'info', { autoHide: true, duration: 2000 });
        
        console.log('📤 Sent filter request with ID:', requestId);
    }

    clearFilters() {
        document.getElementById('countryFilter').value = '';
        document.getElementById('pageFilter').value = '';
        this.updateVisitorFeed(); // Show all events
    }

    clearEvents() {
        if (confirm('Are you sure you want to clear all events?')) {
            fetch('/api/analytics/reset', { method: 'DELETE' })
                .then(() => {
                    this.data.events = [];
                    this.data.sessions = [];
                    this.data.stats = {
                        totalActive: 0,
                        totalToday: 0,
                        pagesVisited: {},
                        connectedDashboards: this.data.stats.connectedDashboards
                    };
                    this.updateUI();
                })
                .catch(error => console.error('Error clearing events:', error));
        }
    }

    refreshSessions() {
        fetch('/api/analytics/sessions')
            .then(response => response.json())
            .then(data => {
                this.data.sessions = data.sessions || [];
                this.updateSessionsList();
            })
            .catch(error => console.error('Error refreshing sessions:', error));
    }

    showSessionDetails(sessionId) {
        const session = this.data.sessions.find(s => s.sessionId === sessionId);
        if (!session) return;
        
        const modal = document.getElementById('sessionModal');
        const modalBody = document.getElementById('sessionModalBody');
        
        modalBody.innerHTML = `
            <div class="session-details">
                <h4>Session: ${session.sessionId}</h4>
                <div class="session-meta">
                    <p><strong>Country:</strong> ${session.country}</p>
                    <p><strong>Current Page:</strong> ${session.currentPage}</p>
                    <p><strong>Duration:</strong> ${this.formatDuration(session.duration)}</p>
                    <p><strong>Started:</strong> ${new Date(session.startTime).toLocaleString()}</p>
                    <p><strong>Last Activity:</strong> ${new Date(session.lastActivity).toLocaleString()}</p>
                </div>
                <div class="journey-details">
                    <h5>Page Journey:</h5>
                    <div class="journey-timeline">
                        ${session.journey.map((page, index) => `
                            <div class="journey-step">
                                <span class="step-number">${index + 1}</span>
                                <span class="step-page">${page}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        
        modal.style.display = 'block';
    }

    closeModal() {
        document.getElementById('sessionModal').style.display = 'none';
    }

    showAlert(alertData) {
        const alertContainer = document.getElementById('alertContainer');
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert ${alertData.level}`;
        alertDiv.innerHTML = `
            <div class="alert-content">
                <div class="alert-icon">
                    <i class="fas fa-${this.getAlertIcon(alertData.level)}"></i>
                </div>
                <div class="alert-text">
                    <strong>${alertData.level.charAt(0).toUpperCase() + alertData.level.slice(1)}:</strong>
                    ${alertData.message}
                </div>
                <div class="alert-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </div>
            </div>
        `;
        
        alertDiv.addEventListener('click', () => {
            alertDiv.remove();
        });
        
        alertContainer.appendChild(alertDiv);
        
        // Auto-remove after duration based on level
        const duration = alertData.level === 'error' ? 10000 : 5000;
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, duration);
    }

    showNotification(message, type = 'info', options = {}) {
        const { autoHide = true, duration = 3000 } = options;
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${this.getNotificationIcon(type)}"></i>
                <span>${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        // Add to notifications container
        let container = document.getElementById('notificationsContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notificationsContainer';
            container.className = 'notifications-container';
            document.body.appendChild(container);
        }
        
        container.appendChild(notification);
        
        // Auto-hide if specified
        if (autoHide) {
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, duration);
        }
    }

    getAlertIcon(level) {
        const icons = {
            info: 'info-circle',
            warning: 'exclamation-triangle',
            error: 'exclamation-circle',
            success: 'check-circle',
            milestone: 'trophy'
        };
        return icons[level] || 'info-circle';
    }

    getNotificationIcon(type) {
        const icons = {
            info: 'info-circle',
            success: 'check-circle',
            warning: 'exclamation-triangle',
            error: 'exclamation-circle'
        };
        return icons[type] || 'info-circle';
    }

    playNotificationSound() {
        // Simple notification sound (optional)
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
        } catch (error) {
            // Silent fail for audio
        }
    }
}

// Initialize dashboard when page loads
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new DashboardApp();
});

// Add some CSS for modal session details
const additionalCSS = `
<style>
.session-details h4 {
    color: #4a5568;
    margin-bottom: 15px;
    font-size: 1.2rem;
}

.session-meta {
    background: #f7fafc;
    padding: 15px;
    border-radius: 8px;
    margin-bottom: 20px;
}

.session-meta p {
    margin-bottom: 8px;
    color: #4a5568;
}

.journey-details h5 {
    color: #4a5568;
    margin-bottom: 15px;
    font-size: 1rem;
}

.journey-timeline {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.journey-step {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 10px;
    background: #e6fffa;
    border-radius: 8px;
}

.step-number {
    width: 30px;
    height: 30px;
    background: #667eea;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.875rem;
}

.step-page {
    color: #285e61;
    font-weight: 500;
}
</style>
`;

document.head.insertAdjacentHTML('beforeend', additionalCSS);
