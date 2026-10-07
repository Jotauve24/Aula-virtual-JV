import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { rosterKey, userKey } from './roster.js';
import { InputError } from './errors.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newCourseCode() {
  const bytes = randomBytes(15);
  const code = [...bytes].map(byte => codeAlphabet[byte % codeAlphabet.length]).join('');
  return `MAT-${code.slice(0, 5)}-${code.slice(5, 10)}-${code.slice(10)}`;
}
export const normalizeCourseCode = code => String(code ?? '').trim().replace(/\s/g, '').toUpperCase();

export function createStorage(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec('PRAGMA foreign_keys = ON');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE,
      registration_open INTEGER NOT NULL DEFAULT 1 CHECK(registration_open IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id),
      name TEXT NOT NULL, instructions TEXT NOT NULL DEFAULT '',
      capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 100),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id),
      institutional_user TEXT NOT NULL DEFAULT '', normalized_user TEXT NOT NULL DEFAULT '',
      original_first_name TEXT NOT NULL, original_last_name TEXT NOT NULL,
      first_name TEXT NOT NULL, last_name TEXT NOT NULL, normalized_name TEXT NOT NULL,
      phone TEXT, national_id TEXT, avatar_json TEXT, activated_at TEXT,
      topic_id TEXT REFERENCES topics(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS unique_institutional_user
      ON students(course_id, normalized_user) WHERE normalized_user <> '';
    CREATE INDEX IF NOT EXISTS students_in_course ON students(course_id);
    CREATE INDEX IF NOT EXISTS topics_in_course ON topics(course_id);
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY, csrf_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
  const sql = statement => db.prepare(statement);
  const tx = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); db.exec('COMMIT'); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const uuid = () => randomBytes(16).toString('hex');
  const course = id => sql('SELECT id, name, registration_open AS registrationOpen, created_at AS createdAt FROM courses WHERE id=?').get(id);
  const topic = id => sql('SELECT id, course_id AS courseId, name, instructions, capacity FROM topics WHERE id=?').get(id);
  const student = id => sql('SELECT id, course_id AS courseId, institutional_user AS institutionalUser, original_first_name AS originalFirstName, original_last_name AS originalLastName, first_name AS firstName, last_name AS lastName, phone, national_id AS nationalId, avatar_json AS avatarJson, activated_at AS activatedAt, topic_id AS topicId FROM students WHERE id=?').get(id);
  const listStudents = id => sql('SELECT id, institutional_user AS institutionalUser, original_first_name AS originalFirstName, original_last_name AS originalLastName, first_name AS firstName, last_name AS lastName, phone, national_id AS nationalId, activated_at AS activatedAt, avatar_json AS avatarJson, topic_id AS topicId FROM students WHERE course_id=? ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE').all(id);
  const listTopics = id => sql('SELECT t.id,t.name,t.instructions,t.capacity, COUNT(s.id) AS members FROM topics t LEFT JOIN students s ON s.topic_id=t.id WHERE t.course_id=? GROUP BY t.id ORDER BY t.created_at,t.rowid').all(id);
  const members = id => sql('SELECT COUNT(*) AS count FROM students WHERE topic_id=?').get(id).count;

  return {
    close: () => db.close(),
    issueSession() {
      const token = randomBytes(32).toString('base64url'), csrf = randomBytes(24).toString('base64url');
      const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
      tx(() => { sql('DELETE FROM admin_sessions WHERE expires_at < ?').run(Date.now()); sql('INSERT INTO admin_sessions VALUES (?,?,?)').run(hash(token), csrf, expiresAt); });
      return { token, csrf, expiresAt };
    },
    session(token) { return token ? sql('SELECT csrf_token AS csrf,expires_at AS expiresAt FROM admin_sessions WHERE token_hash=? AND expires_at>?').get(hash(token), Date.now()) : null; },
    revokeSession(token) { if (token) sql('DELETE FROM admin_sessions WHERE token_hash=?').run(hash(token)); },
    listCourses() { return sql('SELECT c.id,c.name,c.registration_open AS registrationOpen,c.created_at AS createdAt, COUNT(DISTINCT t.id) AS topics, COUNT(DISTINCT s.id) AS students FROM courses c LEFT JOIN topics t ON t.course_id=c.id LEFT JOIN students s ON s.course_id=c.id GROUP BY c.id ORDER BY c.created_at DESC,c.rowid DESC').all(); },
    getCourse: course,
    findCourseByCode(value) { return sql('SELECT id,name,registration_open AS registrationOpen FROM courses WHERE code_hash=?').get(hash(normalizeCourseCode(value))); },
    createCourse(name) {
      const id=uuid(), code=newCourseCode();
      sql('INSERT INTO courses(id,name,code_hash) VALUES (?,?,?)').run(id,name,hash(code));
      return { ...course(id), code };
    },
    updateCourse(id, values) {
      if (!course(id)) return null;
      sql('UPDATE courses SET name=?,registration_open=? WHERE id=?').run(values.name, values.registrationOpen ? 1 : 0, id);
      return course(id);
    },
    rotateCode(id) {
      if (!course(id)) return null;
      const code=newCourseCode(); sql('UPDATE courses SET code_hash=? WHERE id=?').run(hash(code),id);
      return code;
    },
    getTopics: listTopics,
    createTopic(courseId, name, instructions, capacity) {
      if (!course(courseId)) return null;
      const id=uuid(); sql('INSERT INTO topics(id,course_id,name,instructions,capacity) VALUES (?,?,?,?,?)').run(id,courseId,name,instructions,capacity);
      return topic(id);
    },
    updateTopic(courseId, topicId, values) {
      return tx(() => {
        const existing=topic(topicId);
        if (!existing || existing.courseId!==courseId) return null;
        if (values.capacity<members(topicId)) throw new InputError('El cupo no puede ser menor que los inscritos.');
        sql('UPDATE topics SET name=?,instructions=?,capacity=? WHERE id=?').run(values.name,values.instructions,values.capacity,topicId);
        return topic(topicId);
      });
    },
    getStudents: listStudents,
    previewRoster(courseId, rows) {
      const existing=listStudents(courseId), byUser=new Map(existing.filter(s=>s.institutionalUser).map(s=>[userKey(s),s]));
      const byName=new Map(); for(const s of existing){const name=rosterKey(s);byName.set(name,[...(byName.get(name)||[]),s]);}
      const seenUser=new Set(), seenName=new Set();
      return rows.map(row => {
        const uid=userKey(row), name=rosterKey(row);
        let status='new', matchId=null;
        if (uid && byUser.has(uid)) { status='existing'; matchId=byUser.get(uid).id; }
        else if (byName.has(name)) { status='possible_duplicate'; matchId=byName.get(name)[0].id; }
        if ((uid && seenUser.has(uid)) || seenName.has(name)) status='duplicate_in_file';
        if(uid)seenUser.add(uid);seenName.add(name);
        return { ...row, status, matchId };
      });
    },
    importRoster(courseId, rows) {
      return tx(() => {
        if(!course(courseId))return null;
        const preview=this.previewRoster(courseId,rows);
        const insert=sql('INSERT INTO students(id,course_id,institutional_user,normalized_user,original_first_name,original_last_name,first_name,last_name,normalized_name) VALUES (?,?,?,?,?,?,?,?,?)');
        let added=0;
        for(const row of preview)if(row.status==='new'){
          insert.run(uuid(),courseId,row.institutionalUser,userKey(row),row.firstName,row.lastName,row.firstName,row.lastName,rosterKey(row));added++;
        }
        return {added,skipped:preview.length-added,rows:preview};
      });
    },
    addStudent(courseId, row, allowDuplicate=false) {
      return tx(() => {
        if(!course(courseId))return null;
        const [check]=this.previewRoster(courseId,[row]);
        if(check.status==='existing'||(check.status==='possible_duplicate'&&!allowDuplicate))throw new InputError('Ya existe un perfil similar. Revísalo antes de agregarlo.');
        const id=uuid();
        sql('INSERT INTO students(id,course_id,institutional_user,normalized_user,original_first_name,original_last_name,first_name,last_name,normalized_name) VALUES (?,?,?,?,?,?,?,?,?)').run(id,courseId,row.institutionalUser,userKey(row),row.firstName,row.lastName,row.firstName,row.lastName,rosterKey(row));
        return student(id);
      });
    },
    updateStudent(courseId, id, values) {
      return tx(() => {
        const current=student(id);
        if(!current||current.courseId!==courseId)return null;
        if(values.topicId){
          const next=topic(values.topicId);
          if(!next||next.courseId!==courseId)throw new InputError('El tema no pertenece a esta materia.');
          if(current.topicId!==next.id&&members(next.id)>=next.capacity)throw new InputError('El equipo ya alcanzó su cupo.');
        }
        sql('UPDATE students SET first_name=?,last_name=?,normalized_name=?,topic_id=? WHERE id=?').run(values.firstName,values.lastName,rosterKey(values),values.topicId||null,id);
        return student(id);
      });
    },
  };
}
