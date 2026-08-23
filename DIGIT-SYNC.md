# Digit Учет → ZONA Website Sync

## Архитектура

Digit Учет (SQLite, компьютер клиента)
→ HTTPS API сайта
→ Node.js
→ PostgreSQL
→ сайт ZONA

Digit Учет является главным источником:
- название;
- бренд;
- категория;
- цена;
- старая цена;
- остаток;
- единица;
- краткие характеристики;
- структурированные характеристики.

Сайт сохраняет самостоятельно:
- фотографии;
- описание;
- badge;
- "на главной";
- витринное оформление.

## Защита

В `.env` сайта:

DIGIT_SYNC_API_KEY=очень-длинный-секретный-ключ

Digit Учет должен отправлять заголовок:

X-DIGIT-API-KEY: <ключ>

## Проверка подключения

GET /api/digit/status

Header:
X-DIGIT-API-KEY

## Полная синхронизация

POST /api/digit/sync

Headers:
Content-Type: application/json
X-DIGIT-API-KEY: <ключ>

Body:

{
  "full_sync": true,
  "products": [
    {
      "digit_product_id": "5821",
      "title": "Шуруповёрт DeWALT DCD796",
      "brand": "DeWALT",
      "category": "Шуруповёрты",
      "price": 18990,
      "old_price": 22990,
      "stock": 6,
      "unit": "шт",
      "spec": "18V · 70 Нм · 2 АКБ",
      "specs": {
        "voltage": "18V",
        "torque": 70,
        "battery_count": 2
      },
      "is_active": true
    }
  ]
}

`full_sync=true` означает:
товары, которые ранее пришли из Digit Учет, но отсутствуют в текущей полной выгрузке,
не удаляются физически, а получают:

is_active=false
stock=0

Фото и витринные поля не удаляются.

## Частичная синхронизация

Тот же POST, но:

{
  "full_sync": false,
  "products": [...]
}

Подходит для обновления одного или нескольких товаров после:
- продажи;
- прихода;
- изменения цены;
- редактирования товара.

## sync_enabled

Для товара из Digit Учет в PostgreSQL есть `sync_enabled`.

true → Digit Учет обновляет товар.
false → синхронизация пропускает товар.

Это аварийный ручной режим для сайта.