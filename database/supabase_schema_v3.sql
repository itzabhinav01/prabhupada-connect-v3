-- ============================================================================
-- Prabhupāda Connect v3 — Complete Production Supabase / PostgreSQL Schema
-- ============================================================================
-- HOW TO CONNECT TO A NEW SUPABASE PROJECT:
--   1. Create a free project at https://supabase.com
--   2. In your Supabase dashboard, open "SQL Editor" -> "New Query", paste this
--      entire file, and click "Run".
--   3. (Optional, for instant sign-up without email verification):
--      Go to Authentication -> Providers -> Email and toggle OFF "Confirm email".
--   4. Go to Project Settings -> API, copy your "Project URL" and "anon public"
--      key, and paste them into Prabhupāda Connect -> Settings -> Cloud Sync
--      (or into `frontend/.env` as VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).
-- ============================================================================

-- 1. Schema version metadata
CREATE TABLE IF NOT EXISTS public.vb_schema_info (
    version INT PRIMARY KEY,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.vb_schema_info ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vb_schema_info' AND policyname = 'vb_schema_info_read_policy') THEN
        CREATE POLICY vb_schema_info_read_policy ON public.vb_schema_info FOR SELECT USING (true);
    END IF;
END $$;
INSERT INTO public.vb_schema_info (version, updated_at) VALUES (3, NOW())
ON CONFLICT (version) DO UPDATE SET updated_at = EXCLUDED.updated_at;

-- 2. Bookmark Collections
CREATE TABLE IF NOT EXISTS public.vb_bookmark_collections (
    id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    device_id TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
);
ALTER TABLE public.vb_bookmark_collections ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vb_bookmark_collections' AND policyname = 'collections_owner_policy') THEN
        CREATE POLICY collections_owner_policy ON public.vb_bookmark_collections
            FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_vb_collections_user_updated ON public.vb_bookmark_collections (user_id, updated_at);

-- 3. Bookmarks
CREATE TABLE IF NOT EXISTS public.vb_bookmarks (
    id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    record_key TEXT NOT NULL,
    collection_id TEXT NULL,
    title TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    device_id TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
);
ALTER TABLE public.vb_bookmarks ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vb_bookmarks' AND policyname = 'bookmarks_owner_policy') THEN
        CREATE POLICY bookmarks_owner_policy ON public.vb_bookmarks
            FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_vb_bookmarks_user_updated ON public.vb_bookmarks (user_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vb_bookmarks_user_active_verse
    ON public.vb_bookmarks (user_id, record_key) WHERE deleted_at IS NULL;

-- 4. Text Highlights
CREATE TABLE IF NOT EXISTS public.vb_highlights (
    id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    record_key TEXT NOT NULL,
    field TEXT NOT NULL,
    color TEXT NOT NULL,
    start_offset INT NOT NULL DEFAULT -1,
    length INT NOT NULL DEFAULT -1,
    selected_text TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    device_id TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
);
ALTER TABLE public.vb_highlights ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vb_highlights' AND policyname = 'highlights_owner_policy') THEN
        CREATE POLICY highlights_owner_policy ON public.vb_highlights
            FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_vb_highlights_user_updated ON public.vb_highlights (user_id, updated_at);

-- 5. Realization Notes (Verse-attached & Standalone)
CREATE TABLE IF NOT EXISTS public.vb_notes (
    id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    record_key TEXT NULL,
    title TEXT NULL,
    content TEXT NOT NULL,
    field TEXT NULL,
    start_offset INT NULL,
    length INT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    device_id TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
);
ALTER TABLE public.vb_notes ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vb_notes' AND policyname = 'notes_owner_policy') THEN
        CREATE POLICY notes_owner_policy ON public.vb_notes
            FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_vb_notes_user_updated ON public.vb_notes (user_id, updated_at);

-- 6. Reading History
CREATE TABLE IF NOT EXISTS public.vb_reading_history (
    id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    record_key TEXT NOT NULL,
    book_title TEXT NOT NULL,
    verse_ref TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    device_id TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
);
ALTER TABLE public.vb_reading_history ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vb_reading_history' AND policyname = 'reading_history_owner_policy') THEN
        CREATE POLICY reading_history_owner_policy ON public.vb_reading_history
            FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_vb_reading_history_user_timestamp
    ON public.vb_reading_history (user_id, "timestamp");
