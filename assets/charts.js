(function () {
  "use strict";

  var items = document.querySelectorAll("#category-chart li");
  var max = 0;
  items.forEach(function (item) {
    max = Math.max(max, Number(item.dataset.value) || 0);
  });
  if (max === 0) {
    return;
  }

  items.forEach(function (item) {
    var value = Number(item.dataset.value) || 0;
    var bar = item.querySelector(".bar");
    if (bar) {
      bar.style.width = String(Math.round((value / max) * 100)) + "%";
    }
  });
})();
