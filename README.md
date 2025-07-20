# Real-Time Analytics Dashboard

Hey! 👋 So this is my attempt at the API Developer Intern assessment. Honestly, this was way more fun to build than I expected!

I ended up creating this visitor analytics system that shows website traffic in real-time. You know those fancy dashboards you see in movies where numbers are updating constantly? Yeah, that's basically what I was going for here.

## What I Actually Built

Alright, so there are three main pieces that somehow work together (after many cups of coffee):

1. **REST API Server** - Takes in visitor events from websites
2. **WebSocket Server** - The real-time magic happens here 
3. **Dashboard Frontend** - Where you can watch the chaos unfold

The WebSocket part was... interesting. Let's just say I learned A LOT about connection handling, heartbeats, and why browsers are weird. But hey, it works now and I'm kinda proud of it!

## Features That Actually Work

The core stuff (that I had to build):
- **Live visitor tracking** - Seriously, open it and send some test events, it's pretty cool
- **Session journeys** - You can see exactly how users navigate around
- **Multiple dashboards** - Open like 3 tabs and watch them all update together (this broke so many times during testing)
- **Filtering magic** - Filter by country or page, results show up instantly
- **Auto-reconnect** - Because WiFi is unreliable and I got tired of manually refreshing

The extra stuff I couldn't help myself adding:
- Sound notifications (turn your volume down first, trust me)
- Milestone alerts - it celebrates when you hit 10, 50, 100 visitors
- Some decent animations and styling (I'm not a designer but I tried!)
- Traffic spike warnings when things get busy
- A mini chart that shows the last 10 events

Pro tip: The sound notifications are actually pretty satisfying when you're testing with the Postman collection!

## How I Organized This Mess

```
real-time-analytics/
├── server/
│   ├── server.js                 # Main server - surprisingly short for all it does
│   ├── package.json             # The usual suspects: Express, WS, cors...
│   ├── routes/
│   │   └── analytics.js         # REST endpoints (this file got way longer than planned)
│   ├── websocket/
│   │   └── websocketHandler.js  # Where the WebSocket magic/chaos happens
│   └── data/
│       └── storage.js           # In-memory storage - keeps things simple
└── public/
    ├── dashboard.html           # The main dashboard page
    ├── css/
    │   └── dashboard.css        # I spent way too much time on animations
    └── js/
        └── dashboard.js         # Frontend WebSocket handling (this file is huge now)
```

I tried to keep things organized but honestly, some files just kept growing. The dashboard.js file especially - it started simple and then I kept adding "just one more feature"...

## Getting This Thing Running

### Prerequisites (The Boring Stuff)
- Node.js (I'm using v18 but v14+ should work fine)
- npm (should come with Node)
- A modern browser (tested on Chrome, Firefox should work too)
- About 5 minutes of your time

### Installation Steps

1. **Navigate to the server directory:**
   ```bash
   cd real-time-analytics/server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   This grabs Express, ws (WebSocket library), cors, and body-parser. Nothing too crazy.

3. **Fire it up:**
   ```bash
   npm start
   ```
   If everything works, you'll see some colorful emoji telling you it's alive!

4. **Check out the dashboard:**
   - Open `http://localhost:3000` in your browser
   - The dashboard should connect automatically (you'll see a green dot)
   - If it doesn't connect, check the console - there might be clues there

### Quick Test
Once it's running, open another terminal and send some test events with curl. It's way more satisfying to see the dashboard update in real-time than just staring at an empty screen!

## API Documentation (The Technical Bits)

### REST Endpoints (Required Ones)
- `POST /api/events` - Send visitor events here (this is the main one)
- `GET /api/analytics/summary` - Get current visitor stats
- `GET /api/analytics/sessions` - See active sessions with their journeys

### Extra Endpoints (Because I Got Carried Away)
- `GET /api/analytics/events` - Get events with filtering (supports ?country=US&page=/home)
- `GET /api/analytics/chart-data` - Data for the little chart on the dashboard
- `POST /api/analytics/bulk-events` - Send multiple events at once (useful for testing)
- `DELETE /api/analytics/reset` - Nuclear option: clears everything

### WebSocket Events (The Fun Stuff!)

**Server → Dashboard:**
- `visitor_update` - "Hey, someone new just showed up!"
- `user_connected` - "Another dashboard connected"
- `user_disconnected` - "Someone closed their dashboard tab"
- `session_activity` - "User navigated to a new page"
- `alert` - Various notifications (milestones, traffic spikes, etc.)
- `alert` - "Something interesting happened!"

**Dashboard sends to server:**
- `request_detailed_stats` - "Give me filtered data"
- `track_dashboard_action` - "I just applied a filter"

## Testing It Out

### Quick Test with curl
Want to see it work immediately? Open a terminal and try:

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "pageview",
    "page": "/home",
    "sessionId": "test-user-123",
    "country": "India"
  }'
```

Watch your dashboard - you should see the new visitor appear instantly!



Built for the API Developer Intern Technical Assessment
July 2025
- ✅ Interactive dashboard with live updates
- ✅ Session tracking and journey visualization
- ✅ Multi-dashboard synchronization
- ✅ Professional UI/UX design
- ✅ Local development environment

---

*Built for the API Developer Intern Technical Assessment*
