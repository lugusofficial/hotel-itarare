/* Sua Marca: menu no celular e ano do rodapé. A página funciona sem este arquivo. */
(function () {
  'use strict';
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav');
  var mobile = window.matchMedia('(max-width: 59.99em)');

  function sync() {
    if (!toggle || !nav) return;
    nav.hidden = mobile.matches;
    toggle.setAttribute('aria-expanded', 'false');
  }

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      nav.hidden = !nav.hidden;
      toggle.setAttribute('aria-expanded', String(!nav.hidden));
    });
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a') && mobile.matches) sync();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && mobile.matches && !nav.hidden) { sync(); toggle.focus(); }
    });
    if (mobile.addEventListener) mobile.addEventListener('change', sync);
    sync();
  }

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
