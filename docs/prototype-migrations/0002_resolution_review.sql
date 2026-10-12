CREATE TRIGGER resolution_review_guard BEFORE INSERT ON entries WHEN NEW.kind='resolution' AND NEW.delta<>0 BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM entries e WHERE e.seq>(SELECT seq FROM entries WHERE id=NEW.linked_id) AND e.kind IN ('adjustment','reversal','resolution') AND e.delta<>0) THEN RAISE(ABORT,'cash_correctionSinceCount') END;
END;
