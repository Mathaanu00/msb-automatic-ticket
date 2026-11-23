const http = require("http");
const TelegramBot = require("node-telegram-bot-api");
const { Pool } = require("pg");

// ===============================
// ENVIRONMENT VARIABLES
// ===============================

const TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID?.trim();
const DATABASE_URL = process.env.DATABASE_URL?.trim();

// Diagnostic check (does not reveal secret values)
console.log("========== ENVIRONMENT CHECK ==========");
console.log("TELEGRAM_BOT_TOKEN:", TOKEN ? "FOUND" : "MISSING");
console.log("ADMIN_TELEGRAM_ID:", ADMIN_ID ? "FOUND" : "MISSING");
console.log("DATABASE_URL:", DATABASE_URL ? "FOUND" : "MISSING");
console.log("=======================================");

if (!TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN is missing");
  process.exit(1);
}

if (!ADMIN_ID) {
  console.error("❌ ADMIN_TELEGRAM_ID is missing");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is missing");
  process.exit(1);
}


// ===============================
// TELEGRAM BOT
// ===============================

const bot = new TelegramBot(TOKEN, {
  polling: true
});

// ===============================
// DATABASE
// ===============================

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ===============================
// CREATE BOOKINGS TABLE
// ===============================

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        booking_id VARCHAR(30) UNIQUE NOT NULL,
        telegram_user_id BIGINT NOT NULL,
        route VARCHAR(100) NOT NULL,
        travel_date DATE NOT NULL,
        departure_time VARCHAR(10) NOT NULL,
        operator VARCHAR(100) NOT NULL,
        passenger_name VARCHAR(200) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        passenger_count INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING_SEAT_CONFIRMATION',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("✅ Database initialized");
  } catch (error) {
    console.error("❌ Database error:", error.message);
  }
}

initializeDatabase();

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
// SCHEDULES
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
// TEMPORARY BOOKING SESSIONS
// ===============================

const sessions = new Map();

// ===============================
// BOOKING ID
// ===============================

function generateBookingId() {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `MSB-${random}`;
}

// ===============================
// DATE FUNCTIONS
// ===============================

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

function displayDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function generateDates() {
  const dates = [];

  const today = new Date();

  for (let i = 0; i < 30; i++) {
    const date = new Date(today);

    date.setDate(today.getDate() + i);

    dates.push({
      value: formatDate(date),
      label:
        i === 0
          ? `📅 Today — ${date.getDate()} ${date.toLocaleString("en", {
              month: "short"
            })}`
          : i === 1
          ? `📅 Tomorrow — ${date.getDate()} ${date.toLocaleString("en", {
              month: "short"
            })}`
          : `📅 ${date.getDate()} ${date.toLocaleString("en", {
              month: "short"
            })}`
    });
  }

  return dates;
}

// ===============================
// MAIN MENU
// ===============================

async function showMainMenu(chatId, messageId = null) {
  const text =
    "🚤 MSB AUTOMATIC TICKET\n\n" +
    "🇲🇻 Maldives Speedboat Booking\n\n" +
    "Choose an option below:";

  const options = {
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
  };

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      ...options
    });
  } else {
    await bot.sendMessage(chatId, text, options);
  }
}

// ===============================
// START
// ===============================

bot.onText(/^\/start$/, async (msg) => {
  sessions.delete(msg.chat.id);

  await showMainMenu(msg.chat.id);
});

// ===============================
// CALLBACK HANDLER
// ===============================

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  await bot.answerCallbackQuery(query.id);

  // =============================
  // MAIN MENU

