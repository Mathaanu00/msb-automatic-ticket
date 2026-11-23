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

// Simple web server for Render
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });

  res.end("🚤 MSB Automatic Ticket is running!");
}).listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
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
  console.error(
    "Telegram polling error:",
    error.message
  );
});
