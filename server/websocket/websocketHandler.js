const dataStorage = require('../data/storage');

class WebSocketHandler {
    constructor(wss) {
        this.wss = wss;
        this.connections = new Map(); // Track all the dashboard connections
        this.setupWebSocketServer();
        this.startCleanupInterval(); // Clean up dead connections every so often
    }

    setupWebSocketServer() {
        this.wss.on('connection', (ws, req) => {
            const connectionId = this.generateConnectionId();
            
            console.log(`🎉 New dashboard connected: ${connectionId}`);
            
            // Store connection with some useful metadata
            this.connections.set(connectionId, {
                ws,
                connectedAt: new Date().toISOString(),
                lastActivity: new Date().toISOString()
            });

            // Update our dashboard counter
            const totalDashboards = dataStorage.addDashboard(connectionId);

            // Send them a welcome message with current data
            this.sendToClient(ws, {
                type: 'connection_established',
                data: {
                    connectionId,
                    totalDashboards,
                    connectedAt: new Date().toISOString(),
                    initialData: dataStorage.getSummary()
                }
            });

            // Tell other dashboards someone new joined (so they can see the count update)
            this.broadcastToOthers(connectionId, {
                type: 'user_connected',
                data: {
                    totalDashboards,
                    connectedAt: new Date().toISOString()
                }
            });

            // Handle messages coming from the dashboard
            ws.on('message', (message) => {
                this.handleClientMessage(connectionId, message);
            });

            // Handle client disconnect
            ws.on('close', () => {
                this.handleDisconnect(connectionId);
            });

            // Handle errors - WebSocket connections can be finicky
            ws.on('error', (error) => {
                console.error(`❌ WebSocket error for ${connectionId}:`, error);
                this.handleDisconnect(connectionId);
            });
        });
    }

