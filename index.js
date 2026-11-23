
const http = require("http");
const TelegramBot = require("node-telegram-bot-api");
const { Pool } = require("pg");

// ==========================================
// 1. ENVIRONMENT VARIABLES
// ==========================================

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID?.trim();
const DATABASE_URL = process.env.DATABASE_URL;

if (!TOKEN || !ADMIN_ID || !DATABASE_URL) {
  console.error("❌ Missing environment variables.");

  if (!TOKEN) console.error("TELEGRAM_BOT_TOKEN is missing");
  if (!ADMIN_ID) console.error("ADMIN_TELEGRAM_ID is missing");
  if (!DATABASE_URL) console.error("DATABASE_URL is missing");

  process.exit(1);
}

// ==========================================
// 2. TELEGRAM BOT
// ==========================================

const bot = new TelegramBot(TOKEN, {
  polling: true
});

// ==========================================
// 3. DATABASE
// ==========================================

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initializeDatabase() {
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
}

const databaseReady = initializeDatabase().catch((error) => {
  console.error("❌ Database initialization failed:", error.message);
  process.exit(1);
});

// ==========================================
// 4. RENDER WEB SERVER
// ==========================================

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });

  res.end("🚤 MSB Automatic Ticket is running!");
}).listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

// ==========================================
// 5. SPEEDBOAT SCHEDULES
// ==========================================

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

// ==========================================
// 6. BOOKING SESSIONS
// ==========================================

const sessions = new Map();

function generateBookingId() {
  return `MSB-${Math.floor(100000 + Math.random() * 900000)}`;
}

// ==========================================
// 7. DATE FUNCTIONS
// ==========================================

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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

    let label;

    if (i === 0) {
      label = `📅 Today — ${date.getDate()} ${date.toLocaleString("en", { month: "short" })}`;
    } else if (i === 1) {
      label = `📅 Tomorrow — ${date.getDate()} ${date.toLocaleString("en", { month: "short" })}`;
    } else {
      label = `📅 ${date.getDate()} ${date.toLocaleString("en", { month: "short" })}`;
    }

    dates.push({
      value: formatDate(date),
      label
    });
  }

  return dates;
}

// ==========================================
// 8. MAIN MENU
// ==========================================

async function showMainMenu(chatId, messageId = null) {
  const text =
    "🚤 MSB AUTOMATIC TICKET\n\n" +
    "🇲🇻 Maldives Speedboat Booking\n\n" +
    "Choose an option below:";

  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🎫 Book Ticket", callback_data: "book" }],
        [{ text: "📋 Schedule", callback_data: "schedule" }],
        [{ text: "🎟️ My Tickets", callback_data: "tickets" }],
        [{ text: "ℹ️ Help", callback_data: "help" }]
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

// ==========================================
// 9. START COMMAND
// ==========================================

bot.onText(/^\/start$/, async (msg) => {
  try {
    sessions.delete(msg.chat.id);
    await showMainMenu(msg.chat.id);
  } catch (error) {
    console.error("Start error:", error.message);
  }
});

// ==========================================
// 10. ADMIN APPROVAL SYSTEM
// ==========================================

async function handleAdminDecision(query, approved) {
  const adminChatId = query.message.chat.id;

  // Verify admin identity
  if (String(query.from.id) !== String(ADMIN_ID)) {
    await bot.answerCallbackQuery(query.id, {
      text: "⛔ You are not authorized!",
      show_alert: true
    });

    return;
  }

  // Ensure the action came from the configured admin chat
  if (String(adminChatId) !== String(ADMIN_ID)) {
    await bot.answerCallbackQuery(query.id, {
      text: "⛔ Invalid admin chat!",
      show_alert: true
    });

    return;
  }

  const prefix = approved ? "admin_confirm_" : "admin_reject_";
  const bookingId = query.data.slice(prefix.length);

  if (!bookingId) {
    await bot.answerCallbackQuery(query.id, {
      text: "Invalid booking ID!",
      show_alert: true
    });

    return;
  }

  try {
    await databaseReady;

    const newStatus = approved ? "CONFIRMED" : "REJECTED";

    // Only pending bookings can be processed
    const result = await pool.query(
      `
      UPDATE bookings
      SET status = $1
      WHERE booking_id = $2
      AND status = 'PENDING_SEAT_CONFIRMATION'
      RETURNING booking_id, telegram_user_id
      `,
      [newStatus, bookingId]
    );

    if (result.rows.length === 0) {
      await bot.answerCallbackQuery(query.id, {
        text: "⚠️ Already processed or booking not found!",
        show_alert: true
      });

      return;
    }

    const booking = result.rows[0];

    // Remove the action buttons
    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      {
        chat_id: adminChatId,
        message_id: query.message.message_id
      }
    );

    await bot.answerCallbackQuery(query.id, {
      text: approved
        ? "✅ Booking confirmed!"
        : "❌ Booking rejected!"
    });

    // Notify customer
    const customerMessage = approved
      ? (
          "✅ BOOKING CONFIRMED!\n\n" +
          `🎫 Booking ID: ${bookingId}\n\n` +
          "Your seats have been confirmed.\n\n" +
          "Thank you for choosing MSB! 🚤"
        )
      : (
          "❌ BOOKING REJECTED\n\n" +
          `🎫 Booking ID: ${bookingId}\n\n` +
          "Unfortunately, your booking could not be confirmed.\n\n" +
          "Please contact our booking team for assistance."
        );

    try {
      await bot.sendMessage(
        booking.telegram_user_id,
        customerMessage
      );
    } catch (notificationError) {
      console.error(
        "Customer notification error:",
        notificationError.message
      );

      await bot.sendMessage(
        ADMIN_ID,
        `⚠️ Booking ${bookingId} was updated, but the customer notification failed.`
      );
    }

    await bot.sendMessage(
      ADMIN_ID,
      approved
        ? `✅ Booking ${bookingId} has been CONFIRMED.`
        : `❌ Booking ${bookingId} has been REJECTED.`
    );

  } catch (error) {
    console.error("Admin decision error:", error.message);

    await bot.answerCallbackQuery(query.id, {
      text: "❌ Unable to update booking!",
      show_alert: true
    });
  }
}

