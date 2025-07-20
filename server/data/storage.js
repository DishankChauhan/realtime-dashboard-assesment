class DataStorage {
    constructor() {
        // Simple in-memory storage - probably not what you'd use in production but works great for demos!
        this.events = [];
        this.sessions = new Map(); // using Map because I like the cleaner API
        this.connectedDashboards = new Set();
        this.stats = {
            totalToday: 0,
            totalActive: 0,
            pagesVisited: {}, // track page popularity
            lastReset: new Date().toDateString()
        };
    }

    // Add a new event to our storage
    addEvent(event) {
        // Make sure we have a timestamp
        if (!event.timestamp) {
            event.timestamp = new Date().toISOString();
        }

        this.events.push(event);
        this.updateStats(event);
        this.updateSession(event);

        // Don't let the events array grow forever - keep last 1000
        if (this.events.length > 1000) {
            this.events.shift(); // remove oldest
        }

        return event;
    }

    getEvents(filter = {}) {
        let filteredEvents = this.events;

        // Apply filters if someone wants to filter
        if (filter.country) {
            filteredEvents = filteredEvents.filter(e => e.country === filter.country);
        }

        if (filter.page) {
            filteredEvents = filteredEvents.filter(e => e.page === filter.page);
        }

        if (filter.type) {
            filteredEvents = filteredEvents.filter(e => e.type === filter.type);
        }

        // Newest events first (because that's usually what people want to see)
        return filteredEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    // Session management
    updateSession(event) {
        const { sessionId, page, country, timestamp } = event;

        // Create new session if this is the first time we see this sessionId
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, {
                sessionId,
                journey: [],
                currentPage: page,
                startTime: timestamp,
                lastActivity: timestamp,
                country,
                isActive: true
            });
        }

        const session = this.sessions.get(sessionId);
        
        // Add page to journey if it's new (avoid duplicates from multiple clicks on same page)
        if (page && !session.journey.includes(page)) {
            session.journey.push(page);
        }
        session.currentPage = page;
        session.lastActivity = timestamp;

        // Handle session ending
        if (event.type === 'session_end') {
            session.isActive = false;
        }

        // Auto-expire sessions after 30 minutes of inactivity
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        if (new Date(session.lastActivity) < thirtyMinutesAgo) {
            session.isActive = false;
        }
    }

    getActiveSessions() {
        const activeSessions = [];
        
        for (const [sessionId, session] of this.sessions) {
            if (session.isActive) {
                // Calculate duration
                const startTime = new Date(session.startTime);
                const lastActivity = new Date(session.lastActivity);
                const duration = Math.floor((lastActivity - startTime) / 1000); // in seconds

                activeSessions.push({
                    ...session,
                    duration
                });
            }
        }

        return activeSessions.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    }

    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    // Statistics management
    updateStats(event) {
        const today = new Date().toDateString();
        
        // Reset daily stats if it's a new day
        if (this.stats.lastReset !== today) {
            this.stats.totalToday = 0;
            this.stats.pagesVisited = {};
            this.stats.lastReset = today;
        }

        // Update page visit counts
        if (event.page) {
            this.stats.pagesVisited[event.page] = (this.stats.pagesVisited[event.page] || 0) + 1;
        }

        // Update total visitors today (count unique sessions)
        const uniqueSessions = new Set();
        this.events.forEach(e => {
            const eventDate = new Date(e.timestamp).toDateString();
            if (eventDate === today) {
                uniqueSessions.add(e.sessionId);
            }
        });
        this.stats.totalToday = uniqueSessions.size;

        // Update active visitors count
        this.stats.totalActive = this.getActiveSessions().length;
    }

    getSummary() {
        // Recalculate active count
        this.stats.totalActive = this.getActiveSessions().length;
        
        return {
            ...this.stats,
            recentEvents: this.getEvents().slice(0, 10) // Last 10 events
        };
    }

    // Dashboard connection management
    addDashboard(dashboardId) {
        this.connectedDashboards.add(dashboardId);
        return this.connectedDashboards.size;
    }

    removeDashboard(dashboardId) {
        this.connectedDashboards.delete(dashboardId);
        return this.connectedDashboards.size;
    }

    getDashboardCount() {
        return this.connectedDashboards.size;
    }

    // Utility methods
    clearStats() {
        this.events = [];
        this.sessions.clear();
        this.stats = {
            totalToday: 0,
            totalActive: 0,
            pagesVisited: {},
            lastReset: new Date().toDateString()
        };
    }

    // Get visitors over last N minutes for chart data
    getVisitorsOverTime(minutes = 10, filters = {}) {
        const now = new Date();
        const timeSlots = [];
        
        for (let i = minutes; i >= 0; i--) {
            const slotTime = new Date(now.getTime() - i * 60 * 1000);
            let slotEvents = this.events.filter(event => {
                const eventTime = new Date(event.timestamp);
                return eventTime >= slotTime && eventTime < new Date(slotTime.getTime() + 60 * 1000);
            });
            
            // Apply filters
            if (filters.country) {
                slotEvents = slotEvents.filter(e => e.country === filters.country);
            }
            if (filters.page) {
                slotEvents = slotEvents.filter(e => e.page === filters.page);
            }
            
            timeSlots.push({
                time: slotTime.toISOString(),
                visitors: new Set(slotEvents.map(e => e.sessionId)).size,
                events: slotEvents.length
            });
        }
        
        return timeSlots;
    }

    // Get events over time for chart data
    getEventsOverTime(minutes = 10, filters = {}) {
        const now = new Date();
        const timeSlots = [];
        
        for (let i = minutes; i >= 0; i--) {
            const slotTime = new Date(now.getTime() - i * 60 * 1000);
            let slotEvents = this.events.filter(event => {
                const eventTime = new Date(event.timestamp);
                return eventTime >= slotTime && eventTime < new Date(slotTime.getTime() + 60 * 1000);
            });
            
            // Apply filters
            if (filters.country) {
                slotEvents = slotEvents.filter(e => e.country === filters.country);
            }
            if (filters.page) {
                slotEvents = slotEvents.filter(e => e.page === filters.page);
            }
            
            timeSlots.push({
                time: slotTime.toISOString(),
                events: slotEvents.length,
                visitors: new Set(slotEvents.map(e => e.sessionId)).size
            });
        }
        
        return timeSlots;
    }

    // Get pageviews over time for chart data
    getPageviewsOverTime(minutes = 10, filters = {}) {
        const now = new Date();
        const timeSlots = [];
        
        for (let i = minutes; i >= 0; i--) {
            const slotTime = new Date(now.getTime() - i * 60 * 1000);
            let slotEvents = this.events.filter(event => {
                const eventTime = new Date(event.timestamp);
                return eventTime >= slotTime && 
                       eventTime < new Date(slotTime.getTime() + 60 * 1000) &&
                       event.type === 'pageview';
            });
            
            // Apply filters
            if (filters.country) {
                slotEvents = slotEvents.filter(e => e.country === filters.country);
            }
            if (filters.page) {
                slotEvents = slotEvents.filter(e => e.page === filters.page);
            }
            
            timeSlots.push({
                time: slotTime.toISOString(),
                pageviews: slotEvents.length,
                visitors: new Set(slotEvents.map(e => e.sessionId)).size
            });
        }
        
        return timeSlots;
    }

    // Get new sessions over time for chart data
    getSessionsOverTime(minutes = 10, filters = {}) {
        const now = new Date();
        const timeSlots = [];
        
        for (let i = minutes; i >= 0; i--) {
            const slotTime = new Date(now.getTime() - i * 60 * 1000);
            const slotEndTime = new Date(slotTime.getTime() + 60 * 1000);
            
            let newSessions = 0;
            
            for (const [sessionId, session] of this.sessions) {
                const sessionStart = new Date(session.startTime);
                
                if (sessionStart >= slotTime && sessionStart < slotEndTime) {
                    // Apply filters
                    if (filters.country && session.country !== filters.country) {
                        continue;
                    }
                    newSessions++;
                }
            }
            
            timeSlots.push({
                time: slotTime.toISOString(),
                sessions: newSessions
            });
        }
        
        return timeSlots;
    }

    // Unified chart data method for WebSocket requests
    getChartData(options = {}) {
        const { type = 'visitors', minutes = 10, hours, filters = {} } = options;
        
        // Convert hours to minutes if provided
        const timeRange = hours ? hours * 60 : minutes;
        
        switch (type) {
            case 'visitors':
                return this.getVisitorsOverTime(timeRange, filters);
            
            case 'events':
                return this.getEventsOverTime(timeRange, filters);
            
            case 'pageviews':
                return this.getPageviewsOverTime(timeRange, filters);
            
            case 'sessions':
                return this.getSessionsOverTime(timeRange, filters);
            
            case 'hourly':
                // For hourly data, use 60-minute intervals
                return this.getVisitorsOverTime(timeRange, filters);
            
            default:
                console.warn(`Unknown chart type: ${type}, defaulting to visitors`);
                return this.getVisitorsOverTime(timeRange, filters);
        }
    }
}

module.exports = new DataStorage();
