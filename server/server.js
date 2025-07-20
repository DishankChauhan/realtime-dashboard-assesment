const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const analyticsRoutes = require('./routes/analytics');
const WebSocketHandler = require('./websocket/websocketHandler');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000; // using 3000 because that's what I always use

// Middleware setup - pretty standard stuff
app.use(cors()); // because CORS errors are the worst
app.use(bodyParser.json()); // for parsing those POST requests
app.use(bodyParser.urlencoded({ extended: true }));

// Serve the dashboard and CSS/JS files
app.use(express.static(path.join(__dirname, '../public')));

// WebSocket server setup - this took way longer to get right than I'd like to admit
const wss = new WebSocket.Server({ server });
const wsHandler = new WebSocketHandler(wss);

// Make WebSocket available to routes so they can broadcast events when stuff happens
app.locals.wsHandler = wsHandler;

// All the API routes
app.use('/api', analyticsRoutes);

// Main route - just show the dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// Error handling - should probably make this fancier but it works
app.use((err, req, res, next) => {
    console.error('Oops, something broke:', err.stack);
    res.status(500).json({ 
        error: 'Something went wrong on our end!',
        message: err.message 
    });
});

// 404 for routes that don't exist
app.use((req, res) => {
    res.status(404).json({ error: `Can't find ${req.path}` });
});

// Start the whole thing
server.listen(PORT, () => {
    console.log(' Server is alive and running on http://localhost:' + PORT);
    console.log(' Dashboard is at http://localhost:' + PORT);
    console.log(' WebSocket server is ready for connections');
    
    console.log(''); // just for some visual spacing
});

// Graceful shutdown - probably overkill for a demo but whatever
process.on('SIGTERM', () => {
    console.log(' Shutting down gracefully...');
    server.close(() => {
        console.log(' Server stopped cleanly');
        process.exit(0);
    });
});
