const TelegramBot = require("node-telegram-bot-api");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN is missing.");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, {
  polling: true
});

console.log("🚤 MSB Automatic Ticket is starting...");

bot.onText(/^\/start$/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    "🚤 WELCOME TO MSB AUTOMATIC TICKET!\n\n" +
    "🎫 Speedboat Ticket Booking\n" +
    "📋 View Schedule\n" +
    "🎟️ My Tickets\n\n" +
    "Please choose an option below."
  );
});

bot.on("polling_error", (error) => {
  console.error("Telegram polling error:", error.message);
});
