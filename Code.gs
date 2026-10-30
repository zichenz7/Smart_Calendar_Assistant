function onHomepage(e) {
  return createHomePage();
}

function createHomePage() {
  const card = CardService.newCardBuilder();

  card.setHeader(
    CardService.newCardHeader()
      .setTitle("🧠 Smart Calendar Assistant")
      .setSubtitle("Rule-based focus and break suggestions")
  );

  const tasks = getTasksFromCalendar();
  const now = new Date();
  const timeZone = CalendarApp.getDefaultCalendar().getTimeZone();
  const todayTasks = tasks.filter(t => isToday(t.start, now, timeZone));
  todayTasks.sort((a, b) => b.priorityScore - a.priorityScore);
  const focusTasks = todayTasks.slice(0, 3);

  const focusSection = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText("🌟 <b>Today’s Focus</b>"));

  if (focusTasks.length === 0) {
    focusSection.addWidget(CardService.newTextParagraph().setText("No focus tasks today 🎉"));
  } else {
    focusTasks.forEach(t => {
      focusSection.addWidget(
        CardService.newTextParagraph().setText(
          `⭐ <b>${escapeHtml_(t.title)}</b><br>🏷️ ${escapeHtml_(t.tag)} | 🚨 ${escapeHtml_(t.priority)}<br>🔥 Score: ${t.priorityScore}`
        )
      );
    });
  }

  const addAction = CardService.newAction().setFunctionName("showAddTaskForm");
  const addButton = CardService.newTextButton()
    .setText("➕ Add Task")
    .setOnClickAction(addAction)
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED);

  focusSection.addWidget(addButton);
  card.addSection(focusSection);

  const toolsSection = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText("<b>🧩 More Tools</b>"))
    .addWidget(
      CardService.newTextButton()
        .setText("🌿 Smart Break Suggestions")
        .setOnClickAction(CardService.newAction().setFunctionName("showSmartBreaksCard"))
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    );

  card.addSection(toolsSection);

  return card.build();
}

function showAddTaskForm() {
  const form = CardService.newCardBuilder();

  form.setHeader(
    CardService.newCardHeader()
      .setTitle("📝 Add New Task")
      .setSubtitle("Create a new Calendar event")
  );

  const section = CardService.newCardSection();

  section.addWidget(
    CardService.newTextInput()
      .setFieldName("title")
      .setTitle("Title")
      .setHint("e.g., Study Chapter 5")
  );

  const now = new Date();
  section.addWidget(
    CardService.newDateTimePicker()
      .setFieldName("startTime")
      .setTitle("Start Time")
      .setValueInMsSinceEpoch(now.getTime())
  );

  section.addWidget(
    CardService.newTextInput()
      .setFieldName("duration")
      .setTitle("Duration (hours)")
      .setHint("e.g., 1.5")
  );

  const tagDropdown = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle("Tag")
    .setFieldName("tag")
    .addItem("Study", "Study", true)
    .addItem("Work", "Work", false)
    .addItem("Exercise", "Exercise", false)
    .addItem("Entertainment", "Entertainment", false)
    .addItem("Rest", "Rest", false)
    .addItem("Reading", "Reading", false)
    .addItem("Social", "Social", false)
    .addItem("CPA Prep", "CPA Prep", false)
    .addItem("Personal Dev", "Personal Dev", false)
    .addItem("Errands", "Errands", false);

  section.addWidget(tagDropdown);

  section.addWidget(
    CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.DROPDOWN)
      .setTitle("Priority")
      .setFieldName("priority")
      .addItem("High", "High", false)
      .addItem("Medium", "Medium", true)
      .addItem("Low", "Low", false)
  );

  section.addWidget(
    CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.DROPDOWN)
      .setTitle("Flexibility")
      .setFieldName("flexibility")
      .addItem("No", "No", true)
      .addItem("Yes", "Yes", false)
  );

  const colorPicker = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle("Event Color")
    .setFieldName("colorId")
    .addItem("🟣 Lavender", "1", true)
    .addItem("🟢 Sage", "2", false)
    .addItem("🟪 Grape", "3", false)
    .addItem("🟥 Flamingo", "4", false)
    .addItem("🟡 Banana", "5", false)
    .addItem("🟧 Tangerine", "6", false)
    .addItem("🩵 Peacock", "7", false)
    .addItem("⚫ Graphite", "8", false)
    .addItem("🔵 Blueberry", "9", false)
    .addItem("🟩 Basil", "10", false);

  section.addWidget(colorPicker);

  const submitAction = CardService.newAction().setFunctionName("submitAddTask");
  section.addWidget(
    CardService.newTextButton()
      .setText("✅ Create Task")
      .setOnClickAction(submitAction)
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
  );

  form.addSection(section);
  return form.build();
}

function submitAddTask(e) {
  let event;
  const timeZone = CalendarApp.getDefaultCalendar().getTimeZone();
  try {
    event = buildTaskEvent_(e, timeZone);
  } catch (error) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText(error.message))
      .build();
  }
  const title = event.summary;
  const info = parseEventDescription(event.description);
  const priority = info.priority;
  const tag = info.tag;
  const colorId = event.colorId;
  const startTime = new Date(event.start.dateTime);
  const endTime = new Date(event.end.dateTime);

  Calendar.Events.insert(event, "primary");

  const confirmCard = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("✅ Task Created!"))
    .addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText(
          `<b>${escapeHtml_(title)}</b> (${escapeHtml_(priority)})<br>🏷️ ${escapeHtml_(tag)}<br>🎨 Color: ${escapeHtml_(colorId)}<br>⏰ ${formatCalendarDateTime_(startTime, timeZone)} → ${formatCalendarDateTime_(endTime, timeZone)} (${escapeHtml_(timeZone)})`
        )
      )
    )
    .addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextButton()
          .setText("🔙 Back to Home")
          .setOnClickAction(
            CardService.newAction().setFunctionName("onHomepage")
          )
      )
    );

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(`🎨 Task created with custom color!`))
    .setNavigation(
      CardService.newNavigation().updateCard(confirmCard.build())
    )
    .build();
}