// =============================

  if (data === "menu") {
    sessions.delete(chatId);

    await showMainMenu(chatId, messageId);

    return;
  }

  // =============================
  // BOOKING START
  // =============================

  if (data === "book") {
    sessions.set(chatId, {
      step: "route"
    });

    await bot.editMessageText(
      "🎫 BOOK A SPEEDBOAT TICKET\n\n" +
        "Select your route:",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🅰️ Maafushi → Malé",
                callback_data: "book_route_A"
              }
            ],
            [
              {
                text: "🅱️ Malé → Maafushi",
                callback_data: "book_route_B"
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

  // =============================
  // BOOKING ROUTE A
  // =============================

  if (data === "book_route_A") {
    const session = sessions.get(chatId) || {};

    session.route = "Maafushi → Malé";
    session.routeCode = "A";
    session.step = "date";

    sessions.set(chatId, session);

    const dates = generateDates();

    const buttons = dates.map((date) => [
      {
        text: date.label,
        callback_data: `book_date_${date.value}`
      }
    ]);

    buttons.push([
      {
        text: "🔙 Back",
        callback_data: "book"
      }
    ]);

    await bot.editMessageText(
      "🅰️ MAAFUSHI → MALÉ\n\n" +
        "📅 Select your travel date:",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: buttons
        }
      }
    );

    return;
  }

  // =============================
  // BOOKING ROUTE B
  // =============================

  if (data === "book_route_B") {
    const session = sessions.get(chatId) || {};

    session.route = "Malé → Maafushi";
    session.routeCode = "B";
    session.step = "date";

    sessions.set(chatId, session);

    const dates = generateDates();

    const buttons = dates.map((date) => [
      {
        text: date.label,
        callback_data: `book_date_${date.value}`
      }
    ]);

    buttons.push([
      {
        text: "🔙 Back",
        callback_data: "book"
      }
    ]);

    await bot.editMessageText(
      "🅱️ MALÉ → MAAFUSHI\n\n" +
        "📅 Select your travel date:",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: buttons
        }
      }
    );

    return;
  }

  // =============================
  // DATE SELECTION
  // =============================

  if (data.startsWith("book_date_")) {
    const selectedDate = data.replace("book_date_", "");

    const session = sessions.get(chatId);

    if (!session) {
      await bot.sendMessage(
        chatId,
        "⚠️ Your booking session expired. Please start again with /start."
      );

      return;
    }

    session.travelDate = selectedDate;
    session.step = "departure";

    sessions.set(chatId, session);

    const schedule =
      session.routeCode === "A"
        ? schedules.maafushiMale
        : schedules.maleMaafushi;

    const buttons = schedule.map((trip, index) => [
      {
        text: `🕐 ${trip[0]} — ${trip[1]}`,
        callback_data: `book_trip_${index}`
      }
    ]);

    buttons.push([
      {
        text: "🔙 Back",
        callback_data:
          session.routeCode === "A"
            ? "book_route_A"
            : "book_route_B"
      }
    ]);

    await bot.editMessageText(
      `📅 ${displayDate(selectedDate)}\n\n` +
        "🕐 Select your departure:",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: buttons
        }
      }
    );

    return;
  }

  // =============================
  // TRIP SELECTION
  // =============================

  if (data.startsWith("book_trip_")) {
    const index = Number(data.replace("book_trip_", ""));

    const session = sessions.get(chatId);

    if (!session) {
      await bot.sendMessage(
        chatId,
        "⚠️ Your booking session expired. Please start again with /start."
      );

      return;
    }

    const schedule =
      session.routeCode === "A"
        ? schedules.maafushiMale
        : schedules.maleMaafushi;

    const trip = schedule[index];

    if (!trip) {
      await bot.sendMessage(
        chatId,
        "⚠️ Invalid departure. Please start again."
      );

      return;
    }

    session.departureTime = trip[0];
    session.operator = trip[1];
    session.step = "passenger_name";

    sessions.set(chatId, session);

    await bot.sendMessage(
      chatId,
      "👤 Please enter the **main passenger's full name**:",
      {
        parse_mode: "Markdown"
      }
    );

    return;
  }

  // =============================
  // PASSENGER COUNT
  // =============================

  if (data.startsWith("passengers_")) {
    const count = Number(data.replace("passengers_", ""));

    const session = sessions.get(chatId);

    if (!session) {
      await bot.sendMessage(
        chatId,
        "⚠️ Your booking session expired. Please start again."
      );

      return;
    }

    session.passengerCount = count;
    session.step = "confirm";

    sessions.set(chatId, session);

    await showBookingConfirmation(chatId);

    return;
  }

  // =============================
  // CONFIRM BOOKING
  // =============================

  if (data === "confirm_booking") {
    await createBooking(chatId);

    return;
  }

  // =============================
  // CANCEL BOOKING
  // =============================

  if (data === "cancel_booking") {
    sessions.delete(chatId);

    await bot.editMessageText(
      "❌ Booking cancelled.\n\n" +
        "You can start again whenever you're ready.",
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

  // =============================
  // SCHEDULE
  // =============================

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

  // =============================
  // SCHEDULE A
  // =============================

  if (data === "route_maafushi_male") {
    let text =
      "🅰️ MAAFUSHI → MALÉ\n\n" +
      "📋 Daily Schedule\n\n";

    schedules.maafushiMale.forEach((trip, index) => {
      text += `${index + 1}. 🕐 ${trip[0]} — 🚤 ${trip[1]}\n`;
    });

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

  // =============================
  // SCHEDULE B
  // =============================

  if (data === "route_male_maafushi") {
    let text =
      "🅱️ MALÉ → MAAFUSHI\n\n" +
      "📋 Daily Schedule\n\n";

    schedules.maleMaafushi.forEach((trip, index) => {
      text += `${index + 1}. 🕐 ${trip[0]} — 🚤 ${trip[1]}\n`;
    });

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

  // =============================
  // SPECIAL FERRIES
  // =============================

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

  // =============================
  // TRIP DISPLAY
  // =============================

  if (data.startsWith("trip_A_")) {
    const index = Number(data.split("_")[2]);
    const trip = schedules.maafushiMale[index];

    await bot.editMessageText(
      "🎫 SELECTED TRIP\n\n" +
        "📍 Route: Maafushi → Malé\n" +
        `🕐 Departure: ${trip[0]}\n` +
        `🚤 Operator: ${trip[1]}\n\n` +
        "Please use 🎫 Book Ticket to make a booking.",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🎫 Book This Trip",
                callback_data: "book"
              }
            ],
            [
              {
                text: "🔙 Back",
                callback_data: "route_maafushi_male"
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
        "Please use 🎫 Book Ticket to make a booking.",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🎫 Book This Trip",
                callback_data: "book"
              }
            ],
            [
              {
                text: "🔙 Back",
                callback_data: "route_male_maafushi"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  // =============================
  // MY TICKETS
  // =============================

  if (data === "tickets") {
    const result = await pool.query(
      `
      SELECT booking_id, route, travel_date, departure_time,
             operator, passenger_count, status
      FROM bookings
      WHERE telegram_user_id = $1
      ORDER BY created_at DESC
      LIMIT 10
      `,
      [chatId]
    );

    if (result.rows.length === 0) {
      await bot.editMessageText(
        "🎟️ MY TICKETS\n\n" +
          "You don't have any bookings yet.",
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

    let text = "🎟️ YOUR BOOKINGS\n\n";

    result.rows.forEach((booking) => {
      text +=
        `🎫 ${booking.booking_id}\n` +
        `📍 ${booking.route}\n` +
        `📅 ${displayDate(
          booking.travel_date.toISOString().split("T")[0]
        )}\n` +
        `🕐 ${booking.departure_time}\n` +
        `🚤 ${booking.operator}\n` +
        `👥 ${booking.passenger_count}\n` +
        `📌 ${booking.status}\n\n`;
    });

    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🎫 New Booking",
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
    });

    return;
  }

  // =============================
  // HELP
  // =============================

  if (data === "help") {
    await bot.editMessageText(
      "ℹ️ MSB AUTOMATIC TICKET\n\n" +
        "🚤 Maldives speedboat booking\n\n" +
        "📋 View schedules\n" +

"🎫 Request a ticket\n" +
        "🏦 Pay by BML transfer\n" +
        "🎟️ Receive your confirmed ticket\n\n" +
        "Seat availability is confirmed before payment.",
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
// TEXT MESSAGE HANDLER
// ===============================

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) {
    return;
  }

  const chatId = msg.chat.id;
  const session = sessions.get(chatId);

  if (!session) {
    return;
  }

  // =============================
  // PASSENGER NAME
  // =============================

  if (session.step === "passenger_name") {
    const name = msg.text.trim();

    if (name.length < 2 || name.length > 200) {
      await bot.sendMessage(
        chatId,
        "⚠️ Please enter a valid full name."
      );

      return;
    }

    session.passengerName = name;
    session.step = "phone";

    sessions.set(chatId, session);

    await bot.sendMessage(
      chatId,
      "📱 Please enter the **main passenger's phone number**.\n\n" +
        "International numbers are accepted.\n\n" +
        "Example: +960 7XXXXXX",
      {
        parse_mode: "Markdown"
      }
    );

    return;
  }

  // =============================
  // PHONE
  // =============================

  if (session.step === "phone") {
    const phone = msg.text.trim();

    const cleanedPhone = phone.replace(/[^\d+]/g, "");

    if (cleanedPhone.length < 7 || cleanedPhone.length > 20) {
      await bot.sendMessage(
        chatId,
        "⚠️ Please enter a valid phone number."
      );

      return;
    }

    session.phone = phone;
    session.step = "passenger_count";

    sessions.set(chatId, session);

    const buttons = [];

    for (let i = 1; i <= 10; i += 2) {
      const row = [];

      row.push({
        text: `👥 ${i}`,
        callback_data: `passengers_${i}`
      });

      if (i + 1 <= 10) {
        row.push({
          text: `👥 ${i + 1}`,
          callback_data: `passengers_${i + 1}`
        });
      }

      buttons.push(row);
    }

    buttons.push([
      {
        text: "❌ Cancel",
        callback_data: "cancel_booking"
      }
    ]);

    await bot.sendMessage(
      chatId,
      "👥 How many passengers?\n\n" +
        "Maximum: 10 passengers",
      {
        reply_markup: {
          inline_keyboard: buttons
        }
      }
    );

    return;
  }
});

// ===============================
// BOOKING CONFIRMATION SCREEN
// ===============================

async function showBookingConfirmation(chatId) {
  const session = sessions.get(chatId);

  if (!session) {
    return;
  }

  const text =
    "🔎 PLEASE CHECK YOUR BOOKING\n\n" +
    `📍 Route: ${session.route}\n` +
    `📅 Date: ${displayDate(session.travelDate)}\n` +
    `🕐 Departure: ${session.departureTime}\n` +
    `🚤 Operator: ${session.operator}\n` +
    `👤 Passenger: ${session.passengerName}\n` +
    `📱 Phone: ${session.phone}\n` +
    `👥 Passengers: ${session.passengerCount}\n\n` +
    "⚠️ Seats are NOT confirmed yet.\n\n" +
    "Submit this request and our booking team will check seat availability.";

  await bot.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✅ Submit Booking Request",
            callback_data: "confirm_booking"
          }
        ],
        [
          {
            text: "❌ Cancel",
            callback_data: "cancel_booking"
          }
        ]
      ]
    }
  });
}

