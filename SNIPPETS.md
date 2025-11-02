# Коллекция Полезных HTML-Сниппетов

Этот документ — наша "шпаргалка" для часто используемых HTML-конструкций.

## Ссылки на Мессенджеры и Социальные Сети

### Telegram
- **Прямой переход в приложение:** `<a href="tg://resolve?domain=USERNAME">Telegram</a>`
- **Веб-ссылка (откроется в браузере):** `<a href="https://t.me/USERNAME">Telegram</a>` (используем `t.me` как более короткий вариант)

### WhatsApp
- **Диалог (универсальная ссылка):** `<a href="https://wa.me/79991234567" target="_blank">WhatsApp</a>`
- **Диалог с готовым текстом:** `<a href="https://wa.me/79991234567?text=Добрый%20день!" target="_blank">WhatsApp с текстом</a>`
- **Старый формат (может не работать):** `<a href="whatsapp://send?phone=+79991234567">WhatsApp</a>`

### Viber
- **Чат (для ПК):** `<a href="viber://chat?number=+79991234567">Viber</a>`
- **Добавить контакт (для мобильных):** `<a href="viber://add?number=79991234567">Viber</a>`

### Skype
- **Начать чат:** `<a href="skype:ЛОГИН?chat">Skype Chat</a>`
- **Позвонить:** `<a href="skype:ЛОГИН?call">Skype Call</a>`

### VKontakte
- **Перейти к диалогу:** `<a href="https://vk.me/ID_ПОЛЬЗОВАТЕЛЯ">Vkontakte</a>`

### Facebook Messenger
- **Перейти к диалогу:** `<a href="https://www.messenger.com/t/USERNAME">Facebook Messenger</a>`

### Instagram
- **Ссылка на профиль:** `<a href="https://www.instagram.com/USERNAME" target="_blank">Instagram</a>`


## Специальные типы ссылок

### E-mail (Электронная почта)
- **Простая ссылка:** `<a href="mailto:name@example.com">Написать на E-mail</a>`
- **Ссылка с темой и текстом:** `<a href="mailto:name@example.com?subject=Тема%20письма&body=Здравствуйте!">E-mail с темой</a>`

### Телефон
- **Простая ссылка на звонок:** `<a href="tel:+79991234567">+7 (999) 123-45-67</a>` (номер лучше указывать в международном формате без лишних символов)

### Файлы
- **Открыть файл в новой вкладке:** `<a href="/path/to/file.pdf" target="_blank">Открыть документ</a>`
- **Скачать файл:** `<a href="/path/to/image.jpg" download>Скачать изображение</a>`
- **Скачать файл с новым именем:** `<a href="/path/to/image.jpg" download="my-cool-photo.jpg">Скачать с другим именем</a>`