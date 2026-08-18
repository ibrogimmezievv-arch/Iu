/* ============================================================
 * SaveSystem.js — сохранение/загрузка полного состояния мира.
 * Хранилище: localStorage (слоты) + экспорт/импорт JSON-файла.
 * Сохраняется ВСЁ: seed, RNG, время, игрок, NPC, отношения,
 * память, семьи, смерти, экономика, здания, объекты, двери,
 * преступления, дела, слухи, события, состояние мира.
 * ============================================================ */
(function (global) {
  'use strict';

  const SAVE_VERSION = 1;
  const SLOT_PREFIX = 'aot_lw_save_';

  class SaveSystem {
    constructor(engine) {
      this.engine = engine;
    }

    static listSlots() {
      const slots = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.indexOf(SLOT_PREFIX) === 0) {
            const raw = localStorage.getItem(key);
            try {
              const data = JSON.parse(raw);
              slots.push({
                slot: key.substring(SLOT_PREFIX.length),
                date: data.meta && data.meta.savedAt,
                gameDate: data.meta && data.meta.gameDate,
                playerName: data.meta && data.meta.playerName
              });
            } catch (e) { /* повреждённый слот пропускаем */ }
          }
        }
      } catch (e) { /* localStorage недоступен */ }
      return slots.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    save(slot) {
      const engine = this.engine;
      const data = {
        version: SAVE_VERSION,
        meta: {
          savedAt: new Date().toISOString(),
          gameDate: engine.time.format(),
          playerName: engine.player ? engine.player.name : '(нет игрока)'
        },
        seed: engine.initialSeed,
        rng: engine.rng.serialize(),
        time: engine.time.serialize(),
        world: engine.world.serialize(),
        npcs: engine.npcs.map(n => n.serialize()),
        playerId: engine.player ? engine.player.id : null,
        economy: engine.systems.economy.serialize(),
        crime: engine.systems.crime.serialize(),
        rumors: engine.systems.rumors.serialize(),
        events: engine.systems.events.serialize(),
        log: engine.log.slice(-500) // последние 500 записей журнала
      };
      try {
        localStorage.setItem(SLOT_PREFIX + slot, JSON.stringify(data));
        return true;
      } catch (e) {
        console.error('Save failed', e);
        return false;
      }
    }

    load(slot) {
      let raw = null;
      try { raw = localStorage.getItem(SLOT_PREFIX + slot); } catch (e) { return null; }
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        console.error('Load failed', e);
        return null;
      }
    }

    deleteSlot(slot) {
      try { localStorage.removeItem(SLOT_PREFIX + slot); } catch (e) {}
    }

    exportSave(slot) {
      const data = this.load(slot);
      return data ? JSON.stringify(data) : null;
    }

    importSave(json, slot) {
      try {
        const data = JSON.parse(json);
        if (!data.version || !data.world) return false;
        localStorage.setItem(SLOT_PREFIX + slot, json);
        return true;
      } catch (e) { return false; }
    }
  }

  SaveSystem.SAVE_VERSION = SAVE_VERSION;

  global.AOT = global.AOT || {};
  global.AOT.SaveSystem = SaveSystem;
})(typeof window !== 'undefined' ? window : globalThis);