    generateConnectionId() {
        // Generate a unique ID for each connection
        return `dashboard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    handleClientMessage(connectionId, message) {
        try {
            const data = JSON.parse(message);
            console.log(`📩 Message from ${connectionId}:`, data);

            // Update last activity
            const connection = this.connections.get(connectionId);
            if (connection) {
                connection.lastActivity = new Date().toISOString();
            }

            // Route the message based on type
            switch (data.type) {
                case 'request_detailed_stats':
                    this.handleDetailedStatsRequest(connectionId, data);
                    break;
                
                case 'track_dashboard_action':
                    this.handleDashboardAction(connectionId, data);
                    break;
                
                case 'request_filtered_data':
                    this.handleFilteredDataRequest(connectionId, data);
                    break;
                
                case 'request_chart_data':
                    this.handleChartDataRequest(connectionId, data);
                    break;
                
                case 'request_session_details':
                    this.handleSessionDetailsRequest(connectionId, data);
                    break;
                
                case 'heartbeat':
                    this.handleHeartbeat(connectionId, data);
                    break;
                
                case 'subscribe_to_events':
                    this.handleEventSubscription(connectionId, data);
                    break;
                
                case 'dashboard_focus_change':
                    this.handleDashboardFocusChange(connectionId, data);
                    break;
                
                default:
                    console.warn(`⚠️ Unknown message type: ${data.type}`);
                    this.sendToClient(connection?.ws, {
                        type: 'error',
                        data: {
                            message: `Unknown message type: ${data.type}`,
                            originalMessage: data
                        }
                    });
            }

        } catch (error) {
            console.error(`❌ Error parsing client message from ${connectionId}:`, error);
            const connection = this.connections.get(connectionId);
            if (connection) {
                this.sendToClient(connection.ws, {
                    type: 'error',
                    data: {
                        message: 'Invalid message format',
                        error: error.message
                    }
                });
            }
        }
    }

    handleDetailedStatsRequest(connectionId, data) {
        try {
            const filter = data.filter || {};
            const events = dataStorage.getEvents(filter);
            const sessions = dataStorage.getActiveSessions();
            
            const connection = this.connections.get(connectionId);
            if (connection) {
                this.sendToClient(connection.ws, {
                    type: 'detailed_stats_response',
                    data: {
                        filter,
                        events: events.slice(0, 50), // Limit to 50 recent events
                        sessions,
                        requestedAt: new Date().toISOString()
                    }
                });
            }
        } catch (error) {
            console.error('Error handling detailed stats request:', error);
        }
    }

    handleDashboardAction(connectionId, data) {
        console.log(`📊 Dashboard action from ${connectionId}:`, data);
        
        // Track dashboard interactions for analytics
        const actionEvent = {
            type: 'dashboard_interaction',
            action: data.action,
            details: data.details,
            dashboardId: connectionId,
            timestamp: new Date().toISOString()
        };
        
        // Broadcast dashboard actions to other dashboards
        this.broadcastToOthers(connectionId, {
            type: 'dashboard_action_broadcast',
            data: {
                fromDashboard: connectionId,
                action: data.action,
                details: data.details,
                timestamp: new Date().toISOString()
            }
        });
    }

    handleFilteredDataRequest(connectionId, data) {
        try {
            const { filters, requestId } = data;
            console.log(`🔍 Filtered data request from ${connectionId}:`, filters);
            
            const events = dataStorage.getEvents(filters);
            const sessions = dataStorage.getSessions(filters);
            const summary = dataStorage.getSummary(filters);
            
            const connection = this.connections.get(connectionId);
            if (connection) {
                this.sendToClient(connection.ws, {
                    type: 'filtered_data_response',
                    data: {
                        requestId,
                        filters,
                        events: events.events.slice(0, 100), // Limit for performance
                        sessions: sessions.sessions.slice(0, 50),
                        summary,
                        generatedAt: new Date().toISOString()
                    }
                });
            }
        } catch (error) {
            console.error('Error handling filtered data request:', error);
            const connection = this.connections.get(connectionId);
            if (connection) {
                this.sendToClient(connection.ws, {
                    type: 'error',
                    data: {
                        message: 'Failed to fetch filtered data',
                        error: error.message,
                        requestId: data.requestId
                    }
                });
            }
        }
    }

    handleChartDataRequest(connectionId, data) {
        try {
            const { chartType, timeRange, filters, requestId } = data;
            console.log(`📈 Chart data request from ${connectionId}:`, { chartType, timeRange });
            
            const chartData = dataStorage.getChartData({
                type: chartType || 'visitors',
                minutes: timeRange || 10,
                filters
            });
            
            const connection = this.connections.get(connectionId);
            if (connection) {
                this.sendToClient(connection.ws, {
                    type: 'chart_data_response',
                    data: {
                        requestId,
                        chartType,
                        timeRange,
                        chartData,
                        generatedAt: new Date().toISOString()
                    }
                });
            }
        } catch (error) {
            console.error('Error handling chart data request:', error);
            const connection = this.connections.get(connectionId);
            if (connection) {
                this.sendToClient(connection.ws, {
                    type: 'error',
                    data: {
                        message: 'Failed to fetch chart data',
                        error: error.message,
                        requestId: data.requestId
                    }
                });
            }
        }
    }

    handleSessionDetailsRequest(connectionId, data) {
        try {
            const { sessionId, requestId } = data;
            console.log(`🔍 Session details request from ${connectionId}:`, sessionId);
            
            const sessionDetails = dataStorage.getSessionById(sessionId);
            
            const connection = this.connections.get(connectionId);
            if (connection) {
                this.sendToClient(connection.ws, {
                    type: 'session_details_response',
                    data: {
                        requestId,
                        sessionId,
                        sessionDetails,
                        generatedAt: new Date().toISOString()
                    }
                });
            }
        } catch (error) {
            console.error('Error handling session details request:', error);
            const connection = this.connections.get(connectionId);
            if (connection) {
                this.sendToClient(connection.ws, {
                    type: 'error',
                    data: {
                        message: 'Failed to fetch session details',
                        error: error.message,
                        requestId: data.requestId
                    }
                });
            }
        }
    }

    handleHeartbeat(connectionId, data) {
        const connection = this.connections.get(connectionId);
        if (connection) {
            connection.lastActivity = new Date().toISOString();
            this.sendToClient(connection.ws, {
                type: 'heartbeat_response',
                data: {
                    timestamp: new Date().toISOString(),
                    connectionId
                }
            });
        }
    }

    handleEventSubscription(connectionId, data) {
        const { eventTypes, filters } = data;
        console.log(`📡 Event subscription from ${connectionId}:`, { eventTypes, filters });
        
        const connection = this.connections.get(connectionId);
        if (connection) {
            // Store subscription preferences
            connection.subscriptions = {
                eventTypes: eventTypes || ['all'],
                filters: filters || {},
                subscribedAt: new Date().toISOString()
            };
            
            this.sendToClient(connection.ws, {
                type: 'subscription_confirmed',
                data: {
                    eventTypes,
                    filters,
                    subscribedAt: new Date().toISOString()
                }
            });
        }
    }

    handleDashboardFocusChange(connectionId, data) {
        const { focused } = data;
        console.log(`👁️ Dashboard focus change from ${connectionId}:`, focused);
        
        const connection = this.connections.get(connectionId);
        if (connection) {
            connection.focused = focused;
            connection.lastFocusChange = new Date().toISOString();
        }
    }

    handleDisconnect(connectionId) {
        console.log(`📴 WebSocket disconnected: ${connectionId}`);
        
        // Remove from connections and dashboard count
        this.connections.delete(connectionId);
        const totalDashboards = dataStorage.removeDashboard(connectionId);

        // Broadcast user_disconnected event to remaining clients
        this.broadcastToAll({
            type: 'user_disconnected',
            data: {
                totalDashboards,
                disconnectedAt: new Date().toISOString()
            }
        });
    }

    // Enhanced broadcast methods
    broadcastVisitorUpdate(event) {
        const stats = dataStorage.getSummary();
        const sessions = dataStorage.getActiveSessions();
        
        const updateData = {
            type: 'visitor_update',
            data: {
                event,
                stats,
                activeSessions: sessions,
                timestamp: new Date().toISOString()
            }
        };
        
        // Send to all connections, respecting their subscriptions
        this.connections.forEach((connection, connectionId) => {
            if (this.shouldReceiveUpdate(connection, 'visitor_update', event)) {
                this.sendToClient(connection.ws, updateData);
            }
        });
    }

    broadcastSessionActivity(sessionData) {
        const updateData = {
            type: 'session_activity',
            data: {
                ...sessionData,
                timestamp: new Date().toISOString()
            }
        };
        
        this.connections.forEach((connection, connectionId) => {
            if (this.shouldReceiveUpdate(connection, 'session_activity', sessionData)) {
                this.sendToClient(connection.ws, updateData);
            }
        });
    }

    broadcastAlert(level, message, details = {}) {
        this.broadcastToAll({
            type: 'alert',
            data: {
                level, // 'info', 'warning', 'milestone', 'error'
                message,
                details,
                timestamp: new Date().toISOString()
            }
        });
    }

    broadcastStatsUpdate() {
        const stats = dataStorage.getSummary();
        this.broadcastToAll({
            type: 'stats_update',
            data: {
                stats,
                timestamp: new Date().toISOString()
            }
        });
    }

    broadcastNewEvent(event) {
        this.connections.forEach((connection, connectionId) => {
            if (this.shouldReceiveUpdate(connection, 'new_event', event)) {
                this.sendToClient(connection.ws, {
                    type: 'new_event',
                    data: {
                        event,
                        timestamp: new Date().toISOString()
                    }
                });
            }
        });
    }

    // Milestone and analytics alerts
    checkAndBroadcastMilestones(stats) {
        const milestones = [];
        
        // Check various milestones
        if (stats.totalToday && stats.totalToday % 100 === 0) {
            milestones.push({
                type: 'visitor_milestone',
                message: `🎉 ${stats.totalToday} visitors today!`,
                value: stats.totalToday
            });
        }
        
        if (stats.totalActive && stats.totalActive >= 50) {
            milestones.push({
                type: 'concurrent_milestone',
                message: `🔥 ${stats.totalActive} concurrent visitors!`,
                value: stats.totalActive
            });
        }
        
        // Check for traffic spikes
        const recentEvents = dataStorage.getEvents({ limit: 10 });
        if (recentEvents.events && recentEvents.events.length >= 5) {
            const lastMinute = Date.now() - 60000;
            const recentCount = recentEvents.events.filter(e => 
                new Date(e.timestamp).getTime() > lastMinute
            ).length;
            
            if (recentCount >= 5) {
                milestones.push({
                    type: 'traffic_spike',
                    message: `📈 Traffic spike detected: ${recentCount} events in the last minute`,
                    value: recentCount
                });
            }
        }
        
        // Broadcast milestones
        milestones.forEach(milestone => {
            this.broadcastAlert('milestone', milestone.message, milestone);
        });
    }

    // Helper method to check if connection should receive update
    shouldReceiveUpdate(connection, updateType, data) {
        if (!connection.subscriptions) {
            return true; // Default: receive all updates
        }
        
        const { eventTypes, filters } = connection.subscriptions;
        
        // Check event type subscription
        if (eventTypes && eventTypes.length > 0 && !eventTypes.includes('all')) {
            if (!eventTypes.includes(updateType)) {
                return false;
            }
        }
        
        // Check filters (if applicable)
        if (filters && Object.keys(filters).length > 0 && data) {
            // Apply basic filtering logic
            if (filters.country && data.country && data.country !== filters.country) {
                return false;
            }
            if (filters.page && data.page && !data.page.includes(filters.page)) {
                return false;
            }
        }
        
        return true;
    }

    // Utility methods
    sendToClient(ws, data) {
        if (ws.readyState === ws.OPEN) {
            try {
                ws.send(JSON.stringify(data));
            } catch (error) {
                console.error('❌ Error sending data to client:', error);
            }
        }
    }

    broadcastToAll(data) {
        let sent = 0;
        let failed = 0;
        
        this.connections.forEach((connection, connectionId) => {
            if (connection.ws.readyState === connection.ws.OPEN) {
                try {
                    connection.ws.send(JSON.stringify(data));
                    sent++;
                } catch (error) {
                    console.error(`❌ Error sending to ${connectionId}:`, error);
                    failed++;
                }
            } else {
                failed++;
            }
        });
        
        if (failed > 0) {
            console.warn(`⚠️ Failed to send to ${failed} connections, sent to ${sent}`);
        }
    }

    broadcastToOthers(excludeConnectionId, data) {
        this.connections.forEach((connection, connectionId) => {
            if (connectionId !== excludeConnectionId) {
                this.sendToClient(connection.ws, data);
            }
        });
    }

    // Connection management
    getConnectionCount() {
        return this.connections.size;
    }

    getActiveConnectionCount() {
        let active = 0;
        this.connections.forEach((connection) => {
            if (connection.ws.readyState === connection.ws.OPEN) {
                active++;
            }
        });
        return active;
    }

    getConnectionsInfo() {
        const info = [];
        this.connections.forEach((connection, connectionId) => {
            info.push({
                id: connectionId,
                connectedAt: connection.connectedAt,
                lastActivity: connection.lastActivity,
                focused: connection.focused || false,
                subscriptions: connection.subscriptions || null,
                state: connection.ws.readyState === connection.ws.OPEN ? 'open' : 'closed'
            });
        });
        return info;
    }

    // Cleanup inactive connections
    cleanupInactiveConnections() {
        const now = Date.now();
        const timeout = 5 * 60 * 1000; // 5 minutes
        
        let cleaned = 0;
        this.connections.forEach((connection, connectionId) => {
            const lastActivity = new Date(connection.lastActivity).getTime();
            const isInactive = now - lastActivity > timeout;
            const isClosed = connection.ws.readyState !== connection.ws.OPEN;
            
            if (isInactive || isClosed) {
                console.log(`🧹 Cleaning up inactive connection: ${connectionId}`);
                this.connections.delete(connectionId);
                dataStorage.removeDashboard(connectionId);
                cleaned++;
            }
        });
        
        if (cleaned > 0) {
            console.log(`🧹 Cleaned up ${cleaned} inactive connections`);
            this.broadcastToAll({
                type: 'connections_updated',
                data: {
                    totalDashboards: this.getConnectionCount(),
                    cleanedUp: cleaned,
                    timestamp: new Date().toISOString()
                }
            });
        }
    }

    // Start periodic cleanup
    startCleanupInterval() {
        // Run cleanup every 2 minutes
        setInterval(() => {
            this.cleanupInactiveConnections();
        }, 2 * 60 * 1000);
    }

    // Performance monitoring
    getPerformanceMetrics() {
        const connections = this.getConnectionsInfo();
        const now = Date.now();
        
        return {
            totalConnections: connections.length,
            activeConnections: connections.filter(c => c.state === 'open').length,
            averageConnectionTime: connections.reduce((acc, conn) => {
                const connectedTime = now - new Date(conn.connectedAt).getTime();
                return acc + connectedTime;
            }, 0) / connections.length || 0,
            focusedDashboards: connections.filter(c => c.focused).length,
            subscribedDashboards: connections.filter(c => c.subscriptions).length
        };
    }
}

module.exports = WebSocketHandler;
