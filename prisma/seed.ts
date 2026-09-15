import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcryptjs';
import { addDays, tzToday, ymd, zonedDateTime } from '../src/lib/time';
import { assertLocalSqlite } from './local-sqlite';

const prisma = new PrismaClient();
const TZ = 'America/Los_Angeles';

async function main() {
  assertLocalSqlite();
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seeding is disabled in production.');
  const email = (process.env.HARBOR_DEMO_EMAIL || 'alex@harbor.app').toLowerCase();
  const password = process.env.HARBOR_DEMO_PASSWORD || 'harbor-demo';
  const today = tzToday(TZ);
  const t0 = ymd(today);
  const t1 = ymd(addDays(today, 1));
  const t2 = ymd(addDays(today, 2));
  const t3 = ymd(addDays(today, 3));
  const yesterday = ymd(addDays(today, -1));

  await prisma.notificationAttempt.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.voiceTranscript.deleteMany();
  await prisma.assistantAction.deleteMany();
  await prisma.voiceSession.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.userMemory.deleteMany();
  await prisma.taskWorkSession.deleteMany();
  await prisma.taskTag.deleteMany();
  await prisma.subtask.deleteMany();
  await prisma.recurrenceRule.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.task.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.calendarConnection.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.category.deleteMany();
  await prisma.project.deleteMany();
  await prisma.taskList.deleteMany();
  await prisma.userPreference.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: {
      email,
      name: 'Rohit Kumar',
      passwordHash: await bcrypt.hash(password, 10),
      emailVerifiedAt: new Date(),
      timeZone: TZ,
      preference: {
        create: {
          confirmationLevel: 'CHANGES_AND_DELETES',
          smsEnabled: true,
          defaultReminderMinutes: 30,
        },
      },
    },
  });

  const inbox = await prisma.taskList.create({ data: { userId: user.id, name: 'Inbox', kind: 'INBOX' } });
  const work = await prisma.project.create({ data: { userId: user.id, name: 'Q3 Planning', color: '#5b6abf' } });
  const personal = await prisma.category.create({ data: { userId: user.id, name: 'Personal', kind: 'personal' } });
  const job = await prisma.category.create({ data: { userId: user.id, name: 'Work', kind: 'work' } });

  const connection = await prisma.calendarConnection.create({
    data: {
      userId: user.id,
      provider: 'google',
      accountEmail: email,
      calendarId: 'primary',
      calendarName: 'Rohit — Work',
      visible: true,
      writeEnabled: true,
      lastSyncedAt: new Date(),
      status: 'connected',
    },
  });

  await prisma.userPreference.update({
    where: { userId: user.id },
    data: { defaultCalendarId: connection.id },
  });

  const designReview = zonedDateTime(t0, '10:00', TZ);
  const reportDue = zonedDateTime(t0, '15:00', TZ);
  const dentist = zonedDateTime(t1, '09:00', TZ);
  const doctor = zonedDateTime(t2, '14:00', TZ);
  const lease = zonedDateTime('2026-11-28', '09:00', TZ);

  await prisma.calendarEvent.createMany({
    data: [
      {
        userId: user.id,
        connectionId: connection.id,
        title: 'Design review',
        notes: 'Share the Harbor voice flow.',
        startAt: designReview,
        endAt: new Date(designReview.getTime() + 60 * 60000),
        source: 'google',
        externalId: 'gcal-design-review',
        syncKey: `${connection.id}:gcal-design-review`,
        timeZone: TZ,
      },
      {
        userId: user.id,
        connectionId: connection.id,
        title: 'Doctor appointment',
        startAt: doctor,
        endAt: new Date(doctor.getTime() + 45 * 60000),
        source: 'harbor',
        timeZone: TZ,
      },
    ],
  });

  const report = await prisma.task.create({
    data: {
      userId: user.id,
      listId: inbox.id,
      projectId: work.id,
      categoryId: job.id,
      title: 'Submit the quarterly report',
      notes: 'Attach the revised numbers from finance.',
      status: 'IN_PROGRESS',
      priority: 'CRITICAL',
      startAt: zonedDateTime(t0, '13:00', TZ),
      dueAt: reportDue,
      durationMin: 90,
      critical: true,
      kind: 'TASK',
    },
  });

  const overdue = await prisma.task.create({
    data: {
      userId: user.id,
      listId: inbox.id,
      categoryId: personal.id,
      title: 'Pay the plumbing invoice',
      notes: 'Waiting on the final amount yesterday.',
      status: 'PLANNED',
      priority: 'HIGH',
      dueAt: zonedDateTime(yesterday, '17:00', TZ),
      durationMin: 20,
    },
  });

  const callRobert = await prisma.task.create({
    data: {
      userId: user.id,
      title: 'Call Robert',
      status: 'WAITING',
      priority: 'NORMAL',
      waitingOn: 'Robert',
      dueAt: zonedDateTime(t1, '10:00', TZ),
      startAt: zonedDateTime(t1, '10:00', TZ),
    },
  });

  await prisma.task.createMany({
    data: [
      {
        userId: user.id,
        title: 'Return lease vehicle',
        notes: 'Schedule inspection three weeks before.',
        status: 'PLANNED',
        priority: 'HIGH',
        dueAt: lease,
        durationMin: 120,
        categoryId: personal.id,
      },
      {
        userId: user.id,
        title: 'Review the proposal',
        status: 'INBOX',
        priority: 'NORMAL',
        durationMin: 45,
        dueAt: zonedDateTime(t1, '11:00', TZ),
      },
      {
        userId: user.id,
        title: 'Dentist reminder',
        status: 'PLANNED',
        priority: 'HIGH',
        kind: 'APPOINTMENT',
        startAt: dentist,
        dueAt: dentist,
        durationMin: 45,
      },
      {
        userId: user.id,
        title: 'Prep Friday status notes',
        status: 'PLANNED',
        priority: 'LOW',
        dueAt: zonedDateTime(t3, '16:00', TZ),
        durationMin: 30,
      },
    ],
  });

  await prisma.subtask.createMany({
    data: [
      { taskId: report.id, title: 'Export finance CSV', sortOrder: 0 },
      { taskId: report.id, title: 'Write executive summary', sortOrder: 1 },
    ],
  });

  const soon = new Date(Date.now() + 5 * 60 * 1000);
  const past = new Date(Date.now() - 20 * 60 * 1000);
  const reminder = await prisma.reminder.create({
    data: {
      userId: user.id,
      taskId: report.id,
      fireAt: soon,
      offsetLabel: '30 minutes before',
      critical: true,
      status: 'SCHEDULED',
      idempotencyKey: `${report.id}:30 minutes before`,
    },
  });
  const overdueReminder = await prisma.reminder.create({
    data: {
      userId: user.id,
      taskId: overdue.id,
      fireAt: past,
      offsetLabel: 'at due time',
      critical: true,
      status: 'QUEUED',
      idempotencyKey: `${overdue.id}:at due time`,
    },
  });
  await prisma.notificationAttempt.createMany({
    data: [
      {
        reminderId: overdueReminder.id,
        channel: 'push',
        status: 'SENT',
        sentAt: new Date(past.getTime() + 1000),
        providerId: 'mock-push-1',
      },
      {
        reminderId: overdueReminder.id,
        channel: 'email',
        status: 'SENT',
        sentAt: new Date(past.getTime() + 16 * 60 * 1000),
        providerId: 'mock-email-1',
      },
    ],
  });

  await prisma.activityLog.createMany({
    data: [
      { userId: user.id, taskId: report.id, kind: 'created', summary: 'Created quarterly report task' },
      { userId: user.id, taskId: callRobert.id, kind: 'waiting', summary: 'Waiting on Robert' },
      { userId: user.id, taskId: reminder.taskId, kind: 'reminder', summary: 'Scheduled report reminder' },
    ],
  });

  console.log('Seeded the local demo account. Credentials are not logged.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
