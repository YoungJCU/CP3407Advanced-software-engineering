const express = require('express');
const cors = require('cors');
const path = require('path');
const classroomRoutes = require('./routes/classroomRoutes');
const hotspotRoutes = require('./routes/hotspotRoutes');
const mappingRoutes = require('./routes/mappingRoutes');
const searchRoutes = require('./routes/searchRoutes');
const authRoutes = require('./routes/authRoutes');
const registerBlockMapRoutes = require('./routes/blockMapApi');
// Require DB to ensure tables are created / seeded on startup
const db = require('./database/db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '512kb' }));

app.use((req, res, next) => {
  Promise.resolve(db.ready)
    .then(() => next())
    .catch(next);
});

const clientDir = path.join(__dirname, '..', 'client');

// Block map editor API — full paths on app (reliable; not nested under app.use('/api', router))
registerBlockMapRoutes(app, clientDir);

app.use('/api/classrooms', classroomRoutes);
app.use('/api/hotspots', hotspotRoutes);
app.use('/api/mappings', mappingRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/auth', authRoutes);

app.use(express.static(clientDir));

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

/** Export app for tests; only start server when run directly */
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
