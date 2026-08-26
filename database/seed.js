/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SMART EDU — Demo data seeder
 *
 *  Generates a complete, realistic institution so that every dashboard is
 *  populated the moment you first sign in (§52, §53). Nothing here is mock
 *  data served to the UI — it is written to PostgreSQL and read back through
 *  the same APIs the application always uses.
 *
 *    npm run db:seed
 *
 *  Safe to re-run: it clears the demo content first (but never the schema).
 * ═══════════════════════════════════════════════════════════════════════════
 */
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { withTransaction, closePool } from '../server/src/db/pool.js';
import { config } from '../server/src/config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEMO_PASSWORD = config.seed.demoPassword;
const ACADEMIC_YEAR = '2025-26';

// A fixed seed makes every run produce the same institution, so screenshots,
// demos and bug reports all describe the same data.
let randomState = 20250824;
function random() {
  randomState = (randomState * 1_103_515_245 + 12_345) & 0x7fffffff;
  return randomState / 0x7fffffff;
}
const randomInt = (min, max) => Math.floor(random() * (max - min + 1)) + min;
const pick = (list) => list[Math.floor(random() * list.length)];
const chance = (probability) => random() < probability;

const log = (message) => console.log(message);

// ───────────────────────────── SOURCE DATA ────────────────────────────────

const DEPARTMENTS = [
  { name: 'Computer Science & Engineering', code: 'CSE' },
  { name: 'Electronics & Communication', code: 'ECE' },
  { name: 'Mechanical Engineering', code: 'ME' },
  { name: 'Applied Sciences & Humanities', code: 'ASH' },
];

const SUBJECTS = [
  { name: 'Data Structures & Algorithms', code: 'CS201', credits: 4, dept: 'CSE' },
  { name: 'Database Management Systems', code: 'CS202', credits: 4, dept: 'CSE' },
  { name: 'Operating Systems', code: 'CS203', credits: 4, dept: 'CSE' },
  { name: 'Computer Networks', code: 'CS204', credits: 3, dept: 'CSE' },
  { name: 'Digital Electronics', code: 'EC201', credits: 4, dept: 'ECE' },
  { name: 'Signals & Systems', code: 'EC202', credits: 3, dept: 'ECE' },
  { name: 'Thermodynamics', code: 'ME201', credits: 4, dept: 'ME' },
  { name: 'Engineering Mathematics III', code: 'MA201', credits: 4, dept: 'ASH' },
  { name: 'Technical Communication', code: 'HS201', credits: 2, dept: 'ASH' },
  { name: 'Environmental Studies', code: 'HS202', credits: 2, dept: 'ASH' },
];

const TEACHERS = [
  { name: 'Dr. Priya Raghavan', email: 'teacher@smartedu.demo', dept: 'CSE', designation: 'Professor', qualification: 'PhD, Computer Science' },
  { name: 'Dr. Arun Mehta', email: 'arun.mehta@smartedu.demo', dept: 'CSE', designation: 'Associate Professor', qualification: 'PhD, Distributed Systems' },
  { name: 'Ms. Kavitha Nair', email: 'kavitha.nair@smartedu.demo', dept: 'ECE', designation: 'Assistant Professor', qualification: 'MTech, VLSI Design' },
  { name: 'Mr. Rohit Desai', email: 'rohit.desai@smartedu.demo', dept: 'ME', designation: 'Assistant Professor', qualification: 'MTech, Thermal Engineering' },
  { name: 'Dr. Sunita Iyer', email: 'sunita.iyer@smartedu.demo', dept: 'ASH', designation: 'Professor', qualification: 'PhD, Applied Mathematics' },
];

const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Ananya', 'Diya', 'Ishaan', 'Kabir', 'Meera', 'Nikhil', 'Priya',
  'Rahul', 'Riya', 'Rohan', 'Saanvi', 'Sameer', 'Tanvi', 'Varun', 'Zara', 'Aditi', 'Arjun',
  'Kiara', 'Manav', 'Neha', 'Pooja', 'Siddharth', 'Sneha', 'Vikram', 'Anjali', 'Dev', 'Isha',
];

const LAST_NAMES = [
  'Sharma', 'Verma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Gupta', 'Singh', 'Kumar', 'Joshi',
  'Menon', 'Kulkarni', 'Bose', 'Chopra', 'Rao',
];

const PARENT_OCCUPATIONS = [
  'Software Engineer', 'Doctor', 'Business Owner', 'Bank Manager', 'Teacher',
  'Civil Engineer', 'Accountant', 'Architect', 'Pharmacist', 'Consultant',
];

// ────────────────────────────── HELPERS ───────────────────────────────────

/** Weekdays only, going back `days` from today. */
function recentSchoolDays(days) {
  const dates = [];
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);

  let remaining = days;
  while (remaining > 0) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(new Date(cursor));
      remaining -= 1;
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return dates.reverse();
}

const iso = (date) => date.toISOString().slice(0, 10);

/**
 * Give each student a stable "profile" so their attendance, marks and
 * submissions tell a consistent story rather than looking like noise. A
 * dashboard is only convincing if the struggling student is struggling
 * everywhere.
 *
 * Index 0 is the documented demo login (student@smartedu.demo), so it gets a
 * deliberately *representative* profile — good but not flawless, with one
 * weaker subject and a little outstanding work. A demo account showing a CGPA
 * of 0 reads as a broken app even when the number is correct.
 */