// ==========================================
// 11. CALLBACK HANDLER
// ==========================================

bot.on("callback_query", async (query) => {
  try {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    // Admin actions must be handled before normal callbacks
    if (data.startsWith("admin_confirm_")) {
      await handleAdminDecision(query, true);
      return;
    }

    if (data.startsWith("admin_reject_")) {
      await handleAdminDecision(query, false);
      return;
    }

    await bot.answerCallbackQuery(query.id);

    // MAIN MENU
    if (data === "menu") {
      sessions.delete(chatId);
      await showMainMenu(chatId, messageId);
      return;
    }

    // BOOKING START
    if (data === "book") {
      sessions.set(chatId, { step: "route" });

      await bot.editMessageText(
        "🎫 BOOK A SPEEDBOAT TICKET\n\nSelect your route:",
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [{ text: "🅰️ Maafushi → Malé", callback_data: "book_route_A" }],
              [{ text: "🅱️ Malé → Maafushi", callback_data: "book_route_B" }],
              [{ text: "🔙 Main Menu", callback_data: "menu" }]
            ]
          }
        }
      );

      return;
    }

    // ROUTE A AND B
    if (data === "book_route_A" || data === "book_route_B") {
      const routeA = data === "book_route_A";
      const session = sessions.get(chatId) || {};

      session.route = routeA
        ? "Maafushi → Malé"
        : "Malé → Maafushi";

      session.routeCode = routeA ? "A" : "B";
      session.step = "date";

      sessions.set(chatId, session);

      const dates = generateDates();

      const buttons = dates.map((date) => [{
        text: date.label,
        callback_data: `book_date_${date.value}`
      }]);

      buttons.push([{
        text: "🔙 Back",
        callback_data: "book"
      }]);

      await bot.editMessageText(
        `${routeA ? "🅰️ MAAFUSHI → MALÉ" : "🅱️ MALÉ → MAAFUSHI"}\n\n📅 Select your travel date:`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: buttons }
        }
      );

      return;
    }

    // DATE SELECTION
    if (data.startsWith("book_date_")) {
      const selectedDate = data.replace("book_date_", "");
      const session = sessions.get(chatId);

      if (!session) {
        await bot.sendMessage(chatId, "⚠️ Your booking session expired. Please start again with /start.");
        return;
      }

      session.travelDate = selectedDate;
      session.step = "departure";

      sessions.set(chatId, session);

      const schedule = session.routeCode === "A"
        ? schedules.maafushiMale
        : schedules.maleMaafushi;

      const buttons = schedule.map((trip, index) => [{
        text: `🕐 ${trip[0]} — ${trip[1]}`,
        callback_data: `book_trip_${index}`
      }]);

      buttons.push([{
        text: "🔙 Back",
        callback_data: session.routeCode === "A"
          ? "book_route_A"
          : "book_route_B"
      }]);

      await bot.editMessageText(
        `📅 ${displayDate(selectedDate)}\n\n🕐 Select your departure:`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: buttons }
        }
      );

      return;
    }

    // TRIP SELECTION
    if (data.startsWith("book_trip_")) {
      const index = Number(data.replace("book_trip_", ""));
      const session = sessions.get(chatId);

      if (!session) {
        await bot.sendMessage(chatId, "⚠️ Your booking session expired. Please start again.");
        return;
      }

      const schedule = session.routeCode === "A"
        ? schedules.maafushiMale
        : schedules.maleMaafushi;

      const trip = schedule[index];

      if (!trip) {
        await bot.sendMessage(chatId, "⚠️ Invalid departure. Please start again.");
        return;
      }

      session.departureTime = trip[0];
      session.operator = trip[1];
      session.step = "passenger_name";

      sessions.set(chatId, session);

      await bot.sendMessage(
        chatId,
        "👤 Please enter the **main passenger's full name**:",
        { parse_mode: "Markdown" }
      );

      return;
    }

    // PASSENGER COUNT
    if (data.startsWith("passengers_")) {
      const count = Number(data.replace("passengers_", ""));
      const session = sessions.get(chatId);

      if (!session || !Number.isInteger(count) || count < 1 || count > 10) {
        await bot.sendMessage(chatId, "⚠️ Invalid selection. Please start again.");
        return;
      }

      session.passengerCount = count;
      session.step = "confirm";

      sessions.set(chatId, session);

      await showBookingConfirmation(chatId);
      return;
    }

    // SUBMIT BOOKING
    if (data === "confirm_booking") {
      await createBooking(chatId);
      return;
    }

    // CANCEL BOOKING
    if (data === "cancel_booking") {
      sessions.delete(chatId);

      await bot.editMessageText(
        "❌ Booking cancelled.\n\nYou can start again whenever you're ready.",
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [{ text: "🎫 Book Ticket", callback_data: "book" }],
              [{ text: "🏠 Main Menu", callback_data: "menu" }]
            ]
          }
        }
      );

      return;
    }

    // SCHEDULE MENU
    if (data === "schedule") {
      await bot.editMessageText(
        "📋 SPEEDBOAT SCHEDULE\n\nPlease select your route:",
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [{ text: "🅰️ Maafushi → Malé", callback_data: "route_maafushi_male" }],
              [{ text: "🅱️ Malé → Maafushi", callback_data: "route_male_maafushi" }],
              [{ text: "⭐ Special Ferries", callback_data: "special" }],
              [{ text: "🔙 Main Menu", callback_data: "menu" }]
            ]
          }
        }
      );

      return;
    }

    // SCHEDULE DISPLAY
    if (
      data === "route_maafushi_male" ||
      data === "route_male_maafushi"
    ) {
      const routeA = data === "route_maafushi_male";
      const schedule = routeA
        ? schedules.maafushiMale
        : schedules.maleMaafushi;

      const title = routeA
        ? "🅰️ MAAFUSHI → MALÉ"
        : "🅱️ MALÉ → MAAFUSHI";

      let text = `${title}\n\n📋 Daily Schedule\n\n`;

      schedule.forEach((trip, index) => {
        text += `${index + 1}. 🕐 ${trip[0]} — 🚤 ${trip[1]}\n`;
      });

      const buttons = schedule.map((trip, index) => [{
        text: `🕐 ${trip[0]} — ${trip[1]}`,
        callback_data: `trip_${routeA ? "A" : "B"}_${index}`
      }]);

      buttons.push([{
        text: "🔙 Back",
        callback_data: "schedule"
      }]);

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: buttons }
      });

      return;
    }

    // SPECIAL FERRIES
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
              [{ text: "🔙 Back", callback_data: "schedule" }]
            ]
          }
        }
      );

      return;
    }

    // TRIP DETAILS
    if (data.startsWith("trip_A_") || data.startsWith("trip_B_")) {
      const parts = data.split("_");
      const routeA = parts[1] === "A";
      const index = Number(parts[2]);

      const schedule = routeA
        ? schedules.maafushiMale
        : schedules.maleMaafushi;

      const trip = schedule[index];

      if (!trip) return;

      await bot.editMessageText(
        "🎫 SELECTED TRIP\n\n" +
        `📍 Route: ${routeA ? "Maafushi → Malé" : "Malé → Maafushi"}\n` +
        `🕐 Departure: ${trip[0]}\n` +
        `🚤 Operator: ${trip[1]}\n\n` +
        "Please use 🎫 Book Ticket to make a booking.",
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [{ text: "🎫 Book This Trip", callback_data: "book" }],
              [{
                text: "🔙 Back",
                callback_data: routeA
                  ? "route_maafushi_male"
                  : "route_male_maafushi"
              }]
            ]
          }
        }
      );

      return;
    }

    // MY TICKETS
    if (data === "tickets") {
      await databaseReady;

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
          "🎟️ MY TICKETS\n\nYou don't have any bookings yet.",
          {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
              inline_keyboard: [
                [{ text: "🎫 Book Ticket", callback_data: "book" }],
                [{ text: "🏠 Main Menu", callback_data: "menu" }]
              ]
            }
          }
        );

        return;
      }

      let text = "🎟️ YOUR BOOKINGS\n\n";

      result.rows.forEach((booking) => {
        const date = booking.travel_date instanceof Date
          ? booking.travel_date.toISOString().split("T")[0]
          : String(booking.travel_date).split("T")[0];

        text +=
          `🎫 ${booking.booking_id}\n` +
          `📍 ${booking.route}\n` +
          `📅 ${displayDate(date)}\n` +
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
            [{ text: "🎫 New Booking", callback_data: "book" }],
            [{ text: "🏠 Main Menu", callback_data: "menu" }]
          ]
        }
      });

      return;
    }

    // HELP
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
              [{ text: "🏠 Main Menu", callback_data: "menu" }]
            ]
          }
        }
      );

      return;
    }

  } catch (error) {
    console.error("Callback error:", error.message);

    try {
      await bot.answerCallbackQuery(query.id, {
        text: "⚠️ Something went wrong. Please try again.",
        show_alert: true
      });
    } catch (_) {}
  }
});

