/**
 * 🌿 Smart Break Suggestions v3.0
 * - 自动检测今天的空档
 * - 推荐可执行的小休息活动
 * - 一键加入 Google Calendar，完全无时间偏差
 */


/** ====== 页面入口：显示智能休息建议 ====== */
function showSmartBreaksCard() {
  const card = CardService.newCardBuilder();

  card.setHeader(
    CardService.newCardHeader()
      .setTitle("🌿 Smart Break Suggestions")
      .setSubtitle("Detect your free time today & recommend healthy breaks")
  );

  // 获取数据
  const events = getTodayEvents_();
  const gaps = findGaps_(events);
  const suggestions = suggestBreaks_(gaps);

  const section = CardService.newCardSection();

  // 顶部概要
  section.addWidget(
    CardService.newTextParagraph().setText(
      `📅 <b>${suggestions.length}</b> recommended breaks found today`
    )
  );

  // 如无建议
  if (suggestions.length === 0) {
    section.addWidget(
      CardService.newTextParagraph().setText(
        "🎉 No usable free time detected — enjoy your productive day!"
      )
    );
  }

  // 显示建议
  suggestions.forEach(s => {
    const label = `${formatTime_(s.start)}–${formatTime_(s.end)} ${s.emoji} ${s.suggestion}`;

    const action = CardService.newAction()
      .setFunctionName("addBreakToCalendar_")
      .setParameters({ data: JSON.stringify(s) });

    const btn = CardService.newTextButton()
      .setText("➕ Add")
      .setOnClickAction(action)
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED);

    section.addWidget(
      CardService.newKeyValue()
        .setTopLabel(label)
        .setButton(btn)
    );
  });

  // 返回按钮
  const backButton = CardService.newTextButton()
    .setText("🔙 Back to Home")
    .setOnClickAction(CardService.newAction().setFunctionName("onHomepage"));
  section.addWidget(backButton);

  card.addSection(section);
  return card.build();
}



/** ====== 读取当天事件（非全天） ====== */
function getTodayEvents_() {
  const cal = CalendarApp.getDefaultCalendar();

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  return cal.getEvents(start, end)
    .filter(ev => !ev.isAllDayEvent())
    .map(ev => ({
      title: ev.getTitle(),
      start: ev.getStartTime(),
      end: ev.getEndTime()
    }))
    .sort((a, b) => a.start - b.start);
}



/** ====== 计算事件间空档 ====== */
function findGaps_(events) {
  const now = new Date();
  const gaps = [];

  for (let i = 0; i < events.length - 1; i++) {
    const gapStart = events[i].end;
    const gapEnd = events[i + 1].start;

    if (gapEnd <= now) continue;       // 跳过过去
    if (gapEnd <= gapStart) continue;  // 重叠事件跳过

    const durationMin = (gapEnd - gapStart) / 60000;

    if (durationMin >= 15) {
      gaps.push({
        start: gapStart,
        end: gapEnd,
        duration: durationMin
      });
    }
  }

  return gaps;
}



/** ====== 根据空档生成建议 ====== */
function suggestBreaks_(gaps) {
  const results = [];

  gaps.forEach(g => {
    let suggestion, emoji, recMinutes, color;

    if (g.duration < 25) {
      suggestion = "Coffee Break";
      emoji = "☕";
      recMinutes = 15;
      color = "5";    // Banana Yellow
    } else if (g.duration < 45) {
      suggestion = "Short Walk";
      emoji = "🌿";
      recMinutes = 20;
      color = "2";    // Sage
    } else if (g.duration < 90) {
      suggestion = "Lunch Break";
      emoji = "🍱";
      recMinutes = 30;
      color = "6";    // Tangerine
    } else {
      suggestion = "Light Reading";
      emoji = "📖";
      recMinutes = 45;
      color = "9";    // Blueberry
    }

    const recEnd = new Date(g.start.getTime() + recMinutes * 60000);

    if (recEnd <= g.end) {
      results.push({
        start: g.start,
        end: recEnd,
        suggestion,
        emoji,
        colorId: color
      });
    }
  });

  return results;
}



/** ====== 添加到 Google Calendar（无时间偏差） ====== */
function addBreakToCalendar_(e) {
  const s = JSON.parse(e.parameters.data);

  const start = new Date(s.start);
  const end = new Date(s.end);
  const title = `${s.emoji} ${s.suggestion}`;
  const timeZone = Session.getScriptTimeZone();

  const event = {
    summary: title,
    description: "Auto-generated Smart Break.",
    start: {
      dateTime: formatLocalDateTime_(start),
      timeZone: timeZone
    },
    end: {
      dateTime: formatLocalDateTime_(end),
      timeZone: timeZone
    },
    colorId: s.colorId
  };

  Calendar.Events.insert(event, "primary");

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(`✔ Added ${title}`))
    .setNavigation(CardService.newNavigation().updateCard(showSmartBreaksCard()))
    .build();
}



