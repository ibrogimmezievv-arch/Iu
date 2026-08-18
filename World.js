/* ============================================================
 * World.js — мир и иерархия локаций.
 * World → Region → District → Street → Building → Floor → Room
 * Каждая локация имеет постоянный ID. Локации не пересоздаются.
 * Объекты (двери, сундуки) имеют постоянное состояние.
 * Pathfinding — BFS по графу связей локаций.
 * ============================================================ */
(function (global) {
  'use strict';

  let locCounter = 0;

  class Location {
    constructor(id, name, type, parentId) {
      this.id = id;
      this.name = name;
      this.type = type;           // region|district|street|building|floor|room
      this.parentId = parentId || null;
      this.children = [];         // id дочерних локаций
      this.links = [];            // id связанных локаций (для перемещения)
      this.objects = [];          // {id, kind, name, state:{...}}
      this.image = null;          // путь к изображению (привязка location ID → image)
      this.description = '';
      this.businessId = null;     // если здесь бизнес
      this.tags = [];
    }
    addObject(obj) { this.objects.push(obj); return obj; }
    findObject(objId) { return this.objects.find(o => o.id === objId); }
    serialize() {
      return {
        id: this.id, name: this.name, type: this.type, parentId: this.parentId,
        children: this.children, links: this.links, objects: this.objects,
        image: this.image, description: this.description,
        businessId: this.businessId, tags: this.tags
      };
    }
    static deserialize(d) {
      const l = new Location(d.id, d.name, d.type, d.parentId);
      l.children = d.children || []; l.links = d.links || [];
      l.objects = d.objects || []; l.image = d.image || null;
      l.description = d.description || ''; l.businessId = d.businessId || null;
      l.tags = d.tags || [];
      return l;
    }
  }

  class World {
    constructor(rng) {
      this.rng = rng;
      this.locations = {}; // id → Location
      this.rootId = null;
    }

    addLocation(loc) {
      this.locations[loc.id] = loc;
      if (loc.parentId && this.locations[loc.parentId]) {
        this.locations[loc.parentId].children.push(loc.id);
      }
      return loc;
    }
    get(id) { return this.locations[id]; }
    link(a, b) {
      const la = this.locations[a], lb = this.locations[b];
      if (la && lb && la.links.indexOf(b) === -1) la.links.push(b);
      if (la && lb && lb.links.indexOf(a) === -1) lb.links.push(a);
    }

    // Все локации определённого типа
    byType(type) {
      return Object.values(this.locations).filter(l => l.type === type);
    }
    byTag(tag) {
      return Object.values(this.locations).filter(l => l.tags.indexOf(tag) !== -1);
    }

    // BFS поиск пути между локациями. Возвращает массив id (без стартовой) или null.
    findPath(fromId, toId) {
      if (fromId === toId) return [];
      if (!this.locations[fromId] || !this.locations[toId]) return null;
      const prev = {};
      const visited = { [fromId]: true };
      const queue = [fromId];
      while (queue.length) {
        const cur = queue.shift();
        const loc = this.locations[cur];
        const neighbors = loc.links.concat(loc.children);
        if (loc.parentId) neighbors.push(loc.parentId);
        for (const n of neighbors) {
          if (visited[n] || !this.locations[n]) continue;
          // закрытые двери блокируют проход в комнату
          if (!this.isPassable(n)) continue;
          visited[n] = true;
          prev[n] = cur;
          if (n === toId) {
            const path = [];
            let c = toId;
            while (c !== fromId) { path.unshift(c); c = prev[c]; }
            return path;
          }
          queue.push(n);
        }
      }
      return null;
    }

    // Проходима ли локация (двери на входе не заперты)
    isPassable(locId) {
      const loc = this.locations[locId];
      if (!loc) return false;
      for (const o of loc.objects) {
        if (o.kind === 'door' && o.state.locked) return false;
      }
      return true;
    }

    // Расстояние в шагах (для уровней симуляции Near/Mid/Far)
    distance(a, b) {
      const p = this.findPath(a, b);
      return p ? p.length : Infinity;
    }

    /* ---------- Генерация мира: Регион Стена Мария → Трост ---------- */
    static generate(rng) {
      const world = new World(rng);

      const region = world.addLocation(new Location('wall_maria', 'Стена Мария', 'region', null));
      world.rootId = region.id;
      region.description = 'Южная территория человечества за Стеной Мария.';
      region.image = 'assets/locations/wall_maria.jpg';

      const trost = world.addLocation(new Location('trost', 'Район Трост', 'district', region.id));
      trost.description = 'Южный город-выступ Стены Мария. Здесь квартированы кадеты 104-го корпуса.';
      trost.image = 'assets/locations/trost.jpg';

      // Улицы
      const marketStreet = world.addLocation(new Location('trost_market_street', 'Рыночная улица', 'street', trost.id));
      const resStreet = world.addLocation(new Location('trost_residential_street', 'Жилая улица', 'street', trost.id));
      const milStreet = world.addLocation(new Location('trost_military_street', 'Военная улица', 'street', trost.id));
      world.link(trost.id, marketStreet.id);
      world.link(trost.id, resStreet.id);
      world.link(trost.id, milStreet.id);
      world.link(marketStreet.id, resStreet.id);
      world.link(marketStreet.id, milStreet.id);

      // Рынок
      const market = world.addLocation(new Location('trost_market', 'Рынок Троста', 'building', marketStreet.id));
      market.description = 'Шумный рынок: торговцы, покупатели, слухи.';
      market.image = 'assets/locations/trost_market.jpg';
      market.tags.push('public', 'commerce');
      world.link(marketStreet.id, market.id);

      const bakery = world.addLocation(new Location('trost_bakery', 'Пекарня «У Миры»', 'building', marketStreet.id));
      bakery.businessId = 'biz_bakery';
      bakery.tags.push('commerce', 'food');
      world.link(marketStreet.id, bakery.id);

      const tavern = world.addLocation(new Location('trost_tavern', 'Таверна «Сломанное копьё»', 'building', marketStreet.id));
      tavern.businessId = 'biz_tavern';
      tavern.tags.push('commerce', 'food', 'rumors');
      world.link(marketStreet.id, tavern.id);

      const shop = world.addLocation(new Location('trost_market_shop_01', 'Лавка товаров', 'building', marketStreet.id));
      shop.businessId = 'biz_shop';
      shop.tags.push('commerce');
      world.link(marketStreet.id, shop.id);

      // Жилые дома (каждый: здание → этаж → комнаты)
      const homes = [];
      for (let h = 1; h <= 6; h++) {
        const hid = 'trost_home_0' + h;
        const home = world.addLocation(new Location(hid, 'Жилой дом №' + h, 'building', resStreet.id));
        home.tags.push('residential');
        world.link(resStreet.id, home.id);
        const floor = world.addLocation(new Location(hid + '_f1', 'Первый этаж', 'floor', home.id));
        const room = world.addLocation(new Location(hid + '_room', 'Жилая комната', 'room', floor.id));
        room.tags.push('home');
        room.addObject({ id: hid + '_door', kind: 'door', name: 'Входная дверь', state: { locked: false } });
        room.addObject({ id: hid + '_chest', kind: 'chest', name: 'Сундук', state: { locked: true, items: [] } });
        homes.push(room.id);
      }

      // Военные объекты
      const barracks = world.addLocation(new Location('trost_barracks', 'Казармы кадетов', 'building', milStreet.id));
      barracks.tags.push('military');
      world.link(milStreet.id, barracks.id);
      const dorm = world.addLocation(new Location('trost_barracks_dorm', 'Спальня кадетов', 'room', barracks.id));
      dorm.tags.push('sleep', 'military');
      const mess = world.addLocation(new Location('trost_barracks_mess', 'Столовая казарм', 'room', barracks.id));
      mess.tags.push('food', 'military');
      world.link(barracks.id, dorm.id);
      world.link(barracks.id, mess.id);

      const hq = world.addLocation(new Location('trost_hq', 'Штаб гарнизона', 'building', milStreet.id));
      hq.tags.push('military', 'government');
      world.link(milStreet.id, hq.id);
      const hqOffice = world.addLocation(new Location('trost_hq_office', 'Кабинет командира', 'room', hq.id));
      hqOffice.tags.push('office');
      world.link(hq.id, hqOffice.id);

      // Правосудие
      const garrisonJail = world.addLocation(new Location('trost_jail', 'СИЗО Троста', 'building', milStreet.id));
      garrisonJail.tags.push('law', 'prison');
      world.link(milStreet.id, garrisonJail.id);
      const cell = world.addLocation(new Location('trost_jail_cell', 'Камера СИЗО', 'room', garrisonJail.id));
      cell.addObject({ id: 'cell_door', kind: 'door', name: 'Решётка камеры', state: { locked: true } });
      world.link(garrisonJail.id, cell.id);

      const court = world.addLocation(new Location('trost_court', 'Суд Троста', 'building', milStreet.id));
      court.tags.push('law', 'government');
      world.link(milStreet.id, court.id);

      const prison = world.addLocation(new Location('trost_prison', 'Тюрьма Троста', 'building', milStreet.id));
      prison.tags.push('law', 'prison');
      world.link(milStreet.id, prison.id);

      // Кладбище
      const cemetery = world.addLocation(new Location('trost_cemetery', 'Кладбище Троста', 'building', resStreet.id));
      cemetery.tags.push('memorial');
      cemetery.description = 'Тихое место. Здесь хоронят жителей Троста.';
      world.link(resStreet.id, cemetery.id);

      // Ворота и стена
      const gate = world.addLocation(new Location('trost_gate', 'Ворота Троста', 'building', trost.id));
      gate.tags.push('military', 'landmark');
      world.link(trost.id, gate.id);

      world.homes = homes;
      return world;
    }

    serialize() {
      const locs = {};
      for (const id in this.locations) locs[id] = this.locations[id].serialize();
      return { locations: locs, rootId: this.rootId, homes: this.homes };
    }
    static deserialize(d, rng) {
      const w = new World(rng);
      for (const id in d.locations) w.locations[id] = Location.deserialize(d.locations[id]);
      w.rootId = d.rootId;
      w.homes = d.homes || [];
      return w;
    }
  }

  global.AOT = global.AOT || {};
  global.AOT.Location = Location;
  global.AOT.World = World;
})(typeof window !== 'undefined' ? window : globalThis);