const ARCHETYPES = {
  demo: { label: 'demo', attendance: 0.88, ability: 0.74, diligence: 0.85, trend: 0.03 },
  top: { label: 'top', attendance: 0.96, ability: 0.88, diligence: 0.95, trend: 0.02 },
  strong: { label: 'strong', attendance: 0.91, ability: 0.76, diligence: 0.85, trend: 0.02 },
  average: { label: 'average', attendance: 0.84, ability: 0.63, diligence: 0.72, trend: 0.0 },
  improving: { label: 'improving', attendance: 0.85, ability: 0.55, diligence: 0.75, trend: 0.09 },
  struggling: { label: 'struggling', attendance: 0.72, ability: 0.46, diligence: 0.55, trend: -0.05 },
  atRisk: { label: 'at-risk', attendance: 0.58, ability: 0.38, diligence: 0.35, trend: -0.07 },
};

function studentArchetype(index) {
  if (index === 0) return ARCHETYPES.demo;

  // A realistic spread across the rest of the cohort: a handful genuinely at
  // risk, a handful excelling, most in the middle.
  if (index % 10 === 3) return ARCHETYPES.atRisk;
  if (index % 10 === 7) return ARCHETYPES.struggling;
  if (index % 7 === 0) return ARCHETYPES.improving;
  if (index % 5 === 0) return ARCHETYPES.top;
  if (index % 3 === 0) return ARCHETYPES.strong;
  return ARCHETYPES.average;
}

/** Normally-distributed score around a mean, clamped to [0, 1]. */
function scoreAround(mean, spread = 0.12) {
  const noise = (random() + random() + random() - 1.5) * spread;
  return Math.max(0.05, Math.min(1, mean + noise));
}

// ─────────────────────────────── SEEDING ──────────────────────────────────

async function clearDemoData(client) {
  /*
   * DELETE rather than TRUNCATE ... CASCADE.
   *
   * TRUNCATE CASCADE also truncates every table holding a foreign key to the
   * target — which silently wipes `settings`, since `settings.updated_by`
   * references `users`. DELETE respects the per-column rules instead
   * (ON DELETE CASCADE for profiles and academic rows, ON DELETE SET NULL for
   * `settings.updated_by`), so the reference data from seed.sql survives.
   *
   * Order matters: users first, so the SET NULL references clear before the
   * rows they point at are removed.
   *
   * This list must cover every demo table that *survives* deleting a user —
   * anything whose user reference is ON DELETE SET NULL rather than CASCADE.
   * `complaints` is the easy one to miss: an anonymous complaint has no
   * student_id at all, and a named one is nulled rather than removed, so the
   * rows (and their unique tracking codes) outlive the accounts.
   */
  const order = [
    'users',
    'complaints',
    'notices',
    'documents',
    'generated_content',
    'audit_logs',
    'exams',
    'fee_structures',
    'class_subjects',
    'classes',
    'subjects',
    'departments',
  ];

  for (const table of order) {
    await client.query(`DELETE FROM ${table}`);
  }
}

