-- ============================================================
-- SACPulse Database Seed Script
-- Realistic SAC Items (8 items) & 4 Test Accounts
-- ============================================================

-- 1. Test Accounts
INSERT INTO users (email, roll_no, name, mobile_no, role, is_defaulter, penalty_until)
VALUES 
  ('studenta@iiita.ac.in', 'IIT2023001', 'Student A', '9876543210', 'STUDENT', FALSE, NULL),
  ('studentb@iiita.ac.in', 'IIT2023002', 'Student B', '9876543211', 'STUDENT', FALSE, NULL),
  ('guard@iiita.ac.in', 'GUARD001', 'SAC Guard Ramesh', '9876543212', 'GUARD', FALSE, NULL),
  ('admin@iiita.ac.in', 'ADMIN001', 'SAC Admin Dr. Sharma', '9876543213', 'ADMIN', FALSE, NULL)
ON CONFLICT (email) DO UPDATE SET
  roll_no = EXCLUDED.roll_no,
  name = EXCLUDED.name,
  mobile_no = EXCLUDED.mobile_no,
  role = EXCLUDED.role,
  is_defaulter = EXCLUDED.is_defaulter,
  penalty_until = EXCLUDED.penalty_until;

-- 2. SAC Items
INSERT INTO sac_items (name, category, item_type, total_qty, available_qty, damaged_qty, occupied_since)
VALUES
  ('TT Racket', 'Table Tennis', 'EQUIPMENT', 6, 6, 0, NULL),
  ('TT Ball', 'Table Tennis', 'EQUIPMENT', 12, 12, 0, NULL),
  ('Tennis Racket', 'Lawn Tennis', 'EQUIPMENT', 4, 4, 0, NULL),
  ('Tennis Ball', 'Lawn Tennis', 'EQUIPMENT', 8, 8, 0, NULL),
  ('Chess Set', 'Board Games', 'EQUIPMENT', 5, 5, 0, NULL),
  ('Carrom Board Set', 'Board Games', 'EQUIPMENT', 4, 4, 0, NULL),
  ('Dance Room Key', 'Activity Rooms', 'ROOM_KEY', 1, 1, 0, NULL),
  ('Music Room Key', 'Activity Rooms', 'ROOM_KEY', 1, 1, 0, NULL)
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  item_type = EXCLUDED.item_type,
  total_qty = EXCLUDED.total_qty,
  available_qty = EXCLUDED.available_qty,
  damaged_qty = EXCLUDED.damaged_qty,
  occupied_since = EXCLUDED.occupied_since;
