const classroomModel = require('../models/classroomModel');
const courseModel = require('../models/courseModel');

exports.getAll = async (req, res) => {
  try {
    const data = await classroomModel.getAllClassrooms();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const room = await classroomModel.getClassroomById(id);
    if (!room) return res.status(404).json({ success: false, message: 'Not found' });
    const courses = await courseModel.getCoursesByClassroom(id);
    res.json({ success: true, data: { ...room, courses } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

