-- 002_add_extra_indexes.sql — فهارس مساعدة للأداء مع البيانات الكبيرة
-- تُشغَّل هذه الترقية تلقائياً على قواعد البيانات المُنشأة بالنسخة السابقة
-- (لا يوجد أي تغيير هدّام، فقط إضافة فهارس).

CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_stud  ON student_transfers(student_id);
CREATE INDEX IF NOT EXISTS idx_lessons_status  ON daily_lessons(status, date);
CREATE INDEX IF NOT EXISTS idx_students_sort   ON students(class_id, sort_order);
