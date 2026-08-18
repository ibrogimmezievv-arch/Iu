/* ============================================================
 * DialogueSystem.js — диалоги NPC.
 * Шаблонно-контекстная система: реплики зависят от личности,
 * отношений, памяти, слухов и текущей активности NPC.
 * Внешняя AI-модель НЕ используется; если будет подключена —
 * она лишь предлагает {dialogue, intent, emotion, possible_action},
 * а GameEngine решает, что реально произошло.
 * ============================================================ */
(function (global) {
  'use strict';

  const GREETINGS = {
    friendly: ['Рад тебя видеть!', 'А, {player}! Как дела?', 'Добрый день, {player}.'],
    neutral: ['Здравствуй.', 'Чего хотел?', 'Слушаю тебя.'],
    hostile: ['Чего тебе надо?', 'Уходи, не до тебя сейчас.', 'С тобой я говорить не желаю.']
  };

  class DialogueSystem {
    constructor(engine) { this.engine = engine; }

    moodOf(npc, playerId) {
      const r = npc.relationships[playerId];
      if (!r) return 'neutral';
      const score = r.trust + r.affection + r.respect;
      if (score > 60) return 'friendly';
      if (score < -40) return 'hostile';
      return 'neutral';
    }

    greet(npc, player) {
      const e = this.engine;
      const mood = this.moodOf(npc, player.id);
      const line = e.rng.pick(GREETINGS[mood]).replace('{player}', player.name.split(' ')[0]);
      npc.adjustRel(player.id, 1, 1, 0);
      player.adjustRel(npc.id, 1, 1, 0);
      npc.remember(e.time.totalDays, `Поздоровался с ${player.name}`, player.id, 'talk', 1);
      return { text: line, mood };
    }

    // NPC делится слухом (может быть ложным!)
    tellRumor(npc, player) {
      const e = this.engine;
      const known = npc.knowledge.map(id => e.systems.rumors.rumors[id]).filter(Boolean);
      if (known.length === 0) {
        return { text: 'Слышал только, что хлеб дорожает. Больше ничего нового.', rumor: null };
      }
      const r = e.rng.pick(known);
      player.knowledge.push(r.id);
      npc.remember(e.time.totalDays, `Рассказал(а) слух игроку: «${r.content}»`, player.id, 'talk', 2);
      return {
        text: `Говорят... ${r.content} (достоверность: ${r.reliability < 40 ? 'сомнительно' : r.reliability < 70 ? 'возможно правда' : 'похоже на правду'})`,
        rumor: r
      };
    }

    // Что NPC думает о другом персонаже
    opinionAbout(npc, player, targetId) {
      const target = this.engine.getNPC(targetId);
      if (!target) return { text: 'Не знаю такого.' };
      const r = npc.relationships[targetId];
      if (!r) return { text: `Знаю ${target.name} лишь понаслышке.` };
      const mem = npc.memoriesAbout(targetId).slice(-2);
      let text = `${target.name}? Для меня это — ${r.label}.`;
      if (mem.length) text += ' Помню: ' + mem.map(m => m.text).join('; ') + '.';
      return { text };
    }

    // Реакция на комплимент/оскорбление
    compliment(npc, player) {
      const e = this.engine;
      const kindness = npc.personality.kindness;
      npc.adjustRel(player.id, 3, 4, 1);
      player.adjustRel(npc.id, 1, 2, 0);
      npc.remember(e.time.totalDays, `${player.name} сказал(а) мне комплимент`, player.id, 'talk', 2);
      if (kindness > 50) return { text: 'О... спасибо! Очень приятно.' };
      return { text: 'Хм. Льстишь? Но... спасибо.' };
    }
    insult(npc, player) {
      const e = this.engine;
      npc.adjustRel(player.id, -8, -10, -5);
      player.adjustRel(npc.id, -3, -5, 0);
      npc.remember(e.time.totalDays, `${player.name} оскорбил(а) меня`, player.id, 'insult', 5);
      if (npc.personality.temper > 60) return { text: 'Повтори-ка ещё раз, смельчак...' };
      return { text: 'Зачем ты так?.. Ладно, я запомню.' };
    }

    // Предложение пожениться
    propose(npc, player) {
      const e = this.engine;
      const r = npc.rel(player.id);
      if (npc.family.spouse) return { text: 'Я уже в браке, прости.', accepted: false };
      if (player.family.spouse) return { text: 'Ты же уже женат/замужем!', accepted: false };
      if (r.affection > 70 && r.trust > 60) {
        e.systems.events.marry(npc, player);
        return { text: 'Да! Да, я согласна/согласен!', accepted: true };
      }
      npc.adjustRel(player.id, -2, -3, 0);
      return { text: 'Мы слишком мало знаем друг друга для такого...', accepted: false };
    }

    // Варианты действий в диалоге
    options(npc, player) {
      const opts = [
        { id: 'greet', label: 'Поздороваться' },
        { id: 'rumor', label: 'Спросить о слухах' },
        { id: 'opinion', label: 'Спросить о ком-то' },
        { id: 'compliment', label: 'Сделать комплимент' },
        { id: 'insult', label: 'Оскорбить' }
      ];
      const r = npc.relationships[player.id];
      if (r && r.affection > 50 && !npc.family.spouse && !player.family.spouse && npc.gender !== player.gender) {
        opts.push({ id: 'propose', label: 'Предложить пожениться' });
      }
      return opts;
    }
  }

  global.AOT = global.AOT || {};
  global.AOT.DialogueSystem = DialogueSystem;
})(typeof window !== 'undefined' ? window : globalThis);
