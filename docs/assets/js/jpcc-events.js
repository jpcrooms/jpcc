/* JPCC shared public events engine. One copy for all Quarto pages.
 * Source of recurring rules: data/clubs.json (built from clubs/*.qmd front matter).
 * Source of one-off events: events.json. Room bookings: bookings.json (future UI).
 * Time strings without an offset represent Adelaide wall-clock time.
 */
(function (root) {
  "use strict";

  const ZONE = "Australia/Adelaide";
  const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const DAY_MS = 86400000;
  const VENUE = "Johnstone Park Combined Clubrooms, 12 Thomas St, Murray Bridge";
  let dataPromise = null;

  // Use UTC strictly for civil-date arithmetic. Meeting times are *not* UTC.
  function dateUTC(iso) {
    if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const parsed = new Date(iso + "T00:00:00Z");
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso ? null : parsed;
  }

  function ymd(date) { return date.toISOString().slice(0, 10); }
  function addDays(iso, days) {
    const d = dateUTC(iso);
    if (!d) throw new Error("Invalid date: " + iso);
    d.setUTCDate(d.getUTCDate() + days);
    return ymd(d);
  }
  function monthNumber(iso) { return Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1; }
  function dateInRange(iso, first, lastExclusive) { return iso >= first && iso < lastExclusive; }

  function nthWeekday(year, monthZero, weekday, nth) {
    if (nth === -1) {
      const last = new Date(Date.UTC(year, monthZero + 1, 0));
      last.setUTCDate(last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
      return ymd(last);
    }
    const first = new Date(Date.UTC(year, monthZero, 1));
    first.setUTCDate(1 + ((weekday - first.getUTCDay() + 7) % 7) + (nth - 1) * 7);
    return first.getUTCMonth() === monthZero ? ymd(first) : null;
  }

  function weekBeginning(iso) {
    const d = dateUTC(iso);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
    return d.getTime();
  }

  // Only expand the requested range, not a fixed 2026-2035 list.
  function expandRecurring(clubs, first, lastExclusive) {
    if (!dateUTC(first) || !dateUTC(lastExclusive) || first >= lastExclusive) return [];
    const result = [];
    for (const club of clubs || []) {
      for (const rule of club.events || []) {
        const earliest = rule.startDate > first ? rule.startDate : first;
        const stop = rule.until && rule.until < addDays(lastExclusive, -1)
          ? addDays(rule.until, 1) : lastExclusive;
        if (earliest >= stop) continue;
        const skipped = new Set(rule.skipDates || []);
        const emitted = new Set();
        const addOccurrence = function (day) {
          if (!day || !dateInRange(day, earliest, stop) || skipped.has(day) || emitted.has(day)) return;
          emitted.add(day);
          const occurrence = {
            id: club.id + ":" + rule.id + ":" + day,
            clubId: club.id,
            roomId: rule.roomId || null,
            title: rule.title,
            start: day + "T" + rule.startTime + ":00",
            extendedProps: {
              clubId: club.id,
              clubName: club.name,
              roomId: rule.roomId || null,
              place: rule.location || VENUE,
              recurring: true
            }
          };
          if (rule.endTime) occurrence.end = day + "T" + rule.endTime + ":00";
          result.push(occurrence);
        };
        if (rule.frequency === "monthly") {
          const firstMonth = monthNumber(earliest);
          const lastMonth = monthNumber(addDays(stop, -1));
          const anchorMonth = monthNumber(rule.startDate);
          for (let m = firstMonth; m <= lastMonth; m++) {
            if ((m - anchorMonth) % (rule.interval || 1) !== 0) continue;
            const year = Math.floor(m / 12), month = m % 12;
            for (const nth of rule.weeks || []) {
              addOccurrence(nthWeekday(year, month, WEEKDAYS[rule.weekday], nth));
            }
          }
        } else if (rule.frequency === "weekly") {
          const chosen = new Set((rule.weekdays || [rule.weekday]).map(d => WEEKDAYS[d]));
          const anchorWeek = weekBeginning(rule.startDate);
          for (let current = earliest; current < stop; current = addDays(current, 1)) {
            if (!chosen.has(dateUTC(current).getUTCDay())) continue;
            const elapsed = Math.round((weekBeginning(current) - anchorWeek) / (7 * DAY_MS));
            if (elapsed >= 0 && elapsed % (rule.interval || 1) === 0) addOccurrence(current);
          }
        }
      }
    }
    return result.sort(compareStarts);
  }

  function compareStarts(a, b) {
    return String(a.start).localeCompare(String(b.start)) || String(a.title).localeCompare(String(b.title));
  }

  function normalizeOneOff(events, clubs) {
    const clubNames = Object.fromEntries((clubs || []).map(c => [c.id, c.name]));
    return (events || []).filter(ev => ev && typeof ev.start === "string" && typeof ev.title === "string")
      .map((ev, index) => {
        const props = Object.assign({}, ev.extendedProps || {});
        const clubId = ev.clubId || props.clubId || null;
        const roomId = ev.roomId || props.roomId || null;
        return Object.assign({}, ev, {
          id: ev.id || "extra:" + index + ":" + ev.start,
          clubId: clubId,
          roomId: roomId,
          extendedProps: Object.assign(props, {
            clubId: clubId,
            clubName: clubNames[clubId] || props.clubName || "",
            roomId: roomId,
            place: props.place || ev.place || VENUE,
            recurring: false
          })
        });
      });
  }

  function publicEventsForRange(data, first, lastExclusive, clubId) {
    const recurring = expandRecurring(data.clubs, first, lastExclusive);
    const extras = normalizeOneOff(data.events, data.clubs)
      .filter(ev => ev.start.slice(0, 10) < lastExclusive &&
        (ev.end ? (ev.end.length === 10 ? ev.end > first : ev.end > first + "T00:00:00") : ev.start.slice(0, 10) >= first));
    return recurring.concat(extras)
      .filter(ev => !clubId || ev.clubId === clubId)
      .sort(compareStarts);
  }

  // Room availability groundwork: all reservations and scheduled club meetings
  // with a roomId occupy that room. Unassigned events do not reserve a room.
  function roomOccupancyForRange(data, first, lastExclusive) {
    const publicEvents = publicEventsForRange(data, first, lastExclusive);
    const bookings = (data.bookings || []).filter(b => b && b.roomId && b.start && b.end && b.status !== "cancelled")
      .map((b, i) => Object.assign({ id: "booking:" + i, status: "confirmed" }, b));
    return publicEvents.concat(bookings)
      .filter(ev => ev.roomId && ev.start && ev.end && ev.end > ev.start &&
        ev.start.slice(0, 10) < lastExclusive && ev.end.slice(0, 10) >= first)
      .sort(compareStarts);
  }

  function findRoomConflicts(occupancy) {
    const conflicts = [];
    const entries = (occupancy || []).filter(ev => ev.roomId && ev.start && ev.end && ev.end > ev.start && ev.status !== "cancelled")
      .sort(compareStarts);
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[j].start >= entries[i].end) break;
        if (entries[i].roomId === entries[j].roomId &&
            entries[i].start < entries[j].end && entries[j].start < entries[i].end &&
            entries[i].id !== entries[j].id) {
          conflicts.push([entries[i], entries[j]]);
        }
      }
    }
    return conflicts;
  }

  function todayInAdelaide() {
    const parts = new Intl.DateTimeFormat("en-AU", {
      timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return values.year + "-" + values.month + "-" + values.day;
  }

  function formatTime(iso) {
    if (!iso.includes("T")) return "All day";
    const match = iso.match(/T(\d{2}):(\d{2})/);
    if (!match) return "";
    const h = Number(match[1]);
    return ((h % 12) || 12) + ":" + match[2] + (h >= 12 ? " pm" : " am") + " Adelaide time";
  }

  function formatDate(iso) {
    const date = dateUTC(iso.slice(0, 10));
    if (!date) return iso;
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: "UTC", weekday: "long", day: "numeric", month: "short", year: "numeric"
    }).format(date);
  }

  function make(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value != null) element.textContent = String(value);
    return element;
  }

  function renderUpcoming(element, events, limit) {
    element.replaceChildren();
    const upcoming = events.slice().sort(compareStarts).slice(0, limit);
    if (!upcoming.length) {
      element.appendChild(make("p", "", "No upcoming events listed."));
      return;
    }
    for (const ev of upcoming) {
      const date = dateUTC(ev.start.slice(0, 10));
      if (!date) continue;
      const wrapper = make("article", "upcoming-item");
      const dateBlock = make("div", "upcoming-date");
      dateBlock.appendChild(make("span", "upcoming-mon", new Intl.DateTimeFormat("en-AU", {month: "short", timeZone: "UTC"}).format(date).toUpperCase()));
      dateBlock.appendChild(make("span", "upcoming-day", date.getUTCDate()));
      const body = make("div", "upcoming-body");
      body.appendChild(make("div", "upcoming-when", formatTime(ev.start)));
      body.appendChild(make("div", "upcoming-weekday", new Intl.DateTimeFormat("en-AU", { weekday: "long", timeZone: "UTC" }).format(date)));
      body.appendChild(make("div", "upcoming-title", ev.title));
      const props = ev.extendedProps || {};
      if (props.clubName && props.clubName !== ev.title) body.appendChild(make("div", "upcoming-club", props.clubName));
      if (props.place) body.appendChild(make("div", "upcoming-place", props.place));
      wrapper.appendChild(dateBlock);
      wrapper.appendChild(body);
      element.appendChild(wrapper);
    }
  }

  function siteRootUrl() {
    const script = document.querySelector("script[data-jpcc-events]");
    if (!script) throw new Error("Cannot locate shared JPCC script tag");
    return new URL("../../", script.src);
  }

  function fetchJson(relativePath) {
    return fetch(new URL(relativePath, siteRootUrl()))
      .then(response => {
        if (!response.ok) throw new Error(relativePath + " returned HTTP " + response.status);
        return response.json();
      });
  }

  function loadData() {
    if (!dataPromise) {
      dataPromise = Promise.all([
        fetchJson("data/clubs.json"), fetchJson("events.json"),
        fetchJson("data/rooms.json"), fetchJson("bookings.json")
      ]).then(([clubs, events, rooms, bookings]) => {
        if (![clubs, events, rooms, bookings].every(Array.isArray)) throw new Error("Calendar data must be JSON arrays");
        return { clubs, events, rooms, bookings };
      }).catch(error => {
        dataPromise = null;
        throw error;
      });
    }
    return dataPromise;
  }

  function renderError(el, error) {
    el.replaceChildren(make("p", "jpcc-calendar-error", "Calendar could not be loaded. Check that the site was rendered and its JSON files were published."));
    console.error("JPCC calendar error:", error);
  }

  function initCalendar(element) {
    if (!root.FullCalendar) {
      renderError(element, new Error("FullCalendar library missing"));
      return;
    }
    const calendar = new root.FullCalendar.Calendar(element, {
      initialView: "listMonth",
      // FullCalendar v6 uses UTC-coercion for named zones without a timezone plugin.
      // Our event strings represent Adelaide wall times; do not use JS local dates
      // from FullCalendar for formatting or persistence.
      timeZone: ZONE,
      height: "auto",
      firstDay: 1,
      headerToolbar: { left: "prev,next today", center: "title", right: "dayGridMonth,listMonth" },
      eventTimeFormat: { hour: "numeric", minute: "2-digit", meridiem: "short" },
      events: function (range, success, failure) {
        loadData().then(data => {
          success(publicEventsForRange(data, range.startStr.slice(0, 10), range.endStr.slice(0, 10)));
        }).catch(error => {
          renderError(element, error);
          failure(error);
        });
      },
      eventClick: function (info) {
        info.jsEvent.preventDefault();
        const props = info.event.extendedProps || {};
        const start = info.event.startStr;
        const room = props.roomId ? "Room: " + props.roomId + "\n" : "";
        const club = props.clubName ? "Club: " + props.clubName + "\n" : "";
        const url = props.url && /^https?:\/\//i.test(props.url) ? "\nMore information: " + props.url : "";
        alert(info.event.title + "\n" + formatDate(start) + "\n" + formatTime(start) + "\n" + club + room + (props.place || VENUE) + url);
      }
    });
    calendar.render();
  }

  // AJAX room-hire enquiries show errors on this page and redirect only after a
  // successful Formspree response. Without JavaScript the native POST still works.
  // Nothing here approves a booking or writes to the public calendar.
  function formspreeErrorMessage(response, payload) {
    if (response.status === 429) return "Too many submissions were sent recently. Please wait before trying again.";
    const errors = payload && Array.isArray(payload.errors) ? payload.errors : [];
    const messages = errors.map(err => err && err.message).filter(msg => typeof msg === "string" && msg.trim());
    if (messages.length) return messages.join(" ");
    if (response.status === 403) return "Formspree has rejected this submission. Please check its spam protection or contact the clubrooms organisers.";
    if (response.status >= 500) return "The enquiry service is temporarily unavailable. Please try again later.";
    return "Formspree did not accept the enquiry (HTTP " + response.status + "). Please check the form and try again.";
  }

  async function postRoomHireForm(form) {
    // Request JSON so Formspree returns a status/error response instead of
    // navigating to an external HTML error/thank-you page.
    const response = await root.fetch(form.action, {
      method: "POST",
      body: new root.FormData(form),
      headers: { Accept: "application/json" }
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) { /* unexpected non-JSON response */ }
    if (!response.ok) throw new Error(formspreeErrorMessage(response, payload));
    if (!payload || payload.ok === false) {
      // An HTML confirmation, challenge or proxy page isn't positive proof of
      // Formspree acceptance; keep the enquiry on screen rather than mislead.
      throw new Error("The form service returned an unexpected response. Your enquiry may have been received; please check before sending it again.");
    }
    return payload;
  }

  function initRoomHirePhotos() {
    const slots = [...document.querySelectorAll("[data-hall-photos]")];
    if (!slots.length) return;
    fetchJson("assets/hall-photos/manifest.json").then(galleries => {
      if (!Array.isArray(galleries)) return;
      for (const slot of slots) {
        const hallId = slot.getAttribute("data-hall-photos");
        const hall = galleries.find(g => g && g.id === hallId);
        if (!hall || !Array.isArray(hall.photos) || !hall.photos.length) continue;
        const thumbnails = [];
        for (const photo of hall.photos) {
          if (!photo || typeof photo.src !== "string" ||
              !/^assets\/hall-photos\/(large|small)\/[a-z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(photo.src) ||
              !photo.src.startsWith("assets/hall-photos/" + hallId + "/")) continue;
          const url = new URL(photo.src, siteRootUrl()).href;
          const link = make("a", "room-hire-photo-link");
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.setAttribute("aria-label", "View " + (photo.alt || hall.name + " photograph") + " full size");
          const picture = make("img", "room-hire-photo-thumb");
          picture.src = url;
          picture.alt = photo.alt || hall.name + " photograph";
          picture.loading = "lazy";
          link.appendChild(picture);
          thumbnails.push(link);
        }
        if (thumbnails.length) slot.replaceChildren(...thumbnails);
      }
    }).catch(error => {
      // Missing or unpublished photo manifest must never block form submission.
      console.warn("Hall photos unavailable:", error);
    });
  }
  function initRoomHireForm(form) {
    const room = form.querySelector("#hire-room");
    const attendees = form.querySelector("#hire-attendees");
    const note = form.querySelector("#hire-capacity-note");
    const date = form.querySelector("#hire-date");
    const finishDate = form.querySelector("#hire-end-date");
    const start = form.querySelector("#hire-start");
    const finish = form.querySelector("#hire-end");
    const frequency = form.querySelector("#hire-frequency");
    const repeatContainer = form.querySelector("#hire-repeat-container");
    const repeat = form.querySelector("#hire-repeat");
    const submitButton = form.querySelector('button[type="submit"]');
    const status = form.querySelector("#hire-form-status");
    let submitting = false;
    if (!room || !attendees || !date || !finishDate || !start || !finish || !frequency || !repeat) return;

    date.min = todayInAdelaide();
    finishDate.min = date.min;
    function updateDates() {
      finishDate.min = date.value || date.min;
      if (!finishDate.value || (date.value && finishDate.value < date.value)) finishDate.value = date.value;
      validateTimes();
    }
    function validateCapacity() {
      const selected = room.selectedOptions[0];
      const capacity = Number(selected && selected.dataset.capacity);
      if (capacity > 0) {
        attendees.max = String(capacity);
        note.textContent = "Maximum " + capacity + " seated guests for this hall.";
        attendees.setCustomValidity(attendees.value && Number(attendees.value) > capacity
          ? "This hall seats up to " + capacity + ". Please choose a larger hall or reduce the number of guests."
          : "");
      } else {
        attendees.max = "80";
        note.textContent = "Choose a hall to see its seating limit.";
        attendees.setCustomValidity("");
      }
    }
    function validateTimes() {
      const invalidDate = !!(date.value && finishDate.value && finishDate.value < date.value);
      finishDate.setCustomValidity(invalidDate ? "Finish date cannot be earlier than the start date." : "");
      const invalidTime = !!(date.value && finishDate.value && start.value && finish.value &&
        (invalidDate || (date.value === finishDate.value && finish.value <= start.value)));
      finish.setCustomValidity(invalidTime ? "Finish date and time must be later than the start date and time." : "");
    }
    function updateRecurrence() {
      const recurring = frequency.value === "Recurring";
      repeatContainer.hidden = !recurring;
      repeat.required = recurring;
      if (!recurring) repeat.value = "";
    }
    room.addEventListener("change", validateCapacity);
    attendees.addEventListener("input", validateCapacity);
    date.addEventListener("change", updateDates);
    finishDate.addEventListener("change", validateTimes);
    start.addEventListener("input", validateTimes);
    finish.addEventListener("input", validateTimes);
    frequency.addEventListener("change", updateRecurrence);
    for (const link of (typeof document === "undefined" ? [] : document.querySelectorAll("[data-select-hall]"))) {
      link.addEventListener("click", function () {
        const hallName = link.getAttribute("data-select-hall");
        if ([...room.options].some(option => option.value === hallName)) {
          room.value = hallName;
          room.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    }
    form.addEventListener("submit", async function (event) {
      validateCapacity();
      validateTimes();
      if (!form.reportValidity()) {
        event.preventDefault();
        return;
      }
      // If the script's AJAX prerequisites are unavailable, let the browser's
      // standard form POST proceed; Formspree dashboard redirect applies then.
      if (!submitButton || !status || typeof root.fetch !== "function" ||
          typeof root.FormData !== "function") return;
      event.preventDefault();
      if (submitting) return;
      submitting = true;
      submitButton.disabled = true;
      submitButton.textContent = "Sending enquiry…";
      status.hidden = false;
      status.dataset.state = "progress";
      status.textContent = "Sending your enquiry…";
      try {
        await postRoomHireForm(form);
        status.dataset.state = "success";
        status.textContent = "Enquiry received. Opening confirmation page…";
        if (root.location && typeof root.location.assign === "function") {
          root.location.assign(new URL("room-hire-thank-you.html", siteRootUrl()).href);
        }
      } catch (error) {
        status.dataset.state = "error";
        status.textContent = error && error.message
          ? error.message : "Unable to confirm your enquiry. Please check before resubmitting.";
        submitting = false;
        submitButton.disabled = false;
        submitButton.textContent = "Send room hire enquiry";
      }
    });
    validateCapacity();
    updateDates();
    validateTimes();
    updateRecurrence();
  }

  function init() {
    const hireForm = document.getElementById("jpcc-room-hire-form");
    if (hireForm) initRoomHireForm(hireForm);
    initRoomHirePhotos();
    const calendar = document.getElementById("calendar");
    if (calendar) initCalendar(calendar);
    const upcomingElements = [...document.querySelectorAll("#upcoming-events, [data-club-events]")];
    if (upcomingElements.length) {
      loadData().then(data => {
        const from = todayInAdelaide();
        const to = addDays(from, 731);
        for (const el of upcomingElements) {
          const clubId = el.getAttribute("data-club-events");
          renderUpcoming(el, publicEventsForRange(data, from, to, clubId), clubId ? 10 : 6);
        }
      }).catch(error => upcomingElements.forEach(el => renderError(el, error)));
    }
  }

  const api = {
    addDays, nthWeekday, expandRecurring, normalizeOneOff, publicEventsForRange,
    roomOccupancyForRange, findRoomConflicts, formatTime, todayInAdelaide, loadData,
    initRoomHireForm, initRoomHirePhotos, postRoomHireForm, formspreeErrorMessage
  };
  root.JPCCEvents = api;
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
