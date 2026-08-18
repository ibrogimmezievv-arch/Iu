/* ============================================================
 * Systems.js — системы симуляции:
 * ScheduleSystem, EconomySystem, RumorSystem, DeathSystem,
 * CrimeSystem, EventSystem.
 * Все системы работают только через движок и seeded RNG.
 * ============================================================ */
(function (global) {
  'use strict';

  /* ================= ScheduleSystem =================
   * Суточное расписание NPC: сон → завтрак → работа → обед →
   * работа → рынок/таверна → дом → ужин → отдых → сон. */
  class ScheduleSystem {
    constructor(engine) { this.engine = engine; }

    // Целевая локация NPC по времени суток
    targetFor(npc, hour) {
      const e = this.engine;
      if (!npc.alive) return null;
      if (npc.jailedUntil != null && e.time.totalDays < npc.jailedUntil) return 'trost_prison';
      if (npc.isPlayer) return null; // игрок сам решает

      if (hour < 6)  return npc.homeId || 'trost_barracks_dorm';
      if (hour < 8)  return npc.job && npc.job.locationId === 'trost_barracks' ? 'trost_barracks_mess' : (npc.homeId || 'trost_barracks_mess');
      if (hour < 12) return npc.job ? npc.job.locationId : 'trost_market';
      if (hour < 14) return npc.job && npc.job.locationId === 'trost_barracks' ? 'trost_barracks_mess' : 'trost_market';
      if (hour < 18) return npc.job ? npc.job.locationId : 'trost_market';
      if (hour < 21) return e.rng.chance(0.3) ? 'trost_tavern' : (npc.homeId || 'trost_barracks_dorm');
      return npc.homeId || 'trost_barracks_dorm';
    }

    activityFor(npc, hour) {
      if (hour < 6 || hour >= 22) return 'sleep';
      if (hour < 8 || (hour >= 12 && hour < 14) || (hour >= 19 && hour < 21)) return 'eat';
      if (hour >= 8 && hour < 18 && npc.job) return 'work';
      return 'rest';
    }

    // Вызывается раз в игровой час для каждого NPC (и при появлении)
    update(npc) {
      const e = this.engine;
      if (!npc.alive || npc.isPlayer) return;
      const hour = e.time.hour;
      const target = this.targetFor(npc, hour);
      if (target && npc.locationId !== target && npc.destinationId !== target && npc.path.length === 0) {
        npc.setDestination(e.world, target);
      }
      if (!npc.destinationId && npc.path.length === 0) {
        npc.activity = this.activityFor(npc, hour);
      } else {
        npc.activity = 'travel';
      }
    }
  }

  /* ================= EconomySystem =================
   * Бизнесы, товары, зарплаты, цены, долги, банкротства, налоги. */
  class EconomySystem {
    constructor(engine) {
      this.engine = engine;
      this.businesses = {}; // id → {id, name, locationId, ownerId, employees[], money, inventory{good:qty}, prices{}, bankrupt}
      this.goods = {
        bread:  { name: 'Хлеб', basePrice: 5 },
        meal:   { name: 'Горячая еда', basePrice: 12 },
        ale:    { name: 'Эль', basePrice: 8 },
        cloth:  { name: 'Ткань', basePrice: 20 },
        tools:  { name: 'Инструменты', basePrice: 35 }
      };
      this.taxRate = 0.1;
      this.treasury = 1000; // казна города
    }

    init() {
      const e = this.engine;
      this.addBusiness('biz_bakery', 'Пекарня «У Миры»', 'trost_bakery', { bread: 40 });
      this.addBusiness('biz_tavern', 'Таверна «Сломанное копьё»', 'trost_tavern', { meal: 30, ale: 50 });
      this.addBusiness('biz_shop', 'Лавка товаров', 'trost_market_shop_01', { cloth: 15, tools: 10, bread: 10 });
    }

    addBusiness(id, name, locationId, inventory) {
      this.businesses[id] = {
        id, name, locationId, ownerId: null, employees: [],
        money: 200, inventory: inventory || {}, bankrupt: false
      };
      return this.businesses[id];
    }

    priceOf(biz, good) {
      const base = this.goods[good] ? this.goods[good].basePrice : 10;
      const stock = biz.inventory[good] || 0;
      // дефицит повышает цену
      return Math.max(1, Math.round(base * (stock < 5 ? 1.8 : stock < 15 ? 1.2 : 1.0)));
    }

    buy(npc, bizId, good, qty) {
      const e = this.engine;
      const biz = this.businesses[bizId];
      if (!biz || biz.bankrupt) return false;
      qty = qty || 1;
      if ((biz.inventory[good] || 0) < qty) return false;
      const cost = this.priceOf(biz, good) * qty;
      if (npc.money < cost) return false;
      npc.money -= cost;
      biz.money += cost;
      biz.inventory[good] -= qty;
      return true;
    }

    // Производство товаров утром
    produce() {
      const e = this.engine;
      for (const id in this.businesses) {
        const b = this.businesses[id];
        if (b.bankrupt) continue;
        if (b.id === 'biz_bakery') b.inventory.bread = (b.inventory.bread || 0) + e.rng.int(15, 30);
        if (b.id === 'biz_tavern') { b.inventory.meal = (b.inventory.meal || 0) + e.rng.int(10, 20); b.inventory.ale = (b.inventory.ale || 0) + e.rng.int(15, 30); }
        if (b.id === 'biz_shop') { b.inventory.cloth = (b.inventory.cloth || 0) + e.rng.int(2, 6); b.inventory.tools = (b.inventory.tools || 0) + e.rng.int(1, 4); }
      }
    }

    // Выплата зарплат раз в 30 дней + налоги
    payday() {
      const e = this.engine;
      for (const npc of e.npcs) {
        if (!npc.alive || !npc.job || npc.retired) continue;
        const salary = npc.job.salary || 0;
        const biz = npc.job.businessId ? this.businesses[npc.job.businessId] : null;
        if (biz) {
          if (biz.money >= salary) { biz.money -= salary; npc.money += salary; }
          else { /* зарплата не выплачена — риск увольнения */ npc.remember(e.time.totalDays, 'Работодатель не выплатил жалованье', null, 'work', 3); }
        } else {
          this.treasury -= salary; // государственная служба
          npc.money += salary;
        }
        // налог
        const tax = Math.floor(salary * this.taxRate);
        npc.money = Math.max(0, npc.money - tax);
        this.treasury += tax;
      }
      // банкротства
      for (const id in this.businesses) {
        const b = this.businesses[id];
        if (!b.bankrupt && b.money < -100) {
          b.bankrupt = true;
          e.logEvent(`Бизнес «${b.name}» обанкротился.`);
          for (const empId of b.employees) {
            const emp = e.getNPC(empId);
            if (emp && emp.alive) { emp.job = null; emp.remember(e.time.totalDays, `«${b.name}» обанкротился, я остался без работы`, null, 'work', 4); }
          }
          b.employees = [];
        }
      }
    }

    // Ежедневные покупки еды NPC
    dailyNeeds(npc) {
      const e = this.engine;
      if (!npc.alive || npc.isPlayer) return;
      if (npc.hunger > 60 && npc.money > 10) {
        const good = e.rng.chance(0.6) ? 'bread' : 'meal';
        const bizId = good === 'bread' ? 'biz_bakery' : 'biz_tavern';
        if (this.buy(npc, bizId, good, 1)) {
          npc.hunger = Math.max(0, npc.hunger - 50);
        }
      }
    }

    serialize() {
      return { businesses: this.businesses, treasury: this.treasury, taxRate: this.taxRate };
    }
    static deserialize(d, engine) {
      const s = new EconomySystem(engine);
      s.businesses = d.businesses || {};
      s.treasury = d.treasury != null ? d.treasury : 1000;
      s.taxRate = d.taxRate != null ? d.taxRate : 0.1;
      return s;
    }
  }

  /* ================= RumorSystem =================
   * Слухи: source, time, reliability, content. Слух может быть ложью.
   * При пересказе достоверность падает и содержимое искажается. */
  class RumorSystem {
    constructor(engine) {
      this.engine = engine;
      this.rumors = {}; // id → {id, sourceId, day, reliability, content, truth, spread}
      this.counter = 0;
    }

    create(sourceId, content, truth, reliability) {
      const id = 'rumor_' + (++this.counter);
      this.rumors[id] = {
        id, sourceId, day: this.engine.time.totalDays,
        reliability: reliability != null ? reliability : this.engine.rng.int(40, 90),
        content, truth: !!truth, spread: 1
      };
      return this.rumors[id];
    }

    // NPC делится слухом с другим NPC
    spread(teller, listener) {
      const e = this.engine;
      const known = teller.knowledge.filter(id => this.rumors[id]);
      if (known.length === 0) return null;
      const rid = e.rng.pick(known);
      const r = this.rumors[rid];
      // пересказ: достоверность деградирует
      const degraded = {
        id: 'rumor_' + (++this.counter),
        sourceId: teller.id,
        day: e.time.totalDays,
        reliability: Math.max(5, r.reliability - e.rng.int(5, 20)),
        content: r.content,
        truth: r.truth,
        spread: r.spread + 1
      };
      this.rumors[degraded.id] = degraded;
      if (listener.knowledge.indexOf(degraded.id) === -1) listener.knowledge.push(degraded.id);
      return degraded;
    }

    // Игрок проверяет слух (простая проверка факта)
    verify(rumorId) {
      const r = this.rumors[rumorId];
      if (!r) return null;
      return { truth: r.truth, reliability: r.reliability, content: r.content };
    }

    serialize() { return { rumors: this.rumors, counter: this.counter }; }
    static deserialize(d, engine) {
      const s = new RumorSystem(engine);
      s.rumors = d.rumors || {};
      s.counter = d.counter || 0;
      return s;
    }
  }

  /* ================= DeathSystem =================
   * Жизненный цикл: старение, болезни, смерти, похороны, могилы,
   * наследство, реакция родственников. Смерть постоянна. */
  class DeathSystem {
    constructor(engine) { this.engine = engine; this.graves = []; }

    dailyAging(npc) {
      const e = this.engine;
      if (!npc.alive) return;
      const age = npc.age(e.time.totalDays);
      // голод и усталость бьют по здоровью
      if (npc.hunger > 80) npc.health -= e.rng.int(1, 3);
      if (npc.energy < 10) npc.health -= 1;
      // старость
      if (age > 55) npc.health -= e.rng.float(0, (age - 55) * 0.02);
      // болезни
      if (e.rng.chance(0.002)) {
        npc.health -= e.rng.int(10, 30);
        npc.remember(e.time.totalDays, 'Тяжело заболел', null, 'health', 5);
      }
      npc.health = Math.min(100, npc.health + 0.5); // медленное восстановление
      if (npc.health <= 0) this.kill(npc, age > 60 ? 'старость и болезнь' : 'болезнь');
    }

    kill(npc, cause) {
      const e = this.engine;
      if (!npc.alive) return;
      npc.alive = false;
      npc.activity = 'dead';
      npc.deathInfo = { day: e.time.totalDays, cause: cause || 'неизвестно' };
      const graveId = 'grave_' + npc.id;
      this.graves.push({ id: graveId, npcId: npc.id, name: npc.name, day: e.time.totalDays, cause: cause });
      const cemetery = e.world.get('trost_cemetery');
      if (cemetery) cemetery.addObject({ id: graveId, kind: 'grave', name: 'Могила: ' + npc.name, state: { cause: cause, day: e.time.totalDays } });
      e.logEvent(`Умер(ла) ${npc.name} (${npc.age(e.time.totalDays)} лет). Причина: ${cause}. Похоронен(а) на кладбище Троста.`);
      npc.lifeHistory.push(`${e.time.formatDate()}: умер(ла). Причина: ${cause}.`);

      // реакция родственников и близких
      for (const other of e.npcs) {
        if (!other.alive || other.id === npc.id) continue;
        if (other.isRelative(npc.id) || (other.relationships[npc.id] && other.relationships[npc.id].affection > 40)) {
          other.remember(e.time.totalDays, `Умер(ла) ${npc.name}. Причина: ${cause}`, npc.id, 'death', 10);
          other.health = Math.max(20, other.health - 5); // горе
        }
      }
      // наследство: деньги → супруг/дети
      const heirs = [];
      if (npc.family.spouse) heirs.push(npc.family.spouse);
      heirs.push(...npc.family.children);
      const aliveHeirs = heirs.map(id => e.getNPC(id)).filter(h => h && h.alive);
      if (aliveHeirs.length > 0 && npc.money > 0) {
        const share = Math.floor(npc.money / aliveHeirs.length);
        for (const h of aliveHeirs) {
          h.money += share;
          h.remember(e.time.totalDays, `Получено наследство от ${npc.name}: ${share} монет`, npc.id, 'inheritance', 3);
        }
        npc.money = 0;
      }
      // игрок умер — движок решит наследование отдельно
      if (npc.isPlayer) e.onPlayerDeath(npc);
    }

    serialize() { return { graves: this.graves }; }
    static deserialize(d, engine) {
      const s = new DeathSystem(engine);
      s.graves = d.graves || [];
      return s;
    }
  }

  /* ================= CrimeSystem =================
   * Цепочка: преступление → расследование → улики → свидетели →
   * подозреваемый → арест → СИЗО → допрос → суд → приговор → тюрьма.
   * Возможны ложные обвинения, ошибки свидетелей, коррупция. */
  class CrimeSystem {
    constructor(engine) {
      this.engine = engine;
      this.cases = {}; // id → дело
      this.counter = 0;
    }

    // Случайное преступление (редко)
    maybeCommit() {
      const e = this.engine;
      if (!e.rng.chance(0.004)) return; // ~раз в несколько дней
      const candidates = e.npcs.filter(n => n.alive && !n.isPlayer && n.jailedUntil == null && n.personality.honesty < 40);
      if (candidates.length === 0) return;
      const criminal = e.rng.pick(candidates);
      const victims = e.npcs.filter(n => n.alive && n.id !== criminal.id && n.money > 30);
      if (victims.length === 0) return;
      const victim = e.rng.pick(victims);
      const stolen = Math.min(victim.money, e.rng.int(10, 50));
      victim.money -= stolen;
      criminal.money += stolen;
      victim.remember(e.time.totalDays, 'У меня украли деньги!', null, 'crime', 6);

      const caseId = 'case_' + (++this.counter);
      // свидетели могут ошибаться
      const witnesses = e.npcs.filter(n => n.alive && n.id !== criminal.id && n.id !== victim.id).slice(0, 3);
      const witnessReports = witnesses.map(w => {
        const correct = e.rng.chance(0.7);
        return { witnessId: w.id, suspectId: correct ? criminal.id : (e.rng.pick(e.npcs.filter(n => n.alive && n.id !== w.id)) || criminal).id, correct };
      });
      this.cases[caseId] = {
        id: caseId, type: 'theft', day: e.time.totalDays,
        criminalId: criminal.id, victimId: victim.id, amount: stolen,
        evidence: [{ kind: 'footprint', strength: e.rng.int(20, 80) }],
        witnessReports, suspectId: null, stage: 'investigation',
        verdict: null, corrupt: e.rng.chance(0.1)
      };
      e.logEvent(`В Тросте совершена кража. Жертва: ${victim.name}. Начато расследование (${caseId}).`);
    }

    // Продвижение расследований (ежедневно)
    progress() {
      const e = this.engine;
      for (const id in this.cases) {
        const c = this.cases[id];
        if (c.stage === 'closed') continue;
        if (c.stage === 'investigation') {
          // следователь выбирает подозреваемого по уликам и свидетелям
          const votes = {};
          for (const w of c.witnessReports) votes[w.suspectId] = (votes[w.suspectId] || 0) + 1;
          let best = null, bestN = 0;
          for (const sid in votes) if (votes[sid] > bestN) { best = sid; bestN = votes[sid]; }
          const evidenceStrong = c.evidence.reduce((s, ev) => s + ev.strength, 0) > 60;
          if (best && (bestN >= 2 || evidenceStrong)) {
            c.suspectId = best;
            c.stage = 'arrested';
            const suspect = e.getNPC(best);
            if (suspect && suspect.alive) {
              suspect.locationId = 'trost_jail_cell';
              suspect.activity = 'jailed';
              e.logEvent(`По делу ${c.id} арестован ${suspect.name}.`);
            }
          } else if (e.time.totalDays - c.day > 10) {
            c.stage = 'closed';
            c.verdict = 'недостаток доказательств';
            e.logEvent(`Дело ${c.id} закрыто: недостаток доказательств.`);
          }
        } else if (c.stage === 'arrested') {
          // суд
          const suspect = e.getNPC(c.suspectId);
          const guilty = c.suspectId === c.criminalId;
          let convict = guilty;
          if (c.corrupt && e.rng.chance(0.5)) convict = !guilty; // коррупция меняет исход
          if (!guilty && e.rng.chance(0.25)) convict = true; // судебная ошибка
          c.stage = 'closed';
          c.verdict = convict ? 'виновен' : 'оправдан';
          if (suspect && suspect.alive) {
            if (convict) {
              suspect.jailedUntil = e.time.totalDays + 30;
              suspect.locationId = 'trost_prison';
              suspect.crimeRecord.push(c.id);
              suspect.remember(e.time.totalDays, `Осуждён по делу ${c.id}${guilty ? '' : ' (ложное обвинение!)'}`, null, 'crime', 8);
              e.logEvent(`Суд: ${suspect.name} признан виновным по делу ${c.id}. 30 дней тюрьмы.${guilty ? '' : ' Это судебная ошибка.'}`);
            } else {
              suspect.locationId = suspect.homeId || 'trost_market';
              suspect.activity = 'idle';
              suspect.remember(e.time.totalDays, `Оправдан по делу ${c.id}`, null, 'crime', 5);
              e.logEvent(`Суд: ${suspect.name} оправдан по делу ${c.id}.`);
            }
          }
        }
      }
      // освобождение отбывших срок
      for (const npc of e.npcs) {
        if (npc.alive && npc.jailedUntil != null && e.time.totalDays >= npc.jailedUntil) {
          npc.jailedUntil = null;
          npc.locationId = npc.homeId || 'trost_market';
          npc.activity = 'idle';
          e.logEvent(`${npc.name} освобождён из тюрьмы.`);
        }
      }
    }

    serialize() { return { cases: this.cases, counter: this.counter }; }
    static deserialize(d, engine) {
      const s = new CrimeSystem(engine);
      s.cases = d.cases || {};
      s.counter = d.counter || 0;
      return s;
    }
  }

  /* ================= EventSystem =================
   * Мировые события и социальные взаимодействия:
   * разговоры, свадьбы, рождения, слухи, тревоги титанов (редко, по seed). */
  class EventSystem {
    constructor(engine) {
      this.engine = engine;
      this.history = []; // {day, text}
      this.titanAttackHappened = false;
    }

    log(text) {
      this.history.push({ day: this.engine.time.totalDays, text });
      if (this.history.length > 1000) this.history.shift();
    }

    // Ежечасные социальные взаимодействия между NPC в одной локации
    socialHour() {
      const e = this.engine;
      const byLoc = {};
      for (const n of e.npcs) {
        if (!n.alive || n.isPlayer || n.activity === 'sleep' || n.activity === 'jailed') continue;
        byLoc[n.locationId] = byLoc[n.locationId] || [];
        byLoc[n.locationId].push(n);
      }
      for (const locId in byLoc) {
        const group = byLoc[locId];
        if (group.length < 2) continue;
        const a = e.rng.pick(group);
        const b = e.rng.pick(group.filter(x => x.id !== a.id));
        if (!b) continue;
        this.interact(a, b);
      }
    }

    interact(a, b) {
      const e = this.engine;
      // обмен слухами
      const rumor = e.systems.rumors.spread(a, b);
      // развитие отношений — постепенно
      const compat = 1 - Math.abs(a.personality.kindness - b.personality.kindness) / 200;
      const delta = e.rng.float(-1, 2) * compat;
      a.adjustRel(b.id, delta, delta * 0.8, delta * 0.5);
      b.adjustRel(a.id, delta, delta * 0.8, delta * 0.5);
      if (rumor) {
        a.remember(e.time.totalDays, `Рассказал(а) слух ${b.name}: «${rumor.content}»`, b.id, 'talk', 1);
        b.remember(e.time.totalDays, `Услышал(а) от ${a.name}: «${rumor.content}»`, a.id, 'talk', 1);
      }
      // романтика: только при высокой взаимной симпатии
      const ra = a.rel(b.id), rb = b.rel(a.id);
      if (!a.family.spouse && !b.family.spouse && a.gender !== b.gender &&
          ra.affection > 70 && rb.affection > 70 && ra.trust > 50 && rb.trust > 50 &&
          e.rng.chance(0.05)) {
        this.marry(a, b);
      }
    }

    marry(a, b) {
      const e = this.engine;
      a.family.spouse = b.id;
      b.family.spouse = a.id;
      a.adjustRel(b.id, 10, 10, 5);
      b.adjustRel(a.id, 10, 10, 5);
      a.lifeHistory.push(`${e.time.formatDate()}: свадьба с ${b.name}.`);
      b.lifeHistory.push(`${e.time.formatDate()}: свадьба с ${a.name}.`);
      e.logEvent(`Свадьба: ${a.name} и ${b.name} поженились!`);
      // переезд в один дом
      const home = a.homeId || b.homeId;
      if (home) { a.homeId = home; b.homeId = home; }
    }

    // Рождения (ежедневная проверка семейных пар)
    maybeBirth() {
      const e = this.engine;
      for (const n of e.npcs) {
        if (!n.alive || !n.family.spouse || n.gender !== 'f') continue;
        const spouse = e.getNPC(n.family.spouse);
        if (!spouse || !spouse.alive) continue;
        const age = n.age(e.time.totalDays);
        if (age < 18 || age > 42) continue;
        if (n.family.children.length >= 4) continue;
        if (!e.rng.chance(0.0015)) continue;
        const child = e.spawnChild(n, spouse);
        n.family.children.push(child.id);
        spouse.family.children.push(child.id);
        child.family.parents = [n.id, spouse.id];
        child.homeId = n.homeId;
        child.locationId = n.homeId;
        e.logEvent(`Родился ребёнок: ${child.name} (родители: ${n.name} и ${spouse.name}).`);
        n.lifeHistory.push(`${e.time.formatDate()}: родился ребёнок ${child.name}.`);
        spouse.lifeHistory.push(`${e.time.formatDate()}: родился ребёнок ${child.name}.`);
      }
    }

    // Редкое большое событие: тревога у ворот (альтернативная история по seed)
    maybeWorldEvent() {
      const e = this.engine;
      if (this.titanAttackHappened) return;
      // примерно раз в 2-4 года, зависит от seed
      if (e.rng.chance(0.0003)) {
        this.titanAttackHappened = true;
        e.logEvent('ТРЕВОГА! У ворот Троста замечены титаны. Гарнизон приведён в боевую готовность.');
        const rumor = e.systems.rumors.create(null, 'У ворот видели титанов. Город в опасности.', true, 95);
        for (const n of e.npcs) if (n.alive && e.rng.chance(0.5)) n.knowledge.push(rumor.id);
        // возможны жертвы среди военных
        const soldiers = e.npcs.filter(n => n.alive && n.job && n.job.locationId === 'trost_barracks' && !n.isPlayer);
        for (const s of soldiers) {
          if (e.rng.chance(0.05)) e.systems.death.kill(s, 'погиб при отражении титанов');
        }
      }
    }

    serialize() { return { history: this.history, titanAttackHappened: this.titanAttackHappened }; }
    static deserialize(d, engine) {
      const s = new EventSystem(engine);
      s.history = d.history || [];
      s.titanAttackHappened = !!d.titanAttackHappened;
      return s;
    }
  }

  global.AOT = global.AOT || {};
  global.AOT.ScheduleSystem = ScheduleSystem;
  global.AOT.EconomySystem = EconomySystem;
  global.AOT.RumorSystem = RumorSystem;
  global.AOT.DeathSystem = DeathSystem;
  global.AOT.CrimeSystem = CrimeSystem;
  global.AOT.EventSystem = EventSystem;
})(typeof window !== 'undefined' ? window : globalThis);
