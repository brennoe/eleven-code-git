(function () {
  var burger = document.getElementById('burgerBtn');
  var menu = document.getElementById('mobileMenu');

  if (burger && menu) {
    burger.addEventListener('click', function () {
      var isOpen = menu.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    menu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        menu.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  var header = document.getElementById('header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('header--scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  var reveals = document.querySelectorAll('.reveal');
  if (reveals.length && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    reveals.forEach(function (el) { observer.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }
})();

(function () {
  var booking = document.getElementById('booking');
  if (!booking) return;

  var daysEl = document.getElementById('bookingDays');
  var slotsEl = document.getElementById('bookingSlots');
  var step1 = document.getElementById('bookingStep1');
  var form = document.getElementById('bookingForm');
  var backBtn = document.getElementById('bookingBack');
  var summaryEl = document.getElementById('bookingSummary');
  var errorEl = document.getElementById('bookingError');
  var successEl = document.getElementById('bookingSuccess');
  var successText = document.getElementById('bookingSuccessText');
  var submitBtn = document.getElementById('bookingSubmit');

  var state = { date: null, dateLabel: '', time: null };

  var WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var PHONE_RE = /^\+[1-9]\d{7,14}$/;

  function pad(n) { return String(n).padStart(2, '0'); }
  function toISODate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function buildDays() {
    var days = [];
    var base = new Date();
    var i = 0;
    while (days.length < 10 && i < 30) {
      var candidate = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      var dow = candidate.getDay();
      if (dow !== 0 && dow !== 6) days.push(candidate);
      i++;
    }
    return days;
  }

  function renderDays() {
    var days = buildDays();
    daysEl.innerHTML = '';
    days.forEach(function (d, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day-pill';
      btn.innerHTML =
        '<span class="day-pill__dow">' + WEEKDAYS[d.getDay()] + '</span>' +
        '<span class="day-pill__num">' + d.getDate() + '</span>' +
        '<span class="day-pill__month">' + MONTHS[d.getMonth()] + '</span>';
      btn.addEventListener('click', function () { selectDay(d, btn); });
      daysEl.appendChild(btn);
      if (idx === 0) selectDay(d, btn);
    });
  }

  function selectDay(d, btn) {
    Array.prototype.forEach.call(daysEl.children, function (c) { c.classList.remove('is-active'); });
    btn.classList.add('is-active');
    state.date = toISODate(d);
    state.dateLabel = WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
    loadSlots();
  }

  function loadSlots() {
    slotsEl.innerHTML = '<p class="booking__hint">A carregar horários…</p>';
    fetch('/api/availability?date=' + encodeURIComponent(state.date))
      .then(function (r) { if (!r.ok) throw new Error('fail'); return r.json(); })
      .then(function (data) {
        if (!data.slots || !data.slots.length) {
          slotsEl.innerHTML = '<p class="booking__hint">Sem horários disponíveis neste dia. Escolha outro dia.</p>';
          return;
        }
        var grid = document.createElement('div');
        grid.className = 'slots-grid';
        data.slots.forEach(function (slot) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'slot-btn';
          b.textContent = slot.start;
          b.addEventListener('click', function () { selectSlot(slot); });
          grid.appendChild(b);
        });
        slotsEl.innerHTML = '';
        slotsEl.appendChild(grid);
      })
      .catch(function () {
        slotsEl.innerHTML = '<p class="booking__hint">Não foi possível carregar os horários. Tente novamente.</p>';
      });
  }

  function selectSlot(slot) {
    state.time = slot.start;
    summaryEl.textContent = state.dateLabel + ' às ' + slot.start;
    step1.hidden = true;
    successEl.hidden = true;
    errorEl.hidden = true;
    form.reset();
    form.hidden = false;
  }

  backBtn.addEventListener('click', function () {
    form.hidden = true;
    step1.hidden = false;
  });

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorEl.hidden = true;

    var name = document.getElementById('bkName').value.trim();
    var email = document.getElementById('bkEmail').value.trim();
    var phone = document.getElementById('bkPhone').value.trim().replace(/[\s-]/g, '');

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
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
      .then(function (res) {
        if (!res.ok) {
          if (res.data && res.data.error === 'slot_taken') {
            showError('Este horário acabou de ser reservado. Escolha outro, por favor.');
            form.hidden = true;
            step1.hidden = false;
            loadSlots();
          } else {
            showError('Não foi possível confirmar a marcação. Tente novamente.');
          }
          return;
        }
        form.hidden = true;
        successText.textContent = 'A sua call ficou marcada para ' + state.dateLabel + ' às ' + state.time + '.';
        successEl.hidden = false;
      })
      .catch(function () {
        showError('Não foi possível confirmar a marcação. Verifique a sua ligação e tente novamente.');
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirmar marcação';
      });
  });

  renderDays();
})();
