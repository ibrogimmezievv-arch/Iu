/* Автономный smoke-тест движка (Node, без DOM).
 * Запуск: node test/smoke.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { console, globalThis: {} };
vm.createContext(ctx);
const files = [
  'js/core/RNG.js', 'js/core/TimeSystem.js', 'js/core/SaveSystem.js',
  'js/world/World.js', 'js/actors/NPC.js', 'js/simulation/Systems.js',
  'js/ai/DialogueSystem.js', 'js/core/GameEngine.js'
];
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
}
const AOT = ctx.globalThis.AOT;

function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('ok:', msg); }

// 1. Создание мира
const engine = new AOT.GameEngine(12345);
engine.systems.economy.init();
engine.initNewWorld('Тестер', 'm');
assert(engine.npcs.length > 50, `мир создан, NPC: ${engine.npcs.length}`);
assert(engine.getNPC(engine.player.id) === engine.player, 'игрок существует');
assert(engine.npcs.some(n => n.name === 'Эрен Йегер'), 'канон: Эрен Йегер присутствует');

// 2. Детерминизм: два мира с одним seed — одинаковые имена NPC
const e2 = new AOT.GameEngine(12345);
e2.systems.economy.init();
e2.initNewWorld('Тестер', 'm');
assert(engine.npcs[5].name === e2.npcs[5].name, 'один seed — одинаковый мир');
const e3 = new AOT.GameEngine(98765);
e3.systems.economy.init();
e3.initNewWorld('Тестер', 'm');
assert(engine.npcs[5].name !== e3.npcs[5].name || engine.npcs[20].name !== e3.npcs[20].name, 'другой seed — другой мир');

// 3. Симуляция 30 дней
engine.tick(60 * 24 * 30);
assert(engine.time.totalDays >= 30, `время прошло: ${engine.time.totalDays} дней`);
// добираемся до середины дня, когда NPC на работе/в пути
while (engine.time.hour < 12) engine.tick(60);
const moved = engine.npcs.filter(n => n.alive && !n.isPlayer && n.locationId !== n.homeId);
assert(moved.length > 0, `NPC перемещаются по миру (${moved.length} вне дома)`);
const anyRel = engine.npcs.some(n => Object.keys(n.relationships).length > 0);
assert(anyRel, 'отношения развиваются');
const anyRumor = Object.keys(engine.systems.rumors.rumors).length > 2;
assert(anyRumor, `слухи распространяются (${Object.keys(engine.systems.rumors.rumors).length})`);

// 4. Pathfinding
const route = engine.world.findPath('trost_barracks_dorm', 'trost_market');
assert(route && route.length > 0, `pathfinding работает (${route.length} шагов)`);

// 5. Диалог
const npc = engine.npcs.find(n => n.alive && !n.isPlayer);
const greet = engine.dialogue.greet(npc, engine.player);
assert(typeof greet.text === 'string' && greet.text.length > 0, 'диалог: приветствие');

// 6. Save/Load: сериализация и восстановление
const saveData = {
  version: 1, meta: {}, seed: engine.initialSeed,
  rng: engine.rng.serialize(), time: engine.time.serialize(),
  world: engine.world.serialize(), npcs: engine.npcs.map(n => n.serialize()),
  playerId: engine.player.id,
  economy: engine.systems.economy.serialize(), crime: engine.systems.crime.serialize(),
  rumors: engine.systems.rumors.serialize(), events: engine.systems.events.serialize(),
  log: engine.log
};
const json = JSON.stringify(saveData);
const restored = AOT.GameEngine.fromSaveData(JSON.parse(json));
assert(restored.rng.seed === engine.rng.seed, 'RNG state сохранён');
assert(restored.time.totalMinutes === engine.time.totalMinutes, 'время сохранено');
assert(restored.npcs.length === engine.npcs.length, 'NPC сохранены');
assert(restored.player && restored.player.id === engine.player.id, 'игрок сохранён');
const npc0 = engine.npcs[0], r0 = restored.npcs[0];
assert(JSON.stringify(npc0.relationships) === JSON.stringify(r0.relationships), 'отношения сохранены');
assert(JSON.stringify(npc0.memory) === JSON.stringify(r0.memory), 'память сохранена');
assert(JSON.stringify(restored.world.get('trost_home_01_room').objects) === JSON.stringify(engine.world.get('trost_home_01_room').objects), 'объекты/двери сохранены');

// 7. Детерминизм после загрузки: продолжаем оба мира — совпадают
engine.tick(60 * 6);
restored.tick(60 * 6);
assert(restored.rng.seed === engine.rng.seed, 'после load мир развивается детерминированно');

// 8. Смерть и наследование
const victim = engine.npcs.find(n => n.alive && !n.isPlayer && n.family.children.length > 0);
engine.systems.death.kill(victim, 'тест');
assert(!victim.alive && victim.deathInfo, 'смерть постоянна');
assert(engine.systems.death.graves.length > 0, 'могила создана');

// 9. Смерть игрока → наследник или новый персонаж
engine.player.family.children = [];
const oldPlayer = engine.player;
engine.systems.death.kill(oldPlayer, 'тест');
assert(engine.player && engine.player.id !== oldPlayer.id && engine.player.isPlayer, 'игра продолжается после смерти игрока');

// 10. Экономика
const before = engine.player.money;
engine.player.money = 100;
const bought = engine.systems.economy.buy(engine.player, 'biz_bakery', 'bread', 1);
assert(bought && engine.player.money < 100, 'покупка работает');

console.log('\nВСЕ ТЕСТЫ ПРОЙДЕНЫ');
