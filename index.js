
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

const bot = new TelegramBot(TOKEN, { polling: true });

// ==========================================
// 3. DATABASE
// ==========================================

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_admin_actions (
      id SERIAL PRIMARY KEY,
      admin_telegram_id BIGINT NOT NULL,
      action VARCHAR(100) NOT NULL,
      target VARCHAR(100),
      affected_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS bookings_user_id_idx
    ON bookings (telegram_user_id)
  `);

  console.log("✅ Database initialized");
}

const databaseReady = initializeDatabase().catch(error => {
  console.error("❌ Database initialization failed:", error);
  process.exit(1);
});

// ==========================================
// 4. RENDER WEB SERVER
// ==========================================

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
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
// 6. SESSIONS AND HELPERS
// ==========================================

const sessions = new Map();

function generateBookingId() {
  return `MSB-${Math.floor(100000 + Math.random() * 900000)}`;
}

function isAdmin(userId, chatId) {
  return (
    String(userId) === String(ADMIN_ID) &&
    String(chatId) === String(ADMIN_ID)
  );
}

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

    dates.push({ value: formatDate(date), label });
  }

  return dates;
}

function getDateValue(value) {
  return value instanceof Date
    ? value.toISOString().split("T")[0]
    : String(value).split("T")[0];
}

async function editScreen(chatId, messageId, text, keyboard) {
  await bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function logAdminAction(action, target, count) {
  await pool.query(
    `INSERT INTO booking_admin_actions
     (admin_telegram_id, action, target, affected_count)
     VALUES ($1, $2, $3, $4)`,
    [ADMIN_ID, action, target || null, count || 0]
  );
}

// ==========================================
// 7. MAIN MENU
// ==========================================

async function showMainMenu(chatId, messageId = null) {
  const keyboard = [
    [{ text: "🎫 Book Ticket", callback_data: "book" }],
    [{ text: "📋 Schedule", callback_data: "schedule" }],
    [{ text: "🎟️ My Tickets", callback_data: "tickets" }],
    [{ text: "ℹ️ Help", callback_data: "help" }]
  ];

  if (String(chatId) === String(ADMIN_ID)) {
    keyboard.push([
      { text: "⚙️ Admin Dashboard", callback_data: "admin_dashboard" }
    ]);
  }

  const text =
    "🚤 MSB AUTOMATIC TICKET\n\n" +
    "🇲🇻 Maldives Speedboat Booking\n\n" +
    "Choose an option below:";

  if (messageId) {
    await editScreen(chatId, messageId, text, keyboard);
  } else {
    await bot.sendMessage(chatId, text, {
      reply_markup: { inline_keyboard: keyboard }
    });
  }
}

// ==========================================
// 8. ADMIN DASHBOARD
// ==========================================

async function showAdminDashboard(chatId, messageId) {
  await databaseReady;

  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE status NOT IN ('CUSTOMER_CANCELLED', 'ADMIN_REMOVED')
      )::int AS active,
      COUNT(*) FILTER (
        WHERE status = 'CONFIRMED'
      )::int AS confirmed,
      COUNT(*) FILTER (
        WHERE status = 'PENDING_SEAT_CONFIRMATION'
      )::int AS pending,
      COUNT(DISTINCT telegram_user_id)::int AS customers
    FROM bookings
  `);

  const stats = result.rows[0];

  const text =
    "⚙️ MSB ADMIN DASHBOARD\n\n" +
    `📚 Total stored bookings: ${stats.total}\n` +
    `👥 Total customers: ${stats.customers}\n` +
    `🟢 Active bookings: ${stats.active}\n` +
    `✅ Confirmed bookings: ${stats.confirmed}\n` +
    `⏳ Pending bookings: ${stats.pending}\n\n` +
    "Select an admin option:";

  await editScreen(chatId, messageId, text, [
    [{ text: "👥 Customer Booking Overview", callback_data: "admin_customers_0" }],
    [{ text: "📋 All Active Bookings", callback_data: "admin_all_bookings" }],
    [{ text: "🗑 Remove Customer Bookings", callback_data: "admin_choose_remove" }],
    [{ text: "🚨 Remove ALL Customer Bookings", callback_data: "admin_global_confirm" }],
    [{ text: "🏠 Main Menu", callback_data: "menu" }]
  ]);
}

