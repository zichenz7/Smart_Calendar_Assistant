function onHomepage(e) {
  return createHomePage();
}

function createHomePage() {
  const card = CardService.newCardBuilder();

  card.setHeader(
    CardService.newCardHeader()
      .setTitle("🧠 Smart Calendar Assistant")
      .setSubtitle("AI-powered focus and scheduling")
  );

  const tasks = getTasksFromCalendar();
  const todayTasks = tasks.filter(t => isToday(t.start));
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
          `⭐ <b>${t.title}</b><br>🏷️ ${t.tag} | 🚨 ${t.priority}<br>🔥 Score: ${t.priorityScore}`
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
  const formInputs = e.commonEventObject.formInputs;

  function safeGet(obj, key, def = null) {
    try {
      if (!obj || !obj[key]) return def;

      const item = obj[key];

      if (item.stringInputs?.value) return item.stringInputs.value[0];

      if (item.dateTimeInput) {
        const dt = item.dateTimeInput;
        return (
          dt.msSinceEpoch?.[0] ||
          dt.valueMsSinceEpoch?.[0] ||
          dt.msSinceEpoch ||
          dt.valueMsSinceEpoch ||
          def
        );
      }

      return def;
    } catch (err) {
      return def;
    }
  }

  const title = safeGet(formInputs, "title", "Untitled Task");
  const startEpoch = safeGet(formInputs, "startTime");
  const duration = parseFloat(safeGet(formInputs, "duration", "1")) || 1;
  const tag = safeGet(formInputs, "tag", "General");
  const priority = safeGet(formInputs, "priority", "Medium");
  const flexibility = safeGet(formInputs, "flexibility", "No");
  const colorId = safeGet(formInputs, "colorId", "1");

  if (!startEpoch) throw new Error("Start time missing or invalid");

  const rawDate = new Date(parseInt(startEpoch));
  const startTime =
    new Date(rawDate.getTime() + rawDate.getTimezoneOffset() * 60000);
  const endTime = new Date(startTime.getTime() + duration * 3600000);

  const timeZone = Session.getScriptTimeZone();

  const event = {
    summary: title,
    description: `Tag: ${tag}\nPriority: ${priority}\nFlexibility: ${flexibility}`,
    start: {
      dateTime: formatLocalDateTime(startTime),
      timeZone: timeZone,
    },
    end: {
      dateTime: formatLocalDateTime(endTime),
      timeZone: timeZone,
    },
    colorId: colorId,
  };

  Calendar.Events.insert(event, "primary");

  const confirmCard = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("✅ Task Created!"))
    .addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText(
          `<b>${title}</b> (${priority})<br>🏷️ ${tag}<br>🎨 Color: ${colorId}<br>⏰ ${startTime.toLocaleString()} → ${endTime.toLocaleString()}`
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

function isToday(date) {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
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
  if (!desc) return {};
  const patterns = {
    tag: /Tag:\s*([A-Za-z0-9,\s]+)/i,
    priority: /Priority:\s*(High|Medium|Low)/i,
    flexibility: /Flexibility:\s*(Yes|No)/i,
  };
  const result = {};
  for (const key in patterns) {
    const match = desc.match(patterns[key]);
    if (match) result[key] = match[1].trim();
  }
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

function formatLocalDateTime(d) {
  return (
    d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0") + "T" +
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0") + ":" +
    String(d.getSeconds()).padStart(2, "0")
  );
}




