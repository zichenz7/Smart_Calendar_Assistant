/** Rule-based, informational break suggestions. One UI entry point. */
function showSmartBreaksCard(e) {
  const timeZone = CalendarApp.getDefaultCalendar().getTimeZone();
  const card = CardService.newCardBuilder().setHeader(
    CardService.newCardHeader().setTitle("🌿 Smart Break Suggestions")
      .setSubtitle(`Free time until 23:00 (${timeZone})`)
  );
  const section = CardService.newCardSection();
  const breaks = detectFreeTimeToday();
  section.addWidget(CardService.newTextParagraph().setText(
    breaks.length === 0
      ? "📅 No free interval of at least 25 minutes remains before 23:00."
      : `📅 <b>${breaks.length}</b> free interval(s) before 23:00.<br>Times use ${escapeHtml_(timeZone)}.`
  ));
  breaks.forEach(b => {
    section.addWidget(CardService.newTextParagraph().setText(
      `🕒 <b>${escapeHtml_(b.startStr)} – ${escapeHtml_(b.endStr)}</b><br>💡 ${b.suggestion}`
    ));
  });
  return CardService.newActionResponseBuilder().setNavigation(
    CardService.newNavigation().pushCard(card.addSection(section).build())
  ).build();
}

function detectFreeTimeToday() {
  const cal = CalendarApp.getDefaultCalendar();
  const timeZone = cal.getTimeZone();
  const now = new Date();
  const day = Utilities.formatDate(now, timeZone, "yyyy-MM-dd");
  // Parse the local boundary in the calendar's IANA zone, not a fixed UTC offset.
  const endOfDay = Utilities.parseDate(`${day} 23:00:00`, timeZone, "yyyy-MM-dd HH:mm:ss");
  if (now >= endOfDay) return []; // Never issue a reversed Calendar query.
  const events = cal.getEvents(now, endOfDay).map(event => ({
    start: event.getStartTime(), end: event.getEndTime(),
  }));
  // All-day events remain occupied intervals, as in the previous active flow.
  return findFreeSlots_(events, now, endOfDay).map(slot => {
    const minutes = (slot.end - slot.start) / 60000;
    const suggestion = minutes < 40
      ? "Stand up, stretch your body, drink some water, and rest your eyes from the screen."
      : minutes < 70
        ? "Go for a short walk, do a light workout, or make a healthy snack."
        : "Perfect time for a deep rest: go outside, take a walk, or do something you truly enjoy.";
    return {
      start: slot.start,
      end: slot.end,
      startStr: Utilities.formatDate(slot.start, timeZone, "HH:mm z"),
      endStr: Utilities.formatDate(slot.end, timeZone, "HH:mm z"),
      suggestion,
    };
  });
}

/** Merge busy intervals and clip every emitted slot to [start, end]. */
function findFreeSlots_(events, start, end) {
  const windowStart = start.getTime();
  const windowEnd = end.getTime();
  if (windowStart >= windowEnd) return [];
  const busy = events.map(event => ({
    start: Math.max(windowStart, event.start.getTime()),
    end: Math.min(windowEnd, event.end.getTime()),
  })).filter(event => event.start < event.end).sort((a, b) => a.start - b.start);
  const slots = [];
  let cursor = windowStart;
  function addSlot(from, to) {
    if (to - from >= 25 * 60000) slots.push({ start: new Date(from), end: new Date(to) });
  }
  busy.forEach(event => {
    addSlot(cursor, event.start);
    cursor = Math.max(cursor, event.end);
  });
  addSlot(cursor, windowEnd);
  return slots;
}
