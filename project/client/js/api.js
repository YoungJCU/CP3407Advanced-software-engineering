async function getClassrooms(){
  const res = await fetch('http://localhost:3000/api/classrooms');
  const data = await res.json();
  if(!data.success) throw new Error(data.message || 'Failed to load');
  return data.data;
}

async function getClassroomById(id){
  const res = await fetch(`http://localhost:3000/api/classrooms/${id}`);
  const data = await res.json();
  if(!data.success) throw new Error(data.message || 'Failed to load');
  return data.data;
}

