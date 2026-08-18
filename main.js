/* ============================================================
 * main.js — точка входа: стартовый экран, игровой цикл.
 * ============================================================ */
(function () {
  'use strict';

  const AOT = window.AOT;
  let engine = null;
  let ui = null;
  let timer = null;

  // 1 реальная секунда = 10 игровых минут на скорости 1x
  const MINUTES_PER_REAL_SECOND = 10;

  function startLoop() {
    stopLoop();
    timer = setInterval(() => {
      if (!engine || engine.time.paused) return;
      engine.tick(MINUTES_PER_REAL_SECOND * engine.time.speed);
      ui.renderHeader();
      // перерисовка сцены раз в ~5 секунд, чтобы не мешать диалогу
      if (Math.floor(engine.time.totalMinutes / 50) !== ui._lastRenderMark) {
        ui._lastRenderMark = Math.floor(engine.time.totalMinutes / 50);
        ui.renderMap();
        ui.renderScene();
        ui.renderPlayer();
      }
    }, 1000);
  }
  function stopLoop() { if (timer) { clearInterval(timer); timer = null; } }

  function newGame() {
    const seed = parseInt(document.getElementById('seed-input').value, 10) || 12345;
    const name = document.getElementById('name-input').value.trim() || 'Странник';
    const gender = document.getElementById('gender-input').value;
    engine = new AOT.GameEngine(seed);
    engine.saveSystem = new AOT.SaveSystem(engine);
    engine.systems.economy.init();
    engine.initNewWorld(name, gender);
    ui = new AOT.UI(engine);
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    ui.renderAll();
    startLoop();
  }

  function loadGame(slot) {
    const temp = new AOT.GameEngine(1);
    const ss = new AOT.SaveSystem(temp);
    const data = ss.load(slot);
    if (!data) { alert('Слот пуст или повреждён.'); return; }
    engine = AOT.GameEngine.fromSaveData(data);
    engine.saveSystem = new AOT.SaveSystem(engine);
    ui = new AOT.UI(engine);
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    ui.renderAll();
    // восстановить журнал
    const logPanel = document.getElementById('log-panel');
    logPanel.innerHTML = '';
    for (const entry of engine.log.slice(-100)) ui.appendLog(entry);
    startLoop();
  }

  function refreshSlots() {
    const list = document.getElementById('saves-list');
    const slots = AOT.SaveSystem.listSlots();
    if (slots.length === 0) { list.innerHTML = '<p class="dim">Сохранений нет.</p>'; return; }
    let html = '';
    for (const s of slots) {
      html += `<div class="save-slot"><b>${s.slot}</b> — ${s.playerName || '?'} · ${s.gameDate || '?'}
        <button class="load-btn" data-slot="${s.slot}">Загрузить</button></div>`;
    }
    list.innerHTML = html;
    list.querySelectorAll('.load-btn').forEach(btn => {
      btn.addEventListener('click', () => loadGame(btn.dataset.slot));
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-new-game').addEventListener('click', newGame);
    document.getElementById('btn-random-seed').addEventListener('click', () => {
      document.getElementById('seed-input').value = Math.floor(Math.random() * 999999);
    });
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!engine) return;
        if (btn.dataset.speed === 'pause') {
          engine.time.paused = !engine.time.paused;
        } else {
          engine.time.setSpeed(parseInt(btn.dataset.speed, 10));
          engine.time.paused = false;
        }
        ui.renderHeader();
      });
    });
    refreshSlots();
  });
})();