/** ====== 工具函数：格式化 HH:mm ====== */
function formatTime_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "HH:mm");
}



/** ====== 工具函数：Calendar 需要的本地日期格式 ====== */
function formatLocalDateTime_(d) {
  return (
    d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()) + "T" +
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0") + ":" +
    String(d.getSeconds()).padStart(2, "0")
  );
}

/**
 * 点击 “🌿 Smart Break Suggestions” 按钮后显示的卡片
 */
function showSmartBreaksCard(e) {
  const card = CardService.newCardBuilder();

  card.setHeader(
    CardService.newCardHeader()
      .setTitle("🌿 Smart Break Suggestions")
      .setSubtitle("Detect your free time & recommend healthy breaks")
  );

  const section = CardService.newCardSection();

  // 读取今天的空闲时间段
  const breaks = detectFreeTimeToday();

  if (breaks.length === 0) {
    section.addWidget(
      CardService.newTextParagraph().setText(
        "📅 <b>0 recommended breaks found today</b><br>" +
        "🎉 No usable free time detected — enjoy your productive day!"
      )
    );
  } else {
    section.addWidget(
      CardService.newTextParagraph().setText(
        `📅 <b>${breaks.length} recommended break(s) found today</b><br>` +
        "Here are some healthy break ideas based on your free time:"
      )
    );

    breaks.forEach(b => {
      section.addWidget(
        CardService.newTextParagraph().setText(
          `🕒 <b>${b.startStr} – ${b.endStr}</b><br>` +
          `💡 ${b.suggestion}`
        )
      );
    });
  }

  // 返回 ActionResponse：用 pushCard 的方式打开这个新卡片
  return CardService.newActionResponseBuilder()
    .setNavigation(
      CardService.newNavigation().pushCard(
        card.addSection(section).build()
      )
    )
    .build();
}


/**
 * 检测今天从“现在”到睡前的空闲时间段，返回推荐的 break 列表
 */
function detectFreeTimeToday() {
  const cal = CalendarApp.getDefaultCalendar();

  const now = new Date();
  const startOfWindow = now;  // 从现在开始
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23, 0, 0
  );

  // 获取今天剩余时间的所有事件
  const events = cal.getEvents(startOfWindow, endOfDay);

  // 按开始时间排序
  events.sort((a, b) => a.getStartTime() - b.getStartTime());

  const freeSlots = [];
  let cursor = new Date(startOfWindow);

  const MIN_BREAK_MINUTES = 25; // 最小 break 时长（分钟）

  function pushSlotIfLongEnough(from, to) {
    const diffMin = (to - from) / (1000 * 60);
    if (diffMin >= MIN_BREAK_MINUTES) {
      freeSlots.push({ start: new Date(from), end: new Date(to) });
    }
  }

  // 找“现在 → 第一个事件之间”的空档，和相邻事件之间的空档
  for (let i = 0; i < events.length; i++) {
    const evStart = events[i].getStartTime();
    const evEnd = events[i].getEndTime();

    // 有空档：cursor → 下一个事件开始
    if (evStart > cursor) {
      pushSlotIfLongEnough(cursor, evStart);
    }

    // 游标跳到当前事件结束
    if (evEnd > cursor) {
      cursor = new Date(evEnd);
    }
  }

  // 最后一个事件结束 → 一天结束 之间的空档
  if (cursor < endOfDay) {
    pushSlotIfLongEnough(cursor, endOfDay);
  }

  // 把纯时间段 + 建议文案 变成最终返回结果
  return freeSlots.map(slot => {
    const minutes = (slot.end - slot.start) / (1000 * 60);

    let suggestion;
    if (minutes < 40) {
      suggestion = "Stand up, stretch your body, drink some water, and rest your eyes from the screen.";
    } else if (minutes < 70) {
      suggestion = "Go for a short walk, do a light workout, or make a healthy snack.";
    } else {
      suggestion = "Perfect time for a deep rest: go outside, take a walk, or do something you truly enjoy.";
    }

    return {
      start: slot.start,
      end: slot.end,
      startStr: slot.start.toLocaleTimeString(),
      endStr: slot.end.toLocaleTimeString(),
      suggestion,
    };
  });
}
