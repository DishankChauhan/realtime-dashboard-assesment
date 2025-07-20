const express = require('express');
const router = express.Router();
const dataStorage = require('../data/storage');

// Validation helper - learned this the hard way after getting weird data
const validateEventData = (eventData) => {
    const errors = [];
    
    // Required fields - these are non-negotiable
    if (!eventData.type) errors.push('type is required');
    if (!eventData.sessionId) errors.push('sessionId is required');
    if (!eventData.page) errors.push('page is required');
    
    // Check if event type is valid
    const validTypes = ['pageview', 'click', 'session_end'];
    if (eventData.type && !validTypes.includes(eventData.type)) {
        errors.push(`type must be one of: ${validTypes.join(', ')}`);
    }
    
    // Type checking - because JavaScript...
    if (eventData.sessionId && typeof eventData.sessionId !== 'string') {
        errors.push('sessionId must be a string');
    }
    
    if (eventData.page && typeof eventData.page !== 'string') {
        errors.push('page must be a string');
    }
    
    if (eventData.country && typeof eventData.country !== 'string') {
        errors.push('country must be a string');
    }
    
    // Timestamp validation - optional but if provided, should be valid
    if (eventData.timestamp) {
        const timestamp = new Date(eventData.timestamp);
        if (isNaN(timestamp.getTime())) {
            errors.push('timestamp must be a valid ISO 8601 date string');
        }
    }
    
    return errors;
};

// POST /api/events - Main endpoint where visitor events come in
router.post('/events', (req, res) => {
    try {
        const eventData = req.body;
        
        // Check if the data is valid
        const validationErrors = validateEventData(eventData);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                error: 'Invalid event data',
                details: validationErrors
            });
        }

        // Clean up the data (you never know what people will send)
        const cleanEvent = {
            type: eventData.type.trim(),
            sessionId: eventData.sessionId.trim(),
            page: eventData.page.trim(),
            country: eventData.country ? eventData.country.trim() : 'Unknown',
            timestamp: eventData.timestamp || new Date().toISOString(),
            metadata: eventData.metadata || {}
        };

        // Save it to our in-memory storage
        const savedEvent = dataStorage.addEvent(cleanEvent);
        
        // Get the latest stats
        const currentStats = dataStorage.getSummary();
        
        // Now comes the fun part - broadcasting via WebSocket!
        if (req.app.locals.wsHandler) {
            console.log('� Broadcasting updates for new', savedEvent.type, 'event');
            
            // Tell all dashboards about the new event
            req.app.locals.wsHandler.broadcastNewEvent(savedEvent);
            
            // Update visitor counts
            req.app.locals.wsHandler.broadcastVisitorUpdate(savedEvent);
            
            // Check if we hit any milestones (10, 50, 100 visitors etc.)
            req.app.locals.wsHandler.checkAndBroadcastMilestones(currentStats);
            
            // If this is session activity, broadcast that too
            const sessionData = dataStorage.getSession(savedEvent.sessionId);
            if (sessionData) {
                req.app.locals.wsHandler.broadcastSessionActivity(sessionData);
            }
        } else {
            console.warn('⚠️ WebSocket handler missing - dashboards won\'t update');
        }

        res.status(201).json({
            message: 'Event received successfully',
            event: savedEvent,
            stats: {
                totalActive: currentStats.totalActive,
                totalToday: currentStats.totalToday,
                newSession: !dataStorage.getSession(savedEvent.sessionId) || 
                           dataStorage.getSession(savedEvent.sessionId).journey.length === 1
            }
        });

    } catch (error) {
        console.error('Error processing event:', error);
        res.status(500).json({
            error: 'Failed to process event',
            details: error.message
        });
    }
});

