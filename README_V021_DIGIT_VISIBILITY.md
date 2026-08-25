# ZONA v0.21 — DIGIT visibility

- Every product present in a DIGIT sync is forced to is_active=true.
- stock=0 does not hide a product.
- stock=0 remains visible as "Нет в наличии" and cannot be purchased.
- Only a true full sync may hide DIGIT products that are missing from the payload.
- Category management from v0.20 is preserved.
