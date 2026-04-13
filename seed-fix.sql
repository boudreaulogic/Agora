-- Students columns
INSERT INTO agora_columns (id, "tableId", name, type, position, settings, "updatedAt") VALUES
  ('scol_name',    'seed_students_001', 'Student Name',  'text',   0, NULL, NOW()),
  ('scol_email',   'seed_students_001', 'Email',         'email',  1, NULL, NOW()),
  ('scol_major',   'seed_students_001', 'Major',         'select', 2, '{"options":[{"value":"Computer Science","label":"Computer Science","color":"#3B82F6"},{"value":"Business","label":"Business","color":"#10B981"},{"value":"Nursing","label":"Nursing","color":"#EF4444"},{"value":"Education","label":"Education","color":"#F59E0B"},{"value":"Environmental Science","label":"Environmental Science","color":"#8B5CF6"},{"value":"Indigenous Studies","label":"Indigenous Studies","color":"#EC4899"}]}', NOW()),
  ('scol_status',  'seed_students_001', 'Status',        'select', 3, '{"options":[{"value":"Active","label":"Active","color":"#10B981"},{"value":"Graduated","label":"Graduated","color":"#3B82F6"},{"value":"On Leave","label":"On Leave","color":"#F59E0B"},{"value":"Withdrawn","label":"Withdrawn","color":"#EF4444"}]}', NOW()),
  ('scol_gpa',     'seed_students_001', 'GPA',           'number', 4, NULL, NOW()),
  ('scol_year',    'seed_students_001', 'Year',          'select', 5, '{"options":[{"value":"Freshman","label":"Freshman","color":"#94A3B8"},{"value":"Sophomore","label":"Sophomore","color":"#64748B"},{"value":"Junior","label":"Junior","color":"#475569"},{"value":"Senior","label":"Senior","color":"#1E293B"}]}', NOW()),
  ('scol_enrolled','seed_students_001', 'Enrolled Date', 'date',   6, NULL, NOW());

-- Courses columns
INSERT INTO agora_columns (id, "tableId", name, type, position, settings, "updatedAt") VALUES
  ('ccol_name',    'seed_courses_001', 'Course Name',  'text',     0, NULL, NOW()),
  ('ccol_code',    'seed_courses_001', 'Course Code',  'text',     1, NULL, NOW()),
  ('ccol_dept',    'seed_courses_001', 'Department',   'select',   2, '{"options":[{"value":"Computer Science","label":"Computer Science","color":"#3B82F6"},{"value":"Business","label":"Business","color":"#10B981"},{"value":"Nursing","label":"Nursing","color":"#EF4444"},{"value":"Education","label":"Education","color":"#F59E0B"},{"value":"Science","label":"Science","color":"#8B5CF6"},{"value":"Humanities","label":"Humanities","color":"#EC4899"},{"value":"Math","label":"Math","color":"#14B8A6"}]}', NOW()),
  ('ccol_credits', 'seed_courses_001', 'Credits',      'number',   3, NULL, NOW()),
  ('ccol_instr',   'seed_courses_001', 'Instructor',   'text',     4, NULL, NOW()),
  ('ccol_cap',     'seed_courses_001', 'Capacity',     'number',   5, NULL, NOW()),
  ('ccol_fee',     'seed_courses_001', 'Course Fee',   'currency', 6, NULL, NOW());

-- Enrollments columns - linked records
INSERT INTO agora_columns (id, "tableId", name, type, position, settings, "updatedAt", "linkedTableId", linkeddisplaycolumnid) VALUES
  ('ecol_student', 'seed_enrollments_001', 'Student',   'linked_record', 0, NULL, NOW(), 'seed_students_001', 'scol_name'),
  ('ecol_course',  'seed_enrollments_001', 'Course',    'linked_record', 1, NULL, NOW(), 'seed_courses_001',  'ccol_name');

-- Enrollments columns - regular
INSERT INTO agora_columns (id, "tableId", name, type, position, settings, "updatedAt") VALUES
  ('ecol_semester','seed_enrollments_001', 'Semester',    'select',  2, '{"options":[{"value":"Fall 2024","label":"Fall 2024","color":"#F59E0B"},{"value":"Spring 2025","label":"Spring 2025","color":"#10B981"},{"value":"Fall 2025","label":"Fall 2025","color":"#3B82F6"},{"value":"Spring 2026","label":"Spring 2026","color":"#8B5CF6"}]}', NOW()),
  ('ecol_grade',   'seed_enrollments_001', 'Grade',       'select',  3, '{"options":[{"value":"A","label":"A","color":"#10B981"},{"value":"B","label":"B","color":"#3B82F6"},{"value":"C","label":"C","color":"#F59E0B"},{"value":"D","label":"D","color":"#F97316"},{"value":"F","label":"F","color":"#EF4444"},{"value":"IP","label":"In Progress","color":"#94A3B8"}]}', NOW()),
  ('ecol_score',   'seed_enrollments_001', 'Score',       'number',  4, NULL, NOW()),
  ('ecol_paid',    'seed_enrollments_001', 'Tuition Paid','currency',5, NULL, NOW()),
  ('ecol_status',  'seed_enrollments_001', 'Status',      'select',  6, '{"options":[{"value":"Enrolled","label":"Enrolled","color":"#10B981"},{"value":"Completed","label":"Completed","color":"#3B82F6"},{"value":"Dropped","label":"Dropped","color":"#EF4444"},{"value":"Waitlisted","label":"Waitlisted","color":"#F59E0B"}]}', NOW());