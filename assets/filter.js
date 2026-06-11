(function () {
  "use strict";

  var severitySelect = document.getElementById("severity-filter");
  var categorySelect = document.getElementById("category-filter");
  if (!severitySelect || !categorySelect) {
    return;
  }

  function applyFilters() {
    var severity = severitySelect.value;
    var category = categorySelect.value;
    var rows = document.querySelectorAll("#cve-rows .cve-row");
    rows.forEach(function (row) {
      var matchesSeverity = severity === "" || row.dataset.severity === severity;
      var matchesCategory = category === "" || row.dataset.category === category;
      row.hidden = !(matchesSeverity && matchesCategory);
    });
  }

  severitySelect.addEventListener("change", applyFilters);
  categorySelect.addEventListener("change", applyFilters);
})();