// Calendar-local dates must not depend on the script or runtime time zone.
function isToday(date, now, timeZone) {
  now = now || new Date();
  timeZone = timeZone || CalendarApp.getDefaultCalendar().getTimeZone();
  return Utilities.formatDate(date, timeZone, "yyyy-MM-dd") ===
    Utilities.formatDate(now, timeZone, "yyyy-MM-dd");
}

function getTasksFromCalendar() {
  const cal = CalendarApp.getDefaultCalendar();
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const events = cal.getEvents(now, nextWeek);

  return events.map(ev => {
    const info = parseEventDescription(ev.getDescription());
    const tag = info.tag || "General";
    const priority = info.priority || "Medium";
    const flexibility = info.flexibility || "No";
    const duration = (ev.getEndTime() - ev.getStartTime()) / (1000 * 60 * 60);
    const priorityScore = calculatePriority({
      tagWeight: 3,
      priority,
      flexibility,
      deadline: ev.getEndTime(),
    });

    return {
      title: ev.getTitle(),
      start: ev.getStartTime(),
      end: ev.getEndTime(),
      tag,
      priority,
      flexibility,
      duration,
      priorityScore,
    };
  });
}

function parseEventDescription(desc) {
  if (typeof desc !== "string" || !desc) return {};
  // Calendar descriptions may contain line breaks serialized as HTML.
  const lines = desc.replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:div|p)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "").split(/\r\n|\r|\n/);
  const result = {};
  lines.forEach(line => {
    const match = line.match(/^[ \t]*(Tag|Priority|Flexibility)[ \t]*:[ \t]*(.*?)[ \t]*$/i);
    if (!match) return;
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    // Keep the first valid occurrence; never consume the next metadata line.
    if (!value || Object.prototype.hasOwnProperty.call(result, key)) return;
    if (key === "tag") result.tag = value;
    if (key === "priority" && /^(high|medium|low)$/i.test(value)) {
      result.priority = value[0].toUpperCase() + value.slice(1).toLowerCase();
    }
    if (key === "flexibility" && /^(yes|no)$/i.test(value)) {
      result.flexibility = value[0].toUpperCase() + value.slice(1).toLowerCase();
    }
  });
  return result;
}

function calculatePriority(t) {
  const now = new Date();
  const daysLeft = (t.deadline - now) / (1000 * 60 * 60 * 24);
  const deadlineFactor = Math.max(0.5, Math.min(2, 7 / (daysLeft + 1)));
  const priorityFactor =
    t.priority === "High" ? 1.5 : t.priority === "Low" ? 0.8 : 1;
  const flexFactor = t.flexibility === "No" ? 1.2 : 0.8;
  return Math.round(t.tagWeight * 20 * deadlineFactor * priorityFactor * flexFactor);
}

function formatCalendarDateTime_(date, timeZone) {
  return Utilities.formatDate(date, timeZone, "yyyy-MM-dd HH:mm z");
}

function escapeHtml_(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function singleValue_(value) {
  if (Array.isArray(value)) return value.length === 1 ? value[0] : null;
  return value;
}

function readTextInput_(inputs, name, fallback) {
  const value = singleValue_(inputs[name]?.stringInputs?.value);
  return typeof value === "string" ? value : fallback;
}

// Build and validate before calling Calendar: invalid forms never create events.
function buildTaskEvent_(e, timeZone) {
  const inputs = e?.commonEventObject?.formInputs || {};
  const dateInput = inputs.startTime?.dateTimeInput;
  const rawEpoch = singleValue_(dateInput?.msSinceEpoch);
  if (!dateInput || dateInput.hasDate === false || dateInput.hasTime === false ||
      !["string", "number"].includes(typeof rawEpoch) ||
      !/^-?\d+$/.test(String(rawEpoch).trim())) {
    throw new Error("Select a valid start date and time.");
  }
  const epoch = Number(rawEpoch);
  const start = new Date(epoch);
  if (!Number.isSafeInteger(epoch) || !Number.isFinite(start.getTime())) {
    throw new Error("Select a valid start date and time.");
  }
  const duration = Number(readTextInput_(inputs, "duration", "1"));
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Duration must be a positive number of hours.");
  }
  // Duration is elapsed time, including across daylight-saving transitions.
  const end = new Date(epoch + duration * 3600000);
  if (!Number.isFinite(end.getTime()) || end <= start) {
    throw new Error("Duration produces an invalid end time.");
  }
  const oneLine = value => value.replace(/[\r\n]+/g, " ").trim();
  const title = readTextInput_(inputs, "title", "Untitled Task").trim() || "Untitled Task";
  const tag = oneLine(readTextInput_(inputs, "tag", "General")) || "General";
  const priority = readTextInput_(inputs, "priority", "Medium");
  const flexibility = readTextInput_(inputs, "flexibility", "No");
  const colorId = readTextInput_(inputs, "colorId", "1");
  if (!["High", "Medium", "Low"].includes(priority) ||
      !["Yes", "No"].includes(flexibility) || !/^(?:[1-9]|10)$/.test(colorId)) {
    throw new Error("Select valid priority, flexibility, and color values.");
  }
  return {
    summary: title,
    description: `Tag: ${tag}\nPriority: ${priority}\nFlexibility: ${flexibility}`,
    // The picker already supplies an absolute epoch. Do not add an offset.
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
    colorId,
  };
}
