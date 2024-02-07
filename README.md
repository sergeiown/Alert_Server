# Локальний сервер оновлення тривог

Node.js сервер, який із заданою періодичністю отримує дані про тривоги, що надаються [alerts.in.ua](https://alerts.in.ua/) з подальшою обробкою і виводом повідомлення про початок та закінчення тривоги для зазначеного регіону України.

![image](https://github.com/sergeiown/Alert_Server/assets/112722061/f9a69e2e-dd5d-4232-8e6f-0f4581bfd1bd)

## Встановлення

На поточний момент реалізована можливість повністю автоматизованого встановлення. Інсталятор виконано у мінімалістичному варіанті з використанням Batch scripts та PowerShell.

Порядок дій:
- завантажити інсталятор `Alert.server.zip` доступний за посиланням: [Alert server releases](https://github.com/sergeiown/Alert_Server/releases);
- видобути у вибраному розташуванні;
- запустити `start_alert_server_git_import.bat`.

Інсталяція буде виконана в поточну директорію, під час встановлення буде перевірено наявність [Git](https://git-scm.com/) та [Node.js](https://nodejs.org/en) та їх інсталяція за необхідності.

Безпосередньо інсталяція локального сервера оновлення тривог складається з імпорту проєкту з репозиторію [GitHub](https://github.com/sergeiown/Alert_Server), встановлення необхідних залежностей та ярликів.

Код відкритий, скомпільовані файли не використовуються.

---
***Disclamer:***  
*Тестування та адаптація функціоналу проводились на 64-розрядних версіях Windows 10 та 11 версії 22H2.*
*На інших платформах або версіях Windows мої можливості можуть бути обмежені або недоступні.*
*Рекомендується використовувати Windows 10 версії 22H2 або Windows 11 для кращого досвіду.*

## Використання

Використання локального сервера оновлення тривог напрочуд просте та інтуїтивно зрозуміле. Перший запуск виконується автоматично після завершення процесу інсталяції.

Індикація стану і керування налаштуваннями відбуваються через tray icon. Серед налаштувань доступний запуск сервера під час старту системи та вибір регіонів, щодо яких відбуватиметься відстеження наявності тривог.

Інформування, щодо поточної тривоги та відміни тривоги, збереження історії тривог відбувається через Windows Notification Center. Додатково використовується індикація тривоги через tray icon та звукове опвіщення.

| Appearance:  | | |
| --- | --- | --- |
| ![image](https://github.com/sergeiown/Alert_Server/assets/112722061/455fbc88-5d9d-4b68-a1ca-26556759e9fa) | ![image](https://github.com/sergeiown/Alert_Server/assets/112722061/0c87f7a9-8ec2-4825-bd66-158231252f26) | ![image](https://github.com/sergeiown/Alert_Server/assets/112722061/69d8daa9-8d13-44c5-83d8-4b74daf7e8ab) |

## Внесок

Якщо у вас є пропозиції або бажання запропонувати покращення до проєкту, будь ласка, відкривайте Pull Request.

## Ліцензія

[Copyright (c) 2024 Serhii I. Myshko](https://github.com/sergeiown/Current_Alert/blob/main/LICENSE)
