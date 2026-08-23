import bcrypt from 'bcryptjs';
import { query } from './db.js';
import 'dotenv/config';

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.log('Использование: node server/create-admin.js admin@example.com StrongPassword');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);

await query(`
  insert into admins(email,password_hash)
  values($1,$2)
  on conflict(email) do update set password_hash=excluded.password_hash
`, [email, hash]);

console.log(`Администратор ${email} создан/обновлён.`);
process.exit(0);
