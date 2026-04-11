const express = require('express');
const cors = require('cors');
const path = require('path');
const classroomRoutes = require('./routes/classroomRoutes');
const hotspotRoutes = require('./routes/hotspotRoutes');
const mappingRoutes = require('./routes/mappingRoutes');
const searchRoutes = require('./routes/searchRoutes');
const registerBlockMapRoutes = require('./routes/blockMapApi');
// Require DB to ensure tables are created / seeded on startup
require('./database/db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '512kb' }));

const clientDir = path.join(__dirname, '..', 'client');

// Block map editor API — full paths on app (reliable; not nested under app.use('/api', router))
registerBlockMapRoutes(app, clientDir);

app.use('/api/classrooms', classroomRoutes);
app.use('/api/hotspots', hotspotRoutes);
app.use('/api/mappings', mappingRoutes);
app.use('/api/search', searchRoutes);

app.use(express.static(clientDir));

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

/** Default 3001 so another project (e.g. test web) can use 3000 on the same machine */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
