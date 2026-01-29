(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const store = {
    getTheme() {
      return localStorage.getItem("theme") || "dark";
    },
    setTheme(v) {
      localStorage.setItem("theme", v);
    },
  };

  const state = {
    notes: Array.isArray(window.__INITIAL_NOTES__) ? window.__INITIAL_NOTES__ : [],
    query: "",
  };

  function isoToLocalInput(iso) {
    if (!iso) return "";
    // iso like "2026-01-29T10:30:00" -> "2026-01-29T10:30"
    return String(iso).slice(0, 16);
  }

  function fmtClock(d = new Date()) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function isSoonOrOverdue(deadlineIso) {
    if (!deadlineIso) return null;
    const ms = Date.parse(deadlineIso);
    if (Number.isNaN(ms)) return null;
    const now = Date.now();
    const diff = ms - now;
    if (diff < 0) return "overdue";
    if (diff <= 1000 * 60 * 60 * 24) return "soon"; // 24h
    return null;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function noteEl(note) {
    const created = note.created_at || "";
    const deadline = note.deadline || "";
    const urgency = isSoonOrOverdue(deadline);
    const dlClass =
      urgency === "overdue" ? "meta-pill meta-deadline is-overdue" : urgency === "soon" ? "meta-pill meta-deadline is-soon" : "meta-pill meta-deadline";

    const deadlinePill = deadline
      ? `<span class="${dlClass}" data-deadline="${escapeHtml(deadline)}" title="Deadline">${escapeHtml(deadline)}</span>`
      : "";

    return `
      <article class="note" data-id="${note.id}" data-text="${escapeHtml(note.text)}">
        <div class="note-main">
          <div class="note-text">${escapeHtml(note.text)}</div>
          <div class="note-meta">
            <span class="meta-pill" title="Created">${escapeHtml(created)}</span>
            ${deadlinePill}
          </div>
        </div>
        <div class="note-actions">
          <button class="btn btn-ghost btn-sm js-edit" type="button">Edit</button>
          <button class="btn btn-danger btn-sm js-delete" type="button">Delete</button>
        </div>
      </article>
    `.trim();
  }

  function render() {
    const list = $("#notesList");
    const empty = $("#emptyState");
    if (!list || !empty) return;

    const q = state.query.trim().toLowerCase();
    const filtered = q ? state.notes.filter((n) => String(n.text || "").toLowerCase().includes(q)) : state.notes;

    list.innerHTML = filtered.map(noteEl).join("\n");
    empty.hidden = filtered.length !== 0;
  }

  async function api(url, options = {}) {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data && data.error ? data.error : `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  function toast(msg) {
    // Minimal toast without extra CSS: quick inline alert-like bubble.
    let t = $("#__toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "__toast";
      t.style.position = "fixed";
      t.style.left = "50%";
      t.style.bottom = "22px";
      t.style.transform = "translateX(-50%)";
      t.style.padding = "10px 12px";
      t.style.borderRadius = "999px";
      t.style.border = "1px solid var(--border)";
      t.style.background = "rgba(0,0,0,0.35)";
      t.style.backdropFilter = "blur(10px)";
      t.style.color = "var(--text)";
      t.style.zIndex = "100";
      t.style.fontWeight = "700";
      t.style.boxShadow = "var(--shadow)";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(toast._tid);
    toast._tid = setTimeout(() => {
      t.style.opacity = "0";
    }, 1600);
  }

  function setTheme(theme) {
    const root = document.documentElement;
    root.dataset.theme = theme;
    store.setTheme(theme);
    const btn = $("#themeToggle");
    if (btn) {
      const isLight = theme === "light";
      btn.setAttribute("aria-pressed", String(isLight));
      const icon = $(".btn-icon", btn);
      const label = $(".btn-label", btn);
      if (icon) icon.textContent = isLight ? "☀" : "◐";
      if (label) label.textContent = isLight ? "Light" : "Dark";
    }
  }

  function modalOpen(modal) {
    const backdrop = $("#modalBackdrop");
    if (backdrop) backdrop.classList.remove("is-hidden");
    modal.classList.remove("is-hidden");
    document.body.style.overflow = "hidden";
  }

  function modalClose(modal) {
    const backdrop = $("#modalBackdrop");
    modal.classList.add("is-hidden");
    if (backdrop) backdrop.classList.add("is-hidden");
    document.body.style.overflow = "";
  }

  function wireModals() {
    const editModal = $("#editModal");
    const closeEdit = $("#closeEdit");
    const cancelEdit = $("#cancelEdit");
    const backdrop = $("#modalBackdrop");

    if (closeEdit && editModal) closeEdit.addEventListener("click", () => modalClose(editModal));
    if (cancelEdit && editModal) cancelEdit.addEventListener("click", () => modalClose(editModal));

    if (backdrop) {
      backdrop.addEventListener("click", () => {
        if (editModal && !editModal.hidden) modalClose(editModal);
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (aboutModal && !aboutModal.hidden) modalClose(aboutModal);
      if (editModal && !editModal.hidden) modalClose(editModal);
    });
  }

  function wireClock() {
    const el = $("#liveClock");
    if (!el) return;
    const tick = () => (el.textContent = fmtClock());
    tick();
    setInterval(tick, 1000);
  }

  function wireTheme() {
    setTheme(store.getTheme());
    const btn = $("#themeToggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const cur = document.documentElement.dataset.theme || "dark";
      setTheme(cur === "dark" ? "light" : "dark");
    });
  }

  function wireCreate() {
    const form = $("#noteForm");
    const input = $("#noteText");
    const deadline = $("#deadline");
    if (!form || !input) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      const dl = deadline ? deadline.value : "";
      if (!text) return;

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const data = await api("/api/notes", {
          method: "POST",
          body: JSON.stringify({ text, deadline: dl }),
        });
        const note = data.note;
        state.notes = [note, ...state.notes];
        input.value = "";
        if (deadline) deadline.value = "";
        render();
        toast("Saved");
      } catch (err) {
        toast(err.message || "Failed to save");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  function openEdit(noteId) {
    const note = state.notes.find((n) => n.id === noteId);
    if (!note) return;
    const editModal = $("#editModal");
    const idEl = $("#editId");
    const textEl = $("#editText");
    const dlEl = $("#editDeadline");
    if (!editModal || !idEl || !textEl) return;
    idEl.value = String(note.id);
    textEl.value = String(note.text || "");
    if (dlEl) dlEl.value = isoToLocalInput(note.deadline);
    modalOpen(editModal);
    setTimeout(() => textEl.focus(), 0);
  }

  function wireEditAndDelete() {
    const list = $("#notesList");
    if (!list) return;

    list.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const noteNode = e.target.closest(".note");
      if (!noteNode) return;
      const id = Number(noteNode.dataset.id);
      if (!Number.isFinite(id)) return;

      if (btn.classList.contains("js-edit")) {
        openEdit(id);
        return;
      }
      if (btn.classList.contains("js-delete")) {
        const ok = confirm("Delete this note?");
        if (!ok) return;
        btn.disabled = true;
        try {
          await api(`/api/notes/${id}`, { method: "DELETE" });
          state.notes = state.notes.filter((n) => n.id !== id);
          render();
          toast("Deleted");
        } catch (err) {
          toast(err.message || "Failed to delete");
        } finally {
          btn.disabled = false;
        }
      }
    });

    const editForm = $("#editForm");
    if (!editForm) return;
    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const idEl = $("#editId");
      const textEl = $("#editText");
      const dlEl = $("#editDeadline");
      const editModal = $("#editModal");
      if (!idEl || !textEl || !editModal) return;

      const id = Number(idEl.value);
      const text = textEl.value.trim();
      const dl = dlEl ? dlEl.value : "";
      if (!text) return;

      const submitBtn = editForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const data = await api(`/api/notes/${id}`, {
          method: "PUT",
          body: JSON.stringify({ text, deadline: dl }),
        });
        const updated = data.note;
        state.notes = state.notes.map((n) => (n.id === id ? updated : n));
        render();
        modalClose(editModal);
        toast("Updated");
      } catch (err) {
        toast(err.message || "Failed to update");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  function wireSearch() {
    const s = $("#search");
    const clear = $("#clearSearch");
    if (s) {
      s.addEventListener("input", () => {
        state.query = s.value || "";
        render();
      });
    }
    if (clear) {
      clear.addEventListener("click", () => {
        state.query = "";
        if (s) s.value = "";
        render();
      });
    }
  }

  function refreshDeadlineBadges() {
    // In case time passes while page is open, keep deadline styling up-to-date.
    const pills = $$(".meta-deadline");
    for (const p of pills) {
      const iso = p.dataset.deadline || "";
      const u = isSoonOrOverdue(iso);
      p.classList.remove("is-soon", "is-overdue");
      if (u === "soon") p.classList.add("is-soon");
      if (u === "overdue") p.classList.add("is-overdue");
    }
  }

  function init() {
    wireTheme();
    wireClock();
    wireModals();
    wireCreate();
    wireEditAndDelete();
    wireSearch();
    render();
    refreshDeadlineBadges();
    setInterval(refreshDeadlineBadges, 30_000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
