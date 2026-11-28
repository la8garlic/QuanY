DROP VIEW IF EXISTS manuscript_text;
CREATE VIEW manuscript_text AS
SELECT id, title, label, modified,
       CASE WHEN EXISTS (SELECT 1 FROM draft_pieces WHERE note = n.id)
            THEN (SELECT group_concat(
                      -- SQLite 对空 BLOB 取子串会返回 NULL。纯插入块直接取新增文字。
                      CASE WHEN keep_bytes = 0 THEN addition
                           ELSE CAST(substr(CAST(n.body AS BLOB), start_byte + 1, keep_bytes) AS TEXT) || addition
                      END, '' ORDER BY part)
                  FROM draft_pieces WHERE note = n.id)
            ELSE body END AS body
FROM notes AS n;
PRAGMA user_version = 1;
