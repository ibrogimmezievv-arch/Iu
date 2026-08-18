# EMERGENCY_CONTINUE.md

Если контекст потерян:

1. Прочитать `README.md`.
2. Прочитать `CONTINUE.md`.
3. Прочитать `EMERGENCY_CONTINUE.md` (этот файл).
4. Проверить структуру проекта (см. README → «Структура проекта»).
5. НЕ переписывать существующие системы без необходимости.
6. Продолжить с поля **NEXT TASK** в `CONTINUE.md`.
7. После работы обновить `CONTINUE.md`.
8. Проверить проект: `node test/smoke.js` (все тесты должны быть зелёными)
   и открыть `index.html` в браузере.
9. Обновить ZIP: `attack-on-titan-living-world.zip`
   (в корне архива — папка `attack-on-titan-living-world/` со всеми файлами).

Ключевые правила:
- Только seeded RNG (`AOT.RNG`), никакого Math.random() в симуляции.
- Состояние меняет только GameEngine, не UI и не внешний AI.
- Новые поля состояния — обязательно в serialize()/deserialize() с дефолтами.
