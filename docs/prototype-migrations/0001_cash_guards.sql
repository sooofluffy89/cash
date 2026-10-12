CREATE UNIQUE INDEX one_reversal ON entries(linked_id) WHERE kind='reversal';
--> statement-breakpoint
CREATE UNIQUE INDEX one_resolution ON entries(linked_id) WHERE kind='resolution';
--> statement-breakpoint
CREATE INDEX entries_kind_seq ON entries(kind,seq);
--> statement-breakpoint
CREATE INDEX entries_linked ON entries(linked_id);
--> statement-breakpoint
CREATE TRIGGER entry_guard BEFORE INSERT ON entries BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor_id AND active=1 AND subject IS NOT NULL) THEN RAISE(ABORT,'cash_denied') END;
 SELECT CASE WHEN NEW.kind IN ('opening','adjustment','reversal','resolution') AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor_id AND role='admin' AND active=1) THEN RAISE(ABORT,'cash_denied') END;
 SELECT CASE WHEN NEW.actor_name<>(SELECT name FROM users WHERE id=NEW.actor_id) OR NEW.actor_email<>(SELECT email FROM users WHERE id=NEW.actor_id) THEN RAISE(ABORT,'cash_denied') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM cash WHERE id=1 AND revision=NEW.expected_revision AND balance=NEW.expected) THEN RAISE(ABORT,'cash_stale') END;
 SELECT CASE WHEN NEW.kind='opening' AND (SELECT initialized FROM cash WHERE id=1)=1 THEN RAISE(ABORT,'cash_alreadyInitialized') END;
 SELECT CASE WHEN NEW.kind<>'opening' AND (SELECT initialized FROM cash WHERE id=1)=0 THEN RAISE(ABORT,'cash_uninitialized') END;
 SELECT CASE WHEN NEW.balance_after<0 THEN RAISE(ABORT,'cash_overdraft') END;
 SELECT CASE WHEN typeof(NEW.delta)<>'integer' OR typeof(NEW.balance_after)<>'integer' OR NEW.balance_after<>NEW.expected+NEW.delta OR NEW.balance_after>9999999999 OR ABS(NEW.delta)>9999999999 THEN RAISE(ABORT,'cash_amount') END;
 SELECT CASE WHEN NEW.kind NOT IN ('opening','in','out','count','adjustment','reversal','resolution') OR (NEW.kind IN ('opening','in') AND NEW.delta<0) OR (NEW.kind='in' AND NEW.delta=0) OR (NEW.kind='out' AND NEW.delta>=0) OR (NEW.kind='adjustment' AND NEW.delta=0) THEN RAISE(ABORT,'cash_amount') END;
 SELECT CASE WHEN (NEW.kind<>'count' OR NEW.difference<>0) AND length(trim(NEW.reason))=0 THEN RAISE(ABORT,'cash_reason') END;
 SELECT CASE WHEN NEW.kind='count' AND (NEW.delta<>0 OR NEW.counted IS NULL OR typeof(NEW.counted)<>'integer' OR NEW.counted<0 OR NEW.counted>9999999999 OR NEW.difference IS NULL OR NEW.difference<>NEW.counted-NEW.expected) THEN RAISE(ABORT,'cash_amount') END;
 SELECT CASE WHEN NEW.kind<>'count' AND (NEW.counted IS NOT NULL OR NEW.difference IS NOT NULL) THEN RAISE(ABORT,'cash_amount') END;
 SELECT CASE WHEN NEW.kind='reversal' AND NOT EXISTS(SELECT 1 FROM entries e WHERE e.id=NEW.linked_id AND e.kind IN ('in','out','adjustment') AND NEW.delta=-e.delta) THEN RAISE(ABORT,'cash_linked') END;
 SELECT CASE WHEN NEW.kind='resolution' AND NOT EXISTS(SELECT 1 FROM entries e WHERE e.id=NEW.linked_id AND e.kind='count' AND e.difference<>0 AND (NEW.delta=0 OR NEW.delta=e.difference)) THEN RAISE(ABORT,'cash_linked') END;
 SELECT CASE WHEN NEW.kind NOT IN ('resolution','reversal') AND NEW.linked_id IS NOT NULL THEN RAISE(ABORT,'cash_linked') END;
 SELECT CASE WHEN NEW.photo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM media WHERE id=NEW.photo_id AND owner_id=NEW.actor_id AND entry_id IS NULL) THEN RAISE(ABORT,'cash_photo') END;
END;
--> statement-breakpoint
CREATE TRIGGER entry_apply AFTER INSERT ON entries BEGIN
 UPDATE cash SET balance=NEW.balance_after, initialized=1, revision=revision+1 WHERE id=1;
 UPDATE media SET entry_id=NEW.id WHERE id=NEW.photo_id;
END;
--> statement-breakpoint
CREATE TRIGGER entries_immutable_update BEFORE UPDATE ON entries BEGIN SELECT RAISE(ABORT,'cash_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER entries_immutable_delete BEFORE DELETE ON entries BEGIN SELECT RAISE(ABORT,'cash_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER audit_guard BEFORE INSERT ON audit BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor_id AND role='admin' AND active=1 AND subject IS NOT NULL AND name=NEW.actor_name) THEN RAISE(ABORT,'cash_denied') END;
END;
--> statement-breakpoint
CREATE TRIGGER audit_immutable_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'cash_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER audit_immutable_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'cash_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER users_guard_insert BEFORE INSERT ON users BEGIN
 SELECT CASE WHEN NEW.role NOT IN ('staff','admin') OR NEW.active NOT IN (0,1) OR NEW.email<>lower(NEW.email) THEN RAISE(ABORT,'cash_denied') END;
END;
--> statement-breakpoint
CREATE TRIGGER users_guard_update BEFORE UPDATE ON users BEGIN
 SELECT CASE WHEN OLD.role='admin' AND OLD.active=1 AND (NEW.role<>'admin' OR NEW.active<>1) AND (SELECT COUNT(*) FROM users WHERE role='admin' AND active=1)<=1 THEN RAISE(ABORT,'cash_lastAdmin') END;
 SELECT CASE WHEN NEW.role NOT IN ('staff','admin') OR NEW.active NOT IN (0,1) OR NEW.email<>OLD.email OR (OLD.subject IS NOT NULL AND NEW.subject IS NOT OLD.subject) THEN RAISE(ABORT,'cash_denied') END;
END;
--> statement-breakpoint
CREATE TRIGGER users_no_delete BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT,'cash_immutable'); END;
