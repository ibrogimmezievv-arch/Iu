/* ============================================================
 * NPC.js — персонажи: атрибуты, память, отношения, семья,
 * жизненный цикл, перемещение по миру.
 * ============================================================ */
(function (global) {
  'use strict';

  let npcCounter = 0;

  const LIFE_STAGES = [
    { name: 'детство', min: 0, max: 12 },
    { name: 'подросток', min: 13, max: 17 },
    { name: 'взрослый', min: 18, max: 54 },
    { name: 'старость', min: 55, max: 200 }
  ];

  class NPC {
    constructor(opts) {
      this.id = opts.id || ('npc_' + (++npcCounter));
      this.name = opts.name;
      this.gender = opts.gender || 'm';
      this.birthDay = opts.birthDay;      // totalDays рождения (для возраста)
      this.origin = opts.origin || 'Трост';
      this.personality = opts.personality || {}; // {bravery, kindness, honesty, ambition, temper} 0..100
      this.goals = opts.goals || [];
      this.fears = opts.fears || [];
      this.desires = opts.desires || [];
      this.job = opts.job || null;        // {title, businessId|null, locationId, salary, rank}
      this.money = opts.money != null ? opts.money : 50;
      this.health = opts.health != null ? opts.health : 100;
      this.alive = true;
      this.homeId = opts.homeId || null;
      this.locationId = opts.locationId || null;
      this.destinationId = null;
      this.path = [];                     // маршрут (массив id локаций)
      this.activity = 'idle';             // sleep|eat|work|travel|talk|rest|jailed|dead...
      this.relationships = {};            // npcId → {trust, affection, respect, label}
      this.memory = [];                   // {day, text, aboutId, kind, weight}
      this.knowledge = [];                // rumorId — известные слухи
      this.family = { parents: [], children: [], spouse: null, siblings: [] };
      this.lifeHistory = [];              // строки биографии
      this.isPlayer = !!opts.isPlayer;
      this.canonical = !!opts.canonical;
      this.deathInfo = null;              // {day, cause, graveId}
      this.hunger = 0;                    // 0..100
      this.energy = 100;                  // 0..100
      this.crimeRecord = [];              // caseId осуждений
      this.jailedUntil = null;            // totalDays освобождения
      this.retired = false;
    }

    age(totalDays) {
      return Math.floor((totalDays - this.birthDay) / 360);
    }
    lifeStage(totalDays) {
      const a = this.age(totalDays);
      for (const s of LIFE_STAGES) if (a >= s.min && a <= s.max) return s.name;
      return 'взрослый';
    }

    /* ---------- Отношения ---------- */
    rel(otherId) {
      if (!this.relationships[otherId]) {
        this.relationships[otherId] = { trust: 0, affection: 0, respect: 0, label: 'знакомый' };
      }
      return this.relationships[otherId];
    }
    adjustRel(otherId, dTrust, dAffection, dRespect) {
      const r = this.rel(otherId);
      r.trust = clamp(r.trust + (dTrust || 0), -100, 100);
      r.affection = clamp(r.affection + (dAffection || 0), -100, 100);
      r.respect = clamp(r.respect + (dRespect || 0), -100, 100);
      r.label = relLabel(r);
      return r;
    }

    /* ---------- Память ---------- */
    remember(day, text, aboutId, kind, weight) {
      this.memory.push({ day, text, aboutId: aboutId || null, kind: kind || 'event', weight: weight || 1 });
      if (this.memory.length > 200) {
        // забываем самые лёгкие воспоминания
        this.memory.sort((a, b) => b.weight - a.weight);
        this.memory.length = 150;
      }
    }
    memoriesAbout(otherId) {
      return this.memory.filter(m => m.aboutId === otherId);
    }

    /* ---------- Семья ---------- */
    isRelative(otherId) {
      return this.family.parents.includes(otherId) ||
             this.family.children.includes(otherId) ||
             this.family.siblings.includes(otherId) ||
             this.family.spouse === otherId;
    }

    /* ---------- Перемещение ---------- */
    setDestination(world, destId) {
      if (this.locationId === destId) { this.destinationId = null; this.path = []; return true; }
      const path = world.findPath(this.locationId, destId);
      if (path) {
        this.destinationId = destId;
        this.path = path;
        return true;
      }
      return false;
    }
    // Один шаг по маршруту (вызывается раз в несколько минут)
    moveStep() {
      if (this.path.length > 0) {
        this.locationId = this.path.shift();
        if (this.path.length === 0) this.destinationId = null;
        return true;
      }
      return false;
    }

    serialize() {
      return {
        id: this.id, name: this.name, gender: this.gender, birthDay: this.birthDay,
        origin: this.origin, personality: this.personality, goals: this.goals,
        fears: this.fears, desires: this.desires, job: this.job, money: this.money,
        health: this.health, alive: this.alive, homeId: this.homeId,
        locationId: this.locationId, destinationId: this.destinationId, path: this.path,
        activity: this.activity, relationships: this.relationships, memory: this.memory,
        knowledge: this.knowledge, family: this.family, lifeHistory: this.lifeHistory,
        isPlayer: this.isPlayer, canonical: this.canonical, deathInfo: this.deathInfo,
        hunger: this.hunger, energy: this.energy, crimeRecord: this.crimeRecord,
        jailedUntil: this.jailedUntil, retired: this.retired
      };
    }
    static deserialize(d) {
      const n = new NPC(d);
      Object.assign(n, d);
      return n;
    }
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function relLabel(r) {
    const score = r.trust + r.affection + r.respect;
    if (r.affection > 70 && r.trust > 60) return 'любовь';
    if (score > 150) return 'близкий друг';
    if (score > 80) return 'друг';
    if (score > 20) return 'приятель';
    if (score < -100) return 'враг';
    if (score < -30) return 'недоброжелатель';
    return 'знакомый';
  }

  /* ---------- Генерация случайного NPC ---------- */
  const MALE_NAMES = ['Томас','Самуэль','Дитер','Густав','Ханнес','Флогель','Иан','Митаби','Рике','Борис','Олуо','Гюнтер','Элд','Петра-отец','Ник','Люк','Мозес'];
  const FEMALE_NAMES = ['Мира','Ханна','Рике','Петра','Нанаба','Мина','Илза','Фрида','Карла','Дина','Альма','Луиза','Грета','Соня'];
  const SURNAMES = ['Браун','Шмидт','Мюллер','Фишер','Вебер','Майер','Вагнер','Беккер','Хоффман','Шульц','Кох','Рихтер','Кляйн','Вольф','Нойман'];

  function randomPersonality(rng) {
    return {
      bravery: rng.int(10, 95),
      kindness: rng.int(10, 95),
      honesty: rng.int(10, 95),
      ambition: rng.int(10, 95),
      temper: rng.int(5, 90)
    };
  }

  function generateRandomNPC(rng, totalDays, opts) {
    opts = opts || {};
    const gender = opts.gender || (rng.chance(0.5) ? 'm' : 'f');
    const first = gender === 'm' ? rng.pick(MALE_NAMES) : rng.pick(FEMALE_NAMES);
    const name = first + ' ' + rng.pick(SURNAMES);
    const age = opts.age != null ? opts.age : rng.int(16, 55);
    return new NPC({
      name, gender,
      birthDay: totalDays - age * 360 - rng.int(0, 359),
      origin: 'Трост',
      personality: randomPersonality(rng),
      goals: [rng.pick(['заработать на дом', 'вырастить детей', 'открыть лавку', 'вступить в гарнизон', 'спокойно жить'])],
      fears: [rng.pick(['титаны', 'нищета', 'одиночество', 'болезнь'])],
      desires: [rng.pick(['достаток', 'семья', 'слава', 'безопасность'])],
      money: rng.int(20, 300),
      homeId: opts.homeId || null,
      locationId: opts.locationId || opts.homeId || null
    });
  }

  /* ---------- Канонические персонажи AoT ---------- */
  function canonicalNPCs(rng, totalDays) {
    const mk = (name, age, gender, personality, extra) => new NPC(Object.assign({
      name, gender,
      birthDay: totalDays - age * 360 - rng.int(0, 359),
      origin: extra && extra.origin || 'Шиганшина',
      personality,
      canonical: true,
      money: 40
    }, extra || {}));

    return [
      mk('Эрен Йегер', 15, 'm', { bravery: 95, kindness: 55, honesty: 80, ambition: 100, temper: 90 },
        { goals: ['истребить титанов', 'увидеть море'], fears: ['бессилие'], desires: ['свобода'],
          job: { title: 'кадет', businessId: null, locationId: 'trost_barracks', salary: 12, rank: 1 } }),
      mk('Микаса Аккерман', 15, 'f', { bravery: 98, kindness: 60, honesty: 85, ambition: 70, temper: 30 },
        { goals: ['защищать Эрена'], fears: ['потерять семью'], desires: ['покой рядом с Эреном'],
          job: { title: 'кадет', businessId: null, locationId: 'trost_barracks', salary: 12, rank: 1 } }),
      mk('Армин Арлерт', 15, 'm', { bravery: 45, kindness: 85, honesty: 90, ambition: 80, temper: 15 },
        { goals: ['увидеть внешний мир'], fears: ['титаны', 'быть обузой'], desires: ['знания о мире'],
          job: { title: 'кадет', businessId: null, locationId: 'trost_barracks', salary: 12, rank: 1 } }),
      mk('Жан Кирштайн', 15, 'm', { bravery: 60, kindness: 55, honesty: 60, ambition: 85, temper: 65 },
        { goals: ['попасть в военную полицию'], fears: ['смерть в бою'], desires: ['спокойная жизнь в столице'],
          job: { title: 'кадет', businessId: null, locationId: 'trost_barracks', salary: 12, rank: 1 } }),
      mk('Саша Браус', 15, 'f', { bravery: 70, kindness: 80, honesty: 75, ambition: 40, temper: 40 },
        { goals: ['никогда не голодать'], fears: ['голод'], desires: ['еда'],
          job: { title: 'кадет', businessId: null, locationId: 'trost_barracks', salary: 12, rank: 1 } }),
      mk('Конни Спрингер', 15, 'm', { bravery: 65, kindness: 80, honesty: 80, ambition: 55, temper: 45 },
        { goals: ['прославить деревню'], fears: ['опозориться'], desires: ['признание'],
          job: { title: 'кадет', businessId: null, locationId: 'trost_barracks', salary: 12, rank: 1 } }),
      mk('Марко Ботт', 15, 'm', { bravery: 60, kindness: 95, honesty: 90, ambition: 50, temper: 20 },
        { goals: ['служить людям'], fears: ['предательство'], desires: ['мир'],
          job: { title: 'кадет', businessId: null, locationId: 'trost_barracks', salary: 12, rank: 1 } }),
      mk('Томас Вагнер', 15, 'm', { bravery: 55, kindness: 70, honesty: 75, ambition: 60, temper: 40 },
        { goals: ['закончить подготовку'], fears: ['титаны'], desires: ['семья'],
          job: { title: 'кадет', businessId: null, locationId: 'trost_barracks', salary: 12, rank: 1 } }),
      mk('Леви Аккерман', 30, 'm', { bravery: 100, kindness: 45, honesty: 90, ambition: 75, temper: 55 },
        { origin: 'Подземный город', goals: ['защитить человечество'], fears: ['бессмысленные жертвы'], desires: ['чистота', 'чай'],
          job: { title: 'капрал разведкорпуса', businessId: null, locationId: 'trost_hq', salary: 90, rank: 5 } }),
      mk('Ханджи Зоэ', 28, 'f', { bravery: 85, kindness: 70, honesty: 80, ambition: 90, temper: 50 },
        { goals: ['изучить титанов'], fears: ['незнание'], desires: ['эксперименты'],
          job: { title: 'командир отряда разведкорпуса', businessId: null, locationId: 'trost_hq', salary: 80, rank: 4 } }),
      mk('Кейт Шадис', 40, 'm', { bravery: 80, kindness: 40, honesty: 85, ambition: 70, temper: 80 },
        { goals: ['выковать солдат'], fears: ['бесполезные кадеты'], desires: ['дисциплина'],
          job: { title: 'командир кадетского корпуса', businessId: null, locationId: 'trost_barracks', salary: 70, rank: 4 } })
    ];
  }

  global.AOT = global.AOT || {};
  global.AOT.NPC = NPC;
  global.AOT.generateRandomNPC = generateRandomNPC;
  global.AOT.canonicalNPCs = canonicalNPCs;
  global.AOT.relLabel = relLabel;
})(typeof window !== 'undefined' ? window : globalThis);
