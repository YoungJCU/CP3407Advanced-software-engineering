const express = require('express');
const cors = require('cors');
const path = require('path');
const classroomRoutes = require('./routes/classroomRoutes');
const hotspotRoutes = require('./routes/hotspotRoutes');
const mappingRoutes = require('./routes/mappingRoutes');
const searchRoutes = require('./routes/searchRoutes');
// Require DB to ensure tables are created / seeded on startup
require('./database/db');

const app = express();
app.use(cors());
app.use(express.json());

// Serve client static files from ../client
const clientDir = path.join(__dirname, '..', 'client');
app.use(express.static(clientDir));

app.use('/api/classrooms', classroomRoutes);
app.use('/api/hotspots', hotspotRoutes);
app.use('/api/mappings', mappingRoutes);
app.use('/api/search', searchRoutes);

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
