const http = require("http");
const TelegramBot = require("node-telegram-bot-api");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN is missing.");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, {
  polling: true
});

// ===============================
// WEB SERVER FOR RENDER
// ===============================

const PORT = process.env.PORT || 3000;

http
  .createServer((req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/plain"
    });

    res.end("🚤 MSB Automatic Ticket is running!");
  })
  .listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
  });

// ===============================
// SCHEDULE DATA
// ===============================

const schedules = {
  maafushiMale: [
    ["06:15", "Escape"],
    ["06:30", "iCom Tours"],
    ["07:30", "Maafushi Tours"],
    ["08:00", "iCom Tours"],
    ["09:00", "Real Tours"],
    ["09:30", "iCom Tours"],
    ["10:00", "Maafushi Tours"],
    ["11:30", "Escape"],
    ["12:00", "iCom Tours"],
    ["12:30", "Real Tours"],
    ["13:00", "Maafushi Tours"],
    ["14:30", "iCom Tours"],
    ["14:45", "Escape"],
    ["15:00", "Real Tours"],
    ["16:00", "Maafushi Tours"],
    ["17:00", "iCom Tours"],
    ["17:15", "Escape"],
    ["18:30", "Real Tours"],
    ["19:30", "Maafushi Tours"],
    ["20:00", "iCom Tours"],
    ["21:00", "Escape"]
  ],

  maleMaafushi: [
    ["07:45", "iCom Tours"],
    ["09:00", "Maafushi Tours"],
    ["09:15", "iCom Tours"],
    ["09:45", "Escape"],
    ["10:15", "Real Tours"],
    ["10:45", "iCom Tours"],
    ["12:00", "Maafushi Tours"],
    ["12:45", "Escape"],
    ["13:30", "iCom Tours"],
    ["14:00", "Real Tours"],
    ["14:30", "Maafushi Tours"],
    ["15:40", "iCom Tours"],
    ["16:00", "Escape"],
    ["16:45", "Real Tours"],
    ["17:15", "Maafushi Tours"],
    ["18:30", "iCom Tours"],
    ["19:30", "Escape"],
    ["21:00", "Real Tours"],
    ["22:00", "iCom Tours / Maafushi Tours"],
    ["22:30", "Escape"]
  ]
};

// ===============================
// START COMMAND
// ===============================

bot.onText(/^\/start$/, async (msg) => {
  const chatId = msg.chat.id;

  await bot.sendMessage(
    chatId,
    "🚤 WELCOME TO MSB AUTOMATIC TICKET!\n\n" +
      "🇲🇻 Maldives Speedboat Booking\n\n" +
      "Choose an option below:",
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🎫 Book Ticket",
              callback_data: "book"
            }
          ],
          [
            {
              text: "📋 Schedule",
              callback_data: "schedule"
            }
          ],
          [
            {
              text: "🎟️ My Tickets",
              callback_data: "tickets"
            }
          ],
          [
            {
              text: "ℹ️ Help",
              callback_data: "help"
            }
          ]
        ]
      }
    }
  );
});

