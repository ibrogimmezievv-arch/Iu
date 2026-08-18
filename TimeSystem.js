/* ============================================================
 * TimeSystem.js — игровое время.
 * Минимальная единица — минута. Скорости: 1x / 5x / 20x / 100x.
 * Ускорение = больше тиков симуляции, а не "скип времени".
 * Стартовая дата: 1 января 845 года (канон AoT), граница мира — 1500 год.
 * ============================================================ */
(function (global) {
  'use strict';

  const MINUTES_PER_HOUR = 60;
  const HOURS_PER_DAY = 24;
  const DAYS_PER_MONTH = 30; // упрощённый календарь: 12 месяцев по 30 дней
  const MONTHS_PER_YEAR = 12;
  const WORLD_END_YEAR = 1500;

  const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                       'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

  class TimeSystem {
    constructor(startYear) {
      this.totalMinutes = 0; // минут с начала мира
      this.startYear = startYear || 845;
      this.speed = 1;        // 1 | 5 | 20 | 100
      this.paused = false;
    }

    // Абсолютная дата
    get year()  { return this.startYear + Math.floor(this.totalMinutes / (MINUTES_PER_HOUR * HOURS_PER_DAY * DAYS_PER_MONTH * MONTHS_PER_YEAR)); }
    get month() { return Math.floor(this.totalMinutes / (MINUTES_PER_HOUR * HOURS_PER_DAY * DAYS_PER_MONTH)) % MONTHS_PER_YEAR; } // 0..11
    get day()   { return Math.floor(this.totalMinutes / (MINUTES_PER_HOUR * HOURS_PER_DAY)) % DAYS_PER_MONTH + 1; } // 1..30
    get hour()  { return Math.floor(this.totalMinutes / MINUTES_PER_HOUR) % HOURS_PER_DAY; }
    get minute(){ return this.totalMinutes % MINUTES_PER_HOUR; }
    get totalDays() { return Math.floor(this.totalMinutes / (MINUTES_PER_HOUR * HOURS_PER_DAY)); }

    isWorldEnded() { return this.year >= WORLD_END_YEAR; }

    // Продвинуть время на n минут (симуляция вызывается движком на каждую минуту)
    advance(minutes) {
      this.totalMinutes += minutes;
    }

    setSpeed(s) {
      if ([1, 5, 20, 100].includes(s)) this.speed = s;
    }

    format() {
      const hh = String(this.hour).padStart(2, '0');
      const mm = String(this.minute).padStart(2, '0');
      return `${hh}:${mm} — ${this.day} ${MONTH_NAMES[this.month]} ${this.year} г.`;
    }
    formatShort() {
      return `${String(this.hour).padStart(2,'0')}:${String(this.minute).padStart(2,'0')}`;
    }
    formatDate() {
      return `${this.day} ${MONTH_NAMES[this.month]} ${this.year} г.`;
    }

    serialize() {
      return { totalMinutes: this.totalMinutes, startYear: this.startYear, speed: this.speed };
    }
    static deserialize(d) {
      const t = new TimeSystem(d.startYear);
      t.totalMinutes = d.totalMinutes;
      t.speed = d.speed || 1;
      return t;
    }
  }

  TimeSystem.WORLD_END_YEAR = WORLD_END_YEAR;
  TimeSystem.MONTH_NAMES = MONTH_NAMES;

  global.AOT = global.AOT || {};
  global.AOT.TimeSystem = TimeSystem;
})(typeof window !== 'undefined' ? window : globalThis);
