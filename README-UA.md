# ⚠ Локальний сервер оновлення тривог

[EN](https://github.com/sergeiown/Alert_Server/blob/main/README.md) | **[UA](https://github.com/sergeiown/Alert_Server/blob/main/README-UA.md)**

Адаптований для 64-розрядних версій Windows Node.js сервер, який із заданою періодичністю отримує дані про тривоги, що надаються [alerts.in.ua](https://alerts.in.ua/) з подальшою обробкою і виводом повідомлення про початок та закінчення тривоги в обраних для відстеження регіонів України.

| Структура: |  |
| --- | --- |
| Залежності | ![image](https://github.com/user-attachments/assets/e8e7f896-4a77-490d-bf20-a247b1e9a868) |

## Встановлення

На поточний момент реалізована можливість повністю автоматизованого встановлення. Інсталятор виконано у мінімалістичному варіанті з використанням Batch scripts та PowerShell.

Порядок дій:
- завантажити архів інсталятора `Alert_server_setup.zip` доступний за посиланням: [Alert server releases](https://github.com/sergeiown/Alert_Server/releases);
- видобути інсталятор з архіву у вибраному розташуванні;
- запустити інсталятор `Alert_server_setup.bat`.

Інсталяція буде виконана в розташуванні `%userprofile%\Documents\Alert_Server`, під час встановлення буде перевірено наявність [Git](https://git-scm.com/), [Node.js](https://nodejs.org/en) та [Microsoft .NET Framework 3.5](https://www.microsoft.com/en-us/download/details.aspx?id=21) та їх інсталяція або оновлення за необхідності.

Безпосередньо інсталяція локального сервера оновлення тривог складається з імпорту проєкту з репозиторію [GitHub](https://github.com/sergeiown/Alert_Server), встановлення необхідних залежностей та ярликів в меню "Пуск".

| Disclaimer: *testing and adaptation of the functionality was carried out on 64-bit versions of Windows 10 22H2 and 11 22H2. Features may be limited or unavailable on other platforms or versions of Windows. We recommend using Windows 10 version 22H2 or Windows 11 for the best experience. Please note that the interface is currently available in Ukrainian and English.* |                       [![windows_compatibility](https://github.com/user-attachments/assets/db2b5487-b5bf-45d9-8948-48bb88162f17)](https://en.wikipedia.org/wiki/List_of_Microsoft_Windows_versions)                       |
| :--- | :---: |

## Використання

Використання локального сервера оновлення тривог напрочуд просте та інтуїтивно зрозуміле. Перший запуск виконується автоматично після завершення процесу інсталяції.

Індикація стану і керування налаштуваннями відбуваються через меню tray icon. Серед налаштувань доступний запуск сервера під час старту системи, активація аудіо повідомлень та вибір регіонів, щодо яких відбуватиметься відстеження наявності тривог. Доступний вибір монохромного або кольорового представлення tray icon. 

Інформування, щодо поточної тривоги та відміни тривоги, збереження історії тривог відбувається через Windows Notification Center з використанням [Snoretoast](https://github.com/KDE/snoretoast). Додатково використовується індикація тривоги через tray icon та звукове оповіщення. Через меню tray icon також доступний перегляд мапи поточних тривог [alerts.in.ua](https://alerts.in.ua/) та мапи поточного стану лінії фронту [DeepState](https://deepstatemap.live).

Всі дії записуються в лог-файл, розмір якого автоматично обмежується 256 КБ, перегляд доступний через меню tray icon.

| Зовнішній вигляд сповіщень:  |||
| --- | --- | --- |
| ![1](https://github.com/sergeiown/Alert_Server/assets/112722061/770e12e4-4d63-44d9-a0e8-728fcd46aee7) | ![2](https://github.com/sergeiown/Alert_Server/assets/112722061/49c8a502-a766-4a18-870a-64cbad870988) | ![3](https://github.com/sergeiown/Alert_Server/assets/112722061/80295078-98db-48e1-88f8-136bc7ad1421) |
| Запуск сервера                  | Активна тривога                      | Скасування тривоги |

| Зовнішній вигляд налаштувань:  ||
| --- | --- |
| Вибір мови | ![4](https://github.com/sergeiown/Alert_Server/assets/112722061/160b8d7a-d849-4924-9af8-2852721a1ffd) | 

## Видалення

| Рекомендація: |  |
| --- | --- |
| В разі необхідності деінсталяції локального сервера оновлення тривог потрібно використати ярлик `Uninstall Alert server` в меню `Пуск` => `Alert server`. | ![image](https://github.com/user-attachments/assets/f0bb8bac-cac3-4a71-b43e-eb4d61a86123) |

## Внесок

Якщо у вас є пропозиції або бажання запропонувати покращення до проєкту, будь ласка, відкривайте Pull Request.

## Ліцензія

[Copyright (c) 2024 Serhii I. Myshko](https://github.com/sergeiown/Current_Alert/blob/main/LICENSE)
