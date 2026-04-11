const request = require('supertest');
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const db = require('../database/db');
const app = require('../app');

function resetDb(done) {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'init.sql'), 'utf8');
  db.exec(sql, (err) => {
    if (err) return done(err);
    done();
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('API smoke tests (10 cases)', function () {
  this.timeout(5000);
  let existingClassroomId = null;

  before((done) => {
    resetDb((err) => {
      if (err) return done(err);
      wait(250)
        .then(() => {
          db.get('SELECT id FROM classrooms ORDER BY id ASC LIMIT 1', [], (qErr, row) => {
            if (qErr) return done(qErr);
            existingClassroomId = row ? row.id : null;
            done();
          });
        })
        .catch(done);
    });
  });

  it('GET /api/classrooms should return list', async () => {
    const res = await request(app).get('/api/classrooms').expect(200);
    expect(res.body).to.have.property('success', true);
    expect(res.body).to.have.property('data').that.is.an('array');
    expect(res.body.data.length).to.be.greaterThan(0);
  });

  it('GET /api/classrooms/:id should return classroom with courses', async () => {
    expect(existingClassroomId).to.be.a('number');
    const res = await request(app).get(`/api/classrooms/${existingClassroomId}`).expect(200);
    expect(res.body).to.have.property('success', true);
    expect(res.body.data).to.have.property('id');
    expect(res.body.data).to.have.property('courses').that.is.an('array');
  });

  it('GET /api/auth/user should return public user info', async () => {
    const res = await request(app).get('/api/auth/user').query({ email: 'student1@jcu.edu.sg' }).expect(200);
    expect(res.body).to.have.property('success', true);
    expect(res.body.data).to.have.property('email', 'student1@jcu.edu.sg');
  });

  it('POST /api/auth/login with correct credentials should succeed', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'student1@jcu.edu.sg', password: 'Password123' }).expect(200);
    expect(res.body).to.have.property('success', true);
    expect(res.body.data).to.have.property('email', 'student1@jcu.edu.sg');
  });

  it('POST /api/auth/login with wrong password should return 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'student1@jcu.edu.sg', password: 'WrongPass1' }).expect(401);
    expect(res.body).to.have.property('success', false);
  });

  it('GET /api/hotspots should return array (possibly empty)', async () => {
    const res = await request(app).get('/api/hotspots').expect(200);
    expect(res.body).to.have.property('success', true);
    expect(res.body).to.have.property('data').that.is.an('array');
  });

  let createdHotspotId = null;
  it('POST /api/hotspots should create a hotspot', async () => {
    const payload = { name: 'TestHotspot', left_pct: 12.5, top_pct: 34.1 };
    const res = await request(app).post('/api/hotspots').send(payload).expect(200);
    expect(res.body).to.have.property('success', true);
    expect(res.body.data).to.include({ name: 'TestHotspot' });
    expect(res.body.data).to.have.property('id');
    createdHotspotId = res.body.data.id;
  });

  it('DELETE /api/hotspots/:id should delete the created hotspot', async () => {
    const res = await request(app).delete(`/api/hotspots/${createdHotspotId}`).expect(200);
    expect(res.body).to.have.property('success', true);
    expect(res.body).to.have.property('deleted').that.is.a('number');
  });

  it('POST /api/mappings should upsert a mapping', async () => {
    expect(existingClassroomId).to.be.a('number');
    const payload = { name_key: 'TEST_ROOM_1', classroom_id: existingClassroomId };
    const res = await request(app).post('/api/mappings').send(payload).expect(200);
    expect(res.body).to.have.property('success', true);
    expect(res.body.data).to.include({ name_key: 'TEST_ROOM_1', classroom_id: existingClassroomId });
  });

  it('GET /api/mappings should include the upserted mapping', async () => {
    const res = await request(app).get('/api/mappings').expect(200);
    expect(res.body).to.have.property('success', true);
    const found = res.body.data.find((r) => r.name_key === 'TEST_ROOM_1');
    expect(found).to.exist;
    expect(found).to.have.property('classroom_id', existingClassroomId);
  });

  after((done) => {
    db.run('DELETE FROM mappings WHERE name_key = ?', ['TEST_ROOM_1'], (err) => {
      if (err) return done(err);
      done();
    });
  });
});
