# S3 / JSON save fix

Исправлена ошибка PostgreSQL:

invalid input syntax for type json

Причина:
`node-postgres` сериализует JavaScript Array как PostgreSQL array,
а колонка `products.images` имеет тип JSONB. После загрузки изображения
в S3 форма отправляла `images: [url]`, и PostgreSQL получал не JSON.

Исправление:
- `specs` всегда JSON.stringify(...)
- `images` всегда JSON.stringify(...)
- параметры явно приводятся к `::jsonb`
- пустые/невалидные значения нормализуются
- `sync_enabled` теперь действительно сохраняется из админки

S3 загрузка не менялась: успешно загруженная картинка продолжает храниться
в Timeweb S3.