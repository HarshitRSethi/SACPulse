import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { DatabaseConnection } from './DatabaseConnection.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SEED_USERS = [
  {
    email: 'studenta@iiita.ac.in',
    roll_no: 'IIT2023001',
    name: 'Student A',
    mobile_no: '9876543210',
    role: 'STUDENT',
    is_defaulter: false,
    penalty_until: null
  },
  {
    email: 'studentb@iiita.ac.in',
    roll_no: 'IIT2023002',
    name: 'Student B',
    mobile_no: '9876543211',
    role: 'STUDENT',
    is_defaulter: false,
    penalty_until: null
  },
  {
    email: 'guard@iiita.ac.in',
    roll_no: 'GUARD001',
    name: 'SAC Guard Ramesh',
    mobile_no: '9876543212',
    role: 'GUARD',
    is_defaulter: false,
    penalty_until: null
  },
  {
    email: 'admin@iiita.ac.in',
    roll_no: 'ADMIN001',
    name: 'SAC Admin Dr. Sharma',
    mobile_no: '9876543213',
    role: 'ADMIN',
    is_defaulter: false,
    penalty_until: null
  }
];

export const SEED_SAC_ITEMS = [
  { name: 'TT Racket', category: 'Table Tennis', item_type: 'EQUIPMENT', total_qty: 6, available_qty: 6, damaged_qty: 0, occupied_since: null },
  { name: 'TT Ball', category: 'Table Tennis', item_type: 'EQUIPMENT', total_qty: 12, available_qty: 12, damaged_qty: 0, occupied_since: null },
  { name: 'Tennis Racket', category: 'Lawn Tennis', item_type: 'EQUIPMENT', total_qty: 4, available_qty: 4, damaged_qty: 0, occupied_since: null },
  { name: 'Tennis Ball', category: 'Lawn Tennis', item_type: 'EQUIPMENT', total_qty: 8, available_qty: 8, damaged_qty: 0, occupied_since: null },
  { name: 'Chess Set', category: 'Board Games', item_type: 'EQUIPMENT', total_qty: 5, available_qty: 5, damaged_qty: 0, occupied_since: null },
  { name: 'Carrom Board Set', category: 'Board Games', item_type: 'EQUIPMENT', total_qty: 4, available_qty: 4, damaged_qty: 0, occupied_since: null },
  { name: 'Dance Room Key', category: 'Activity Rooms', item_type: 'ROOM_KEY', total_qty: 1, available_qty: 1, damaged_qty: 0, occupied_since: null },
  { name: 'Music Room Key', category: 'Activity Rooms', item_type: 'ROOM_KEY', total_qty: 1, available_qty: 1, damaged_qty: 0, occupied_since: null }
];

export const SEED_WHITELISTED_STAFF = [
  {
    email: 'guard.sac.iiita@gmail.com',
    name: 'SAC Guard Ramesh',
    role: 'GUARD'
  }
];

export async function runSeed(): Promise<void> {
  console.log('Starting SACPulse Supabase Database Seeding...');
  const db = DatabaseConnection.getInstance();
  const supabase = db.getSupabase();

  if (supabase) {
    try {
      await supabase.from('users').upsert(SEED_USERS, { onConflict: 'email' });
      await supabase.from('sac_items').upsert(SEED_SAC_ITEMS, { onConflict: 'name' });
      await supabase.from('whitelisted_staff').upsert(SEED_WHITELISTED_STAFF, { onConflict: 'email' });
      console.log('Successfully synced seed data via Supabase HTTPS client.');
    } catch (err: any) {
      console.warn('Supabase client upsert notice:', err.message);
    }
  } else {
    const pool = db.getPool();
    if (pool) {
      try {
        const sqlPath = path.join(__dirname, 'seed.sql');
        const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
        await pool.query(sqlContent);
        console.log('Successfully seeded database via PostgreSQL pool.');
      } catch (err: any) {
        console.warn('Direct pool query notice:', err.message);
      } finally {
        await db.close();
      }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSeed().catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
}