// ===============================
// BUTTON HANDLER
// ===============================

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  await bot.answerCallbackQuery(query.id);

  // -------------------------------
  // MAIN MENU
  // -------------------------------

  if (data === "menu") {
    await bot.editMessageText(
      "🚤 MSB AUTOMATIC TICKET\n\n" +
        "🇲🇻 Maldives Speedboat Booking\n\n" +
        "Choose an option:",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🎫 Book Ticket",
                callback_data: "book"
              }
            ],
            [
              {
                text: "📋 Schedule",
                callback_data: "schedule"
              }
            ],
            [
              {
                text: "🎟️ My Tickets",
                callback_data: "tickets"
              }
            ],
            [
              {
                text: "ℹ️ Help",
                callback_data: "help"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  // -------------------------------
  // SCHEDULE MENU
  // -------------------------------

  if (data === "schedule") {
    await bot.editMessageText(
      "📋 SPEEDBOAT SCHEDULE\n\n" +
        "Please select your route:",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🅰️ Maafushi → Malé",
                callback_data: "route_maafushi_male"
              }
            ],
            [
              {
                text: "🅱️ Malé → Maafushi",
                callback_data: "route_male_maafushi"
              }
            ],
            [
              {
                text: "⭐ Special Ferries",
                callback_data: "special"
              }
            ],
            [
              {
                text: "🔙 Main Menu",
                callback_data: "menu"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  // -------------------------------
  // ROUTE A
  // -------------------------------

  if (data === "route_maafushi_male") {
    let text =
      "🅰️ MAAFUSHI → MALÉ\n\n" +
      "📋 Daily Schedule\n\n";

    schedules.maafushiMale.forEach((trip, index) => {
      text += `${index + 1}. 🕐 ${trip[0]} — 🚤 ${trip[1]}\n`;
    });

    text += "\n👇 Select a trip to continue.";

    const buttons = schedules.maafushiMale.map((trip, index) => [
      {
        text: `🕐 ${trip[0]} — ${trip[1]}`,
        callback_data: `trip_A_${index}`
      }
    ]);

    buttons.push([
      {
        text: "🔙 Back",
        callback_data: "schedule"
      }
    ]);

    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: buttons
      }
    });

    return;
  }

  // -------------------------------
  // ROUTE B
  // -------------------------------

  if (data === "route_male_maafushi") {
    let text =
      "🅱️ MALÉ → MAAFUSHI\n\n" +
      "📋 Daily Schedule\n\n";

    schedules.maleMaafushi.forEach((trip, index) => {
      text += `${index + 1}. 🕐 ${trip[0]} — 🚤 ${trip[1]}\n`;
    });

    text += "\n👇 Select a trip to continue.";

    const buttons = schedules.maleMaafushi.map((trip, index) => [
      {
        text: `🕐 ${trip[0]} — ${trip[1]}`,
        callback_data: `trip_B_${index}`
      }
    ]);

    buttons.push([
      {
        text: "🔙 Back",
        callback_data: "schedule"
        }
    ]);

    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: buttons
      }
    });

    return;
  }

  // -------------------------------
  // SPECIAL FERRIES
  // -------------------------------

  if (data === "special") {
    await bot.editMessageText(
      "⭐ SPECIAL FERRIES\n\n" +
        "🟢 Saturday\n" +
        "22:00 — Maafushi → Malé → Airport\n" +
        "Real Tours\n\n" +
        "22:45 — Airport → Malé → Maafushi\n" +
        "Real Tours\n\n" +
        "23:00 — Malé → Maafushi\n" +
        "Real Tours\n\n" +
        "🟢 Friday / Saturday / Sunday\n" +
        "23:25 — Maafushi → Malé → Airport\n" +
        "Escape\n\n" +
        "🟢 Thursday / Friday / Saturday\n" +
        "06:15 — Airport → Malé → Maafushi\n" +
        "Escape\n\n" +
        "06:30 — Malé → Maafushi\n" +
        "Escape",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔙 Back",
                callback_data: "schedule"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  // -------------------------------
  // SELECT TRIP
  // -------------------------------

  if (data.startsWith("trip_A_")) {
    const index = Number(data.split("_")[2]);
    const trip = schedules.maafushiMale[index];

    await bot.editMessageText(
      "🎫 SELECTED TRIP\n\n" +
        "📍 Route: Maafushi → Malé\n" +
        `🕐 Departure: ${trip[0]}\n` +
        `🚤 Operator: ${trip[1]}\n\n` +
        "Seat availability will be confirmed before payment.\n\n" +
        "This booking system is currently being built. 🚧",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔙 Back to Schedule",
                callback_data: "route_maafushi_male"
              }
            ],
            [
              {
                text: "🏠 Main Menu",
                callback_data: "menu"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  if (data.startsWith("trip_B_")) {
    const index = Number(data.split("_")[2]);
    const trip = schedules.maleMaafushi[index];

    await bot.editMessageText(
      "🎫 SELECTED TRIP\n\n" +
        "📍 Route: Malé → Maafushi\n" +
        `🕐 Departure: ${trip[0]}\n` +
        `🚤 Operator: ${trip[1]}\n\n` +
        "Seat availability will be confirmed before payment.\n\n" +
        "This booking system is currently being built. 🚧",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔙 Back to Schedule",
                callback_data: "route_male_maafushi"
              }
            ],
            [
              {
                text: "🏠 Main Menu",
                callback_data: "menu"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  // -------------------------------
  // BOOK TICKET
  // -------------------------------

  if (data === "book") {
    await bot.editMessageText(
      "🎫 BOOK A SPEEDBOAT TICKET\n\n" +
        "The booking system is currently being prepared.\n\n" +
        "Please use 📋 Schedule to select a trip.",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📋 View Schedule",
                callback_data: "schedule"
              }
            ],
            [
              {
                text: "🏠 Main Menu",
                callback_data: "menu"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  // -------------------------------
  // MY TICKETS
  // -------------------------------

  if (data === "tickets") {
    await bot.editMessageText(
      "🎟️ MY TICKETS\n\n" +
        "You don't have any tickets yet.\n\n" +
        "Book your first speedboat trip!",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🎫 Book Ticket",
                callback_data: "book"
              }
            ],
            [
              {
                text: "🏠 Main Menu",
                callback_data: "menu"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  // -------------------------------
  // HELP
  // -------------------------------

  if (data === "help") {
    await bot.editMessageText(
      "ℹ️ MSB AUTOMATIC TICKET\n\n" +
        "🚤 Book Maldives speedboat tickets.\n\n" +
        "📋 View schedules\n" +
        "🎫 Request a ticket\n" +
        "🏦 Pay by BML transfer\n" +
        "🎟️ Receive your confirmed ticket\n\n" +
        "Our team confirms seat availability before payment.",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🏠 Main Menu",
                callback_data: "menu"
              }
            ]
          ]
        }
      }
    );

    return;
  }
});

// ===============================
// ERROR HANDLING
// ===============================

bot.on("polling_error", (error) => {
  console.error(
    "Telegram polling error:",
    error.message
  );
});

console.log("🚤 MSB Automatic Ticket is starting...");
