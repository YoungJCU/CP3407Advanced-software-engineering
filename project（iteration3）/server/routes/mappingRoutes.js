const express = require('express');
const router = express.Router();
const controller = require('../controllers/mappingController');

router.get('/', controller.getAll);
router.post('/', controller.upsert);
router.delete('/:id', controller.delete);

module.exports = router;

