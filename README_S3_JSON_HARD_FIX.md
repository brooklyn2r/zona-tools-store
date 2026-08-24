# S3 JSON HARD FIX

This build fixes and diagnoses `invalid input syntax for type json`
for `PUT /api/admin/products/:id`.

Changes:
- accepts `specs` as object, JSON string, null, or empty value;
- accepts `images` as array, JSON string, one URL string, null, or empty value;
- normalizes both fields before SQL;
- serializes with JSON.stringify;
- uses explicit CAST(... AS jsonb);
- returns `build: s3-json-hard-fix-2026-08-24` in API errors;
- logs PostgreSQL error code/detail and request field types;
- health endpoint exposes the same build marker when the existing health shape matches.

If the same error appears but the response does NOT contain this build marker,
Timeweb is still running the previous server/index.js.