// ==========================================
// 9. ADMIN CUSTOMER OVERVIEW
// ==========================================

async function showAdminCustomers(chatId, messageId, page = 0) {
  await databaseReady;

  const limit = 10;
  const offset = page * limit;

  const result = await pool.query(
    `
    SELECT
      telegram_user_id::text AS user_id,
      MAX(passenger_name) AS passenger_name,
      MAX(phone) AS phone,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE status NOT IN ('CUSTOMER_CANCELLED', 'ADMIN_REMOVED')
      )::int AS active
    FROM bookings
    GROUP BY telegram_user_id
    ORDER BY MAX(created_at) DESC
    LIMIT $1 OFFSET $2
    `,
    [limit, offset]
  );

  const buttons = result.rows.map(customer => [{
    text: `👤 ${customer.passenger_name || "Customer"} — ${customer.total} bookings`,
    callback_data: `admin_customer_${customer.user_id}`
  }]);

  if (page > 0) {
    buttons.push([{
      text: "⬅️ Previous",
      callback_data: `admin_customers_${page - 1}`
    }]);
  }

  if (result.rows.length === limit) {
    buttons.push([{
      text: "Next ➡️",
      callback_data: `admin_customers_${page + 1}`
    }]);
  }

  buttons.push([{
    text: "🔙 Admin Dashboard",
    callback_data: "admin_dashboard"
  }]);

  await editScreen(
    chatId,
    messageId,
    `👥 CUSTOMER BOOKING OVERVIEW\n\nPage ${page + 1}\n\nSelect a customer to view their bookings:`,
    buttons
  );
}

// ==========================================
// 10. ADMIN CUSTOMER DETAILS
// ==========================================

