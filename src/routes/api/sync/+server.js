import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { runSync, lastSync } from '$lib/server/sync.js';

export const GET = () => json(lastSync());
export const POST = async () => json(await runSync(env));
