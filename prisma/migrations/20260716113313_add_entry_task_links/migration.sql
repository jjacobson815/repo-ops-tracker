-- CreateTable
CREATE TABLE "LibraryEntryTask" (
    "entryId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,

    PRIMARY KEY ("entryId", "taskId"),
    CONSTRAINT "LibraryEntryTask_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LibraryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LibraryEntryTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LibraryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'instruction',
    "lang" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL
);
INSERT INTO "new_LibraryEntry" ("body", "category", "createdAt", "id", "title", "updatedAt") SELECT "body", "category", "createdAt", "id", "title", "updatedAt" FROM "LibraryEntry";
DROP TABLE "LibraryEntry";
ALTER TABLE "new_LibraryEntry" RENAME TO "LibraryEntry";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
