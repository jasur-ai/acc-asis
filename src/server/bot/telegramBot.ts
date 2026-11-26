import { Bot, InlineKeyboard } from 'grammy';

export interface BotConfig {
  token: string;
  miniAppUrl: string;
}

/**
 * Creates the acc.asis (ACAS) Telegram Bot instance.
 *
 * Designed for crystal-clear, concise onboarding (zero clutter) with direct Mini App launch.
 */
export function createAcasBot(config: BotConfig): Bot {
  const bot = new Bot(config.token);

  const launchKeyboard = new InlineKeyboard()
    .webApp('🚀 acc.asis Mini Appni Ochish', config.miniAppUrl)
    .row()
    .text('⚡ Faol Bo‘limlar (5 ta)', 'show_modules')
    .text('🔐 2FA Xavfsizlik Qoidasi', 'show_security');

  bot.command('start', async (ctx) => {
    const firstName = ctx.from?.first_name || 'Foydalanuvchi';

    const welcomeText = [
      `◆ *acc.asis (ACAS)* — Shaxsiy Telegram Insight Yordamchingiz`,
      ``,
      `Salom, *${firstName}*! Yuzlab kanal va guruhlarni bittalab o‘qib vaqt yo‘qotmang. *acc.asis* hisobingizdagi barcha kanallarni tahlil qilib, faqat eng muhim e’lonlarni *londa insight* ko‘rinishida ajratib beradi:`,
      ``,
      `1️⃣ *Tadbirlar va Musobaqalar* — Sana, joy, tashkilotchi, Zakovat va Debate turnirlari (1 kundan 3–4 oygacha filtr bilan)`,
      `2️⃣ *Anjuman va Ilmiy Maqolalar* — Jurnal nomi, Maqola/Tezis/Avtoreferat, Tekin/Pulli, Mintaqa/Xalqaro va *oylik anjumanlar ro‘yxati* tahlili`,
      `3️⃣ *Volontyorlik* — Talablar, davomiylik kunlari, kvota va ro‘yxatdan o‘tish linki`,
      `4️⃣ *O‘qish va Stipendiyalar* — Xalqaro exchange, grant va stipendiyalar`,
      `5️⃣ *Tanlovlar* — Universitet va respublika bosqichlari, pul mukofotlari va kerakli hujjatlar`,
      ``,
      `🛡 *Xavfsizlik:* Hisobni ulash uchun Telegramingizda *2-bosqichli tekshiruv (2FA parol)* yoqilgan bo‘lishi shart. Keraksiz bo‘limlarni o‘chirib qo‘yib, tizimni yanada tezlashtirishingiz mumkin.`,
    ].join('\n');

    await ctx.reply(welcomeText, {
      parse_mode: 'Markdown',
      reply_markup: launchKeyboard,
    });
  });

  bot.callbackQuery('show_modules', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      [
        `⚡ *Modulli Arxitektura (Tezlik va Qulaylik)*`,
        ``,
        `Mini App ichiga kirganda o‘zingizga kerak bo‘lmagan bo‘limlarni *o‘chirib qo‘yishingiz (OFF)* mumkin.`,
        `Masalan, faqat *Ilmiy Maqolalar* va *Stipendiyalar* yoqilsa, skanerlash tezligi *+60% gacha* oshadi va ortiqcha ma’lumot chiqmaydi.`,
      ].join('\n'),
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard().webApp('⚙️ Bo‘limlarni Sozlash (Mini App)', config.miniAppUrl),
      }
    );
  });

  bot.callbackQuery('show_security', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      [
        `🔐 *Majburiy 2FA Xavfsizlik Standarti*`,
        ``,
        `• *acc.asis* rasmiy Telegram MTProto protokoli orqali ishlaydi.`,
        `• Agar Telegram hisobingizda *2FA (Ikki bosqichli parol)* yoqilmagan bo‘lsa, tizim xavfsizlik sababli ulanishni rad etadi.`,
        `• Har bir kartochka ustiga bosganda to‘g‘ridan-to‘g‘ri original Telegram post manbasiga yo‘naltiradi.`,
      ].join('\n'),
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard().webApp('🔐 2FA Bilan Hisobni Ulash', config.miniAppUrl),
      }
    );
  });

  return bot;
}
