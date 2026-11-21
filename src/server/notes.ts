import { z } from 'zod';
import { prisma } from './db';

/** A note needs some text: a title, a body, or both. */
export const noteInput = z.object({
  title: z.string().trim().max(200).default(''),
  body: z.string().max(20_000).default(''),
}).strict().refine((note) => note.title.length > 0 || note.body.trim().length > 0);

const fields = { id: true, title: true, body: true, createdAt: true, updatedAt: true } as const;

/** The account's notes, most recently changed first. */
export async function listNotes(userId: string) {
  return { notes: await prisma.note.findMany({ where: { userId, deletedAt: null }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: 500, select: fields }) };
}

/** Create a note (`id` null) or replace the text of one the account owns. */
export async function saveNote(userId: string, id: string | null, body: unknown) {
  const parsed = noteInput.safeParse(body);
  if (!parsed.success) throw new Error('INVALID_NOTE');
  if (!id) return prisma.note.create({ data: { userId, ...parsed.data }, select: fields });
  const changed = await prisma.note.updateMany({ where: { id, userId, deletedAt: null }, data: parsed.data });
  if (changed.count === 0) throw new Error('NOT_FOUND');
  return prisma.note.findUniqueOrThrow({ where: { id }, select: fields });
}

/** Deleting hides the note; the row is removed with the account. */
export async function deleteNote(userId: string, id: string) {
  const changed = await prisma.note.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (changed.count === 0) throw new Error('NOT_FOUND');
  return { ok: true };
}
