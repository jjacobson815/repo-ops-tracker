'use strict';

const fs = require('fs/promises');
const path = require('path');
const db = require('../lib/db');

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');
const WORKFLOW_FILE = path.join(DATA_DIR, 'workflow.json');
const LANES_FILE = path.join(DATA_DIR, 'lanes.json');
const BOARDS_FILE = path.join(DATA_DIR, 'boards.json');

async function readJson(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

async function run() {
  console.log('Starting migration from JSON files to SQLite...');

  const boards = await readJson(BOARDS_FILE);
  const workflows = await readJson(WORKFLOW_FILE);
  const lanes = await readJson(LANES_FILE);
  const tasks = await readJson(TASKS_FILE);
  const library = await readJson(LIBRARY_FILE);

  if (boards.length > 0) {
    await db.saveAllBoards(boards);
    console.log(`Migrated ${boards.length} boards.`);
  }
  if (workflows.length > 0) {
    await db.saveAllWorkflows(workflows);
    console.log(`Migrated ${workflows.length} workflow states.`);
  }
  if (lanes.length > 0) {
    await db.saveAllLanes(lanes);
    console.log(`Migrated ${lanes.length} lanes.`);
  }
  if (tasks.length > 0) {
    await db.saveAllTasks(tasks);
    console.log(`Migrated ${tasks.length} tasks.`);
  }
  if (library.length > 0) {
    await db.saveAllLibraryEntries(library);
    console.log(`Migrated ${library.length} library entries.`);
  }

  console.log('Migration completed successfully!');
  await db.prisma.$disconnect();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
