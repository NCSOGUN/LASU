(function () {
  "use strict";

  var STORAGE_KEYS = {
    theme: "healthaccess.apiDocs.theme",
    baseUrl: "healthaccess.apiDocs.baseUrl",
    token: "healthaccess.apiDocs.token"
  };

  var STATUS_TEXT = {
    200: "OK",
    201: "Created",
    202: "Accepted",
    204: "No Content",
    301: "Moved Permanently",
    302: "Found",
    304: "Not Modified",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    409: "Conflict",
    410: "Gone",
    413: "Payload Too Large",
    415: "Unsupported Media Type",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout"
  };

  var docs = window.__API_DOCS__;
  var state = {
    groups: [],
    flat: [],
    byId: new Map(),
    activeId: null,
    query: "",
    baseUrl: "",
    token: "",
    sample: false,
    sending: false,
    bodyDrafts: new Map(),
    lastResponse: ""
  };

  var dom = {};
  var toastTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function all(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escCode(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function inline(value) {
    return esc(value).replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  function paragraphs(value) {
    return String(value || "")
      .split(/\n{2,}/)
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean)
      .map(function (part) {
        return "<p>" + inline(part) + "</p>";
      })
      .join("");
  }

  function readStorage(key, fallback) {
    try {
      var value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      /* Storage can be unavailable in private mode. The page still works. */
    }
  }

  function isHttpUrl(value) {
    return /^https?:\/\/\S+/i.test(String(value || "").trim());
  }

  function defaultBaseUrl() {
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
      return window.location.origin + "/v1";
    }
    return "http://localhost:3000/v1";
  }

  function methodClass(method) {
    return "method-" + String(method || "").toLowerCase();
  }

  function statusClass(status) {
    var code = Number(status);
    if (code >= 200 && code < 300) return "status-2xx";
    if (code >= 300 && code < 400) return "status-3xx";
    if (code >= 500) return "status-5xx";
    return "status-4xx";
  }

  function statusLabel(status, label) {
    if (label) return String(label);
    return STATUS_TEXT[Number(status)] || "Response";
  }

  function statusTitle(status, label) {
    var text = statusLabel(status, label);
    return text ? String(status) + " " + text : String(status);
  }

  function methodAllowsBody(method) {
    return ["POST", "PUT", "PATCH", "DELETE"].indexOf(String(method || "").toUpperCase()) !== -1;
  }

  function contentTypeOf(ep) {
    return String((ep && ep.contentType) || "").toLowerCase();
  }

  function isMultipart(ep) {
    return contentTypeOf(ep).indexOf("multipart/form-data") !== -1;
  }

  function endpointHasBody(ep) {
    return (
      methodAllowsBody(ep.method) &&
      (ep.bodyExample !== undefined ||
        isMultipart(ep) ||
        (Array.isArray(ep.bodyFields) && ep.bodyFields.length > 0))
    );
  }

  function prettyJson(value) {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch (error) {
        return value;
      }
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return String(value);
    }
  }

  function highlightJson(value) {
    var text = typeof value === "string" ? value : prettyJson(value);
    var escaped = escCode(text);
    var pattern = /("(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    return escaped.replace(pattern, function (match) {
      var className = "tok-number";
      if (match.charAt(0) === '"') {
        className = /:\s*$/.test(match) ? "tok-key" : "tok-string";
      } else if (match === "true" || match === "false") {
        className = "tok-boolean";
      } else if (match === "null") {
        className = "tok-null";
      }
      return '<span class="' + className + '">' + match + "</span>";
    });
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function formatBuildDate(value) {
    if (!value) return "";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    try {
      return new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric"
      }).format(date);
    } catch (error) {
      return date.toISOString().slice(0, 10);
    }
  }

  function joinBase(base) {
    return String(base || "").trim().replace(/\/+$/, "");
  }

  function buildUrl(base, path, pathValues, queryValues, keepTokens) {
    var urlPath = String(path || "").replace(
      /(?::([A-Za-z0-9_]+))|(?:\{([A-Za-z0-9_]+)\})/g,
      function (match, colonName, braceName) {
        var name = colonName || braceName;
        var value = pathValues && pathValues[name] !== undefined ? String(pathValues[name]) : "";
        if (!value) {
          return keepTokens ? match : (colonName ? ":" + name : "{" + name + "}");
        }
        return encodeURIComponent(value);
      }
    );
    if (urlPath.charAt(0) !== "/") urlPath = "/" + urlPath;

    var pairs = [];
    (queryValues || []).forEach(function (entry) {
      var value = entry && entry.value !== undefined && entry.value !== null ? String(entry.value) : "";
      if (value !== "") {
        pairs.push(encodeURIComponent(entry.name) + "=" + encodeURIComponent(value));
      }
    });

    return joinBase(base) + urlPath + (pairs.length ? "?" + pairs.join("&") : "");
  }

  function paramExample(param) {
    if (!param) return "";
    if (param.example !== undefined && param.example !== null && String(param.example) !== "") {
      return String(param.example);
    }
    if (param.default !== undefined && param.default !== null) {
      return String(param.default);
    }
    return "";
  }

  function placeholderForType(type) {
    var value = String(type || "").toLowerCase();
    if (value.indexOf("uuid") !== -1) return "00000000-0000-4000-8000-000000000000";
    if (value.indexOf("int") !== -1 || value.indexOf("number") !== -1) return "1";
    if (value.indexOf("bool") !== -1) return "true";
    if (value.indexOf("date") !== -1) return "2026-01-01";
    return "example";
  }

  function examplePathValues(ep) {
    var values = {};
    (ep.pathParams || []).forEach(function (param) {
      values[param.name] = paramExample(param) || placeholderForType(param.type);
    });
    return values;
  }

  function exampleQueryValues(ep) {
    return (ep.queryParams || [])
      .map(function (param) {
        var value = paramExample(param);
        if (!value && param.required) value = placeholderForType(param.type);
        return { name: param.name, value: value };
      })
      .filter(function (entry) {
        return entry.value !== "";
      });
  }

  function buildExampleUrl(ep) {
    return buildUrl(state.baseUrl, ep.path, examplePathValues(ep), exampleQueryValues(ep), false);
  }

  function shellQuote(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
  }

  function fieldIsFile(field) {
    return /image|file|document|attachment/i.test(field.name || "") ||
      /file|image|document|binary/i.test(field.type || "");
  }

  function buildCurl(ep) {
    var lines = ["curl -sS -X " + ep.method + " " + shellQuote(buildExampleUrl(ep))];
    lines.push("  -H " + shellQuote("Accept: application/json"));
    if (ep.auth === "bearer") {
      lines.push("  -H " + shellQuote("Authorization: Bearer <access-jwt>"));
    }

    if (isMultipart(ep)) {
      (ep.bodyFields || []).forEach(function (field) {
        var value = fieldIsFile(field)
          ? "@" + (field.name === "images" ? "photo.jpg" : "document.pdf")
          : "<" + field.name + ">";
        lines.push("  -F " + shellQuote(field.name + "=" + value));
      });
    } else if (ep.bodyExample !== undefined && ep.bodyExample !== null) {
      lines.push("  -H " + shellQuote("Content-Type: application/json"));
      lines.push("  -d " + shellQuote(prettyJson(ep.bodyExample)));
    }

    return lines.join(" \\\n");
  }

  function buildFetch(ep) {
    var url = JSON.stringify(buildExampleUrl(ep));
    var headerLines = ['    "Accept": "application/json"'];
    if (ep.auth === "bearer") {
      headerLines.push('    "Authorization": "Bearer <access-jwt>"');
    }

    if (isMultipart(ep)) {
      var formLines = ["const form = new FormData();"];
      (ep.bodyFields || []).forEach(function (field) {
        var value = fieldIsFile(field)
          ? field.name === "images"
            ? "fileInput.files"
            : "fileInput.files[0]"
          : JSON.stringify("<" + field.name + ">");
        formLines.push(
          "form.append(" + JSON.stringify(field.name) + ", " + value + ");"
        );
      });
      return (
        formLines.join("\n") +
        "\n\nconst response = await fetch(" +
        url +
        ", {\n  method: " +
        JSON.stringify(ep.method) +
        ",\n  headers: {\n" +
        headerLines.join(",\n") +
        "\n  },\n  body: form\n});\n\nconst data = await response.json();\nconsole.log(response.status, data);"
      );
    }

    var initLines = ["  method: " + JSON.stringify(ep.method) + ","];
    var hasJsonBody = ep.bodyExample !== undefined && ep.bodyExample !== null;
    if (hasJsonBody) {
      headerLines.push('    "Content-Type": "application/json"');
    }
    var headersBlock = "  headers: {\n" + headerLines.join(",\n") + "\n  }";
    initLines.push(hasJsonBody ? headersBlock + "," : headersBlock);
    if (hasJsonBody) {
      initLines.push(
        "  body: JSON.stringify(" +
          prettyJson(ep.bodyExample).replace(/\n/g, "\n  ") +
          ")"
      );
    }

    return (
      "const response = await fetch(" +
      url +
      ", {\n" +
      initLines.join("\n") +
      "\n});\n\nconst data = await response.json();\nconsole.log(response.status, data);"
    );
  }

  function setTheme(theme, persist) {
    var next = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    if (dom.themeToggle) {
      dom.themeToggle.setAttribute("aria-pressed", next === "dark" ? "true" : "false");
      dom.themeToggle.setAttribute(
        "aria-label",
        next === "dark" ? "Switch to light theme" : "Switch to dark theme"
      );
    }
    if (persist) writeStorage(STORAGE_KEYS.theme, next);
  }

  function showToast(message) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      dom.toast.classList.remove("is-visible");
    }, 1700);
  }

  function flashCopy(button) {
    if (!button) return;
    button.classList.add("is-copied");
    window.setTimeout(function () {
      button.classList.remove("is-copied");
    }, 1200);
  }

  function fallbackCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    var copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    }
    document.body.removeChild(area);
    return copied;
  }

  function copyText(text, button) {
    if (!text) {
      showToast("Nothing to copy");
      return;
    }
    function done() {
      flashCopy(button);
      showToast("Copied to clipboard");
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () {
        if (fallbackCopy(text)) done();
        else showToast("Copy failed. Select the text and copy it manually.");
      });
      return;
    }
    if (fallbackCopy(text)) done();
    else showToast("Copy failed. Select the text and copy it manually.");
  }

  function copyTextFor(button) {
    if (button.hasAttribute("data-copy-value")) {
      return button.getAttribute("data-copy-value") || "";
    }
    var selector = button.getAttribute("data-copy-target");
    if (selector) {
      var target = document.querySelector(selector);
      return target ? target.textContent : "";
    }
    if (button.hasAttribute("data-copy-panel")) {
      var panel = button.closest(".panel");
      var source = panel
        ? panel.querySelector('[role="tabpanel"]:not([hidden]) [data-copy-source]')
        : null;
      return source ? source.textContent : "";
    }
    return "";
  }

  function initData() {
    if (!docs || !Array.isArray(docs.groups)) {
      renderFatal(
        "The embedded API data is missing or invalid.",
        "Rebuild the reference with node docs/api/build.mjs, then reload this page."
      );
      return false;
    }

    state.sample = Boolean(docs.meta && docs.meta.sample);
    state.groups = docs.groups.map(function (group) {
      return {
        name: group.name || "Endpoints",
        description: group.description || "",
        endpoints: Array.isArray(group.endpoints) ? group.endpoints.slice() : []
      };
    });
    state.flat = [];
    state.byId = new Map();

    state.groups.forEach(function (group) {
      group.endpoints.forEach(function (endpoint) {
        endpoint._group = group.name;
        endpoint._index = state.flat.length;
        state.flat.push(endpoint);
        state.byId.set(endpoint.id, endpoint);
      });
    });

    if (docs.meta && docs.meta.version) {
      var badge = document.querySelector(".version-badge");
      if (badge) {
        badge.textContent = docs.meta.version;
        badge.setAttribute("aria-label", "API version " + String(docs.meta.version).replace(/^v/i, ""));
      }
    }

    return true;
  }

  function init() {
    dom = {
      baseUrl: byId("baseUrl"),
      search: byId("search"),
      searchClear: byId("searchClear"),
      themeToggle: byId("themeToggle"),
      navToggle: byId("navToggle"),
      navClose: byId("navClose"),
      sidebar: byId("sidebar"),
      endpointNav: byId("endpointNav"),
      endpointCount: byId("endpointCount"),
      sidebarFoot: byId("sidebarFoot"),
      drawerBackdrop: byId("drawerBackdrop"),
      endpointRoot: byId("endpointRoot"),
      statusBanner: byId("statusBanner"),
      main: byId("main"),
      toast: byId("toast"),
      topbar: document.querySelector(".topbar")
    };

    setTheme(document.documentElement.dataset.theme, false);
    state.baseUrl = isHttpUrl(readStorage(STORAGE_KEYS.baseUrl, ""))
      ? readStorage(STORAGE_KEYS.baseUrl, "")
      : defaultBaseUrl();
    state.token = readStorage(STORAGE_KEYS.token, "");
    dom.baseUrl.value = state.baseUrl;

    var valid = initData();
    renderSidebar();
    renderStatusBanner();
    renderSidebarFoot();
    wireGlobalEvents();

    if (valid) {
      if (state.flat.length) {
        routeFromHash(true);
      } else {
        renderEmpty();
      }
    }

    measureTopbar();
  }

  function wireGlobalEvents() {
    dom.baseUrl.addEventListener("input", function (event) {
      setBaseUrl(event.target.value, "top");
    });

    dom.search.addEventListener("input", function () {
      state.query = dom.search.value;
      renderSidebar();
    });

    dom.search.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        var first = firstVisibleEndpoint();
        if (first) {
          window.location.hash = encodeURIComponent(first.id);
        }
      } else if (event.key === "Escape") {
        if (dom.search.value) {
          dom.search.value = "";
          state.query = "";
          renderSidebar();
        } else {
          dom.search.blur();
        }
      }
    });

    dom.searchClear.addEventListener("click", function () {
      dom.search.value = "";
      state.query = "";
      renderSidebar();
      dom.search.focus();
    });

    dom.themeToggle.addEventListener("click", function () {
      var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      setTheme(next, true);
    });

    dom.navToggle.addEventListener("click", openDrawer);
    dom.navClose.addEventListener("click", function () {
      closeDrawer(true);
    });
    dom.drawerBackdrop.addEventListener("click", function () {
      closeDrawer(true);
    });

    dom.endpointNav.addEventListener("click", function (event) {
      var link = event.target.closest("a[data-endpoint-id]");
      if (!link) return;
      closeDrawer(false);
      if (link.getAttribute("data-endpoint-id") === state.activeId) {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
    });

    document.addEventListener("click", function (event) {
      var button = event.target.closest("[data-copy-value], [data-copy-target], [data-copy-panel]");
      if (!button) return;
      copyText(copyTextFor(button), button);
    });

    window.addEventListener("hashchange", function () {
      routeFromHash(false);
    });

    document.addEventListener("keydown", function (event) {
      var target = event.target;
      var typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (event.key === "Escape" && dom.sidebar.classList.contains("is-open")) {
        closeDrawer(true);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === "k") {
        event.preventDefault();
        dom.search.focus();
        dom.search.select();
        return;
      }

      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        dom.search.focus();
        dom.search.select();
      }
    });

    window.addEventListener("resize", function () {
      measureTopbar();
      if (window.innerWidth > 860 && dom.sidebar.classList.contains("is-open")) {
        closeDrawer(false);
      }
    });

    if ("ResizeObserver" in window && dom.topbar) {
      new ResizeObserver(measureTopbar).observe(dom.topbar);
    }
  }

  function measureTopbar() {
    if (!dom.topbar) return;
    var height = Math.round(dom.topbar.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--topbar-h", height + "px");
  }

  function openDrawer() {
    dom.sidebar.classList.add("is-open");
    dom.drawerBackdrop.classList.add("is-open");
    dom.drawerBackdrop.setAttribute("aria-hidden", "false");
    dom.navToggle.setAttribute("aria-expanded", "true");
    dom.navToggle.setAttribute("aria-label", "Close endpoint list");
    document.body.style.overflow = "hidden";
    dom.navClose.focus();
  }

  function closeDrawer(returnFocus) {
    if (!dom.sidebar.classList.contains("is-open")) return;
    dom.sidebar.classList.remove("is-open");
    dom.drawerBackdrop.classList.remove("is-open");
    dom.drawerBackdrop.setAttribute("aria-hidden", "true");
    dom.navToggle.setAttribute("aria-expanded", "false");
    dom.navToggle.setAttribute("aria-label", "Open endpoint list");
    document.body.style.overflow = "";
    if (returnFocus) dom.navToggle.focus();
  }

  function filteredGroups() {
    var query = state.query.trim().toLowerCase();
    return state.groups
      .map(function (group) {
        var endpoints = group.endpoints.filter(function (endpoint) {
          if (!query) return true;
          var haystack = [
            endpoint.name,
            endpoint.path,
            endpoint.summary,
            endpoint.id,
            group.name
          ]
            .join(" ")
            .toLowerCase();
          return haystack.indexOf(query) !== -1;
        });
        return { name: group.name, description: group.description, endpoints: endpoints };
      })
      .filter(function (group) {
        return group.endpoints.length > 0;
      });
  }

  function firstVisibleEndpoint() {
    var groups = filteredGroups();
    return groups.length ? groups[0].endpoints[0] : null;
  }

  function renderSidebar() {
    if (!dom.endpointNav) return;
    var query = state.query.trim();
    var groups = filteredGroups();
    var matchCount = groups.reduce(function (sum, group) {
      return sum + group.endpoints.length;
    }, 0);

    dom.endpointCount.textContent = query
      ? matchCount + " of " + state.flat.length
      : String(state.flat.length);
    dom.searchClear.hidden = !query;

    if (!state.flat.length) {
      dom.endpointNav.innerHTML =
        '<div class="sidebar-empty"><strong>No endpoints</strong><p>Rebuild the reference after capture fixtures are added.</p></div>';
      return;
    }

    if (!groups.length) {
      dom.endpointNav.innerHTML =
        '<div class="sidebar-empty"><strong>No matches</strong><p>No endpoints match &quot;' +
        esc(query) +
        '&quot;. Try a path such as /auth, or clear the search.</p></div>';
      return;
    }

    dom.endpointNav.innerHTML = groups
      .map(function (group) {
        var links = group.endpoints
          .map(function (endpoint) {
            var current = endpoint.id === state.activeId ? ' aria-current="page"' : "";
            return (
              '<li><a class="endpoint-link" href="#' +
              encodeURIComponent(endpoint.id) +
              '" data-endpoint-id="' +
              esc(endpoint.id) +
              '"' +
              current +
              ">" +
              '<span class="method-badge ' +
              methodClass(endpoint.method) +
              '">' +
              esc(endpoint.method) +
              "</span>" +
              '<span class="endpoint-link-text">' +
              '<span class="endpoint-link-name">' +
              esc(endpoint.name) +
              "</span>" +
              '<span class="endpoint-link-path">' +
              esc(endpoint.path) +
              "</span>" +
              "</span></a></li>"
            );
          })
          .join("");
        return (
          '<div class="nav-group">' +
          '<p class="nav-group-title"><span>' +
          esc(group.name) +
          '</span><span class="nav-group-count">' +
          group.endpoints.length +
          "</span></p>" +
          '<ul class="nav-list">' +
          links +
          "</ul></div>"
        );
      })
      .join("");

    updateActiveNav();
  }

  function updateActiveNav() {
    all(".endpoint-link", dom.endpointNav).forEach(function (link) {
      if (link.getAttribute("data-endpoint-id") === state.activeId) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function scrollActiveNavIntoView() {
    if (!state.activeId) return;
    if (!window.matchMedia("(min-width: 861px)").matches && !dom.sidebar.classList.contains("is-open")) {
      return;
    }
    var link = null;
    all(".endpoint-link", dom.endpointNav).some(function (candidate) {
      if (candidate.getAttribute("data-endpoint-id") === state.activeId) {
        link = candidate;
        return true;
      }
      return false;
    });
    if (!link) return;
    var linkRect = link.getBoundingClientRect();
    var sidebarRect = dom.sidebar.getBoundingClientRect();
    if (linkRect.top < sidebarRect.top + 44 || linkRect.bottom > sidebarRect.bottom - 16) {
      link.scrollIntoView({ block: "nearest" });
    }
  }

  function renderStatusBanner() {
    if (!dom.statusBanner) return;
    if (!state.sample) {
      dom.statusBanner.innerHTML = "";
      return;
    }
    dom.statusBanner.innerHTML =
      '<div class="notice" role="note">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 3.5 21 20H3L12 3.5Z" /><path d="M12 9v4.6M12 17h.01" /></svg>' +
      "<div><strong>Preview data.</strong> No fixture files were found, so this build uses the built-in sample endpoints. " +
      "Captured examples replace them after you run <code>node docs/api/build.mjs</code>.</div></div>";
  }

  function renderSidebarFoot() {
    if (!dom.sidebarFoot) return;
    var parts = [];
    parts.push(
      state.flat.length +
        (state.flat.length === 1 ? " endpoint" : " endpoints") +
        " in " +
        state.groups.length +
        (state.groups.length === 1 ? " group" : " groups")
    );
    var buildDate = docs.meta ? formatBuildDate(docs.meta.generatedAt) : "";
    if (buildDate) parts.push("Built " + buildDate);
    parts.push(state.sample ? "Built-in sample" : "Captured fixtures");
    dom.sidebarFoot.textContent = parts.join(". ") + ".";
  }

  function readHashId() {
    var raw = window.location.hash.replace(/^#\/?/, "");
    if (!raw) return "";
    try {
      return decodeURIComponent(raw);
    } catch (error) {
      return raw;
    }
  }

  function routeFromHash(initial) {
    if (!state.flat.length) {
      renderEmpty();
      return;
    }

    var id = readHashId();
    if (!id) {
      selectEndpoint(state.flat[0].id);
      return;
    }

    if (state.byId.has(id)) {
      selectEndpoint(id);
      return;
    }

    if (document.getElementById(id)) {
      if (initial && !state.activeId) selectEndpoint(state.flat[0].id);
      return;
    }

    renderNotFound(id);
  }

  function selectEndpoint(id) {
    var endpoint = state.byId.get(id);
    if (!endpoint) {
      renderNotFound(id);
      return;
    }

    closeDrawer(false);

    if (state.activeId === id && dom.endpointRoot.querySelector(".endpoint")) {
      updateActiveNav();
      scrollActiveNavIntoView();
      return;
    }

    state.activeId = id;
    renderEndpoint(endpoint);
    updateActiveNav();
    scrollActiveNavIntoView();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.title = endpoint.name + " · " + endpoint.method + " " + endpoint.path + " · HealthAccess API";
  }

  function renderEmpty() {
    state.activeId = null;
    updateActiveNav();
    dom.endpointRoot.removeAttribute("aria-busy");
    dom.endpointRoot.innerHTML =
      '<div class="state-card">' +
      '<div class="state-icon">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
      '<path d="M4 6h16M4 12h10M4 18h7" /></svg>' +
      "</div>" +
      "<h1>No endpoints in this build</h1>" +
      "<p>The generator did not find any endpoints. Add capture fixtures under " +
      "<code>docs/api/fixtures</code> and rebuild with <code>node docs/api/build.mjs</code>.</p>" +
      '<div class="state-actions">' +
      '<a class="button" href="#main">Focus main content</a>' +
      "</div></div>";
    document.title = "HealthAccess API reference";
  }

  function renderNotFound(id) {
    state.activeId = null;
    updateActiveNav();
    dom.endpointRoot.removeAttribute("aria-busy");
    var first = state.flat[0];
    dom.endpointRoot.innerHTML =
      '<div class="state-card">' +
      '<div class="state-icon">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4M8.5 11h5" /></svg>' +
      "</div>" +
      "<h1>Endpoint not found</h1>" +
      "<p>No endpoint with the id <code>" +
      esc(id) +
      "</code> is included in this build. The link may come from a newer reference.</p>" +
      '<div class="state-actions">' +
      (first
        ? '<a class="button button--primary" href="#' +
          encodeURIComponent(first.id) +
          '">Open ' +
          esc(first.name) +
          "</a>"
        : "") +
      '<button class="button" type="button" id="notFoundSearch">Search endpoints</button>' +
      "</div></div>";

    var searchButton = byId("notFoundSearch");
    if (searchButton) {
      searchButton.addEventListener("click", function () {
        dom.search.focus();
        dom.search.select();
      });
    }
    document.title = "Endpoint not found · HealthAccess API";
  }

  function renderFatal(title, message) {
    if (!dom.endpointRoot) return;
    dom.endpointRoot.removeAttribute("aria-busy");
    dom.endpointRoot.innerHTML =
      '<div class="state-card">' +
      '<div class="state-icon">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 3.5 21 20H3L12 3.5Z" /><path d="M12 9v4.6M12 17h.01" /></svg>' +
      "</div>" +
      "<h1>" +
      esc(title) +
      "</h1><p>" +
      esc(message) +
      "</p></div>";
    if (dom.endpointCount) dom.endpointCount.textContent = "Unavailable";
  }

  function endpointHeader(ep) {
    var roles = Array.isArray(ep.roles) ? ep.roles : [];
    var authBadge =
      ep.auth === "bearer"
        ? '<span class="auth-badge auth-bearer">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>' +
          "Bearer token</span>"
        : '<span class="auth-badge">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
          '<circle cx="12" cy="12" r="8.2" /><path d="M3.8 12h16.4M12 3.8c2.2 2.2 3.4 5 3.4 8.2s-1.2 6-3.4 8.2c-2.2-2.2-3.4-5-3.4-8.2s1.2-6 3.4-8.2Z" /></svg>' +
          "Public</span>";

    var roleChip = roles.length
      ? '<span class="meta-chip role-chip">Role: ' + esc(roles.join(" or ")) + "</span>"
      : ep.auth === "bearer"
        ? '<span class="meta-chip">Any signed-in account</span>'
        : "";

    var contentType = ep.contentType
      ? '<span class="meta-chip"><code>' + esc(ep.contentType) + "</code></span>"
      : "";

    return (
      "<header class=\"endpoint-head\">" +
      '<div class="endpoint-kicker">' +
      '<span class="method-badge ' +
      methodClass(ep.method) +
      '">' +
      esc(ep.method) +
      "</span>" +
      '<code class="endpoint-path">' +
      esc(ep.path) +
      "</code>" +
      '<button class="copy-button kicker-copy" type="button" data-copy-value="' +
      esc(ep.path) +
      '" aria-label="Copy endpoint path">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="8" y="8" width="11" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" /></svg>' +
      "<span>Copy path</span></button>" +
      '<span class="group-chip">' +
      esc(ep._group) +
      "</span>" +
      "</div>" +
      '<h1 id="endpoint-title">' +
      esc(ep.name) +
      "</h1>" +
      '<p class="endpoint-summary">' +
      esc(ep.summary) +
      "</p>" +
      '<div class="endpoint-badges">' +
      authBadge +
      roleChip +
      contentType +
      "</div>" +
      "</header>"
    );
  }

  function authCallout(ep) {
    var roles = Array.isArray(ep.roles) ? ep.roles : [];
    if (ep.auth === "bearer") {
      var roleText = roles.length
        ? " It also requires " +
          (roles.length === 1 ? "the " : "one of the ") +
          roles
            .map(function (role) {
              return "<code>" + esc(role) + "</code>";
            })
            .join(", ") +
          (roles.length === 1 ? " role." : " roles.")
        : "";
      return (
        '<section class="doc-section"><div class="callout">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>' +
        "<div><strong>Bearer token required.</strong> Send <code>Authorization: Bearer &lt;access-jwt&gt;</code> on the request." +
        roleText +
        " Missing or expired tokens return <code>401 unauthorized</code>; an account without the required role gets <code>403 forbidden</code>.</div>" +
        "</div></section>"
      );
    }
    return (
      '<section class="doc-section"><div class="callout">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="8.2" /><path d="M3.8 12h16.4M12 3.8c2.2 2.2 3.4 5 3.4 8.2s-1.2 6-3.4 8.2c-2.2-2.2-3.4-5-3.4-8.2s1.2-6 3.4-8.2Z" /></svg>' +
      "<div><strong>Public endpoint.</strong> No Authorization header is required.</div>" +
      "</div></section>"
    );
  }

  function paramRows(params, isPath) {
    return params
      .map(function (param) {
        var extras = [];
        if (param.default !== undefined) {
          extras.push("Default: " + esc(String(param.default)));
        }
        if (Array.isArray(param.enum) && param.enum.length) {
          extras.push("Allowed: " + esc(param.enum.join(", ")));
        }
        return (
          "<tr>" +
          '<td><code class="param-name">' +
          esc(param.name) +
          "</code></td>" +
          '<td><span class="type-chip">' +
          esc(param.type || "string") +
          "</span></td>" +
          '<td><span class="req-flag ' +
          (param.required || isPath ? "req-yes" : "req-no") +
          '">' +
          (param.required || isPath ? "Required" : "Optional") +
          "</span></td>" +
          '<td class="param-desc">' +
          inline(param.description || "") +
          (extras.length ? '<span class="default-note">' + extras.join(". ") + "</span>" : "") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function paramSection(title, params, isPath) {
    if (!Array.isArray(params) || !params.length) return "";
    return (
      '<section class="doc-section">' +
      "<h2>" +
      esc(title) +
      "</h2>" +
      '<div class="table-wrap"><table class="param-table">' +
      '<caption class="sr-only">' +
      esc(title) +
      "</caption>" +
      "<thead><tr><th scope=\"col\">Name</th><th scope=\"col\">Type</th><th scope=\"col\">Required</th><th scope=\"col\">Description</th></tr></thead>" +
      "<tbody>" +
      paramRows(params, isPath) +
      "</tbody></table></div></section>"
    );
  }

  function bodySection(ep) {
    if (!endpointHasBody(ep)) return "";
    var fields = Array.isArray(ep.bodyFields) ? ep.bodyFields : [];
    var contentType = ep.contentType || (isMultipart(ep) ? "multipart/form-data" : "application/json");
    var note = isMultipart(ep)
      ? "Send this request as <code>multipart/form-data</code>. File fields are listed here without sample files."
      : "Send this request as <code>" + esc(contentType) + "</code>.";
    var table = "";
    if (fields.length) {
      table =
        '<div class="table-wrap"><table class="param-table">' +
        '<caption class="sr-only">Request body fields</caption>' +
        "<thead><tr><th scope=\"col\">Field</th><th scope=\"col\">Type</th><th scope=\"col\">Required</th><th scope=\"col\">Description</th></tr></thead>" +
        "<tbody>" +
        fields
          .map(function (field) {
            return (
              "<tr>" +
              '<td><code class="param-name">' +
              esc(field.name) +
              "</code></td>" +
              '<td><span class="type-chip">' +
              esc(field.type || "string") +
              "</span></td>" +
              '<td><span class="req-flag ' +
              (field.required ? "req-yes" : "req-no") +
              '">' +
              (field.required ? "Required" : "Optional") +
              "</span></td>" +
              '<td class="param-desc">' +
              inline(field.description || "") +
              "</td></tr>"
            );
          })
          .join("") +
        "</tbody></table></div>";
    }
    return (
      '<section class="doc-section"><h2>Request body</h2>' +
      '<p class="body-format-note">' +
      note +
      "</p>" +
      table +
      "</section>"
    );
  }

  function requestExample(ep, uid) {
    var jsonText = ep.bodyExample !== undefined ? prettyJson(ep.bodyExample) : "";
    var curlText = buildCurl(ep);
    var fetchText = buildFetch(ep);
    var jsonPanel = jsonText
      ? '<pre class="code-block code-block--scroll" data-copy-source><code>' +
        highlightJson(jsonText) +
        "</code></pre>"
      : '<div class="code-empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.2" /><path d="M12 8.2v4.4M12 16h.01" /></svg>' +
        "<span>" +
        (methodAllowsBody(ep.method)
          ? isMultipart(ep)
            ? "This endpoint accepts multipart form data. Use the cURL tab for a form request."
            : "No example request body was captured. The runner still accepts a JSON body."
          : "This endpoint does not use a request body.") +
        "</span></div>";

    function codePanel(kind, text) {
      return (
        '<div class="tab-panel" id="' +
        uid +
        "-req-" +
        kind +
        '" role="tabpanel" aria-labelledby="' +
        uid +
        "-req-tab-" +
        kind +
        '">' +
        '<pre class="code-block code-block--scroll" data-copy-source data-example-kind="' +
        kind +
        '"><code>' +
        escCode(text) +
        "</code></pre></div>"
      );
    }

    return (
      '<section class="doc-section"><h2>Request example</h2>' +
      '<div class="panel">' +
      '<div class="panel-head">' +
      '<div class="tablist-shell" role="tablist" aria-label="Request example format">' +
      '<button class="tab" type="button" role="tab" id="' +
      uid +
      '-req-tab-json" aria-controls="' +
      uid +
      '-req-json" aria-selected="true" tabindex="0">JSON</button>' +
      '<button class="tab" type="button" role="tab" id="' +
      uid +
      '-req-tab-curl" aria-controls="' +
      uid +
      '-req-curl" aria-selected="false" tabindex="-1">cURL</button>' +
      '<button class="tab" type="button" role="tab" id="' +
      uid +
      '-req-tab-fetch" aria-controls="' +
      uid +
      '-req-fetch" aria-selected="false" tabindex="-1">JavaScript fetch</button>' +
      "</div>" +
      '<button class="copy-button" type="button" data-copy-panel aria-label="Copy request example"><span>Copy</span></button>' +
      "</div>" +
      '<div class="tab-panel" id="' +
      uid +
      '-req-json" role="tabpanel" aria-labelledby="' +
      uid +
      '-req-tab-json">' +
      jsonPanel +
      "</div>" +
      codePanel("curl", curlText) +
      codePanel("fetch", fetchText) +
      "</div></section>"
    );
  }

  function responsePanelBody(ep, response, uid, index) {
    var bodyText = response.body === null || response.body === undefined ? "" : prettyJson(response.body);
    var headers = response.headers && typeof response.headers === "object" ? response.headers : {};
    var headerKeys = Object.keys(headers);
    var headersHtml = headerKeys.length
      ? '<div class="headers-block"><h3>Response headers</h3><dl class="headers-grid">' +
        headerKeys
          .map(function (key) {
            var value = headers[key];
            if (Array.isArray(value)) value = value.join(", ");
            return "<dt>" + esc(key) + "</dt><dd>" + esc(value === null || value === undefined ? "" : String(value)) + "</dd>";
          })
          .join("") +
        "</dl></div>"
      : '<div class="headers-block"><h3>Response headers</h3><p class="no-headers">No response headers were recorded.</p></div>';

    var bodyHtml = bodyText
      ? '<pre class="code-block code-block--scroll" id="' +
        uid +
        "-resp-code-" +
        index +
        '" data-copy-source><code>' +
        highlightJson(bodyText) +
        "</code></pre>"
      : '<div class="code-empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.2" /><path d="M12 8.2v4.4M12 16h.01" /></svg>' +
        "<span>No response body.</span></div>";

    var contentType =
      headers["content-type"] ||
      headers["Content-Type"] ||
      ep.contentType ||
      "application/json";

    return (
      '<div class="response-body" id="' +
      uid +
      '-resp-panel-' +
      index +
      '" role="tabpanel" aria-labelledby="' +
      uid +
      "-resp-tab-" +
      index +
      '"' +
      (index === 0 ? "" : " hidden") +
      ">" +
      '<div class="response-summary">' +
      '<span class="status-pill ' +
      statusClass(response.status) +
      '">' +
      esc(statusTitle(response.status, response.label)) +
      "</span>" +
      '<div class="response-summary-text"><p>' +
      inline(response.description || "") +
      '</p><div class="response-meta">' +
      esc(contentType) +
      "</div></div>" +
      (bodyText
        ? '<button class="copy-button" type="button" data-copy-panel aria-label="Copy ' +
          esc(statusTitle(response.status, response.label)) +
          ' response body"><span>Copy</span></button>'
        : "") +
      "</div>" +
      headersHtml +
      bodyHtml +
      "</div>"
    );
  }

  function responsesSection(ep, uid) {
    var responses = Array.isArray(ep.responses) ? ep.responses : [];
    var note = state.sample
      ? "Preview response shapes from the built-in sample."
      : "Response examples come from the captured fixtures.";

    var tabs = responses
      .map(function (response, index) {
        return (
          '<button class="status-tab ' +
          statusClass(response.status) +
          '" type="button" role="tab" id="' +
          uid +
          "-resp-tab-" +
          index +
          '" aria-controls="' +
          uid +
          "-resp-panel-" +
          index +
          '" aria-selected="' +
          (index === 0 ? "true" : "false") +
          '" tabindex="' +
          (index === 0 ? "0" : "-1") +
          '" aria-label="' +
          esc(statusTitle(response.status, response.label)) +
          '"><span class="status-dot"></span><span class="status-code">' +
          esc(response.status) +
          '</span><span class="status-label">' +
          esc(statusLabel(response.status, response.label)) +
          "</span></button>"
        );
      })
      .join("");

    var panels = responses
      .map(function (response, index) {
        return responsePanelBody(ep, response, uid, index);
      })
      .join("");

    return (
      '<section class="doc-section"><h2>Responses</h2>' +
      '<p class="section-note">' +
      esc(note) +
      "</p>" +
      '<div class="panel response-panel">' +
      '<div class="response-tabs"><div class="response-tablist" role="tablist" aria-label="Response status">' +
      tabs +
      "</div></div>" +
      panels +
      "</div></section>"
    );
  }

  function defaultValueForInput(param, isPath) {
    var value = paramExample(param);
    if (value) return value;
    return "";
  }

  function tryItField(param, isPath, index, uid) {
    var value = defaultValueForInput(param, isPath);
    var placeholder = paramExample(param) || placeholderForType(param.type);
    var inputId = uid + "-" + (isPath ? "path" : "query") + "-" + index;
    return (
      '<label class="field" for="' +
      inputId +
      '">' +
      '<span class="field-label">' +
      esc(param.name) +
      '<span class="field-optional">' +
      (isPath ? "path" : "query") +
      (param.required ? ", required" : "") +
      "</span></span>" +
      '<span class="input-shell"><input id="' +
      inputId +
      '" type="text" value="' +
      esc(value) +
      '" placeholder="' +
      esc(placeholder) +
      '" spellcheck="false" autocomplete="off" data-param-role="' +
      (isPath ? "path" : "query") +
      '" data-param-name="' +
      esc(param.name) +
      '" data-param-required="' +
      (param.required || isPath ? "true" : "false") +
      '" /></span></label>'
    );
  }

  function tryItSection(ep, uid) {
    var pathParams = Array.isArray(ep.pathParams) ? ep.pathParams : [];
    var queryParams = Array.isArray(ep.queryParams) ? ep.queryParams : [];
    var bodyEnabled = methodAllowsBody(ep.method) && !isMultipart(ep);
    var draft = state.bodyDrafts.get(ep.id);
    var bodyValue = draft !== undefined ? draft : ep.bodyExample !== undefined ? prettyJson(ep.bodyExample) : "";
    var tokenField =
      ep.auth === "bearer"
        ? '<div class="field">' +
          '<label class="field-label" for="tryToken">Bearer token<span class="field-optional">stored locally</span></label>' +
          '<span class="input-shell"><input id="tryToken" type="password" value="' +
          esc(state.token) +
          '" placeholder="Paste an access token" spellcheck="false" autocomplete="off" />' +
          '<button class="reveal-button" id="toggleToken" type="button" aria-label="Show bearer token" aria-pressed="false">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M2.6 12S6.1 5.9 12 5.9 21.4 12 21.4 12 17.9 18.1 12 18.1 2.6 12 2.6 12Z" /><circle cx="12" cy="12" r="3.1" /></svg>' +
          "</button></span>" +
          '<p class="field-hint">Stored in this browser only. Sent as <code>Authorization: Bearer</code> for this request.</p>' +
          '<p class="tryit-token-note" data-token-note>' +
          (state.token.trim() ? "A token is ready for this request." : "No token yet. This request will likely return 401.") +
          "</p></div>"
        : '<p class="tryit-token-note">This endpoint does not use a bearer token. Public requests do not send an Authorization header.</p>';

    return (
      '<section class="doc-section" id="try-it"><h2>Try it</h2>' +
      '<div class="panel tryit-panel">' +
      '<div class="panel-head"><div class="panel-head-title">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="m4 17 5-10 4.2 7L16 10l4 7" /><path d="M4 20h16" /></svg>' +
      "Request runner</div>" +
      '<span class="live-flag">Live request</span></div>' +
      '<div class="tryit-grid">' +
      '<div class="tryit-form">' +
      '<div class="field"><label class="field-label" for="tryBaseUrl">Base URL</label>' +
      '<span class="input-shell"><input id="tryBaseUrl" type="url" value="' +
      esc(state.baseUrl) +
      '" spellcheck="false" autocomplete="off" inputmode="url" /></span></div>' +
      tokenField +
      (pathParams.length
        ? '<div class="field"><span class="field-label">Path parameters</span><div class="field-grid">' +
          pathParams
            .map(function (param, index) {
              return tryItField(param, true, index, uid);
            })
            .join("") +
          "</div></div>"
        : "") +
      (queryParams.length
        ? '<div class="field"><span class="field-label">Query parameters</span><div class="field-grid">' +
          queryParams
            .map(function (param, index) {
              return tryItField(param, false, index, uid);
            })
            .join("") +
          "</div></div>"
        : "") +
      '<div class="request-url"><span class="request-url-method">' +
      esc(ep.method) +
      '</span><code id="tryUrlPreview">' +
      esc(buildUrl(state.baseUrl, ep.path, {}, [], true)) +
      "</code></div>" +
      '<div class="field"><label class="field-label" for="tryBody">' +
      (isMultipart(ep) ? "Request body" : "JSON body") +
      '<span class="field-optional">' +
      (bodyEnabled ? "editable" : isMultipart(ep) ? "multipart" : "not used") +
      "</span></label>" +
      '<span class="textarea-shell"><textarea id="tryBody" spellcheck="false" ' +
      (bodyEnabled ? "" : "disabled ") +
      'placeholder="' +
      (isMultipart(ep)
        ? "Multipart uploads are not supported in this runner. Use the cURL example."
        : bodyEnabled
          ? "{}"
          : "This endpoint does not use a request body.") +
      '">' +
      esc(bodyValue) +
      "</textarea></span>" +
      '<p class="field-hint">' +
      (isMultipart(ep)
        ? "Use the cURL request example for file uploads. This runner sends JSON requests only."
        : bodyEnabled
          ? "The body must be valid JSON. Leave it empty to send no body."
          : "Edit the path or query parameters above, then send.") +
      "</p>" +
      '<p class="field-error" id="tryBodyError" role="alert"></p></div>' +
      '<p class="field-error" id="tryFormError" role="alert"></p>' +
      '<div class="tryit-actions">' +
      '<button class="send-button" id="sendRequest" type="button">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="m4 12 16-7-6 7 6 7-16-7Z" /><path d="M14 12H4" /></svg>' +
      "<span>Send request</span></button>" +
      '<span class="send-hint">Ctrl or Cmd + Enter</span>' +
      "</div>" +
      '<span class="sr-only" id="tryAnnounce" aria-live="polite"></span>' +
      "</div>" +
      '<div class="tryit-result" id="tryResult" aria-busy="false">' +
      '<div class="tryit-result-head"><span class="tryit-result-title">Response</span>' +
      '<span class="tryit-result-meta"><span>Waiting</span></span></div>' +
      '<div class="tryit-result-body"><div class="result-placeholder">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="m7 10 3 2-3 2M12.5 14h4" /></svg>' +
      "<strong>No response yet</strong><p>Send a request to see the status, timing, headers, and body.</p>" +
      "</div></div></div>" +
      "</div></div></section>"
    );
  }

  function notesSection(ep) {
    var notes = Array.isArray(ep.notes) ? ep.notes : [];
    if (!notes.length) return "";
    return (
      '<section class="doc-section"><h2>Notes</h2><ul class="notes">' +
      notes
        .map(function (note) {
          return "<li>" + inline(note) + "</li>";
        })
        .join("") +
      "</ul></section>"
    );
  }

  function pagerSection(ep) {
    var previous = state.flat[ep._index - 1];
    var next = state.flat[ep._index + 1];
    function link(target, direction) {
      if (!target) return '<div class="pager-spacer"></div>';
      var arrow =
        direction === "previous"
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14.5 6-6 6 6 6" /></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.5 6 6 6-6 6" /></svg>';
      return (
        '<a class="pager-link pager-link--' +
        direction +
        '" href="#' +
        encodeURIComponent(target.id) +
        '">' +
        '<span class="pager-label">' +
        (direction === "previous" ? "Previous" : "Next") +
        "</span>" +
        '<span class="pager-name">' +
        (direction === "previous" ? arrow : "") +
        "<span>" +
        esc(target.name) +
        "</span>" +
        (direction === "next" ? arrow : "") +
        "</span></a>"
      );
    }
    return (
      '<nav class="endpoint-nav-foot" aria-label="Endpoint navigation">' +
      link(previous, "previous") +
      link(next, "next") +
      "</nav>"
    );
  }

  function renderEndpoint(ep) {
    var uid = "ep-" + ep._index;
    var html =
      '<article class="endpoint" aria-labelledby="endpoint-title">' +
      endpointHeader(ep) +
      '<div class="endpoint-body">' +
      (ep.description
        ? '<section class="doc-section"><div class="prose">' + paragraphs(ep.description) + "</div></section>"
        : "") +
      authCallout(ep) +
      paramSection("Path parameters", ep.pathParams, true) +
      paramSection("Query parameters", ep.queryParams, false) +
      bodySection(ep) +
      requestExample(ep, uid) +
      responsesSection(ep, uid) +
      tryItSection(ep, uid) +
      notesSection(ep) +
      pagerSection(ep) +
      "</div></article>";

    dom.endpointRoot.removeAttribute("aria-busy");
    dom.endpointRoot.innerHTML = html;
    wireTabs(dom.endpointRoot);
    wireTryIt(ep);
  }

  function wireTabs(root) {
    all('[role="tablist"]', root).forEach(function (list) {
      var tabs = all('[role="tab"]', list);
      if (!tabs.length) return;

      function activate(index, focus) {
        tabs.forEach(function (tab, tabIndex) {
          var selected = tabIndex === index;
          tab.setAttribute("aria-selected", selected ? "true" : "false");
          tab.tabIndex = selected ? 0 : -1;
          var panel = byId(tab.getAttribute("aria-controls"));
          if (panel) panel.hidden = !selected;
        });
        if (focus) tabs[index].focus();
      }

      tabs.forEach(function (tab, index) {
        tab.addEventListener("click", function () {
          activate(index, false);
        });
      });

      list.addEventListener("keydown", function (event) {
        var activeIndex = tabs.indexOf(document.activeElement);
        if (activeIndex === -1) return;
        var nextIndex = null;
        if (event.key === "ArrowRight") nextIndex = (activeIndex + 1) % tabs.length;
        else if (event.key === "ArrowLeft") nextIndex = (activeIndex - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = tabs.length - 1;
        if (nextIndex !== null) {
          event.preventDefault();
          activate(nextIndex, true);
        }
      });
    });
  }

  function setBaseUrl(value, source) {
    state.baseUrl = value;
    writeStorage(STORAGE_KEYS.baseUrl, value);
    if (source !== "top" && dom.baseUrl) dom.baseUrl.value = value;
    var tryBase = byId("tryBaseUrl");
    if (source !== "try" && tryBase) tryBase.value = value;
    updateUrlSurfaces();
  }

  function collectParams(root) {
    var pathValues = {};
    var queryValues = [];
    all("[data-param-role]", root).forEach(function (input) {
      var name = input.getAttribute("data-param-name");
      var value = input.value.trim();
      if (input.getAttribute("data-param-role") === "path") {
        pathValues[name] = value;
      } else {
        queryValues.push({
          name: name,
          value: value,
          required: input.getAttribute("data-param-required") === "true"
        });
      }
    });
    return { path: pathValues, query: queryValues };
  }

  function updateUrlSurfaces() {
    var ep = state.activeId ? state.byId.get(state.activeId) : null;
    if (!ep) return;
    var root = dom.endpointRoot;
    var preview = byId("tryUrlPreview");
    if (preview) {
      var values = collectParams(root);
      preview.textContent = buildUrl(state.baseUrl, ep.path, values.path, values.query, true);
    }
    all("[data-example-kind]", root).forEach(function (code) {
      var kind = code.getAttribute("data-example-kind");
      if (kind === "curl") code.textContent = buildCurl(ep);
      if (kind === "fetch") code.textContent = buildFetch(ep);
    });
  }

  function showFieldError(element, message) {
    if (!element) return;
    element.textContent = message;
    element.classList.add("is-visible");
  }

  function clearFieldError(element) {
    if (!element) return;
    element.textContent = "";
    element.classList.remove("is-visible");
  }

  function setSending(sending) {
    state.sending = sending;
    var send = byId("sendRequest");
    var result = byId("tryResult");
    if (send) {
      send.disabled = sending;
      send.innerHTML = sending
        ? '<span class="spinner"></span><span>Sending</span>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 12 16-7-6 7 6 7-16-7Z" /><path d="M14 12H4" /></svg><span>Send request</span>';
    }
    if (result) result.setAttribute("aria-busy", sending ? "true" : "false");
  }

  function renderTryLoading(ep) {
    var result = byId("tryResult");
    if (!result) return;
    result.innerHTML =
      '<div class="tryit-result-head"><span class="tryit-result-title">Response</span>' +
      '<span class="tryit-result-meta"><span>In flight</span></span></div>' +
      '<div class="tryit-result-body"><div class="result-loading"><span class="spinner"></span>' +
      "<span>Sending " +
      esc(ep.method) +
      " request</span></div></div>";
  }

  function renderTryError(title, message, hint) {
    var result = byId("tryResult");
    if (!result) return;
    result.innerHTML =
      '<div class="tryit-result-head"><span class="tryit-result-title">Response</span>' +
      '<span class="tryit-result-meta"><span>Request failed</span></span></div>' +
      '<div class="tryit-result-body"><div class="result-error">' +
      '<div class="result-error-head">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="8.2" /><path d="M12 8v4.6M12 16.2h.01" /></svg>' +
      esc(title) +
      "</div><p>" +
      esc(message) +
      "</p>" +
      (hint ? '<div class="result-hint">' + hint + "</div>" : "") +
      "</div></div>";
  }

  function networkHint() {
    if (window.location.protocol === "file:") {
      return (
        "<p>This page is open from a local file, so the browser blocks API requests. " +
        "Serve the reference over HTTP, for example <code>python3 -m http.server 5173 -d docs/api</code>, " +
        "or open <code>http://localhost:3000/docs</code>, then try again.</p>"
      );
    }
    return (
      "<p>The request did not reach the API. Confirm that the base URL is running and that the API allows this origin in CORS. " +
      "The online API allows only its configured frontend origin. When the reference is served at <code>http://localhost:3000/docs</code>, " +
      "the default base URL is same origin.</p>"
    );
  }

  function renderTryResponse(ep, status, statusText, elapsed, size, headers, text) {
    var result = byId("tryResult");
    if (!result) return;
    var parsed = null;
    var isJson = false;
    if (text) {
      try {
        parsed = JSON.parse(text);
        isJson = true;
      } catch (error) {
        isJson = false;
      }
    }

    var label = statusText || STATUS_TEXT[status] || "";
    var bodyHtml;
    if (!text) {
      bodyHtml = '<div class="result-empty-body">No response body.</div>';
    } else if (isJson) {
      bodyHtml =
        '<pre class="code-block result-json" data-copy-source id="tryResponseCode"><code>' +
        highlightJson(JSON.stringify(parsed, null, 2)) +
        "</code></pre>";
    } else {
      bodyHtml =
        '<pre class="code-block result-json" data-copy-source id="tryResponseCode"><code>' +
        escCode(text) +
        "</code></pre>";
    }

    var headersHtml = headers.length
      ? '<div class="headers-block"><h3>Response headers</h3><dl class="headers-grid">' +
        headers
          .map(function (entry) {
            return "<dt>" + esc(entry[0]) + "</dt><dd>" + esc(entry[1]) + "</dd>";
          })
          .join("") +
        "</dl></div>"
      : "";

    state.lastResponse = text;
    result.innerHTML =
      '<div class="tryit-result-head">' +
      '<span class="status-pill ' +
      statusClass(status) +
      '">' +
      esc(String(status) + (label ? " " + label : "")) +
      "</span>" +
      '<span class="tryit-result-meta"><span>' +
      esc(String(elapsed)) +
      " ms</span><span>" +
      esc(formatBytes(size)) +
      "</span></span>" +
      (text
        ? '<button class="copy-button" type="button" data-copy-target="#tryResponseCode" aria-label="Copy response body"><span>Copy</span></button>'
        : "") +
      "</div>" +
      '<div class="tryit-result-body">' +
      headersHtml +
      bodyHtml +
      "</div>";

    var announce = byId("tryAnnounce");
    if (announce) {
      announce.textContent =
        "Response " + String(status) + (label ? " " + label : "") + " in " + String(elapsed) + " milliseconds.";
    }
  }

  async function sendRequest(ep) {
    if (state.sending) return;
    var root = dom.endpointRoot;
    var baseInput = byId("tryBaseUrl");
    var bodyInput = byId("tryBody");
    var formError = byId("tryFormError");
    var bodyError = byId("tryBodyError");
    var base = baseInput ? baseInput.value.trim() : "";
    var values = collectParams(root);

    clearFieldError(formError);
    clearFieldError(bodyError);

    if (!isHttpUrl(base)) {
      showFieldError(formError, "Enter a base URL that starts with http:// or https://.");
      if (baseInput) baseInput.focus();
      return;
    }

    var missing = [];
    (ep.pathParams || []).forEach(function (param) {
      if (ep.path.indexOf(":" + param.name) !== -1 && !values.path[param.name]) {
        missing.push(":" + param.name);
      }
    });
    values.query.forEach(function (entry) {
      if (entry.required && !entry.value) missing.push(entry.name);
    });
    if (missing.length) {
      showFieldError(formError, "Fill the required parameters: " + missing.join(", ") + ".");
      var firstMissing = root.querySelector('[data-param-required="true"]');
      if (firstMissing) firstMissing.focus();
      return;
    }

    var bodyText = null;
    var headers = { Accept: "application/json" };
    if (bodyInput && !bodyInput.disabled) {
      var value = bodyInput.value.trim();
      if (value) {
        try {
          JSON.parse(value);
        } catch (error) {
          showFieldError(bodyError, "Body is not valid JSON: " + error.message);
          bodyInput.focus();
          return;
        }
        bodyText = value;
        headers["Content-Type"] = "application/json";
      }
    }

    if (ep.auth === "bearer") {
      var token = state.token.trim();
      if (token) headers.Authorization = "Bearer " + token;
    }

    var url = buildUrl(base, ep.path, values.path, values.query, false);
    setSending(true);
    renderTryLoading(ep);

    var controller = new AbortController();
    var timeout = window.setTimeout(function () {
      controller.abort();
    }, 60000);
    var started = window.performance.now();

    try {
      var response = await fetch(url, {
        method: ep.method,
        headers: headers,
        body: bodyText,
        signal: controller.signal,
        credentials: "omit"
      });
      var elapsed = Math.round(window.performance.now() - started);
      var text = await response.text();
      var size = 0;
      try {
        size = new TextEncoder().encode(text).length;
      } catch (error) {
        size = text.length;
      }
      var headerPairs = [];
      response.headers.forEach(function (value, key) {
        headerPairs.push([key, value]);
      });
      renderTryResponse(ep, response.status, response.statusText, elapsed, size, headerPairs, text);
    } catch (error) {
      if (error && error.name === "AbortError") {
        renderTryError(
          "Request timed out",
          "The API did not answer within 60 seconds. It may be busy, or the base URL may not point to the online API.",
          ""
        );
      } else if (error instanceof TypeError) {
        renderTryError(
          "Could not reach the API",
          error.message || "The network request failed before a response arrived.",
          networkHint()
        );
      } else {
        renderTryError(
          "Request failed",
          error && error.message ? error.message : "An unexpected error stopped the request.",
          ""
        );
      }
      var announce = byId("tryAnnounce");
      if (announce) announce.textContent = "The request failed.";
    } finally {
      window.clearTimeout(timeout);
      setSending(false);
    }
  }

  function wireTryIt(ep) {
    var root = dom.endpointRoot;
    var tryBase = byId("tryBaseUrl");
    var tokenInput = byId("tryToken");
    var toggleToken = byId("toggleToken");
    var bodyInput = byId("tryBody");
    var send = byId("sendRequest");

    if (tryBase) {
      tryBase.addEventListener("input", function (event) {
        setBaseUrl(event.target.value, "try");
      });
    }

    if (tokenInput) {
      tokenInput.addEventListener("input", function () {
        state.token = tokenInput.value;
        writeStorage(STORAGE_KEYS.token, tokenInput.value);
        var note = root.querySelector("[data-token-note]");
        if (note) {
          note.textContent = tokenInput.value.trim()
            ? "A token is ready for this request."
            : "No token yet. This request will likely return 401.";
        }
      });
    }

    if (toggleToken && tokenInput) {
      toggleToken.addEventListener("click", function () {
        var showing = tokenInput.type === "text";
        tokenInput.type = showing ? "password" : "text";
        toggleToken.setAttribute("aria-pressed", showing ? "false" : "true");
        toggleToken.setAttribute("aria-label", showing ? "Show bearer token" : "Hide bearer token");
      });
    }

    all("[data-param-role]", root).forEach(function (input) {
      input.addEventListener("input", updateUrlSurfaces);
    });

    if (bodyInput) {
      bodyInput.addEventListener("input", function () {
        state.bodyDrafts.set(ep.id, bodyInput.value);
        clearFieldError(byId("tryBodyError"));
      });
      bodyInput.addEventListener("keydown", function (event) {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          if (send) send.click();
        }
      });
    }

    if (send) {
      send.addEventListener("click", function () {
        sendRequest(ep);
      });
    }

    updateUrlSurfaces();
  }

  try {
    init();
  } catch (error) {
    try {
      if (!dom.endpointRoot) dom.endpointRoot = byId("endpointRoot");
      renderFatal(
        "The reference could not start",
        error && error.message ? error.message : "An unexpected script error occurred."
      );
    } catch (fatalError) {
      /* Nothing else can be rendered. */
    }
    if (window.console && window.console.error) window.console.error(error);
  }
})();
