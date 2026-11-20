import path from 'node:path';
export const DATA_DIR = path.resolve(process.env.TRAINING_DATA_DIR || 'data');
export const RAW_DIR = path.join(DATA_DIR, 'raw');