// ==========================================
// 12. CUSTOMER TEXT MESSAGE HANDLER
// ==========================================

bot.on("message", async (msg) => {
  try {
    if (!msg.text || msg.text.startsWith("/")) {
      return;
    }

    const chatId = msg.chat.id;
    const session = sessions.get(chatId);

    if (!session) return;

    // PASSENGER NAME
    if (session.step === "passenger_name") {
      const name = msg.text.trim();

      if (name.length < 2 || name.length > 200) {
        await bot.sendMessage(chatId, "⚠️ Please enter a valid full name.");
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
        { parse_mode: "Markdown" }
      );

      return;
    }

    // PHONE NUMBER
    if (session.step === "phone") {
      const phone = msg.text.trim();
      const cleanedPhone = phone.replace(/[^\d+]/g, "");

      if (cleanedPhone.length < 7 || cleanedPhone.length > 20) {
        await bot.sendMessage(chatId, "⚠️ Please enter a valid phone number.");
        return;
      }

      session.phone = phone;
      session.step = "passenger_count";

      sessions.set(chatId, session);

      const buttons = [];

      for (let i = 1; i <= 10; i += 2) {
        const row = [{ text: `👥 ${i}`, callback_data: `passengers_${i}` }];

        if (i + 1 <= 10) {
          row.push({
            text: `👥 ${i + 1}`,
            callback_data: `passengers_${i + 1}`
          });
        }

        buttons.push(row);
      }

      buttons.push([{
        text: "❌ Cancel",
        callback_data: "cancel_booking"
      }]);

      await bot.sendMessage(
        chatId,
        "👥 How many passengers?\n\nMaximum: 10 passengers",
        { reply_markup: { inline_keyboard: buttons } }
      );

      return;
    }

  } catch (error) {
    console.error("Message handler error:", error.message);
  }
});