// GET /api/analytics/summary - Returns current statistics
router.get('/analytics/summary', (req, res) => {
    try {
        const summary = dataStorage.getSummary();
        const chartData = dataStorage.getVisitorsOverTime(10);
        const activeSessions = dataStorage.getActiveSessions();
        
        // Calculate additional metrics
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const recentEvents = dataStorage.getEvents().filter(e => 
            new Date(e.timestamp) > oneHourAgo
        );
        
        // Top countries
        const countryCounts = {};
        dataStorage.getEvents().forEach(event => {
            if (event.country) {
                countryCounts[event.country] = (countryCounts[event.country] || 0) + 1;
            }
        });
        
        const topCountries = Object.entries(countryCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([country, count]) => ({ country, count }));
        
        // Session duration stats
        const sessionDurations = activeSessions.map(s => s.duration);
        const avgSessionDuration = sessionDurations.length > 0 
            ? Math.round(sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length)
            : 0;
        
        // Bounce rate (sessions with only 1 page view)
        const totalSessions = dataStorage.sessions.size;
        const bouncedSessions = Array.from(dataStorage.sessions.values())
            .filter(s => s.journey.length === 1).length;
        const bounceRate = totalSessions > 0 ? Math.round((bouncedSessions / totalSessions) * 100) : 0;
        
        const enhancedSummary = {
            ...summary,
            metrics: {
                avgSessionDuration,
                bounceRate,
                eventsLastHour: recentEvents.length,
                uniqueVisitorsToday: new Set(dataStorage.getEvents()
                    .filter(e => new Date(e.timestamp).toDateString() === now.toDateString())
                    .map(e => e.sessionId)).size
            },
            topCountries,
            chartData: chartData.slice(-10), // Last 10 data points
            activeSessions: activeSessions.slice(0, 10), // Top 10 active sessions
            recentEvents: summary.recentEvents || []
        };
        
        res.json(enhancedSummary);
    } catch (error) {
        console.error('Error getting summary:', error);
        res.status(500).json({
            error: 'Failed to get analytics summary',
            details: error.message
        });
    }
});

// GET /api/analytics/sessions - Returns active sessions with their journey
router.get('/analytics/sessions', (req, res) => {
    try {
        const { country, page, minDuration, maxDuration, sortBy = 'lastActivity' } = req.query;
        let activeSessions = dataStorage.getActiveSessions();
        
        // Apply filters
        if (country) {
            activeSessions = activeSessions.filter(s => 
                s.country && s.country.toLowerCase().includes(country.toLowerCase())
            );
        }
        
        if (page) {
            activeSessions = activeSessions.filter(s => 
                s.journey.some(p => p.toLowerCase().includes(page.toLowerCase())) ||
                s.currentPage.toLowerCase().includes(page.toLowerCase())
            );
        }
        
        if (minDuration) {
            const min = parseInt(minDuration);
            if (!isNaN(min)) {
                activeSessions = activeSessions.filter(s => s.duration >= min);
            }
        }
        
        if (maxDuration) {
            const max = parseInt(maxDuration);
            if (!isNaN(max)) {
                activeSessions = activeSessions.filter(s => s.duration <= max);
            }
        }
        
        // Sort sessions
        switch (sortBy) {
            case 'duration':
                activeSessions.sort((a, b) => b.duration - a.duration);
                break;
            case 'startTime':
                activeSessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
                break;
            case 'journeyLength':
                activeSessions.sort((a, b) => b.journey.length - a.journey.length);
                break;
            default: // lastActivity
                activeSessions.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
        }
        
        // Pagination
        const page_num = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const startIndex = (page_num - 1) * limit;
        const endIndex = startIndex + limit;
        
        const paginatedSessions = activeSessions.slice(startIndex, endIndex);
        
        res.json({
            count: activeSessions.length,
            totalPages: Math.ceil(activeSessions.length / limit),
            currentPage: page_num,
            sessions: paginatedSessions,
            filters: { country, page, minDuration, maxDuration, sortBy },
            stats: {
                avgDuration: activeSessions.length > 0 
                    ? Math.round(activeSessions.reduce((sum, s) => sum + s.duration, 0) / activeSessions.length)
                    : 0,
                avgJourneyLength: activeSessions.length > 0
                    ? Math.round(activeSessions.reduce((sum, s) => sum + s.journey.length, 0) / activeSessions.length * 10) / 10
                    : 0,
                countries: [...new Set(activeSessions.map(s => s.country))].sort(),
                pages: [...new Set(activeSessions.flatMap(s => s.journey))].sort()
            }
        });
    } catch (error) {
        console.error('Error getting sessions:', error);
        res.status(500).json({
            error: 'Failed to get active sessions',
            details: error.message
        });
    }
});

