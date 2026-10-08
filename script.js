(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var debug = /[?&]debug=1/.test(window.location.search);
  var still = debug && /[?&]still=1/.test(window.location.search);
  if (still) root.classList.add('is-still');

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* =========================================================
     DADOS
     ========================================================= */
  var ICONS = {
    wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5.1-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8.9-.1.2-.3.2-.6.1-.2-.1-1-.4-2-1.2-.7-.6-1.2-1.4-1.4-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.2.2-.4.1-.2 0-.3 0-.4-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9 0 1.1.8 2.2.9 2.4.1.2 1.6 2.5 3.9 3.4.5.2.9.4 1.3.5.5.2 1 .1 1.3.1.4-.1 1.2-.5 1.4-1 .2-.5.2-.9.1-1z"/></svg>',
    ig: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.8"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg>',
    ms: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.2c-5 0-8.8 3.6-8.8 8.2 0 2.5 1.1 4.6 3 6.1v3.3l3-1.6c.9.3 1.8.4 2.8.4 5 0 8.8-3.6 8.8-8.2S17 3.2 12 3.2z"/><path d="M7.6 13.4l3.1-3.3 2.3 2.2 3.4-3.5"/></svg>',
    em: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>',
    st: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.8"/><path d="M3.4 12h17.2M12 3.2c2.4 2.5 3.6 5.4 3.6 8.8s-1.2 6.3-3.6 8.8c-2.4-2.5-3.6-5.4-3.6-8.8S9.6 5.7 12 3.2z"/></svg>',
    ph: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h3l1.5 4-2 1.3a11 11 0 005.2 5.2l1.3-2 4 1.5v3a2 2 0 01-2 2A15 15 0 013 6a2 2 0 012-2z"/></svg>'
  };

  // Conversas que viajam da mão humana para a mão digital durante a intro.
  var MESSAGES = [
    { id: 'wa', msg: 'Olá! Têm vaga esta semana?' },
    { id: 'ig', msg: 'Quanto custa?' },
    { id: 'em', msg: 'Pedido de orçamento' },
    { id: 'ms', msg: 'Ainda está disponível?' },
    { id: 'st', msg: 'Novo formulário recebido' }
  ];

  // As áreas de trabalho, presas aos nós da mão digital (da ponta do dedo para o braço).
  var AREAS = ['IA', 'Automações', 'CRM', 'WhatsApp', 'Instagram', 'Email', 'Site'];

  var FLOW_CHANNELS = ['wa', 'ig', 'ms', 'em', 'st', 'ph'];

  function badge(id) {
    return '<span class="ch ch--' + id + '">' + ICONS[id] + '</span>';
  }

  /* =========================================================
     CENA — as duas mãos
     ========================================================= */
  var sceneApi = window.ElevenScene;
  var canvas = $('#scene');
  var sceneOk = false;
  try {
    sceneOk = !!(sceneApi && canvas && sceneApi.init(canvas, { reduceMotion: reduceMotion, preserve: debug }));
  } catch (err) {
    sceneOk = false;
  }
  if (!sceneOk) root.classList.add('no-webgl');
  var S = sceneOk ? sceneApi.state : {};

  function isPortrait() {
    return window.innerWidth < 760 || window.innerWidth / window.innerHeight < 0.8;
  }

  // Enquadramento das mãos: grande e ao centro na intro; na página, o toque fica
  // no corredor entre o mote e o calendário (desktop) ou no topo (telemóvel).
  function framing(phase) {
    var W = window.innerWidth;
    var H = window.innerHeight;
    if (isPortrait()) {
      return phase === 'intro'
        ? { sceneRot: 62, angle: 20, camZ: 76, shiftX: 0, shiftY: H * 0.13, dim: 1 }
        : { sceneRot: 0, angle: 9, camZ: 104, shiftX: 0, shiftY: H * 0.5 - Math.max(130, H * 0.17), dim: 0.95 };
    }
    if (phase === 'intro') return { sceneRot: 0, angle: 22, camZ: 52, shiftX: 0, shiftY: H * 0.04, dim: 1 };

    var cx = W * 0.54;
    var cy = H * 0.5;
    var cardEl = document.getElementById('booking');
    if (cardEl) {
      var r = cardEl.getBoundingClientRect();
      var gap = parseFloat(window.getComputedStyle(cardEl.parentNode).columnGap) || 96;
      cx = r.left - gap * 0.85;
      cy = r.top + r.height * 0.6;
    }
    return { sceneRot: 0, angle: 31, camZ: 68, shiftX: cx - W / 2, shiftY: H / 2 - cy, dim: 0.88 };
  }

  var FINAL = { form0: 1, form1: 1, gap: 0.32, energy: 100, reveal: 1e5, ring: 0, glow: 1, threads: 1, dust: 1 };

  function settleScene() {
    if (!sceneOk) return;
    Object.assign(S, FINAL, framing('final'));
    if (reduceMotion) sceneApi.render();
  }

  // Onda de energia verde a partir do ponto de contacto (usada também numa marcação).
  function pulse() {
    if (!sceneOk || reduceMotion || !window.gsap) return;
    window.gsap.fromTo(S, { energy: 0 }, { energy: 100, duration: 2.4, ease: 'power1.out' });
    var spark = $('#spark');
    var ripple = $('#ripple');
    window.gsap.fromTo(spark, { opacity: 0.9, scale: 0.4 }, { opacity: 0, scale: 1.8, duration: 1.1, ease: 'power2.out' });
    window.gsap.fromTo(ripple, { opacity: 0.8, scale: 0.2 }, { opacity: 0, scale: 5, duration: 1.4, ease: 'power2.out' });
  }

  /* etiquetas, faísca e conversas acompanham a cena a cada fotograma */
  var labelEls = [];
  var bubbleEls = [];
  var bubbleState = [];
  var sparkEl = $('#spark');
  var rippleEl = $('#ripple');

  function buildLabels() {
    var wrap = $('#labels');
    if (!sceneOk || !wrap) return [];
    var anchors = sceneApi.anchors.labels;
    var count = isPortrait() ? 6 : AREAS.length;
    wrap.innerHTML = '';
    labelEls = [];
    for (var i = 0; i < count && i < anchors.length; i++) {
      var el = document.createElement('span');
      el.className = 'lbl';
      el.textContent = AREAS[i];
      el.__anchor = anchors[i];
      wrap.appendChild(el);
      labelEls.push(el);
    }
    return labelEls;
  }

  function buildBubbles() {
    var wrap = $('#bubbles');
    if (!sceneOk || !wrap) return [];
    // as conversas partem dos dedos da mão humana (e não do punho)
    var threads = sceneApi.anchors.threads.slice().sort(function (p, q) { return q[0].local[0] - p[0].local[0]; });
    var count = isPortrait() ? 3 : MESSAGES.length;
    wrap.innerHTML = '';
    bubbleEls = [];
    bubbleState = [];
    for (var i = 0; i < count && i < threads.length; i++) {
      var el = document.createElement('div');
      el.className = 'bubble';
      el.innerHTML = badge(MESSAGES[i].id) + '<span>' + MESSAGES[i].msg + '</span>';
      wrap.appendChild(el);
      bubbleEls.push(el);
      bubbleState.push({ t: 0, o: 0, a: threads[i][0], b: threads[i][1] });
    }
    return bubbleEls;
  }

  if (sceneOk) {
    sceneApi.onFrame(function () {
      var c = sceneApi.contact();
      if (sparkEl) { sparkEl.style.left = c.x + 'px'; sparkEl.style.top = c.y + 'px'; }
      if (rippleEl) { rippleEl.style.left = c.x + 'px'; rippleEl.style.top = c.y + 'px'; }
      for (var i = 0; i < labelEls.length; i++) {
        var p = sceneApi.screenOf(labelEls[i].__anchor);
        labelEls[i].style.transform = 'translate3d(' + (p.x - 11).toFixed(1) + 'px,' + (p.y - 11).toFixed(1) + 'px,0)';
      }
      for (var j = 0; j < bubbleEls.length; j++) {
        var st = bubbleState[j];
        if (st.o <= 0.001) { bubbleEls[j].style.opacity = 0; continue; }
        var a = sceneApi.screenOf(st.a);
        var b = sceneApi.screenOf(st.b);
        var k = st.t * st.t * (3 - 2 * st.t);
        var x = a.x + (b.x - a.x) * k;
        var y = a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * 26;
        bubbleEls[j].style.opacity = st.o;
        bubbleEls[j].style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) translate(-50%,-50%) scale(' + (0.86 + 0.14 * Math.sin(k * Math.PI)).toFixed(3) + ')';
      }
    });
  }

  /* =========================================================
     PÁGINA
     ========================================================= */
  var flowChannels = $('#flowChannels');
  if (flowChannels) flowChannels.innerHTML = FLOW_CHANNELS.map(badge).join('');

  var topBar = $('.top');
  if (topBar) {
    var onScroll = function () { topBar.classList.toggle('is-scrolled', window.scrollY > 10); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* texto que se "descodifica" */
  var GLYPHS = '01<>/{}[]#_$*+=ABCDEFGHKLMNPRSTVXZ';

  function scramble(el, delay) {
    var finalText = el.getAttribute('data-text') || el.textContent;
    el.setAttribute('data-text', finalText);
    if (reduceMotion || still) { el.textContent = finalText; return; }
    var duration = 900;
    var start = null;
    function frame(ts) {
      if (start === null) start = ts;
      var progress = Math.min(1, (ts - start) / duration);
      var revealed = Math.floor(progress * finalText.length);
      var out = '';
      for (var i = 0; i < finalText.length; i++) {
        var ch = finalText[i];
        out += (i < revealed || ch === ' ') ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      el.textContent = out;
      if (progress < 1) requestAnimationFrame(frame);
      else el.textContent = finalText;
    }
    setTimeout(function () { requestAnimationFrame(frame); }, delay);
    // Garante o texto final mesmo que o separador fique em segundo plano a meio.
    setTimeout(function () { el.textContent = finalText; }, delay + duration + 600);
  }

  function runScrambles(baseDelay) {
    $$('[data-scramble]').forEach(function (el, idx) { scramble(el, baseDelay + idx * 240); });
  }

  /* =========================================================
     LUZ QUE SEGUE O CURSOR NO CARTÃO
     ========================================================= */
  var card = $('#booking');
  if (card) {
    card.addEventListener('pointermove', function (e) {
      var rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - rect.left) + 'px');
      card.style.setProperty('--my', (e.clientY - rect.top) + 'px');
    });
  }

  /* =========================================================
     AGENDAMENTO — CALENDÁRIO SEMANAL
     ========================================================= */
  (function booking() {
    if (!card) return;

    var daysEl = $('#bookingDays');
    var slotsEl = $('#bookingSlots');
    var step1 = $('#bookingStep1');
    var form = $('#bookingForm');
    var backBtn = $('#bookingBack');
    var summaryEl = $('#bookingSummary');
    var errorEl = $('#bookingError');
    var noticeEl = $('#bookingNotice');
    var successEl = $('#bookingSuccess');
    var successText = $('#bookingSuccessText');
    var submitBtn = $('#bookingSubmit');
    var headEl = $('#bookingHead');
    var stepLabel = $('#bookingStepLabel');
    var titleEl = $('#bookingTitle');
    var weekTitle = $('#weekTitle');
    var weekRange = $('#weekRange');
    var prevBtn = $('#weekPrev');
    var nextBtn = $('#weekNext');
    var tzNote = $('#tzNote');

    var TZ = 'Europe/Lisbon';
    var MAX_DAYS_AHEAD = 30; // igual ao backend (api/_calendar.js)
    var DAY_MS = 86400000;
    var WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    var WEEKDAYS_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    var MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var PHONE_RE = /^\+[1-9]\d{7,14}$/;

    function pad(n) { return String(n).padStart(2, '0'); }
    function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
    function mondayOf(d) { var wd = d.getDay(); return addDays(d, wd === 0 ? -6 : 1 - wd); }

    // "Hoje" em Lisboa, para coincidir com as regras do servidor.
    function lisbonToday() {
      try {
        var parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
        var m = {};
        parts.forEach(function (p) { m[p.type] = p.value; });
        return new Date(+m.year, +m.month - 1, +m.day);
      } catch (e) {
        var n = new Date();
        return new Date(n.getFullYear(), n.getMonth(), n.getDate());
      }
    }

    function tzOffsetMs(ms) {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).formatToParts(new Date(ms));
      var m = {};
      parts.forEach(function (p) { m[p.type] = p.value; });
      return Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour % 24, +m.minute, +m.second) - ms;
    }

    // Hora local do visitante para um horário de Lisboa ('' se for igual).
    function localLabel(dateStr, timeStr) {
      try {
        var d = dateStr.split('-').map(Number);
        var t = timeStr.split(':').map(Number);
        var guess = Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]);
        var inst = new Date(guess - tzOffsetMs(guess));
        var label = pad(inst.getHours()) + ':' + pad(inst.getMinutes());
        if (label === timeStr) return '';
        var diff = Math.round((new Date(inst.getFullYear(), inst.getMonth(), inst.getDate()) - new Date(d[0], d[1] - 1, d[2])) / DAY_MS);
        return label + (diff > 0 ? ' +1d' : diff < 0 ? ' −1d' : '');
      } catch (e) {
        return '';
      }
    }

    var today = lisbonToday();
    var lastDay = addDays(today, MAX_DAYS_AHEAD);
    var thisMonday = mondayOf(today);
    var firstWeek = (today.getDay() === 6 || today.getDay() === 0) ? addDays(thisMonday, 7) : thisMonday;

    var state = {
      weekStart: firstWeek,
      entries: [],
      date: null,
      dateLabel: '',
      time: null,
      local: '',
      userPicked: false,
      preferDate: null,
      autoAdvance: true
    };
    var cache = {};
    var renderToken = 0;
    var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

    function getSlots(dateStr) {
      if (!cache[dateStr]) {
        cache[dateStr] = fetch('/api/availability?date=' + encodeURIComponent(dateStr))
          .then(function (r) { if (!r.ok) throw new Error('http_' + r.status); return r.json(); })
          .then(function (data) { return data.slots || []; })
          .catch(function (err) { delete cache[dateStr]; throw err; });
      }
      return cache[dateStr];
    }

    function setStep(n) {
      if (n === 1) { stepLabel.textContent = 'Passo 1 de 2'; titleEl.textContent = 'Agende uma demonstração'; }
      if (n === 2) { stepLabel.textContent = 'Passo 2 de 2'; titleEl.textContent = 'Os seus dados'; }
      headEl.hidden = n === 3;
    }

    function weekLabels(start) {
      var diff = Math.round((start - thisMonday) / (7 * DAY_MS));
      var title = diff <= 0 ? 'Esta semana' : diff === 1 ? 'Próxima semana' : 'Daqui a ' + diff + ' semanas';
      var end = addDays(start, 4);
      var range = start.getMonth() === end.getMonth()
        ? start.getDate() + ' – ' + end.getDate() + ' ' + MONTHS[end.getMonth()]
        : start.getDate() + ' ' + MONTHS[start.getMonth()] + ' – ' + end.getDate() + ' ' + MONTHS[end.getMonth()];
      return { title: title, range: range };
    }

    function showSkeleton() {
      var html = '<div class="skeleton" aria-hidden="true">';
      for (var i = 0; i < 9; i++) html += '<span></span>';
      slotsEl.innerHTML = html + '</div>';
      tzNote.hidden = true;
    }

    function renderError() {
      slotsEl.innerHTML = '<div class="empty"><p>Não foi possível carregar os horários.</p>' +
        '<button type="button" class="link" data-retry>Tentar novamente</button></div>';
      tzNote.hidden = true;
    }

    function renderWeek() {
      var token = ++renderToken;
      var start = state.weekStart;
      var labels = weekLabels(start);
      weekTitle.textContent = labels.title;
      weekRange.textContent = labels.range;
      prevBtn.disabled = start <= firstWeek;
      nextBtn.disabled = addDays(start, 7) > lastDay;

      state.date = null;
      state.userPicked = false;
      daysEl.innerHTML = '';
      var entries = [];

      for (var i = 0; i < 5; i++) {
        (function (i) {
          var d = addDays(start, i);
          var dateStr = iso(d);
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'day';
          btn.style.setProperty('--i', i);
          btn.setAttribute('aria-pressed', 'false');
          btn.innerHTML = '<span class="day__dow">' + WEEKDAYS[d.getDay()] + '</span>' +
            '<span class="day__num">' + d.getDate() + '</span><span class="day__count"></span>';
          var countEl = btn.querySelector('.day__count');
          var entry = { btn: btn, date: d, dateStr: dateStr, count: null, promise: null };
          var label = WEEKDAYS_LONG[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()];

          if (d < today || d > lastDay) {
            btn.disabled = true;
            countEl.textContent = '—';
            entry.count = 0;
            btn.setAttribute('aria-label', label + ', indisponível');
          } else {
            btn.classList.add('is-loading');
            btn.setAttribute('aria-label', label);
            btn.addEventListener('click', function () { selectDay(entry, true); });
            entry.promise = getSlots(dateStr).then(function (slots) {
              if (token !== renderToken) return;
              entry.count = slots.length;
              btn.classList.remove('is-loading');
              countEl.textContent = slots.length ? slots.length + (slots.length === 1 ? ' vaga' : ' vagas') : 'Sem vagas';
              btn.setAttribute('aria-label', label + ', ' + countEl.textContent);
              if (!slots.length) btn.disabled = true;
            }, function () {
              if (token !== renderToken) return;
              entry.count = -1;
              btn.classList.remove('is-loading');
              countEl.textContent = '—';
            });
          }
          entries.push(entry);
          daysEl.appendChild(btn);
        })(i);
      }

      state.entries = entries;
      showSkeleton();

      Promise.all(entries.map(function (e) { return e.promise || Promise.resolve(); })).then(function () {
        if (token !== renderToken || state.userPicked) return;
        var autoAdvance = state.autoAdvance;
        state.autoAdvance = false;

        var preferred = null;
        if (state.preferDate) {
          preferred = entries.filter(function (e) { return e.dateStr === state.preferDate && e.count > 0; })[0] || null;
          state.preferDate = null;
        }
        var target = preferred || entries.filter(function (e) { return e.count > 0; })[0];
        if (target) { selectDay(target, false); return; }

        if (entries.some(function (e) { return e.count === -1; })) { renderError(); return; }

        // Semana sem vagas: na primeira visita salta para a seguinte.
        if (autoAdvance && !nextBtn.disabled) {
          state.weekStart = addDays(state.weekStart, 7);
          renderWeek();
          return;
        }
        slotsEl.innerHTML = '<div class="empty"><p>Sem vagas nesta semana.</p>' +
          (nextBtn.disabled ? '' : '<button type="button" class="link" data-next>Ver semana seguinte →</button>') + '</div>';
      });
    }

    function selectDay(entry, byUser) {
      if (byUser) state.userPicked = true;
      noticeEl.hidden = true;
      state.entries.forEach(function (e) {
        e.btn.classList.remove('is-active');
        e.btn.setAttribute('aria-pressed', 'false');
      });
      entry.btn.classList.add('is-active');
      entry.btn.setAttribute('aria-pressed', 'true');
      state.date = entry.dateStr;
      state.dateLabel = WEEKDAYS_LONG[entry.date.getDay()] + ', ' + entry.date.getDate() + ' ' + MONTHS[entry.date.getMonth()];

      var dateStr = entry.dateStr;
      showSkeleton();
      getSlots(dateStr).then(function (slots) {
        if (state.date === dateStr) renderSlots(slots);
      }, function () {
        if (state.date === dateStr) renderError();
      });
    }

    function renderSlots(slots) {
      if (!slots.length) {
        slotsEl.innerHTML = '<p class="hint">Sem vagas neste dia. Escolha outro dia.</p>';
        tzNote.hidden = true;
        return;
      }
      var grid = document.createElement('div');
      grid.className = 'slots__grid';
      var anyLocal = false;
      slots.forEach(function (slot, idx) {
        var local = localLabel(state.date, slot.start);
        if (local) anyLocal = true;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'slot';
        b.style.animationDelay = (idx * 30) + 'ms';
        b.innerHTML = '<span class="slot__time">' + slot.start + '</span>' + (local ? '<span class="slot__local">' + local + '</span>' : '');
        b.setAttribute('aria-label', slot.start + ' (hora de Lisboa)' + (local ? ', ' + local + ' na sua hora local' : ''));
        b.addEventListener('click', function () { selectSlot(slot.start, local); });
        grid.appendChild(b);
      });
      slotsEl.innerHTML = '';
      slotsEl.appendChild(grid);
      tzNote.hidden = !anyLocal;
    }

    function selectSlot(time, local) {
      state.time = time;
      state.local = local;
      summaryEl.innerHTML = '<span class="form__summary-main">' + state.dateLabel + ' · ' + time + '</span>' +
        '<span class="form__summary-sub">Hora de Lisboa' + (local ? ' · ' + local + ' na sua hora' : '') + '</span>';
      step1.hidden = true;
      successEl.hidden = true;
      errorEl.hidden = true;
      form.reset();
      form.hidden = false;
      setStep(2);
      if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      if (!coarse) {
        var nameInput = $('#bkName');
        try { nameInput.focus({ preventScroll: true }); } catch (e) { nameInput.focus(); }
      }
    }

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.hidden = false;
    }

    slotsEl.addEventListener('click', function (e) {
      if (e.target.closest('[data-retry]')) {
        cache = {};
        renderWeek();
      } else if (e.target.closest('[data-next]')) {
        state.weekStart = addDays(state.weekStart, 7);
        renderWeek();
      }
    });

    prevBtn.addEventListener('click', function () {
      if (prevBtn.disabled) return;
      noticeEl.hidden = true;
      state.weekStart = addDays(state.weekStart, -7);
      renderWeek();
    });

    nextBtn.addEventListener('click', function () {
      if (nextBtn.disabled) return;
      noticeEl.hidden = true;
      state.weekStart = addDays(state.weekStart, 7);
      renderWeek();
    });

    backBtn.addEventListener('click', function () {
      form.hidden = true;
      step1.hidden = false;
      setStep(1);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorEl.hidden = true;

      var name = $('#bkName').value.trim();
      var email = $('#bkEmail').value.trim();
      var phone = $('#bkPhone').value.trim().replace(/[\s-]/g, '');

      if (name.length < 2) { showError('Introduza o seu nome.'); return; }
      if (!EMAIL_RE.test(email)) { showError('Introduza um email válido.'); return; }
      if (!PHONE_RE.test(phone)) { showError('Introduza um telefone válido, com indicativo do país (ex: +351912345678).'); return; }

      submitBtn.disabled = true;
      submitBtn.textContent = 'A confirmar…';

      fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: state.date, time: state.time, name: name, email: email, phone: phone })
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (data) { return { ok: r.ok, data: data }; });
        })
        .then(function (res) {
          if (!res.ok) {
            if (res.data && res.data.error === 'slot_taken') {
              delete cache[state.date];
              state.preferDate = state.date;
              form.hidden = true;
              step1.hidden = false;
              setStep(1);
              renderWeek();
              noticeEl.textContent = 'Esse horário acabou de ser reservado. Escolha outro, por favor.';
              noticeEl.hidden = false;
            } else {
              showError('Não foi possível confirmar a marcação. Tente novamente.');
            }
            return;
          }
          delete cache[state.date];
          form.hidden = true;
          setStep(3);
          successText.textContent = 'Ficou marcada para ' + state.dateLabel + ', às ' + state.time + ' (hora de Lisboa)' +
            (state.local ? ' — ' + state.local + ' na sua hora local' : '') + '.';
          successEl.hidden = false;
          pulse();
        })
        .catch(function () {
          showError('Não foi possível confirmar a marcação. Verifique a sua ligação e tente novamente.');
        })
        .then(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Confirmar demonstração';
        });
    });

    renderWeek();
  })();

  /* =========================================================
     INTRO — "O Toque"
     ========================================================= */
  function quickStart() {
    var intro = $('#intro');
    root.classList.remove('is-intro', 'is-leaving');
    root.classList.add('is-quick', 'is-dark');
    if (intro && intro.parentNode) intro.parentNode.removeChild(intro);
    var mainEl = $('#main');
    if (mainEl) mainEl.inert = false;
    if (card) card.classList.add('is-open');
    settleScene();
    if (sceneOk) sceneApi.start();
    runScrambles(250);
  }

  function startIntro() {
    var gsap = window.gsap;
    window.__ecIntroStarted = true;

    var intro = $('#intro');
    var mainEl = $('#main');
    mainEl.inert = true;

    var W = window.innerWidth;
    var H = window.innerHeight;
    var portrait = isPortrait();
    var fI = framing('intro');
    var fF = framing('final');

    Object.assign(S, fI, { form0: 0, form1: 0, gap: portrait ? 11 : 15, energy: 0, reveal: 0, ring: 0, glow: 0, threads: 0, dust: 1 });
    var labels = buildLabels();
    buildBubbles();
    sceneApi.start();

    var heads = $$('.ih', intro);
    var bar = $('#introBar');
    var chrome = [$('.intro__hud', intro), $('.intro__progress', intro), $('#introSkip')];

    function headIn(el) {
      return gsap.fromTo(el,
        { opacity: 0, y: 26, filter: 'blur(10px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.8, ease: 'power3.out' });
    }
    function headOut(el) {
      return gsap.to(el, { opacity: 0, y: -18, filter: 'blur(8px)', duration: 0.45, ease: 'power2.in' });
    }

    var tl = gsap.timeline({ defaults: { ease: 'power3.out' }, onComplete: finish });
    if (debug) window.__ecTl = tl;

    /* 1 — Pessoas conversam: a mão humana forma-se a partir do pó */
    tl.to(S, { form0: 1, duration: 2.4, ease: 'power2.inOut' }, 0.1)
      .add(headIn(heads[0]), 0.6);

    /* 2 — A tecnologia conecta: a mão digital tece-se em rede, as conversas viajam pelos fios */
    tl.to(S, { form1: 1, duration: 2.2, ease: 'power2.inOut' }, 1.2)
      .add(headOut(heads[0]), 2.45)
      .add(headIn(heads[1]), 2.7)
      .to(S, { threads: 1, duration: 1.2, ease: 'power1.inOut' }, 2.3)
      .fromTo(labels, { opacity: 0 }, { opacity: 1, duration: 0.5, stagger: 0.09 }, 2.7)
      .to(S, { gap: 0.32, duration: 2.3, ease: 'power2.inOut' }, 2.6)
      .to(S, { camZ: fI.camZ - 7, duration: 3.2, ease: 'power1.inOut' }, 2.2);
    bubbleState.forEach(function (st, i) {
      var t0 = 2.9 + i * 0.3;
      tl.to(st, { o: 1, duration: 0.25 }, t0)
        .to(st, { t: 1, duration: 1.15, ease: 'power1.inOut' }, t0)
        .to(st, { o: 0, duration: 0.25 }, t0 + 0.95);
    });

    /* 3 — O toque: energia verde e o escuro abre-se a partir dos dedos */
    var TT = 5.0;
    var diag = Math.sqrt(W * W + H * H) + 80;
    tl.add(headOut(heads[1]), TT - 0.35)
      .call(function () {
        var c = sceneApi.contact();
        S.revealX = c.x;
        S.revealY = c.y;
      }, null, TT)
      .fromTo(sparkEl, { opacity: 0, scale: 0.2 }, { opacity: 1, scale: 1.25, duration: 0.22, ease: 'power2.out' }, TT)
      .to(sparkEl, { opacity: 0, scale: 2.4, duration: 1.2, ease: 'power2.out' }, TT + 0.22)
      .fromTo(rippleEl, { opacity: 0.9, scale: 0.1 }, { opacity: 0, scale: 7, duration: 1.5, ease: 'power2.out', immediateRender: false }, TT + 0.05)
      .to(S, { energy: 100, duration: 2.6, ease: 'power1.out' }, TT)
      .fromTo(S, { reveal: 0, ring: 1 }, { reveal: diag, duration: 1.45, ease: 'power3.in', immediateRender: false }, TT + 0.15)
      .to(S, { ring: 0, duration: 0.4 }, TT + 1.45)
      .to(S, { glow: 1, duration: 1.2 }, TT + 0.6)
      .add(headIn(heads[2]), TT + 1.15)
      .call(function () { root.classList.add('is-dark'); }, null, TT + 0.95)
      .to(labels, { opacity: 0, duration: 0.6, stagger: 0.03 }, TT + 1.3);

    /* 4 — A página aparece e o calendário abre */
    var TR = TT + 2.2;
    tl.add(headOut(heads[2]), TR)
      .to(S, {
        camZ: fF.camZ, shiftX: fF.shiftX, shiftY: fF.shiftY,
        angle: fF.angle, sceneRot: fF.sceneRot, dim: fF.dim,
        duration: 1.5, ease: 'power3.inOut'
      }, TR - 0.2)
      .to(chrome, { opacity: 0, duration: 0.4 }, TR - 0.1)
      .call(function () {
        root.classList.add('is-leaving');
        runScrambles(250);
      }, null, TR + 0.15)
      .to(card, { opacity: 1, duration: 0.7, ease: 'power2.out' }, TR + 0.55)
      .call(function () { card.classList.add('is-open'); }, null, TR + 0.6)
      .fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: TR, ease: 'none' }, 0);

    /* salvaguarda: conta só a partir do momento em que a intro começa a tocar */
    var finished = false;
    tl.eventCallback('onStart', function () {
      setTimeout(function () { if (!finished) tl.progress(1); }, (tl.duration() + 6) * 1000);
    });

    /* saltar */
    var skipped = false;
    function skip() {
      if (skipped) return;
      skipped = true;
      if (tl.time() < TT - 0.4) tl.seek(TT - 0.4);
      tl.timeScale(2.2);
    }
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') skip();
    }
    var startWidth = W;
    function onResize() {
      if (Math.abs(window.innerWidth - startWidth) > 40) skip();
    }
    $('#introSkip').addEventListener('click', skip);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);

    // Depuração: ?debug=1&t=3.5 congela a intro nesse instante.
    var tParam = debug && /[?&]t=([\d.]+)/.exec(window.location.search);
    if (tParam) {
      tl.pause();
      tl.seek(parseFloat(tParam[1]), false);
    }

    function finish() {
      if (finished) return;
      finished = true;
      root.classList.remove('is-intro', 'is-leaving');
      root.classList.add('is-dark');
      mainEl.inert = false;
      card.classList.add('is-open');
      if (intro.parentNode) intro.parentNode.removeChild(intro);
      labelEls.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
      labelEls = [];
      bubbleEls = [];
      bubbleState = [];
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      settleScene();
      try { sessionStorage.setItem('ec_intro_seen', '1'); } catch (e) {}
    }
  }

  var canIntro = root.classList.contains('is-intro') && window.gsap && sceneOk && !reduceMotion && card;
  if (canIntro) {
    try {
      startIntro();
    } catch (err) {
      quickStart();
    }
  } else {
    quickStart();
  }

  // Ajusta o enquadramento quando o ecrã muda (ex.: rodar o telemóvel), fora da intro.
  window.addEventListener('resize', function () {
    if (!root.classList.contains('is-intro')) settleScene();
  });

  if (debug) window.__ec = { S: S, scene: sceneApi };
})();