async function seed() {
  const started = Date.now();

  log('\n🌱 Seeding Smart Edu demo data…\n');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, config.auth.bcryptRounds);

  await withTransaction(async (client) => {
    log('  Clearing previous demo content…');
    await clearDemoData(client);

    /*
     * Re-apply the reference data (permissions, role defaults, settings).
     * seed.sql runs once as a migration, so a database whose reference rows
     * were disturbed would otherwise never get them back — and the demo data
     * below depends on them. Every statement in that file is idempotent, which
     * is exactly why it is safe to run again here.
     */
    const referenceData = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    await client.query(referenceData);
    log('  ✔ reference data (permissions, role defaults, settings)');

    // ── Departments ────────────────────────────────────────────────────
    const departments = {};
    for (const dept of DEPARTMENTS) {
      const { rows } = await client.query(
        'INSERT INTO departments (name, code) VALUES ($1, $2) RETURNING id',
        [dept.name, dept.code]
      );
      departments[dept.code] = rows[0].id;
    }
    log(`  ✔ ${DEPARTMENTS.length} departments`);

    // ── Subjects ───────────────────────────────────────────────────────
    const subjects = [];
    for (const subject of SUBJECTS) {
      const { rows } = await client.query(
        `INSERT INTO subjects (name, code, credits, department_id, description)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, name, code, credits`,
        [
          subject.name,
          subject.code,
          subject.credits,
          departments[subject.dept],
          `Core ${subject.dept} subject covering the ${subject.name.toLowerCase()} syllabus.`,
        ]
      );
      subjects.push({ ...rows[0], dept: subject.dept });
    }
    log(`  ✔ ${subjects.length} subjects`);

    // ── Admin ──────────────────────────────────────────────────────────
    const { rows: adminRows } = await client.query(
      `INSERT INTO users (name, email, password_hash, role, phone)
       VALUES ($1, $2, $3, 'admin', $4) RETURNING id`,
      ['Rajesh Krishnan', 'admin@smartedu.demo', passwordHash, '+91 98400 11111']
    );
    const adminId = adminRows[0].id;
    await client.query('INSERT INTO user_preferences (user_id) VALUES ($1)', [adminId]);
    await client.query(
      "INSERT INTO admin_profiles (user_id, employee_id, designation) VALUES ($1, 'ADM001', 'Principal')",
      [adminId]
    );
    log('  ✔ 1 administrator');

    // ── Teachers ───────────────────────────────────────────────────────
    const teachers = [];
    for (const [index, teacher] of TEACHERS.entries()) {
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash, role, phone)
         VALUES ($1, $2, $3, 'teacher', $4) RETURNING id, name`,
        [teacher.name, teacher.email, passwordHash, `+91 98400 2${String(index).padStart(4, '0')}`]
      );
      const teacherId = rows[0].id;

      await client.query('INSERT INTO user_preferences (user_id) VALUES ($1)', [teacherId]);
      await client.query(
        `INSERT INTO teacher_profiles (user_id, employee_id, department_id, designation, qualification, joined_on)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          teacherId,
          `TCH${String(index + 1).padStart(3, '0')}`,
          departments[teacher.dept],
          teacher.designation,
          teacher.qualification,
          `20${18 + index}-07-01`,
        ]
      );

      teachers.push({ id: teacherId, name: rows[0].name, dept: teacher.dept });
    }
    log(`  ✔ ${teachers.length} teachers`);

    // ── Classes ────────────────────────────────────────────────────────
    const classDefinitions = [
      { name: 'CSE Semester 3', section: 'A', dept: 'CSE', teacher: 0, room: 'B-201' },
      { name: 'CSE Semester 3', section: 'B', dept: 'CSE', teacher: 1, room: 'B-202' },
      { name: 'ECE Semester 3', section: 'A', dept: 'ECE', teacher: 2, room: 'C-101' },
    ];

    const classes = [];
    for (const definition of classDefinitions) {
      const { rows } = await client.query(
        `INSERT INTO classes (name, section, academic_year, department_id, class_teacher_id, room)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, section`,
        [
          definition.name,
          definition.section,
          ACADEMIC_YEAR,
          departments[definition.dept],
          teachers[definition.teacher].id,
          definition.room,
        ]
      );
      classes.push({ ...rows[0], dept: definition.dept });
    }
    log(`  ✔ ${classes.length} classes`);

    // ── Teaching assignments ───────────────────────────────────────────
    // Each class studies six subjects: its department's own plus the shared
    // Applied Sciences ones, so every class has a full, believable timetable.
    const classSubjects = new Map();

    for (const classRow of classes) {
      const own = subjects.filter((subject) => subject.dept === classRow.dept);
      const shared = subjects.filter((subject) => subject.dept === 'ASH');
      const assigned = [...own, ...shared].slice(0, 6);

      classSubjects.set(classRow.id, assigned);

      for (const subject of assigned) {
        const teacher =
          teachers.find((candidate) => candidate.dept === subject.dept) ?? pick(teachers);

        await client.query(
          `INSERT INTO class_subjects (class_id, subject_id, academic_year)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [classRow.id, subject.id, ACADEMIC_YEAR]
        );
        await client.query(
          `INSERT INTO teacher_subjects (teacher_id, subject_id, class_id, academic_year)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [teacher.id, subject.id, classRow.id, ACADEMIC_YEAR]
        );
      }
    }
    log('  ✔ teaching assignments linked');

    // ── Students ───────────────────────────────────────────────────────
    const students = [];
    for (let index = 0; index < 30; index += 1) {
      const classRow = classes[index % classes.length];
      const first = FIRST_NAMES[index % FIRST_NAMES.length];
      const last = LAST_NAMES[index % LAST_NAMES.length];
      const name = `${first} ${last}`;

      // The first student gets the documented demo login.
      const email =
        index === 0 ? 'student@smartedu.demo' : `${first.toLowerCase()}.${last.toLowerCase()}${index}@smartedu.demo`;

      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash, role, phone)
         VALUES ($1, $2, $3, 'student', $4) RETURNING id, name`,
        [name, email, passwordHash, `+91 90000 ${String(10000 + index).slice(-5)}`]
      );
      const studentId = rows[0].id;

      await client.query('INSERT INTO user_preferences (user_id) VALUES ($1)', [studentId]);

      const rollNumber = `${classRow.section}${String(Math.floor(index / classes.length) + 1).padStart(2, '0')}`;

      await client.query(
        `INSERT INTO student_profiles
           (user_id, student_id, class_id, roll_number, date_of_birth, gender, address, admission_year, parent_permission_enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          studentId,
          `STU${String(index + 1).padStart(3, '0')}`,
          classRow.id,
          rollNumber,
          `200${4 + (index % 3)}-0${(index % 9) + 1}-${String((index % 27) + 1).padStart(2, '0')}`,
          index % 2 === 0 ? 'Male' : 'Female',
          `${randomInt(1, 99)} ${pick(['MG Road', 'Anna Nagar', 'Jubilee Hills', 'Koramangala', 'Salt Lake'])}, ${pick(['Chennai', 'Bengaluru', 'Hyderabad', 'Pune'])}`,
          2024,
          // Two students demonstrate the privacy controls actually biting.
          !(index === 3 || index === 17),
        ]
      );

      await client.query(
        `INSERT INTO enrollments (student_id, class_id, academic_year) VALUES ($1, $2, $3)`,
        [studentId, classRow.id, ACADEMIC_YEAR]
      );

      students.push({
        id: studentId,
        name: rows[0].name,
        classId: classRow.id,
        rollNumber,
        archetype: studentArchetype(index),
        index,
      });
    }
    log(`  ✔ ${students.length} students`);

    // ── Parents ────────────────────────────────────────────────────────
    const parents = [];
    for (let index = 0; index < 10; index += 1) {
      const child = students[index * 3];
      const last = child.name.split(' ')[1];
      const parentName = `${pick(['Suresh', 'Lakshmi', 'Ramesh', 'Geetha', 'Mahesh', 'Radha'])} ${last}`;

      const email = index === 0 ? 'parent@smartedu.demo' : `parent${index + 1}@smartedu.demo`;

      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash, role, phone)
         VALUES ($1, $2, $3, 'parent', $4) RETURNING id, name`,
        [parentName, email, passwordHash, `+91 99000 ${String(20000 + index).slice(-5)}`]
      );
      const parentId = rows[0].id;

      await client.query('INSERT INTO user_preferences (user_id) VALUES ($1)', [parentId]);
      await client.query(
        'INSERT INTO parent_profiles (user_id, occupation, phone) VALUES ($1, $2, $3)',
        [parentId, PARENT_OCCUPATIONS[index], `+91 99000 ${String(20000 + index).slice(-5)}`]
      );

      // The first parent gets two children so the child-selector is exercised.
      const children = index === 0 ? [students[0], students[1]] : [child];

      for (const [childIndex, linkedChild] of children.entries()) {
        // Student 1 withholds marks and CGPA from their parent — the parent
        // dashboard must handle a partially-restricted view convincingly.
        const restricted = linkedChild.index === 1;

        await client.query(
          `INSERT INTO parent_student
             (parent_id, student_id, relationship, is_primary,
              can_view_attendance, can_view_marks, can_view_assignments,
              can_view_cgpa, can_view_reports, can_view_fees)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            parentId,
            linkedChild.id,
            index % 2 === 0 ? 'father' : 'mother',
            childIndex === 0,
            true,
            !restricted,
            true,
            !restricted,
            true,
            true,
          ]
        );
      }

      parents.push({ id: parentId, name: rows[0].name });
    }
    log(`  ✔ ${parents.length} parents linked to students`);

    // ── Timetable ──────────────────────────────────────────────────────
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const periods = [
      ['09:00', '10:00'], ['10:00', '11:00'], ['11:15', '12:15'],
      ['13:00', '14:00'], ['14:00', '15:00'],
    ];

    let timetableCount = 0;
    for (const classRow of classes) {
      const assigned = classSubjects.get(classRow.id);

      for (const [dayIndex, day] of days.entries()) {
        for (const [periodIndex, [start, end]] of periods.entries()) {
          // Rotate the subject order per day so the week is not identical.
          const subject = assigned[(dayIndex + periodIndex) % assigned.length];

          const { rows: teacherRows } = await client.query(
            'SELECT teacher_id FROM teacher_subjects WHERE class_id = $1 AND subject_id = $2 LIMIT 1',
            [classRow.id, subject.id]
          );
          if (!teacherRows[0]) continue;

          // Skip a slot if that teacher is already booked elsewhere — the
          // seeded timetable must be conflict-free, since the app detects them.
          const { rows: clash } = await client.query(
            `SELECT 1 FROM timetable
              WHERE teacher_id = $1 AND day = $2 AND academic_year = $3
                AND start_time < $5::time AND $4::time < end_time
              LIMIT 1`,
            [teacherRows[0].teacher_id, day, ACADEMIC_YEAR, start, end]
          );
          if (clash.length) continue;

          await client.query(
            `INSERT INTO timetable (class_id, subject_id, teacher_id, day, start_time, end_time, room, academic_year)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [classRow.id, subject.id, teacherRows[0].teacher_id, day, start, end, `R-${randomInt(101, 305)}`, ACADEMIC_YEAR]
          );
          timetableCount += 1;
        }
      }
    }
    log(`  ✔ ${timetableCount} timetable periods (conflict-free)`);

    // ── Attendance ─────────────────────────────────────────────────────
    const schoolDays = recentSchoolDays(45);
    let attendanceCount = 0;

    for (const classRow of classes) {
      const assigned = classSubjects.get(classRow.id);
      const classStudents = students.filter((student) => student.classId === classRow.id);

      for (const date of schoolDays) {
        // Three subjects taught per day keeps the volume realistic.
        const daySubjects = assigned.slice(date.getDay() % 2, (date.getDay() % 2) + 3);

        for (const subject of daySubjects) {
          const { rows: teacherRows } = await client.query(
            'SELECT teacher_id FROM teacher_subjects WHERE class_id = $1 AND subject_id = $2 LIMIT 1',
            [classRow.id, subject.id]
          );
          if (!teacherRows[0]) continue;

          const studentIds = [];
          const statuses = [];

          for (const student of classStudents) {
            const roll = random();
            const { attendance } = student.archetype;

            let status = 'present';
            if (roll > attendance + 0.06) status = 'absent';
            else if (roll > attendance) status = 'late';

            studentIds.push(student.id);
            statuses.push(status);
          }

          await client.query(
            `INSERT INTO attendance (student_id, subject_id, class_id, teacher_id, date, status)
             SELECT s.student_id, $3::uuid, $4::uuid, $5::uuid, $6::date, s.status::attendance_status
               FROM unnest($1::uuid[], $2::text[]) AS s(student_id, status)
             ON CONFLICT DO NOTHING`,
            [studentIds, statuses, subject.id, classRow.id, teacherRows[0].teacher_id, iso(date)]
          );
          attendanceCount += studentIds.length;
        }
      }
    }
    log(`  ✔ ${attendanceCount.toLocaleString()} attendance records across ${schoolDays.length} school days`);

    // ── Assessments & marks ────────────────────────────────────────────
    const assessmentPlan = [
      { name: 'Unit Test 1', type: 'internal', maxMarks: 25, weeksAgo: 8 },
      { name: 'Quiz 1', type: 'quiz', maxMarks: 10, weeksAgo: 6 },
      { name: 'Mid-term Examination', type: 'midterm', maxMarks: 50, weeksAgo: 4 },
      { name: 'Unit Test 2', type: 'internal', maxMarks: 25, weeksAgo: 2 },
    ];

    let assessmentCount = 0;
    let marksCount = 0;

    for (const classRow of classes) {
      const assigned = classSubjects.get(classRow.id);
      const classStudents = students.filter((student) => student.classId === classRow.id);

      for (const subject of assigned) {
        const { rows: teacherRows } = await client.query(
          'SELECT teacher_id FROM teacher_subjects WHERE class_id = $1 AND subject_id = $2 LIMIT 1',
          [classRow.id, subject.id]
        );
        if (!teacherRows[0]) continue;

        for (const [planIndex, plan] of assessmentPlan.entries()) {
          const date = new Date();
          date.setDate(date.getDate() - plan.weeksAgo * 7);

          // The most recent assessment stays unpublished in one subject per
          // class, so the "publish marks" flow has something to act on.
          const isPublished = !(planIndex === assessmentPlan.length - 1 && subject === assigned[0]);

          const { rows: assessmentRows } = await client.query(
            `INSERT INTO assessments
               (name, subject_id, class_id, teacher_id, type, max_marks, weightage, date, is_published, published_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [
              plan.name,
              subject.id,
              classRow.id,
              teacherRows[0].teacher_id,
              plan.type,
              plan.maxMarks,
              plan.type === 'midterm' ? 40 : 20,
              iso(date),
              isPublished,
              isPublished ? new Date() : null,
            ]
          );
          const assessmentId = assessmentRows[0].id;
          assessmentCount += 1;

          const studentIds = [];
          const values = [];
          const absentFlags = [];

          for (const student of classStudents) {
            const { ability, trend } = student.archetype;
            // Apply the trend across the sequence so declines are real and the
            // "performance dropped" detector has something to find. Clamped so
            // even a declining student stays in a believable band rather than
            // falling off a cliff by the fourth assessment.
            const drift = trend * planIndex;
            const target = Math.max(0.22, Math.min(0.98, ability + drift));
            const ratio = scoreAround(target, 0.1);
            const isAbsent = chance(0.02);

            studentIds.push(student.id);
            absentFlags.push(isAbsent);
            values.push(isAbsent ? null : Math.round(ratio * plan.maxMarks * 10) / 10);
          }

          await client.query(
            `INSERT INTO marks (assessment_id, student_id, marks_obtained, is_absent, graded_by)
             SELECT $1::uuid, s.student_id, s.marks, s.is_absent, $5::uuid
               FROM unnest($2::uuid[], $3::numeric[], $4::boolean[]) AS s(student_id, marks, is_absent)
             ON CONFLICT DO NOTHING`,
            [assessmentId, studentIds, values, absentFlags, teacherRows[0].teacher_id]
          );
          marksCount += studentIds.length;
        }
      }
    }
    log(`  ✔ ${assessmentCount} assessments with ${marksCount.toLocaleString()} marks`);

    // ── Assignments & submissions ──────────────────────────────────────
    const assignmentTitles = [
      'Implement and analyse a balanced binary search tree',
      'Normalise a given schema to BCNF with justification',
      'Compare process scheduling algorithms with worked examples',
      'Design a subnetting scheme for a campus network',
      'Analyse a combinational logic circuit',
      'Solve the assigned boundary value problems',
      'Write a technical report on a chosen engineering failure',
    ];

    let assignmentCount = 0;
    let submissionCount = 0;

    for (const classRow of classes) {
      const assigned = classSubjects.get(classRow.id);
      const classStudents = students.filter((student) => student.classId === classRow.id);

      for (const [subjectIndex, subject] of assigned.entries()) {
        const { rows: teacherRows } = await client.query(
          'SELECT teacher_id FROM teacher_subjects WHERE class_id = $1 AND subject_id = $2 LIMIT 1',
          [classRow.id, subject.id]
        );
        if (!teacherRows[0]) continue;

        // Two past assignments (with submissions) and one still open — so both
        // the "pending" and "graded" states appear on every student dashboard.
        for (const offset of [-21, -7, 6]) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + offset);
          dueDate.setHours(23, 59, 0, 0);

          const { rows: assignmentRows } = await client.query(
            `INSERT INTO assignments
               (title, description, instructions, subject_id, teacher_id, class_id, due_date, max_marks)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [
              assignmentTitles[(subjectIndex + Math.abs(offset)) % assignmentTitles.length],
              `Assignment for ${subject.name}. Submit your work as a single document.`,
              'Show all working. Late submissions are accepted but flagged for the teacher.',
              subject.id,
              teacherRows[0].teacher_id,
              classRow.id,
              dueDate.toISOString(),
              20,
            ]
          );
          const assignmentId = assignmentRows[0].id;
          assignmentCount += 1;

          if (offset >= 0) continue; // still open — no submissions yet

          for (const student of classStudents) {
            const { diligence, ability } = student.archetype;
            if (!chance(diligence)) continue; // this student did not submit

            const isLate = chance(0.15);
            const submittedAt = new Date(dueDate);
            submittedAt.setHours(submittedAt.getHours() + (isLate ? randomInt(2, 48) : -randomInt(2, 72)));

            // The older assignment has been graded; the recent one has not.
            const isGraded = offset === -21;
            const marks = isGraded ? Math.round(scoreAround(ability, 0.12) * 20 * 10) / 10 : null;

            await client.query(
              `INSERT INTO submissions
                 (assignment_id, student_id, content, submitted_at, status, marks, feedback, graded_by, graded_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT DO NOTHING`,
              [
                assignmentId,
                student.id,
                `Submission for ${subject.name} by ${student.name}.`,
                submittedAt.toISOString(),
                isGraded ? 'graded' : isLate ? 'late' : 'submitted',
                marks,
                isGraded
                  ? marks >= 15
                    ? 'Strong work — the reasoning is clear throughout.'
                    : 'The approach is on the right lines but the working needs more detail.'
                  : null,
                isGraded ? teacherRows[0].teacher_id : null,
                isGraded ? new Date().toISOString() : null,
              ]
            );
            submissionCount += 1;
          }
        }
      }
    }
    log(`  ✔ ${assignmentCount} assignments with ${submissionCount} submissions`);

    // ── Exams ──────────────────────────────────────────────────────────
    let examCount = 0;
    for (const classRow of classes) {
      const assigned = classSubjects.get(classRow.id);
      for (const [index, subject] of assigned.slice(0, 4).entries()) {
        const examDate = new Date();
        examDate.setDate(examDate.getDate() + 10 + index * 3);

        await client.query(
          `INSERT INTO exams (name, class_id, subject_id, exam_date, start_time, end_time, room, max_marks, syllabus)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            `End-Semester Examination — ${subject.name}`,
            classRow.id,
            subject.id,
            iso(examDate),
            '09:30',
            '12:30',
            `Hall-${randomInt(1, 6)}`,
            100,
            `Complete syllabus for ${subject.name}, units 1–5.`,
          ]
        );
        examCount += 1;
      }
    }
    log(`  ✔ ${examCount} scheduled exams`);

    // ── Notices ────────────────────────────────────────────────────────
    const notices = [
      {
        title: 'End-semester examination timetable published',
        content:
          'The end-semester examination schedule for all departments is now available. Examinations begin in ten days. ' +
          'Check your class timetable for subject-wise dates and hall allocation. Hall tickets will be issued one week prior.',
        priority: 'high',
        category: 'exam',
        pinned: true,
      },
      {
        title: 'Attendance requirement reminder',
        content:
          'Students must maintain at least 75% attendance in every subject to be eligible for the end-semester examination. ' +
          'Students currently below this threshold have been notified individually and should meet their class teacher this week.',
        priority: 'urgent',
        category: 'academic',
        pinned: true,
      },
      {
        title: 'Annual technical symposium — registrations open',
        content:
          'TechnoVision 2026 will be held next month across three days. Events include paper presentations, coding contests, ' +
          'robotics and project exhibitions. Register through the student portal before the end of this month.',
        priority: 'normal',
        category: 'event',
      },
      {
        title: 'Parent-teacher meeting scheduled',
        content:
          'The term parent-teacher meeting will be held on the last Saturday of this month from 9:00 AM to 1:00 PM. ' +
          'Parents may book a slot with individual teachers through the parent portal.',
        priority: 'high',
        category: 'general',
        targetRole: 'parent',
      },
      {
        title: 'Library extended hours during examinations',
        content:
          'The central library will remain open until 11:00 PM throughout the examination period. ' +
          'Reading room access requires a valid student identity card.',
        priority: 'normal',
        category: 'general',
      },
      {
        title: 'Marks entry deadline for internal assessments',
        content:
          'All faculty are requested to complete internal assessment marks entry and publish results before the end of this week. ' +
          'Please verify entries carefully before publishing — published marks are visible to students and parents immediately.',
        priority: 'high',
        category: 'academic',
        targetRole: 'teacher',
      },
    ];

    for (const notice of notices) {
      const expires = new Date();
      expires.setDate(expires.getDate() + 45);

      await client.query(
        `INSERT INTO notices (title, content, created_by, target_role, priority, category, is_pinned, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          notice.title,
          notice.content,
          adminId,
          notice.targetRole ?? null,
          notice.priority,
          notice.category,
          notice.pinned ?? false,
          expires.toISOString(),
        ]
      );
    }
    log(`  ✔ ${notices.length} notices`);

    // ── Fees ───────────────────────────────────────────────────────────
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 20);

    const { rows: feeRows } = await client.query(
      `INSERT INTO fee_structures (name, academic_year, amount, description, due_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        'Semester 3 Tuition Fee',
        ACADEMIC_YEAR,
        45000,
        'Tuition, laboratory and library charges for the current semester.',
        iso(dueDate),
      ]
    );

    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - 10);

    const { rows: examFeeRows } = await client.query(
      `INSERT INTO fee_structures (name, academic_year, amount, description, due_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['End-Semester Examination Fee', ACADEMIC_YEAR, 3500, 'Examination and evaluation charges.', iso(overdueDate)]
    );

    let feeRecords = 0;
    for (const student of students) {
      // A spread of paid / partial / pending / overdue so the fee UI shows
      // every state without anyone having to create test data by hand.
      const tuitionPaid = chance(0.55) ? 45000 : chance(0.5) ? 20000 : 0;
      const examPaid = chance(0.6) ? 3500 : 0;

      const tuitionStatus = tuitionPaid >= 45000 ? 'paid' : tuitionPaid > 0 ? 'partial' : 'pending';
      const examStatus = examPaid >= 3500 ? 'paid' : 'overdue';

      await client.query(
        `INSERT INTO fee_records (student_id, fee_structure_id, total_amount, paid_amount, status, due_date)
         VALUES ($1, $2, 45000, $3, $4::fee_status, $5)`,
        [student.id, feeRows[0].id, tuitionPaid, tuitionStatus, iso(dueDate)]
      );
      await client.query(
        `INSERT INTO fee_records (student_id, fee_structure_id, total_amount, paid_amount, status, due_date)
         VALUES ($1, $2, 3500, $3, $4::fee_status, $5)`,
        [student.id, examFeeRows[0].id, examPaid, examStatus, iso(overdueDate)]
      );
      feeRecords += 2;
    }
    log(`  ✔ ${feeRecords} fee records across 2 fee structures`);

    // ── PTM slots ──────────────────────────────────────────────────────
    let slotCount = 0;
    for (const teacher of teachers) {
      for (let dayOffset = 3; dayOffset <= 12; dayOffset += 3) {
        const slotDate = new Date();
        slotDate.setDate(slotDate.getDate() + dayOffset);
        if (slotDate.getDay() === 0) continue;

        for (const [start, end] of [['10:00', '10:20'], ['10:30', '10:50'], ['11:00', '11:20']]) {
          await client.query(
            `INSERT INTO ptm_slots (teacher_id, date, start_time, end_time, mode, location)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
            [teacher.id, iso(slotDate), start, end, chance(0.3) ? 'online' : 'in_person', 'Staff Room A']
          );
          slotCount += 1;
        }
      }
    }
    log(`  ✔ ${slotCount} parent-teacher meeting slots`);

    // ── Complaints ─────────────────────────────────────────────────────
    const complaints = [
      {
        category: 'infrastructure',
        subject: 'Projector in B-201 not working',
        description:
          'The projector in room B-201 has been flickering for the past two weeks and cuts out entirely during afternoon classes. ' +
          'It is making it difficult to follow slide-based lectures.',
        anonymous: false,
        status: 'under_review',
        studentIndex: 4,
      },
      {
        category: 'academic',
        subject: 'Request for additional tutorial sessions',
        description:
          'Several of us are struggling with the later units of Engineering Mathematics III. ' +
          'Would it be possible to arrange additional tutorial sessions before the end-semester examination?',
        anonymous: false,
        status: 'resolved',
        response:
          'Additional tutorial sessions have been scheduled for Tuesday and Thursday afternoons starting next week.',
        studentIndex: 7,
      },
      {
        category: 'bullying',
        subject: 'Concern about behaviour in the common room',
        description:
          'There has been persistent unpleasant behaviour towards a group of students in the common room during break. ' +
          'Reporting this anonymously as those involved are in my own class.',
        anonymous: true,
        status: 'under_review',
      },
    ];

    for (const [index, complaint] of complaints.entries()) {
      await client.query(
        `INSERT INTO complaints
           (student_id, is_anonymous, tracking_code, category, subject, description, status, priority, response, resolved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::complaint_status, $8::notice_priority, $9, $10)`,
        [
          complaint.anonymous ? null : students[complaint.studentIndex].id,
          complaint.anonymous,
          `SE-DEMO${String(index + 1).padStart(4, '0')}`,
          complaint.category,
          complaint.subject,
          complaint.description,
          complaint.status,
          complaint.category === 'bullying' ? 'urgent' : 'normal',
          complaint.response ?? null,
          complaint.status === 'resolved' ? new Date().toISOString() : null,
        ]
      );
    }
    log(`  ✔ ${complaints.length} complaints`);

    // ── Leave applications ─────────────────────────────────────────────
    for (const [index, student] of [students[2], students[9], students[15]].entries()) {
      const start = new Date();
      start.setDate(start.getDate() + (index === 0 ? 5 : -index * 7));
      const end = new Date(start);
      end.setDate(end.getDate() + 2);

      await client.query(
        `INSERT INTO leave_applications (student_id, start_date, end_date, reason, leave_type, status, reviewed_by, reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6::leave_status, $7, $8)`,
        [
          student.id,
          iso(start),
          iso(end),
          index === 0
            ? 'Attending a family wedding out of station. I will catch up on all missed material.'
            : 'Medical leave — viral fever, advised rest by the doctor. Medical certificate attached.',
          index === 0 ? 'family' : 'medical',
          index === 0 ? 'pending' : 'approved',
          index === 0 ? null : teachers[0].id,
          index === 0 ? null : new Date().toISOString(),
        ]
      );
    }
    log('  ✔ 3 leave applications');

    // ── Teacher remarks ────────────────────────────────────────────────
    for (const student of students.slice(0, 12)) {
      const positive = student.archetype.ability > 0.7;
      await client.query(
        `INSERT INTO teacher_remarks (student_id, teacher_id, remark, sentiment)
         VALUES ($1, $2, $3, $4)`,
        [
          student.id,
          teachers[0].id,
          positive
            ? 'Consistently well prepared and contributes thoughtfully in class discussions.'
            : 'Capable of much better work. Needs to attend regularly and ask for help sooner when stuck.',
          positive ? 'positive' : 'concern',
        ]
      );
    }
    log('  ✔ teacher remarks');

    // ── RAG documents ──────────────────────────────────────────────────
    const documents = [
      {
        title: 'Data Structures — Unit 3 study notes',
        subject: 'CS201',
        content:
          'A binary search tree stores keys so that every node is greater than all keys in its left subtree and less than ' +
          'all keys in its right subtree. Search, insertion and deletion each cost O(h) where h is the height of the tree. ' +
          'In the worst case an unbalanced tree degenerates to a linked list and h becomes O(n). Self-balancing variants ' +
          'such as AVL trees and red-black trees maintain h at O(log n) by performing rotations after modification. ' +
          'An AVL tree keeps the balance factor of every node within the range minus one to plus one, rebalancing eagerly. ' +
          'A red-black tree relaxes this, guaranteeing that no root-to-leaf path is more than twice as long as any other, ' +
          'which yields fewer rotations on insertion at the cost of slightly weaker balance.',
      },
      {
        title: 'DBMS — Normalisation reference',
        subject: 'CS202',
        content:
          'Normalisation removes redundancy from a relational schema. First normal form requires atomic attribute values. ' +
          'Second normal form additionally requires that every non-key attribute depends on the whole of a candidate key, ' +
          'eliminating partial dependencies. Third normal form removes transitive dependencies, so that non-key attributes ' +
          'depend on nothing but the key. Boyce-Codd normal form strengthens this: for every non-trivial functional ' +
          'dependency X to Y, X must be a superkey. Decomposition should be lossless and, where possible, dependency ' +
          'preserving; BCNF sometimes forces a choice between the two.',
      },
      {
        title: 'Operating Systems — Scheduling summary',
        subject: 'CS203',
        content:
          'First-come first-served scheduling is simple but suffers from the convoy effect, where short processes wait ' +
          'behind a long one. Shortest job first minimises average waiting time but requires knowing burst times in advance ' +
          'and can starve long processes. Round robin allocates a fixed time quantum to each process in turn, giving good ' +
          'response time for interactive workloads; the quantum size trades context-switch overhead against responsiveness. ' +
          'Priority scheduling can starve low-priority processes unless ageing gradually raises their priority.',
      },
    ];

    for (const doc of documents) {
      const subject = subjects.find((s) => s.code === doc.subject);
      const { rows: docRows } = await client.query(
        `INSERT INTO documents (title, description, source_type, subject_id, uploaded_by, visibility, is_indexed)
         VALUES ($1, $2, 'note', $3, $4, 'institution', TRUE) RETURNING id`,
        [doc.title, `Study material for ${subject?.name ?? doc.subject}`, subject?.id ?? null, teachers[0].id]
      );

      // Chunk on sentence groups so full-text retrieval has real passages.
      const sentences = doc.content.match(/[^.!?]+[.!?]+/g) ?? [doc.content];
      const chunks = [];
      for (let index = 0; index < sentences.length; index += 3) {
        chunks.push(sentences.slice(index, index + 3).join(' ').trim());
      }

      for (const [index, chunk] of chunks.entries()) {
        await client.query(
          `INSERT INTO document_chunks (document_id, chunk_index, content, token_count)
           VALUES ($1, $2, $3, $4)`,
          [docRows[0].id, index, chunk, Math.ceil(chunk.length / 4)]
        );
      }
    }
    log(`  ✔ ${documents.length} study documents indexed for retrieval`);

    // ── Notifications ──────────────────────────────────────────────────
    // Seeded so the notification bell is not empty on first login.
    let notificationCount = 0;

    for (const student of students) {
      const notifications = [
        {
          title: 'End-semester timetable published',
          message: 'The examination schedule is now available. Check your exams page for dates and halls.',
          type: 'exam',
          link: '/student/exams',
          read: false,
        },
        {
          title: 'Assignment due soon',
          message: 'You have an assignment due within the week. Check your assignments page.',
          type: 'assignment',
          link: '/student/assignments',
          read: false,
        },
        {
          title: 'Marks published',
          message: 'Results for your recent assessments have been published.',
          type: 'marks',
          link: '/student/marks',
          read: true,
        },
      ];

      if (student.archetype.attendance < 0.75) {
        notifications.unshift({
          title: 'Low attendance warning',
          message: 'Your attendance has fallen below the 75% requirement. Please meet your class teacher.',
          type: 'attendance',
          link: '/student/attendance',
          read: false,
        });
      }

      for (const notification of notifications) {
        await client.query(
          `INSERT INTO notifications (user_id, title, message, type, link, is_read)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [student.id, notification.title, notification.message, notification.type, notification.link, notification.read]
        );
        notificationCount += 1;
      }
    }

    for (const teacher of teachers) {
      await client.query(
        `INSERT INTO notifications (user_id, title, message, type, link, is_read)
         VALUES ($1, $2, $3, 'system', '/teacher/marks', FALSE)`,
        [
          teacher.id,
          'Marks entry deadline this week',
          'Please complete and publish internal assessment marks before the end of the week.',
        ]
      );
      notificationCount += 1;
    }

    for (const parent of parents) {
      await client.query(
        `INSERT INTO notifications (user_id, title, message, type, link, is_read)
         VALUES ($1, $2, $3, 'ptm', '/parent/ptm', FALSE)`,
        [
          parent.id,
          'Parent-teacher meeting slots open',
          'Booking is now open for this term’s parent-teacher meeting. Slots are limited.',
        ]
      );
      notificationCount += 1;
    }

    await client.query(
      `INSERT INTO notifications (user_id, title, message, type, link, is_read)
       VALUES ($1, $2, $3, 'complaint', '/admin/complaints', FALSE)`,
      [adminId, 'Complaints awaiting review', 'Two complaints are open and awaiting triage.']
    );
    notificationCount += 1;

    log(`  ✔ ${notificationCount} notifications`);
  });

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  log('\n' + '═'.repeat(62));
  log('  ✅ SEED COMPLETE');
  log('═'.repeat(62));
  log(`\n  Finished in ${elapsed}s. Demo accounts — password for all: ${DEMO_PASSWORD}\n`);
  log('    Administrator   admin@smartedu.demo');
  log('    Teacher         teacher@smartedu.demo');
  log('    Student         student@smartedu.demo');
  log('    Parent          parent@smartedu.demo   (linked to two children)');
  log('\n  These are development credentials only. Never deploy them.\n');
  log('  Start the app with:  npm run dev\n');
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  seed()
    .catch((error) => {
      console.error(`\n❌ Seeding failed: ${error.message}`);
      if (error.code === '42P01') {
        console.error('   The schema is missing. Run: npm run db:migrate\n');
      } else {
        console.error(error.stack);
      }
      process.exitCode = 1;
    })
    .finally(() => closePool().catch(() => {}));
}

export { seed };
export default seed;