// GET /api/analytics/events - Get events with optional filtering
router.get('/analytics/events', (req, res) => {
    try {
        const { 
            country, 
            page, 
            type, 
            sessionId,
            startDate,
            endDate,
            sortBy = 'timestamp',
            order = 'desc'
        } = req.query;
        
        const filter = {};
        
        // Basic filters
        if (country) filter.country = country;
        if (page) filter.page = page;
        if (type) filter.type = type;
        
        let events = dataStorage.getEvents(filter);
        
        // Additional filters
        if (sessionId) {
            events = events.filter(e => e.sessionId === sessionId);
        }
        
        // Date range filtering
        if (startDate) {
            const start = new Date(startDate);
            if (!isNaN(start.getTime())) {
                events = events.filter(e => new Date(e.timestamp) >= start);
            }
        }
        
        if (endDate) {
            const end = new Date(endDate);
            if (!isNaN(end.getTime())) {
                events = events.filter(e => new Date(e.timestamp) <= end);
            }
        }
        
        // Sorting
        events.sort((a, b) => {
            let aVal, bVal;
            
            switch (sortBy) {
                case 'country':
                    aVal = a.country || '';
                    bVal = b.country || '';
                    break;
                case 'page':
                    aVal = a.page || '';
                    bVal = b.page || '';
                    break;
                case 'type':
                    aVal = a.type || '';
                    bVal = b.type || '';
                    break;
                case 'sessionId':
                    aVal = a.sessionId || '';
                    bVal = b.sessionId || '';
                    break;
                default: // timestamp
                    aVal = new Date(a.timestamp);
                    bVal = new Date(b.timestamp);
            }
            
            if (order === 'asc') {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            } else {
                return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
            }
        });
        
        // Pagination
        const page_num = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const startIndex = (page_num - 1) * limit;
        const endIndex = startIndex + limit;
        
        const paginatedEvents = events.slice(startIndex, endIndex);
        
        // Generate analytics for filtered events
        const eventTypes = {};
        const eventPages = {};
        const eventCountries = {};
        const eventsByHour = {};
        
        events.forEach(event => {
            // Type distribution
            eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;
            
            // Page distribution
            eventPages[event.page] = (eventPages[event.page] || 0) + 1;
            
            // Country distribution
            if (event.country) {
                eventCountries[event.country] = (eventCountries[event.country] || 0) + 1;
            }
            
            // Hourly distribution
            const hour = new Date(event.timestamp).getHours();
            eventsByHour[hour] = (eventsByHour[hour] || 0) + 1;
        });
        
        res.json({
            count: events.length,
            totalPages: Math.ceil(events.length / limit),
            currentPage: page_num,
            events: paginatedEvents,
            filters: { country, page, type, sessionId, startDate, endDate, sortBy, order },
            analytics: {
                typeDistribution: Object.entries(eventTypes)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => ({ type, count })),
                pageDistribution: Object.entries(eventPages)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .map(([page, count]) => ({ page, count })),
                countryDistribution: Object.entries(eventCountries)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .map(([country, count]) => ({ country, count })),
                hourlyDistribution: Object.entries(eventsByHour)
                    .map(([hour, count]) => ({ hour: parseInt(hour), count }))
                    .sort((a, b) => a.hour - b.hour)
            }
        });
    } catch (error) {
        console.error('Error getting events:', error);
        res.status(500).json({
            error: 'Failed to get events',
            details: error.message
        });
    }
});

