// src/app.d.ts - TypeScript definitions
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient;
			safeGetSession: () => Promise<{ session: Session | null; user: User | null }>;
			session: Session | null;
			user: User | null;
			cookies: {
				getAll: () => Array<{ name: string; value: string; options?: Record<string, any> }>;
			};
		}
		interface PageData {
			session: Session | null;
		}
	}
	interface Window {
		draftSyncDebug?: {
			setBackendUrl(url: string): void;
		};
		draftSyncState?: {
			mockMode: boolean;
			mockLeagueId: string;
		};
	}
}

export {};