async function showAdminCustomer(chatId, messageId, userId) {
  await databaseReady;

  const result = await pool.query(
    `
    SELECT
      booking_id,
      passenger_name,
      phone,
      route,
      travel_date,
      departure_time,
      operator,
      passenger_count,
      status,
      created_at
    FROM bookings
    WHERE telegram_user_id = $1
    ORDER BY created_at DESC
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    await editScreen(chatId, messageId,
      "No bookings found for this customer.",
      [[{ text: "🔙 Customers", callback_data: "admin_customers_0" }]]
    );
    return;
  }

  const customer = result.rows[0];

  const active = result.rows.filter(
    row => !["CUSTOMER_CANCELLED", "ADMIN_REMOVED"].includes(row.status)
  ).length;

  let text =
    "👤 CUSTOMER DETAILS\n\n" +
    `🆔 Telegram ID: ${userId}\n` +
    `👤 Name: ${customer.passenger_name}\n` +
    `📱 Phone: ${customer.phone}\n` +
    `📚 Total bookings: ${result.rows.length}\n` +
    `🟢 Active bookings: ${active}\n\n` +
    "📋 BOOKING HISTORY\n\n";

  const buttons = [];

  result.rows.slice(0, 8).forEach(booking => {
    const date = getDateValue(booking.travel_date);

    text +=
      `🎫 ${booking.booking_id}\n` +
      `📅 ${displayDate(date)}\n` +
      `📍 ${booking.route}\n` +
      `🕐 ${booking.departure_time}\n` +
      `📌 ${booking.status}\n\n`;

    if (!["CUSTOMER_CANCELLED", "ADMIN_REMOVED"].includes(booking.status)) {
      buttons.push([{
        text: `🗑 Remove ${booking.booking_id}`,
        callback_data: `admin_remove_${booking.booking_id}`
      }]);
    }
  });

  buttons.push([{
    text: "🗑 Remove ALL This Customer's Bookings",
    callback_data: `admin_remove_customer_${userId}`
  }]);

  buttons.push([{
    text: "🔙 Customer Overview",
    callback_data: "admin_customers_0"
  }]);

  await editScreen(chatId, messageId, text, buttons);
}

// ==========================================
// 11. ADMIN ALL ACTIVE BOOKINGS
// ==========================================

async function showAdminAllBookings(chatId, messageId) {
  await databaseReady;

  const result = await pool.query(`
    SELECT booking_id, telegram_user_id, passenger_name,
           route, travel_date, departure_time, status
    FROM bookings
    WHERE status NOT IN ('CUSTOMER_CANCELLED', 'ADMIN_REMOVED')
    ORDER BY created_at DESC
    LIMIT 20
  `);

  if (!result.rows.length) {
    await editScreen(chatId, messageId,
      "📋 No active bookings found.",
      [[{ text: "🔙 Admin Dashboard", callback_data: "admin_dashboard" }]]
    );
    return;
  }

  let text = "📋 ACTIVE BOOKINGS\n\n";
  const buttons = [];

  result.rows.forEach(booking => {
    text +=
      `🎫 ${booking.booking_id}\n` +
      `👤 ${booking.passenger_name}\n` +
      `🆔 ${booking.telegram_user_id}\n` +
      `📅 ${displayDate(getDateValue(booking.travel_date))}\n` +
      `📍 ${booking.route}\n` +
      `📌 ${booking.status}\n\n`;

    buttons.push([{
      text: `🗑 Remove ${booking.booking_id}`,
      callback_data: `admin_remove_${booking.booking_id}`
    }]);
  });

  buttons.push([{
    text: "🔙 Admin Dashboard",
    callback_data: "admin_dashboard"
  }]);

  await editScreen(chatId, messageId, text, buttons);
}

// ==========================================
// 12. ADMIN REMOVE CUSTOMER BOOKINGS MENU
// ==========================================

async function showRemoveCustomerMenu(chatId, messageId) {
  await databaseReady;

  const result = await pool.query(`
    SELECT telegram_user_id::text AS user_id,
           MAX(passenger_name) AS passenger_name,
           COUNT(*) FILTER (
             WHERE status NOT IN ('CUSTOMER_CANCELLED', 'ADMIN_REMOVED')
           )::int AS active
    FROM bookings
    GROUP BY telegram_user_id
    HAVING COUNT(*) FILTER (
      WHERE status NOT IN ('CUSTOMER_CANCELLED', 'ADMIN_REMOVED')
    ) > 0
    ORDER BY MAX(created_at) DESC
    LIMIT 20
  `);

  const buttons = result.rows.map(customer => [{
    text: `🗑 ${customer.passenger_name} (${customer.active})`,
    callback_data: `admin_remove_customer_${customer.user_id}`
  }]);

  buttons.push([{
    text: "🔙 Admin Dashboard",
    callback_data: "admin_dashboard"
  }]);

  await editScreen(
    chatId,
    messageId,
    "🗑 REMOVE CUSTOMER BOOKINGS\n\nSelect a customer to remove all their active bookings:",
    buttons
  );
}

// ==========================================
// 13. ADMIN BULK REMOVAL
// ==========================================

async function removeCustomerBookings(chatId, messageId, userId) {
  await databaseReady;

  const result = await pool.query(
    `
    UPDATE bookings
    SET status = 'ADMIN_REMOVED'
    WHERE telegram_user_id = $1
    AND status NOT IN ('CUSTOMER_CANCELLED', 'ADMIN_REMOVED')
    RETURNING booking_id
    `,
    [userId]
  );

  await logAdminAction("REMOVE_CUSTOMER_BOOKINGS", userId, result.rowCount);

  try {
    await bot.sendMessage(
      userId,
      "⚠️ BOOKING UPDATE\n\n" +
      "Your active MSB booking(s) have been removed by the booking administrator.\n\n" +
      "Please contact the booking team if you need assistance."
    );
  } catch (error) {
    console.log("Customer notification failed:", error.message);
  }

  await editScreen(
    chatId,
    messageId,
    `✅ CUSTOMER BOOKINGS REMOVED\n\nCustomer ID: ${userId}\nBookings removed: ${result.rowCount}\n\nBooking records have been retained for history.`,
    [[{ text: "🔙 Admin Dashboard", callback_data: "admin_dashboard" }]]
  );
}

async function showGlobalRemovalConfirmation(chatId, messageId) {
  await editScreen(
    chatId,
    messageId,
    "🚨 WARNING — GLOBAL BOOKING REMOVAL\n\n" +
    "You are about to remove ALL active bookings belonging to ALL customers.\n\n" +
    "This action will:\n" +
    "• Mark active bookings as ADMIN_REMOVED.\n" +
    "• Keep the booking records in the database.\n" +
    "• Preserve already cancelled or removed records.\n\n" +
    "Are you absolutely sure?",
    [
      [{ text: "🚨 YES, REMOVE ALL ACTIVE BOOKINGS", callback_data: "admin_global_execute" }],
      [{ text: "❌ No, Go Back", callback_data: "admin_dashboard" }]
    ]
  );
}

async function removeAllBookings(chatId, messageId) {
  await databaseReady;

  const result = await pool.query(`
    UPDATE bookings
    SET status = 'ADMIN_REMOVED'
    WHERE status NOT IN ('CUSTOMER_CANCELLED', 'ADMIN_REMOVED')
    RETURNING booking_id, telegram_user_id
  `);

  await logAdminAction("REMOVE_ALL_ACTIVE_BOOKINGS", "ALL_CUSTOMERS", result.rowCount);

  const customerIds = [
    ...new Set(result.rows.map(row => String(row.telegram_user_id)))
  ];

  for (const userId of customerIds) {
    try {
      await bot.sendMessage(
        userId,
        "⚠️ BOOKING UPDATE\n\n" +
        "Your active MSB booking(s) have been removed by the booking administrator.\n\n" +
        "Please contact the booking team if you need assistance."
      );
    } catch (error) {
      console.log(`Notification failed for ${userId}:`, error.message);
    }
  }

  await editScreen(
    chatId,
    messageId,
    `✅ GLOBAL REMOVAL COMPLETED\n\nBookings removed: ${result.rowCount}\nCustomers notified: ${customerIds.length}\n\nAll booking records have been retained for history.`,
    [[{ text: "🔙 Admin Dashboard", callback_data: "admin_dashboard" }]]
  );
}

// ==========================================
// 14. CUSTOMER CANCELLATION
// ==========================================

async function showCustomerCancellation(chatId, messageId, bookingId) {
  await databaseReady;

  const result = await pool.query(
    `
    SELECT booking_id, status
    FROM bookings
    WHERE booking_id = $1
    AND telegram_user_id = $2
    `,
    [bookingId, chatId]
  );

  if (!result.rows.length) {
    await bot.answerCallbackQuery("", {
      text: "Booking not found."
    }).catch(() => {});
    return;
  }

  const booking = result.rows[0];

  if (!["PENDING_SEAT_CONFIRMATION", "CONFIRMED"].includes(booking.status)) {
    await editScreen(
      chatId,
      messageId,
      "⚠️ This booking cannot be cancelled.\n\nCurrent status: " + booking.status,
      [[{ text: "🔙 My Tickets", callback_data: "tickets" }]]
    );
    return;
  }

  await editScreen(
    chatId,
    messageId,
    `⚠️ CANCEL BOOKING?\n\nBooking ID: ${bookingId}\n\nAre you sure you want to cancel this booking?`,
    [
      [{ text: "❌ YES, CANCEL BOOKING", callback_data: `customer_cancel_${bookingId}` }],
      [{ text: "🔙 Keep Booking", callback_data: "tickets" }]
    ]
  );
}

async function cancelCustomerBooking(chatId, messageId, bookingId) {
  await databaseReady;

  const result = await pool.query(
    `
    UPDATE bookings
    SET status = 'CUSTOMER_CANCELLED'
    WHERE booking_id = $1
    AND telegram_user_id = $2
    AND status IN ('PENDING_SEAT_CONFIRMATION', 'CONFIRMED')
    RETURNING booking_id, telegram_user_id
    `,
    [bookingId, chatId]
  );

  if (!result.rows.length) {
    await editScreen(
      chatId,
      messageId,
      "⚠️ Booking could not be cancelled. It may already have been processed.",
      [[{ text: "🔙 My Tickets", callback_data: "tickets" }]]
    );
    return;
  }

  try {
    await bot.sendMessage(
      ADMIN_ID,
      "❌ CUSTOMER BOOKING CANCELLED\n\n" +
      `🎫 Booking ID: ${bookingId}\n` +
      `🆔 Customer ID: ${chatId}\n\n` +
      "The customer cancelled this booking."
    );
  } catch (error) {
    console.log("Admin notification failed:", error.message);
  }

  await editScreen(
    chatId,
    messageId,
    `✅ BOOKING CANCELLED\n\nBooking ID: ${bookingId}\n\nYour booking has been cancelled successfully.`,
    [
      [{ text: "🎟️ My Tickets", callback_data: "tickets" }],
      [{ text: "🏠 Main Menu", callback_data: "menu" }]
    ]
  );
}

// ==========================================
// 15. ADMIN INDIVIDUAL REMOVAL
// ==========================================

async function adminRemoveSingleBooking(chatId, messageId, bookingId) {
  await databaseReady;

  const result = await pool.query(
    `
    UPDATE bookings
    SET status = 'ADMIN_REMOVED'
    WHERE booking_id = $1
    AND status NOT IN ('CUSTOMER_CANCELLED', 'ADMIN_REMOVED')
    RETURNING telegram_user_id
    `,
    [bookingId]
  );

  if (!result.rows.length) {
    await editScreen(
      chatId,
      messageId,
      "⚠️ Booking not found or already removed.",
      [[{ text: "🔙 Admin Dashboard", callback_data: "admin_dashboard" }]]
    );
    return;
  }

  const customerId = result.rows[0].telegram_user_id;

  await logAdminAction("REMOVE_SINGLE_BOOKING", bookingId, 1);

  try {
    await bot.sendMessage(
      customerId,
      `⚠️ BOOKING UPDATE\n\nYour booking ${bookingId} has been removed by the booking administrator.`
    );
  } catch (error) {
    console.log("Customer notification failed:", error.message);
  }

  await editScreen(
    chatId,
    messageId,
    `✅ BOOKING REMOVED\n\nBooking ID: ${bookingId}\n\nThe booking record has been retained for history.`,
    [[{ text: "🔙 Admin Dashboard", callback_data: "admin_dashboard" }]]
  );
}

// ==========================================
// 16. ADMIN APPROVAL SYSTEM
// ==========================================

async function handleAdminDecision(query, approved) {
  const adminChatId = query.message.chat.id;

  if (!isAdmin(query.from.id, adminChatId)) {
    await bot.answerCallbackQuery(query.id, {
      text: "⛔ You are not authorized!",
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

    if (!result.rows.length) {
      await bot.answerCallbackQuery(query.id, {
        text: "⚠️ Already processed or booking not found!",
        show_alert: true
      });
      return;
    }

    const booking = result.rows[0];

    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      {
        chat_id: adminChatId,
        message_id: query.message.message_id
      }
    );

    await bot.answerCallbackQuery(query.id, {
      text: approved ? "✅ Booking confirmed!" : "❌ Booking rejected!"
    });

    const message = approved
      ? `✅ BOOKING CONFIRMED!\n\n🎫 Booking ID: ${bookingId}\n\nYour seats have been confirmed.\n\nThank you for choosing MSB! 🚤`
      : `❌ BOOKING REJECTED\n\n🎫 Booking ID: ${bookingId}\n\nUnfortunately, your booking could not be confirmed.\n\nPlease contact our booking team for assistance.`;

    try {
      await bot.sendMessage(booking.telegram_user_id, message);
    } catch (error) {
      console.error("Customer notification error:", error.message);
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
    }).catch(() => {});
  }
}

// ==========================================
// 17. CALLBACK HANDLER
// ==========================================

bot.on("callback_query", async query => {
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const data = query.data || "";

  if (!chatId || !messageId) {
    await bot.answerCallbackQuery(query.id).catch(() => {});
    return;
  }

  try {
    // ADMIN APPROVALS
    if (data.startsWith("admin_confirm_")) {
      await handleAdminDecision(query, true);
      return;
    }

    if (data.startsWith("admin_reject_")) {
      await handleAdminDecision(query, false);
      return;
    }

    // PROTECT ALL OTHER ADMIN ACTIONS
    if (data.startsWith("admin_")) {
      if (!isAdmin(query.from.id, chatId)) {
        await bot.answerCallbackQuery(query.id, {
          text: "⛔ Admin access only!",
          show_alert: true
        });
        return;
      }

      await bot.answerCallbackQuery(query.id);

      if (data === "admin_dashboard") {
        await showAdminDashboard(chatId, messageId);
        return;
      }

      if (data.startsWith("admin_customers_")) {
        const page = Number(data.split("_").pop()) || 0;
        await showAdminCustomers(chatId, messageId, page);
        return;
      }

      if (data.startsWith("admin_customer_")) {
        const userId = data.replace("admin_customer_", "");
        await showAdminCustomer(chatId, messageId, userId);
        return;
      }

      if (data === "admin_all_bookings") {
        await showAdminAllBookings(chatId, messageId);
        return;
      }

      if (data === "admin_choose_remove") {
        await showRemoveCustomerMenu(chatId, messageId);
        return;
      }

      if (data === "admin_global_confirm") {
        await showGlobalRemovalConfirmation(chatId, messageId);
        return;
      }

      if (data === "admin_global_execute") {
        await removeAllBookings(chatId, messageId);
        return;
      }

      if (data.startsWith("admin_remove_customer_")) {
        const userId = data.replace("admin_remove_customer_", "");
        await removeCustomerBookings(chatId, messageId, userId);
        return;
      }

      if (data.startsWith("admin_remove_")) {
        const bookingId = data.replace("admin_remove_", "");
        await adminRemoveSingleBooking(chatId, messageId, bookingId);
        return;
      }

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

      await editScreen(chatId, messageId,
        "🎫 BOOK A SPEEDBOAT TICKET\n\nSelect your route:",
        [
          [{ text: "🅰️ Maafushi → Malé", callback_data: "book_route_A" }],
          [{ text: "🅱️ Malé → Maafushi", callback_data: "book_route_B" }],
          [{ text: "🔙 Main Menu", callback_data: "menu" }]
        ]
      );
      return;
    }

    // ROUTE SELECTION
    if (data === "book_route_A" || data === "book_route_B") {
      const routeA = data === "book_route_A";
      const session = sessions.get(chatId) || {};

      session.route = routeA ? "Maafushi → Malé" : "Malé → Maafushi";
      session.routeCode = routeA ? "A" : "B";
      session.step = "date";

      sessions.set(chatId, session);

      const buttons = generateDates().map(date => [{
        text: date.label,
        callback_data: `book_date_${date.value}`
      }]);

      buttons.push([{ text: "🔙 Back", callback_data: "book" }]);

      await editScreen(
        chatId,
        messageId,
        `${routeA ? "🅰️ MAAFUSHI → MALÉ" : "🅱️ MALÉ → MAAFUSHI"}\n\n📅 Select your travel date:`,
        buttons
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
        callback_data: session.routeCode === "A" ? "book_route_A" : "book_route_B"
      }]);

      await editScreen(
        chatId,
        messageId,
        `📅 ${displayDate(selectedDate)}\n\n🕐 Select your departure:`,
        buttons
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

      await bot.sendMessage(chatId, "👤 Please enter the main passenger's full name:");
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

    // CANCEL BOOKING SESSION
    if (data === "cancel_booking") {
      sessions.delete(chatId);

      await editScreen(
        chatId,
        messageId,
        "❌ Booking cancelled.\n\nYou can start again whenever you're ready.",
        [
          [{ text: "🎫 Book Ticket", callback_data: "book" }],
          [{ text: "🏠 Main Menu", callback_data: "menu" }]
        ]
      );
      return;
    }

    // CUSTOMER CANCELLATION
    if (data.startsWith("cancel_request_")) {
      const bookingId = data.replace("cancel_request_", "");
      await showCustomerCancellation(chatId, messageId, bookingId);
      return;
    }

    if (data.startsWith("customer_cancel_")) {
      const bookingId = data.replace("customer_cancel_", "");
      await cancelCustomerBooking(chatId, messageId, bookingId);
      return;
    }

    // SCHEDULE MENU
    if (data === "schedule") {
      await editScreen(chatId, messageId,
        "📋 SPEEDBOAT SCHEDULE\n\nPlease select your route:",
        [
          [{ text: "🅰️ Maafushi → Malé", callback_data: "route_maafushi_male" }],
          [{ text: "🅱️ Malé → Maafushi", callback_data: "route_male_maafushi" }],
          [{ text: "⭐ Special Ferries", callback_data: "special" }],
          [{ text: "🔙 Main Menu", callback_data: "menu" }]
        ]
      );
      return;
    }

    // SCHEDULE DISPLAY
    if (data === "route_maafushi_male" || data === "route_male_maafushi") {
      const routeA = data === "route_maafushi_male";
      const schedule = routeA ? schedules.maafushiMale : schedules.maleMaafushi;
      const title = routeA ? "🅰️ MAAFUSHI → MALÉ" : "🅱️ MALÉ → MAAFUSHI";

      let text = `${title}\n\n📋 Daily Schedule\n\n`;

      schedule.forEach((trip, index) => {
        text += `${index + 1}. 🕐 ${trip[0]} — 🚤 ${trip[1]}\n`;
      });

      const buttons = schedule.map((trip, index) => [{
        text: `🕐 ${trip[0]} — ${trip[1]}`,
        callback_data: `trip_${routeA ? "A" : "B"}_${index}`
      }]);

      buttons.push([{ text: "🔙 Back", callback_data: "schedule" }]);

      await editScreen(chatId, messageId, text, buttons);
      return;
    }

    // SPECIAL FERRIES
    if (data === "special") {
      await editScreen(
        chatId,
        messageId,
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
        [[{ text: "🔙 Back", callback_data: "schedule" }]]
      );
      return;
    }

    // TRIP DETAILS
    if (data.startsWith("trip_A_") || data.startsWith("trip_B_")) {
      const parts = data.split("_");
      const routeA = parts[1] === "A";
      const index = Number(parts[2]);
      const schedule = routeA ? schedules.maafushiMale : schedules.maleMaafushi;
      const trip = schedule[index];

      if (!trip) return;

      await editScreen(
        chatId,
        messageId,
        "🎫 SELECTED TRIP\n\n" +
        `📍 Route: ${routeA ? "Maafushi → Malé" : "Malé → Maafushi"}\n` +
        `🕐 Departure: ${trip[0]}\n` +
        `🚤 Operator: ${trip[1]}\n\n` +
        "Please use 🎫 Book Ticket to make a booking.",
        [
          [{ text: "🎫 Book This Trip", callback_data: "book" }],
          [{
            text: "🔙 Back",
            callback_data: routeA ? "route_maafushi_male" : "route_male_maafushi"
          }]
        ]
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
        AND status <> 'ADMIN_REMOVED'
        ORDER BY created_at DESC
        LIMIT 20
        `,
        [chatId]
      );

      if (!result.rows.length) {
        await editScreen(
          chatId,
          messageId,
          "🎟️ MY TICKETS\n\nYou don't have any bookings yet.",
          [
            [{ text: "🎫 Book Ticket", callback_data: "book" }],
            [{ text: "🏠 Main Menu", callback_data: "menu" }]
          ]
        );
        return;
      }

      let text = "🎟️ YOUR BOOKINGS\n\n";
      const buttons = [];

      result.rows.forEach(booking => {
        text +=
          `🎫 ${booking.booking_id}\n` +
          `📍 ${booking.route}\n` +
          `📅 ${displayDate(getDateValue(booking.travel_date))}\n` +
          `🕐 ${booking.departure_time}\n` +
          `🚤 ${booking.operator}\n` +
          `👥 ${booking.passenger_count}\n` +
          `📌 ${booking.status}\n\n`;

        if (["PENDING_SEAT_CONFIRMATION", "CONFIRMED"].includes(booking.status)) {
          buttons.push([{
            text: `❌ Cancel ${booking.booking_id}`,
            callback_data: `cancel_request_${booking.booking_id}`
          }]);
        }
      });

      buttons.push([{ text: "🎫 New Booking", callback_data: "book" }]);
      buttons.push([{ text: "🏠 Main Menu", callback_data: "menu" }]);

      await editScreen(chatId, messageId, text, buttons);
      return;
    }

    // HELP
    if (data === "help") {
      await editScreen(
        chatId,
        messageId,
        "ℹ️ MSB AUTOMATIC TICKET\n\n" +
        "🚤 Maldives speedboat booking\n\n" +
        "📋 View schedules\n" +
        "🎫 Request a ticket\n" +
        "🏦 Pay by BML transfer\n" +
        "🎟️ Receive your confirmed ticket\n\n" +
        "Seat availability is confirmed before payment.",
        [[{ text: "🏠 Main Menu", callback_data: "menu" }]]
      );
      return;
    }

  } catch (error) {
    console.error("Callback error:", error);

    await bot.answerCallbackQuery(query.id, {
      text: "⚠️ Something went wrong. Please try again.",
      show_alert: true
    }).catch(() => {});
  }
});