// GET /api/analytics/chart-data - Get visitor data over time for charts
router.get('/analytics/chart-data', (req, res) => {
    try {
        const minutes = parseInt(req.query.minutes) || 10;
        const { type = 'visitors', country, page } = req.query;
        
        // Validate minutes parameter
        if (minutes < 1 || minutes > 1440) { // Max 24 hours
            return res.status(400).json({
                error: 'Minutes parameter must be between 1 and 1440 (24 hours)'
            });
        }
        
        let chartData;
        
        switch (type) {
            case 'events':
                chartData = dataStorage.getEventsOverTime(minutes, { country, page });
                break;
            case 'pageviews':
                chartData = dataStorage.getPageviewsOverTime(minutes, { country, page });
                break;
            case 'sessions':
                chartData = dataStorage.getSessionsOverTime(minutes, { country });
                break;
            default: // visitors
                chartData = dataStorage.getVisitorsOverTime(minutes, { country, page });
        }
        
        // Add trend calculation
        const values = chartData.map(d => d.visitors || d.events || d.pageviews || d.sessions || 0);
        const trend = values.length > 1 ? 
            ((values[values.length - 1] - values[0]) / Math.max(values[0], 1)) * 100 : 0;
        
        // Calculate peak and average
        const peak = Math.max(...values);
        const average = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        
        res.json({
            type,
            timeRange: `${minutes} minutes`,
            data: chartData,
            summary: {
                total: values.reduce((a, b) => a + b, 0),
                peak,
                average: Math.round(average * 100) / 100,
                trend: Math.round(trend * 100) / 100,
                dataPoints: chartData.length
            },
            filters: { country, page }
        });
    } catch (error) {
        console.error('Error getting chart data:', error);
        res.status(500).json({
            error: 'Failed to get chart data',
            details: error.message
        });
    }
});

// GET /api/analytics/session/:sessionId - Get specific session details
router.get('/analytics/session/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = dataStorage.getSession(sessionId);
        
        if (!session) {
            return res.status(404).json({
                error: 'Session not found',
                sessionId
            });
        }
        
        // Get events for this session
        const sessionEvents = dataStorage.getEvents().filter(e => e.sessionId === sessionId);
        
        // Calculate session metrics
        const pageViews = sessionEvents.filter(e => e.type === 'pageview');
        const clicks = sessionEvents.filter(e => e.type === 'click');
        const timeOnPages = {};
        
        // Calculate time spent on each page
        for (let i = 0; i < pageViews.length - 1; i++) {
            const currentPage = pageViews[i].page;
            const timeSpent = new Date(pageViews[i + 1].timestamp) - new Date(pageViews[i].timestamp);
            timeOnPages[currentPage] = Math.floor(timeSpent / 1000); // Convert to seconds
        }
        
        res.json({
            session: {
                ...session,
                totalEvents: sessionEvents.length,
                pageViews: pageViews.length,
                clicks: clicks.length,
                timeOnPages
            },
            events: sessionEvents,
            analytics: {
                avgTimePerPage: Object.keys(timeOnPages).length > 0 
                    ? Math.round(Object.values(timeOnPages).reduce((a, b) => a + b, 0) / Object.keys(timeOnPages).length)
                    : 0,
                bounced: session.journey.length === 1,
                engagementScore: Math.min(100, (clicks.length * 10) + (session.journey.length * 5) + Math.min(session.duration / 10, 50))
            }
        });
    } catch (error) {
        console.error('Error getting session details:', error);
        res.status(500).json({
            error: 'Failed to get session details',
            details: error.message
        });
    }
});

// GET /api/analytics/realtime - Get real-time statistics
router.get('/analytics/realtime', (req, res) => {
    try {
        const now = new Date();
        const lastMinute = new Date(now.getTime() - 60 * 1000);
        const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000);
        const last15Minutes = new Date(now.getTime() - 15 * 60 * 1000);
        
        const allEvents = dataStorage.getEvents();
        
        const eventsLastMinute = allEvents.filter(e => new Date(e.timestamp) > lastMinute);
        const eventsLast5Minutes = allEvents.filter(e => new Date(e.timestamp) > last5Minutes);
        const eventsLast15Minutes = allEvents.filter(e => new Date(e.timestamp) > last15Minutes);
        
        const activeNow = dataStorage.getActiveSessions();
        const dashboardCount = dataStorage.getDashboardCount();
        
        res.json({
            timestamp: now.toISOString(),
            activeSessions: activeNow.length,
            connectedDashboards: dashboardCount,
            activity: {
                lastMinute: {
                    events: eventsLastMinute.length,
                    uniqueVisitors: new Set(eventsLastMinute.map(e => e.sessionId)).size,
                    pageviews: eventsLastMinute.filter(e => e.type === 'pageview').length,
                    clicks: eventsLastMinute.filter(e => e.type === 'click').length
                },
                last5Minutes: {
                    events: eventsLast5Minutes.length,
                    uniqueVisitors: new Set(eventsLast5Minutes.map(e => e.sessionId)).size,
                    pageviews: eventsLast5Minutes.filter(e => e.type === 'pageview').length,
                    clicks: eventsLast5Minutes.filter(e => e.type === 'click').length
                },
                last15Minutes: {
                    events: eventsLast15Minutes.length,
                    uniqueVisitors: new Set(eventsLast15Minutes.map(e => e.sessionId)).size,
                    pageviews: eventsLast15Minutes.filter(e => e.type === 'pageview').length,
                    clicks: eventsLast15Minutes.filter(e => e.type === 'click').length
                }
            },
            topPages: Object.entries(
                eventsLast15Minutes
                    .filter(e => e.type === 'pageview')
                    .reduce((acc, e) => {
                        acc[e.page] = (acc[e.page] || 0) + 1;
                        return acc;
                    }, {})
            )
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([page, views]) => ({ page, views })),
            recentEvents: allEvents.slice(0, 10)
        });
    } catch (error) {
        console.error('Error getting realtime data:', error);
        res.status(500).json({
            error: 'Failed to get realtime data',
            details: error.message
        });
    }
});

