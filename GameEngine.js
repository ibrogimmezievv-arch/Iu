/* ============================================================
 * GameEngine.js — ядро: владеет миром, NPC, временем, системами.
 * Цикл: каждый тик = 1 игровая минута. Движок и только движок
 * меняет состояние игры.
 * Уровни симуляции: Near (полная), Mid (упрощённая), Far (агрегат).
 * ============================================================ */
(function (global) {
  'use strict';

  const AOT = global.AOT;

  class GameEngine {
    constructor(seed) {
      this.initialSeed = seed >>> 0;
      this.rng = new AOT.RNG(this.initialSeed);
      this.time = new AOT.TimeSystem(845);
      this.world = AOT.World.generate(this.rng);
      this.npcs = [];
      this.player = null;
      this.log = [];
      this.systems = {
        schedule: new AOT.ScheduleSystem(this),
        economy: new AOT.EconomySystem(this),
        rumors: new AOT.RumorSystem(this),
        death: new AOT.DeathSystem(this),
        crime: new AOT.CrimeSystem(this),
        events: new AOT.EventSystem(this)
      };
      this.dialogue = new AOT.DialogueSystem(this);
      this._minuteAccum = 0;
    }

    getNPC(id) { return this.npcs.find(n => n.id === id); }

    logEvent(text) {
      const entry = `[${this.time.format()}] ${text}`;
      this.log.push(entry);
      if (this.log.length > 2000) this.log.shift();
      this.systems.events.log(text);
      if (this.onLog) this.onLog(entry);
    }

    /* ---------- Инициализация нового мира ---------- */
    initNewWorld(playerName, playerGender) {
      const rng = this.rng;
      const totalDays = this.time.totalDays;

      // Канонические персонажи
      const canon = AOT.canonicalNPCs(rng, totalDays);
      for (const c of canon) {
        c.locationId = c.job ? c.job.locationId : 'trost_barracks';
        c.homeId = c.job && c.job.locationId === 'trost_barracks' ? 'trost_barracks_dorm' : 'trost_home_01_room';
        this.npcs.push(c);
      }

      // Стартовые отношения канона (узнаваемые связи)
      const byName = {};
      for (const n of this.npcs) byName[n.name] = n;
      const bond = (a, b, t, af, r) => {
        if (byName[a] && byName[b]) {
          byName[a].adjustRel(byName[b].id, t, af, r);
          byName[b].adjustRel(byName[a].id, t, af, r);
        }
      };
      bond('Эрен Йегер', 'Микаса Аккерман', 80, 85, 70);
      bond('Эрен Йегер', 'Армин Арлерт', 75, 70, 65);
      bond('Жан Кирштайн', 'Эрен Йегер', -20, -15, 10);
      bond('Саша Браус', 'Конни Спрингер', 50, 55, 40);
      bond('Марко Ботт', 'Жан Кирштайн', 45, 50, 45);
      bond('Леви Аккерман', 'Ханджи Зоэ', 60, 45, 70);

      // Жители Троста (~40 NPC)
      const homes = this.world.homes.slice();
      for (let i = 0; i < 40; i++) {
        const home = homes[i % homes.length];
        const npc = AOT.generateRandomNPC(rng, totalDays, { homeId: home, locationId: home });
        // работа
        const roll = rng.next();
        if (roll < 0.2) npc.job = { title: 'солдат гарнизона', businessId: null, locationId: 'trost_hq', salary: 25, rank: 2 };
        else if (roll < 0.35) npc.job = { title: 'пекарь', businessId: 'biz_bakery', locationId: 'trost_bakery', salary: 18, rank: 1 };
        else if (roll < 0.5) npc.job = { title: 'трактирщик', businessId: 'biz_tavern', locationId: 'trost_tavern', salary: 18, rank: 1 };
        else if (roll < 0.6) npc.job = { title: 'торговец', businessId: 'biz_shop', locationId: 'trost_market_shop_01', salary: 20, rank: 1 };
        else if (roll < 0.7) npc.job = { title: 'следователь', businessId: null, locationId: 'trost_jail', salary: 30, rank: 3 };
        else npc.job = null; // безработный
        if (npc.job && npc.job.businessId) {
          this.systems.economy.businesses[npc.job.businessId] &&
            this.systems.economy.businesses[npc.job.businessId].employees.push(npc.id);
        }
        this.npcs.push(npc);
      }

      // Назначить владельцев бизнесов
      const owners = this.npcs.filter(n => n.job && ['пекарь', 'трактирщик', 'торговец'].includes(n.job.title));
      const bizIds = ['biz_bakery', 'biz_tavern', 'biz_shop'];
      for (let i = 0; i < bizIds.length && i < owners.length; i++) {
        this.systems.economy.businesses[bizIds[i]].ownerId = owners[i].id;
        owners[i].job.rank = 3;
        owners[i].job.title += ' (владелец)';
      }

      // Несколько готовых семей
      for (let f = 0; f < 5; f++) {
        const m = AOT.generateRandomNPC(rng, totalDays, { gender: 'm', age: rng.int(25, 40) });
        const w = AOT.generateRandomNPC(rng, totalDays, { gender: 'f', age: rng.int(22, 38) });
        const home = homes[(f + 2) % homes.length];
        m.homeId = home; m.locationId = home;
        w.homeId = home; w.locationId = home;
        m.family.spouse = w.id; w.family.spouse = m.id;
        m.adjustRel(w.id, 70, 80, 60); w.adjustRel(m.id, 70, 80, 60);
        this.npcs.push(m, w);
        if (rng.chance(0.7)) {
          const child = this.spawnChild(w, m);
          w.family.children.push(child.id); m.family.children.push(child.id);
          child.family.parents = [w.id, m.id];
          child.homeId = home; child.locationId = home;
        }
      }

      // Игрок
      this.player = new AOT.NPC({
        name: playerName || 'Странник',
        gender: playerGender || 'm',
        birthDay: totalDays - 18 * 360,
        origin: 'Трост',
        personality: { bravery: 60, kindness: 60, honesty: 60, ambition: 60, temper: 40 },
        money: 60,
        homeId: 'trost_home_01_room',
        locationId: 'trost_market',
        isPlayer: true
      });
      this.npcs.push(this.player);

      // Стартовые слухи — сразу раздаём части населения
      const r1 = this.systems.rumors.create(null, 'За стеной видели разведотряд, вернувшийся с потерями.', true, 80);
      const r2 = this.systems.rumors.create(null, 'Говорят, в лавке товаров вода вместо эля.', false, 45);
      for (const n of this.npcs) {
        if (n.isPlayer) continue;
        if (this.rng.chance(0.4)) n.knowledge.push(r1.id);
        if (this.rng.chance(0.3)) n.knowledge.push(r2.id);
      }

      this.logEvent(`Мир создан (seed ${this.initialSeed}). Игрок: ${this.player.name}.`);
    }

    spawnChild(mother, father) {
      const rng = this.rng;
      const child = AOT.generateRandomNPC(rng, this.time.totalDays, { age: 0 });
      child.birthDay = this.time.totalDays;
      child.origin = mother.origin;
      this.npcs.push(child);
      return child;
    }

    /* ---------- Главный цикл ---------- */
    // tickMinutes — сколько игровых минут симулировать за вызов
    tick(tickMinutes) {
      for (let i = 0; i < tickMinutes; i++) {
        this.time.advance(1);
        this.simulateMinute();
        if (this.time.isWorldEnded()) {
          this.time.paused = true;
          this.logEvent('Мир достиг 1500 года. Симуляция остановлена.');
          break;
        }
      }
    }

    simulateMinute() {
      const t = this.time;
      const minuteOfDay = t.hour * 60 + t.minute;

      // Перемещение NPC: шаг каждые 5 минут
      if (t.minute % 5 === 0) {
        for (const n of this.npcs) {
          if (!n.alive) continue;
          n.moveStep();
        }
      }

      // Ежечасно
      if (t.minute === 0) {
        for (const n of this.npcs) {
          if (!n.alive) continue;
          this.systems.schedule.update(n);
          // потребности
          n.hunger = Math.min(100, n.hunger + 2);
          n.energy = n.activity === 'sleep' ? Math.min(100, n.energy + 8) : Math.max(0, n.energy - 2);
        }
        this.systems.events.socialHour();
        this.systems.events.maybeWorldEvent();
      }

      // Ежедневно в 06:00
      if (minuteOfDay === 6 * 60) {
        this.systems.economy.produce();
        for (const n of this.npcs) {
          if (!n.alive) continue;
          this.systems.death.dailyAging(n);
          this.systems.economy.dailyNeeds(n);
        }
        this.systems.crime.progress();
        this.systems.events.maybeBirth();
        this.systems.crime.maybeCommit();
      }

      // Зарплата раз в 30 дней (1-е число, 09:00)
      if (t.day === 1 && minuteOfDay === 9 * 60) {
        this.systems.economy.payday();
      }
    }

    /* ---------- Действия игрока ---------- */
    playerMoveTo(locId) {
      if (!this.player || !this.player.alive) return false;
      const ok = this.player.setDestination(this.world, locId);
      if (ok) {
        // игрок двигается быстрее: телесимуляция нескольких шагов
        while (this.player.path.length > 0) {
          this.player.moveStep();
          this.tick(5); // 5 минут на шаг
        }
        this.logEvent(`${this.player.name} пришёл(ла) в локацию: ${this.world.get(locId).name}.`);
      }
      return ok;
    }

    playerSleep() {
      this.logEvent(`${this.player.name} лёг спать.`);
      this.player.activity = 'sleep';
      // спим до 6 утра
      let guard = 0;
      while (this.time.hour !== 6 && guard++ < 60 * 24) this.tick(10);
      this.player.activity = 'idle';
      this.player.energy = 100;
      this.player.hunger = Math.min(100, this.player.hunger + 20);
    }

    playerEat() {
      const e = this.systems.economy;
      const ok = e.buy(this.player, 'biz_bakery', 'bread', 1) || e.buy(this.player, 'biz_tavern', 'meal', 1);
      if (ok) {
        this.player.hunger = Math.max(0, this.player.hunger - 50);
        this.logEvent(`${this.player.name} поел(а).`);
      } else {
        this.logEvent('Не удалось купить еду (нет денег или товара).');
      }
      return ok;
    }

    /* ---------- Смерть игрока: наследование ---------- */
    onPlayerDeath(npc) {
      // потомок → наследник
      const children = npc.family.children.map(id => this.getNPC(id)).filter(c => c && c.alive);
      let heir = children.find(c => c.age(this.time.totalDays) >= 12) || null;
      if (!heir) {
        // линия закончилась — новый персонаж в том же мире
        heir = AOT.generateRandomNPC(this.rng, this.time.totalDays, { age: 18 });
        heir.homeId = 'trost_home_01_room';
        heir.locationId = 'trost_market';
        this.npcs.push(heir);
        this.logEvent(`Линия ${npc.name} прервалась. Новый герой в том же мире: ${heir.name}.`);
      } else {
        this.logEvent(`${npc.name} умер(ла). Игра продолжается за наследника: ${heir.name}.`);
      }
      npc.isPlayer = false;
      heir.isPlayer = true;
      this.player = heir;
      if (this.onPlayerChanged) this.onPlayerChanged(heir);
    }

    /* ---------- Сохранение / загрузка ---------- */
    static fromSaveData(data) {
      const engine = new GameEngine(data.seed);
      engine.rng = AOT.RNG.deserialize(data.rng);
      engine.time = AOT.TimeSystem.deserialize(data.time);
      engine.world = AOT.World.deserialize(data.world, engine.rng);
      engine.npcs = data.npcs.map(n => AOT.NPC.deserialize(n));
      engine.player = data.playerId ? engine.getNPC(data.playerId) : null;
      engine.systems.economy = AOT.EconomySystem.deserialize(data.economy, engine);
      engine.systems.crime = AOT.CrimeSystem.deserialize(data.crime, engine);
      engine.systems.rumors = AOT.RumorSystem.deserialize(data.rumors, engine);
      engine.systems.events = AOT.EventSystem.deserialize(data.events, engine);
      engine.log = data.log || [];
      return engine;
    }
  }

  global.AOT = global.AOT || {};
  global.AOT.GameEngine = GameEngine;
})(typeof window !== 'undefined' ? window : globalThis);