// ==========================================
// 13. BOOKING CONFIRMATION SCREEN
// ==========================================

async function showBookingConfirmation(chatId) {
  const session = sessions.get(chatId);

  if (!session) return;

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
        [{ text: "✅ Submit Booking Request", callback_data: "confirm_booking" }],
        [{ text: "❌ Cancel", callback_data: "cancel_booking" }]
      ]
    }
  });
}

// ==========================================
// 14. CREATE BOOKING
// ==========================================

async function createBooking(chatId) {
  const session = sessions.get(chatId);

  if (!session || session.step !== "confirm") {
    await bot.sendMessage(
      chatId,
      "⚠️ Your booking session expired. Please start again."
    );

    return;
  }

  try {
    await databaseReady;

    const bookingId = generateBookingId();

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

    // CUSTOMER RECEIPT
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
      { parse_mode: "Markdown" }
    );

    // ADMIN NOTIFICATION WITH APPROVAL BUTTONS
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
      "Please check seat availability.",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ CONFIRM",
                callback_data: `admin_confirm_${bookingId}`
              },
              {
                text: "❌ REJECT",
                callback_data: `admin_reject_${bookingId}`
              }
            ]
          ]
        }
      }
    );

    sessions.delete(chatId);

  } catch (error) {
    console.error("❌ Booking creation error:", error.message);

    await bot.sendMessage(
      chatId,
      "❌ Sorry, we couldn't complete your booking request right now.\n\nPlease try again later."
    );
  }
}

// ==========================================
// 15. ERROR HANDLERS
// ==========================================

bot.on("polling_error", (error) => {
  console.error("Telegram polling error:", error.message);
});

bot.on("error", (error) => {
  console.error("Telegram bot error:", error.message);
});

pool.on("error", (error) => {
  console.error("PostgreSQL pool error:", error.message);
});

console.log("🚤 MSB Automatic Ticket is starting...");
