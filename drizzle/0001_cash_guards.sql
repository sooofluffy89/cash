CREATE UNIQUE INDEX IF NOT EXISTS one_reversal ON entries(linked_id) WHERE kind='reversal';

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS one_resolution ON entries(linked_id) WHERE kind='resolution';

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS entries_kind_seq ON entries(kind,seq);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS entries_linked ON entries(linked_id);