// POST /api/analytics/bulk-events - Handle bulk event submission
router.post('/analytics/bulk-events', (req, res) => {
    try {
        const { events } = req.body;
        
        if (!Array.isArray(events)) {
            return res.status(400).json({
                error: 'Events must be an array'
            });
        }
        
        if (events.length === 0) {
            return res.status(400).json({
                error: 'Events array cannot be empty'
            });
        }
        
        if (events.length > 100) {
            return res.status(400).json({
                error: 'Cannot process more than 100 events at once'
            });
        }
        
        const results = {
            processed: 0,
            failed: 0,
            errors: []
        };
        
        const processedEvents = [];
        
        events.forEach((eventData, index) => {
            try {
                const validationErrors = validateEventData(eventData);
                if (validationErrors.length > 0) {
                    results.failed++;
                    results.errors.push({
                        index,
                        event: eventData,
                        errors: validationErrors
                    });
                    return;
                }
                
                const sanitizedEvent = {
                    type: eventData.type.trim(),
                    sessionId: eventData.sessionId.trim(),
                    page: eventData.page.trim(),
                    country: eventData.country ? eventData.country.trim() : 'Unknown',
                    timestamp: eventData.timestamp || new Date().toISOString(),
                    metadata: eventData.metadata || {}
                };
                
                const savedEvent = dataStorage.addEvent(sanitizedEvent);
                processedEvents.push(savedEvent);
                results.processed++;
                
            } catch (error) {
                results.failed++;
                results.errors.push({
                    index,
                    event: eventData,
                    errors: [error.message]
                });
            }
        });
        
        // Broadcast bulk update via WebSocket
        if (req.app.locals.wsHandler && processedEvents.length > 0) {
            const currentStats = dataStorage.getSummary();
            req.app.locals.wsHandler.broadcastVisitorUpdate(
                { type: 'bulk_update', count: processedEvents.length },
                currentStats
            );
        }
        
        res.status(results.failed > 0 ? 207 : 201).json({ // 207 = Multi-Status
            message: `Processed ${results.processed} events, ${results.failed} failed`,
            results,
            summary: dataStorage.getSummary()
        });
        
    } catch (error) {
        console.error('Error processing bulk events:', error);
        res.status(500).json({
            error: 'Failed to process bulk events',
            details: error.message
        });
    }
});

// DELETE /api/analytics/reset - Clear all statistics (for testing)
router.delete('/analytics/reset', (req, res) => {
    try {
        dataStorage.clearStats();
        
        // Broadcast reset notification
        if (req.app.locals.wsHandler) {
            req.app.locals.wsHandler.broadcastAlert('info', 
                'Analytics data has been reset', 
                { resetAt: new Date().toISOString() }
            );
        }
        
        res.json({ 
            message: 'Analytics data cleared successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error clearing stats:', error);
        res.status(500).json({
            error: 'Failed to clear statistics',
            details: error.message
        });
    }
});

module.exports = router;
