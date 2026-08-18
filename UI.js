/* ============================================================
 * UI.js — интерфейс: карта, сцена, панель игрока, журнал, диалоги.
 * ============================================================ */
(function (global) {
  'use strict';

  class UI {
    constructor(engine) {
      this.engine = engine;
      this.dialogueTarget = null;
      engine.onLog = (entry) => this.appendLog(entry);
      engine.onPlayerChanged = () => this.renderAll();
    }

    el(id) { return document.getElementById(id); }

    renderAll() {
      this.renderHeader();
      this.renderMap();
      this.renderScene();
      this.renderPlayer();
    }

    renderHeader() {
      const t = this.engine.time;
      this.el('game-time').textContent = t.format();
      this.el('speed-indicator').textContent = t.paused ? '⏸ пауза' : `▶ ${t.speed}x`;
    }

    renderMap() {
      const e = this.engine;
      const player = e.player;
      const container = this.el('map-panel');
      if (!player) { container.innerHTML = '<p>Нет игрока</p>'; return; }
      const cur = e.world.get(player.locationId);
      let html = `<div class="loc-current">Вы здесь: <b>${cur ? cur.name : '?'}</b></div><ul class="loc-list">`;
      // выходы: связи + дети + родитель
      const exits = new Set();
      if (cur) {
        cur.links.forEach(id => exits.add(id));
        cur.children.forEach(id => exits.add(id));
        if (cur.parentId) exits.add(cur.parentId);
      }
      for (const id of exits) {
        const loc = e.world.get(id);
        if (!loc) continue;
        const passable = e.world.isPassable(id);
        html += `<li><button class="loc-btn" data-loc="${id}" ${passable ? '' : 'disabled'}>${loc.name}${passable ? '' : ' 🔒'}</button></li>`;
      }
      html += '</ul><details><summary>Все локации</summary><ul class="loc-list">';
      for (const id in e.world.locations) {
        const loc = e.world.locations[id];
        html += `<li><button class="loc-btn small" data-loc="${id}">${loc.name}</button></li>`;
      }
      html += '</ul></details>';
      container.innerHTML = html;
      container.querySelectorAll('.loc-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.engine.playerMoveTo(btn.dataset.loc);
          this.renderAll();
        });
      });
    }

    renderScene() {
      const e = this.engine;
      const player = e.player;
      const scene = this.el('scene-panel');
      if (!player) { scene.innerHTML = ''; return; }
      const loc = e.world.get(player.locationId);
      let html = `<h2>${loc ? loc.name : 'Неизвестно'}</h2>`;
      if (loc && loc.image) html += `<div class="scene-image" data-image="${loc.image}">[изображение локации: ${loc.image}]</div>`;
      if (loc && loc.description) html += `<p class="scene-desc">${loc.description}</p>`;

      // NPC здесь
      const here = e.npcs.filter(n => n.alive && !n.isPlayer && n.locationId === player.locationId);
      html += '<h3>Люди рядом</h3>';
      if (here.length === 0) html += '<p class="dim">Здесь никого нет.</p>';
      else {
        html += '<ul class="npc-list">';
        for (const n of here) {
          const r = n.relationships[player.id];
          html += `<li><button class="npc-btn" data-npc="${n.id}">${n.name}</button> <span class="dim">${n.activity}${r ? ' · ' + r.label : ''}</span></li>`;
        }
        html += '</ul>';
      }

      // Объекты
      if (loc && loc.objects.length) {
        html += '<h3>Объекты</h3><ul class="obj-list">';
        for (const o of loc.objects) {
          const state = o.kind === 'door' ? (o.state.locked ? 'заперта' : 'открыта')
                      : o.kind === 'chest' ? (o.state.locked ? 'заперт' : 'открыт')
                      : o.kind === 'grave' ? o.state.cause : '';
          html += `<li>${o.name} <span class="dim">(${state})</span>${o.kind === 'door' || o.kind === 'chest' ? ` <button class="obj-btn" data-obj="${o.id}">${o.state.locked ? 'Открыть' : 'Закрыть'}</button>` : ''}</li>`;
        }
        html += '</ul>';
      }

      // Действия игрока
      html += `<div class="actions">
        <button id="act-eat">Поесть</button>
        <button id="act-sleep">Спать до утра</button>
        <button id="act-save">Сохранить</button>
      </div>`;
      scene.innerHTML = html;

      scene.querySelectorAll('.npc-btn').forEach(btn => {
        btn.addEventListener('click', () => this.openDialogue(btn.dataset.npc));
      });
      scene.querySelectorAll('.obj-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const obj = loc.findObject(btn.dataset.obj);
          if (obj) { obj.state.locked = !obj.state.locked; this.renderScene(); }
        });
      });
      this.el('act-eat').addEventListener('click', () => { this.engine.playerEat(); this.renderAll(); });
      this.el('act-sleep').addEventListener('click', () => { this.engine.playerSleep(); this.renderAll(); });
      this.el('act-save').addEventListener('click', () => {
        const ok = this.engine.saveSystem.save('autosave');
        this.appendLog(ok ? '[система] Игра сохранена (слот autosave).' : '[система] Ошибка сохранения!');
      });
    }

    openDialogue(npcId) {
      const e = this.engine;
      const npc = e.getNPC(npcId);
      if (!npc) return;
      this.dialogueTarget = npc;
      const box = this.el('dialogue-box');
      const opts = e.dialogue.options(npc, e.player);
      let html = `<div class="dlg-head"><b>${npc.name}</b> <span class="dim">${npc.job ? npc.job.title : 'без работы'}, ${npc.age(e.time.totalDays)} лет</span>
        <button id="dlg-close">×</button></div><div class="dlg-text" id="dlg-text">Вы подходите к ${npc.name}.</div><div class="dlg-opts">`;
      for (const o of opts) html += `<button class="dlg-opt" data-opt="${o.id}">${o.label}</button>`;
      html += '</div>';
      box.innerHTML = html;
      box.classList.add('open');
      this.el('dlg-close').addEventListener('click', () => { box.classList.remove('open'); box.innerHTML = ''; });
      box.querySelectorAll('.dlg-opt').forEach(btn => {
        btn.addEventListener('click', () => this.dialogueAction(btn.dataset.opt));
      });
    }

    dialogueAction(opt) {
      const e = this.engine;
      const npc = this.dialogueTarget;
      const player = e.player;
      const textEl = this.el('dlg-text');
      let result;
      switch (opt) {
        case 'greet': result = e.dialogue.greet(npc, player); break;
        case 'rumor': result = e.dialogue.tellRumor(npc, player); break;
        case 'opinion': {
          const others = e.npcs.filter(n => n.alive && n.id !== npc.id && n.id !== player.id).slice(0, 20);
          const names = others.map(n => n.name);
          const pickName = prompt('О ком спросить? Например: ' + names.slice(0, 5).join(', '));
          const target = others.find(n => n.name === pickName);
          result = target ? e.dialogue.opinionAbout(npc, player, target.id) : { text: 'Не знаю такого человека.' };
          break;
        }
        case 'compliment': result = e.dialogue.compliment(npc, player); break;
        case 'insult': result = e.dialogue.insult(npc, player); break;
        case 'propose': result = e.dialogue.propose(npc, player); break;
        default: result = { text: '...' };
      }
      textEl.textContent = npc.name + ': «' + result.text + '»';
      e.tick(5); // разговор занимает время
      this.renderHeader();
      this.renderPlayer();
    }

    renderPlayer() {
      const e = this.engine;
      const p = e.player;
      const panel = this.el('player-panel');
      if (!p) { panel.innerHTML = '<p>Игрок не создан.</p>'; return; }
      const spouse = p.family.spouse ? e.getNPC(p.family.spouse) : null;
      let html = `<h3>${p.name}</h3>
        <p class="dim">${p.age(e.time.totalDays)} лет · ${p.lifeStage(e.time.totalDays)} · ${p.alive ? 'жив' : 'мёртв'}</p>
        <table class="stats">
          <tr><td>Здоровье</td><td>${Math.round(p.health)}</td></tr>
          <tr><td>Голод</td><td>${Math.round(p.hunger)}</td></tr>
          <tr><td>Энергия</td><td>${Math.round(p.energy)}</td></tr>
          <tr><td>Деньги</td><td>${Math.round(p.money)} монет</td></tr>
          <tr><td>Работа</td><td>${p.job ? p.job.title : 'нет'}</td></tr>
          <tr><td>Супруг(а)</td><td>${spouse ? spouse.name : '—'}</td></tr>
          <tr><td>Дети</td><td>${p.family.children.length}</td></tr>
        </table>`;
      // отношения
      const rels = Object.keys(p.relationships);
      if (rels.length) {
        html += '<h4>Отношения</h4><ul class="rel-list">';
        for (const id of rels.slice(0, 12)) {
          const n = e.getNPC(id);
          const r = p.relationships[id];
          if (n) html += `<li>${n.name}: <b>${r.label}</b> <span class="dim">(доверие ${Math.round(r.trust)}, симпатия ${Math.round(r.affection)})</span></li>`;
        }
        html += '</ul>';
      }
      // слухи игрока
      if (p.knowledge.length) {
        html += '<h4>Известные слухи</h4><ul class="rel-list">';
        for (const rid of p.knowledge.slice(-6)) {
          const r = e.systems.rumors.rumors[rid];
          if (r) html += `<li>«${r.content}» <span class="dim">(достоверность ${r.reliability})</span></li>`;
        }
        html += '</ul>';
      }
      panel.innerHTML = html;
    }

    appendLog(entry) {
      const log = this.el('log-panel');
      if (!log) return;
      const div = document.createElement('div');
      div.className = 'log-entry';
      div.textContent = entry;
      log.appendChild(div);
      while (log.children.length > 300) log.removeChild(log.firstChild);
      log.scrollTop = log.scrollHeight;
    }
  }

  global.AOT = global.AOT || {};
  global.AOT.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