// ===============================
// CREATE BOOKING
// ===============================

async function createBooking(chatId) {
  const session = sessions.get(chatId);

  if (!session) {
    await bot.sendMessage(
      chatId,
      "⚠️ Your booking session expired. Please start again."
    );

    return;
  }

  const bookingId = generateBookingId();

  try {
    await pool.query(
      `
      INSERT INTO bookings (
        booking_id,
        telegram_user_id,
        route,
        travel_date,
        departure_time,
        operator,
        passenger_name,
        phone,
        passenger_count,
        status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        bookingId,
        chatId,
        session.route,
        session.travelDate,
        session.departureTime,
        session.operator,
        session.passengerName,
        session.phone,
        session.passengerCount,
        "PENDING_SEAT_CONFIRMATION"
      ]
    );

    await bot.sendMessage(
      chatId,
      "✅ **BOOKING REQUEST RECEIVED**\n\n" +
        `🎫 Booking ID: ${bookingId}\n\n` +
        `📍 ${session.route}\n` +
        `📅 ${displayDate(session.travelDate)}\n` +
        `🕐 ${session.departureTime}\n` +
        `🚤 ${session.operator}\n` +
        `👥 ${session.passengerCount} passenger(s)\n\n` +
        "⏳ **Status: Waiting for seat confirmation**\n\n" +
        "Please wait while our booking team confirms the seats.",
      {
        parse_mode: "Markdown"
      }
    );

    // =============================
    // SEND TO ADMIN
    // =============================

    await bot.sendMessage(
      ADMIN_ID,
      "🚨 **NEW BOOKING REQUEST**\n\n" +
        `🎫 Booking ID: ${bookingId}\n` +
        `📍 Route: ${session.route}\n` +
        `📅 Date: ${displayDate(session.travelDate)}\n` +
        `🕐 Departure: ${session.departureTime}\n` +
        `🚤 Operator: ${session.operator}\n` +
        `👤 Passenger: ${session.passengerName}\n` +
        `📱 Phone: ${session.phone}\n` +
        `👥 Passengers: ${session.passengerCount}\n\n` +
        "⏳ **ACTION REQUIRED**\n" +
        "Please contact the operator and confirm seat availability.",
      {
        parse_mode: "Markdown"
      }
    );

    sessions.delete(chatId);

  } catch (error) {
    console.error("❌ Booking creation error:", error.message);

    await bot.sendMessage(
      chatId,
      "❌ Sorry, we couldn't create your booking right now.\n\n" +
        "Please try again later."
    );
  }
}

// ===============================
// POLLING ERROR
// ===============================

bot.on("polling_error", (error) => {
  console.error(
    "Telegram polling error:",
    error.message
  );
});

console.log("🚤 MSB Automatic Ticket is starting...");
