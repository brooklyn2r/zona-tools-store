insert into products
(title,slug,category,brand,spec,price,old_price,badge,stock,description,image_url,rating,reviews,is_active,is_featured)
values
('Шуруповёрт ZONA X18 Pro','zona-x18-pro','Шуруповёрты','ZONA','18V · 60 Нм · 2 АКБ',18990,22990,'Хит продаж',12,'Мощный аккумуляторный шуруповёрт.','/tool-drill.svg',4.9,128,true,true),
('Перфоратор ZONA RH2470','zona-rh2470','Перфораторы','ZONA','780 Вт · 2.7 Дж',15990,19990,'Новинка',8,'Универсальный SDS+ перфоратор.','/tool-hammer.svg',4.8,91,true,true),
('Болгарка ZONA GWS 12-125','zona-gws-12-125','Болгарки','ZONA','1200 Вт · 125 мм',9990,12490,'Скидка -20%',15,'Компактная угловая шлифовальная машина.','/tool-grinder.svg',4.9,176,true,true)
on conflict (slug) do nothing;