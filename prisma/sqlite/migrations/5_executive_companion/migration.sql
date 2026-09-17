-- Existing tasks remain unsplittable until the user explicitly opts in.
ALTER TABLE "Task" ADD COLUMN "splittable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "minFocusMin" INTEGER NOT NULL DEFAULT 15;
