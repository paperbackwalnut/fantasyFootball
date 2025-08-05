import { SupabaseClient, Session, User } from '@supabase/supabase-js';
import type { Database } from './lib/database.types';

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient<Database>;
			safeGetSession(): Promise<{ session: Session | null; user: User | null }>;
		}
		interface PageData {
			session: Session | null;
			user: User | null;
			cookies: Record<string, string>;
			supabase?: SupabaseClient<Database>; // Optional since it's added in client layout
		}
	}
}

export {};