// ==========================================
// 18. CUSTOMER TEXT MESSAGE HANDLER
// ==========================================

bot.on("message", async msg => {
  try {
    if (!msg.text || msg.text.startsWith("/")) return;

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
        "📱 Please enter the main passenger's phone number.\n\n" +
        "International numbers are accepted.\n\n" +
        "Example: +960 7XXXXXX"
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
        const row = [{
          text: `👥 ${i}`,
          callback_data: `passengers_${i}`
        }];

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
    console.error("Message handler error:", error);
  }
});

// ==========================================
// 19. BOOKING CONFIRMATION
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
// 20. CREATE BOOKING
// ==========================================

async function createBooking(chatId) {
  const session = sessions.get(chatId);

  if (!session || session.step !== "confirm") {
    await bot.sendMessage(chatId, "⚠️ Your booking session expired. Please start again.");
    return;
  }

  try {
    await databaseReady;

    const bookingId = generateBookingId();

    await pool.query(
      `
      INSERT INTO bookings (
        booking_id, telegram_user_id, route, travel_date,
        departure_time, operator, passenger_name, phone,
        passenger_count, status
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
      "✅ BOOKING REQUEST RECEIVED\n\n" +
      `🎫 Booking ID: ${bookingId}\n\n` +
      `📍 ${session.route}\n` +
      `📅 ${displayDate(session.travelDate)}\n` +
      `🕐 ${session.departureTime}\n` +
      `🚤 ${session.operator}\n` +
      `👥 ${session.passengerCount} passenger(s)\n\n` +
      "⏳ Status: Waiting for seat confirmation\n\n" +
      "Please wait while our booking team confirms the seats."
    );

    await bot.sendMessage(
      ADMIN_ID,
      "🚨 NEW BOOKING REQUEST\n\n" +
      `🎫 Booking ID: ${bookingId}\n` +
      `🆔 Customer ID: ${chatId}\n` +
      `📍 Route: ${session.route}\n` +
      `📅 Date: ${displayDate(session.travelDate)}\n` +
      `🕐 Departure: ${session.departureTime}\n` +
      `🚤 Operator: ${session.operator}\n` +
      `👤 Passenger: ${session.passengerName}\n` +
      `📱 Phone: ${session.phone}\n` +
      `👥 Passengers: ${session.passengerCount}\n\n` +
      "⏳ ACTION REQUIRED\nPlease check seat availability.",
      {
        reply_markup: {
          inline_keyboard: [[
            {
              text: "✅ CONFIRM",
              callback_data: `admin_confirm_${bookingId}`
            },
            {
              text: "❌ REJECT",
              callback_data: `admin_reject_${bookingId}`
            }
          ]]
        }
      }
    );

    sessions.delete(chatId);

  } catch (error) {
    console.error("❌ Booking creation error:", error);

    await bot.sendMessage(
      chatId,
      "❌ Sorry, we couldn't complete your booking request right now.\n\nPlease try again later."
    );
  }
}

// ==========================================
// 21. ADMIN COMMAND
// ==========================================

bot.onText(/^\/admin$/, async msg => {
  if (!isAdmin(msg.from.id, msg.chat.id)) {
    await bot.sendMessage(msg.chat.id, "⛔ Admin access only.");
    return;
  }

  try {
    await databaseReady;

    const keyboard = [
      [{ text: "⚙️ Open Admin Dashboard", callback_data: "admin_dashboard" }]
    ];

    await bot.sendMessage(
      msg.chat.id,
      "⚙️ MSB ADMIN PANEL\n\nWelcome, administrator.",
      { reply_markup: { inline_keyboard: keyboard } }
    );
  } catch (error) {
    console.error("Admin command error:", error);
    await bot.sendMessage(msg.chat.id, "❌ Unable to open admin panel.");
  }
});

// ==========================================
// 22. START COMMAND
// ==========================================

bot.onText(/^\/start$/, async msg => {
  try {
    sessions.delete(msg.chat.id);
    await showMainMenu(msg.chat.id);
  } catch (error) {
    console.error("Start error:", error);
  }
});

// ==========================================
// 23. ERROR HANDLERS
// ==========================================

bot.on("polling_error", error => {
  console.error("Telegram polling error:", error.message);
});

bot.on("error", error => {
  console.error("Telegram bot error:", error.message);
});

pool.on("error", error => {
  console.error("PostgreSQL pool error:", error.message);
});

console.log("🚤 MSB Automatic Ticket is starting...");
